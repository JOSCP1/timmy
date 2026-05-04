// Module keeps internal name "Adversal" but all UI text says "Adverse Impact"
const Adversal: AdversalModule = (() => {
  let impacts: AdverseImpact[] = [];

  function add(): void {
    impacts.push({
      id: IDCounter.nextAI(),
      name: 'New Adverse Impact',
      cia: { c:'N', i:'N', a:'N' },
      privacyImpact: 'None',
      safetyImpact:  'None',
    });
    render(); App.autosave();
  }

  function remove(id: string): void {
    if (!confirm('Remove this adverse impact?')) return;
    impacts = impacts.filter(ai => ai.id !== id);
    render(); App.autosave();
  }

  function update(id: string, field: string, val: string): void {
    const ai = impacts.find(a => a.id === id);
    if (!ai) return;
    if (field.startsWith('cia.')) {
      (ai.cia as Record<string,string>)[field.slice(4)] = val;
    } else {
      (ai as unknown as Record<string,string>)[field] = val;
    }
    App.autosave();
  }

  function render(): void {
    const list  = document.getElementById('adversalList');
    const empty = document.getElementById('adversalEmpty');
    if (!list) return;

    [...list.children].forEach(c => { if (c.id !== 'adversalEmpty') c.remove(); });

    if (!impacts.length) { if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    const ciaOpts = (v: string): string => ['N','L','M','H'].map(x =>
      `<option value="${x}" ${v===x?'selected':''}>${({N:'None',L:'Low',M:'Med',H:'High'} as Record<string,string>)[x]}</option>`
    ).join('');
    const impOpts = (opts: string[], v: string): string => opts.map(o =>
      `<option value="${o}" ${v===o?'selected':''}>${o}</option>`
    ).join('');

    impacts.forEach(ai => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="adversal-card" id="acard_${ai.id}">
          <div class="adversal-header">
            <span class="id-chip">${esc(ai.id)}</span>
            <input type="text" class="adversal-name-input" value="${esc(ai.name)}"
              onchange="Adversal.update('${ai.id}','name',this.value)" placeholder="Impact name…" />
            <button class="btn btn-danger btn-sm" onclick="Adversal.remove('${ai.id}')">✕ Remove</button>
          </div>
          <div class="adversal-body">
            <div class="adversal-fields">
              <div class="form-field"><label>Confidentiality</label>
                <select onchange="Adversal.update('${ai.id}','cia.c',this.value)">${ciaOpts(ai.cia.c)}</select></div>
              <div class="form-field"><label>Integrity</label>
                <select onchange="Adversal.update('${ai.id}','cia.i',this.value)">${ciaOpts(ai.cia.i)}</select></div>
              <div class="form-field"><label>Availability</label>
                <select onchange="Adversal.update('${ai.id}','cia.a',this.value)">${ciaOpts(ai.cia.a)}</select></div>
              <div class="form-field"><label>Privacy Impact</label>
                <select onchange="Adversal.update('${ai.id}','privacyImpact',this.value)">
                  ${impOpts(['None','Low','Medium','High'], ai.privacyImpact)}</select></div>
              <div class="form-field"><label>Safety Impact</label>
                <select onchange="Adversal.update('${ai.id}','safetyImpact',this.value)">
                  ${impOpts(['None','Low','Medium','High','Critical'], ai.safetyImpact)}</select></div>
            </div>
          </div>
        </div>`;
      list.appendChild(div.firstElementChild as Element);
    });
  }

  function getAll(): AdverseImpact[] { return impacts; }
  function setAll(arr: AdverseImpact[]): void { impacts = arr || []; render(); }

  return { add, remove, update, render, getAll, setAll };
})();
