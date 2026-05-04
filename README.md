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

## 🚀 Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (bundled with Node.js)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/JOSCP1/timmy.git
cd timmy

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Then open **http://localhost:3000** in your browser.

> **Note:** Timmy must be served through Node.js — opening `index.html` directly as a file
> will not work because authentication and the audit log require the backend API.

### First Login

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

**Change the default password immediately** after first login via Settings → User Management.

### Environment Variables

| Variable         | Default                                        | Description                              |
|------------------|------------------------------------------------|------------------------------------------|
| `PORT`           | `3000`                                         | HTTP port the server listens on          |
| `SESSION_SECRET` | `timmy-dev-secret-change-in-production`        | Secret used to sign session cookies — **must be changed in production** |

Example for production:
```bash
SESSION_SECRET=your-long-random-secret PORT=8080 node server.js
```

### Data Storage

All user data is stored locally in the `data/` directory (created automatically on first run):

| File               | Contents                                    |
|--------------------|---------------------------------------------|
| `data/users.json`  | Hashed user credentials (bcrypt, cost 10)   |
| `data/audit.jsonl` | Append-only audit log (JSON Lines format)   |

Project data (diagrams, risks, etc.) is stored in the browser's `localStorage` and can be exported as `.json` files via the Save As button.

> `data/` is git-ignored and never committed to the repository.

### Building TypeScript (optional)

The compiled JavaScript in `js/` is committed alongside the TypeScript source in `src/`.
If you modify the TypeScript source, recompile with:

```bash
npm run build   # compile once
npm run watch   # watch mode
```

Requires TypeScript to be installed (included as a dev dependency via `npm install`).

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
│   ├── audit.ts            # Audit log client
│   ├── auth.ts             # Authentication (calls backend API)
│   ├── settings.ts         # Settings UI
│   └── app.ts              # App controller
├── js/                     # Compiled JavaScript (generated from src/)
├── css/
│   └── style.css           # All styles including night mode
├── images/
│   └── timmy.png           # Application logo
├── data/                   # Runtime data — git-ignored, auto-created
│   ├── users.json          # User accounts (bcrypt hashed)
│   └── audit.jsonl         # Audit log
├── index.html              # Single-page application shell
├── server.js               # Express server (auth API + static files)
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

| Layer          | Technology                                          |
|----------------|-----------------------------------------------------|
| Frontend       | TypeScript 5 → compiled Vanilla JS (no framework)  |
| Diagrams       | Custom SVG editor (zero external dependencies)      |
| Server         | Node.js + Express                                   |
| Authentication | bcrypt (cost 10) + express-session (server-side)    |
| SSO            | OpenID Connect / PKCE (Azure AD, Okta, generic)     |
| Storage        | Browser localStorage + JSON project export          |
| License        | Apache 2.0                                          |

---

## 📜 License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Pull requests welcome. Please open an issue first to discuss what you would like to change.
