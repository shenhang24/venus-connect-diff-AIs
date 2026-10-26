import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,hash} from '../src/store.mjs';
import {ConceptExtractor} from '../src/concepts.mjs';
import {AutoAnalyzer} from '../src/analyzer.mjs';
import {ConceptRepair} from '../src/concept-repair.mjs';

const question='为什么需要整体理解？',answer='组织组件之间的理由与边界形成可使用的认识。',ack='我认同这个答案。';
const segment='### user · 1\n'+question+'\n### assistant · 2\n'+answer+'\n### user · 3\n'+ack+'\n';
function item(key='结构化理解'){return {key,existingId:'',existingHash:'',mergeDecision:'new',links:[],title:key,summary:'把组件之间的理由和边界整理为可使用的认识。',explanation:'结构化理解通过组织组件之间的理由与边界形成可使用的认识。',stance:'讨论假设',quote:answer,formation:'通过问答及用户认可形成整体理解。',admission:{questionQuote:question,answerQuote:answer,userConfirmationQuote:ack,conclusionQuote:answer,confirmationTarget:answer,confirmationMeaning:'answer-endorsement',counterEvidence:[]},discussion:[],referenceMaterials:[],mainTags:[{name:'设计',reason:'说明组织方式',quote:'结构化理解'}]};}
const result=(concepts=[item()])=>({summary:'只修复已指定的概念分段。',concepts,unresolvedQuestions:[],mainTags:[],mainTagUpdates:[],newRelationTypes:[],tags:[],knowledge:[],skills:[],relations:[],vaultRelations:[],issues:[]});
function fixture(t,body=segment+'### user · 4\n后续未处理内容。'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'venus-bounded-repair-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const store=new Store(path.join(root,'data')),source=store.import({name:'synthetic-source',body}).node,concepts=new ConceptExtractor(store),analyzer=new AutoAnalyzer(store,{conceptExtractor:concepts,runner:async()=>{throw Error('模型绝不能被测试调用');}});
 analyzer.discover();analyzer.state.entries[source.id].status='done';store.layerPipeline={active:new Map()};
 const ownerToken='synthetic-owner-token-for-tests',externalLock=path.join(root,'executor.lock');fs.writeFileSync(externalLock,JSON.stringify({pid:process.pid,ownerToken}));
 const input={sourceId:source.id,sourceHash:source.hash,start:0,end:segment.length,ownerToken},key=hash(source.id+'|'+source.hash+'|0');
 concepts.defer(source,{start:0,end:segment.length},'failed.json',Error('原失败引用无效'));concepts.state.failures={[key]:{attempts:3,error:'原失败引用无效',retryAt:0}};fs.writeFileSync(concepts.file,JSON.stringify(concepts.state));
 const repair=new ConceptRepair(store,{analyzer,concepts,externalLock});
 return {root,store,source,concepts,analyzer,repair,input,key,externalLock};
}
function commit(f,r=result()){const prepared=f.repair.prepare(f.input);return f.repair.commit({...f.input,requestHash:prepared.requestHash,result:r,model:'gpt-6-astra'});}

test('exact failed segment saves through live consume and preserves every later gap',t=>{
 const f=fixture(t),before=fs.readFileSync(path.join(f.store.root,f.source.path),'utf8'),saved=commit(f);
 assert.equal(saved.receipt.status,'saved-verified');assert.equal(saved.receipt.model,'gpt-6-astra');assert.equal(saved.receipt.outputs.length,1);
 assert.deepEqual(f.concepts.gaps(f.source),[[segment.length,f.source.body.length]]);
 assert.equal(f.concepts.state.failures[f.key],undefined);assert.equal(f.concepts.state.pending[f.key],undefined);
 assert.equal(fs.readFileSync(path.join(f.store.root,f.source.path),'utf8'),before);
 assert.equal(f.repair.status(f.input).alreadyComplete,true);
});

test('source hash, exact range, explicit pause, concurrent work and executor ownership gate repair',t=>{
 const f=fixture(t);
 assert.throws(()=>f.repair.prepare({...f.input,sourceHash:'wrong'}),/来源已变化/);
 assert.throws(()=>f.repair.prepare({...f.input,end:f.input.end-1}),/原失败记录/);
 assert.throws(()=>f.repair.prepare({...f.input,ownerToken:'wrong-owner-token'}),/锁身份/);
 f.analyzer.state.tasksPaused=true;assert.throws(()=>f.repair.prepare(f.input),/人工暂停/);f.analyzer.state.tasksPaused=false;
 const job=f.store.state.jobs.find(j=>j.sourceId===f.source.id),status=job.status;job.status='paused';assert.throws(()=>f.repair.prepare(f.input),/该来源已人工暂停/);job.status=status;
 const reviewLock=path.join(f.root,'work/concept-content-review/executor.lock');fs.mkdirSync(path.dirname(reviewLock),{recursive:true});fs.writeFileSync(reviewLock,JSON.stringify({pid:process.pid}));assert.throws(()=>f.repair.prepare(f.input),/原概念复核执行器/);fs.unlinkSync(reviewLock);
 f.analyzer.active.set('busy',{});assert.throws(()=>f.repair.prepare(f.input),/已有模型/);f.analyzer.active.clear();
 f.store.layerPipeline.active.set('busy',{});assert.throws(()=>f.repair.prepare(f.input),/已有模型/);f.store.layerPipeline.active.clear();
 fs.writeFileSync(f.externalLock,JSON.stringify({pid:2147483647,ownerToken:f.input.ownerToken}));assert.throws(()=>f.repair.prepare(f.input),/进程已停止/);
});

test('invalid literal quote fails without coverage or clearing the failure',t=>{
 const f=fixture(t),bad=result();bad.concepts[0].quote='这句话不在原文';
 assert.throws(()=>commit(f,bad),/原文定位依据/);
 assert.deepEqual(f.concepts.gaps(f.source),[[0,f.source.body.length]]);
 assert.equal(f.concepts.state.failures[f.key].attempts,3);assert.equal(f.store.nodes.filter(n=>n.kind==='concept').length,0);
 assert.equal(JSON.parse(fs.readFileSync(f.repair.file)).receipts[Object.keys(f.repair.state.receipts)[0]].status,'failed');
});

test('idempotent commit verifies actual saved bytes and rejects changes instead of falsely skipping',t=>{
 const f=fixture(t),r=result(),saved=commit(f,r),input={...f.input,requestHash:saved.receipt.requestHash,result:r,model:'gpt-6-astra'};
 assert.equal(f.repair.commit(input).alreadyComplete,true);
 const output=saved.receipt.outputs[0],file=path.join(f.store.root,output.path);fs.appendFileSync(file,'\n人工修订内容。');
 assert.throws(()=>f.repair.status(f.input),/读回不一致/);assert.throws(()=>f.repair.commit(input),/读回不一致/);
});

test('old coverage alone cannot manufacture a successful repair receipt',t=>{
 const f=fixture(t);f.concepts.consume(f.source,{start:0,end:segment.length,text:segment},[]);
 assert.throws(()=>f.repair.prepare(f.input),/仍待修复|旧覆盖/);
 assert.equal(Object.keys(f.repair.state.receipts).length,0);
});

test('partial saved concept resumes only identical owned bytes without duplicate nodes',t=>{
 const f=fixture(t),r=result([item(),item('组件边界形成整体认识')]),original=f.store.upsert.bind(f.store);let writes=0;
 f.store.upsert=input=>{if(++writes===2)throw Error('synthetic save failure');return original(input);};
 assert.throws(()=>commit(f,r),/synthetic save failure/);assert.equal(f.store.nodes.filter(n=>n.kind==='concept').length,1);
 assert.equal(f.concepts.state.failures[f.key].attempts,3);assert.deepEqual(f.concepts.gaps(f.source),[[0,f.source.body.length]]);
 f.store.upsert=original;const resumed=commit(f,r);
 assert.equal(resumed.receipt.status,'saved-verified');assert.equal(resumed.receipt.outputs.length,2);assert.equal(f.store.nodes.filter(n=>n.kind==='concept').length,2);
});

test('template changes and cross-layer/model payloads cannot be committed',t=>{
 const f=fixture(t),template={concept:{hash:'one',sections:['认识'],version:1}};f.store.analysisTemplates={input:()=>template};
 const p=f.repair.prepare(f.input),r=result();r.analysisTemplates=structuredClone(template);
 assert.throws(()=>f.repair.commit({...f.input,requestHash:p.requestHash,result:r,model:'gpt-6.1-sol'}),/gpt-6-astra/);
 assert.throws(()=>f.repair.commit({...f.input,requestHash:p.requestHash,result:r,model:'gpt-6-astra'}),/模板主题/);
 r.concepts[0].explanation='# 结构化理解\n\n## 认识\n结构化理解通过组织组件之间的理由与边界形成认识。';
 r.knowledge.push({id:'wrong-layer'});assert.throws(()=>f.repair.commit({...f.input,requestHash:p.requestHash,result:r,model:'gpt-6-astra'}),/其他层/);r.knowledge=[];
 template.concept.hash='two';assert.throws(()=>f.repair.commit({...f.input,requestHash:p.requestHash,result:r,model:'gpt-6-astra'}),/模板已变化/);
});

test('readback failure restores the original failure and never issues a successful receipt',t=>{
 const f=fixture(t),original=f.concepts.consume.bind(f.concepts);
 f.concepts.consume=(...args)=>{const saved=original(...args);const disk=JSON.parse(fs.readFileSync(f.concepts.file));disk.entries[f.source.id].fingerprints[0].hash='bad-fingerprint';fs.writeFileSync(f.concepts.file,JSON.stringify(disk));return saved;};
 assert.throws(()=>commit(f),/覆盖指纹保存读回不一致/);
 assert.equal(f.concepts.state.failures[f.key].attempts,3);
 assert.equal(Object.values(f.repair.state.receipts)[0].status,'failed');
 assert.throws(()=>f.repair.status(f.input),/没有有效保存回执/);
});

test('manual changes to a partially saved concept block automatic recovery',t=>{
 const f=fixture(t),r=result([item(),item('组件边界形成整体认识')]),original=f.store.upsert.bind(f.store);let writes=0;
 f.store.upsert=input=>{if(++writes===2)throw Error('partial');return original(input);};assert.throws(()=>commit(f,r),/partial/);f.store.upsert=original;
 const saved=f.store.nodes.find(n=>n.kind==='concept');f.store.edit({id:saved.id,body:saved.body+'\n人工添加的约束。',expectedHash:saved.hash});
 assert.throws(()=>f.repair.prepare(f.input),/部分保存的概念已被修改/);
});

test('a real pending error without historical failure is repairable and retained on error',t=>{
 const f=fixture(t);delete f.concepts.state.failures[f.key];fs.writeFileSync(f.concepts.file,JSON.stringify(f.concepts.state));
 const bad=result();bad.concepts[0].quote='不存在的原文';assert.throws(()=>commit(f,bad),/原文定位依据/);
 assert.equal(f.concepts.state.failures[f.key],undefined);assert.ok(f.concepts.state.pending[f.key].repairError);
 const saved=commit(f);assert.equal(saved.receipt.status,'saved-verified');assert.equal(saved.receipt.original.failure,null);assert.equal(f.concepts.state.pending[f.key],undefined);
});

test('later verified repair may merge an earlier output without invalidating its receipt',t=>{
 const f=fixture(t,segment+segment),first=commit(f),old=f.store.find(first.receipt.outputs[0].id);
 const secondInput={...f.input,start:segment.length,end:segment.length*2},secondKey=hash(f.source.id+'|'+f.source.hash+'|'+segment.length);
 f.concepts.defer(f.source,{start:secondInput.start,end:secondInput.end},'second-failure.json',Error('second pending failure'));
 const second=f.repair.prepare(secondInput),merged=item();merged.existingId=old.id;merged.existingHash=old.hash;merged.mergeDecision='complement';merged.explanation+=' 后续讨论补充组件之间的依赖条件。';
 const saved=f.repair.commit({...secondInput,requestHash:second.requestHash,result:result([merged]),model:'gpt-6-astra'});
 assert.equal(saved.receipt.outputs[0].id,old.id);assert.equal(saved.receipt.outputs[0].change,'updated');assert.notEqual(saved.receipt.outputs[0].hash,old.hash);
 assert.equal(f.concepts.state.pending[secondKey],undefined);assert.equal(f.repair.status(f.input).alreadyComplete,true);assert.equal(f.repair.status(secondInput).alreadyComplete,true);
 const updated=f.store.find(old.id);f.store.edit({id:old.id,body:updated.body+'\n新的人工约束。',expectedHash:updated.hash});
 assert.throws(()=>f.repair.status(f.input),/保存读回不一致/);
});
