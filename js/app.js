/* WonderTech Pulse — main controller: router, filters, rendering, dialogs, export, import, badging */
(function () {
  'use strict';

  const DB = window.WTP_DB;
  const FEEDS = window.WTP_FEEDS;
  const PWA = window.WTP_PWA;

  /* ------------------------------ helpers ------------------------------ */

  const $ = (sel, rootEl) => (rootEl || document).querySelector(sel);
  const $$ = (sel, rootEl) => Array.from((rootEl || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtDateTime = (ts) => new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtBytes = (n) => {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const v = n / Math.pow(1024, i);
    return (v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)) + ' ' + u[i];
  };
  const ago = (ts) => {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  };

  const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const SEV_LABEL = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW', info: 'INFO' };
  const REMEDIATION = [['open', 'Open'], ['mitigated', 'Mitigated'], ['patched', 'Patched'], ['not-affected', 'Not affected']];
  const KIND_LABEL = { article: 'Article', patch: 'Patch / release', advisory: 'CISA / CVE' };
  const VIEWS = {
    feed: { title: 'Intelligence Feed', filters: true },
    critical: { title: 'Critical Advisories', filters: true },
    matrix: { title: 'Patch Matrix', filters: true },
    cisa: { title: 'CISA ICS-CERT & CVE Tracker', filters: true },
    flagged: { title: 'Shutdown Plan — Flagged Items', filters: true },
    sources: { title: 'Sources & Import', filters: false },
    storage: { title: 'Storage & Sync', filters: false }
  };

  /* -------------------------------- state -------------------------------- */

  const S = {
    items: [], states: {}, feeds: [], settings: {}, lastSync: null,
    view: 'feed', selectedId: null,
    f: { q: '', component: '', category: '', severity: '', status: 'all', sort: 'date-desc' },
    hay: new Map(), syncing: false, storage: null, swReady: false, dialogItemId: null
  };

  const isCritical = DB.isCritical;
  const st = (id) => S.states[id] || {};
  const unreviewedCritical = () => S.items.filter((i) => isCritical(i) && !st(i.id).read).length;

  /* -------------------------------- toasts -------------------------------- */

  function toast(msg, kind, opts) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    if (opts && opts.action) {
      const b = document.createElement('button');
      b.className = 'btn btn-accent';
      b.textContent = opts.action.label;
      b.addEventListener('click', () => { opts.action.run(); el.remove(); });
      el.appendChild(b);
    }
    $('#toasts').appendChild(el);
    const ttl = (opts && opts.sticky) ? 0 : (kind === 'err' ? 8000 : 4500);
    if (ttl) setTimeout(() => el.remove(), ttl);
    return el;
  }

  /* ------------------------------ data loading ------------------------------ */

  async function refresh(keepScroll) {
    const y = window.scrollY;
    const [snap, feeds, settings, lastSync] = await Promise.all([
      DB.snapshot(), DB.getMeta('feeds', []), DB.getSettings(), DB.getMeta('lastSync', null)
    ]);
    S.items = snap.items; S.states = snap.states; S.feeds = feeds; S.settings = settings; S.lastSync = lastSync;
    S.hay = new Map();
    render();
    updateBadge();
    if (keepScroll) window.scrollTo(0, y);
  }

  function updateBadge() {
    const n = unreviewedCritical();
    PWA.setBadge(n);
    document.title = (n ? '(' + n + ') ' : '') + 'WonderTech Pulse';
  }

  /* --------------------------- filtering & sorting --------------------------- */

  function haystack(it) {
    let h = S.hay.get(it.id);
    if (!h) {
      h = [it.title, it.summary, it.body, it.component, it.category, it.severity, it.kb, it.cveId, it.fixedIn, it.source,
        it.releaseType, (it.versions || []).join(' '), (it.tags || []).join(' '), st(it.id).note || ''].join(' ').toLowerCase();
      S.hay.set(it.id, h);
    }
    return h;
  }

  function applyFilters(list, view) {
    const f = S.f;
    const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = list.filter((it) => {
      if (f.component && it.component !== f.component) return false;
      if (f.category && it.category !== f.category) return false;
      if (f.severity && it.severity !== f.severity) return false;
      const read = !!st(it.id).read;
      if (f.status === 'unread' && read) return false;
      if (f.status === 'read' && !read) return false;
      if (terms.length) {
        const h = haystack(it);
        for (const t of terms) if (h.indexOf(t) === -1) return false;
      }
      return true;
    });
    const byDate = (a, b) => b.timestamp - a.timestamp;
    out.sort((a, b) => {
      if (view === 'critical' && f.sort === 'date-desc') {
        const ua = st(a.id).read ? 1 : 0, ub = st(b.id).read ? 1 : 0;
        if (ua !== ub) return ua - ub;
        return (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || byDate(a, b);
      }
      switch (f.sort) {
        case 'date-asc': return a.timestamp - b.timestamp;
        case 'severity': return (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || byDate(a, b);
        case 'component': return a.component.localeCompare(b.component) || byDate(a, b);
        default: return byDate(a, b);
      }
    });
    return out;
  }

  function listForView(view) {
    let list = S.items;
    if (view === 'critical') list = list.filter(isCritical);
    else if (view === 'matrix') list = list.filter((i) => i.kind === 'patch');
    else if (view === 'cisa') list = list.filter((i) => i.kind === 'advisory');
    else if (view === 'flagged') list = list.filter((i) => st(i.id).bookmarked);
    return applyFilters(list, view);
  }

  /* -------------------------------- renderers -------------------------------- */

  function badge(cls, text) { return '<span class="badge ' + cls + '">' + esc(text) + '</span>'; }
  function sevBadge(sev) { return badge('sev-' + sev, SEV_LABEL[sev] || String(sev).toUpperCase()); }
  function versionChips(arr, max) {
    const list = (arr || []).slice(0, max || 4);
    return list.map((v) => '<span class="vchip">' + esc(v) + '</span>').join('') + ((arr || []).length > list.length ? '<span class="vchip">+' + ((arr || []).length - list.length) + '</span>' : '');
  }
  function cvssClass(v) { return v >= 9 ? 'c' : v >= 7 ? 'h' : v >= 4 ? 'm' : 'l'; }
  function starBtn(it) {
    const on = !!st(it.id).bookmarked;
    return '<button class="icon-btn" data-action="toggle-bm" data-id="' + esc(it.id) + '" aria-pressed="' + on + '" title="' + (on ? 'Remove from shutdown plan' : 'Flag for shutdown plan') + '" aria-label="Flag for shutdown plan"><svg class="i"><use href="#i-star"/></svg></button>';
  }
  function readBtn(it) {
    const on = !!st(it.id).read;
    return '<button class="icon-btn" data-action="toggle-read" data-id="' + esc(it.id) + '" aria-pressed="' + on + '" title="' + (on ? 'Mark as unreviewed' : 'Mark as reviewed') + '" aria-label="Toggle reviewed"><svg class="i"><use href="#i-check"/></svg></button>';
  }

  function cardHtml(it) {
    const s = st(it.id);
    return '<article class="card sev-' + esc(it.severity) + (s.read ? '' : ' unread') + '" data-action="open" data-id="' + esc(it.id) + '" tabindex="0" role="button" aria-label="' + esc(it.title) + '">' +
      '<div class="card-top">' + sevBadge(it.severity) + badge('comp', it.component) + badge('', it.category) +
      (it.seed ? badge('seed', 'SEED') : '') + '<span class="time">' + fmtDate(it.timestamp) + '</span></div>' +
      '<h3>' + esc(it.title) + '</h3>' +
      '<p>' + esc(it.summary) + '</p>' +
      '<div class="card-foot">' + (it.cveId ? '<span class="vchip">' + esc(it.cveId) + '</span>' : '') +
      versionChips(it.versions, 3) + '<span class="spacer"></span>' + readBtn(it) + starBtn(it) + '</div>' +
      '</article>';
  }

  function emptyHtml(msg) { return '<div class="empty">' + msg + '</div>'; }

  function statsHtml() {
    const flagged = S.items.filter((i) => st(i.id).bookmarked).length;
    const unread = S.items.filter((i) => !st(i.id).read).length;
    return '<div class="stats">' +
      '<div class="stat red"><div class="n">' + unreviewedCritical() + '</div><div class="l">Unreviewed critical</div></div>' +
      '<div class="stat amber"><div class="n">' + flagged + '</div><div class="l">Flagged for shutdown</div></div>' +
      '<div class="stat cyan"><div class="n">' + unread + '</div><div class="l">Unreviewed total</div></div>' +
      '<div class="stat"><div class="n">' + S.items.length + '</div><div class="l">Records offline</div></div>' +
      '<div class="stat"><div class="n" style="font-size:16px;padding-top:6px">' + esc(ago(S.lastSync)) + '</div><div class="l">Last sync</div></div>' +
      '</div>';
  }

  function viewHead(title, extra) {
    return '<div class="view-head"><h1>' + esc(title) + '</h1><span class="spacer"></span>' + (extra || '') + '</div>';
  }

  function renderFeed(list) {
    return statsHtml() + (list.length ? '<div class="cards">' + list.map(cardHtml).join('') + '</div>' : emptyHtml('No records match the current filters.'));
  }

  function renderCritical(list) {
    const unread = list.filter((i) => !st(i.id).read).length;
    const head = viewHead('Critical Advisories', unread ? '<button class="btn" data-action="mark-all-critical"><svg class="i"><use href="#i-check"/></svg><span class="btn-label">Mark all reviewed</span></button>' : '');
    const intro = '<p class="muted" style="margin:0 0 12px">Critical-severity records and high-severity security patches. Unreviewed items are listed first and counted on the app icon badge.</p>';
    return head + intro + (list.length ? '<div class="cards">' + list.map(cardHtml).join('') + '</div>' : emptyHtml('No critical advisories match the current filters. 🎉'));
  }

  function renderMatrix(list) {
    if (!list.length) return viewHead('Patch Matrix') + emptyHtml('No patch or release records match the current filters.');
    let html = viewHead('Patch Matrix') + '<p class="muted" style="margin:0 0 4px">Releases, hotfixes and driver updates grouped by Wonderware component. Use the star to flag items for the next maintenance shutdown.</p>';
    FEEDS.COMPONENTS.forEach((comp) => {
      const rows = list.filter((p) => p.component === comp);
      if (!rows.length) return;
      html += '<h2 class="group-title">' + esc(comp) + badge('', rows.length + (rows.length === 1 ? ' release' : ' releases')) + '</h2>' +
        '<div class="table-wrap"><table><thead><tr><th>Release / hotfix</th><th>Type</th><th>Impacted versions</th><th>Fixed in</th><th>KB / tech note</th><th>Severity</th><th>Date</th><th>SHA-256</th><th></th></tr></thead><tbody>' +
        rows.map((p) => '<tr data-action="open" data-id="' + esc(p.id) + '">' +
          '<td><strong>' + esc(p.title) + '</strong>' + (p.seed ? ' ' + badge('seed', 'SEED') : '') + (st(p.id).read ? '' : ' <span class="warn" title="Unreviewed">●</span>') + '</td>' +
          '<td>' + esc(p.releaseType || p.category) + '</td>' +
          '<td>' + versionChips(p.versions, 4) + '</td>' +
          '<td>' + esc(p.fixedIn || '—') + '</td>' +
          '<td class="mono small">' + esc(p.kb || '—') + '</td>' +
          '<td>' + sevBadge(p.severity) + '</td>' +
          '<td class="small">' + fmtDate(p.timestamp) + '</td>' +
          '<td class="mono small">' + (p.checksum ? esc(String(p.checksum).slice(0, 16)) + '…' : '—') + '</td>' +
          '<td>' + starBtn(p) + '</td></tr>').join('') +
        '</tbody></table></div>';
    });
    const other = list.filter((p) => FEEDS.COMPONENTS.indexOf(p.component) === -1);
    if (other.length) html += '<h2 class="group-title">Other</h2><div class="cards">' + other.map(cardHtml).join('') + '</div>';
    return html;
  }

  function renderCisa(list) {
    if (!list.length) return viewHead('CISA ICS-CERT & CVE Tracker') + emptyHtml('No advisories match the current filters.');
    const open = list.filter((a) => (st(a.id).remediation || a.remediation || 'open') === 'open').length;
    return viewHead('CISA ICS-CERT & CVE Tracker', '<span class="muted">' + open + ' open · ' + (list.length - open) + ' tracked</span>') +
      '<div class="table-wrap"><table><thead><tr><th>CVE ID</th><th>Advisory</th><th>Component</th><th>CVSS</th><th>Remediation status</th><th>Published</th><th></th></tr></thead><tbody>' +
      list.map((a) => {
        const rem = st(a.id).remediation || a.remediation || 'open';
        return '<tr data-action="open" data-id="' + esc(a.id) + '">' +
          '<td class="mono small">' + esc(a.cveId || a.id) + (a.seed ? '<br>' + badge('seed', 'SEED') : '') + '</td>' +
          '<td><strong>' + esc(a.title) + '</strong><div class="muted small">' + esc((a.summary || '').slice(0, 130)) + (a.summary && a.summary.length > 130 ? '…' : '') + '</div></td>' +
          '<td>' + badge('comp', a.component) + '</td>' +
          '<td>' + (a.cvss != null ? '<span class="cvss ' + cvssClass(a.cvss) + '">' + Number(a.cvss).toFixed(1) + '</span>' : '—') + '</td>' +
          '<td>' + remediationSelect(a.id, rem) + '</td>' +
          '<td class="small">' + fmtDate(a.timestamp) + '</td>' +
          '<td>' + starBtn(a) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function remediationSelect(id, current) {
    return '<select data-remediation="' + esc(id) + '" aria-label="Remediation status">' +
      REMEDIATION.map(([v, l]) => '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  }

  function renderFlagged(list) {
    const head = viewHead('Shutdown Plan — Flagged Items',
      '<button class="btn btn-accent" data-action="open-export"><svg class="i"><use href="#i-share"/></svg><span class="btn-label">Export shutdown report</span></button>');
    const intro = '<p class="muted" style="margin:0 0 12px">Items you flagged for the next maintenance shutdown. Flagged items and their notes are never removed by the retention policy.</p>';
    if (!list.length) return head + intro + emptyHtml('Nothing flagged yet. Use the ★ on any card or table row to add it to the shutdown plan.');
    return head + intro + '<div class="cards">' + list.map((it) => {
      const note = st(it.id).note;
      return cardHtml(it).replace('</article>', (note ? '<div class="small" style="border-top:1px solid var(--line);padding-top:6px"><span class="muted">Note:</span> ' + esc(note.slice(0, 240)) + '</div>' : '') + '</article>');
    }).join('') + '</div>';
  }

  function renderSources() {
    const feedRows = S.feeds.length ? S.feeds.map((f) =>
      '<tr style="cursor:default"><td><strong>' + esc(f.name) + '</strong><div class="muted small mono" style="word-break:break-all">' + esc(f.url) + '</div></td>' +
      '<td>' + esc(f.component || 'Auto') + '</td>' +
      '<td class="small">' + (f.lastError ? '<span class="bad">' + esc(f.lastStatus) + ' — ' + esc(f.lastError) + '</span>' : esc(f.lastStatus || '—')) + '<div class="muted">' + esc(ago(f.lastSync || f.lastTry)) + '</div></td>' +
      '<td><label class="row" style="gap:6px"><input type="checkbox" data-feed-toggle="' + esc(f.id) + '"' + (f.enabled === false ? '' : ' checked') + '> on</label></td>' +
      '<td><button class="btn btn-danger" data-action="delete-feed" data-id="' + esc(f.id) + '">Remove</button></td></tr>').join('') :
      '<tr style="cursor:default"><td colspan="5" class="muted">No custom feeds yet. Add an RSS, Atom or JSON Feed URL, or import a file below.</td></tr>';

    return viewHead('Sources & Import', '<button class="btn btn-accent" data-action="add-feed"><svg class="i"><use href="#i-plus"/></svg><span class="btn-label">Add feed</span></button>') +
      '<div class="panel"><h2>Custom feeds (RSS / Atom / JSON Feed)</h2><div class="table-wrap" style="margin:0"><table><thead><tr><th>Feed</th><th>Component</th><th>Last sync</th><th>Enabled</th><th></th></tr></thead><tbody>' + feedRows + '</tbody></table></div>' +
      '<p class="muted small" style="margin-bottom:0">Feeds are fetched by Sync, by Periodic Background Sync (installed app) and when the device reconnects. New items are classified by component, category and severity automatically; the keyword classifier is a convenience — always read the source.</p></div>' +
      '<div class="panel-grid">' +
      '<div class="panel"><h2>Import a file or pasted feed</h2>' +
      '<p class="muted small">Accepts RSS / Atom XML, JSON Feed, WonderTech JSON reports and full backups.</p>' +
      '<label class="field">File<input type="file" id="importFile" accept=".json,.xml,.rss,.atom,.wtp,application/json,text/xml,application/xml"></label>' +
      '<label class="field">…or paste content<textarea id="importText" rows="5" placeholder="&lt;rss&gt;…  or  { &quot;items&quot;: [...] }"></textarea></label>' +
      '<div class="row"><button class="btn btn-accent" data-action="import-text">Import pasted content</button></div></div>' +
      '<div class="panel"><h2>Settings</h2>' +
      '<label class="field">CORS proxy prefix (optional)<input type="url" id="setProxy" placeholder="https://your-proxy.example/?url=" value="' + esc(S.settings.corsProxy || '') + '"></label>' +
      '<label class="field">Archive retention for transient articles (days)<input type="number" id="setRetention" min="30" max="3650" value="' + esc(S.settings.retentionDays) + '"></label>' +
      '<label class="field">Assumed new records per day (capacity projection)<input type="number" id="setRate" min="1" max="5000" value="' + esc(S.settings.assumedNewRecordsPerDay) + '"></label>' +
      '<div class="row"><button class="btn btn-accent" data-action="save-settings">Save settings</button></div></div></div>' +
      '<div class="panel"><h2>Authoritative sources to verify against</h2><ul style="margin:0;padding-left:18px;line-height:1.9">' +
      '<li><a href="https://www.aveva.com/en/support-and-success/cyber-security-updates/" target="_blank" rel="noopener noreferrer">AVEVA cyber security updates</a></li>' +
      '<li><a href="https://softwaresupportsp.aveva.com/" target="_blank" rel="noopener noreferrer">AVEVA Software Support portal</a></li>' +
      '<li><a href="https://www.cisa.gov/news-events/ics-advisories" target="_blank" rel="noopener noreferrer">CISA ICS advisories</a></li></ul></div>';
  }

  async function renderStorage() {
    const token = ++storageToken;
    const [status, proj, counts, log, lastPrune, createdAt] = await Promise.all([
      DB.storageStatus(), DB.projection(), DB.counts(), DB.getLog(40), DB.getMeta('lastPrune', null), DB.getMeta('createdAt', null)
    ]);
    if (token !== storageToken || S.view !== 'storage') return;
    S.storage = status;
    updateStorageChip();
    const pct = status.quota ? Math.max(0.5, Math.min(100, status.usage / status.quota * 100)) : 0;
    const projTxt = proj.safe === null ? 'unknown (quota not reported)' : (proj.safe ? 'safe' : 'AT RISK');
    const line = 'Persistent: ' + (status.persisted ? 'Active' : (status.supported ? 'Not granted' : 'Unsupported')) +
      ' | Quota: ' + fmtBytes(status.usage) + ' used of ' + (status.quota ? fmtBytes(status.quota) : 'unknown') +
      ' | Projected ' + Math.round(proj.horizonDays / 365) + '-yr capacity ' + projTxt;
    const caps = PWA.capabilities(status);
    const countRows = [['articles_feed', 'Articles (transient)'], ['patch_notes', 'Patch notes (permanent)'], ['cisa_advisories', 'CISA / CVE advisories (permanent)'],
      ['bookmarks_and_read', 'Flags, read state & notes (permanent)'], ['sync_audit_log', 'Sync audit log']].map(([k, l]) => '<dt>' + l + '</dt><dd class="mono">' + counts[k] + '</dd>').join('');

    $('#view').innerHTML = viewHead('Storage & Sync',
      '<button class="btn" data-action="sync"><svg class="i"><use href="#i-refresh"/></svg><span class="btn-label">Sync now</span></button>') +
      '<div class="panel"><h2>Storage inspector</h2>' +
      '<div class="inspector-line ' + (status.persisted ? 'ok' : 'warn') + '">' + esc(line) + '</div>' +
      '<div class="meter" role="img" aria-label="Storage used"><span style="width:' + pct + '%"></span></div>' +
      '<div class="row between small muted"><span>' + fmtBytes(status.usage) + ' used (origin total, includes app cache)</span><span>' + (status.quota ? fmtBytes(status.quota) + ' quota' : '') + '</span></div>' +
      '<dl class="kv" style="margin-top:10px">' +
      '<dt>Records</dt><dd>' + proj.records + ' · ≈ ' + fmtBytes(proj.dataBytes) + ' (avg ' + fmtBytes(proj.avgBytes) + ' each)</dd>' +
      '<dt>3-year projection</dt><dd>≈ ' + fmtBytes(proj.projectedBytes) + ' at ' + proj.perDay + ' new records/day — ' + projTxt + '</dd>' +
      '<dt>Archive created</dt><dd>' + (createdAt ? fmtDateTime(createdAt) : '—') + '</dd>' +
      '<dt>Retention window</dt><dd>' + S.settings.retentionDays + ' days (' + (S.settings.retentionDays / 365).toFixed(1) + ' years) for transient articles and the audit log</dd>' +
      '<dt>Last retention run</dt><dd>' + (lastPrune ? fmtDateTime(lastPrune.at) + ' — removed ' + lastPrune.removedArticles + ' article(s), ' + lastPrune.removedLog + ' log row(s), preserved ' + lastPrune.preserved + ' flagged/annotated' : 'not yet') + '</dd>' +
      '</dl>' +
      '<div class="row" style="margin-top:12px">' +
      (status.persisted ? '' : '<button class="btn btn-accent" data-action="request-persist">Request persistent storage</button>') +
      '<button class="btn" data-action="run-retention">Run retention now</button></div></div>' +
      '<div class="panel-grid">' +
      '<div class="panel"><h2>Local database</h2><dl class="kv">' + countRows + '</dl></div>' +
      '<div class="panel"><h2>PWA capabilities</h2><ul class="cap-list">' + caps.map((c) => '<li><span class="dot ' + c.state + '"></span><span><strong>' + esc(c.name) + '</strong><br><span class="muted small">' + esc(c.note) + '</span></span></li>').join('') + '</ul></div></div>' +
      '<div class="panel"><h2>Data lifecycle &amp; backup</h2>' +
      '<p class="muted small">Patch notes, advisories, flags and notes are kept permanently. Transient articles and audit rows older than the retention window are pruned unless flagged or annotated. Export a full backup regularly if this device is shared or reimaged.</p>' +
      '<div class="row"><button class="btn" data-action="backup-export"><svg class="i"><use href="#i-download"/></svg><span class="btn-label">Export full backup</span></button>' +
      '<label class="btn" style="cursor:pointer">Restore backup<input type="file" id="backupFile" accept=".json,.wtp,application/json" hidden></label>' +
      '<button class="btn" data-action="restore-seed">Restore seed dataset</button>' +
      '<button class="btn btn-danger" data-action="delete-seed">Delete seed records</button>' +
      '<button class="btn btn-danger" data-action="wipe-all">Wipe local database</button></div></div>' +
      '<div class="panel"><h2>Sync audit log (latest ' + log.length + ')</h2>' +
      (log.length ? '<div class="table-wrap" style="margin:0"><table><thead><tr><th>When</th><th>Type</th><th>Result</th></tr></thead><tbody>' +
        log.map((r) => '<tr style="cursor:default"><td class="small" style="white-space:nowrap">' + fmtDateTime(r.timestamp) + '</td><td class="mono small">' + esc(r.type) + '</td><td class="' + (r.ok ? '' : 'bad') + '">' + esc(r.message) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No activity yet.</p>') + '</div>';
  }
  let storageToken = 0;

  function render() {
    const v = S.view;
    renderNav();
    renderBanner();
    $('#filters').hidden = !VIEWS[v].filters;
    syncFilterControls();
    const el = $('#view');
    let html = '';
    const list = VIEWS[v].filters ? listForView(v) : [];
    if (VIEWS[v].filters) $('#resultCount').textContent = list.length + ' record' + (list.length === 1 ? '' : 's');
    switch (v) {
      case 'critical': html = renderCritical(list); break;
      case 'matrix': html = renderMatrix(list); break;
      case 'cisa': html = renderCisa(list); break;
      case 'flagged': html = renderFlagged(list); break;
      case 'sources': html = renderSources(); break;
      case 'storage': renderStorage().catch((e) => { el.innerHTML = emptyHtml('Could not read storage: ' + esc(e.message)); }); return;
      default: html = viewHead('Intelligence Feed') + renderFeed(list);
    }
    el.innerHTML = html;
    if (S.dialogItemId && $('#detail').open) renderDetail(S.dialogItemId);
  }

  function renderNav() {
    $$('.nav a').forEach((a) => {
      const on = a.dataset.view === S.view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const c = {
      feed: S.items.length,
      critical: unreviewedCritical(),
      matrix: S.items.filter((i) => i.kind === 'patch').length,
      cisa: S.items.filter((i) => i.kind === 'advisory').length,
      flagged: S.items.filter((i) => st(i.id).bookmarked).length
    };
    Object.keys(c).forEach((k) => {
      const el = $('[data-count="' + k + '"]');
      if (!el) return;
      el.textContent = c[k];
      el.hidden = c[k] === 0 && k !== 'feed';
    });
  }

  function renderBanner() {
    const b = $('#banner');
    const hasSeed = S.items.some((i) => i.seed);
    if (!hasSeed || S.settings.bannerDismissed) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = '<div><strong>Illustrative seed data.</strong> Records marked <span class="badge seed">SEED</span> demonstrate the data model and are <em>not</em> official bulletins. Add real feeds or import vendor/CISA data under Sources &amp; Import, then delete the seed records in Storage &amp; Sync. Always verify against AVEVA Security Central and CISA before acting.</div>' +
      '<button class="icon-btn" data-action="dismiss-banner" aria-label="Dismiss"><svg class="i"><use href="#i-x"/></svg></button>';
  }

  function syncFilterControls() {
    $$('[data-filter]').forEach((sel) => { sel.value = S.f[sel.dataset.filter]; });
    const q = $('#q');
    if (document.activeElement !== q) q.value = S.f.q;
  }

  function populateFilterOptions() {
    const fill = (name, values, labeler) => {
      const sel = $('[data-filter="' + name + '"]');
      values.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = labeler ? labeler(v) : v; sel.appendChild(o); });
    };
    fill('component', FEEDS.COMPONENTS);
    fill('category', FEEDS.CATEGORIES);
    fill('severity', FEEDS.SEVERITIES, (v) => SEV_LABEL[v]);
    const feedComp = $('#feedComponent');
    FEEDS.COMPONENTS.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; feedComp.appendChild(o); });
  }

  /* ------------------------------ detail dialog ------------------------------ */

  function renderDetail(id) {
    const it = S.items.find((i) => i.id === id);
    const body = $('#detailBody');
    if (!it) { body.innerHTML = '<p>Record not found.</p>'; return; }
    const s = st(id);
    const rows = [
      ['Type', KIND_LABEL[it.kind]],
      ['Component', it.component],
      ['Category', it.category],
      ['Severity', SEV_LABEL[it.severity] || it.severity],
      ['Published', fmtDate(it.timestamp)],
      it.cveId ? ['CVE ID', '<span class="mono">' + esc(it.cveId) + '</span>'] : null,
      it.cvss != null ? ['CVSS base score', '<span class="cvss ' + cvssClass(it.cvss) + '">' + Number(it.cvss).toFixed(1) + '</span>'] : null,
      it.kind === 'advisory' ? ['Remediation status', remediationSelect(id, s.remediation || it.remediation || 'open')] : null,
      it.releaseType ? ['Release type', esc(it.releaseType)] : null,
      it.kb ? ['KB / tech note', '<span class="mono">' + esc(it.kb) + '</span>'] : null,
      (it.versions && it.versions.length) ? ['Impacted versions', versionChips(it.versions, 20)] : null,
      it.fixedIn ? ['Fixed in', esc(it.fixedIn)] : null,
      it.kind === 'patch' ? ['SHA-256', it.checksum ? '<span class="mono small">' + esc(it.checksum) + '</span>' : '<span class="muted">Not recorded — copy it from the vendor download page into your note</span>'] : null,
      ['Source', esc(it.source || '—')],
      (it.tags && it.tags.length) ? ['Tags', it.tags.map((t) => '<span class="vchip">' + esc(t) + '</span>').join(' ')] : null,
      it.url ? ['Reference', /^https?:\/\//i.test(it.url) ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' + esc(it.url) + '</a>' : esc(it.url)] : null
    ].filter(Boolean);

    body.innerHTML =
      '<div class="dlg-head"><div style="flex:1"><div class="row" style="gap:6px;margin-bottom:6px">' + sevBadge(it.severity) + badge('comp', it.component) + (it.seed ? badge('seed', 'SEED — illustrative') : '') + '</div>' +
      '<h2 id="detailTitle">' + esc(it.title) + '</h2></div>' +
      '<button class="icon-btn" data-action="close-dialog" aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>' +
      '<p class="detail-text">' + esc(it.summary) + '</p>' +
      (it.body ? '<p class="detail-text">' + esc(it.body) + '</p>' : '') +
      '<dl class="dl">' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>').join('') + '</dl>' +
      '<label class="field">Engineering notes (saved offline; kept permanently)<textarea id="detailNote" data-note="' + esc(id) + '" rows="4" placeholder="Impact on our galaxy, test results, shutdown window, change ticket…">' + esc(s.note || '') + '</textarea></label>' +
      '<div class="dlg-actions">' +
      '<button class="btn ' + (s.bookmarked ? 'btn-accent' : '') + '" data-action="toggle-bm" data-id="' + esc(id) + '"><svg class="i"><use href="#i-star"/></svg><span class="btn-label">' + (s.bookmarked ? 'Flagged for shutdown' : 'Flag for shutdown plan') + '</span></button>' +
      '<button class="btn" data-action="toggle-read" data-id="' + esc(id) + '"><svg class="i"><use href="#i-check"/></svg><span class="btn-label">' + (s.read ? 'Mark unreviewed' : 'Mark reviewed') + '</span></button>' +
      '<button class="btn" data-action="share-item" data-id="' + esc(id) + '"><svg class="i"><use href="#i-share"/></svg><span class="btn-label">Share</span></button>' +
      '</div>';
  }

  async function openDetail(id) {
    S.dialogItemId = id;
    const it = S.items.find((i) => i.id === id);
    if (!it) return;
    renderDetail(id);
    const dlg = $('#detail');
    if (!dlg.open) dlg.showModal();
    if (!st(id).read) {
      S.states[id] = await DB.setState(id, { kind: it.kind, read: true });
      renderNav(); updateBadge();
      renderDetail(id);
      // refresh underlying list quietly
      const y = window.scrollY; renderListOnly(); window.scrollTo(0, y);
    }
  }

  function renderListOnly() {
    if (VIEWS[S.view].filters) {
      const keepDlg = S.dialogItemId;
      S.dialogItemId = null; render(); S.dialogItemId = keepDlg;
    }
  }

  /* ------------------------------- item actions ------------------------------- */

  async function toggleBookmark(id) {
    const it = S.items.find((i) => i.id === id);
    if (!it) return;
    const on = !st(id).bookmarked;
    S.states[id] = await DB.setState(id, { kind: it.kind, bookmarked: on });
    if (on) {
      const p = await DB.requestPersistence();
      if (p.granted) refreshStorageStatus();
      toast('Flagged for shutdown plan — kept permanently offline', 'ok');
    }
    afterStateChange();
  }

  async function toggleRead(id) {
    const it = S.items.find((i) => i.id === id);
    if (!it) return;
    S.states[id] = await DB.setState(id, { kind: it.kind, read: !st(id).read });
    afterStateChange();
  }

  function afterStateChange() {
    S.hay = new Map();
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    updateBadge();
  }

  async function saveNote(id, value) {
    const it = S.items.find((i) => i.id === id);
    if (!it) return;
    if ((st(id).note || '') === value) return;
    S.states[id] = await DB.setState(id, { kind: it.kind, note: value });
    S.hay.delete(id);
    toast(value.trim() ? 'Note saved offline' : 'Note cleared', 'ok');
  }

  async function setRemediation(id, value) {
    const it = S.items.find((i) => i.id === id);
    if (!it) return;
    S.states[id] = await DB.setState(id, { kind: it.kind, remediation: value });
    toast('Remediation status: ' + (REMEDIATION.find((r) => r[0] === value) || [0, value])[1], 'ok');
    renderListOnly();
  }

  async function markAllCritical() {
    const ids = S.items.filter((i) => isCritical(i) && !st(i.id).read).map((i) => i.id);
    if (!ids.length) return;
    if (!confirm('Mark ' + ids.length + ' critical item(s) as reviewed?')) return;
    await DB.setStateMany(ids, { read: true });
    await refresh(true);
    toast(ids.length + ' item(s) marked reviewed', 'ok');
  }

  /* ---------------------------------- sync ---------------------------------- */

  function setSyncUi(on) {
    const b = $('#btnSync');
    b.disabled = on; b.classList.toggle('spin', on);
  }

  async function doSync(origin) {
    if (S.syncing) return;
    if (!navigator.onLine) {
      const queued = await PWA.registerBackgroundSync();
      await DB.log('sync', 'Sync deferred — device offline' + (queued ? ' (background sync queued)' : ''), { origin }, false);
      toast('Offline — sync ' + (queued ? 'queued for when connectivity returns' : 'skipped; it will run when you are back online'), 'warn');
      if (S.view === 'storage') render();
      return;
    }
    S.syncing = true; setSyncUi(true);
    try {
      const r = await FEEDS.syncAll({ origin: origin || 'manual' });
      toast(r.message, r.failed ? 'warn' : 'ok');
      if (r.errors.length) toast(r.errors[0], 'err');
    } catch (err) {
      toast('Sync failed: ' + err.message, 'err');
    } finally {
      S.syncing = false; setSyncUi(false);
      await refresh(true);
    }
  }

  /* ------------------------------ import / export ------------------------------ */

  async function importContent(text, name) {
    const parsed = FEEDS.importText(text, { name: name || 'Manual import' });
    if (parsed.backup) {
      const r = await DB.importBackup(parsed.backup);
      await DB.log('import', 'Backup restored: ' + r.added + ' added, ' + r.updated + ' updated, ' + r.statesMerged + ' state rows merged', r, true);
      toast('Backup restored — ' + r.added + ' new, ' + r.updated + ' updated records', 'ok');
    } else {
      const r = await DB.upsertContent(parsed.records);
      await DB.log('import', 'Imported ' + parsed.records.length + ' record(s) from ' + (name || 'pasted content') + ' (' + r.added + ' new)', { format: parsed.format, added: r.added, updated: r.updated }, true);
      toast('Imported ' + parsed.records.length + ' record(s) — ' + r.added + ' new', 'ok');
    }
    await refresh(true);
  }

  async function importFile(file) {
    try { await importContent(await file.text(), file.name); }
    catch (err) { toast('Import failed: ' + err.message, 'err'); await DB.log('import', 'Import failed (' + file.name + '): ' + err.message, null, false); }
  }

  function currentScopeItems(scope) {
    if (scope === 'flagged') return { items: S.items.filter((i) => st(i.id).bookmarked), label: 'Items flagged for shutdown plan' };
    if (scope === 'view') {
      const v = VIEWS[S.view].filters ? S.view : 'feed';
      return { items: listForView(v), label: 'Current view: ' + VIEWS[v].title };
    }
    return { items: S.items.slice(), label: 'All records in local database' };
  }

  function sortForReport(items) {
    return items.slice().sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || a.component.localeCompare(b.component) || b.timestamp - a.timestamp);
  }

  function buildTextReport(items, label) {
    const line = '='.repeat(72);
    const out = [];
    out.push('WONDERTECH PULSE — MAINTENANCE SHUTDOWN REPORT');
    out.push('Prepared for: Al Gurg Automation and Controls · SCADA Engineering');
    out.push('Generated:    ' + new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }));
    out.push('Scope:        ' + label + ' (' + items.length + ' item' + (items.length === 1 ? '' : 's') + ')');
    out.push(line);
    const sorted = sortForReport(items);
    if (!sorted.length) out.push('\nNo items in scope.');
    Object.keys(SEV_RANK).forEach((sev) => {
      const group = sorted.filter((i) => i.severity === sev);
      if (!group.length) return;
      out.push('\n' + SEV_LABEL[sev] + ' (' + group.length + ')');
      out.push('-'.repeat(72));
      group.forEach((it, idx) => {
        const s = st(it.id);
        out.push((idx + 1) + '. ' + it.title + (it.seed ? '  [SEED / illustrative]' : ''));
        out.push('   Component: ' + it.component + '  |  Category: ' + it.category + '  |  Date: ' + fmtDate(it.timestamp));
        if (it.cveId) out.push('   CVE: ' + it.cveId + (it.cvss != null ? '  |  CVSS: ' + Number(it.cvss).toFixed(1) : '') + '  |  Remediation: ' + ((REMEDIATION.find((r) => r[0] === (s.remediation || it.remediation)) || [0, 'Open'])[1]));
        if (it.kb) out.push('   KB / tech note: ' + it.kb);
        if (it.versions && it.versions.length) out.push('   Impacted versions: ' + it.versions.join(', '));
        if (it.fixedIn) out.push('   Fixed in: ' + it.fixedIn);
        if (it.checksum) out.push('   SHA-256: ' + it.checksum);
        out.push('   Summary: ' + it.summary);
        if (it.url) out.push('   Reference: ' + it.url);
        out.push('   Status: ' + (s.read ? 'Reviewed' : 'UNREVIEWED') + (s.bookmarked ? ' · Flagged for shutdown' : ''));
        if (s.note && s.note.trim()) out.push('   Engineer notes: ' + s.note.trim().replace(/\n/g, '\n                   '));
        out.push('');
      });
    });
    out.push(line);
    if (items.some((i) => i.seed)) out.push('NOTE: This report includes illustrative seed records. Verify every item against official AVEVA / CISA publications.');
    out.push('Verify all patches against vendor documentation and test on a non-production galaxy before deployment.');
    return out.join('\n');
  }

  function buildJsonReport(items, label) {
    return JSON.stringify({
      schema: 'wondertech-pulse-report/1',
      generatedAt: new Date().toISOString(),
      scope: label,
      count: items.length,
      items: sortForReport(items).map((it) => Object.assign({}, it, {
        state: { read: !!st(it.id).read, flagged: !!st(it.id).bookmarked, remediation: st(it.id).remediation || null, note: st(it.id).note || '' }
      }))
    }, null, 2);
  }

  function buildExport() {
    const scope = ($('input[name="exScope"]:checked') || {}).value || 'flagged';
    const format = ($('input[name="exFormat"]:checked') || {}).value || 'text';
    const { items, label } = currentScopeItems(scope);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (format === 'json') return { text: buildJsonReport(items, label), name: 'wondertech-pulse-report-' + stamp + '.json', mime: 'application/json', count: items.length };
    return { text: buildTextReport(items, label), name: 'wondertech-pulse-report-' + stamp + '.txt', mime: 'text/plain', count: items.length };
  }

  function updateExportInfo() {
    const scope = ($('input[name="exScope"]:checked') || {}).value || 'flagged';
    const { items, label } = currentScopeItems(scope);
    $('#exportInfo').textContent = label + ' — ' + items.length + ' item' + (items.length === 1 ? '' : 's') + (scope === 'flagged' && !items.length ? ' (flag items with ★ first)' : '');
  }

  function downloadBlob(text, name, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function shareText(text, name, mime, title) {
    try {
      const file = new File([text], name, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return true; }
      if (navigator.share) { await navigator.share({ title, text: text.slice(0, 3500) }); return true; }
    } catch (err) {
      if (err && err.name === 'AbortError') return true;
    }
    return false;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  /* ---------------------------- feed dialog actions ---------------------------- */

  function openFeedDialog(prefill) {
    $('#feedName').value = (prefill && prefill.name) || '';
    $('#feedUrl').value = (prefill && prefill.url) || '';
    $('#feedComponent').value = '';
    const d = $('#feedDlg');
    if (!d.open) d.showModal();
    $('#feedName').focus();
  }

  async function submitFeed(e) {
    e.preventDefault();
    const name = $('#feedName').value.trim();
    const url = $('#feedUrl').value.trim();
    const component = $('#feedComponent').value;
    try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error('bad'); } catch (_) { toast('Enter a valid http(s) URL', 'err'); return; }
    const btn = e.submitter || $('#feedForm button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Testing…';
    try {
      let found = null;
      try { found = await FEEDS.testFeed({ name, url, component }); } catch (err) {
        if (!confirm('Could not read this feed right now:\n' + err.message + '\n\nAdd it anyway? It will be retried on every sync.')) throw new Error('cancelled');
      }
      await FEEDS.addFeed({ name, url, component });
      await DB.log('feeds', 'Feed added: ' + name, { url }, true);
      $('#feedDlg').close();
      toast(found != null ? 'Feed added — ' + found + ' items found. Syncing…' : 'Feed added', 'ok');
      await refresh(true);
      if (found != null) doSync('manual');
    } catch (err) {
      if (err.message !== 'cancelled') toast(err.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Test & add feed';
    }
  }

  /* ------------------------------- storage chip ------------------------------- */

  function updateStorageChip() {
    const c = $('#storageChip');
    const s = S.storage;
    if (!s) { c.textContent = 'Storage…'; return; }
    if (!s.supported) { c.textContent = 'Storage: n/a'; c.className = 'chip chip-btn chip-bad'; return; }
    c.textContent = (s.persisted ? 'Persistent · ' : 'Best-effort · ') + fmtBytes(s.usage);
    c.className = 'chip chip-btn ' + (s.persisted ? 'chip-ok' : 'chip-warn');
    c.title = s.persisted ? 'Persistent storage granted — the browser will not evict your archive.' : 'Persistent storage not granted. Flag an item or open Storage & Sync to request it.';
  }

  async function refreshStorageStatus() {
    S.storage = await DB.storageStatus();
    updateStorageChip();
  }

  function updateNetChip(online) {
    const c = $('#netChip');
    c.textContent = online ? 'ONLINE' : 'OFFLINE';
    c.className = 'chip ' + (online ? 'chip-ok' : 'chip-bad');
  }

  /* -------------------------------- routing -------------------------------- */

  function setView(view) {
    if (!VIEWS[view]) view = 'feed';
    S.view = view;
    render();
    window.scrollTo(0, 0);
  }

  function readHash() {
    const h = location.hash.replace(/^#\/?/, '');
    return VIEWS[h] ? h : null;
  }

  function parseProtocol(raw) {
    const m = String(raw || '').match(/^web\+wondertech:(?:\/\/)?([^?]*)\??(.*)$/i);
    if (!m) return null;
    return { action: m[1].replace(/\/$/, '').toLowerCase(), params: new URLSearchParams(m[2]) };
  }

  function handleLaunchParams() {
    const p = new URLSearchParams(location.search);
    let view = readHash() || (VIEWS[p.get('view')] ? p.get('view') : null);
    let after = null;

    if (p.get('action') === 'add-feed') after = () => openFeedDialog();
    if (p.get('share_url')) {
      const url = p.get('share_url'); const name = p.get('share_title') || '';
      after = () => openFeedDialog({ url, name });
      view = view || 'sources';
    }
    if (p.get('protocol')) {
      const pr = parseProtocol(decodeURIComponent(p.get('protocol')));
      if (pr) {
        if (pr.action === 'feed' || pr.action === 'add-feed') { const url = pr.params.get('url') || ''; after = () => openFeedDialog({ url, name: pr.params.get('name') || '' }); view = 'sources'; }
        else if (pr.action === 'search') { S.f.q = pr.params.get('q') || ''; view = 'feed'; }
        else if (pr.action === 'view' && VIEWS[pr.params.get('name')]) view = pr.params.get('name');
        else if (pr.action === 'open') { const id = pr.params.get('id'); after = () => openDetail(id); }
      }
    }
    if (view) S.view = view;
    if (p.toString()) history.replaceState(null, '', location.pathname + '#/' + S.view);
    else if (!location.hash) history.replaceState(null, '', location.pathname + '#/' + S.view);
    return after;
  }

  /* ------------------------------ event wiring ------------------------------ */

  const actions = {
    open: (el) => openDetail(el.dataset.id),
    'toggle-bm': (el) => toggleBookmark(el.dataset.id),
    'toggle-read': (el) => toggleRead(el.dataset.id),
    'close-dialog': (el) => el.closest('dialog').close(),
    sync: () => doSync('manual'),
    install: async () => {
      const r = await PWA.promptInstall();
      if (r.outcome === 'accepted') toast('Installing WonderTech Pulse…', 'ok');
      $('#btnInstall').hidden = !PWA.canInstall;
    },
    'goto-storage': () => { location.hash = '#/storage'; },
    'clear-filters': () => { S.f = { q: '', component: '', category: '', severity: '', status: 'all', sort: 'date-desc' }; render(); },
    'open-export': () => { updateExportInfo(); const d = $('#exportDlg'); if (!d.open) d.showModal(); },
    'export-download': () => { const x = buildExport(); downloadBlob(x.text, x.name, x.mime); toast('Report downloaded (' + x.count + ' items)', 'ok'); },
    'export-share': async () => {
      const x = buildExport();
      const ok = await shareText(x.text, x.name, x.mime, 'WonderTech Pulse report');
      if (!ok) { downloadBlob(x.text, x.name, x.mime); toast('Sharing is not supported here — downloaded instead', 'warn'); }
    },
    'export-copy': async () => { const x = buildExport(); toast((await copyText(x.text)) ? 'Report copied to clipboard' : 'Copy failed', 'ok'); },
    'share-item': async (el) => {
      const it = S.items.find((i) => i.id === el.dataset.id); if (!it) return;
      const text = buildTextReport([it], 'Single item');
      const ok = await shareText(text, 'wondertech-pulse-' + it.id + '.txt', 'text/plain', it.title);
      if (!ok) toast((await copyText(text)) ? 'Sharing unavailable — item copied to clipboard' : 'Could not share or copy', 'warn');
    },
    'add-feed': () => openFeedDialog(),
    'delete-feed': async (el) => {
      const f = S.feeds.find((x) => x.id === el.dataset.id);
      if (!f || !confirm('Remove feed "' + f.name + '"? Items already imported are kept.')) return;
      await DB.setMeta('feeds', S.feeds.filter((x) => x.id !== f.id));
      await DB.log('feeds', 'Feed removed: ' + f.name, null, true);
      await refresh(true);
    },
    'import-text': async () => {
      const t = $('#importText').value;
      if (!t.trim()) { toast('Paste some RSS, Atom or JSON first', 'warn'); return; }
      try { await importContent(t, 'Pasted content'); } catch (err) { toast('Import failed: ' + err.message, 'err'); }
    },
    'save-settings': async () => {
      const retention = Math.max(30, Math.min(3650, parseInt($('#setRetention').value, 10) || 1095));
      const rate = Math.max(1, Math.min(5000, parseInt($('#setRate').value, 10) || 25));
      const proxy = $('#setProxy').value.trim();
      await DB.setSettings({ retentionDays: retention, assumedNewRecordsPerDay: rate, corsProxy: proxy });
      toast('Settings saved', 'ok');
      await refresh(true);
    },
    'dismiss-banner': async () => { await DB.setSettings({ bannerDismissed: true }); await refresh(true); },
    'request-persist': async () => {
      const r = await DB.requestPersistence();
      toast(r.granted ? 'Persistent storage granted' : (r.supported ? 'The browser declined persistent storage. Installing the app or bookmarking the site usually helps.' : 'Persistent storage is not supported'), r.granted ? 'ok' : 'warn');
      await refreshStorageStatus();
      if (S.view === 'storage') render();
    },
    'run-retention': async () => {
      const r = await DB.pruneRetention();
      await DB.log('retention', 'Retention run: removed ' + r.removedArticles + ' article(s), ' + r.removedLog + ' log row(s); preserved ' + r.preserved + ' flagged/annotated', r, true);
      toast('Retention complete — ' + r.removedArticles + ' article(s) pruned, ' + r.preserved + ' preserved', 'ok');
      await refresh(true);
    },
    'backup-export': async () => {
      const data = await DB.exportAll();
      downloadBlob(JSON.stringify(data, null, 2), 'wondertech-pulse-backup-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.json', 'application/json');
      await DB.log('backup', 'Full backup exported', { records: data.articles_feed.length + data.patch_notes.length + data.cisa_advisories.length }, true);
      toast('Backup downloaded', 'ok');
    },
    'restore-seed': async () => { const r = await FEEDS.ensureSeed({ force: true }); toast(r.added + ' seed record(s) restored', 'ok'); await refresh(true); },
    'delete-seed': async () => {
      if (!confirm('Delete all illustrative seed records? Flags and notes on them are removed too unless you added a note or flag.')) return;
      const n = await FEEDS.removeSeed(); toast(n + ' seed record(s) deleted', 'ok'); await refresh(true);
    },
    'wipe-all': async () => {
      if (!confirm('Wipe the ENTIRE local database (records, flags, notes, feeds, logs)? This cannot be undone. Export a backup first.')) return;
      if (!confirm('Really wipe everything?')) return;
      await DB.clearStores([DB.STORES.ARTICLES, DB.STORES.PATCHES, DB.STORES.ADVISORIES, DB.STORES.STATE, DB.STORES.AUDIT, DB.STORES.META]);
      await DB.setMeta('seedVersion', FEEDS.SEED_VERSION);
      await DB.setMeta('createdAt', Date.now());
      toast('Local database wiped', 'warn'); await refresh(true);
    },
    'mark-all-critical': markAllCritical
  };

  function bindEvents() {
    document.addEventListener('click', (e) => {
      // Form controls inside clickable rows/cards must not trigger the row action.
      if (e.target.closest('select, input, textarea, label:not([data-action])')) return;
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const fn = actions[el.dataset.action];
      if (fn) { e.preventDefault(); e.stopPropagation(); fn(el, e); }
    });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.card[data-action="open"]')) { e.preventDefault(); openDetail(e.target.dataset.id); return; }
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
    });

    document.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.filter) { S.f[t.dataset.filter] = t.value; render(); return; }
      if (t.dataset && t.dataset.remediation) { await setRemediation(t.dataset.remediation, t.value); return; }
      if (t.dataset && t.dataset.note) { await saveNote(t.dataset.note, t.value); return; }
      if (t.dataset && t.dataset.feedToggle) {
        const feeds = await DB.getMeta('feeds', []);
        const f = feeds.find((x) => x.id === t.dataset.feedToggle);
        if (f) { f.enabled = t.checked; await DB.setMeta('feeds', feeds); S.feeds = feeds; toast('Feed ' + (t.checked ? 'enabled' : 'disabled'), 'ok'); }
        return;
      }
      if (t.id === 'importFile' && t.files[0]) { await importFile(t.files[0]); t.value = ''; return; }
      if (t.id === 'backupFile' && t.files[0]) { await importFile(t.files[0]); t.value = ''; return; }
      if (t.name === 'exScope') updateExportInfo();
    });

    $('#q').addEventListener('input', (e) => {
      S.f.q = e.target.value;
      if (!VIEWS[S.view].filters) { location.hash = '#/feed'; return; }
      const y = window.scrollY; render(); window.scrollTo(0, y);
    });

    $('#feedForm').addEventListener('submit', submitFeed);
    $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
    $('#detail').addEventListener('close', () => { S.dialogItemId = null; });
    window.addEventListener('hashchange', () => { const v = readHash(); if (v) setView(v); });
  }

  /* ------------------------------- file launch ------------------------------- */

  function initLaunchQueue() {
    if (!('launchQueue' in window)) return;
    window.launchQueue.setConsumer(async (params) => {
      for (const handle of params.files || []) {
        try {
          const file = await handle.getFile();
          await importFile(file);
        } catch (err) { toast('Could not open file: ' + err.message, 'err'); }
      }
    });
  }

  /* ----------------------------------- init ----------------------------------- */

  async function init() {
    populateFilterOptions();
    bindEvents();
    updateNetChip(navigator.onLine);

    try {
      await DB.open();
      await FEEDS.ensureSeed();
    } catch (err) {
      $('#view').innerHTML = emptyHtml('Local database unavailable: ' + esc(err.message) + '<br>WonderTech Pulse needs IndexedDB. Disable private browsing and reload.');
      return;
    }

    const after = handleLaunchParams();
    await refresh();
    if (after) after();
    initLaunchQueue();

    refreshStorageStatus();
    DB.requestPersistence().then(refreshStorageStatus);

    PWA.init({
      onInstallAvailable: () => { $('#btnInstall').hidden = false; },
      onInstalled: () => { $('#btnInstall').hidden = true; toast('WonderTech Pulse installed', 'ok'); },
      onUpdate: () => toast('A new version of WonderTech Pulse is ready', 'ok', { sticky: true, action: { label: 'Update', run: () => PWA.applyUpdate() } }),
      onNetwork: (online) => {
        updateNetChip(online);
        if (online) { toast('Back online', 'ok'); doSync('reconnect'); } else toast('Offline — all data remains available locally', 'warn');
      },
      onMessage: async (msg) => {
        if (msg.type === 'SYNC_COMPLETE') { await refresh(true); toast('Background sync finished' + (msg.summary ? ' — ' + msg.summary.message : ''), 'ok'); }
      },
      onCapabilities: () => { if (S.view === 'storage') render(); }
    }).then((sw) => {
      S.swReady = sw && sw.state === 'registered';
      if (sw && sw.state !== 'registered' && sw.reason) toast('Offline shell unavailable: ' + sw.reason, 'warn');
      if (S.view === 'storage') render();
    });

    // Sync-on-open fallback: refresh if feeds exist and the last sync is older than 6 hours.
    const stale = !S.lastSync || Date.now() - S.lastSync > 6 * 3600 * 1000;
    if (navigator.onLine && stale && S.feeds.some((f) => f.enabled !== false)) doSync('open');

    // Keep the "last sync" label fresh.
    setInterval(() => { if (S.view === 'feed') { const y = window.scrollY; render(); window.scrollTo(0, y); } }, 5 * 60 * 1000);
  }

  window.WTP_APP = { refresh, state: S };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
