'use strict';

const CVSS4 = (() => {

  // Metric weights based on CVSS 4.0 specification
  const W = {
    AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.20 },
    AC: { L: 0.77, H: 0.44 },
    AT: { N: 0.85, P: 0.44 },
    PR: { N: 0.85, L: 0.62, H: 0.27 },
    UI: { N: 0.85, P: 0.62, A: 0.43 },
    VC: { N: 0.00, L: 0.22, H: 0.56 },
    VI: { N: 0.00, L: 0.22, H: 0.56 },
    VA: { N: 0.00, L: 0.22, H: 0.56 },
    SC: { N: 0.00, L: 0.22, H: 0.56 },
    SI: { N: 0.00, L: 0.22, H: 0.56, S: 0.90 },
    SA: { N: 0.00, L: 0.22, H: 0.56, S: 0.90 }
  };

  const DEFAULTS = {
    AV:'N', AC:'L', AT:'N', PR:'N', UI:'N',
    VC:'N', VI:'N', VA:'N', SC:'N', SI:'N', SA:'N'
  };

  function score(m = {}) {
    const v = { ...DEFAULTS, ...m };
    const expl = 8.22
      * (W.AV[v.AV] ?? 0) * (W.AC[v.AC] ?? 0) * (W.AT[v.AT] ?? 0)
      * (W.PR[v.PR] ?? 0) * (W.UI[v.UI] ?? 0);

    const iVS = 1 - (1 - (W.VC[v.VC]??0)) * (1 - (W.VI[v.VI]??0)) * (1 - (W.VA[v.VA]??0));
    const iSS = 0.4 * (1 - (1 - (W.SC[v.SC]??0)) * (1 - (W.SI[v.SI]??0)) * (1 - (W.SA[v.SA]??0)));

    if (iVS + iSS === 0) return 0.0;

    const raw = Math.min(1, expl) * Math.min(1, iVS + iSS);
    return parseFloat(Math.min(10, raw * 10).toFixed(1));
  }

  function qualitative(s) {
    if (s === 0)        return { label: 'None',     cls: 'score-none' };
    if (s < 4.0)        return { label: 'Low',      cls: 'score-low' };
    if (s < 7.0)        return { label: 'Medium',   cls: 'score-medium' };
    if (s < 9.0)        return { label: 'High',     cls: 'score-high' };
    return               { label: 'Critical', cls: 'score-critical' };
  }

  function vector(m = {}) {
    const v = { ...DEFAULTS, ...m };
    return `CVSS:4.0/AV:${v.AV}/AC:${v.AC}/AT:${v.AT}/PR:${v.PR}/UI:${v.UI}/VC:${v.VC}/VI:${v.VI}/VA:${v.VA}/SC:${v.SC}/SI:${v.SI}/SA:${v.SA}`;
  }

  // Returns an HTML string for the CVSS 4.0 metric selectors bound to a vuln id
  function metricsHTML(vid, m = {}) {
    const v = { ...DEFAULTS, ...m };
    const sel = (name, opts) => {
      const options = opts.map(([val, lbl]) =>
        `<option value="${val}" ${v[name]===val?'selected':''}>${lbl}</option>`
      ).join('');
      return `<select name="${name}" onchange="VulnMgmt.updateCVSS('${vid}','${name}',this.value)">${options}</select>`;
    };
    return `
      <div class="cvss-section">
        <h4>CVSS 4.0 Base Metrics</h4>
        <div class="cvss-grid">
          <div class="form-field"><label>AV</label>${sel('AV',[['N','Network'],['A','Adjacent'],['L','Local'],['P','Physical']])}</div>
          <div class="form-field"><label>AC</label>${sel('AC',[['L','Low'],['H','High']])}</div>
          <div class="form-field"><label>AT</label>${sel('AT',[['N','None'],['P','Present']])}</div>
          <div class="form-field"><label>PR</label>${sel('PR',[['N','None'],['L','Low'],['H','High']])}</div>
          <div class="form-field"><label>UI</label>${sel('UI',[['N','None'],['P','Passive'],['A','Active']])}</div>
          <div class="form-field"><label>VC</label>${sel('VC',[['N','None'],['L','Low'],['H','High']])}</div>
          <div class="form-field"><label>VI</label>${sel('VI',[['N','None'],['L','Low'],['H','High']])}</div>
          <div class="form-field"><label>VA</label>${sel('VA',[['N','None'],['L','Low'],['H','High']])}</div>
          <div class="form-field"><label>SC</label>${sel('SC',[['N','None'],['L','Low'],['H','High']])}</div>
          <div class="form-field"><label>SI</label>${sel('SI',[['N','None'],['L','Low'],['H','High'],['S','Safety']])}</div>
          <div class="form-field"><label>SA</label>${sel('SA',[['N','None'],['L','Low'],['H','High'],['S','Safety']])}</div>
        </div>
        <div class="cvss-score-display">
          <label>Score:</label>
          <span class="score-value" id="cvssScore_${vid}">—</span>
          <span class="score-label" id="cvssLabel_${vid}"></span>
          <span style="font-size:10px;color:var(--c-muted);margin-left:8px" id="cvssVector_${vid}"></span>
        </div>
      </div>`;
  }

  function updateDisplay(vid, m) {
    const s = score(m);
    const q = qualitative(s);
    const el = document.getElementById(`cvssScore_${vid}`);
    const ll = document.getElementById(`cvssLabel_${vid}`);
    const vv = document.getElementById(`cvssVector_${vid}`);
    if (el) { el.textContent = s; el.className = `score-value ${q.cls}`; el.style.color=''; }
    if (ll) ll.textContent = q.label;
    if (vv) vv.textContent = vector(m);
  }

  return { score, qualitative, vector, metricsHTML, updateDisplay, DEFAULTS };
})();
