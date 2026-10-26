import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createCodexResolver} from '../src/analysis-model.mjs';
import {createLibraryRefresh} from '../src/library-refresh.mjs';
import {Store} from '../src/store.mjs';import {createApp} from '../src/server.mjs';
import {AffinityLayout,fibonacciOrbitSlot,planetOrbitSlot} from '../public/layout.js';

test('executable lookup is asynchronous, shared by five callers, cached and failure-backed off',async()=>{
 let now=0,calls=0,fail=true;const resolve=createCodexResolver({clock:()=>now,retryMs:60000,lookup:async()=>{calls++;await new Promise(r=>setTimeout(r,30));if(fail)throw Error('missing');return 'synthetic-codex';}});
 let responsive=false;setTimeout(()=>{responsive=true;},5);
 const first=await Promise.allSettled(Array.from({length:5},()=>resolve()));assert.ok(responsive);assert.equal(calls,1);assert.ok(first.every(r=>r.status==='rejected'));
 await assert.rejects(resolve(),/missing/);assert.equal(calls,1);now=60000;fail=false;assert.equal(await resolve(),'synthetic-codex');assert.equal(calls,2);await resolve();assert.equal(calls,2);
});

test('idle polls skip full scans, dirty files coalesce, directory changes and lost events reconcile',()=>{
 let now=0;const callbacks=new Map(),scans=[],watchers=[];
 const refresh=createLibraryRefresh({root:'synthetic',scan:o=>scans.push(o)},{clock:()=>now,watch:(p,options,cb)=>{callbacks.set(path.basename(p),cb);const w=new EventEmitter();w.close=()=>{w.closed=true;};watchers.push(w);return w;}});
 for(let i=0;i<59;i++){now=i*1000;refresh.poll();}assert.equal(scans.length,0);
 callbacks.get('Vault')('rename','a.md.synthetic.tmp');refresh.poll();assert.equal(scans.length,0);
 callbacks.get('Vault')('change','a.md');callbacks.get('Vault')('rename','a.md');refresh.poll();assert.deepEqual(scans.pop(),{paths:['Vault/a.md']});
 callbacks.get('知识点')('rename','subfolder');refresh.poll();assert.deepEqual(scans.pop(),{});
 now+=60000;refresh.poll();assert.deepEqual(scans.pop(),{});refresh.close();assert.ok(watchers.every(w=>w.closed));
});

test('incremental refresh handles edit, removal, new file and nested paths without losing unrelated data',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'venus-refresh-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const store=new Store(root);const a=store.import({name:'synthetic-A',body:'original A'}).node,b=store.import({name:'synthetic-B',body:'original B'}).node;const callbacks=new Map();
 const refresh=createLibraryRefresh(store,{watch:(p,o,cb)=>{callbacks.set(path.basename(p),cb);const w=new EventEmitter();w.close=()=>{};return w;}});t.after(()=>refresh.close());
 fs.writeFileSync(path.join(root,a.path),'edited A');callbacks.get('Vault')('change',path.basename(a.path));refresh.poll();assert.equal(store.nodeById.get(a.id).body,'edited A');assert.equal(store.nodeById.get(b.id).body,'original B');
 fs.unlinkSync(path.join(root,a.path));callbacks.get('Vault')('rename',path.basename(a.path));refresh.poll();assert.equal(store.nodeById.has(a.id),false);
 fs.mkdirSync(path.join(root,'Vault','nested'));fs.writeFileSync(path.join(root,'Vault','nested','new.md'),'new nested');callbacks.get('Vault')('rename','nested/new.md');refresh.poll();assert.ok(store.nodes.some(n=>n.body==='new nested'));
});

test('ready route bypasses snapshot work and launcher uses it; synthetic startup and response timings',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'venus-ready-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'Vault'),{recursive:true});for(let i=0;i<200;i++)fs.writeFileSync(path.join(root,'Vault',i+'.md'),'# Synthetic '+i+'\n'+'synthetic text '.repeat(100));
 const start=performance.now();const {app,store}=createApp({root});const initMs=performance.now()-start;t.after(()=>app.emit('close'));
 const handler=app.listeners('request')[0];const request=async url=>{let payload='';const start=performance.now();await handler({method:'GET',headers:{host:'127.0.0.1'},url},{writeHead(){},end(body){payload=body;}});return {bytes:Buffer.byteLength(payload),ms:performance.now()-start,payload};};
 const summary=await request('/api/state?summary=1');const original=store.snapshot;store.snapshot=()=>{throw Error('must not call snapshot');};const ready=await request('/api/ready');assert.equal(JSON.parse(ready.payload).ready,true);assert.ok(ready.bytes<512);assert.equal(JSON.parse(ready.payload).navigationContractVersion,4);assert.ok(summary.bytes>ready.bytes*100);store.snapshot=original;
 const scans=store.readStats.fullScans,startIdle=performance.now();for(let i=0;i<60;i++)store.scan();const oldIdleMs=performance.now()-startIdle;
 let now=0;const refresh=createLibraryRefresh(store,{clock:()=>now});const startNew=performance.now();for(let i=0;i<60;i++){now=i*1000;refresh.poll();}const newIdleMs=performance.now()-startNew;refresh.close();assert.equal(store.readStats.fullScans-scans,60);
 console.log(JSON.stringify({syntheticNodes:store.nodes.length,createAppMs:initMs,summaryBytes:summary.bytes,summaryMs:summary.ms,readyBytes:ready.bytes,readyMs:ready.ms,old60IdlePollMs:oldIdleMs,new60IdlePollMs:newIdleMs}));
 assert.match(fs.readFileSync(new URL('../Start-Venus.ps1',import.meta.url),'utf8'),/api\/ready/);
});

test('main planets double from four while nested satellite capacities stay unchanged in every network',()=>{
 assert.deepEqual([0,3,4,11,12,27,28,59,60].map(rank=>planetOrbitSlot(rank).capacity),[4,4,8,8,16,16,32,32,64]);
 assert.deepEqual(Array.from({length:10},(_,row)=>{let rank=0;while(fibonacciOrbitSlot(rank).row<row)rank++;return fibonacciOrbitSlot(rank).capacity;}),[1,1,2,3,5,8,13,21,34,55]);
 for(const kind of ['vault','knowledge','skill','concept']){const nodes=[{id:'sun',kind,isMainTag:true,domainConnectionCount:10000},...Array.from({length:100},(_,i)=>({id:'p'+String(i).padStart(3,'0'),kind,isMainTag:true,domainConnectionCount:10})),...Array.from({length:150},(_,i)=>({id:'n'+String(i).padStart(3,'0'),kind}))],edges=nodes.filter(n=>!n.isMainTag).map(n=>({from:'p000',to:n.id,membershipLink:true,strength:1}));const l=new AffinityLayout();l.sync({nodes,edges});l.step();for(const host of ['sun','p000']){const rows=new Map();for(const o of Object.values(l.orbits).filter(o=>o.host===host)){rows.set(o.globalRow,(rows.get(o.globalRow)||0)+1);}assert.deepEqual([...rows.entries()].sort((a,b)=>a[0]-b[0]).slice(0,9).map(x=>x[1]),host==='sun'?[4,8,16,32,40]:kind==='knowledge'?[6,12,18,24,30,36,24]:[1,1,2,3,5,8,13,21,34]);}for(const n of nodes.slice(1)){const i=l.nodeIndices.get(n.id),o=l.orbits[n.id],p=l.nodeIndices.get(o.host);assert.ok(o.targetRadius>=5*l.collisionRadii[p]+l.collisionRadii[i]-1e-6);}}
});


test('knowledge uses one largest centre and shared planet rows while retaining local subtree envelopes',()=>{
 const nodes=[{id:'first',kind:'knowledge',isMainTag:true,domainConnectionCount:100},{id:'second',kind:'knowledge',isMainTag:true,domainConnectionCount:99},{id:'third',kind:'knowledge',isMainTag:true,domainConnectionCount:98},...Array.from({length:35},(_,i)=>({id:'member'+i,kind:'knowledge'}))];
 const edges=nodes.slice(3).map((n,i)=>({from:i<12?'first':i<24?'second':'third',to:n.id,membershipLink:true,strength:1}));edges.push({from:'member24',to:'member25',type:'contains',strength:1,sources:[{quote:'synthetic'}]});
 const l=new AffinityLayout();l.sync({nodes,edges});assert.equal(l.coreId,'first');assert.equal(l.companionId,null);assert.deepEqual([...l.starIds],['first']);assert.equal(l.orbits.third.ring,l.orbits.second.ring);assert.equal(l.orbits.third.targetRadius,l.orbits.second.targetRadius);
 const second=l.nodeIndices.get('second'),third=l.nodeIndices.get('third'),first=l.nodeIndices.get('first');assert.ok(l.orbits.second.targetRadius>=1.15*l.satelliteCenterExtents[first]-1e-6);assert.ok(l.orbits.third.targetRadius>=l.orbitalClearance(third,first)-1e-6);
 l.step();const origin=[...l.positions.first],spin=l.spinAngle('first');for(let step=0;step<180;step++){l.step();assert.deepEqual(l.positions.first,origin);assert.equal(l.spinAngle('first'),spin);const a=l.positions.second,b=l.positions.third;assert.ok(Math.hypot(...a.map((x,k)=>x-b[k]))>=l.bodyMinimum(second,third)-.00001);for(const id of ['second','third']){const host=l.positions[id],extent=l.systemExtents[l.nodeIndices.get(id)];for(const n of nodes.slice(3)){let parent=l.orbits[n.id]?.host;while(parent&&parent!==id)parent=l.orbits[parent]?.host;if(parent===id)assert.ok(Math.hypot(...l.positions[n.id].map((x,k)=>x-host[k]))+l.collisionRadii[l.nodeIndices.get(n.id)]<=extent+1e-6);}}}
});


test('native file watching picks up an external edit without another whole-library scan',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'venus-native-watch-')),store=new Store(root),source=store.import({name:'watched',body:'synthetic original'}).node;
 const refresh=createLibraryRefresh(store);t.after(()=>{refresh.close();fs.rmSync(root,{recursive:true,force:true});});const full=store.readStats.fullScans;
 fs.writeFileSync(path.join(root,source.path),'synthetic external edit');const deadline=Date.now()+2000;
 while(Date.now()<deadline&&store.nodeById.get(source.id).body!=='synthetic external edit'){await new Promise(r=>setTimeout(r,20));refresh.poll();}
 assert.equal(store.nodeById.get(source.id).body,'synthetic external edit');assert.equal(store.readStats.fullScans,full);assert.ok(store.readStats.targetedScans>0);
});

test('shared visitor slots survive lexically earlier insertion and follow Fibonacci row limits',()=>{
 const nodes=[{id:'sun',kind:'knowledge',isMainTag:true,domainConnectionCount:1000},{id:'p',kind:'knowledge',isMainTag:true,domainConnectionCount:20},...Array.from({length:20},(_,i)=>({id:'b'+String(i).padStart(2,'0'),kind:'knowledge'}))];
 const edges=nodes.slice(2).flatMap(n=>['sun','p'].map(from=>({from,to:n.id,membershipLink:true,strength:1})));const l=new AffinityLayout();l.sync({nodes,edges});const old=new Map(l.sharedOrbits.map(g=>[g.id,g.visits.map(v=>({host:v.host,phase:v.phase,row:v.globalRow}))]));
 l.sync({nodes:[...nodes,{id:'a',kind:'knowledge'}],edges:[...edges,...['sun','p'].map(from=>({from,to:'a',membershipLink:true,strength:1}))]});for(const g of l.sharedOrbits){if(old.has(g.id))assert.deepEqual(g.visits.map(v=>({host:v.host,phase:v.phase,row:v.globalRow})),old.get(g.id));}
 const rows=new Map();for(const g of l.sharedOrbits){const v=g.visits.find(v=>v.host==='sun');rows.set(v.globalRow,(rows.get(v.globalRow)||0)+1);}assert.deepEqual([...rows.values()],[6,12,3]);
});


test('knowledge uses its current six-slot satellite packing and local 1.15R planet-row spacing',()=>{
 const make=kind=>{const nodes=[{id:'sun',kind,isMainTag:true,domainConnectionCount:1000},{id:'p',kind,isMainTag:true,domainConnectionCount:20},...Array.from({length:20},(_,i)=>({id:'n'+String(i).padStart(2,'0'),kind}))],edges=nodes.slice(2).map(n=>({from:'sun',to:n.id,membershipLink:true,strength:1}));edges.push({from:'n00',to:'n01',type:'contains',strength:1,sources:[{quote:'synthetic child'}]});return {nodes,edges};};
 const k=new AffinityLayout(),s=new AffinityLayout();k.sync(make('knowledge'));s.sync(make('skill'));assert.notEqual(k.orbits.n02.targetRadius,s.orbits.n02.targetRadius);for(const n of k.nodes.filter(n=>!n.isMainTag)){const o=k.orbits[n.id];assert.ok(o.targetRadius>=k.orbitalClearance(k.nodeIndices.get(n.id),k.nodeIndices.get(o.host))-1e-7,n.id+' keeps body clearance');}
 const root=k.nodeIndices.get('sun');assert.ok(k.satelliteCenterExtents[root]<k.systemExtents[root]);const p=k.nodeIndices.get('p');const expected=Math.max(1.15*k.satelliteCenterExtents[root],k.collisionRadii[root]+k.collisionRadii[p]+.02,k.orbitalClearance(p,root));assert.ok(Math.abs(k.orbits.p.targetRadius-expected)<1e-7);
});
