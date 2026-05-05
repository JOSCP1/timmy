'use strict';

const Diagram = (() => {
  let elements    = [];
  let connections = [];
  let selected    = null;
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
      if (e.key==='v'||e.key==='V') setTool('select');
      if (e.key==='p'||e.key==='P') setTool('process');
      if (e.key==='s'||e.key==='S') setTool('store');
      if (e.key==='e'||e.key==='E') setTool('external');
      if (e.key==='d'||e.key==='D') setTool('diamond');
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
      if (el)      { selectElement(el.id); dragging={id:el.id,ox:p.x-el.x,oy:p.y-el.y}; e.preventDefault(); }
      else if (cn) { selectConn(cn.id); }
      else         { clearSelection(); panState={sx:e.clientX,sy:e.clientY,vx:viewBox.x,vy:viewBox.y}; }
    }
    else if (tool==='process')  addElement({type:'process', x:p.x,y:p.y,r:42,     name:'Process',         cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='store')    addElement({type:'store',   x:p.x,y:p.y,w:110,h:55,name:'Data Store',      cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='external') addElement({type:'external',x:p.x,y:p.y,w:90, h:60, name:'External Entity',cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
    else if (tool==='diamond')  addElement({type:'diamond', x:p.x,y:p.y,w:100,h:65, name:'Decision',        cia:{c:'N',i:'N',a:'N'},justificationC:'',justificationI:'',justificationA:'',justification:''});
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
      const el=elements.find(e=>e.id===dragging.id);
      if(el){el.x=p.x-dragging.ox;el.y=p.y-dragging.oy;renderElement(el);connections.filter(c=>c.src===el.id||c.tgt===el.id).forEach(renderConn);}
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
  }
  function addConnection(data) {
    const c={ id:'cn_'+(uid++), tmId:IDCounter.nextTM(), ...data };
    connections.push(c); renderConn(c); selectConn(c.id); Assets.refresh(); App.autosave();
  }
  function deleteSelected() {
    if(!selected) return;
    if(selected.type==='element'){
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

  function renderAll() {
    layerTZ.innerHTML=''; layerConn.innerHTML=''; layerEl.innerHTML='';
    elements.filter(e=>e.type==='trustzone').forEach(renderElement);
    connections.forEach(renderConn);
    elements.filter(e=>e.type!=='trustzone').forEach(renderElement);
  }

  function renderElement(el) {
    document.getElementById('el_'+el.id)?.remove();
    const g=makeSVG('g',{id:'el_'+el.id});
    const isSel=selected?.type==='element'&&selected.id===el.id;
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

    const isSel = selected?.type==='conn' && selected.id===c.id;
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

  function selectElement(id) {
    const prev=selected;
    if(prev&&prev.id!==id){ selected=null;
      if(prev.type==='element'){const e=elements.find(el=>el.id===prev.id);if(e)renderElement(e);}
      else{const c=connections.find(cn=>cn.id===prev.id);if(c)renderConn(c);}
    }
    selected={type:'element',id};
    const el=elements.find(e=>e.id===id);
    if(el){renderElement(el);showProps(el);}
  }
  function selectConn(id) {
    const prev=selected;
    if(prev&&prev.id!==id){ selected=null;
      if(prev.type==='element'){const e=elements.find(el=>el.id===prev.id);if(e)renderElement(e);}
      else{const c=connections.find(cn=>cn.id===prev.id);if(c)renderConn(c);}
    }
    selected={type:'conn',id};
    const c=connections.find(c=>c.id===id);
    if(c){renderConn(c);showConnProps(c);}
  }
  function clearSelection() {
    const prev=selected; selected=null;
    if(prev?.type==='element'){const el=elements.find(e=>e.id===prev.id);if(el)renderElement(el);}
    else if(prev?.type==='conn'){const c=connections.find(c=>c.id===prev.id);if(c)renderConn(c);}
    document.getElementById('propsContent').innerHTML='<p class="props-hint">Select an element to edit its properties.</p>';
  }

  function showProps(el) {
    const pc=document.getElementById('propsContent'); if(!pc) return;
    const ciaSection=el.type==='trustzone'?'':`
      <div class="props-field">
        <label>CIA Classification &amp; Justification</label>
        ${ciaJustRow(el.id,'c',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
        ${ciaJustRow(el.id,'i',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
        ${ciaJustRow(el.id,'a',el.cia,el.justificationC||'',el.justificationI||'',el.justificationA||'',false)}
      </div>`;
    pc.innerHTML=`
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

  function showConnProps(c) {
    const pc=document.getElementById('propsContent'); if(!pc) return;
    const dirOpts=['forward','backward','bidirectional'].map(d=>
      `<option value="${d}" ${(c.direction||'forward')===d?'selected':''}>${d.charAt(0).toUpperCase()+d.slice(1)}</option>`
    ).join('');
    pc.innerHTML=`
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

  function updateProp(id,key,val)    { const el=elements.find(e=>e.id===id);    if(el){el[key]=val;renderElement(el);Assets.refresh();App.autosave();} }
  function updateCIA(id,key,val)     { const el=elements.find(e=>e.id===id);    if(el){el.cia[key]=val;renderElement(el);Assets.refresh();App.autosave();} }
  function updateConnProp(id,key,val){ const c=connections.find(c=>c.id===id);  if(c){c[key]=val;renderConn(c);Assets.refresh();App.autosave();} }
  function updateConnCIA(id,key,val) { const c=connections.find(c=>c.id===id);  if(c){c.cia[key]=val;renderConn(c);Assets.refresh();App.autosave();} }

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
    elements    = (d.elements||[]).map(el=>({justificationC:'',justificationI:'',justificationA:'',justification:'',...el,tmId:el.tmId||IDCounter.nextTM()}));
    connections = (d.connections||[]).map(c =>({justificationC:'',justificationI:'',justificationA:'',justification:'',direction:'forward',...c,tmId:c.tmId||IDCounter.nextTM()}));
    uid=d.uid||elements.length+connections.length+1;
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
           zoomIn, zoomOut, resetView, exportSVG, focusElement };
})();
