'use strict';

const RacAssessment = (() => {
  let entries = [];
  let wSeq = 0, vSeq = 0;

  function uid()    { return 'rac_' + Math.random().toString(36).slice(2,9); }
  function nextId(type) {
    return type === 'weakness'
      ? `W${String(++wSeq).padStart(3,'0')}`
      : `V${String(++vSeq).padStart(3,'0')}`;
  }

  // ── Build entry from scratch or pre-filled from a threat ───────────────
  function buildEntry(type, threat = null) {
    const cvss  = threat ? { ...threat.cvss }  : { ...CVSS4.DEFAULTS };
    const score = threat ? (threat.cvssScore || 0) : 0;
    return {
      _uid: uid(),
      id:   nextId(type),
      type,
      // Identification
      originId: '', shortDescription: threat ? threat.name : '',
      longDescription: threat ? (threat.description || '') : '',
      conditions: '',
      affectedAssets: threat ? (threat.assetName || '') : '',
      relatedVersions: '', affectedComponents: '', componentOrigin: 'Internal',
      // Risk Evaluation
      rationalForApplicability: '',
      publishedCvssScore: '',
      cvss, cvssScore: score,
      cvssVector: score ? CVSS4.vector(cvss) : '',
      initialRating: score ? CVSS4.qualitative(score).label : '',
      privacyImpact: threat ? (threat.privacyImpact || 'None') : 'None',
      safetyImpact:  threat ? (threat.safetyImpact  || 'None') : 'None',
      otherImpact: '', safetyRiskReference: '',
      // Control Measures
      existingControlMeasures:  threat ? (threat.controls   || '') : '',
      potentialControlMeasures: '', controlMeasuresSelection: '',
      targetVersion: '',
      implementationReference: threat ? (threat.controlRef || '') : '',
      effectivenessReference: '',
      // Residual Risk
      residualCvss: { ...CVSS4.DEFAULTS },
      residualCvssScore: 0, residualCvssVector: '',
      riskBenefitRating: '', residualRiskAcceptance: '',
      decisionAuthority: '', decisionDate: '',
      comments: threat ? (threat.notes || '') : '',
      // Reference
      linkedThreatId: threat ? threat.id : '',
    };
  }

  // ── Creation dialog ────────────────────────────────────────────────────
  function addEntry(type = 'vulnerability') {
    const vulns = VulnMgmt.getAll();
    const opts  = `<option value="">— None (standalone) —</option>` +
      vulns.map(v =>
        `<option value="${v.id}">[${esc(v.vulnId||'')}] ${esc(v.name)}</option>`
      ).join('');
    App.openModal('New Risk Assessment Entry', `
      <div class="vuln-form">
        <div class="form-field"><label>Entry Type</label>
          <select id="rac_new_type">
            <option value="vulnerability" ${'vulnerability'===type?'selected':''}>Vulnerability (V###)</option>
            <option value="weakness"      ${'weakness'===type?'selected':''}     >Weakness (W###)</option>
          </select></div>
        <div class="form-field full"><label>Import values from Threat (optional)</label>
          <select id="rac_new_threat" style="width:100%">${opts}</select></div>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="RacAssessment.confirmAdd()">Create &amp; Edit</button>`);
  }

  function confirmAdd() {
    const type     = document.getElementById('rac_new_type')?.value || 'vulnerability';
    const threatId = document.getElementById('rac_new_threat')?.value || '';
    const threat   = threatId ? VulnMgmt.getAll().find(v => v.id === threatId) : null;
    const entry    = buildEntry(type, threat);
    entries.push(entry);
    App.closeModal();
    App.autosave();
    editEntry(entry._uid);
  }

  // ── CVSS helper (bound to RacAssessment, not VulnMgmt) ────────────────
  function racCvssHTML(uid_, m = {}) {
    const v = { ...CVSS4.DEFAULTS, ...m };
    const sel = (name, opts) =>
      `<select onchange="RacAssessment.updateCvss('${uid_}','${name}',this.value)">${
        opts.map(([val,lbl]) =>
          `<option value="${val}" ${v[name]===val?'selected':''}>${lbl}</option>`
        ).join('')
      }</select>`;
    return `
      <div class="cvss-section" style="grid-column:1/-1">
        <h4>CVSS 4.0 — Internal Assessment</h4>
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
          <span class="score-value" id="cvssScore_${uid_}">—</span>
          <span class="score-label" id="cvssLabel_${uid_}"></span>
          <span style="font-size:10px;color:var(--c-muted);margin-left:8px" id="cvssVector_${uid_}"></span>
        </div>
      </div>`;
  }

  function updateCvss(uid_, metric, val) {
    const e = entries.find(x => x._uid === uid_); if (!e) return;
    e.cvss[metric]  = val;
    e.cvssScore     = CVSS4.score(e.cvss);
    e.cvssVector    = CVSS4.vector(e.cvss);
    e.initialRating = CVSS4.qualitative(e.cvssScore).label;
    CVSS4.updateDisplay(uid_, e.cvss);
    const ir = document.getElementById('r_initRating');
    if (ir) ir.value = e.initialRating;
    App.autosave();
  }

  function racResidualCvssHTML(uid_, m = {}) {
    const v = { ...CVSS4.DEFAULTS, ...m };
    const sel = (name, opts) =>
      `<select onchange="RacAssessment.updateResidualCvss('${uid_}','${name}',this.value)">${
        opts.map(([val,lbl]) =>
          `<option value="${val}" ${v[name]===val?'selected':''}>${lbl}</option>`
        ).join('')
      }</select>`;
    return `
      <div class="cvss-section" style="grid-column:1/-1">
        <h4>CVSS 4.0 — Residual Assessment (after controls)</h4>
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
          <label>Residual Score:</label>
          <span class="score-value" id="rcvssScore_${uid_}">—</span>
          <span class="score-label" id="rcvssLabel_${uid_}"></span>
          <span style="font-size:10px;color:var(--c-muted);margin-left:8px" id="rcvssVector_${uid_}"></span>
        </div>
      </div>`;
  }

  function updateResidualCvss(uid_, metric, val) {
    const e = entries.find(x => x._uid === uid_); if (!e) return;
    if (!e.residualCvss) e.residualCvss = { ...CVSS4.DEFAULTS };
    e.residualCvss[metric] = val;
    e.residualCvssScore    = CVSS4.score(e.residualCvss);
    e.residualCvssVector   = CVSS4.vector(e.residualCvss);
    // Update display using temp element IDs with 'r' prefix
    const s = e.residualCvssScore, q = CVSS4.qualitative(s);
    const se = document.getElementById(`rcvssScore_${uid_}`);
    const le = document.getElementById(`rcvssLabel_${uid_}`);
    const ve = document.getElementById(`rcvssVector_${uid_}`);
    if (se) { se.textContent = s; se.className = `score-value ${q.cls}`; }
    if (le) le.textContent = q.label;
    if (ve) ve.textContent = e.residualCvssVector;
    App.autosave();
  }

  // ── Full edit modal ────────────────────────────────────────────────────
  function editEntry(uid_) {
    const e = entries.find(x => x._uid === uid_); if (!e) return;
    const linked = e.linkedThreatId
      ? VulnMgmt.getAll().find(v => v.id === e.linkedThreatId) : null;
    const D = (id, val='') => `<input type="text" id="${id}" value="${esc(val)}" style="width:100%" />`;
    const TA = (id, val='', rows=2) =>
      `<textarea id="${id}" rows="${rows}" style="width:100%;font-family:inherit;font-size:13px;padding:5px 8px;border:1px solid var(--c-border);border-radius:4px;resize:vertical">${esc(val)}</textarea>`;
    const SEL = (id, val, opts) =>
      `<select id="${id}" style="width:100%">${opts.map(([v,l])=>
        `<option value="${v}" ${val===v?'selected':''}>${l}</option>`).join('')}</select>`;
    const FF = (label, content, full=false) =>
      `<div class="form-field${full?' full':''}""><label>${label}</label>${content}</div>`;

    const body = `
      <div class="rac-form">

        <div class="rac-section rac-s-id">
          <div class="rac-section-title">Identification — Weaknesses and Vulnerabilities</div>
          <div class="rac-grid">
            ${FF('ID',`<input type="text" value="${esc(e.id)}" disabled style="color:var(--c-muted);background:#f1f5f9;width:100%"/>`)}
            ${FF('Type',`<input type="text" value="${e.type==='weakness'?'Weakness':'Vulnerability'}" disabled style="color:var(--c-muted);background:#f1f5f9;width:100%"/>`)}
            ${FF('Origin ID',D('r_originId',e.originId))}
            ${FF('Short Description',D('r_shortDesc',e.shortDescription))}
            ${FF('Long Description',TA('r_longDesc',e.longDescription),true)}
            ${FF('Conditions',TA('r_conditions',e.conditions),true)}
            ${FF('Affected Assets',D('r_assets',e.affectedAssets))}
            ${FF('Related Versions',D('r_versions',e.relatedVersions))}
            ${FF('Affected Components',D('r_comps',e.affectedComponents))}
            ${FF('Components Origin',SEL('r_origin',e.componentOrigin,
              [['Internal','Internal'],['Third Party','Third Party'],['Service','Service']]))}
          </div>
        </div>

        <div class="rac-section rac-s-risk">
          <div class="rac-section-title">Risk Evaluation</div>
          <div class="rac-grid">
            ${FF('Rational for Applicability',TA('r_rational',e.rationalForApplicability),true)}
            ${FF('Published CVSS Score',D('r_pubCvss',e.publishedCvssScore))}
            ${FF('Initial Rating',`<input type="text" id="r_initRating" value="${esc(e.initialRating)}"
              readonly style="color:var(--c-muted);background:#f1f5f9;width:100%" />`)}
            ${racCvssHTML(e._uid, e.cvss)}
            ${FF('Privacy Impact',SEL('r_privacy',e.privacyImpact,
              [['None','None'],['Low','Low'],['Medium','Medium'],['High','High']]))}
            ${FF('Safety Impact',SEL('r_safety',e.safetyImpact,
              [['None','None'],['Low','Low'],['Medium','Medium'],['High','High'],['Critical','Critical']]))}
            ${FF('Other Impact',D('r_otherImpact',e.otherImpact))}
            ${FF('Reference to Safety Risk Management',D('r_safetyRef',e.safetyRiskReference))}
          </div>
        </div>

        <div class="rac-section rac-s-ctrl">
          <div class="rac-section-title">Control Measures</div>
          <div class="rac-grid">
            ${FF('Existing Control Measures',TA('r_existing',e.existingControlMeasures),true)}
            ${FF('Potential Control Measures',TA('r_potential',e.potentialControlMeasures),true)}
            ${FF('Control Measures Selection',TA('r_selected',e.controlMeasuresSelection),true)}
            ${FF('Target Version',D('r_targetVer',e.targetVersion))}
            ${FF('Implementation Reference',D('r_implRef',e.implementationReference))}
            ${FF('Effectiveness Reference',D('r_effRef',e.effectivenessReference))}
          </div>
        </div>

        <div class="rac-section rac-s-resid">
          <div class="rac-section-title">Residual Risk Evaluation and Treatment Governance</div>
          <div class="rac-grid">
            ${racResidualCvssHTML(e._uid, e.residualCvss || {})}
            ${FF('Risk Benefit Rating',SEL('r_rbr',e.riskBenefitRating,
              [['','— Select —'],['Acceptable','Acceptable'],['Not Acceptable','Not Acceptable'],['Conditionally Acceptable','Conditionally Acceptable']]))}
            ${FF('Residual Risk Acceptance',SEL('r_rra',e.residualRiskAcceptance,
              [['','— Select —'],['Accepted','Accepted'],['Not Accepted','Not Accepted'],['In Review','In Review']]))}
            ${FF('Decision Authority (Role / Name)',D('r_decAuth',e.decisionAuthority))}
            ${FF('Decision Date',`<input type="date" id="r_decDate" value="${esc(e.decisionDate)}" style="width:100%" />`)}
            ${FF('Comments',TA('r_comments',e.comments),true)}
          </div>
        </div>

        <div class="rac-section" style="background:#f8fafc">
          <div class="rac-section-title" style="background:transparent;color:var(--c-muted)">Threat Reference</div>
          <div style="padding:10px 14px;display:flex;flex-direction:column;gap:10px">
            <div class="form-field">
              <label>Linked Threat</label>
              <select id="r_linkedThreat" style="width:100%">
                <option value="">— None —</option>
                ${VulnMgmt.getAll().map(v =>
                  `<option value="${v.id}" ${e.linkedThreatId===v.id?'selected':''}>[${esc(v.vulnId||'')}] ${esc(v.name)}</option>`
                ).join('')}
              </select>
            </div>
            <label class="checkbox-label">
              <input type="checkbox" id="r_reimport" />
              Re-import CVSS, privacy/safety impact, affected asset, controls and notes from the selected threat
            </label>
            ${linked ? `<a class="affected-item-link" style="align-self:flex-start" href="#"
              onclick="App.switchView('vuln-mgmt');VulnMgmt.toggleCard('${linked.id}');return false;">
              <span class="id-chip">${esc(linked.vulnId||'')}</span> Jump to current threat ↗</a>` : ''}
          </div>
        </div>

      </div>`;

    // Widen the modal for all the fields
    const modal = document.getElementById('modal');
    if (modal) modal.style.width = 'min(1100px,95vw)';
    App.openModal(`${e.id} — ${e.shortDescription || 'Edit Entry'}`, body,
      `<button class="btn btn-ghost" onclick="RacAssessment.cancelEdit()">Cancel</button>
       <button class="btn btn-danger btn-sm" onclick="RacAssessment.deleteEntry('${e._uid}')">🗑 Delete</button>
       <button class="btn btn-primary" onclick="RacAssessment.confirmEdit('${e._uid}')">💾 Save</button>`);
    requestAnimationFrame(() => {
      CVSS4.updateDisplay(e._uid, e.cvss);
      // Init residual CVSS display
      if (e.residualCvss) updateResidualCvss(e._uid, 'AV', e.residualCvss.AV ?? 'N');
    });
  }

  function cancelEdit() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.width = '';
    App.closeModal();
  }

  function confirmEdit(uid_) {
    const e = entries.find(x => x._uid === uid_); if (!e) return;
    const g = id => document.getElementById(id)?.value || '';
    e.originId                  = g('r_originId');
    e.shortDescription          = g('r_shortDesc');
    e.longDescription           = g('r_longDesc');
    e.conditions                = g('r_conditions');
    e.affectedAssets            = g('r_assets');
    e.relatedVersions           = g('r_versions');
    e.affectedComponents        = g('r_comps');
    e.componentOrigin           = g('r_origin') || 'Internal';
    e.rationalForApplicability  = g('r_rational');
    e.publishedCvssScore        = g('r_pubCvss');
    // cvss updated live by updateCvss()
    e.privacyImpact             = g('r_privacy') || 'None';
    e.safetyImpact              = g('r_safety')  || 'None';
    e.otherImpact               = g('r_otherImpact');
    e.safetyRiskReference       = g('r_safetyRef');
    e.existingControlMeasures   = g('r_existing');
    e.potentialControlMeasures  = g('r_potential');
    e.controlMeasuresSelection  = g('r_selected');
    e.targetVersion             = g('r_targetVer');
    e.implementationReference   = g('r_implRef');
    e.effectivenessReference    = g('r_effRef');
    // residualCvssScore / residualCvssVector are updated live by updateResidualCvss()
    e.riskBenefitRating         = g('r_rbr');
    e.residualRiskAcceptance    = g('r_rra');
    e.decisionAuthority         = g('r_decAuth');
    e.decisionDate              = g('r_decDate');
    e.comments                  = g('r_comments');

    // Threat reference — update link and optionally re-import values
    const newThreatId = document.getElementById('r_linkedThreat')?.value || '';
    const reimport    = document.getElementById('r_reimport')?.checked || false;
    e.linkedThreatId  = newThreatId;
    if (reimport && newThreatId) {
      const threat = VulnMgmt.getAll().find(v => v.id === newThreatId);
      if (threat) {
        e.shortDescription         = threat.name;
        e.longDescription          = threat.description          || e.longDescription;
        e.affectedAssets           = threat.assetName            || e.affectedAssets;
        e.cvss                     = { ...threat.cvss };
        e.cvssScore                = threat.cvssScore || 0;
        e.cvssVector               = threat.cvssScore ? CVSS4.vector(threat.cvss) : '';
        e.initialRating            = threat.cvssScore ? CVSS4.qualitative(threat.cvssScore).label : '';
        e.privacyImpact            = threat.privacyImpact        || 'None';
        e.safetyImpact             = threat.safetyImpact         || 'None';
        e.existingControlMeasures  = threat.controls             || e.existingControlMeasures;
        e.implementationReference  = threat.controlRef           || e.implementationReference;
        e.comments                 = threat.notes                || e.comments;
      }
    }

    const modal = document.getElementById('modal');
    if (modal) modal.style.width = '';
    App.closeModal();
    render();
    App.autosave();
  }

  function deleteEntry(uid_) {
    if (!confirm('Delete this entry?')) return;
    entries = entries.filter(x => x._uid !== uid_);
    const modal = document.getElementById('modal');
    if (modal) modal.style.width = '';
    App.closeModal();
    render();
    App.autosave();
  }

  // ── Table render ───────────────────────────────────────────────────────
  function render() {
    const tbody = document.getElementById('racTbody');
    const empty = document.getElementById('racEmpty');
    if (!tbody) return;
    if (!entries.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = entries.map(e => {
      const linked = e.linkedThreatId
        ? VulnMgmt.getAll().find(v => v.id === e.linkedThreatId) : null;
      const q  = CVSS4.qualitative(e.cvssScore || 0);
      const rq = CVSS4.qualitative(parseFloat(e.residualCvssScore) || 0);

      const td = (val, cls='') => {
        const s = String(val ?? '');
        return `<td class="rac-cell ${cls}" title="${esc(s)}">${esc(s.length>28?s.substring(0,28)+'…':s)}</td>`;
      };

      const threatCell = linked
        ? `<a class="affected-item-link" style="font-size:10px;padding:2px 5px" href="#"
             onclick="App.switchView('vuln-mgmt');VulnMgmt.toggleCard('${linked.id}');return false;">
             <span class="id-chip" style="font-size:9px">${esc(linked.vulnId||'')}</span>
             ${esc(linked.name.substring(0,22))}${linked.name.length>22?'…':''}</a>`
        : '<span style="color:var(--c-muted);font-size:10px">—</span>';

      return `<tr class="rac-row" ondblclick="RacAssessment.editEntry('${e._uid}')">
        <td class="rac-cell rac-action-cell">
          <button class="btn btn-ghost" style="font-size:11px;padding:2px 7px"
            onclick="RacAssessment.editEntry('${e._uid}')">✎</button>
        </td>
        ${td(e.id,'rac-id-cell')}
        ${td(e.type==='weakness'?'Weakness':'Vulnerability')}
        ${td(e.originId)}
        ${td(e.shortDescription)}
        ${td(e.longDescription)}
        ${td(e.conditions)}
        ${td(e.affectedAssets)}
        ${td(e.relatedVersions)}
        ${td(e.affectedComponents)}
        ${td(e.componentOrigin)}
        ${td(e.rationalForApplicability)}
        ${td(e.publishedCvssScore)}
        <td class="rac-cell"><span class="score-badge ${q.cls}" style="font-size:10px;padding:1px 5px">${e.cvssScore||'—'}</span></td>
        ${td(e.cvssVector)}
        ${td(e.initialRating)}
        ${td(e.privacyImpact)}
        ${td(e.safetyImpact)}
        ${td(e.otherImpact)}
        ${td(e.safetyRiskReference)}
        ${td(e.existingControlMeasures)}
        ${td(e.potentialControlMeasures)}
        ${td(e.controlMeasuresSelection)}
        ${td(e.targetVersion)}
        ${td(e.implementationReference)}
        ${td(e.effectivenessReference)}
        <td class="rac-cell"><span class="score-badge ${rq.cls}" style="font-size:10px;padding:1px 5px">${e.residualCvssScore||'—'}</span></td>
        ${td(e.residualCvssVector)}
        ${td(e.riskBenefitRating)}
        ${td(e.residualRiskAcceptance)}
        ${td(e.decisionAuthority)}
        ${td(e.decisionDate)}
        ${td(e.comments)}
        <td class="rac-cell">${threatCell}</td>
        <td class="rac-cell">${(() => {
          const atRisk = e.linkedThreatId ? AttackTrees.getTreeRiskScore(e.linkedThreatId) : null;
          if (!atRisk) return '<span style="color:var(--c-muted);font-size:10px">—</span>';
          return `<span class="score-badge ${atRisk.level.cls}" style="font-size:10px;padding:1px 5px" title="${atRisk.level.lbl}">${atRisk.score}</span>`;
        })()}</td>
      </tr>`;
    }).join('');
  }

  // ── CSV Export ─────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = [
      'ID','Type','Origin ID','Short Description','Long Description','Conditions',
      'Affected Assets','Related Versions','Affected Components','Component Origin',
      'Rational for Applicability','Published CVSS Score','CVSS Score (internal)',
      'CVSS Vector','Initial Rating','Privacy Impact','Safety Impact','Other Impact',
      'Safety Risk Reference','Existing Control Measures','Potential Control Measures',
      'Control Measures Selection','Target Version','Implementation Reference',
      'Effectiveness Reference','Residual CVSS Score','Residual CVSS Vector',
      'Risk Benefit Rating','Residual Risk Acceptance','Decision Authority',
      'Decision Date','Comments','Linked Threat',
    ];
    const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
    const rows = [headers.map(q), ...entries.map(e => {
      const linked = e.linkedThreatId
        ? VulnMgmt.getAll().find(v => v.id === e.linkedThreatId) : null;
      return [
        e.id, e.type==='weakness'?'Weakness':'Vulnerability',
        e.originId, e.shortDescription, e.longDescription, e.conditions,
        e.affectedAssets, e.relatedVersions, e.affectedComponents, e.componentOrigin,
        e.rationalForApplicability, e.publishedCvssScore, e.cvssScore, e.cvssVector,
        e.initialRating, e.privacyImpact, e.safetyImpact, e.otherImpact,
        e.safetyRiskReference, e.existingControlMeasures, e.potentialControlMeasures,
        e.controlMeasuresSelection, e.targetVersion, e.implementationReference,
        e.effectivenessReference, e.residualCvssScore, e.residualCvssVector,
        e.riskBenefitRating, e.residualRiskAcceptance, e.decisionAuthority,
        e.decisionDate, e.comments,
        linked ? (linked.vulnId + ' — ' + linked.name) : '',
      ].map(q);
    })];
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'risk-assessment-control.csv';
    a.click(); URL.revokeObjectURL(a.href);
    App.toast('Exported as CSV.','ok');
  }

  // ── Serialise ──────────────────────────────────────────────────────────
  function getAll() { return { entries, wSeq, vSeq }; }

  function setAll(data) {
    if (!data) return;
    entries = (data.entries || []).map(e => ({
      cvss: { ...CVSS4.DEFAULTS }, cvssScore: 0, cvssVector: '',
      initialRating: '', componentOrigin: 'Internal',
      privacyImpact: 'None', safetyImpact: 'None',
      residualCvss: { ...CVSS4.DEFAULTS }, residualCvssScore: 0, residualCvssVector: '',
      ...e,
    }));
    wSeq = data.wSeq || 0;
    vSeq = data.vSeq || 0;
    render();
  }

  return {
    addEntry, confirmAdd,
    editEntry, cancelEdit, confirmEdit,
    deleteEntry, updateCvss, updateResidualCvss,
    exportCSV, render, getAll, setAll,
  };
})();
