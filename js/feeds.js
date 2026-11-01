/* WonderTech Pulse — curated seed dataset, classifier, RSS/Atom/JSON importer, feed sync engine
 *
 * NOTE ON SEED DATA: the built-in records are ILLUSTRATIVE examples that demonstrate the data model
 * (every one carries seed:true and is badged "SEED" in the UI). They are not a substitute for the vendor's
 * published bulletins. Add real feeds or import vendor/CISA exports, then delete the seed records from
 * Storage & Sync → Data lifecycle.
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const SEED_VERSION = 2; // v2: illustrative site / node / reboot / downtime planning fields

  const COMPONENTS = ['System Platform', 'InTouch', 'Historian', 'AppServer', 'DA/OI Drivers', 'SQL Server Integration'];
  const CATEGORIES = ['Critical Security Patch', 'Hotfix', 'Compatibility Advisory', 'New Feature Release', 'End of Life (EOL) Notice'];
  const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
  const KINDS = ['article', 'patch', 'advisory'];

  const URL_AVEVA_SEC = 'https://www.aveva.com/en/support-and-success/cyber-security-updates/';
  const URL_AVEVA_SUPPORT = 'https://softwaresupportsp.aveva.com/';
  const URL_CISA = 'https://www.cisa.gov/news-events/ics-advisories';

  /* ------------------------------------------------------------------ */
  /* Seed dataset                                                        */
  /* ------------------------------------------------------------------ */

  /* Illustrative planning assignments for the seed records (AGAC project sites). These are example values for
   * demonstrating the planning columns, NOT vendor statements: the vendor KB decides whether a restart is needed.
   * Engineers override any value per record in the detail drawer (their edits are stored separately and win). */
  const SEED_PLAN = {};
  (function () {
    const P = (ids, site, targetNode, reboot, rebootNote, downtime, rollback) =>
      ids.forEach((id) => { SEED_PLAN[id] = { site, targetNode, reboot, rebootNote, downtime, rollback }; });
    P(['seed-art-01', 'seed-pat-01', 'seed-adv-01'], 'DWTC DCP', 'GR-NODE-01', 'yes', 'Node restart', '45 mins', 'moderate');
    P(['seed-art-02', 'seed-adv-04'], 'Fujairah Tank Farm', 'WEB-GW-01', 'no', '', '15 mins', 'low');
    P(['seed-art-04', 'seed-pat-03', 'seed-adv-02'], 'Dibba Tunnel', 'HIST-SRV-01', 'service', 'Service restart only', '10 mins', 'low');
    P(['seed-art-03', 'seed-pat-02'], 'Hazardous Waste Plant', 'APP-AOS-02', 'no', '', '0 mins', 'low');
    P(['seed-adv-06'], 'Hazardous Waste Plant', 'APP-AOS-02', 'service', 'Service restart only', '15 mins', 'moderate');
    P(['seed-art-10', 'seed-pat-07', 'seed-adv-03'], 'Emirates Steel Mill', 'OI-COMM-01', 'service', 'Service restart only', '15 mins', 'low');
    P(['seed-art-14', 'seed-adv-05'], 'Grain Reserve Silos', 'SQL-CLUSTER', 'no', '', '30 mins', 'moderate');
    P(['seed-art-05'], 'Grain Reserve Silos', 'SQL-CLUSTER', 'no', '', '0 mins', 'low');
    P(['seed-pat-04'], 'Dibba Tunnel', 'HIST-SRV-01', 'no', '', '10 mins', 'low');
    P(['seed-art-06', 'seed-pat-05', 'seed-pat-10'], 'Emirates Steel Mill', 'OI-COMM-01', 'service', 'Service restart only', '15 mins', 'low');
    P(['seed-art-11'], 'Emirates Steel Mill', 'OI-COMM-01', 'service', 'Service restart only', '15 mins', 'moderate');
    P(['seed-art-07'], 'DWTC DCP', 'GR-NODE-01', 'no', '', '0 mins', 'high');
    P(['seed-art-08'], 'Fujairah Tank Farm', 'WEB-GW-01', 'no', '', '0 mins', 'low');
    P(['seed-art-09', 'seed-pat-06'], 'DWTC DCP', 'GR-NODE-01', 'yes', 'Node restart', '90 mins', 'high');
    P(['seed-pat-09'], 'DWTC DCP', 'GR-NODE-01', 'yes', 'Node restart', '60 mins', 'moderate');
    P(['seed-art-12'], 'Dibba Tunnel', 'HIST-SRV-01', 'no', '', '0 mins', 'low');
    P(['seed-art-13', 'seed-pat-08'], 'Fujairah Tank Farm', 'HMI-NODE-01', 'service', 'Service restart only', '10 mins', 'low');
  })();

  function seedRecords(now) {
    const out = [];
    const add = (kind, n, days, o) => out.push(Object.assign({
      id: 'seed-' + kind.slice(0, 3) + '-' + String(n).padStart(2, '0'),
      kind, timestamp: now - days * DAY, tags: [], versions: [], seed: true, source: 'Curated seed dataset'
    }, o));

    /* ---- articles ---- */
    add('article', 1, 2, {
      title: 'Authentication weakness in remote management components — patch guidance',
      component: 'System Platform', category: 'Critical Security Patch', severity: 'critical',
      summary: 'Vendor guidance describes an authentication weakness in remotely reachable management components. Prioritise patching on nodes reachable from the IT/OT DMZ and restrict management ports until the fix is applied.',
      body: 'Why it matters: management interfaces exposed across zones are a common lateral-movement path.\n\nSuggested actions:\n1. Identify System Platform nodes reachable from non-OT networks.\n2. Restrict management ports with host and network firewall rules.\n3. Schedule the vendor patch in the next maintenance window and verify on a test galaxy first.\n4. Record the applied build in your change log.',
      versions: ['System Platform 2020 R2 SP1', 'System Platform 2023 R2'],
      fixedIn: 'Vendor patch — confirm build in AVEVA Security Central',
      tags: ['security', 'remote-management', 'dmz', 'zero-day-watch'], url: URL_AVEVA_SEC
    });
    add('article', 2, 4, {
      title: 'Hardening advisory: place InTouch web-client gateways behind a DMZ jump host',
      component: 'InTouch', category: 'Compatibility Advisory', severity: 'high',
      summary: 'Guidance recommends terminating remote HMI access on an authenticated reverse proxy in the DMZ, disabling unused ports and enforcing TLS 1.2 or newer. Review exposure before the next audit window.',
      body: 'This is a configuration change rather than a binary patch. Verify certificate trust chains on thin-client devices before enforcing TLS 1.2+, because older tablets may fail the handshake.',
      versions: ['InTouch 2020 R2 SP1', 'InTouch 2023 R2'], fixedIn: 'Configuration change — no binary patch',
      tags: ['hardening', 'tls', 'remote-access'], url: URL_AVEVA_SEC
    });
    add('article', 3, 6, {
      title: 'Application Server: galaxy checkpoint stalls after long IDE session — hotfix available',
      component: 'AppServer', category: 'Hotfix', severity: 'medium',
      summary: 'A hotfix addresses galaxy repository checkpoints that stall when the IDE session has been open for extended periods. Applicable to engineering workstations and the galaxy repository node.',
      body: 'Workaround until patched: close and reopen the IDE before major deployments. Apply the hotfix on the GR node first, then on engineering stations.',
      versions: ['System Platform 2023 R2'], fixedIn: 'Hotfix — see linked patch record', tags: ['galaxy', 'deployment', 'ide'], url: URL_AVEVA_SUPPORT
    });
    add('article', 4, 9, {
      title: 'Historian: store-and-forward backlog drains slowly after SQL failover',
      component: 'Historian', category: 'Hotfix', severity: 'medium',
      summary: 'After a SQL Server failover the historian store-and-forward queue can drain slowly. A maintenance release improves reconnect behaviour and queue throughput.',
      body: 'Plan the update with the DBA team. Confirm that the SQL failover test plan includes a historian reconnect check.',
      versions: ['Historian 2020 R2 SP1', 'Historian 2023 R2'], fixedIn: 'Maintenance release — see linked patch record', tags: ['store-and-forward', 'sql', 'failover'], url: URL_AVEVA_SUPPORT
    });
    add('article', 5, 12, {
      title: 'Support matrix update: SQL Server cumulative-update levels for System Platform 2023 R2',
      component: 'SQL Server Integration', category: 'Compatibility Advisory', severity: 'low',
      summary: 'The platform support matrix lists minimum SQL Server cumulative-update levels. Check Galaxy Repository, Historian and reporting databases before the next SQL patch cycle.',
      body: 'Keep a table of SQL instance → CU level → dependent AVEVA component. Block SQL CU rollouts that exceed the validated level until the vendor confirms support.',
      versions: ['System Platform 2023 R2', 'Historian 2023 R2'], tags: ['sql-server', 'support-matrix'], url: URL_AVEVA_SUPPORT
    });
    add('article', 6, 15, {
      title: 'OI Gateway: OPC UA certificate handling and MQTT publishing improvements',
      component: 'DA/OI Drivers', category: 'New Feature Release', severity: 'info',
      summary: 'Release notes highlight improved certificate handling for OPC UA connections and additional MQTT publishing options. Validate in a test galaxy before adopting in production.',
      body: 'Review certificate rotation procedures for every OPC UA endpoint and document trust-list ownership between OT and IT teams.',
      versions: ['OI Gateway 2023 R2'], tags: ['opc-ua', 'mqtt', 'certificates', 'oi-gateway'], url: URL_AVEVA_SUPPORT
    });
    add('article', 7, 20, {
      title: 'End-of-support planning: legacy 2017-generation System Platform and Historian builds',
      component: 'System Platform', category: 'End of Life (EOL) Notice', severity: 'medium',
      summary: 'Legacy 2017-generation builds are at or beyond standard support. Confirm exact dates on the vendor lifecycle page and plan the upgrade path via 2020 R2 SP1 to 2023 R2.',
      body: 'Inventory remaining legacy nodes, including historian tiers and OI servers, and budget upgrade windows in the next two shutdown cycles.',
      versions: ['System Platform 2017 R2', 'Historian 2017 R2'], tags: ['eol', 'lifecycle', 'upgrade-planning'], url: URL_AVEVA_SUPPORT
    });
    add('article', 8, 24, {
      title: 'Windows Server 2022 qualification notes for InTouch HMI nodes',
      component: 'InTouch', category: 'Compatibility Advisory', severity: 'low',
      summary: 'Operating-system qualification notes for InTouch runtime nodes. Verify the exact OS build and InTouch version against the vendor matrix before refreshing HMI hardware.',
      body: 'Field Toughbook/Getac terminals should be validated separately because of display scaling and driver differences.',
      versions: ['InTouch 2023 R2'], tags: ['windows-server', 'os-support', 'hmi'], url: URL_AVEVA_SUPPORT
    });
    add('article', 9, 30, {
      title: 'System Platform 2023 R2 SP1 highlights: upgrade tooling and redundancy diagnostics',
      component: 'System Platform', category: 'New Feature Release', severity: 'info',
      summary: 'Service pack release notes summarise upgrade tooling and diagnostics improvements. Read the known-issues section before scheduling production upgrades.',
      body: 'Create a rollback plan: image GR and AppEngine nodes, export galaxy backups, and verify historian tag-count limits after upgrade.',
      versions: ['System Platform 2023 R2'], fixedIn: '2023 R2 SP1', tags: ['service-pack', 'upgrade', 'redundancy'], url: URL_AVEVA_SUPPORT
    });
    add('article', 10, 34, {
      title: 'Modbus TCP driver: reconnect storm after PLC power-cycle — hotfix',
      component: 'DA/OI Drivers', category: 'Hotfix', severity: 'high',
      summary: 'Multiple simultaneous reconnects after a PLC power cycle can saturate the driver connection pool. A driver hotfix throttles reconnect attempts.',
      body: 'Symptoms: bad-quality tags for several minutes after a power event. Mitigation: stagger PLC start-up where possible; apply the driver update during the next window.',
      versions: ['OI Server Modbus TCP 2020 R2 SP1'], fixedIn: 'Driver hotfix — see linked patch record', tags: ['modbus-tcp', 'driver', 'reconnect'], url: URL_AVEVA_SUPPORT
    });
    add('article', 11, 41, {
      title: 'Disabling TLS 1.0/1.1: impact on legacy OPC UA clients and DA bridges',
      component: 'DA/OI Drivers', category: 'Compatibility Advisory', severity: 'medium',
      summary: 'Security baselines that disable TLS 1.0/1.1 can break older OPC clients and bridge utilities. Inventory legacy clients and test connections before enforcing the baseline.',
      body: 'Use a staging VLAN to test each client type. Keep a documented exception register for devices that cannot be upgraded.',
      versions: ['DA Server 2020 R2 SP1', 'OI Gateway 2023 R2'], tags: ['tls', 'opc-ua', 'opc-da', 'baseline'], url: URL_AVEVA_SEC
    });
    add('article', 12, 55, {
      title: 'OT/IT integration trend: MQTT broker placement and DMZ patterns for historians',
      component: 'Historian', category: 'Compatibility Advisory', severity: 'info',
      summary: 'Common architecture patterns place the MQTT broker in the DMZ, with historians and gateways initiating outbound connections only. Useful when planning cloud or enterprise integrations.',
      body: 'Key design questions: who owns broker certificates, how topics are namespaced, and how store-and-forward behaves during WAN loss.',
      versions: [], tags: ['trend', 'mqtt', 'architecture', 'dmz', 'sparkplug'], url: URL_AVEVA_SEC
    });
    add('article', 13, 70, {
      title: 'InTouch WindowViewer: alarm banner flicker on high-DPI rugged displays — hotfix',
      component: 'InTouch', category: 'Hotfix', severity: 'low',
      summary: 'A hotfix corrects alarm banner repaint issues observed on high-DPI field terminals. Cosmetic, but relevant for operator acceptance testing.',
      body: 'Verify display scaling at 125% and 150% after the update.',
      versions: ['InTouch 2023 R2'], fixedIn: 'Hotfix — see linked patch record', tags: ['alarm', 'display', 'toughbook'], url: URL_AVEVA_SUPPORT
    });
    add('article', 14, 95, {
      title: 'SQL Server hardening checklist for Galaxy repository and Historian runtime databases',
      component: 'SQL Server Integration', category: 'Critical Security Patch', severity: 'high',
      summary: 'Checklist for least-privilege service accounts, encrypted connections, patched SQL builds and restricted network exposure for the databases behind System Platform and Historian.',
      body: 'Cross-check against the support matrix before applying SQL updates. Remove unused SQL logins and disable legacy protocols.',
      versions: ['System Platform 2020 R2 SP1', 'System Platform 2023 R2', 'Historian 2023 R2'], tags: ['sql-server', 'hardening', 'least-privilege'], url: URL_AVEVA_SEC
    });

    /* ---- patch notes ---- */
    const patch = (n, days, o) => add('patch', n, days, Object.assign({ kb: 'See vendor KB / tech note', checksum: '', source: 'Curated seed dataset' }, o));
    patch(1, 2, {
      title: 'System Platform security rollup — remote management hardening',
      component: 'System Platform', category: 'Critical Security Patch', severity: 'critical', releaseType: 'Security patch',
      summary: 'Security rollup that addresses the remote management authentication weakness. Install on all platform nodes; reboot required.',
      versions: ['2020 R2 SP1', '2023 R2'], fixedIn: 'Rollup build per vendor notice', url: URL_AVEVA_SEC, tags: ['security', 'rollup']
    });
    patch(2, 6, {
      title: 'Application Server hotfix — galaxy checkpoint stall',
      component: 'AppServer', category: 'Hotfix', severity: 'medium', releaseType: 'Hotfix',
      summary: 'Fixes checkpoint stalls triggered by long-lived IDE sessions. Apply to GR node first.',
      versions: ['2023 R2'], fixedIn: 'Hotfix build per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['galaxy', 'ide']
    });
    patch(3, 9, {
      title: 'Historian maintenance release — store-and-forward throughput',
      component: 'Historian', category: 'Hotfix', severity: 'medium', releaseType: 'Maintenance release',
      summary: 'Improves queue drain rate after SQL failover and adds diagnostics counters.',
      versions: ['2020 R2 SP1', '2023 R2'], fixedIn: 'Maintenance build per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['store-and-forward']
    });
    patch(4, 12, {
      title: 'Historian SQL schema validation script update',
      component: 'SQL Server Integration', category: 'Compatibility Advisory', severity: 'low', releaseType: 'Tool update',
      summary: 'Updated validation script that checks runtime database schema and CU level compatibility prior to upgrades.',
      versions: ['2023 R2'], fixedIn: 'Script revision per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['sql', 'validation']
    });
    patch(5, 15, {
      title: 'OI Gateway release — OPC UA certificate workflow',
      component: 'DA/OI Drivers', category: 'New Feature Release', severity: 'info', releaseType: 'Feature release',
      summary: 'Feature release covering certificate handling and MQTT publishing options.',
      versions: ['2023 R2'], fixedIn: 'Release per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['opc-ua', 'mqtt']
    });
    patch(6, 30, {
      title: 'System Platform 2023 R2 SP1',
      component: 'System Platform', category: 'New Feature Release', severity: 'info', releaseType: 'Service pack',
      summary: 'Service pack with upgrade tooling and diagnostics improvements. Read known issues before upgrading production.',
      versions: ['2023 R2'], fixedIn: '2023 R2 SP1', url: URL_AVEVA_SUPPORT, tags: ['service-pack']
    });
    patch(7, 34, {
      title: 'OI Server Modbus TCP driver hotfix — reconnect throttling',
      component: 'DA/OI Drivers', category: 'Hotfix', severity: 'high', releaseType: 'Driver hotfix',
      summary: 'Throttles simultaneous reconnects after PLC power cycles to protect the connection pool.',
      versions: ['2020 R2 SP1'], fixedIn: 'Driver build per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['modbus-tcp', 'driver']
    });
    patch(8, 70, {
      title: 'InTouch WindowViewer hotfix — alarm banner repaint',
      component: 'InTouch', category: 'Hotfix', severity: 'low', releaseType: 'Hotfix',
      summary: 'Corrects alarm banner repaint issues on high-DPI rugged displays.',
      versions: ['2023 R2'], fixedIn: 'Hotfix build per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['alarm', 'display']
    });
    patch(9, 120, {
      title: 'System Platform 2020 R2 SP1 cumulative hotfix set',
      component: 'System Platform', category: 'Hotfix', severity: 'medium', releaseType: 'Cumulative hotfix',
      summary: 'Cumulative stability hotfixes for the 2020 R2 SP1 baseline. Required before upgrading to 2023 R2.',
      versions: ['2020 R2 SP1'], fixedIn: 'Cumulative set per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['cumulative', 'upgrade-prerequisite']
    });
    patch(10, 150, {
      title: 'DA Server / OI Server driver bundle for 2020 R2 SP1',
      component: 'DA/OI Drivers', category: 'Hotfix', severity: 'low', releaseType: 'Driver bundle',
      summary: 'Bundled driver updates for common PLC protocols on the 2020 R2 SP1 platform.',
      versions: ['2020 R2 SP1'], fixedIn: 'Bundle per vendor notice', url: URL_AVEVA_SUPPORT, tags: ['drivers', 'bundle']
    });

    /* ---- CISA / CVE advisories ---- */
    const adv = (n, days, o) => add('advisory', n, days, Object.assign({
      source: 'CISA ICS-CERT (illustrative)', remediation: 'open', url: URL_CISA
    }, o, { cveId: 'CVE-SEED-' + String(n).padStart(4, '0') }));
    adv(1, 3, {
      title: 'Authentication bypass in remote management service',
      component: 'System Platform', category: 'Critical Security Patch', severity: 'critical', cvss: 9.8,
      summary: 'Network-reachable authentication bypass could allow an unauthenticated actor to invoke management functions. Patch and restrict exposure.',
      versions: ['System Platform 2020 R2 SP1', 'System Platform 2023 R2'], fixedIn: 'Vendor patch', tags: ['cvss-9', 'network', 'unauthenticated']
    });
    adv(2, 18, {
      title: 'Improper input validation in historian query service',
      component: 'Historian', category: 'Critical Security Patch', severity: 'high', cvss: 8.1,
      summary: 'Crafted queries may cause service instability or information disclosure. Apply the maintenance release and limit query endpoints to trusted hosts.',
      versions: ['Historian 2020 R2 SP1', 'Historian 2023 R2'], fixedIn: 'Maintenance release', tags: ['input-validation', 'historian']
    });
    adv(3, 28, {
      title: 'Uncontrolled resource consumption in Modbus gateway component',
      component: 'DA/OI Drivers', category: 'Critical Security Patch', severity: 'high', cvss: 7.5,
      summary: 'Repeated connection attempts can exhaust resources and degrade data collection. Apply the driver update and enforce source-IP allow-lists.',
      versions: ['OI Server Modbus TCP 2020 R2 SP1'], fixedIn: 'Driver hotfix', tags: ['dos', 'modbus']
    });
    adv(4, 46, {
      title: 'Cleartext credential storage in exported HMI project files',
      component: 'InTouch', category: 'Hotfix', severity: 'medium', cvss: 6.5,
      summary: 'Exported project files may contain credentials in a recoverable form. Treat exports as sensitive and rotate affected credentials.',
      versions: ['InTouch 2020 R2 SP1'], fixedIn: 'Hotfix', tags: ['credentials', 'export']
    });
    adv(5, 75, {
      title: 'Excessive privileges on database service account',
      component: 'SQL Server Integration', category: 'Hotfix', severity: 'medium', cvss: 5.3,
      summary: 'Service accounts configured with broad database privileges increase blast radius of a compromise. Apply least-privilege guidance.',
      versions: ['System Platform 2020 R2 SP1'], fixedIn: 'Configuration guidance', tags: ['least-privilege', 'sql']
    });
    adv(6, 110, {
      title: 'Insecure deserialization in remote deployment service',
      component: 'AppServer', category: 'Critical Security Patch', severity: 'critical', cvss: 9.1,
      summary: 'Specially crafted deployment messages may lead to remote code execution on deployment targets. Patch urgently and isolate deployment traffic.',
      versions: ['System Platform 2017 R2', 'System Platform 2020 R2 SP1'], fixedIn: 'Vendor patch', tags: ['deserialization', 'rce', 'deployment']
    });

    out.forEach((r) => Object.assign(r, SEED_PLAN[r.id] || {}));
    return out;
  }

  async function ensureSeed(opts) {
    const DB = root.WTP_DB;
    const force = !!(opts && opts.force);
    const created = await DB.getMeta('createdAt', null);
    if (!created) await DB.setMeta('createdAt', Date.now());
    const version = await DB.getMeta('seedVersion', 0);
    if (!force && version >= SEED_VERSION) return { seeded: false, added: 0 };
    if (!force && version > 0) {
      // Upgrade from an older seed: refresh the planning fields of seed records that still exist.
      // Never re-adds seed records the engineer deleted, and keeps their original dates.
      const snap = await DB.snapshot();
      const upd = snap.items.filter((i) => i.seed && SEED_PLAN[i.id]).map((i) => Object.assign({}, i, SEED_PLAN[i.id]));
      const r = await DB.upsertContent(upd);
      await DB.setMeta('seedVersion', SEED_VERSION);
      await DB.log('seed', 'Seed dataset upgraded to v' + SEED_VERSION + ' (' + r.updated + ' records refreshed)', { version: SEED_VERSION }, true);
      return { seeded: true, added: 0 };
    }
    const res = await DB.upsertContent(seedRecords(Date.now()), { onlyNew: true });
    await DB.setMeta('seedVersion', SEED_VERSION);
    await DB.log('seed', 'Seed dataset ' + (force ? 'restored' : 'installed') + ' (' + res.added + ' records added)', { version: SEED_VERSION, added: res.added }, true);
    return { seeded: true, added: res.added };
  }

  /** Pre-configured feeds, added once. The user can edit or remove them in Sources & Import. */
  const DEFAULT_FEEDS = [{
    name: 'CISA ICS advisories (AVEVA / Schneider filter)',
    url: 'https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml',
    kind: 'advisory', filter: 'aveva|wonderware|intouch|citect|schneider electric',
    // CISA is not known to send CORS headers, so the browser would block a direct fetch. Until a proxy is configured
    // (or "Try direct fetch" succeeds) the feed is not requested at all, which keeps the console clean.
    needsProxy: true
  }];

  async function ensureDefaultFeeds() {
    const DB = root.WTP_DB;
    if (await DB.getMeta('defaultFeedsV', 0) >= 2) return 0;
    const feeds = await DB.getMeta('feeds', []);
    feeds.forEach((f) => { if (f.builtin && f.needsProxy === undefined) f.needsProxy = true; }); // v1 → v2 migration
    let n = 0;
    for (const d of DEFAULT_FEEDS) {
      if (feeds.some((f) => f.url === d.url)) continue;
      feeds.push(Object.assign({ id: 'feed-' + hash(d.url), component: '', enabled: true, addedAt: Date.now(), lastSync: null, lastStatus: 'Never synced', builtin: true }, d));
      n++;
    }
    await DB.setMeta('feeds', feeds);
    await DB.setMeta('defaultFeedsV', 2);
    return n;
  }

  async function removeSeed() {
    const DB = root.WTP_DB;
    const removed = await DB.deleteWhere((r) => r.seed === true);
    await DB.setMeta('seedVersion', SEED_VERSION); // do not auto-reinstall
    await DB.log('seed', 'Seed records deleted (' + removed + ')', { removed }, true);
    return removed;
  }

  /* ------------------------------------------------------------------ */
  /* Classification                                                      */
  /* ------------------------------------------------------------------ */

  function classify(text) {
    const t = String(text || '').toLowerCase();

    let component = 'System Platform';
    if (/historian|tag replication|store[- ]and[- ]forward/.test(t)) component = 'Historian';
    else if (/intouch|window ?maker|window ?viewer|access anywhere/.test(t)) component = 'InTouch';
    else if (/application server|appserver|galaxy|appengine|aaengine/.test(t)) component = 'AppServer';
    else if (/oi server|oi gateway|opc ?ua|opc ?da|modbus|mqtt|sparkplug|driver|dasabcip|dasiemens|plc/.test(t)) component = 'DA/OI Drivers';
    else if (/sql server|mssql|\bsql\b/.test(t)) component = 'SQL Server Integration';

    let category = 'Compatibility Advisory';
    if (/end[- ]of[- ](life|support)|\beol\b|\beos\b|retire|sunset|discontinu/.test(t)) category = 'End of Life (EOL) Notice';
    else if (/vulnerab|\bcve-\d|exploit|security (bulletin|advisory|patch|update)|zero[- ]day|remote code|authentication bypass|cvss/.test(t)) category = 'Critical Security Patch';
    else if (/hotfix|patch|fix(es|ed)?\b|cumulative update|maintenance release/.test(t)) category = 'Hotfix';
    else if (/new feature|introduc|now available|release notes|\bsp\d\b|service pack|announc|what's new|launch/.test(t)) category = 'New Feature Release';
    else if (/compatib|support matrix|supported|requires|qualif|deprecat/.test(t)) category = 'Compatibility Advisory';

    let severity = 'info';
    if (/critical|zero[- ]day|actively exploited|cvss[^0-9]{0,6}(9|10)/.test(t)) severity = 'critical';
    else if (/\bhigh\b|remote code|\brce\b|cvss[^0-9]{0,6}[78]/.test(t)) severity = 'high';
    else if (category === 'Critical Security Patch') severity = 'high';
    else if (category === 'Hotfix' || category === 'End of Life (EOL) Notice' || /medium|moderate/.test(t)) severity = 'medium';
    else if (category === 'Compatibility Advisory') severity = 'low';

    return { component, category, severity };
  }

  /* ------------------------------------------------------------------ */
  /* Parsing: RSS 2.0 / RSS 1.0 / Atom / JSON Feed / WonderTech JSON     */
  /* ------------------------------------------------------------------ */

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(+n); } catch (_) { return ' '; } })
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ' '; } })
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }
  const stripTags = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanText = (s) => stripTags(decodeEntities(s || ''));

  function xmlTag(block, name) {
    const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i');
    const m = block.match(re);
    return m ? m[1] : '';
  }
  function xmlTags(block, name) {
    const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'gi');
    const out = [];
    let m;
    while ((m = re.exec(block))) out.push(m[1]);
    return out;
  }
  function atomLink(block) {
    const links = block.match(/<link\b[^>]*>/gi) || [];
    let fallback = '';
    for (const l of links) {
      const href = (l.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!href) continue;
      const rel = (l.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!rel || rel === 'alternate') return decodeEntities(href);
      if (!fallback) fallback = decodeEntities(href);
    }
    return fallback;
  }

  function parseFeedXml(xml, srcName) {
    const text = String(xml || '');
    const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
    const blocks = text.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
    const now = Date.now();
    return blocks.map((b) => {
      const title = cleanText(xmlTag(b, 'title')) || '(untitled)';
      let link = '';
      if (isAtom) link = atomLink(b);
      else link = cleanText(xmlTag(b, 'link')) || (b.match(/<link\b[^>]*href=["']([^"']+)["']/i) || [])[1] || '';
      const summary = cleanText(xmlTag(b, 'content:encoded') || xmlTag(b, 'description') || xmlTag(b, 'summary') || xmlTag(b, 'content'));
      const dateStr = cleanText(xmlTag(b, 'pubDate') || xmlTag(b, 'published') || xmlTag(b, 'updated') || xmlTag(b, 'dc:date'));
      let ts = Date.parse(dateStr);
      if (!isFinite(ts)) ts = now;
      const cats = isAtom
        ? (b.match(/<category\b[^>]*term=["']([^"']+)["']/gi) || []).map((c) => (c.match(/term=["']([^"']+)["']/i) || [])[1])
        : xmlTags(b, 'category').map(cleanText);
      const guid = cleanText(xmlTag(b, 'guid') || xmlTag(b, 'id')) || link || title;
      return finalize({
        title, url: link, summary: summary.slice(0, 600), body: summary.length > 600 ? summary.slice(0, 4000) : '',
        timestamp: ts, tags: cats.filter(Boolean).slice(0, 8), guid, source: srcName
      });
    });
  }

  function finalize(rec) {
    const hay = [rec.title, rec.summary, (rec.tags || []).join(' ')].join(' ');
    const auto = classify(hay);
    const kind = KINDS.indexOf(rec.kind) !== -1 ? rec.kind : 'article';
    const out = Object.assign({
      versions: [], tags: [], summary: '', body: '', url: '', source: 'Imported'
    }, rec, {
      kind,
      component: COMPONENTS.indexOf(rec.component) !== -1 ? rec.component : (rec.defaultComponent || auto.component),
      category: CATEGORIES.indexOf(rec.category) !== -1 ? rec.category : auto.category,
      severity: SEVERITIES.indexOf(rec.severity) !== -1 ? rec.severity : auto.severity,
      timestamp: isFinite(rec.timestamp) ? Number(rec.timestamp) : Date.now()
    });
    delete out.defaultComponent;
    if (!out.id) out.id = 'imp-' + hash((rec.guid || rec.url || '') + '|' + rec.title);
    delete out.guid;
    if (!Array.isArray(out.versions)) out.versions = [];
    if (!Array.isArray(out.tags)) out.tags = [];
    if (out.kind === 'advisory') {
      if (!out.cveId) {
        const m = [rec.title, rec.summary, rec.url].join(' ').match(/CVE-\d{4}-\d{4,}|ICSA-\d{2}-\d{3}-\d{2}/i);
        if (m) out.cveId = m[0].toUpperCase();
      }
      out.cvss = out.cvss == null || out.cvss === '' ? null : Number(out.cvss);
      out.remediation = out.remediation || 'open';
    }
    return out;
  }

  function normalizeJsonItem(it, srcName, defaultComponent) {
    if (!it || typeof it !== 'object') return null;
    const title = it.title || it.name || it.headline;
    if (!title) return null;
    let ts = it.timestamp != null ? Number(it.timestamp) : NaN;
    if (!isFinite(ts)) ts = Date.parse(it.date_published || it.date || it.published || it.pubDate || it.updated || '');
    const rec = Object.assign({}, it, {
      title: cleanText(title),
      url: it.url || it.link || it.external_url || '',
      summary: cleanText(it.summary || it.content_text || it.content_html || it.description || '').slice(0, 600),
      body: it.body || '',
      timestamp: isFinite(ts) ? ts : Date.now(),
      tags: Array.isArray(it.tags) ? it.tags : (Array.isArray(it.categories) ? it.categories : []),
      guid: it.id || it.guid || it.url || title,
      source: it.source || srcName,
      defaultComponent
    });
    if (it.id) rec.id = String(it.id);
    return finalize(rec);
  }

  /** Parse any supported payload. Returns { records } or { backup }. */
  function importText(text, opts) {
    const srcName = (opts && (opts.name || opts.url)) || 'Imported';
    const defaultComponent = opts && opts.component;
    const t = String(text || '').trim();
    if (!t) throw new Error('Empty input');
    if (t[0] === '<') {
      const recs = parseFeedXml(t, srcName);
      if (!recs.length) throw new Error('No bulletins found in this file');
      if (defaultComponent) recs.forEach((r) => { if (r.component === 'System Platform') r.component = defaultComponent; });
      return { records: recs, format: 'xml' };
    }
    let obj;
    try { obj = JSON.parse(t); } catch (e) { throw new Error('This content is not a recognised bulletin feed or report'); }
    if (obj && typeof obj.schema === 'string' && obj.schema.indexOf('wondertech-pulse/') === 0) return { backup: obj, format: 'backup' };
    let list = [];
    if (Array.isArray(obj)) list = obj;
    else if (obj && typeof obj === 'object') {
      list = obj.items || obj.articles || [];
      ['articles_feed', 'patch_notes', 'cisa_advisories'].forEach((k) => {
        if (Array.isArray(obj[k])) list = list.concat(obj[k].map((r) => Object.assign({ kind: k === 'patch_notes' ? 'patch' : (k === 'cisa_advisories' ? 'advisory' : 'article') }, r)));
      });
    }
    const recs = list.map((i) => normalizeJsonItem(i, srcName, defaultComponent)).filter(Boolean);
    if (!recs.length) throw new Error('No usable records found in JSON');
    return { records: recs, format: 'json' };
  }

  /* ------------------------------------------------------------------ */
  /* Network + sync                                                      */
  /* ------------------------------------------------------------------ */

  async function fetchText(url, proxy, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 15000) : null;
    try {
      const target = proxy ? proxy + encodeURIComponent(url) : url;
      const res = await fetch(target, { cache: 'no-store', signal: ctl ? ctl.signal : undefined, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Timed out after ' + ((timeoutMs || 15000) / 1000) + 's');
      if (err instanceof TypeError) throw new Error('Could not reach this source from the browser — set an intranet proxy or import the file manually');
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function addFeed(feed) {
    const DB = root.WTP_DB;
    const feeds = await DB.getMeta('feeds', []);
    const url = String(feed.url).trim();
    if (feeds.some((f) => f.url === url)) throw new Error('This feed URL is already configured');
    const rec = {
      id: 'feed-' + hash(url + Date.now()), name: feed.name || url, url,
      component: feed.component || '', kind: feed.kind || '', filter: feed.filter || '', enabled: true, addedAt: Date.now(), lastSync: null, lastStatus: 'Never synced'
    };
    feeds.push(rec);
    await DB.setMeta('feeds', feeds);
    return rec;
  }

  async function testFeed(feed) {
    const settings = await root.WTP_DB.getSettings();
    const text = await fetchText(feed.url, settings.corsProxy);
    const parsed = importText(text, { name: feed.name, component: feed.component });
    return (parsed.records || []).length;
  }

  async function syncAll(opts) {
    const DB = root.WTP_DB;
    const started = Date.now();
    const settings = await DB.getSettings();
    const feeds = await DB.getMeta('feeds', []);
    const summary = { feeds: 0, ok: 0, failed: 0, added: 0, updated: 0, errors: [], origin: (opts && opts.origin) || 'manual' };
    const status = {};

    const direct = new Set((opts && opts.direct) || []);
    const PROXY_MSG = 'ℹ Offline Seed Mode: Live CISA feeds require an intranet proxy. You can use manual import or browse cached plant bulletins below.';
    summary.skipped = 0;

    for (const f of feeds) {
      if (f.enabled === false) continue;
      const blockedByCors = !!f.needsProxy && !settings.corsProxy;
      if (blockedByCors && !direct.has(f.id)) {
        // Not requested at all: no network call, no console error. Shown as an info chip in Sources & Import.
        summary.skipped++;
        status[f.id] = { lastTry: Date.now(), lastStatus: 'Offline Seed Mode', lastInfo: PROXY_MSG, lastError: null };
        continue;
      }
      summary.feeds++;
      try {
        const text = await fetchText(f.url, settings.corsProxy);
        const parsed = importText(text, { name: f.name, component: f.component });
        let recs = (parsed.records || []);
        if (f.filter) {
          let re = null;
          try { re = new RegExp(f.filter, 'i'); } catch (_) { throw new Error('Invalid keyword filter regex'); }
          recs = recs.filter((r) => re.test([r.title, r.summary, (r.tags || []).join(' ')].join(' ')));
        }
        recs = recs.map((r) => {
          const o = Object.assign(r, { source: f.name || f.url, feedId: f.id });
          if (f.kind && KINDS.indexOf(f.kind) !== -1) {
            if (!r.kind || r.kind === 'article') return finalize(Object.assign({}, o, { kind: f.kind, id: o.id }));
          }
          return o;
        });
        const res = await DB.upsertContent(recs);
        summary.ok++; summary.added += res.added; summary.updated += res.updated;
        status[f.id] = { lastSync: Date.now(), lastStatus: 'OK · ' + recs.length + ' matching items (' + res.added + ' new)', lastError: null, lastInfo: null };
        // A direct fetch that worked means the source allows browser access: stop holding it back.
        if (f.needsProxy && !settings.corsProxy) status[f.id].needsProxy = false;
      } catch (err) {
        if (blockedByCors) {
          // Explicit "Try direct fetch" was blocked: expected, reported as information rather than an error.
          summary.skipped++; summary.feeds--;
          status[f.id] = { lastTry: Date.now(), lastStatus: 'Direct fetch blocked', lastInfo: PROXY_MSG, lastError: null };
        } else {
          summary.failed++; summary.errors.push((f.name || f.url) + ': ' + err.message);
          status[f.id] = { lastTry: Date.now(), lastStatus: 'Failed', lastError: err.message, lastInfo: null };
        }
      }
    }

    if (Object.keys(status).length) {
      const latest = await DB.getMeta('feeds', []);
      latest.forEach((f) => { if (status[f.id]) Object.assign(f, status[f.id]); });
      await DB.setMeta('feeds', latest);
    }

    let pruned = null;
    try { pruned = await DB.pruneRetention(); } catch (_) {}

    await DB.setMeta('lastSync', Date.now());
    summary.pruned = pruned;
    summary.message = summary.feeds
      ? 'Synced ' + summary.ok + '/' + summary.feeds + ' feeds · ' + summary.added + ' new · ' + summary.updated + ' updated'
      : (summary.skipped ? 'Local archive verified · ' + summary.skipped + ' live feed(s) waiting for an intranet proxy' : 'Local archive verified · no custom feeds configured');
    await DB.log(
      summary.origin === 'manual' ? 'sync' : summary.origin,
      summary.message + (pruned ? ' · retention removed ' + pruned.removedArticles + ' article(s)' : ''),
      { feeds: summary.feeds, ok: summary.ok, failed: summary.failed, added: summary.added, updated: summary.updated, errors: summary.errors, durationMs: Date.now() - started },
      summary.failed === 0
    );
    return summary;
  }

  root.WTP_FEEDS = {
    COMPONENTS, CATEGORIES, SEVERITIES, SEED_VERSION,
    SEED_PLAN, seedRecords, ensureSeed, ensureDefaultFeeds, DEFAULT_FEEDS, removeSeed,
    classify, parseFeedXml, importText, hash,
    fetchText, addFeed, testFeed, syncAll
  };
})(typeof self !== 'undefined' ? self : globalThis);
