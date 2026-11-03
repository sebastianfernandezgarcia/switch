import { project, unproject } from './network-core.mjs';
const colors = () => document.documentElement.dataset.theme === 'dark'
  ? { sea:'#111619',land:'#20292e',border:'#3a484f',track:'#72838b',station:'#c6cfd3',ink:'#eef2f3',muted:'#83949b',red:'#ff5c62',plum:'#db4b9b',green:'#13bb7f',grid:'#203037' }
  : { sea:'#eef1f3',land:'#fafbfc',border:'#d4dce0',track:'#84949e',station:'#506571',ink:'#172127',muted:'#6b7e89',red:'#c6212b',plum:'#872955',green:'#197a66',grid:'#e1e7ea' };
export function createNationalMap(container, data, countries, { preview = false, onPick = () => {} } = {}) {
  const canvas = document.createElement('canvas'); canvas.setAttribute('role','img'); canvas.setAttribute('aria-label','Real railway geometry in Spain'); container.append(canvas);
  const ctx = canvas.getContext('2d'), projected = data.edges.map(e => e.coordinates.map(project)), edgePaths = new Map();
  const network = new Path2D(),standardGauge=new Path2D();
  for (const [i,line] of projected.entries()) { network.moveTo(...line[0]); for (const p of line.slice(1)) network.lineTo(...p);if(data.edges[i].gauge==='1435'){standardGauge.moveTo(...line[0]);for(const p of line.slice(1))standardGauge.lineTo(...p);} }
  const land = new Path2D();
  for (const f of countries.features) for (const polygon of f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) for (const ring of polygon) {
    ring.forEach((p,i) => { const q=project(p); i ? land.lineTo(...q) : land.moveTo(...q); }); land.closePath();
  }
  const hubs=['60000','17000','71801','51003','03216','04040','31412','37606','15100','31400','22308'];const sortedStations=[...data.stations].sort((a,b)=>Number(hubs.includes(b.code))-Number(hubs.includes(a.code)));
  let width=1,height=1,scale=1,offset=[0,0],scheduled=false,visible=true,route=null,baseline=null,blocked=[],vehicles=[],snapshotVehicle=null,contextMarkers=[],trail=[],selected=null,drag=null,dragged=false,initialized=false,lastFit=null;
  const idx=new Map(data.edges.map((e,i)=>[String(e.id),i]));
  function pathFor(id) { if(edgePaths.has(id))return edgePaths.get(id); const p=new Path2D(),line=projected[idx.get(String(id))]; if(!line)return p;line.forEach((q,i)=>i?p.lineTo(...q):p.moveTo(...q));edgePaths.set(id,p);return p; }
  const screen = p => [p[0]*scale+offset[0],p[1]*scale+offset[1]];
  const world = p => [(p[0]-offset[0])/scale,(p[1]-offset[1])/scale];
  function fit(bbox) {
    lastFit=[...bbox];
    const a=project([bbox[0],bbox[3]]),b=project([bbox[2],bbox[1]]),pad=preview?12:35;
    scale=Math.min((width-pad*2)/(b[0]-a[0]),(height-pad*2)/(b[1]-a[1]));offset=[width/2-(a[0]+b[0])/2*scale,height/2-(a[1]+b[1])/2*scale];initialized=true;requestDraw();
  }
  function requestDraw(){if(!visible||scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;draw();});}
  function draw() {
    const dpr=Math.min(devicePixelRatio,1.5),c=colors();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle=c.sea;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle=c.grid;ctx.lineWidth=.5;ctx.beginPath();for(let x=0;x<width;x+=55){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(let y=0;y<height;y+=55){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();
    ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*offset[0],dpr*offset[1]);ctx.fillStyle=c.land;ctx.fill(land);ctx.strokeStyle=c.border;ctx.lineWidth=.7/scale;ctx.stroke(land);
    ctx.strokeStyle=c.track;ctx.lineWidth=(scale>250?1.15:.9)/scale;ctx.globalAlpha=contextMarkers.length?.32:.85;ctx.stroke(network);ctx.globalAlpha=contextMarkers.length?.3:.67;ctx.strokeStyle=c.plum;ctx.lineWidth=(preview?.95:1.1)/scale;ctx.stroke(standardGauge);ctx.globalAlpha=1;
    if(baseline&&blocked.length){ctx.setLineDash([5/scale,5/scale]);ctx.lineWidth=2.2/scale;ctx.strokeStyle=c.plum;for(const id of baseline.edgeIds)ctx.stroke(pathFor(id));ctx.setLineDash([]);}
    if(route?.feasible){ctx.lineWidth=3/scale;ctx.strokeStyle=c.green;for(const id of route.edgeIds)ctx.stroke(pathFor(id));}
    ctx.strokeStyle=c.red;ctx.lineWidth=5/scale;for(const id of blocked)ctx.stroke(pathFor(id));
    if(selected?.kind==='edge'){ctx.strokeStyle=c.plum;ctx.lineWidth=4/scale;ctx.stroke(pathFor(selected.edge.id));}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(trail.length>1){ctx.beginPath();trail.forEach((v,i)=>{const p=screen(project([v.lon,v.lat]));i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.strokeStyle=c.plum;ctx.lineWidth=3;ctx.globalAlpha=.65;ctx.stroke();ctx.globalAlpha=1;}
    // Labels share one collision budget. The selected train is allocated first.
    const labelBoxes=[];
    function placeLabel(text,p,{priority=false,color=c.ink,font='10px "Hanken Grotesk", sans-serif'}={}){
      ctx.font=font;const w=ctx.measureText(text).width+12,h=21;
      const candidates=[[p[0]+12,p[1]-27],[p[0]+12,p[1]+9],[p[0]-w-12,p[1]-27],[p[0]-w-12,p[1]+9]];
      for(const [x,y] of candidates){if(x<8||x+w>width-8||y<70||y+h>height-55)continue;if(labelBoxes.some(b=>x<b.x+b.w+6&&x+w>b.x-6&&y<b.y+b.h+5&&y+h>b.y-5))continue;labelBoxes.push({x,y,w,h});ctx.fillStyle=c.land;ctx.strokeStyle=c.border;ctx.lineWidth=.65;ctx.beginPath();ctx.roundRect(x,y,w,h,2);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.fillText(text,x+6,y+14);return true;}return false;
    }
    const selectedVehicle=selected?.kind==='vehicle'?vehicles.find(v=>v.key===selected.vehicle.key):null;
    if(selectedVehicle)placeLabel(String(selectedVehicle.label).replace(/-PLATF.*$/,'').slice(0,30),screen(project([selectedVehicle.lon,selectedVehicle.lat])),{priority:true,color:c.plum,font:'600 11px "Hanken Grotesk", sans-serif'});
    if(snapshotVehicle)placeLabel(snapshotVehicle.label,screen(project([snapshotVehicle.lon,snapshotVehicle.lat])),{priority:true,color:c.plum});
    // Reported positions stay at the supplied coordinates: no invented motion.
    for(const v of vehicles){const p=screen(project([v.lon,v.lat]));if(p[0]<-12||p[0]>width+12||p[1]<-12||p[1]>height+12)continue;
      const fresh=v.feedStatus==='fresh'&&v.observedAt&&Date.now()/1000-v.observedAt<90;ctx.fillStyle=fresh?c.plum:c.muted;ctx.strokeStyle=c.land;ctx.lineWidth=preview?.6:1.5;
      if(!preview&&scale>180&&v.bearing!==null&&Number.isFinite(v.bearing)){ctx.save();ctx.translate(...p);ctx.rotate(v.bearing*Math.PI/180);ctx.beginPath();ctx.roundRect(-4,-7,8,14,3);ctx.fill();ctx.stroke();ctx.restore();}else{ctx.beginPath();ctx.arc(...p,preview?2.5:4.5,0,Math.PI*2);ctx.fill();ctx.stroke();}
      if(!preview&&scale>1000&&v.key!==selectedVehicle?.key)placeLabel(String(v.label).replace(/-PLATF.*$/,'').slice(0,24),p,{color:c.muted});
      if(selected?.kind==='vehicle'&&selected.vehicle.key===v.key){ctx.beginPath();ctx.arc(...p,9,0,Math.PI*2);ctx.strokeStyle=c.red;ctx.lineWidth=1;ctx.stroke();}
    }
    if(snapshotVehicle){const p=screen(project([snapshotVehicle.lon,snapshotVehicle.lat]));ctx.beginPath();ctx.arc(...p,9,0,Math.PI*2);ctx.setLineDash([3,3]);ctx.strokeStyle=c.plum;ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);}
    for(const marker of contextMarkers){const p=screen(project([marker.lon,marker.lat]));const side=marker.id==='urda'?-1:1,end=p[0]+side*Math.min(50,width*.1);ctx.strokeStyle=c.red;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(end,p[1]-18);ctx.lineTo(end+side*18,p[1]-18);ctx.stroke();ctx.beginPath();ctx.arc(...p,10,0,Math.PI*2);ctx.fillStyle=c.land;ctx.fill();ctx.setLineDash([2,3]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(...p,3.5,0,Math.PI*2);ctx.fillStyle=c.red;ctx.fill();ctx.font='600 11px "Hanken Grotesk", sans-serif';ctx.textAlign=side<0?'right':'left';ctx.fillText(marker.name,end+side*22,p[1]-22);ctx.font='9px "Hanken Grotesk", sans-serif';ctx.fillStyle=c.muted;ctx.fillText('PK '+(marker.kilometrePointLabel??marker.kilometrePoint??''),end+side*22,p[1]-7);ctx.textAlign='left';}
    const used=[];
    for(const s of sortedStations){if(preview&&!hubs.includes(s.code))continue;if(!preview&&scale<180&&!hubs.includes(s.code)&&s.id!==selected?.station?.id)continue;
      const p=screen(project([s.lon,s.lat]));if(p[0]<12||p[0]>width-12||p[1]<16||p[1]>height-16)continue;
      ctx.beginPath();ctx.arc(...p,preview?1.8:2.4,0,Math.PI*2);ctx.fillStyle=c.station;ctx.fill();
      const name=String(s.name??s.code??s.id).replace(/^Estación (?:de (?:Tren de |Tren )?|del )/i,'').replace(/\s*\/.*$/,'').replace('Madrid-P. de Atocha Almudena Grandes','Madrid Atocha').replace('Sevilla-Santa Justa','Sevilla').replace('Barcelona-Sants','Barcelona').replace('Madrid-Chamartín-Clara Campoamor','Madrid Chamartín').replace('Valencia-Joaquin Sorolla','València').replace('Santiago de Compostela','Santiago');
      if(used.some(q=>Math.abs(q[0]-p[0])<Math.min(name.length*5+30,130)&&Math.abs(q[1]-p[1])<20))continue;
      if(preview){ctx.font='8px \"Hanken Grotesk\", sans-serif';ctx.fillStyle=c.ink;ctx.fillText(name.slice(0,30),p[0]+6,p[1]-6);used.push(p);}else if(placeLabel(name.slice(0,32),p))used.push(p);
    }
    canvas.dataset.rendered='true';canvas.dataset.edgeCount=String(data.edges.length);canvas.dataset.vehicleCount=String(vehicles.length);canvas.dataset.scale=scale.toFixed(2);const centre=unproject(world([width/2,height/2]));canvas.dataset.centreLon=String(centre[0]);canvas.dataset.centreLat=String(centre[1]);canvas.dataset.selectedVehicleKey=selectedVehicle?.key??'';
  }
  const resize=new ResizeObserver(()=>{const old=[width,height];width=container.clientWidth;height=container.clientHeight;canvas.width=Math.round(width*Math.min(devicePixelRatio,1.5));canvas.height=Math.round(height*Math.min(devicePixelRatio,1.5));if(!initialized)fit([-9.6,35.6,4.7,44.3]);else if(lastFit)fit(lastFit);else{offset[0]+=(width-old[0])/2;offset[1]+=(height-old[1])/2;requestDraw();}});resize.observe(container);
  const observer=new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)requestDraw();});observer.observe(container);
  const theme=new MutationObserver(requestDraw);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  function zoom(factor, point=[width/2,height/2]){lastFit=null;const before=world(point),next=Math.max(12,Math.min(90000,scale*factor));scale=next;offset=[point[0]-before[0]*scale,point[1]-before[1]*scale];requestDraw();}
  if(!preview){
    canvas.tabIndex=0;canvas.style.touchAction='pan-y';
    canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,offset:[...offset]};dragged=false;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4){dragged=true;lastFit=null;}offset=[drag.offset[0]+dx,drag.offset[1]+dy];requestDraw();});
    canvas.addEventListener('pointerup',e=>{drag=null;if(dragged)return;const r=canvas.getBoundingClientRect(),p=[e.clientX-r.left,e.clientY-r.top];pick(p);});
    canvas.addEventListener('pointercancel',()=>{if(drag)offset=drag.offset;drag=null;requestDraw();});
    canvas.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY>0?.85:1.18,[e.clientX-r.left,e.clientY-r.top]);},{passive:false});
    canvas.addEventListener('dblclick',e=>{const r=canvas.getBoundingClientRect();zoom(2,[e.clientX-r.left,e.clientY-r.top]);});
    canvas.addEventListener('keydown',e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')fit([-9.6,35.6,4.7,44.3]);else if(e.key==='-'||e.key==='+'||e.key==='=')zoom(e.key==='-'?.8:1.25);else{offset[0]+=e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0;offset[1]+=e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0;requestDraw();}}});
  }
  function pick(p){
    const nearest=(list,location,limit)=>{let best=null,dist=limit;for(const item of list){const q=screen(project(location(item))),d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<dist){dist=d;best=item;}}return best;};
    const v=nearest(vehicles,v=>[v.lon,v.lat],12);if(v){selected={kind:'vehicle',vehicle:v};onPick(selected);requestDraw();return;}
    const station=nearest(data.stations,s=>[s.lon,s.lat],10);if(station){selected={kind:'station',station};onPick(selected);requestDraw();return;}
    const w=world(p);let best=null,distance=8/scale;
    for(let i=0;i<projected.length;i++)for(let j=1;j<projected[i].length;j++){
      const a=projected[i][j-1],b=projected[i][j];if(w[0]<Math.min(a[0],b[0])-distance||w[0]>Math.max(a[0],b[0])+distance||w[1]<Math.min(a[1],b[1])-distance||w[1]>Math.max(a[1],b[1])+distance)continue;
      const den=(b[0]-a[0])**2+(b[1]-a[1])**2,t=den?Math.max(0,Math.min(1,((w[0]-a[0])*(b[0]-a[0])+(w[1]-a[1])*(b[1]-a[1]))/den)):0;
      const d=Math.hypot(w[0]-a[0]-t*(b[0]-a[0]),w[1]-a[1]-t*(b[1]-a[1]));if(d<distance){distance=d;best=i;}
    }
    if(best!==null){selected={kind:'edge',edge:data.edges[best]};onPick(selected);requestDraw();}
  }
  return {setState(value){({route=route,baseline=baseline,blocked=blocked,vehicles=vehicles,snapshotVehicle=snapshotVehicle,contextMarkers=contextMarkers,trail=trail}=value);requestDraw();},fit,zoom,
    focus(point){lastFit=null;const p=project(point);scale=2200;offset=[width/2-p[0]*scale,height/2-p[1]*scale];requestDraw();},
    follow(point){lastFit=null;const p=project(point);offset=[width/2-p[0]*scale,height/2-p[1]*scale];requestDraw();},
    fitRoute(value){if(!value?.feasible)return;const points=value.edgeIds.flatMap(id=>data.edges[idx.get(id)].coordinates);fit([Math.min(...points.map(p=>p[0]))-.1,Math.min(...points.map(p=>p[1]))-.1,Math.max(...points.map(p=>p[0]))+.1,Math.max(...points.map(p=>p[1]))+.1]);},
    selectVehicle(key){const v=vehicles.find(v=>v.key===key);selected=v?{kind:'vehicle',vehicle:v}:null;requestDraw();},
    destroy(){resize.disconnect();observer.disconnect();theme.disconnect();canvas.remove();}};
}
