import fs from 'node:fs';
import path from 'node:path';
import {hash} from './store.mjs';
export function assignProjects(store,{nodes,projects}){
 const fail=(s,status=400)=>{throw Object.assign(Error(s),{status});};
 if(!Array.isArray(nodes)||!nodes.length||nodes.length>500||!Array.isArray(projects)||projects.length>20)fail('请选择资料及最多 20 个明确项目');
 const memberships=projects.map(p=>{if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100)fail('项目名称无效');return {id:p.id||'named:'+p.name.normalize('NFKC').trim().toLocaleLowerCase(),name:p.name.trim(),basis:'user-assigned-project',assignedAt:new Date().toISOString()};});
 const selected=nodes.map(input=>{const n=store.find(input.id);if(n.hash!==input.hash||n.classificationHash!==input.classificationHash)fail('正文或归属信息已变化，请重新读取',409);return n;});
 const file=path.join(store.meta,'classifications.md'),raw=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'# 归纳分类\n',match=raw.match(/^<!-- venus:(.*?) -->\r?\n/s),meta=match?JSON.parse(match[1]):{entries:{}};meta.entries||={};
 for(const n of selected)meta.entries[n.id]={summary:'用户明确指定项目归属',tags:[],...meta.entries[n.id],projectMemberships:memberships,projectMembershipAnalysis:{method:'manual',sourceHash:n.hash,updatedAt:new Date().toISOString()},sourceHash:n.hash};
 const next='<!-- venus:'+JSON.stringify(meta)+' -->\n'+(match?raw.slice(match[0].length):raw),temp=file+'.project-'+hash(next).slice(0,12)+'.tmp';fs.writeFileSync(temp,next);fs.renameSync(temp,file);store.scan();store.state.revision++;store.save();return {saved:selected.map(n=>n.id),projects:memberships,bodiesChanged:false};
}
