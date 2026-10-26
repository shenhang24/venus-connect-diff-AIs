const TOUR_SURFACE_GAP = .02;
const length=a=>Math.hypot(...a);
const minus=(a,b)=>a.map((x,k)=>x-b[k]);
// Hermite endpoints preserve position and first derivative at channel joins.
export function transferHermite(a,va,b,vb,t,duration){
  const h00=2*t*t*t-3*t*t+1,h10=t*t*t-2*t*t+t,h01=-2*t*t*t+3*t*t,h11=t*t*t-t*t;
  return a.map((x,k)=>h00*x+h10*duration*va[k]+h01*b[k]+h11*duration*vb[k]);
}
export function createExteriorTransfer({start,velocity,center,frame,radius,angle=0,duration=240}){
  const offset=minus(start,center),phase=Math.atan2(offset.reduce((s,x,k)=>s+x*frame.v[k],0),offset.reduce((s,x,k)=>s+x*frame.u[k],0));
  return {start:[...start],velocity:[...velocity],center:[...center],frame,radius,phase,angle,duration,lapDuration:600,elapsed:0};
}
export function exteriorTransferPoint(route,elapsed,destination,destinationVelocity){
  const {center,frame,radius,phase,duration,lapDuration}=route,omega=Math.PI*2/lapDuration;
  const circle=a=>{const c=Math.cos(a),s=Math.sin(a);return center.map((x,k)=>x+radius*(frame.u[k]*c+frame.v[k]*s));};
  const tangent=a=>{const c=Math.cos(a),s=Math.sin(a);return frame.u.map((x,k)=>radius*omega*(-x*s+frame.v[k]*c));};
  if(elapsed<=duration){
    // The entrance curve is static for the entire transit. Cache its cubic
    // coefficients instead of rebuilding endpoint vectors for every query.
    if(!route.entryPolynomial){const end=circle(phase),velocity=tangent(phase);route.entryPolynomial=route.start.map((x,k)=>[2*x+duration*route.velocity[k]-2*end[k]+duration*velocity[k],-3*x-2*duration*route.velocity[k]+3*end[k]-duration*velocity[k],duration*route.velocity[k],x]);}
    const t=elapsed/duration;return route.entryPolynomial.map(p=>((p[0]*t+p[1])*t+p[2])*t+p[3]);
  }
  if(elapsed<=duration+lapDuration)return circle(phase+omega*(elapsed-duration));
  const local=Math.min(duration,elapsed-duration-lapDuration),remaining=duration-local;
  // Predict the moving docking endpoint, rather than chasing its old position.
  const predicted=destination.map((x,k)=>x+destinationVelocity[k]*remaining);
  return transferHermite(circle(phase+Math.PI*2),tangent(phase+Math.PI*2),predicted,destinationVelocity,local/duration,duration);
}
// Cruise is measured in world units per second, never radians or radius-scaled steps.
export const TRANSFER_LINEAR_SPEED=6;
export function advanceTransferDistance(route,start,deltaSeconds,sample,{speed=TRANSFER_LINEAR_SPEED,blendEntry=true}={}){
  const dt=Math.max(0,Number.isFinite(deltaSeconds)?deltaSeconds:0);
  route.motionSeconds||=0;
  const t=Math.min(1,(route.motionSeconds+dt*.5)/.5),ease=t*t*(3-2*t);
  route.sourceStepSeconds||=dt||1/30;
  const incoming=blendEntry?length(route.velocity)/route.sourceStepSeconds:speed;
  const currentSpeed=blendEntry?incoming+(speed-incoming)*ease:speed;
  route.motionSeconds+=dt;
  const total=2*route.duration+route.lapDuration;
  let budget=Math.max(0,currentSpeed*dt),elapsed=route.elapsed,position=[...start],travelled=0;
  // Small distance slices preserve curvature while spending the same time budget.
  const slices=Math.max(1,Math.ceil(dt*120)),slice=budget/slices;
  for(let i=0;i<slices;i++){
    let remaining=slice;
    for(let join=0;join<4&&remaining>1e-10&&elapsed<total-1e-10;join++){
      const knots=[route.duration,route.duration+route.lapDuration,total],end=knots.find(k=>k>elapsed+1e-9)||total;
      const baseline=sample(elapsed),drift=length(minus(baseline,position));
      if(drift>remaining+1e-9){
        position=position.map((x,k)=>x+(baseline[k]-x)*remaining/drift);travelled+=remaining;remaining=0;break;
      }
      let lo=elapsed,hi=Math.min(end,elapsed+1),q=sample(hi),distance=length(minus(q,position));
      while(distance<remaining&&hi<end){hi=Math.min(end,elapsed+(hi-elapsed)*2);q=sample(hi);distance=length(minus(q,position));}
      if(distance<=remaining+1e-10){position=q;elapsed=hi;travelled+=distance;remaining=Math.max(0,remaining-distance);continue;}
      // Distance slices are short and smooth: a bracketed secant normally
      // resolves them in a few samples. Retain bisection as a safe fallback.
      let lowDistance=drift,highDistance=distance,parameter=(lo+hi)/2,resolved=false;
      for(let iteration=0;iteration<12;iteration++){
        const fraction=(remaining-lowDistance)/(highDistance-lowDistance);parameter=lo+(hi-lo)*fraction;if(!(parameter>lo&&parameter<hi))parameter=(lo+hi)/2;
        q=sample(parameter);const d=length(minus(q,position));if(Math.abs(d-remaining)<=1e-9){resolved=true;break;}if(d<remaining){lo=parameter;lowDistance=d;}else{hi=parameter;highDistance=d;}
      }
      if(!resolved){for(let iteration=0;iteration<30;iteration++){parameter=(lo+hi)/2;q=sample(parameter);const d=length(minus(q,position));if(d<remaining)lo=parameter;else hi=parameter;}parameter=(lo+hi)/2;q=sample(parameter);}
      travelled+=length(minus(q,position));position=q;elapsed=parameter;remaining=0;
    }
  }
  route.distanceTravelled=(route.distanceTravelled||0)+travelled;
  return {position,elapsed,travelled,speed:currentSpeed,complete:elapsed>=total-1e-8};
}
function beginExteriorTransfer(layout,g,start,velocity){
  layout.exteriorLaneRanks||=new Map();if(!layout.exteriorLaneRanks.has(g.id))layout.exteriorLaneRanks.set(g.id,layout.exteriorLaneRanks.size);
  const center=layout.positions[layout.coreId]||layout.center||[0,0,0],moving=new Set(layout.sharedOrbits.flatMap(group=>group.memberIndices));
  let bound=0;for(let i=0;i<layout.nodes.length;i++)if(!moving.has(i))bound=Math.max(bound,length(minus(layout.positions[layout.nodes[i].id],center))+layout.systemExtents[i]);
  // Bounds are read only: animation channels never become satellite reach or packing envelopes.
  const extent=Math.max(...layout.sharedOrbits.map(group=>layout.systemExtents[group.index])),lane=layout.exteriorLaneRanks.get(g.id);
  const radius=bound+(lane+1)*(2*extent+TOUR_SURFACE_GAP)+extent;
  const scale=layout.motionStepScale||1,route=createExteriorTransfer({start,velocity:velocity.map(x=>x/scale),center,frame:g.visits[0].frame,radius,angle:g.tour.angle});
  route.sourceStepSeconds=(1/30)/Math.max(layout.timeScale||1,1e-9);return route;
}
// The entire moving subtree must remain inside its owner's orbital territory.
// A transfer is allowed only when that territory also contains the route.
export function insideSatelliteTerritory(layout,group,position){
  let child=group.id,owner=layout.orbits[child]?.host;
  let reach=layout.systemExtents[group.index];
  while(owner){
    const outer=layout.orbits[owner];
    if(outer){
      const center=layout.positions[owner],primary=layout.positions[outer.host];
      if(center&&primary&&length(minus(position,center))+reach>length(minus(center,primary))-1e-7)return false;
    }
    child=owner;owner=outer?.host;
  }
  return true;
}
const point=(layout,visit,angle)=>layout.positions[visit.host].map((x,k)=>x+visit.radius*(visit.frame.u[k]*Math.cos(visit.phase+angle)+visit.frame.v[k]*Math.sin(visit.phase+angle)));

export function configureSharedTours(layout,frameOf,slotOf){
  layout.sharedTours||=new Map();
  const groups=layout.sharedOrbits,byHost=new Map();
  for(const group of groups){
    group.visits=[];
    for(const host of [...group.hosts].sort((a,b)=>layout.nodes[a].id.localeCompare(layout.nodes[b].id))){
      if(!byHost.has(host))byHost.set(host,[]);byHost.get(host).push(group);
    }
  }
  for(const [host,visitors]of byHost){
    layout.sharedVisitSlots||=new Map();if(!layout.sharedVisitSlots.has(layout.nodes[host].id))layout.sharedVisitSlots.set(layout.nodes[host].id,new Map());
    const ranks=layout.sharedVisitSlots.get(layout.nodes[host].id),used=new Set(visitors.filter(g=>ranks.has(g.id)).map(g=>ranks.get(g.id)));
    for(const g of [...visitors].sort((a,b)=>a.id.localeCompare(b.id)))if(!ranks.has(g.id)){let rank=0;while(used.has(rank))rank++;ranks.set(g.id,rank);used.add(rank);}
    visitors.sort((a,b)=>ranks.get(a.id)-ranks.get(b.id));
    const base=layout.systemExtents[host],maxExtent=Math.max(...visitors.map(g=>layout.systemExtents[g.index])),size=Math.max(layout.subtreeMaxRadius[host],...visitors.map(g=>layout.subtreeMaxRadius[g.index]));
    let previous=base+maxExtent+TOUR_SURFACE_GAP;
    let lastShell=-1,lastRadius=previous;
    for(const visitor of visitors){
      const {row:shell,slot,capacity:slots,page}=slotOf(ranks.get(visitor.id),layout.nodes[host].kind);
      if(lastShell!==-1&&shell!==lastShell)previous=lastRadius+2*maxExtent+TOUR_SURFACE_GAP;
      // The straight segment between animation frames cuts slightly inside a
      // circle; reserve that chord sagitta without restoring a large gap.
      const radius=Math.max(previous,5*layout.collisionRadii[host]+maxExtent+TOUR_SURFACE_GAP,(slots>1?(2*maxExtent+TOUR_SURFACE_GAP)/(2*Math.sin(Math.PI/slots)):0))*1.001;
      const basePlane=layout.membershipPlaneKeys.get(visitor.id)||layout.nodes[host].id+':visits';
      visitor.visits.push({host:layout.nodes[host].id,radius,globalRow:shell,capacity:slots,phase:slot*Math.PI*2/slots,frame:frameOf(page?basePlane+':capacity-plane:'+page:basePlane)});
      lastShell=shell;lastRadius=radius;
      layout.systemExtents[host]=Math.max(layout.systemExtents[host],radius+maxExtent);
    }
    layout.subtreeMaxRadius[host]=size;
  }
  // Resolve each node's nearest shared ancestor once; preserve node order.
  const sharedMembers=new Map(groups.map(g=>[g.id,[]])),sharedRoots=new Map();
  const sharedRoot=start=>{let id=start,path=[];while(layout.orbits[id]&&!layout.sharedOrbitIds.has(id)&&!sharedRoots.has(id)){path.push(id);id=layout.orbits[id].host;}const root=sharedRoots.get(id)??id;for(const child of path)sharedRoots.set(child,root);return root;};
  layout.nodes.forEach((n,i)=>sharedMembers.get(sharedRoot(n.id))?.push(i));
  for(const group of groups){
    group.visits.sort((a,b)=>a.host.localeCompare(b.host));
    const key=group.visits.map(v=>v.host).join('|');
    let state=layout.sharedTours.get(group.id);
    if(!state||state.key!==key){state={key,index:group.visits.findIndex(v=>v.host===layout.orbits[group.id].host),angle:0,progress:0,stage:'idle',completed:[],world:null,lastStarted:0,roundVisits:0};layout.sharedTours.set(group.id,state);}
    group.tour=state;group.arc=frameOf('transfer:'+group.id).normal;
    group.memberIndices=sharedMembers.get(group.id);
  }
  for(const id of layout.sharedTours.keys())if(!layout.sharedOrbitIds.has(id))layout.sharedTours.delete(id);
}

// Spatial occupancy is a display geometry check, not a physical force.
class Occupancy{
  constructor(entries){this.entries=new Map();this.cells=new Map();this.cell=32;this.maximum=0;for(const entry of entries)this.add(entry);}
  key(p){return p.map(x=>Math.floor(x/this.cell)).join(',');}
  add(entry){this.entries.set(entry.id,entry);this.maximum=Math.max(this.maximum,entry.radius+TOUR_SURFACE_GAP);const key=this.key(entry.position);entry.cell=key;if(!this.cells.has(key))this.cells.set(key,new Set());this.cells.get(key).add(entry.id);}
  remove(id){const e=this.entries.get(id);if(e){this.cells.get(e.cell)?.delete(id);this.entries.delete(id);}}
  near(position,reach){
    const r=reach+this.maximum,lo=position.map(x=>Math.floor((x-r)/this.cell)),hi=position.map(x=>Math.floor((x+r)/this.cell));
    if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>this.entries.size)return this.entries.values();
    const result=[];for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++)for(const id of this.cells.get([x,y,z].join(','))||[])result.push(this.entries.get(id));return result;
  }
  blocked(start,end,radius,size){
    const delta=minus(end,start),d2=delta.reduce((s,x)=>s+x*x,0),middle=start.map((x,k)=>(x+end[k])/2);
    for(const e of this.near(middle,radius+TOUR_SURFACE_GAP+Math.sqrt(d2)/2)){
      const t=d2?Math.max(0,Math.min(1,e.position.reduce((s,x,k)=>s+(x-start[k])*delta[k],0)/d2)):0;
      if(length(e.position.map((x,k)=>x-start[k]-delta[k]*t))<radius+e.radius+TOUR_SURFACE_GAP+(e.margin||0)-1e-7)return true;
    }
    return false;
  }
  recover(position,radius,size){
    const p=[...position];
    for(let pass=0;pass<32;pass++){
      let changed=false;
      for(const e of this.near(p,radius+TOUR_SURFACE_GAP)){
        const d=minus(p,e.position),distance=length(d),minimum=radius+e.radius+TOUR_SURFACE_GAP+(e.margin||0)+1e-5;
        if(distance<minimum){const direction=distance>1e-8?d.map(x=>x/distance):[0,1,0];for(let k=0;k<3;k++)p[k]+=direction[k]*(minimum-distance);changed=true;}
      }
      if(!changed)break;
    }
    return p;
  }
}

export function advanceSharedTours(layout,deltaSeconds=1/30){
  const dt=Math.max(0,Number.isFinite(deltaSeconds)?deltaSeconds:0);
  const stepScale=layout.motionStepScale||1;
  // Per-frame choreography exemption, never a persistent collision setting.
  layout.transferPassThroughIds=new Set();
  const groups=layout.activeSharedOrbits||layout.sharedOrbits;
  if(!groups.length)return;
  let active=groups.filter(g=>g.tour.stage!=='idle').length;
  for(const g of [...groups].filter(g=>g.tour.stage==='idle').sort((a,b)=>a.tour.lastStarted-b.tour.lastStarted||a.id.localeCompare(b.id))){
    if(active>=12)break;const s=g.tour;s.stage='approach';s.index=Math.max(0,g.visits.findIndex(v=>v.host===layout.orbits[g.id].host));s.orbitStartAngle=s.angle;s.progress=0;s.roundVisits=0;s.lastStarted=layout.tourDispatchCounter=(layout.tourDispatchCounter||0)+1;active++;
  }
  const moving=new Set(groups.flatMap(g=>g.memberIndices)),entries=[];
  for(const i of layout.activeIndices||layout.nodes.map((_,i)=>i))if(!moving.has(i)){
    const id=layout.nodes[i].id,p=layout.positions[id];
    entries.push({id,position:p,radius:layout.collisionRadii[i],size:layout.collisionRadii[i],margin:0});
  }
  for(const g of groups){const s=g.tour,host=layout.positions[g.visits[s.index].host];if(s.world&&s.stage!=='transfer'&&s.hostPosition)s.world=s.world.map((x,k)=>x+host[k]-s.hostPosition[k]);s.hostPosition=[...host];if(s.stage!=='transfer')entries.push({id:g.id,position:s.world||layout.positions[g.id],radius:layout.systemExtents[g.index],size:layout.subtreeMaxRadius[g.index]});}
  const occupancy=new Occupancy(entries);
  for(const g of [...groups].sort((a,b)=>a.id.localeCompare(b.id))){
    const s=g.tour,visit=g.visits[s.index],radius=layout.systemExtents[g.index],size=layout.subtreeMaxRadius[g.index],original=[...layout.positions[g.id]];
    if(s.stage==='idle')continue;
    const transferring=s.stage==='transfer';
    if(transferring){s.detourDirection=null;s.clearFrames=0;for(const i of g.memberIndices)layout.transferPassThroughIds.add(layout.nodes[i].id);}
    let start=s.world||original,goal,nextAngle=s.angle,nextProgress=s.progress;
    if(s.stage!=='transfer'&&!insideSatelliteTerritory(layout,g,start)){start=original;s.world=null;s.stage='approach';s.progress=0;}
    occupancy.remove(g.id);
    if(s.stage!=='transfer'&&occupancy.blocked(start,start,radius,size)){const recovered=occupancy.recover(start,radius,size);if(insideSatelliteTerritory(layout,g,recovered))start=recovered;}
    if(s.stage==='orbit'){
      let rate=.012;
      if(s.orbitJoin){const t=Math.min(1,(s.orbitJoin.elapsed+dt)/.5),ease=t*t*(3-2*t);rate=s.orbitJoin.rate+(.012-s.orbitJoin.rate)*ease;s.orbitJoin.elapsed+=dt;if(t===1)s.orbitJoin=null;}
      nextAngle=s.angle+rate*stepScale;goal=point(layout,visit,nextAngle);
    }
    else if(s.stage==='transfer'){
      s.exterior||=beginExteriorTransfer(layout,g,start,s.worldVelocity||layout.velocities[g.id]||[0,0,0]);
      const route=s.exterior,destination=g.visits[(s.index+1)%g.visits.length],total=2*route.duration+route.lapDuration;
      const sample=parameter=>{
        if(parameter<=route.duration+route.lapDuration)return exteriorTransferPoint(route,parameter,null,null);
        const angle=route.angle+parameter*.012,a=destination.phase+angle,b=point(layout,destination,angle);
        const velocity=destination.frame.u.map((x,k)=>(layout.velocities[destination.host]?.[k]||0)+destination.radius*.012*(-x*Math.sin(a)+destination.frame.v[k]*Math.cos(a)));
        return exteriorTransferPoint(route,parameter,b,velocity);
      };
      const movement=advanceTransferDistance(route,start,dt,sample);
      nextProgress=movement.elapsed;nextAngle=route.angle+nextProgress*.012;goal=movement.position;
    }else goal=s.stage==='home'?original:point(layout,visit,s.angle);
    const nextVisit=g.visits[(s.index+1)%g.visits.length],hostMotion=Math.max(length(layout.velocities[visit.host]||[0,0,0]),length(layout.velocities[nextVisit.host]||[0,0,0]));
    const delta=minus(goal,start),distance=length(delta),maxStep=s.stage==='transfer'&&s.exterior?Infinity:Math.max(size*.2*stepScale+hostMotion*2+visit.radius*.018*stepScale,distance*(1-Math.pow(.875,stepScale)),.01*stepScale);
    const within=p=>s.stage==='transfer'||length(minus(p,layout.center||[0,0,0]))<=layout.tourWorldBound&&insideSatelliteTerritory(layout,g,p)&&(!['orbit','approach'].includes(s.stage)||length(minus(p,layout.positions[visit.host]))>=layout.orbitalClearance(g.index,layout.nodeIndices.get(visit.host))-1e-7);
    const angleAt=p=>{const d=minus(p,layout.positions[visit.host]);return Math.atan2(d.reduce((sum,x,k)=>sum+x*visit.frame.v[k],0),d.reduce((sum,x,k)=>sum+x*visit.frame.u[k],0));};
    const startAngle=angleAt(s.lastRenderedWorld&&s.lastRenderedHost===visit.host&&s.lastRenderedHostPosition?s.lastRenderedWorld.map((x,k)=>x+layout.positions[visit.host][k]-s.lastRenderedHostPosition[k]):start);
    const forward=p=>s.stage!=='orbit'||Math.atan2(Math.sin(angleAt(p)-startAngle),Math.cos(angleAt(p)-startAngle))>=-1e-7;
    const clear=p=>transferring||(within(p)&&forward(p)&&!occupancy.blocked(start,p,radius,size));
    let candidate=start.map((x,k)=>x+delta[k]*Math.min(1,maxStep/(distance||1))),accepted=clear(candidate);const goalClear=accepted;
    if(!transferring&&s.detourDirection&&accepted){s.clearFrames=(s.clearFrames||0)+1;if(s.clearFrames<3)accepted=false;else{s.detourDirection=null;s.clearFrames=0;}}
    if(!accepted){
      if(!goalClear)s.clearFrames=0;
      const tangent=visit.frame.u.map((x,k)=>-x*Math.sin(startAngle)+visit.frame.v[k]*Math.cos(startAngle)),radial=visit.frame.u.map((x,k)=>x*Math.cos(startAngle)+visit.frame.v[k]*Math.sin(startAngle));
      const directions=[...(s.detourDirection?[s.detourDirection]:[]),tangent,tangent.map((x,k)=>x+radial[k]*.6),tangent.map((x,k)=>x+visit.frame.normal[k]*.6),tangent.map((x,k)=>x-visit.frame.normal[k]*.6),g.arc,g.arc.map(x=>-x)];
      for(const direction of directions){const l=length(direction)||1,unit=direction.map(x=>x/l),trial=start.map((x,k)=>x+unit[k]*maxStep);if(clear(trial)){candidate=trial;accepted=true;s.detourDirection=unit;break;}}
    }
    if(!accepted)candidate=start;
    s.blocked=!accepted;s.world=candidate;s.worldVelocity=minus(candidate,start);s.lastRenderedWorld=[...candidate];s.lastRenderedHost=visit.host;s.lastRenderedHostPosition=[...layout.positions[visit.host]];
    const wasOrbit=s.stage==='orbit';
    if(wasOrbit&&accepted){const progress=Math.max(0,Math.atan2(Math.sin(angleAt(candidate)-startAngle),Math.cos(angleAt(candidate)-startAngle)));s.angle+=progress;if(s.angle-(s.orbitStartAngle||0)>=Math.PI*2-1e-8){s.completed.push(visit.host);s.roundVisits++;s.completed=s.completed.slice(-g.visits.length*3);s.stage='transfer';s.exterior=beginExteriorTransfer(layout,g,candidate,s.worldVelocity);s.progress=0;for(const i of g.memberIndices)layout.transferPassThroughIds.add(layout.nodes[i].id);}}
    const arrived=length(minus(candidate,goal))<1e-5;
    if(arrived&&!wasOrbit){
      if(s.stage==='approach'){s.stage='orbit';s.orbitStartAngle=s.angle;}
      else if(s.stage==='home'){s.stage='idle';s.world=null;}
      else if(s.stage==='transfer'&&s.exterior){s.exterior.elapsed=nextProgress;s.angle=nextAngle;if(nextProgress>=2*s.exterior.duration+s.exterior.lapDuration){s.index=(s.index+1)%g.visits.length;s.stage='orbit';s.orbitStartAngle=s.angle;s.orbitJoin={rate:Math.min(.012,length(s.worldVelocity)/(g.visits[s.index].radius||1)/stepScale),elapsed:0};s.exterior=null;s.progress=0;s.hostPosition=[...layout.positions[g.visits[s.index].host]];}}
    }
    const shift=minus(candidate,original);
    for(const i of g.memberIndices){const id=layout.nodes[i].id;layout.positions[id]=layout.positions[id].map((x,k)=>x+shift[k]);}
    if(!layout.transferPassThroughIds.has(g.id))occupancy.add({id:g.id,position:candidate,radius,size});
  }
}
