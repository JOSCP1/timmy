// ── Shared primitive types ─────────────────────────────────────────────────
type CIALevel = 'N' | 'L' | 'M' | 'H';
type ConnectionDirection = 'forward' | 'backward' | 'bidirectional';
type ElementType = 'process' | 'store' | 'trustzone';
type VulnStatus  = 'Open' | 'In Progress' | 'Mitigated' | 'Accepted';
type UserRole    = 'admin' | 'user';

interface CIAValues { c: CIALevel; i: CIALevel; a: CIALevel; }

// ── Diagram ────────────────────────────────────────────────────────────────
interface DiagramElement {
  id: string; tmId: string; type: ElementType; name: string;
  x: number; y: number;
  r?: number;           // process only
  w?: number; h?: number; // store / trustzone
  cia: CIAValues;
  justificationC: string;
  justificationI: string;
  justificationA: string;
  justification: string; // legacy general field kept for compatibility
}

interface DiagramConnection {
  id: string; tmId: string; name: string;
  src: string; tgt: string;
  cia: CIAValues;
  justificationC: string;
  justificationI: string;
  justificationA: string;
  justification: string;
  direction: ConnectionDirection;
}

interface DiagramData { elements: DiagramElement[]; connections: DiagramConnection[]; uid: number; }

interface AssetRecord {
  id: string; tmId: string; name: string;
  type: string; cia: CIAValues; justification: string;
}

// ── CVSS 4.0 ───────────────────────────────────────────────────────────────
interface CVSSMetrics {
  AV: string; AC: string; AT: string; PR: string; UI: string;
  VC: string; VI: string; VA: string; SC: string; SI: string; SA: string;
}
interface CVSSQualitative { label: string; cls: string; }

// ── Vulnerability ──────────────────────────────────────────────────────────
interface Vulnerability {
  id: string; vulnId: string; name: string; category: string;
  description: string; assetId: string; assetName: string; assetType: string;
  status: VulnStatus; adversalId: string;
  cvss: CVSSMetrics; cvssScore: number;
  privacyImpact: string; safetyImpact: string;
  controls: string; residualRisk: string; controlRef: string; notes: string;
}

// ── Adverse Impact (formerly Adversal) ────────────────────────────────────
interface AdverseImpact {
  id: string; name: string;
  cia: CIAValues; privacyImpact: string; safetyImpact: string;
}

// ── Auth / Session ─────────────────────────────────────────────────────────
interface SessionUser { username: string; role: UserRole; }
interface OIDCConfig { enabled: boolean; authority: string; clientId: string; scopes: string; }

// ── Audit ──────────────────────────────────────────────────────────────────
interface AuditEntry { ts: string; user: string; action: string; details?: Record<string, unknown>; ip?: string; }

// ── Storage ────────────────────────────────────────────────────────────────
interface ProjectData {
  projectName: string; productName?: string;
  idCounters: { tm: number; v: number; ai: number };
  diagram: DiagramData;
  assetOrder: string[];
  vulnerabilities: Vulnerability[];
  adversal: AdverseImpact[];
}

// ── Module interfaces (for cross-file type declarations) ───────────────────
interface IDCounterModule {
  nextTM(): string; nextV(): string; nextAI(): string;
  getData(): { tm: number; v: number; ai: number };
  setData(d: { tm?: number; v?: number; ai?: number } | null): void;
}
interface StorageModule { load(): ProjectData | null; save(d: ProjectData): void; clear(): void; }
interface CVSS4Module {
  score(m?: Partial<CVSSMetrics>): number;
  qualitative(s: number): CVSSQualitative;
  vector(m?: Partial<CVSSMetrics>): string;
  metricsHTML(vid: string, m?: Partial<CVSSMetrics>): string;
  updateDisplay(vid: string, m: Partial<CVSSMetrics>): void;
  DEFAULTS: CVSSMetrics;
}
interface DiagramModule {
  init(): void; getData(): DiagramData; setData(d: Partial<DiagramData>): void;
  getAllAssets(): AssetRecord[]; getElements(): DiagramElement[]; getConnections(): DiagramConnection[];
  deleteSelected(): void;
  updateProp(id: string, key: string, val: string): void;
  updateCIA(id: string, key: string, val: string): void;
  updateConnProp(id: string, key: string, val: string): void;
  updateConnCIA(id: string, key: string, val: string): void;
  zoomIn(): void; zoomOut(): void; resetView(): void; exportSVG(): void;
  focusElement(id: string): void;
}
interface AdversalModule {
  add(): void; remove(id: string): void; update(id: string, field: string, val: string): void;
  render(): void; getAll(): AdverseImpact[]; setAll(arr: AdverseImpact[]): void;
}
interface AssetsModule {
  refresh(): void; filter(val: string): void; search(q: string): void;
  moveUp(id: string): void; moveDown(id: string): void; exportCSV(): void;
  getOrder(): string[]; setOrder(arr: string[]): void;
}
interface ThreatsModule { identify(): void; }
interface VulnMgmtModule {
  importThreats(t: Vulnerability[]): void; addManual(): void; toggleCard(id: string): void;
  update(id: string, key: string, val: string): void;
  updateCVSS(id: string, metric: string, val: string): void;
  applyAdversal(vulnId: string, adversalId: string): void;
  setStatus(id: string, val: string): void;
  remove(id: string): void; duplicate(id: string): void;
  filter(status: string): void; getAll(): Vulnerability[]; setAll(arr: Vulnerability[]): void;
}
interface ReportModule { exportXML(): void; }
interface AuditModule  { log(action: string, details?: Record<string, unknown>): void; }
interface AuthModule {
  init(): Promise<void>; submitLogin(): Promise<void>; logout(): Promise<void>;
  currentUser(): SessionUser | null; isAdmin(): boolean; startOIDC(): Promise<void>;
  listUsers(): Promise<{ username: string; role: UserRole; created: string }[]>;
  addUser(u: string, p: string, r: UserRole): Promise<string | null>;
  removeUser(u: string): Promise<string | null>;
  changePassword(u: string, p: string): Promise<string | null>;
  getOIDC(): OIDCConfig; saveOIDC(c: OIDCConfig): void;
}
interface SettingsModule { render(): void; saveOIDC(): void; applyTheme(t: string): void; }
interface AppModule {
  init(): Promise<void>; switchView(name: string): void; autosave(): void;
  save(): void; saveAs(): void; load(): void; handleFileLoad(e: Event): void;
  openModal(title: string, body: string, footer?: string): void;
  closeModal(): void; toast(msg: string, type?: string): void;
}

// ── Global helper (defined in storage.ts, used everywhere) ────────────────
declare function esc(s: unknown): string;
