import {readNavigationIndex} from './navigation-index.mjs';
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { deriveHeat, DEFAULT_HEAT_RULES } from './heat.mjs';
import {knowledgeSimilarity,KNOWLEDGE_SIMILARITY_THRESHOLD} from './knowledge-similarity.mjs';
import {skillMethodPolicy,skillMethodUse} from './skill-methods.mjs';
import {conceptAdmission} from './concept-admission.mjs';
export const hash = (s) => createHash("sha256").update(s).digest("hex");
const dirs = { vault: "Vault", knowledge: "知识点", skill: "技能", concept: "概念云" };
const defaultTypes = [
  ["related", "内容相关", "#a99ad9"],
  ["same", "逻辑相同", "#77a5d2"],
  ["logic", "逻辑相连", "#72b2a0"],
  ["step", "步骤相连", "#d2ac73"],
  ["procedure", "程序相连", "#c48eac"],
].map(([id, name, color]) => ({ id, name, color }));
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function atomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID() + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : e.name.endsWith(".md")
          ? [path.join(dir, e.name)]
          : [],
    );
}
export class Store {
  constructor(root) {
    this.root = path.resolve(root);
    this.meta = path.join(root, ".venus");
    fs.mkdirSync(this.meta, { recursive: true });
    for (const v of Object.values(dirs))
      fs.mkdirSync(path.join(root, v), { recursive: true });
    this.file = path.join(this.meta, "state.json");
    this.state = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : {
          revision: 0,
          positions: {},
          types: defaultTypes,
          jobs: [],
          settings: {
            baseRadius: 1.8,
            maxRadius: 4,
            growth: 0.01,
            distance: 30,
          },
          imports: {},
          operations: {},
        };
    if(!this.state.nodeSizingVersion){this.state.settings.growth=.01;this.state.nodeSizingVersion=1;}
    this.scan();
  }
  save() {
    atomic(this.file, JSON.stringify(this.state, null, 2));
  }
  archive(rel, raw) {
    // Classification aggregates retain their current contents; relation edits keep rollback history.
    const normalized=rel.replaceAll('\\','/');
    if(normalized==='.venus/classifications.md')return;
    const dir = path.join(this.meta, "history", hash(rel).slice(0, 16));
    fs.mkdirSync(dir, { recursive: true });
    atomic(
      path.join(dir, Date.now() + "-" + randomUUID() + ".json"),
      JSON.stringify({ path: rel, raw, time: new Date().toISOString() }),
    );
  }
  scan({paths=null}={}) {
    const previousNodes=this.nodeById;
    const partial=Array.isArray(paths)&&!!this.nodes;
    const selected=partial?new Set(paths.filter(p=>typeof p==='string').map(p=>p.replaceAll('\\','/'))):null;
    this.readStats||={fullScans:0,targetedScans:0};this.readStats[partial?'targetedScans':'fullScans']++;
    const affectedMerges=Object.values(this.state.merges||{}).filter(m=>!partial||[m.targetPath,...m.childPaths].some(p=>selected.has(p)));
    if(!partial||affectedMerges.length){this.refreshMerges();if(partial)for(const m of affectedMerges)for(const p of [m.targetPath,...m.childPaths])selected.add(p);}
    this.contentCache ||= new Map();
    const classificationFile = path.join(this.meta, "classifications.md");
    if(fs.existsSync(classificationFile)){
      const stat=fs.statSync(classificationFile),old=this.classificationCache;
      if(!old||old.mtime!==stat.mtimeMs||old.ctime!==stat.ctimeMs||old.size!==stat.size){
        const raw=fs.readFileSync(classificationFile,'utf8');this.classificationCache={mtime:stat.mtimeMs,ctime:stat.ctimeMs,size:stat.size,entries:JSON.parse(raw.match(/^<!-- venus:(.*?) -->\r?\n/s)[1]).entries};
      }
      this.classifications=this.classificationCache.entries;
    }else{this.classifications={};this.classificationCache=null;}
    const nodeMap=partial?new Map(this.nodes.map(n=>[n.path,n])):new Map();
    let relations=partial?this.relations:[];
    const files=partial?[...selected].flatMap(rel=>{
      const pair=Object.entries(dirs).find(([,dir])=>rel.startsWith(dir+'/'));
      if(!pair||rel.split('/').includes('..'))fail('资料路径无效');
      const file=path.join(this.root,rel);if(!fs.existsSync(file)){nodeMap.delete(rel);if(rel==='知识点/_关系.md')relations=[];return [];}
      return [[pair[0],file]];
    }):Object.entries(dirs).flatMap(([kind,dir])=>walk(path.join(this.root,dir)).map(file=>[kind,file]));
    for (const [kind,f]of files) {
        const stat = fs.statSync(f);
        let cached = this.contentCache.get(f);
        if (!cached || cached.mtime !== stat.mtimeMs || cached.ctime !== stat.ctimeMs || cached.size !== stat.size) {
          const raw = fs.readFileSync(f, "utf8");
          cached = {raw, digest:hash(raw), mtime:stat.mtimeMs, ctime:stat.ctimeMs, size:stat.size};
          this.contentCache.set(f, cached);
        }
        const raw = cached.raw, digest = cached.digest,
          rel = path.relative(this.root, f).replaceAll("\\", "/");
        const match =
          kind === "vault" ? null : raw.match(/^<!-- venus:(.*?) -->\r?\n/s);
        let m = {};
        try {
          if (match) m = JSON.parse(match[1]);
        } catch {}
        if (m.record === "relations") {
          relations = m.relations || [];
          continue;
        }
        const body = match ? raw.slice(match[0].length) : raw;
        const id = m.id || "v-" + hash(rel).slice(0, 14);
        nodeMap.set(rel,{
          ...m,
          id,
          kind,
          path: rel,
          title:
            m.title || body.match(/^# (.+)$/m)?.[1] || path.basename(f, ".md"),
          body,
          hash: digest,
          modifiedAt:new Date(stat.mtimeMs).toISOString(),
          importProvenance:this.state.importProvenance?.[id]||[],
          sources: m.sources || [],
          mainTags: (this.state.mainTags?.[id]?.tags||[]).filter(tag=>this.quoteValidInBody(digest,body,tag.quote)),
          mainTagsReviewed: this.state.mainTags?.[id]?.sourceHash===digest,
          mainTagsReviewReason: this.state.mainTags?.[id]?.reviewReason||'',
          level: m.level || "涉及",
          classification: this.classifications[id] || null,
          categories: (this.classifications[id]?.tags || []).map((t) => t.name),
          classificationHash: hash(
            JSON.stringify(this.classifications[id] || null),
          ),
          classificationNeedsReview:
            !!this.classifications[id] &&
            this.classifications[id].sourceHash !== digest,
          updated: stat.mtime.toISOString(),
        });
      }
    const nodes=[...nodeMap.values()];
    this.nodes = nodes;
    const byId=new Map(nodes.map(n=>[n.id,n]));
    this.nodeById=byId;
    for(const n of nodes)n.analysisNeedsReview=n.sources.some(s=>(s.sourceHash&&s.sourceHash!==byId.get(s.id)?.hash)||!this.sourceQuoteValid(s,byId));
    for(const n of nodes)if(n.kind==='skill'){const policy=n.methodPolicy,source=byId.get(policy?.sourceId);n.methodPolicyNeedsReview=!!policy&&policy.status==='user-confirmed'&&(!source||policy.sourceHash!==source.hash||!source.body.includes(policy.recognitionQuote));n.methodUse=skillMethodUse(n);}
    this.relations = relations;
    for(const [target,merge] of Object.entries(this.state.merges||{})){
      const main=byId.get(target);
      if(main){main.mergedFrom=merge.children;main.mergeConflict=merge.conflict||false;}
      for(const id of merge.children){const child=byId.get(id);if(child)child.mergedInto=target;}
    }
    const sig = hash(
      JSON.stringify([
        nodes.map((n) => [n.id, n.hash, n.classificationHash]).sort(),
        relations,
      ]),
    );
    if (sig !== this.signature) {
      const heatSignature=hash(JSON.stringify([nodes.map(n=>[n.id,n.hash,n.categories]).sort(),this.state.heatRules||DEFAULT_HEAT_RULES]));
      if(heatSignature!==this.heatSignature){this.heatMessageCache ||= new Map();this.nodeHeat=deriveHeat(nodes,{cache:this.heatMessageCache,rules:this.state.heatRules||DEFAULT_HEAT_RULES});this.heatSignature=heatSignature;}
      this.signature = sig;
      this.state.revision++;
      for (const n of nodes) this.position(n);
      this.save();
      for(const n of nodes)n.heat=this.nodeHeat.get(n.id);
      if(this.onLibraryChange&&previousNodes)this.onLibraryChange({revision:this.state.revision,upserts:nodes.filter(n=>{const old=previousNodes.get(n.id);return !old||old.hash!==n.hash||old.classificationHash!==n.classificationHash;}),removed:[...previousNodes.keys()].filter(id=>!byId.has(id)),relations:this.relations});
      return true;
    }
    for(const n of nodes)n.heat=this.nodeHeat?.get(n.id);
    return false;
  }
  sourceQuoteValid(source,byId=this.nodeById){
    const node=byId?.get(source.id);if(!node||typeof source.quote!=='string'||!source.quote.trim())return false;
    return this.quoteValidInBody(node.hash,node.body,source.quote);
  }
  quoteValidInBody(digest,body,quote){
    if(typeof quote!=='string'||!quote.trim())return false;
    this.quoteValidationCache||=new Map();
    const key=digest+'\0'+quote;
    if(this.quoteValidationCache.has(key))return this.quoteValidationCache.get(key);
    const valid=body.includes(quote);
    if(this.quoteValidationCache.size>=50000)this.quoteValidationCache.clear();
    this.quoteValidationCache.set(key,valid);return valid;
  }
  refreshForIds(ids,extraPaths=[]){
    const records=[...new Set(ids)].map(id=>this.nodeById?.get(id));
    if(records.some(n=>!n))return this.scan();
    return this.scan({paths:[...new Set([...records.map(n=>n.path),...extraPaths])]});
  }
  refreshMerges(){
    for(const [id,entry] of Object.entries(this.state.merges||{})){
      const file=path.join(this.root,entry.targetPath);
      if(!fs.existsSync(file))continue;
      const current=fs.readFileSync(file,'utf8');
      if(hash(current)!==entry.combinedHash){entry.conflict=true;continue;}
      const base=JSON.parse(fs.readFileSync(path.join(this.meta,'merges',id+'.json'),'utf8'));
      const parts=entry.children.map((child,i)=>({id:child,path:entry.childPaths[i],body:fs.readFileSync(path.join(this.root,entry.childPaths[i]),'utf8')}));
      const body=this.mergedBody(entry.title,base,parts);
      if(body!==current){this.archive(entry.targetPath,current);atomic(file,body);entry.combinedHash=hash(body);this.save();}
    }
  }
  mergedBody(title,base,parts){
    return '# '+title+'\n\n- 连续资料合并：同一原始对话 ID，经核对后合并阅读；重叠片段保留原文，不冒充已补齐缺失历史。\n- 来源片段、原始文件及消息标识均保留；原始来源仍可追溯。\n\n'+
      [base,...parts].map((p,i)=>`## 来源片段 ${i+1}\n\n来源 ID：${p.id}\n原始路径：${p.path}\n\n${p.body}`).join('\n\n---\n\n');
  }
  mergeVault({targetId,sourceIds,expectedHashes}){
    this.scan();
    const target=this.find(targetId),children=[...new Set(sourceIds||[])].map(id=>this.find(id));
    if(!children.length||children.some(n=>n.id===targetId)||[target,...children].some(n=>n.kind!=='vault'||n.mergedInto||n.mergedFrom?.length))fail('仅可合并独立的连续 Vault 原文');
    const origin=n=>n.body.match(/^- (?:ChatGPT 对话 ID|原始对话／任务 ID)：([^\s]+)/m)?.[1];
    const identity=origin(target);
    if(!identity||children.some(n=>origin(n)!==identity))fail('原始对话 ID 不一致，不能自动合并');
    for(const n of [target,...children])if(expectedHashes?.[n.id]!==n.hash)fail('来源已变化，请重新核对',409);
    const base={id:target.id,path:target.path,body:target.body};
    const title=children.at(-1).title,body=this.mergedBody(title,base,children);
    if(body.length>16e6)fail('合并后超过单份资料大小上限');
    atomic(path.join(this.meta,'merges',target.id+'.json'),JSON.stringify(base));
    this.archive(target.path,target.body);
    atomic(path.join(this.root,target.path),body);
    this.state.merges ||= {};
    this.state.merges[targetId]={title,targetPath:target.path,children:children.map(n=>n.id),childPaths:children.map(n=>n.path),combinedHash:hash(body)};
    this.save();this.scan();
    return this.find(targetId);
  }
  unmergeVault({targetId,expectedHash}){
    const node=this.find(targetId),merge=this.state.merges?.[targetId];
    if(!merge)fail('当前资料未合并');
    if(node.hash!==expectedHash)fail('内容已变化，请重新核对',409);
    if(node.hash!==merge.combinedHash)fail('合并正文经人工修改，请先保存修改后再还原',409);
    const base=JSON.parse(fs.readFileSync(path.join(this.meta,'merges',targetId+'.json'),'utf8'));
    this.archive(node.path,node.body);atomic(path.join(this.root,node.path),base.body);
    delete this.state.merges[targetId];this.save();this.scan();return this.find(targetId);
  }
  position(n) {
    if (this.state.positions[n.id]) return this.state.positions[n.id];
    const seed = parseInt(hash(n.id).slice(0, 8), 16);
    let p = [
      Math.sin(seed) * 70,
      Math.cos(seed * 1.3) * 55,
      Math.sin(seed * 0.7) * 65,
    ];
    const peers = this.nodes
      .filter(
        (x) =>
          x.id !== n.id &&
          x.kind === n.kind &&
          x.sources.some((s) => n.sources.some((a) => a.id === s.id)),
      )
      .map((x) => this.state.positions[x.id])
      .filter(Boolean);
    const nearby = peers.length
      ? peers
      : n.sources.map((s) => this.state.positions[s.id]).filter(Boolean);
    if (nearby.length) {
      p = p.map(
        (v, i) =>
          nearby.reduce((s, x) => s + x[i], 0) / nearby.length +
          v * (this.state.settings.distance / 100),
      );
    }
    this.state.positions[n.id] = p;
    return p;
  }
  snapshot({summary = false,refresh=true} = {}) {
    if(refresh)this.scan();
    const rel = path.join(this.root, "知识点/_关系.md");
    return {
      relationDocumentHash: fs.existsSync(rel)
        ? hash(fs.readFileSync(rel))
        : null,
      features:{classification:true,dynamicLayout:true,activityHeat:true,continuousMerge:true,memorySnapshot:true,incrementalAnalysisReads:true,inlineTitleEdit:true,incrementalImportMetadata:true,concepts:true,conceptAdmission:true,skillMethods:true,knowledgeDedupeThreshold:.95},
      version:'0.3.6',
      semanticNavigation:readNavigationIndex(this.meta),
      analysis:this.analyzer?.status()||{enabled:false,running:false,total:this.nodes.filter(n=>n.kind==='vault').length},
      revision: this.state.revision,
      nodes: summary ? this.nodes.map(({body, ...node}) => ({...node, bodyLength:body.length,
        sources:node.sources.map(s=>({...s, quoteValid:this.sourceQuoteValid(s)}))})) : this.nodes,
      relations: this.relations,
      types: this.state.types,
      jobs: this.state.jobs,
      settings: this.state.settings,
      positions: this.state.positions,
      layoutEpochs: this.state.layoutEpochs||{},
      root: this.root,
    };
  }
  find(id,{refresh=true}={}) {
    if(refresh)this.refreshForIds([id]);
    const n = this.nodeById.get(id);
    if (!n) fail("内容不存在", 404);
    return n;
  }
  validateSources(sources) {
    if (!Array.isArray(sources) || !sources.length)
      fail("派生内容必须包含来源");
    for (const s of sources) {
      const n = this.nodeById.get(s.id);
      if (!n) fail("来源不存在：" + s.id);
      if (
        typeof s.quote !== "string" ||
        !s.quote.trim() ||
        !this.sourceQuoteValid(s)
      )
        fail("来源引文必须逐字存在于原文：" + s.id);
    }
  }
  import({ name, body, originId='', sourceDate='', originVersion='', automatic=false }) {
    if (typeof body !== "string" || !body.trim()) fail("原文不能为空");
    if (body.length > 16e6) fail("单份资料最多 1600 万字符");
    if(typeof originId!=='string'||originId.length>300||typeof originVersion!=='string'||originVersion.length>120||typeof sourceDate!=='string'||(sourceDate&&!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(sourceDate)))fail('来源、日期或版本格式无效');
    const remember=node=>{
      if(!originId&&!sourceDate&&!originVersion)return;
      this.state.importProvenance||={};const entries=this.state.importProvenance[node.id]||=[];
      if(!entries.some(e=>e.originId===originId&&e.sourceDate===sourceDate&&e.originVersion===originVersion)){
        const prior=originId?Object.entries(this.state.importProvenance).filter(([id])=>id!==node.id).flatMap(([id,list])=>list.filter(e=>e.originId===originId).map(e=>({id,...e}))).sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)).at(-1):null;
        entries.push({originId,sourceDate:sourceDate||null,originVersion:originVersion||null,receivedAt:new Date().toISOString(),contentHash:hash(body),previousVersionNodeId:prior?.id||null});this.save();this.scan({paths:[node.path]});
      }
    };
    if(typeof automatic!=='boolean')fail('自动来源标记无效');
    const digest = hash(body);
    if((automatic||originId)&&Object.values(this.state.deletedSources||{}).some(t=>t.bodyHash===digest&&(automatic||t.originIds?.includes(originId))))fail('该来源版本已由用户删除；自动同步不会重新导入。需要恢复时请手动导入原文。',410);
    if (this.state.imports[digest]) {
      const existing = this.nodes.find(
        (n) => n.id === this.state.imports[digest],
      );
      if (existing && hash(this.find(existing.id,{refresh:false}).body)===digest){remember(existing);return {node:this.find(existing.id,{refresh:false}),duplicate:true};}
    }
    const safe =
      String(name || "未命名资料")
        .replace(/\.md$/i, "")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 90) || "未命名资料";
    let rel = "Vault/" + safe + ".md";
    let i = 2;
    while (fs.existsSync(path.join(this.root, rel)))
      rel = "Vault/" + safe + " (" + i++ + ").md";
    atomic(path.join(this.root, rel), body);
    this.scan();
    const n = this.nodes.find((n) => n.path === rel);
    this.state.imports[digest] = n.id;
    remember(n);
    this.save();
    this.job({
      sourceId: n.id,
      status: "queued",
      stage: "原文已保存，等待 Codex 归纳分类",
    });
    return { node: this.find(n.id), duplicate: false };
  }
  checkpoint({originId,eventId,cursor,expectedCursor=null,body,name,sourceDate='',final=false,mode='delta'}){
    if(typeof originId!=='string'||!originId.trim()||originId.length>300||typeof eventId!=='string'||!eventId||eventId.length>200||typeof cursor!=='string'||!cursor||cursor.length>500||!['delta','snapshot'].includes(mode)||typeof body!=='string')fail('交接检查点参数无效');
    this.state.handoffCheckpoints||={};const key=hash(originId),history=this.state.handoffCheckpoints[key]||=[];
    const duplicate=history.find(e=>e.eventId===eventId);if(duplicate){if(duplicate.contentHash!==hash(body)||duplicate.cursor!==cursor)fail('同一事件内容冲突，原检查点已保留',409);return {checkpoint:duplicate,duplicate:true,platformEventObserved:false};}
    const previous=history.at(-1);if((previous?.cursor||null)!==expectedCursor)fail('交接游标已变化，请读取最新检查点',409);
    let known='';for(const entry of history){const node=this.find(entry.nodeId);known=entry.mode==='snapshot'?node.body:known+node.body;}
    const imported=this.import({name:name||originId+'-'+eventId,body,originId,sourceDate,originVersion:eventId});
    const archiveOnly=mode==='snapshot'&&history.length>0&&known===body&&!history.some(e=>e.nodeId===imported.node.id);
    if(archiveOnly){this.state.archiveOnlySources||={};this.state.archiveOnlySources[imported.node.id]=true;this.job({sourceId:imported.node.id,status:'done',stage:'完整原文快照已备份；已有增量分析保留，不重复执行'});}
    const entry={originId,eventId,cursor,nodeId:imported.node.id,contentHash:hash(body),sourceDate:sourceDate||null,receivedAt:new Date().toISOString(),mode,sourceMarkedComplete:!!final,archiveOnly};history.push(entry);this.save();
    return {checkpoint:entry,duplicate:false,platformEventObserved:false,next:{originId,expectedCursor:cursor,readNodeId:entry.nodeId}};
  }
  handoff({originId}){
    if(typeof originId!=='string'||!originId||originId.length>300)fail('来源 ID 无效');const entries=this.state.handoffCheckpoints?.[hash(originId)]||[];
    return {originId,checkpoints:entries,latest:entries.at(-1)||null,platformSubscriptionConnected:false,rawTextRetained:true};
  }
  rootSourceIds(references){const roots=new Set(),seen=new Set(),queue=(references||[]).map(s=>typeof s==='string'?s:s.id);while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);const n=this.nodeById.get(id);if(n?.kind==='vault'||!n){roots.add(id);continue;}queue.push(...(n.sources||[]).map(s=>s.id));}return [...roots];}
  suppressedDerivation(input){const roots=this.rootSourceIds(input.sources);return Object.values(this.state.suppressedDerivations||{}).find(t=>t.kind===input.kind&&(t.id===input.id||t.generationKey&&t.generationKey===input.generationKey||t.bodyHash===hash(input.body||''))&&(t.rootSourceIds||this.rootSourceIds(t.sourceIds||[])).some(id=>roots.includes(id)));}
  upsert(input) {
    if(this.suppressedDerivation(input))fail('该来源生成项已由用户删除，禁止自动重建',410);
    this.refreshForIds([...(this.nodeById?.has(input.id)?[input.id]:[]),...(Array.isArray(input.sources)?input.sources.map(s=>s.id):[])]);
    if (!["knowledge", "skill", "concept"].includes(input.kind))
      fail("只能写入 AI 知识点、AI 技能或概念");
    if (
      !input.id ||
      ["__proto__", "constructor", "prototype"].includes(input.id) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id)
    )
      fail("需要稳定的字母数字 ID");
    const existing = this.nodes.find((n) => n.id === input.id);
    if (existing && existing.kind !== input.kind) fail("不能改变内容目录");
    if (existing && input.expectedHash !== existing.hash)
      fail("内容已变化，请重新读取后修订", 409);
    if (!input.title?.trim() || !input.body?.trim()) fail("标题与正文不能为空");
    if(input.kind==='knowledge'&&existing&&knowledgeSimilarity(existing.body,input.body)<KNOWLEDGE_SIMILARITY_THRESHOLD)fail('AI 知识点实测相似度不足95%，须保留独立节点，不能整合覆盖',409);
    if ((input.sources || []).some((s) => s.id === input.id))
      fail("不能以自身作为来源");
    this.validateSources(input.sources);
    if(input.kind==='concept'&&!input.sources.every(s=>this.nodeById.get(s.id)?.kind==='vault'))fail('概念须直接引用 Vault 原文');
    if(input.kind==='concept'&&input.conceptStance&&!['用户观点','讨论假设','助手建议','已确认结论'].includes(input.conceptStance))fail('概念认识性质无效');
    if(input.kind==='concept'){
      if(existing&&this.state.manualEdits?.[existing.id]&&(input.body!==existing.body||input.title!==existing.title))fail('人工编辑概念须通过编辑器修订，自动整合不能覆盖',409);
      const ref=input.conceptReferences?.at(-1),source=this.nodeById.get(ref?.sourceId),range=ref?.readRange;
      if(!source||source.kind!=='vault'||ref.sourceHash!==source.hash||!range||!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.end>source.body.length||range.start>range.end)fail('概念须保留原文内的用户认可及结论依据');
      const accepted=conceptAdmission({admission:ref.admission},{start:range.start,end:range.end,text:source.body.slice(range.start,range.end)},{source,priorEvidence:ref.discussion||[],historical:ref.historicalRecognition===true});
      if(!accepted.accepted)fail('概念未满足用户认可准入：'+accepted.reason);
      ref.recognitionMethod=accepted.recognitionMethod||'explicit';ref.executionAuthorization=false;
      ref.discussion=[...accepted.evidence,...(ref.discussion||[])].filter((d,i,all)=>all.findIndex(x=>x.role===d.role&&x.start===d.start&&x.end===d.end)===i);
    }
    if (
      input.kind === "skill" &&
      !input.sources.some(
        (s) => this.nodes.find((n) => n.id === s.id)?.kind === "knowledge",
      )
    )
      fail("技能至少需要一个知识点依据");
    if (
      input.kind === "skill" &&
      !["涉及", "实践", "验证"].includes(input.level)
    )
      fail("技能程度须为涉及、实践或验证");
    let methodPolicy;
    if(input.kind==='skill'){
      const unchanged=existing&&input.body===existing.body&&(!input.methodPolicy||JSON.stringify(input.methodPolicy)===JSON.stringify(existing.methodPolicy));
      methodPolicy=unchanged?existing.methodPolicy:skillMethodPolicy(input.methodPolicy,this.nodeById.get(input.methodPolicy?.sourceId),input.body);
      if(existing?.methodPolicy?.status==='user-confirmed'&&!unchanged&&(methodPolicy.status!=='user-confirmed'||methodPolicy.scope!==existing.methodPolicy.scope||methodPolicy.limitations!==existing.methodPolicy.limitations||methodPolicy.recognitionTarget!==existing.methodPolicy.recognitionTarget))fail('不能用未确认建议或不同范围的方法覆盖已确认方法，须独立保存',409);
    }
    const rel = existing?.path || dirs[input.kind] + "/" + input.id + ".md";
    const m = {
      id: input.id,
      ...(input.generationKey?{generationKey:input.generationKey}:{}),
      title: input.title,
      kind: input.kind,
      sources:input.kind==='knowledge'&&existing?[...new Map([...existing.sources,...input.sources].map(s=>[JSON.stringify(s),s])).values()]:input.kind==='skill'&&methodPolicy?.status==='user-confirmed'?[...new Map([...(existing?.sources||[]),...input.sources,{id:methodPolicy.sourceId,sourceHash:methodPolicy.sourceHash,quote:methodPolicy.recognitionQuote,locator:methodPolicy.recognitionLocator}].map(s=>[JSON.stringify(s),s])).values()]:input.sources,
      level: input.level || "涉及",
      domain: input.domain || "",
      occupations: input.occupations || "",
      projects: input.projects || [],
      ...(input.analysisTemplate?{analysisTemplate:input.analysisTemplate}:existing?.analysisTemplate?{analysisTemplate:existing.analysisTemplate}:{}),
      ...(input.epistemic?{epistemic:input.epistemic}:{}),
      decision: input.decision || "新增",
      ...(input.kind==='concept'?{conceptStance:input.conceptStance||existing?.conceptStance||'讨论假设',conceptReferences:input.conceptReferences||existing?.conceptReferences||[],managedBy:input.managedBy||existing?.managedBy||'manual'}:{}),
      ...(input.kind==='skill'&&methodPolicy?{methodPolicy}:{}),
    };
    const raw = "<!-- venus:" + JSON.stringify(m) + " -->\n" + input.body;
    if (existing)
      this.archive(rel, fs.readFileSync(path.join(this.root, rel), "utf8"));
    atomic(path.join(this.root, rel), raw);
    this.scan({paths:[rel]});
    return this.find(input.id,{refresh:false});
  }
  edit({ id, body, title, expectedHash }) {
    const n = this.find(id);
    if (n.hash !== expectedHash) fail("内容已变化，请重新读取", 409);
    if (typeof body !== "string" || !body.trim()) fail("正文不能为空");
    if(title!==undefined&&(typeof title!=='string'||!title.trim()||/[\r\n]/.test(title)))fail('标题不能为空且须为单行');
    if(title!==undefined&&title.trim()!==n.title){title=title.trim();body=/^# .+$/m.test(body)?body.replace(/^# .+$/m,'# '+title):'# '+title+'\n\n'+body;}
    if (n.kind === "vault") {
      if(this.state.archiveOnlySources?.[id])delete this.state.archiveOnlySources[id];
      this.archive(
        n.path,
        fs.readFileSync(path.join(this.root, n.path), "utf8"),
      );
      atomic(path.join(this.root, n.path), body);
      this.scan();
      this.requestReview(id);
      return this.find(id);
    }
    const original=fs.readFileSync(path.join(this.root,n.path),'utf8');
    let prefix=original.slice(0,original.length-n.body.length);
    if(title!==undefined){const metadata=JSON.parse(prefix.match(/^<!-- venus:(.*?) -->/s)[1]);metadata.title=title.trim();prefix='<!-- venus:'+JSON.stringify(metadata)+' -->\n';}
    this.archive(n.path,original);
    atomic(path.join(this.root,n.path),prefix+body);
    this.scan();
    const updated=this.find(id);
    this.state.manualEdits ||= {};
    this.state.manualEdits[id]={hash:updated.hash,time:new Date().toISOString()};
    if(n.kind!=='concept')this.requestReview(id);else this.save();
    return this.find(id);
  }
  requestReview(id){
    const affected=new Set([id]);
    let changed=true;
    while(changed){
      changed=false;
      for(const node of this.nodes)if(!affected.has(node.id)&&node.sources.some(s=>affected.has(s.id))){affected.add(node.id);changed=true;}
    }
    const vaults=new Set(),visited=new Set();
    const trace=nodeId=>{
      if(visited.has(nodeId))return;visited.add(nodeId);
      const node=this.nodes.find(n=>n.id===nodeId);if(!node)return;
      if(node.kind==='vault'){vaults.add(node.mergedInto||node.id);return;}
      for(const source of node.sources)trace(source.id);
    };
    for(const nodeId of affected)trace(nodeId);
    this.state.reviewRequests ||= {};
    const token=randomUUID();
    for(const sourceId of vaults){
      this.state.reviewRequests[sourceId]=token;
      const job=this.state.jobs.find(j=>j.sourceId===sourceId);
      if(job?.status!=='paused')this.job({sourceId,status:'queued',stage:'编辑已保存，受影响资料等待增量复核'});
    }
    this.state.revision++;this.save();
  }
  setMainTags({id,tags,sourceHash,reviewReason='',method='codex'},{defer=false}={}){
    const node=defer?this.nodes.find(n=>n.id===id):this.find(id);
    if(!node)fail('内容不存在',404);
    if(node.hash!==sourceHash)fail('内容已变化，请重新读取',409);
    if(!Array.isArray(tags)||tags.length>6)fail('主分类数量无效');
    const normalized=[];
    for(const tag of tags){
      const name=String(tag.name||'').trim();
      if(!name||name.length>24||(/[\u3400-\u9fff]/.test(name)&&name.length>4)||!tag.reason?.trim()||!tag.quote?.trim()||!this.quoteValidInBody(node.hash,node.body,tag.quote))fail('主分类必须简短且包含来源定位');
      if(!normalized.some(t=>t.name===name))normalized.push({name,reason:tag.reason.trim(),quote:tag.quote});
    }
    if(!normalized.length&&!reviewReason.trim())fail('无法分类时须说明原因');
    this.state.mainTags ||= {};
    if(this.state.mainTags[id]?.method==='manual'&&method!=='manual')return node;
    this.state.mainTags[id]={sourceHash,tags:normalized,reviewReason,method,updated:new Date().toISOString()};
    this.state.revision++;
    if(defer)return node;
    this.save();this.scan();return this.find(id);
  }
  writeRelations() {
    const rel = "知识点/_关系.md";
    const file = path.join(this.root, rel);
    atomic(
      file,
      "<!-- venus:" +
        JSON.stringify({ record: "relations", relations: this.relations }) +
        " -->\n# 关系依据\n\n" +
        this.relations
          .map(
            (r) =>
              "## " +
              r.id +
              "\n\n" +
              r.from +
              " → " +
              r.to +
              " / " +
              r.type +
              " / 强度 " +
              r.strength +
              "\n\n" +
              r.reason +
              "\n\n来源：" +
              r.sources.map((s) => s.id + "「" + s.quote + "」").join("；"),
          )
          .join("\n\n"),
    );
    this.scan({paths:[rel]});
  }
  relation(r) {
    this.refreshForIds([r.from,r.to,...(Array.isArray(r.sources)?r.sources.map(s=>s.id):[])],['知识点/_关系.md']);
    const a = this.find(r.from,{refresh:false}),
      b = this.find(r.to,{refresh:false});
    if (a.id === b.id || a.kind !== b.kind)
      fail("首版关系连接同一网络的不同节点");
    if (!this.state.types.some((t) => t.id === r.type)) fail("关系类型不存在");
    if (!r.reason?.trim()) fail("需要关系理由");
    if (!Number.isFinite(r.strength) || r.strength < 0 || r.strength > 1)
      fail("强度范围为 0–1");
    this.validateSources(r.sources);
    const id =
      r.id ||
      this.relations.find(
        (x) => x.from === r.from && x.to === r.to && x.type === r.type,
      )?.id ||
      "r-" + hash([r.from, r.to, r.type].join("|")).slice(0, 16);
    const old = this.relations.find((x) => x.id === id);
    if (old && r.expectedHash !== hash(JSON.stringify(old)))
      fail("关系已变化，请重读", 409);
    const value = {
      id,
      from: r.from,
      to: r.to,
      type: r.type,
      strength: r.strength,
      reason: r.reason,
      summary:
        typeof r.summary === "string"
          ? r.summary.trim().slice(0, 60)
          : r.reason.trim().slice(0, 28),
      sources: r.sources,
      dimensions: r.dimensions || {},
      ...(r.managedBy === 'automatic' ? {managedBy:'automatic'} : {}),
    };
    const relationFile=path.join(this.root,"知识点/_关系.md");
    if(fs.existsSync(relationFile))this.archive("知识点/_关系.md",fs.readFileSync(relationFile,"utf8"));
    this.relations = this.relations.filter((x) => x.id !== id).concat(value);
    this.writeRelations();
    return value;
  }
  type(t) {
    if (!t.name?.trim() || !/^#[0-9a-f]{6}$/i.test(t.color))
      fail("需要名称与十六进制颜色");
    const id = t.id || "t-" + hash(t.name).slice(0, 10);
    const existing=this.state.types.find(x=>x.id===id);
    if(existing&&!t.update)fail("关系类型已存在");
    if(existing)Object.assign(existing,{name:t.name,color:t.color});
    else {
      if(t.sources?.length)this.validateSources(t.sources);
      this.state.types.push({id,name:t.name,color:t.color,...(t.reason?{reason:t.reason}:{}),...(t.sources?.length?{sources:t.sources}:{})});
    }
    this.state.revision++;
    this.save();
    return this.state.types;
  }
  job({ sourceId, status, stage, operationId }) {
    this.find(sourceId);
    let j = this.state.jobs.find((j) => j.sourceId === sourceId);
    if (!j) {
      j = {
        id: randomUUID(),
        sourceId,
        status: "queued",
        stage: "原文已保存，等待 Codex 分析",
        operations: [],
      };
      this.state.jobs.push(j);
    }
    if (status && !["queued", "working", "paused", "done"].includes(status))
      fail("任务状态无效");
    if (operationId && j.operations.includes(operationId)) return j;
    if (operationId) j.operations.push(operationId);
    if (status) j.status = status;
    if (stage) j.stage = stage;
    j.updated = new Date().toISOString();
    this.state.revision++;
    this.save();
    return j;
  }
  versionTarget(id) {
    if (id !== "@relations") return this.find(id);
    const rel = "知识点/_关系.md",
      file = path.join(this.root, rel);
    if (!fs.existsSync(file)) fail("尚无关系版本", 404);
    return { id, path: rel, hash: hash(fs.readFileSync(file)) };
  }
  history(id) {
    const n = this.versionTarget(id);
    const dir = path.join(this.meta, "history", hash(n.path).slice(0, 16));
    return fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .reverse()
          .map((f) => {
            const v = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
            return { version: f, time: v.time };
          })
      : [];
  }
  restore({ id, version, expectedHash }) {
    const n = this.versionTarget(id);
    if (n.hash !== expectedHash) fail("内容已变化，请重新读取", 409);
    if (!/^[\w.-]+\.json$/.test(version)) fail("版本名无效");
    const file = path.join(
      this.meta,
      "history",
      hash(n.path).slice(0, 16),
      version,
    );
    if (!fs.existsSync(file)) fail("版本不存在", 404);
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    if (v.path !== n.path) fail("版本不匹配");
    this.archive(n.path, fs.readFileSync(path.join(this.root, n.path), "utf8"));
    atomic(path.join(this.root, n.path), v.raw);
    this.scan();
    return id === "@relations" ? { relations: this.relations } : this.find(id);
  }
  resetLayout({kind='all',mode='random'}={}){
    if(!['all','vault','knowledge','skill','concept'].includes(kind))fail('布局参数无效');
    if(!['random','center'].includes(mode))fail('布局参数无效');
    this.scan();this.state.layoutEpochs||={};
    this.state.layoutResetModes||={};
    const kinds=kind==='all'?['vault','knowledge','skill','concept']:[kind];
    for(const k of kinds){
      const epoch=(this.state.layoutEpochs[k]||0)+1;this.state.layoutEpochs[k]=epoch;
      this.state.layoutResetModes[k]=mode;
      for(const node of this.nodes.filter(n=>n.kind===k)){
        const seed=hash(node.id+'|'+epoch),unit=i=>parseInt(seed.slice(i,i+8),16)/0xffffffff;
        const angle=unit(0)*Math.PI*2,z=unit(8)*2-1,r=this.state.settings.distance*6*Math.cbrt(.05+.95*unit(16));
        this.state.positions[node.id]=mode==='center'?[0,0,0]:[r*Math.sqrt(1-z*z)*Math.cos(angle),r*z,r*Math.sqrt(1-z*z)*Math.sin(angle)];
      }
    }
    this.state.revision++;this.save();return {reset:kinds,layoutEpochs:this.state.layoutEpochs};
  }
  checkpointLayout({ kind, positions,epoch=0,protocol=0 }) {
    if (
      !["vault", "knowledge", "skill", "concept"].includes(kind) ||
      !positions ||
      typeof positions !== "object"
    )
      fail("布局参数无效");
    if(epoch!==(this.state.layoutEpochs?.[kind]||0))fail('布局已重置，请重新读取',409);
    if(this.state.layoutResetModes?.[kind]==='center'&&protocol<2)fail('布局已重置，请重新读取',409);
    this.scan();
    const ids = new Set(
      this.nodes.filter((n) => n.kind === kind).map((n) => n.id),
    );
    const entries = Object.entries(positions);
    for (const [id, p] of entries)
      if (
        !ids.has(id) ||
        !Array.isArray(p) ||
        p.length !== 3 ||
        p.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000)
      )
        fail("布局包含无效节点或坐标");
    for (const [id, p] of entries) this.state.positions[id] = [...p];
    this.save();
    return { saved: entries.length };
  }
  classify({ id, summary, tags, expectedHash, sourceHash, method = "manual",allowEmpty=false }) {
    const n = this.find(id);
    if (n.classificationHash !== expectedHash || n.hash !== sourceHash)
      fail("内容或分类已变化，请重新读取", 409);
    if (
      !summary?.trim() ||
      !Array.isArray(tags) ||
      !tags.length&&!(allowEmpty&&method==='codex') ||
      tags.length > 16
    )
      fail("需要资料归纳与 1–16 个有依据标签");
    const normalized = [];
    for (const tag of tags) {
      if (
        typeof tag.name !== "string" ||
        !tag.name.trim() ||
        tag.name.length > 40 ||
        typeof tag.reason !== "string" ||
        !tag.reason.trim() ||
        typeof tag.quote !== "string" ||
        !tag.quote.trim() ||
        !this.quoteValidInBody(n.hash,n.body,tag.quote)
      )
        fail("每个标签须包含名称、理由和逐字存在的依据引文");
      if (!normalized.some((t) => t.name === tag.name.trim()))
        normalized.push({
          name: tag.name.trim(),
          reason: tag.reason.trim(),
          quote: tag.quote,
        });
    }
    if (!["manual", "codex"].includes(method)) fail("分类方式无效");
    const rel = ".venus/classifications.md",
      file = path.join(this.root, rel);
    this.classifications[id] = {
      ...this.classifications[id],
      summary: summary.trim(),
      tags: normalized,
      sourceHash: n.hash,
      method,
      updated: new Date().toISOString(),
    };
    atomic(
      file,
      "<!-- venus:" +
        JSON.stringify({ entries: this.classifications }) +
        " -->\n# 资料、知识与技能的归纳分类\n\n" +
        Object.entries(this.classifications)
          .map(
            ([id, c]) =>
              "## " +
              id +
              "\n\n" +
              c.summary +
              "\n\n" +
              c.tags
                .map(
                  (t) =>
                    "- " +
                    t.name +
                    "：" +
                    t.reason +
                    "；依据「" +
                    t.quote +
                    "」",
                )
                .join("\n"),
          )
          .join("\n\n"),
    );
    this.scan({paths:[n.path]});
    return this.find(id,{refresh:false});
  }
  configure(settings) {
    const next = { ...this.state.settings };
    for (const [k, min, max] of [
      ["baseRadius", 0.2, 5],
      ["maxRadius", 1, 10],
      ["growth", 0, 0.1],
      ["distance", 5, 100],
    ])
      if (settings[k] !== undefined) {
        if (
          !Number.isFinite(settings[k]) ||
          settings[k] < min ||
          settings[k] > max
        )
          fail("显示参数超出范围");
        next[k] = settings[k];
      }
    if (next.maxRadius < next.baseRadius) fail("最大半径不能小于基础半径");
    this.state.settings = next;
    this.state.revision++;
    this.save();
    return next;
  }
}
