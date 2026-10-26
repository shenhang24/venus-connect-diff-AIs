import {readNavigationIndex} from './navigation-index.mjs';
import {consumeGeneratedNavigation} from './semantic-navigation-producer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {nextChunk,rankCandidates} from './analyzer.mjs';
import {hash} from './store.mjs';
import {classificationExecutorActive} from './classification-lock.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const write=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);};
export class LayerPipeline {
 constructor(store,{analyzer,concepts,query,runner,connectionRunner,eventSink=()=>{},externalLock=path.resolve(store.root,'../work/concept-content-review/executor.lock')}={}){
  Object.assign(this,{store,analyzer,concepts,query,runner,connectionRunner,eventSink,externalLock});this.file=path.join(store.meta,'layer-progress.json');

  this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file)):{version:1,entries:{}};this.active=new Map();store.layerPipeline=this;
  for(const e of Object.values(this.state.entries))if(e.status==='working'){e.status=this.analyzer?.state.tasksPaused?'paused':'queued';if(this.analyzer?.state.tasksPaused)e.globalPause=true;}
 }
 save(){write(this.file,this.state);this.store.state.revision++;this.store.save();}
 emit(action,e,error=null){e.lastAction=action;e.updatedAt=new Date().toISOString();if(action==='LAYER_SEGMENT_SAVED')e.lastSavedAt=e.updatedAt;this.eventSink({kind:error?'error':action==='LAYER_SEGMENT_SAVED'?'saved':'execution',action,status:error?'failed':e.status,step:e.step,sourceId:e.sourceId,file:this.store.nodes.find(n=>n.id===e.sourceId)?.title,offset:e.offset,start:e.currentRange?.[0],end:e.currentRange?.[1],error:error?{original:error.message,disposition:'layer-stopped; other tasks continue',checkpoint:{sourceId:e.sourceId,offset:e.offset}}:null});}
 externalSlots(){try{const lock=JSON.parse(fs.readFileSync(this.externalLock));process.kill(lock.pid,0);return 1;}catch{return 0;}}
 source(id){const n=this.store.nodes.find(n=>n.id===id&&n.kind==='vault'&&!n.mergedInto);if(!n)fail('原始资料不存在',404);return n;}
 legacyOffset(n){const e=this.analyzer?.state.entries[n.id];if(e?.sourceHash!==n.hash)return 0;let at=0;for(const p of e.parts||[]){if(p.start!==at||p.end<p.start||p.end>n.body.length)break;at=p.end;}return at;}
 own(n,layer){const e=this.state.entries[n.id+':'+layer];return e?.sourceHash===n.hash?e:null;}
 reviewState(){try{const file=path.join(this.store.meta,'concept-content-review.json'),stat=fs.statSync(file),stamp=stat.mtimeMs+':'+stat.size;if(this.reviewStamp!==stamp){this.reviewCache=JSON.parse(fs.readFileSync(file));this.reviewStamp=stamp;}return this.reviewCache;}catch{return {entries:{}};}}
 activity(){return {active:[...this.active.keys()].map(key=>this.state.entries[key]).map(e=>({sourceId:e.sourceId,layer:e.layer,offset:e.offset,total:this.store.nodes.find(n=>n.id===e.sourceId)?.body.length||0,step:e.step,currentRange:e.currentRange,lastAction:e.lastAction,lastSavedAt:e.lastSavedAt,lastUpdatedAt:e.updatedAt})),queued:Object.values(this.state.entries).filter(e=>e.status==='queued').length,needsReview:Object.values(this.state.entries).filter(e=>e.status==='review').length};}
 activeSources(){return new Set([...this.active.keys()].map(key=>this.state.entries[key].sourceId));}
 progress(n,layer){
  const own=this.own(n,layer),total=n.body.length;let offset=0,complete=false,contentComplete=null;
  if(own?.reanalyze)return {layer,status:own.status,offset:own.offset,total,percent:total?Math.floor(own.offset/total*100):0,complete:own.status==='done',contentComplete:null,error:own.error,step:own.step,templateHash:own.templateHash,lastSavedAt:own.lastSavedAt};
  if(layer==='vault'){complete=!!this.query.indexStatus(n.id);offset=complete?total:0;}
  else if(layer==='concept'){offset=total-this.concepts.gaps(n).reduce((s,[a,b])=>s+b-a,0);complete=offset===total;
   contentComplete=null;
  }else{offset=Math.max(this.legacyOffset(n),own?.offset||0);complete=offset===total&&(total>0||own?.status==='done');}
  return {layer,status:own?.status==='review'?'review':complete?'done':own?.status||'pending',offset,total,percent:total?Math.floor(offset/total*100):complete?100:0,complete,contentComplete,error:own?.error||null,step:own?.step,lastAction:own?.lastAction,lastUpdatedAt:own?.updatedAt,lastSavedAt:own?.lastSavedAt||own?.parts?.at(-1)?.savedAt,currentRange:own?.currentRange,dependency:layer==='skill'?'仅使用已保存的有据知识点；缺少知识依据时先启动知识层，不自动重跑知识层。':layer==='concept'?'只读原始 Vault，独立于知识和技能；仅提取本地覆盖缺口，不复审已保存概念。':null};
 }
 status(id){const sources=id?[this.source(id)]:this.store.nodes.filter(n=>n.kind==='vault'&&!n.mergedInto);return {sources:sources.map(n=>({sourceId:n.id,title:n.title,layers:['vault','knowledge','skill','concept'].map(layer=>this.progress(n,layer))})),active:[...this.active.keys()],externalConceptReviewRunning:!!this.externalSlots(),maxConcurrent:5};}
 start({sourceId,layer,connection=null,reanalyze=false,templateHash=null}){
  if(this.analyzer?.state.tasksPaused)fail('任务已全局暂停，请使用开始／断点继续',409);
  if(!['vault','knowledge','skill','concept'].includes(layer))fail('资料处理层无效');const n=this.source(sourceId),p=this.progress(n,layer);
  if(p.complete&&!reanalyze)return {alreadyComplete:true,progress:p,contentComplete:p.contentComplete,note:layer==='concept'&&!p.contentComplete?'本地覆盖已完成；不再调用模型重复复核。':null};
  if(layer==='concept'&&this.analyzer?.active.has('concept-only:'+sourceId))return {inProgress:true,queued:false,progress:p};
  if(this.analyzer?.active.has(sourceId))fail('这份资料正在联合处理，请在当前分段保存后再启动独立补层。',409);
  if(layer==='vault'){const result=this.query.indexVault(sourceId);this.store.state.revision++;return {indexed:true,...result};}
  if(layer==='skill'&&!this.knowledge(n).length)fail('该资料尚无可用知识依据。请先启动 AI 知识点层；不会替你重跑其他层。',409);
  if(connection){if(!this.connectionRunner)fail('当前连接入口尚未就绪',409);this.connectionRunner(connection);}
  const key=sourceId+':'+layer,old=this.own(n,layer);if(this.active.has(key)||old?.status==='queued')return {queued:true,duplicate:true,progress:p};
  if(reanalyze&&old?.templateHash===templateHash&&old.status==='done')return {alreadyComplete:true,templateHash};
  const reset=reanalyze&&old?.templateHash!==templateHash;
  this.state.entries[key]={...(reset?{}:old||{}),sourceId,layer,connection,sourceHash:n.hash,status:'queued',step:'QUEUED',offset:reset?0:old?.reanalyze?old.offset:p.offset,outputs:reset?[]:old?.outputs||[],issues:reset?[]:old?.issues||[],error:null,...(reanalyze?{reanalyze:true,templateHash}:{})};this.emit('LAYER_QUEUED',this.state.entries[key]);this.save();return {queued:true,progress:this.progress(n,layer)};
 }
 control({sourceId,layer,action,reason=''}){
  if(action==='resume'||action==='retry')return this.start({sourceId,layer,connection:this.own(this.source(sourceId),layer)?.connection||null});if(action!=='skip')fail('恢复操作无效');if(!reason.trim())fail('跳过必须填写原因');
  const n=this.source(sourceId),e=this.own(n,layer),key=sourceId+':'+layer;if(!e||this.active.has(key)||!['review','paused'].includes(e.status))fail('只有失败或暂停的任务可以暂时跳过');
  e.skipped=[...(e.skipped||[]),{offset:e.offset,at:new Date().toISOString(),reason:String(reason).slice(0,200)}];e.status='skipped';e.step='SKIPPED';this.emit('LAYER_SKIPPED',e);this.save();return {skipped:true,complete:false,offset:e.offset};
 }
 knowledge(source){return this.store.nodes.filter(n=>n.kind==='knowledge'&&!n.mergedInto&&n.sources.some(s=>s.id===source.id&&(!s.sourceHash||s.sourceHash===source.hash)));}
 pauseGlobal(){
  for(const [key,e]of Object.entries(this.state.entries))if(e.status==='queued'||this.active.has(key)){e.globalPause=true;if(!this.active.has(key)){e.status='paused';e.step='PAUSED';}}
  this.save();for(const controller of this.active.values())controller.abort();
 }
 resumeGlobal(){
  for(const e of Object.values(this.state.entries))if(e.globalPause){if(e.status==='paused'){e.status='queued';e.step='QUEUED';}delete e.globalPause;}
  this.save();
 }
 async tick(){
  if(this.store.executionCoordinator?.starting||this.store.executionCoordinator?.workerPresent()||classificationExecutorActive(this.store.root)||this.store.executionCoordinator?.state.enabled&&this.store.executionCoordinator.state.desired!=='running')return;
  if(this.analyzer?.state.tasksPaused)return;
  const free=5-this.active.size-(this.analyzer?.active.size||0)-this.externalSlots();if(free<=0)return;
  const jobs=Object.entries(this.state.entries).filter(([key,e])=>e.status==='queued'&&!this.active.has(key)&&!(e.layer==='concept'&&(this.externalSlots()||this.analyzer?.active.has('concept-only:'+e.sourceId))));
  await Promise.all(jobs.slice(0,free).map(([key,e])=>this.process(key,e)));
 }
 async process(key,e){
  if(this.analyzer?.state.tasksPaused)return;
  const controller=new AbortController();this.active.set(key,controller);e.status='working';this.save();
  try{
   const source=this.source(e.sourceId);if(source.hash!==e.sourceHash)throw Error('来源已变化，请重新核对断点后启动');
   const run=e.connection?this.connectionRunner(e.connection):this.runner,size=run.providerDescription?.chunkCharacters||40000;
   let part;if(e.layer==='concept'&&!e.reanalyze){const gap=this.concepts.gaps(source)[0];if(!gap){e.status='done';e.offset=source.body.length;this.save();return;}part=nextChunk(source.body,gap[0],size);part.end=Math.min(part.end,gap[1]);part.text=source.body.slice(part.start,part.end);}else part=nextChunk(source.body,e.offset,size);
   const candidates=e.layer==='skill'?[...this.knowledge(source).slice(-32),...rankCandidates(this.store.nodes,part.text,'skill')].map(n=>({id:n.id,kind:n.kind,title:n.title,excerpt:n.excerpt||n.body.slice(0,8000),categories:n.categories||[]})):rankCandidates(this.store.nodes,part.text,'knowledge');
   const historical=e.layer==='concept'&&this.analyzer.state.entries[source.id]?.status==='done';
   const payload={purpose:e.layer==='concept'?'concept-only':e.layer+'-only',historicalRecognition:historical,source:{id:source.id,title:source.title,hash:source.hash,offset:part.start,total:source.body.length,text:part.text},conceptsEnabled:e.layer==='concept',existingConcepts:e.layer==='concept'?this.concepts.context(source,part.text):[],knownConceptDiscussion:e.layer==='concept'?this.concepts.knownDiscussion(source):[],existingCandidates:candidates,mainTagCandidates:[],mainTagRegistry:[],relationshipTypes:this.store.state.types,validationFeedback:e.error||''};
   e.currentRange=[part.start,part.end];e.step='MODEL_RUNNING';this.emit('LAYER_MODEL_STARTED',e);this.save();
   if(e.reanalyze&&this.store.analysisTemplates?.input()[e.layer]?.hash!==e.templateHash)throw Error('确认模板已变化，请用新模板重新选择范围');
   payload.semanticNavigationCatalog=readNavigationIndex(this.store.meta).domains;
   const returnDir=path.join(this.store.meta,'layer-returns');fs.mkdirSync(returnDir,{recursive:true});const returnFile=path.join(returnDir,hash(JSON.stringify({key,sourceHash:source.hash,start:part.start,end:part.end,templateHash:e.templateHash||null,connection:e.connection||null}))+'.json');let result;if(fs.existsSync(returnFile))result=JSON.parse(fs.readFileSync(returnFile));else{result=await run(payload,{signal:controller.signal});write(returnFile,result);}e.preservedReturn=returnFile;this.save();if(controller.signal.aborted||this.analyzer?.state.tasksPaused)throw Error('任务已暂停');if(this.source(e.sourceId).hash!==e.sourceHash)throw Error('来源已变化，本段未提交');
   if(e.reanalyze){const renamed=new Map();for(const item of result[e.layer==='skill'?'skills':e.layer==='concept'?'concepts':'knowledge']||[]){const old=item.key;item.key+='|template:'+e.templateHash;renamed.set(old,item.key);item.existingId='';if(e.layer==='concept'){item.existingHash='';item.mergeDecision='new';}}for(const relation of result.relations||[]){relation.from=renamed.get(relation.from)||relation.from;relation.to=renamed.get(relation.to)||relation.to;}}
   e.step='VALIDATING';this.emit('LAYER_VALIDATING',e);this.save();
   for(const field of e.layer==='concept'?['knowledge','skills','relations','vaultRelations','mainTagUpdates']:e.layer==='knowledge'?['skills','concepts','unresolvedQuestions','vaultRelations','mainTagUpdates']:['knowledge','concepts','unresolvedQuestions','vaultRelations','mainTagUpdates'])if(result[field]?.length)throw Error('独立层任务返回了其他层内容，未保存');
   this.analyzer.prepareLocators(result,part,candidates,[]);this.analyzer.validate(result,part.text,candidates);
   if(e.layer==='concept')this.concepts.consume(source,part,result.concepts,result.unresolvedQuestions||[],{historical,template:result.analysisTemplates?.concept});else this.analyzer.apply(result,source,e,candidates,part);
   consumeGeneratedNavigation(this.store,result,source,run.providerDescription?.model||"unknown");
   e.offset=part.end;e.parts=[...(e.parts||[]),{start:part.start,end:part.end,savedAt:new Date().toISOString()}];e.error=null;e.status=e.layer==='concept'&&!e.reanalyze?(this.concepts.gaps(source).length?'queued':'done'):(e.offset===source.body.length?'done':'queued');e.step='SAVED';this.emit('LAYER_SEGMENT_SAVED',e);this.save();
  }catch(error){e.error=error.message;e.status=controller.signal.aborted?'paused':'review';e.step=controller.signal.aborted?'PAUSED':'FAILED';this.emit(controller.signal.aborted?'LAYER_PAUSED':'LAYER_ERROR',e,controller.signal.aborted?null:error);this.save();}
  finally{this.active.delete(key);}
 }
 run(){this.timer=setInterval(()=>this.tick().catch(()=>{}),1500);this.timer.unref();}
 stop(){clearInterval(this.timer);for(const controller of this.active.values())controller.abort();}
}
