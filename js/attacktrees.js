'use strict';

const AttackTrees = (() => {
  let trees = [];

  // ── Constants ──────────────────────────────────────────────────────────
  const NODE_W = 230, NODE_H = 96, H_GAP = 28, V_GAP = 72;

  const PROB_MAP = {
    'Almost Certain': 0.90,
    'Likely':         0.70,
    'Possible':       0.50,
    'Unlikely':       0.30,
    'Rare':           0.10,
  };
  const PROB_KEYS = Object.keys(PROB_MAP);

  const RISK_LEVEL = (s) =>
    s >= 8 ? { lbl:'Critical', cls:'at-risk-critical' } :
    s >= 6 ? { lbl:'High',     cls:'at-risk-high'     } :
    s >= 4 ? { lbl:'Medium',   cls:'at-risk-medium'   } :
    s >= 2 ? { lbl:'Low',      cls:'at-risk-low'      } :
             { lbl:'None',     cls:'at-risk-none'     };

  function uid() { return 'at_' + Math.random().toString(36).slice(2,9); }
  function pct(v) { return Math.round(v * 100) + '%'; }

  // ── Risk Engine ────────────────────────────────────────────────────────
  function nodeProbability(node) {
    const base = PROB_MAP[node.probability] ?? 0.50;
    if (node.mitigated) {
      const eff = (node.countermeasureEffectiveness ?? 80) / 100;
      return base * (1 - eff);
    }
    return base;
  }

  function calcProbability(nodes, nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return 0;
    const children = nodes.filter(n => n.parentId === nodeId);
    if (!children.length) return nodeProbability(node);

    const childProbs = children.map(c => calcProbability(nodes, c.id));
    let p;
    if (node.type === 'OR') {
      p = 1 - childProbs.reduce((acc, cp) => acc * (1 - cp), 1);
    } else {
      p = childProbs.reduce((acc, cp) => acc * cp, 1);
    }
    if (node.mitigated) p *= (1 - (node.countermeasureEffectiveness ?? 80) / 100);
    return p;
  }

  function calcTreeRisk(tree) {
    const root = tree.nodes.find(n => n.parentId === null);
    if (!root) return { probability: 0, score: 0, level: RISK_LEVEL(0) };
    const probability = calcProbability(tree.nodes, root.id);
    let impact = typeof tree.impact === 'number' ? tree.impact : 5;
    if (tree.linkedThreatId) {
      const vuln = VulnMgmt.getAll().find(v => v.id === tree.linkedThreatId);
      if (vuln && vuln.cvssScore) impact = vuln.cvssScore;
    }
    const score = parseFloat(Math.min(10, probability * impact).toFixed(1));
    return { probability, score, impact, level: RISK_LEVEL(score) };
  }

  function criticalPath(nodes, nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return [];
    const children = nodes.filter(n => n.parentId === nodeId);
    if (!children.length) return [nodeId];
    if (node.type === 'OR') {
      const best = [...children].sort((a, b) =>
        calcProbability(nodes, b.id) - calcProbability(nodes, a.id))[0];
      return [nodeId, ...criticalPath(nodes, best.id)];
    }
    return [nodeId, ...children.flatMap(c => criticalPath(nodes, c.id))];
  }

  // ── Tree layout algorithm ──────────────────────────────────────────────
  function subtreeWidth(nodes, nodeId) {
    const children = nodes.filter(n => n.parentId === nodeId);
    if (!children.length) return NODE_W;
    const total = children.reduce((s, c) => s + subtreeWidth(nodes, c.id), 0)
      + (children.length - 1) * H_GAP;
    return Math.max(NODE_W, total);
  }

  function computePositions(nodes, nodeId, x, y) {
    const positions = {};
    const children = nodes.filter(n => n.parentId === nodeId);
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
    if (!root) return { positions: {}, width: NODE_W, height: NODE_H };
    const rootW = subtreeWidth(tree.nodes, root.id);
    const positions = computePositions(tree.nodes, root.id, rootW / 2 - NODE_W / 2, 0);
    const maxY = Math.max(...Object.values(positions).map(p => p.y));
    return { positions, width: rootW, height: maxY + NODE_H };
  }

  // ── Add / delete trees ─────────────────────────────────────────────────
  function addTree(name, linkedThreatId, linkedThreatName) {
    const rootId = uid();
    const tree = {
      id: uid(), name: name || 'New Attack Tree',
      linkedThreatId: linkedThreatId || '',
      impact: 5,
      nodes: [{
        id: rootId, parentId: null,
        name: linkedThreatName || name || 'Attack Goal',
        type: 'OR',
        probability: 'Possible',
        difficulty: 'Medium',
        cost: 'Low',
        attackerSkill: 'Hacktivist',
        detection: 'Possible',
        countermeasure: '', countermeasureEffectiveness: 80, mitigated: false,
        notes: '',
      }],
    };
    trees.push(tree);
    render(); App.autosave();
    requestAnimationFrame(() =>
      document.getElementById('atcard_' + tree.id)?.scrollIntoView({ behavior:'smooth' }));
  }

  function deleteTree(treeId) {
    if (!confirm('Delete this attack tree?')) return;
    trees = trees.filter(t => t.id !== treeId);
    render(); App.autosave();
  }

  // ── From threat ────────────────────────────────────────────────────────
  function addFromThreat() {
    const vulns = VulnMgmt.getAll();
    if (!vulns.length) { App.toast('No identified risks yet. Run "Identify Threats" first.', 'error'); return; }
    const opts = vulns.map(v =>
      `<option value="${v.id}">[${esc(v.vulnId||'')}] ${esc(v.name)}</option>`).join('');
    App.openModal('Build Attack Tree from Risk', `
      <div class="form-field">
        <label>Select Risk</label>
        <select id="at_threatSel" style="width:100%">${opts}</select>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AttackTrees.confirmFromThreat()">Create</button>`);
  }

  function confirmFromThreat() {
    const sel  = document.getElementById('at_threatSel');
    const vuln = VulnMgmt.getAll().find(v => v.id === sel?.value);
    if (!vuln) return;
    App.closeModal();
    addTree(vuln.name, vuln.id, vuln.name);
  }

  // ── Node modal (shared by Add + Edit) ──────────────────────────────────
  function nodeFormHTML(n) {
    const probOpts = PROB_KEYS.map(k =>
      `<option value="${k}" ${(n?.probability||'Possible')===k?'selected':''}>${k}</option>`).join('');
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
        <div class="form-field"><label>Likelihood</label><select id="atn_prob">${probOpts}</select></div>
        <div class="form-field"><label>Attacker Skill</label><select id="atn_skill">${skillOpts}</select></div>
        <div class="form-field"><label>Attack Difficulty</label><select id="atn_diff">${diffOpts}</select></div>
        <div class="form-field"><label>Resource Cost</label><select id="atn_cost">${costOpts}</select></div>
        <div class="form-field"><label>Detection Likelihood</label><select id="atn_det">${detOpts}</select></div>
        <div class="form-field full"><label>Countermeasure / Control</label>
          <input type="text" id="atn_cm" value="${esc(n?.countermeasure||'')}" placeholder="What controls mitigate this step?" /></div>
        <div class="form-field">
          <label>Countermeasure Effectiveness
            <span style="color:var(--c-muted);font-weight:400;font-size:10px"> (% reduction)</span></label>
          <input type="number" id="atn_cmeff" min="0" max="100" value="${n?.countermeasureEffectiveness??80}" /></div>
        <div class="form-field">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;text-transform:none;letter-spacing:0">
            <input type="checkbox" id="atn_mit" ${n?.mitigated?'checked':''}> Countermeasure Applied
          </label></div>
        <div class="form-field full"><label>Notes / Rationale</label>
          <textarea id="atn_notes" rows="2">${esc(n?.notes||'')}</textarea></div>
      </div>`;
  }

  function readNodeForm() {
    return {
      name:                    document.getElementById('atn_name')?.value.trim() || '',
      type:                    document.getElementById('atn_type')?.value || 'OR',
      probability:             document.getElementById('atn_prob')?.value || 'Possible',
      attackerSkill:           document.getElementById('atn_skill')?.value || 'Hacktivist',
      difficulty:              document.getElementById('atn_diff')?.value || 'Medium',
      cost:                    document.getElementById('atn_cost')?.value || 'Low',
      detection:               document.getElementById('atn_det')?.value || 'Possible',
      countermeasure:          document.getElementById('atn_cm')?.value || '',
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

    // Build SVG connector lines
    const lines = tree.nodes
      .filter(n => n.parentId !== null && positions[n.id] && positions[n.parentId])
      .map(n => {
        const p = positions[n.parentId], c = positions[n.id];
        const px = p.x + NODE_W / 2, py = p.y + NODE_H;
        const cx = c.x + NODE_W / 2, cy = c.y;
        const my = (py + cy) / 2;
        const isCrit = cpIds.has(n.id);
        return `<path d="M${px},${py} L${px},${my} L${cx},${my} L${cx},${cy}"
          stroke="${isCrit?'#ef4444':'#94a3b8'}" stroke-width="${isCrit?2.5:1.5}"
          fill="none" stroke-dasharray="${isCrit?'none':'4 3'}" />`;
      }).join('');

    // Build node cards
    const cards = tree.nodes.map(n => {
      const pos = positions[n.id]; if (!pos) return '';
      const p  = calcProbability(tree.nodes, n.id);
      const rl = RISK_LEVEL(p * risk.impact);
      const isCrit = cpIds.has(n.id);
      const isLeaf = !tree.nodes.some(c => c.parentId === n.id);
      const typeClr = n.type === 'OR' ? '#3b82f6' : '#db2777';

      const metaBits = [
        n.difficulty !== 'Medium' ? `Difficulty: ${n.difficulty}` : null,
        n.cost !== 'Low' ? `Cost: ${n.cost}` : null,
        n.attackerSkill !== 'Hacktivist' ? `Skill: ${n.attackerSkill}` : null,
        n.detection !== 'Possible' ? `Detection: ${n.detection}` : null,
      ].filter(Boolean).join(' · ');

      return `
        <div class="at-node-card ${rl.cls} ${isCrit?'at-critical-path':''}"
             style="position:absolute;left:${pos.x}px;top:${pos.y}px;width:${NODE_W}px">
          <div class="at-node-header">
            <span class="at-gate" style="background:${typeClr}">${n.type}</span>
            <span class="at-node-name">${esc(n.name)}</span>
            <span class="at-prob-pill">${pct(p)}</span>
          </div>
          ${metaBits ? `<div class="at-node-meta">${esc(metaBits)}</div>` : ''}
          ${n.countermeasure ? `<div class="at-node-ctrl ${n.mitigated?'at-ctrl-active':''}">🛡 ${esc(n.countermeasure)}${n.mitigated?' ('+n.countermeasureEffectiveness+'% eff.)':''}</div>` : ''}
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

    // Risk summary banner
    const bannerCls = risk.level.cls;
    const pctDisplay = pct(risk.probability);
    const impactNote = linked
      ? `CVSS ${risk.impact} — ${esc(linked.name.substring(0,40))}${linked.name.length>40?'…':''}`
      : `Impact: ${risk.impact.toFixed(1)}/10 (manual)`;

    const impactInput = `
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,.7)">
        Manual impact:
        <input type="number" min="0" max="10" step="0.1" value="${risk.impact.toFixed(1)}"
          style="width:52px;padding:2px 5px;border-radius:4px;border:1px solid rgba(255,255,255,.3);
                 background:rgba(255,255,255,.15);color:#fff;font-size:11px"
          oninput="AttackTrees.updateImpact('${tree.id}',this.value)" />
      </div>`;

    return `
      <div class="at-card-header">
        <input class="at-name-input" type="text" value="${esc(tree.name)}"
          onchange="AttackTrees.updateTreeName('${tree.id}',this.value)" />
        ${linked ? `<span class="at-linked-risk">⚠ ${esc(linked.vulnId||'')} ${esc(linked.name.substring(0,30))}</span>` : ''}
        <button class="btn btn-danger btn-sm" onclick="AttackTrees.deleteTree('${tree.id}')">🗑 Delete</button>
      </div>
      <div class="at-risk-banner ${bannerCls}">
        <div class="at-risk-score-block">
          <div class="at-risk-score-num">${risk.score}</div>
          <div class="at-risk-score-lbl">${risk.level.lbl} Risk</div>
        </div>
        <div class="at-risk-details">
          <div>Attack Success Probability: <strong>${pctDisplay}</strong></div>
          <div style="font-size:11px;opacity:.85">${esc(impactNote)}</div>
          ${!linked ? impactInput : ''}
        </div>
        <div class="at-risk-legend">
          <div style="opacity:.8;font-size:11px">Critical Path</div>
          <svg width="40" height="10"><line x1="0" y1="5" x2="40" y2="5" stroke="#fca5a5" stroke-width="2.5"/></svg>
          <div style="opacity:.8;font-size:11px;margin-top:4px">Other Paths</div>
          <svg width="40" height="10"><line x1="0" y1="5" x2="40" y2="5" stroke="rgba(255,255,255,.4)" stroke-width="1.5" stroke-dasharray="4 3"/></svg>
        </div>
      </div>
      <div class="at-tree-canvas-wrap">
        <div class="at-tree-canvas" style="width:${Math.max(width, 240)}px;height:${height + 16}px">
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
      nodes: tree.nodes.map(n => ({
        probability: 'Possible', difficulty: 'Medium', cost: 'Low',
        attackerSkill: 'Hacktivist', detection: 'Possible',
        countermeasure: '', countermeasureEffectiveness: 80, mitigated: false, notes: '',
        ...n,
      })),
    }));
    render();
  }

  return {
    addTree, deleteTree, addFromThreat, confirmFromThreat,
    addNode, confirmAddNode, editNode, confirmEditNode, deleteNode,
    updateTreeName, updateImpact, render, getAll, setAll,
  };
})();
