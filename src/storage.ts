// ── Global HTML escape ─────────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Global ID counters ─────────────────────────────────────────────────────
const IDCounter: IDCounterModule = {
  _tm: 0, _v: 0, _ai: 0,
  nextTM() { return `TM-${++this._tm}`; },
  nextV()  { return `V-${++this._v}`; },
  nextAI() { return `AI-${++this._ai}`; },
  getData() { return { tm: this._tm, v: this._v, ai: this._ai }; },
  setData(d) { if (d) { this._tm = d.tm||0; this._v = d.v||0; this._ai = d.ai||0; } },
} as IDCounterModule & { _tm: number; _v: number; _ai: number };

// ── Storage ────────────────────────────────────────────────────────────────
const Storage: StorageModule = (() => {
  const KEY     = 'timmy_data';
  const OLD_KEY = 'olysec_data';

  function load(): ProjectData | null {
    try {
      const legacy = localStorage.getItem(OLD_KEY);
      if (legacy && !localStorage.getItem(KEY)) {
        localStorage.setItem(KEY, legacy);
        localStorage.removeItem(OLD_KEY);
      }
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) as ProjectData : null;
    } catch { return null; }
  }

  function save(data: ProjectData): void {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota */ }
  }

  function clear(): void { localStorage.removeItem(KEY); }

  return { load, save, clear };
})();
