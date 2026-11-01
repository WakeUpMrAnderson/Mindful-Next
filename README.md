# Mindful (Next)

A new-tab Chrome extension (MV3): a minimal, private writing space in every
new tab. It is the continuation of Mindful (Beta) — the 2016 original by
Adrian Zumbrunnen — rebuilt from its source map into a fully readable,
CSP-compliant codebase. Everything is readable; `dist/` is what Chrome loads.

## Credits & provenance

**Mindful was created by [Adrian Zumbrunnen](https://twitter.com/azumbrunnen_)**
while he was at the Swiss digital agency **[Hinderling Volkart](http://www.hinderlingvolkart.com)** —
it launched in December 2016 and reached #1 on
[Product Hunt](https://www.producthunt.com/products/mindful-chrome-extension).
The original in-product credits are preserved verbatim in this rebuild: the
"Created by @azumbrunnen_" line and the Hinderling Volkart link in the
editor's demo content.

This repository is a **personal-use reconstruction** of that 2016 bundle
(store id `cieekmjjdkckhpidgaffphlaljdfhhab`, since removed from the Chrome
Web Store). No open-source license was shipped with the original package —
all rights to the original design and code remain with Adrian Zumbrunnen
and Hinderling Volkart. The changes here (MV3 migration, CSP-safe rebuild,
bug fixes) exist to keep a beloved tool alive on modern Chrome.

## Layout

```
index.html, manifest.json   canonical page + manifest (copied into dist/)
assets/                     icons, favicons, fonts
styles/                     m.css, fonts.css, caret.css
runtime/                    mv3-fixes.js, caret-smooth.js (hand-maintained scripts)
src/                        the recovered source tree (app + vendor + shims)
  src/mindful/index.js      bundle entry point
  src/MANIFEST.json         provenance map: webpack:/// source -> file
legacy/                     optional private fixture (2016 bundle + map + A/B
                            harness) — NOT part of this repo; the suite skips
                            it when absent. extract-sources.py needs its map.
scripts/                    build.js, extract-sources.py, debug/ probes
tests/                      Playwright suites: editor smoke + caret, settings,
                            vault, shortcuts
dist/                       generated output — Load unpacked THIS folder
```

## Build & test

```bash
npm install          # esbuild + playwright (devDependencies only)
npm run build        # -> dist/  (npm run watch rebuilds on change)
npm test             # 75 checks: editor smoke + caret, settings, vault,
                     # shortcuts suites
```

The smoke suite runs its checklist against `dist/index.html` (rebuilt) and,
when the private `legacy/` fixture is present next to the repo, also against
`legacy/index-legacy.html` (original 2016 bundle) for A/B parity — that leg
is skipped when the fixture is absent. `scripts/debug/*.js` are
real-extension probes (load dist with Playwright, click things, report
state).

## Load in Chrome

`chrome://extensions` → Developer mode → **Load unpacked** → select
the `dist` folder inside your clone — **the `dist` folder, not the repo root** (the
root has no bundle; a red on-page badge will tell you if you got it wrong).

## History in one paragraph

The 2016 original was a webpack-1 minified bundle (`legacy/m.legacy.js`)
whose source map carried all 387 original files. This repo extracted them
(`scripts/extract-sources.py`), made the bundle MV3/CSP-compliant (no
`new Function`/eval anywhere — Vue's expression compiler was replaced by a
small interpreter in `src/vendor/shims/csp-expression.js`), fixed a series
of latent bugs, and put the whole thing under test. See `docs/MIGRATION_NOTES.md`
and the git log for the full story.
