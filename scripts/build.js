/**
 * Build the Chrome-loadable extension into dist/.
 *
 * Bundles the readable sources in src/ (entry: src/mindful/index.js)
 * with esbuild — minify:false, sourcemap, es2017 target — and copies every
 * static asset the manifest/pages reference. `dist/` is the folder to load via
 * chrome://extensions -> Load unpacked.
 *
 * The 2016 original was a webpack-1 bundle; this rebuild adds:
 *  - aliases mapping bare package imports to the extracted vendor copies
 *  - an injected shim providing the `process` global webpack 1 auto-shimmed
 *    (NODE_ENV stays undefined, matching the legacy bundle's live dev warnings)
 *  - __DEBUG__:'false' replicating webpack's DefinePlugin
 *  - an onLoad plugin turning the extracted css-loader output modules (*.scss)
 *    into plain JS that injects the identical CSS at runtime (style-loader role)
 *
 * Usage: node scripts/build.js [--watch]
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const shimDir = path.join(srcDir, 'vendor', 'shims');
const dist = path.join(root, 'dist');

// Static folders/files copied 1:1 into dist/ — index.html and manifest.json
// reference them with the same relative paths in dev and dist.
const COPY_DIRS = ['styles', 'assets', 'runtime'];
const COPY_FILES = ['manifest.json', 'index.html'];

// ---------- css-loader output handling ----------

function parseJsString(literal) {
    try {
        return JSON.parse(literal);
    } catch (e) {
        // JS-only escapes like \' (css-loader normally emits JSON-safe strings)
        return literal.slice(1, -1).replace(/\\(['"\\])/g, '$1');
    }
}

/** Skip a double-quoted JS string literal starting at i; returns index after it. */
function skipString(s, i) {
    i++; // opening quote
    while (i < s.length) {
        if (s[i] === '\\') i++;
        else if (s[i] === '"') return i + 1;
        i++;
    }
    throw new Error('unterminated string literal');
}

/** Split s on top-level commas, ignoring commas inside strings/brackets. */
function splitTopLevel(s) {
    const parts = [];
    let depth = 0, cur = '', k = 0;
    while (k < s.length) {
        const c = s[k];
        if (c === '"') {
            const end = skipString(s, k);
            cur += s.slice(k, end);
            k = end;
            continue;
        }
        if (c === '[' || c === '(') depth++;
        else if (c === ']' || c === ')') depth--;
        else if (c === ',' && depth === 0) {
            parts.push(cur);
            cur = '';
            k++;
            continue;
        }
        cur += c;
        k++;
    }
    parts.push(cur);
    return parts;
}

/** Parse `exports.push([module.id, <expr>, <media?>])` calls of a css-loader module. */
function parsePushCalls(contents, file) {
    const calls = [];
    const startRe = /exports\.push\(\[module\.id,\s*/g;
    let m;
    while ((m = startRe.exec(contents))) {
        const start = m.index + m[0].length;
        // find the closing ']' of the argument array, skipping string literals
        let depth = 1, j = start;
        while (j < contents.length && depth > 0) {
            const c = contents[j];
            if (c === '"') j = skipString(contents, j);
            else {
                if (c === '[') depth++;
                else if (c === ']') depth--;
                j++;
            }
        }
        if (depth !== 0) throw new Error(`unbalanced push call in ${file}`);
        // startRe already consumed "exports.push([module.id, ", so the split
        // parts are [<value expr>, <media?>] — not [module.id, expr, media].
        const parts = splitTopLevel(contents.slice(start, j - 1));
        calls.push({
            expr: parts[0].trim(),
            media: parts[1] ? parseJsString(parts[1].trim()) : '',
        });
        startRe.lastIndex = j;
    }
    return calls;
}

/** Evaluate a css-loader value expression: string literals + require("asset") calls. */
function evaluateConcat(expr, resolveRequire, file) {
    let i = 0, out = '';
    while (i < expr.length) {
        const c = expr[i];
        if (c === '"') {
            const end = skipString(expr, i);
            out += parseJsString(expr.slice(i, end));
            i = end;
            continue;
        }
        if (expr.startsWith('require(', i)) {
            const close = expr.indexOf(')', i);
            const reqPath = parseJsString(expr.slice(i + 'require('.length, close).trim());
            out += resolveRequire(reqPath, file);
            i = close + 1;
            continue;
        }
        if (c === '+' || /\s/.test(c)) {
            i++;
            continue;
        }
        throw new Error(`unsupported token ${JSON.stringify(c)} in css expression of ${file}: ${expr.slice(Math.max(0, i - 20), i + 20)}`);
    }
    return out;
}

/** Resolve an asset require() in css text against the extracted loader stub modules. */
function resolveAssetRequire(reqPath, fromFile) {
    const base = reqPath.split('?')[0];
    const abs = path.resolve(path.dirname(fromFile), base);
    const src = fs.readFileSync(abs, 'utf8');
    // file-loader stub: module.exports = __webpack_public_path__ + "hash.ext";
    let m = src.match(/__webpack_public_path__\s*\+\s*"([^"]+)"/);
    if (m) return m[1];
    // url-loader stub: module.exports = "data:...";
    m = src.match(/^module\.exports\s*=\s*"([^"]*)"/);
    if (m) return m[1];
    throw new Error(`unrecognized asset module: ${abs} (required from ${fromFile})`);
}

/** Turn an extracted css-loader output module into plain JS that injects the CSS. */
function scssToJsModule(file) {
    const scssContents = fs.readFileSync(file, 'utf8');
    const pushes = parsePushCalls(scssContents, file);
    const chunks = pushes.map(p => {
        const css = evaluateConcat(p.expr, resolveAssetRequire, file);
        return p.media ? `@media ${p.media}{${css}}` : css;
    });
    if (!chunks.length) throw new Error(`no css exports found in ${file}`);
    const cssText = chunks.join('\n');
    const shimRel = path.relative(path.dirname(file), path.join(shimDir, 'inject-style.js'))
        .split(path.sep).join('/');
    const id = path.relative(srcDir, file).split(path.sep).join('/');
    return {
        contents:
            `// Generated by scripts/build.js from ${id} — the css-loader output of the\n` +
            `// 2016 webpack build. style-loader's runtime role is replaced by inject-style.js.\n` +
            `import injectStyle from '${shimRel}';\n` +
            `const css = ${JSON.stringify(cssText)};\n` +
            `injectStyle(${JSON.stringify(id)}, css);\n` +
            `export default css;\n`,
    };
}

const scssPlugin = {
    name: 'css-loader-output',
    setup(build) {
        build.onLoad({ filter: /\.scss$/ }, args => scssToJsModule(args.path));
    },
};

const copyStaticPlugin = {
    name: 'copy-static-assets',
    setup(build) {
        build.onStart(() => copyStatic());
    },
};

// ---------- aliases: bare package imports -> extracted vendor copies ----------

const alias = {};
for (const [pkg, target] of Object.entries({
    'lodash': 'vendor/lodash',
    'debug': 'vendor/debug/browser.js',
    'ms': 'vendor/ms/index.js',
    'process': 'vendor/process/browser.js',
    'eventemitter3': 'vendor/eventemitter3/index.js',
    'find-within': 'vendor/find-within/index.js',
    'node-contains': 'vendor/node-contains/index.js',
    'specimen': 'vendor/specimen/index.js',
    'lz-string': 'vendor/lz-string/libs/lz-string.js',
    'inline-elements': 'vendor/inline-elements/index.js',
    'block-elements': 'vendor/block-elements/index.js',
    'void-elements': 'vendor/void-elements/index.js',
})) {
    alias[pkg] = './src/' + target;
}

// ---------- build ----------

function copyStatic() {
    for (const file of COPY_FILES) {
        fs.copyFileSync(path.join(root, file), path.join(dist, file));
    }
    for (const dir of COPY_DIRS) {
        fs.cpSync(path.join(root, dir), path.join(dist, dir), { recursive: true });
    }
    // Cache-bust the asset URLs in the copied index.html: Chrome's compiled-
    // script cache is keyed by URL and can serve a STALE m.js across
    // extension reloads (same pinned extension id) — a changing query string
    // forces a fresh fetch of every build.
    const stamp = Date.now().toString(36);
    const indexPath = path.join(dist, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html
        .replace('src="m.js"', `src="m.js?v=${stamp}"`)
        .replace('src="runtime/mv3-fixes.js"', `src="runtime/mv3-fixes.js?v=${stamp}"`)
        .replace('src="runtime/caret-smooth.js"', `src="runtime/caret-smooth.js?v=${stamp}"`)
        .replace(/href="styles\/(m|pill|fonts|caret)\.css"/g, `href="styles/$1.css?v=${stamp}"`);
    fs.writeFileSync(indexPath, html);
}

async function main() {
    const watch = process.argv.includes('--watch');

    fs.rmSync(dist, { recursive: true, force: true });
    fs.mkdirSync(dist, { recursive: true });

    const options = {
        entryPoints: [path.join(srcDir, 'mindful', 'index.js')],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2017'],
        minify: false,
        sourcemap: true,
        outfile: path.join(dist, 'm.js'),
        alias,
        inject: [path.join(shimDir, 'process-global.js')],
        define: {
            // webpack's DefinePlugin set this at build time in the legacy
            // bundle (debug-only branches in element-observer.js)
            __DEBUG__: 'false',
        },
        plugins: [scssPlugin, copyStaticPlugin],
        legalComments: 'none',
        logLevel: 'info',
    };

    if (watch) {
        const ctx = await esbuild.context(options);
        await ctx.watch();
        console.log('watching for changes... (dist/ rebuilds automatically)');
    } else {
        await esbuild.build(options);
        console.log(`dist/ ready: ${fs.readdirSync(dist).length} files, ` +
            `m.js ${fs.statSync(path.join(dist, 'm.js')).size} bytes`);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
