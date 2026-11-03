import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// Presentation of the existing fictional model. Positions and route states arrive
// from app.js; this renderer never plans routes, calls Meta or advances time.
export function createRailScene(container, { hero = false, onUnavailable = () => {} } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
  catch { onUnavailable(); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = !hero;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute('aria-label', 'Vista 3D interactiva del ejercicio ferroviario ficticio');
  renderer.domElement.setAttribute('role', 'img');
  container.prepend(renderer.domElement);
  const labels = document.createElement('div'); labels.className = 'world-labels'; labels.setAttribute('aria-hidden', 'true'); container.append(labels);
  const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
  const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, .1, 120);
  camera.position.set(-8, 17, 23);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, .6, -.5); controls.enableDamping = false; controls.enablePan = false; controls.enableZoom = false;
  controls.minPolarAngle = .25; controls.maxPolarAngle = Math.PI / 2.3;
  controls.enableRotate = !hero && matchMedia('(pointer:fine)').matches;
  renderer.domElement.style.touchAction = 'pan-y';
  const ambient = new THREE.HemisphereLight(0xf6f9ff, 0x62676d, 2.5); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-8, 16, 9); key.castShadow = !hero;
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 13, bottom: -13, near: .1, far: 50 });
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005; scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8d8ee, 1); rim.position.set(10, 6, -10); scene.add(rim);
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .56, metalness: .08, ...extra });
  const materials = { plate: material('#eceeef'), bed: material('#cad0d4'), rail: material('#69747a', { metalness: .7, roughness: .3 }),
    tie: material('#8d959a'), station: material('#f9fafb'), glass: material('#506570', { metalness: .28, roughness: .2 }),
    dark: material('#202a31'), red: material('#cf2838'), green: material('#00815c'), plum: material('#812653'), stripe: material('#9ba4ab') };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const circleGeo = new THREE.CylinderGeometry(.08, .08, .06, 12);
  function box(parent, size, position, mat) {
    const m = new THREE.Mesh(boxGeo, mat); m.scale.set(...size); m.position.set(...position);
    m.castShadow = !hero; m.receiveShadow = true; parent.add(m); return m;
  }
  const plateShape = new THREE.Shape(); const w = 14, h = 6.2, r = .28;
  plateShape.moveTo(-w + r, -h); plateShape.lineTo(w-r,-h); plateShape.quadraticCurveTo(w,-h,w,-h+r);
  plateShape.lineTo(w,h-r); plateShape.quadraticCurveTo(w,h,w-r,h); plateShape.lineTo(-w+r,h);
  plateShape.quadraticCurveTo(-w,h,-w,h-r); plateShape.lineTo(-w,-h+r); plateShape.quadraticCurveTo(-w,-h,-w+r,-h);
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(plateShape, { depth: .22, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 2 }), materials.plate);
  plate.rotation.x = -Math.PI / 2; plate.position.y = -.18; plate.receiveShadow = true; world.add(plate);
  const grid = new THREE.GridHelper(28, 28, '#bdc4c9', '#d6dce0'); grid.position.y = .055;
  grid.material.transparent = true; grid.material.opacity = .28; world.add(grid);
  // Three accent lines belong to the original fictional product, not to operators.
  [materials.red, materials.plum, materials.green].forEach((m, i) => box(world, [1.25,.025,.035], [-11.7 + i*1.42,.07,5.7],m));
  const trackGroup = new THREE.Group(), trainGroup = new THREE.Group(), overlay = new THREE.Group();
  world.add(trackGroup, trainGroup, overlay);
  const edges = new Map(), stations = new Map(), trains = new Map(), labelItems = [];
  const worldPoint = p => new THREE.Vector3((p.x - 620) * .022, .64, (p.y - 280) * .022);
  function label(text, position, className = '') {
    const el = document.createElement('span'); el.className = 'world-label ' + className; el.textContent = text; labels.append(el);
    const item = { el, position }; labelItems.push(item); return item;
  }
  function buildTrack(edge, a, b) {
    const group = new THREE.Group(), mid = a.clone().add(b).multiplyScalar(.5), length = a.distanceTo(b);
    group.position.copy(mid); group.rotation.y = -Math.atan2(b.z-a.z,b.x-a.x);
    box(group,[length,.23,.65],[0,-.15,0],materials.bed);
    const rail1 = box(group,[length,.055,.042],[0,.025,.22],materials.rail.clone());
    const rail2 = box(group,[length,.055,.042],[0,.025,-.22],rail1.material);
    const n = Math.floor(length/.24), ties = new THREE.InstancedMesh(boxGeo,materials.tie,n);
    const transform = new THREE.Object3D();
    for(let i=0;i<n;i++){transform.position.set(-length/2+.12+i*.24,-.015,0);transform.scale.set(.065,.05,.59);transform.updateMatrix();ties.setMatrixAt(i,transform.matrix);}
    ties.receiveShadow = true; group.add(ties);
    const highlight = box(group,[length,.025,.075],[0,.08,0],materials.green.clone()); highlight.visible=false;
    const barrier = new THREE.Group();
    [-.18,.18].forEach(x=>box(barrier,[.04,.4,.06],[x,.25,0],materials.red));
    const beam=box(barrier,[.7,.07,.09],[0,.46,0],materials.red); beam.rotation.y=Math.PI/2;
    barrier.position.set(0,.02,0); barrier.visible=false;group.add(barrier);
    // Catenary and signal details belong to this invented maquette only.
    const wire=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-length/2,1.65,0),new THREE.Vector3(length/2,1.65,0)]),new THREE.LineBasicMaterial({color:'#6c7880',transparent:true,opacity:.45}));group.add(wire);
    for(let x=-length/2+.7;x<length/2;x+=2.6){box(group,[.035,1.7,.035],[x,.7,-.64],materials.rail);box(group,[.035,.035,.77],[x,1.54,-.28],materials.rail);}
    const signal=new THREE.Group();signal.position.set(length*.3,.05,.64);box(signal,[.045,.65,.045],[0,.3,0],materials.rail);box(signal,[.14,.3,.1],[0,.7,0],materials.dark);
    const lens=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),new THREE.MeshBasicMaterial({color:'#77818a'}));lens.position.set(0,.74,.063);signal.add(lens);group.add(signal);
    trackGroup.add(group); edges.set(edge.id,{group,rails:rail1.material,highlight,barrier,lens});
    label(edge.id,new THREE.Vector3(mid.x,.9,mid.z+.55),'edge-world-label');
  }
  function buildStation(s, p) {
    const g = new THREE.Group();g.position.copy(p);g.position.y=0;
    box(g,[2.6,.2,.8],[0,.25,.95],materials.station);
    box(g,[2.45,.06,.62],[0,1.12,1.03],materials.station);
    [-.9,.9].forEach(x=>box(g,[.045,.6,.045],[x,.8,1.03],materials.stripe));
    box(g,[.9,.5,.05],[.5,.64,1.23],materials.glass);
    box(g,[.9,.04,.25],[-.55,.58,1.06],materials.plum);
    world.add(g);stations.set(s.id,g);label(s.name,p.clone().add(new THREE.Vector3(0,1.3,1.35)),'station-world-label');
  }
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-.8,0);hullShape.lineTo(.77,0);hullShape.quadraticCurveTo(1.08,.02,1.06,.23);
  hullShape.lineTo(.79,.48);hullShape.quadraticCurveTo(.65,.56,.35,.56);hullShape.lineTo(-.8,.56);hullShape.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(hullShape,{depth:.38,bevelEnabled:true,bevelSize:.045,bevelThickness:.04,bevelSegments:2,steps:1});cabGeo.translate(0,0,-.19);
  function buildTrain(train,index) {
    const g=new THREE.Group(), shell=material('#f5f6f7',{roughness:.25,metalness:.2});
    const accent=[materials.plum,materials.red,materials.green][index%3];
    const cab = new THREE.Mesh(cabGeo,shell);cab.position.y=.18;cab.castShadow=true;g.add(cab);
    box(g,[1.2,.46,.42],[-1.48,.43,0],shell);
    box(g,[2.38,.055,.44],[-.5,.33,0],accent);
    for(const z of [-.216,.216]) {
      box(g,[.95,.14,.012],[-1.45,.5,z],materials.glass);
      box(g,[1.08,.14,.012],[-.12,.52,z],materials.glass);
    }
    const wind=box(g,[.34,.13,.4],[.77,.56,0],materials.dark);wind.rotation.z=-.53;
    box(g,[.42,.025,.2],[-.12,.77,0],materials.stripe);
    [-1.85,-1.1,-.45,.55].forEach(x=>{const wheel=new THREE.Mesh(circleGeo,materials.dark);wheel.rotation.x=Math.PI/2;wheel.scale.set(1.1,5.8,1.1);wheel.position.set(x,.15,0);g.add(wheel);});
    box(g,[.035,.05,.23],[1.01,.32,0],materials.station);
    trainGroup.add(g);const marker=label(train.id,new THREE.Vector3(),'train-world-label');marker.el.dataset.train=train.id;
    trains.set(train.id,{group:g,label:marker,shell,accent});
  }
  let built=false, last, active=true, pending=null, lastDraw=0, poseAnimation=null, mode='overview', previous=false, disposed=false;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function draw(time=performance.now()) {
    pending=null;if(!active||disposed)return;
    if(time-lastDraw<28){pending=requestAnimationFrame(draw);return;}lastDraw=time;
    if(poseAnimation){const t=reduced?1:Math.min(1,(time-poseAnimation.at)/650),k=1-Math.pow(1-t,3);camera.position.lerpVectors(poseAnimation.from,poseAnimation.to,k);controls.target.lerpVectors(poseAnimation.targetFrom,poseAnimation.targetTo,k);camera.zoom=THREE.MathUtils.lerp(poseAnimation.zoomFrom,poseAnimation.zoomTo,k);camera.updateProjectionMatrix();controls.update();if(t===1)poseAnimation=null;}
    if(mode==='follow'&&last){const t=last.positions.find(t=>t.train.id==='T12');if(t){const p=worldPoint(t.point);const d=p.clone().sub(controls.target);controls.target.copy(p);camera.position.add(d);controls.update();}}
    const width=container.clientWidth,height=container.clientHeight;
    for(const item of labelItems){const p=item.position.clone().project(camera);item.el.style.transform=`translate(${(p.x*.5+.5)*width}px,${(-p.y*.5+.5)*height}px) translate(-50%,-100%)`;item.el.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.2;}
    renderer.render(scene,camera);container.dataset.rendered='true';if(poseAnimation)requestDraw();
  }
  function requestDraw(){if(active&&!pending&&!disposed)pending=requestAnimationFrame(draw);}
  controls.addEventListener('change',requestDraw);
  controls.addEventListener('start',()=>{poseAnimation=null;if(mode==='follow')mode='custom';});
  function resize(){const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;const aspect=width/height;const span=Math.max(hero?7.4:7.8,(hero?14.5:width<600?17.8:15.2)/aspect);camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();renderer.setSize(width,height,false);requestDraw();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
  const visibility=new IntersectionObserver(entries=>{active=entries[0].isIntersecting&&!document.hidden;if(active)requestDraw();else if(pending){cancelAnimationFrame(pending);pending=null;}},{rootMargin:'100px'});visibility.observe(container);
  const onVisible=()=>{if(document.hidden){active=false;if(pending)cancelAnimationFrame(pending);pending=null;}else{active=container.getBoundingClientRect().bottom>0&&container.getBoundingClientRect().top<innerHeight+100;if(active)requestDraw();}};
  document.addEventListener('visibilitychange',onVisible);
  function theme(){const dark=document.documentElement.dataset.theme==='dark';scene.background=new THREE.Color(dark?'#111416':'#eef0f1');materials.plate.color.set(dark?'#1c2226':'#e5e9eb');materials.bed.color.set(dark?'#303b42':'#b9c3ca');materials.tie.color.set(dark?'#58646c':'#9da8b0');materials.station.color.set(dark?'#bfc9d1':'#fafbfc');grid.material.color.set(dark?'#6d818c':'#a8b4bc');grid.material.opacity=dark?.18:.25;requestDraw();}
  const themeObserver=new MutationObserver(theme);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});theme();
  function setPose(name){mode=name;let target=new THREE.Vector3(0,.6,-.3),position=new THREE.Vector3(-8,17,23),zoom=1;if(name==='R2'){target=new THREE.Vector3(.3,.7,.2);position=new THREE.Vector3(-3.5,10,14);zoom=1.55;}if(name==='top'){position=new THREE.Vector3(0,24,.01);target=new THREE.Vector3(0,0,0);zoom=1.05;}if(name==='follow'){const t=last?.positions.find(t=>t.train.id==='T12');if(t)target=worldPoint(t.point);position=target.clone().add(new THREE.Vector3(6,5,8));zoom=1.5;}poseAnimation={at:performance.now(),from:camera.position.clone(),to:position,targetFrom:controls.target.clone(),targetTo:target,zoomFrom:camera.zoom,zoomTo:zoom};requestDraw();}
  function updateGhost(){while(overlay.children.length){const child=overlay.children[0];overlay.remove(child);child.geometry?.dispose();child.material?.dispose();}if(!previous||!last)return;let legs=last.previousBranch?.simulation.legs.filter(l=>l.train==='T12');if(!legs?.length)return;const mat=new THREE.LineDashedMaterial({color:'#ad3d79',dashSize:.18,gapSize:.12,transparent:true,opacity:.75});for(const leg of legs){const a=last.stations.find(s=>s.id===leg.from),b=last.stations.find(s=>s.id===leg.to),p=worldPoint(a),q=worldPoint(b);p.y=q.y=1;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p,q]),mat.clone());line.computeLineDistances();overlay.add(line);}mat.dispose();}
  function setState(value){last=value;if(!built){for(const e of value.edges)buildTrack(e,worldPoint(value.stations.find(s=>s.id===e.from)),worldPoint(value.stations.find(s=>s.id===e.to)));for(const s of value.stations)buildStation(s,worldPoint(s));value.positions.forEach(({train},i)=>buildTrain(train,i));built=true;resize();}
    container.dataset.evidenceVersion=String(value.version);container.dataset.scenarioHash=value.evidenceHash??'';container.dataset.modelMinute=String(value.minute);
    for(const state of value.edgeStates){const e=edges.get(state.id);e.rails.color.set(state.closed?'#d62d3c':state.unknown?'#c43b48':'#6f858d');e.highlight.visible=state.active||state.closed||state.unknown;e.highlight.material.color.set(state.closed||state.unknown?'#dc3545':'#058862');e.barrier.visible=state.closed;e.lens.material.color.set(state.closed||state.unknown?'#eb3548':state.active?'#058862':'#77818a');}
    for(const {train,point} of value.positions){const t=trains.get(train.id),p=worldPoint(point);t.group.position.copy(p);t.group.rotation.y=-point.angle*Math.PI/180;t.label.position.copy(p).add(new THREE.Vector3(-.4,1.15,0));t.label.el.textContent=train.id+(point.pending?value.pendingLabel:'');t.label.el.classList.toggle('world-stale',!!point.pending);t.label.el.dataset.modelX=point.x.toFixed(3);t.label.el.dataset.modelY=point.y.toFixed(3);t.shell.transparent=!!point.pending;t.shell.opacity=point.pending?.7:1;}
    const ghostKey=value.previousBranch?.id??'';if(overlay.userData.key!==ghostKey){overlay.userData.key=ghostKey;updateGhost();}requestDraw();}
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();active=false;container.dataset.unavailable='true';onUnavailable();});
  const onKey=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const a=(e.key==='ArrowLeft'?-1:1)*.15,offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),a);camera.position.copy(controls.target).add(offset);controls.update();requestDraw();e.preventDefault();}};
  container.tabIndex=0;container.addEventListener('keydown',onKey);
  resize();controls.update();requestDraw();
  return { setState, setPose,
    zoom(delta){camera.zoom=THREE.MathUtils.clamp(camera.zoom+delta,.65,2.4);camera.updateProjectionMatrix();requestDraw();},
    showPrevious(value){previous=value;updateGhost();requestDraw();},
    setEnabled(value){active=value;if(active)requestDraw();else if(pending){cancelAnimationFrame(pending);pending=null;}},
    dispose(){disposed=true;if(pending)cancelAnimationFrame(pending);resizeObserver.disconnect();visibility.disconnect();themeObserver.disconnect();document.removeEventListener('visibilitychange',onVisible);container.removeEventListener('keydown',onKey);controls.dispose();scene.traverse(obj=>{obj.geometry?.dispose();if(obj.material)for(const m of Array.isArray(obj.material)?obj.material:[obj.material])m.dispose();});renderer.dispose();renderer.domElement.remove();labels.remove();},
  };
}
