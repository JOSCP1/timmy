'use strict';

const VulnMgmt = (() => {
  let vulns = [];
  let filterStatus = '';

  // ── Import from Threat identification ────────────────────────────
  function importThreats(threats) {
    // Deduplicate by name+assetId
    const existing = new Set(vulns.map(v => v.name + '|' + v.assetId));
    let added = 0;
    threats.forEach(t => {
      if (!existing.has(t.name + '|' + t.assetId)) {
        vulns.push(t); added++;
      }
    });
    render();
    Assets.refresh();
    updateBadge();
    App.autosave();
    if (added < threats.length) {
      App.toast(`${added} new, ${threats.length - added} already existed.`, 'ok');
    }
  }

  function addManual() {
    const v = {
      id:           'vuln_' + Math.random().toString(36).slice(2,9),
      name:         'New Vulnerability',
      category:     'Manual',
      description:  '',
      assetId:      '',
      assetName:    'Manual Entry',
      assetType:    'manual',
      status:       'Open',
      cvss:         { ...CVSS4.DEFAULTS },
      cvssScore:    0,
      privacyImpact:'None',
      safetyImpact: 'None',
      controls:     '',
      residualRisk: '',
      controlRef:   '',
      notes:        '',
    };
    vulns.unshift(v);
    render();
    updateBadge();
    App.autosave();
    // Auto-expand first card
    setTimeout(() => toggleCard(v.id), 50);
  }

  // ── Render ────────────────────────────────────────────────────────
  function render() {
    const list  = document.getElementById('vulnList');
    const empty = document.getElementById('vulnEmpty');
    const shown = vulns.filter(v => !filterStatus || v.status === filterStatus);

    if (!shown.length) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = shown.map(v => {
      const q   = CVSS4.qualitative(v.cvssScore);
      const badge = `<span class="score-badge ${q.cls}">${v.cvssScore || '—'}</span>`;
      const statusCls = { Open:'status-open','In Progress':'status-inprogress',
                          Mitigated:'status-mitigated',Accepted:'status-accepted' }[v.status] || '';
      return `
      <div class="vuln-card" id="vcard_${v.id}">
        <div class="vuln-card-header" onclick="VulnMgmt.toggleCard('${v.id}')">
          ${badge}
          <span class="vuln-title">${esc(v.name)}</span>
          <span class="vuln-category">${esc(v.category)}</span>
          <span class="vuln-asset">📦 ${esc(v.assetName)}</span>
          <select class="status-select ${statusCls}" onchange="VulnMgmt.setStatus('${v.id}',this.value)" onclick="event.stopPropagation()">
            ${['Open','In Progress','Mitigated','Accepted'].map(s =>
              `<option value="${s}" ${v.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <span class="vuln-chevron">▾</span>
        </div>
        <div class="vuln-card-body">
          <div class="vuln-form">
            <div class="form-field full">
              <label>Vulnerability Name</label>
              <input type="text" value="${esc(v.name)}" onchange="VulnMgmt.update('${v.id}','name',this.value)" />
            </div>
            <div class="form-field full">
              <label>Description</label>
              <textarea onchange="VulnMgmt.update('${v.id}','description',this.value)">${esc(v.description)}</textarea>
            </div>

            <!-- CVSS 4.0 -->
            ${CVSS4.metricsHTML(v.id, v.cvss)}

            <!-- Privacy & Safety Impact -->
            <div class="form-field">
              <label>Privacy Impact</label>
              <select onchange="VulnMgmt.update('${v.id}','privacyImpact',this.value)">
                ${['None','Low','Medium','High'].map(p =>
                  `<option value="${p}" ${v.privacyImpact===p?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="form-field">
              <label>Safety Impact</label>
              <select onchange="VulnMgmt.update('${v.id}','safetyImpact',this.value)">
                ${['None','Low','Medium','High','Critical'].map(p =>
                  `<option value="${p}" ${v.safetyImpact===p?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>

            <!-- Controls & Residual -->
            <div class="form-field full">
              <label>Security Controls / Mitigation</label>
              <textarea onchange="VulnMgmt.update('${v.id}','controls',this.value)">${esc(v.controls)}</textarea>
            </div>
            <div class="form-field">
              <label>Residual Risk</label>
              <select onchange="VulnMgmt.update('${v.id}','residualRisk',this.value)">
                ${['','None','Low','Medium','High','Critical'].map(r =>
                  `<option value="${r}" ${v.residualRisk===r?'selected':''}>${r||'— Not assessed'}</option>`).join('')}
              </select>
            </div>
            <div class="form-field">
              <label>Control Reference</label>
              <input type="text" placeholder="e.g. NIST SP 800-53 AC-3, ISO 27001 A.9.4"
                value="${esc(v.controlRef)}" onchange="VulnMgmt.update('${v.id}','controlRef',this.value)" />
            </div>
            <div class="form-field full">
              <label>Notes</label>
              <textarea rows="2" onchange="VulnMgmt.update('${v.id}','notes',this.value)">${esc(v.notes)}</textarea>
            </div>

            <div class="vuln-actions full">
              <button class="btn btn-ghost btn-sm" onclick="VulnMgmt.duplicate('${v.id}')">⧉ Duplicate</button>
              <button class="btn btn-danger btn-sm" onclick="VulnMgmt.remove('${v.id}')">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    // Update CVSS displays
    shown.forEach(v => CVSS4.updateDisplay(v.id, v.cvss));
  }

  function toggleCard(id) {
    document.getElementById('vcard_' + id)?.classList.toggle('expanded');
  }

  // ── Update methods ────────────────────────────────────────────────
  function update(id, key, val) {
    const v = vulns.find(v => v.id === id);
    if (v) { v[key] = val; App.autosave(); }
  }

  function updateCVSS(id, metric, val) {
    const v = vulns.find(v => v.id === id);
    if (!v) return;
    v.cvss[metric] = val;
    v.cvssScore = CVSS4.score(v.cvss);
    CVSS4.updateDisplay(id, v.cvss);
    // Update badge in header
    const card = document.getElementById('vcard_' + id);
    if (card) {
      const badge = card.querySelector('.score-badge');
      const q = CVSS4.qualitative(v.cvssScore);
      if (badge) { badge.textContent = v.cvssScore; badge.className = `score-badge ${q.cls}`; }
    }
    App.autosave();
  }

  function setStatus(id, val) {
    const v = vulns.find(v => v.id === id);
    if (v) { v.status = val; App.autosave(); updateBadge(); }
  }

  function remove(id) {
    if (!confirm('Delete this vulnerability?')) return;
    vulns = vulns.filter(v => v.id !== id);
    render(); updateBadge(); Assets.refresh(); App.autosave();
  }

  function duplicate(id) {
    const v = vulns.find(v => v.id === id);
    if (!v) return;
    const copy = JSON.parse(JSON.stringify(v));
    copy.id   = 'vuln_' + Math.random().toString(36).slice(2,9);
    copy.name = copy.name + ' (copy)';
    const idx = vulns.findIndex(v => v.id === id);
    vulns.splice(idx+1, 0, copy);
    render(); updateBadge(); App.autosave();
  }

  function filter(status) {
    filterStatus = status;
    render();
  }

  function updateBadge() {
    const open = vulns.filter(v => v.status === 'Open').length;
    document.getElementById('vulnBadge').textContent = vulns.length;
  }

  // ── Serialise ─────────────────────────────────────────────────────
  function getAll()    { return vulns; }
  function setAll(arr) { vulns = arr || []; render(); updateBadge(); }

  return {
    importThreats, addManual, toggleCard,
    update, updateCVSS, setStatus, remove, duplicate, filter,
    getAll, setAll
  };
})();
