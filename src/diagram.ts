const Diagram: DiagramModule = (() => {
  let elements:    DiagramElement[]   = [];
  let connections: DiagramConnection[] = [];
  let selected:    { type: 'element'|'conn'; id: string } | null = null;
  let tool    = 'select';
  let uid     = 1;

  let dragging:  { id: string; ox: number; oy: number } | null = null;
  let resizing:  { elId: string; handle: string; startPt: {x:number;y:number}; startEl: DiagramElement } | null = null;
  let connecting: string | null = null;
  let drawingTZ:  { sx: number; sy: number } | null = null;
  let tempTZ:     SVGElement | null = null;
  let panState:   { sx:number; sy:number; vx:number; vy:number } | null = null;
  let viewBox = { x:0, y:0, w:1200, h:700 };

  let svg: SVGSVGElement, layerTZ: SVGGElement, layerConn: SVGGElement, layerEl: SVGGElement, layerTemp: SVGGElement;

  // ── Init ──────────────────────────────────────────────────────────────
  function init(): void {
    svg       = document.getElementById('diagramSvg')    as SVGSVGElement;
    layerTZ   = document.getElementById('layerTrustZones') as SVGGElement;
    layerConn = document.getElementById('layerConnections') as SVGGElement;
    layerEl   = document.getElementById('layerElements')  as SVGGElement;
    layerTemp = document.getElementById('layerTemp')      as SVGGElement;
    applyViewBox();

    svg.addEventListener('mousedown',  onMouseDown);
    svg.addEventListener('mousemove',  onMouseMove);
    svg.addEventListener('mouseup',    onMouseUp);
    svg.addEventListener('mouseleave', onMouseUp);
    svg.addEventListener('wheel',      onWheel as EventListener, { passive: false });
    svg.addEventListener('dblclick',   onDblClick);

    document.getElementById('toolGroup')?.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest('.tool-btn') as HTMLElement|null;
      if (btn) setTool(btn.dataset['tool'] || 'select');
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key==='v'||e.key==='V') setTool('select');
      if (e.key==='p'||e.key==='P') setTool('process');
      if (e.key==='s'||e.key==='S') setTool('store');
      if (e.key==='f'||e.key==='F') setTool('dataflow');
      if (e.key==='t'||e.key==='T') setTool('trustzone');
      if (e.key==='Delete'||e.key==='Backspace') deleteSelected();
      if (e.key==='Escape') { clearSelection(); connecting=null; clearTemp(); }
    });
  }

  function setTool(t: string): void {
    tool = t;
    document.querySelectorAll('.tool-btn').forEach(b =>
      b.classList.toggle('active', (b as HTMLElement).dataset['tool'] === t));
    svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
    connecting = null; clearTemp();
  }

  // ── Coordinates ──────────────────────────────────────────────────────
  function svgPt(e: MouseEvent): {x:number;y:number} {
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (viewBox.w / rect.width)  + viewBox.x,
      y: (e.clientY - rect.top)  * (viewBox.h / rect.height) + viewBox.y,
    };
  }
  function applyViewBox(): void {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
  }

  // ── Hit testing ───────────────────────────────────────────────────────
  function hitElement(x: number, y: number): DiagramElement|undefined {
    return elements.slice().reverse().find(el => {
      if (el.type==='process')   return Math.hypot(x-el.x, y-el.y) <= (el.r||0);
      if (el.type==='store')     return x>=el.x-(el.w||0)/2&&x<=el.x+(el.w||0)/2&&y>=el.y-(el.h||0)/2&&y<=el.y+(el.h||0)/2;
      if (el.type==='trustzone') return x>=el.x&&x<=el.x+(el.w||0)&&y>=el.y&&y<=el.y+(el.h||0);
      return false;
    });
  }
  function hitConnection(x: number, y: number): DiagramConnection|undefined {
    return connections.find(c => {
      const s = elCenter(c.src), t = elCenter(c.tgt);
      if (!s||!t) return false;
      return Math.hypot(x-(s.x+t.x)/2, y-(s.y+t.y)/2) < 18;
    });
  }
  function elCenter(id: string): {x:number;y:number}|null {
    const el = elements.find(e => e.id === id);
    return el ? { x:el.x, y:el.y } : null;
  }

  // ── Resize handles ────────────────────────────────────────────────────
  function getHandles(el: DiagramElement): {n:string;cx:number;cy:number}[] {
    if (el.type==='process') return [{ n:'e', cx:el.x+(el.r||0), cy:el.y }];
    if (el.type==='store') {
      const [hw,hh] = [(el.w||0)/2,(el.h||0)/2];
      return [{ n:'se',cx:el.x+hw,cy:el.y+hh },{ n:'sw',cx:el.x-hw,cy:el.y+hh },
              { n:'ne',cx:el.x+hw,cy:el.y-hh },{ n:'nw',cx:el.x-hw,cy:el.y-hh }];
    }
    if (el.type==='trustzone') return [
      { n:'se',cx:el.x+(el.w||0),cy:el.y+(el.h||0) },{ n:'sw',cx:el.x,cy:el.y+(el.h||0) },
      { n:'ne',cx:el.x+(el.w||0),cy:el.y           },{ n:'nw',cx:el.x,cy:el.y           },
    ];
    return [];
  }

  // ── Mouse events ──────────────────────────────────────────────────────
  function onMouseDown(e: MouseEvent): void {
    if (e.button===1) { panState={sx:e.clientX,sy:e.clientY,vx:viewBox.x,vy:viewBox.y}; return; }
    if (e.button!==0) return;
    const p = svgPt(e);

    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      const eid = (e.target as HTMLElement).dataset['eid'];
      const h   = (e.target as HTMLElement).dataset['h'];
      const el  = elements.find(el => el.id === eid);
      if (el && h) { resizing = { elId:el.id, handle:h, startPt:p, startEl:{...el} }; }
      e.stopPropagation(); return;
    }

    if (tool==='select') {
      const el = hitElement(p.x, p.y);
      const cn = !el && hitConnection(p.x, p.y);
      if (el)      { selectElement(el.id); dragging={id:el.id,ox:p.x-el.x,oy:p.y-el.y}; e.preventDefault(); }
      else if (cn) { selectConn(cn.id); }
      else         { clearSelection(); panState={sx:e.clientX,sy:e.clientY,vx:viewBox.x,vy:viewBox.y}; }
    }
    else if (tool==='process')   addElement({ type:'process',   x:p.x,y:p.y,r:42,  name:'Process',    cia:{c:'N',i:'N',a:'N'}, justificationC:'',justificationI:'',justificationA:'',justification:'' });
    else if (tool==='store')     addElement({ type:'store',     x:p.x,y:p.y,w:110,h:55, name:'Store', cia:{c:'N',i:'N',a:'N'}, justificationC:'',justificationI:'',justificationA:'',justification:'' });
    else if (tool==='dataflow') {
      const el = hitElement(p.x, p.y);
      if (el && el.type!=='trustzone') {
        if (!connecting) { connecting=el.id; renderElement(el); }
        else if (connecting!==el.id) {
          addConnection({ src:connecting,tgt:el.id,name:'Data Flow',cia:{c:'N',i:'N',a:'N'},
            justificationC:'',justificationI:'',justificationA:'',justification:'',direction:'forward' });
          connecting=null; clearTemp(); setTool('select');
        }
      }
    }
    else if (tool==='trustzone') {
      drawingTZ={sx:p.x,sy:p.y};
      tempTZ=makeSVG('rect',{x:p.x,y:p.y,width:0,height:0,class:'element-trustzone','pointer-events':'none'});
      layerTemp.appendChild(tempTZ);
    }
  }

  function onMouseMove(e: MouseEvent): void {
    const p = svgPt(e);
    if (panState && !dragging && !resizing) {
      const rect = svg.getBoundingClientRect();
      viewBox.x = panState.vx - (e.clientX-panState.sx)*(viewBox.w/rect.width);
      viewBox.y = panState.vy - (e.clientY-panState.sy)*(viewBox.h/rect.height);
      applyViewBox(); return;
    }
    if (resizing) {
      const el = elements.find(e => e.id === resizing!.elId);
      if (!el) return;
      const dx=p.x-resizing.startPt.x, dy=p.y-resizing.startPt.y, s=resizing.startEl, h=resizing.handle;
      if (el.type==='process') { el.r=Math.max(25,(s.r||42)+dx); }
      else if (el.type==='store') {
        if (h.includes('e')) { el.x=s.x+dx/2; el.w=Math.max(60,(s.w||110)+dx); }
        if (h.includes('w')) { el.x=s.x+dx/2; el.w=Math.max(60,(s.w||110)-dx); }
        if (h.includes('s')) { el.y=s.y+dy/2; el.h=Math.max(30,(s.h||55)+dy); }
        if (h.includes('n')) { el.y=s.y+dy/2; el.h=Math.max(30,(s.h||55)-dy); }
      } else if (el.type==='trustzone') {
        const sw=s.w||100, sh=s.h||60;
        if (h==='se') { el.w=Math.max(60,sw+dx); el.h=Math.max(40,sh+dy); }
        if (h==='sw') { el.x=s.x+Math.min(dx,sw-60); el.w=Math.max(60,sw-dx); el.h=Math.max(40,sh+dy); }
        if (h==='ne') { el.w=Math.max(60,sw+dx); el.y=s.y+Math.min(dy,sh-40); el.h=Math.max(40,sh-dy); }
        if (h==='nw') { el.x=s.x+Math.min(dx,sw-60); el.y=s.y+Math.min(dy,sh-40); el.w=Math.max(60,sw-dx); el.h=Math.max(40,sh-dy); }
      }
      renderElement(el);
      connections.filter(c=>c.src===el.id||c.tgt===el.id).forEach(renderConn);
      return;
    }
    if (dragging) {
      const el = elements.find(e => e.id === dragging!.id);
      if (el) { el.x=p.x-dragging.ox; el.y=p.y-dragging.oy; renderElement(el); connections.filter(c=>c.src===el.id||c.tgt===el.id).forEach(renderConn); }
      return;
    }
    if (drawingTZ && tempTZ) {
      const x=Math.min(drawingTZ.sx,p.x), y=Math.min(drawingTZ.sy,p.y);
      tempTZ.setAttribute('x',String(x)); tempTZ.setAttribute('y',String(y));
      tempTZ.setAttribute('width',String(Math.abs(p.x-drawingTZ.sx)));
      tempTZ.setAttribute('height',String(Math.abs(p.y-drawingTZ.sy)));
      return;
    }
    if (connecting) {
      clearTemp();
      const s = elCenter(connecting);
      if (s) layerTemp.appendChild(makeSVG('line',{x1:s.x,y1:s.y,x2:p.x,y2:p.y,class:'temp-line'}));
    }
  }

  function onMouseUp(e: MouseEvent): void {
    if (resizing) { resizing=null; App.autosave(); return; }
    if (drawingTZ && tempTZ) {
      const p=svgPt(e);
      const x=Math.min(drawingTZ.sx,p.x), y=Math.min(drawingTZ.sy,p.y);
      const w=Math.abs(p.x-drawingTZ.sx), h=Math.abs(p.y-drawingTZ.sy);
      if (w>20&&h>20) addElement({type:'trustzone',x,y,w,h,name:'Trust Zone',cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
      layerTemp.removeChild(tempTZ); tempTZ=null; drawingTZ=null;
    }
    dragging=null; panState=null;
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p=svgPt(e), f=e.deltaY>0?1.12:0.89;
    viewBox.x=p.x-(p.x-viewBox.x)*f; viewBox.y=p.y-(p.y-viewBox.y)*f;
    viewBox.w*=f; viewBox.h*=f; applyViewBox();
  }

  function onDblClick(e: MouseEvent): void {
    const p=svgPt(e), el=hitElement(p.x,p.y);
    if (el) {
      const n=prompt('Element name:',el.name);
      if (n!==null) { el.name=n.trim()||el.name; renderElement(el); Assets.refresh(); }
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────
  function addElement(data: Omit<DiagramElement,'id'|'tmId'>): void {
    const el: DiagramElement = { id:'el_'+(uid++), tmId:IDCounter.nextTM(), ...data } as DiagramElement;
    elements.push(el); renderElement(el); selectElement(el.id); Assets.refresh(); App.autosave();
  }
  function addConnection(data: Omit<DiagramConnection,'id'|'tmId'>): void {
    const c: DiagramConnection = { id:'cn_'+(uid++), tmId:IDCounter.nextTM(), ...data } as DiagramConnection;
    connections.push(c); renderConn(c); selectConn(c.id); Assets.refresh(); App.autosave();
  }
  function deleteSelected(): void {
    if (!selected) return;
    if (selected.type==='element') {
      elements=elements.filter(e=>e.id!==selected!.id);
      connections=connections.filter(c=>c.src!==selected!.id&&c.tgt!==selected!.id);
      document.getElementById('el_'+selected.id)?.remove();
      connections.forEach(renderConn);
    } else {
      connections=connections.filter(c=>c.id!==selected!.id);
      document.getElementById('cn_'+selected.id)?.remove();
    }
    clearSelection(); Assets.refresh(); App.autosave();
  }

  // ── Render ────────────────────────────────────────────────────────────
  function renderAll(): void {
    layerTZ.innerHTML=''; layerConn.innerHTML=''; layerEl.innerHTML='';
    elements.filter(e=>e.type==='trustzone').forEach(renderElement);
    connections.forEach(renderConn);
    elements.filter(e=>e.type!=='trustzone').forEach(renderElement);
  }

  function renderElement(el: DiagramElement): void {
    document.getElementById('el_'+el.id)?.remove();
    const g = makeSVG('g',{id:'el_'+el.id});
    const isSel  = selected?.type==='element' && selected.id===el.id;
    const isCSrc = connecting===el.id;

    if (el.type==='process') {
      g.appendChild(makeSVG('circle',{cx:el.x,cy:el.y,r:el.r||42,fill:'#fff',
        stroke:isSel?'#3b82f6':isCSrc?'#f59e0b':'#475569','stroke-width':isSel?2.5:2}));
      appendLabel(g, el);
    } else if (el.type==='store') {
      const [hw,hh]=[(el.w||110)/2,(el.h||55)/2];
      g.appendChild(makeSVG('rect',{x:el.x-hw,y:el.y-hh,width:el.w||110,height:el.h||55,rx:4,fill:'#fff',
        stroke:isSel?'#3b82f6':'#475569','stroke-width':isSel?2.5:2}));
      for(let i=1;i<=2;i++) g.appendChild(makeSVG('line',{
        x1:el.x-hw+6,y1:el.y-hh+(el.h||55)/3*i,x2:el.x+hw-6,y2:el.y-hh+(el.h||55)/3*i,
        stroke:'#94a3b8','stroke-width':1}));
      appendLabel(g, el);
    } else if (el.type==='trustzone') {
      g.appendChild(makeSVG('rect',{x:el.x,y:el.y,width:el.w||200,height:el.h||120,
        class:'element-trustzone',stroke:isSel?'#f87171':'#ef4444'}));
      const lbl=makeSVG('text',{x:el.x+8,y:el.y+14,'text-anchor':'start',
        fill:'#ef4444','font-size':12,'font-weight':600,'pointer-events':'none','user-select':'none'});
      lbl.textContent=el.name; g.appendChild(lbl);
    }

    if (el.tmId && el.type!=='trustzone') {
      const idLbl=makeSVG('text',{x:el.x,
        y:el.type==='process'?el.y-(el.r||42)-5:el.y-(el.h||55)/2-5,
        'text-anchor':'middle','font-size':9,fill:'#94a3b8','pointer-events':'none'});
      idLbl.textContent=el.tmId; g.appendChild(idLbl);
    }

    if (isSel) {
      const ring = el.type==='process'
        ? makeSVG('circle',{cx:el.x,cy:el.y,r:(el.r||42)+5,class:'selected-ring'})
        : el.type==='store'
          ? makeSVG('rect',{x:el.x-(el.w||110)/2-5,y:el.y-(el.h||55)/2-5,width:(el.w||110)+10,height:(el.h||55)+10,rx:6,class:'selected-ring'})
          : null;
      if (ring) g.appendChild(ring);
      getHandles(el).forEach(h => {
        g.appendChild(makeSVG('rect',{x:h.cx-5,y:h.cy-5,width:10,height:10,
          class:'resize-handle','data-eid':el.id,'data-h':h.n,cursor:'nwse-resize'}));
      });
    }

    const layer = el.type==='trustzone' ? layerTZ : layerEl;
    layer.appendChild(g);
    // Bring to front: move selected element to end of its layer
    if (isSel && el.type !== 'trustzone') layer.appendChild(g);
  }

  function renderConn(c: DiagramConnection): void {
    document.getElementById('cn_'+c.id)?.remove();
    const dir = c.direction || 'forward';
    // Swap endpoints for backward to make arrow point correct way
    const rawS = elCenter(c.src), rawT = elCenter(c.tgt);
    if (!rawS || !rawT) return;
    const [s, t] = dir==='backward' ? [rawT, rawS] : [rawS, rawT];
    const isSel  = selected?.type==='conn' && selected.id===c.id;

    const g = makeSVG('g',{id:'cn_'+c.id});
    const hit = makeSVG('line',{x1:rawS.x,y1:rawS.y,x2:rawT.x,y2:rawT.y,class:'conn-hit'});
    (hit as SVGElement).addEventListener('click', () => selectConn(c.id)); g.appendChild(hit);

    const markerEnd   = isSel ? 'url(#arrowSel)' : 'url(#arrow)';
    const markerStart = dir==='bidirectional' ? (isSel ? 'url(#arrowSelRev)' : 'url(#arrowRev)') : 'none';

    g.appendChild(makeSVG('line',{
      x1:s.x,y1:s.y,x2:t.x,y2:t.y,
      stroke:isSel?'#3b82f6':'#475569','stroke-width':isSel?2.5:1.8,
      'marker-end':markerEnd,'marker-start':markerStart,
    }));
    const mx=(rawS.x+rawT.x)/2, my=(rawS.y+rawT.y)/2;
    const lbl=makeSVG('text',{x:mx,y:my-7,class:'conn-label'});
    lbl.textContent=c.name; g.appendChild(lbl);
    if (c.tmId) {
      const idLbl=makeSVG('text',{x:mx,y:my+6,'text-anchor':'middle','font-size':9,fill:'#94a3b8','pointer-events':'none'});
      idLbl.textContent=c.tmId; g.appendChild(idLbl);
    }
    layerConn.appendChild(g);
  }

  function appendLabel(g: SVGElement, el: DiagramElement): void {
    const lbl=makeSVG('text',{x:el.x,y:el.y,class:'element-label'});
    lbl.textContent=el.name; g.appendChild(lbl);
    if (el.cia) {
      const cia=makeSVG('text',{x:el.x,
        y:el.type==='process'?el.y+(el.r||42)+10:el.y+(el.h||55)/2+13,class:'element-cia'});
      cia.textContent=`C:${el.cia.c} I:${el.cia.i} A:${el.cia.a}`; g.appendChild(cia);
    }
  }

  // ── Selection & Properties ────────────────────────────────────────────
  function selectElement(id: string): void {
    const prev = selected;
    if (prev && prev.id !== id) {
      selected = null;
      if (prev.type==='element') { const e=elements.find(el=>el.id===prev.id); if(e) renderElement(e); }
      else                       { const c=connections.find(cn=>cn.id===prev.id); if(c) renderConn(c); }
    }
    selected = { type:'element', id };
    const el = elements.find(e=>e.id===id);
    if (el) { renderElement(el); showProps(el); }
  }
  function selectConn(id: string): void {
    const prev = selected;
    if (prev && prev.id !== id) {
      selected = null;
      if (prev.type==='element') { const e=elements.find(el=>el.id===prev.id); if(e) renderElement(e); }
      else                       { const c=connections.find(cn=>cn.id===prev.id); if(c) renderConn(c); }
    }
    selected = { type:'conn', id };
    const c = connections.find(c=>c.id===id);
    if (c) { renderConn(c); showConnProps(c); }
  }
  function clearSelection(): void {
    const prev=selected; selected=null;
    if (prev?.type==='element') { const el=elements.find(e=>e.id===prev.id); if(el) renderElement(el); }
    else if (prev?.type==='conn') { const c=connections.find(c=>c.id===prev.id); if(c) renderConn(c); }
    const pc = document.getElementById('propsContent');
    if (pc) pc.innerHTML='<p class="props-hint">Select an element to edit its properties.</p>';
  }

  // Per-CIA justification row helper
  function ciaJustRow(id: string, key: 'c'|'i'|'a', cia: CIAValues, jc: string, ji: string, ja: string, isConn: boolean): string {
    const label = { c:'C', i:'I', a:'A' }[key];
    const jKey  = { c:'justificationC', i:'justificationI', a:'justificationA' }[key];
    const val   = { c:jc, i:ji, a:ja }[key];
    const selFn = isConn ? `Diagram.updateConnCIA('${id}','${key}',this.value)` : `Diagram.updateCIA('${id}','${key}',this.value)`;
    const jFn   = isConn ? `Diagram.updateConnProp('${id}','${jKey}',this.value)` : `Diagram.updateProp('${id}','${jKey}',this.value)`;
    const selHtml = ['N','L','M','H'].map(v =>
      `<option value="${v}" ${cia[key]===v?'selected':''}>${({N:'None',L:'Low',M:'Med',H:'High'} as Record<string,string>)[v]}</option>`
    ).join('');
    return `
      <div class="cia-just-row">
        <span class="cia-just-label">${label}</span>
        <select class="cia-just-select" onchange="${selFn}">${selHtml}</select>
        <input type="text" class="cia-just-input" placeholder="Justification…"
          value="${esc(val)}" onchange="${jFn}" />
      </div>`;
  }

  function showProps(el: DiagramElement): void {
    const pc = document.getElementById('propsContent');
    if (!pc) return;
    const ciaSection = el.type==='trustzone' ? '' : `
      <div class="props-field">
        <label>CIA Classification &amp; Justification</label>
        ${ciaJustRow(el.id,'c',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
        ${ciaJustRow(el.id,'i',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
        ${ciaJustRow(el.id,'a',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
      </div>`;
    pc.innerHTML = `
      <div class="props-field"><label>ID</label>
        <input type="text" value="${esc(el.tmId||'')}" disabled style="color:var(--c-muted);background:#f1f5f9" /></div>
      <div class="props-field"><label>Name</label>
        <input type="text" value="${esc(el.name)}" onchange="Diagram.updateProp('${el.id}','name',this.value)" /></div>
      <div class="props-field"><label>Type</label>
        <input type="text" value="${el.type}" disabled style="color:var(--c-muted);background:#f1f5f9" /></div>
      ${ciaSection}
      <div class="props-field" style="margin-top:12px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete</button></div>`;
  }

  function showConnProps(c: DiagramConnection): void {
    const pc = document.getElementById('propsContent');
    if (!pc) return;
    const dirOpts = (['forward','backward','bidirectional'] as ConnectionDirection[]).map(d =>
      `<option value="${d}" ${(c.direction||'forward')===d?'selected':''}>${d.charAt(0).toUpperCase()+d.slice(1)}</option>`
    ).join('');
    pc.innerHTML = `
      <div class="props-field"><label>ID</label>
        <input type="text" value="${esc(c.tmId||'')}" disabled style="color:var(--c-muted);background:#f1f5f9" /></div>
      <div class="props-field"><label>Name</label>
        <input type="text" value="${esc(c.name)}" onchange="Diagram.updateConnProp('${c.id}','name',this.value)" /></div>
      <div class="props-field"><label>Direction</label>
        <select onchange="Diagram.updateConnProp('${c.id}','direction',this.value)">${dirOpts}</select></div>
      <div class="props-field">
        <label>CIA Classification &amp; Justification</label>
        ${ciaJustRow(c.id,'c',c.cia,c.justificationC||'',c.justificationI||'',c.justificationA||'',true)}
        ${ciaJustRow(c.id,'i',c.cia,c.justificationC||'',c.justificationI||'',c.justificationA||'',true)}
        ${ciaJustRow(c.id,'a',c.cia,c.justificationC||'',c.justificationI||'',c.justificationA||'',true)}
      </div>
      <div class="props-field" style="margin-top:12px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete</button></div>`;
  }

  // ── Public update ─────────────────────────────────────────────────────
  function updateProp(id: string, key: string, val: string): void {
    const el=elements.find(e=>e.id===id);
    if(el){ (el as unknown as Record<string,unknown>)[key]=val; renderElement(el); Assets.refresh(); App.autosave(); }
  }
  function updateCIA(id: string, key: string, val: string): void {
    const el=elements.find(e=>e.id===id);
    if(el){ (el.cia as Record<string,string>)[key]=val; renderElement(el); Assets.refresh(); App.autosave(); }
  }
  function updateConnProp(id: string, key: string, val: string): void {
    const c=connections.find(c=>c.id===id);
    if(c){ (c as unknown as Record<string,unknown>)[key]=val; renderConn(c); Assets.refresh(); App.autosave(); }
  }
  function updateConnCIA(id: string, key: string, val: string): void {
    const c=connections.find(c=>c.id===id);
    if(c){ (c.cia as Record<string,string>)[key]=val; renderConn(c); Assets.refresh(); App.autosave(); }
  }

  // ── Zoom ──────────────────────────────────────────────────────────────
  function zoomIn():    void { viewBox.w*=0.85; viewBox.h*=0.85; applyViewBox(); }
  function zoomOut():   void { viewBox.w*=1.18; viewBox.h*=1.18; applyViewBox(); }
  function resetView(): void { viewBox={x:0,y:0,w:1200,h:700}; applyViewBox(); }

  // ── Export SVG ────────────────────────────────────────────────────────
  function exportSVG(): void {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('.resize-handle,.selected-ring').forEach(n=>n.remove());
    clone.querySelector('#layerTemp')?.replaceChildren();
    const style = document.createElementNS('http://www.w3.org/2000/svg','style');
    style.textContent=`circle,rect{fill:#fff;stroke:#475569;stroke-width:2}
      rect[class*="trustzone"]{fill:rgba(239,68,68,.06);stroke:#ef4444;stroke-dasharray:8 4}
      .element-label{font-size:12px;fill:#1e293b;text-anchor:middle;dominant-baseline:middle;font-family:sans-serif}
      .element-cia,.conn-label{font-size:9px;fill:#64748b;text-anchor:middle;font-family:sans-serif}
      line{stroke:#475569;stroke-width:1.8;fill:none}polygon{fill:#475569}`;
    clone.insertBefore(style, clone.firstChild);
    const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=((document.getElementById('projectName') as HTMLInputElement|null)?.value||'diagram').replace(/\s+/g,'_')+'-model.svg';
    a.click(); URL.revokeObjectURL(a.href);
    App.toast('Model exported as SVG.','ok');
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function makeSVG(tag: string, attrs: Record<string, string|number> = {}): SVGElement {
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }
  function clearTemp(): void { layerTemp.innerHTML=''; }

  // ── Serialise ─────────────────────────────────────────────────────────
  function getData(): DiagramData { return { elements, connections, uid }; }

  function setData(d: Partial<DiagramData>): void {
    elements = (d.elements||[]).map(el => ({
      justificationC:'', justificationI:'', justificationA:'', justification:'',
      ...el, tmId: el.tmId || IDCounter.nextTM(),
    }));
    connections = (d.connections||[]).map(c => ({
      justificationC:'', justificationI:'', justificationA:'', justification:'',
      direction: 'forward' as ConnectionDirection,
      ...c, tmId: c.tmId || IDCounter.nextTM(),
    }));
    uid = d.uid || elements.length + connections.length + 1;
    renderAll(); clearSelection(); Assets.refresh();
  }

  function getAllAssets(): AssetRecord[] {
    return [
      ...elements.filter(e=>e.type!=='trustzone').map(e=>({
        id:e.id, tmId:e.tmId, name:e.name, type:e.type,
        cia:e.cia||{c:'N',i:'N',a:'N'}, justification:e.justification||'',
      })),
      ...connections.map(c=>({
        id:c.id, tmId:c.tmId, name:c.name, type:'dataflow',
        cia:c.cia||{c:'N',i:'N',a:'N'}, justification:c.justification||'',
      })),
    ];
  }
  function getElements():    DiagramElement[]    { return elements; }
  function getConnections(): DiagramConnection[] { return connections; }

  function focusElement(id: string): void {
    if (elements.find(e=>e.id===id))     selectElement(id);
    else if (connections.find(c=>c.id===id)) selectConn(id);
  }

  return { init, getData, setData, getAllAssets, getElements, getConnections,
           deleteSelected, updateProp, updateCIA, updateConnProp, updateConnCIA,
           zoomIn, zoomOut, resetView, exportSVG, focusElement };
})();
