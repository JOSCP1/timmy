'use strict';

const Diagram = (() => {
  // ── State ────────────────────────────────────────────────────────────
  let elements    = [];
  let connections = [];
  let selected    = null;
  let tool        = 'select';
  let uid         = 1;

  let dragging    = null;
  let resizing    = null;   // { elId, handle, startPt, startEl }
  let connecting  = null;
  let drawingTZ   = null;
  let tempTZ      = null;
  let panState    = null;
  let viewBox     = { x:0, y:0, w:1200, h:700 };

  let svg, layerTZ, layerConn, layerEl, layerTemp;

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    svg       = document.getElementById('diagramSvg');
    layerTZ   = document.getElementById('layerTrustZones');
    layerConn = document.getElementById('layerConnections');
    layerEl   = document.getElementById('layerElements');
    layerTemp = document.getElementById('layerTemp');
    applyViewBox();

    svg.addEventListener('mousedown',  onMouseDown);
    svg.addEventListener('mousemove',  onMouseMove);
    svg.addEventListener('mouseup',    onMouseUp);
    svg.addEventListener('mouseleave', onMouseUp);
    svg.addEventListener('wheel',      onWheel, { passive: false });
    svg.addEventListener('dblclick',   onDblClick);

    document.getElementById('toolGroup').addEventListener('click', e => {
      const btn = e.target.closest('.tool-btn');
      if (btn) setTool(btn.dataset.tool);
    });

    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'p' || e.key === 'P') setTool('process');
      if (e.key === 's' || e.key === 'S') setTool('store');
      if (e.key === 'f' || e.key === 'F') setTool('dataflow');
      if (e.key === 't' || e.key === 'T') setTool('trustzone');
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape') { clearSelection(); connecting = null; clearTemp(); }
    });
  }

  // ── Tool ──────────────────────────────────────────────────────────────
  function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
    connecting = null; clearTemp();
  }

  // ── Coordinates ───────────────────────────────────────────────────────
  function svgPt(e) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left)  * (viewBox.w / rect.width)  + viewBox.x,
      y: (e.clientY - rect.top)   * (viewBox.h / rect.height) + viewBox.y
    };
  }
  function applyViewBox() {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
  }

  // ── Hit testing ───────────────────────────────────────────────────────
  function hitElement(x, y) {
    return elements.slice().reverse().find(el => {
      if (el.type === 'process')    return Math.hypot(x-el.x, y-el.y) <= el.r;
      if (el.type === 'store')      return x>=el.x-el.w/2 && x<=el.x+el.w/2 && y>=el.y-el.h/2 && y<=el.y+el.h/2;
      if (el.type === 'trustzone')  return x>=el.x && x<=el.x+el.w && y>=el.y && y<=el.y+el.h;
      return false;
    });
  }
  function hitConnection(x, y) {
    return connections.find(c => {
      const s = elCenter(c.src), t = elCenter(c.tgt);
      if (!s || !t) return false;
      return Math.hypot(x-(s.x+t.x)/2, y-(s.y+t.y)/2) < 18;
    });
  }
  function elCenter(id) {
    const el = elements.find(e => e.id === id);
    return el ? { x: el.x, y: el.y } : null;
  }

  // ── Resize handles ────────────────────────────────────────────────────
  function getHandles(el) {
    if (el.type === 'process') return [{ n:'e', cx: el.x+el.r, cy: el.y }];
    if (el.type === 'store') {
      const [hw,hh] = [el.w/2, el.h/2];
      return [
        { n:'se', cx:el.x+hw, cy:el.y+hh }, { n:'sw', cx:el.x-hw, cy:el.y+hh },
        { n:'ne', cx:el.x+hw, cy:el.y-hh }, { n:'nw', cx:el.x-hw, cy:el.y-hh }
      ];
    }
    if (el.type === 'trustzone') return [
      { n:'se', cx:el.x+el.w, cy:el.y+el.h }, { n:'sw', cx:el.x,      cy:el.y+el.h },
      { n:'ne', cx:el.x+el.w, cy:el.y      }, { n:'nw', cx:el.x,      cy:el.y      }
    ];
    return [];
  }

  // ── Mouse events ──────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button === 1) { panState = { sx:e.clientX, sy:e.clientY, vx:viewBox.x, vy:viewBox.y }; return; }
    if (e.button !== 0) return;
    const p = svgPt(e);

    // Resize handle click
    if (e.target.classList.contains('resize-handle')) {
      const el = elements.find(el => el.id === e.target.dataset.eid);
      if (el) { resizing = { elId: el.id, handle: e.target.dataset.h, startPt: p, startEl: {...el} }; }
      e.stopPropagation(); return;
    }

    if (tool === 'select') {
      const el = hitElement(p.x, p.y);
      const cn = !el && hitConnection(p.x, p.y);
      if (el) {
        selectElement(el.id);
        dragging = { id: el.id, ox: p.x - el.x, oy: p.y - el.y };
        e.preventDefault();
      } else if (cn) { selectConn(cn.id); }
      else { clearSelection(); panState = { sx:e.clientX, sy:e.clientY, vx:viewBox.x, vy:viewBox.y }; }
    }
    else if (tool === 'process') addElement({ type:'process', x:p.x, y:p.y, r:42, name:'Process', cia:{c:'N',i:'N',a:'N'}, justification:'' });
    else if (tool === 'store')   addElement({ type:'store',   x:p.x, y:p.y, w:110, h:55, name:'Store', cia:{c:'N',i:'N',a:'N'}, justification:'' });
    else if (tool === 'dataflow') {
      const el = hitElement(p.x, p.y);
      if (el && el.type !== 'trustzone') {
        if (!connecting) { connecting = el.id; renderElement(el); }
        else if (connecting !== el.id) {
          addConnection({ src:connecting, tgt:el.id, name:'Data Flow', cia:{c:'N',i:'N',a:'N'}, justification:'' });
          connecting = null; clearTemp(); setTool('select');
        }
      }
    }
    else if (tool === 'trustzone') {
      drawingTZ = { sx:p.x, sy:p.y };
      tempTZ = makeSVG('rect', { x:p.x, y:p.y, width:0, height:0, class:'element-trustzone', 'pointer-events':'none' });
      layerTemp.appendChild(tempTZ);
    }
  }

  function onMouseMove(e) {
    const p = svgPt(e);

    if (panState && !dragging && !resizing) {
      const rect = svg.getBoundingClientRect();
      viewBox.x = panState.vx - (e.clientX - panState.sx) * (viewBox.w / rect.width);
      viewBox.y = panState.vy - (e.clientY - panState.sy) * (viewBox.h / rect.height);
      applyViewBox(); return;
    }
    if (resizing) {
      const el = elements.find(e => e.id === resizing.elId);
      if (!el) return;
      const dx = p.x - resizing.startPt.x, dy = p.y - resizing.startPt.y;
      const s  = resizing.startEl, h = resizing.handle;
      if (el.type === 'process') {
        el.r = Math.max(25, s.r + dx);
      } else if (el.type === 'store') {
        if (h.includes('e')) { el.x = s.x + dx/2; el.w = Math.max(60, s.w + dx); }
        if (h.includes('w')) { el.x = s.x + dx/2; el.w = Math.max(60, s.w - dx); }
        if (h.includes('s')) { el.y = s.y + dy/2; el.h = Math.max(30, s.h + dy); }
        if (h.includes('n')) { el.y = s.y + dy/2; el.h = Math.max(30, s.h - dy); }
      } else if (el.type === 'trustzone') {
        if (h==='se') { el.w=Math.max(60,s.w+dx); el.h=Math.max(40,s.h+dy); }
        if (h==='sw') { el.x=s.x+Math.min(dx,s.w-60); el.w=Math.max(60,s.w-dx); el.h=Math.max(40,s.h+dy); }
        if (h==='ne') { el.w=Math.max(60,s.w+dx); el.y=s.y+Math.min(dy,s.h-40); el.h=Math.max(40,s.h-dy); }
        if (h==='nw') { el.x=s.x+Math.min(dx,s.w-60); el.y=s.y+Math.min(dy,s.h-40); el.w=Math.max(60,s.w-dx); el.h=Math.max(40,s.h-dy); }
      }
      renderElement(el);
      connections.filter(c => c.src===el.id || c.tgt===el.id).forEach(renderConn);
      return;
    }
    if (dragging) {
      const el = elements.find(e => e.id === dragging.id);
      if (el) {
        el.x = p.x - dragging.ox; el.y = p.y - dragging.oy;
        renderElement(el);
        connections.filter(c => c.src===el.id || c.tgt===el.id).forEach(renderConn);
      }
      return;
    }
    if (drawingTZ && tempTZ) {
      const x=Math.min(drawingTZ.sx,p.x), y=Math.min(drawingTZ.sy,p.y);
      tempTZ.setAttribute('x',x); tempTZ.setAttribute('y',y);
      tempTZ.setAttribute('width',Math.abs(p.x-drawingTZ.sx));
      tempTZ.setAttribute('height',Math.abs(p.y-drawingTZ.sy));
      return;
    }
    if (connecting) {
      clearTemp();
      const s = elCenter(connecting);
      if (s) layerTemp.appendChild(makeSVG('line',{x1:s.x,y1:s.y,x2:p.x,y2:p.y,class:'temp-line'}));
    }
  }

  function onMouseUp(e) {
    if (resizing) { resizing = null; App.autosave(); return; }
    if (drawingTZ && tempTZ) {
      const p = svgPt(e);
      const x=Math.min(drawingTZ.sx,p.x), y=Math.min(drawingTZ.sy,p.y);
      const w=Math.abs(p.x-drawingTZ.sx), h=Math.abs(p.y-drawingTZ.sy);
      if (w>20 && h>20) addElement({ type:'trustzone', x, y, w, h, name:'Trust Zone' });
      layerTemp.removeChild(tempTZ); tempTZ=null; drawingTZ=null;
    }
    dragging=null; panState=null;
  }

  function onWheel(e) {
    e.preventDefault();
    const p=svgPt(e), f=e.deltaY>0?1.12:0.89;
    viewBox.x=p.x-(p.x-viewBox.x)*f; viewBox.y=p.y-(p.y-viewBox.y)*f;
    viewBox.w*=f; viewBox.h*=f; applyViewBox();
  }

  function onDblClick(e) {
    const p=svgPt(e), el=hitElement(p.x,p.y);
    if (el) {
      const n=prompt('Element name:',el.name);
      if (n!==null) { el.name=n.trim()||el.name; renderElement(el); Assets.refresh(); }
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────
  function addElement(data) {
    const el = { id:'el_'+(uid++), tmId: IDCounter.nextTM(), justification:'', ...data };
    elements.push(el); renderElement(el); selectElement(el.id); Assets.refresh(); App.autosave();
  }
  function addConnection(data) {
    const c = { id:'cn_'+(uid++), tmId: IDCounter.nextTM(), justification:'', ...data };
    connections.push(c); renderConn(c); selectConn(c.id); Assets.refresh(); App.autosave();
  }
  function deleteSelected() {
    if (!selected) return;
    if (selected.type==='element') {
      elements=elements.filter(e=>e.id!==selected.id);
      connections=connections.filter(c=>c.src!==selected.id&&c.tgt!==selected.id);
      document.getElementById('el_'+selected.id)?.remove();
      connections.forEach(renderConn);
    } else {
      connections=connections.filter(c=>c.id!==selected.id);
      document.getElementById('cn_'+selected.id)?.remove();
    }
    clearSelection(); Assets.refresh(); App.autosave();
  }

  // ── Render ────────────────────────────────────────────────────────────
  function renderAll() {
    layerTZ.innerHTML=''; layerConn.innerHTML=''; layerEl.innerHTML='';
    elements.filter(e=>e.type==='trustzone').forEach(renderElement);
    connections.forEach(renderConn);
    elements.filter(e=>e.type!=='trustzone').forEach(renderElement);
  }

  function renderElement(el) {
    document.getElementById('el_'+el.id)?.remove();
    const g = makeSVG('g',{id:'el_'+el.id});
    const isSel = selected?.type==='element' && selected.id===el.id;
    const isCSrc = connecting===el.id;

    if (el.type==='process') {
      g.appendChild(makeSVG('circle',{ cx:el.x, cy:el.y, r:el.r, fill:'#fff',
        stroke: isSel?'#3b82f6':isCSrc?'#f59e0b':'#475569', 'stroke-width':isSel?2.5:2 }));
      appendLabel(g,el);
    } else if (el.type==='store') {
      const [hw,hh]=[el.w/2,el.h/2];
      g.appendChild(makeSVG('rect',{x:el.x-hw,y:el.y-hh,width:el.w,height:el.h,rx:4,fill:'#fff',
        stroke:isSel?'#3b82f6':'#475569','stroke-width':isSel?2.5:2}));
      for(let i=1;i<=2;i++) g.appendChild(makeSVG('line',{
        x1:el.x-hw+6,y1:el.y-hh+(el.h/3)*i,x2:el.x+hw-6,y2:el.y-hh+(el.h/3)*i,
        stroke:'#94a3b8','stroke-width':1}));
      appendLabel(g,el);
    } else if (el.type==='trustzone') {
      g.appendChild(makeSVG('rect',{x:el.x,y:el.y,width:el.w,height:el.h,
        class:'element-trustzone',stroke:isSel?'#f87171':'#ef4444'}));
      const lbl=makeSVG('text',{x:el.x+8,y:el.y+14,'text-anchor':'start',
        fill:'#ef4444','font-size':12,'font-weight':600,'pointer-events':'none','user-select':'none'});
      lbl.textContent=el.name; g.appendChild(lbl);
    }

    // ID label
    if (el.tmId && el.type!=='trustzone') {
      const idLbl = makeSVG('text',{
        x: el.type==='process'?el.x:el.x,
        y: el.type==='process'?el.y-el.r-5:el.y-el.h/2-5,
        'text-anchor':'middle','font-size':9,fill:'#94a3b8','pointer-events':'none'
      });
      idLbl.textContent=el.tmId; g.appendChild(idLbl);
    }

    // Selection ring
    if (isSel) {
      const ring = el.type==='process'
        ? makeSVG('circle',{cx:el.x,cy:el.y,r:el.r+5,class:'selected-ring'})
        : el.type==='store'
          ? makeSVG('rect',{x:el.x-el.w/2-5,y:el.y-el.h/2-5,width:el.w+10,height:el.h+10,rx:6,class:'selected-ring'})
          : null;
      if (ring) g.appendChild(ring);

      // Resize handles
      getHandles(el).forEach(h => {
        const rh = makeSVG('rect',{x:h.cx-5,y:h.cy-5,width:10,height:10,
          class:'resize-handle','data-eid':el.id,'data-h':h.n,cursor:'nwse-resize'});
        g.appendChild(rh);
      });
    }

    const layer = el.type==='trustzone'?layerTZ:layerEl;
    layer.appendChild(g);
  }

  function renderConn(c) {
    document.getElementById('cn_'+c.id)?.remove();
    const s=elCenter(c.src), t=elCenter(c.tgt);
    if (!s||!t) return;
    const isSel = selected?.type==='conn'&&selected.id===c.id;
    const g=makeSVG('g',{id:'cn_'+c.id});
    const hit=makeSVG('line',{x1:s.x,y1:s.y,x2:t.x,y2:t.y,class:'conn-hit'});
    hit.addEventListener('click',()=>selectConn(c.id)); g.appendChild(hit);
    g.appendChild(makeSVG('line',{x1:s.x,y1:s.y,x2:t.x,y2:t.y,
      stroke:isSel?'#3b82f6':'#475569','stroke-width':isSel?2.5:1.8,
      'marker-end':isSel?'url(#arrowSel)':'url(#arrow)'}));
    const lbl=makeSVG('text',{x:(s.x+t.x)/2,y:(s.y+t.y)/2-7,class:'conn-label'});
    lbl.textContent=c.name; g.appendChild(lbl);
    if (c.tmId) {
      const idLbl=makeSVG('text',{x:(s.x+t.x)/2,y:(s.y+t.y)/2+6,
        'text-anchor':'middle','font-size':9,fill:'#94a3b8','pointer-events':'none'});
      idLbl.textContent=c.tmId; g.appendChild(idLbl);
    }
    layerConn.appendChild(g);
  }

  function appendLabel(g, el) {
    const lbl=makeSVG('text',{x:el.x,y:el.y,class:'element-label'});
    lbl.textContent=el.name; g.appendChild(lbl);
    if (el.cia) {
      const cia=makeSVG('text',{x:el.x,
        y:el.type==='process'?el.y+el.r+10:el.y+el.h/2+13,class:'element-cia'});
      cia.textContent=`C:${el.cia.c} I:${el.cia.i} A:${el.cia.a}`; g.appendChild(cia);
    }
  }

  // ── Selection & Properties ────────────────────────────────────────────
  function selectElement(id) {
    // Re-render previous selection to remove its ring first
    const prev = selected;
    if (prev && prev.id !== id) {
      selected = null;
      if (prev.type === 'element') { const e = elements.find(el=>el.id===prev.id); if(e) renderElement(e); }
      else if (prev.type === 'conn') { const c = connections.find(cn=>cn.id===prev.id); if(c) renderConn(c); }
    }
    selected = { type:'element', id };
    const el = elements.find(e=>e.id===id);
    if (el) { renderElement(el); showProps(el); }
  }
  function selectConn(id) {
    const prev = selected;
    if (prev && prev.id !== id) {
      selected = null;
      if (prev.type === 'element') { const e = elements.find(el=>el.id===prev.id); if(e) renderElement(e); }
      else if (prev.type === 'conn') { const c = connections.find(cn=>cn.id===prev.id); if(c) renderConn(c); }
    }
    selected = { type:'conn', id };
    const c = connections.find(c=>c.id===id);
    if (c) { renderConn(c); showConnProps(c); }
  }
  function clearSelection() {
    const prev=selected; selected=null;
    if (prev?.type==='element') { const el=elements.find(e=>e.id===prev.id); if(el) renderElement(el); }
    else if (prev?.type==='conn') { const c=connections.find(c=>c.id===prev.id); if(c) renderConn(c); }
    document.getElementById('propsContent').innerHTML='<p class="props-hint">Select an element to edit its properties.</p>';
  }

  function showProps(el) {
    const ciaRow = el.type==='trustzone' ? '' : `
      <div class="props-field">
        <label>CIA Classification</label>
        <div class="cia-row">
          <div><label>C</label>${ciaSelect(el,'c')}</div>
          <div><label>I</label>${ciaSelect(el,'i')}</div>
          <div><label>A</label>${ciaSelect(el,'a')}</div>
        </div>
      </div>`;
    const justRow = el.type==='trustzone' ? '' : `
      <div class="props-field">
        <label>Justification</label>
        <textarea rows="3" style="width:100%;padding:6px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:12px;font-family:inherit;resize:vertical"
          onchange="Diagram.updateProp('${el.id}','justification',this.value)">${esc(el.justification||'')}</textarea>
      </div>`;
    document.getElementById('propsContent').innerHTML=`
      <div class="props-field">
        <label>ID</label>
        <input type="text" value="${esc(el.tmId||'')}" disabled style="color:var(--c-muted);background:#f1f5f9" />
      </div>
      <div class="props-field">
        <label>Name</label>
        <input type="text" value="${esc(el.name)}" onchange="Diagram.updateProp('${el.id}','name',this.value)" />
      </div>
      <div class="props-field">
        <label>Type</label>
        <input type="text" value="${el.type}" disabled style="color:var(--c-muted);background:#f1f5f9" />
      </div>
      ${ciaRow}${justRow}
      <div class="props-field" style="margin-top:12px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete</button>
      </div>`;
  }

  function showConnProps(c) {
    document.getElementById('propsContent').innerHTML=`
      <div class="props-field">
        <label>ID</label>
        <input type="text" value="${esc(c.tmId||'')}" disabled style="color:var(--c-muted);background:#f1f5f9" />
      </div>
      <div class="props-field">
        <label>Name</label>
        <input type="text" value="${esc(c.name)}" onchange="Diagram.updateConnProp('${c.id}','name',this.value)" />
      </div>
      <div class="props-field">
        <label>CIA Classification</label>
        <div class="cia-row">
          <div><label>C</label>${ciaSelectConn(c,'c')}</div>
          <div><label>I</label>${ciaSelectConn(c,'i')}</div>
          <div><label>A</label>${ciaSelectConn(c,'a')}</div>
        </div>
      </div>
      <div class="props-field">
        <label>Justification</label>
        <textarea rows="3" style="width:100%;padding:6px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:12px;font-family:inherit;resize:vertical"
          onchange="Diagram.updateConnProp('${c.id}','justification',this.value)">${esc(c.justification||'')}</textarea>
      </div>
      <div class="props-field" style="margin-top:12px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete</button>
      </div>`;
  }

  function ciaSelect(el,key) {
    return `<select onchange="Diagram.updateCIA('${el.id}','${key}',this.value)">${
      ['N','L','M','H'].map(v=>`<option value="${v}" ${el.cia[key]===v?'selected':''}>${{N:'None',L:'Low',M:'Med',H:'High'}[v]}</option>`).join('')
    }</select>`;
  }
  function ciaSelectConn(c,key) {
    return `<select onchange="Diagram.updateConnCIA('${c.id}','${key}',this.value)">${
      ['N','L','M','H'].map(v=>`<option value="${v}" ${c.cia[key]===v?'selected':''}>${{N:'None',L:'Low',M:'Med',H:'High'}[v]}</option>`).join('')
    }</select>`;
  }

  // ── Public update ─────────────────────────────────────────────────────
  function updateProp(id,key,val)   { const el=elements.find(e=>e.id===id);    if(el){el[key]=val;renderElement(el);Assets.refresh();App.autosave();} }
  function updateCIA(id,key,val)    { const el=elements.find(e=>e.id===id);    if(el){el.cia[key]=val;renderElement(el);Assets.refresh();App.autosave();} }
  function updateConnProp(id,key,val){ const c=connections.find(c=>c.id===id); if(c){c[key]=val;renderConn(c);Assets.refresh();App.autosave();} }
  function updateConnCIA(id,key,val) { const c=connections.find(c=>c.id===id); if(c){c.cia[key]=val;renderConn(c);Assets.refresh();App.autosave();} }

  // ── Zoom ─────────────────────────────────────────────────────────────
  function zoomIn()   { viewBox.w*=0.85;viewBox.h*=0.85;applyViewBox(); }
  function zoomOut()  { viewBox.w*=1.18;viewBox.h*=1.18;applyViewBox(); }
  function resetView(){ viewBox={x:0,y:0,w:1200,h:700};applyViewBox(); }

  // ── Export SVG ────────────────────────────────────────────────────────
  function exportSVG() {
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('.resize-handle,.selected-ring').forEach(n=>n.remove());
    clone.querySelector('#layerTemp')?.replaceChildren();
    const style = document.createElementNS('http://www.w3.org/2000/svg','style');
    style.textContent = `
      circle,rect[class*="store"]{fill:#fff;stroke:#475569;stroke-width:2}
      rect[class*="trustzone"]{fill:rgba(239,68,68,.06);stroke:#ef4444;stroke-width:2;stroke-dasharray:8 4}
      .element-label{font-size:12px;fill:#1e293b;text-anchor:middle;dominant-baseline:middle;font-family:sans-serif}
      .element-cia,.conn-label{font-size:9px;fill:#64748b;text-anchor:middle;font-family:sans-serif}
      line{stroke:#475569;stroke-width:1.8;fill:none;marker-end:url(#arrow)}
      polygon{fill:#475569}
    `;
    clone.insertBefore(style, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml],{type:'image/svg+xml'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (document.getElementById('projectName').value||'diagram').replace(/\s+/g,'_') + '-model.svg';
    a.click(); URL.revokeObjectURL(a.href);
    App.toast('Model exported as SVG.', 'ok');
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function makeSVG(tag,attrs={}) {
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    return el;
  }
  function clearTemp() { layerTemp.innerHTML=''; }

  // ── Serialise ─────────────────────────────────────────────────────────
  function getData()  { return { elements, connections, uid }; }
  function setData(d) {
    elements    = (d.elements||[]).map(el => ({ justification:'', ...el, tmId: el.tmId || IDCounter.nextTM() }));
    connections = (d.connections||[]).map(c  => ({ justification:'', ...c,  tmId: c.tmId  || IDCounter.nextTM() }));
    uid         = d.uid || elements.length + connections.length + 1;
    renderAll(); clearSelection(); Assets.refresh();
  }

  function getAllAssets() {
    return [
      ...elements.filter(e=>e.type!=='trustzone').map(e=>({ id:e.id, tmId:e.tmId, name:e.name, type:e.type, cia:e.cia||{c:'N',i:'N',a:'N'}, justification:e.justification||'' })),
      ...connections.map(c=>({ id:c.id, tmId:c.tmId, name:c.name, type:'dataflow', cia:c.cia||{c:'N',i:'N',a:'N'}, justification:c.justification||'' }))
    ];
  }
  function getElements()    { return elements; }
  function getConnections() { return connections; }

  function focusElement(id) {
    if (elements.find(e => e.id === id))    selectElement(id);
    else if (connections.find(c => c.id === id)) selectConn(id);
  }

  return { init, getData, setData, getAllAssets, getElements, getConnections,
           deleteSelected, updateProp, updateCIA, updateConnProp, updateConnCIA,
           zoomIn, zoomOut, resetView, exportSVG, focusElement };
})();
