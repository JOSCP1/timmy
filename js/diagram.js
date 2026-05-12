'use strict';

const Diagram = (() => {
  let elements    = [];
  let connections = [];
  let selected    = []; // array of {type:'element'|'conn', id}
  let tool        = 'select';
  let uid         = 1;

  let dragging   = null;
  let resizing   = null;
  let connecting = null;
  let drawingTZ  = null;
  let tempTZ     = null;
  let panState   = null;
  let viewBox    = { x:0, y:0, w:1200, h:700 };

  let svg, layerTZ, layerConn, layerEl, layerTemp;

  function init() {
    svg       = document.getElementById('diagramSvg');
    layerTZ   = document.getElementById('layerTrustZones');
    layerConn = document.getElementById('layerConnections');
    layerEl   = document.getElementById('layerElements');
    layerTemp = document.getElementById('layerTemp');
    applyViewBox();

    svg.addEventListener('pointerdown',  onMouseDown);
    svg.addEventListener('pointermove',  onMouseMove);
    svg.addEventListener('pointerup',    onMouseUp);
    svg.addEventListener('pointerleave', onMouseUp);
    svg.addEventListener('pointercancel',onMouseUp);
    svg.addEventListener('wheel',        onWheel, { passive: false });
    svg.addEventListener('dblclick',     onDblClick);
    svg.style.touchAction = 'none';

    document.getElementById('toolGroup').addEventListener('click', e => {
      const btn = e.target.closest('.tool-btn');
      if (btn) setTool(btn.dataset.tool);
    });

    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.key==='v'||e.key==='V') setTool('select');
      if (e.key==='p'||e.key==='P') setTool('process');
      if (e.key==='s'||e.key==='S') setTool('store');
      if (e.key==='e'||e.key==='E') setTool('external');
      if (e.key==='c'||e.key==='C') setTool('cylinder');
      if (e.key==='a'||e.key==='A') setTool('actor');
      if (e.key==='f'||e.key==='F') setTool('dataflow');
      if (e.key==='t'||e.key==='T') setTool('trustzone');
      if (e.key==='Delete'||e.key==='Backspace') deleteSelected();
      if (e.key==='Escape') { clearSelection(); connecting=null; clearTemp(); }
    });
  }

  function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
    connecting = null; clearTemp();
  }

  function svgPt(e) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (viewBox.w / rect.width)  + viewBox.x,
      y: (e.clientY - rect.top)  * (viewBox.h / rect.height) + viewBox.y,
    };
  }
  function applyViewBox() { svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`); }

  function hitElement(x, y) {
    return elements.slice().reverse().find(el => {
      if (el.type==='process')   return Math.hypot(x-el.x, y-el.y) <= el.r;
      if (el.type==='store'||el.type==='external'||
          el.type==='diamond'||el.type==='cylinder'||el.type==='actor')
                                 return x>=el.x-el.w/2&&x<=el.x+el.w/2&&y>=el.y-el.h/2&&y<=el.y+el.h/2;
      if (el.type==='trustzone') return x>=el.x&&x<=el.x+el.w&&y>=el.y&&y<=el.y+el.h;
      return false;
    });
  }
  function hitConnection(x, y) {
    return connections.find(c => {
      const s=elCenter(c.src), t=elCenter(c.tgt);
      if (!s||!t) return false;
      return Math.hypot(x-(s.x+t.x)/2, y-(s.y+t.y)/2) < 18;
    });
  }
  function elCenter(id) {
    const el = elements.find(e => e.id === id);
    return el ? { x:el.x, y:el.y } : null;
  }

  // Returns the point on el's boundary that lies on the line toward (towardX, towardY)
  function edgePoint(el, towardX, towardY) {
    const dx = towardX - el.x, dy = towardY - el.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x:el.x, y:el.y };
    const nx = dx/dist, ny = dy/dist;

    if (el.type === 'process') {
      const r = el.r || 42;
      return { x: el.x + nx*r, y: el.y + ny*r };
    }
    if (el.type === 'store' || el.type === 'external' ||
        el.type === 'cylinder' || el.type === 'actor') {
      const hw = (el.w||110)/2, hh = (el.h||55)/2;
      const t  = Math.min(nx!==0 ? hw/Math.abs(nx) : Infinity,
                          ny!==0 ? hh/Math.abs(ny) : Infinity);
      return { x: el.x + nx*t, y: el.y + ny*t };
    }
    if (el.type === 'diamond') {
      const hw = (el.w||80)/2, hh = (el.h||60)/2;
      // |nx|/hw + |ny|/hh = 1/t  →  t = 1/(|nx|/hw + |ny|/hh)
      const t = 1 / (Math.abs(nx)/hw + Math.abs(ny)/hh);
      return { x: el.x + nx*t, y: el.y + ny*t };
    }
    return { x:el.x, y:el.y };
  }

  function getHandles(el) {
    if (el.type==='process') return [{ n:'e', cx:el.x+el.r, cy:el.y }];
    if (el.type==='store'||el.type==='external'||
        el.type==='diamond'||el.type==='cylinder'||el.type==='actor') {
      const [hw,hh]=[el.w/2,el.h/2];
      return [{ n:'se',cx:el.x+hw,cy:el.y+hh },{ n:'sw',cx:el.x-hw,cy:el.y+hh },
              { n:'ne',cx:el.x+hw,cy:el.y-hh },{ n:'nw',cx:el.x-hw,cy:el.y-hh }];
    }
    if (el.type==='trustzone') return [
      { n:'se',cx:el.x+el.w,cy:el.y+el.h },{ n:'sw',cx:el.x,cy:el.y+el.h },
      { n:'ne',cx:el.x+el.w,cy:el.y      },{ n:'nw',cx:el.x,cy:el.y      },
    ];
    return [];
  }

  function onMouseDown(e) {
    if (e.button===1) { panState={sx:e.clientX,sy:e.clientY,vx:viewBox.x,vy:viewBox.y}; return; }
    if (e.button!==0) return;
    const p = svgPt(e);

    if (e.target.classList.contains('resize-handle')) {
      const el = elements.find(el => el.id === e.target.dataset.eid);
      if (el) resizing = { elId:el.id, handle:e.target.dataset.h, startPt:p, startEl:{...el} };
      e.stopPropagation(); return;
    }

    if (tool==='select') {
      const el=hitElement(p.x,p.y), cn=!el&&hitConnection(p.x,p.y);
      const addToSel = e.ctrlKey || e.metaKey;
      if (el) {
        if (addToSel) { toggleSelectEl(el.id); }
        else {
          if (!isSel('element',el.id)) { clearSelection(); pushSel('element',el.id); renderElement(el); showProps(el); }
          // Build per-element drag offsets for all selected elements
          const offsets = {};
          selected.filter(s=>s.type==='element').forEach(s=>{
            const e2=elements.find(x=>x.id===s.id); if(e2) offsets[s.id]={ox:p.x-e2.x,oy:p.y-e2.y};
          });
          dragging={id:el.id, offsets};
        }
        e.preventDefault();
      } else if (cn) { selectConn(cn.id); }
      else {
        if (!addToSel) clearSelection();
        panState={sx:e.clientX,sy:e.clientY,vx:viewBox.x,vy:viewBox.y};
      }
    }
    else if (tool==='process')  addElement({type:'process', x:p.x,y:p.y,r:42,     name:'Process',         cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='store')    addElement({type:'store',   x:p.x,y:p.y,w:110,h:55,name:'Data Store',      cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='external') addElement({type:'external',x:p.x,y:p.y,w:90, h:60, name:'External Entity',cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='cylinder') addElement({type:'cylinder',x:p.x,y:p.y,w:80, h:90, name:'Database',        cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='actor')    addElement({type:'actor',   x:p.x,y:p.y,w:50, h:80, name:'Actor',           cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='dataflow') {
      const el=hitElement(p.x,p.y);
      if (el&&el.type!=='trustzone') {
        if (!connecting) { connecting=el.id; renderElement(el); }
        else if (connecting!==el.id) {
          addConnection({src:connecting,tgt:el.id,name:'Data Flow',cia:{c:'N',i:'N',a:'N'},
            justificationC:'',justificationI:'',justificationA:'',justification:'',direction:'forward'});
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

  function onMouseMove(e) {
    const p=svgPt(e);
    if (panState&&!dragging&&!resizing) {
      const rect=svg.getBoundingClientRect();
      viewBox.x=panState.vx-(e.clientX-panState.sx)*(viewBox.w/rect.width);
      viewBox.y=panState.vy-(e.clientY-panState.sy)*(viewBox.h/rect.height);
      applyViewBox(); return;
    }
    if (resizing) {
      const el=elements.find(e=>e.id===resizing.elId); if(!el) return;
      const dx=p.x-resizing.startPt.x, dy=p.y-resizing.startPt.y, s=resizing.startEl, h=resizing.handle;
      if (el.type==='process') { el.r=Math.max(25,s.r+dx); }
      else if (el.type==='store'||el.type==='external'||
               el.type==='diamond'||el.type==='cylinder'||el.type==='actor') {
        if(h.includes('e')){el.x=s.x+dx/2;el.w=Math.max(40,s.w+dx);}
        if(h.includes('w')){el.x=s.x+dx/2;el.w=Math.max(40,s.w-dx);}
        if(h.includes('s')){el.y=s.y+dy/2;el.h=Math.max(30,s.h+dy);}
        if(h.includes('n')){el.y=s.y+dy/2;el.h=Math.max(30,s.h-dy);}
      } else if (el.type==='trustzone') {
        if(h==='se'){el.w=Math.max(60,s.w+dx);el.h=Math.max(40,s.h+dy);}
        if(h==='sw'){el.x=s.x+Math.min(dx,s.w-60);el.w=Math.max(60,s.w-dx);el.h=Math.max(40,s.h+dy);}
        if(h==='ne'){el.w=Math.max(60,s.w+dx);el.y=s.y+Math.min(dy,s.h-40);el.h=Math.max(40,s.h-dy);}
        if(h==='nw'){el.x=s.x+Math.min(dx,s.w-60);el.y=s.y+Math.min(dy,s.h-40);el.w=Math.max(60,s.w-dx);el.h=Math.max(40,s.h-dy);}
      }
      renderElement(el);
      connections.filter(c=>c.src===el.id||c.tgt===el.id).forEach(renderConn);
      return;
    }
    if (dragging) {
      const offsets = dragging.offsets || {};
      const movedIds = new Set();
      for (const [sid, off] of Object.entries(offsets)) {
        const el2=elements.find(e=>e.id===sid);
        if(el2){el2.x=p.x-off.ox;el2.y=p.y-off.oy;renderElement(el2);movedIds.add(sid);}
      }
      connections.filter(c=>movedIds.has(c.src)||movedIds.has(c.tgt)).forEach(renderConn);
      return;
    }
    if (drawingTZ&&tempTZ) {
      const x=Math.min(drawingTZ.sx,p.x),y=Math.min(drawingTZ.sy,p.y);
      tempTZ.setAttribute('x',x);tempTZ.setAttribute('y',y);
      tempTZ.setAttribute('width',Math.abs(p.x-drawingTZ.sx));tempTZ.setAttribute('height',Math.abs(p.y-drawingTZ.sy));
      return;
    }
    if (connecting) {
      clearTemp();
      const s=elCenter(connecting);
      if(s) layerTemp.appendChild(makeSVG('line',{x1:s.x,y1:s.y,x2:p.x,y2:p.y,class:'temp-line'}));
    }
  }

  function onMouseUp(e) {
    if (resizing) { resizing=null; App.autosave(); return; }
    if (drawingTZ&&tempTZ) {
      const p=svgPt(e);
      const x=Math.min(drawingTZ.sx,p.x),y=Math.min(drawingTZ.sy,p.y);
      const w=Math.abs(p.x-drawingTZ.sx),h=Math.abs(p.y-drawingTZ.sy);
      if(w>20&&h>20) addElement({type:'trustzone',x,y,w,h,name:'Trust Zone',cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
      layerTemp.removeChild(tempTZ); tempTZ=null; drawingTZ=null;
    }
    dragging=null; panState=null;
  }

  function onWheel(e) {
    e.preventDefault();
    const p=svgPt(e),f=e.deltaY>0?1.12:0.89;
    viewBox.x=p.x-(p.x-viewBox.x)*f;viewBox.y=p.y-(p.y-viewBox.y)*f;
    viewBox.w*=f;viewBox.h*=f;applyViewBox();
  }

  function onDblClick(e) {
    const p=svgPt(e),el=hitElement(p.x,p.y);
    if(el){const n=prompt('Element name:',el.name);if(n!==null){el.name=n.trim()||el.name;renderElement(el);Assets.refresh();}}
  }

  function addElement(data) {
    const el={ id:'el_'+(uid++), tmId:IDCounter.nextTM(), ...data };
    elements.push(el); renderElement(el); selectElement(el.id); Assets.refresh(); App.autosave();
    setTool('select');
  }
  function addConnection(data) {
    const c={ id:'cn_'+(uid++), tmId:IDCounter.nextTM(), ...data };
    connections.push(c); renderConn(c); selectConn(c.id); Assets.refresh(); App.autosave();
  }
  function deleteSelected() {
    if(!selected.length) return;
    const elIds=new Set(selected.filter(s=>s.type==='element').map(s=>s.id));
    const cnIds=new Set(selected.filter(s=>s.type==='conn').map(s=>s.id));
    connections=connections.filter(c=>!cnIds.has(c.id)&&!elIds.has(c.src)&&!elIds.has(c.tgt));
    elements=elements.filter(e=>!elIds.has(e.id));
    elIds.forEach(id=>document.getElementById('el_'+id)?.remove());
    cnIds.forEach(id=>document.getElementById('cn_'+id)?.remove());
    connections.forEach(renderConn);
    selected=[];
    const pc=document.getElementById('propsContent');
    if(pc) pc.innerHTML='<p class="props-hint">Select an element to edit its properties.</p>';
    Assets.refresh(); App.autosave();
  }

  function renderAll() {
    layerTZ.innerHTML=''; layerConn.innerHTML=''; layerEl.innerHTML='';
    elements.filter(e=>e.type==='trustzone').forEach(renderElement);
    connections.forEach(renderConn);
    elements.filter(e=>e.type!=='trustzone').forEach(renderElement);
  }

  function renderElement(el) {
    document.getElementById('el_'+el.id)?.remove();
    const g=makeSVG('g',{id:'el_'+el.id});
    const isSel=selected.some(s=>s.type==='element'&&s.id===el.id);
    const isCSrc=connecting===el.id;

    if (el.type==='process') {
      g.appendChild(makeSVG('circle',{cx:el.x,cy:el.y,r:el.r,fill:'#fff',
        stroke:isSel?'#3b82f6':isCSrc?'#f59e0b':'#475569','stroke-width':isSel?2.5:2}));
      appendLabel(g,el);
    } else if (el.type==='store') {
      const [hw,hh]=[el.w/2,el.h/2];
      g.appendChild(makeSVG('rect',{x:el.x-hw,y:el.y-hh,width:el.w,height:el.h,rx:4,fill:'#fff',
        stroke:isSel?'#3b82f6':'#475569','stroke-width':isSel?2.5:2}));
      for(let i=1;i<=2;i++) g.appendChild(makeSVG('line',{
        x1:el.x-hw+6,y1:el.y-hh+el.h/3*i,x2:el.x+hw-6,y2:el.y-hh+el.h/3*i,stroke:'#94a3b8','stroke-width':1}));
      appendLabel(g,el);
    } else if (el.type==='external') {
      // Double-border rectangle — standard DFD external entity notation
      const [hw,hh]=[el.w/2,el.h/2];
      const stroke=isSel?'#3b82f6':'#1e293b';
      g.appendChild(makeSVG('rect',{x:el.x-hw,  y:el.y-hh,  width:el.w,  height:el.h,  fill:'#fff',stroke,  'stroke-width':isSel?2.5:2}));
      g.appendChild(makeSVG('rect',{x:el.x-hw+5,y:el.y-hh+5,width:el.w-10,height:el.h-10,fill:'none',stroke,'stroke-width':1}));
      appendLabel(g,el);
    } else if (el.type==='diamond') {
      const [hw,hh]=[el.w/2,el.h/2];
      const sk=isSel?'#3b82f6':'#475569';
      g.appendChild(makeSVG('polygon',{
        points:`${el.x},${el.y-hh} ${el.x+hw},${el.y} ${el.x},${el.y+hh} ${el.x-hw},${el.y}`,
        fill:'#fff',stroke:sk,'stroke-width':isSel?2.5:2}));
      appendLabel(g,el);
    } else if (el.type==='cylinder') {
      const [hw,hh]=[el.w/2,el.h/2];
      const ry=Math.max(7,hh*0.2);
      const sk=isSel?'#3b82f6':'#475569', sw=isSel?2.5:2;
      // Body rect between the two cap centres
      g.appendChild(makeSVG('rect',{x:el.x-hw,y:el.y-hh+ry,width:el.w,height:el.h-2*ry,
        fill:'#fff',stroke:sk,'stroke-width':sw,'stroke-dasharray':'none'}));
      // Top cap (full ellipse, white fill covers rect top edge)
      g.appendChild(makeSVG('ellipse',{cx:el.x,cy:el.y-hh+ry,rx:hw,ry,
        fill:'#fff',stroke:sk,'stroke-width':sw}));
      // Bottom cap (full ellipse, no fill so only outline is visible)
      g.appendChild(makeSVG('ellipse',{cx:el.x,cy:el.y+hh-ry,rx:hw,ry,
        fill:'none',stroke:sk,'stroke-width':sw}));
      appendLabel(g,el);
    } else if (el.type==='actor') {
      const [hw,hh]=[el.w/2,el.h/2];
      const headR=Math.min(hw*0.6,hh*0.28);
      const headCy=el.y-hh+headR;
      const bodyTop=headCy+headR, bodyBot=el.y+hh*0.25;
      const sk=isSel?'#3b82f6':'#475569', sw=2;
      // Head
      g.appendChild(makeSVG('circle',{cx:el.x,cy:headCy,r:headR,
        fill:'#fff',stroke:sk,'stroke-width':sw}));
      // Body
      g.appendChild(makeSVG('line',{x1:el.x,y1:bodyTop,x2:el.x,y2:bodyBot,stroke:sk,'stroke-width':sw}));
      // Arms
      g.appendChild(makeSVG('line',{x1:el.x-hw*0.8,y1:el.y-hh*0.25,x2:el.x+hw*0.8,y2:el.y-hh*0.25,stroke:sk,'stroke-width':sw}));
      // Legs
      g.appendChild(makeSVG('line',{x1:el.x,y1:bodyBot,x2:el.x-hw*0.7,y2:el.y+hh,stroke:sk,'stroke-width':sw}));
      g.appendChild(makeSVG('line',{x1:el.x,y1:bodyBot,x2:el.x+hw*0.7,y2:el.y+hh,stroke:sk,'stroke-width':sw}));
      // Name label below the figure
      const nameLbl=makeSVG('text',{x:el.x,y:el.y+hh+14,class:'element-label'});
      nameLbl.textContent=el.name; g.appendChild(nameLbl);
    } else if (el.type==='trustzone') {
      g.appendChild(makeSVG('rect',{x:el.x,y:el.y,width:el.w,height:el.h,
        class:'element-trustzone',stroke:isSel?'#f87171':'#ef4444'}));
      const lbl=makeSVG('text',{x:el.x+8,y:el.y+14,'text-anchor':'start',
        fill:'#ef4444','font-size':12,'font-weight':600,'pointer-events':'none','user-select':'none'});
      lbl.textContent=el.name; g.appendChild(lbl);
    }

    if (el.tmId&&el.type!=='trustzone'&&el.type!=='actor') {
      const idLbl=makeSVG('text',{x:el.x,
        y:el.type==='process'?el.y-el.r-5:el.y-el.h/2-5,
        'text-anchor':'middle','font-size':9,fill:'#94a3b8','pointer-events':'none'});
      idLbl.textContent=el.tmId; g.appendChild(idLbl);
    }

    if (isSel) {
      const ring=el.type==='process'
        ? makeSVG('circle',{cx:el.x,cy:el.y,r:el.r+5,class:'selected-ring'})
        : (el.type==='store'||el.type==='external'||
           el.type==='diamond'||el.type==='cylinder'||el.type==='actor')
          ? makeSVG('rect',{x:el.x-el.w/2-5,y:el.y-el.h/2-5,width:el.w+10,height:el.h+10,rx:6,class:'selected-ring'})
          : null;
      if (ring) g.appendChild(ring);
      getHandles(el).forEach(h => {
        g.appendChild(makeSVG('rect',{x:h.cx-5,y:h.cy-5,width:10,height:10,
          class:'resize-handle','data-eid':el.id,'data-h':h.n,cursor:'nwse-resize'}));
      });
    }

    const layer=el.type==='trustzone'?layerTZ:layerEl;
    layer.appendChild(g);
    // Bring selected element to front (move to end = topmost in SVG)
    if (isSel && el.type!=='trustzone') layer.appendChild(g);
  }

  function renderConn(c) {
    document.getElementById('cn_'+c.id)?.remove();
    const dir = c.direction || 'forward';
    const cS  = elCenter(c.src), cT = elCenter(c.tgt);
    if (!cS || !cT) return;

    // Compute boundary intersection points so arrows start/end at element edges
    const srcEl = elements.find(e => e.id === c.src);
    const tgtEl = elements.find(e => e.id === c.tgt);
    const s = srcEl ? edgePoint(srcEl, cT.x, cT.y) : cS;
    const t = tgtEl ? edgePoint(tgtEl, cS.x, cS.y) : cT;

    const isSel = selected.some(s=>s.type==='conn'&&s.id===c.id);
    const g     = makeSVG('g', {id:'cn_'+c.id});

    // Hit-area uses full center-to-center span for easier clicking
    const hit = makeSVG('line', {x1:cS.x,y1:cS.y,x2:cT.x,y2:cT.y, class:'conn-hit'});
    hit.addEventListener('click', () => selectConn(c.id));
    g.appendChild(hit);

    // Direction is expressed only through which end(s) carry an arrowhead
    const markerStart = (dir==='backward'||dir==='bidirectional')
      ? (isSel ? 'url(#arrowBiSel)' : 'url(#arrowBi)') : 'none';
    const markerEnd   = (dir==='forward' ||dir==='bidirectional')
      ? (isSel ? 'url(#arrowSel)'   : 'url(#arrow)')   : 'none';

    g.appendChild(makeSVG('line', {
      x1:s.x, y1:s.y, x2:t.x, y2:t.y,
      stroke: isSel?'#3b82f6':'#475569', 'stroke-width': isSel?2.5:1.8,
      'marker-start': markerStart, 'marker-end': markerEnd,
    }));

    const mx=(cS.x+cT.x)/2, my=(cS.y+cT.y)/2;
    const lbl = makeSVG('text', {x:mx, y:my-7, class:'conn-label'});
    lbl.textContent = c.name; g.appendChild(lbl);
    if (c.tmId) {
      const idLbl = makeSVG('text', {x:mx, y:my+6, 'text-anchor':'middle', 'font-size':9, fill:'#94a3b8', 'pointer-events':'none'});
      idLbl.textContent = c.tmId; g.appendChild(idLbl);
    }
    layerConn.appendChild(g);
  }

  function appendLabel(g,el) {
    const lbl=makeSVG('text',{x:el.x,y:el.y,class:'element-label'});
    lbl.textContent=el.name; g.appendChild(lbl);
    if (el.cia) {
      const ciaY = el.type==='process'  ? el.y+el.r+10
                 : el.type==='diamond'  ? el.y+el.h/2+13
                 : el.y+el.h/2+13;
      const cia=makeSVG('text',{x:el.x,y:ciaY,class:'element-cia'});
      cia.textContent=`C:${el.cia.c} I:${el.cia.i} A:${el.cia.a}`; g.appendChild(cia);
    }
  }

  // Per-CIA justification row helper
  function ciaJustRow(id, key, cia, jc, ji, ja, isConn) {
    const label={c:'C',i:'I',a:'A'}[key];
    const jKey={c:'justificationC',i:'justificationI',a:'justificationA'}[key];
    const val={c:jc,i:ji,a:ja}[key];
    const selFn=isConn?`Diagram.updateConnCIA('${id}','${key}',this.value)`:`Diagram.updateCIA('${id}','${key}',this.value)`;
    const jFn =isConn?`Diagram.updateConnProp('${id}','${jKey}',this.value)`:`Diagram.updateProp('${id}','${jKey}',this.value)`;
    const selHtml=['N','L','M','H'].map(v=>
      `<option value="${v}" ${cia[key]===v?'selected':''}>${{N:'None',L:'Low',M:'Med',H:'High'}[v]}</option>`
    ).join('');
    return `
      <div class="cia-just-row">
        <span class="cia-just-label">${label}</span>
        <select class="cia-just-select" onchange="${selFn}">${selHtml}</select>
        <input type="text" class="cia-just-input" placeholder="Justification…"
          value="${esc(val||'')}" onchange="${jFn}" />
      </div>`;
  }

  // ── Selection helpers ─────────────────────────────────────────────────
  function pushSel(type, id) { selected.push({type,id}); }

  function toggleSelectEl(id) {
    const idx=selected.findIndex(s=>s.type==='element'&&s.id===id);
    if(idx>=0){
      selected.splice(idx,1);
      const el=elements.find(e=>e.id===id); if(el) renderElement(el);
    } else {
      pushSel('element',id);
      const el=elements.find(e=>e.id===id); if(el) renderElement(el);
    }
    _updatePropsPanel();
  }

  function _updatePropsPanel() {
    const pc=document.getElementById('propsContent'); if(!pc) return;
    if(selected.length===0){
      pc.innerHTML='<p class="props-hint">Select an element to edit its properties.</p>';
    } else if(selected.length===1){
      const s=selected[0];
      if(s.type==='element'){const el=elements.find(e=>e.id===s.id);if(el)showProps(el);}
      else{const c=connections.find(c=>c.id===s.id);if(c)showConnProps(c);}
    } else {
      pc.innerHTML=`<p class="props-hint">${selected.length} items selected.</p>
        <div class="props-field" style="margin-top:10px">
          <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">
            🗑 Delete ${selected.length} items
          </button>
        </div>`;
    }
  }

  function selectElement(id) {
    clearSelection();
    pushSel('element',id);
    const el=elements.find(e=>e.id===id);
    if(el){renderElement(el);showProps(el);}
  }
  function selectConn(id) {
    clearSelection();
    pushSel('conn',id);
    const c=connections.find(c=>c.id===id);
    if(c){renderConn(c);showConnProps(c);}
  }
  function clearSelection() {
    const prev=[...selected]; selected=[];
    prev.forEach(s=>{
      if(s.type==='element'){const el=elements.find(e=>e.id===s.id);if(el)renderElement(el);}
      else{const c=connections.find(c=>c.id===s.id);if(c)renderConn(c);}
    });
    const pc=document.getElementById('propsContent');
    if(pc) pc.innerHTML='<p class="props-hint">Select an element to edit its properties.</p>';
  }

  // ── Properties panel helpers ──────────────────────────────────────────
  const PROTOCOLS = ['','HTTP','HTTPS','FTP','FTPS','SSH','Telnet','RDP','VNC',
    'SMTP','IMAP','POP3','LDAP','RADIUS','DNS','TCP','UDP','TLS','SSL','IPSec',
    'REST','SOAP','GraphQL','WebSocket','gRPC',
    'ODBC','JDBC','SQL/TCP','HL7 v2','HL7 FHIR','DICOM','X12 EDI','NCPDP',
    'MQTT','AMQP','Kafka','SMB','NFS','OPC-UA','Modbus','Other'];

  const ENC_ALGOS = ['AES-256','AES-128','3DES','DES','BitLocker','VeraCrypt',
    'TLS 1.3','TLS 1.2','SSL','RSA-4096','RSA-2048','ECC','PGP',
    'AWS KMS','Azure Key Vault','HSM-backed','Other'];

  function propsField(label, content) {
    return `<div class="props-field"><label>${label}</label>${content}</div>`;
  }

  function classificationSection(el) {
    const cb = (key, label) =>
      `<label class="checkbox-label"><input type="checkbox" ${el[key]?'checked':''}
        onchange="Diagram.updateProp('${el.id}','${key}',this.checked)"> ${label}</label>`;
    return `
      <div class="props-field">
        <label>Annotation</label>
        <textarea rows="2" class="props-textarea" placeholder="Free text notes…"
          oninput="Diagram.updateProp('${el.id}','annotation',this.value)">${esc(el.annotation||'')}</textarea>
      </div>
      <div class="props-field">
        <label>Asset Classification</label>
        <div class="checkbox-stack">
          ${cb('isSystemAsset','System Asset')}
          ${cb('isSupportingAsset','Supporting Asset')}
          ${cb('isHealthcareAsset','Healthcare Facility Operated Asset')}
        </div>
      </div>`;
  }

  function interfacesSection(el) {
    const rows = (el.interfaces||[]).map((v,i) => `
      <div class="list-row">
        <input type="text" value="${esc(v)}" placeholder="Interface name…"
          oninput="Diagram.updateInterface('${el.id}',${i},this.value)" />
        <button class="btn-icon-rm" onclick="Diagram.removeInterface('${el.id}',${i})">✕</button>
      </div>`).join('');
    return `<div class="props-field">
      <label>Interfaces <button class="btn-icon-add" onclick="Diagram.addInterface('${el.id}')">＋</button></label>
      <div id="iface_${el.id}">${rows}</div></div>`;
  }

  function servicesSection(el) {
    const rows = (el.services||[]).map((s,i) => `
      <div class="list-row">
        <input type="text" value="${esc(s.name)}" placeholder="Service name"
          oninput="Diagram.updateService('${el.id}',${i},'name',this.value)" />
        <input type="text" value="${esc(s.port)}" placeholder="Port" style="width:56px"
          oninput="Diagram.updateService('${el.id}',${i},'port',this.value)" />
        <button class="btn-icon-rm" onclick="Diagram.removeService('${el.id}',${i})">✕</button>
      </div>`).join('');
    return `<div class="props-field">
      <label>Services <button class="btn-icon-add" onclick="Diagram.addService('${el.id}')">＋</button></label>
      <div id="svc_${el.id}">${rows}</div></div>`;
  }

  function encryptionSection(el) {
    const algOpts = ENC_ALGOS.map(a =>
      `<option value="${a}" ${(el.encryptionAlgorithm||'AES-256')===a?'selected':''}>${a}</option>`
    ).join('');
    return `<div class="props-field">
      <label class="checkbox-label" style="font-weight:600">
        <input type="checkbox" ${el.encrypted?'checked':''}
          onchange="Diagram.updateProp('${el.id}','encrypted',this.checked)"> Encryption at Rest
      </label>
      ${el.encrypted ? `
        <select style="margin-top:6px;width:100%" onchange="Diagram.updateProp('${el.id}','encryptionAlgorithm',this.value)">${algOpts}</select>
        ${(el.encryptionAlgorithm||'AES-256')==='Other'?`
        <input type="text" style="margin-top:4px;width:100%" placeholder="Algorithm name…"
          value="${esc(el.encryptionOther||'')}"
          oninput="Diagram.updateProp('${el.id}','encryptionOther',this.value)" />`:''}
      ` : ''}
    </div>`;
  }

  function showProps(el) {
    const pc=document.getElementById('propsContent'); if(!pc) return;
    const disabled='disabled style="color:var(--c-muted);background:#f1f5f9"';
    const cia = el.type==='trustzone' ? '' : `
      <div class="props-field"><label>CIA &amp; Justification</label>
        ${ciaJustRow(el.id,'c',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
        ${ciaJustRow(el.id,'i',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
        ${ciaJustRow(el.id,'a',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
      </div>`;
    const typeSpecific =
      el.type==='process'                         ? servicesSection(el)
      : (el.type==='external'||el.type==='actor') ? `${propsField('Authentication',
          `<input type="text" value="${esc(el.authentication||'')}" placeholder="Authentication method…"
            oninput="Diagram.updateProp('${el.id}','authentication',this.value)" />`)}
          ${interfacesSection(el)}`
      : el.type==='store'||el.type==='cylinder'   ? encryptionSection(el)
      : '';
    const common = el.type==='trustzone' ? '' : classificationSection(el);
    pc.innerHTML=`
      ${propsField('ID',`<input type="text" value="${esc(el.tmId||'')}" ${disabled}/>`)}
      ${propsField('Name',`<input type="text" value="${esc(el.name)}"
        onchange="Diagram.updateProp('${el.id}','name',this.value)" />`)}
      ${propsField('Type',`<input type="text" value="${el.type}" ${disabled}/>`)}
      ${cia}${typeSpecific}${common}
      <div class="props-field" style="margin-top:8px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete</button></div>`;
  }

  function showConnProps(c) {
    const pc=document.getElementById('propsContent'); if(!pc) return;
    const disabled='disabled style="color:var(--c-muted);background:#f1f5f9"';
    const dirOpts=['forward','backward','bidirectional'].map(d=>
      `<option value="${d}" ${(c.direction||'forward')===d?'selected':''}>${d.charAt(0).toUpperCase()+d.slice(1)}</option>`
    ).join('');
    const protocolOpts = PROTOCOLS.map(p=>
      `<option value="${p}" ${(c.protocol||'')===p?'selected':''}>${p||'— Select protocol —'}</option>`
    ).join('');
    const annot = `
      <div class="props-field"><label>Annotation</label>
        <textarea rows="2" class="props-textarea" placeholder="Free text notes…"
          oninput="Diagram.updateConnProp('${c.id}','annotation',this.value)">${esc(c.annotation||'')}</textarea>
      </div>
      <div class="props-field"><label>Asset Classification</label>
        <div class="checkbox-stack">
          ${['isSystemAsset','isSupportingAsset','isHealthcareAsset'].map((k,i)=>`
          <label class="checkbox-label"><input type="checkbox" ${c[k]?'checked':''}
            onchange="Diagram.updateConnProp('${c.id}','${k}',this.checked)">
            ${['System Asset','Supporting Asset','Healthcare Facility Operated Asset'][i]}</label>`).join('')}
        </div>
      </div>`;
    pc.innerHTML=`
      ${propsField('ID',`<input type="text" value="${esc(c.tmId||'')}" ${disabled}/>`)}
      ${propsField('Name',`<input type="text" value="${esc(c.name)}"
        onchange="Diagram.updateConnProp('${c.id}','name',this.value)" />`)}
      ${propsField('Direction',`<select onchange="Diagram.updateConnProp('${c.id}','direction',this.value)">${dirOpts}</select>`)}
      ${propsField('Protocol',`<select onchange="Diagram.updateConnProp('${c.id}','protocol',this.value)">${protocolOpts}</select>`)}
      <div class="props-field"><label>CIA &amp; Justification</label>
        ${ciaJustRow(c.id,'c',c.cia,c.justificationC||'',c.justificationI||'',c.justificationA||'',true)}
        ${ciaJustRow(c.id,'i',c.cia,c.justificationC||'',c.justificationI||'',c.justificationA||'',true)}
        ${ciaJustRow(c.id,'a',c.cia,c.justificationC||'',c.justificationI||'',c.justificationA||'',true)}
      </div>
      ${annot}
      <div class="props-field" style="margin-top:8px">
        <button class="btn btn-danger btn-sm" onclick="Diagram.deleteSelected()">🗑 Delete</button></div>`;
  }

  function updateProp(id, key, val) {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    el[key] = val;
    if (key === 'name') { renderElement(el); Assets.refresh(); }
    if (key === 'encrypted' || key === 'encryptionAlgorithm') showProps(el);
    App.autosave();
  }
  function updateCIA(id,key,val)     { const el=elements.find(e=>e.id===id);    if(el){el.cia[key]=val;renderElement(el);Assets.refresh();App.autosave();} }
  function updateConnProp(id,key,val){ const c=connections.find(c=>c.id===id);  if(c){c[key]=val;if(key==='name'||key==='direction'){renderConn(c);}Assets.refresh();App.autosave();} }
  function updateConnCIA(id,key,val) { const c=connections.find(c=>c.id===id);  if(c){c.cia[key]=val;renderConn(c);Assets.refresh();App.autosave();} }

  // ── Interface / Service mutation helpers ──────────────────────────────
  function addInterface(elId) {
    const el = elements.find(e => e.id === elId); if (!el) return;
    if (!el.interfaces) el.interfaces = [];
    el.interfaces.push('');
    showProps(el); App.autosave();
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll(`#iface_${elId} input`);
      inputs[inputs.length-1]?.focus();
    });
  }
  function updateInterface(elId, idx, val) {
    const el = elements.find(e => e.id === elId);
    if (el && el.interfaces) { el.interfaces[idx] = val; App.autosave(); }
  }
  function removeInterface(elId, idx) {
    const el = elements.find(e => e.id === elId);
    if (el && el.interfaces) { el.interfaces.splice(idx, 1); showProps(el); App.autosave(); }
  }
  function addService(elId) {
    const el = elements.find(e => e.id === elId); if (!el) return;
    if (!el.services) el.services = [];
    el.services.push({ name:'', port:'' });
    showProps(el); App.autosave();
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll(`#svc_${elId} input`);
      inputs[inputs.length-2]?.focus();
    });
  }
  function updateService(elId, idx, field, val) {
    const el = elements.find(e => e.id === elId);
    if (el && el.services && el.services[idx]) { el.services[idx][field] = val; App.autosave(); }
  }
  function removeService(elId, idx) {
    const el = elements.find(e => e.id === elId);
    if (el && el.services) { el.services.splice(idx, 1); showProps(el); App.autosave(); }
  }

  function zoomIn()    { viewBox.w*=0.85;viewBox.h*=0.85;applyViewBox(); }
  function zoomOut()   { viewBox.w*=1.18;viewBox.h*=1.18;applyViewBox(); }
  function resetView() { viewBox={x:0,y:0,w:1200,h:700};applyViewBox(); }

  function exportSVG() {
    const clone=svg.cloneNode(true);
    clone.querySelectorAll('.resize-handle,.selected-ring').forEach(n=>n.remove());
    clone.querySelector('#layerTemp')?.replaceChildren();
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');
    style.textContent=`circle,rect{fill:#fff;stroke:#475569;stroke-width:2}
      rect[class*="trustzone"]{fill:rgba(239,68,68,.06);stroke:#ef4444;stroke-dasharray:8 4}
      .element-label{font-size:12px;fill:#1e293b;text-anchor:middle;dominant-baseline:middle;font-family:sans-serif}
      .element-cia,.conn-label{font-size:9px;fill:#64748b;text-anchor:middle;font-family:sans-serif}
      line{stroke:#475569;stroke-width:1.8;fill:none}polygon{fill:#475569}`;
    clone.insertBefore(style,clone.firstChild);
    const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(document.getElementById('projectName')?.value||'diagram').replace(/\s+/g,'_')+'-model.svg';
    a.click(); URL.revokeObjectURL(a.href);
    App.toast('Model exported as SVG.','ok');
  }

  function makeSVG(tag,attrs={}) {
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,String(v));
    return el;
  }
  function clearTemp() { layerTemp.innerHTML=''; }

  function getData()  { return { elements, connections, uid }; }
  function setData(d) {
    elements = (d.elements||[]).map(el => ({
      justificationC:'', justificationI:'', justificationA:'', justification:'',
      annotation:'', isSystemAsset:false, isSupportingAsset:false, isHealthcareAsset:false,
      interfaces:[], services:[], authentication:'',
      encrypted:false, encryptionAlgorithm:'AES-256', encryptionOther:'',
      ...el, tmId: el.tmId || IDCounter.nextTM(),
    }));
    connections = (d.connections||[]).map(c => ({
      justificationC:'', justificationI:'', justificationA:'', justification:'',
      direction:'forward', protocol:'',
      annotation:'', isSystemAsset:false, isSupportingAsset:false, isHealthcareAsset:false,
      ...c, tmId: c.tmId || IDCounter.nextTM(),
    }));
    uid = d.uid || elements.length + connections.length + 1;
    renderAll(); clearSelection(); Assets.refresh();
  }

  function getAllAssets() {
    return [
      ...elements.filter(e=>e.type!=='trustzone').map(e=>({id:e.id,tmId:e.tmId,name:e.name,type:e.type,cia:e.cia||{c:'N',i:'N',a:'N'},justification:e.justification||''})),
      ...connections.map(c=>({id:c.id,tmId:c.tmId,name:c.name,type:'dataflow',cia:c.cia||{c:'N',i:'N',a:'N'},justification:c.justification||''})),
    ];
  }
  function getElements()    { return elements; }
  function getConnections() { return connections; }

  function focusElement(id) {
    if(elements.find(e=>e.id===id))         selectElement(id);
    else if(connections.find(c=>c.id===id)) selectConn(id);
  }

  return { init, getData, setData, getAllAssets, getElements, getConnections,
           deleteSelected, updateProp, updateCIA, updateConnProp, updateConnCIA,
           zoomIn, zoomOut, resetView, exportSVG, focusElement,
           addInterface, updateInterface, removeInterface,
           addService, updateService, removeService };
})();
