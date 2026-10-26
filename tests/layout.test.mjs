import test from "node:test";
import assert from "node:assert/strict";
import { AffinityLayout,gravityAccelerations,integrateGravity,BASE_ANIMATION_SPEED,SPIN_SPEED_MULTIPLIER } from "../public/layout.js";
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const nodes = ["a", "b", "c", "d"].map((id) => ({ id }));
const edges = [
  { from: "a", to: "b", type: "logic", strength: 0.95 },
  { from: "c", to: "d", type: "related", strength: 0.15 },
];
const seeds = {
  a: [-100, -40, 0],
  b: [-10, -40, 0],
  c: [10, 40, 0],
  d: [100, 40, 0],
};

test('Newtonian gravity obeys inverse-square distance, mass scaling and equal opposite forces',()=>{
  const near=gravityAccelerations([[0,0,0],[10,0,0]],[2,5],1),far=gravityAccelerations([[0,0,0],[20,0,0]],[2,5],1);
  assert.ok(Math.abs(near[0][0]/far[0][0]-4)<1e-12);
  assert.ok(Math.abs(near[0][0]*2+near[1][0]*5)<1e-12);
  assert.equal(near[0][1],0);assert.ok(near[1][0]<0);
});

test('leapfrog preserves two-body orbital energy and momentum without display constraints',()=>{
  const masses=[100,1],G=.01,r=50,speed=Math.sqrt(G*101/r);
  const p=[[-r/101,0,0],[r*100/101,0,0]],v=[[0,0,-speed/101],[0,0,speed*100/101]];
  const energy=()=>masses.reduce((sum,m,i)=>sum+m*v[i].reduce((s,x)=>s+x*x,0)/2,0)-G*100/distance(p[0],p[1]);
  const initial=energy();for(let i=0;i<10000;i++)integrateGravity(p,v,masses,G);
  assert.ok(Math.abs((energy()-initial)/initial)<1e-4);
  for(let a=0;a<3;a++){assert.ok(Math.abs(v[0][a]*100+v[1][a])<1e-10);assert.ok(Math.abs(p[0][a]*100+p[1][a])<1e-8);}
});

test('mass-tree gravity stays close to direct summation for a large graph',()=>{
  const p=Array.from({length:260},(_,i)=>[Math.sin(i*13.7)*300,Math.cos(i*3.1)*280,Math.sin(i*4.3)*250]),m=p.map((_,i)=>1+i%11);
  const approximate=gravityAccelerations(p,m,.01,.3),exact=gravityAccelerations(p,m,.01,.3,0);
  const error=Math.sqrt(approximate.reduce((sum,a,i)=>sum+a.reduce((s,v,k)=>s+(v-exact[i][k])**2,0),0)/exact.reduce((sum,a)=>sum+a.reduce((s,v)=>s+v*v,0),0));
  assert.ok(error<.03,JSON.stringify({error}));
});

test('all network kinds retain one primary and orbit lesser centres',()=>{
 for(const kind of ['vault','knowledge','skill']){const l=new AffinityLayout(),nodes=[{id:'a',kind,isMainTag:true,domainConnectionCount:100},{id:'b',kind,isMainTag:true,domainConnectionCount:90}];l.sync({nodes,edges:[]});assert.equal(l.companionId,null);assert.deepEqual([...l.starIds],['a']);l.step();const before=structuredClone(l.positions);for(let i=0;i<100;i++)l.step();assert.deepEqual(l.positions.a,before.a);assert.ok(distance(l.positions.b,before.b)>.001);assert.ok(distance(l.positions.a,l.positions.b)>=l.orbitalClearance(1,0));}
});

test('planetary bands double from four with distinct initial positions',()=>{
  const l=new AffinityLayout(),nodes=Array.from({length:73},(_,i)=>({id:'label'+String(i).padStart(2,'0'),isMainTag:true,domainConnectionCount:i===0?1000:100-i}));
  l.sync({nodes,edges:[],seeds:Object.fromEntries(nodes.map(n=>[n.id,[0,0,0]]))});
  const planets=Object.values(l.orbits).filter(o=>o.kind==='planet'),rings=new Map();
  for(const o of planets){if(!rings.has(o.ring))rings.set(o.ring,[]);rings.get(o.ring).push(o);}
  assert.equal(planets.length,72);assert.equal(rings.size,5);
  assert.deepEqual([...rings.values()].map(g=>g.length),[4,8,16,32,12]);
  for(const group of rings.values()){assert.equal(new Set(group.map(o=>o.slot)).size,group.length);assert.equal(new Set(group.map(o=>o.targetRadius)).size,1);}
  l.step();assert.equal(new Set(nodes.map(n=>JSON.stringify(l.positions[n.id]))).size,73);
  for(const n of nodes)assert.ok(l.positions[n.id].every(Number.isFinite));
});

test('fixed planet rings reject radial perturbations while preserving angular slots and satellite offsets',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:1000},...Array.from({length:8},(_,i)=>({id:'p'+i,isMainTag:true,domainConnectionCount:30-i})),{id:'moon'}];
  l.sync({nodes,edges:[{from:'p0',to:'moon',membershipLink:true,strength:1}]});l.step();
  const before=[...l.positions.p0];
  l.positions.p0[0]+=10000;l.velocities.p0=[1000,1000,1000];
  for(let i=0;i<300;i++){
    l.step();for(let k=0;k<8;k++)assert.ok(Math.abs(distance(l.positions['p'+k],l.positions.sun)-l.orbits['p'+k].targetRadius)<1e-7);
  }
  assert.ok(distance(before,l.positions.p0)>1);assert.ok(l.positions.moon.every(Number.isFinite));
  l.positions.p0[0]+=100;l.lockPlanetOrbits();
  assert.ok(Math.abs(distance(l.positions.moon,l.positions.p0)/l.orbits.moon.targetRadius-1)<=.020001);
});

test('satellite and subsatellite orbits remain within two percent under exaggerated external influence',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',kind:'knowledge',isMainTag:true,domainConnectionCount:1000},{id:'p',kind:'knowledge',isMainTag:true,domainConnectionCount:30},{id:'moon',kind:'knowledge'},{id:'submoon',kind:'knowledge'}];
  l.sync({nodes,edges:[{from:'p',to:'moon',membershipLink:true,strength:1},{from:'moon',to:'submoon',type:'contains',strength:1,sources:[{quote:'contains'}]}]});
  l.step();l.masses[0]*=10000;let maxPerturbation=0;
  for(let i=0;i<600;i++){
    l.velocities.moon[0]+=100;l.positions.submoon[2]+=100;
    l.step();for(const id of ['moon','submoon']){
      const o=l.orbits[id],r=distance(l.positions[id],l.positions[o.host]);
      assert.ok(Math.abs(r/o.targetRadius-1)<=.020001);maxPerturbation=Math.max(maxPerturbation,Math.abs(o.radialPerturbation));
    }
  }
  assert.ok(maxPerturbation>0&&maxPerturbation<=.02);
});

test('satellite descendants retain their full local envelope without forcing whole-group separation',()=>{
  for(const kind of ['vault','knowledge','skill']){
    const l=new AffinityLayout(),nodes=[{id:'sun',kind,isMainTag:true,domainConnectionCount:1000},{id:'p',kind,isMainTag:true,domainConnectionCount:30},{id:'moon',kind},{id:'submoon',kind},{id:'deep',kind}];
    const edges=[{from:'p',to:'moon',membershipLink:true,strength:1},...['moon','submoon'].map((from,i)=>({from,to:i?'deep':'submoon',type:'contains',strength:1,sources:[{quote:'contains'}]}))];
    l.sync({nodes,edges});
    for(let step=0;step<400;step++){
      l.step();const range=l.systemExtents[l.nodeIndices.get("p")];
      for(const id of ['moon','submoon','deep']){
        const extent=distance(l.positions[id],l.positions.p)+l.collisionRadii[l.nodeIndices.get(id)];
        assert.ok(extent<=range+1e-6,JSON.stringify({kind,id,extent,range}));
      }
    }
  }
});

test('many satellites form a compact local cluster and cannot be pushed away from their planet',()=>{
  const l=new AffinityLayout(),satellites=Array.from({length:60},(_,i)=>({id:'s'+String(i).padStart(2,'0')})),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:1000},{id:'p',isMainTag:true,domainConnectionCount:60},...satellites];
  l.sync({nodes,edges:satellites.map(n=>({from:'p',to:n.id,membershipLink:true,strength:1}))});
  const hostRadius=l.collisionRadii[1],max=Math.max(...satellites.map(n=>l.orbits[n.id].targetRadius));
  assert.ok(max<hostRadius+60*l.collisionRadii[2]);
  for(let i=0;i<40;i++){
    l.step();for(const n of satellites){const r=distance(l.positions[n.id],l.positions.p);assert.ok(r<=l.orbits[n.id].targetRadius*1.020001);assert.ok(r>=hostRadius+l.collisionRadii[l.nodeIndices.get(n.id)]);}
  }
});

test('visible source knowledge keeps its derived material nearby without changing identities or relations',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',kind:'knowledge',isMainTag:true,domainConnectionCount:1000},{id:'domain',kind:'knowledge',isMainTag:true,domainConnectionCount:30},{id:'source',kind:'knowledge'},{id:'derived',kind:'knowledge',sources:[{id:'source'}]}];
  const edges=['source','derived'].map(to=>({from:'domain',to,membershipLink:true,strength:1})),original=JSON.stringify({nodes,edges});
  l.sync({nodes,edges});assert.equal(l.orbits.derived.host,'source');
  for(let i=0;i<200;i++){l.step();assert.ok(distance(l.positions.derived,l.positions.source)<=l.orbits.derived.targetRadius*1.020001);}
  assert.equal(JSON.stringify({nodes,edges}),original);assert.equal(l.nodes.length,4);
});

test('single-primary visual groups ignore injected escape velocities and do not run force integration',()=>{
  for(const count of [2,3]){
    const l=new AffinityLayout(),nodes=[...Array.from({length:count},(_,i)=>({id:'star'+i,isMainTag:true,domainConnectionCount:100-i*5})),{id:'p',isMainTag:true,domainConnectionCount:20},{id:'moon'}];
    l.sync({nodes,edges:[{from:'p',to:'moon',membershipLink:true,strength:1}]});
    assert.equal(l.starIds.size,1);l.systemGravity=()=>{throw Error('N-body integration must not run in display mode');};
    const center=[...l.center];
    for(let t=0;t<200;t++){
      for(const n of nodes)l.velocities[n.id]=[1e9,-1e9,1e9];
      l.step();assert.ok(distance(l.focalPosition(),center)<1e-7);
      assert.ok(Math.abs(distance(l.positions.p,l.positions.star0)-l.orbits.p.targetRadius)<1e-7);
      assert.ok(distance(l.positions.moon,l.positions.p)<=l.orbits.moon.targetRadius*1.020001);
    }
  }
});

test('all 3D spheres avoid penetration across groups, nested satellites, unassigned nodes and growth',()=>{
  for(const leaderCounts of [[1000,60,40],[100,95,90]]){
    const l=new AffinityLayout(),nodes=leaderCounts.map((count,i)=>({id:'core'+i,kind:'knowledge',isMainTag:true,domainConnectionCount:count})),edges=[];
    for(let host=0;host<3;host++)for(let k=0;k<12;k++){
      const id='sat'+host+'-'+k;nodes.push({id,kind:'knowledge'});edges.push({from:'core'+host,to:id,membershipLink:true,strength:1});
      if(k===0){nodes.push({id:'child'+host,kind:'knowledge'});edges.push({from:id,to:'child'+host,type:'contains',strength:1,sources:[{quote:'contains'}]});}
    }
    nodes.push({id:'multi',kind:'knowledge'},...Array.from({length:8},(_,i)=>({id:'free'+i,kind:'knowledge'})));
    edges.push(...[0,1,2].map(i=>({from:'core'+i,to:'multi',membershipLink:true,strength:1})));
    for(const baseRadius of [2,4]){
      l.sync({nodes,edges,baseRadius});
      for(let t=0;t<180;t++){
        l.step();for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
          const d=distance(l.positions[nodes[i].id],l.positions[nodes[j].id]),minimum=l.bodyMinimum(i,j);
          assert.ok(d>=minimum-1e-7,JSON.stringify({leaderCounts,baseRadius,t,i,j,d,minimum}));
        }
      }
    }
  }
});

test('large planet labels keep their local systems clear, including after growth',()=>{
  const l=new AffinityLayout(),nodes=Array.from({length:12},(_,i)=>({id:'star'+i,isMainTag:true,domainConnectionCount:i*4}));
  const seeds=Object.fromEntries(nodes.map(n=>[n.id,[0,0,0]]));l.sync({nodes,edges:[],seeds});
  for(let k=0;k<3;k++)l.resolveStellarSpacing();
  const verify=()=>{for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(distance(l.positions[nodes[i].id],l.positions[nodes[j].id])>=l.stellarMinimum(i,j)-1e-4);};
  verify();nodes[0]={...nodes[0],domainConnectionCount:150};l.sync({nodes,edges:[]});
  for(let k=0;k<3;k++)l.resolveStellarSpacing();verify();
  for(let k=0;k<30;k++){l.step();verify();}
});

test('largest label stays at the exact center while leaves move toward it',()=>{
  const l=new AffinityLayout();
  l.sync({nodes:[{id:'core',isMainTag:true,domainConnectionCount:50},{id:'leaf'}],edges:[{from:'core',to:'leaf',type:'related',strength:1}],seeds:{core:[0,0,0],leaf:[180,0,0]}});
  // Apply equal initial separation after insertion's neighbour-based placement.
  l.positions.core=[0,0,0];l.positions.leaf=[180,0,0];
  l.restPositions.core=[0,0,0];l.restPositions.leaf=[180,0,0];
  for(let i=0;i<120;i++)l.step({floating:false});
  const coreTravel=distance(l.positions.core,[0,0,0]),leafTravel=distance(l.positions.leaf,[180,0,0]);
  assert.equal(coreTravel,0);assert.ok(leafTravel>0);
  assert.ok(distance(l.positions.core,l.positions.leaf)<180);
  const before=[...l.positions.core];
  l.sync({nodes:[{id:'core',isMainTag:true,domainConnectionCount:100},{id:'leaf'}],edges:[{from:'core',to:'leaf',type:'related',strength:1}]});
  assert.deepEqual(l.positions.core,before);
  assert.ok(l.masses[0]<=10.000000001);
});

test('largest label defines the true center and changing the dominant label does not teleport nodes',()=>{
  const l=new AffinityLayout();
  const input=[{id:'large',isMainTag:true,domainConnectionCount:100},{id:'small',isMainTag:true,domainConnectionCount:3}];
  l.sync({nodes:input,edges:[],seeds:{large:[150,0,0],small:[-150,0,0]}});
  const center=[...l.center];assert.deepEqual(center,l.positions.large);assert.equal(l.coreId,'large');
  for(let i=0;i<5000;i++)l.step();
  assert.equal(distance(l.positions.large,center),0);
  assert.ok(distance(l.positions.large,center)<distance(l.positions.small,center));
  const before=structuredClone(l.positions);
  l.sync({nodes:input.map(n=>({...n,domainConnectionCount:n.id==='small'?200:100})),edges:[]});
  assert.deepEqual({...l.positions},before);assert.deepEqual(l.center,before.small);assert.deepEqual(l.centerTarget,center);assert.equal(l.coreId,'small');
  assert.ok(l.centrality[1]>l.centrality[0]);
  const initialDistance=distance(l.positions.small,center),oldCore=[...l.positions.large];
  l.step();assert.ok(distance(l.positions.small,before.small)<initialDistance*.05);
  for(let i=0;i<7000;i++)l.step();
  const stellar=[...l.starIds].map(id=>l.nodeIndices.get(id)),mass=stellar.reduce((sum,i)=>sum+l.masses[i],0),barycenter=[0,1,2].map(k=>stellar.reduce((sum,i)=>sum+l.positions[l.nodes[i].id][k]*l.masses[i],0)/mass);assert.ok(distance(barycenter,center)<1e-6);
  assert.ok(distance(l.positions.large,oldCore)>1);
  assert.deepEqual(l.center,center);
});

test('compact planets, moons and submoons retain collision clearance, including siblings and growth',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:20},{id:'planet'},{id:'moon'},{id:'submoon'}],sources=[{id:'fixture',quote:'从属依据'}];
  const edges=[{from:'sun',to:'planet',membershipLink:true,type:'@semantic',strength:1},{from:'planet',to:'moon',type:'contains',strength:1,sources},{from:'moon',to:'submoon',type:'contains',strength:1,sources}];
  l.sync({nodes,edges,seeds:Object.fromEntries(nodes.map(n=>[n.id,[0,0,0]]))});
  const verify=()=>{for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const gap=distance(l.positions[nodes[i].id],l.positions[nodes[j].id])-l.collisionRadii[i]-l.collisionRadii[j];
    assert.ok(gap>=.02-1e-4,JSON.stringify({i,j,gap}));
  }};
  l.resolveCollisions();verify();l.sync({nodes,edges,baseRadius:4});l.resolveCollisions();verify();
  for(let i=0;i<20;i++){l.step();verify();}
});

test('satellite shells pack individual subtrees safely and remain local to their host',()=>{
  const l=new AffinityLayout(),planets=Array.from({length:9},(_,i)=>({id:'p'+i,kind:'knowledge'})),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:20},...planets,{id:'moon',kind:'knowledge'}];
  const edges=[...planets.map(n=>({from:'sun',to:n.id,membershipLink:true,strength:1})),{from:'p0',to:'moon',type:'contains',strength:1,sources:[{quote:'contains'}]}];
  l.sync({nodes,edges});const radii=planets.map(n=>l.orbits[n.id].targetRadius);
  assert.equal(l.orbits.p0.globalRow,0);assert.equal(l.orbits.p1.globalRow,1);assert.equal(l.orbits.p2.globalRow,2);assert.ok(radii[1]>radii[0]);assert.ok(radii[6]>radii[1]);
  assert.ok(l.orbits.moon.targetRadius<radii[0]);
  assert.ok(radii[0]<l.collisionRadii[0]+l.collisionRadii[1]+10*l.collisionRadii[0]);
  l.step();assert.ok(Math.abs(distance(l.positions.p0,l.positions.sun)-radii[0])<radii[0]*.1);
  for(let step=0;step<400;step++){l.step();for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(distance(l.positions[nodes[i].id],l.positions[nodes[j].id])>=l.bodyMinimum(i,j)-1e-6);}
});

test('collision spheres match displayed size, separate coincident nodes and move heavy bodies less',()=>{
  const l=new AffinityLayout();
  l.sync({nodes:[{id:'large',isMainTag:true,domainConnectionCount:20},{id:'small'}],edges:[],baseRadius:3});
  assert.ok(Math.abs(l.collisionRadii[0]-3*1.4*1.2)<1e-9);assert.equal(l.collisionRadii[1],3);
  l.positions.large=[0,0,0];l.positions.small=[0,0,0];l.center=[0,0,0];
  l.resolveCollisions();
  assert.ok(distance(l.positions.large,l.positions.small)>=l.bodyMinimum(0,1)-1e-7);
  assert.ok(distance(l.positions.large,[0,0,0])<distance(l.positions.small,[0,0,0]));
  const before=structuredClone(l.positions);
  l.sync({nodes:[{id:'large',isMainTag:true,domainConnectionCount:100},{id:'small'}],edges:[],baseRadius:3});
  assert.deepEqual({...l.positions},before);l.resolveCollisions();
  assert.ok(distance(l.positions.large,l.positions.small)>=l.bodyMinimum(0,1)-1e-7);
});

test('single central star stays anchored while its planet follows a bounded display orbit',()=>{
  const l=new AffinityLayout();
  l.sync({nodes:[{id:'core',isMainTag:true,domainConnectionCount:80},{id:'other',isMainTag:true,domainConnectionCount:10}],edges:[],seeds:{core:[0,0,0],other:[150,0,0]}});
  const before=structuredClone(l.positions),center=[...l.center];
  for(let i=0;i<900;i++)l.step();
  assert.equal(distance(l.positions.core,before.core),0);
  assert.ok(distance(l.positions.other,before.other)>1e-4);
  assert.ok(distance(l.positions.core,before.core)<distance(l.positions.other,before.other));
  assert.deepEqual(l.center,center);
});

test('collision detection includes distant large spheres and is not limited by large-graph repulsion sampling',()=>{
  const l=new AffinityLayout(),input=Array.from({length:200},(_,i)=>({id:'n'+i}));
  l.sync({nodes:input,edges:[],baseRadius:4});
  input.forEach((n,i)=>l.positions[n.id]=[i*100,0,0]);
  l.positions.n199=[3,0,0];l.resolveCollisions();
  assert.ok(distance(l.positions.n0,l.positions.n199)>=l.bodyMinimum(0,199)-1e-7);
  for(const p of Object.values(l.positions))assert.ok(p.every(Number.isFinite));
});

test('attached planets complete orbits around their star with bounded radius and continuous axial spin',()=>{
  const l=new AffinityLayout();
  const input=[{id:'sun',isMainTag:true,domainConnectionCount:5},{id:'planet'}];
  const edges=[{from:'sun',to:'planet',type:'@semantic',membershipLink:true,semanticAnchor:true,strength:1}];
  l.sync({nodes:input,edges,seeds:{sun:[0,0,0],planet:[30,0,0]}});
  l.positions.planet=[30,0,0];
  const spin=l.spinAngle('planet');let angle=Math.atan2(l.positions.planet[2],l.positions.planet[0]),travel=0;
  const period=2*Math.PI/.008;
  for(let i=0;i<Math.ceil(period*1.5);i++){
    l.step();const delta=l.positions.planet.map((v,a)=>v-l.positions.sun[a]);
    const next=Math.atan2(delta[2],delta[0]);let change=next-angle;
    while(change>Math.PI)change-=2*Math.PI;while(change<-Math.PI)change+=2*Math.PI;
    travel+=change;angle=next;
    assert.ok(distance(l.positions.planet,l.positions.sun)>=l.collisionRadii[0]+l.collisionRadii[1]-1e-6);
  }
  assert.ok(Math.abs(travel)>Math.PI*2,JSON.stringify({travel}));
  assert.ok(Math.abs(distance(l.positions.planet,l.positions.sun)-l.orbits.planet.radius)<l.orbits.planet.radius*.25);
  assert.equal(l.spinAngle('planet'),spin);
  const positions=structuredClone(l.positions),time=l.time;l.sync({nodes:input,edges});
  assert.deepEqual({...l.positions},positions);assert.equal(l.time,time);
});

test('only the largest label is a star; other labels are planets carrying their satellites',()=>{
  const l=new AffinityLayout(),input=[{id:'primary',isMainTag:true,domainConnectionCount:60},{id:'secondary',isMainTag:true,domainConnectionCount:4},{id:'planet'}];
  const edges=[{from:'secondary',to:'planet',type:'@semantic',membershipLink:true,strength:1}];
  l.sync({nodes:input,edges,seeds:{primary:[0,0,0],secondary:[150,0,0],planet:[180,0,0]}});
  assert.equal(l.orbits.secondary.host,'primary');assert.equal(l.orbits.planet.host,'secondary');
  assert.equal(l.bodyRoles.primary,'star');assert.equal(l.bodyRoles.secondary,'planet');assert.equal(l.bodyRoles.planet,'satellite');
  assert.equal(Object.values(l.bodyRoles).filter(r=>r==='star').length,1);assert.equal(l.orbits.secondary.kind,'planet');
  let previous=Math.atan2(l.positions.secondary[2],l.positions.secondary[0]),travel=0;
  const spin=l.spinAngle('secondary');
  for(let i=0;i<42000;i++){
    l.step();const delta=l.positions.secondary.map((v,a)=>v-l.positions.primary[a]);
    const angle=Math.atan2(delta[2],delta[0]);let change=angle-previous;
    while(change>Math.PI)change-=2*Math.PI;while(change<-Math.PI)change+=2*Math.PI;
    travel+=change;previous=angle;
  }
  assert.ok(Math.abs(travel)>Math.PI*2,JSON.stringify({travel}));
  assert.equal(l.spinAngle('secondary'),spin);
  assert.ok(Math.abs(distance(l.positions.planet,l.positions.secondary)-l.orbits.planet.radius)<l.orbits.planet.radius*.35);
  assert.ok(l.positions.primary.every(Number.isFinite));
});

test('nested satellites inherit parent motion in topological order and retain local revolutions',()=>{
  const l=new AffinityLayout(),nodes=[{id:'submoon',kind:'knowledge'},{id:'moon',kind:'knowledge'},{id:'planet',kind:'knowledge'},{id:'sun',kind:'knowledge',isMainTag:true,domainConnectionCount:100}];
  const evidence=[{id:'fixture',quote:'明确组成与从属关系'}];
  const edges=[...nodes.slice(0,3).map(n=>({from:'sun',to:n.id,type:'@semantic',membershipLink:true,strength:1})),{from:'planet',to:'moon',type:'contains',strength:1,sources:evidence},{from:'submoon',to:'moon',type:'part-of',strength:1,sources:evidence}];
  l.sync({nodes,edges,baseRadius:.001});
  assert.equal(l.orbits.moon.host,'planet');assert.equal(l.orbits.submoon.host,'moon');
  assert.equal(l.orbitDepths.submoon,3);assert.equal(l.orbitDepths.planet,1);
  Object.assign(l.positions,{sun:[0,0,0],planet:[100,0,0],moon:[104,0,0],submoon:[104.1,0,0]});
  l.masses=[.001,1,100,10000];l.collisionRadii=[.001,.001,.001,.001];l.G=.00001;
  // This fixture uses physical radii/masses explicitly rather than display-scaled orbits.
  l.orbits.planet.targetRadius=100;l.orbits.moon.targetRadius=4;l.orbits.submoon.targetRadius=.1;
  const initial=[...l.positions.planet];let previous=0,travel=0;
  for(let i=0;i<2000;i++){
    l.step();const relative=l.positions.submoon.map((v,a)=>v-l.positions.moon[a]),angle=Math.atan2(relative[2],relative[0]);let change=angle-previous;
    while(change>Math.PI)change-=2*Math.PI;while(change<-Math.PI)change+=2*Math.PI;
    travel+=change;previous=angle;
  }
  assert.ok(distance(l.positions.planet,initial)>10);
  assert.ok(Math.abs(travel)>Math.PI*4,JSON.stringify({travel}));
  assert.ok(distance(l.positions.moon,l.positions.planet)<8);
  assert.ok(distance(l.positions.submoon,l.positions.moon)<.4);
  for(const p of Object.values(l.positions))assert.ok(p.every(Number.isFinite));
});

test('ordinary links do not invent satellite hierarchy and explicit cyclic hierarchies are rejected',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',kind:'knowledge',isMainTag:true},{id:'a',kind:'knowledge'},{id:'b',kind:'knowledge'}];
  const membership=nodes.slice(1).map(n=>({from:'sun',to:n.id,type:'@semantic',membershipLink:true,strength:1})),sources=[{id:'fixture',quote:'有依据的层级'}];
  l.sync({nodes,edges:[...membership,{from:'a',to:'b',type:'related',strength:1,sources}]});
  assert.equal(l.orbits.b.host,'sun');
  l.sync({nodes,edges:[...membership,{id:'first',from:'a',to:'b',type:'contains',strength:1,sources},{id:'second',from:'b',to:'a',type:'contains',strength:.9,sources}]});
  assert.equal(l.orbits.b.host,'a');assert.equal(l.orbits.a.host,'sun');assert.equal(l.orbitHierarchyIssues.length,1);
});

test('stellar clearance moves the whole nested system while preserving local satellite offsets',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:30},{id:'other',isMainTag:true,domainConnectionCount:10},{id:'planet'},{id:'moon'}];
  l.sync({nodes,edges:[{from:'sun',to:'planet',membershipLink:true,type:'@semantic',strength:1},{from:'planet',to:'moon',type:'contains',strength:1,sources:[{id:'fixture',quote:'明确从属'}]}]});
  Object.assign(l.positions,{sun:[0,0,0],other:[1,0,0],planet:[20,0,0],moon:[23,0,0]});
  l.resolveStellarSpacing();
  assert.ok(Math.abs(distance(l.positions.planet,l.positions.sun)-20)<1e-8);
  assert.ok(Math.abs(distance(l.positions.moon,l.positions.planet)-3)<1e-8);
});

test('a stalled planet recovers tangential motion and stays clear of its star instead of adhering',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:50},{id:'planet'}];
  l.sync({nodes,edges:[{from:'sun',to:'planet',type:'@semantic',membershipLink:true,strength:1}]});
  l.step();l.positions.planet=l.positions.sun.map((v,a)=>v+(a===0?l.collisionRadii[0]+1:0));l.velocities.planet=[...l.velocities.sun];
  let travel=0,previous=0;
  const period=2*Math.PI/.008;
  for(let i=0;i<Math.ceil(period*1.5);i++){
    l.step();const delta=l.positions.planet.map((v,a)=>v-l.positions.sun[a]),angle=Math.atan2(delta[2],delta[0]);let change=angle-previous;
    while(change>Math.PI)change-=2*Math.PI;while(change<-Math.PI)change+=2*Math.PI;travel+=change;previous=angle;
    assert.ok(Math.hypot(...delta)>=l.orbitalClearance(1,0)-1e-6);
  }
  assert.ok(Math.abs(travel)>Math.PI*2,JSON.stringify({travel}));
});

test('external stars carry the whole system while differential tidal pull is reduced',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:50},{id:'other',isMainTag:true,domainConnectionCount:10},{id:'planet'}];
  l.sync({nodes,edges:[{from:'sun',to:'planet',membershipLink:true,type:'@semantic',strength:1}]});
  const p=[[0,0,0],[1000,0,0],[30,0,0]],m=l.masses,full=gravityAccelerations(p,m,l.G,.3),reduced=l.systemGravity(p,m,l.G,.3),local=gravityAccelerations([p[0],p[2]],[m[0],m[2]],l.G,.3);
  const tidalFull=full[2][0]-full[0][0]-(local[1][0]-local[0][0]);
  const tidalReduced=reduced[2][0]-reduced[0][0]-(local[1][0]-local[0][0]);
  assert.ok(Math.abs(tidalReduced/tidalFull-.18)<1e-7);
  assert.ok(Math.abs(l.orbitalClearance(2,0)-l.collisionRadii[2]-5*l.collisionRadii[0])<1e-9);
});

test('local centres use stable independent 3D orbital planes without axial spin',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:30},{id:'other',isMainTag:true,domainConnectionCount:4},{id:'planet'},{id:'moon'}];
  l.sync({nodes,edges:[{from:'other',to:'planet',type:'@semantic',membershipLink:true,strength:1},{from:'planet',to:'moon',type:'contains',strength:1,sources:[{id:'fixture',quote:'从属关系'}]}],seeds:Object.fromEntries(nodes.map(n=>[n.id,[0,0,0]]))});
  const planes=JSON.stringify(Object.fromEntries(Object.entries(l.orbits).map(([id,o])=>[id,o.frame]))),spin=l.spinAngle('moon');
  assert.notDeepEqual(l.orbits.planet.axis,l.orbits.moon.axis);
  for(let i=0;i<200;i++){
    l.step();for(const id of ['other','planet','moon']){
      const o=l.orbits[id],delta=l.positions[id].map((x,a)=>x-l.positions[o.host][a]);
      assert.ok(Math.abs(delta.reduce((sum,x,a)=>sum+x*o.axis[a],0))<1e-7);
      assert.ok(Math.abs(Math.hypot(...delta)/o.targetRadius-1)<.020001);
    }
  }
  assert.ok(Object.values(l.positions).some(p=>Math.abs(p[1])>1));assert.equal(l.spinAngle('moon'),spin);
  const fresh=new AffinityLayout();fresh.sync({nodes,edges:[{from:'other',to:'planet',type:'@semantic',membershipLink:true,strength:1},{from:'planet',to:'moon',type:'contains',strength:1,sources:[{id:'fixture',quote:'从属关系'}]}]});
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(fresh.orbits).map(([id,o])=>[id,o.frame]))),planes);
  l.signature=null;l.sync({nodes,edges:[{from:'other',to:'planet',type:'@semantic',membershipLink:true,strength:1},{from:'planet',to:'moon',type:'contains',strength:1,sources:[{id:'fixture',quote:'从属关系'}]}]});
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(l.orbits).map(([id,o])=>[id,o.frame]))),planes);
});

test('existing vertical spread settles gradually without teleporting horizontal coordinates',()=>{
  const l=new AffinityLayout();l.sync({nodes:[{id:'a'},{id:'b'}],edges:[],seeds:{a:[0,100,0],b:[50,-100,20]}});
  l.eclipticY=0;l.velocities.a=[0,1,0];const before=structuredClone(l.positions);
  l.settleEcliptic();assert.ok(l.positions.a[1]>90&&l.positions.a[1]<100);
  assert.equal(l.positions.a[0],before.a[0]);assert.equal(l.positions.b[2],before.b[2]);
  for(let i=0;i<400;i++)l.settleEcliptic();
  assert.ok(Math.abs(l.positions.a[1])<2);assert.ok(Math.abs(l.positions.b[1])<2);
});

test('shared nodes complete full circles at every existing centre and transfer without identity or relation changes',()=>{
  for(const count of [2,3]){
    const l=new AffinityLayout(),nodes=[{id:'a',kind:'skill',isMainTag:true,domainConnectionCount:100},{id:'b',kind:'skill',isMainTag:true,domainConnectionCount:10},...(count===3?[{id:'c',kind:'skill',isMainTag:true,domainConnectionCount:5}]:[]),{id:'bridge',kind:'skill'}];
    const edges=nodes.filter(n=>n.isMainTag).map(n=>({from:n.id,to:'bridge',type:'@semantic',membershipLink:true,strength:1}));
    l.sync({nodes,edges});
    const original=JSON.stringify(edges);
    let channelBound=l.tourWorldBound;
    for(let i=0;i<120000&&new Set(l.sharedTours.get("bridge").completed).size<count;i++){
      l.step();const route=l.sharedTours.get("bridge")?.exterior;if(route)channelBound=Math.max(channelBound,4*route.radius+distance(route.center,l.center));assert.ok(distance(l.positions.bridge,l.center)<=channelBound);
      for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){if(l.transferPassThroughIds?.has(nodes[a].id)||l.transferPassThroughIds?.has(nodes[b].id))continue;assert.ok(distance(l.positions[nodes[a].id],l.positions[nodes[b].id])>=l.bodyMinimum(a,b)-1e-6,JSON.stringify({count,i,a,b}));}
    }
    const tour=l.sharedTours.get('bridge');assert.equal(new Set(tour.completed).size,count);
    assert.ok(tour.completed.every(id=>['a','b','c'].includes(id)));
    assert.equal(l.sharedOrbitById.get('bridge').hosts.length,count);assert.equal(JSON.stringify(edges),original);
  }
});

test('two-times playback follows the same orbital path and doubles axial rotation progress',()=>{
  const a=new AffinityLayout(),b=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:50},{id:'planet'}],edges=[{from:'sun',to:'planet',membershipLink:true,type:'@semantic',strength:1}];
  a.sync({nodes,edges});b.sync({nodes,edges});b.timeScale=1;
  a.timeScale=2;
  const start=a.spinAngle('planet');for(let i=0;i<60;i++)a.advance(1/60);for(let i=0;i<120;i++)b.advance(1/60);
  assert.equal(a.steps,b.steps);assert.deepEqual(a.positions,b.positions);assert.equal(a.spinAngle('planet'),b.spinAngle('planet'));assert.equal(a.spinAngle('planet'),start);
});

test('automatic spin is disabled while bounded orbital motion keeps advancing',()=>{
  const fast=new AffinityLayout(),reference=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:20},{id:'planet'}],edges=[{from:'sun',to:'planet',membershipLink:true,type:'@semantic',strength:1}];
  fast.sync({nodes,edges});reference.sync({nodes,edges});reference.timeScale=BASE_ANIMATION_SPEED;
  assert.equal(SPIN_SPEED_MULTIPLIER,0);assert.equal(fast.timeScale,2);assert.equal(new AffinityLayout().timeScale,2);
  const initial=fast.spinAngle('planet');fast.advance(1/60);reference.advance(1/60);
  assert.ok(Math.abs((fast.spinAngle('planet')-initial)-fast.time*fast.spinRates.planet*0)<1e-10);
  assert.equal(fast.steps,reference.steps);assert.deepEqual(fast.positions,reference.positions);assert.equal(fast.spinAngle('planet'),reference.spinAngle('planet'));
});

test('separate stellar systems keep independent spin rates and orbital evolution',()=>{
  const l=new AffinityLayout(),nodes=[{id:'sun',isMainTag:true,domainConnectionCount:60},{id:'second',isMainTag:true,domainConnectionCount:10},{id:'p1'},{id:'p2'}],edges=[{from:'sun',to:'p1',membershipLink:true,type:'@semantic',strength:1},{from:'second',to:'p2',membershipLink:true,type:'@semantic',strength:1}];
  l.sync({nodes,edges});const before=structuredClone(l.positions);
  assert.notEqual(l.spinRates.sun,l.spinRates.second);assert.notEqual(l.spinRates.p1,l.spinRates.p2);
  for(let i=0;i<300;i++)l.step();
  for(const n of nodes.filter(n=>n.id!==l.coreId))assert.ok(distance(l.positions[n.id],before[n.id])>.001);
  assert.equal(l.orbits.p1.host,'sun');assert.equal(l.orbits.p2.host,'second');
});

test('membership planes follow real main-classification sets rather than edge degree or shell',()=>{
  const l=new AffinityLayout(),nodes=[{id:'a',isMainTag:true,domainConnectionCount:100},{id:'b',isMainTag:true,domainConnectionCount:5},{id:'c',isMainTag:true,domainConnectionCount:3},...Array.from({length:20},(_,i)=>({id:'n'+i}))];
  const edges=nodes.slice(3).map(n=>({from:'a',to:n.id,membershipLink:true,strength:1}));
  edges.push({from:'b',to:'n18',membershipLink:true,strength:1},{from:'b',to:'n19',membershipLink:true,strength:1},{from:'c',to:'n19',membershipLink:true,strength:1});
  l.sync({nodes,edges});
  for(let i=1;i<18;i++)assert.deepEqual(l.orbits.n0.frame,l.orbits['n'+i].frame);
  assert.notDeepEqual(l.orbits.n0.frame,l.orbits.n18.frame);assert.notDeepEqual(l.orbits.n18.frame,l.orbits.n19.frame);
});

test('shared satellite tours never leave their planet-star territory including their subtree',()=>{
  const l=new AffinityLayout(),nodes=[{id:'a',isMainTag:true,domainConnectionCount:1000},{id:'b',isMainTag:true,domainConnectionCount:70},{id:'shared'},{id:'child'}];
  const edges=[{from:'b',to:'shared',membershipLink:true,strength:1},{from:'a',to:'shared',membershipLink:true,strength:1},{from:'shared',to:'child',type:'contains',sources:[{quote:'child'}],strength:1}];
  l.sync({nodes,edges});assert.equal(l.orbits.shared.host,'b');
  for(let step=0;step<2000;step++){
    l.step();const range=distance(l.positions.a,l.positions.b);
    for(const id of ['shared','child'])assert.ok(distance(l.positions[id],l.positions.b)+l.collisionRadii[l.nodeIndices.get(id)]<=range+1e-6);
  }
});

test('multiple memberships retain shared orbital hosts while all evidence links remain unchanged',()=>{
  const l=new AffinityLayout(),input=[{id:'large',isMainTag:true,domainConnectionCount:20},{id:'small',isMainTag:true,domainConnectionCount:3},{id:'planet'}];
  const edges=['small','large'].map(from=>({from,to:'planet',type:'@semantic',membershipLink:true,strength:1})),before=JSON.stringify(edges);
  l.sync({nodes:input,edges});assert.equal(l.orbits.planet.host,'large');
  assert.equal(l.sharedOrbitById.get('planet').hosts.length,2);assert.ok(l.orbits.planet.launchKey.startsWith('shared:'));
  assert.equal(JSON.stringify(edges),before);assert.equal(l.coreId,'large');
});

test('larger ordinary stars have greater inertia and bounded slow floating remains finite',()=>{
  const l=new AffinityLayout();
  const input=[{id:'hub'},...Array.from({length:30},(_,i)=>({id:'leaf'+i}))];
  l.sync({nodes:input,edges:input.slice(1).map(n=>({from:'hub',to:n.id,type:'related',strength:.7}))});
  assert.ok(l.masses[0]>l.masses[1]);
  for(let i=0;i<1800;i++)l.step();
  const before=structuredClone(l.positions);l.step();
  for(const [i,n]of input.entries()){
    assert.ok(l.positions[n.id].every(Number.isFinite));
    assert.ok(distance(before[n.id],l.positions[n.id])<=l.spacing*.012/Math.pow(l.masses[i],.65)+1e-9);
  }
});
test("联系紧密的知识逐渐靠近，弱联系保持更大距离", () => {
  const l = new AffinityLayout();
  l.sync({ nodes, edges, seeds });
  for (let i = 0; i < 1600; i++) l.step({ floating: false });
  const strong = distance(l.positions.a, l.positions.b),
    weak = distance(l.positions.c, l.positions.d);
  assert.ok(strong < weak * 0.8, JSON.stringify({ strong, weak }));
  assert.ok(strong > 5);
});
test("节点持续柔性浮动，不用装饰性随机重排；重选和筛选不重置状态", () => {
  const l = new AffinityLayout();
  l.sync({ nodes, edges, seeds });
  for (let i = 0; i < 100; i++) l.step();
  const p = l.checkpoint(),
    v = structuredClone(l.velocities),
    t = l.time;
  l.sync({ nodes, edges, seeds: { a: [999, 999, 999] } });
  assert.deepEqual(l.checkpoint(), p);
  assert.deepEqual(Object.entries(l.velocities), Object.entries(v));
  assert.equal(l.time, t);
  for (let i = 0; i < 60; i++) l.step();
  assert.notDeepEqual(l.positions.a, p.a);
  for (const a of Object.values(l.positions))
    assert.ok(a.every(Number.isFinite));
});
test("新增知识保留既有位置和速度，新增关系改变牵引而不瞬移", () => {
  const l = new AffinityLayout();
  l.sync({ nodes, edges, seeds });
  l.step();
  const p = l.checkpoint();
  l.sync({
    nodes: [...nodes, { id: "e" }],
    edges: [...edges, { from: "a", to: "e", strength: 0.8, type: "related" }],
    seeds: { e: [500, 500, 500] },
  });
  assert.deepEqual(l.positions.a, p.a);
  assert.ok(distance(l.positions.a, l.positions.e) < 65);
  const before = l.checkpoint();
  l.sync({
    nodes: [...nodes, { id: "e" }],
    edges: [...edges, { from: "a", to: "e", strength: 0.3, type: "related" }],
  });
  assert.deepEqual(l.checkpoint(), before);
});
test("共同邻居提供较弱结构牵引，不伪造语义关系，重复关系类型不叠加放大", () => {
  const input = [{ id: "a" }, { id: "b" }, { id: "hub" }],
    links = [
      { from: "a", to: "hub", type: "logic", strength: 0.9 },
      { from: "b", to: "hub", type: "logic", strength: 0.8 },
      { from: "a", to: "hub", type: "step", strength: 0.7 },
    ];
  const original = structuredClone(links),
    l = new AffinityLayout();
  l.sync({ nodes: input, edges: links });
  assert.equal(
    l.links.filter(
      (e) => ["a", "hub"].includes(e.from) && ["a", "hub"].includes(e.to),
    ).length,
    1,
  );
  const indirect = l.links.find((e) => e.from === "a" && e.to === "b");
  assert.ok(indirect.indirect && indirect.weight < 0.2);
  assert.deepEqual(links, original);
});
test("布局按固定时间步推进，刷新频率不改变物理结果", () => {
  const a = new AffinityLayout(),
    b = new AffinityLayout();
  a.sync({ nodes, edges, seeds });
  b.sync({ nodes, edges, seeds });
  for (let i = 0; i < 60; i++) a.advance(1 / 60);
  for (let i = 0; i < 30; i++) b.advance(1 / 30);
  assert.equal(a.steps, b.steps);
  assert.deepEqual(a.checkpoint(), b.checkpoint());
});
