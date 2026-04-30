'use strict';

const Assets = (() => {
  let assetOrder  = [];   // ordered array of element IDs
  let filterType  = '';

  // ── Ordered asset list ────────────────────────────────────────────────
  function getOrdered() {
    const all = Diagram.getAllAssets();
    // Add newly created assets at the end
    all.forEach(a => { if (!assetOrder.includes(a.id)) assetOrder.push(a.id); });
    // Remove deleted assets
    assetOrder = assetOrder.filter(id => all.some(a => a.id === id));
    return assetOrder.map(id => all.find(a => a.id === id)).filter(Boolean);
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
      return `<tr>
        <td><span class="id-chip">${esc(a.tmId||a.id)}</span></td>
        <td><strong>${esc(a.name)}</strong></td>
        <td>${typeChip(a.type)}</td>
        <td>${ciaChip(a.cia?.c)}</td><td>${ciaChip(a.cia?.i)}</td><td>${ciaChip(a.cia?.a)}</td>
        <td>${threats ? `<span class="badge badge-red">${threats}</span>` : '<span style="color:var(--c-muted)">—</span>'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="Assets.moveUp('${a.id}')" title="Move up">↑</button>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="Assets.moveDown('${a.id}')" title="Move down">↓</button>
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

  // ── Helpers ───────────────────────────────────────────────────────────
  function typeChip(type) {
    const m = { process:'chip-process Process', store:'chip-store Store',
                dataflow:'chip-dataflow Data Flow', trustzone:'chip-tz Trust Zone' };
    const [c,l] = (m[type]||'chip '+type).split(' ');
    return `<span class="chip ${c}">${l}</span>`;
  }
  function ciaChip(v) {
    const m = { H:'chip-h High', M:'chip-m Med', L:'chip-l Low', N:'chip-n None' };
    const [c,l] = (m[v]||'chip-n None').split(' ');
    return `<span class="chip ${c}">${l}</span>`;
  }

  return { refresh, filter, search, moveUp, moveDown, exportCSV, getOrder, setOrder };
})();
