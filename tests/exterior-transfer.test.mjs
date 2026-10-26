import test from 'node:test';import assert from 'node:assert/strict';
import {createExteriorTransfer,exteriorTransferPoint,advanceSharedTours} from '../public/shared-tours.js';
import {AffinityLayout} from '../public/layout.js';
const frame={u:[1,0,0],v:[0,0,1],normal:[0,-1,0]},distance=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
test('exterior channel completes a full revolution and has continuous position and velocity at all joins',()=>{
 const route=createExteriorTransfer({start:[10,0,5],velocity:[.04,0,-.03],center:[0,0,0],frame,radius:100,angle:17}),end=[30,0,20],velocity=[.02,0,.01],total=2*route.duration+route.lapDuration;
 const sample=t=>exteriorTransferPoint(route,t,end.map((x,k)=>x+velocity[k]*(t-total)),velocity),epsilon=.0001;
 assert.ok(distance(sample(0),route.start)<1e-9);assert.ok(distance(sample(total),end)<1e-9);
 const derivative=(a,b)=>sample(b).map((x,k)=>(x-sample(a)[k])/(b-a));assert.ok(distance(derivative(0,epsilon),route.velocity)<.0001);assert.ok(distance(derivative(total-epsilon,total),velocity)<.0001);
 for(const join of [route.duration,route.duration+route.lapDuration])assert.ok(distance(derivative(join-epsilon,join),derivative(join,join+epsilon))<.0001);
 let angle=0,previous;for(let i=0;i<=route.lapDuration;i++){const p=sample(route.duration+i);assert.ok(Math.abs(Math.hypot(...p)-100)<1e-8);const a=Math.atan2(p[2],p[0]);if(previous!==undefined)angle+=Math.atan2(Math.sin(a-previous),Math.cos(a-previous));previous=a;}assert.ok(Math.abs(angle-2*Math.PI)<1e-8);assert.equal(route.angle,17);
});
test('actual exterior state machine completes one lap before docking without phase reset',()=>{
 const group={id:'shared',index:2,memberIndices:[2],visits:[{host:'a',radius:20,phase:0,frame},{host:'b',radius:20,phase:0,frame}],tour:{stage:'transfer',index:0,angle:9,progress:0,completed:[],roundVisits:1},arc:frame.normal};
 const l={nodes:[{id:'a'},{id:'b'},{id:'shared'}],nodeIndices:new Map([['a',0],['b',1],['shared',2]]),coreId:'a',center:[0,0,0],sharedOrbits:[group],positions:{a:[0,0,0],b:[0,0,50],shared:[20,0,0]},velocities:{a:[0,0,0],b:[0,0,0],shared:[0,0,.24]},orbits:{shared:{host:'a'}},collisionRadii:[2,2,1],systemExtents:[25,25,1],subtreeMaxRadius:[2,2,1],tourWorldBound:500,orbitalClearance:()=>11};
 let lap=0,elapsed=0;for(let i=0;i<2500&&group.tour.stage==='transfer';i++){advanceSharedTours(l,1);const r=group.tour.exterior;if(r){elapsed=r.elapsed;lap=Math.max(lap,Math.min(r.lapDuration,elapsed-r.duration));}}
 assert.equal(group.tour.stage,'orbit');assert.equal(group.tour.index,1);assert.equal(lap,600);assert.ok(group.tour.angle>9);assert.ok(l.positions.shared.every(Number.isFinite));
});
for(const kind of ['vault','knowledge','skill'])test(kind+' exterior animation leaves node identity, relations, local R and envelopes unchanged',()=>{
 const nodes=[{id:'sun',kind,isMainTag:true,domainConnectionCount:100},{id:'p',kind,isMainTag:true,domainConnectionCount:50},{id:'shared',kind}],edges=[{from:'sun',to:'shared',membershipLink:true,strength:1},{from:'p',to:'shared',membershipLink:true,strength:1}],l=new AffinityLayout();l.sync({nodes,edges});l.step();assert.ok(l.sharedOrbits.length);
 const before=JSON.stringify({ids:l.nodes.map(n=>n.id),edges,reach:l.satelliteCenterExtents,envelopes:l.systemExtents,rows:Object.values(l.orbits).filter(o=>o.kind==='planet').map(o=>[o.targetRadius,o.rowBaselineGap])});
 const g=l.sharedOrbits[0],s=g.tour;s.stage='transfer';s.exterior=null;advanceSharedTours(l);assert.ok(s.exterior);assert.ok(s.exterior.radius>Math.max(...l.nodes.filter(n=>n.id!==g.id).map(n=>distance(l.positions[n.id],s.exterior.center)+l.systemExtents[l.nodeIndices.get(n.id)])));
 assert.equal(JSON.stringify({ids:l.nodes.map(n=>n.id),edges,reach:l.satelliteCenterExtents,envelopes:l.systemExtents,rows:Object.values(l.orbits).filter(o=>o.kind==='planet').map(o=>[o.targetRadius,o.rowBaselineGap])}),before);
});
