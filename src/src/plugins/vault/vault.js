import LZString from 'lz-string';

/**
 * Vault — encrypted persistence for Mindful (Next).
 *
 * Threat model (see SECURITY.md at the repo root): everything at rest —
 * chrome.storage.sync, chrome.storage.local, localStorage — holds only
 * AES-GCM ciphertext. A passphrase-derived key (PBKDF2-SHA256, 310k
 * iterations) protects notes against profile-level access, disk
 * forensics, and cloud-sync leakage. It does NOT protect against an
 * attacker controlling the running unlocked browser session, keyloggers,
 * or a forgotten passphrase (no recovery — by design).
 *
 * Key handling: PBKDF2 derives 256 raw bits; they are imported as a
 * NON-extractable AES-GCM working key, and mirrored (raw bits, base64)
 * into chrome.storage.session — in-memory, wiped when the browser
 * closes, never on disk — so every new tab unlocks silently for the rest
 * of the browser session. Locking (manual or 15-minute idle) clears it.
 *
 * Persistence layout:
 *   chrome.storage.local   vault.meta, vault.data, vault.snapshots, vault.watermark
 *   chrome.storage.sync    vault.meta, vault.data   (throttled replica)
 *   chrome.storage.session vault.key (session only), vault.lockGen (lock broadcast)
 *   localStorage           vault.mirror (ciphertext mirror of the last save,
 *                          synchronous floor against tab-close races)
 * Legacy plaintext keys (sync: mindfulC/mindful/v, localStorage:
 * mindful/backup/backup__mindful__*) are migrated once at setup, then
 * deleted from every area.
 */

const PBKDF2_ITERATIONS = 310000;
const SNAPSHOT_KEEP = 7;
const AUTOLOCK_IDLE_MS = 15 * 60 * 1000;
const SYNC_MIN_INTERVAL_MS = 10000;
// rollback detection tolerance: legit multi-device edits with clock skew
// must not be mistaken for a sync-attacker replaying an older blob
const ROLLBACK_SKEW_MS = 120000;

const b64 = {
    encode(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); },
    decode(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; },
};

function storage(area) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage[area]) {
        // http/test fallback: in-memory stand-in with the same shape
        if (typeof chrome === 'undefined') globalThis.chrome = {};
        chrome.__mem = chrome.__mem || {};
        chrome.__mem[area] = chrome.__mem[area] || {};
        const store = chrome.__mem[area];
        return {
            get(keys, cb) {
                const out = {};
                (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) out[k] = store[k]; });
                cb && cb(out);
            },
            set(items, cb) { Object.assign(store, items); cb && cb(); },
            remove(keys, cb) { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); cb && cb(); },
        };
    }
    return chrome.storage[area];
}

const localStore = () => storage('local');
const syncStore = () => storage('sync');
const sessionStore = () => storage('session');

export const VaultState = { UNSET: 'unset', LOCKED: 'locked', UNLOCKED: 'unlocked' };

export class Vault {
    constructor() {
        this.key = null;           // non-extractable AES-GCM CryptoKey
        this.meta = null;          // { v, salt, iterations, created }
        this.state = VaultState.UNSET;
        this.idleTimer = null;
        this.lastSyncWrite = 0;
        this.editor = null;
        // F9: watermark cached in memory — this tab is the single writer
        // between storage reads, so compare-and-set happens without a
        // read-back race; seeded from storage on first use
        this.watermark = null;
        // F2: ts of the envelope currently rendered in this tab
        this.lastAppliedTs = 0;
        // F3: content at the last completed save — the pagehide flush
        // compares against it to cover the checkpoint debounce window
        this.lastSavedContent = null;
        // F4: lock generation counter (session broadcast), seeded lazily
        this.lockGen = null;
        this._boundAutoLockReset = null;
        this._lockingLocally = false;
        // F2: set on editor input, cleared on adoption — a tab with
        // un-checkpointed local typing must not have its content replaced
        // by an incoming blob (its own checkpoint is newer)
        this._typedHere = false;
    }

    // ---------- crypto ----------

    async deriveRawBits(passphrase, saltBytes) {
        const material = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
        return crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
            material, 256);
    }

    async importWorkingKey(rawBits) {
        return crypto.subtle.importKey('raw', rawBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }

    async encrypt(plaintext, ts = Date.now()) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const envelope = JSON.stringify({ v: 2, ts, html: plaintext });
        const data = new TextEncoder().encode(LZString.compressToUTF16(envelope));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, data);
        return { iv: b64.encode(iv), ct: b64.encode(new Uint8Array(ct)) };
    }

    async decrypt(blob) {
        const pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: b64.decode(blob.iv) }, this.key, b64.decode(blob.ct));
        return LZString.decompressFromUTF16(new TextDecoder().decode(pt));
    }

    /**
     * Decrypted plaintext comes in two shapes: v2 envelopes
     * ({ v, ts, html }) and pre-vault-2 plain html strings. Parse
     * leniently; a ts of 0 marks legacy content (upgraded on next save).
     */
    static parseEnvelope(text) {
        try {
            const j = JSON.parse(text);
            if (j && typeof j.html === 'string') return { ts: j.ts || 0, html: j.html };
        } catch (_) { /* legacy plaintext html */ }
        return { ts: 0, html: text };
    }

    // ---------- rollback watermark ----------

    async getWatermark() {
        if (this.watermark !== null) return this.watermark;
        const stored = await new Promise(res => localStore().get('vault.watermark',
            r => res((r && r['vault.watermark'] && r['vault.watermark'].ts) || 0)));
        this.watermark = stored;
        return stored;
    }

    async bumpWatermark(ts) {
        const current = await this.getWatermark();
        if (ts <= current) return current;
        this.watermark = ts;   // compare in memory, write through — no read-back race
        await localStore().set({ 'vault.watermark': { ts } });
        return ts;
    }

    isRollback(ts, watermark) {
        return ts < watermark - ROLLBACK_SKEW_MS;
    }

    // ---------- close-flush mirror (localStorage, synchronous) ----------

    /**
     * Synchronous ciphertext mirror of the last completed save.
     * localStorage commits immediately, so a tab closed while the async
     * chrome.storage write is still in flight cannot lose the last
     * finished checkpoint. Ciphertext-only (the ts rides outside the
     * envelope for newest-wins comparison) — the at-rest posture is
     * unchanged, see SECURITY.md.
     */
    writeMirror(ts, blob) {
        try {
            localStorage.setItem('vault.mirror', JSON.stringify({ ts, iv: blob.iv, ct: blob.ct }));
        } catch (_) { /* quota/denied — the storage areas remain the source of truth */ }
    }

    readMirror() {
        try {
            const raw = localStorage.getItem('vault.mirror');
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    /**
     * Newest-wins across the three ciphertext stores (local, sync, and
     * the synchronous mirror). Used at boot and on visibilitychange.
     * Legacy pre-envelope blobs parse as ts 0 and lose against any v2
     * envelope. Garbage blobs fail decryption and are skipped.
     */
    async getNewestEnvelope() {
        const candidates = [];
        const localBlob = await new Promise(res => localStore().get('vault.data', r => res(r && r['vault.data'])));
        if (localBlob) candidates.push({ source: 'local', blob: localBlob });
        const mirror = this.readMirror();
        if (mirror && mirror.iv && mirror.ct) {
            candidates.push({ source: 'mirror', blob: { iv: mirror.iv, ct: mirror.ct }, ts: mirror.ts });
        }
        const syncBlob = await new Promise(res => syncStore().get('vault.data', r => res(r && r['vault.data'])));
        if (syncBlob) candidates.push({ source: 'sync', blob: syncBlob });

        let newest = null;
        for (const cand of candidates) {
            try {
                const env = Vault.parseEnvelope(await this.decrypt(cand.blob));
                if (!newest || env.ts > newest.env.ts) newest = { ...cand, env };
            } catch (_) { /* foreign/garbage — skip */ }
        }
        return newest;
    }

    /**
     * A rollback means someone with sync access replayed an older valid
     * ciphertext. The local mirror (untouchable from the sync side) holds
     * newer content in that case — keep it and heal the sync replica; if
     * there is nothing newer locally, apply the rolled-back content and
     * warn. Either way the user is told.
     */
    async resolveIncomingEnvelope(env) {
        const watermark = await this.getWatermark();
        if (!this.isRollback(env.ts, watermark)) {
            await this.bumpWatermark(env.ts);
            return { accepted: true, env };
        }
        this.notifyRollback();
        const localBlob = await new Promise(res => localStore().get('vault.data', r => res(r && r['vault.data'])));
        if (localBlob) {
            const text = await this.decrypt(localBlob);
            const localEnv = Vault.parseEnvelope(text);
            if (!this.isRollback(localEnv.ts, watermark)) {
                syncStore().set({ 'vault.data': localBlob });   // heal sync
                return { accepted: false, env: localEnv };      // keep newer local
            }
        }
        await this.bumpWatermark(env.ts);
        return { accepted: true, env };   // nothing newer locally — show it
    }

    notifyRollback() {
        console.warn('[Mindful] sync rollback detected — the newer local copy of your notes was kept.');
        this.editor && this.editor.emit('notify', {
            text: 'Sync rollback detected: an older copy of your notes arrived from sync. Your newest version was kept and sync has been repaired.',
            id: 'rollback'
        });
    }

    // ---------- setup / unlock / lock ----------

    async isConfigured() {
        return new Promise(res => localStore().get('vault.meta', r => res(!!(r && r['vault.meta']))));
    }

    /** First run: create the vault around the current editor content. */
    async setup(passphrase, initialContent) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const rawBits = await this.deriveRawBits(passphrase, salt);
        this.meta = { v: 1, salt: b64.encode(salt), iterations: PBKDF2_ITERATIONS, created: Date.now() };
        this.key = await this.importWorkingKey(rawBits);
        const ts = Date.now();
        // strip transient state (fk-active etc.) — the stored baseline must
        // be in the same normalization as every later capture, or the
        // unchanged-content dedupe in save() misses forever
        const clean = this.stripTransientState(initialContent || '');
        const blob = await this.encrypt(clean, ts);
        await localStore().set({ 'vault.meta': this.meta, 'vault.data': blob });
        this.writeMirror(ts, blob);
        this.lastAppliedTs = ts;
        this.lastSavedContent = clean;
        await this.bumpWatermark(ts);
        syncStore().set({ 'vault.meta': this.meta, 'vault.data': blob });
        await this.migrateLegacyPlaintext();
        this.unlockedViaPassphrase = true;
        // F-settings strict unlock: never mirror the key into session
        // storage — every new tab demands the passphrase
        if (localStorage.getItem('strictunlock') !== '1') {
            await sessionStore().set({ 'vault.key': b64.encode(new Uint8Array(rawBits)) });
        }
        this.state = VaultState.UNLOCKED;
        await this.snapshot(initialContent || '');   // day-one snapshot
    }

    /** Subsequent unlocks: derive, verify against the stored blob, mirror. */
    async unlock(passphrase) {
        this.unlockedViaPassphrase = true;
        if (!this.meta) {
            this.meta = await new Promise(res => localStore().get('vault.meta', r => res(r['vault.meta'])));
        }
        const rawBits = await this.deriveRawBits(passphrase, b64.decode(this.meta.salt));
        const candidate = await this.importWorkingKey(rawBits);
        const blob = await this.getBlob();
        if (blob) {
            const probe = Object.assign(Object.create(Object.getPrototypeOf(this)), { key: candidate });
            try {
                await probe.decrypt(blob);
            } catch (e) {
                throw new Error('WRONG_PASSPHRASE');   // GCM auth failure
            }
        }
        this.key = candidate;
        // F-settings strict unlock: no session mirror — the passphrase is
        // demanded again in every new tab
        if (localStorage.getItem('strictunlock') !== '1') {
            await sessionStore().set({ 'vault.key': b64.encode(new Uint8Array(rawBits)) });
        }
        this.state = VaultState.UNLOCKED;
    }

    /** Session restore: a key mirrored earlier in this browser session. */
    async tryRestoreSession() {
        // F-settings strict unlock: the passphrase is demanded per tab
        if (localStorage.getItem('strictunlock') === '1') return false;
        const stored = await new Promise(res => sessionStore().get('vault.key', r => res(r && r['vault.key'])));
        if (!stored) return false;
        try {
            this.key = await this.importWorkingKey(b64.decode(stored));
        } catch (e) {
            return false;
        }
        this.state = VaultState.UNLOCKED;
        return true;
    }

    async lock({ broadcast = true } = {}) {
        this.key = null;
        this.state = VaultState.LOCKED;
        this.teardownAutoLock();
        await sessionStore().remove('vault.key');
        // F4: broadcast the lock to every other unlocked tab via the
        // session generation counter (session storage is shared by all
        // extension pages of this browser session)
        if (broadcast) {
            this._lockingLocally = true;
            try {
                const gen = (this.lockGen !== null ? this.lockGen : await new Promise(res =>
                    sessionStore().get('vault.lockGen', r => res((r && r['vault.lockGen']) || 0)))) + 1;
                this.lockGen = gen;
                await sessionStore().set({ 'vault.lockGen': gen });
            } finally {
                this._lockingLocally = false;
            }
        }
        // fade the editor out like the hide toggle before the lock screen
        const article = document.querySelector('article.fk-editable');
        article && (article.setAttribute('contenteditable', 'false'), article.style.opacity = '0');
        this.renderLockScreen();
    }

    /**
     * F4 unlock broadcast: another tab verified the passphrase and
     * mirrored the working key into session storage. Adopt it (after GCM
     * verification against the stored blob), skip the lock/setup screen,
     * catch the tab up on anything it missed while locked — and do NOT
     * steal focus: the user is at the other tab.
     */
    async adoptRemoteUnlock(keyB64) {
        if (this.state === VaultState.UNLOCKED) return;
        this.key = await this.importWorkingKey(b64.decode(keyB64));
        if (!this.meta) {
            this.meta = await new Promise(res => localStore().get('vault.meta', r => res(r && r['vault.meta'])));
        }
        const blob = await this.getBlob();
        if (blob) {
            try {
                const probe = Object.assign(Object.create(Object.getPrototypeOf(this)), { key: this.key });
                await probe.decrypt(blob);   // GCM auth — wrong key never passes
            } catch (e) {
                this.key = null;
                return;
            }
        }
        this.state = VaultState.UNLOCKED;
        this.removeOverlay();
        await this.adoptNewestIfStale();   // locked tabs missed writes while locked
        this.afterUnlock({ focus: false });
    }

    armAutoLock() {
        this.teardownAutoLock();
        const reset = () => {
            if (this.state !== VaultState.UNLOCKED) return;
            clearTimeout(this.idleTimer);
            this.idleTimer = setTimeout(() => this.lock(), this.autoLockMinutes() * 60 * 1000);
        };
        this._boundAutoLockReset = reset;
        document.addEventListener('keydown', reset);
        document.addEventListener('mousemove', reset);
        reset();
    }

    teardownAutoLock() {
        clearTimeout(this.idleTimer);
        if (this._boundAutoLockReset) {
            document.removeEventListener('keydown', this._boundAutoLockReset);
            document.removeEventListener('mousemove', this._boundAutoLockReset);
            this._boundAutoLockReset = null;
        }
    }

    // ---------- persistence ----------

    async getBlob() {
        return new Promise(res => localStore().get('vault.data', async r => {
            if (r && r['vault.data']) return res(r['vault.data']);
            syncStore().get('vault.data', s => res(s && s['vault.data']));
        }));
    }

    setStatus(status) {
        this.editor && this.editor.emit('vault.status', status);
        this.renderStatus(status);
    }

    /**
     * Strip the editor's transient state from HTML before it is persisted:
     * - selection save/restore marker spans (`.selection-marker`) must never
     *   reach storage — on the next load the editor's normalizations "restore"
     *   the selection from them, which selects the whole article (boundary
     *   markers) or drops a caret at the start (collapsed marker).
     * - the `fk-active` caret-highlight class and the flow-menu's
     *   `fk-inlineMenu-offCanvas` state class are caret/UI position, not
     *   content — and because the caret moves on every FOCUS, leaving them
     *   in made every focus-checkpoint look like a content change (fresh ts
     *   → watermark bump → other tabs look stale → adoption wipes).
     */
    stripTransientState(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        tpl.content.querySelectorAll('.selection-marker').forEach(node => node.remove());
        tpl.content.querySelectorAll('.fk-active, .fk-inlineMenu-offCanvas').forEach(el => {
            el.classList.remove('fk-active', 'fk-inlineMenu-offCanvas');
            if (!el.getAttribute('class')) el.removeAttribute('class');
        });
        const holder = document.createElement('div');
        holder.appendChild(tpl.content);
        return holder.innerHTML;
    }

    async save(content) {
        if (this.state !== VaultState.UNLOCKED || !this.key) return;
        const clean = this.stripTransientState(content);
        // Unchanged content is never re-persisted: the editor checkpoints
        // on every FOCUS (2016 behavior), and re-saving identical content
        // with a fresh ts would bump the watermark and make every OTHER
        // tab look stale — the cascade that wiped typed text across tabs
        // (found by the two-tab acceptance probe).
        if (clean === this.lastSavedContent) return;
        // stale-write guard (F2): a tab that is BEHIND storage must never
        // clobber newer content — no matter which path saves (checkpoint,
        // pagehide flush, import). Adopt instead and tell the user; their
        // unsaved keystrokes were made against stale content anyway.
        const watermark = await this.getWatermark();
        if (watermark > this.lastAppliedTs) {
            console.warn('[Mindful] save skipped — this tab was behind the newest stored notes; adopted them instead.');
            this._typedHere = false;
            await this.adoptNewestIfStale();
            this.showSyncNotice();
            return;
        }
        this.setStatus('saving');
        const ts = Date.now();
        const blob = await this.encrypt(clean, ts);
        await localStore().set({ 'vault.data': blob });   // local mirror: every checkpoint
        this.writeMirror(ts, blob);                       // synchronous floor for tab-close races
        this.lastAppliedTs = Math.max(this.lastAppliedTs, ts);
        this.lastSavedContent = clean;
        this._typedHere = false;   // the local input is checkpointed now
        await this.bumpWatermark(ts);
        // sync is the throttled replica — local has no quota pressure, sync
        // writes at most every this.syncMinIntervalMs() with a trailing write
        // so the final state always lands.
        const now = Date.now();
        if (now - this.lastSyncWrite >= this.syncMinIntervalMs()) {
            this.lastSyncWrite = now;
            syncStore().set({ 'vault.data': blob }, () => {
                this.setStatus(chrome.runtime && chrome.runtime.lastError ? 'error' : 'saved');
            });
            return;
        }
        this.setStatus('saved');
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(async () => {
            this.lastSyncWrite = Date.now();
            const freshTs = Date.now();
            // same transient-state strip as the local write — a marker
            // that reached sync would come back on cross-tab adoption
            const fresh = await this.encrypt(clean, freshTs);
            this.lastAppliedTs = Math.max(this.lastAppliedTs, freshTs);
            await this.bumpWatermark(freshTs);
            syncStore().set({ 'vault.data': fresh }, () => {
                this.setStatus(chrome.runtime && chrome.runtime.lastError ? 'error' : 'saved');
            });
        }, this.syncMinIntervalMs() - (now - this.lastSyncWrite));
    }

    /** Decrypt + parse the newest stored blob (local preferred over sync). */
    async loadEnvelope() {
        const newest = await this.getNewestEnvelope();
        if (!newest) return null;
        let env = newest.env;
        if (env.ts === 0) {
            // legacy pre-envelope plaintext — upgrade in place; rollback
            // semantics start with the v2 envelope
            await this.save(env.html);
            return { ts: Date.now(), html: env.html };
        }
        const resolved = await this.resolveIncomingEnvelope(env);
        // a mirror-newest boot means the durable write raced the tab
        // close — heal the local area from the mirror before the user
        // can type (sync heals via the throttled write or rollback path)
        if (newest.source === 'mirror') {
            localStore().set({ 'vault.data': newest.blob });
        }
        this.lastAppliedTs = Math.max(this.lastAppliedTs, resolved.env.ts);
        return { ts: resolved.env.ts, html: resolved.env.html };
    }

    async load() {
        const env = await this.loadEnvelope();
        return env ? env.html : null;
    }

    async snapshot(content) {
        const today = new Date().toISOString().slice(0, 10);
        const snaps = await new Promise(res => localStore().get('vault.snapshots', r => res((r && r['vault.snapshots']) || [])));
        if (snaps.length && snaps[snaps.length - 1].day === today) return;
        snaps.push({ day: today, t: Date.now(), blob: await this.encrypt(this.stripTransientState(content)) });
        while (snaps.length > SNAPSHOT_KEEP) snaps.shift();
        await localStore().set({ 'vault.snapshots': snaps });
    }

    async migrateLegacyPlaintext() {
        // One-time: fold every legacy plaintext copy of the notes into the
        // vault, then delete the plaintext from every area. Priority:
        // sync mindfulC (LZ) > sync mindful > localStorage mindful > backup.
        const legacy = await new Promise(res => syncStore().get(['mindfulC', 'mindful'], r => res(r || {})));
        let content = null;
        if (legacy.mindfulC) content = LZString.decompressFromUTF16(legacy.mindfulC);
        if (!content && legacy.mindful) content = legacy.mindful;
        if (!content) {
            const localLegacy = await new Promise(res => localStore().get(['mindful', 'backup'], r => res(r || {})));
            content = localLegacy.mindful || localLegacy.backup || null;
        }
        if (content) {
            const blob = await this.encrypt(content);
            await localStore().set({ 'vault.data': blob });
            syncStore().set({ 'vault.data': blob });
        }
        syncStore().remove(['mindfulC', 'mindful', 'v']);
        localStore().remove(['mindful', 'backup']);
        try {
            ['mindful', 'backup'].forEach(k => localStorage.removeItem(k));
            Object.keys(localStorage).filter(k => k.startsWith('backup__mindful__')).forEach(k => localStorage.removeItem(k));
        } catch (_) { /* localStorage unavailable in some contexts */ }
    }

    // ---------- export / import ----------

    htmlToMarkdown(html) {
        return html
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
            .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (m, inner) =>
                '\n' + inner.split(/<br\s*\/?>|<\/p>|<\/div>/i)
                    .map(line => '> ' + line.replace(/<[^>]+>/g, '')).join('\n') + '\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n')
            .replace(/<\/?[ou]l[^>]*>/gi, '\n')
            .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**')
            .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*')
            .replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div)>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    async download(format) {
        const html = await this.load();
        const body = format === 'md' ? this.htmlToMarkdown(html)
            : '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mindful export</title></head><body>' + html + '</body></html>';
        const blob = new Blob([body], { type: format === 'md' ? 'text/markdown' : 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'mindful-' + new Date().toISOString().slice(0, 10) + '.' + format;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /** Minimal HTML sanitizer: drop executable/active content. The MV3 CSP
        is the backstop, but imported files should arrive clean anyway. */
    sanitizeHtml(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        tpl.content.querySelectorAll('script, style, iframe, object, embed, link, meta, base')
            .forEach(node => node.remove());
        tpl.content.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on') ||
                    (name === 'href' && /^\s*javascript:/i.test(attr.value)) ||
                    (name === 'src' && /^\s*javascript:/i.test(attr.value))) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        const holder = document.createElement('div');
        holder.appendChild(tpl.content);
        return holder.innerHTML;
    }

    /** Minimal Markdown → HTML for the subset this export produces. */
    mdToHtml(md) {
        const inline = s => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        const out = [];
        let list = null;
        let para = [];
        const flushPara = () => { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
        const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
        for (const raw of md.replace(/\r/g, '').split('\n')) {
            const line = raw.trimEnd();
            let m;
            if (!line.trim()) { flushPara(); closeList(); continue; }
            if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
                flushPara(); closeList();
                out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>');
                continue;
            }
            if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); closeList(); out.push('<hr>'); continue; }
            if ((m = line.match(/^>\s?(.*)$/))) {
                flushPara(); closeList();
                out.push('<blockquote>' + inline(m[1]) + '</blockquote>');
                continue;
            }
            if ((m = line.match(/^[-*]\s+(.*)$/))) {
                if (list !== 'ul') { flushPara(); closeList(); out.push('<ul>'); list = 'ul'; }
                out.push('<li>' + inline(m[1]) + '</li>');
                continue;
            }
            if ((m = line.match(/^\d+\.\s+(.*)$/))) {
                if (list !== 'ol') { flushPara(); closeList(); out.push('<ol>'); list = 'ol'; }
                out.push('<li>' + inline(m[1]) + '</li>');
                continue;
            }
            closeList();
            para.push(inline(line));
        }
        flushPara();
        closeList();
        return out.join('\n');
    }

    async importFromFile(file) {
        const text = await file.text();
        const looksHtml = /\.html?$/i.test(file.name) || /^\s*</.test(text);
        const bodyMatch = looksHtml ? (text.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, text]) : [null, text];
        const html = this.stripTransientState(this.sanitizeHtml(looksHtml ? bodyMatch[1] : this.mdToHtml(text)));
        const article = document.querySelector('article.fk-editable');
        if (article) article.innerHTML = html;
        await this.save(html);
        await this.snapshot(html);
        return html;
    }

    // ---------- user-tunable settings (F-settings) ----------

    /**
     * Auto-lock idle minutes, from the settings panel (localStorage
     * 'autolock', default 15, clamped 1-720 by the UI).
     */
    autoLockMinutes() {
        var v = parseInt(localStorage.getItem('autolock'), 10);
        return (v >= 1 && v <= 720) ? v : 15;
    }

    /**
     * Sync replicate interval in ms, from the settings panel (localStorage
     * 'syncinterval', seconds, default 10, clamped 10-600 by the UI).
     */
    syncMinIntervalMs() {
        var v = parseInt(localStorage.getItem('syncinterval'), 10);
        return (v >= 10 && v <= 600) ? v * 1000 : SYNC_MIN_INTERVAL_MS;
    }

    // ---------- unlocked action bar (export / import) ----------

    /**
     * F-settings: the export/import controls render INTO the settings
     * side panel's "Notes file" section (the old fixed bottom-right bar
     * is gone). Falls back to the body if the panel section is missing.
     */
    renderActions() {
        let bar = document.querySelector('.vault-actions');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'vault-actions';
            bar.innerHTML = `
                <button type="button" data-vault-action="export-md" title="Export notes as Markdown">Export .md</button>
                <button type="button" data-vault-action="export-html" title="Export notes as HTML">Export .html</button>
                <button type="button" data-vault-action="import" title="Import notes from a .md or .html file">Import…</button>
                <input type="file" id="vault-import-file" accept=".md,.markdown,.html,.htm" hidden>`;
            const host = document.querySelector('.mfk-settings-notes-actions');
            (host || document.body).appendChild(bar);
            bar.querySelector('[data-vault-action="export-md"]').addEventListener('click', () => this.download('md'));
            bar.querySelector('[data-vault-action="export-html"]').addEventListener('click', () => this.download('html'));
            const input = bar.querySelector('#vault-import-file');
            bar.querySelector('[data-vault-action="import"]').addEventListener('click', () => input.click());
            input.addEventListener('change', async () => {
                if (input.files && input.files[0]) {
                    try { await this.importFromFile(input.files[0]); } catch (e) { this.setStatus('error'); }
                }
                input.value = '';
            });
        }
        bar.classList.remove('vault-hidden');
    }

    hideActions() {
        const bar = document.querySelector('.vault-actions');
        bar && bar.classList.add('vault-hidden');
    }

    // ---------- UI ----------

    // ---------- cross-tab adoption (F2) ----------

    adoptContent(html, ts) {
        const article = document.querySelector('article.fk-editable');
        if (article && article.innerHTML !== html) {
            // preserve the caret across the swap: an innerHTML replacement
            // drops the selection and the browser parks the caret at the
            // article start (the "cursor jumps to Welcome" report). Record
            // the caret's text offset and restore it into the fresh DOM —
            // only while the user is actually in the editor.
            const sel = window.getSelection();
            let caretOffset = null;
            if (sel && sel.rangeCount && article.contains(sel.getRangeAt(0).startContainer)) {
                const pre = document.createRange();
                pre.selectNodeContents(article);
                const range = sel.getRangeAt(0);
                pre.setEnd(range.startContainer, range.startOffset);
                caretOffset = pre.toString().length;
            }
            article.innerHTML = html;
            if (caretOffset !== null && document.activeElement &&
                (document.activeElement === article || article.contains(document.activeElement))) {
                this.restoreCaretAtTextOffset(article, caretOffset);
            }
        }
        this.lastAppliedTs = Math.max(this.lastAppliedTs, ts);
        this._typedHere = false;   // fresh content — no un-checkpointed local input
    }

    /**
     * Place a collapsed caret at the given text offset inside `root`
     * (clamped to the content length). Pure text-offset walking — works
     * across the innerHTML round-trip regardless of element changes.
     */
    restoreCaretAtTextOffset(root, offset) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node, consumed = 0, target = null, targetOffset = 0, last = null;
        while ((node = walker.nextNode())) {
            last = node;
            if (consumed + node.length >= offset) {
                target = node;
                targetOffset = offset - consumed;
                break;
            }
            consumed += node.length;
        }
        if (!target) {
            // offset beyond the (shorter) new content — clamp to the end
            target = last;
            if (!target) return;
            targetOffset = target.length;
        }
        const range = document.createRange();
        range.setStart(target, Math.min(targetOffset, target.length));
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Minimal sync notice (F2): plain text, top far right, no background.
     * The user can close it; otherwise it fades away smoothly after 3s.
     * Never stacks — an existing notice is reused and its timer restarts.
     */
    showSyncNotice() {
        let notice = document.querySelector('.vault-sync-notice');
        if (!notice) {
            this.ensureStyles();
            notice = document.createElement('div');
            notice.className = 'vault-sync-notice';
            notice.setAttribute('role', 'status');
            notice.innerHTML = 'synced from another tab <span class="vault-sync-notice__close" title="Dismiss">×</span>';
            notice.addEventListener('click', () => this.dismissSyncNotice());
            document.body.appendChild(notice);
        }
        notice.classList.remove('vault-sync-notice--fade');
        clearTimeout(this._syncNoticeTimer);
        this._syncNoticeTimer = setTimeout(() => this.dismissSyncNotice(), 3000);
    }

    dismissSyncNotice() {
        const notice = document.querySelector('.vault-sync-notice');
        if (!notice || notice.classList.contains('vault-sync-notice--fade')) return;
        clearTimeout(this._syncNoticeTimer);
        notice.classList.add('vault-sync-notice--fade');
        setTimeout(() => notice.remove(), 400);   // match the fade duration
    }

    /**
     * Visible-tab catch-up: the onChanged listener skips visible tabs on
     * purpose (concurrent typing keeps the visible tab the source of
     * truth), so a write that lands while this tab is BECOMING visible
     * would otherwise be missed — the user would see stale notes and the
     * next keystroke would save stale-over-newer. Fires on
     * visibilitychange and adopts the stored newest envelope when this
     * tab is behind. Skips only when this tab has UN-CHECKPOINTED local
     * typing (_typedHere) — NOT on focus: browsers restore the article
     * focus when a tab re-activates, so a focus guard misfires on every
     * switch (found by the user acceptance test).
     */
    async adoptNewestIfStale() {
        if (this._typedHere) return;
        // NOTE: no in-memory watermark pre-check here — the tracking of an
        // incoming write resolves asynchronously (crypto), so the cached
        // watermark can be momentarily stale exactly when the catch-up
        // runs. The envelope read below is the source of truth and cheap.
        const newest = await this.getNewestEnvelope();
        if (!newest || newest.env.ts <= this.lastAppliedTs) return;
        const resolved = await this.resolveIncomingEnvelope(newest.env);
        if (!resolved.accepted) return;   // rollback rejected + healed + notified
        this.adoptContent(resolved.env.html, resolved.env.ts);
    }

    init(editor) {
        this.editor = editor;
        // one-glance build marker: lets the user verify WHICH build Chrome is
        // running (the Beta fork and stale caches look almost identical)
        try {
            const v = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ?
                chrome.runtime.getManifest().version : 'dev';
            console.info(`[Mindful (Next)] v${v} — encrypted vault active`);
        } catch (_) { /* never block boot on logging */ }
        // Styles must exist from the very first tick: the session-restore
        // path boots without ever showing an overlay, and an unstyled status
        // pill renders in-flow at the page bottom in near-invisible text.
        this.ensureStyles();
        const article = document.querySelector('article.fk-editable');
        // locked until proven otherwise; opacity 0 mirrors the hide toggle
        // (m.css transitions it back in on unlock)
        article && (article.setAttribute('contenteditable', 'false'), article.style.opacity = '0');

        editor.on('history.checkpoint', () => this.save(editor.el.innerHTML));
        editor.on('vault.status', () => {});
        // F2: un-checkpointed local typing — the only state that may block
        // an incoming adoption (its own checkpoint is newer than any blob)
        article && article.addEventListener('input', () => { this._typedHere = true; });
        // F-settings strict unlock: when the preference turns on, the
        // session key mirror is cleared immediately (the panel dispatches
        // the storage event in the same tab; other tabs get it natively)
        window.addEventListener('storage', (e) => {
            if (e.key === 'strictunlock' && e.newValue === '1') {
                sessionStore().remove('vault.key');
            }
        });
        this.renderStatus();

        // Cross-tab sync: incoming encrypted updates from other windows.
        // GCM authentication means a foreign or tampered blob fails
        // decryption here and is ignored — it cannot inject HTML.
        // EVERY tab tracks the newest envelope ts through
        // resolveIncomingEnvelope (the save-side stale guard depends on
        // knowing about other tabs' writes even while visible); only
        // HIDDEN tabs swap the DOM — the visible tab stays the source of
        // truth while the user types, and catches up on visibilitychange
        // or window focus.
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                // F4: a lock broadcast from another tab
                if (area === 'session') {
                    if (changes['vault.lockGen'] && this.state === VaultState.UNLOCKED &&
                        !this._lockingLocally) {
                        this.lock({ broadcast: false });
                    }
                    // F4: unlock broadcast — another tab unlocked (or set the
                    // vault up) and mirrored the working key into session
                    // storage; adopt it instead of demanding the passphrase
                    // again. The key is already session-available to every
                    // NEW tab — extending it to open tabs makes the model
                    // coherent: one authentication per browser session.
                    const keyChange = changes['vault.key'];
                    if (keyChange && keyChange.newValue &&
                        this.state !== VaultState.UNLOCKED && !this._lockingLocally) {
                        Promise.resolve().then(async () => {
                            await this.adoptRemoteUnlock(keyChange.newValue);
                        }).catch(() => { /* foreign key material — stay locked */ });
                    }
                    return;
                }
                if (area !== 'local' && area !== 'sync') return;
                const change = changes['vault.data'];
                if (!change || !change.newValue) return;
                if (this.state !== VaultState.UNLOCKED || !this.key) return;
                Promise.resolve().then(async () => {
                    const env = Vault.parseEnvelope(await this.decrypt(change.newValue));
                    if (env.ts === 0) {   // legacy plaintext — adopt as-is
                        const article0 = document.querySelector('article.fk-editable');
                        if (article0 && article0.innerHTML !== env.html) article0.innerHTML = env.html;
                        return;
                    }
                    // exact echo of this tab's own latest write — nothing to adopt
                    if (env.ts === this.lastAppliedTs) return;
                    const resolved = await this.resolveIncomingEnvelope(env);
                    if (!resolved.accepted) return;   // rollback rejected + healed + notified
                    if (!document.hidden) return;     // visible: keep the DOM, watermark is tracked
                    this.adoptContent(resolved.env.html, resolved.env.ts);
                }).catch(() => { /* foreign/garbage blob — GCM rejected it */ });
            });

            // F2: fill the visible-switch gap — catch up when this tab
            // becomes visible again or the user interacts with it. Neither
            // signal alone is reliable across browsers/tab modes, so both
            // visibilitychange AND window focus AND mousedown run the same
            // cheap check (in-memory watermark pre-check inside).
            const catchUp = () => {
                if (!document.hidden && this.state === VaultState.UNLOCKED && this.key) {
                    Promise.resolve().then(() => this.adoptNewestIfStale()).catch(() => {});
                }
            };
            document.addEventListener('visibilitychange', catchUp);
            window.addEventListener('focus', catchUp);
            document.addEventListener('mousedown', catchUp);
        }

        // F3: flush a pending checkpoint on tab close — the debounced
        // checkpoint (500ms) means the last keystrokes would otherwise
        // never reach any store. The save is best-effort at unload; the
        // synchronous localStorage mirror is the guaranteed floor.
        window.addEventListener('pagehide', () => {
            try {
                if (this.state !== VaultState.UNLOCKED || !this.editor) return;
                const current = this.editor.el.innerHTML;
                if (current !== this.lastSavedContent) this.save(current);
            } catch (_) { /* never block unload */ }
        });

        this.boot().then(async () => {
            if (this.state !== VaultState.UNLOCKED) return;
            const content = await this.load();
            if (content !== null && content !== undefined && article && article.innerHTML !== content) {
                article.innerHTML = content;
            }
            // the content on screen is now the persisted baseline — a
            // focus re-checkpoint of it must be a no-op (see save())
            if (content !== null && content !== undefined) this.lastSavedContent = content;
            else if (article) this.lastSavedContent = this.stripTransientState(article.innerHTML);
            // fade the editor in — the unhide transition
            article && (article.style.opacity = '');
            // NOTE: no article.focus() on the session-restore path — a new
            // tab must leave the browser focus (omnibox) alone, otherwise a
            // caret blinks in the editor while the user is in the omnibox.
            // Only an explicit passphrase unlock focuses the editor.
            this.renderActions();
            this.armAutoLock();
            if (content) this.snapshot(content);
        });
    }

    async boot() {
        if (await this.tryRestoreSession()) {
            this.removeOverlay();
            return;
        }
        this.state = (await this.isConfigured()) ? VaultState.LOCKED : VaultState.UNSET;
        if (this.state === VaultState.LOCKED) this.renderLockScreen();
        else this.renderSetup();
    }

    afterUnlock({ focus = true } = {}) {
        const article = document.querySelector('article.fk-editable');
        // editable immediately; the overlay dissolves above it while the
        // article fades in via m.css's own opacity transition (unhide feel)
        article && (article.setAttribute('contenteditable', 'true'), article.style.opacity = '');
        // only the tab where the user actually typed the passphrase takes
        // focus — remote unlocks must never steal it
        focus && article && article.focus();
        this.renderActions();
        this.armAutoLock();   // passphrase path must idle-lock like the session path
        // baseline for the unchanged-content save dedupe (see save())
        article && (this.lastSavedContent = this.stripTransientState(article.innerHTML));
        const overlay = this.overlay;
        if (overlay) {
            overlay.classList.add('vault-overlay--dissolve');
            const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
            setTimeout(() => {
                overlay.remove();
                if (this.overlay === overlay) this.overlay = null;
            }, delay);
        }
    }

    // ---------- overlay UI ----------

    // Design tokens mirror styles/m.css: day #fff/#111 + rgba(0,0,0,.54),
    // night #202328/#dadada + rgba(255,255,255,.54), Menlo/Roboto Mono,
    // .2s–.3s ease-in-out transitions.
    static STYLE_SHEET = `        .vault-overlay {
            position: fixed; inset: 0; z-index: 2147483000;
            display: flex; align-items: center; justify-content: center;
            background: #fff; color: #111;
            font-family: Menlo, 'Roboto Mono', 'Noto Sans', sans-serif;
            animation: vault-fade .3s ease-in-out;
            --vault-muted: rgba(0, 0, 0, .54);
            --vault-border: rgba(0, 0, 0, .18);
            --vault-accent: #111;
            --vault-accent-text: #fff;
        }
        .night .vault-overlay {
            background: #202328; color: #dadada;
            --vault-muted: rgba(255, 255, 255, .54);
            --vault-border: rgba(218, 218, 218, .28);
            --vault-accent: #dadada;
            --vault-accent-text: #202328;
        }
        @keyframes vault-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vault-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        .vault-card { max-width: 440px; width: 88%; text-align: center;
            animation: vault-rise .35s ease-in-out; }
        .vault-card h1 { font-size: 22px; font-weight: 400; letter-spacing: .06em; margin: 0 0 16px; }
        .vault-card p { font-size: 12.5px; line-height: 1.7; color: var(--vault-muted); margin: 0 0 14px; }
        .vault-field { position: relative; margin: 6px 0; }
        .vault-field input { width: 100%; box-sizing: border-box; padding: 11px 42px 11px 12px;
            border: 1px solid var(--vault-border); border-radius: 3px;
            font-family: inherit; font-size: 13px; color: inherit;
            background: transparent; transition: border-color .2s ease-in-out; }
        .vault-field input:focus { outline: none; border-color: var(--vault-accent); }
        .vault-reveal { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
            display: flex; padding: 5px; background: none; border: 0; border-radius: 3px;
            color: var(--vault-muted); cursor: pointer;
            transition: color .2s ease-in-out, background .2s ease-in-out; }
        .vault-reveal:hover { color: inherit; }
        .vault-reveal:focus-visible { outline: 1px solid var(--vault-accent); }
        .vault-reveal svg { display: block; }
        .vault-error { min-height: 18px; margin-top: 8px; font-size: 12px; color: #b3261e; }
        .night .vault-error { color: #f2b8b5; }
        .vault-warn { color: #8a3b12; }
        .night .vault-warn { color: #e0b48c; }
        .vault-go { margin-top: 14px; padding: 10px 26px;
            border: 1px solid var(--vault-accent); border-radius: 3px;
            background: var(--vault-accent); color: var(--vault-accent-text);
            font-family: inherit; font-size: 13px; letter-spacing: .04em; cursor: pointer;
            transition: opacity .2s ease-in-out, transform .2s ease-in-out; }
        .vault-go:hover { opacity: .85; }
        .vault-go:active { transform: scale(.98); }
        .vault-go:focus-visible { outline: 1px solid var(--vault-muted); outline-offset: 2px; }
        .vault-status { position: fixed; right: 16px; bottom: 44px; z-index: 2147482000;
            font-family: Menlo, 'Roboto Mono', 'Noto Sans', sans-serif; font-size: 11px;
            color: rgba(0, 0, 0, .54); pointer-events: none;
            transition: opacity .3s ease-in-out; }
        .night .vault-status { color: rgba(255, 255, 255, .54); }
        /* F-settings: lives in the panel's Notes file section — static flow,
           NOT the old viewport-fixed bottom bar (that floated over the
           panel's Shortcuts section as unstyled ".md .html import" text).
           The button look is owned by the panel sheet (.mfk-settings-notes-actions). */
        .vault-actions { display: flex; gap: 8px; font-size: 11px;
            transition: opacity .3s ease-in-out; }
        .vault-actions.vault-hidden { opacity: 0; pointer-events: none; }
        /* F2 sync notice: plain text, top far right, no background */
        .vault-sync-notice { position: fixed; top: 10px; right: 16px; z-index: 2147482000;
            font-family: Menlo, 'Roboto Mono', 'Noto Sans', sans-serif; font-size: 11px;
            color: rgba(0, 0, 0, .54); cursor: default; user-select: none;
            transition: opacity .4s ease-in-out; }
        .night .vault-sync-notice { color: rgba(255, 255, 255, .54); }
        .vault-sync-notice__close { cursor: pointer; padding-left: 6px; }
        .vault-sync-notice__close:hover { color: inherit; }
        .vault-sync-notice--fade { opacity: 0; }
        /* unlock transition: the overlay dissolves while the article fades in
           via m.css's own "body article { transition: opacity .2s }" rule —
           the same feel as the hide/unhide toggle */
        .vault-overlay--dissolve { opacity: 0; pointer-events: none;
            transition: opacity .2s ease-in-out; }
        @media (prefers-reduced-motion: reduce) {
            .vault-overlay, .vault-card { animation: none; }
            .vault-overlay *, .vault-status, .vault-sync-notice { transition: none !important; }
        }
    `;

    static EYE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    static EYE_OFF = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    ensureStyles() {
        if (document.getElementById('vault-styles')) return;
        const style = document.createElement('style');
        style.id = 'vault-styles';
        style.textContent = Vault.STYLE_SHEET;
        document.head.appendChild(style);
    }

    overlayEl() {
        if (!this.overlay) {
            this.ensureStyles();
            this.overlay = document.createElement('div');
            this.overlay.className = 'vault-overlay';
            this.overlay.appendChild(document.createElement('div')).className = 'vault-card';
            document.body.appendChild(this.overlay);
        }
        return this.overlay.querySelector('.vault-card');
    }

    /** Wire a reveal (eye) button to its passphrase input. */
    attachReveal(card) {
        card.querySelectorAll('.vault-reveal').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = card.querySelector('#' + btn.dataset.reveal);
                if (!input) return;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.setAttribute('aria-pressed', String(show));
                btn.setAttribute('aria-label', show ? 'Hide passphrase' : 'Show passphrase');
                btn.innerHTML = show ? Vault.EYE_OFF : Vault.EYE;
            });
        });
    }

    removeOverlay() {
        this.overlay && this.overlay.remove();
        this.overlay = null;
    }

    renderStatus(status) {
        if (!this.editor) return;
        let pill = document.querySelector('.vault-status');
        if (!pill) {
            pill = document.createElement('div');
            pill.className = 'vault-status';
            document.body.appendChild(pill);
        }
        pill.textContent = status === 'saving' ? 'saving…'
            : status === 'saved' ? 'saved ✓'
            : status === 'error' ? 'sync error' : '';
    }

    renderSetup() {
        const card = this.overlayEl();
        // keep the editor locked while the passphrase is being chosen
        const lockArticle = document.querySelector('article.fk-editable');
        lockArticle && (lockArticle.setAttribute('contenteditable', 'false'), lockArticle.style.opacity = '0');
        card.innerHTML = `
            <h1>Mindful</h1>
            <p>Set a passphrase to encrypt your notes. They are stored
            encrypted (AES-GCM) and unlocked with this passphrase in every
            new tab, for the whole browser session.</p>
            <p class="vault-warn">There is <strong>no recovery</strong>: if you
            forget the passphrase, the notes cannot be decrypted — by you or by
            anyone else.</p>
            <div class="vault-field">
                <input type="password" id="vault-pass" placeholder="passphrase (min. 8 chars)" autocomplete="new-password">
                <button type="button" class="vault-reveal" data-reveal="vault-pass" aria-label="Show passphrase" aria-pressed="false">${Vault.EYE}</button>
            </div>
            <div class="vault-field">
                <input type="password" id="vault-pass2" placeholder="repeat passphrase" autocomplete="new-password">
            </div>
            <div class="vault-error" id="vault-error"></div>
            <button type="button" class="vault-go" id="vault-setup">Encrypt &amp; start</button>`;
        this.attachReveal(card);
        const pass = card.querySelector('#vault-pass');
        const pass2 = card.querySelector('#vault-pass2');
        const err = card.querySelector('#vault-error');
        const article = document.querySelector('article.fk-editable');
        card.querySelector('#vault-setup').addEventListener('click', async () => {
            err.textContent = '';
            if (pass.value.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
            if (pass.value !== pass2.value) { err.textContent = 'Passphrases do not match.'; return; }
            await this.setup(pass.value, article ? article.innerHTML : '');
            pass.value = pass2.value = '';
            this.afterUnlock();
            article && article.focus();
        });
        pass.focus();
    }

    renderLockScreen() {
        this.hideActions();
        const article = document.querySelector('article.fk-editable');
        article && (article.setAttribute('contenteditable', 'false'), article.style.opacity = '0');
        const card = this.overlayEl();
        card.innerHTML = `
            <h1>Mindful</h1>
            <p>Locked. Enter the passphrase to decrypt your notes.</p>
            <div class="vault-field">
                <input type="password" id="vault-pass" placeholder="passphrase" autocomplete="current-password">
                <button type="button" class="vault-reveal" data-reveal="vault-pass" aria-label="Show passphrase" aria-pressed="false">${Vault.EYE}</button>
            </div>
            <div class="vault-error" id="vault-error"></div>
            <button type="button" class="vault-go" id="vault-unlock">Unlock</button>`;
        this.attachReveal(card);
        const pass = card.querySelector('#vault-pass');
        const err = card.querySelector('#vault-error');
        const attempt = async () => {
            err.textContent = '';
            try {
                await this.unlock(pass.value);
                pass.value = '';
                this.afterUnlock();
                const content = await this.load();
                const article = document.querySelector('article.fk-editable');
                if (content !== null && content !== undefined && article && article.innerHTML !== content) {
                    article.innerHTML = content;
                }
                article && article.focus();
                this.armAutoLock();
                content && this.snapshot(content);
            } catch (e) {
                err.textContent = 'Wrong passphrase.';
            }
        };
        this.overlay.querySelector('#vault-unlock').addEventListener('click', attempt);
        pass.addEventListener('keydown', ev => { if (ev.key === 'Enter') attempt(); });
        pass.focus();
    }
}
