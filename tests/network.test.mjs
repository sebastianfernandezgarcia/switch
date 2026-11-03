import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGeographicGraph, validateGeographicPath } from '../public/network-core.mjs';
import { prepareNetworkReview, reviewNetwork, verifyNetworkRecordings } from '../src/network-review.mjs';
import { startServer } from '../src/server.mjs';
const data=JSON.parse(await readFile(new URL('../public/data/rail-network.json',import.meta.url)));
const graph=createGeographicGraph(data), fromId=data.stations.find(s=>s.code==='60000').id,toId=data.stations.find(s=>s.code==='51003').id;
const input={fromId,toId,gauge:'1435',blocked:[]};
test('real IGN geometry connects Atocha and Sevilla; returned path is contiguous and gauge-compatible',()=>{
  const result=graph.route(input);assert.equal(result.feasible,true);assert.ok(result.distanceKm>460&&result.distanceKm<490);assert.ok(result.path.length>100);
  assert.ok(validateGeographicPath(graph,result));
  assert.ok(result.matchedEndpoints.start.offsetKm<.05&&result.matchedEndpoints.end.offsetKm<.05);
  const altered=structuredClone(result);altered.path[0].reversed=!altered.path[0].reversed;assert.equal(validateGeographicPath(graph,altered),false);
});
test('a closure cannot change endpoint matching or invent a geographic detour; unknown stations and sections fail',()=>{
  const base=graph.route(input),id=base.edgeIds[Math.floor(base.edgeIds.length/2)];const closed=graph.route({...input,blocked:[id]});
  assert.equal(closed.feasible,false);assert.equal(closed.code,'NO_GEOGRAPHIC_PATH');assert.deepEqual(closed.matchedEndpoints,base.matchedEndpoints);
  assert.equal(graph.route({...input,blocked:['invented']}).code,'INVALID_CLOSURE');assert.equal(graph.route({...input,toId:'nonexistent'}).code,'SELECT_DISTINCT_STATIONS');
});
test('review evidence distinguishes actual cartography, hypothetical closure and independently calculated outcome',()=>{
  const base=graph.route(input),blocked=[base.edgeIds[Math.floor(base.edgeIds.length/2)]];const before=prepareNetworkReview(data,input,graph),after=prepareNetworkReview(data,{...input,blocked},graph);
  assert.notEqual(before.hash,after.hash);assert.equal(after.sources[2].afterClosures.feasible,false);assert.ok(after.sources[1].description.includes('not real incidents'));assert.ok(after.sources[0].description.includes('movement authority are not supplied'));
});
test('national JSON assets are actual JSON and the live endpoint remains public read-only with no credit usage',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'switch-network-http-'));const live={feeds:[],vehicles:[],attribution:'test'};
  const server=await startServer({port:0,dataDir:dir,env:{},liveRail:async()=>live});t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port;
  const json=await(await fetch(origin+'/data/rail-network.json')).json();assert.equal(json.edges.length,60018);assert.equal(json.type,undefined);assert.ok(Array.isArray(json.nodes));
  const context=await(await fetch(origin+'/data/incident-context.json')).json();assert.equal(context.incidents.length,2);assert.equal(context.fatalitiesTotal,115);
  const page=await fetch(origin+'/');const csp=page.headers.get('content-security-policy');assert.ok(csp.includes('frame-src https://www.rtve.es;'));assert.ok(csp.includes("connect-src 'self';"));assert.ok(csp.includes("script-src 'self';"));
  assert.deepEqual(await(await fetch(origin+'/api/network/live')).json(),live);
  assert.equal((await fetch(origin+'/api/network/review',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);
  const result=await fetch(origin+'/api/network/review',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(result.status,502);assert.equal((await result.json()).error,'PROVIDER_NOT_READY');
});
test('Meta geographic review reserves before one fixed-origin request, validates citations and preserves failure reservations',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'switch-network-credit-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'ledger.json');
  const {writeFile}=await import('node:fs/promises');await writeFile(file,JSON.stringify({version:1,capMicros:1000000,reservedMicros:0,requests:0}));
  const env={BASETEN_API_KEY:'fake-test-key',SWITCH_AGENT_ALLOW_CREDIT_USAGE:'1',SWITCH_AGENT_CREDIT_BUDGET_USD:'1',SWITCH_AGENT_CREDIT_LEDGER_FILE:file};let calls=0,invalid=false;
  const fetcher=async(url,request)=>{calls++;assert.equal(url,'https://inference.baseten.co/v1/chat/completions');assert.equal(request.headers.Authorization,'Bearer fake-test-key');const ledger=JSON.parse(await readFile(file));assert.equal(ledger.requests,calls);assert.ok(ledger.reservedMicros>0);
    const proposal={en:{summary:'The geometric path remains connected; operational status is unknown.',question:'What operating evidence is missing?'},es:{summary:'La ruta geográfica está conectada; se desconoce su estado operativo.',question:'¿Qué evidencia operativa falta?'},sourceIds:invalid?['invented']:['IGN','RESULTS']};
    return new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'submit_review',arguments:JSON.stringify(proposal)}}]}}],usage:{prompt_tokens:100,completion_tokens:100}}));};
  const result=await reviewNetwork(data,input,{env,fetch:fetcher,graph});assert.equal(result.kind,'real_meta_geographic_review');assert.equal(result.reasoningSaved,false);const before=JSON.parse(await readFile(file));invalid=true;
  await assert.rejects(reviewNetwork(data,input,{env,fetch:fetcher,graph}),e=>e.code==='INVALID_RESPONSE');const after=JSON.parse(await readFile(file));assert.equal(calls,2);assert.ok(after.reservedMicros>before.reservedMicros);
});

test('actual saved geographic reviews replay only for their unchanged conditions and geometry',async()=>{
  const d=JSON.parse(await readFile(new URL('../examples/recorded-network.json',import.meta.url)));const valid=verifyNetworkRecordings(data,d,graph);
  assert.equal(valid.length,4);assert.ok(valid.every(r=>r.geometryReplayVerified&&r.origin==='packaged_recording'));
  const corrupt=structuredClone(d);corrupt.records[0].sources[2].baseline.distanceKm=1;assert.throws(()=>verifyNetworkRecordings(data,corrupt,graph),/evidence mismatch/);
});
