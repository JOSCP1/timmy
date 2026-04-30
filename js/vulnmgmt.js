'use strict';

const VulnMgmt = (() => {
  let vulns        = [];
  let filterStatus = '';

  // ── Import from Threats ───────────────────────────────────────────────
  function importThreats(threats) {
    const existing = new Set(vulns.map(v => v.name + '|' + v.assetId));
    let added = 0;
    threats.forEach(t => {
      if (!existing.has(t.name + '|' + t.assetId)) {
        t.vulnId = IDCounter.nextV();
        vulns.push(t); added++;
      }
    });
    render(); updateBadge(); Assets.refresh(); App.autosave();
    if (added < threats.length)
      App.toast(`${added} new, ${threats.length - added} already existed.`, 'ok');
  }

  // ── Add manual ────────────────────────────────────────────────────────
  function addManual() {
    const v = {
      id:           'vuln_' + Math.random().toString(36).slice(2,9),
      vulnId:       IDCounter.nextV(),
      name:         'New Risk',
      category:     'Manual',
      description:  '',
      assetId:      '',
      assetName:    'Manual Entry',
      assetType:    'manual',
      status:       'Open',
      adversalId:   '',
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
    render(); updateBadge(); App.autosave();
    // Expand the first card after DOM update
    requestAnimationFrame(() => toggleCard(v.id));
  }

  // ── Render ────────────────────────────────────────────────────────────
  function render() {
    const list  = document.getElementById('vulnList');
    const empty = document.getElementById('vulnEmpty');
    if (!list || !empty) return;

    // Remove existing vuln cards but keep the empty placeholder
    [...list.children].forEach(c => { if (c.id !== 'vulnEmpty') c.remove(); });

    const shown = vulns.filter(v => !filterStatus || v.status === filterStatus);

    if (!shown.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    const adversalOpts = Adversal.getAll().map(ai =>
      `<option value="${ai.id}">${esc(ai.name)}</option>`
    ).join('');

    shown.forEach(v => {
      const q     = CVSS4.qualitative(v.cvssScore);
      const score = `<span class="score-badge ${q.cls}">${v.cvssScore||'—'}</span>`;
      const statusCls = { 'Open':'status-open','In Progress':'status-inprogress',
                          'Mitigated':'status-mitigated','Accepted':'status-accepted' };
      const stCls = statusCls[v.status] || '';
      const div   = document.createElement('div');
      div.innerHTML = `
        <div class="vuln-card" id="vcard_${v.id}">
          <div class="vuln-card-header" onclick="VulnMgmt.toggleCard('${v.id}')">
            <span class="id-chip" style="margin-right:4px">${esc(v.vulnId||'')}</span>
            ${score}
            <span class="vuln-title">${esc(v.name)}</span>
            <span class="vuln-category">${esc(v.category)}</span>
            <span class="vuln-asset">📦 ${esc(v.assetName)}</span>
            <select class="status-select ${stCls}" onchange="VulnMgmt.setStatus('${v.id}',this.value)" onclick="event.stopPropagation()">
              ${['Open','In Progress','Mitigated','Accepted'].map(s=>
                `<option value="${s}" ${v.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <span class="vuln-chevron">▾</span>
          </div>
          <div class="vuln-card-body">
            <div class="vuln-form">
              <div class="form-field full">
                <label>Risk Name</label>
                <input type="text" value="${esc(v.name)}" onchange="VulnMgmt.update('${v.id}','name',this.value)" />
              </div>
              <div class="form-field full">
                <label>Description</label>
                <textarea onchange="VulnMgmt.update('${v.id}','description',this.value)">${esc(v.description)}</textarea>
              </div>

              <!-- Adversal Impact link -->
              <div class="form-field full">
                <label>Adversal Impact <span style="color:var(--c-muted);font-weight:400">(overwrites CIA, privacy &amp; safety when selected)</span></label>
                <select onchange="VulnMgmt.applyAdversal('${v.id}',this.value)">
                  <option value="">— None —</option>
                  ${adversalOpts.replace(
                    `value="${v.adversalId||''}"`,
                    `value="${v.adversalId||''}" selected`
                  )}
                </select>
              </div>

              <!-- CVSS 4.0 -->
              ${CVSS4.metricsHTML(v.id, v.cvss)}

              <!-- Privacy & Safety -->
              <div class="form-field">
                <label>Privacy Impact</label>
                <select onchange="VulnMgmt.update('${v.id}','privacyImpact',this.value)">
                  ${['None','Low','Medium','High'].map(p=>
                    `<option value="${p}" ${v.privacyImpact===p?'selected':''}>${p}</option>`).join('')}
                </select>
              </div>
              <div class="form-field">
                <label>Safety Impact</label>
                <select onchange="VulnMgmt.update('${v.id}','safetyImpact',this.value)">
                  ${['None','Low','Medium','High','Critical'].map(p=>
                    `<option value="${p}" ${v.safetyImpact===p?'selected':''}>${p}</option>`).join('')}
                </select>
              </div>

              <!-- Controls -->
              <div class="form-field full">
                <label>Security Controls / Mitigation</label>
                <textarea onchange="VulnMgmt.update('${v.id}','controls',this.value)">${esc(v.controls)}</textarea>
              </div>
              <div class="form-field">
                <label>Residual Risk</label>
                <select onchange="VulnMgmt.update('${v.id}','residualRisk',this.value)">
                  ${['','None','Low','Medium','High','Critical'].map(r=>
                    `<option value="${r}" ${v.residualRisk===r?'selected':''}>${r||'— Not assessed'}</option>`).join('')}
                </select>
              </div>
              <div class="form-field">
                <label>Control Reference</label>
                <input type="text" placeholder="e.g. NIST SP 800-53 AC-3"
                  value="${esc(v.controlRef)}" onchange="VulnMgmt.update('${v.id}','controlRef',this.value)" />
              </div>
              <div class="form-field full">
                <label>Notes</label>
                <textarea rows="2" onchange="VulnMgmt.update('${v.id}','notes',this.value)">${esc(v.notes||'')}</textarea>
              </div>
              <div class="vuln-actions full">
                <button class="btn btn-ghost btn-sm" onclick="VulnMgmt.duplicate('${v.id}')">⧉ Duplicate</button>
                <button class="btn btn-danger btn-sm" onclick="VulnMgmt.remove('${v.id}')">🗑 Delete</button>
              </div>
            </div>
          </div>
        </div>`;
      list.appendChild(div.firstElementChild);
    });

    shown.forEach(v => CVSS4.updateDisplay(v.id, v.cvss));
  }

  function toggleCard(id) {
    document.getElementById('vcard_'+id)?.classList.toggle('expanded');
  }

  // ── Update methods ────────────────────────────────────────────────────
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
    const card = document.getElementById('vcard_'+id);
    if (card) {
      const badge = card.querySelector('.score-badge');
      const q = CVSS4.qualitative(v.cvssScore);
      if (badge) { badge.textContent=v.cvssScore; badge.className=`score-badge ${q.cls}`; }
    }
    App.autosave();
  }

  // Apply an adversal impact → overwrite CIA, privacy, safety
  function applyAdversal(vulnId, adversalId) {
    const v = vulns.find(v => v.id === vulnId);
    if (!v) return;
    v.adversalId = adversalId;
    if (adversalId) {
      const ai = Adversal.getAll().find(a => a.id === adversalId);
      if (ai) {
        const map = { N:'N', L:'L', M:'L', H:'H' };   // CIA scale → CVSS4 VC/VI/VA scale
        v.cvss.VC = map[ai.cia.c] || 'N';
        v.cvss.VI = map[ai.cia.i] || 'N';
        v.cvss.VA = map[ai.cia.a] || 'N';
        v.privacyImpact = ai.privacyImpact;
        v.safetyImpact  = ai.safetyImpact;
        v.cvssScore = CVSS4.score(v.cvss);
      }
    }
    render(); updateBadge(); App.autosave();
  }

  function setStatus(id, val) {
    const v = vulns.find(v => v.id === id);
    if (v) { v.status = val; updateBadge(); App.autosave(); }
  }

  function remove(id) {
    if (!confirm('Delete this risk entry?')) return;
    vulns = vulns.filter(v => v.id !== id);
    render(); updateBadge(); Assets.refresh(); App.autosave();
  }

  function duplicate(id) {
    const v = vulns.find(v => v.id === id);
    if (!v) return;
    const copy = JSON.parse(JSON.stringify(v));
    copy.id     = 'vuln_' + Math.random().toString(36).slice(2,9);
    copy.vulnId = IDCounter.nextV();
    copy.name  += ' (copy)';
    const idx = vulns.findIndex(v => v.id === id);
    vulns.splice(idx+1, 0, copy);
    render(); updateBadge(); App.autosave();
  }

  function filterFn(status) { filterStatus = status; render(); }

  function updateBadge() {
    document.getElementById('vulnBadge').textContent = vulns.length;
  }

  // ── Serialise ─────────────────────────────────────────────────────────
  function getAll()    { return vulns; }
  function setAll(arr) {
    vulns = (arr||[]).map(v => ({ ...v, vulnId: v.vulnId || IDCounter.nextV() }));
    render(); updateBadge();
  }

  return {
    importThreats, addManual, toggleCard,
    update, updateCVSS, applyAdversal, setStatus, remove, duplicate,
    filter: filterFn, getAll, setAll
  };
})();
