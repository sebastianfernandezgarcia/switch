import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNetworkExploration,exploreNetwork,observationSnapshot,verifyNetworkExplorations } from '../src/network-agent.mjs';
import { createGeographicGraph } from '../public/network-core.mjs';
import { startServer } from '../src/server.mjs';
const data=JSON.parse(await readFile(new URL('../public/data/rail-network.json',import.meta.url))),graph=createGeographicGraph(data);
const input={fromId:data.stations.find(s=>s.code==='60000').id,toId:data.stations.find(s=>s.code==='51003').id,gauge:'1435',blocked:[],question:'What if a section of this route closes?'};
const live={fetchedAt:'2026-11-01T23:00:00Z',feeds:[{id:'commuter',name:'Cercanías',status:'fresh',feedTimestamp:1793574000,vehicleCount:1}],vehicles:[{key:'commuter:123',label:'123',sourceId:'commuter',lon:-3.69,lat:40.4,observedAt:1793570000,timestampBasis:'vehicle',feedStatus:'stale'}]};
const text={title:'A closure changes the connection',summary:'The selected hypothetical closure disconnects the geographic path.',question:'What current operating evidence is missing?'};
const proposal=(testIds=['T1','T2'])=>({en:text,es:{title:'El cierre cambia la conexión',summary:'El cierre hipotético desconecta el recorrido geográfico.',question:'¿Qué evidencia operativa actual falta?'},testIds,visual:{kind:'scenario',testId:'T2',vehicleKey:''},sourceIds:['IGN','CONDITIONS']});
test('packaged actual explorations replay without inference and reject changed geometry results or source timestamps',async()=>{
  const document=JSON.parse(await readFile(new URL('../examples/recorded-explorations.json',import.meta.url)));
  const verified=verifyNetworkExplorations(data,document,graph);
  assert.ok(verified.length>=3);assert.ok(verified.every(r=>r.toolReplayVerified));
  const archived=verified.find(r=>r.observations.mode==='recorded_snapshot');assert.equal(archived.proposal.visual.kind,'vehicle');
  assert.equal(archived.observations.at,'2026-11-01T23:44:52.867Z');
  const resultTamper=structuredClone(document);resultTamper.records[0].trace[1].result.tests[0].distanceKm=1;
  assert.throws(()=>verifyNetworkExplorations(data,resultTamper,graph),/tool replay mismatch/);
  const timeTamper=structuredClone(document);timeTamper.records[2].observations.at='2026-11-02T00:00:00Z';
  assert.throws(()=>verifyNetworkExplorations(data,timeTamper,graph),/snapshot mismatch/);
});
test('Meta map actions require real consumed tests and cannot invent vehicle coordinates or test IDs',()=>{
  const task=createNetworkExploration(data,input,observationSnapshot(live),graph);
  assert.throws(()=>task.execute('present_exploration',proposal()),e=>e.code==='INVALID_PROPOSAL');
  task.execute('inspect_network',{focus:'route'});const a=task.execute('test_geographic_route',{scenario:'current'}),b=task.execute('test_geographic_route',{scenario:'close_midpoint'});
  assert.equal(a.feasible,true);assert.equal(b.feasible,false);
  const bad=proposal();bad.visual.testId='invented';assert.throws(()=>task.execute('present_exploration',bad),e=>e.code==='UNTESTED_OR_REJECTED_PLAN');
  task.execute('present_exploration',proposal());assert.equal(task.proposal.visual.testId,'T2');
  const observed=createNetworkExploration(data,{...input,question:'Which observations are old?'},observationSnapshot(live),graph);observed.execute('inspect_network',{focus:'observations'});
  const p=proposal([]);p.sourceIds=['CONDITIONS','RENFE'];p.visual={kind:'vehicle',testId:'',vehicleKey:'invented'};assert.throws(()=>observed.execute('present_exploration',p),e=>e.code==='INVALID_EVIDENCE');
  p.visual.vehicleKey='commuter:123';observed.execute('present_exploration',p);assert.equal(observed.observations.candidates[0].lon,-3.69);
});
test('an alert cannot precede its graph evidence, refer to the baseline or acquire operational delivery',()=>{
  const task=createNetworkExploration(data,input,observationSnapshot(live),graph),copy={title:'Review the closure',message:'This hypothetical closure disconnects the geographic path.',nextAction:'Verify current conditions with an operator.'};
  const alert={testId:'T2',en:copy,es:{title:'Revisar el cierre',message:'Este cierre hipotético desconecta el recorrido geográfico.',nextAction:'Verificar las condiciones actuales con un operador.'}};
  assert.throws(()=>task.execute('draft_scenario_alert',alert),e=>e.code==='INVALID_PROPOSAL');
  task.execute('inspect_network',{focus:'route'});task.execute('test_geographic_routes',{scenarios:['current','close_midpoint']});
  assert.throws(()=>task.execute('draft_scenario_alert',{...alert,testId:'T1'}),e=>e.code==='UNTESTED_OR_REJECTED_PLAN');
  assert.throws(()=>task.execute('draft_scenario_alert',{...alert,operationalDelivery:true}),e=>e.code==='INVALID_PROPOSAL');
  const r=task.execute('draft_scenario_alert',alert);assert.equal(r.alert.operationalDelivery,false);assert.equal(r.alert.scope,'hypothetical_scenario_only');assert.equal(r.alert.trigger,'NO_GEOGRAPHIC_PATH');
  assert.throws(()=>task.execute('draft_scenario_alert',alert),e=>e.code==='INVALID_PROPOSAL');
});
test('the interactive adapter consumes actual tool outputs before a bounded map proposal and reserves every request',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'switch-explore-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'ledger.json');await writeFile(file,JSON.stringify({version:1,capMicros:1000000,reservedMicros:0,requests:0}));
  const env={BASETEN_API_KEY:'test-key',SWITCH_AGENT_ALLOW_CREDIT_USAGE:'1',SWITCH_AGENT_CREDIT_BUDGET_USD:'1',SWITCH_AGENT_CREDIT_LEDGER_FILE:file};let round=0;
  const fetcher=async(url,options)=>{round++;assert.equal(url,'https://inference.baseten.co/v1/chat/completions');assert.equal(JSON.parse(await readFile(file)).requests,round);const b=JSON.parse(options.body),name=b.tools[0].function.name;
    const call=(name,args,i)=>({id:'c'+round+'-'+i,type:'function',function:{name,arguments:JSON.stringify(args)}});let calls;
    if(round===1){assert.equal(name,'inspect_network');calls=[call(name,{focus:'route'},1)];}
    else if(round===2){assert.equal(name,'test_geographic_routes');assert.ok(b.messages.some(m=>m.role==='tool'&&JSON.parse(m.content).conditions));calls=[call(name,{scenarios:['current','close_midpoint']},1)];}
    else if(round===3){assert.equal(name,'draft_scenario_alert');calls=[call(name,{testId:'T2',en:{title:'Review the hypothesis',message:'The hypothetical closure disconnects the graph.',nextAction:'Check source conditions before any real decision.'},es:{title:'Revisar la hipótesis',message:'El cierre hipotético desconecta el grafo.',nextAction:'Comprobar las fuentes antes de decidir.'}},1)];}
    else{assert.equal(name,'present_exploration');const results=b.messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));assert.ok(results.some(r=>r.tests?.some(t=>t.code==='NO_GEOGRAPHIC_PATH')));calls=[call(name,proposal(),1)];}
    return new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{tool_calls:calls}}],usage:{prompt_tokens:100,completion_tokens:100}}));};
  const r=await exploreNetwork(data,input,{env,fetch:fetcher,graph,live});assert.equal(round,4);assert.equal(r.trace.length,4);assert.equal(r.alerts[0].operationalDelivery,false);assert.equal(r.kind,'real_meta_network_exploration');assert.equal(r.tests[1].route.feasible,false);assert.equal(r.rawTransportSaved,false);
});
test('observation questions remain usable when the chosen gauge has no route and cite the actual feed',()=>{
  const task=createNetworkExploration(data,{...input,gauge:'1668',intent:'observations',question:'Which observations need checking?'},observationSnapshot(live),graph);
  assert.deepEqual(task.tools[0].function.parameters.properties.focus.enum,['observations']);
  assert.throws(()=>task.execute('inspect_network',{focus:'route'}),e=>e.code==='INVALID_TOOL_ARGUMENTS');
  task.execute('inspect_network',{focus:'observations'});const p=proposal([]);p.sourceIds=['IGN','RENFE'];p.visual={kind:'vehicle',vehicleKey:'commuter:123',testId:''};
  task.execute('present_exploration',p);assert.equal(task.proposal.sourceIds.includes('RENFE'),true);assert.equal(task.tests.length,0);
});
test('page loads, live updates, local actions and progress reads never invoke Meta; exploration needs an explicit trigger',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'switch-idle-'));let modelCalls=0,liveCalls=0;
  const server=await startServer({port:0,dataDir:dir,env:{},liveRail:async()=>{liveCalls++;return live;},exploreNetwork:async()=>{modelCalls++;throw Error('must not run');}});
  t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});const origin='http://127.0.0.1:'+server.address().port;
  for(const path of ['/','/api/network/config','/api/network/live','/api/network/live','/api/network/exploration','/api/state'])assert.equal((await fetch(origin+path)).status,200);
  const state=await(await fetch(origin+'/api/state')).json();assert.equal((await fetch(origin+'/api/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({revision:state.session.revision,action:'incident'})})).status,200);
  const r=await fetch(origin+'/api/network/explore',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(r.status,400);assert.equal((await r.json()).error,'EXPLICIT_REQUEST_REQUIRED');assert.equal(modelCalls,0);assert.equal(liveCalls,2);
});
test('cancelling an interactive request rejects a late result and preserves the fictional session',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'switch-explore-cancel-'));let entered;const ready=new Promise(r=>entered=r);
  const server=await startServer({port:0,dataDir:dir,env:{},liveRail:async()=>live,exploreNetwork:async(data,input,options)=>{entered();await new Promise(r=>options.signal.addEventListener('abort',r,{once:true}));return {id:'late-proposal'};}});
  t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});const origin='http://127.0.0.1:'+server.address().port,headers={Origin:origin,'Content-Type':'application/json'};
  const before=await(await fetch(origin+'/api/state')).json();const pending=fetch(origin+'/api/network/explore',{method:'POST',headers,body:JSON.stringify({...input,trigger:'user_request'})});await ready;
  assert.equal((await(await fetch(origin+'/api/network/cancel',{method:'POST',headers,body:'{}'})).json()).cancelled,true);
  const response=await pending;assert.equal(response.status,502);assert.equal((await response.json()).error,'ABORTED_OR_TIMEOUT');
  const after=await(await fetch(origin+'/api/state')).json();assert.deepEqual(after.session,before.session);
});

test('the selected published train cannot be lost behind the oldest twelve candidates or replaced by another preview',()=>{
 const vehicles=Array.from({length:20},(_,i)=>({...live.vehicles[0],key:'commuter:'+i,label:'Train '+i,feedStatus:i===19?'fresh':'stale'})),snapshot=observationSnapshot({...live,vehicles},'commuter:19');
 assert.equal(snapshot.candidates.length,1);assert.equal(snapshot.candidates[0].key,'commuter:19');assert.equal(snapshot.selectedVehicleKey,'commuter:19');assert.deepEqual(snapshot.candidates[0].observedAt,vehicles[19].observedAt);
 assert.throws(()=>observationSnapshot({...live,vehicles},'missing'),e=>e.code==='OBSERVATION_UNAVAILABLE');
 const task=createNetworkExploration(data,{...input,intent:'observations'},snapshot,graph);task.execute('inspect_network',{focus:'observations'});
 assert.deepEqual(task.tools[0].function.parameters.properties.visual.properties.vehicleKey.enum,['commuter:19']);
 const p=proposal([]);p.sourceIds=['IGN','RENFE'];p.visual={kind:'vehicle',testId:'',vehicleKey:'commuter:0'};
 assert.throws(()=>task.execute('present_exploration',p),e=>e.code==='INVALID_EVIDENCE');p.visual.vehicleKey='commuter:19';task.execute('present_exploration',p);assert.equal(task.proposal.visual.vehicleKey,'commuter:19');
});
