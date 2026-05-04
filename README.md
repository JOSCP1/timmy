<p align="center">
  <img src="images/timmy.png" alt="Timmy – The Humpback Whale" width="260" />
</p>

<h1 align="center">Timmy</h1>
<p align="center"><em>Threat Modeling &amp; Product Security Risk Management</em></p>
<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" />
  <img src="https://img.shields.io/badge/CVSS-4.0-red" />
  <img src="https://img.shields.io/badge/STRIDE-enabled-orange" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6" />
  <img src="https://img.shields.io/badge/no%20login%20required-open%20%26%20use-brightgreen" />
</p>

---

## ✨ Features

### 🗺️ Threat Modeler
- **Interactive SVG diagram editor** — draw data flow diagrams directly in the browser
- **4 element types:** Process · Data Store · Data Flow · Trust Zone
- **CIA classification** per element with per-dimension justification fields
- **Data flow direction** — Forward / Backward / Bidirectional with correct arrowheads
- Pan, zoom, drag, resize, keyboard shortcuts
- **⚡ Identify Threats** — automatic STRIDE analysis across the entire diagram

### 📦 Asset Registry
- Auto-populated from all diagram elements
- CSV export, type filtering, manual ordering

### 🛡️ Risk Assessment
- Threats imported from STRIDE analysis or added manually
- **CVSS 4.0** full metric scoring (11 metrics)
- Privacy impact, safety impact, security controls, residual risk, control references
- Status tracking: Open · In Progress · Mitigated · Accepted
- Click any affected item to jump directly to it in the Threat Modeler

### ⚠️ Adverse Impact
- Define named adverse impact profiles with CIA, privacy, and safety ratings
- Apply a profile to a risk to auto-populate all impact fields in one click

### ⚙️ Settings
- **User Management** — add, remove, and change passwords via the UI
- **Single Sign-On** — OpenID Connect / Active Directory via PKCE authorization code flow
- **Audit Log** — timestamped record of all significant actions (admin only)
- **Night Mode** — dark theme toggle

### 📄 Export
- **SVG** — export the threat model diagram as a vector graphic
- **XML** — full vulnerability report with CVSS vectors and control references
- **JSON** — save and restore complete project state

---

## 🚀 Getting Started

### Option 1 — Open directly (no server needed)

Just open `index.html` in any modern browser:

```bash
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

No installation, no build step, no dependencies.

### Option 2 — Serve with Node.js (optional)

Useful if you need to access Timmy over a network or avoid browser file-protocol restrictions.

```bash
npm install      # installs Express (only dependency)
npm start        # serves at http://localhost:3000
```

Set a custom port with `PORT=8080 node server.js`.

### Data Storage

All project data is stored in the **browser's `localStorage`** and never sent anywhere.
Use **💾 Save As** to download a `.json` backup, and **📂 Open** to restore it.

### Building TypeScript (optional, for contributors)

The compiled JavaScript in `js/` is committed alongside the TypeScript source in `src/`.
If you modify the TypeScript source, recompile with:

```bash
npm install          # installs TypeScript dev dependency
npm run build        # compile once
npm run watch        # watch mode
```

---

## 🗂️ Project Structure

```
timmy/
├── src/                    # TypeScript source (source of truth)
│   ├── types.ts            # All shared interfaces and type declarations
│   ├── storage.ts          # localStorage persistence + ID counters
│   ├── cvss4.ts            # CVSS 4.0 scoring engine
│   ├── diagram.ts          # SVG diagram editor
│   ├── adversal.ts         # Adverse Impact module
│   ├── assets.ts           # Asset registry
│   ├── threats.ts          # STRIDE threat identification
│   ├── vulnmgmt.ts         # Risk assessment cards
│   ├── report.ts           # XML export
│   ├── audit.ts            # Audit stub (no-op without server)
│   ├── settings.ts         # Settings UI
│   └── app.ts              # App controller
├── js/                     # Compiled JavaScript (generated from src/)
├── css/
│   └── style.css           # All styles including night mode
├── images/
│   └── timmy.png           # Application logo
├── index.html              # Single-page application (open directly)
├── server.js               # Optional Express static server
├── tsconfig.json           # TypeScript compiler configuration
└── package.json
```

---

## 🔐 STRIDE Threat Matrix

| Element Type   |  S  |  T  |  R  |  I  |  D  |  E  |
|----------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Process        | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| Data Store     |     | ✅  |     | ✅  | ✅  |     |
| Data Flow      |     | ✅  |     | ✅  | ✅  |     |
| Trust Boundary | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |

**S** Spoofing · **T** Tampering · **R** Repudiation · **I** Information Disclosure · **D** Denial of Service · **E** Elevation of Privilege

---

## 📊 CVSS 4.0 Metrics

| Group             | Metric                   | Values                                |
|-------------------|--------------------------|---------------------------------------|
| Exploitability    | Attack Vector (AV)       | Network · Adjacent · Local · Physical |
| Exploitability    | Attack Complexity (AC)   | Low · High                            |
| Exploitability    | Attack Requirements (AT) | None · Present                        |
| Exploitability    | Privileges Required (PR) | None · Low · High                     |
| Exploitability    | User Interaction (UI)    | None · Passive · Active               |
| Vulnerable System | Confidentiality (VC)     | None · Low · High                     |
| Vulnerable System | Integrity (VI)           | None · Low · High                     |
| Vulnerable System | Availability (VA)        | None · Low · High                     |
| Subsequent System | Confidentiality (SC)     | None · Low · High                     |
| Subsequent System | Integrity (SI)           | None · Low · High · Safety            |
| Subsequent System | Availability (SA)        | None · Low · High · Safety            |

---

## 🛠️ Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Frontend  | TypeScript 5 → compiled Vanilla JS (no framework)  |
| Diagrams  | Custom SVG editor (zero external dependencies)      |
| Server    | Node.js + Express (optional, for network access)    |
| Storage   | Browser localStorage + JSON project export          |
| License   | Apache 2.0                                          |

---

## 📜 License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Pull requests welcome. Please open an issue first to discuss what you would like to change.
