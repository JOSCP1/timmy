'use strict';

const AttackTrees = (() => {
  let trees = [];

  // ── Layout constants ───────────────────────────────────────────────────
  const NODE_W = 240, NODE_H = 108, H_GAP = 32, V_GAP = 80;

  // ── ISO/IEC 18045:2023 (CEM) Attack Potential Factors ─────────────────
  const CEM = {
    elapsedTime: {
      label: 'Elapsed Time',
      options: [
        { label: '≤ One day',      v: 0  },
        { label: '≤ One week',     v: 1  },
        { label: '≤ Two weeks',    v: 2  },
        { label: '≤ One month',    v: 4  },
        { label: '≤ Three months', v: 7  },
        { label: '≤ Six months',   v: 9  },
        { label: '> Six months',   v: 12 },
      ],
    },
    expertise: {
      label: 'Specialist Expertise',
      options: [
        { label: 'Layman',           v: 0 },
        { label: 'Proficient',       v: 3 },
        { label: 'Expert',           v: 6 },
        { label: 'Multiple experts', v: 8 },
      ],
    },
    knowledge: {
      label: 'Knowledge of TOE',
      options: [
        { label: 'Public',     v: 0  },
        { label: 'Restricted', v: 3  },
        { label: 'Sensitive',  v: 7  },
        { label: 'Critical',   v: 11 },
      ],
    },
    opportunity: {
      label: 'Window of Opportunity',
      options: [
        { label: 'Unnecessary / Unlimited access', v: 0  },
        { label: 'Easy access',                    v: 1  },
        { label: 'Moderate access',                v: 4  },
        { label: 'Difficult access',               v: 10 },
      ],
    },
    equipment: {
      label: 'Equipment',
      options: [
        { label: 'Standard',         v: 0 },
        { label: 'Specialized',      v: 4 },
        { label: 'Bespoke',          v: 7 },
        { label: 'Multiple bespoke', v: 9 },
      ],
    },
  };

  // Default factors → Moderate (total 14)
  const DEFAULT_FACTORS = { elapsedTime: 4, expertise: 3, knowledge: 3, opportunity: 4, equipment: 0 };

  // Migration map from old qualitative labels to CEM scores
  const LEGACY_FACTOR_MAP = {
    'Almost Certain': { elapsedTime:0,  expertise:0, knowledge:0, opportunity:0, equipment:0  }, // 0  = Basic
    'Likely':         { elapsedTime:4,  expertise:3, knowledge:3, opportunity:0, equipment:0  }, // 10 = Enhanced-Basic
    'Possible':       { elapsedTime:4,  expertise:3, knowledge:3, opportunity:4, equipment:0  }, // 14 = Moderate
    'Unlikely':       { elapsedTime:7,  expertise:6, knowledge:3, opportunity:4, equipment:0  }, // 20 = High
    'Rare':           { elapsedTime:9,  expertise:6, knowledge:3, opportunity:4, equipment:4  }, // 26 = Beyond High
  };

  function calcAttackPotential(f = {}) {
    const score = (f.elapsedTime ?? 0) + (f.expertise ?? 0) +
                  (f.knowledge  ?? 0) + (f.opportunity ?? 0) + (f.equipment ?? 0);
    if (score <=  9) return { score, level:'Basic',          probability:0.90 };
    if (score <= 13) return { score, level:'Enhanced-Basic', probability:0.70 };
    if (score <= 19) return { score, level:'Moderate',       probability:0.50 };
    if (score <= 24) return { score, level:'High',           probability:0.25 };
    return               { score, level:'Beyond High',   probability:0.10 };
  }

  // ── Risk Engine ────────────────────────────────────────────────────────
  const RISK_LEVEL = (s) =>
    s >= 8 ? { lbl:'Critical', cls:'at-risk-critical' } :
    s >= 6 ? { lbl:'High',     cls:'at-risk-high'     } :
    s >= 4 ? { lbl:'Medium',   cls:'at-risk-medium'   } :
    s >= 2 ? { lbl:'Low',      cls:'at-risk-low'      } :
             { lbl:'None',     cls:'at-risk-none'     };

  function nodeBaseProbability(node) {
    const ap = calcAttackPotential(node.attackFactors || DEFAULT_FACTORS);
    return ap.probability;
  }

  function nodeProbability(node) {
    const base = nodeBaseProbability(node);
    if (node.mitigated) return base * (1 - (node.countermeasureEffectiveness ?? 80) / 100);
    return base;
  }

  function calcProbability(nodes, nodeId) {
    const node = nodes.find(n => n.id === nodeId); if (!node) return 0;
    const children = nodes.filter(n => n.parentId === nodeId);
    if (!children.length) return nodeProbability(node);
    const childProbs = children.map(c => calcProbability(nodes, c.id));
    let p = node.type === 'OR'
      ? 1 - childProbs.reduce((acc, cp) => acc * (1 - cp), 1)
      : childProbs.reduce((acc, cp) => acc * cp, 1);
    if (node.mitigated) p *= 1 - (node.countermeasureEffectiveness ?? 80) / 100;
    return p;
  }

  function calcTreeRisk(tree) {
    const root = tree.nodes.find(n => n.parentId === null);
    if (!root) return { probability:0, score:0, level:RISK_LEVEL(0), impact:5 };
    const probability = calcProbability(tree.nodes, root.id);
    let impact = typeof tree.impact === 'number' ? tree.impact : 5;
    if (tree.linkedThreatId) {
      const vuln = VulnMgmt.getAll().find(v => v.id === tree.linkedThreatId);
      if (vuln?.cvssScore) impact = vuln.cvssScore;
    }
    const score = parseFloat(Math.min(10, probability * impact).toFixed(1));
    return { probability, score, impact, level: RISK_LEVEL(score) };
  }

  function criticalPath(nodes, nodeId) {
    const node = nodes.find(n => n.id === nodeId); if (!node) return [];
    const children = nodes.filter(n => n.parentId === nodeId);
    if (!children.length) return [nodeId];
    if (node.type === 'OR') {
      const best = [...children].sort((a, b) =>
        calcProbability(nodes, b.id) - calcProbability(nodes, a.id))[0];
      return [nodeId, ...criticalPath(nodes, best.id)];
    }
    return [nodeId, ...children.flatMap(c => criticalPath(nodes, c.id))];
  }

  // ── Tree layout ────────────────────────────────────────────────────────
  function subtreeWidth(nodes, nodeId) {
    const children = nodes.filter(n => n.parentId === nodeId);
    if (!children.length) return NODE_W;
    const total = children.reduce((s, c) => s + subtreeWidth(nodes, c.id), 0)
                + (children.length - 1) * H_GAP;
    return Math.max(NODE_W, total);
  }

  function computePositions(nodes, nodeId, x, y) {
    const positions = {}, children = nodes.filter(n => n.parentId === nodeId);
    positions[nodeId] = { x, y };
    if (!children.length) return positions;
    const totalChildW = children.reduce((s, c) => s + subtreeWidth(nodes, c.id), 0)
                      + (children.length - 1) * H_GAP;
    let cx = x + NODE_W / 2 - totalChildW / 2;
    for (const child of children) {
      const cw = subtreeWidth(nodes, child.id);
      Object.assign(positions, computePositions(nodes, child.id, cx, y + NODE_H + V_GAP));
      cx += cw + H_GAP;
    }
    return positions;
  }

  function layoutTree(tree) {
    const root = tree.nodes.find(n => n.parentId === null);
    if (!root) return { positions:{}, width:NODE_W, height:NODE_H };
    const rootW = subtreeWidth(tree.nodes, root.id);
    const positions = computePositions(tree.nodes, root.id, rootW / 2 - NODE_W / 2, 0);
    const maxY = Math.max(...Object.values(positions).map(p => p.y));
    return { positions, width: rootW, height: maxY + NODE_H };
  }

  // ── CRUD ───────────────────────────────────────────────────────────────
  function uid() { return 'at_' + Math.random().toString(36).slice(2,9); }
  function pct(v) { return Math.round(v * 100) + '%'; }

  function _createTree(name, linkedThreatId, linkedThreatName) {
    const rootId = uid();
    const tree = {
      id: uid(), name: name || 'New Attack Tree',
      linkedThreatId: linkedThreatId || '',
      impact: 5,
      nodes: [{
        id: rootId, parentId: null,
        name: linkedThreatName || name || 'Attack Goal',
        type: 'OR',
        attackFactors: { ...DEFAULT_FACTORS },
        countermeasure: '', countermeasureEffectiveness: 80, mitigated: false,
        difficulty: 'Medium', cost: 'Low', attackerSkill: 'Hacktivist',
        detection: 'Possible', notes: '',
      }],
    };
    trees.push(tree);
    render(); App.autosave();
    requestAnimationFrame(() =>
      document.getElementById('atcard_' + tree.id)?.scrollIntoView({ behavior:'smooth' }));
    return tree;
  }

  // "+" New Tree button — opens modal to optionally link a threat
  function addTree() {
    const vulns = VulnMgmt.getAll();
    const opts = `<option value="">— None (standalone tree) —</option>` +
      vulns.map(v =>
        `<option value="${v.id}">[${esc(v.vulnId||'')}] ${esc(v.name)}</option>`
      ).join('');
    App.openModal('New Attack Tree', `
      <div class="form-field"><label>Tree Name</label>
        <input type="text" id="at_newname" placeholder="e.g. Lateral Movement Path" style="width:100%" /></div>
      <div class="form-field"><label>Link to Identified Threat (optional)</label>
        <select id="at_threatlink" style="width:100%">${opts}</select></div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AttackTrees.confirmAddTree()">Create</button>`);
    setTimeout(() => document.getElementById('at_newname')?.focus(), 60);
  }

  function confirmAddTree() {
    const sel = document.getElementById('at_threatlink');
    const nameInput = document.getElementById('at_newname');
    const threatId = sel?.value || '';
    const vuln = threatId ? VulnMgmt.getAll().find(v => v.id === threatId) : null;
    const name = nameInput?.value.trim() || (vuln ? vuln.name : 'New Attack Tree');
    App.closeModal();
    _createTree(name, threatId, vuln?.name || '');
  }

  // Called from Threats tab "🌲+" button
  function createFromThreat(threatId) {
    const vuln = VulnMgmt.getAll().find(v => v.id === threatId);
    if (!vuln) return;
    App.switchView('attacktrees');
    requestAnimationFrame(() => _createTree(vuln.name, threatId, vuln.name));
  }

  function deleteTree(treeId) {
    if (!confirm('Delete this attack tree?')) return;
    trees = trees.filter(t => t.id !== treeId);
    render(); App.autosave();
  }

  function scrollTo(treeId) {
    requestAnimationFrame(() =>
      document.getElementById('atcard_' + treeId)?.scrollIntoView({ behavior:'smooth' }));
  }

  function getByThreatId(threatId) {
    return trees.find(t => t.linkedThreatId === threatId) || null;
  }

  // ── Node operations ────────────────────────────────────────────────────
  function cemFactorSelect(factorKey, currentVal) {
    const factor = CEM[factorKey];
    const opts = factor.options.map(o =>
      `<option value="${o.v}" ${currentVal === o.v ? 'selected' : ''}>${o.label} (${o.v})</option>`
    ).join('');
    return `<div class="form-field">
      <label>${factor.label}</label>
      <select id="af_${factorKey}" onchange="AttackTrees._recalcNodeForm()">${opts}</select>
    </div>`;
  }

  function _recalcNodeForm() {
    const f = readFactors();
    const ap = calcAttackPotential(f);
    const el = document.getElementById('at_ap_display');
    if (el) {
      el.textContent = `Score: ${ap.score} — ${ap.level} (attack success ≈ ${pct(ap.probability)})`;
      el.className = `at-ap-display at-ap-${ap.level.replace(' ','-').toLowerCase()}`;
    }
  }

  function readFactors() {
    const keys = Object.keys(CEM);
    const f = {};
    for (const k of keys) {
      const el = document.getElementById('af_' + k) ;
      f[k] = parseInt(el?.value || '0', 10);
    }
    return f;
  }

  function nodeFormHTML(n) {
    const af = n?.attackFactors || { ...DEFAULT_FACTORS };
    const ap = calcAttackPotential(af);
    const diffOpts = ['Trivial','Low','Medium','High','Expert'].map(d =>
      `<option value="${d}" ${(n?.difficulty||'Medium')===d?'selected':''}>${d}</option>`).join('');
    const costOpts = ['None','Low','Medium','High','Very High'].map(c =>
      `<option value="${c}" ${(n?.cost||'Low')===c?'selected':''}>${c}</option>`).join('');
    const skillOpts = ['Script Kiddie','Hacktivist','Insider','Criminal Group','Nation State'].map(s =>
      `<option value="${s}" ${(n?.attackerSkill||'Hacktivist')===s?'selected':''}>${s}</option>`).join('');
    const detOpts = ['Unlikely','Possible','Likely','Almost Certain'].map(d =>
      `<option value="${d}" ${(n?.detection||'Possible')===d?'selected':''}>${d}</option>`).join('');
    return `
      <div class="vuln-form">
        <div class="form-field full"><label>Name / Attack Step</label>
          <input type="text" id="atn_name" value="${esc(n?.name||'')}" placeholder="Describe the attack step…" /></div>
        <div class="form-field"><label>Node Type (Gate)</label>
          <select id="atn_type">
            <option value="OR"  ${(n?.type||'OR')==='OR' ?'selected':''}>OR — any child path suffices</option>
            <option value="AND" ${(n?.type||'OR')==='AND'?'selected':''}>AND — all child paths required</option>
          </select></div>
        <div class="form-field"><label>Attacker Skill</label><select id="atn_skill">${skillOpts}</select></div>
        <div class="form-field"><label>Attack Difficulty</label><select id="atn_diff">${diffOpts}</select></div>
        <div class="form-field"><label>Resource Cost</label><select id="atn_cost">${costOpts}</select></div>
        <div class="form-field"><label>Detection Likelihood</label><select id="atn_det">${detOpts}</select></div>
        <div class="at-cem-section">
          <div class="at-cem-title">⚙ Attack Potential Factors <span style="font-size:10px;font-weight:400;opacity:.7">(ISO/IEC 18045:2023 CEM)</span></div>
          <div class="at-cem-grid">
            ${Object.keys(CEM).map(k => cemFactorSelect(k, af[k] ?? DEFAULT_FACTORS[k])).join('')}
          </div>
          <div id="at_ap_display" class="at-ap-display at-ap-${ap.level.replace(' ','-').toLowerCase()}">
            Score: ${ap.score} — ${ap.level} (attack success ≈ ${pct(ap.probability)})
          </div>
        </div>
        <div class="form-field full"><label>Countermeasure / Control</label>
          <input type="text" id="atn_cm" value="${esc(n?.countermeasure||'')}" placeholder="Control that mitigates this step…" /></div>
        <div class="form-field">
          <label>Countermeasure Effectiveness <span style="color:var(--c-muted);font-weight:400;font-size:10px">(% reduction)</span></label>
          <input type="number" id="atn_cmeff" min="0" max="100" value="${n?.countermeasureEffectiveness??80}" /></div>
        <div class="form-field">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;text-transform:none;letter-spacing:0">
            <input type="checkbox" id="atn_mit" ${n?.mitigated?'checked':''}> Countermeasure Applied</label></div>
        <div class="form-field full"><label>Notes / Rationale</label>
          <textarea id="atn_notes" rows="2">${esc(n?.notes||'')}</textarea></div>
      </div>`;
  }

  function readNodeForm() {
    return {
      name:                    document.getElementById('atn_name')?.value.trim() || '',
      type:                    document.getElementById('atn_type')?.value || 'OR',
      attackFactors:           readFactors(),
      attackerSkill:           document.getElementById('atn_skill')?.value || 'Hacktivist',
      difficulty:              document.getElementById('atn_diff')?.value  || 'Medium',
      cost:                    document.getElementById('atn_cost')?.value  || 'Low',
      detection:               document.getElementById('atn_det')?.value   || 'Possible',
      countermeasure:          document.getElementById('atn_cm')?.value    || '',
      countermeasureEffectiveness: parseInt(document.getElementById('atn_cmeff')?.value || '80', 10),
      mitigated:               document.getElementById('atn_mit')?.checked || false,
      notes:                   document.getElementById('atn_notes')?.value || '',
    };
  }

  function addNode(treeId, parentId) {
    App.openModal('Add Child Node', nodeFormHTML(null),
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AttackTrees.confirmAddNode('${treeId}','${parentId}')">Add</button>`);
    setTimeout(() => document.getElementById('atn_name')?.focus(), 60);
  }

  function confirmAddNode(treeId, parentId) {
    const data = readNodeForm();
    if (!data.name) { App.toast('Name is required.', 'error'); return; }
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    tree.nodes.push({ id: uid(), parentId, ...data });
    App.closeModal(); renderTree(treeId); App.autosave();
  }

  function editNode(treeId, nodeId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    const node = tree.nodes.find(n => n.id === nodeId); if (!node) return;
    App.openModal('Edit Node', nodeFormHTML(node),
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AttackTrees.confirmEditNode('${treeId}','${nodeId}')">Save</button>`);
  }

  function confirmEditNode(treeId, nodeId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    const node = tree.nodes.find(n => n.id === nodeId); if (!node) return;
    const data = readNodeForm();
    if (!data.name) { App.toast('Name is required.', 'error'); return; }
    Object.assign(node, data);
    App.closeModal(); renderTree(treeId); App.autosave();
  }

  function deleteNode(treeId, nodeId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    const root = tree.nodes.find(n => n.parentId === null);
    if (root?.id === nodeId) { App.toast('Cannot delete the root node.', 'error'); return; }
    const toDelete = new Set([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      tree.nodes.forEach(n => {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id))
          { toDelete.add(n.id); changed = true; }
      });
    }
    tree.nodes = tree.nodes.filter(n => !toDelete.has(n.id));
    renderTree(treeId); App.autosave();
  }

  function updateTreeName(treeId, name) {
    const tree = trees.find(t => t.id === treeId);
    if (tree) { tree.name = name; App.autosave(); }
  }

  function updateImpact(treeId, val) {
    const tree = trees.find(t => t.id === treeId);
    if (tree) { tree.impact = parseFloat(val) || 5; renderTree(treeId); App.autosave(); }
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  function render() {
    const list  = document.getElementById('atList');
    const empty = document.getElementById('atEmpty');
    if (!list) return;
    [...list.children].forEach(c => { if (c.id !== 'atEmpty') c.remove(); });
    if (!trees.length) { if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';
    trees.forEach(tree => {
      const div = document.createElement('div');
      div.className = 'at-card';
      div.id = 'atcard_' + tree.id;
      div.innerHTML = buildTreeHTML(tree);
      list.appendChild(div);
    });
  }

  function renderTree(treeId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    const card = document.getElementById('atcard_' + treeId); if (!card) return;
    card.innerHTML = buildTreeHTML(tree);
  }

  function buildTreeHTML(tree) {
    const risk   = calcTreeRisk(tree);
    const cpIds  = new Set(criticalPath(tree.nodes, tree.nodes.find(n=>n.parentId===null)?.id || ''));
    const linked = tree.linkedThreatId
      ? VulnMgmt.getAll().find(v => v.id === tree.linkedThreatId) : null;
    const { positions, width, height } = layoutTree(tree);

    const lines = tree.nodes
      .filter(n => n.parentId !== null && positions[n.id] && positions[n.parentId])
      .map(n => {
        const p = positions[n.parentId], c = positions[n.id];
        const px = p.x + NODE_W/2, py = p.y + NODE_H;
        const cx = c.x + NODE_W/2, cy = c.y;
        const my = (py + cy) / 2;
        const isCrit = cpIds.has(n.id);
        return `<path d="M${px},${py} L${px},${my} L${cx},${my} L${cx},${cy}"
          stroke="${isCrit?'#ef4444':'#94a3b8'}" stroke-width="${isCrit?2.5:1.5}"
          fill="none" stroke-dasharray="${isCrit?'none':'4 3'}" />`;
      }).join('');

    const cards = tree.nodes.map(n => {
      const pos = positions[n.id]; if (!pos) return '';
      const ap   = calcAttackPotential(n.attackFactors || DEFAULT_FACTORS);
      const p    = calcProbability(tree.nodes, n.id);
      const rl   = RISK_LEVEL(p * risk.impact);
      const isCrit = cpIds.has(n.id);
      const typeClr = n.type === 'OR' ? '#3b82f6' : '#db2777';
      const apCls = `at-ap-${ap.level.replace(/[\s\/]+/g,'-').toLowerCase()}`;

      return `
        <div class="at-node-card ${rl.cls} ${isCrit?'at-critical-path':''}"
             style="position:absolute;left:${pos.x}px;top:${pos.y}px;width:${NODE_W}px">
          <div class="at-node-header">
            <span class="at-gate" style="background:${typeClr}">${n.type}</span>
            <span class="at-node-name">${esc(n.name)}</span>
            <span class="at-prob-pill">${pct(p)}</span>
          </div>
          <div class="at-node-cem ${apCls}">
            AP: <strong>${ap.level}</strong> (score ${ap.score})
            · ${esc(n.attackerSkill||'Hacktivist')}
          </div>
          ${n.countermeasure?`<div class="at-node-ctrl ${n.mitigated?'at-ctrl-active':''}">🛡 ${esc(n.countermeasure)}${n.mitigated?' ('+n.countermeasureEffectiveness+'%eff.)':''}</div>`:''}
          <div class="at-node-actions">
            <button class="btn btn-ghost" style="font-size:11px;padding:2px 7px"
              onclick="AttackTrees.addNode('${tree.id}','${n.id}')">＋ Child</button>
            <button class="btn btn-ghost" style="font-size:11px;padding:2px 7px"
              onclick="AttackTrees.editNode('${tree.id}','${n.id}')">✎</button>
            ${n.parentId!==null?`<button class="btn btn-danger" style="font-size:11px;padding:2px 7px"
              onclick="AttackTrees.deleteNode('${tree.id}','${n.id}')">✕</button>`:''}
          </div>
        </div>`;
    }).join('');

    const bannerCls = risk.level.cls;
    const linkedThreats = linked
      ? `<a class="at-threat-link" href="#"
           onclick="App.switchView('vuln-mgmt');VulnMgmt.toggleCard('${linked.id}');return false;">
           ⚠ ${esc(linked.vulnId||'')} ${esc(linked.name.substring(0,36))}${linked.name.length>36?'…':''}
         </a>`
      : '';
    const impactInput = !linked ? `
      <span style="opacity:.7;font-size:11px">Manual impact:</span>
      <input type="number" min="0" max="10" step="0.1" value="${risk.impact.toFixed(1)}"
        style="width:52px;padding:2px 5px;border-radius:4px;border:1px solid rgba(255,255,255,.3);
               background:rgba(255,255,255,.15);color:#fff;font-size:11px"
        oninput="AttackTrees.updateImpact('${tree.id}',this.value)" />` : '';

    return `
      <div class="at-card-header">
        <input class="at-name-input" type="text" value="${esc(tree.name)}"
          onchange="AttackTrees.updateTreeName('${tree.id}',this.value)" />
        ${linkedThreats}
        <button class="btn btn-danger btn-sm" onclick="AttackTrees.deleteTree('${tree.id}')">🗑 Delete</button>
      </div>
      <div class="at-risk-banner ${bannerCls}">
        <div class="at-risk-score-block">
          <div class="at-risk-score-num">${risk.score}</div>
          <div class="at-risk-score-lbl">${risk.level.lbl} Risk</div>
        </div>
        <div class="at-risk-details">
          <div>Attack Success Probability: <strong>${pct(risk.probability)}</strong></div>
          <div style="font-size:11px;opacity:.8">Impact: ${risk.impact.toFixed(1)} ${linked?'(CVSS)':'(manual)'}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px">${impactInput}</div>
        </div>
        <div class="at-risk-legend">
          <div style="opacity:.7;font-size:10px;text-transform:uppercase;letter-spacing:.3px">Critical path</div>
          <svg width="36" height="8"><line x1="0" y1="4" x2="36" y2="4" stroke="#fca5a5" stroke-width="2.5"/></svg>
          <div style="opacity:.7;font-size:10px;text-transform:uppercase;letter-spacing:.3px;margin-top:4px">Other paths</div>
          <svg width="36" height="8"><line x1="0" y1="4" x2="36" y2="4" stroke="rgba(255,255,255,.4)" stroke-width="1.5" stroke-dasharray="4 3"/></svg>
        </div>
      </div>
      <div class="at-tree-canvas-wrap">
        <div class="at-tree-canvas" style="width:${Math.max(width,260)}px;height:${height+16}px">
          <svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">${lines}</svg>
          ${cards}
        </div>
      </div>`;
  }

  // ── Serialise ───────────────────────────────────────────────────────────
  function getAll()    { return trees; }

  function setAll(arr) {
    trees = (arr || []).map(tree => ({
      ...tree,
      nodes: tree.nodes.map(n => {
        // Migrate old qualitative probability to CEM factors
        if (!n.attackFactors) {
          n.attackFactors = LEGACY_FACTOR_MAP[n.probability] || { ...DEFAULT_FACTORS };
        }
        return {
          attackerSkill:'Hacktivist', difficulty:'Medium', cost:'Low',
          detection:'Possible', countermeasure:'',
          countermeasureEffectiveness:80, mitigated:false, notes:'',
          ...n,
        };
      }),
    }));
    render();
  }

  return {
    addTree, confirmAddTree, deleteTree, scrollTo, getByThreatId, createFromThreat,
    addNode, confirmAddNode, editNode, confirmEditNode, deleteNode,
    updateTreeName, updateImpact, _recalcNodeForm,
    render, getAll, setAll,
  };
})();
