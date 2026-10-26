import fs from 'node:fs';import path from 'node:path';
import {skillMethodUse} from './skill-methods.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const count=(value,fallback,max)=>{const n=value===undefined||value===null?fallback:Number(value);if(!Number.isInteger(n)||n<0||n>max)fail('查询范围无效');return n;};
export function queryId(id){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(id))fail('仅接受 Venus 节点 ID，不接受文件路径');return id;}
const normal=s=>String(s||'').normalize('NFKC').toLocaleLowerCase();
const names=list=>(Array.isArray(list)?list:typeof list==='string'?[list]:[]).map(x=>typeof x==='string'?x:x.name||x.title||'').filter(Boolean);
const brief=n=>({id:n.id,title:n.title,kind:n.kind,path:n.path,hash:n.hash,version:n.hash||null,updatedAt:n.modifiedAt||n.updatedAt||null,categories:n.categories||[],mainTags:n.mainTags||[],importProvenance:n.importProvenance||[],...(n.kind==='skill'?{methodUse:skillMethodUse(n)}:{})});
export function createReadQuery(store){
 const index=new Map(),auxFile=store.meta?path.join(store.meta,'search-auxiliary.json'):null;
 let aux={version:0,entries:{}},auxSignature=null;
 let nodeLookup=new Map(store.nodes.map(n=>[n.id,n]));
 const loadAux=()=>{if(auxFile&&fs.existsSync(auxFile)){const stat=fs.statSync(auxFile),signature=stat.mtimeMs+':'+stat.size;if(signature!==auxSignature){aux=JSON.parse(fs.readFileSync(auxFile,'utf8'));auxSignature=signature;}}return aux;};
 const inside=n=>{if(!store.root)return true;try{const root=fs.realpathSync(store.root),file=fs.realpathSync(path.join(root,n.path)),relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}catch{return false;}};
 const node=id=>{queryId(id);const n=nodeLookup.get(id);if(!n)fail('Venus 节点不存在',404);if(!inside(n))fail('Venus 节点不在允许范围内',403);return n;};
 const auxiliary=n=>{const entry=aux.entries[n.id];return entry?{...entry,needsReview:entry.sourceHash!==n.hash}:{version:0,tags:[],aliases:[],projects:[],needsReview:false};};
 const sources=n=>(n.sources||[]).map(s=>{const target=store.nodes.find(n=>n.id===s.id&&inside(n));return {id:s.id,locator:s.locator||null,sourceHash:s.sourceHash||null,quote:(s.quote||'').slice(0,1600),quoteTruncated:(s.quote||'').length>1600,node:target?brief(target):null};});
 const hasSource=(n,id,seen=new Set())=>{if(n.id===id)return true;if(seen.has(n.id))return false;seen.add(n.id);return (n.sources||[]).some(s=>s.id===id||(nodeLookup.has(s.id)&&hasSource(nodeLookup.get(s.id),id,seen)));};
 function indexed(n){
   const a=auxiliary(n),body=n.body||n.classification?.summary||'',metadata=JSON.stringify([n.title,n.aliases,n.projects,n.categories,n.mainTags,a]);
   let entry=index.get(n.id);if(!entry||entry.hash!==n.hash||entry.body!==body||entry.metadata!==metadata){
     const valid=list=>(list||[]).filter(x=>x.quote&&(body.includes(x.quote)||n.title.includes(x.quote)));
     entry={hash:n.hash,body,metadata,title:normal(n.title),aliases:normal([...names(n.aliases),...names(valid(a.aliases)),...names(valid(a.tags))].join(' ')),projects:[...names(n.projects),...names(valid(a.projects))],auxiliary:a};index.set(n.id,entry);
   }return entry;
 }
 function read(operation,args={}){
  loadAux();
  nodeLookup=new Map(store.nodes.map(n=>[n.id,n]));
  if(operation==='handoff'){if(typeof store.handoff!=='function')fail('后台尚未加载交接读取接口',503);return store.handoff(args);}
  if(operation==='task-context'){
   const ids=String(args.ids||'').split(',').filter(Boolean);if(!ids.length||ids.length>6||new Set(ids).size!==ids.length)fail('按当前任务明确选取1–6个不同节点');const budget=Math.max(1000,Math.min(16000,count(args.budget,8000,16000)));let remaining=budget;const items=ids.map(id=>{const n=node(id),text=(n.body||'').slice(0,remaining);remaining-=text.length;return {...brief(n),body:text,truncated:text.length<(n.body||'').length,sources:sources(n).slice(0,3).map(s=>({...s,quote:s.quote.slice(0,400)})),applicability:n.kind==='skill'?skillMethodUse(n):{notice:'历史资料事实与判断，需对照当前任务和来源版本'},contentIsUntrusted:true};});return {purpose:'explicit-current-task-context',items,characters:budget-remaining,budget,automaticallyInjectedIntoChat:false,notice:'此接口只读取明确选中的资料；调用方须实际放入当前请求。未确认技能仅作参考，历史记录不覆盖当前指示和权限。',composition:'按稳定实体身份引用共用设定，选定变体后只合并本次增量；缺失或冲突明确保留，不混合其他变体。'};
  }
  if(operation==='search'){

    const q=String(args.q||'').trim();if(q.length>300||(!q&&!args.mainTag&&!args.project&&!args.source&&!args.date&&(!args.kind||args.kind==='all')))fail('请输入关键词或筛选条件按需查询');
    if(args.date&&!/^\d{4}-\d{2}-\d{2}$/.test(args.date))fail('日期筛选须为 YYYY-MM-DD');
    const kind=args.kind||'all';if(!['all','vault','knowledge','skill','concept'].includes(kind))fail('资料类别无效');if(args.source)queryId(args.source);
    const limit=Math.max(1,count(args.limit,10,25)),offset=count(args.offset,0,100000),terms=q.split(/\s+/).filter(Boolean),regex=terms.map(t=>new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'iu'));
    const datedIds=args.date?store.nodes.filter(n=>(n.importProvenance||[]).some(p=>p.sourceDate?.startsWith(args.date))).map(n=>n.id):null;
    const matches=[];
    for(const n of store.nodes){
      if(n.mergedInto||(kind!=='all'&&n.kind!==kind))continue;const entry=indexed(n);
      if(args.mainTag&&!names(n.mainTags).some(x=>normal(x)===normal(args.mainTag)))continue;
      if(args.project&&!entry.projects.some(x=>normal(x)===normal(args.project)))continue;
      if(args.source&&!hasSource(n,args.source))continue;
      if(datedIds&&!datedIds.some(id=>hasSource(n,id)))continue;
      if(!terms.every((t,k)=>entry.title.includes(normal(t))||entry.aliases.includes(normal(t))||regex[k].test(entry.body)))continue;
      if(!inside(n))continue;matches.push({n,entry,score:terms.reduce((s,t)=>s+(entry.title.includes(normal(t))?5:entry.aliases.includes(normal(t))?3:1),0)});
    }
    matches.sort((a,b)=>b.score-a.score||a.n.id.localeCompare(b.n.id));
    const liveIds=new Set(store.nodes.map(n=>n.id));for(const id of index.keys())if(!liveIds.has(id))index.delete(id);
    return {query:q,searchScope:store.metadataOnly?'metadata-only; backend full-text route not loaded':'saved-local-text',dataRevision:store.state?.revision||null,indexVersion:loadAux().version,total:matches.length,offset,nextOffset:offset+limit<matches.length?offset+limit:null,items:matches.slice(offset,offset+limit).map(({n,entry})=>{const hit=regex.length?Math.max(0,entry.body.search(regex[0])):0,start=Math.max(0,hit-80);return {...brief(n),excerpt:entry.body.slice(start,start+400),excerptOffset:start,auxiliary:entry.auxiliary,sources:sources(n).slice(0,3).map(s=>({...s,quote:s.quote.slice(0,140)})),sourceCount:(n.sources||[]).length};})};
  }
  const n=node(args.id);
  if(operation==='node'){const offset=count(args.offset,0,100000000),length=Math.max(1,count(args.length,12000,32000)),body=n.body||'';return {...brief(n),body:body.slice(offset,offset+length),offset,totalCharacters:body.length,nextOffset:offset+length<body.length?offset+length:null,sources:sources(n),auxiliary:auxiliary(n),contentIsUntrusted:true};}
  if(operation==='sources')return {node:brief(n),sources:sources(n),auxiliary:auxiliary(n)};
  if(operation==='source-fragment'){
    queryId(args.sourceId);const record=(n.sources||[]).find(s=>s.id===args.sourceId);if(!record)fail('该节点没有此来源关联',403);const source=node(args.sourceId),start=record.locator?.match(/字符\s+(\d+)/)?.[1],offset=count(args.offset,start?Number(start):Math.max(0,(source.body||'').indexOf(record.quote||'')),100000000),length=Math.max(1,count(args.length,4000,12000));
    return {node:brief(n),source:brief(source),locator:record.locator||null,quote:(record.quote||'').slice(0,1600),body:(source.body||'').slice(offset,offset+length),offset,totalCharacters:(source.body||'').length,nextOffset:offset+length<(source.body||'').length?offset+length:null,contentIsUntrusted:true};
  }
  if(operation==='neighbors'){
    const limit=Math.max(1,count(args.limit,20,50)),offset=count(args.offset,0,100000),neighbors=new Map();
    for(const r of store.relations){if(r.from!==n.id&&r.to!==n.id)continue;const other=r.from===n.id?r.to:r.from,target=store.nodes.find(x=>x.id===other);if(!target||!inside(target))continue;if(!neighbors.has(other))neighbors.set(other,{node:brief(target),relations:[]});neighbors.get(other).relations.push({id:r.id,from:r.from,to:r.to,type:r.type,typeName:store.state?.types?.find(t=>t.id===r.type)?.name||r.type,summary:r.summary||'',reason:r.reason||'',strength:r.strength,sources:sources(r)});}
    const all=[...neighbors.values()].sort((a,b)=>a.node.id.localeCompare(b.node.id));return {node:brief(n),total:all.length,offset,nextOffset:offset+limit<all.length?offset+limit:null,neighbors:all.slice(offset,offset+limit)};
  }
  fail('只读操作不存在',404);
 }
 read.setAuxiliary=input=>{
   loadAux();
   nodeLookup=new Map(store.nodes.map(n=>[n.id,n]));
   const allowed=['id','expectedHash','expectedVersion','tags','aliases','projects'];if(Object.keys(input).some(k=>!allowed.includes(k)))fail('只允许修改辅助检索字段');
   const n=node(input.id),previous=auxiliary(n);if(input.expectedHash!==n.hash||input.expectedVersion!==previous.version)fail('辅助标签或原文版本已变化，请重新读取',409);
   if(!['tags','aliases','projects'].some(k=>k in input))fail('未提供辅助字段');
   const entry={...previous,sourceHash:n.hash,version:previous.version+1,updatedAt:new Date().toISOString(),method:'auxiliary-search-only'};delete entry.needsReview;
   for(const field of ['tags','aliases','projects'])if(field in input){const list=input[field];if(!Array.isArray(list)||list.length>16)fail('每类辅助标签最多 16 项');const unique=new Map();for(const x of list){if(!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>80||typeof x.quote!=='string'||!x.quote||x.quote.length>1600||(!(n.body||'').includes(x.quote)&&!n.title.includes(x.quote)))fail('辅助检索信息须附现有正文或标题中的定位原句');unique.set(normal(x.name),{name:x.name.trim(),quote:x.quote,reason:String(x.reason||'').slice(0,500)});}entry[field]=[...unique.values()];}
   const state=loadAux();state.entries[n.id]=entry;state.version++;if(auxFile){const temp=auxFile+'.tmp';fs.mkdirSync(path.dirname(auxFile),{recursive:true});fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,auxFile);auxSignature=null;}index.delete(n.id);return {node:brief(n),auxiliary:entry,contentChanged:false,mainClassificationChanged:false};
 };
 read.indexVault=id=>{const n=store.nodes.find(n=>n.id===id&&n.kind==='vault'&&!n.mergedInto);if(!n)fail('资料不存在',404);loadAux();indexed(n);return {sourceId:id,sourceHash:n.hash,searchable:true,characters:n.body.length};};
 read.indexStatus=id=>{const n=store.nodes.find(n=>n.id===id),e=index.get(id);return !!n&&!!e&&e.hash===n.hash&&e.body===n.body;};
 return read;
}
