# WonderTech Pulse
Offline-first Progressive Web App that aggregates **Wonderware / AVEVA** security bulletins, hotfixes, patch notes and **CISA ICS-CERT** advisories for SCADA engineers. Built for field tablets (Getac / Toughbook / iPad) and dual-monitor control-room desktops.

Prepared for: SCADA Engineering

> **Seed data notice.** The built-in records are *illustrative* examples that demonstrate the data model. They are badged `SEED` and are **not** official bulletins; CVE IDs use the placeholder form `CVE-SEED-000x`, and checksums are intentionally blank. Add real feeds / import vendor data, then remove the seed records under **Storage & Sync → Delete seed records**. Always verify advisories and patch applicability against AVEVA Security Central, AVEVA Software Support and CISA before changing a production system.

---

## What's new in v1.3

- **Shutdown Plan empty state:** an illustrated clipboard-and-calendar panel, the heading "No Maintenance Items Flagged", helper copy pointing at the `+ Plan` button, and an **Explore Critical Advisories** button that goes to `#/critical`. If you search while items are flagged and nothing matches, a separate "No flagged items match your search" state offers **Clear search**.
- **No blank exports:** the *Export shutdown report* button only appears once something is flagged, and the Export dialog's Download / Print / Share / Copy buttons are disabled whenever the chosen scope is empty.
- **Work-order table:** flagged items show as Target Node, Component, Patch / Advisory, Severity, Reboot Required, Est. Downtime, Assigned Site and Actions (**Notes** opens the drawer on the notes box, **Remove** takes the item off the plan and keeps keyboard focus in place). Notes appear under the title. This view is always a table, whatever the Feed layout is set to.
- **Contrast / focus:** secondary text uses `#A3AEBF` (lighter than the requested `#94A3B8` minimum); `#64748B` is used only for borders and fills. A global `:focus-visible { outline: 2px solid #0EA5E9; outline-offset: 2px }` covers every row, button and input. axe-core reports 0 WCAG 2.2 AA violations on the empty and populated plan views and on the views checked in v1.2.

## What's new in v1.2

- **Table polish:** soft row borders, subtle striping and a cyan hover highlight, titles truncated with an ellipsis (full title on hover and in the drawer). Below 1700 px wide the Category column folds away to give the title room.
- **Reboot / site indicators:** `Reboot: Yes` (amber), `Reboot: No` (muted), `Service only` (sky blue) and grey site pills. KPI tiles are one connected header strip with red / amber / cyan top accents.
- **Accessibility (WCAG 2.2 AA):** muted text raised to `#A3AEBF`, red text tint `#F87171`, 2 px cyan focus rings, form-control borders at 3:1 or better, row keyboard support (Tab to a row, Enter / Space opens the drawer, Escape closes it and returns focus to the row), dialogs with `role="dialog"` / `aria-modal`, action chips whose accessible name begins with their visible label and names the item (for example *"Review: mark … as reviewed"*), and 44 px touch targets on tablets and touch screens. An automated axe-core scan of Feed, Matrix, CISA, Critical, Sources and the open drawer reports 0 violations; contrast of overlays, print and high-contrast modes was not audited.
- **Seed planning data:** every seed record now has site, target node, reboot, downtime and rollback values (for example System Platform rollup → `DWTC DCP`, `GR-NODE-01`, reboot yes, 45 mins). These are **illustrative planning assumptions, not vendor statements**: the vendor KB decides whether a restart is required. Your own edits in the drawer always win and are never overwritten. Existing installs are upgraded in place (dates kept, deleted seed records stay deleted).
- **CISA feed handling:** the pre-configured feed is held back until a CORS proxy is set, so the browser never makes the doomed request and the console stays clean. Sources & Import shows an info chip (*"CORS proxy required for direct browser RSS fetch — seed and manual import active"*) and a **Try direct fetch** button; if the source does allow browser access, the hold is lifted automatically.
- The list / cards preference is stored in IndexedDB settings and restored on every launch.

## 1. Run it

A service worker needs **HTTPS** or `http://localhost`; opening `index.html` by double-click (`file://`) shows the UI but disables offline install features.

**Quick local test (any machine with Python 3):**

```bash
cd wondertech-pulse
python3 -m http.server 8080
# open http://localhost:8080 in Chrome or Edge
```

**Node alternative:** `npx serve .`

## 2. Deploy (HTTPS)

Copy the folder to any static host: IIS, nginx, Apache, Azure Static Web Apps, Cloudflare Pages, GitHub Pages, an internal intranet server with a trusted certificate.

Checklist:

- Serve over **HTTPS** with a certificate the field devices trust (internal CA certificates must be installed on tablets).
- Serve `manifest.webmanifest` as `application/manifest+json` (IIS: add the MIME type; nginx: `types { application/manifest+json webmanifest; }`).
- Do **not** cache `sw.js` aggressively at the CDN/server (`Cache-Control: no-cache`). The app registers it with `updateViaCache: 'none'`.
- Subfolder hosting works: every path in the app is relative.
- **Bump `VERSION` in `sw.js`** whenever you change any precached file. Users then get an "Update" toast.

## 3. Install

- **Chrome / Edge (desktop & Android):** click **Install** in the title bar (or the browser's install icon). The desktop app uses **Window Controls Overlay**, so the title bar blends into the window frame.
- **iPad / iPhone (Safari):** Share → **Add to Home Screen**. (iOS does not support Periodic Background Sync, Window Controls Overlay or the install prompt; offline use and IndexedDB still work.)

## 4. File tree

```
wondertech-pulse/
├── index.html                 UI shell, dialogs, icon sprite
├── manifest.webmanifest       id, shortcuts, protocol & file handlers, share target, screenshots
├── sw.js                      Cache-First shell, SWR feeds, Static Routing, Background / Periodic Sync
├── offline.html               Standalone offline lookup against IndexedDB
├── favicon.ico / favicon.svg / apple-touch-icon.png
├── css/styles.css             Industrial dark theme, WCO + safe-area support
├── js/
│   ├── db.js                  IndexedDB engine, persistence manager, retention, backup
│   ├── feeds.js               Seed dataset, classifier, RSS/Atom/JSON importer, sync engine
│   ├── pwa-handler.js         Install prompt, SW lifecycle, Badging, sync registration, capabilities
│   └── app.js                 Router, filters, rendering, export, import, UI state
├── icons/                     192 / 512 + maskable 192 / 512 PNG
├── screenshots/               narrow-mobile.png, wide-desktop.png (manifest screenshots)
└── README.md
```

## 5. Using it

| View | Purpose |
|---|---|
| **Intel Feed** | Everything, newest first. Search and filter by component, category, severity, reviewed state. |
| **Critical Advisories** | Critical-severity items and high-severity security patches. Unreviewed ones drive the **app-icon badge**. |
| **Patch Matrix** | Releases, hotfixes and drivers grouped by component with impacted versions, fixed-in build, KB reference and SHA-256 field. |
| **CISA / CVE** | Advisory table with CVSS and an editable remediation status (Open / Mitigated / Patched / Not affected). |
| **Shutdown Plan** | Items you flagged with ★ for the next maintenance window, with your notes. |
| **Sources & Import** | Add RSS / Atom / JSON feeds, import files or pasted content, adjust settings. |
| **Storage & Sync** | Storage inspector, capacity projection, PWA capability report, retention, backup / restore, audit log. |

Shortcuts: `/` focuses search. Opening a record marks it reviewed.

**Export for a shutdown meeting:** *Export report* → choose scope (flagged / current view / everything) and format:
- **Maintenance work order** — printable A4 landscape table with Component, Site, Target node, Patch, KB/CVE, Severity, Reboot, Rollback, Expected downtime and per-row plus footer **sign-off lines**. Use **Print / PDF** and choose *Save as PDF*.
- **Excel / CSV** — same columns, UTF-8 with BOM for Excel; cells starting with `= + - @` are neutralised against formula injection.
- Formatted text or JSON.

Then **Download**, **Share** (Web Share where available) or **Copy**.

**Planning fields.** Open any record (slide-over drawer) to set *Reboot required*, *Rollback complexity*, *Client site / galaxy*, *Target node*, *Expected downtime* and notes; filter by site from the filter bar. Patch records have a **SHA-256 verifier**: pick the downloaded installer and compare with the vendor checksum (hashed locally, nothing uploaded). Intel Feed / Critical / Shutdown Plan can switch between **Cards** and **List** layouts.

**Default feed.** A CISA ICS-advisories feed (filtered to AVEVA / Wonderware / InTouch / Citect / Schneider Electric) is pre-configured. Its URL could not be verified from the build environment, and CISA may not send CORS headers: check its status under Sources & Import and set a CORS proxy you control if needed. No AVEVA bulletin feed is pre-configured because no public feed URL was verified; add one via *Add feed*. The app deliberately ships no third-party public CORS proxy, since that would route your requests through a service you don't control.

**Capabilities by browser**

| Feature | Chrome / Edge | Safari / iOS | Firefox |
|---|---|---|---|
| Offline shell, IndexedDB, search, export | ✅ | ✅ | ✅ |
| Installable | ✅ | Add to Home Screen | limited |
| Window Controls Overlay | ✅ desktop | ❌ | ❌ |
| Periodic Background Sync | ✅ installed app | ❌ | ❌ |
| Background Sync | ✅ | ❌ | ❌ |
| Badging API | ✅ installed app | ✅ (iOS 16.4+ home-screen apps) | ❌ |
| File / protocol handlers | ✅ desktop | ❌ | ❌ |

Where a feature is missing, the app falls back: sync-on-open, sync-on-reconnect, download / copy instead of share.

## 6. Data model & 3-year retention

IndexedDB database `wondertech-pulse` (v1):

| Store | Contents | Retention |
|---|---|---|
| `articles_feed` | News, tech alerts, imported feed items | Pruned after the retention window (default **1095 days / 3 years**) **unless flagged or annotated** |
| `patch_notes` | Service packs, hotfixes, driver releases | **Permanent** |
| `cisa_advisories` | CVE / CISA advisories, CVSS, remediation | **Permanent** |
| `bookmarks_and_read` | Flags, read state, remediation status, engineer notes | **Permanent** |
| `sync_audit_log` | Sync, import, seed and retention history | Pruned after the retention window |
| `meta` | Settings, feed list, counters | Permanent |

On first run the app calls `navigator.storage.persist()` (again when you flag an item) so the browser will not evict the archive under storage pressure. Whether it is granted is up to the browser (installing the app greatly improves the odds). **Storage & Sync** shows persistence state, `navigator.storage.estimate()` usage / quota, and a 3-year growth projection based on the real average record size and the "new records per day" setting.

Persistent storage protects against eviction, **not** against device loss, profile deletion or "Clear site data". Export a **full backup** from Storage & Sync regularly and keep it somewhere safe.

## 7. Feeds & the CORS limitation

Custom feeds are fetched directly from the browser, so the feed host must send CORS headers. Many vendor sites do not. Options:

1. Run a small internal proxy and set **CORS proxy prefix** in Sources & Import → Settings (the feed URL is appended URL-encoded).
2. Download the feed or advisory export and **import the file** (RSS, Atom, JSON Feed, or this app's JSON).
3. Open a feed file directly with the installed app (file handler for `.json`, `.xml`, `.rss`, `.atom`).

Imported items are classified by keywords into component, category and severity. Treat that classification as a convenience, not as authority.

JSON accepted: JSON Feed (`items[]`), arrays of objects with `title`, `url`, `summary`, `date_published`, or this app's backup / report format. Fields `component`, `category`, `severity`, `kind` (`article` | `patch` | `advisory`), `versions[]`, `kb`, `cveId`, `cvss`, `fixedIn`, `checksum` are honoured when present.

## 8. Protocol, share and shortcut URLs

- Shortcuts: `./?view=critical`, `./?view=matrix`, `./?action=add-feed`
- Protocol handler: `web+wondertech:feed?url=https%3A%2F%2Fexample.com%2Ffeed.xml`, `web+wondertech:search?q=historian`, `web+wondertech:view?name=matrix`
- Share target: sharing a URL to the installed app opens **Add feed** pre-filled.

## 9. Security notes

- All data stays on the device; the app sends nothing anywhere except the feed URLs you add.
- Output is HTML-escaped; external links open with `rel="noopener noreferrer"`.
- If a field tablet is shared, remember IndexedDB is not encrypted at rest; rely on OS disk encryption.

## 10. Updating the app

Edit files → bump `VERSION` in `sw.js` → redeploy. Open clients show **Update**; applying it activates the new service worker and reloads.
