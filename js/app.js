'use strict';

const App = (() => {
  let toastTimer    = null;
  let autosaveTimer = null;
  let _dirty        = false;
  let _newAfterSave = false;

  function init() {
    Diagram.init();
    loadFromStorage();
    const lastView = sessionStorage.getItem('timmy_view') || 'threat-modeler';
    switchView(lastView);
    document.getElementById('projectName')?.addEventListener('input', autosave);
    document.getElementById('productName')?.addEventListener('input', autosave);
    _dismissSplash();
  }

  function _dismissSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    setTimeout(() => {
      splash.classList.add('splash-fade');
      splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    }, 2000);
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
    _dirty = true;
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
    const defaultName = (document.getElementById('projectName')?.value || 'ostra-project').replace(/\s+/g,'_');
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
    const name = (document.getElementById('saveAsName')?.value || 'ostra-project')
      .replace(/[^a-zA-Z0-9_\-]/g,'_').replace(/\.json$/i,'');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    closeModal();
    toast('Project saved.', 'ok');
    _dirty = false;
    if (_newAfterSave) { _newAfterSave = false; _resetAll(); }
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
        _dirty = false;
        toast('Project loaded.', 'ok');
      } catch(err) { toast('Error: ' + err.message, 'error'); }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  // ── New Project ───────────────────────────────────────────────────────
  function newProject() {
    if (_dirty) {
      openModal('New Project',
        '<p style="color:var(--c-text)">The current project has unsaved changes.<br>What would you like to do?</p>',
        `<button class="btn btn-ghost"    onclick="App.closeModal()">Cancel</button>
         <button class="btn btn-danger"   onclick="App.discardAndNew()">Discard &amp; New</button>
         <button class="btn btn-primary"  onclick="App.saveAndNew()">💾 Save &amp; New</button>`
      );
    } else {
      _resetAll();
    }
  }

  function saveAndNew() {
    _newAfterSave = true;
    closeModal();
    saveAs();
  }

  function discardAndNew() {
    closeModal();
    _resetAll();
  }

  function _resetAll() {
    IDCounter.setData({ tm: 0, v: 0, ai: 0 });
    const pn   = document.getElementById('projectName');
    const prod = document.getElementById('productName');
    if (pn)   pn.value   = '';
    if (prod) prod.value = '';
    Diagram.setData({ elements: [], connections: [] });
    Assets.setOrder([]);
    Adversal.setAll([]);
    VulnMgmt.setAll([]);
    AttackTrees.setAll([]);
    RacAssessment.setAll({ entries: [], wSeq: 0, vSeq: 0 });
    saveToStorage();
    Assets.refresh();
    _dirty = false;
    toast('New project created.', 'ok');
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
           newProject, saveAndNew, discardAndNew,
           openModal, closeModal, toast };
})();

window.addEventListener('DOMContentLoaded', App.init);
