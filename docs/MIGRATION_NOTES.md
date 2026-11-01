# Mindful (Beta) MV2 → MV3 Migration Notes

## What was changed

### 1) Manifest migration
`manifest.json` was migrated from Manifest V2 to V3:

- `manifest_version`: `2` → `3`
- CSP format migrated to MV3 schema:
  - from: `"content_security_policy": "script-src 'self' 'unsafe-eval'; object-src 'self'"`
  - to: 
    ```json
    "content_security_policy": {
      "extension_pages": "script-src 'self'; object-src 'self'"
    }
    ```
- Preserved:
  - `chrome_url_overrides.newtab = "index.html"`
  - `permissions = ["storage"]`
  - name/version/icons/update_url/key/offline_enabled

## Validation performed

### Static validation (done)
- `manifest.json` parses correctly.
- Required migration assertions passed:
  - `manifest_version == 3`
  - `chrome_url_overrides.newtab == "index.html"`
  - `permissions` still includes `storage`
  - CSP no longer contains `unsafe-eval`

### Runtime-risk scan (done)
Using `m.js.map` source contents:
- `eval(` occurrences: **8**
- `new Function(` occurrences: **5**
- `chrome.storage.*` references: **5**

This indicates the bundled app likely still contains dynamic-code paths that may trigger MV3 CSP runtime violations if those paths execute.

## Important caveat

I cannot fully execute Chrome UI flow from this CLI-only environment (cannot directly open `chrome://extensions`, load unpacked, and interact with new-tab override here), so **final runtime acceptance still requires manual load-test in Chrome**.

## Manual runtime verification checklist (required)

1. Open `chrome://extensions` (Developer Mode ON)
2. Load unpacked extension folder:
   - `the original extension folder`
3. Confirm extension loads without install-time manifest/CSP errors.
4. Open new tab and verify Mindful UI appears.
5. Open extension page devtools console and verify no CSP runtime errors related to:
   - `eval`
   - `new Function`
6. Edit text and verify persistence/sync behavior.

## If CSP runtime errors appear

The likely fix path is to rebuild/replace the bundle (`m.js`) so it does not require dynamic code execution on extension pages (e.g., compiler-free runtime build path).
