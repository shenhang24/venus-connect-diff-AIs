// navigation-model:begin
// Pure navigation projection; never writes source nodes, tags, projects or evidence.
export const NAV_PENDING_DOMAIN='pending-semantic';
export const NAV_UNASSIGNED_PROJECT='@unassigned-project';
export const navNormal=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase();
export const navMajorKey=id=>'@major:'+encodeURIComponent(id);
export function navTrustedProjects(node){return (node.projectScopes||[]).filter(p=>!['repeated-tag-project','branch-lineage'].includes(p.basis)&&!node.projectMembershipNeedsReview);}
export function navIndexContext(nodes,index={}){const byId=new Map(nodes.map(n=>[n.id,n])),domains=new Map((index.domains||[]).map(d=>[d.id,d])),tags=new Map();for(const row of index.assignments||[]){if(!(row.sourceProofs||[]).length||(row.sourceProofs||[]).some(p=>byId.get(p.id)?.hash!==p.hash))continue;const ids=(row.domainIds||[]).filter(id=>domains.has(id));if(ids.length)tags.set(navNormal(row.tag),{...row,domainIds:ids});}return {byId,domains,tags};}
export function navOwnDomains(node,context){const found=new Map();if(node.classificationNeedsReview)return [];for(const tag of [...(node.mainTags||[]),...(node.classification?.tags||[]),...(node.categories||[]).map(name=>({name}))]){const row=context.tags.get(navNormal(tag.name));if(!row)continue;for(const id of row.domainIds){const d=context.domains.get(id);if(!found.has(id))found.set(id,{...d,basis:'model-semantic-label',matchedTags:[],ruleVersion:row.ruleVersion||'major-navigation-v1'});found.get(id).matchedTags.push(tag.name);}}for(const row of context.tags.values())if(row.subjectIds?.includes(node.id))for(const id of row.domainIds){if(!found.has(id))found.set(id,{...context.domains.get(id),basis:'same-analysis-semantic-inference',matchedTags:[row.tag],ruleVersion:row.ruleVersion});}return [...found.values()];}
export function attachSemanticNavigation(nodes,index){const context=navIndexContext(nodes,index),own=new Map(nodes.map(n=>[n.id,navOwnDomains(n,context)])),projectDomains=new Map();for(const n of nodes)for(const p of navTrustedProjects(n)){if(!projectDomains.has(p.id))projectDomains.set(p.id,new Map());for(const d of own.get(n.id))projectDomains.get(p.id).set(d.id,d);}
 return nodes.map(n=>{const projects=navTrustedProjects(n),domains=new Map(own.get(n.id).map(d=>[d.id,d]));for(const p of projects)for(const d of projectDomains.get(p.id)?.values()||[])if(!domains.has(d.id))domains.set(d.id,{...d,basis:'shared-project-reference',viaProjectId:p.id});if(!domains.size)domains.set(NAV_PENDING_DOMAIN,{id:NAV_PENDING_DOMAIN,name:'待语义归纳',definition:'尚无当前版本的模型语义大标签依据；原细标签和正文保留。',basis:'pending'});return {...n,navigationOwnDomains:own.get(n.id),navigationDomains:[...domains.values()],navigationProjects:projects,navigationRuleVersion:index.ruleVersion||'major-navigation-v1'};});
}
export function buildSemanticNavigation(nodes,index,kind){const projected=nodes.every(n=>Array.isArray(n.navigationDomains))?nodes:attachSemanticNavigation(nodes,index||{version:1,domains:[],assignments:[]}),visible=projected.filter(n=>n.kind===kind&&!n.mergedInto),domains=new Map(),projects=new Map();for(const n of visible){for(const p of n.navigationProjects||[]){if(!projects.has(p.id))projects.set(p.id,{id:p.id,name:p.name,nodes:[],domainIds:new Set()});const g=projects.get(p.id);g.nodes.push(n);for(const d of n.navigationDomains)g.domainIds.add(d.id);}for(const d of n.navigationDomains){if(!domains.has(d.id))domains.set(d.id,{...d,nodes:[],projectIds:new Set(),unassigned:[]});const g=domains.get(d.id);g.nodes.push(n);if(n.navigationProjects?.length)for(const p of n.navigationProjects)g.projectIds.add(p.id);else g.unassigned.push(n);}}
 return {kind,nodes:visible,domains:[...domains.values()].map(d=>({...d,projectIds:[...d.projectIds]})).sort((a,b)=>a.id===NAV_PENDING_DOMAIN?1:b.id===NAV_PENDING_DOMAIN?-1:a.name.localeCompare(b.name)),projects:[...projects.values()].map(p=>({...p,domainIds:[...p.domainIds]})),indexRevision:index?.revision||0};
}
export function navContents(tree,{domainId,projectId,query='',topic=null,page=0,pageSize=40}={}){let nodes;if(projectId&&projectId!==NAV_UNASSIGNED_PROJECT)nodes=tree.projects.find(p=>p.id===projectId)?.nodes||[];else{nodes=tree.domains.find(d=>d.id===domainId)?.nodes||tree.nodes;if(projectId===NAV_UNASSIGNED_PROJECT)nodes=nodes.filter(n=>!n.navigationProjects?.length);}const q=navNormal(query);if(q)nodes=nodes.filter(n=>navNormal([n.title,n.classification?.summary,...(n.categories||[])].join(' ')).includes(q));const topics=new Map();for(const n of nodes)for(const tag of n.categories||[])topics.set(tag,(topics.get(tag)||0)+1);if(topic)nodes=nodes.filter(n=>(n.categories||[]).includes(topic));const pages=Math.max(1,Math.ceil(nodes.length/pageSize)),safePage=Math.min(Math.max(0,page),pages-1);return {nodes:nodes.slice(safePage*pageSize,(safePage+1)*pageSize),total:nodes.length,page:safePage,pages,topics:[...topics].sort((a,b)=>b[1]-a[1]).slice(0,12)};}

// One identity lookup per endpoint; retain independent relations and source evidence.
export function projectLayerRelations(nodes,relations,kind){const byId=new Map(nodes.map(n=>[n.id,n])),visible=nodes.filter(n=>n.kind===kind&&!n.mergedInto),ids=new Set(visible.map(n=>n.id)),edges=[];for(const relation of relations){const from=byId.get(relation.from)?.mergedInto||relation.from,to=byId.get(relation.to)?.mergedInto||relation.to;if(from!==to&&ids.has(from)&&ids.has(to))edges.push({...relation,from,to});}return {nodes:visible,edges};}

// navigation-model:end
const ai=/\b(?:ai|artificial intelligence|machine learning|deep learning|llm|gpt|claude|gemini|openai|codex|lora|dino|sdxl|qwen|ollama|agentic)\b|人工智能|机器学习|深度学习|大模型|语言模型|智能体|模型训练|模型推理|提示词|扩散模型/i;
export function tagHierarchy(name){
 const text=String(name||'').trim();if(!text)return null;
 const project=text.match(/^(?:项目|Project)\s*[:：/·]\s*(.+)$/i);if(project)return {primary:'项目',secondary:project[1].trim()};
 if(ai.test(text))return {primary:'人工智能',secondary:/^(?:AI|Artificial Intelligence|人工智能)$/i.test(text)?null:text};
 const divided=text.split(/\s*(?:\/|::|＞|>)\s*/);return {primary:divided[0],secondary:divided.length>1?divided.slice(1).join(' / '):null};
}
export function themeHierarchy(node){
 const map=new Map();for(const tag of node.mainTags||[]){const h=tagHierarchy(tag.name);if(!h)continue;if(!map.has(h.primary))map.set(h.primary,new Set());if(h.secondary)map.get(h.primary).add(h.secondary);}

 return [...map].map(([primary,sub])=>({primary,secondary:[...sub].sort()}));
}

const normal=name=>String(name||'').normalize('NFKC').trim().toLocaleLowerCase();
export const UNASSIGNED_PROJECT='@unassigned-project';
export const projectKey=id=>'@project:'+encodeURIComponent(id);
export function explicitProjects(node){
 const out=new Map(),add=(p,basis)=>{if(typeof p==='string')p={name:p};if(!p||typeof p!=='object')return;const name=String(p.name||p.label||p.projectName||'').trim(),rawId=p.id||p.projectId;if(!name&&!rawId)return;const id=String(rawId||'named:'+normal(name));out.set(id,{id,name:name||id,basis:p.basis||basis,sourceIds:[node.id]});};
 if(node.projectMembershipNeedsReview||node.classification?.projectMembershipAnalysis?.method==='semantic-project-content'&&node.classification.projectMembershipAnalysis.sourceHash!==node.hash)return [];
 const members=node.classification?.projectMemberships;if(Array.isArray(members)){for(const p of members)add(p,'saved-project-metadata');return [...out.values()];}
 for(const p of Array.isArray(node.projects)?node.projects:typeof node.projects==='string'?[node.projects]:[])add(p,'explicit-project');
 if(node.projectId)add({id:node.projectId,name:node.projectName||node.project?.name},'explicit-project');
 for(const tag of [...(node.mainTags||[]),...(node.classification?.tags||[])]){const match=String(tag.name||'').match(/^(?:项目|Project)\s*[:：/·]\s*(.+)$/i);if(match)add({name:match[1]},'explicit-project-classification');}
 if(!out.size)for(const p of node.autoProjectMemberships||[])add(p,'repeated-tag-project');
 return [...out.values()];
}
export function branchRoot(title){let name=String(title||'').normalize('NFKC').trim(),branched=false;while(/^(?:分支|branch|续篇|continuation)\s*[·•:：\-]\s*/i.test(name)){name=name.replace(/^(?:分支|branch|续篇|continuation)\s*[·•:：\-]\s*/i,'');branched=true;}const suffix=name.match(/\s*[·•:：\-]\s*(?:续篇|续集|continued|continuation)(?:\s*\d+)?\s*$/i);if(suffix){name=name.slice(0,suffix.index).trim();branched=true;}return {name,branched};}
export function projectGroups(nodes,jobs=[]){
 const order=new Map(jobs.map((j,i)=>[j.sourceId,i])),groups=new Map(),families=new Map();
 const get=p=>{if(!groups.has(p.id))groups.set(p.id,{id:p.id,name:p.name,members:[],basis:p.basis,branched:false,explicitProject:p.basis!=='branch-lineage',continuousObjectId:p.id});return groups.get(p.id);};
 const attach=(n,p)=>{const g=get(p);if(!g.members.some(m=>m.id===n.id))g.members.push({id:n.id,title:n.title,path:n.path,order:order.get(n.id)??Number.MAX_SAFE_INTEGER});};
 for(const n of nodes){for(const p of explicitProjects(n))get(p);if(n.kind!=='vault'||n.mergedInto)continue;for(const p of explicitProjects(n))attach(n,p);const root=branchRoot(n.title);if(!root.name||/^(?:新聊天|new chat|untitled|无标题)$/i.test(root.name))continue;const key=normal(root.name);if(!families.has(key))families.set(key,{name:root.name,members:[],branched:false});const family=families.get(key);family.branched||=root.branched;family.members.push(n);}
 for(const [key,family]of families){if(!family.branched)continue;const known=new Map(family.members.flatMap(explicitProjects).map(p=>[p.id,p]));if(known.size>1)continue;const p=known.values().next().value||{id:'branch:'+key,name:family.name,basis:'branch-lineage'};const g=get(p);g.branched=true;for(const n of family.members)if(!explicitProjects(n).length)attach(n,p);}
 return [...groups.values()].map(g=>({...g,members:g.members.sort((a,b)=>a.order-b.order)}));
}
export function projectScopesFor(nodes,groups){
 const direct=new Map(),memo=new Map(),byId=new Map(nodes.map(n=>[n.id,n]));for(const n of nodes){const p=explicitProjects(n);if(p.length||Array.isArray(n.classification?.projectMemberships))direct.set(n.id,p);}for(const g of groups.filter(g=>g.basis!=='branch-lineage'))for(const m of g.members)if(!direct.has(m.id))direct.set(m.id,[{id:g.id,name:g.name,basis:g.basis,sourceIds:[m.id]}]);
 const get=(id,seen=new Set())=>{if(direct.has(id))return direct.get(id);if(memo.has(id))return memo.get(id);if(seen.has(id))return [];seen.add(id);const result=new Map();for(const s of [...(byId.get(id)?.sources||[]),...(byId.get(id)?.projectSourceIds||[]).map(id=>({id})),...(byId.get(id)?.importProvenance||[]).filter(p=>p.previousVersionNodeId).map(p=>({id:p.previousVersionNodeId}))])for(const scope of get(s.id,new Set(seen))){const old=result.get(scope.id);result.set(scope.id,{...scope,sourceIds:[...new Set([...(old?.sourceIds||[]),...(scope.sourceIds||[]),s.id])]});}const value=[...result.values()];memo.set(id,value);return value;};return new Map(nodes.map(n=>[n.id,get(n.id)]));
}
export function nodeTagHierarchy(node){
 if(Array.isArray(node.navigationDomains))return node.navigationDomains.map(d=>({primary:d.name,key:navMajorKey(d.id),domainId:d.id,kind:'major-domain',secondary:(node.navigationProjects||[]).map(p=>p.name),basis:d.basis}));
 const themes=themeHierarchy(node);if(!node.projectOrganization&&!node.knowledgeProjectOrganization)return themes;
 const topics=[...new Set([...themes.flatMap(t=>t.secondary.length?t.secondary.map(s=>t.primary+' / '+s):[t.primary]),...(node.categories||[])])].filter(name=>name!=='项目'&&!/^(?:项目|Project)\s*[:：/·]/i.test(name)).sort();
 const scopes=node.projectScopes||[];return scopes.length?scopes.map(p=>({primary:p.name,key:projectKey(p.id),projectId:p.id,kind:'project',secondary:topics,basis:p.basis,sourceIds:p.sourceIds||[]})):[{primary:'待归属',key:UNASSIGNED_PROJECT,kind:'unassigned',secondary:topics}];
}
// User rule: three independent source documents nominate a project; five promote it.
export function recurringTagProjects(nodes){
 const byId=new Map(nodes.map(n=>[n.id,n])),memo=new Map(),groups=new Map();
 const roots=(id,seen=new Set())=>{if(memo.has(id))return memo.get(id);if(seen.has(id))return new Set();seen.add(id);const n=byId.get(id);if(!n)return new Set();
  const lineage=[...(n.projectSourceIds||[]),...(n.importProvenance||[]).map(p=>p.previousVersionNodeId).filter(Boolean)];
  const parents=n.kind==='vault'?lineage:[...lineage,...(n.sources||[]).map(p=>p.id)];
  const result=new Set();for(const p of parents)for(const root of roots(p,new Set(seen)))result.add(root);
  if(!result.size&&!parents.length)result.add(n.id);memo.set(id,result);return result;
 };
 for(const n of nodes){if(n.mergedInto||n.classificationNeedsReview||!n.classification||n.classification.sourceHash&&n.hash&&n.classification.sourceHash!==n.hash)continue;
  for(const tag of n.classification.tags||[]){const key=normal(tag.name);if(!key||!tag.quote?.trim()||!tag.reason?.trim())continue;
   if(typeof n.body==='string'&&!n.body.includes(tag.quote))continue;
   if(!groups.has(key))groups.set(key,{id:'recurring-tag:'+key,name:tag.name.trim(),basis:'repeated-tag-project',sourceIds:new Set(),nodeIds:new Set()});
   const g=groups.get(key);g.nodeIds.add(n.id);for(const id of roots(n.id))g.sourceIds.add(id);
  }
 }
 return [...groups.values()].filter(g=>g.sourceIds.size>=3).map(g=>({...g,sourceCount:g.sourceIds.size,sourceIds:[...g.sourceIds],nodeIds:[...g.nodeIds],status:g.sourceIds.size>=5?'promoted':'candidate'}));
}
export function organizeProjectKnowledge(state){
 const recurring=recurringTagProjects(state.nodes),membership=new Map();
 for(const g of recurring.filter(g=>g.status==='promoted'))for(const id of new Set([...g.nodeIds,...g.sourceIds])){if(!membership.has(id))membership.set(id,[]);membership.get(id).push({id:g.id,name:g.name,basis:g.basis,sourceCount:g.sourceCount});}
 const byId=new Map(state.nodes.map(n=>[n.id,n]));
 const nodes=state.nodes.map(n=>({...n,projectMembershipNeedsReview:n.classification?.projectMembershipAnalysis?.method==='semantic-project-content'&&(n.classification.projectMembershipAnalysis.sourceHash!==n.hash||(n.classification.projectMemberships||[]).some(p=>(p.grounds||[]).some(g=>[g.subject,g.project].some(e=>!e?.nodeId||byId.get(e.nodeId)?.hash!==e.sourceHash)))),autoProjectMemberships:Array.isArray(n.classification?.projectMemberships)?[]:membership.get(n.id)||[]}));
 const groups=projectGroups(nodes,state.jobs||[]),scopes=projectScopesFor(nodes,groups);
 const scoped=nodes.map(n=>({...n,projectScopes:scopes.get(n.id)||[],projectOrganization:true,...(n.kind==='knowledge'?{knowledgeProjectOrganization:true}:{})}));return {...state,recurringProjects:recurring,projectGroups:groups,nodes:state.semanticNavigation?.version===1?attachSemanticNavigation(scoped,state.semanticNavigation):scoped};
}
export function knowledgeProjectBuckets(nodes){const buckets=new Map();for(const n of nodes.filter(n=>n.kind==='knowledge'&&!n.mergedInto))for(const h of nodeTagHierarchy({...n,knowledgeProjectOrganization:true})){const key=h.key||h.primary;if(!buckets.has(key))buckets.set(key,{key,name:h.primary,projectId:h.projectId||null,kind:h.kind,nodes:[],topics:new Set()});const b=buckets.get(key);b.nodes.push(n);for(const t of h.secondary)b.topics.add(t);}return [...buckets.values()].map(b=>({...b,count:b.nodes.length,topics:[...b.topics].sort()})).sort((a,b)=>a.kind==='unassigned'?1:b.kind==='unassigned'?-1:a.name.localeCompare(b.name));}
export function knowledgeTopicNames(node){return [...new Set([...themeHierarchy(node).flatMap(t=>[t.primary,...t.secondary]),...(node.categories||[])])].filter(Boolean);}
