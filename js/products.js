'use strict';

const Products = (() => {
  let products    = [];
  let activeModel = null; // { productId, versionId, modelId }

  function uid() { return Math.random().toString(36).slice(2,9); }

  // ── Products ───────────────────────────────────────────────────────────
  function addProduct() {
    const p = { id:'prod_'+uid(), name:'New Product', created:new Date().toISOString(), versions:[] };
    products.push(p);
    render(); App.autosave();
    requestAnimationFrame(() => {
      const el = document.querySelector(`#pcard_${p.id} .product-name-input`);
      if (el) { el.select(); el.focus(); }
    });
  }

  function deleteProduct(id) {
    if (!confirm('Delete this product and all its versions and threat models?')) return;
    products = products.filter(p => p.id !== id);
    if (activeModel?.productId === id) { activeModel = null; updateHeaderBar(); }
    render(); App.autosave();
  }

  function updateName(id, name) {
    const p = products.find(p => p.id === id);
    if (p) { p.name = name; updateHeaderBar(); App.autosave(); }
  }

  // ── Versions ───────────────────────────────────────────────────────────
  function addVersion(productId) {
    const p = products.find(p => p.id === productId);
    if (!p) return;
    const v = { id:'pv_'+uid(), version:'1.0', threatModels:[] };
    p.versions.push(v);
    render(); App.autosave();
    requestAnimationFrame(() => {
      const el = document.querySelector(`#pvrow_${v.id} .version-input`);
      if (el) { el.select(); el.focus(); }
    });
  }

  function deleteVersion(productId, versionId) {
    const p = products.find(p => p.id === productId);
    if (!p) return;
    if (activeModel?.productId === productId && activeModel?.versionId === versionId) {
      activeModel = null; updateHeaderBar();
    }
    p.versions = p.versions.filter(v => v.id !== versionId);
    render(); App.autosave();
  }

  function updateVersionLabel(productId, versionId, val) {
    const v = products.find(p => p.id === productId)?.versions.find(v => v.id === versionId);
    if (v) { v.version = val; updateHeaderBar(); App.autosave(); }
  }

  // ── Threat Models ──────────────────────────────────────────────────────
  function addThreatModel(productId, versionId) {
    const v = products.find(p => p.id === productId)?.versions.find(v => v.id === versionId);
    if (!v) return;
    const tm = { id:'ptm_'+uid(), version:'v1', created:new Date().toISOString(), diagram:null };
    v.threatModels.push(tm);
    render(); App.autosave();
    requestAnimationFrame(() => {
      const el = document.querySelector(`#ptmrow_${tm.id} .tm-version-input`);
      if (el) { el.select(); el.focus(); }
    });
  }

  function deleteThreatModel(productId, versionId, modelId) {
    const v = products.find(p => p.id === productId)?.versions.find(v => v.id === versionId);
    if (!v) return;
    if (activeModel?.modelId === modelId) { activeModel = null; updateHeaderBar(); }
    v.threatModels = v.threatModels.filter(tm => tm.id !== modelId);
    render(); App.autosave();
  }

  function updateTMVersion(productId, versionId, modelId, val) {
    const v  = products.find(p => p.id === productId)?.versions.find(v => v.id === versionId);
    const tm = v?.threatModels.find(tm => tm.id === modelId);
    if (tm) { tm.version = val; updateHeaderBar(); App.autosave(); }
  }

  // ── Active model ───────────────────────────────────────────────────────
  function selectModel(productId, versionId, modelId) {
    // Persist current diagram into the currently active model before switching
    if (activeModel) saveCurrentDiagram(Diagram.getData());

    const p  = products.find(p => p.id === productId);
    const v  = p?.versions.find(v => v.id === versionId);
    const tm = v?.threatModels.find(tm => tm.id === modelId);
    if (!tm) return;

    activeModel = { productId, versionId, modelId };
    Diagram.setData(tm.diagram || { elements:[], connections:[], uid:0 });
    updateHeaderBar();
    render();
    App.switchView('threat-modeler');
    App.autosave();
  }

  function saveCurrentDiagram(data) {
    if (!activeModel) return;
    const v  = products.find(p => p.id === activeModel.productId)
                       ?.versions.find(v => v.id === activeModel.versionId);
    const tm = v?.threatModels.find(tm => tm.id === activeModel.modelId);
    if (tm) tm.diagram = data;
  }

  function getActiveRef() { return activeModel; }

  function getActiveInfo() {
    if (!activeModel) return null;
    const p  = products.find(p => p.id === activeModel.productId);
    const v  = p?.versions.find(v => v.id === activeModel.versionId);
    const tm = v?.threatModels.find(tm => tm.id === activeModel.modelId);
    if (!p || !v || !tm) return null;
    return { productName: p.name, productVersion: v.version, tmVersion: tm.version };
  }

  // ── Header breadcrumb ──────────────────────────────────────────────────
  function updateHeaderBar() {
    const bar  = document.getElementById('activeModelBar');
    const info = getActiveInfo();
    if (!bar) return;
    if (!info) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML =
      `<span class="amb-icon">📦</span>` +
      `<span class="amb-product">${esc(info.productName)}</span>` +
      `<span class="amb-sep">›</span>` +
      `<span class="amb-pver">${esc(info.productVersion)}</span>` +
      `<span class="amb-sep">›</span>` +
      `<span class="amb-tm">TM ${esc(info.tmVersion)}</span>`;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function render() {
    const list  = document.getElementById('productsList');
    const empty = document.getElementById('productsEmpty');
    if (!list) return;
    [...list.children].forEach(c => { if (c.id !== 'productsEmpty') c.remove(); });
    if (!products.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    products.forEach(prod => {
      const div = document.createElement('div');
      div.className = 'product-card';
      div.id = 'pcard_' + prod.id;
      div.innerHTML = buildProductHTML(prod);
      list.appendChild(div);
    });
  }

  function buildProductHTML(prod) {
    const versionsHTML = prod.versions.map(v => buildVersionHTML(prod.id, v)).join('');
    return `
      <div class="product-card-header">
        <input class="product-name-input" type="text" value="${esc(prod.name)}"
          onchange="Products.updateName('${prod.id}',this.value)" />
        <button class="btn btn-danger btn-sm"
          onclick="Products.deleteProduct('${prod.id}')">🗑 Delete</button>
      </div>
      <div class="product-card-body">
        ${versionsHTML || `<p class="product-hint">No versions yet.</p>`}
        <button class="btn btn-ghost btn-sm" style="margin-top:6px"
          onclick="Products.addVersion('${prod.id}')">+ Add Version</button>
      </div>`;
  }

  function buildVersionHTML(productId, v) {
    const tms = v.threatModels.map(tm => buildTMHTML(productId, v.id, tm)).join('');
    return `
      <div class="product-version" id="pvrow_${v.id}">
        <div class="product-version-header">
          <span class="pv-label">Version</span>
          <input class="version-input" type="text" value="${esc(v.version)}"
            onchange="Products.updateVersionLabel('${productId}','${v.id}',this.value)" />
          <button class="btn btn-danger btn-sm"
            onclick="Products.deleteVersion('${productId}','${v.id}')">🗑</button>
        </div>
        <div class="product-tm-list">
          ${tms || `<span class="product-hint">No threat models yet.</span>`}
          <button class="btn btn-ghost btn-sm" style="margin-top:4px"
            onclick="Products.addThreatModel('${productId}','${v.id}')">+ Add Threat Model</button>
        </div>
      </div>`;
  }

  function buildTMHTML(productId, versionId, tm) {
    const isActive = activeModel &&
      activeModel.productId === productId &&
      activeModel.versionId === versionId &&
      activeModel.modelId   === tm.id;
    return `
      <div class="product-tm-item ${isActive ? 'tm-active' : ''}" id="ptmrow_${tm.id}">
        <span class="pv-label">TM</span>
        <input class="tm-version-input" type="text" value="${esc(tm.version)}"
          onchange="Products.updateTMVersion('${productId}','${versionId}','${tm.id}',this.value)" />
        ${isActive
          ? `<span class="badge badge-green">● Active</span>`
          : `<button class="btn btn-primary btn-sm"
               onclick="Products.selectModel('${productId}','${versionId}','${tm.id}')">Open</button>`}
        <button class="btn btn-danger btn-sm"
          onclick="Products.deleteThreatModel('${productId}','${versionId}','${tm.id}')">🗑</button>
      </div>`;
  }

  // ── Serialise ──────────────────────────────────────────────────────────
  function getAll() { return { products, activeModel }; }

  function setAll(d) {
    if (!d) return;
    products    = d.products    || [];
    activeModel = d.activeModel || null;
    updateHeaderBar();
    render();
  }

  return {
    addProduct, deleteProduct, updateName,
    addVersion, deleteVersion, updateVersionLabel,
    addThreatModel, deleteThreatModel, updateTMVersion,
    selectModel, saveCurrentDiagram, getActiveRef,
    updateHeaderBar, getAll, setAll, render,
  };
})();
