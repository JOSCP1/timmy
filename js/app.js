'use strict';

const App = (() => {
  let toastTimer    = null;
  let autosaveTimer = null;

  async function init() {
    await Auth.init();
    Diagram.init();
    loadFromStorage();
    const lastView = sessionStorage.getItem('timmy_view') || 'threat-modeler';
    switchView(lastView);
    document.getElementById('projectName')?.addEventListener('input', autosave);
  }

  // ── View switching ────────────────────────────────────────────────────
  function switchView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + name)?.classList.add('active');
    document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
    sessionStorage.setItem('timmy_view', name);
    if (name === 'assets')    Assets.refresh();
    if (name === 'vuln-mgmt') VulnMgmt.filter(document.getElementById('vulnFilter')?.value || '');
    if (name === 'adversal')  Adversal.render();
    if (name === 'settings')  Settings.render();
  }

  // ── Persistence ───────────────────────────────────────────────────────
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveToStorage, 800);
  }

  function saveToStorage() {
    Storage.save({
      projectName:     document.getElementById('projectName').value,
      idCounters:      IDCounter.getData(),
      diagram:         Diagram.getData(),
      assetOrder:      Assets.getOrder(),
      vulnerabilities: VulnMgmt.getAll(),
      adversal:        Adversal.getAll(),
    });
  }

  function loadFromStorage() {
    const data = Storage.load();
    if (!data) return;
    // Restore ID counters first so subsequent assignments don't collide
    IDCounter.setData(data.idCounters);
    if (data.projectName) document.getElementById('projectName').value = data.projectName;
    if (data.diagram)     Diagram.setData(data.diagram);
    if (data.assetOrder)  Assets.setOrder(data.assetOrder);
    if (data.adversal)    Adversal.setAll(data.adversal);
    if (data.vulnerabilities) {
      data.vulnerabilities.forEach(v => { v.cvssScore = CVSS4.score(v.cvss); });
      VulnMgmt.setAll(data.vulnerabilities);
    }
    Assets.refresh();
  }

  // ── Save / Load JSON file ─────────────────────────────────────────────
  function save() {
    saveToStorage();
    const data = Storage.load();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const name = (document.getElementById('projectName').value || 'timmy').replace(/\s+/g,'_');
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click(); URL.revokeObjectURL(a.href);
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
        if (data.diagram)     Diagram.setData(data.diagram);
        if (data.assetOrder)  Assets.setOrder(data.assetOrder);
        if (data.adversal)    Adversal.setAll(data.adversal);
        if (data.vulnerabilities) {
          data.vulnerabilities.forEach(v => { v.cvssScore = CVSS4.score(v.cvss); });
          VulnMgmt.setAll(data.vulnerabilities);
        }
        Assets.refresh(); Storage.save(data);
        toast('Project loaded.', 'ok');
      } catch(err) { toast('Error: ' + err.message, 'error'); }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  // ── Modal ─────────────────────────────────────────────────────────────
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

  // ── Toast ─────────────────────────────────────────────────────────────
  function toast(msg, type = 'ok') {
    clearTimeout(toastTimer);
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `toast toast-${type} show`;
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  return { init, switchView, autosave, save, load, handleFileLoad, openModal, closeModal, toast };
})();

window.addEventListener('DOMContentLoaded', App.init);
