const App: AppModule = (() => {
  let toastTimer:    ReturnType<typeof setTimeout> | null = null;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  async function init(): Promise<void> {
    await Auth.init();
    Diagram.init();
    loadFromStorage();
    const lastView = sessionStorage.getItem('timmy_view') || 'threat-modeler';
    switchView(lastView);
    document.getElementById('projectName')?.addEventListener('input', autosave);
    document.getElementById('productName')?.addEventListener('input', autosave);
  }

  function switchView(name: string): void {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + name)?.classList.add('active');
    document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
    sessionStorage.setItem('timmy_view', name);
    if (name === 'assets')    Assets.refresh();
    if (name === 'vuln-mgmt') VulnMgmt.filter((document.getElementById('vulnFilter') as HTMLSelectElement|null)?.value||'');
    if (name === 'adversal')  Adversal.render();
    if (name === 'settings')  Settings.render();
  }

  // ── Persistence ──────────────────────────────────────────────────────────
  function autosave(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveToStorage, 800);
  }

  function saveToStorage(): void {
    Storage.save({
      projectName:     (document.getElementById('projectName') as HTMLInputElement).value,
      productName:     (document.getElementById('productName') as HTMLInputElement|null)?.value || '',
      idCounters:      IDCounter.getData(),
      diagram:         Diagram.getData(),
      assetOrder:      Assets.getOrder(),
      vulnerabilities: VulnMgmt.getAll(),
      adversal:        Adversal.getAll(),
    });
  }

  function loadFromStorage(): void {
    const data = Storage.load();
    if (!data) return;
    IDCounter.setData(data.idCounters);
    const pn = document.getElementById('projectName') as HTMLInputElement|null;
    const prod = document.getElementById('productName') as HTMLInputElement|null;
    if (data.projectName && pn) pn.value = data.projectName;
    if (data.productName  && prod) prod.value = data.productName;
    if (data.diagram)     Diagram.setData(data.diagram);
    if (data.assetOrder)  Assets.setOrder(data.assetOrder);
    if (data.adversal)    Adversal.setAll(data.adversal);
    if (data.vulnerabilities) {
      data.vulnerabilities.forEach(v => { v.cvssScore = CVSS4.score(v.cvss); });
      VulnMgmt.setAll(data.vulnerabilities);
    }
    Assets.refresh();
  }

  // ── Save As dialog ───────────────────────────────────────────────────────
  function save(): void { saveAs(); }

  function saveAs(): void {
    const defaultName = (document.getElementById('projectName') as HTMLInputElement|null)?.value || 'timmy-project';
    openModal('Save Project', `
      <div class="form-field">
        <label>Filename</label>
        <input type="text" id="saveAsName" value="${esc(defaultName.replace(/\s+/g,'_'))}" style="width:100%" />
      </div>`,
      `<button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="App.confirmSaveAs()">💾 Download</button>`);
    setTimeout(() => {
      const inp = document.getElementById('saveAsName') as HTMLInputElement|null;
      inp?.select(); inp?.focus();
    }, 50);
  }

  function confirmSaveAs(): void {
    saveToStorage();
    const data = Storage.load();
    const name = ((document.getElementById('saveAsName') as HTMLInputElement|null)?.value || 'timmy-project')
      .replace(/[^a-zA-Z0-9_\-]/g,'_').replace(/\.json$/i,'');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    closeModal();
    toast('Project saved.','ok');
    Audit.log('save_project', { name });
  }

  function load(): void { document.getElementById('fileInput')?.click(); }

  function handleFileLoad(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev: ProgressEvent<FileReader>) => {
      try {
        const data = JSON.parse(ev.target!.result as string) as ProjectData;
        IDCounter.setData(data.idCounters);
        const pn   = document.getElementById('projectName') as HTMLInputElement|null;
        const prod = document.getElementById('productName') as HTMLInputElement|null;
        if (data.projectName && pn) pn.value = data.projectName;
        if (data.productName  && prod) prod.value = data.productName;
        if (data.diagram)     Diagram.setData(data.diagram);
        if (data.assetOrder)  Assets.setOrder(data.assetOrder);
        if (data.adversal)    Adversal.setAll(data.adversal);
        if (data.vulnerabilities) {
          data.vulnerabilities.forEach(v => { v.cvssScore = CVSS4.score(v.cvss); });
          VulnMgmt.setAll(data.vulnerabilities);
        }
        Assets.refresh(); Storage.save(data);
        toast('Project loaded.','ok');
        Audit.log('load_project', { name: data.projectName });
      } catch(err: unknown) { toast('Error: ' + (err as Error).message, 'error'); }
      input.value = '';
    };
    reader.readAsText(file);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openModal(title: string, body: string, footer = ''): void {
    const mt = document.getElementById('modalTitle');
    const mb = document.getElementById('modalBody');
    const mf = document.getElementById('modalFooter');
    if (mt) mt.textContent = title;
    if (mb) mb.innerHTML   = body;
    if (mf) mf.innerHTML   = footer;
    document.getElementById('modalOverlay')?.classList.add('visible');
    document.getElementById('modal')?.classList.add('visible');
  }
  function closeModal(): void {
    document.getElementById('modalOverlay')?.classList.remove('visible');
    document.getElementById('modal')?.classList.remove('visible');
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function toast(msg: string, type = 'ok'): void {
    if (toastTimer) clearTimeout(toastTimer);
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = `toast toast-${type} show`;
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  return { init, switchView, autosave, save, saveAs, load, handleFileLoad,
           openModal, closeModal, toast,
           confirmSaveAs: confirmSaveAs as unknown as () => void };
})() as AppModule & { confirmSaveAs: () => void };

window.addEventListener('DOMContentLoaded', () => { App.init(); });
