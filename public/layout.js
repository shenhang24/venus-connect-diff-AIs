import {RadialEnvelopeIndex} from './radial-envelope-index.js';
// Geometry is inferred only from recorded relations and their shared neighbours.
import {configureSharedTours,advanceSharedTours} from './shared-tours.js';
import {resolveBodyAvoidance} from './body-avoidance.js';
// Relation types and their independent evidence are never merged in storage.
export const BASE_ANIMATION_SPEED = 2;
export const SPIN_SPEED_MULTIPLIER = 0;
// Applied to the original group spacing formula, never to saved positions.
export const GROUP_DISTANCE_SCALE = .25;
export const LOCAL_ORBIT_DISTANCE_SCALE = .25;
export const SURFACE_GAP = .02;
export const LOCAL_ROW_REACH_MULTIPLIER = 1.15;
export function nodeRadiusFactor(main,count,growth=.01){
  const grown=1+Math.max(0,count||0)*growth;
  return main?Math.min(Math.cbrt(10),1.4*grown):grown;
}
// AU semi-major axes; logarithmic display compression keeps outer orbits readable.
export const SOLAR_ORBIT_AU = [.387,.723,1,1.524,5.203,9.537,19.191,30.069];
const phaseOf = (id) => {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
};

export function orbitalFrame(id){
  const azimuth=phaseOf('azimuth:'+id),inclination=.3+.9*phaseOf('inclination:'+id)/(Math.PI*2);
  const c=Math.cos(azimuth),s=Math.sin(azimuth),ci=Math.cos(inclination),si=Math.sin(inclination);
  return {u:[c,0,s],v:[-s*ci,si,c*ci],normal:[-s*si,-ci,c*si]};
}

export const KNOWLEDGE_LAYERS_PER_PLANE = 9;
export function fibonacciOrbitSlot(rank){
  let row=0,start=0,capacity=1,next=1;
  while(rank-start>=capacity){start+=capacity;[capacity,next]=[next,capacity+next];row++;}
  return {row,capacity,slot:rank-start,page:Math.floor(row/KNOWLEDGE_LAYERS_PER_PLANE),layer:row%KNOWLEDGE_LAYERS_PER_PLANE};
}
// Planet rows double from four; nested satellites retain their existing packing.
export function planetOrbitSlot(rank){
  let row=0,start=0,capacity=4;
  while(rank-start>=capacity){start+=capacity;capacity*=2;row++;}
  return {row,capacity,slot:rank-start,page:Math.floor(row/KNOWLEDGE_LAYERS_PER_PLANE),layer:row%KNOWLEDGE_LAYERS_PER_PLANE};
}
export function satelliteOrbitSlot(rank,kind){
  if(kind!=='knowledge')return fibonacciOrbitSlot(rank);
  const page=Math.floor(rank/270),local=rank%270,layer=Math.floor((Math.sqrt(1+4*local/3)-1)/2),capacity=6*(layer+1),slot=local-3*layer*(layer+1);
  return {row:page*9+layer,capacity,slot,page,layer};
}
// Minimum distance over a shared angular period, including differently tilted planes.
export function orbitSweepDistance(a,ra,b,rb){
 const basis=o=>o.sweepBasis||(o.sweepBasis={c:o.frame.u.map((x,k)=>x*Math.cos(o.phase)+o.frame.v[k]*Math.sin(o.phase)),s:o.frame.u.map((x,k)=>-x*Math.sin(o.phase)+o.frame.v[k]*Math.cos(o.phase))});
 const x=basis(a),y=basis(b);let aa=0,bb=0,ab=0;for(let k=0;k<3;k++){const p=ra*x.c[k]-rb*y.c[k],q=ra*x.s[k]-rb*y.s[k];aa+=p*p;bb+=q*q;ab+=p*q;}
 const denominator=aa+bb+Math.hypot(aa-bb,2*ab);return denominator>0?Math.sqrt(Math.max(0,2*(aa*bb-ab*ab)/denominator)):0;
}

// Newtonian acceleration in scaled scene units. Large graphs use a mass tree.
export function gravityAccelerations(positions,masses,G,softening=0,theta=.6){
  const result=positions.map(()=>[0,0,0]);
  const add=(i,point,mass)=>{const p=positions[i],x=point[0]-p[0],y=point[1]-p[1],z=point[2]-p[2],r2=x*x+y*y+z*z+softening*softening;if(!r2)return;const scale=G*mass/(r2*Math.sqrt(r2)),a=result[i];a[0]+=x*scale;a[1]+=y*scale;a[2]+=z*scale;};
  if(positions.length<=180){for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
    const d=positions[j].map((v,a)=>v-positions[i][a]),r2=d.reduce((s,v)=>s+v*v,softening*softening);if(!r2)continue;
    const scale=G/(r2*Math.sqrt(r2));for(let a=0;a<3;a++){result[i][a]+=d[a]*scale*masses[j];result[j][a]-=d[a]*scale*masses[i];}
  }return result;}
  const low=[0,1,2].map(a=>Math.min(...positions.map(p=>p[a]))),high=[0,1,2].map(a=>Math.max(...positions.map(p=>p[a])));
  const center=low.map((v,a)=>(v+high[a])/2),half=Math.max(1e-6,...high.map((v,a)=>(v-low[a])/2))*1.00001;
  const build=(ids,center,half,depth)=>{
    const mass=ids.reduce((s,i)=>s+masses[i],0),point=[0,1,2].map(a=>ids.reduce((s,i)=>s+positions[i][a]*masses[i],0)/mass),node={mass,point,center,half};
    if(ids.length<=8||depth>=24){node.ids=ids;return node;}
    const groups=Array.from({length:8},()=>[]);for(const i of ids){const p=positions[i],oct=(p[0]>=center[0]?1:0)|(p[1]>=center[1]?2:0)|(p[2]>=center[2]?4:0);groups[oct].push(i);}
    node.children=groups.flatMap((group,oct)=>group.length?[build(group,center.map((v,a)=>v+((oct&(1<<a))?1:-1)*half/2),half/2,depth+1)]:[]);return node;
  };
  const root=build(positions.map((p,i)=>i),center,half,0);
  for(let i=0;i<positions.length;i++){
    const stack=[root];while(stack.length){const node=stack.pop();if(node.ids){for(const j of node.ids)if(j!==i)add(i,positions[j],masses[j]);continue;}
      const p=positions[i],contains=Math.abs(p[0]-node.center[0])<=node.half&&Math.abs(p[1]-node.center[1])<=node.half&&Math.abs(p[2]-node.center[2])<=node.half;
      const dx=node.point[0]-p[0],dy=node.point[1]-p[1],dz=node.point[2]-p[2],distance=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(!contains&&node.half*2/distance<theta)add(i,node.point,node.mass);else stack.push(...node.children);
    }
  }
  return result;
}

export function integrateGravity(positions,velocities,masses,G,dt=1,softening=0,accelerate=gravityAccelerations){
  const first=accelerate(positions,masses,G,softening);
  for(let i=0;i<positions.length;i++)for(let a=0;a<3;a++){velocities[i][a]+=first[i][a]*dt/2;positions[i][a]+=velocities[i][a]*dt;}
  const second=accelerate(positions,masses,G,softening);
  for(let i=0;i<positions.length;i++)for(let a=0;a<3;a++)velocities[i][a]+=second[i][a]*dt/2;
}

export class AffinityLayout {
  constructor() {
    this.positions = Object.create(null);
    this.velocities = Object.create(null);
    this.nodes = [];
    this.links = [];
    this.time = 0;
    this.steps = 0;
    this.accumulator = 0;
    this.spacing = 30;
    this.timeScale = BASE_ANIMATION_SPEED;
    this.orbitClocks = new Map();
  }

  sync({ nodes, edges, seeds = {}, spacing = 30, growth = .01,baseRadius=2 }) {
    this.spacing = spacing;
    const signature = JSON.stringify([
      nodes.map((n) => [n.id,!!n.isMainTag,n.domainConnectionCount,n.relationConnectionCount,(n.sources||[]).map(s=>s.id).sort()]).sort(),
      edges.map((e) => [e.from, e.to, e.type, e.strength,e.dimensions?.orbitParent,!!e.sources?.some(s=>s.quote?.trim())]).sort(),
      spacing,growth,baseRadius,
    ]);
    if (signature === this.signature) return;
    const previousOrbits=this.orbits||{},previousFree=this.freeOrbits||new Map(),previousCore=this.coreId,previousRanks=new Map(this.stablePlanetSlots||[]);
    this.signature = signature;
    this.nodes = nodes;
    const degrees=new Map(nodes.map(n=>[n.id,new Set()]));
    for(const edge of edges){
      if(edge.from===edge.to||edge.semanticAnchor&&!edge.membershipLink)continue;
      const ends=['step','procedure'].includes(edge.type)?[edge.from,edge.to]:[edge.from,edge.to].sort();
      const key=JSON.stringify([...ends,edge.type]);
      degrees.get(edge.from)?.add(key);degrees.get(edge.to)?.add(key);
    }
    // Visual volume supplies inertia: a large core cannot be pulled around by a leaf.
    this.masses=nodes.map(n=>nodeRadiusFactor(n.isMainTag,n.isMainTag?(n.domainConnectionCount??degrees.get(n.id).size):degrees.get(n.id).size,growth)**3);
    this.collisionRadii=this.masses.map(m=>baseRadius*Math.cbrt(m));
    this.collisionGap=SURFACE_GAP;
    this.restPositions ||= Object.create(null);
    const ids = new Set(nodes.map((n) => n.id));
    const neighbours = new Map(nodes.map((n) => [n.id, new Map()]));
    const pairs = new Map();
    const pair = (a, b, weight, indirect = false) => {
      if (a === b || !ids.has(a) || !ids.has(b)) return;
      const [from, to] = a < b ? [a, b] : [b, a];
      const key = JSON.stringify([from, to]);
      const previous = pairs.get(key);
      // Several relation classifications do not mechanically multiply attraction.
      if (!previous || previous.weight < weight)
        pairs.set(key, { from, to, weight, indirect });
    };
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) continue;
      const w = Math.min(1, Math.max(0, Number(e.strength) || 0));
      if (!w) continue;
      pair(e.from, e.to, w);
      for (const [a, b] of [
        [e.from, e.to],
        [e.to, e.from],
      ])
        neighbours.get(a).set(b, Math.max(w, neighbours.get(a).get(b) || 0));
    }
    // Bounded, weak two-hop attraction expresses shared known structure.
    // It creates no semantic relation or visible edge and has no keyword fallback.
    for (const ns of neighbours.values()) {
      const entries = [...ns]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12);
      for (let i = 0; i < entries.length; i++)
        for (let j = i + 1; j < entries.length; j++)
          pair(
            entries[i][0],
            entries[j][0],
            Math.min(entries[i][1], entries[j][1]) * 0.16,
            true,
          );
    }
    this.links = [...pairs.values()];
    const centered=nodes.length>0&&nodes.every(n=>seeds[n.id]?.length===3&&seeds[n.id].every(v=>v===0));
    for (const n of nodes) {
      if (this.positions[n.id]) continue;
      const near = [...neighbours.get(n.id)]
        .map(([id]) => this.positions[id])
        .filter(Boolean);
      const phase = phaseOf(n.id);
      const offset = [
        Math.sin(phase),
        Math.cos(phase * 1.7),
        Math.sin(phase * 2.3),
      ];
      this.positions[n.id] = centered?[0,0,0]:near.length
        ? offset.map(
            (x, a) =>
              near.reduce((sum, p) => sum + p[a], 0) / near.length +
              x * spacing,
          )
        : seeds[n.id]?.every(Number.isFinite)
          ? [...seeds[n.id]]
          : offset.map((x) => x * spacing * 2);
      this.velocities[n.id] = [0, 0, 0];
    }
    for (const id of Object.keys(this.positions))
      if (!ids.has(id)) {
        delete this.positions[id];
        delete this.velocities[id];
        delete this.restPositions[id];
      }
    for(const n of nodes)this.restPositions[n.id]||=[...this.positions[n.id]];
    const cores=nodes.map((n,i)=>({node:n,mass:this.masses[i]})).filter(({node})=>node.isMainTag);
    const connectionCount=n=>n.relationConnectionCount??n.domainConnectionCount??degrees.get(n.id)?.size??0;
    cores.sort((a,b)=>connectionCount(b.node)-connectionCount(a.node)||(a.node.id===previousCore?-1:b.node.id===previousCore?1:0)||(previousRanks.get(a.node.id)?.rank??Infinity)-(previousRanks.get(b.node.id)?.rank??Infinity)||a.node.id.localeCompare(b.node.id));
    this.coreId=cores[0]?.node.id||null;
    const unifiedNetwork=true;
    // All network views use a unique highest-connection primary.
    this.companionId=!unifiedNetwork&&cores[1]&&(cores[1].node.domainConnectionCount||0)>=10&&(cores[1].node.domainConnectionCount||0)>=(cores[0].node.domainConnectionCount||0)*.85?cores[1].node.id:null;
    this.starIds=new Set(cores.slice(0,3).filter((c,i)=>i===0||!unifiedNetwork&&((c.node.domainConnectionCount||0)>=10&&(c.node.domainConnectionCount||0)>=(cores[0].node.domainConnectionCount||0)*.85)).map(c=>c.node.id));
    if(unifiedNetwork&&previousCore&&previousCore!==this.coreId&&this.steps>0&&this.positions[this.coreId]){
      this.centerTarget=[...(this.centerTarget||this.center)];this.center=[...this.positions[this.coreId]];
    }
    if(this.coreId&&!this.center){
      const origin=[...this.positions[this.coreId]];this.center=[0,0,0];
      for(const n of nodes){this.positions[n.id]=this.positions[n.id].map((x,k)=>x-origin[k]);if(this.restPositions[n.id])this.restPositions[n.id]=this.restPositions[n.id].map((x,k)=>x-origin[k]);}
    }
    if(!this.center&&nodes.length)this.center=[0,1,2].map(a=>nodes.reduce((sum,n)=>sum+this.positions[n.id][a],0)/nodes.length);
    this.eclipticY??=this.center?.[1]||0;
    const largestSize=Math.max(1,...this.masses.map(m=>Math.cbrt(m)));
    const maxDomainCount=Math.max(1,...cores.map(c=>c.node.domainConnectionCount||0));
    this.centrality=this.masses.map((m,i)=>nodes[i].isMainTag?(nodes[i].domainConnectionCount||0)/maxDomainCount:largestSize>1?(Math.cbrt(m)-1)/(largestSize-1):0);
    const nodeIndex=new Map(nodes.map((n,i)=>[n.id,i])),members=new Map(),owners=new Map(),membershipHosts=new Map();
    this.nodeIndices=nodeIndex;
    for(const edge of edges.filter(e=>e.membershipLink)){
      const host=nodeIndex.get(edge.from),child=nodeIndex.get(edge.to);
      if(host===undefined||child===undefined||!nodes[host].isMainTag||nodes[child].isMainTag)continue;
      if(!membershipHosts.has(edge.to))membershipHosts.set(edge.to,new Set());membershipHosts.get(edge.to).add(host);
      const previous=owners.get(edge.to);
      if(previous===undefined||this.masses[host]>this.masses[previous])owners.set(edge.to,host);
    }
    this.sharedOrbits=[...membershipHosts].filter(([id,hosts])=>hosts.size>1).map(([id,hosts])=>({id,index:nodeIndex.get(id),hosts:[...hosts]}));
    this.sharedOrbitIds=new Set(this.sharedOrbits.map(group=>group.id));
    this.sharedOrbitById=new Map(this.sharedOrbits.map(group=>[group.id,group]));
    this.membershipPlaneKeys=new Map();
    for(const n of nodes){const hosts=membershipHosts.get(n.id);if(hosts)this.membershipPlaneKeys.set(n.id,'membership:'+hosts.size+':'+nodes[owners.get(n.id)].id);}
    this.orbitHierarchyIssues=[];
    const hierarchy=edges.filter(e=>!e.membershipLink&&e.sources?.some(s=>s.quote?.trim())&&(e.type==='contains'||e.type==='part-of'||e.dimensions?.orbitParent===true||e.dimensions?.orbitParent===e.from))
      .sort((a,b)=>(b.strength||0)-(a.strength||0)||String(a.id||a.from+'|'+a.to).localeCompare(String(b.id||b.from+'|'+b.to)));
    const assigned=new Set();
    for(const edge of hierarchy){
      const parentId=edge.type==='part-of'?edge.to:edge.from,childId=edge.type==='part-of'?edge.from:edge.to,parent=nodeIndex.get(parentId),child=nodeIndex.get(childId);
      if(parent===undefined||child===undefined||nodes[child].isMainTag||nodes[parent].kind!==nodes[child].kind||assigned.has(childId))continue;
      let ancestor=parent,cycle=false;const seen=new Set([child]);
      while(ancestor!==undefined){if(seen.has(ancestor)){cycle=true;break;}seen.add(ancestor);ancestor=owners.get(nodes[ancestor].id);}
      if(cycle){this.orbitHierarchyIssues.push({edgeId:edge.id,reason:'cyclic orbital hierarchy'});continue;}
      owners.set(childId,parent);assigned.add(childId);
    }
    // Provenance is also a visual neighbourhood, never a new stored relation.
    for(const n of [...nodes].sort((a,b)=>a.id.localeCompare(b.id))){
      if(n.isMainTag||assigned.has(n.id)||this.sharedOrbitIds.has(n.id))continue;
      for(const source of n.sources||[]){
        const parent=nodeIndex.get(source.id),child=nodeIndex.get(n.id);
        if(parent===undefined||parent===child||nodes[parent].isMainTag||nodes[parent].kind!==n.kind)continue;
        if(owners.get(n.id)!==owners.get(source.id))continue;
        let ancestor=parent,cycle=false;const seen=new Set([child]);
        while(ancestor!==undefined){if(seen.has(ancestor)){cycle=true;break;}seen.add(ancestor);ancestor=owners.get(nodes[ancestor].id);}
        if(!cycle){owners.set(n.id,parent);assigned.add(n.id);break;}
      }
    }
    this.orbits=Object.create(null);
    for(const [id,host]of owners){if(!members.has(host))members.set(host,[]);members.get(host).push(id);}
    for(const [host,children]of members){
      const sourceKey=id=>(nodes[nodeIndex.get(id)].sources||[]).map(s=>s.id).sort().join('|');
      const planeKey=id=>this.membershipPlaneKeys.get(id)||nodes[host].id+':unclassified';
      children.sort((a,b)=>planeKey(a).localeCompare(planeKey(b))||sourceKey(a).localeCompare(sourceKey(b))||a.localeCompare(b));const axis=[0,1,0],norm=1;
      this.stableOrbitSlots||=new Map();const used=new Map(),ordinal=new Map();
      for(const id of children){const key='all',old=this.stableOrbitSlots.get(id);if(old?.host===nodes[host].id&&old.key===planeKey(id)&&!used.get(key)?.has(old.rank)){if(!used.has(key))used.set(key,new Set());used.get(key).add(old.rank);ordinal.set(id,old.rank);}}
      for(const id of children)if(!ordinal.has(id)){const key='all';if(!used.has(key))used.set(key,new Set());const occupied=used.get(key);let rank=0;while(occupied.has(rank))rank++;occupied.add(rank);ordinal.set(id,rank);this.stableOrbitSlots.set(id,{host:nodes[host].id,key:planeKey(id),rank});}
      this.stableOrbitShells||=new Map();if(!this.stableOrbitShells.has(nodes[host].id))this.stableOrbitShells.set(nodes[host].id,new Map());const shellIds=this.stableOrbitShells.get(nodes[host].id);let nextShell=Math.max(-1,...shellIds.values())+1;const knowledge=true;
      children.forEach(id=>{const i=nodeIndex.get(id),rank=ordinal.get(id),baseKey=planeKey(id),placement=satelliteOrbitSlot(rank,nodes[host].kind),{page,layer,slot,capacity:slots,row}=placement;
        const key=page?baseKey+':capacity-plane:'+page:baseKey,shellKey=key+':layer:'+layer;
        if(!shellIds.has(shellKey))shellIds.set(shellKey,nextShell++);const shell=shellIds.get(shellKey),radius=this.collisionRadii[host]+this.collisionRadii[i];
        this.orbits[id]={host:nodes[host].id,localShell:shell,localSlots:slots,globalRow:row,planePage:page,radialLayer:layer,planeKey:key,...(knowledge?{knowledgePlane:true,planePage:page,radialLayer:layer}:{}),axis:[0,1,0],radius,targetRadius:radius,phase:slot*Math.PI*2/slots+layer*.2+page*.618,hostMass:this.masses[host]};});
    }
    this.stablePlanetSlots||=new Map();
    if(unifiedNetwork){let rank=0;for(const {node}of cores)if(!this.starIds.has(node.id))this.stablePlanetSlots.set(node.id,{host:this.coreId,rank:rank++});}
    const usedPlanetSlots=new Set();
    for(const {node}of cores)if(!this.starIds.has(node.id)){const previous=this.stablePlanetSlots.get(node.id);if(previous?.host===this.coreId)usedPlanetSlots.add(previous.rank);}
    for(const {node}of cores)if(!this.starIds.has(node.id)){const previous=this.stablePlanetSlots.get(node.id);if(previous?.host!==this.coreId){let rank=0;while(usedPlanetSlots.has(rank))rank++;usedPlanetSlots.add(rank);this.stablePlanetSlots.set(node.id,{host:this.coreId,rank});}}
    const primary=nodeIndex.get(this.coreId);
    if(primary!==undefined)for(const {node}of cores){
      if(node.id===this.coreId)continue;
      const i=nodeIndex.get(node.id);
      if(this.starIds.has(node.id)){const radius=(this.collisionRadii[primary]+this.collisionRadii[i])*1.12;
        this.orbits[node.id]={host:this.coreId,kind:'star',binary:true,radius,targetRadius:radius,axis:[0,1,0],hostMass:this.masses[primary],launchKey:'binary:'+this.coreId};continue;}
      const rank=this.stablePlanetSlots.get(node.id).rank;
      const {row:ring,slot,capacity:slots,page,layer}=planetOrbitSlot(rank);
      const maxPlanetRadius=Math.max(...cores.slice(1).map(c=>this.collisionRadii[nodeIndex.get(c.node.id)]),1);
      const nineAU=[...SOLAR_ORBIT_AU,39.482],band=ring%9,cycle=Math.floor(ring/9);
      const base=Math.max(spacing*3,this.collisionRadii[primary]+maxPlanetRadius*3);
      const radius=unifiedNetwork?this.orbitalClearance(i,primary):base+(maxPlanetRadius*3+spacing)* (Math.log1p(nineAU[band])/Math.log(1.387)+cycle*12);
      this.orbits[node.id]={host:this.coreId,kind:'planet',...(unifiedNetwork?{planeKey:this.coreId+':planet-plane:'+page}:{}),ring,slot,localSlots:slots,globalRow:ring,planePage:page,radialLayer:layer,phase:slot*Math.PI*2/slots+ring*.23,axis:[0,1,0],radius,targetRadius:radius,hostMass:this.masses[primary],launchKey:'planet-ring:'+this.coreId+':'+ring+':'+slot};
    }
    for(const group of this.sharedOrbits)if(this.orbits[group.id])this.orbits[group.id].launchKey='shared:'+group.hosts.map(i=>nodes[i].id).sort().join('|');
    this.centralOrbitFrame=orbitalFrame([...this.starIds].sort().join('|'));
    const orbitFrames=new Map();
    for(const o of Object.values(this.orbits)){const key=o.planeKey||o.host+':ring:'+(o.ring??'central');if(!orbitFrames.has(key))orbitFrames.set(key,orbitalFrame(key));o.frame=orbitFrames.get(key);o.axis=o.frame.normal;}
    for(const group of this.sharedOrbits)group.frame=orbitalFrame(this.membershipPlaneKeys.get(group.id));
    this.orbitDepths=Object.create(null);
    const depth=id=>this.orbitDepths[id]??(this.orbitDepths[id]=this.orbits[id]?1+depth(this.orbits[id].host):0);
    for(const n of nodes)depth(n.id);
    this.orbitOrder=[...nodes].sort((a,b)=>this.orbitDepths[a.id]-this.orbitDepths[b.id]);
    this.systemExtents=[...this.collisionRadii];
    this.subtreeMaxRadius=[...this.collisionRadii];
    // Reserve disjoint swept volumes, including descendants, growth and +/-2% tides.
    // This is geometric packing, not collision forces or integration.
    for(const n of [...this.orbitOrder].reverse()){
      const host=nodeIndex.get(n.id),children=members.get(host)||[],shells=new Map();
      for(const id of children){const o=this.orbits[id];if(!o||o.kind==='star'||o.kind==='planet')continue;if(!shells.has(o.localShell))shells.set(o.localShell,[]);shells.get(o.localShell).push(id);}
      const planeBounds=new Map(),knowledgePlaced=[],radialIndex=new RadialEnvelopeIndex();
      let previous=0,previousExtent=0,previousSize=0,previousRadiusForPlane=0,previousExtentForPlane=0;
      for(const shell of [...shells.keys()].sort((a,b)=>a-b)){
        const ids=shells.get(shell),plane=this.orbits[ids[0]].planeKey,knowledge=this.orbits[ids[0]].knowledgePlane;
        if(knowledge){const previous=planeBounds.get(plane)||{radius:0,extent:0,size:0};previousRadiusForPlane=previous.radius;previousExtentForPlane=previous.extent;}
        const extent=Math.max(...ids.map(id=>this.systemExtents[nodeIndex.get(id)])),size=Math.max(...ids.map(id=>this.subtreeMaxRadius[nodeIndex.get(id)])),slots=this.orbits[ids[0]].localSlots;
        const oldPrevious=previous,oldExtent=previousExtent;if(knowledge){previous=previousRadiusForPlane;previousExtent=previousExtentForPlane;}
        const parentGap=SURFACE_GAP+4*this.collisionRadii[host];
        const baselineRadius=Math.max((this.collisionRadii[host]+extent+parentGap)/.98,(slots>1?(2*extent+SURFACE_GAP)/(2*Math.sin(Math.PI/slots)*.98):0),(previous*1.02+previousExtent+extent+SURFACE_GAP)/.98);
        const placed=[];
        // Pack actual child envelopes, rather than assigning every child the
        // largest sibling's envelope. All members of this shell share a plane
        // and angular rate, so their separation is bounded analytically.
        for(const id of [...ids].sort((a,b)=>this.systemExtents[nodeIndex.get(b)]-this.systemExtents[nodeIndex.get(a)]||a.localeCompare(b))){
          const i=nodeIndex.get(id),e=this.systemExtents[i],s=this.subtreeMaxRadius[i],o=this.orbits[id];
          let radius=Math.max(baselineRadius*LOCAL_ORBIT_DISTANCE_SCALE,(this.collisionRadii[host]+e+parentGap)/.98,(previous*1.02+previousExtent+e+SURFACE_GAP)/.98);
          // Co-planar siblings share the same tidal field and angular clock.
          // Its displacement derivatives are bounded by .08 radially and .04
          // tangentially: separation stays >= .88 of nominal, rather than
          // losing independent 2% radii per body. Primary-owned bodies have no tide.
          const safe=r=>knowledge?radialIndex.query(r,e,SURFACE_GAP).every(p=>Math.abs(r-p.radius)-.02*(r+p.radius)>=e+p.extent+SURFACE_GAP-1e-8||orbitSweepDistance(o,r,p.orbit,p.radius)*(o.planeKey===p.orbit.planeKey?(this.orbits[nodes[host].id]?.88:1):1)-(o.planeKey===p.orbit.planeKey?0:.02*(r+p.radius))>=e+p.extent+SURFACE_GAP-1e-8):placed.every(p=>{const angle=o.phase-p.phase,nominal=Math.sqrt(Math.max(0,r*r+p.radius*p.radius-2*r*p.radius*Math.cos(angle)));return nominal-.02*(r+p.radius)>=e+p.extent+SURFACE_GAP-1e-8;});
          if(!safe(radius)){let low=Math.max(radius,...placed.map(p=>p.radius)),high=low;while(!safe(high))high=high*1.25+1;for(let step=0;step<40;step++){const middle=(low+high)/2;if(safe(middle))high=middle;else low=middle;}radius=high;}
          o.radius=o.targetRadius=radius;o.uncompressedShellRadius=baselineRadius;
          placed.push({radius,phase:o.phase,extent:e,size:s});
          if(knowledge){const envelope={radius,orbit:o,extent:e};knowledgePlaced.push(envelope);radialIndex.add(envelope);}
          this.systemExtents[host]=Math.max(this.systemExtents[host],radius*1.02+e);
        }
        this.subtreeMaxRadius[host]=Math.max(this.subtreeMaxRadius[host],size);
        previous=Math.max(...placed.map(p=>p.radius));previousExtent=extent;previousSize=size;
        if(knowledge){planeBounds.set(plane,{radius:previous,extent,size});previous=oldPrevious;previousExtent=oldExtent;}
      }
    }
    configureSharedTours(this,orbitalFrame,satelliteOrbitSlot);
    // Satellite centre reach excludes the satellite body radius. Full sphere
    // envelopes remain a separate safety constraint for whole-group packing.
    this.satelliteCenterExtents=nodes.map(()=>0);
    for(const n of [...this.orbitOrder].reverse()){
      const o=this.orbits[n.id];if(!o||o.kind==='planet'||o.kind==='star')continue;
      const i=nodeIndex.get(n.id),host=nodeIndex.get(o.host),tide=this.orbits[o.host]?1.02:1;
      this.satelliteCenterExtents[host]=Math.max(this.satelliteCenterExtents[host],o.targetRadius*tide+this.satelliteCenterExtents[i]);
    }
    for(const g of this.sharedOrbits)for(const visit of g.visits){const host=nodeIndex.get(visit.host);this.satelliteCenterExtents[host]=Math.max(this.satelliteCenterExtents[host],visit.radius+this.satelliteCenterExtents[g.index]);}
    const starIndices=[...this.starIds].map(id=>nodeIndex.get(id)),starExtent=Math.max(0,...starIndices.map(i=>this.systemExtents[i])),starSize=Math.max(0,...starIndices.map(i=>this.subtreeMaxRadius[i]));
    this.centralOrbitRadius=0;
    if(starIndices.length>1)for(let a=0;a<starIndices.length;a++)for(let b=a+1;b<starIndices.length;b++){
      const i=starIndices[a],j=starIndices[b],chord=2*Math.sin(Math.PI*(b-a)/starIndices.length);
      const parentMinimum=this.orbits[nodes[j].id]?.host===nodes[i].id?this.orbitalClearance(j,i):this.orbits[nodes[i].id]?.host===nodes[j].id?this.orbitalClearance(i,j):0;
      this.centralOrbitRadius=Math.max(this.centralOrbitRadius,Math.max(this.systemExtents[i]+this.systemExtents[j]+SURFACE_GAP,parentMinimum)/chord);
    }
    const starMass=starIndices.reduce((sum,i)=>sum+this.masses[i],0);
    const mean=[0,0];starIndices.forEach((i,k)=>{mean[0]+=Math.cos(k*Math.PI*2/starIndices.length)*this.masses[i]/starMass;mean[1]+=Math.sin(k*Math.PI*2/starIndices.length)*this.masses[i]/starMass;});
    const centralExtent=Math.max(0,...starIndices.map((i,k)=>Math.hypot(Math.cos(k*Math.PI*2/starIndices.length)-mean[0],Math.sin(k*Math.PI*2/starIndices.length)-mean[1])*this.centralOrbitRadius+this.systemExtents[i]));
    const ringBounds=new Map();
    for(const n of nodes){const o=this.orbits[n.id];if(o?.kind!=='planet')continue;
      const extent=this.systemExtents[nodeIndex.get(n.id)];
      ringBounds.set(o.ring,Math.max(ringBounds.get(o.ring)||0,unifiedNetwork?0:o.targetRadius*GROUP_DISTANCE_SCALE,unifiedNetwork?0:extent*Math.max(1,4*GROUP_DISTANCE_SCALE),this.orbitalClearance(nodeIndex.get(n.id),primary)));
    }
    const primaryLocalReach=Math.max(0,...starIndices.map(i=>this.satelliteCenterExtents[i]));
    let previousRadius=0,previousEnvelope=Math.max(0,...starIndices.map(i=>this.collisionRadii[i])),previousSize=starSize,previousLocalReach=primaryLocalReach;
    for(const ring of [...ringBounds.keys()].sort((a,b)=>a-b)){
      const members=nodes.filter(n=>this.orbits[n.id]?.kind==='planet'&&this.orbits[n.id].ring===ring);
      const envelope=Math.max(...members.map(n=>this.systemExtents[nodeIndex.get(n.id)]));
      const bodyExtent=Math.max(...members.map(n=>this.collisionRadii[nodeIndex.get(n.id)]));
      const size=Math.max(...members.map(n=>this.subtreeMaxRadius[nodeIndex.get(n.id)]));
      const localReach=Math.max(0,...members.map(n=>this.satelliteCenterExtents[nodeIndex.get(n.id)]));
      // Propagate only the preceding row's own local satellite-centre reach.
      // Only body clearance and same-ring body packing may enlarge this gap;
      // the spatial envelopes of separate groups are allowed to overlap.
      const baselineGap=LOCAL_ROW_REACH_MULTIPLIER*previousLocalReach;
      let sameRingMinimum=0;
      for(let a=0;a<members.length;a++)for(let b=a+1;b<members.length;b++){
        const i=nodeIndex.get(members[a].id),j=nodeIndex.get(members[b].id),angle=Math.abs(this.orbits[members[a].id].phase-this.orbits[members[b].id].phase);
        sameRingMinimum=Math.max(sameRingMinimum,this.bodyMinimum(i,j)/(2*Math.abs(Math.sin(angle/2))));
      }
      const radius=Math.max(ringBounds.get(ring),sameRingMinimum,previousRadius+previousEnvelope+bodyExtent+SURFACE_GAP,unifiedNetwork?previousRadius+baselineGap:0);
      for(const n of members){const o=this.orbits[n.id];o.radius=o.targetRadius=radius;o.satelliteEnvelope=envelope;o.satelliteLimit=radius;o.rowBaselineGap=baselineGap;o.rowActualGap=radius-previousRadius;}
      previousRadius=radius;previousEnvelope=bodyExtent;previousSize=size;previousLocalReach=localReach;
    }
    const free=nodes.filter(n=>!this.starIds.has(n.id)&&!this.orbits[n.id]).sort((a,b)=>a.id.localeCompare(b.id));
    const freeSize=Math.max(0,...free.map(n=>this.collisionRadii[nodeIndex.get(n.id)]));
    const systemBound=Math.max(centralExtent,...nodes.filter(n=>this.orbits[n.id]?.kind==='planet').map(n=>this.orbits[n.id].targetRadius+this.systemExtents[nodeIndex.get(n.id)]+2*this.centralOrbitRadius));
    this.tourWorldBound=Math.max(100,systemBound*4);
    this.freeOrbits=new Map();
    this.freeNodes=free;
    for(let k=0;k<free.length;k++){
      const {row:shell,slot,capacity:slots}=fibonacciOrbitSlot(k);
      const radius=Math.max(systemBound+freeSize+SURFACE_GAP+shell*(2*freeSize+SURFACE_GAP),(slots>1?(freeSize+SURFACE_GAP/2)/Math.sin(Math.PI/slots):0));
      this.freeOrbits.set(free[k].id,{radius,phase:slot*Math.PI*2/slots,frame:orbitalFrame('unassigned:'+shell)});
      const old=previousFree.get(free[k].id);if(unifiedNetwork&&this.steps>0&&old&&(Math.abs(old.radius-radius)>1e-8||previousCore!==this.coreId)){this.freeTransitions||=new Set();this.freeTransitions.add(free[k].id);}
    }
    // Gravity groups include planet hosts too; visual roles are independent of this index.
    this.stellarIndices=nodes.map((n,i)=>n.isMainTag?i:-1).filter(i=>i>=0);
    this.bodyRoles=Object.fromEntries(nodes.map(n=>[n.id,this.starIds.has(n.id)?'star':n.isMainTag?'planet':this.orbits[n.id]&&!this.starIds.has(this.orbits[n.id].host)?'satellite':'planet']));
    const systems=new Map(),sharedSystems=new Map();
    for(const n of nodes){let root=n.id;while(!nodes[nodeIndex.get(root)]?.isMainTag&&!this.sharedOrbitIds.has(root)&&this.orbits[root])root=this.orbits[root].host;
      if(this.sharedOrbitIds.has(root)){if(!sharedSystems.has(root))sharedSystems.set(root,[]);sharedSystems.get(root).push(nodeIndex.get(n.id));continue;}
      if(nodes[nodeIndex.get(root)]?.isMainTag){if(!systems.has(root))systems.set(root,[]);systems.get(root).push(nodeIndex.get(n.id));}
    }
    this.gravitySystems=[...systems.values()];
    this.sharedGravitySystems=[...sharedSystems].map(([id,members])=>({members,hosts:this.sharedOrbitById.get(id).hosts}));
    this.spinRates=Object.fromEntries(nodes.map(n=>[n.id,(this.starIds.has(n.id)?.08:.25)*(.72+.56*phaseOf(n.id)/(Math.PI*2))]));
    this.G=spacing**3*.0000005;
    this.gravityLaunches||=new Map();
    if(unifiedNetwork&&this.steps>0)for(const n of nodes){
      const o=this.orbits[n.id],old=previousOrbits[n.id];if(o?.kind!=='planet'||(!old&&n.id!==previousCore))continue;
      const same=old?.host===o.host&&old.ring===o.ring&&old.phase===o.phase&&Math.abs(old.targetRadius-o.targetRadius)<1e-8&&JSON.stringify(old.frame)===JSON.stringify(o.frame);
      if(same){if(old.motion)o.motion=old.motion;continue;}
      const host=this.positions[o.host],relative=this.positions[n.id].map((x,k)=>x-host[k]),r=Math.hypot(...relative);
      const clock=this.orbitClocks.get(JSON.stringify([o.host,'planet:'+n.id,0]))?.angle||0;
      let frame=old?.motion?.frame||old?.frame,angle=old?.lockAngle;
      if(old?.host!==o.host||!Number.isFinite(angle)){
        const u=relative.map(x=>x/(r||1)),reference=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],dot=reference.reduce((sum,x,k)=>sum+x*u[k],0),v=reference.map((x,k)=>x-dot*u[k]),len=Math.hypot(...v)||1;
        for(let k=0;k<3;k++)v[k]/=len;
        frame={u,v,normal:[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]};angle=0;
      }
      const drift=((angle-o.phase-clock)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
      o.motion={radius:r,frame,drift};
    }
  }

  advance(elapsed) {
    // Active display time is never clipped by frame cost. The view resets its
    // timestamp after a hidden-tab pause instead of slowing visible animation.
    this.accumulator += Math.max(0, Number.isFinite(elapsed)?elapsed:0)*this.timeScale;
    // These are analytic display orbits, not a force integrator. Evaluate one
    // swept, constrained pose at the current time instead of rebuilding the
    // same large scene for every missed 1/30 tick. Logical angular time and
    // real-time transfer distance advance by the complete elapsed interval.
    if(this.coreId&&this.nodes.length>=2000&&this.accumulator>0){
      const scale=this.accumulator*30;this.accumulator=0;this.motionStepScale=scale;
      try{this.step();}finally{this.motionStepScale=1;}return true;
    }
    let changed = false;
    while (this.accumulator >= 1 / 30-1e-10) {
      this.step();
      this.accumulator = Math.max(0,this.accumulator-1/30);
      changed = true;
    }
    return changed;
  }

  step({ floating = true } = {}) {
    const count = this.nodes.length;
    if (!count) return;
    if(floating&&this.coreId){const scale=this.motionStepScale||1;this.stepGravity();this.time+=scale/30;this.steps+=scale;return;}
    if(this.activeAvoidance&&this.activeNodes.length<count){const active=this.activeAvoidance;active.positions=this.positions;active.velocities=this.velocities;active.time=this.time;active.steps=this.steps;AffinityLayout.prototype.step.call(active,{floating});this.time=active.time;this.steps=active.steps;return;}
    const forces = new Float64Array(count * 3);
    const index = new Map(this.nodes.map((n, i) => [n.id, i]));
    const positions = this.nodes.map((n) => this.positions[n.id]);
    const centroid = [0, 0, 0];
    const totalMass=this.masses.reduce((sum,m)=>sum+m,0);
    for (let i=0;i<count;i++)
      for (let a = 0; a < 3; a++) centroid[a] += positions[i][a]*this.masses[i]/totalMass;
    const repel = (i, j, weight = 1) => {
      if (i === j) return;
      const p = positions[i],
        q = positions[j];
      let dx = p[0] - q[0],
        dy = p[1] - q[1],
        dz = p[2] - q[2];
      let length = Math.hypot(dx, dy, dz);
      if (length < 0.01) {
        const phase = phaseOf(this.nodes[i].id + this.nodes[j].id);
        dx = Math.sin(phase);
        dy = Math.cos(phase);
        dz = Math.sin(phase * 1.7);
        length = Math.hypot(dx, dy, dz);
      }
      const force = (65 * weight) / (length * length + 30);
      forces[i * 3] += (dx / length) * force;
      forces[i * 3 + 1] += (dy / length) * force;
      forces[i * 3 + 2] += (dz / length) * force;
    };
    if (count <= 180) {
      for (let i = 0; i < count; i++)
        for (let j = 0; j < count; j++) repel(i, j);
    } else {
      // Local spatial cells + a bounded far-field sample keep large graphs usable.
      const cell = this.spacing * 1.6,
        grid = new Map();
      const cells = positions.map((p) => p.map((v) => Math.floor(v / cell)));
      const key = (x, y, z) => `${x},${y},${z}`;
      cells.forEach(([x, y, z], i) => {
        const k = key(x, y, z);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      });
      for (let i = 0; i < count; i++) {
        const [x, y, z] = cells[i];
        let visited = 0;
        outer: for (let a = -1; a <= 1; a++)
          for (let b = -1; b <= 1; b++)
            for (let c = -1; c <= 1; c++) {
              for (const j of grid.get(key(x + a, y + b, z + c)) || []) {
                repel(i, j);
                if (++visited >= 40) break outer;
              }
            }
        for (let s = 1; s <= 12; s++)
          repel(i, (i + s * 607) % count, Math.sqrt(count) / 12);
      }
    }
    for (const link of this.links) {
      const i = index.get(link.from),
        j = index.get(link.to);
      const p = positions[i],
        q = positions[j];
      const delta = q.map((v, a) => v - p[a]);
      const length = Math.hypot(...delta) || 0.001;
      const desired = Math.max(this.spacing * (1.9 - 1.25 * link.weight),this.bodyMinimum(i,j));
      const spring =
        (length - desired) *
        (0.002 + 0.007 * link.weight) *
        (link.indirect ? 0.35 : 1);
      for (let a = 0; a < 3; a++) {
        const f = (delta[a] / length) * spring;
        forces[i * 3 + a] += f;
        forces[j * 3 + a] -= f;
      }
    }
    for (let i = 0; i < count; i++) {
      const n = this.nodes[i],
        p = positions[i],
        v = this.velocities[n.id];
      const phase = phaseOf(n.id);
      const mass=this.masses[i],mobility=1/mass;
      if(n.id===this.coreId){
        // The center stays put: a newly dominant label travels to it continuously.
        const amplitude=floating?this.spacing*.02/Math.pow(mass,.1):0;
        const delta=p.map((value,a)=>this.center[a]+Math.sin(this.time*(.07+a*.013)+phase*(a+1))*amplitude-value),distance=Math.hypot(...delta);
        const limit=this.spacing*.008/Math.pow(mass,.15);
        for(let a=0;a<3;a++)v[a]=v[a]*.9+delta[a]*Math.min(.006,limit/(distance||1))*.1;
        const speed=Math.hypot(...v);
        for(let a=0;a<3;a++)p[a]+=v[a]*Math.min(1,limit/(speed||1));
        continue;
      }
      const centrality=this.centrality[i];
      let radial=p.map((value,a)=>value-this.center[a]);
      const radius=Math.hypot(...radial);
      if(radius<.001)radial=[Math.sin(phase),Math.cos(phase),Math.sin(phase*1.7)];
      const directionLength=Math.hypot(...radial)||1;
      // A finite central region keeps several large domains from collapsing together.
      const targetRadius=this.spacing*(3+5*(1-centrality));
      const inward=(radius-targetRadius)*.0002*centrality;
      for (let a = 0; a < 3; a++) {
        const drift = floating
          ? Math.sin(this.time * (0.19 + a * 0.023) + phase * (a + 1)) *
            this.spacing *
            0.000035
          : 0;
        // Heavy bodies retain a soft home, rather than a hard fixed coordinate.
        v[a] =
          (v[a] + (forces[i * 3 + a] - (p[a] - centroid[a]) * 0.00006 + drift)*mobility
            -(p[a]-this.restPositions[n.id][a])*.00012*(1-mobility)*(1-centrality)
            -(radial[a]/directionLength)*inward
            +(floating?(a===0?-radial[2]:a===2?radial[0]:0)/directionLength*this.spacing*(n.isMainTag?.00035:.000006)*(1-centrality*.6)*Math.sqrt(mobility):0)) *
          (0.78+0.06*mobility);
      }
      const speed = Math.hypot(...v),
        limit = this.spacing * 0.012 / Math.pow(mass,.65);
      for (let a = 0; a < 3; a++)
        p[a] += v[a] * Math.min(1, limit / (speed || 1));
    }
    this.resolveCollisions();
    this.time += 1 / 30;
    this.steps++;
  }

  setActiveNodes(ids){
    const next=new Set(ids);for(const id of this.starIds||[])next.add(id);
    for(const id of [...next]){let host=this.orbits[id]?.host,seen=new Set();while(host&&!seen.has(host)){seen.add(host);next.add(host);host=this.orbits[host]?.host;}}
    const signature=[...next].sort().join('\0');if(this.activeSignature===signature&&this.activeOrbitSource===this.orbits)return;
    const previous=this.activeIds;this.activeIds=next;this.activeSignature=signature;this.activeOrbitSource=this.orbits;
    this.activeNodes=this.nodes.filter(n=>next.has(n.id));this.activeIndices=this.activeNodes.map(n=>this.nodeIndices.get(n.id));
    this.activeSpinTimes||=new Map();this.visibilityClocks||=new Map();
    for(const n of this.activeNodes){if(!this.activeSpinTimes.has(n.id))this.activeSpinTimes.set(n.id,this.time);if(!previous?.has(n.id))this.bodyAvoidancePrevious?.delete(n.id);}
    for(const n of this.nodes){const o=this.orbits[n.id];if(!o)continue;let c=this.visibilityClocks.get(n.id);if(!c||c.host!==o.host){c={...(o.clockReference||{}),angle:o.clockReference?.angle||0,lastStep:-1,host:o.host};this.visibilityClocks.set(n.id,c);}o.clockReference=c;}
    this.orbitHostSource=null;
    const view=Object.create(this),indices=this.activeIndices;
    view.nodes=this.activeNodes;view.nodeIndices=new Map(view.nodes.map((n,i)=>[n.id,i]));view.collisionRadii=indices.map(i=>this.collisionRadii[i]);view.orbitOrder=this.orbitOrder.filter(n=>next.has(n.id));
    view.masses=indices.map(i=>this.masses[i]);view.centrality=indices.map(i=>this.centrality[i]);view.systemExtents=indices.map(i=>this.systemExtents[i]);view.links=this.links.filter(e=>next.has(e.from)&&next.has(e.to));view.activeAvoidance=null;
    view.bodyMinimum=(i,j)=>this.bodyMinimum(indices[i],indices[j]);view.orbitalClearance=(i,j)=>this.orbitalClearance(indices[i],indices[j]);
    view.sharedOrbits=(this.sharedOrbits||[]).filter(g=>next.has(g.id));view.bodyAvoidance=this.bodyAvoidance||=new Map();
    this.activeAvoidance=view;
    this.activeSharedOrbits=(this.sharedOrbits||[]).filter(g=>next.has(g.id)).map(g=>({...g,memberIndices:g.memberIndices.filter(i=>next.has(this.nodes[i].id))}));
  }

  orbitClock(id,orbit,key){
    if(this.activeIds){let clock=this.visibilityClocks.get(id);if(!clock){clock={angle:0,lastStep:-1,host:orbit.host};this.visibilityClocks.set(id,clock);}if(orbit.kind==='planet')this.orbitClocks.set(key,clock);return clock;}
    let clock=this.orbitClocks.get(key);if(!clock){clock={angle:0,lastStep:-1};this.orbitClocks.set(key,clock);}return clock;
  }

  spinAngle(id){return phaseOf(id)+(this.activeSpinTimes?.get(id)??this.time)*(this.spinRates?.[id]||.25)*SPIN_SPEED_MULTIPLIER;}

  bodyMinimum(i,j){
    return this.collisionRadii[i]+this.collisionRadii[j]+SURFACE_GAP;
  }
  stellarMinimum(i,j){if(this.starIds?.has(this.nodes[i].id)&&this.starIds.has(this.nodes[j].id))return this.bodyMinimum(i,j);
    return this.bodyMinimum(i,j)+Math.max(0,(this.systemExtents?.[i]||0)-this.collisionRadii[i])+Math.max(0,(this.systemExtents?.[j]||0)-this.collisionRadii[j]);}

  focalPosition(){
    if(!this.companionId)return this.positions[this.coreId]||this.center||[0,0,0];
    const indices=[...this.starIds].map(id=>this.nodeIndices.get(id)),total=indices.reduce((s,i)=>s+this.masses[i],0);
    return [0,1,2].map(k=>indices.reduce((s,i)=>s+this.positions[this.nodes[i].id][k]*this.masses[i],0)/total);
  }

  resolveStellarSpacing(){
    const stars=this.nodes.map((n,i)=>n.isMainTag?i:-1).filter(i=>i>=0),before=new Map(stars.map(i=>[this.nodes[i].id,[...this.positions[this.nodes[i].id]]]));
    for(let pass=0;pass<128;pass++){
      let overlapFound=false;
      for(let a=0;a<stars.length;a++)for(let b=a+1;b<stars.length;b++){
        const i=stars[a],j=stars[b],p=this.positions[this.nodes[i].id],q=this.positions[this.nodes[j].id],minimum=this.stellarMinimum(i,j);
        let delta=q.map((v,k)=>v-p[k]),length=Math.hypot(...delta);if(length>=minimum-1e-7)continue;
        if(length<1e-8){const phase=phaseOf(this.nodes[i].id+'|'+this.nodes[j].id);delta=[Math.cos(phase),0,Math.sin(phase)];length=0;}else delta=delta.map(v=>v/length);
        const wi=1/this.masses[i],wj=1/this.masses[j],total=wi+wj,vi=this.velocities[this.nodes[i].id],vj=this.velocities[this.nodes[j].id],closing=delta.reduce((s,v,k)=>s+(vj[k]-vi[k])*v,0);
        for(let k=0;k<3;k++){
          const correction=(minimum-length+1e-6)*delta[k];p[k]-=correction*wi/total;q[k]+=correction*wj/total;
          if(closing<0){vi[k]+=closing*delta[k]*wi/total;vj[k]-=closing*delta[k]*wj/total;}
        }
        overlapFound=true;
      }
      if(!overlapFound)break;
    }
    for(const [id,orbit]of Object.entries(this.orbits))if(!this.nodes[this.nodeIndices.get(id)]?.isMainTag){
      if(this.sharedOrbitIds.has(id))continue;
      let hostId=orbit.host;while(hostId&&!before.has(hostId)&&!this.sharedOrbitIds.has(hostId))hostId=this.orbits[hostId]?.host;
      if(!hostId||this.sharedOrbitIds.has(hostId))continue;const old=before.get(hostId),host=this.positions[hostId];
      for(let k=0;k<3;k++)this.positions[id][k]+=host[k]-old[k];
    }
  }

  stepGravity(){
    if(this.activeIds)for(const n of this.activeNodes)this.activeSpinTimes.set(n.id,(this.activeSpinTimes.get(n.id)||0)+(this.motionStepScale||1)/30);
    // Display choreography only: no force integration, impulses or escape velocities.
    const stars=[...this.starIds].map(id=>this.nodeIndices.get(id));
    if(this.centerTarget){let remaining=0;const alpha=1-Math.pow(.99,this.motionStepScale||1);this.center=this.center.map((x,k)=>{const d=this.centerTarget[k]-x;remaining+=d*d;return x+d*alpha;});if(remaining<1e-12){this.center=[...this.centerTarget];this.centerTarget=null;}}
    const center=this.center||[0,this.eclipticY,0];
    if(stars.length>1){
      const radius=this.centralOrbitRadius;
      const angle=this.steps*.001;
      const frame=this.centralOrbitFrame;
      const offsets=stars.map((i,k)=>{const a=angle+k*Math.PI*2/stars.length;return frame.u.map((u,j)=>(u*Math.cos(a)+frame.v[j]*Math.sin(a))*radius);});
      const mass=stars.reduce((sum,i)=>sum+this.masses[i],0);
      const mean=[0,1,2].map(a=>stars.reduce((sum,i,k)=>sum+offsets[k][a]*this.masses[i],0)/mass);
      stars.forEach((i,k)=>{const id=this.nodes[i].id;this.positions[id]=center.map((v,a)=>v+offsets[k][a]-mean[a]);this.velocities[id]=[0,0,0];});
    }else if(this.coreId){this.positions[this.coreId]=[...center];this.velocities[this.coreId]=[0,0,0];}
    const profileStart=performance.now();this.lockPlanetOrbits();const orbitEnd=performance.now();
    for(const n of this.freeNodes||this.nodes)if((!this.activeIds||this.activeIds.has(n.id))&&!this.starIds.has(n.id)&&!this.orbits[n.id]){
      const o=this.freeOrbits.get(n.id),a=o.phase+this.steps*.0007,r=o.radius;
      const frame=o.frame,goal=center.map((x,k)=>x+(frame.u[k]*Math.cos(a)+frame.v[k]*Math.sin(a))*r),old=this.positions[n.id];
      if(this.freeTransitions?.has(n.id)){const delta=goal.map((x,k)=>x-old[k]),distance=Math.hypot(...delta),limit=Math.max(.01,Math.hypot(...old.map((x,k)=>x-center[k]))*.02);this.positions[n.id]=old.map((x,k)=>x+delta[k]*Math.min(1,limit/(distance||1)));if(distance<=limit)this.freeTransitions.delete(n.id);}else this.positions[n.id]=goal;
      this.velocities[n.id]=this.positions[n.id].map((x,k)=>x-old[k]);
    }
    // Transfer cruise uses wall-clock time; ordinary orbit clocks keep their scale.
    const tourStart=performance.now();advanceSharedTours(this,(1/30)/Math.max(this.timeScale||1,1e-9)*(this.motionStepScale||1));
    const avoidStart=performance.now(),avoidance=this.activeAvoidance||this;
    if(avoidance.nodes.length){avoidance.positions=this.positions;avoidance.velocities=this.velocities;avoidance.transferPassThroughIds=this.transferPassThroughIds;resolveBodyAvoidance(avoidance);this.bodyAvoidancePrevious=avoidance.bodyAvoidancePrevious;this.bodyAvoidanceStats=avoidance.bodyAvoidanceStats;}
    this.stepCosts={orbits:orbitEnd-profileStart,tours:avoidStart-tourStart,avoidance:performance.now()-avoidStart};
  }
  lockPlanetOrbits({advance=true}={}){
    const stepScale=this.motionStepScale||1;
    if(advance)this.preparePlanetSpeeds();
    if(this.orbitHostSource!==this.orbits){this.orbitHostSource=this.orbits;this.orbitHostIds=new Set(Object.values(this.orbits).map(o=>o.host));this.orbitEvaluation=this.orbitOrder.filter(n=>this.orbits[n.id]&&this.orbits[n.id].kind!=='star').map(n=>({n,orbit:this.orbits[n.id],i:this.nodeIndices.get(n.id),host:this.nodeIndices.get(this.orbits[n.id].host),hasChildren:this.orbitHostIds.has(n.id)}));this.orbitWork={points:new Array(this.nodes.length),velocities:new Array(this.nodes.length),shifts:new Float64Array(this.nodes.length*3),boosts:new Float64Array(this.nodes.length*3)};}
    const tidalCache=new Map();
    const {points,velocities,shifts,boosts}=this.orbitWork;
    for(const i of this.activeIndices||this.nodes.map((_,i)=>i)){points[i]=this.positions[this.nodes[i].id];velocities[i]=this.velocities[this.nodes[i].id];for(let k=0;k<3;k++){shifts[i*3+k]=0;boosts[i*3+k]=0;}}
    this.activeOrbitEvaluation||=null;if(this.activeOrbitEvaluationSource!==this.orbitEvaluation){this.activeOrbitEvaluationSource=this.orbitEvaluation;this.activeOrbitEvaluation=this.activeIds?this.orbitEvaluation.filter(e=>this.activeIds.has(e.n.id)):this.orbitEvaluation;}
    for(const entry of this.activeOrbitEvaluation){
      const {n,orbit,i,host,hasChildren}=entry,p=points[i],v=velocities[i],oldP=hasChildren||orbit.motion?[...p]:null,oldV=hasChildren?[...v]:null;
      for(let a=0;a<3;a++){p[a]+=shifts[host*3+a];v[a]+=boosts[host*3+a];}
      {
        const q=points[host],u=velocities[host];
        let baseRadius=Math.max(orbit.targetRadius,this.bodyMinimum(i,host));
        if(orbit.motion){const m=orbit.motion,limit=Math.max(.01,m.radius*.015)*stepScale,delta=baseRadius-m.radius;
          if(advance){m.radius+=Math.max(-limit,Math.min(limit,delta));m.drift=Math.max(0,m.drift-.006*stepScale);
            const alpha=1-Math.pow(.99,stepScale),unit=v=>{const len=Math.hypot(...v)||1;return v.map(x=>x/len);},u=unit(m.frame.u.map((x,k)=>x+(orbit.frame.u[k]-x)*alpha)),raw=m.frame.v.map((x,k)=>x+(orbit.frame.v[k]-x)*alpha),dot=raw.reduce((sum,x,k)=>sum+x*u[k],0),v=unit(raw.map((x,k)=>x-dot*u[k]));
            m.frame={u,v,normal:[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]};
          }
          baseRadius=Math.max(m.radius,this.orbitalClearance(i,host));
        }
        const initialPhase=orbit.phase??Math.atan2(p[2]-q[2],p[0]-q[0]);
        // Per-body clocks remain continuous; bodies on one ring share angular speed.
        // Visual orbit periods stay observable even after clearance enlarges a ring.
        const omegaBase=orbit.kind==='planet'?(this.planetStepSpeeds?.get(n.id)||this.preferredPlanetSpeed(n.id,orbit)):this.preferredSatelliteSpeed(orbit),omega=omegaBase*stepScale;
        // Persistent clocks survive sync(): background imports must not reset
        // any descendant's revolution. Co-orbiting bodies share a phase clock.
        const clockKey=orbit.clockKey??=JSON.stringify([orbit.host,orbit.kind==='planet'?'planet:'+n.id:orbit.knowledgePlane?'knowledge':'satellite',orbit.kind==='planet'?0:orbit.localShell]);
        let clock=this.activeIds?this.orbitClock(n.id,orbit,clockKey):orbit.clockReference||this.orbitClocks.get(clockKey);
        if(!clock){clock={angle:0,lastStep:-1};this.orbitClocks.set(clockKey,clock);}
        orbit.clockReference=clock;
        if(advance&&clock.lastStep!==this.steps){clock.angle-=omega;clock.lastStep=this.steps;}
        orbit.angularVelocity=omegaBase;orbit.lockAngle=initialPhase+clock.angle+(orbit.motion?.drift||0);
        // Only local satellites receive a bounded, differential tidal response.
        const parentOrbit=this.orbits[orbit.host],ancestor=parentOrbit&&this.nodeIndices.get(parentOrbit.host);
        let perturbation=0;
        if(orbit.kind!=='planet'&&ancestor!==undefined){
          let byFrame=tidalCache.get(orbit.host);if(!byFrame){byFrame=new Map();tidalCache.set(orbit.host,byFrame);}
          let tidal=byFrame.get(orbit.frame);
          if(!tidal){const remote=this.positions[parentOrbit.host],dx=remote[0]-q[0],dy=remote[1]-q[1],dz=remote[2]-q[2],project=axis=>dx*axis[0]+dy*axis[1]+dz*axis[2];tidal={distance:Math.hypot(dx,dy,dz),ratio:this.masses[ancestor]/this.masses[host],direction:Math.atan2(project(orbit.frame.v),project(orbit.frame.u))};byFrame.set(orbit.frame,tidal);}
          const tide=tidal.ratio*(baseRadius/Math.max(tidal.distance,baseRadius))**3;
          const amplitude=Math.min(.02,Math.max(0,tide)*.1),direction=tidal.direction;
          perturbation=amplitude*Math.cos(2*(orbit.lockAngle-direction));
        }
        const radius=Math.max(this.bodyMinimum(i,host),baseRadius*(1+perturbation));
        orbit.radialPerturbation=perturbation;
        const c=Math.cos(orbit.lockAngle),s=Math.sin(orbit.lockAngle);
        const frame=orbit.motion?.frame||orbit.frame;
        let next;if(orbit.motion)next=this.steerPlanetTransition(n.id,orbit,oldP,q.map((x,a)=>x+(frame.u[a]*c+frame.v[a]*s)*radius),q);
        for(let a=0;a<3;a++){p[a]=next?next[a]:q[a]+(frame.u[a]*c+frame.v[a]*s)*radius;v[a]=orbit.motion?p[a]-oldP[a]:u[a]+(frame.u[a]*s-frame.v[a]*c)*radius*omega;}
        if(orbit.motion&&orbit.motion.drift===0&&Math.abs(orbit.motion.radius-orbit.targetRadius)<1e-7&&['u','v'].every(key=>orbit.motion.frame[key].every((x,k)=>Math.abs(x-orbit.frame[key][k])<1e-7)))delete orbit.motion;
      }
      if(hasChildren)for(let a=0;a<3;a++){shifts[i*3+a]=p[a]-oldP[a];boosts[i*3+a]=v[a]-oldV[a];}
    }
  }

  preferredPlanetSpeed(id,orbit){return .003/(1+(orbit.ring||0)*.14)*(.85+.3*phaseOf('planet-period:'+orbit.host)/(Math.PI*2));}
  preferredSatelliteSpeed(orbit){return .008/(1+(orbit.localShell||0)*.08)*(.85+.3*phaseOf('satellite-period:'+orbit.host)/(Math.PI*2));}
  preparePlanetSpeeds(){
    const speeds=new Map();
    if(this.planetSpeedSource!==this.orbits){this.planetSpeedSource=this.orbits;this.planetSpeedNodes=this.nodes.filter(n=>this.orbits[n.id]?.kind==='planet');}
    const activePlanets=this.activeIds?this.planetSpeedNodes.filter(n=>this.activeIds.has(n.id)):this.planetSpeedNodes;
    for(const n of activePlanets){const orbit=this.orbits[n.id],speed=this.preferredPlanetSpeed(n.id,orbit);
      // Keep accumulated angles, not old per-node speed offsets: equal-ring gaps stay fixed.
      const clock=this.orbitClock(n.id,orbit,JSON.stringify([orbit.host,'planet:'+n.id,0]));
      clock.omega=speed;orbit.preferredAngularVelocity=speed;speeds.set(n.id,speed);
    }
    this.planetStepSpeeds=speeds;
  }

  steerPlanetTransition(id,orbit,start,goal,host){
    const i=this.nodeIndices.get(id),relative=start.map((x,k)=>x-host[k]),radius=Math.hypot(...relative),limit=Math.max(.01,radius*.025);
    const obstacles=this.nodes.filter(n=>n.isMainTag&&n.id!==id).map(n=>({p:this.positions[n.id],minimum:Math.max(this.bodyMinimum(i,this.nodeIndices.get(n.id)),n.id===orbit.host?this.orbitalClearance(i,this.nodeIndices.get(n.id)):0)}));
    const clear=end=>obstacles.every(({p,minimum})=>{
      const delta=end.map((x,k)=>x-start[k]),d2=delta.reduce((sum,x)=>sum+x*x,0),t=d2?Math.max(0,Math.min(1,p.reduce((sum,x,k)=>sum+(x-start[k])*delta[k],0)/d2)):0;
      const before=Math.hypot(...start.map((x,k)=>x-p[k])),closest=Math.hypot(...start.map((x,k)=>x+delta[k]*t-p[k]));
      return closest>=Math.min(minimum,before)-1e-7&&Math.hypot(...end.map((x,k)=>x-p[k]))>=Math.min(minimum,before)-1e-7;
    });
    const delta=goal.map((x,k)=>x-start[k]),length=Math.hypot(...delta),candidate=start.map((x,k)=>x+delta[k]*Math.min(1,limit/(length||1)));
    if(length<=limit&&clear(candidate))return goal;
    let accepted=clear(candidate)?candidate:null;
    if(!accepted){
      const frame=orbit.motion.frame,c=Math.cos(orbit.lockAngle),s=Math.sin(orbit.lockAngle),radial=relative.map(x=>x/(radius||1)),forward=frame.u.map((x,k)=>x*s-frame.v[k]*c);
      const directions=[forward,forward.map((x,k)=>x+radial[k]),radial,forward.map((x,k)=>x+frame.normal[k]),forward.map((x,k)=>x-frame.normal[k]),frame.normal,frame.normal.map(x=>-x)];
      for(const direction of directions){const len=Math.hypot(...direction)||1,p=start.map((x,k)=>x+direction[k]*limit/len);if(clear(p)){accepted=p;break;}}
    }
    accepted||=[...start];
    const r=accepted.map((x,k)=>x-host[k]),reach=Math.hypot(...r)||1,unit=r.map(x=>x/reach),c=Math.cos(orbit.lockAngle),s=Math.sin(orbit.lockAngle),old=orbit.motion.frame,tangent=old.u.map((x,k)=>-x*s+old.v[k]*c),dot=tangent.reduce((sum,x,k)=>sum+x*unit[k],0),v=tangent.map((x,k)=>x-dot*unit[k]),len=Math.hypot(...v)||1;
    for(let k=0;k<3;k++)v[k]/=len;
    const u=unit.map((x,k)=>x*c-v[k]*s),w=unit.map((x,k)=>x*s+v[k]*c);
    orbit.motion.radius=reach;orbit.motion.frame={u,v:w,normal:[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]};
    return accepted;
  }

  settleEcliptic(){
    for(const n of this.nodes){const p=this.positions[n.id],v=this.velocities[n.id];p[1]=this.eclipticY+(p[1]-this.eclipticY)*.99;v[1]*=.94;}
  }

  balanceSharedOrbits(){
    if(!this.sharedOrbits.length)return;
    const changes=new Map(),counts=new Map(),add=(i,vector)=>{if(!changes.has(i))changes.set(i,[0,0,0]);const sum=changes.get(i);for(let a=0;a<3;a++)sum[a]+=vector[a];counts.set(i,(counts.get(i)||0)+1);};
    for(const group of this.sharedOrbits){
      const p=this.positions[group.id],distances=group.hosts.map(i=>Math.hypot(...p.map((v,a)=>v-this.positions[this.nodes[i].id][a])));
      const mean=Math.max(distances.reduce((s,d)=>s+d,0)/distances.length,...group.hosts.map(i=>this.bodyMinimum(group.index,i)));
      for(let k=0;k<group.hosts.length;k++){
        const host=group.hosts[k],q=this.positions[this.nodes[host].id],d=distances[k],phase=phaseOf(group.id+'|'+this.nodes[host].id),direction=d>.001?p.map((v,a)=>(v-q[a])/d):[Math.cos(phase),0,Math.sin(phase)];
        const error=d-mean,bridgeMobility=1/Math.sqrt(this.masses[group.index]),starMobility=1/Math.sqrt(this.masses[host]),total=bridgeMobility+starMobility;
        add(group.index,direction.map((v,a)=>a===1?0:-v*error*.035*bridgeMobility/total));
        add(host,direction.map((v,a)=>a===1?0:v*error*.035*starMobility/total));
      }
    }
    const shifts=new Map(),boosts=new Map();
    for(const n of this.orbitOrder){
      const i=this.nodeIndices.get(n.id),sum=changes.get(i)||[0,0,0],average=sum.map(v=>v/(counts.get(i)||1)),length=Math.hypot(...average),limit=this.spacing*(n.isMainTag?.004:.016)/Math.pow(this.masses[i],.1);
      const shift=average.map(v=>v*Math.min(1,limit/(length||1))),boost=shift.map(v=>v*.02),orbit=this.orbits[n.id];
      if(orbit&&orbit.kind!=='star'&&!this.sharedOrbitIds.has(n.id))for(let a=0;a<3;a++){shift[a]+=shifts.get(orbit.host)?.[a]||0;boost[a]+=boosts.get(orbit.host)?.[a]||0;}
      if(shift.some(v=>v!==0)){for(let a=0;a<3;a++){this.positions[n.id][a]+=shift[a];this.velocities[n.id][a]+=boost[a];}shifts.set(n.id,shift);boosts.set(n.id,boost);}
    }
  }

  systemGravity(positions,masses,G,softening){
    // Shared-system gravity remains full strength; remote systems perturb gently.
    const external=.18,result=gravityAccelerations(positions,masses,G,softening).map(a=>a.map(v=>v*external));
    const addGroup=ids=>{const local=gravityAccelerations(ids.map(i=>positions[i]),ids.map(i=>masses[i]),G,softening);for(let k=0;k<ids.length;k++)for(let a=0;a<3;a++)result[ids[k]][a]+=local[k][a]*(1-external);return local;};
    const starPull=addGroup(this.stellarIndices),starOrder=new Map(this.stellarIndices.map((i,k)=>[i,k]));
    for(const group of this.gravitySystems){
      addGroup(group);const root=group.find(i=>starOrder.has(i)),pull=starPull[starOrder.get(root)];
      // Carry the host's common external acceleration; attenuate only tidal shear.
      for(const i of group)if(i!==root)for(let a=0;a<3;a++)result[i][a]+=pull[a]*(1-external);
    }
    for(const group of this.sharedGravitySystems){
      addGroup(group.members);
      const common=[0,1,2].map(a=>group.hosts.reduce((sum,i)=>sum+starPull[starOrder.get(i)][a],0)/group.hosts.length);
      for(const i of group.members){
        for(let a=0;a<3;a++)result[i][a]+=common[a]*(1-external);
        for(const host of group.hosts){const delta=positions[host].map((v,a)=>v-positions[i][a]),r2=delta.reduce((s,v)=>s+v*v,softening*softening);if(!r2)continue;
          const scale=G*(1-external)/group.hosts.length/(r2*Math.sqrt(r2));for(let a=0;a<3;a++){result[i][a]+=delta[a]*masses[host]*scale;result[host][a]-=delta[a]*masses[i]*scale;}
        }
      }
    }
    return result;
  }

  orbitalClearance(i,host){return 5*this.collisionRadii[host]+this.collisionRadii[i];}

  protectPlanetOrbits(){
    const index=new Map(this.nodes.map((n,i)=>[n.id,i])),shifts=new Map(),boosts=new Map();
    for(const n of this.orbitOrder){
      const orbit=this.orbits[n.id];if(!orbit||orbit.kind==='star')continue;
      const p=this.positions[n.id],v=this.velocities[n.id],oldP=[...p],oldV=[...v],dp=shifts.get(orbit.host),dv=boosts.get(orbit.host);
      for(let a=0;a<3;a++){if(dp)p[a]+=dp[a];if(dv)v[a]+=dv[a];}
      const i=index.get(n.id),host=index.get(orbit.host),q=this.positions[orbit.host],u=this.velocities[orbit.host],delta=p.map((value,a)=>value-q[a]);
      const radius=Math.hypot(...delta),minimum=this.orbitalClearance(i,host),phase=phaseOf(n.id),normal=radius>.001?delta.map(x=>x/radius):[Math.cos(phase),0,Math.sin(phase)];
      // Compact display orbits need bounded radial drift as well as surface clearance.
      const desired=Math.max(minimum,orbit.radius),radial=normal.reduce((sum,x,a)=>sum+(v[a]-u[a])*x,0);
      const correction=(desired-radius)*.002;
      if(!n.isMainTag)for(let a=0;a<3;a++){p[a]+=normal[a]*correction;v[a]-=normal[a]*radial*.04;}
      if(radius<minimum*1.15){
        const radialVelocity=normal.reduce((sum,x,a)=>sum+(v[a]-u[a])*x,0);
        if(radius<minimum)for(let a=0;a<3;a++)p[a]=q[a]+normal[a]*minimum;
        if(radialVelocity<0&&radius<=minimum)for(let a=0;a<3;a++)v[a]-=normal[a]*radialVelocity;
        const currentRadial=normal.reduce((sum,x,a)=>sum+(v[a]-u[a])*x,0);
        const tangent=v.map((x,a)=>x-u[a]-normal[a]*currentRadial),speed=Math.hypot(...tangent),target=.95*Math.sqrt(this.G*(this.masses[i]+this.masses[host])/Math.max(radius,minimum));
        if(speed<target){const axis=orbit.axis,cross=[axis[1]*normal[2]-axis[2]*normal[1],axis[2]*normal[0]-axis[0]*normal[2],axis[0]*normal[1]-axis[1]*normal[0]],length=Math.hypot(...cross)||1,amount=Math.min(target*.08,target-speed);for(let a=0;a<3;a++)v[a]+=(speed>1e-6?tangent[a]/speed:cross[a]/length)*amount;}
      }
      const shift=p.map((x,a)=>x-oldP[a]),boost=v.map((x,a)=>x-oldV[a]);if(shift.some(x=>x!==0))shifts.set(n.id,shift);if(boost.some(x=>x!==0))boosts.set(n.id,boost);
    }
  }

  resolveCollisions(){
    const nodes=this.nodes,positions=nodes.map(n=>this.positions[n.id]);
    const inverse=nodes.map((n,i)=>1/this.masses[i]);
    // Sweep sphere bounds, without the repulsion sampler's neighbour limit.
    for(let pass=0;pass<(nodes.length<=180?128:32);pass++){
      const order=nodes.map((n,i)=>i).sort((i,j)=>(positions[i][0]-11*this.collisionRadii[i])-(positions[j][0]-11*this.collisionRadii[j]));
      let changed=false;
      for(let a=0;a<order.length;a++)for(let b=a+1;b<order.length;b++){
        const i=order[a],j=order[b],p=positions[i],q=positions[j],minimum=this.bodyMinimum(i,j);
        if(q[0]-11*this.collisionRadii[j]>p[0]+11*this.collisionRadii[i])break;
        let delta=q.map((v,axis)=>v-p[axis]),length=Math.hypot(...delta);
        if(length>=minimum-1e-7)continue;
        if(length<1e-8){const phase=phaseOf(nodes[i].id+'|'+nodes[j].id);delta=[Math.cos(phase),0,Math.sin(phase)];length=0;}else delta=delta.map(v=>v/length);
        const total=inverse[i]+inverse[j];if(!total)continue;
        const overlap=minimum-length+1e-6,vi=this.velocities[nodes[i].id],vj=this.velocities[nodes[j].id];
        const closing=delta.reduce((sum,v,axis)=>sum+(vj[axis]-vi[axis])*v,0);
        for(let axis=0;axis<3;axis++){
          p[axis]-=delta[axis]*overlap*inverse[i]/total;q[axis]+=delta[axis]*overlap*inverse[j]/total;
          if(closing<0){vi[axis]+=delta[axis]*closing*inverse[i]/total;vj[axis]-=delta[axis]*closing*inverse[j]/total;}
        }
        changed=true;
      }
      if(!changed)break;
    }
  }

  checkpoint() {
    return Object.fromEntries(
      this.nodes.filter(n=>!n.isMainTag).map((n) => [n.id, [...this.positions[n.id]]]),
    );
  }
}
