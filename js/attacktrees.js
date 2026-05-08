'use strict';

const AttackTrees = (() => {
  let trees = [];

  function uid() { return 'at_' + Math.random().toString(36).slice(2,9); }

  // ── Add / delete trees ────────────────────────────────────────────────
  function addTree(name, linkedThreatId, linkedThreatName) {
    const rootId = uid();
    const tree = {
      id: uid(),
      name: name || 'New Attack Tree',
      linkedThreatId: linkedThreatId || '',
      nodes: [{
        id: rootId, parentId: null,
        name: linkedThreatName || name || 'Attack Goal',
        type: 'OR', probability: 'Unknown',
        notes: '', countermeasure: '', mitigated: false,
      }],
    };
    trees.push(tree);
    render(); App.autosave();
    requestAnimationFrame(() => {
      document.getElementById('atcard_' + tree.id)?.scrollIntoView({ behavior:'smooth' });
    });
  }

  function deleteTree(treeId) {
    if (!confirm('Delete this attack tree?')) return;
    trees = trees.filter(t => t.id !== treeId);
    render(); App.autosave();
  }

  // ── Prompt to build from an identified risk ───────────────────────────
  function addFromThreat() {
    const vulns = VulnMgmt.getAll();
    if (!vulns.length) { App.toast('No identified risks yet. Run "Identify Threats" first.', 'error'); return; }
    const opts = vulns.map(v =>
      `<option value="${v.id}">[${esc(v.vulnId||'')}] ${esc(v.name)}</option>`
    ).join('');
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

  // ── Node operations ───────────────────────────────────────────────────
  function addNode(treeId, parentId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    App.openModal('Add Child Node', `
      <div class="vuln-form">
        <div class="form-field full">
          <label>Name / Attack Step</label>
          <input type="text" id="atn_name" placeholder="Describe the attack step…" />
        </div>
        <div class="form-field">
          <label>Node Type</label>
          <select id="atn_type">
            <option value="OR">OR — any child step suffices</option>
            <option value="AND">AND — all child steps required</option>
          </select>
        </div>
        <div class="form-field">
          <label>Likelihood</label>
          <select id="atn_prob">
            <option value="Unknown">Unknown</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
        <div class="form-field full">
          <label>Notes</label>
          <textarea id="atn_notes" rows="2"></textarea>
        </div>
        <div class="form-field full">
          <label>Countermeasure</label>
          <input type="text" id="atn_cm" placeholder="Control or mitigation…" />
        </div>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AttackTrees.confirmAddNode('${treeId}','${parentId}')">Add</button>`);
    setTimeout(() => document.getElementById('atn_name')?.focus(), 60);
  }

  function confirmAddNode(treeId, parentId) {
    const name = document.getElementById('atn_name')?.value.trim();
    if (!name) { App.toast('Name is required.', 'error'); return; }
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    tree.nodes.push({
      id: uid(), parentId,
      name,
      type:          document.getElementById('atn_type')?.value || 'OR',
      probability:   document.getElementById('atn_prob')?.value || 'Unknown',
      notes:         document.getElementById('atn_notes')?.value || '',
      countermeasure:document.getElementById('atn_cm')?.value   || '',
      mitigated: false,
    });
    App.closeModal(); renderTree(treeId); App.autosave();
  }

  function editNode(treeId, nodeId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    const node = tree.nodes.find(n => n.id === nodeId); if (!node) return;
    App.openModal('Edit Node', `
      <div class="vuln-form">
        <div class="form-field full">
          <label>Name / Attack Step</label>
          <input type="text" id="atn_name" value="${esc(node.name)}" />
        </div>
        <div class="form-field">
          <label>Node Type</label>
          <select id="atn_type">
            <option value="OR"  ${node.type==='OR' ?'selected':''}>OR — any child step suffices</option>
            <option value="AND" ${node.type==='AND'?'selected':''}>AND — all child steps required</option>
          </select>
        </div>
        <div class="form-field">
          <label>Likelihood</label>
          <select id="atn_prob">
            ${['Unknown','Low','Medium','High'].map(p=>
              `<option value="${p}" ${node.probability===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="atn_mit" ${node.mitigated?'checked':''}> Mitigated
          </label>
        </div>
        <div class="form-field full">
          <label>Notes</label>
          <textarea id="atn_notes" rows="2">${esc(node.notes)}</textarea>
        </div>
        <div class="form-field full">
          <label>Countermeasure</label>
          <input type="text" id="atn_cm" value="${esc(node.countermeasure)}" />
        </div>
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AttackTrees.confirmEditNode('${treeId}','${nodeId}')">Save</button>`);
  }

  function confirmEditNode(treeId, nodeId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    const node = tree.nodes.find(n => n.id === nodeId); if (!node) return;
    node.name          = document.getElementById('atn_name')?.value.trim() || node.name;
    node.type          = document.getElementById('atn_type')?.value || node.type;
    node.probability   = document.getElementById('atn_prob')?.value || node.probability;
    node.mitigated     = document.getElementById('atn_mit')?.checked || false;
    node.notes         = document.getElementById('atn_notes')?.value || '';
    node.countermeasure= document.getElementById('atn_cm')?.value   || '';
    App.closeModal(); renderTree(treeId); App.autosave();
  }

  function deleteNode(treeId, nodeId) {
    const tree = trees.find(t => t.id === treeId); if (!tree) return;
    const rootNode = tree.nodes.find(n => n.parentId === null);
    if (rootNode?.id === nodeId) { App.toast('Cannot delete the root node.', 'error'); return; }
    // Collect all descendant ids recursively, then remove them
    const toDelete = new Set([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      tree.nodes.forEach(n => {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
          toDelete.add(n.id); changed = true;
        }
      });
    }
    tree.nodes = tree.nodes.filter(n => !toDelete.has(n.id));
    renderTree(treeId); App.autosave();
  }

  // ── Render ─────────────────────────────────────────────────────────────
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
    const linked = tree.linkedThreatId
      ? VulnMgmt.getAll().find(v => v.id === tree.linkedThreatId)
      : null;
    const root = tree.nodes.find(n => n.parentId === null);
    return `
      <div class="at-card-header">
        <input class="at-name-input" type="text" value="${esc(tree.name)}"
          onchange="AttackTrees.updateTreeName('${tree.id}',this.value)" />
        ${linked ? `<span class="at-linked-risk">⚠ ${esc(linked.vulnId||'')} ${esc(linked.name)}</span>` : ''}
        <button class="btn btn-danger btn-sm" onclick="AttackTrees.deleteTree('${tree.id}')">🗑 Delete Tree</button>
      </div>
      <div class="at-tree-body">
        ${root ? renderNode(tree, root, 0) : '<p style="color:var(--c-muted);font-size:12px;padding:8px">No root node.</p>'}
      </div>`;
  }

  function renderNode(tree, node, depth) {
    const children = tree.nodes.filter(n => n.parentId === node.id);
    const probCls  = { High:'at-prob-high', Medium:'at-prob-med', Low:'at-prob-low', Unknown:'at-prob-unk' };
    return `
      <div class="at-node" style="--depth:${depth}">
        <div class="at-node-row ${node.mitigated?'at-mitigated':''}">
          <span class="at-type-badge at-type-${node.type}">${node.type}</span>
          <span class="at-node-name">${esc(node.name)}</span>
          <span class="at-prob-badge ${probCls[node.probability]||'at-prob-unk'}">${node.probability}</span>
          ${node.mitigated ? '<span class="badge badge-green" style="font-size:10px">Mitigated</span>' : ''}
          <div class="at-node-actions">
            <button class="btn btn-ghost btn-sm" onclick="AttackTrees.addNode('${tree.id}','${node.id}')">＋ Child</button>
            <button class="btn btn-ghost btn-sm" onclick="AttackTrees.editNode('${tree.id}','${node.id}')">✎</button>
            ${node.parentId!==null?`<button class="btn btn-danger btn-sm" onclick="AttackTrees.deleteNode('${tree.id}','${node.id}')">✕</button>`:''}
          </div>
        </div>
        ${node.countermeasure?`<div class="at-node-cm">🛡 ${esc(node.countermeasure)}</div>`:''}
        ${node.notes?`<div class="at-node-notes">${esc(node.notes)}</div>`:''}
        ${children.length ? `<div class="at-children">${children.map(c=>renderNode(tree,c,depth+1)).join('')}</div>` : ''}
      </div>`;
  }

  function updateTreeName(treeId, name) {
    const tree = trees.find(t => t.id === treeId);
    if (tree) { tree.name = name; App.autosave(); }
  }

  // ── Serialise ──────────────────────────────────────────────────────────
  function getAll()    { return trees; }
  function setAll(arr) { trees = arr || []; render(); }

  return {
    addTree, deleteTree, addFromThreat, confirmFromThreat,
    addNode, confirmAddNode, editNode, confirmEditNode, deleteNode,
    updateTreeName, render, getAll, setAll,
  };
})();
