import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash} from './store.mjs';
import {nextChunk} from './analyzer.mjs';

const MODEL='gpt-6-astra';
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=value=>hash(canonical(value));
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);};
const keyOf=({sourceId,sourceHash,start,end})=>hash([sourceId,sourceHash,start,end].join('|'));
const failureKey=({sourceId,sourceHash,start})=>hash([sourceId,sourceHash,start].join('|'));
const covered=(entry,start,end)=>entry?.covered?.some(([a,b])=>a<=start&&b>=end);

// This is a bounded submission transaction, not a scheduler or a model runner.
// A receipt certifies this submitted segment and its bytes, never semantic
// completeness of the rest of the source or library.
export class ConceptRepair {
 constructor(store,{analyzer,concepts,externalLock=path.resolve(store.root,'../work/precise-classification-20261022/executor.lock')}={}){
  Object.assign(this,{store,analyzer,concepts,externalLock});
  this.file=path.join(store.meta,'concept-repair-receipts.json');
  this.state=fs.existsSync(this.file)?read(this.file):{version:1,receipts:{}};
 }
 save(){write(this.file,this.state);}
 source(input){
  if(!input||typeof input.sourceId!=='string'||typeof input.sourceHash!=='string')fail('须指定来源及当前指纹',400);
  const source=this.store.find(input.sourceId);
  if(source.kind!=='vault'||source.mergedInto)fail('修复须直接使用当前 Vault 原文');
  if(source.hash!==input.sourceHash||hash(this.bytes(source))!==input.sourceHash)fail('来源已变化，保留原失败断点');
  if(!Number.isInteger(input.start)||!Number.isInteger(input.end)||input.start<0||input.end<=input.start||input.end>source.body.length||input.end-input.start>40000)fail('修复范围须为原文内不超过40000字符的完整失败分段',400);
  return source;
 }
 bytes(node){
  const root=path.resolve(this.store.root),file=path.resolve(root,node.path);
  if(!file.startsWith(root+path.sep))fail('资料路径超出本地资料库');
  return fs.readFileSync(file,'utf8');
 }
 gate(input){
  if(!this.analyzer||!this.concepts)fail('概念修复处理器不可用',503);
  if(this.analyzer.state.tasksPaused)fail('任务已人工暂停');
  if(this.store.state.jobs.some(job=>job.sourceId===input.sourceId&&job.status==='paused'))fail('该来源已人工暂停');
  if(this.analyzer.active.size||this.store.layerPipeline?.active.size)fail('已有模型任务活动，等待其保存后修复');
  const reviewLock=path.resolve(this.store.root,'../work/concept-content-review/executor.lock');
  let review;try{review=read(reviewLock);}catch{}
  if(Number.isInteger(review?.pid)&&review.pid>0){let live=false;try{process.kill(review.pid,0);live=true;}catch{}if(live)fail('原概念复核执行器仍活动，不能并行修复');}
  let lock;try{lock=read(this.externalLock);}catch{fail('缺少归纳执行器锁');}
  if(typeof input.ownerToken!=='string'||input.ownerToken.length<16||lock.ownerToken!==input.ownerToken||!Number.isInteger(lock.pid)||lock.pid<=0)fail('归纳执行器锁身份不匹配');
  try{process.kill(lock.pid,0);}catch{fail('归纳执行器锁进程已停止');}
 }
 templates(){return this.store.analysisTemplates?.input()||{};}
 checkTemplates(receipt){if(digest(this.templates())!==receipt.templateHash)fail('确认模板已变化，本段未提交');}
 pending(input,source){
  const key=failureKey(input),failure=this.concepts.state.failures?.[key],pending=this.concepts.state.pending?.[key];
  if(!(failure?.attempts>=3)&&!(pending&&typeof pending.error==='string'&&pending.error.trim()))fail('范围不是仍待修复的失败分段');
  const gap=this.concepts.gaps(source).find(([a,b])=>a<=input.start&&input.end<=b);
  if(!gap)fail('失败范围已失效；旧覆盖不能替代修复回执');
  if(pending){
   if(pending.sourceId!==input.sourceId||pending.sourceHash!==input.sourceHash||pending.start!==input.start||pending.end!==input.end)fail('修复范围与原失败记录不一致');
  }else{
   // Historical failures store their exact start in the failure key. Their
   // original chunk boundary is the existing 40000-character scheduler rule.
   const end=Math.min(gap[1],nextChunk(source.body,input.start,40000).end);
   if(input.end!==end)fail('修复必须保留原失败分段结束位置');
  }
  return {key,failure:failure?structuredClone(failure):null,pending:pending?structuredClone(pending):null};
 }
 prepare(input){
  this.gate(input);const source=this.source(input),key=keyOf(input),old=this.state.receipts[key];
  if(old?.status==='saved-verified')return {alreadyComplete:true,requestHash:old.requestHash,fingerprint:old.fingerprint,receipt:this.verify(old),payload:old.payload};
  if(old){
   this.checkTemplates(old);this.verifyPartial(old);
   if(covered(this.concepts.state.entries[source.id],input.start,input.end))fail('本段已有覆盖但没有有效保存回执，须核对未完成事务');
   this.pending(input,source);return {alreadyComplete:false,requestHash:old.requestHash,fingerprint:old.fingerprint,payload:old.payload};
  }
  const original=this.pending(input,source),analysisTemplates=this.templates();
  const payload={purpose:'concept-only',conceptsEnabled:true,historicalRecognition:this.analyzer.state.entries[source.id]?.status==='done',source:{id:source.id,title:source.title,hash:source.hash,offset:input.start,total:source.body.length,text:source.body.slice(input.start,input.end)},existingConcepts:this.concepts.context(source,source.body.slice(input.start,input.end)),knownConceptDiscussion:this.concepts.knownDiscussion(source),existingCandidates:[],mainTagCandidates:[],mainTagRegistry:[],relationshipTypes:this.store.state.types,validationFeedback:original.failure?.error||original.pending?.error||'',...(Object.keys(analysisTemplates).length?{analysisTemplates}:{} )};
  const conceptNodes=this.store.nodes.filter(n=>n.kind==='concept');
  const receipt={key,sourceId:source.id,sourceHash:source.hash,start:input.start,end:input.end,model:MODEL,reasoningEffort:'low',status:'prepared',createdAt:new Date().toISOString(),templateHash:digest(analysisTemplates),fingerprint:hash(payload.source.text),requestHash:digest({model:MODEL,reasoningEffort:'low',payload}),payload,original,beforeConcepts:Object.fromEntries(conceptNodes.map(n=>[n.id,n.hash])),beforeConceptTags:Object.fromEntries(conceptNodes.map(n=>[n.id,digest(n.mainTags||[])])),beforeIgnored:structuredClone(this.concepts.state.ignoredQuestions||{}),outputs:[],ignored:[],scope:'exact-failed-segment; coverage-is-not-whole-source-semantic-completeness'};
  this.state.receipts[key]=receipt;this.save();return {alreadyComplete:false,requestHash:receipt.requestHash,fingerprint:receipt.fingerprint,payload};
 }
 status(input){return this.prepare(input);}
 verifyPartial(receipt){
  for(const saved of receipt.partialOutputs||[]){const node=this.store.find(saved.id);if(hash(this.bytes(node))!==saved.hash||node.hash!==saved.hash||this.store.state.manualEdits?.[node.id])fail('部分保存的概念已被修改，不能自动覆盖：'+saved.id);}
 }
 capture(receipt){
  const all=this.store.nodes.filter(n=>n.kind==='concept'&&receipt.beforeConcepts[n.id]!==n.hash);
  // Only a concept carrying this repair's exact source range belongs to it.
  return all.filter(n=>n.conceptReferences?.some(r=>r.sourceId===receipt.sourceId&&r.sourceHash===receipt.sourceHash&&r.readRange?.start===receipt.start&&r.readRange?.end===receipt.end)).map(n=>({id:n.id,path:n.path,hash:n.hash,mainTagsHash:digest(n.mainTags||[]),change:receipt.beforeConcepts[n.id]?'updated':'created'}));
 }
 auditIgnored(receipt){return Object.entries(this.concepts.state.ignoredQuestions||{}).filter(([key,value])=>digest(receipt.beforeIgnored[key]||null)!==digest(value)).filter(([,q])=>q.sourceId===receipt.sourceId&&q.sourceHash===receipt.sourceHash).map(([key,value])=>({key,value:structuredClone(value)}));}
 restoreFailure(receipt,error){
  const key=receipt.original.key;
  if(receipt.original.failure){this.concepts.state.failures||={};this.concepts.state.failures[key]={...receipt.original.failure,repairError:String(error.message),repairFailedAt:new Date().toISOString()};}
  if(receipt.original.pending){this.concepts.state.pending||={};this.concepts.state.pending[key]={...receipt.original.pending,repairError:String(error.message),repairFailedAt:new Date().toISOString()};}
  write(this.concepts.file,this.concepts.state);
 }
 commit(input){
  this.gate(input);const source=this.source(input),receipt=this.state.receipts[keyOf(input)];
  if(!receipt||receipt.requestHash!==input.requestHash)fail('修复请求指纹不匹配，须先准备准确分段');
  if(input.model!==MODEL)fail('修复必须使用 gpt-6-astra');
  const resultHash=digest(input.result);
  if(receipt.status==='saved-verified'){
   if(receipt.resultHash!==resultHash)fail('已保存回执对应不同结果');
   return {alreadyComplete:true,receipt:this.verify(receipt)};
  }
  this.checkTemplates(receipt);this.verifyPartial(receipt);this.pending(input,source);
  if(receipt.partialOutputs?.length&&receipt.resultHash!==resultHash)fail('部分保存事务只能继续同一结果');
  const result=structuredClone(input.result),part={start:input.start,end:input.end,text:source.body.slice(input.start,input.end)};
  for(const field of ['knowledge','skills','relations','vaultRelations','mainTagUpdates','mainTags','tags','newRelationTypes'])if(!Array.isArray(result?.[field])||result[field].length)fail('受限概念修复不得写入其他层：'+field,400);
  if(!Array.isArray(result.concepts)||!Array.isArray(result.unresolvedQuestions))fail('概念修复结果缺少概念或未解决问题字段',400);
  if(digest(result.analysisTemplates||{})!==receipt.templateHash)fail('结果模板与已确认输入不一致');
  const template=receipt.payload.analysisTemplates?.concept;
  if(template)for(const item of result.concepts){if(typeof item.explanation!=='string'||!/^# .+/m.test(item.explanation))fail('模型未生成模板主题标题',422);for(const section of template.sections)if(!item.explanation.split(/\r?\n/).includes('## '+section))fail('模型未按确认模板生成分析项：'+section,422);}
  for(const item of result.concepts){const own=receipt.partialOutputs?.find(n=>n.id===item.existingId);if(own)item.existingHash=own.hash;}
  receipt.status='applying';receipt.resultHash=resultHash;receipt.summary=result.summary;receipt.issues=structuredClone(result.issues||[]);receipt.candidateCount=result.concepts.length;receipt.attemptedAt=new Date().toISOString();this.save();
  try{
   this.analyzer.prepareLocators(result,part,[],[]);this.analyzer.validate(result,part.text,[]);
   this.concepts.consume(source,part,result.concepts,result.unresolvedQuestions,{historical:receipt.payload.historicalRecognition,template});
   receipt.outputs=this.capture(receipt);receipt.ignored=this.auditIgnored(receipt);
   receipt.coverageFingerprint={start:input.start,end:input.end,hash:hash(part.text)};
   this.verify(receipt);receipt.status='saved-verified';receipt.savedAt=new Date().toISOString();delete receipt.error;delete receipt.partialOutputs;this.save();
   return {alreadyComplete:false,receipt:structuredClone(receipt)};
  }catch(error){receipt.status='failed';receipt.error=String(error.message);receipt.partialOutputs=this.capture(receipt);receipt.ignored=this.auditIgnored(receipt);this.restoreFailure(receipt,error);this.save();throw error;}
 }
 verify(receipt){
  const source=this.source(receipt);this.checkTemplates(receipt);
  const disk=read(this.concepts.file),entry=disk.entries?.[source.id];
  if(entry?.sourceHash!==source.hash||!covered(entry,receipt.start,receipt.end)||hash(source.body.slice(receipt.start,receipt.end))!==receipt.fingerprint)fail('概念覆盖保存读回不一致');
  const interval=entry.fingerprints?.find(p=>p.start<=receipt.start&&p.end>=receipt.end);
  if(!interval||hash(source.body.slice(interval.start,interval.end))!==interval.hash)fail('概念覆盖指纹保存读回不一致');
  if(disk.failures?.[receipt.original.key]||disk.pending?.[receipt.original.key])fail('失败分段尚未确认保存');
  for(const output of receipt.outputs||[]){
   const node=this.store.find(output.id),raw=this.bytes(node),expected=this.latestAuthorizedOutput(receipt,output);
   if(node.kind!=='concept'||hash(raw)!==expected.hash||node.hash!==expected.hash||digest(node.mainTags||[])!==expected.mainTagsHash||!entry.outputs.includes(node.id))fail('概念正文或分类保存读回不一致：'+output.id);
   for(const ref of node.sources||[]){const origin=this.store.find(ref.id),body=this.bytes(origin);if(origin.kind!=='vault'||ref.sourceHash!==hash(body)||typeof ref.quote!=='string'||!body.includes(ref.quote)||ref.locator&&body.slice(ref.locator.start,ref.locator.end)!==ref.quote)fail('概念来源逐字引用保存读回不一致：'+output.id);}
   const references=node.conceptReferences?.filter(r=>r.sourceId===source.id&&r.sourceHash===source.hash&&r.readRange?.start===receipt.start&&r.readRange?.end===receipt.end);
   if(!references?.length)fail('概念缺少本次修复的精确来源范围');
   for(const ref of references)for(const d of ref.discussion||[]){if(!Number.isInteger(d.start)||!Number.isInteger(d.end)||d.start<0||d.end<d.start||d.end>source.body.length||source.body.slice(d.start,d.end)!==d.quote)fail('概念讨论逐字引用保存读回不一致：'+output.id);}
  }
  for(const ignored of receipt.ignored||[]){if(digest(disk.ignoredQuestions?.[ignored.key]||null)!==digest(ignored.value))fail('未准入问题审计保存读回不一致');for(const e of ignored.value.evidence||[])if(source.body.slice(e.start,e.end)!==e.quote)fail('未准入问题证据保存读回不一致');}
  return structuredClone(receipt);
 }
 latestAuthorizedOutput(receipt,output){
  let expected=output;const visited=new Set([receipt.key]);
  for(;;){
   const successors=Object.values(this.state.receipts).filter(r=>!visited.has(r.key)&&r.status==='saved-verified'&&r.model===MODEL&&r.beforeConcepts?.[output.id]===expected.hash&&r.beforeConceptTags?.[output.id]===expected.mainTagsHash&&r.outputs?.some(n=>n.id===output.id)).sort((a,b)=>a.savedAt.localeCompare(b.savedAt));
   if(!successors.length)return expected;
   const next=successors[0];visited.add(next.key);expected=next.outputs.find(n=>n.id===output.id);
  }
 }
}
