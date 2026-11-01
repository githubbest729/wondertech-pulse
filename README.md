<div align="center">

<!-- Project Brand SVG Header -->
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="120" rx="28" fill="#0B1220"/>
  <rect x="1" y="1" width="118" height="118" rx="27" stroke="#1E293B" stroke-width="2"/>
  <path d="M24 64H40L48 40L64 82L76 54L84 64H96" stroke="#0EA5E9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="84" cy="64" r="3" fill="#38BDF8"/>
  <circle cx="48" cy="40" r="3" fill="#38BDF8"/>
  <circle cx="64" cy="82" r="3" fill="#38BDF8"/>
</svg>

# WonderTech Pulse
### Industrial SCADA Vulnerability & Patch Intelligence PWA

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-0EA5E9?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![IndexedDB v1](https://img.shields.io/badge/Storage-IndexedDB%20Local-10B981?style=for-the-badge&logo=databricks&logoColor=white)](#6-data-model--retention)
[![WCAG 2.2 AA](https://img.shields.io/badge/Accessibility-WCAG%202.2%20AA-8B5CF6?style=for-the-badge)](https://www.w3.org/WAI/standards-guidelines/wcag/)
[![License](https://img.shields.io/badge/License-Proprietary%20%2F%20Internal-64748B?style=for-the-badge)](#license)

**Offline-first Progressive Web App** aggregating **Wonderware / AVEVA** security bulletins, vendor hotfixes, software compatibility matrices, and **CISA ICS-CERT** advisories for operational technology (OT) & SCADA engineers.

Designed specifically for rugged field tablets (*Getac, Panasonic Toughbook, iPad*) and dual-monitor control-room stations.

*Prepared for: SCADA Engineering, Al Gurg Automation & Controls (Dubai, U.A.E.)*

---

[Key Highlights](#-key-features) • [System Architecture](#-system-architecture) • [Quickstart](#-getting-started) • [Deployment](#-deployment--hosting) • [Data Model](#-data-model--retention) • [Security](#-security--data-governance)

</div>

---

> ⚠️ **Seed Data Notice**  
> Built-in records are **illustrative examples** designed to test the system and data models. They are badged `SEED` and are not official vendor notices (`CVE-SEED-000x`). Real feeds must be added or vendor files imported before removing demo records in **Storage & Sync → Delete seed records**. Always verify against AVEVA Security Central and official CISA advisories before executing plant modifications.

---

## ⚡ Key Features

<table>
  <tr>
    <td width="50%">
      <h3>🛡️ Security & Intelligence</h3>
      <ul>
        <li><b>Intel Feed:</b> Real-time, unified triage stream for AVEVA, InTouch, Historian, System Platform, and CISA bulletins.</li>
        <li><b>Patch Matrix:</b> Interactive compatibility grid matching 2023 R2 products with Windows Server, SQL Server, and OPC UA.</li>
        <li><b>SHA-256 Verifier:</b> Local file hashing directly in-browser to verify downloaded vendor installers prior to execution.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🏭 Plant Maintenance & Planning</h3>
      <ul>
        <li><b>Shutdown Planner:</b> Flag critical advisories (★) to compile work packages for plant shutdown windows.</li>
        <li><b>Audit & Reporting:</b> One-click export to A4 landscape maintenance orders with sign-off blocks, Excel/CSV, and JSON.</li>
        <li><b>100% Offline-First:</b> Service Worker caching with robust client-side IndexedDB persistence (3-year automated retention).</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🏗️ System Architecture

WonderTech Pulse operates **strictly client-side** with zero required backends. All storage, cryptographic verification, and parsing runs locally in the browser engine.

```
                      +---------------------------------------+
                      |       Field Engineer Device           |
                      |  (Toughbook / iPad / Desktop Workstation)
                      +---------------------------------------+
                                          |
                      +---------------------------------------+
                      |    Progressive Web App Shell          |
                      |   [Service Worker (sw.js v1.5.0)]     |
                      |    - Offline Cache (Cache-First)      |
                      |    - Window Controls Overlay          |
                      +---------------------------------------+
                                          |
                 +------------------------+------------------------+
                 |                                                 |
+--------------------------------+               +----------------------------------+
|      Local Data Engine         |               |     Inbound Feed Integrations    |
| (db.js / Storage Manager)      |               | (feeds.js / CORS-Safe Pipeline)  |
+--------------------------------+               +----------------------------------+
| • articles_feed (Pruned 3-yr)  |               | • Direct CORS HTTP / HTTPS RSS   |
| • patch_notes (Permanent)      | <--- Import - | • Optional Corporate Proxy Prefix|
| • cisa_advisories (Permanent)  |               | • Manual Import (JSON/XML/Atom)  |
| • bookmarks_and_read (Perm)    |               | • System File Handler Integration|
| • sync_audit_log (Audit trail) |               +----------------------------------+
+--------------------------------+                                 |
                 |                                                 |
+--------------------------------+               +----------------------------------+
|   Field Operations Modules     |               |    Crypto & Hardware Security    |
+--------------------------------+               +----------------------------------+
| • Triage Feed & Filters        |               | • Local SHA-256 Hash Checker     |
| • Compatibility Matrix         |               | • Sanitized CSV/Excel Generation |
| • A4 Shutdown Work Orders      |               | • Navigator Storage Persistence  |
+--------------------------------+               +----------------------------------+
```

---

## 🚀 Getting Started

### Local Development

Because Progressive Web Apps require a secure context (`HTTPS` or `localhost`), run the project through an HTTP server rather than opening `index.html` as a file (`file://`).

```bash
# Clone or extract repository
cd wondertech-pulse

# Option 1: Python 3 built-in server
python3 -m http.server 8080

# Option 2: Node.js serve
npx serve .
```

Open `http://localhost:8080` in Chrome, Edge, or Safari.

---

## 📦 Progressive Web App (PWA) Installation

* **Chrome / Microsoft Edge (Desktop & Android):**  
  Click the **Install** button in the title bar or omnibox. On desktop, **Window Controls Overlay (WCO)** enables seamless window integration mimicking a native application.
* **Apple iOS / iPadOS (Safari):**  
  Tap **Share** `(⎋)` → **Add to Home Screen**.

### Browser Capability Support Matrix

| Feature | Chrome / Edge | Safari / iOS (16.4+) | Firefox |
|---|:---:|:---:|:---:|
| **Offline Shell & IndexedDB Engine** | ✅ Full | ✅ Full | ✅ Full |
| **PWA App Installation** | ✅ Native Prompt | ✅ Add to Home Screen | ⚠️ Limited |
| **Window Controls Overlay (WCO)** | ✅ Yes | ❌ | ❌ |
| **Periodic Background Sync** | ✅ Yes | ❌ | ❌ |
| **App Badging API** | ✅ Yes | ✅ Yes | ❌ |
| **Native Protocol / File Handling** | ✅ Yes | ❌ | ❌ |

---

## 📂 Project Directory Structure

```text
wondertech-pulse/
├── index.html                 # UI Shell, SVG icon sprite, accessible modals
├── manifest.webmanifest       # PWA manifest, shortcuts, file/protocol handlers
├── sw.js                      # Cache-First service worker, SWR feed engine
├── offline.html               # Fallback standalone emergency reader
├── favicon.ico / favicon.svg  # Multi-resolution icons
├── css/
│   └── styles.css             # Industrial high-contrast dark theme, WCO styling
├── js/
│   ├── db.js                  # IndexedDB schema, persistence hooks, retention engine
│   ├── feeds.js               # Feed parser, categorizer, manual importer
│   ├── pwa-handler.js         # Install prompts, Service Worker lifecycle, badges
│   └── app.js                 # Router, filtering, reporting, view controllers
├── icons/                     # Standard and maskable PWA icons (192px, 512px)
├── screenshots/               # Manifest preview screenshots (desktop & mobile)
└── README.md
```

---

## 📊 Application Views

| Icon | View | Description |
|:---:|---|---|
| 📰 | **Intel Feed** | Aggregated master stream. Search and filter by severity, component, site, or review status. |
| 🚨 | **Critical Advisories** | Filtered list of zero-day exploits, critical CVEs, and CVSS 9.0+ threats. Updates the app-icon badge. |
| 🧩 | **Patch Matrix** | Visual component compatibility grid (InTouch, System Platform, Historian) vs OS/SQL targets. |
| 🛡️ | **CISA / CVE** | Dedicated ICS-CERT vulnerability tracking with engineer remediation states (*Open, Mitigated, Patched*). |
| 📋 | **Shutdown Plan** | Curated list of starred (★) maintenance activities with notes, target nodes, and downtime estimates. |
| 📡 | **Sources & Import** | Manage vendor RSS/JSON feeds, trigger manual data imports, or configure proxy endpoints. |
| 💾 | **Storage & Sync** | Monitor IndexedDB quota, download/restore JSON snapshots, adjust 3-year data retention. |

---

## 💾 Data Model & Retention

IndexedDB database: `wondertech-pulse` (`v1`)

```text
+-----------------------+-------------------------------------------------------------+
| Store Name            | Retention Policy                                            |
+-----------------------+-------------------------------------------------------------+
| articles_feed         | Auto-pruned after 1095 days (3 years), unless flagged (★)   |
| patch_notes           | Permanent archive (Never pruned)                            |
| cisa_advisories       | Permanent archive (Never pruned)                            |
| bookmarks_and_read    | Permanent flags, audit reviews, and engineer notes          |
| sync_audit_log        | Rolling 3-year audit trail for ISO/IEC compliance           |
| meta                  | Global configuration, custom feeds, UI state                |
+-----------------------+-------------------------------------------------------------+
```

* **Persistence Guard:** The application triggers `navigator.storage.persist()` on launch to prevent browsers from evicting cached records under low-disk scenarios.

---

## 🚢 Deployment & Hosting

The application is completely static and can be deployed to any web server or static host:

1. **Host requirements:** Must be served over **HTTPS** with a valid SSL/TLS certificate.
2. **MIME types:** Ensure `.webmanifest` files are served with:
   ```text
   Content-Type: application/manifest+json
   ```
3. **Cache Invalidation:** Do **not** apply long-lived CDN caching to `sw.js`. Ensure `Cache-Control: no-cache` is set for the service worker script.
4. **Versioning:** Increment `VERSION = 'x.x.x'` inside `sw.js` on every production deploy to trigger client-side update notifications.

---

## 🔒 Security & Data Governance

* **Zero External Telemetry:** All operational data, flagged notes, and node inventories remain strictly inside client-side browser storage.
* **CORS Compliance:** External feeds are fetched in-browser. Sites blocking cross-origin requests require configuring an internal corporate proxy prefix under **Sources & Import → Settings**.
* **Formula Injection Defense:** Generated CSV/Excel work orders sanitize inputs by neutralizing characters (`=`, `+`, `-`, `@`) that could trigger macro execution.
* **Input Sanitization:** HTML escaping protects all advisory content to mitigate Cross-Site Scripting (XSS).

---

## 📄 License

Internal Operational Tool — Al Gurg Automation & Controls. Distributed for SCADA and Field Engineering operations.