import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash} from './store.mjs';
import {projectGroups,projectScopesFor} from '../public/taxonomy.js';
const fail=(m,status=400)=>{throw Object.assign(Error(m),{status});};
export const DELETE_WARNING='将彻底删除，无法恢复。';
export class DataMaintenance{
 constructor(store,{busy=()=>false,projectNodes=nodes=>nodes}={}){this.store=store;this.busy=busy;this.projectNodes=projectNodes;this.plans=new Map();}
 safe(file){const root=fs.realpathSync(this.store.root),absolute=path.resolve(file);if(!absolute.startsWith(root+path.sep))fail('删除范围超出资料库');let at=absolute;while(at!==root){if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())fail('不能删除符号链接或重解析路径');at=path.dirname(at);}return absolute;}
 inventory(){const nodes=this.projectNodes(this.store.nodes),scopes=projectScopesFor(nodes,projectGroups(nodes,this.store.state.jobs));return {root:this.store.root,warning:DELETE_WARNING,objects:nodes.filter(n=>!n.mergedInto).map(n=>({key:'node:'+n.id,id:n.id,kind:n.kind,title:n.title,projects:(scopes.get(n.id)||[]).map(p=>({id:p.id,name:p.name})),path:path.join(this.store.root,n.path),bytes:this.store.contentCache?.get(path.join(this.store.root,n.path))?.size??null})),other:[{key:'tasks',kind:'task-records',title:'资料队列记录（执行日志另行保留）',path:this.store.file,count:this.store.state.jobs.length},{key:'layout-cache',kind:'cache',title:'星图位置缓存',path:this.store.file,count:Object.keys(this.store.state.positions||{}).length}],note:'原始资料、提炼结果、任务记录和布局缓存分别选择。备份工作目录和外部来源不在此删除范围，历史副本需单独勾选。'};}
 previewNode({id,linked='none',derived=false}){
  if(!['none','relations','md'].includes(linked)||typeof derived!=='boolean')fail('删除选择无效');
  const start=this.store.find(id),ids=new Set([id]),connected=new Set();
  for(const r of this.store.relations)if(r.from===id||r.to===id)connected.add(r.from===id?r.to:r.from);
  for(const n of this.store.nodes)if(n.kind==='vault'&&((n.sources||[]).some(s=>s.id===id)||(start.sources||[]).some(s=>s.id===n.id)))connected.add(n.id);
  if(linked==='md')for(const target of connected){const n=this.store.nodeById.get(target);if(n?.kind==='vault')ids.add(target);}
  const retainedShared=[];
  if(derived){let changed=true;while(changed){changed=false;for(const n of this.store.nodes){if(ids.has(n.id)||!['knowledge','skill'].includes(n.kind)||!(n.sources||[]).some(s=>ids.has(s.id)))continue;const shared=(n.sources||[]).some(s=>!ids.has(s.id)&&this.store.nodeById.has(s.id));if(shared){if(!retainedShared.includes(n.id))retainedShared.push(n.id);continue;}ids.add(n.id);changed=true;}}}
  const plan=this.preview({keys:[...ids].map(id=>'node:'+id)});plan.selection={id,linked,derived};plan.retainedShared=retainedShared;return plan;
 }
 preview({keys,includeHistory=false}){
  if(!Array.isArray(keys)||!keys.length||keys.length>500||new Set(keys).size!==keys.length)fail('请选择 1–500 个不同的删除对象');
  const inventory=this.inventory(),allowed=new Map([...inventory.objects,...inventory.other].map(x=>[x.key,x]));for(const key of keys)if(!allowed.has(key))fail('删除对象不存在，请刷新',409);
  const objects=keys.map(k=>allowed.get(k)),ids=objects.filter(o=>o.id).map(o=>o.id);if(this.busy(ids,keys))fail('所选范围仍有活动任务，请保存并暂停对应任务后再预览',409);
  const files=[];for(const o of objects.filter(x=>x.id)){files.push(o.path);if(includeHistory){const n=this.store.find(o.id),dir=path.join(this.store.meta,'history',hash(n.path).slice(0,16));if(fs.existsSync(dir))for(const name of fs.readdirSync(dir))if(fs.statSync(this.safe(path.join(dir,name))).isFile())files.push(path.join(dir,name));}}
  const relations=this.store.relations.filter(r=>ids.includes(r.from)||ids.includes(r.to)),dependents=this.store.nodes.filter(n=>!ids.includes(n.id)&&n.sources?.some(s=>ids.includes(s.id))).map(n=>({id:n.id,title:n.title,path:path.join(this.store.root,n.path),impact:'保留正文，但来源将缺失，不再作为可用原文证据。'}));
  const fingerprints=[...new Set(files)].map(file=>({path:this.safe(file),bytes:fs.statSync(file).size,hash:hash(fs.readFileSync(file))}));
  const plan={token:randomUUID(),expiresAt:Date.now()+10*60*1000,warning:DELETE_WARNING,keys,objects,files:fingerprints,relations:relations.map(r=>r.id),dependents,includeHistory,count:objects.length,physicalFileCount:fingerprints.length,metadataPaths:[this.store.file,...(ids.length?[path.join(this.store.meta,'classifications.md')]:[]),...(relations.length?[path.join(this.store.root,'知识点/_关系.md')]:[])],revision:this.store.state.revision,note:includeHistory?'所选节点的应用历史副本也将删除。':'应用历史副本仍保留，可另行选择；外部原文件、每日备份不在此范围。'};this.plans.set(plan.token,plan);return plan;
 }
 execute({token,confirmation}){
  const p=this.plans.get(token);if(!p||p.expiresAt<Date.now())fail('删除预览已过期，请重新预览',409);if(confirmation!==DELETE_WARNING)fail('请确认完整的永久删除警示');if(p.revision!==this.store.state.revision)fail('资料库已变化，请重新预览',409);
  const ids=p.objects.filter(o=>o.id).map(o=>o.id);if(this.busy(ids,p.keys))fail('所选范围仍有活动任务，未删除',409);
  for(const f of p.files)if(!fs.existsSync(this.safe(f.path))||hash(fs.readFileSync(f.path))!==f.hash)fail('所选文件已变化，未删除',409);
  this.plans.delete(token);const receipt={id:randomUUID(),time:new Date().toISOString(),objects:p.objects,deleted:[],warning:DELETE_WARNING,status:'started'},receiptPath=path.join(this.store.meta,'deletion-'+receipt.id+'.json'),save=()=>fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2));save();
  try{
   const intentState=this.store.state;intentState.suppressedDerivations||={};intentState.deletedSources||={};for(const id of ids){const n=this.store.nodeById.get(id);if(!n)continue;intentState.deletedSources[id]={path:n.path,bodyHash:hash(n.body),originIds:(intentState.importProvenance?.[id]||[]).map(p=>p.originId).filter(Boolean),deletedAt:receipt.time,deletionReceipt:receipt.id};if(n.kind!=='vault')intentState.suppressedDerivations[id]={id,kind:n.kind,title:n.title,generationKey:n.generationKey||null,rootSourceIds:this.store.rootSourceIds(n.sources),bodyHash:hash(n.body),sourceIds:(n.sources||[]).map(s=>s.id),deletedAt:receipt.time,deletionReceipt:receipt.id};}this.store.save();receipt.status='intent-saved';save();
   for(const f of p.files){fs.unlinkSync(f.path);receipt.deleted.push({path:f.path,hash:f.hash});save();}
   const state=this.store.state;state.deletedSources||={};for(const id of ids){const n=p.objects.find(o=>o.id===id);state.deletedSources[id]={...state.deletedSources[id],path:n.path,deletedAt:receipt.time};const original=this.store.nodeById.get(id);if(original&&original.kind!=='vault'){state.suppressedDerivations||={};state.suppressedDerivations[id]={id,kind:original.kind,title:original.title,generationKey:original.generationKey||null,rootSourceIds:this.store.rootSourceIds(original.sources),bodyHash:hash(original.body),sourceIds:(original.sources||[]).map(s=>s.id),deletedAt:receipt.time};}delete this.store.classifications[id];delete state.positions[id];delete state.manualEdits?.[id];}
   state.jobs=state.jobs.filter(j=>!ids.includes(j.sourceId));if(p.keys.includes('tasks'))state.jobs=[];if(p.keys.includes('layout-cache'))state.positions={};
   this.store.relations=this.store.relations.filter(r=>!p.relations.includes(r.id));if(p.relations.length)this.store.writeRelations();
   const classificationFile=path.join(this.store.meta,'classifications.md');if(ids.length&&fs.existsSync(classificationFile)){const raw=fs.readFileSync(classificationFile,'utf8');const header=raw.match(/^<!-- venus:(.*?) -->\r?\n/s);if(header){const meta=JSON.parse(header[1]);for(const id of ids)delete meta.entries?.[id];const blocks=raw.slice(header[0].length).split(/(?=^## )/m).filter(b=>!ids.some(id=>b.startsWith('## '+id+'\n')||b.startsWith('## '+id+'\r\n')));fs.writeFileSync(classificationFile,'<!-- venus:'+JSON.stringify(meta)+' -->\n'+blocks.join(''));}}
   state.revision++;this.store.save();this.store.scan();receipt.status='deleted';save();return {...receipt,verified:p.files.every(f=>!fs.existsSync(f.path)),externalBackupsDeleted:false};
  }catch(e){receipt.status='partial-failure';receipt.error=e.message;save();fail('部分永久删除已执行，请核对记录：'+receiptPath+'；'+e.message,500);}
 }
}
