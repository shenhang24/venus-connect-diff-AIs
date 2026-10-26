import fs from 'node:fs';
import path from 'node:path';
import {hash} from './store.mjs';
import {templateRuntimeGuide} from './template-runtime-guide.mjs';

const defaults={knowledge:'# 主题\n\n## 提取的知识\n\n## 判断边界\n\n## 原文依据',skill:'# 主题\n\n## 可复用 Prompt\n\n## 共用设定与稳定身份\n\n## 变体差异与本次增量\n\n## 适用条件与负例\n\n## 依据与未确认边界',concept:'# 主题\n\n## 综述\n\n## 概念\n\n## 认识性质'};
const help={knowledge:'提取的知识：资料支持的事实或方法。判断边界：条件、来源立场和不确定性。原文依据：可定位的依据。',skill:'可复用 Prompt：完整任务、输入、步骤与输出合同。共用设定与稳定身份：保留实体引用和来源。变体差异与本次增量：不混合其他版本。适用条件与负例：何时使用、何时停止。依据与未确认边界：缺失、不确定与认可状态，不据此声称用户掌握。',concept:'综述：原问题和目的。概念：形成的核心认识及理由。认识性质：用户观点、助手建议、假设或已确认结论。'};
const fail=(s,status=400)=>{throw Object.assign(Error(s),{status});};
export function templateSections(markdown){
 if(typeof markdown!=='string'||markdown.length>20000)fail('模板需为不超过 20000 字符的 Markdown');
 const lines=markdown.split(/\r?\n/),titles=lines.filter(l=>/^# /.test(l)),sections=lines.filter(l=>/^## /.test(l)).map(l=>l.slice(3).trim());
 if(titles.length!==1||!titles[0].slice(2).trim()||!sections.length||sections.length>30||sections.some(s=>!s||s.length>100)||new Set(sections).size!==sections.length||lines.some(l=>/^#{3,}\s/.test(l)))fail('模板须有一个 # 主题和 1–30 个不重复的 ## 分析项');
 if(sections.some(s=>/^(Reference|References|来源追溯)$/i.test(s)))fail('来源追溯由系统独立保留，请勿用作可编辑分析项');
 return sections;
}
export class AnalysisTemplates{
 constructor(meta){this.file=path.join(meta,'analysis-templates.json');this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,entries:{}};}
 get(kind){if(!Object.hasOwn(defaults,kind))fail('分析层无效');return this.state.entries[kind]||{kind,markdown:defaults[kind],help:help[kind]+'\n\n'+templateRuntimeGuide.markdown,confirmed:false,revision:0,hash:hash(defaults[kind])};}
 list(){return {runtimeGuide:templateRuntimeGuide,items:Object.keys(defaults).map(k=>this.get(k)),note:'帮助说明不进入模型输入；确认模板只影响后续分析，旧内容重分析须另选范围。'};}
 save({kind,markdown,help:explanation='',expectedHash,confirm=false}){
  templateSections(markdown);const old=this.get(kind);if(old.hash!==expectedHash)fail('模板已变化，请重新读取',409);if(typeof explanation!=='string'||explanation.length>20000)fail('帮助说明过长');
  const entry={kind,markdown,help:explanation,revision:old.revision+1,hash:hash(JSON.stringify([markdown,explanation,old.revision+1])),confirmed:confirm===true,updatedAt:new Date().toISOString(),active:confirm?{markdown,sections:templateSections(markdown),version:old.revision+1,hash:hash(markdown)}:old.active||null};
  this.state.entries[kind]=entry;fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.state,null,2));fs.renameSync(this.file+'.tmp',this.file);return {...entry,reanalysisStarted:false};
 }
 input(){return Object.fromEntries(Object.keys(defaults).flatMap(k=>{const e=this.get(k);return e.active?[[k,{...e.active,instruction:'按此 Markdown 的 # 主题、## 分析项生成正文；段落文字是用户设定的分析要求，不是资料证据。不从模板推断结论。不得填造缺失依据。知识和技能写入 body；概念写入 explanation。Reference 由程序另外保留。'}]]:[]}));}
 wrap(run){const wrapped=async(payload,options)=>{const input=this.input(),active=Object.keys(input).length?input:null;const result=await run(active?{...payload,analysisTemplates:active}:payload,options);if(active){result.analysisTemplates=active;for(const [kind,field]of [['knowledge','knowledge'],['skill','skills'],['concept','concepts']])if(active[kind])for(const item of result[field]||[]){const body=item[kind==='concept'?'explanation':'body'];if(typeof body!=='string'||!/^# .+/m.test(body))fail('模型未生成模板主题标题',422);for(const section of active[kind].sections)if(!body.split(/\r?\n/).includes('## '+section))fail('模型未按确认模板生成分析项：'+section,422);}}return result;};wrapped.providerDescription=run.providerDescription;return wrapped;}
}
