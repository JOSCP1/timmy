'use strict';

const Diagram = (() => {
  // ── State ────────────────────────────────────────────────────────────
  let elements    = [];   // processes, stores, trustzones
  let connections = [];   // data flows
  let selected    = null; // {type:'element'|'conn', id}
  let tool        = 'select';
  let uid         = 1;

  // Interaction state
  let dragging    = null; // {id, ox, oy}  element being dragged
  let connecting  = null; // id of source element for dataflow
  let drawingTZ   = null; // {sx,sy} start of trust zone drag
  let tempTZ      = null; // in-progress trust zone rect element
  let panState    = null; // {sx,sy,vx,vy}
  let viewBox     = { x:0, y:0, w:1200, h:700 };

  // SVG refs
  let svg, layerTZ, layerConn, layerEl, layerTemp;

  // ── Init ────────────────────────────────────────────────────────────
  function init() {
    svg      = document.getElementById('diagramSvg');
    layerTZ  = document.getElementById('layerTrustZones');
    layerConn= document.getElementById('layerConnections');
    layerEl  = document.getElementById('layerElements');
    layerTemp= document.getElementById('layerTemp');

    applyViewBox();

    svg.addEventListener('mousedown',  onMouseDown);
    svg.addEventListener('mousemove',  onMouseMove);
    svg.addEventListener('mouseup',    onMouseUp);
    svg.addEventListener('mouseleave', onMouseUp);
    svg.addEventListener('wheel',      onWheel, { passive: false });
    svg.addEventListener('dblclick',   onDblClick);

    // Tool bar
    document.getElementById('toolGroup').addEventListener('click', e => {
      const btn = e.target.closest('.tool-btn');
      if (!btn) return;
      setTool(btn.dataset.tool);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'p' || e.key === 'P') setTool('process');
      if (e.key === 's' || e.key === 'S') setTool('store');
      if (e.key === 'f' || e.key === 'F') setTool('dataflow');
      if (e.key === 't' || e.key === 'T') setTool('trustzone');
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.isContentEditable) deleteSelected();
      if (e.key === 'Escape') { clearSelection(); connecting = null; clearTemp(); }
    });
  }

  // ── Tool management ────────────────────────────────────────────────
  function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
    connecting = null;
    clearTemp();
  }

  // ── Coordinate helpers ─────────────────────────────────────────────
  function svgPt(e) {
    const rect = svg.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    return { x: (e.clientX - rect.left) * scaleX + viewBox.x,
             y: (e.clientY - rect.top)  * scaleY + viewBox.y };
  }
  function applyViewBox() {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
  }

  // ── Hit testing ────────────────────────────────────────────────────
  function hitElement(x, y) {
    return elements.slice().reverse().find(el => {
      if (el.type === 'process') {
        return Math.hypot(x - el.x, y - el.y) <= el.r;
      } else if (el.type === 'store') {
        return x >= el.x - el.w/2 && x <= el.x + el.w/2 &&
               y >= el.y - el.h/2 && y <= el.y + el.h/2;
      } else if (el.type === 'trustzone') {
        return x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h;
      }
      return false;
    });
  }
  function hitConnection(x, y) {
    return connections.find(c => {
      const s = elementCenter(c.src), t = elementCenter(c.tgt);
      if (!s || !t) return false;
      const mx = (s.x + t.x)/2, my = (s.y + t.y)/2;
      return Math.hypot(x - mx, y - my) < 18;
    });
  }
  function elementCenter(id) {
    const el = elements.find(e => e.id === id);
    if (!el) return null;
    return { x: el.x, y: el.y };
  }

  // ── Mouse events ───────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button === 1) { // middle-click = pan
      panState = { sx: e.clientX, sy: e.clientY, vx: viewBox.x, vy: viewBox.y };
      return;
    }
    if (e.button !== 0) return;
    const p = svgPt(e);

    if (tool === 'select') {
      const el = hitElement(p.x, p.y);
      const cn = !el && hitConnection(p.x, p.y);
      if (el) {
        selectElement(el.id);
        if (el.type !== 'trustzone') {
          dragging = { id: el.id, ox: p.x - el.x, oy: p.y - el.y };
        } else {
          dragging = { id: el.id, ox: p.x - el.x, oy: p.y - el.y, isTZ: true };
        }
        e.preventDefault();
      } else if (cn) {
        selectConn(cn.id);
      } else {
        clearSelection();
        panState = { sx: e.clientX, sy: e.clientY, vx: viewBox.x, vy: viewBox.y };
      }
    }
    else if (tool === 'process') {
      addElement({ type:'process', x: p.x, y: p.y, r: 42, name:'Process', cia:{c:'N',i:'N',a:'N'} });
    }
    else if (tool === 'store') {
      addElement({ type:'store', x: p.x, y: p.y, w: 110, h: 55, name:'Store', cia:{c:'N',i:'N',a:'N'} });
    }
    else if (tool === 'dataflow') {
      const el = hitElement(p.x, p.y);
      if (el && el.type !== 'trustzone') {
        if (!connecting) {
          connecting = el.id;
          renderElement(el); // highlight
        } else if (connecting !== el.id) {
          addConnection({ src: connecting, tgt: el.id, name: 'Data Flow', cia:{c:'N',i:'N',a:'N'} });
          connecting = null;
          clearTemp();
          setTool('select');
        }
      }
    }
    else if (tool === 'trustzone') {
      drawingTZ = { sx: p.x, sy: p.y };
      tempTZ = makeSVG('rect', {
        x: p.x, y: p.y, width:0, height:0,
        class: 'element-trustzone', 'pointer-events':'none'
      });
      layerTemp.appendChild(tempTZ);
    }
  }

  function onMouseMove(e) {
    const p = svgPt(e);

    if (panState) {
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      viewBox.x = panState.vx - (e.clientX - panState.sx) * scaleX;
      viewBox.y = panState.vy - (e.clientY - panState.sy) * scaleY;
      applyViewBox();
      return;
    }
    if (dragging) {
      const el = elements.find(el => el.id === dragging.id);
      if (el) {
        if (el.type === 'trustzone') {
          el.x = p.x - dragging.ox; el.y = p.y - dragging.oy;
        } else {
          el.x = p.x - dragging.ox; el.y = p.y - dragging.oy;
        }
        renderElement(el);
        connections.filter(c => c.src === el.id || c.tgt === el.id).forEach(renderConn);
      }
      return;
    }
    if (drawingTZ && tempTZ) {
      const x = Math.min(drawingTZ.sx, p.x);
      const y = Math.min(drawingTZ.sy, p.y);
      const w = Math.abs(p.x - drawingTZ.sx);
      const h = Math.abs(p.y - drawingTZ.sy);
      Object.assign(tempTZ, {}); // re-use existing
      tempTZ.setAttribute('x', x); tempTZ.setAttribute('y', y);
      tempTZ.setAttribute('width', w); tempTZ.setAttribute('height', h);
      return;
    }
    if (connecting) {
      clearTemp();
      const s = elementCenter(connecting);
      if (s) {
        const line = makeSVG('line', { x1:s.x, y1:s.y, x2:p.x, y2:p.y, class:'temp-line' });
        layerTemp.appendChild(line);
      }
    }
  }

  function onMouseUp(e) {
    if (drawingTZ && tempTZ) {
      const p = svgPt(e);
      const x = Math.min(drawingTZ.sx, p.x);
      const y = Math.min(drawingTZ.sy, p.y);
      const w = Math.abs(p.x - drawingTZ.sx);
      const h = Math.abs(p.y - drawingTZ.sy);
      if (w > 20 && h > 20) {
        addElement({ type:'trustzone', x, y, w, h, name:'Trust Zone' });
      }
      layerTemp.removeChild(tempTZ);
      tempTZ = null; drawingTZ = null;
    }
    dragging = null;
    panState = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const p = svgPt(e);
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    viewBox.x = p.x - (p.x - viewBox.x) * factor;
    viewBox.y = p.y - (p.y - viewBox.y) * factor;
    viewBox.w *= factor; viewBox.h *= factor;
    applyViewBox();
  }

  function onDblClick(e) {
    const p = svgPt(e);
    const el = hitElement(p.x, p.y);
    if (el) {
      const newName = prompt('Element name:', el.name);
      if (newName !== null) {
        el.name = newName.trim() || el.name;
        renderElement(el);
        Assets.refresh();
      }
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────
  function addElement(data) {
    const el = { id: 'el_' + (uid++), ...data };
    elements.push(el);
    renderElement(el);
    selectElement(el.id);
    Assets.refresh();
    App.autosave();
  }

  function addConnection(data) {
    const c = { id: 'cn_' + (uid++), ...data };
    connections.push(c);
    renderConn(c);
    selectConn(c.id);
    Assets.refresh();
    App.autosave();
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.type === 'element') {
      elements = elements.filter(e => e.id !== selected.id);
      connections = connections.filter(c => c.src !== selected.id && c.tgt !== selected.id);
      document.getElementById('el_' + selected.id)?.remove();
      connections.forEach(renderConn);
    } else {
      connections = connections.filter(c => c.id !== selected.id);
      document.getElementById('cn_' + selected.id)?.remove();
    }
    clearSelection();
    Assets.refresh();
    App.autosave();
  }

  // ── Rendering ─────────────────────────────────────────────────────
  function renderAll() {
    layerTZ.innerHTML = '';
    layerConn.innerHTML = '';
    layerEl.innerHTML = '';
    elements.filter(e => e.type === 'trustzone').forEach(renderElement);
    connections.forEach(renderConn);
    elements.filter(e => e.type !== 'trustzone').forEach(renderElement);
  }

  function renderElement(el) {
    const existing = document.getElementById('el_' + el.id);
    if (existing) existing.remove();

    const g = makeSVG('g', { id: 'el_' + el.id });
    const isSel = selected?.type === 'element' && selected.id === el.id;
    const isConnSrc = connecting === el.id;

    if (el.type === 'process') {
      g.appendChild(makeSVG('circle', {
        cx: el.x, cy: el.y, r: el.r,
        class: 'element-process' + (isSel || isConnSrc ? '' : ''),
        stroke: isSel ? '#3b82f6' : isConnSrc ? '#f59e0b' : '#475569',
        'stroke-width': isSel ? 2.5 : 2,
        fill: '#fff'
      }));
      appendLabel(g, el);
    }
    else if (el.type === 'store') {
      const hw = el.w/2, hh = el.h/2;
      g.appendChild(makeSVG('rect', {
        x: el.x-hw, y: el.y-hh, width: el.w, height: el.h, rx:4,
        class: 'element-store',
        stroke: isSel ? '#3b82f6' : '#475569',
        'stroke-width': isSel ? 2.5 : 2, fill: '#fff'
      }));
      // Store lines (database-style bars)
      for (let i=1; i<=2; i++) {
        g.appendChild(makeSVG('line', {
          x1: el.x-hw+6, y1: el.y-hh + (el.h/(3))*i,
          x2: el.x+hw-6, y2: el.y-hh + (el.h/(3))*i,
          stroke: '#94a3b8', 'stroke-width': 1
        }));
      }
      appendLabel(g, el);
    }
    else if (el.type === 'trustzone') {
      g.appendChild(makeSVG('rect', {
        x: el.x, y: el.y, width: el.w, height: el.h,
        class: 'element-trustzone',
        stroke: isSel ? '#f87171' : '#ef4444'
      }));
      const lbl = makeSVG('text', { x: el.x+8, y: el.y+14, class:'element-label',
        'text-anchor':'start', fill:'#ef4444', 'font-size':12, 'font-weight':'600' });
      lbl.textContent = el.name;
      g.appendChild(lbl);
    }

    if (isSel) {
      const ring = makeSelectionRing(el);
      if (ring) g.appendChild(ring);
    }

    const layer = el.type === 'trustzone' ? layerTZ : layerEl;
    layer.appendChild(g);
  }

  function makeSelectionRing(el) {
    if (el.type === 'process') {
      return makeSVG('circle', { cx:el.x, cy:el.y, r:el.r+5, class:'selected-ring' });
    }
    if (el.type === 'store') {
      return makeSVG('rect', { x:el.x-el.w/2-5, y:el.y-el.h/2-5,
        width:el.w+10, height:el.h+10, rx:6, class:'selected-ring' });
    }
    return null;
  }

  function appendLabel(g, el) {
    const lbl = makeSVG('text', { x:el.x, y:el.y, class:'element-label' });
    lbl.textContent = el.name;
    g.appendChild(lbl);
    if (el.cia) {
      const cia = makeSVG('text', {
        x: el.x, y: el.type==='process' ? el.y+el.r+10 : el.y+el.h/2+13,
        class:'element-cia'
      });
      cia.textContent = `C:${el.cia.c} I:${el.cia.i} A:${el.cia.a}`;
      g.appendChild(cia);
    }
  }

  function renderConn(c) {
    const existing = document.getElementById('cn_' + c.id);
    if (existing) existing.remove();
    const s = elementCenter(c.src), t = elementCenter(c.tgt);
    if (!s || !t) return;

    const isSel = selected?.type === 'conn' && selected.id === c.id;
    const g = makeSVG('g', { id: 'cn_' + c.id });

    // Invisible thick hit area
    const hit = makeSVG('line', {
      x1:s.x, y1:s.y, x2:t.x, y2:t.y, class:'conn-hit'
    });
    hit.addEventListener('click', () => selectConn(c.id));
    g.appendChild(hit);

    // Visible line
    const line = makeSVG('line', {
      x1:s.x, y1:s.y, x2:t.x, y2:t.y,
      stroke: isSel ? '#3b82f6' : '#475569',
      'stroke-width': isSel ? 2.5 : 1.8,
      'marker-end': isSel ? 'url(#arrowSel)' : 'url(#arrow)'
    });
    g.appendChild(line);

    // Label at midpoint
    const mx = (s.x+t.x)/2, my = (s.y+t.y)/2 - 7;
    const lbl = makeSVG('text', { x:mx, y:my, class:'conn-label' });
    lbl.textContent = c.name;
    g.appendChild(lbl);

    layerConn.appendChild(g);
  }

  // ── Selection ─────────────────────────────────────────────────────
  function selectElement(id) {
    selected = { type:'element', id };
    const el = elements.find(e => e.id === id);
    if (el) {
      renderElement(el);
      showProps(el);
    }
  }
  function selectConn(id) {
    selected = { type:'conn', id };
    const c = connections.find(c => c.id === id);
    if (c) { renderConn(c); showConnProps(c); }
  }
  function clearSelection() {
    const prev = selected;
    selected = null;
    if (prev?.type === 'element') {
      const el = elements.find(e => e.id === prev.id);
      if (el) renderElement(el);
    } else if (prev?.type === 'conn') {
      const c = connections.find(c => c.id === prev.id);
      if (c) renderConn(c);
    }
    document.getElementById('propsContent').innerHTML =
      '<p class="props-hint">Select an element to edit its properties.</p>';
  }

  // ── Properties Panel ───────────────────────────────────────────────
  function showProps(el) {
    const ciaRow = el.type === 'trustzone' ? '' : `
      <div class="props-field">
        <label>CIA Classification</label>
        <div class="cia-row">
          <div><label>Confidentiality</label>${ciaSelect(el, 'c')}</div>
          <div><label>Integrity</label>${ciaSelect(el, 'i')}</div>
          <div><label>Availability</label>${ciaSelect(el, 'a')}</div>
        </div>
      </div>`;
    document.getElementById('propsContent').innerHTML = `
      <div class="props-field">
        <label>Name</label>
        <input type="text" value="${el.name}" onchange="Diagram.updateProp('${el.id}','name',this.value)" />
      </div>
      <div class="props-field">
        <label>Type</label>
        <input type="text" value="${el.type}" disabled style="color:var(--c-muted)" />
      </div>
      ${ciaRow}
      <div class="props-field" style="margin-top:16px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete Element</button>
      </div>`;
  }

  function showConnProps(c) {
    document.getElementById('propsContent').innerHTML = `
      <div class="props-field">
        <label>Name</label>
        <input type="text" value="${c.name}" onchange="Diagram.updateConnProp('${c.id}','name',this.value)" />
      </div>
      <div class="props-field">
        <label>CIA Classification</label>
        <div class="cia-row">
          <div><label>Confidentiality</label>${ciaSelectConn(c,'c')}</div>
          <div><label>Integrity</label>${ciaSelectConn(c,'i')}</div>
          <div><label>Availability</label>${ciaSelectConn(c,'a')}</div>
        </div>
      </div>
      <div class="props-field" style="margin-top:16px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete Flow</button>
      </div>`;
  }

  function ciaSelect(el, key) {
    const opts = ['N','L','M','H'].map(v =>
      `<option value="${v}" ${el.cia[key]===v?'selected':''}>${{N:'None',L:'Low',M:'Med',H:'High'}[v]}</option>`
    ).join('');
    return `<select onchange="Diagram.updateCIA('${el.id}','${key}',this.value)">${opts}</select>`;
  }
  function ciaSelectConn(c, key) {
    const opts = ['N','L','M','H'].map(v =>
      `<option value="${v}" ${c.cia[key]===v?'selected':''}>${{N:'None',L:'Low',M:'Med',H:'High'}[v]}</option>`
    ).join('');
    return `<select onchange="Diagram.updateConnCIA('${c.id}','${key}',this.value)">${opts}</select>`;
  }

  // ── Public update methods ─────────────────────────────────────────
  function updateProp(id, key, val) {
    const el = elements.find(e => e.id === id);
    if (el) { el[key] = val; renderElement(el); Assets.refresh(); App.autosave(); }
  }
  function updateCIA(id, key, val) {
    const el = elements.find(e => e.id === id);
    if (el) { el.cia[key] = val; renderElement(el); Assets.refresh(); App.autosave(); }
  }
  function updateConnProp(id, key, val) {
    const c = connections.find(c => c.id === id);
    if (c) { c[key] = val; renderConn(c); Assets.refresh(); App.autosave(); }
  }
  function updateConnCIA(id, key, val) {
    const c = connections.find(c => c.id === id);
    if (c) { c.cia[key] = val; renderConn(c); Assets.refresh(); App.autosave(); }
  }

  // ── Zoom controls ─────────────────────────────────────────────────
  function zoomIn()   { viewBox.w *= 0.85; viewBox.h *= 0.85; applyViewBox(); }
  function zoomOut()  { viewBox.w *= 1.18; viewBox.h *= 1.18; applyViewBox(); }
  function resetView(){ viewBox = {x:0,y:0,w:1200,h:700}; applyViewBox(); }

  // ── Helpers ───────────────────────────────────────────────────────
  function makeSVG(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
  function clearTemp() {
    layerTemp.innerHTML = '';
  }

  // ── Serialise / Deserialise ────────────────────────────────────────
  function getData()  { return { elements, connections, uid }; }
  function setData(d) {
    elements    = d.elements    || [];
    connections = d.connections || [];
    uid         = d.uid         || (elements.length + connections.length + 1);
    renderAll();
    clearSelection();
    Assets.refresh();
  }

  // ── getAllAssets (for assets module) ───────────────────────────────
  function getAllAssets() {
    return [
      ...elements.map(e => ({
        id: e.id, name: e.name, type: e.type,
        cia: e.cia || { c:'N',i:'N',a:'N' }
      })),
      ...connections.map(c => ({
        id: c.id, name: c.name, type: 'dataflow',
        cia: c.cia || { c:'N',i:'N',a:'N' }
      }))
    ].filter(a => a.type !== 'trustzone');
  }

  function getElements()    { return elements; }
  function getConnections() { return connections; }

  return {
    init, getData, setData, getAllAssets,
    getElements, getConnections,
    deleteSelected, updateProp, updateCIA, updateConnProp, updateConnCIA,
    zoomIn, zoomOut, resetView
  };
})();
