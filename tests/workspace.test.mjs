import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {simulate,scenarioCatalog} from '../src/domain.mjs';
import {occupancyModel} from '../public/workspace-model.mjs';
import {startServer} from '../src/server.mjs';
test('occupancy presentation uses actual reservation intervals and cannot mutate engine results',()=>{
 for(const scenario of scenarioCatalog())for(const strategy of ['wait','bypass','enter_now']){
  const simulation=simulate(strategy,{},scenario.id),before=structuredClone(simulation),model=occupancyModel(simulation);
  assert.deepEqual(simulation,before);
  if(!simulation.feasible){assert.equal(model,null);continue;}
  for(const row of model.rows)for(const interval of row.intervals){assert.ok(interval.left>=0&&interval.width>0&&interval.left+interval.width<=100.000001);assert.ok(simulation.legs.some(l=>l.train===interval.train&&l.edge===interval.edge&&Math.max(0,l.start)===interval.start&&l.end===interval.end));}
 }
 const model=occupancyModel(simulate('wait',{},'corridor-north-01'));
 assert.deepEqual(model.rows.find(r=>r.id==='R2').intervals.map(l=>[l.train,l.start,l.end]),[['T07',0,4],['T12',4,8],['T31',8,12]]);
});
test('home and workspace are independently served; visiting either cannot invoke Meta or change a rehearsal',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'switch-pages-'));let inference=0;
 const server=await startServer({port:0,dataDir:dir,env:{},analyse:async()=>{inference++;throw Error();},rehearse:async()=>{inference++;throw Error();},exploreNetwork:async()=>{inference++;throw Error();}});
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});const origin='http://127.0.0.1:'+server.address().port;
 const before=await(await fetch(origin+'/api/state')).json(),home=await(await fetch(origin+'/')).text(),workspace=await(await fetch(origin+'/simulator')).text();
 assert.ok(home.includes('/home.js'));assert.ok(!home.includes('src="/app.js"'));assert.ok(!home.includes('<section id="lab"'));assert.ok(workspace.includes('/app.js')&&workspace.includes('/workspace.js'));
 for(const html of [home,workspace]){const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);}
 for(const path of ['/api/showcase','/simulator/','/home.js','/shell.js','/site.css','/workspace.js','/workspace.css','/workspace-model.mjs','/assets/switch-product-preview.png'])assert.equal((await fetch(origin+path)).status,200,path);
 assert.equal(inference,0);const after=await(await fetch(origin+'/api/state')).json();assert.deepEqual(after.session,before.session);
});
