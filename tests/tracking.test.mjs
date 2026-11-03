import test from 'node:test';
import assert from 'node:assert/strict';
import {observationStatus,trackingRows} from '../public/tracking-model.mjs';
test('a fresh feed timestamp is never presented as an individual GPS timestamp',()=>{
 assert.deepEqual(observationStatus({observedAt:990,feedStatus:'fresh',timestampBasis:'feed'},1000),{ageSeconds:10,basis:'feed',kind:'recent'});
 assert.equal(observationStatus({observedAt:700,feedStatus:'fresh',timestampBasis:'vehicle'},1000).kind,'older');
 assert.equal(observationStatus({observedAt:0,feedStatus:'fresh'},1000).kind,'undated');
 assert.equal(observationStatus({observedAt:1100,feedStatus:'fresh'},1000).kind,'clock_skew');
});
test('train filtering preserves observation coordinates, timestamps and missing watched trains',()=>{
 const vehicles=[{key:'a',label:'AVE 501',nextStopId:'Toledo',observedAt:990,feedStatus:'fresh',timestampBasis:'vehicle',lat:39,lon:-3},{key:'b',label:'Alvia 602',nextStopId:'Cordoba',observedAt:700,feedStatus:'fresh',timestampBasis:'vehicle',lat:38,lon:-4}],before=structuredClone(vehicles);
 assert.deepEqual(trackingRows(vehicles,{query:'córdoba',nowSeconds:1000}).map(r=>r.vehicle.key),['b']);
 assert.deepEqual(trackingRows(vehicles,{watched:['b','absent'],nowSeconds:1000}).map(r=>r.vehicle.key),['b','a']);
 assert.deepEqual(trackingRows(vehicles,{filter:'watched',watched:['absent'],nowSeconds:1000}),[]);
 assert.deepEqual(trackingRows(vehicles,{filter:'older',nowSeconds:1000}).map(r=>r.vehicle.key),['b']);
 assert.deepEqual(vehicles,before);
});

test('source selection and recent threshold cannot promote an old observation',()=>{
 const now=1000,vehicles=[{key:'a',label:'A',sourceId:'commuter',observedAt:910,feedStatus:'fresh',timestampBasis:'vehicle'},{key:'b',label:'B',sourceId:'long-distance',observedAt:909,feedStatus:'fresh',timestampBasis:'feed'}];
 assert.equal(observationStatus(vehicles[0],now).kind,'recent');assert.equal(observationStatus(vehicles[1],now).kind,'older');
 assert.deepEqual(trackingRows(vehicles,{sourceId:'commuter',nowSeconds:now}).map(r=>r.vehicle.key),['a']);
 assert.deepEqual(trackingRows(vehicles,{sourceId:'long-distance',filter:'older',nowSeconds:now}).map(r=>r.vehicle.key),['b']);
});

test('a trail contains only ordered, bounded received points and keeps its input immutable',async()=>{
 const {mergeObservationHistory}=await import('../public/tracking-model.mjs');
 const before=new Map([['a',[{lon:-3,lat:40,observedAt:900,basis:'vehicle'}]]]),saved=structuredClone(before);
 let result=mergeObservationHistory(before,[{key:'a',lon:-3.1,lat:40.1,observedAt:950,timestampBasis:'vehicle'}],{nowSeconds:1000});
 assert.deepEqual(before,saved);assert.equal(result.get('a').length,2);assert.equal(result.get('a')[1].lon,-3.1);
 result=mergeObservationHistory(result,[{key:'a',lon:-5,lat:42,observedAt:950,timestampBasis:'vehicle'}],{nowSeconds:1000});assert.equal(result.get('a').length,2);assert.equal(result.get('a')[1].lon,-3.1);
 result=mergeObservationHistory(result,[{key:'a',lon:-4,lat:41,observedAt:990,timestampBasis:'vehicle'}],{nowSeconds:1000,maxPoints:2});assert.deepEqual(result.get('a').map(p=>p.observedAt),[950,990]);
 assert.equal(mergeObservationHistory(result,[],{nowSeconds:1000}).size,0);
 assert.equal(mergeObservationHistory(result,[{key:'a',lon:-8,lat:45,observedAt:1200}],{nowSeconds:1000}).get('a').length,2);
});

test('one-click follow prefers source-observed movement and never picks a stale or feed-only point',async()=>{
 const {pickFollowCandidate}=await import('../public/tracking-model.mjs');const history=new Map([['moving',[{lat:40,lon:-3,observedAt:950},{lat:40.01,lon:-3,observedAt:980}]]]);
 const common={lat:40,lon:-3,timestampBasis:'vehicle',feedStatus:'fresh',observedAt:990};const vehicles=[{...common,key:'station',currentStatus:'STOPPED_AT'},{...common,key:'moving',currentStatus:'IN_TRANSIT_TO'},{...common,key:'old',observedAt:800},{...common,key:'feed',timestampBasis:'feed'}];
 const before=structuredClone(vehicles);assert.equal(pickFollowCandidate(vehicles,history,{nowSeconds:1000}).key,'moving');assert.deepEqual(vehicles,before);assert.equal(pickFollowCandidate([vehicles[2],vehicles[3]],history,{nowSeconds:1000}),null);
});
