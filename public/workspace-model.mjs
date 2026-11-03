// Presentation data only: intervals come unchanged from the existing engine.
export function occupancyModel(simulation,edgeIds=['R1','R2','R3','R4','R5']){
  if(!simulation?.feasible||!Number.isFinite(simulation.metrics?.duration)||simulation.metrics.duration<=0)return null;
  const duration=simulation.metrics.duration,rows=edgeIds.map(id=>({id,intervals:[]}));
  for(const leg of simulation.legs){const row=rows.find(r=>r.id===leg.edge);if(!row||!Number.isFinite(leg.start)||!Number.isFinite(leg.end)||leg.end<=leg.start||leg.end>duration)throw Error('INVALID_OCCUPANCY_SOURCE');
    const start=Math.max(0,leg.start);if(leg.end<=start)continue;row.intervals.push({train:leg.train,edge:leg.edge,start,end:leg.end,from:leg.from,to:leg.to,left:start/duration*100,width:(leg.end-start)/duration*100,assumed:leg.train==='T07'});
  }
  return {duration,rows};
}
