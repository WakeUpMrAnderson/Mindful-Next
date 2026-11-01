# Security model

## What this extension is

Mindful (Next) is a new-tab notepad. Users may store anything in it,
including sensitive personal notes. Security is the primary design
constraint: **notes are never persisted in plaintext — anywhere.**

## Cryptographic design

- **Cipher:** AES-256-GCM (authenticated encryption) via the Web Crypto API.
- **Key derivation:** PBKDF2-HMAC-SHA256, 310,000 iterations, 16-byte random
  salt, from the user's passphrase. The derived key is imported as a
  **non-extractable** `CryptoKey` — the running page can use it but cannot
  read the raw bits.
- **Per-write IV:** a fresh 12-byte random IV for every encryption; IVs are
  stored alongside the ciphertext (GCM requirement, safe).
- **Compression:** content is LZ-compressed *before* encryption
  (compression after encryption is pointless and leaks length structure).
- **Integrity:** GCM's built-in authentication tag — tampered or
  wrongly-decrypted blobs fail hard instead of returning garbage.
- Everything is implemented with the browser's native Web Crypto; no
  cryptographic code is hand-rolled and no third-party crypto library is
  bundled.

## Storage layout (all ciphertext)

| Area | Keys | Purpose |
|---|---|---|
| `chrome.storage.sync` | `vault.meta`, `vault.data` | encrypted replica across devices (throttled) |
| `chrome.storage.local` | `vault.meta`, `vault.data`, `vault.snapshots`, `vault.watermark` | fast local mirror + last-7 daily encrypted snapshots + rollback watermark |
| `chrome.storage.session` | `vault.key`, `vault.lockGen` | the derived key bits, **in-memory only**, wiped when the browser closes; lock generation counter broadcast to every tab |
| `localStorage` | `vault.mirror`, mode flags (`daymode`, `hidemode`, …) | `vault.mirror` is the **ciphertext** of the last completed save (ts rides outside the envelope for newest-wins); synchronous floor against tab-close races. Mode flags never contain note content. |

Content flow: editor → LZ-compress → AES-GCM encrypt → storage. A sweep
test (`tests/vault.spec.js`) types a marker string and asserts it appears in
**no** storage area in plaintext — the mirror included. The lock broadcast
(`vault.lockGen`) is an integer generation counter, not secret material.

## Unlock & key lifetime

- First run requires setting a passphrase (minimum 8 characters). There is
  **no recovery** — a forgotten passphrase means the notes are permanently
  undecryptable. This is stated in the setup UI.
- Unlocking mirrors the derived key bits into `chrome.storage.session`
  (in-memory, cleared when the browser closes) so new tabs unlock silently
  for the rest of the session.
- **Lock and unlock both broadcast across tabs**: locking one tab locks all
  (session `vault.lockGen` counter); unlocking one tab unlocks all locked
  tabs (they adopt the re-mirrored session key, GCM-verified against the
  stored blob before use). The key is session-available to every new tab
  regardless, so this makes the model coherent — **one authentication per
  browser session** — without adding exposure. A stricter posture (demand a
  passphrase on every new tab, no session mirror) is a planned options-page
  choice.
- Remote unlocks never steal focus: only the tab where the passphrase was
  typed takes the caret.
- The vault **auto-locks after 15 minutes of idle** (keydown/mousemove
  resets the timer) and can be locked manually at any time. Locking clears
  the session key, broadcasts to every tab, and shows the lock screen.
- Existing users of the unencrypted predecessor are migrated once: their
  plaintext copies are folded into the vault and the plaintext keys are
  deleted from every storage area.

## What this protects against

- Someone with access to the Chrome profile folder or disk image reading
  the storage files — they get ciphertext only.
- Notes leaking through `chrome.storage.sync` to Google's infrastructure —
  only ciphertext is synced.
- Other extensions or scripts reading extension storage — ciphertext only.

## What this does NOT protect against (honest limitations)

- **An unlocked browser session.** While the vault is unlocked the key is
  in memory and the notes are rendered in the DOM — malware or a person at
  the keyboard can read them, exactly as they could read any open document.
  Locking (manual or idle timeout) closes this window.
- **Keyloggers** capturing the passphrase as it is typed.
- **A forgotten passphrase.** There is no backdoor, no reset, no recovery.
- **A compromised browser/OS.** Software running in the unlocked profile
  can do anything this extension can.
- **The DOM while unlocked.** Other extensions with content-script access
  to the same page could read rendered notes.
- **Sync rollback/replay — hardened.** Anyone with access to the Google
  account behind `chrome.storage.sync` can replace the synced ciphertext
  with an older valid copy (GCM authenticates the key, not freshness).
  Mitigation: every encrypted envelope carries a write timestamp, and the
  vault keeps the highest-seen timestamp as a watermark in
  `chrome.storage.local` — an area a sync-side attacker cannot touch. An
  incoming blob older than the watermark (beyond a 120-second clock-skew
  tolerance for legitimate multi-device edits) is rejected, the newer
  local copy is written back to sync to repair it, and the user is shown
  a notification. Residual risk: a rollback across browser restarts where
  the local mirror was also removed is detected but cannot be refused
  (nothing newer exists locally) — the user is still warned.
- **Offline passphrase guessing.** The synced blob gives an attacker with
  Google-account access everything needed to brute-force the passphrase
  offline; the 310k PBKDF2 cost slows each guess, and the passphrase
  itself is the real control — long and unique matters.

## Import safety

Imported files are sanitized before they enter the notes: `<script>`,
`<style>`, `<iframe>` and similar active elements are removed, `on*`
event-handler attributes are stripped, and `javascript:` URLs are
dropped. The MV3 CSP (`script-src 'self'`) remains the backstop — nothing
imported can execute in the extension page.

## Platform notes

- `chrome.storage.session` defaults to the `TRUSTED_CONTEXTS` access level:
  only the extension's own pages can read it; content scripts and web
  pages cannot (Chrome-documented platform behavior).
- Pasted or injected HTML cannot execute in the extension page: the
  manifest CSP is `script-src 'self'` (no `unsafe-inline`), and scripts
  inserted via `innerHTML` do not execute regardless.
- The manifest requests only the `storage` permission; there is no
  `externally_connectable` messaging and no `web_accessible_resources`.
- The passphrase is used transiently for derivation and is never stored.

## Verification

- `tests/vault.spec.js` — setup gate, plaintext-storage sweep with a typed
  marker, non-extractable key assertion, wrong-passphrase rejection,
  lock/unlock round-trip, snapshot ciphertext, status indicator, export.
- The full suite (`npm test`) additionally keeps the editor smoke and
  caret regression suites green under the vault flow.
