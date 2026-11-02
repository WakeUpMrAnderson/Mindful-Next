/**
 * Static file server for the Playwright suites — replaces the previous
 * `python -m http.server 8931` so the tests run anywhere Node runs (CI
 * runners have no `python` alias). Same contract: serves the repo root
 * on http://127.0.0.1:8931.
 *
 * Usage: node scripts/serve.js   (playwright.config starts it itself)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8931;
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.map': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.eot': 'application/vnd.ms-fontobject',
    '.ttf': 'font/ttf',
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.stat(filePath, (statErr, stat) => {
        if (!statErr && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
        fs.readFile(filePath, (readErr, data) => {
            if (readErr) { res.writeHead(404); return res.end('not found'); }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            });
            res.end(data);
        });
    });
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT));
