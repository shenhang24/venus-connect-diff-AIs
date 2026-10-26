import {readNavigationIndex} from './navigation-index.mjs';
import {consumeGeneratedNavigation} from './semantic-navigation-producer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {hash} from './store.mjs';
import {createModelRunner} from './analysis-model.mjs';
import {classificationExecutorActive} from './classification-lock.mjs';
import {knowledgeSimilarity,normalizedKnowledge,KNOWLEDGE_SIMILARITY_THRESHOLD} from './knowledge-similarity.mjs';
import {validateContentTitle} from './content-titles.mjs';
import {skillMethodPolicy} from './skill-methods.mjs';

function atomic(file,value){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}
const requireText=(text,label)=>{if(typeof text!=='string'||!text.trim())throw new Error(label+'不能为空');return text;};
const quote=(text,q)=>{requireText(q,'依据引文');if(!text.includes(q))throw new Error('引文未逐字存在于当前分段：'+q.slice(0,60));};
const canonical=(kind,key)=>'a-'+(kind==='knowledge'?'k':'s')+'-'+hash(key.normalize('NFKC').trim().toLowerCase()).slice(0,20);
const sizeFailure=message=>/context.{0,30}(?:length|window|limit)|too (?:large|long)|too many tokens|token.{0,20}(?:limit|exceed)|payload.{0,20}large|\b413\b|(?:input|prompt).{0,30}(?:large|long)|maximum context|上下文.{0,20}(?:超|限制)|体积.{0,20}(?:超|大)|单段分析条数超出约定/i.test(message);
export function analysisLanguage(text){
  const cjk=(text.match(/[\u3400-\u9fff]/g)||[]).length;
  const latin=(text.match(/[a-z]/gi)||[]).length;
  return cjk>latin*.4?'zh':'en';
}

export function nextChunk(body,offset,size=40000){
  let end=Math.min(body.length,offset+size);
  if(end<body.length){const boundary=body.lastIndexOf('\n',end);if(boundary>offset+size*.6)end=boundary+1;}
  return {start:offset,end,text:body.slice(offset,end)};
}
export function remainingChunkCount(body,offset,size){
  let count=0;while(offset<body.length){offset=nextChunk(body,offset,size).end;count++;}return count;
}
export function rankCandidates(nodes,text,kind){
  const sample=text.toLowerCase();
  return nodes.filter(n=>n.kind===kind&&!n.mergedInto).map(n=>{
    const terms=(n.title+' '+(n.categories||[]).join(' ')).toLowerCase().match(/[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}/g)||[];
    let score=0;
    for(const term of terms){
      if(sample.includes(term))score+=term.length;
      else for(let i=0;i<term.length-1;i++)if(sample.includes(term.slice(i,i+2)))score+=.15;
    }
    return {node:n,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12).map(({node:n})=>({
    id:n.id,title:n.title,kind:n.kind,excerpt:n.body.slice(0,kind==='skill'?8000:1400),categories:n.categories||[],
  }));
}

export class AutoAnalyzer {
  constructor(store,{runner,chunkSize=40000,interval=2000,clock=()=>Date.now(),maxConcurrent=1,enableMainTagBackfill=false,conceptExtractor=null}={}){
    this.store=store;this.chunkSize=chunkSize;this.interval=interval;this.clock=clock;
    this.file=path.join(store.meta,'analysis.json');
    this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):
      {version:1,enabled:true,entries:{},cooldownUntil:0};
    this.directory=path.join(store.meta,'analysis-results');fs.mkdirSync(this.directory,{recursive:true});
    this.runner=runner||createModelRunner(path.join(store.meta,'analysis-runtime'));
    this.maxConcurrent=Math.max(1,Math.min(5,Math.floor(maxConcurrent)||1));
    this.enableMainTagBackfill=enableMainTagBackfill;
    this.conceptExtractor=conceptExtractor;
    this.active=new Map();this.tagReservations=new Set();this.running=false;this.stopped=false;this.current=null;
    store.analyzer=this;
  }
  save(){atomic(this.file,this.state);this.store.state.revision++;this.store.save();}
  tagsReviewed(node){return node.mainTagsReviewed&&(node.mainTags?.length||node.body.length<=3000||this.state.mainTagCoverage?.[node.id]?.sourceHash===node.hash&&this.state.mainTagCoverage[node.id].offset>=node.body.length);}
  status(){
    const ids=new Set(this.store.nodes.filter(n=>n.kind==='vault'&&!n.mergedInto&&!this.store.state.archiveOnlySources?.[n.id]).map(n=>n.id));
    const entries=Object.values(this.state.entries).filter(e=>ids.has(e.sourceId));
    const byId=new Map(this.store.nodes.map(n=>[n.id,n]));
    return {enabled:this.state.enabled,running:this.running,current:this.current,
      completed:entries.filter(e=>e.status==='done').length,
      retrying:entries.filter(e=>e.status==='retry').length,
      needsReview:entries.filter(e=>e.status==='review').length,
      withNotes:entries.filter(e=>e.issues.length>0).length,
      scheduling:this.maxConcurrent>1?'parallel-files':'sequential-files',
      maxConcurrent:this.maxConcurrent,activeFiles:[...this.active.values()].map(({controller,...file})=>file),
      concepts:this.conceptExtractor?.status()||null,
      inputPolicy:'direct-local-material',readDiagnostics:{...this.store.readStats,lastCommit:this.state.lastCommitReadStats||null},
      mainTagProgress:{covered:this.store.nodes.filter(n=>!n.mergedInto&&n.mainTags?.length).length,reviewed:this.store.nodes.filter(n=>!n.mergedInto&&this.tagsReviewed(n)).length,total:this.store.nodes.filter(n=>!n.mergedInto).length,unresolved:this.store.nodes.filter(n=>!n.mergedInto&&this.tagsReviewed(n)&&!n.mainTags?.length).length,error:this.state.mainTagLastError||null},
      resumedSizeDeferred:this.state.lastSizeResume?.count||0,
      fileProgress:Object.fromEntries(entries.map(e=>{
        const body=byId.get(e.sourceId).body;
        return [e.sourceId,{status:e.status,phase:e.phase,offset:e.offset,parts:e.parts.length,totalCharacters:body.length,totalParts:e.parts.length+remainingChunkCount(body,e.offset,Math.min(e.chunkSize||this.chunkSize,this.chunkSize)),error:e.status==='review'?e.lastError:null}];
      })),
      total:this.store.nodes.filter(n=>n.kind==='vault'&&!n.mergedInto&&!this.store.state.archiveOnlySources?.[n.id]).length,
      segments:entries.reduce((sum,e)=>sum+e.parts.length,0),
      cooldownUntil:this.state.cooldownUntil||0,lastError:this.state.lastError||null,
      issues:entries.filter(e=>e.issues.length||e.status==='review').map(e=>({sourceId:e.sourceId,
        messages:e.issues.map(i=>i.text).slice(-10),error:e.status==='review'?e.lastError:null})).slice(0,50)};
  }
  configure({enabled,retryFailed=false,resumeSizeDeferred=false,retrySourceIds=[],rebuildSkillLinks=false}){
    if(enabled===true&&this.state.tasksPaused)throw Object.assign(Error('任务已全局暂停，请使用开始／断点继续'),{status:409});
    if(typeof enabled==='boolean')this.state.enabled=enabled;
    if(!this.state.enabled)for(const file of this.active.values())file.controller.abort();
    if(rebuildSkillLinks)this.rebuildSkillLinks();
    for(const id of new Set(retrySourceIds)){
      const entry=this.state.entries[id];
      if(entry&&['review','retry'].includes(entry.status)){
        entry.status='queued';entry.attempts=0;entry.retryAt=0;
      }
    }
    if(retryFailed){
      this.state.cooldownUntil=0;
      for(const e of Object.values(this.state.entries))if(['review','retry'].includes(e.status)){
        e.status='queued';e.attempts=0;e.retryAt=0;
      }
    }
    if(resumeSizeDeferred){
      const resumed=new Set();
      for(const job of this.store.state.jobs){
        const entry=this.state.entries[job.sourceId];
        const reason=job.stage||'';
        if(job.status==='paused'&&/大文件|文件.{0,12}(?:过大|太大)|体积|too large|size/i.test(reason)){
          this.store.job({sourceId:job.sourceId,status:'queued',stage:'已恢复，按原顺序从保存位置连续处理'});resumed.add(job.sourceId);
        }
        if(entry&&entry.status==='review'&&sizeFailure(entry.lastError||'')){
          entry.status='queued';entry.attempts=0;entry.retryAt=0;
          entry.chunkSize=Math.max(Math.min(2000,this.chunkSize),Math.floor((Math.min(entry.chunkSize||this.chunkSize,this.chunkSize))/2));
          resumed.add(job.sourceId);
        }
      }
      this.state.lastSizeResume={count:resumed.size,time:new Date(this.clock()).toISOString()};
    }
    this.save();return this.status();
  }
  discover(){
    if(!this.store.backgroundRefresh)this.store.scan();
    let changed=false;
    for(const n of this.store.nodes.filter(n=>n.kind==='vault'&&!n.mergedInto&&!this.store.state.archiveOnlySources?.[n.id])){
      const previous=this.state.entries[n.id];
      const reviewToken=this.store.state.reviewRequests?.[n.id]||'';
      if(!previous||previous.sourceHash!==n.hash||(previous.reviewToken||'')!==reviewToken){
        this.state.entries[n.id]={sourceId:n.id,sourceHash:n.hash,offset:0,parts:[],status:'queued',
          reviewToken,attempts:0,retryAt:0,lastWorked:0,previousOutputs:previous?.outputs||[],outputs:[],issues:[]};
        const existingJob=this.store.state.jobs.find(j=>j.sourceId===n.id);
        if(existingJob?.status!=='paused')this.store.job({sourceId:n.id,status:'queued',stage:previous?'正文已变化，自动重新分析':'等待后台自动归纳分类'});
        changed=true;
      }
    }
    if(changed)this.save();
  }
  start(){this.timer=setInterval(()=>this.tick().catch(e=>{this.state.lastError=e.message;this.save();}),this.interval);this.timer.unref();this.tick().catch(()=>{});}
  stop(){this.stopped=true;clearInterval(this.timer);for(const file of this.active.values())file.controller.abort();}
  checkActive(entry){
    if(this.stopped||!this.state.enabled||this.store.state.jobs.find(j=>j.sourceId===entry.sourceId)?.status==='paused')throw new Error('ANALYSIS_CANCELLED');
    if(this.store.find(entry.sourceId).hash!==entry.sourceHash)throw new Error('SOURCE_CHANGED');
    if((this.store.state.reviewRequests?.[entry.sourceId]||'')!==(entry.reviewToken||''))throw new Error('SOURCE_CHANGED');
  }
  async tick(){
    if(this.draining)return;
    if(classificationExecutorActive(this.store.root))return;
    for(const file of this.active.values())
      if(this.store.state.jobs.find(j=>j.sourceId===file.sourceId)?.status==='paused')file.controller.abort();
    const occupied=(this.store.layerPipeline?.active.size||0)+(this.store.layerPipeline?.externalSlots()||0);
    if(this.active.size+occupied>=this.maxConcurrent)return;
    if(this.stopped||!this.state.enabled||this.clock()<(this.state.cooldownUntil||0))return;
    this.discover();
    this.conceptExtractor?.initializeBatch();
    const available=Object.values(this.state.entries).filter(e=>
      !this.active.has(e.sourceId)&&!this.store.layerPipeline?.activeSources().has(e.sourceId)&&!['done','review'].includes(e.status)&&
      this.store.nodes.some(n=>n.id===e.sourceId&&!n.mergedInto)&&
      this.store.state.jobs.find(j=>j.sourceId===e.sourceId)?.status!=='paused');
    // Dispatch in persisted import order. Each file has at most one active segment.
    const order=new Map(this.store.state.jobs.map((job,index)=>[job.sourceId,index]));
    available.sort((a,b)=>(order.get(a.sourceId)??Infinity)-(order.get(b.sourceId)??Infinity));
    if(this.maxConcurrent===1&&available[0]?.retryAt>this.clock())return;
    const historical=!this.store.layerPipeline?.externalSlots()&&this.conceptExtractor?.batchComplete()&&!([...this.active.values()].some(f=>f.taskKind==='concept-only'))&&this.conceptExtractor.nextHistorical(this.clock())&&(this.maxConcurrent>1||!available.length||this.conceptBackfillTurn!==false);
    const free=this.maxConcurrent-this.active.size-occupied;
    const ready=available.filter(entry=>entry.retryAt<=this.clock()).slice(0,free-(historical?1:0));
    if(historical){this.conceptBackfillTurn=false;await Promise.all([this.processConceptBackfill(),...ready.map(entry=>this.processEntry(entry))]);return;}
    if(this.enableMainTagBackfill&&!ready.length&&this.store.nodes.some(n=>n.kind!=='concept'&&!n.mergedInto&&!this.tagsReviewed(n)&&!this.tagReservations.has(n.id)))return this.processMainTagBatch();
    if(ready.length)this.conceptBackfillTurn=true;
    await Promise.all(ready.map(entry=>this.processEntry(entry)));
  }
  async processConceptBackfill(){
    const task=this.conceptExtractor.nextHistorical(this.clock());if(!task)return;
    const {source,part,key,pending}=task,activeKey='concept-only:'+source.id,controller=new AbortController();
    const used=new Set([...this.active.values()].map(f=>f.slot)),slot=Array.from({length:this.maxConcurrent},(_,i)=>i+1).find(n=>!used.has(n));if(!slot)return;
    this.active.set(activeKey,{sourceId:activeKey,title:source.title,taskKind:'concept-only',offset:part.start,end:part.end,total:source.body.length,slot,controller});this.running=true;
    this.conceptExtractor.state.backfillStarted=true;
    const artifact=path.join(this.directory,'concept-'+hash(source.id+'|'+source.hash+'|'+part.start+'|'+part.end)+'.json');
    try{
      const cached=pending&&pending.start===part.start&&pending.end===part.end?path.join(this.directory,path.basename(pending.artifact)):artifact;
      const failure=this.conceptExtractor.state.failures?.[key];
      const result=fs.existsSync(cached)&&!failure?JSON.parse(fs.readFileSync(cached,'utf8')):await this.runner({purpose:'concept-only',conceptsEnabled:true,historicalRecognition:true,source:{id:source.id,title:source.title,hash:source.hash,offset:part.start,total:source.body.length,text:part.text},existingConcepts:this.conceptExtractor.context(source,part.text),knownConceptDiscussion:this.conceptExtractor.knownDiscussion(source),existingCandidates:[],mainTagCandidates:[],relationshipTypes:[],validationFeedback:failure?.error||pending?.error||''},{signal:controller.signal});
      if(this.stopped||!this.state.enabled||controller.signal.aborted)throw Error('ANALYSIS_CANCELLED');
      if(this.store.find(source.id).hash!==source.hash)throw Error('SOURCE_CHANGED');
      if(fs.existsSync(artifact))fs.copyFileSync(artifact,artifact+'.previous-'+this.clock());
      atomic(artifact,result);this.conceptExtractor.consume(source,part,result.concepts,result.unresolvedQuestions||[],{historical:true,template:result.analysisTemplates?.concept});
    }catch(error){if(error.message!=='ANALYSIS_CANCELLED'){this.conceptExtractor.failHistorical(key,error,this.clock());if(/rate.?limit|usage.?limit|quota|\b429\b/i.test(error.message))this.state.cooldownUntil=this.clock()+30*60*1000;}}
    finally{this.active.delete(activeKey);this.running=this.active.size>0;this.current=([...this.active.values()].map(({controller,...f})=>f))[0]||null;this.save();}
  }
  async processEntry(entry){
    const controller=new AbortController();
    const source=this.store.find(entry.sourceId),part=nextChunk(source.body,entry.offset,Math.min(entry.chunkSize||this.chunkSize,this.chunkSize));
    const used=new Set([...this.active.values()].map(file=>file.slot));
    const slot=Array.from({length:this.maxConcurrent},(_,i)=>i+1).find(n=>!used.has(n));
    this.active.set(source.id,{sourceId:source.id,title:source.title,offset:part.start,end:part.end,total:source.body.length,slot,controller});
    this.running=true;this.current=(({controller,...file})=>file)([...this.active.values()][0]);
    entry.phase=2;entry.status='working';entry.lastWorked=this.clock();this.save();
    this.store.job({sourceId:source.id,status:'working',stage:`自动阅读 ${part.start}–${part.end} / ${source.body.length} 字符；已完成 ${entry.parts.length} 段`});
    const artifact=path.join(this.directory,hash(source.id+'|'+source.hash+'|'+part.start+'|'+part.end+(entry.reviewToken?'|'+entry.reviewToken:''))+'.json');
    let tagCandidates=[];
    try{
      const candidates=[...rankCandidates(this.store.nodes,part.text,'knowledge'),...rankCandidates(this.store.nodes,part.text,'skill'),
        ...rankCandidates(this.store.nodes.filter(n=>n.id!==source.id),part.text,'vault')];
      // Continue the concepts already saved from this file even when wording changes.
      const priorKnowledge=[...new Set([...entry.outputs,...(entry.previousOutputs||[])])].map(id=>this.store.nodes.find(n=>n.id===id)).filter(n=>n?.kind==='knowledge'&&n.sources.some(s=>s.id===source.id));
      for(const n of priorKnowledge.slice(-8)){
        if(!candidates.some(c=>c.id===n.id))candidates.push({id:n.id,title:n.title,kind:n.kind,excerpt:n.body.slice(0,1400),categories:n.categories||[]});
      }
      tagCandidates=this.reserveMainTagCandidates();
      const knowledgeDone=this.store.layerPipeline?.progress(source,'knowledge').complete,skillDone=this.store.layerPipeline?.progress(source,'skill').complete,conceptDone=this.store.layerPipeline?.progress(source,'concept').complete;
      const purpose=knowledgeDone?(skillDone?'concept-only':'skill-only'):skillDone?'knowledge-only':undefined;
      const payload={purpose,source:{id:source.id,title:source.title,hash:source.hash,offset:part.start,total:source.body.length,text:part.text},
        conceptsEnabled:!!this.conceptExtractor&&!conceptDone,existingConcepts:this.conceptExtractor?.context(source,part.text)||[],knownConceptDiscussion:this.conceptExtractor?.knownDiscussion(source)||[],
        mainTagCandidates:tagCandidates,mainTagRegistry:[...new Set(this.store.nodes.flatMap(n=>(n.mainTags||[]).map(t=>t.name)))],relationshipTypes:this.store.state.types,
        continuationContext:{coveredUntil:entry.offset,previousSegments:entry.parts.slice(-3).map(p=>({start:p.start,end:p.end,summary:p.summary})),
          savedKnowledgeIds:priorKnowledge.map(n=>n.id)},
        existingCandidates:candidates,categories:[...new Set(this.store.nodes.flatMap(n=>n.categories||[]))].slice(0,80),
        validationFeedback:entry.lastError||''};
      let result;
      if(fs.existsSync(artifact))result=JSON.parse(fs.readFileSync(artifact,'utf8'));
      else{
        payload.semanticNavigationCatalog=readNavigationIndex(this.store.meta).domains;
        result=await this.runner(payload,{signal:controller.signal});
      }
      this.checkActive(entry);
      this.prepareLocators(result,part,candidates,tagCandidates);
      if(knowledgeDone&&result.knowledge?.length||skillDone&&result.skills?.length||conceptDone&&result.concepts?.length)throw Error('已完成层返回重复提取结果，未覆盖已有成果');
      this.validate(result,part.text,candidates);
      const readBefore={...this.store.readStats};
      this.checkActive(entry);atomic(artifact,result);
      // Single process, synchronous commit: re-read current nodes and merge sources
      // inside apply. No await is permitted between validation and persisted save.
      this.apply(result,source,entry,candidates,part);
      if(result.mainTags?.length)this.applyMainTagUpdates([{id:source.id,mainTags:result.mainTags,reviewReason:''}],[{id:source.id,hash:source.hash}],true);
      this.applyMainTagUpdates(result.mainTagUpdates||[],tagCandidates);
      if(this.conceptExtractor&&Array.isArray(result.concepts)){
        try{this.conceptExtractor.consume(source,part,result.concepts,result.unresolvedQuestions||[],{template:result.analysisTemplates?.concept});}
        catch(error){this.conceptExtractor.defer(source,part,artifact,error);entry.issues.push({segment:part.start,text:'概念保存待补提：'+error.message});}
      }
      entry.offset=part.end;entry.parts.push({start:part.start,end:part.end,summary:result.summary,tags:result.tags,artifact:path.basename(artifact)});
      entry.issues.push(...result.issues.map(text=>({segment:part.start,text})));
      entry.attempts=0;entry.retryAt=0;entry.lastError=null;this.state.lastError=null;
      const finished=entry.offset>=source.body.length;
      if(finished)entry.phase=3;
      this.classifySource(source,entry,finished);
      consumeGeneratedNavigation(this.store,result,source,this.runner.providerDescription?.model||"unknown");
      entry.status=finished?'done':'queued';
      this.store.job({sourceId:source.id,status:finished?'done':'queued',stage:finished?
        `自动归纳、知识关系与技能整合完成；${entry.parts.length} 段${entry.issues.length?'；有 '+entry.issues.length+' 条待核对说明':''}`:
        `继续当前文件：已分析 ${entry.offset} / ${source.body.length} 字符；本文件完成后处理下一份`});
      this.state.lastCommitReadStats={sourceId:source.id,offset:entry.offset,fullScans:this.store.readStats.fullScans-readBefore.fullScans,targetedScans:this.store.readStats.targetedScans-readBefore.targetedScans,resultValidations:1};
      this.save();
    }catch(error){
      if(error.message==='ANALYSIS_CANCELLED'||error.message==='SOURCE_CHANGED'){
        entry.status='queued';
        const j=this.store.state.jobs.find(j=>j.sourceId===source.id);
        if(j&&j.status!=='paused')this.store.job({sourceId:source.id,status:'queued',stage:'已保存断点，等待自动继续'});
      }else{
        // Do not reuse an artifact which failed validation or application.
        if(fs.existsSync(artifact))fs.renameSync(artifact,artifact+'.rejected-'+this.clock());
        entry.attempts++;entry.lastError=error.message;this.state.lastError=error.message;
        entry.failureHistory=[...(entry.failureHistory||[]),{time:new Date(this.clock()).toISOString(),offset:entry.offset,chunkSize:Math.min(entry.chunkSize||this.chunkSize,this.chunkSize),attempt:entry.attempts,error:error.message}].slice(-20);
        const limited=/rate.?limit|usage.?limit|quota|too many requests|\b429\b|(?:usage|daily|weekly|monthly).{0,30}limit.{0,15}reached/i.test(error.message);
        const currentSize=Math.min(entry.chunkSize||this.chunkSize,this.chunkSize),minimum=Math.min(2000,this.chunkSize);
        const reduced=!limited&&sizeFailure(error.message)&&currentSize>minimum;
        if(limited){this.state.cooldownUntil=this.clock()+30*60*1000;entry.retryAt=this.state.cooldownUntil;entry.status='retry';}
        else if(reduced){entry.chunkSize=Math.max(minimum,Math.floor(currentSize/2));entry.status='queued';entry.retryAt=0;entry.attempts=0;}
        else{entry.status=entry.attempts>=3?'review':'retry';entry.retryAt=this.clock()+Math.min(15*60*1000,10000*2**entry.attempts);}
        this.store.job({sourceId:source.id,status:'queued',stage:reduced?`本段超出处理上限，缩小至 ${entry.chunkSize} 字符，从 ${entry.offset} 继续当前文件`:
          entry.status==='review'?'实际处理失败：自动重试 3 次未通过；已保留断点和具体错误：'+error.message.slice(0,160):
          limited?'模型额度暂不可用，30 分钟后自动重试':'本段处理失败，从断点重试：'+error.message.slice(0,160)});
      }
      this.save();
    }finally{
      for(const candidate of tagCandidates)this.tagReservations.delete(candidate.id);
      this.active.delete(source.id);this.running=this.active.size>0;
      const first=[...this.active.values()][0];this.current=first?(({controller,...file})=>file)(first):null;
      this.save();
    }
  }
  reserveMainTagCandidates(){
    const pending=this.store.nodes.filter(n=>!n.mergedInto&&!this.tagsReviewed(n)&&!this.tagReservations.has(n.id)&&
      !(this.state.mainTagFailures?.[n.id]?.sourceHash===n.hash&&this.state.mainTagFailures[n.id].retryAt>this.clock()));
    const groups=['vault','knowledge','skill'].map(kind=>pending.filter(n=>n.kind===kind));
    const nodes=[];
    while(nodes.length<20&&groups.some(group=>group.length))for(const group of groups)if(group.length&&nodes.length<20)nodes.push(group.shift());
    return nodes.map(n=>{
      this.tagReservations.add(n.id);
      const coverage=this.state.mainTagCoverage?.[n.id];
      const offset=coverage?.sourceHash===n.hash?coverage.offset:0;
      return {id:n.id,hash:n.hash,kind:n.kind,offset,total:n.body.length,excerpt:n.body.slice(offset,offset+3000),summary:n.classification?.summary?.slice(0,1200)||'',evidence:(n.classification?.tags||[]).map(t=>t.quote).filter(q=>this.store.quoteValidInBody(n.hash,n.body,q)).slice(0,12),sources:n.sources.map(s=>({id:s.id,quote:s.quote.slice(0,300)}))};
    });
  }
  applyMainTagUpdates(updates,candidates,merge=false){
    if(!updates?.length)return;
    this.store.refreshForIds(updates.filter(u=>candidates.some(c=>c.id===u.id)).map(u=>u.id));let changed=false;
    for(const update of updates){
      const candidate=candidates.find(c=>c.id===update.id);
      if(!candidate)continue;
      const node=this.store.nodes.find(n=>n.id===update.id);if(!node)continue;
      if(node.hash!==candidate.hash)continue;
      const tags=merge?[...new Map([...(node.mainTags||[]),...(update.mainTags||[])].map(t=>[t.name,t])).values()].slice(0,6):update.mainTags;
      this.state.mainTagFailures ||= {};
      try{
        if(!tags?.length&&candidate.total&&candidate.offset+candidate.excerpt.length<candidate.total){
          requireText(update.reviewReason,'暂未分类原因');
          this.state.mainTagCoverage||={};
          this.state.mainTagCoverage[node.id]={sourceHash:node.hash,offset:candidate.offset+candidate.excerpt.length,reviewReason:update.reviewReason||''};
          delete this.state.mainTagFailures[node.id];continue;
        }
        this.store.setMainTags({id:node.id,sourceHash:node.hash,tags,reviewReason:update.reviewReason||''},{defer:true});changed=true;
        this.state.mainTagCoverage||={};this.state.mainTagCoverage[node.id]={sourceHash:node.hash,offset:node.body.length};
        delete this.state.mainTagFailures[node.id];
      }catch(error){
        const old=this.state.mainTagFailures[node.id],attempts=(old?.sourceHash===node.hash?old.attempts:0)+1;
        this.state.mainTagFailures[node.id]={sourceHash:node.hash,message:error.message,attempts,retryAt:this.clock()+Math.min(600000,30000*2**(attempts-1))};
        this.state.mainTagLastError=error.message;
      }
    }
    if(changed){this.store.save();this.store.refreshForIds(updates.filter(u=>candidates.some(c=>c.id===u.id)).map(u=>u.id));}
    if(!Object.keys(this.state.mainTagFailures||{}).length)this.state.mainTagLastError=null;
  }
  async processMainTagBatch(){
    const candidates=this.reserveMainTagCandidates();if(!candidates.length)return;
    const key='main-tags:'+candidates[0].id,controller=new AbortController();
    const used=new Set([...this.active.values()].map(f=>f.slot));
    const slot=Array.from({length:this.maxConcurrent},(_,i)=>i+1).find(n=>!used.has(n));
    this.active.set(key,{sourceId:key,title:'主分类存量归纳',taskKind:'main-tags',offset:0,end:candidates.length,total:candidates.length,slot,controller});
    this.running=true;this.current=(({controller,...file})=>file)([...this.active.values()][0]);this.save();
    try{
      const first=candidates[0];
      const result=await this.runner({purpose:'main-tags-only',source:{id:first.id,title:'主分类归纳',text:first.excerpt,offset:0,total:first.excerpt.length},existingCandidates:[],mainTagCandidates:candidates,mainTagRegistry:[...new Set(this.store.nodes.flatMap(n=>(n.mainTags||[]).map(t=>t.name)))],relationshipTypes:this.store.state.types},{signal:controller.signal});
      this.prepareLocators(result,{text:first.excerpt,start:0,end:first.excerpt.length},[],candidates);
      if(!this.stopped&&this.state.enabled&&!controller.signal.aborted)this.applyMainTagUpdates(result.mainTagUpdates||[],candidates);
    }catch(error){
      this.state.mainTagLastError=error.message;
      if(/rate.?limit|usage.?limit|quota|\b429\b/i.test(error.message))this.state.cooldownUntil=this.clock()+30*60*1000;
    }finally{
      for(const c of candidates)this.tagReservations.delete(c.id);
      this.active.delete(key);this.running=this.active.size>0;
      const first=[...this.active.values()][0];this.current=first?(({controller,...file})=>file)(first):null;this.save();
    }
  }
  prepareLocators(result,part,candidates,tagCandidates=[]){
    if(!result||typeof result!=='object')return;
    let adjusted=0;
    const locate=(item,key,text)=>{
      if(!item||typeof text!=='string')return;
      if(typeof item[key]==='string'&&item[key].trim()&&text.includes(item[key]))return;
      const start=Math.max(0,text.search(/\S/));item[key]=text.slice(start,start+160).replace(/[\uD800-\uDBFF]$/,'');item.locatorFallback=true;adjusted++;
    };
    for(const item of [...(result.tags||[]),...(result.knowledge||[]),...(result.relations||[]),...(result.vaultRelations||[]),...(result.newRelationTypes||[])])locate(item,'quote',part.text);
    for(const item of [...(result.knowledge||[]),...(result.skills||[])])for(const tag of item.mainTags||[])locate(tag,'quote',item.body);
    for(const tag of result.mainTags||[])locate(tag,'quote',part.text);
    for(const update of result.mainTagUpdates||[]){const candidate=tagCandidates.find(c=>c.id===update.id);if(candidate)for(const tag of update.mainTags||[])if(!candidate.evidence?.some(q=>q.includes(tag.quote)))locate(tag,'quote',candidate.excerpt);}
    for(const relation of result.relations||[]){const peer=candidates.find(c=>[relation.from,relation.to].includes(c.id));if(peer)locate(relation,'otherQuote',peer.excerpt);}
    for(const relation of result.vaultRelations||[]){const peer=candidates.find(c=>c.id===relation.to);if(peer)locate(relation,'otherQuote',peer.excerpt);}
    for(const skill of result.skills||[])if(skill.level==='实践'){
      const position=typeof skill.practiceQuote==='string'?part.text.indexOf(skill.practiceQuote):-1;
      const role=position>=0?[...part.text.slice(0,position).matchAll(/^### (\w+) · /gm)].at(-1)?.[1]:null;
      if(position<0||role!=='user'){skill.level='涉及';skill.practiceQuote='';if(Array.isArray(result.issues))result.issues.push('保留技能归纳，不将来源角色不明或助手描述标为用户实践。');}
    }
    if(adjusted&&Array.isArray(result.issues))result.issues.push('保留来源分段定位供回查；模型改写未作为逐字引文使用，不因此重试分析。');
    this.state.lastLocatorAdjustments=adjusted;
  }
  validate(r,text,candidates){
    requireText(r.summary,'归纳');
    for(const name of ['tags','knowledge','relations','skills','vaultRelations','issues'])if(!Array.isArray(r[name]))throw new Error('结果字段缺失：'+name);
    const limits={tags:8,knowledge:6,skills:3,relations:24,vaultRelations:12};
    const exceeded=Object.entries(limits).filter(([key,limit])=>r[key].length>limit);
    if(exceeded.length)throw new Error('单段分析条数超出约定：'+exceeded.map(([key,limit])=>key+'='+r[key].length+'（上限 '+limit+'）').join('；'));
    const candidateIds=new Set(candidates.map(n=>n.id));
    for(const tag of r.tags){requireText(tag.name,'类别');requireText(tag.reason,'分类理由');quote(text,tag.quote);if(tag.name.length>40)throw new Error('类别名过长');}
    for(const n of [...r.knowledge,...r.skills]){
      if(r.unresolvedQuestions!==undefined)validateContentTitle(n.title,[n.category,...(n.mainTags||[]).map(t=>t.name)]);
      for(const field of ['key','title','body','category','categoryReason'])requireText(n[field],field);
      if(n.existingId&&!candidateIds.has(n.existingId))throw new Error('不能引用候选以外的已有知识');
    }
    for(const k of r.knowledge){quote(text,k.quote);if(!['用户观点','助手建议','已确认决定','有据知识','待核对'].includes(k.epistemic))throw new Error('知识性质无效');}
    if(new Set([...r.knowledge,...r.skills].map(n=>n.key)).size!==r.knowledge.length+r.skills.length)throw new Error('知识与技能 key 必须互不重复');
    for(const [kind,items] of [['knowledge',r.knowledge],['skill',r.skills]])for(const n of items){
      if(n.existingId&&candidates.find(c=>c.id===n.existingId)?.kind!==kind)throw new Error('复用记录必须处于同一层');
    }
    const refs=new Set([...candidateIds,...r.knowledge.map(k=>k.key),...r.skills.map(s=>s.key)]);
    for(const s of r.skills){
      if(!['涉及','实践'].includes(s.level)||!Array.isArray(s.knowledgeKeys)||!s.knowledgeKeys.length||s.knowledgeKeys.some(k=>!refs.has(k)))throw new Error('技能缺少有效知识依据');
      if(s.level==='实践'){
        quote(text,s.practiceQuote);
        const position=text.indexOf(s.practiceQuote),prefix=text.slice(0,position);
        const role=[...prefix.matchAll(/^### (\w+) · /gm)].at(-1)?.[1];
        if(role!=='user')throw new Error('实践证据必须来自明确的用户消息，不能使用助手建议');
      }
    }
    for(const e of [...r.relations,...r.vaultRelations]){
      quote(text,e.quote);requireText(e.summary,'连接原因简述');requireText(e.reason,'连接理由');
      if(![...this.store.state.types.map(t=>t.id),...(r.newRelationTypes||[]).map(t=>t.id)].includes(e.type)||!Number.isFinite(e.strength)||e.strength<0||e.strength>1)throw new Error('关系类型或强度无效');
    }
    for(const type of r.newRelationTypes||[]){if(!/^[a-zA-Z0-9_-]{1,64}$/.test(type.id)||!type.name?.trim()||!type.reason?.trim())throw new Error('关系类型声明无效');quote(text,type.quote);}
    const kinds=new Map([...candidates.map(c=>[c.id,c.kind]),...r.knowledge.map(k=>[k.key,'knowledge']),...r.skills.map(s=>[s.key,'skill'])]);
    for(const e of r.relations){
      if(kinds.get(e.from)!==kinds.get(e.to)||!['knowledge','skill'].includes(kinds.get(e.from)))throw new Error('关系必须连接同一网络的知识点或技能');
      const peers=candidates.filter(c=>[e.from,e.to].includes(c.id));
      if(peers.length&&(!e.otherQuote||!peers.some(c=>c.excerpt.includes(e.otherQuote))))throw new Error('跨来源关系缺少对方逐字依据');
    }
    for(const e of r.relations)if(!refs.has(e.from)||!refs.has(e.to))throw new Error('关系端点缺少依据');
    for(const e of r.vaultRelations){const target=candidates.find(n=>n.id===e.to&&n.kind==='vault');if(!target)throw new Error('资料关系目标不在候选中');quote(target.excerpt,e.otherQuote);}
  }
  apply(result,source,entry,candidates,part){
    for(const type of result.newRelationTypes||[])if(!this.store.state.types.some(t=>t.id===type.id)){
      const palette=['#79b8dd','#e6b770','#8bd2b0','#d59abf','#b9a2ef','#d1cd80'];
      this.store.type({id:type.id,name:type.name,color:palette[parseInt(hash(type.id).slice(0,4),16)%palette.length],reason:type.reason,sources:[{id:source.id,quote:type.quote,sourceHash:source.hash}]});
    }
    const references=new Map(candidates.map(n=>[n.id,n.id]));
    const remember=id=>{if(!entry.outputs.includes(id))entry.outputs.push(id);};
    const upsert=(kind,item,sources,body,extra={})=>{
      const existing=item.existingId?this.store.nodes.find(n=>n.id===item.existingId):undefined;
      let id=item.existingId&&existing?existing.id:canonical(kind,kind==='knowledge'?source.id+'|'+item.key:item.key),old=this.store.nodes.find(n=>n.id===id);
      if(kind==='knowledge'&&old){const similarity=knowledgeSimilarity(old.body,body);entry.similarityDecisions||=[];entry.similarityDecisions.push({existingId:old.id,similarity,threshold:KNOWLEDGE_SIMILARITY_THRESHOLD,action:similarity>=KNOWLEDGE_SIMILARITY_THRESHOLD?'reuse':'separate'});entry.similarityDecisions=entry.similarityDecisions.slice(-100);if(similarity<KNOWLEDGE_SIMILARITY_THRESHOLD){id=canonical(kind,source.id+'|'+item.key+'|'+hash(normalizedKnowledge(body)));old=this.store.nodes.find(n=>n.id===id);}}
      if(kind==='skill'&&old?.methodPolicy?.status==='user-confirmed'&&(extra.methodPolicy?.status!=='user-confirmed'||extra.methodPolicy.scope!==old.methodPolicy.scope||extra.methodPolicy.limitations!==old.methodPolicy.limitations||extra.methodPolicy.recognitionTarget!==old.methodPolicy.recognitionTarget)){id=canonical(kind,item.key+'|'+source.id+'|'+hash(JSON.stringify([extra.methodPolicy?.status,extra.methodPolicy?.scope,extra.methodPolicy?.limitations,extra.methodPolicy?.recognitionTarget])));old=this.store.nodes.find(n=>n.id===id);}
      if(this.store.suppressedDerivation({id,kind,title:item.title,body,sources,generationKey:item.key})){entry.suppressed||=[];entry.suppressed.push({id,kind,sourceId:source.id,reason:'用户已删除此来源生成项，不自动重建'});entry.issues.push({segment:part.start,text:'用户删除的生成项已保留抑制记录：'+item.title});return null;}
      const previous=(old?.sources||[]).filter(s=>this.store.sourceQuoteValid(s));
      const merged=[...new Map([...previous,...sources].map(s=>[s.id+'|'+s.quote,s])).values()];
      if(old&&this.store.state.manualEdits?.[id]){
        const node=this.store.upsert({...old,sources:merged,expectedHash:old.hash});
        references.set(item.key,id);references.set(id,id);remember(id);
        entry.issues.push({segment:part.start,text:'保留人工修正正文，仅补充有效来源；自动建议未覆盖人工内容。'});
        return node;
      }
      let combined=kind==='skill'?body:(old?.body||body).replace(/^# [^\n]+/, '# '+item.title);
      if(kind==='skill'&&old&&!old.analysisNeedsReview&&['涉及','实践','验证'].indexOf(old.level)>['涉及','实践','验证'].indexOf(extra.level)){
        extra.level=old.level;
        combined+='\n\n'+(analysisLanguage(body)==='zh'?'既有来源中的程度证据仍保留，当前新增材料不构成新的独立验证。':'Existing level evidence remains in the source chain; this addition is not new independent verification.');
      }
      const node=this.store.upsert({id,kind,title:item.title,body:combined,sources:merged,expectedHash:old?.hash,decision:old?'补充':'新增',generationKey:item.key,...extra});
      references.set(item.key,id);references.set(id,id);remember(id);
      if(node.classification?.method!=='manual')this.store.classify({id,summary:item.body.slice(0,800),tags:[{name:item.category.slice(0,40),reason:item.categoryReason,quote:node.body.slice(0,120)}],
        expectedHash:node.classificationHash,sourceHash:node.hash,method:'codex'});
      if(item.mainTags?.length)this.applyMainTagUpdates([{id,mainTags:item.mainTags,reviewReason:''}],[{id,hash:node.hash}],true);
      return node;
    };
    for(const k of result.knowledge){
      const english=analysisLanguage(k.body)==='en';
      const epistemic=({'用户观点':'User view','助手建议':'Assistant suggestion','已确认决定':'Confirmed decision','有据知识':'Evidenced knowledge','待核对':'Needs review'})[k.epistemic];
      const location=k.locatorFallback?(english?`## Source location for review\n\nCharacters ${part.start}–${part.end}; no rewritten sentence is presented as a verbatim quotation.`:`## 来源定位（供回查）\n\n字符 ${part.start}–${part.end}；未将模型改写当作逐字引文。`):(english?`## Original evidence\n\n${k.quote}`:`## 原文依据\n\n${k.quote}`);
      const body=english?`# ${k.title}\n\n## Extracted knowledge\n\n${k.body}\n\n## Limits\n\nType: ${epistemic}. This record organises the supplied material.\n\n${location}`:
        `# ${k.title}\n\n## 提取的知识\n\n${k.body}\n\n## 判断边界\n\n性质：${k.epistemic}。本条整理给定资料中的内容。\n\n${location}`;
      const confirmedTemplate=result.analysisTemplates?.knowledge;
      upsert('knowledge',k,[{id:source.id,quote:k.quote,sourceHash:source.hash,locator:`字符 ${part.start}–${part.end}`}],confirmedTemplate?k.body:body,{...(confirmedTemplate?{analysisTemplate:{hash:confirmedTemplate.hash,version:confirmedTemplate.version}}:{}),epistemic:k.epistemic});
    }
    for(const s of result.skills){
      const sources=s.knowledgeKeys.map(key=>this.store.nodes.find(n=>n.id===references.get(key))).filter(n=>n?.kind==='knowledge').map(n=>({id:n.id,quote:n.body.slice(0,180),sourceHash:n.hash}));
      if(!sources.length){if(entry.suppressed?.length){entry.issues.push({segment:part.start,text:'技能依据已由用户删除，本候选未重建；删除记录保留。'});continue;}throw new Error('技能缺少已保存的知识点');}
      const body=analysisLanguage(s.body)==='en'?`# ${s.title}\n\n## Capability\n\n${s.body}\n\n## Level and limits\n\n${s.level==='实践'?'The source contains self-reported practice, not independent verification.':'The material mentions this capability; it does not establish proficiency or verification.'}\n\n${s.practiceQuote||''}`:
        `# ${s.title}\n\n## 能做什么\n\n${s.body}\n\n## 程度与边界\n\n${s.level==='实践'?'原文含用户自述实践，不等于独立验证。':'材料只支持涉及该能力，不代表已掌握或已验证。'}\n\n${s.practiceQuote||''}`;
      const methodPolicy=skillMethodPolicy({scope:s.methodScope||'',limitations:s.methodLimitations||'',declaredOrigin:s.methodOrigin||'unknown',recognitionKind:s.methodRecognition?.kind||'unconfirmed',recognitionQuote:s.methodRecognition?.quote||'',recognitionTarget:s.methodRecognition?.target||'',sourceId:source.id,sourceHash:source.hash,readRange:{start:part.start,end:part.end}},source,body);
      const confirmedTemplate=result.analysisTemplates?.skill;
      upsert('skill',s,sources,confirmedTemplate?s.body:body,{level:s.level,domain:s.category,methodPolicy,...(confirmedTemplate?{analysisTemplate:{hash:confirmedTemplate.hash,version:confirmedTemplate.version}}:{})});
    }
    const relation=(e,from,to,sources)=>{
      if(!from||!to||from===to)throw new Error('无效关系端点');
      const id='a-r-'+hash([from,to,e.type].join('|')).slice(0,20),old=this.store.relations.find(r=>r.id===id);
      if(old&&old.managedBy!=='automatic'){remember(id);return;}
      const previous=(old?.sources||[]).filter(s=>this.store.sourceQuoteValid(s));
      const merged=[...new Map([...previous,...sources].map(s=>[s.id+'|'+s.quote,s])).values()];
      this.store.relation({...e,id,from,to,sources:merged,expectedHash:old?hash(JSON.stringify(old)):undefined,managedBy:'automatic'});remember(id);
    };
    for(const e of result.relations){
      const peer=candidates.find(c=>['knowledge','skill'].includes(c.kind)&&[e.from,e.to].includes(c.id)&&e.otherQuote&&c.excerpt.includes(e.otherQuote));
      if(peer&&!e.otherQuote){entry.issues.push({segment:part.start,text:'跨来源知识关系缺少对方引文，保留独立知识，未强行连接。'});continue;}
      relation(e,references.get(e.from),references.get(e.to),[{id:source.id,quote:e.quote,sourceHash:source.hash},...(peer?[{id:peer.id,quote:e.otherQuote,sourceHash:this.store.find(peer.id).hash}]:[])]);
    }
    for(const e of result.vaultRelations)relation(e,source.id,e.to,[{id:source.id,quote:e.quote,sourceHash:source.hash},{id:e.to,quote:e.otherQuote,sourceHash:this.store.find(e.to).hash}]);
    if(result.skills.length)this.rebuildSkillLinks();
  }
  rebuildSkillLinks(){
    const byId=new Map(this.store.nodes.map(n=>[n.id,n])),groups=new Map(),pairs=new Map();
    for(const skill of this.store.nodes.filter(n=>n.kind==='skill'&&!n.mergedInto))for(const source of skill.sources){
      const knowledge=byId.get(source.id);
      if(knowledge?.kind!=='knowledge'||source.sourceHash&&source.sourceHash!==knowledge.hash||!this.store.sourceQuoteValid(source))continue;
      if(!groups.has(knowledge.id))groups.set(knowledge.id,new Map());groups.get(knowledge.id).set(skill.id,source);
    }
    for(const [knowledgeId,members]of groups){
      const ids=[...members.keys()].sort();
      for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
        const key=JSON.stringify([ids[i],ids[j]]);
        if(!pairs.has(key))pairs.set(key,{from:ids[i],to:ids[j],sources:[]});
        const knowledge=byId.get(knowledgeId),source=members.get(ids[i]);
        pairs.get(key).sources.push({id:knowledgeId,quote:source.quote,sourceHash:knowledge.hash});
      }
    }
    let changed=0;
    for(const pair of pairs.values()){
      const type='shared-knowledge',id='a-r-'+hash([pair.from,pair.to,type].join('|')).slice(0,20);
      const old=this.store.relations.find(r=>r.id===id);
      if(old&&old.managedBy!=='automatic')continue;
      if(!this.store.state.types.some(t=>t.id===type))this.store.type({id:type,name:'共用知识依据',color:'#86a8bd',reason:'两项技能实际引用同一知识记录；仅说明共同依据，不表示能力同义、前置或实践验证。',sources:[pair.sources[0]]});
      if(old&&JSON.stringify(old.sources)===JSON.stringify(pair.sources))continue;
      this.store.relation({...pair,id,type,strength:.5,summary:'两项技能引用同一知识依据',reason:'共同引用：'+pair.sources.map(s=>byId.get(s.id).title).join('；')+'。这仅表示共同知识依据，不代表已掌握、技能同义或前置关系。',managedBy:'automatic',expectedHash:old?hash(JSON.stringify(old)):undefined});
      changed++;
    }
    this.state.lastSkillLinkReview={time:new Date(this.clock()).toISOString(),supportedPairs:pairs.size,saved:changed};
    return this.state.lastSkillLinkReview;
  }
  classifySource(source,entry,finished){
    const counts=new Map();
    for(const p of entry.parts)for(const tag of p.tags){const old=counts.get(tag.name);counts.set(tag.name,{...tag,count:(old?.count||0)+1});}
    const tags=[...counts.values()].sort((a,b)=>b.count-a.count).slice(0,16).map(({count,...tag})=>tag);
    const current=this.store.find(source.id);
    if(current.classification?.method==='manual')return;
    const summaries=entry.parts.map((p,i)=>`${i+1}. ${p.summary}`).join('\n');
    const prefix=analysisLanguage(summaries)==='en'?(finished?'Full source summary':'Partial summary of saved sections'):(finished?'全文分段归纳':'正在逐段分析，以下仅覆盖已读部分');
    this.store.classify({id:source.id,summary:prefix+` (${entry.offset}/${source.body.length})\n`+summaries,
      tags,expectedHash:current.classificationHash,sourceHash:source.hash,method:'codex',allowEmpty:true});
  }
}
