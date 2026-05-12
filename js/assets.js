'use strict';

const Assets = (() => {
  let assetOrder   = [];   // ordered array of element IDs (diagram + manual)
  let manualAssets = [];   // assets added manually (not from diagram)
  let filterType   = '';

  // ── Ordered asset list ────────────────────────────────────────────────
  function getOrdered() {
    const all = [...Diagram.getAllAssets(), ...manualAssets];
    all.forEach(a => { if (!assetOrder.includes(a.id)) assetOrder.push(a.id); });
    assetOrder = assetOrder.filter(id => all.some(a => a.id === id));
    return assetOrder.map(id => all.find(a => a.id === id)).filter(Boolean);
  }

  // ── Add / edit / delete manual assets ────────────────────────────────
  function addManual() {
    App.openModal('Add Asset',
      `<div class="form-field">
         <label>Name</label>
         <input type="text" id="ma_name" style="width:100%" placeholder="Asset name…" />
       </div>
       <div class="form-field">
         <label>Type</label>
         <select id="ma_type" style="width:100%">
           <option value="generic">Generic Asset</option>
           <option value="process">Process</option>
           <option value="store">Data Store</option>
           <option value="external">External Entity</option>
           <option value="cylinder">Database</option>
           <option value="actor">Actor</option>
           <option value="dataflow">Data Flow</option>
         </select>
       </div>
       <div class="form-field">
         <label>CIA Classification</label>
         <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
           ${['c','i','a'].map(dim=>`
           <label style="font-size:12px">${{c:'C',i:'I',a:'A'}[dim]}:
             <select id="ma_cia_${dim}" style="margin-left:4px">
               ${['N','L','M','H'].map(v=>`<option value="${v}">${{N:'None',L:'Low',M:'Med',H:'High'}[v]}</option>`).join('')}
             </select>
           </label>`).join('')}
         </div>
       </div>
       <div class="form-field">
         <label>Justification</label>
         <textarea id="ma_just" rows="2" style="width:100%" placeholder="Justification for CIA ratings…"></textarea>
       </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="Assets.confirmAddManual()">Add Asset</button>`
    );
    setTimeout(() => document.getElementById('ma_name')?.focus(), 50);
  }

  function confirmAddManual() {
    const name = document.getElementById('ma_name')?.value.trim();
    if (!name) { App.toast('Name is required.', 'error'); return; }
    const asset = {
      id:   'manual_' + Date.now(),
      tmId: IDCounter.nextTM(),
      name,
      type: document.getElementById('ma_type')?.value || 'generic',
      cia:  { c: document.getElementById('ma_cia_c')?.value||'N',
               i: document.getElementById('ma_cia_i')?.value||'N',
               a: document.getElementById('ma_cia_a')?.value||'N' },
      justification: document.getElementById('ma_just')?.value.trim() || '',
      manual: true,
    };
    manualAssets.push(asset);
    App.closeModal();
    refresh();
    App.autosave();
    App.toast('Asset added.', 'ok');
  }

  function deleteManual(id) {
    manualAssets = manualAssets.filter(a => a.id !== id);
    assetOrder   = assetOrder.filter(i => i !== id);
    refresh();
    App.autosave();
  }

  // ── Move up / down ────────────────────────────────────────────────────
  function moveUp(id) {
    const i = assetOrder.indexOf(id);
    if (i > 0) { [assetOrder[i-1], assetOrder[i]] = [assetOrder[i], assetOrder[i-1]]; refresh(); App.autosave(); }
  }
  function moveDown(id) {
    const i = assetOrder.indexOf(id);
    if (i < assetOrder.length-1) { [assetOrder[i], assetOrder[i+1]] = [assetOrder[i+1], assetOrder[i]]; refresh(); App.autosave(); }
  }

  // ── Refresh ───────────────────────────────────────────────────────────
  function refresh() {
    let assets = getOrdered();
    const vulns  = VulnMgmt.getAll();
    const tbody  = document.getElementById('assetsTbody');
    const empty  = document.getElementById('assetsEmpty');
    const badge  = document.getElementById('assetsBadge');
    const search = (document.getElementById('assetSearch')?.value || '').toLowerCase();
    badge.textContent = assets.length;

    // Apply type filter
    if (filterType) assets = assets.filter(a => a.type === filterType);
    // Apply search filter
    if (search)     assets = assets.filter(a => a.name.toLowerCase().includes(search) || (a.tmId||'').toLowerCase().includes(search));

    if (!assets.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
    empty.style.display = 'none';

    tbody.innerHTML = assets.map((a, idx) => {
      const threats = vulns.filter(v => v.assetId === a.id).length;
      const delBtn  = a.manual
        ? `<button class="btn btn-danger btn-sm" style="padding:2px 6px;font-size:11px" onclick="Assets.deleteManual('${a.id}')" title="Delete">🗑</button>`
        : '';
      return `<tr>
        <td><span class="id-chip">${esc(a.tmId||a.id)}</span></td>
        <td><strong>${esc(a.name)}</strong>${a.manual ? ' <span style="font-size:10px;color:var(--c-muted)">(manual)</span>' : ''}</td>
        <td>${typeChip(a.type)}</td>
        <td>${ciaChip(a.cia?.c)}</td><td>${ciaChip(a.cia?.i)}</td><td>${ciaChip(a.cia?.a)}</td>
        <td>${threats ? `<span class="badge badge-red">${threats}</span>` : '<span style="color:var(--c-muted)">—</span>'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="Assets.moveUp('${a.id}')" title="Move up">↑</button>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="Assets.moveDown('${a.id}')" title="Move down">↓</button>
          ${delBtn}
        </td>
      </tr>`;
    }).join('');
  }

  function filter(val) { filterType = val; refresh(); }

  function search(query) { refresh(); }   // search reads from input directly

  // ── CSV Export ────────────────────────────────────────────────────────
  function exportCSV() {
    const assets = getOrdered();
    const vulns  = VulnMgmt.getAll();
    const rows   = [
      ['ID','Name','Type','Confidentiality','Integrity','Availability','Justification','Threats']
    ];
    assets.forEach(a => {
      const count = vulns.filter(v => v.assetId === a.id).length;
      rows.push([
        a.tmId || a.id,
        `"${(a.name||'').replace(/"/g,'""')}"`,
        a.type,
        a.cia?.c||'N', a.cia?.i||'N', a.cia?.a||'N',
        `"${(a.justification||'').replace(/"/g,'""')}"`,
        count
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = 'assets.csv';
    link.click(); URL.revokeObjectURL(link.href);
    App.toast('Assets exported as CSV.', 'ok');
  }

  // ── Serialise ─────────────────────────────────────────────────────────
  function getOrder()    { return assetOrder; }
  function setOrder(arr) { assetOrder = arr || []; }
  function getManual()    { return manualAssets; }
  function setManual(arr) { manualAssets = (arr || []).map(a => ({ ...a, manual: true })); }

  // ── Helpers ───────────────────────────────────────────────────────────
  function typeChip(type) {
    const m = { process:'chip-process Process',   store:'chip-store Data Store',
                external:'chip-external External Entity',
                diamond:'chip-diamond Decision',   cylinder:'chip-cylinder Database',
                actor:'chip-actor Actor',
                dataflow:'chip-dataflow Data Flow', trustzone:'chip-tz Trust Zone',
                generic:'chip-generic Asset' };
    const parts = (m[type]||('chip-generic '+(type||'Asset'))).split(' ');
    const cls = parts[0], lbl = parts.slice(1).join(' ');
    return `<span class="chip ${cls}">${lbl}</span>`;
  }
  function ciaChip(v) {
    const m = { H:'chip-h High', M:'chip-m Med', L:'chip-l Low', N:'chip-n None' };
    const [c,l] = (m[v]||'chip-n None').split(' ');
    return `<span class="chip ${c}">${l}</span>`;
  }

  return { refresh, filter, search, moveUp, moveDown, exportCSV,
           addManual, confirmAddManual, deleteManual,
           getOrder, setOrder, getManual, setManual };
})();
