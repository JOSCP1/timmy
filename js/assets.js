'use strict';

const Assets = (() => {
  function refresh() {
    const assets = Diagram.getAllAssets();
    const vulns  = VulnMgmt.getAll();
    const tbody  = document.getElementById('assetsTbody');
    const empty  = document.getElementById('assetsEmpty');
    const badge  = document.getElementById('assetsBadge');
    badge.textContent = assets.length;

    if (!assets.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    tbody.innerHTML = assets.map(a => {
      const typeChip = typeLabel(a.type);
      const threats  = vulns.filter(v => v.assetId === a.id).length;
      const threatsBadge = threats
        ? `<span class="badge badge-red">${threats}</span>`
        : `<span style="color:var(--c-muted)">—</span>`;
      return `<tr>
        <td><strong>${esc(a.name)}</strong></td>
        <td>${typeChip}</td>
        <td>${ciaChip(a.cia?.c)}</td>
        <td>${ciaChip(a.cia?.i)}</td>
        <td>${ciaChip(a.cia?.a)}</td>
        <td>${threatsBadge}</td>
      </tr>`;
    }).join('');
  }

  function filter(query) {
    const rows = document.querySelectorAll('#assetsTbody tr');
    const q = query.toLowerCase();
    rows.forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  function typeLabel(type) {
    const map = { process:'chip-process', store:'chip-store',
                  dataflow:'chip-dataflow', trustzone:'chip-tz' };
    const cls = map[type] || 'chip';
    const label = { process:'Process', store:'Store', dataflow:'Data Flow', trustzone:'Trust Zone' }[type] || type;
    return `<span class="chip ${cls}">${label}</span>`;
  }

  function ciaChip(v) {
    const map = { H:'chip-h High', M:'chip-m Med', L:'chip-l Low', N:'chip-n None' };
    const cls = map[v] || 'chip-n None';
    const [c, l] = cls.split(' ');
    return `<span class="chip ${c}">${l}</span>`;
  }

  return { refresh, filter };
})();

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
