/* WonderTech Pulse — IndexedDB engine + Persistent Storage manager
 * Works in window, service worker and Node (with fake-indexeddb) contexts.
 *
 * Stores
 *   articles_feed       news / tech-alert articles           (transient: pruned after retention window unless flagged / annotated)
 *   patch_notes         hotfixes, service packs, drivers     (kept permanently)
 *   cisa_advisories     CVE / CISA ICS-CERT advisories       (kept permanently)
 *   bookmarks_and_read  per-record state: flag, read, note   (kept permanently)
 *   sync_audit_log      sync / retention / import history    (pruned after retention window)
 *   meta                settings, feed list, counters
 */
(function (root) {
  'use strict';

  const DB_NAME = 'wondertech-pulse';
  const DB_VERSION = 1;
  const DAY = 86400000;

  const STORES = Object.freeze({
    ARTICLES: 'articles_feed',
    PATCHES: 'patch_notes',
    ADVISORIES: 'cisa_advisories',
    STATE: 'bookmarks_and_read',
    AUDIT: 'sync_audit_log',
    META: 'meta'
  });
  const KIND_STORE = Object.freeze({ article: STORES.ARTICLES, patch: STORES.PATCHES, advisory: STORES.ADVISORIES });
  const STORE_KIND = Object.freeze({ [STORES.ARTICLES]: 'article', [STORES.PATCHES]: 'patch', [STORES.ADVISORIES]: 'advisory' });
  const CONTENT_STORES = [STORES.ARTICLES, STORES.PATCHES, STORES.ADVISORIES];

  const DEFAULT_SETTINGS = Object.freeze({
    retentionDays: 1095,      // 3 years
    corsProxy: '',
    bannerDismissed: false,
    layout: 'list',           // 'list' (compact table) | 'cards'
    assumedNewRecordsPerDay: 25
  });

  let dbPromise = null;

  /* ---------------------------- core helpers ---------------------------- */

  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('IndexedDB is not available in this context')); return; }
      const req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction;
        const make = (name, opts, indexes) => {
          const store = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, opts);
          (indexes || []).forEach(([iname, kp, o]) => {
            if (!store.indexNames.contains(iname)) store.createIndex(iname, kp, o || {});
          });
        };
        make(STORES.ARTICLES, { keyPath: 'id' }, [
          ['timestamp', 'timestamp'], ['severity', 'severity'], ['category', 'category'],
          ['component', 'component'], ['tags', 'tags', { multiEntry: true }]
        ]);
        make(STORES.PATCHES, { keyPath: 'id' }, [
          ['timestamp', 'timestamp'], ['component', 'component'], ['kb', 'kb'],
          ['severity', 'severity'], ['category', 'category']
        ]);
        make(STORES.ADVISORIES, { keyPath: 'id' }, [
          ['timestamp', 'timestamp'], ['cvss', 'cvss'], ['cveId', 'cveId'],
          ['severity', 'severity'], ['component', 'component']
        ]);
        make(STORES.STATE, { keyPath: 'refId' }, [['updatedAt', 'updatedAt'], ['kind', 'kind']]);
        make(STORES.AUDIT, { keyPath: 'id', autoIncrement: true }, [['timestamp', 'timestamp'], ['type', 'type']]);
        make(STORES.META, { keyPath: 'key' }, []);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database upgrade blocked by another open tab'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  async function withTx(storeNames, mode, fn) {
    const db = await open();
    const names = [].concat(storeNames);
    const tx = db.transaction(names, mode);
    const stores = {};
    names.forEach((n) => { stores[n] = tx.objectStore(n); });
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
    let out;
    try {
      out = await fn(stores, tx);
    } catch (err) {
      done.catch(() => {});
      try { tx.abort(); } catch (_) {}
      throw err;
    }
    await done;
    return out;
  }

  const all = (store) => withTx(store, 'readonly', (s) => reqP(s[store].getAll()));
  const get = (store, key) => withTx(store, 'readonly', (s) => reqP(s[store].get(key)));
  const count = (store) => withTx(store, 'readonly', (s) => reqP(s[store].count()));
  const put = (store, record) => withTx(store, 'readwrite', (s) => reqP(s[store].put(record)));
  const remove = (store, key) => withTx(store, 'readwrite', (s) => reqP(s[store].delete(key)));

  /* ----------------------------- meta / settings ----------------------------- */

  async function getMeta(key, fallback) {
    const rec = await get(STORES.META, key);
    return rec && rec.value !== undefined ? rec.value : fallback;
  }
  async function setMeta(key, value) {
    await put(STORES.META, { key, value, updatedAt: Date.now() });
    return value;
  }
  async function getSettings() {
    const s = await getMeta('settings', {});
    return Object.assign({}, DEFAULT_SETTINGS, s);
  }
  async function setSettings(patch) {
    const next = Object.assign({}, await getSettings(), patch);
    await setMeta('settings', next);
    return next;
  }

  /* ------------------------------ content records ------------------------------ */

  function storeForRecord(rec) {
    return KIND_STORE[rec.kind] || STORES.ARTICLES;
  }

  /** Insert or update content records, routed to the right store by `kind`. */
  async function upsertContent(records, opts) {
    const onlyNew = !!(opts && opts.onlyNew);
    const groups = { [STORES.ARTICLES]: [], [STORES.PATCHES]: [], [STORES.ADVISORIES]: [] };
    (records || []).forEach((r) => {
      if (!r || !r.id) return;
      const store = storeForRecord(r);
      groups[store].push(Object.assign({}, r, { kind: STORE_KIND[store] }));
    });
    return withTx(CONTENT_STORES, 'readwrite', async (st) => {
      let added = 0, updated = 0;
      for (const name of CONTENT_STORES) {
        if (!groups[name].length) continue;
        const existing = new Set(await reqP(st[name].getAllKeys()));
        for (const rec of groups[name]) {
          if (existing.has(rec.id)) {
            if (onlyNew) continue;
            updated++;
          } else {
            added++;
          }
          st[name].put(rec);
        }
      }
      return { added, updated };
    });
  }

  /** Remove content records matching a predicate (and their non-flagged state rows). */
  async function deleteWhere(predicate) {
    return withTx([...CONTENT_STORES, STORES.STATE], 'readwrite', async (st) => {
      const states = new Map((await reqP(st[STORES.STATE].getAll())).map((x) => [x.refId, x]));
      let removed = 0;
      for (const name of CONTENT_STORES) {
        const recs = await reqP(st[name].getAll());
        for (const r of recs) {
          if (!predicate(r)) continue;
          st[name].delete(r.id);
          removed++;
          const s = states.get(r.id);
          if (s && !s.bookmarked && !(s.note && s.note.trim())) st[STORES.STATE].delete(r.id);
        }
      }
      return removed;
    });
  }

  /** Everything the UI needs in one read. */
  async function snapshot() {
    const [articles, patches, advisories, stateRows] = await withTx(
      [...CONTENT_STORES, STORES.STATE], 'readonly',
      (st) => Promise.all([
        reqP(st[STORES.ARTICLES].getAll()),
        reqP(st[STORES.PATCHES].getAll()),
        reqP(st[STORES.ADVISORIES].getAll()),
        reqP(st[STORES.STATE].getAll())
      ])
    );
    const items = []
      .concat(articles.map((r) => Object.assign({}, r, { kind: 'article' })))
      .concat(patches.map((r) => Object.assign({}, r, { kind: 'patch' })))
      .concat(advisories.map((r) => Object.assign({}, r, { kind: 'advisory' })));
    const states = {};
    stateRows.forEach((s) => { states[s.refId] = s; });
    return { items, states };
  }

  /** "Critical" = critical severity, or a high-severity record in the Critical Security Patch category. */
  const isCritical = (rec) => rec.severity === 'critical' || (rec.category === 'Critical Security Patch' && rec.severity === 'high');

  async function countUnreviewedCritical() {
    const snap = await snapshot();
    return snap.items.filter((i) => isCritical(i) && !(snap.states[i.id] && snap.states[i.id].read)).length;
  }

  /* ----------------------------- bookmarks / read state ----------------------------- */

  async function getState(refId) { return get(STORES.STATE, refId); }

  async function setState(refId, patch) {
    return withTx(STORES.STATE, 'readwrite', async (st) => {
      const cur = (await reqP(st[STORES.STATE].get(refId))) || {
        refId, kind: null, bookmarked: false, read: false, note: '', remediation: null,
        bookmarkedAt: null, readAt: null, createdAt: Date.now()
      };
      const next = Object.assign({}, cur, patch, { refId, updatedAt: Date.now() });
      if ('bookmarked' in patch) next.bookmarkedAt = patch.bookmarked ? (cur.bookmarkedAt || Date.now()) : null;
      if ('read' in patch) next.readAt = patch.read ? Date.now() : null;
      await reqP(st[STORES.STATE].put(next));
      return next;
    });
  }

  async function setStateMany(refIds, patch) {
    return withTx(STORES.STATE, 'readwrite', async (st) => {
      for (const refId of refIds) {
        const cur = (await reqP(st[STORES.STATE].get(refId))) || {
          refId, kind: null, bookmarked: false, read: false, note: '', remediation: null,
          bookmarkedAt: null, readAt: null, createdAt: Date.now()
        };
        const next = Object.assign({}, cur, patch, { refId, updatedAt: Date.now() });
        if ('read' in patch) next.readAt = patch.read ? Date.now() : null;
        st[STORES.STATE].put(next);
      }
      return refIds.length;
    });
  }

  /* ------------------------------- audit log ------------------------------- */

  async function log(type, message, detail, ok) {
    return put(STORES.AUDIT, {
      timestamp: Date.now(), type, message: String(message || ''),
      detail: detail || null, ok: ok !== false
    });
  }

  async function getLog(limit) {
    const max = limit || 50;
    return withTx(STORES.AUDIT, 'readonly', (st) => new Promise((resolve, reject) => {
      const rows = [];
      const cur = st[STORES.AUDIT].index('timestamp').openCursor(null, 'prev');
      cur.onsuccess = () => {
        const c = cur.result;
        if (c && rows.length < max) { rows.push(c.value); c.continue(); } else resolve(rows);
      };
      cur.onerror = () => reject(cur.error);
    }));
  }

  /* ------------------------------ data lifecycle ------------------------------ */

  /**
   * Retention policy
   *  - articles_feed: delete when older than the retention window UNLESS flagged or carrying an engineer note
   *  - patch_notes / cisa_advisories / bookmarks_and_read: never pruned
   *  - sync_audit_log: delete entries older than the retention window
   */
  async function pruneRetention(opts) {
    const settings = await getSettings();
    const days = (opts && opts.days) || settings.retentionDays || 1095;
    const cutoff = Date.now() - days * DAY;
    const result = await withTx([STORES.ARTICLES, STORES.STATE, STORES.AUDIT], 'readwrite', async (st) => {
      const states = new Map((await reqP(st[STORES.STATE].getAll())).map((x) => [x.refId, x]));
      const arts = await reqP(st[STORES.ARTICLES].getAll());
      let removedArticles = 0, preserved = 0;
      for (const a of arts) {
        if (a.timestamp >= cutoff) continue;
        const s = states.get(a.id);
        if (s && (s.bookmarked || (s.note && s.note.trim()))) { preserved++; continue; }
        st[STORES.ARTICLES].delete(a.id);
        if (s) st[STORES.STATE].delete(a.id);
        removedArticles++;
      }
      let removedLog = 0;
      await new Promise((resolve, reject) => {
        const cur = st[STORES.AUDIT].index('timestamp').openCursor(IDBKeyRange.upperBound(cutoff));
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { c.delete(); removedLog++; c.continue(); } else resolve();
        };
        cur.onerror = () => reject(cur.error);
      });
      return { removedArticles, removedLog, preserved, cutoff, days };
    });
    await setMeta('lastPrune', { at: Date.now(), removedArticles: result.removedArticles, removedLog: result.removedLog, preserved: result.preserved });
    return result;
  }

  async function clearStores(names) {
    return withTx(names, 'readwrite', (st) => Promise.all(names.map((n) => reqP(st[n].clear()))));
  }

  async function counts() {
    const out = {};
    for (const n of [STORES.ARTICLES, STORES.PATCHES, STORES.ADVISORIES, STORES.STATE, STORES.AUDIT]) out[n] = await count(n);
    return out;
  }

  /* ------------------------------ storage manager ------------------------------ */

  async function storageStatus() {
    const nav = root.navigator;
    const out = { supported: !!(nav && nav.storage), persisted: false, usage: 0, quota: 0, usageDetails: null };
    if (!out.supported) return out;
    try { if (nav.storage.persisted) out.persisted = await nav.storage.persisted(); } catch (_) {}
    try {
      const e = await nav.storage.estimate();
      out.usage = e.usage || 0;
      out.quota = e.quota || 0;
      out.usageDetails = e.usageDetails || null;
    } catch (_) {}
    return out;
  }

  async function requestPersistence() {
    const nav = root.navigator;
    if (!nav || !nav.storage || !nav.storage.persist) return { supported: false, granted: false };
    try {
      let granted = nav.storage.persisted ? await nav.storage.persisted() : false;
      if (!granted) granted = await nav.storage.persist();
      await setMeta('persistRequestedAt', Date.now());
      return { supported: true, granted: !!granted };
    } catch (err) {
      return { supported: true, granted: false, error: err.message };
    }
  }

  /** Estimates database growth over a 3-year horizon. */
  async function projection(horizonDays) {
    const days = horizonDays || 1095;
    const settings = await getSettings();
    const snap = await snapshot();
    const json = JSON.stringify(snap.items) + JSON.stringify(Object.values(snap.states));
    const bytes = new TextEncoder().encode(json).length;
    const records = snap.items.length;
    const avgBytes = records ? Math.round(bytes / records) : 2048;
    const growth = avgBytes * settings.assumedNewRecordsPerDay * days;
    const status = await storageStatus();
    const projectedBytes = Math.max(status.usage, bytes) + growth;
    return {
      records, dataBytes: bytes, avgBytes, perDay: settings.assumedNewRecordsPerDay,
      horizonDays: days, growthBytes: growth, projectedBytes,
      safe: status.quota ? projectedBytes < status.quota * 0.5 : null
    };
  }

  /* ------------------------------- backup / restore ------------------------------- */

  async function exportAll() {
    const [articles, patches, advisories, states, audit, feeds, settings] = await Promise.all([
      all(STORES.ARTICLES), all(STORES.PATCHES), all(STORES.ADVISORIES), all(STORES.STATE), all(STORES.AUDIT),
      getMeta('feeds', []), getSettings()
    ]);
    return {
      schema: 'wondertech-pulse/1',
      exportedAt: new Date().toISOString(),
      articles_feed: articles,
      patch_notes: patches,
      cisa_advisories: advisories,
      bookmarks_and_read: states,
      sync_audit_log: audit,
      meta: { feeds, settings }
    };
  }

  async function importBackup(obj) {
    if (!obj || typeof obj.schema !== 'string' || obj.schema.indexOf('wondertech-pulse/') !== 0) {
      throw new Error('Not a WonderTech Pulse backup file');
    }
    const records = []
      .concat((obj.articles_feed || []).map((r) => Object.assign({}, r, { kind: 'article' })))
      .concat((obj.patch_notes || []).map((r) => Object.assign({}, r, { kind: 'patch' })))
      .concat((obj.cisa_advisories || []).map((r) => Object.assign({}, r, { kind: 'advisory' })));
    const res = await upsertContent(records);
    let statesMerged = 0;
    await withTx(STORES.STATE, 'readwrite', async (st) => {
      for (const s of obj.bookmarks_and_read || []) {
        if (!s || !s.refId) continue;
        const cur = await reqP(st[STORES.STATE].get(s.refId));
        if (!cur || (s.updatedAt || 0) > (cur.updatedAt || 0)) { st[STORES.STATE].put(s); statesMerged++; }
      }
    });
    if (obj.meta && Array.isArray(obj.meta.feeds)) {
      const cur = await getMeta('feeds', []);
      const ids = new Set(cur.map((f) => f.id));
      obj.meta.feeds.forEach((f) => { if (f && f.id && !ids.has(f.id)) cur.push(f); });
      await setMeta('feeds', cur);
    }
    return { added: res.added, updated: res.updated, statesMerged };
  }

  root.WTP_DB = {
    NAME: DB_NAME, VERSION: DB_VERSION, STORES, KIND_STORE, STORE_KIND, DAY, DEFAULT_SETTINGS,
    open, all, get, put, remove, count, counts,
    getMeta, setMeta, getSettings, setSettings,
    upsertContent, deleteWhere, snapshot, isCritical, countUnreviewedCritical,
    getState, setState, setStateMany,
    log, getLog, pruneRetention, clearStores,
    storageStatus, requestPersistence, projection,
    exportAll, importBackup
  };
})(typeof self !== 'undefined' ? self : globalThis);
