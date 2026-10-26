import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {Store} from '../src/store.mjs';
import {AutoAnalyzer} from '../src/analyzer.mjs';
import {ConceptExtractor} from '../src/concepts.mjs';
import {LayerPipeline} from '../src/layer-pipeline.mjs';
import {TaskControl} from '../src/task-control.mjs';
import {createApp} from '../src/server.mjs';

const result=()=>({summary:'Synthetic summary',concepts:[],unresolvedQuestions:[],mainTags:[],mainTagUpdates:[],newRelationTypes:[],tags:[],knowledge:[],relations:[],skills:[],vaultRelations:[],issues:[]});
function fixture(t,runner){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'venus-controls-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const store=new Store(path.join(root,'data')),concepts=new ConceptExtractor(store);
  const analyzer=new AutoAnalyzer(store,{runner,conceptExtractor:concepts,chunkSize:2000});
  const layers=new LayerPipeline(store,{analyzer,concepts,runner,query:{indexStatus:()=>false}});
  const tasks=new TaskControl({analyzer,layers,provider:{provider:'synthetic'},reviewControl:{worker:()=>null}});
  return {root,store,concepts,analyzer,layers,tasks};
}

test('pause waits for the main request to exit, retains saved offsets and resumes once without retrying failures',async t=>{
  let release,started,calls=0;const ready=new Promise(resolve=>started=resolve);
  const f=fixture(t,async(_,{signal})=>{calls++;started();await new Promise(resolve=>release=resolve);assert.equal(signal.aborted,true);return {};});
  const source=f.store.import({name:'Synthetic active source',body:'Evidence. '.repeat(400)}).node;
  f.analyzer.discover();const entry=f.analyzer.state.entries[source.id];
  entry.offset=2000;entry.parts=[{start:0,end:2000,summary:'Already saved',tags:[]}];f.analyzer.save();
  const running=f.analyzer.tick();await ready;
  assert.equal(f.tasks.control({action:'pause'}).phase,'pausing');
  assert.throws(()=>f.tasks.control({action:'start'}),/等待/);
  assert.throws(()=>f.analyzer.configure({enabled:true}),/全局暂停/);
  release();await running;
  assert.equal(f.tasks.status().phase,'paused');assert.equal(entry.offset,2000);assert.equal(entry.parts.length,1);assert.equal(entry.attempts,0);
  await f.analyzer.tick();assert.equal(calls,1);
  const restored=new AutoAnalyzer(f.store,{runner:async()=>result()});
  assert.equal(restored.state.tasksPaused,true);assert.equal(restored.status().enabled,false);
  const failed=f.store.import({name:'Synthetic isolated failure',body:'Other evidence'}).node;
  f.analyzer.discover();f.analyzer.state.entries[failed.id].status='review';
  f.analyzer.runner=async()=>result();
  assert.equal(f.tasks.control({action:'start'}).phase,'enabled');
  assert.equal(f.tasks.control({action:'start'}).unchanged,true);
  await f.analyzer.tick();assert.equal(entry.status,'done',entry.lastError);assert.equal(entry.parts[1].start,2000);assert.equal(f.analyzer.state.entries[failed.id].status,'review');
});

test('full pause also aborts independent layers, forbids late writes and resumes only globally paused work',async t=>{
  let release,started;const ready=new Promise(resolve=>started=resolve);
  const f=fixture(t,async()=>{started();await new Promise(resolve=>release=resolve);return result();});
  f.analyzer.configure({enabled:false});
  const a=f.store.import({name:'Synthetic layer A',body:'Layer evidence A'}).node,b=f.store.import({name:'Synthetic layer B',body:'Layer evidence B'}).node;
  f.layers.start({sourceId:a.id,layer:'knowledge'});f.layers.start({sourceId:b.id,layer:'concept'});
  const bKey=b.id+':concept';f.layers.state.entries[bKey].status='paused';
  const running=f.layers.tick();await ready;
  assert.equal(f.tasks.control({action:'pause'}).phase,'pausing');
  assert.throws(()=>f.layers.start({sourceId:a.id,layer:'concept'}),/全局暂停/);
  release();await running;
  assert.equal(f.tasks.status().phase,'paused');const entry=f.layers.state.entries[a.id+':knowledge'];
  assert.equal(entry.offset,0);assert.equal(entry.status,'paused');assert.equal(f.store.nodes.filter(n=>n.kind!=='vault').length,0);
  const restored=new LayerPipeline(f.store,{analyzer:f.analyzer,concepts:f.concepts,runner:async()=>result(),query:{}});
  f.tasks.layers=restored;
  f.tasks.control({action:'start'});
  assert.equal(restored.state.entries[bKey].status,'paused');
  assert.equal(restored.state.entries[a.id+':knowledge'].status,'queued');
  await restored.tick();assert.equal(restored.state.entries[a.id+':knowledge'].status,'done');
});

test('an external worker prevents a false fully-paused acknowledgement or duplicate start',t=>{
  const f=fixture(t,async()=>result());f.tasks.reviewControl={worker:()=>12345};
  const paused=f.tasks.control({action:'pause'});assert.equal(paused.phase,'pausing');assert.equal(paused.externalControlRequired,true);
  assert.throws(()=>f.tasks.control({action:'start'}),/等待/);
  f.tasks.reviewControl.worker=()=>null;assert.equal(f.tasks.status().phase,'paused');
});

async function request(app,method,url,data,origin){
  const req=Readable.from(data===undefined?[]:[Buffer.from(JSON.stringify(data))]);
  Object.assign(req,{method,url,headers:{host:'127.0.0.1:10004','content-type':'application/json',...(origin?{origin}:{})}});
  let status,body;await app.listeners('request')[0](req,{writeHead:s=>status=s,end:s=>body=s});
  return {status,body:JSON.parse(body)};
}
test('task endpoints use the existing executor, enforce same-origin writes and report unavailable backends',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'venus-controls-api-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const enabled of [false,true]){
    const {app,store}=createApp({root:path.join(root,String(enabled)),port:10004,enableAnalysis:enabled,analysisRunner:async()=>result()});
    try{
      const before=await request(app,'GET','/api/tasks/status');assert.equal(before.body.available,enabled);
      assert.equal((await request(app,'POST','/api/tasks/control',{action:'pause'},'https://example.invalid')).status,403);
      assert.equal((await request(app,'POST','/api/tasks/control',{action:'invalid'})).status,400);
      const pause=await request(app,'POST','/api/tasks/control',{action:'pause'});assert.equal(pause.status,enabled?200:503);
      if(enabled){assert.equal(pause.body.phase,'paused');assert.equal(store.analyzer.active.size,0);assert.equal((await request(app,'POST','/api/tasks/control',{action:'start'})).body.phase,'enabled');}
    }finally{app.emit('close');}
  }
});


test('live classification owner is visible without counting its own dispatch as a competing analyzer',()=>{
 const analyzer={state:{enabled:false,tasksPaused:false},active:new Set(),configure(){throw Error('must not start old dispatcher');}};
 let live=true;const tasks=new TaskControl({analyzer,classificationWorker:()=>live});
 assert.equal(tasks.status().phase,'enabled');assert.equal(tasks.status().classificationActive,true);
 assert.equal(tasks.status().externalActive,false);assert.equal(tasks.status().canStart,false);
 assert.equal(tasks.control({action:'start'}).unchanged,true);
 analyzer.state.tasksPaused=true;assert.equal(tasks.status().phase,'pausing');assert.equal(tasks.status().externalControlRequired,true);
 live=false;assert.equal(tasks.status().phase,'paused');
});
