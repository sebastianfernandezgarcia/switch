const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** Present only the timestamp actually supplied. Feed time is never called GPS time. */
export function observationStatus(vehicle,nowSeconds=Date.now()/1000){
 const timestamp=Number(vehicle?.observedAt),dated=Number.isFinite(timestamp)&&timestamp>0;
 const ahead=dated&&timestamp>nowSeconds+60,age=dated&&!ahead?Math.max(0,Math.floor(nowSeconds-timestamp)):null;
 const old=['stale','cached','recorded','snapshot'].includes(vehicle?.feedStatus)||(age!==null&&age>90);
 return {ageSeconds:age,basis:vehicle?.timestampBasis==='vehicle'?'vehicle':'feed',kind:ahead?'clock_skew':!dated?'undated':old?'older':'recent'};
}
/** Filtering changes presentation only and never changes an observation or invents a train. */
export function trackingRows(vehicles,{query='',filter='all',sourceId='all',watched=[],nowSeconds=Date.now()/1000}={}){
 const pins=new Set(watched),search=normalize(query).trim();
 return vehicles.map(v=>({vehicle:v,status:observationStatus(v,nowSeconds),watched:pins.has(v.key)}))
 .filter(r=>sourceId==='all'||r.vehicle.sourceId===sourceId)
 .filter(r=>!search||normalize([r.vehicle.label,r.vehicle.key,r.vehicle.nextStopId,r.vehicle.sourceId].join(' ')).includes(search))
 .filter(r=>filter==='watched'?r.watched:filter==='older'?r.status.kind!=='recent':true)
 .sort((a,b)=>Number(b.watched)-Number(a.watched)||(a.status.ageSeconds??Infinity)-(b.status.ageSeconds??Infinity)||String(a.vehicle.key).localeCompare(String(b.vehicle.key)));
}

/** The trail consists only of received source points. No extrapolation or fabricated intermediate points. */
export function mergeObservationHistory(history,vehicles,{nowSeconds=Date.now()/1000,maxPoints=20}={}){
 const next=new Map();
 for(const v of vehicles){const previous=history.get(v.key)??[],point={lon:v.lon,lat:v.lat,observedAt:v.observedAt,basis:v.timestampBasis};const valid=Number.isFinite(point.lon)&&Number.isFinite(point.lat)&&Number.isFinite(point.observedAt)&&point.observedAt<=nowSeconds+60;let trail=previous.filter(p=>p.observedAt>=nowSeconds-900);const last=trail.at(-1);if(valid&&point.observedAt>=nowSeconds-900&&(!last||point.observedAt>last.observedAt))trail=[...trail,point];next.set(v.key,trail.slice(-maxPoints));}
 return next;
}

/** Prefer a recently observed train with received movement, not an animated guess. */
export function pickFollowCandidate(vehicles,history,{nowSeconds=Date.now()/1000}={}){
 const moved=v=>{const points=history.get(v.key)??[],a=points.at(-2),b=points.at(-1);return !!(a&&b&&(Math.abs(a.lon-b.lon)+Math.abs(a.lat-b.lat)>0.00002));};
 const score=v=>Number(moved(v))*4+Number(v.currentStatus==='IN_TRANSIT_TO')*2+Number(v.lat>39.8&&v.lat<41&&v.lon>-4.5&&v.lon<-2.8);
 return vehicles.filter(v=>v.timestampBasis==='vehicle'&&observationStatus(v,nowSeconds).kind==='recent').sort((a,b)=>score(b)-score(a)||(b.observedAt??0)-(a.observedAt??0)||a.key.localeCompare(b.key))[0]??null;
}
