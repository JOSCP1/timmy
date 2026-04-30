<p align="center">
  <img src="images/timmy.png" alt="Timmy – The Humpback Whale" width="260" />
</p>

<h1 align="center">Timmy</h1>
<p align="center"><em>Threat Modeling &amp; Product Security Risk Management</em></p>
<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" />
  <img src="https://img.shields.io/badge/CVSS-4.0-red" />
  <img src="https://img.shields.io/badge/STRIDE-enabled-orange" />
  <img src="https://img.shields.io/badge/dependencies-none-green" />
</p>

---

## ✨ Features

### 🗺️ Threat Modeler
- **Interactive SVG diagram editor** — draw data flow diagrams directly in the browser
- **4 element types:**
  - ◯ **Process** — represents an application, service, or component
  - ▬ **Data Store** — databases, file systems, caches
  - → **Data Flow** — communication channels between elements
  - ⬜ **Trust Zone** — security boundaries (dashed red outline)
- **CIA classification** per element (Confidentiality / Integrity / Availability)
- Pan, zoom, drag-to-move, keyboard shortcuts
- **⚡ Identify Threats** — runs automatic STRIDE analysis across the diagram

### 📦 Asset Registry
- Auto-populated from all diagram elements
- Shows type, CIA classification, and linked threat count

### 🛡️ Vulnerability Management
- Threats imported from STRIDE analysis or added manually
- **CVSS 4.0** full metric assessment (AV · AC · AT · PR · UI · VC · VI · VA · SC · SI · SA)
- **Privacy Impact** assessment (None / Low / Medium / High)
- **Safety Impact** assessment (None / Low / Medium / High / Critical)
- Security controls & mitigation documentation
- Residual risk rating after controls
- Control reference field (NIST SP 800-53, ISO 27001, CIS, etc.)
- Status tracking: Open / In Progress / Mitigated / Accepted

### 📄 XML Export
- One-click export of all vulnerabilities as structured XML
- Includes CVSS vector strings, scores, impacts, controls, and references

---

## 🚀 Getting Started

### Option 1 — Open directly (no server needed)
```bash
open index.html
```

### Option 2 — Run with Node.js
```bash
npm install
npm start
# → http://localhost:3000
```

---

## 🗂️ Project Structure

```
OLYSEC/
├── images/
│   └── timmy.png           # Application logo
├── index.html              # Single-page application shell
├── css/
│   └── style.css           # All styles (CSS variables, dark sidebar, cards)
├── js/
│   ├── app.js              # App controller, routing, save/load
│   ├── diagram.js          # SVG diagram editor (pan, zoom, drag, connect)
│   ├── assets.js           # Asset registry, synced from diagram
│   ├── threats.js          # STRIDE threat identification engine
│   ├── cvss4.js            # CVSS 4.0 score calculator + metric UI
│   ├── vulnmgmt.js         # Vulnerability cards, status, filtering
│   ├── report.js           # XML report generator
│   └── storage.js          # localStorage persistence
├── server.js               # Express static server (deployment)
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

| Group             | Metric                   | Values                                     |
|-------------------|--------------------------|--------------------------------------------|
| Exploitability    | Attack Vector (AV)       | Network · Adjacent · Local · Physical      |
| Exploitability    | Attack Complexity (AC)   | Low · High                                 |
| Exploitability    | Attack Requirements (AT) | None · Present                             |
| Exploitability    | Privileges Required (PR) | None · Low · High                          |
| Exploitability    | User Interaction (UI)    | None · Passive · Active                    |
| Vulnerable System | Confidentiality (VC)     | None · Low · High                          |
| Vulnerable System | Integrity (VI)           | None · Low · High                          |
| Vulnerable System | Availability (VA)        | None · Low · High                          |
| Subsequent System | Confidentiality (SC)     | None · Low · High                          |
| Subsequent System | Integrity (SI)           | None · Low · High · Safety                 |
| Subsequent System | Availability (SA)        | None · Low · High · Safety                 |

---

## 🛠️ Tech Stack

| Layer     | Technology                                   |
|-----------|----------------------------------------------|
| Frontend  | Vanilla HTML5 / CSS3 / ES6+ JavaScript       |
| Diagrams  | Custom SVG editor (no external lib)          |
| Server    | Node.js + Express (optional)                 |
| Storage   | Browser localStorage + JSON export           |
| License   | Apache 2.0                                   |

No build step. No framework. No external frontend dependencies.

---

## 📜 License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Pull requests welcome. Please open an issue first to discuss what you would like to change.
