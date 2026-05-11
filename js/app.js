'use strict';

const App = (() => {
  let toastTimer    = null;
  let autosaveTimer = null;

  function init() {
    Diagram.init();
    loadFromStorage();
    const lastView = sessionStorage.getItem('timmy_view') || 'threat-modeler';
    switchView(lastView);
    document.getElementById('projectName')?.addEventListener('input', autosave);
    document.getElementById('productName')?.addEventListener('input', autosave);
  }

  function switchView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + name)?.classList.add('active');
    document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
    sessionStorage.setItem('timmy_view', name);
    if (name === 'assets')      Assets.refresh();
    if (name === 'vuln-mgmt')   VulnMgmt.filter(document.getElementById('vulnFilter')?.value || '');
    if (name === 'adversal')    Adversal.render();
    if (name === 'attacktrees') AttackTrees.render();
    if (name === 'rac')         RacAssessment.render();
    if (name === 'settings')    Settings.render();
  }

  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveToStorage, 800);
  }

  function saveToStorage() {
    Storage.save({
      projectName:     document.getElementById('projectName').value,
      productName:     document.getElementById('productName')?.value || '',
      idCounters:      IDCounter.getData(),
      diagram:         Diagram.getData(),
      assetOrder:      Assets.getOrder(),
      vulnerabilities: VulnMgmt.getAll(),
      adversal:        Adversal.getAll(),
      attackTrees:     AttackTrees.getAll(),
      racAssessment:   RacAssessment.getAll(),
    });
  }

  function loadFromStorage() {
    const data = Storage.load();
    if (!data) return;
    IDCounter.setData(data.idCounters);
    if (data.projectName) document.getElementById('projectName').value = data.projectName;
    const prod = document.getElementById('productName');
    if (data.productName && prod) prod.value = data.productName;
    if (data.diagram)     Diagram.setData(data.diagram);
    if (data.assetOrder)  Assets.setOrder(data.assetOrder);
    if (data.adversal)    Adversal.setAll(data.adversal);
    if (data.vulnerabilities) {
      data.vulnerabilities.forEach(v => { v.cvssScore = CVSS4.score(v.cvss); });
      VulnMgmt.setAll(data.vulnerabilities);
    }
    if (data.attackTrees)   AttackTrees.setAll(data.attackTrees);
    if (data.racAssessment) RacAssessment.setAll(data.racAssessment);
    Assets.refresh();
  }

  // ── Save As dialog ────────────────────────────────────────────────────
  function save()   { saveAs(); }
  function saveAs() {
    const defaultName = (document.getElementById('projectName')?.value || 'timmy-project').replace(/\s+/g,'_');
    openModal('Save Project', `
      <div class="form-field">
        <label>Filename</label>
        <input type="text" id="saveAsName" value="${defaultName}" style="width:100%" />
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="App.confirmSaveAs()">💾 Download</button>`);
    setTimeout(() => { const inp = document.getElementById('saveAsName'); inp?.select(); inp?.focus(); }, 50);
  }

  function confirmSaveAs() {
    saveToStorage();
    const data = Storage.load();
    const name = (document.getElementById('saveAsName')?.value || 'timmy-project')
      .replace(/[^a-zA-Z0-9_\-]/g,'_').replace(/\.json$/i,'');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    closeModal();
    toast('Project saved.', 'ok');
  }

  function load() { document.getElementById('fileInput').click(); }

  function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        IDCounter.setData(data.idCounters);
        if (data.projectName) document.getElementById('projectName').value = data.projectName;
        const prod = document.getElementById('productName');
        if (data.productName && prod) prod.value = data.productName;
        if (data.diagram)     Diagram.setData(data.diagram);
        if (data.assetOrder)  Assets.setOrder(data.assetOrder);
        if (data.adversal)    Adversal.setAll(data.adversal);
        if (data.vulnerabilities) {
          data.vulnerabilities.forEach(v => { v.cvssScore = CVSS4.score(v.cvss); });
          VulnMgmt.setAll(data.vulnerabilities);
        }
        if (data.attackTrees)   AttackTrees.setAll(data.attackTrees);
        if (data.racAssessment) RacAssessment.setAll(data.racAssessment);
        Assets.refresh(); Storage.save(data);
        toast('Project loaded.', 'ok');
      } catch(err) { toast('Error: ' + err.message, 'error'); }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function openModal(title, body, footer = '') {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML   = body;
    document.getElementById('modalFooter').innerHTML = footer;
    document.getElementById('modalOverlay').classList.add('visible');
    document.getElementById('modal').classList.add('visible');
  }
  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('visible');
    document.getElementById('modal').classList.remove('visible');
  }

  function toast(msg, type = 'ok') {
    clearTimeout(toastTimer);
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `toast toast-${type} show`;
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  return { init, switchView, autosave, save, saveAs, confirmSaveAs, load, handleFileLoad,
           openModal, closeModal, toast };
})();

window.addEventListener('DOMContentLoaded', App.init);
