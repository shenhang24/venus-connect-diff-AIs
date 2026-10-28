import {paintFixedTaskProgress} from '/workspace-controls.js';
import {executionReviewCardHTML,classificationPlaceholder} from '/execution-review-card.js';
import {LibraryRefreshPolicy} from '/workspace-controls.js';
import {createNavigationHistory,installDismissNavigation} from '/workspace-controls.js';
import {explicitProjects,projectLayerRelations,buildSemanticNavigation,navContents,NAV_UNASSIGNED_PROJECT,organizeProjectKnowledge,knowledgeProjectBuckets,knowledgeTopicNames,projectKey,UNASSIGNED_PROJECT} from '/taxonomy.js';
import {initWorkspaceControls} from '/workspace-controls.js';
import { tr, initializeLanguage, uiLocale, uiError, heatText } from '/i18n.js';
async function renderLayerControls(host,sourceId,helpers){try{const module=await import('/layer-controls.js');return module.renderLayerControls(host,sourceId,{...helpers,api:(route,data)=>helpers.api(route,route==='layers/start'&&pendingLayerProvider?{...data,connection:pendingLayerProvider}:data)});}catch{if(host?.isConnected)host.textContent=tr('四层处理入口将在安全加载新版后台后可用。');}}
let networkAnimationPaused=false;
document.querySelector('#focus-view').onclick=()=>{const active=document.body.classList.toggle('focus-view');document.querySelector('#focus-view').setAttribute('aria-pressed',String(active));};
let layerSourceId=null;
let pendingLayerProvider=null;
await initializeLanguage();
import { marked } from "/vendor/marked.js";
import { Network, shortNodeLabel, createRelationVisibility, relationDisplayTypes, nodeTagHierarchy, matchesMainTag, networkActivityHeat, NETWORK_HEAT_LEVELS } from "/graph.js";
const relationVisibility=createRelationVisibility(globalThis.localStorage);
import { knowledgeForSource, knowledgeInScope, knowledgeListPage, chooseKnowledgeSource, knowledgeStatus, taskPresentation, activityState, fileStageProgress, InlineDrafts, saveInlineDraft, linkedNeighbours, installButtonFeedback, runButtonAction, currentButtonAction, actionResult, SavedProgressObserver, processingState, acceptExecutionSnapshot, conceptRecheckMessage, collectProcessingEvidence, tokenUsagePresentation } from "/knowledge-view.js";
installButtonFeedback(document);
const savedProgressObserver=new SavedProgressObserver();
let processingObservation=null,stateReadAt=null,refreshInFlight=null,stateReadError=null;
const libraryRefreshPolicy=new LibraryRefreshPolicy({minInterval:0});
let processingEvidence={},processingEvidenceStamp='',processingEvidenceNextRead=0;
let tokenUsage=null,tokenUsageNextRead=0;
let libraryRoute={domainId:null,projectId:null,nodeId:null,query:'',topic:null,page:0};
const conceptEditing=new Set();
let knowledgeSource=null,knowledgeQuery='',knowledgePage=0,knowledgeTopic='';
const inlineDrafts=new InlineDrafts();
let navigationContext=null;
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uiPath=value=>String(value||'').replace(/^(知识点|技能|概念云)\//,(_,folder)=>tr({'知识点':'AI 知识点','技能':'AI 技能','概念云':'概念云'}[folder])+'/');
let state = {
    nodes: [],
    relations: [],
    types: [],
    jobs: [],
    positions: {},
    settings: {},
  },
  view = (["vault","knowledge","skill","concept","vault-network","knowledge-network","skill-network","concept-network"].includes(new URLSearchParams(location.search).get("view"))?new URLSearchParams(location.search).get("view"):"vault"),
  vaultId = null,
  chosen = null,
  graph = null,
  hidden = relationVisibility.hiddenFor([]),
  submitAction = null,
  selectedEdge = null,
  benchmark = false;
const labels = {
  vault: tr("Vault 原始资料"),
  knowledge: tr("AI 知识点"),
  skill: tr("AI 技能"),
  concept:tr('概念云'),
  "vault-network": tr("Vault 网络"),
  "knowledge-network": tr("AI 知识网络"),
  "skill-network": tr("AI 技能网络"),
  "concept-network":tr('概念网络'),
  journal:tr('日志 / 更新日志'),
};
const contentPurposes={vault:tr('保存任意来源的原始 Markdown，保留原文。'),knowledge:tr('供 AI 检索、衔接上下文与回答；不覆盖当前指示。'),skill:tr('记录已认可方法、适用范围与限制；区分未确认建议，不代替当前授权。'),concept:tr('帮助人理解交流中真正获得的认识；未确认问题单独记录，可忽略。')};
const mainTagSelections={};
function mainTagsHTML(node){const tags=nodeTagHierarchy(node);return tags.length?'<div class="main-tags"><strong>'+tr('主分类')+'</strong> '+tags.map(tag=>'<button class="category-chip" data-main-tag="'+esc(tag.key||tag.primary)+'" data-main-kind="'+node.kind+'">'+esc(tag.kind==='project'?tag.primary:tr(tag.primary))+'</button>'+tag.secondary.map(sub=>'<button class="category-chip subcategory" data-main-tag="'+esc((tag.key||tag.primary)+'::'+sub)+'" data-main-kind="'+node.kind+'">'+esc(sub)+'</button>').join('')).join('')+'</div>':'';}
function taxonomyFiltersHTML(kind){const tags=new Map();for(const n of state.nodes.filter(n=>n.kind===kind))for(const t of nodeTagHierarchy(n)){const key=t.key||t.primary;if(!tags.has(key))tags.set(key,{label:t.primary,kind:t.kind,children:new Set()});for(const sub of t.secondary)tags.get(key).children.add(sub);}const selected=mainTagSelections[kind]||'',primary=selected.split('::')[0];return '<h4>'+tr('主分类')+'</h4><div class="main-tags"><button class="category-chip" data-main-tag="">'+tr('全部显示')+'</button>'+[...tags].map(([key,item])=>'<button class="category-chip '+(primary===key?'selected':'')+'" data-main-tag="'+esc(key)+'">'+esc(item.kind==='project'?item.label:tr(item.label))+'</button>').join('')+'</div>'+(primary&&tags.get(primary)?.children.size?'<h4>'+tr('子分类')+'</h4><div class="main-tags">'+[...tags.get(primary).children].sort().map(sub=>'<button class="category-chip '+(selected===primary+'::'+sub?'selected':'')+'" data-main-tag="'+esc(primary+'::'+sub)+'">'+esc(sub)+'</button>').join('')+'</div>':'');}
function knowledgeProjectFilter(){return (mainTagSelections.knowledge||'').split('::')[0];}
function knowledgeOrganizationControls(){if(state.semanticNavigation?.version===1){const tree=buildSemanticNavigation(state.nodes,state.semanticNavigation,'knowledge'),selected=knowledgeProjectFilter(),topics=[...new Set(tree.nodes.flatMap(knowledgeTopicNames))].sort();return '<label class="field">'+tr('所属项目')+'<select id="knowledge-project" aria-label="'+tr('所属项目')+'"><option value="">'+tr('全部项目')+'</option>'+tree.projects.map(p=>'<option value="'+esc(projectKey(p.id))+'"'+(selected===projectKey(p.id)?' selected':'')+'>'+esc(p.name)+' · '+p.nodes.length+'</option>').join('')+'</select></label><label class="field">'+tr('跨项目主题')+'<select id="knowledge-topic" aria-label="'+tr('跨项目主题')+'"><option value="">'+tr('全部主题')+'</option>'+topics.map(t=>'<option value="'+esc(t)+'"'+(knowledgeTopic===t?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';}const all=knowledgeInScope(state.nodes),buckets=knowledgeProjectBuckets(all),selected=knowledgeProjectFilter(),topics=[...new Set(all.flatMap(knowledgeTopicNames))].sort();return '<label class="field">'+tr('所属项目')+'<select id="knowledge-project" aria-label="'+tr('所属项目')+'"><option value="">'+tr('全部项目')+'</option>'+buckets.map(b=>'<option value="'+esc(b.key)+'"'+(selected===b.key?' selected':'')+'>'+esc(b.kind==='unassigned'?tr(b.name):b.name)+' · '+b.count+'</option>').join('')+'</select></label><label class="field">'+tr('跨项目主题')+'<select id="knowledge-topic" aria-label="'+tr('跨项目主题')+'"><option value="">'+tr('全部主题')+'</option>'+topics.map(t=>'<option value="'+esc(t)+'"'+(knowledgeTopic===t?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';}
function bindKnowledgeOrganization(){const project=$('#knowledge-project'),topic=$('#knowledge-topic');if(project)project.onchange=()=>{mainTagSelections.knowledge=project.value||null;knowledgeSource=null;knowledgePage=0;chosen=null;if(view.endsWith('-network')){updateGraph();if(project.value)focusFilteredContent({mainTag:project.value});else graph.fit();renderInspector();}else render({force:true});};if(topic)topic.onchange=()=>{knowledgeTopic=topic.value;knowledgePage=0;chosen=null;if(view.endsWith('-network'))updateGraph();else render({force:true});};}
function groupProjectEntries(){const list=$('#file-list');if(!list)return;for(const group of state.projectGroups||[]){const buttons=group.members.map(m=>list.querySelector('[data-file="'+m.id+'"]')).filter(Boolean);if(!buttons.length)continue;const details=document.createElement('details');details.className='project-entry';details.open=group.members.some(m=>m.id===chosen||m.id===vaultId);details.innerHTML='<summary>'+esc(group.name)+' <small>'+group.members.length+' '+tr('份原始资料')+'</small></summary><div class="project-branches"></div>';list.insertBefore(details,buttons[0]);for(const button of buttons)details.lastElementChild.append(button);}const input=$('#list-search'),old=input?.oninput;if(input)input.oninput=event=>{old?.(event);for(const group of list.querySelectorAll('.project-entry'))group.hidden=[...group.querySelectorAll('[data-file]')].every(b=>b.hidden);};}
function bindMainTags(){
  document.querySelectorAll('[data-main-tag]').forEach(button=>button.onclick=()=>{
    const kind=button.dataset.mainKind||view.replace('-network','');
    mainTagSelections[kind]=button.dataset.mainTag||null;
    if(view!==kind+'-network')navigate(kind+'-network');
    updateGraph();if(mainTagSelections[kind])focusFilteredContent({mainTag:mainTagSelections[kind]});renderInspector();
  });
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 3300);
}
function activityHTML() {
  const task=processingState(state),count=task.count,percent=count&&count[1]>0?Math.max(0,Math.min(100,count[0]/count[1]*100)):null;
  return '<div class="task-activity '+(stateReadError?'unknown':task.mode)+'"><span>'+esc(stateReadError?tr('状态未知，显示上次结果'):task.label)+(count?' · '+count[0]+'/'+count[1]:'')+'</span>'+(percent===null?'':'<div class="task-track" role="progressbar" aria-label="'+esc(tr('已保存完成数'))+'" aria-valuemin="0" aria-valuemax="'+count[1]+'" aria-valuenow="'+count[0]+'"><i style="width:'+percent+'%;animation:none;transform:none"></i></div>')+'</div>';
}
function processingDetailsHTML(){
 const task=processingState(state),observation=processingObservation,format=value=>new Date(value).toLocaleString(uiLocale(),{timeZone:'Australia/Sydney'});
 if(stateReadError)return '<div class="processing-details" data-processing-mode="unknown"><strong>'+tr('状态读取失败；保留上次显示，不能确认新的进度')+'</strong><small>'+tr('状态读取：')+(stateReadAt?format(stateReadAt):tr('尚未取得'))+'</small></div>';
 const content='<div class="processing-details" data-processing-mode="'+task.mode+'"><strong>'+esc(task.label)+'</strong>'+(task.title?'<span>'+tr(task.nonCharacterRange?'当前作业：':'当前文件：')+esc(task.title)+'</span>':'')+(task.step?'<span>'+tr('当前步骤：')+esc(stepLabel(task.step))+'</span>':'')+(task.total!==null?'<span>'+tr('已核对落盘：')+task.offset.toLocaleString(uiLocale())+' / '+task.total.toLocaleString(uiLocale())+tr(' 字符')+'</span>':'')+(task.range?'<span>'+tr('当前分段：')+task.range[0]+'–'+task.range[1]+'</span>':task.title&&!task.nonCharacterRange?'<span>'+tr('后续起点：')+(task.nextOffset??task.offset)+' · '+tr('本段范围尚未提供')+'</span>':'')+(task.count?'<span>'+tr('已核实完成：')+task.count[0]+' / '+task.count[1]+'</span>':'')+(task.lastAction?'<small>'+tr('最后动作：')+esc(stepLabel(task.lastAction))+'</small>':'')+'<small>'+tr('最后更新：')+(task.lastUpdatedAt?format(task.lastUpdatedAt):tr('未提供'))+'</small><small>'+tr(task.nonCharacterRange?'资料库最近保存：':'最后保存：')+(task.lastSavedAt?format(task.lastSavedAt):tr('未提供'))+'</small><small>'+tr('状态读取：')+(stateReadAt?format(stateReadAt):tr('尚未取得'))+'</small><small>'+esc(observation?.lastAdvance?tr('最近落盘推进（本页面观察）：')+format(observation.lastAdvance):tr('本页面尚未观察到新增落盘进度'))+'</small>'+(task.error?'<span role="alert">'+esc(task.error)+'</span>':'')+(task.lastTaskEvent?.action==='RECOVERY_START_BLOCKED'?'<span role="alert">'+tr('最近恢复请求未启动：')+esc(task.lastTaskEvent.error?.original||task.lastTaskEvent.code)+'</span>':'')+(task.exceptions?.length?'<details><summary>'+tr('待回补异常')+' · '+task.exceptions.length+'</summary>'+task.exceptions.map(e=>'<p>'+esc(e.file)+' · '+e.start+'–'+e.end+' · '+esc(tr(e.status==='user-skipped'?'用户跳过，等待决定':e.status==='needs-user'?'需要用户决定':'等待集中回补'))+'</p>').join('')+'</details>':'')+(task.unresolvedSkips?'<small>'+tr('跳过但未完成：')+task.unresolvedSkips+'</small>':'')+'</div>';
 return content+(task.lastSavedAction?'<small>'+tr('最近保存动作：')+esc(stepLabel(task.lastSavedAction))+'</small>':'')+(task.reason?'<p>'+esc(task.reason)+'</p>':'')+(task.activities.length>1?'<div>'+task.activities.map(flow=>'<p>'+esc(flow.pipeline||flow.label)+' · '+esc(flow.title||'')+' · '+esc(stepLabel(flow.step||flow.lastAction||flow.label))+'</p>').join('')+'</div>':'')+(task.notices.length?'<details><summary>'+tr('其他流程状态')+'</summary>'+task.notices.map(flow=>'<p>'+esc(flow.pipeline||'')+' · '+esc(flow.label)+(flow.title?' · '+esc(flow.title):'')+(flow.range?' · '+flow.range[0]+'–'+flow.range[1]:'')+(flow.reason?' · '+esc(flow.reason):'')+(flow.error?' · '+esc(flow.error):'')+'</p>'+recoveryControlsHTML(flow)).join('')+'</details>':'')+recoveryControlsHTML(task);
}
function stepLabel(step){return tr(({EXECUTION_HANDOFF_WAITING_ORIGINAL_EXIT:'等待旧执行器自然退出，新版尚未接管',EXECUTION_HANDOFF_WAITING_MODEL_EXIT:'等待旧模型退出',EXECUTION_HANDOFF_LOADING_OWNED_SERVICE:'正在加载应用内执行链',EXECUTION_HANDOFF_MANAGED_STARTING:'等实际保存读回确认接管',EXECUTION_HANDOFF_MANAGED_READY:'应用内执行链已验证接管',EXECUTION_HANDOFF_BLOCKED:'交接遇到具体阻塞',CONCEPT_BACKFILL:'历史概念覆盖回补',CLASSIFYING:'主分类归纳中',BACKFILL:'自动恢复正在接续',BLOCKED:'审批或认证阻塞',STOPPED:'执行器已停止，保留断点',CONCEPT_RECHECK_FAST_PASS:'概念再次检查快速通过',CONCEPT_RECHECK_LOCAL_PASS:'概念本地核验通过',CONCEPT_RECHECK_REQUESTED:'概念再次检查已登记',SKIP_EXISTING_CHECKPOINT:'保留原有完整核对记录',SKIP_RANGE_VERIFIED:'复用已核对完整分段','/api/concept-review/recheck':'再次检查概念',LAYER_VALIDATING:'校验引用与原文',LAYER_ERROR:'发生错误',LAYER_SKIPPED:'用户跳过，保留缺口',SERVICE_LOADED:'本地服务已加载',UI_RECOVERY_LOGS_UPDATED:'界面与恢复日志更新','/api/import':'原始资料保存','/api/edit':'资料修改保存','/api/upsert':'提炼节点保存','/api/relation':'关系保存','/api/main-tags':'分类保存','/api/analysis':'队列配置保存','/api/layers/start':'独立层请求','/api/layers/control':'恢复请求','/api/concept-review/control':'恢复请求',READ_COMPARE:'原文与概念对照',MODEL_RUNNING:'模型处理',LAYER_MODEL_STARTED:'模型处理',REUSE_SAVED_RESULT:'复用本地返回结果',VALIDATING:'校验引用与原文',VALIDATION_STARTED:'校验引用与原文',CONCEPT_SAVED:'概念实际保存',SUPPLEMENT_SAVED:'补充实际保存',CONTENT_CHECK_SAVED:'本段内容核对已保存',SKIP_COMPLETE:'核对完整后跳过',RANGE_QUARANTINED:'失败段进入异常清单',CONNECTIONS_NOT_SAVED:'未建立无有效节点的关联',LAYER_SEGMENT_SAVED:'本段结果已保存',LAYER_QUEUED:'独立任务已排队',QUEUED:'排队中',SAVED:'结果已保存',ERROR:'发生错误',FAILED:'失败，等待处理',PAUSED:'已暂停',COMPLETE:'内容核对完成',STARTING:'等待执行器就绪',DOCUMENT_CHECKED:'整篇内容核对完成',RECOVERY_START_BLOCKED:'恢复启动被拦截',REVIEW_SEGMENT_SKIPPED:'用户跳过，保留缺口'})[step]||step);}
const executionActionLabels={reset:'重置任务',rerun:'重新开始',resume:'继续当前核对',pause:'保存断点后暂停',verify:'核验断点并查看方案',cancel:'取消当前任务并保留断点','inspect-failure':'查看失败位置与保留结果','verify-owner':'核验执行所有者','wait-owner':'等待原进程正常退出','restore-control-backup':'恢复已验证控制副本','defer-source':'隔离此资料并继续其余任务','retry-once':'冷却后重试一次','open-connections':'打开已有连接设置','verify-connection':'检测已有登录连接','resume-source':'恢复此隔离资料'};
function recoveryControlsHTML(task){const format=value=>new Date(value).toLocaleString(uiLocale(),{timeZone:'Australia/Sydney'});if(task.executionControls){const c=task.executionControls,availableActions=c.actions?.length?c.actions:[...(c.resume?['resume']:[]),...(c.verify?['verify']:[]),...(c.pause?['pause']:[])],actions=task.reviewCard?.sources?.some(source=>source.correction?.remaining===0)?availableActions.filter(action=>['defer-source','cancel'].includes(action)):availableActions;return '<div class="recovery-actions">'+(task.reviewCard?'<section class="issue-compact"><strong>'+esc(task.reviewCard.technical?tr('本机执行问题'):task.reviewCard.sources?.[0]?.title||'当前资料问题')+'</strong><p class="issue-brief">'+esc(task.reviewCard.why)+'</p><p class="issue-next">'+esc(task.reviewCard.automatic.status)+'</p><details class="issue-evidence"><summary>'+(task.reviewCard.technical?tr('查看故障与处理方案'):tr('展开原文与逐字比对'))+'</summary><div class="issue-evidence-scroll">'+executionReviewCardHTML(task.reviewCard)+'</div></details></section>':'')+(task.reason?'<p>'+esc(tr(task.reason))+'</p>':'')+(task.plan?'<p>'+esc(tr(task.plan))+'</p>':'')+(task.failureLocation?'<p>'+esc(task.failureLocation.path||task.failureLocation.id||'')+' '+(task.failureLocation.start??'')+'–'+(task.failureLocation.end??'')+'</p>':'')+(task.verification?'<p>'+esc(tr(task.verification.verified?'断点核验通过；已有结果保留':'断点需要按方案处理'))+'</p>':'')+(task.recovery?'<div class="recovery-status"><p>'+tr('队尾等待：')+task.recovery.pending.length+' · '+tr('服务容量失败次数：')+(task.recovery.service.failures||0)+' / 4</p>'+(task.retryAt?'<p>'+tr('下次自动重试：')+format(task.retryAt)+'</p>':'')+task.recovery.pending.slice(0,5).map(entry=>'<p>'+esc(entry.path||entry.id)+' · '+tr('已尝试：')+entry.attempts+' · '+esc(entry.reason)+(entry.nextEligibleAt?' · '+format(entry.nextEligibleAt):'')+'</p>').join('')+'</div>':'')+actions.map(action=>'<button type="button" data-execution-action="'+esc(action)+'"'+(executionActionsPending.has(action)?' disabled':'')+'>'+tr(executionActionLabels[action]||action)+(executionActionsPending.has(action)?' · 正在处理':'')+'</button>').join('')+'</div>';}const c=task.controls;if(!c||!['failed','paused','blocked'].includes(task.mode))return '';return '<div class="recovery-actions">'+(c.resume?'<button type="button" data-review-action="resume"'+(c.manualRequired?' disabled':'')+'>'+tr('继续核对')+'</button>':'')+(c.retry?'<button type="button" data-review-action="retry"'+(c.manualRequired?' disabled':'')+'>'+tr('重试失败段')+'</button>':'')+(c.skip?'<button type="button" data-review-action="skip">'+tr('跳过此失败段')+'</button>':'')+'<small>'+esc(tr(c.reason))+'</small></div>';}
async function recoveryNode(id){const response=await fetch('/api/node?id='+encodeURIComponent(id));const node=await response.json();if(!response.ok)throw Error(node.error||'资料读取失败');return node;}
function projectDecisionHTML(node){const membership=node.classification?.projectMembershipAnalysis;if(!membership||membership.decision!=='unassigned'&&membership.method!=='manual')return '';const manual=membership.method==='manual'&&!(node.classification.projectMemberships||[]).length;if(membership.method==='manual'&&!manual)return '';return '<section class="project-review-path"><h4>项目待归属</h4><p>'+esc(manual?'你已明确保留待归属；后续自动归属会保护这项选择。':membership.reason||'现有项目定义与正文尚无充分对应依据。')+'</p><p>这表示项目证据不足，不表示归纳失败。系统不会用标题或孤立词替你指定项目。</p><p>可继续保留待归属；若你明确决定暂不归属，可在此保存人工选择。</p>'+(manual?'':'<button type="button" data-retain-unassigned="'+esc(node.id)+'">明确保留这份资料待归属</button>')+'</section>';}
function sourceRecoveryContent(id){return state.execution?.reviewCard?.sources?.some(source=>source.id===id)?recoveryControlsHTML(processingState(state)):'';}
function sourceRecoveryHTML(id){return '<div data-source-recovery="'+esc(id)+'">'+sourceRecoveryContent(id)+'</div>';}
function updateExecutionSourceViews(){document.querySelectorAll('[data-classification-placeholder]').forEach(el=>el.textContent=classificationPlaceholder(state.execution));document.querySelectorAll('[data-source-recovery]').forEach(el=>el.innerHTML=sourceRecoveryContent(el.dataset.sourceRecovery));bindRecoveryActions();}
function bindRecoveryActions(){document.querySelectorAll('[data-retain-unassigned]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const node=await recoveryNode(button.dataset.retainUnassigned);await api('workspace/projects',{nodes:[{id:node.id,hash:node.hash,classificationHash:node.classificationHash}],projects:[]});const saved=await recoveryNode(node.id);if(saved.hash!==node.hash||saved.classification?.projectMembershipAnalysis?.method!=='manual'||saved.classification.projectMemberships?.length)throw Error('人工待归属读回尚未一致，未宣称成功');await refresh();toast('已保存人工待归属，原文未改，后续自动归属会保护此选择。');}catch(error){toast(uiError(error.message));}finally{button.disabled=false;}});document.querySelectorAll('[data-issue-source]').forEach(button=>button.onclick=()=>{const node=state.nodes.find(n=>n.id===button.dataset.issueSource);if(node){$('#modal-close')?.click();navigate(node.kind,node.id);}});document.querySelectorAll('[data-execution-action]').forEach(button=>button.onclick=async()=>{button.disabled=true;const action=button.dataset.executionAction;if(executionActionsPending.has(action))return;const selectedJobId=state.execution?.jobId,selectedSourceId=state.execution?.failureLocation?.id||state.execution?.failureLocation?.ids?.[0];executionActionsPending.set(action,{jobId:selectedJobId,operationId:crypto.randomUUID()});try{
 if(action==='open-connections'){await aiConnectionDialog('gpt');return;}
 if(action==='verify-connection'){const result=await api('ai-connections/detect',{family:'gpt',activeOnly:true});modal(tr('连接检测结果'),'<p>'+esc(tr(result.status))+'</p>',null);return;}
 if(action==='reset'||action==='rerun'){const rerunSourceId=chosen||vaultId||state.execution?.current?.id||state.execution?.lastSaved?.id;const operationId=executionActionsPending.get(action).operationId;modal(tr(action==='reset'?'重置任务':'重新开始'),'<p>'+tr('保留原文、已有成果、人工修改和已用预算。')+'</p>'+(action==='rerun'?'<label>处理范围<select name="scope"><option value="selected">当前资料</option><option value="all">全部资料</option></select></label>':''),async form=>{const sourceId=rerunSourceId;await api('execution/control',{action,jobId:selectedJobId,operationId,scope:form.get('scope')||'selected',sourceIds:sourceId?[sourceId]:[]});await refresh();},tr(action==='reset'?'重置任务':'重新开始'));return;}
 if(action==='defer-source'){modal(tr('隔离此资料并继续其余任务'),'<p>'+tr('保留原文和返回；此资料仍未完成，不计入完成总数。')+'</p><label class="field">'+tr('补充说明（可选）')+'<input name="reason" maxlength="400" placeholder="补充说明（可选）；系统已记录具体失败原因"></label>',async form=>{await api('execution/control',{action,jobId:selectedJobId,sourceId:selectedSourceId,reason:form.get('reason'),operationId:executionActionsPending.get(action)?.operationId||crypto.randomUUID()});await refresh();});return;}
 const result=await api('execution/control',{action,jobId:selectedJobId,operationId:executionActionsPending.get(action)?.operationId||crypto.randomUUID()});
 if(result.failure){modal(tr('查看失败位置与保留结果'),executionReviewCardHTML(result.failure.card),null);}
 else toast(result.verification?tr(result.verification.verified?'断点核验通过；已有结果保留':'断点需要按方案处理'):result.reason?tr(result.reason):tr(result.accepted?'请求已登记；以真实执行状态为准':'请求未执行；请查看具体原因'));
 await refresh();}catch(error){toast(uiError(error.message));}finally{executionActionsPending.delete(action);button.disabled=false;}});document.querySelectorAll('[data-review-action]').forEach(button=>button.onclick=async()=>{const action=button.dataset.reviewAction;if(action==='skip'){modal(tr('跳过此失败段'),'<p>'+tr('保留原文、断点和缺口；跳过不算内容完整。')+'</p><label class="field">'+tr('跳过原因')+'<input name="reason" required maxlength="200"></label>',async form=>{const result=await api('concept-review/control',{action,reason:form.get('reason')});toast(tr(result.skipped?'已记录跳过，仍未完成':'请求已返回，状态已确认'));});return;}const r=await api('concept-review/control',{action});toast(tr(r.manualRequired?r.message:'请求已接受，等待实际状态'));});}
let journalDay='',journalRows=[],journalNext=null;
function conceptRecheckDialog(){
 const sources=state.nodes.filter(n=>n.kind==='vault'&&!n.mergedInto);
 modal(tr('再次检查概念'),'<p>'+tr('只检查本地源指纹与提取覆盖。已处理且无缺口时跳过；仅缺失、新增或变化范围进入提取，不语义复审。')+'</p><label class="field">'+tr('选择资料')+'<select id="recheck-source">'+sources.map(n=>'<option value="'+esc(n.id)+'"'+(n.id===vaultId?' selected':'')+'>'+esc(n.title)+'</option>').join('')+'</select></label><button type="button" id="recheck-now">'+tr('再次检查概念')+'</button><p id="recheck-result" role="status"></p>',null);
 $('#recheck-now').onclick=async()=>{const result=await api('concept-review/recheck',{sourceId:$('#recheck-source').value});$('#recheck-result').textContent=conceptRecheckMessage(result);};
}
async function renderJournal({older=false}={}){
 if(!older){$('#main').innerHTML='<section class="journal-page"><h1>'+tr('日志 / 更新日志')+'</h1><p class="subtle">'+tr('仅显示实际记录的事件；未记录的历史不会补造。')+'</p><div class="actions"><input type="date" id="journal-day" aria-label="'+tr('日志日期')+'" value="'+esc(journalDay)+'"><button type="button" id="journal-refresh">'+tr('刷新日志')+'</button></div><div id="journal-events" role="status">'+tr('正在读取日志…')+'</div><button id="journal-older" hidden>'+tr('读取更早记录')+'</button></section>';$('#inspector').innerHTML='<h3>'+tr('任务回报边界')+'</h3><p>'+tr('失败立即写入本地事件与当前任务记录。其他任务须读取记录；没有主动跨任务推送。')+'</p>';$('#journal-refresh').onclick=()=>renderJournal();$('#journal-day').onchange=e=>{journalDay=e.target.value;renderJournal();};}
 try{const r=await fetch('/api/journal?'+new URLSearchParams({day:journalDay,...(older&&journalNext?{before:journalNext}:{})}));if(!r.ok)throw Error(tr('日志读取失败'));const data=await r.json();if(view!=='journal')return;journalDay=data.day;$('#journal-day').value=journalDay;journalRows=older?[...journalRows,...data.items]:data.items;journalNext=data.next;const rows=[...new Map(journalRows.map(e=>[e.id,e])).values()];$('#journal-events').innerHTML=rows.length?rows.map(e=>'<article class="journal-event" data-event-status="'+esc(e.status)+'"><time>'+esc(new Date(e.time).toLocaleString(uiLocale(),{timeZone:'Australia/Sydney'}))+'</time><strong>'+esc(stepLabel(e.action))+'</strong><span>'+esc(tr(({failed:'失败',queued:'排队中',working:'正在处理',done:'已保存',review:'失败，需核对',paused:'已暂停',ready:'已就绪',saved:'已保存',running:'正在处理',accepted:'已受理',skipped:'已跳过，未完成','not-started':'未启动','verified-skip':'完整，已跳过'})[e.status]||e.status))+'</span>'+(e.file?'<p>'+esc(e.file)+(e.index?' · '+e.index:'')+'</p>':'')+(Number.isFinite(e.start)?'<p>'+tr('当前分段：')+e.start+'–'+e.end+'</p>':'')+(Number.isFinite(e.offset)?'<p>'+tr('已核对落盘：')+e.offset+'</p>':'')+(e.savedCount!==undefined?'<p>'+tr('实际保存节点数：')+e.savedCount+'</p>':'')+(e.error?'<details><summary>'+tr('原始错误与处置')+'</summary><p>'+esc(e.error.original)+'</p><p>'+esc(e.error.disposition)+'</p></details>':'')+(e.reason?'<p>'+tr('原因：')+esc(e.reason)+'</p>':'')+(e.files?'<p>'+e.files.map(esc).join(' · ')+'</p>':'')+'</article>').join(''):'<p>'+tr('这一天没有已记录的历史。')+'</p>';$('#journal-older').hidden=!journalNext;$('#journal-older').onclick=()=>renderJournal({older:true});}catch(error){if($('#journal-events'))$('#journal-events').textContent=error.message;throw error;}
}
function paintProcessingStatus(){
 if($('#job-summary'))$('#job-summary').innerHTML=processingDetailsHTML();
 if($('#sidebar-activity'))$('#sidebar-activity').innerHTML=activityHTML();
 if($('#processing-overview'))$('#processing-overview').innerHTML=processingDetailsHTML();
 if($('#graph-task-summary'))$('#graph-task-summary').textContent=taskSummaryText();
 if($('#graph-activity'))$('#graph-activity').innerHTML=compactSlotsHTML();
 if($('#graph-token-usage'))$('#graph-token-usage').innerHTML=tokenUsageHTML();
 bindRecoveryActions();
 bindTaskDetails();
}
function compactSlotsHTML() {
  const task=processingState(state);
  const active=task.activities.map(file=>'<button type="button" class="slot-summary" data-task-detail><span class="slot-title">'+esc(file.pipeline)+' · '+esc(file.title||file.label)+'</span><span class="slot-stage">'+esc(stepLabel(file.step||file.lastAction||file.label))+'</span><span class="slot-characters">'+(file.offset||0).toLocaleString(uiLocale())+' / '+(file.total??0).toLocaleString(uiLocale())+'</span></button>').join('')||'<span class="slot-idle">'+esc(task.label)+(task.reason?' · '+esc(task.reason):'')+'</span>';
  return active+(task.exceptions.length||task.notices.some(f=>['failed','blocked','paused'].includes(f.mode))?'<button type="button" data-task-detail>'+tr('查看原因与进度')+(task.exceptions.length?' · '+task.exceptions.length:'')+'</button>':'')+recoveryControlsHTML(task);
}
function bindTaskDetails() { document.querySelectorAll('[data-task-detail]').forEach(button=>button.onclick=jobsDialog); }
function taskSummaryText() {
  if(stateReadError)return tr('状态未知，显示上次结果');
  const task=processingState(state);return task.label+(task.step?' · '+stepLabel(task.step):'')+(task.count?' · '+task.count[0]+'/'+task.count[1]:'')+(task.title?' · '+task.title:'')+' · '+tokenUsagePresentation(tokenUsage).headline+' · '+(tokenUsagePresentation(tokenUsage).rateHeadline||tr('均速：暂未返回'));
}
function tokenUsageHTML(){
 const p=tokenUsagePresentation(tokenUsage),number=n=>n===null||n===undefined?tr('暂未返回'):n.toLocaleString(uiLocale()),time=t=>new Date(t).toLocaleString(uiLocale(),{timeZone:'Australia/Sydney'});
 const groups=p.groups.map(g=>'<section><strong>'+esc(g.family)+' / '+esc(g.provider)+' · '+esc(g.model)+'</strong><small>'+tr('输入 / 输出 / 缓存输入子集：')+[g.counts.input,g.counts.output,g.counts.cached].map(number).join(' / ')+'</small><small>'+tr('已返回 / 待回执 / 无用量回执：')+g.returned+' / '+g.pending+' / '+g.unavailable+'</small>'+(g.interrupted?'<small>'+tr('已中断，消耗未知：')+g.interrupted+'</small>':'')+'<small>'+tr('字段回执数（输入/输出/缓存/总量）：')+[g.coverage.input,g.coverage.output,g.coverage.cached,g.coverage.total].join('/')+'</small>'+(g.latest?'<small>'+tr('最近请求平均输出 token/秒：')+(g.latest.averageOutputPerSecond===null?tr('暂未返回'):g.latest.averageOutputPerSecond.toFixed(2))+'</small><small>'+esc(time(g.latest.startedAt))+' → '+esc(time(g.latest.endedAt))+'</small><small>'+tr(g.latest.usage.outputScope==='generated-responses-excludes-thoughts'?'此提供方输出不含单列思考 token。':'输出按提供方口径；思考 token 为输出子集。')+'</small>':'<small>'+tr('token/秒：暂未返回，未估算。')+'</small>')+(g.modelSource==='configured'?'<small>'+tr('模型名来自配置；回执未确认时不声称已解析型号。')+'</small>':'')+'</section>');
 for(const [id,label]of [['gpt','GPT'],['claude','Claude'],['gemini','Gemini'],['local',tr('本地 AI')]])if(!p.groups.some(g=>g.family===id))groups.push('<small>'+label+' · '+tr('无用量数据；未接入或尚未返回回执。')+'</small>');
 const configured=(p.currentModels||[]).map(g=>'<small>'+tr('当前配置模型：')+esc(g.family)+' / '+esc(g.model)+' · '+tr('配置来源，未作为提供方型号确认')+'</small>').join('');
 return '<div class="token-usage">'+configured+'<strong>'+esc(p.headline)+'</strong><small>'+esc(p.note)+'</small>'+(p.enabledAt?'<small>'+tr('采集启用：')+esc(time(p.enabledAt))+'</small>':'')+'<small>'+tr('以下为历史用量回执，含旧模型：')+'</small>'+groups.join('')+'<small>'+tr('结束回执速率为单个请求端到端平均值，包含排队和传输；不相加为并发吞吐，不作实时速率。')+'</small></div>';
}
function stageProgressHTML(sourceId) {
  const stage=fileStageProgress(state.analysis,sourceId);
  const total=stage.total||0,percent=total?stage.completed/total*100:0;
  return '<div class="stage-progress"><small>'+esc(stage.label)+'</small><div class="segment-track" role="progressbar" aria-label="'+esc(tr('MD 分段进度'))+'" aria-valuemin="0" '+(total?'aria-valuemax="'+total+'" aria-valuenow="'+stage.completed+'"':'')+' aria-valuetext="'+esc(stage.label)+'"><i style="width:'+percent+'%"></i></div></div>';
}
function activeFilesHTML() {
  return (state.analysis?.activeFiles || []).map(file => {
    const progress=state.analysis.fileProgress?.[file.sourceId];
    return '<div class="job"><strong title="'+esc(file.title)+'">' + tr('槽位 ') + file.slot + ' · ' + esc(file.title) + '</strong><small>' +
      tr(file.taskKind==='concept-only'?'仅补历史概念，不重跑 AI 知识点或 AI 技能':state.features?.concepts?'分段联合分析：知识、关系、分类、技能与概念':'分段联合分析：知识、关系、分类与技能') + '<br>' +
      tr('本段字符范围：') + file.offset + '–' + file.end + '<br>' +
      (progress?.parts || 0) + tr(' 段已保存 · ') + (progress?.offset || 0) + ' / ' + file.total + tr(' 字符已落盘') + '</small>'+stageProgressHTML(file.sourceId)+'</div>';
  }).join('');
}
async function api(route, data) {
  const context=currentButtonAction();
  try{
  const r = await fetch("/api/" + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw Error(uiError(j.error));
  actionResult(context,{message:tr(j.accepted?'请求已接受，等待实际状态':j.queued||j.progress?.status==='queued'?'已排队，尚未完成':j.indexed?'索引已建立，可搜索':'请求已返回，状态已确认')});
  await refresh({progressOnly:true});
  return j;
  }catch(error){actionResult(context,{error:error.message});throw error;}
}
const bodyCache = new Map(), readingPages = new Map();
let renderGeneration = 0;
let taskEventConnection='connected';
let taskControlPending=false;const executionActionsPending=new Map();let executionFailureKey='',executionFailureCard=null;
function taskControlMessage(control){
  if(control?.execution?.enabled&&control.execution.phase==='cancelled')return '任务已取消，已保存结果和断点保留';
  if(control?.execution?.enabled&&['blocked','storage-blocked','owner-unverified','scheduler-conflict','model-still-running'].includes(control.execution.phase))return '当前任务遇到具体阻塞，请查看下方原文、原因与处理按钮';
  if(control?.execution?.enabled&&control.execution.phase==='waiting-recovery')return '正在按已保存预算等待恢复';
  if(control?.execution?.enabled&&control.execution.phase==='complete')return tr('当前队列已完成');
  return tr(control?.externalControlRequired?'独立执行器仍在退出，尚未完全暂停':({enabled:'任务已启用，按保存断点继续',pausing:'正在暂停，等待当前请求退出',paused:'任务已完全暂停，已保存断点保留',stopped:'任务未启用，已保存断点保留',unavailable:'任务控制将在后台下次正常启动后可用'})[control?.phase]||'任务控制将在后台下次正常启动后可用');
}
function paintTaskControls(){
  paintFixedTaskProgress(document.querySelector('#fixed-task-progress'),state.taskControl,taskEventConnection);
  const c=state.taskControl,message=taskControlMessage(c),start=$('#ribbon-task-start'),pause=$('#ribbon-task-pause'),status=$('#ribbon-task-status');
  if(!start||!pause)return;
  start.disabled=taskControlPending||!c?.available||c?.phase==='pausing';pause.disabled=taskControlPending||!c?.canPause;
  start.title=tr('更新同步／断点继续')+' · '+message;start.setAttribute('aria-label',tr('更新同步／断点继续'));pause.title=tr('完全暂停任务')+' · '+message;
  pause.setAttribute('aria-pressed',String(c?.phase==='paused'));status.textContent=message;status.title=message;status.dataset.phase=c?.phase||'unavailable';
}
async function controlTasks(action){
  if(taskControlPending)return;taskControlPending=true;paintTaskControls();const context=currentButtonAction();
  try{
    const response=await fetch('/api/tasks/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
    const result=await response.json();if(!response.ok)throw Error(response.status===404?tr('任务控制将在后台下次正常启动后可用'):uiError(result.error));
    state.taskControl=result;const message=taskControlMessage(result);actionResult(context,{message});toast(message);await refresh();
  }catch(error){actionResult(context,{error:error.message});toast(error.message);}
  finally{taskControlPending=false;paintTaskControls();}
}
async function loadBody(node) {
  const cached = bodyCache.get(node.id);
  if (cached?.hash === node.hash) { node.body = cached.body; return; }
  const response = await fetch('/api/node?id=' + encodeURIComponent(node.id));
  if (!response.ok) throw new Error(tr('正文加载失败'));
  const detail = await response.json();
  Object.assign(node, detail);
  bodyCache.delete(node.id);
  bodyCache.set(node.id, {hash:node.hash, body:node.body});
  while (bodyCache.size > 3) bodyCache.delete(bodyCache.keys().next().value);
}
async function refresh({progressOnly=false}={}) {
  if(!progressOnly)libraryRefreshPolicy.invalidate();
  if(refreshInFlight)return refreshInFlight.then(()=>libraryRefreshPolicy.urgent?refresh({progressOnly:true}):undefined);
  refreshInFlight=refreshState().catch(error=>{stateReadError=error.message;paintProcessingStatus();throw error;}).finally(()=>{refreshInFlight=null;});return refreshInFlight;
}
async function refreshState() {
  const ticket=libraryRefreshPolicy.begin();let next;
  if(ticket){try{const r=await fetch('/api/state?summary=1');if(!r.ok)throw Error(tr('无法读取本机资料'));next=organizeProjectKnowledge(await r.json());next.nodes=next.nodes.map(n=>({...n,heat:networkActivityHeat(n.heat)}));libraryRefreshPolicy.commit(ticket,next.revision);}catch(error){libraryRefreshPolicy.fail();throw error;}}
  else next={...state};
  const evidenceStamp=[next.revision,next.conceptContentReview?.lastUpdatedAt].join(':');
  if(evidenceStamp!==processingEvidenceStamp||Date.now()>=processingEvidenceNextRead){processingEvidenceNextRead=Date.now()+5000;try{const jr=await fetch('/api/journal?limit=100');if(jr.ok){processingEvidence=collectProcessingEvidence((await jr.json()).items,processingEvidence);processingEvidenceStamp=evidenceStamp;}}catch{}}
  next.processingEvidence=processingEvidence;
  try{const taskResponse=await fetch('/api/tasks/status');if(!taskResponse.ok)throw Error('Task status unavailable');next.taskControl=await taskResponse.json();next.execution=acceptExecutionSnapshot(state.execution,next.taskControl.execution);const key=next.execution?.error?JSON.stringify([next.execution.jobId,next.execution.runId,next.execution.error]):'';if(key&&key!==executionFailureKey){const response=await fetch('/api/execution/failure');if(response.ok){executionFailureCard=(await response.json()).card;executionFailureKey=key;}}if(!key){executionFailureKey='';executionFailureCard=null;}if(executionFailureCard)next.execution={...next.execution,reviewCard:executionFailureCard};if(!next.execution?.enabled&&(next.analysis?.running||next.independentLayers?.active?.length))libraryRefreshPolicy.invalidate({urgent:false});}catch(error){stateReadError=error.message;throw error;}
  if(next.conceptContentReview?.workerRunning){try{const response=await fetch('/api/concept-review/status');if(response.ok)next.conceptContentReview=await response.json();}catch{}}
  if(Date.now()>=tokenUsageNextRead){tokenUsageNextRead=Date.now()+5000;try{const u=await fetch('/api/token-usage');if(u.ok)tokenUsage=await u.json();else{tokenUsage={unavailableReason:u.status===404?'collector-not-loaded':'usage-unavailable'};tokenUsageNextRead=Date.now()+60000;}}catch{tokenUsage={unavailableReason:'usage-unavailable'};}}
  stateReadError=null;stateReadAt=Date.now();const observedTask=processingState(next);processingObservation=savedProgressObserver.observe(observedTask.key,observedTask.offset,stateReadAt,observedTask.lastSavedAt);
  if (next.revision === state.revision && next.semanticNavigation?.revision === state.semanticNavigation?.revision) {state=next;updateExecutionSourceViews();paintTaskControls();paintProcessingStatus();return;}
  state = next;updateExecutionSourceViews();
  paintTaskControls();
  hidden=relationVisibility.hiddenFor(state.types);
  if (selectedEdge)
    selectedEdge =
      state.relations.find((r) => r.id === selectedEdge.id) || null;
  if (!vaultId || !state.nodes.some((n) => n.id === vaultId))
    vaultId = state.nodes.find((n) => n.kind === "vault" && !n.mergedInto)?.id;
  const mergedSelection=state.nodes.find(n=>n.id===vaultId)?.mergedInto;
  if(mergedSelection)vaultId=mergedSelection;
  for (const k of ["vault", "knowledge", "skill", "concept"])
    $("#" + k + "-count").textContent = state.nodes.filter(
      (n) => n.kind === k && !n.mergedInto,
    ).length;
  const j =
    state.jobs.find((j) => j.status === "working") ||
    state.jobs.find((j) => j.status === "queued");
  const task = taskPresentation(state);
  $("#job-summary").textContent = [task.status, task.progress, task.problem].filter(Boolean).join('\n');
  if(state.independentLayers?.active.length){const work=state.independentLayers.active[0],title=state.nodes.find(n=>n.id===work.sourceId)?.title||work.sourceId;$('#job-summary').textContent=tr('独立任务正在处理')+' · '+tr(({knowledge:'AI 知识点',skill:'AI 技能',concept:'概念云'})[work.layer])+'\n'+title+'\n'+work.offset+' / '+work.total;}
  else if(state.conceptContentReview?.current){const review=state.conceptContentReview;$('#job-summary').textContent=tr(review.workerRunning?'概念内容核对正在处理':review.status==='needs-review'?'概念内容核对需复核':'概念内容核对已暂停')+'\n'+review.current.title+'\n'+review.completed+' / '+review.total+' · '+review.current.offset+' / '+review.current.total;}
  $("#job-summary").title = task.stage;
  if ($('#sidebar-activity')) $('#sidebar-activity').innerHTML = activityHTML();
  else $('#job-summary').insertAdjacentHTML('afterend', '<div id="sidebar-activity">'+activityHTML()+'</div>');
  if ($('#graph-activity')) { $('#graph-activity').innerHTML = compactSlotsHTML(); bindTaskDetails(); }
  if ($('#graph-task-summary')) $('#graph-task-summary').textContent = taskSummaryText();
  paintProcessingStatus();
  if (graph && !benchmark) {
    updateGraph();
    renderInspector();
  } else if (!benchmark) render();
  if (
    $("#modal").open &&
    $("#modal-title").textContent === tr("自动处理进度")
  )
    jobsDialog();
  $("#footer-status").textContent =
    "Venus " + (state.version || '') + tr(" · 本机已保存 · 修订 ") +
    state.revision +
    tr(" · 状态读取：") +
    new Date().toLocaleTimeString(uiLocale(), { timeZone: "Australia/Sydney" });
}
function safeMarkdown(body) {
  const renderer = new marked.Renderer();
  renderer.html = () => "";
  renderer.link = ({ href, text }) => {
    if (href?.startsWith("venus:"))
      return (
        '<a href="#" data-node="' +
        esc(href.slice(6)) +
        '">' +
        esc(text) +
        "</a>"
      );
    if (!/^(https?:|mailto:)/i.test(href || "")) return esc(text);
    return (
      '<a target="_blank" rel="noopener noreferrer" href="' +
      esc(href) +
      '">' +
      esc(text) +
      "</a>"
    );
  };
  renderer.image = () => tr('<span class="dim">[外部图片未自动加载]</span>');
  return marked.parse(body, { renderer, breaks: false });
}
const viewHistory=createNavigationHistory();
function rememberView(){viewHistory.push({libraryRoute:{...libraryRoute},view,chosen,vaultId,knowledgeSource,knowledgeQuery,knowledgePage,knowledgeTopic,mainTags:{...mainTagSelections}});}
function backView(){const previous=viewHistory.pop();if(!previous){if(graph?.selected){graph.fit();return true;}return false;}libraryRoute=previous.libraryRoute||{domainId:null,projectId:null,nodeId:previous.chosen,query:"",page:0};view=previous.view;chosen=previous.chosen;vaultId=previous.vaultId;knowledgeSource=previous.knowledgeSource;knowledgeQuery=previous.knowledgeQuery;knowledgePage=previous.knowledgePage;knowledgeTopic=previous.knowledgeTopic;for(const k of Object.keys(mainTagSelections))delete mainTagSelections[k];Object.assign(mainTagSelections,previous.mainTags);selectedEdge=null;benchmark=false;if(graph){graph.dispose();graph=null;}render({force:true});return true;}
installDismissNavigation(document,{back:backView});
function navigate(v, id) {
  libraryRoute={domainId:null,projectId:null,nodeId:state.nodes.find(n=>n.id===id)?.kind===v?id:null,query:"",topic:null,page:0};
  if(v!==view||(id&&id!==chosen))rememberView();
  if (v === 'knowledge' && !id) {
    knowledgeSource=null;knowledgeQuery='';knowledgePage=0;
  }
  if (id) {
    const n = state.nodes.find((n) => n.id === id);
    if (n?.kind === "vault") {vaultId = id;if(v==='knowledge')knowledgeSource=id;}
    if (n?.kind === "knowledge") {
      const source = n.sources.find(
        (s) => state.nodes.find((x) => x.id === s.id)?.kind === "vault",
      );
      if (source) vaultId = source.id;
    }
    chosen = id;
  } else chosen = null;
  view = v;
  selectedEdge = null;
  benchmark = false;
  if (graph) {
    graph.dispose();
    graph = null;
  }
  render();
}
function bindNodes(root = document) {
  root.querySelectorAll("[data-node]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        const n = state.nodes.find((n) => n.id === b.dataset.node);
        if (n) navigate(n.kind, n.id);
      }),
  );
}
function relevant() {
  if (view === 'knowledge') return knowledgeInScope(state.nodes, knowledgeSource).filter(n => matchesCategories(n, view)&&matchesMainTag(n,mainTagSelections.knowledge)&&(!knowledgeTopic||knowledgeTopicNames(n).includes(knowledgeTopic)));
  const sourceIds=new Set([vaultId,...(state.nodes.find(n=>n.id===vaultId)?.mergedFrom||[])]);
  const nodes = state.nodes.filter(
    (n) =>
      n.kind === view && (!n.mergedInto || n.id===chosen) &&
      (view !== "knowledge" || n.sources.some((s) => sourceIds.has(s.id))),
  );
  return nodes.filter((n) => matchesCategories(n, view));
}
function current() {
  const ns = relevant();
  return (
    ns.find((n) => n.id === chosen) ||
    (view === "vault" ? ns.find((n) => n.id === vaultId) : undefined) ||
    ns[0]
  );
}
function renderLibraryDirectory(){
 const tree=buildSemanticNavigation(state.nodes,state.semanticNavigation,view),route=libraryRoute,domain=tree.domains.find(d=>d.id===route.domainId),project=tree.projects.find(p=>p.id===route.projectId),page=navContents(tree,route);
 const button=(attr,id,title,detail='')=>'<button class="nav-card" '+attr+'="'+esc(id)+'"><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></button>';
 let content='';if(!domain&&!project)content=tree.domains.map(d=>button('data-domain',d.id,d.name,d.nodes.length+' 份 · '+d.projectIds.length+' 个项目')).join('');
 else if(!route.projectId)content=(domain?.projectIds||[]).map(id=>{const p=tree.projects.find(p=>p.id===id);return button('data-project',id,p.name,p.nodes.length+' 份 · '+p.domainIds.length+' 个大标签共享引用');}).join('')+(domain?.unassigned.length?button('data-project',NAV_UNASSIGNED_PROJECT,'尚未归属项目',domain.unassigned.length+' 份；保留原归属状态'):'');
 else content='<label>查找内容<input id="nav-search" value="'+esc(route.query)+'"></label><div class="main-tags">'+page.topics.map(([t,c])=>button('data-topic',t,t,String(c))).join('')+'</div>'+page.nodes.map(n=>button('data-library-node',n.id,n.title,n.classification?.summary?.slice(0,160)||'原文独立保存')).join('')+'<div><button id="nav-prev" '+(!page.page?'disabled':'')+'>上一页</button> '+(page.page+1)+' / '+page.pages+' · '+page.total+' 份 <button id="nav-next" '+(page.page+1>=page.pages?'disabled':'')+'>下一页</button></div>';
 $('#main').innerHTML='<article class="article library-directory"><nav><button id="nav-root">'+esc(labels[view])+'</button>'+(domain?' / <button id="nav-domain">'+esc(domain.name)+'</button>':'')+(project?' / '+esc(project.name):route.projectId?' / 尚未归属项目':'')+'</nav><h1>'+esc(project?.name||(route.projectId===NAV_UNASSIGNED_PROJECT?'尚未归属项目':domain?.name)||labels[view])+'</h1><p>'+esc(contentPurposes[view])+'</p><p class="subtle">语义大标签 → 项目 → 内容 / 子主题。项目为同一实体的共享引用；原细标签与原文保留。</p><p id="navigation-status"></p><button id="navigation-update">归纳下一批大标签</button><div class="navigation-cards">'+content+'</div></article>';
 if(view==='concept'){const tools=document.createElement('div');tools.innerHTML='<button id="concept-plan">查看提炼范围与模板</button><button id="concept-new">新建概念</button>';document.querySelector('.library-directory h1').after(tools);$('#concept-plan').onclick=conceptPlanDialog;$('#concept-new').onclick=conceptCreateDialog;}
 const navButton=$('#navigation-update');if(navButton){fetch('/api/navigation/status').then(async r=>{if(!r.ok)throw Error('导航索引入口待同版本加载');const s=await r.json();if(!Number.isFinite(s.totalLabels))throw Error('导航索引入口待同版本加载');return s;}).then(s=>{if(!navButton.isConnected)return;$('#navigation-status').textContent='标签范围 '+s.totalLabels+' · 已有当前依据 '+s.mappedLabels+' · 待归纳 '+s.pendingLabels+' · 依据不足 '+(s.unresolvedLabels||0)+' · 已隔离未完成 '+(s.deferredLabels||0);navButton.disabled=!s.canRun||!s.pendingLabels;navButton.textContent=s.libraryPaused?'归纳下一批大标签（全库保持暂停）':'归纳下一批大标签';navButton.title=s.canRun?'每次最多40标签，仅一次模型调用':'现有任务运行或已暂停，本批未启动';const old=document.querySelector('#navigation-issues');old?.remove();const issues=document.createElement('section');issues.id='navigation-issues';issues.innerHTML=(s.issues||[]).map(i=>'<div><strong>'+esc(i.operationId)+'</strong><p>'+esc(i.reason)+'</p><p>'+esc(i.labels.join('、'))+'</p>'+(i.canRecover?'<button data-nav-recover="'+esc(i.operationId)+'">续交已保存返回（不重调模型）</button>':'<p>无可续交返回或旧模型未核实退出，保留预算；不会用新操作ID自动重试。</p>')+(i.canDefer?'<button data-nav-defer="'+esc(i.operationId)+'">隔离本批，先处理其他标签</button>':'<p>此批已隔离，未计完成；原资料、返回和预算保留，源版本变化后重新纳入。</p>')+'</div>').join('');navButton.after(issues);issues.querySelectorAll('[data-nav-defer]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('navigation/defer',{operationId:b.dataset.navDefer});render({force:true});}catch(e){toast(e.message);render({force:true});}});issues.querySelectorAll('[data-nav-recover]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('navigation/recover',{operationId:b.dataset.navRecover});await refresh();render({force:true});}catch(e){toast(e.message);b.disabled=false;}});}).catch(()=>{navButton.disabled=true;if($('#navigation-status'))$('#navigation-status').textContent='语义索引维护入口待同版本安全加载；原资料与归属保留。';});navButton.onclick=async()=>{navButton.disabled=true;try{await api('navigation/update',{operationId:crypto.randomUUID()});await refresh();render({force:true});}catch(e){toast(e.message);render({force:true});}};}
 const change=patch=>{rememberView();libraryRoute={...libraryRoute,...patch,nodeId:null};render({force:true});};$('#nav-root').onclick=()=>change({domainId:null,projectId:null,query:'',topic:null,page:0});if($('#nav-domain'))$('#nav-domain').onclick=()=>change({projectId:null,page:0});
 $$('[data-domain]').forEach(b=>b.onclick=()=>change({domainId:b.dataset.domain,projectId:null,page:0}));$$('[data-project]').forEach(b=>b.onclick=()=>change({projectId:b.dataset.project,page:0}));$$('[data-library-node]').forEach(b=>b.onclick=()=>{rememberView();chosen=b.dataset.libraryNode;libraryRoute.nodeId=chosen;if(view==='vault')vaultId=chosen;render({force:true});});$$('[data-topic]').forEach(b=>b.onclick=()=>change({topic:route.topic===b.dataset.topic?null:b.dataset.topic,page:0}));if($('#nav-search'))$('#nav-search').onchange=e=>change({query:e.target.value,page:0});if($('#nav-prev'))$('#nav-prev').onclick=()=>change({page:page.page-1});if($('#nav-next'))$('#nav-next').onclick=()=>change({page:page.page+1});$('#inspector').innerHTML='<h3>'+esc(labels[view])+'</h3><p>按语义大标签和项目浏览。选择具体内容后显示其来源与版本。</p>';
}
async function render({force=false}={}) {
  const liveEditor=document.querySelector('[data-inline-node]'),liveNode=current();
  if(liveEditor&&liveNode&&!view.endsWith('-network')&&liveEditor.dataset.inlineNode===liveNode.id){
    const d=inlineDrafts.items.get(liveNode.id);
    if(!force&&(d?.dirty||d?.saving||liveEditor.contains(document.activeElement))){renderInspector();return;}
  }
  const generation = ++renderGeneration;
  document.body.dataset.view = view;
  for (const b of $$("[data-view]"))
    b.classList.toggle("active", b.dataset.view === view);
  if (view.endsWith("-network")) return renderNetwork();
  if(view==='journal')return renderJournal();
  if(['vault','knowledge','skill','concept'].includes(view)&&!libraryRoute.nodeId)return renderLibraryDirectory();
  const nodes = relevant(),
    n = current();
  if (n) {
    try { await loadBody(n); } catch (error) { toast(error.message); return; }
    if (generation !== renderGeneration) return;
  }
  if (n) chosen = n.id;
  const panel =
    view === 'concept'?tr('概念云 · 内容目录'):view === "skill"
      ? tr("综合能力")
      : view === "knowledge"
        ? tr("知识浏览范围")
        : tr("Vault / 原始资料");
  const vaults = state.nodes.filter((n) => n.kind === "vault" && !n.mergedInto);
  $("#main").innerHTML =
    '<div class="file-panel"><div class="panel-heading">' +
    panel +
    '</div><p class="subtle">'+esc(contentPurposes[view]||'')+'</p>'+(view==='concept'?'<button type="button" id="concept-plan" class="wide">'+tr('查看提炼范围与模板')+'</button><button type="button" id="concept-new" class="wide"'+(!state.features?.conceptAdmission?' disabled':'')+'>'+tr('新建概念')+'</button><button type="button" id="concept-recheck-open" class="wide">'+tr('再次检查概念')+'</button>':'')+'<div class="subtle">' +
    (view === "knowledge"
      ? tr('已存知识总数：')+knowledgeInScope(state.nodes).length+' · '+tr('当前范围：')+nodes.length
      : nodes.length +
        tr(" 份 ") +
        (view === "skill" ? tr("能力分析") : tr("Markdown 资料"))) +
    "</div>" +
    (view === "knowledge"
      ? knowledgeOrganizationControls()+tr('<label class="field">选择原始 MD<select id="vault-select" aria-label="选择原始 MD">') +'<option value=""'+(!knowledgeSource?' selected':'')+'>'+tr('全部知识点')+'</option>'+
        vaults
          .map(
            (x) =>
              '<option value="' +
              esc(x.id) +
              '" ' +
              (x.id === knowledgeSource ? "selected" : "") +
              ">" +
              esc(x.path.split("/").at(-1) + ' · ' + knowledgeForSource(state.nodes, x.id).length + tr(' 个知识点')) +
              "</option>",
          )
          .join("") +
        "</select></label>"
      : "") +
    tr('<input id="list-search" class="search" placeholder="查找当前列表…" aria-label="查找当前列表"><div id="file-list">') +
    (view==='knowledge'?[]:nodes)
      .map(
        (x) =>
          '<button class="file-row ' +
          (n?.id === x.id ? "selected" : "") +
          '" data-file="' +
          esc(x.id) +
          '" title="' + esc(x.title+'\n'+x.path) + '" data-search="' + esc(x.title+' '+x.path) +
          '"><span class="file-icon">' +
          (view === "vault" ? "MD" : "◇") +
          "</span>" +
          esc(view === "vault" ? shortNodeLabel(x, 42) : x.title) +
          "<small>" +
          esc(
            view === "vault"
              ? x.path.split("/").slice(0, -1).join("/")
              : view === "skill"
                ? tr(x.level) + " · " + (x.domain || tr("待补充领域"))
                : tr(x.decision || '已提取'),
          ) +
          "</small></button>",
      )
      .join("") +
    '</div></div><div class="article-scroll">' +
    (n ? article(n) : emptyView()) +
    "</div>";
  $("#files-host").replaceChildren();
  $("#list-search").insertAdjacentHTML("afterend", categoryFilterHTML(view));
  bindCategoryFilters();
  if(view==='knowledge'){
    $('#list-search').value=knowledgeQuery;
    const draw=()=>{
      const page=knowledgeListPage(nodes,{query:knowledgeQuery,page:knowledgePage});knowledgePage=page.page;
      const row=x=>'<button class="file-row '+(x.id===chosen?'selected':'')+'" data-file="'+esc(x.id)+'" title="'+esc(x.title)+'"><span class="file-icon">◇</span>'+esc(x.title)+'<small>'+esc(tr(x.decision||'已提取'))+'</small></button>';
      $('#file-list').innerHTML='<p class="subtle">'+tr('匹配：')+page.total+' · '+(page.page+1)+' / '+page.pages+'</p>'+knowledgeProjectBuckets(page.items).map((b,i)=>'<details class="project-entry"'+(b.nodes.some(n=>n.id===chosen)||i===0?' open':'')+'><summary>'+esc(b.kind==='unassigned'?tr(b.name):b.name)+' <small>'+b.count+'</small></summary><div class="project-branches">'+b.nodes.map(row).join('')+'</div></details>').join('')+'<div><button type="button" id="knowledge-prev"'+(page.page===0?' disabled':'')+'>'+tr('上一页')+'</button> <button type="button" id="knowledge-next"'+(page.page+1>=page.pages?' disabled':'')+'>'+tr('下一页')+'</button></div>';
      $('#knowledge-prev').onclick=()=>{knowledgePage--;draw();};$('#knowledge-next').onclick=()=>{knowledgePage++;draw();};
      $$('[data-file]').forEach(b=>b.onclick=()=>{if(chosen!==b.dataset.file)rememberView();chosen=b.dataset.file;document.body.classList.remove('files-open');render();});
    };
    $('#list-search').oninput=e=>{knowledgeQuery=e.target.value;knowledgePage=0;draw();};draw();bindKnowledgeOrganization();
  }else $("#list-search").oninput = (e) =>
    $$("[data-file]").forEach(
      (b) =>
        (b.hidden = !(b.dataset.search || b.textContent)
          .toLowerCase()
          .includes(e.target.value.toLowerCase())),
    );
  $$("[data-file]").forEach(
    (b) =>
      (b.onclick = () => {
        if(chosen!==b.dataset.file)rememberView();
        chosen = b.dataset.file;
        if (view === "vault") vaultId = chosen;
        document.body.classList.remove('files-open');
        render();
      }),
  );
  if ($("#vault-select"))
    $("#vault-select").onchange = (e) => {
      knowledgeSource=e.target.value||null;if(knowledgeSource)vaultId=knowledgeSource;knowledgePage=0;knowledgeQuery='';
      chosen = null;
      render({force:true});
    };
  if(n){const filePanel=document.querySelector('main > .file-panel');if(filePanel){const tree=buildSemanticNavigation(state.nodes,state.semanticNavigation,view),siblings=navContents(tree,libraryRoute);filePanel.innerHTML='<button id="library-return">← 内容目录</button><h3>'+esc(labels[view])+'</h3>'+siblings.nodes.map(x=>'<button class="file-row '+(x.id===n.id?'selected':'')+'" data-library-sibling="'+esc(x.id)+'">'+esc(x.title)+'</button>').join('')+'<p class="subtle">当前目录 '+siblings.total+' 份，先显示本页 '+siblings.nodes.length+' 份。完整翻页与筛选在内容目录中。</p>';$('#library-return').onclick=()=>{chosen=null;libraryRoute.nodeId=null;render({force:true});};document.querySelectorAll('[data-library-sibling]').forEach(b=>b.onclick=()=>{rememberView();chosen=b.dataset.librarySibling;libraryRoute.nodeId=chosen;if(view==='vault')vaultId=chosen;render({force:true});});}}
  if(n&&$("#inline-save"))bindInlineEditor(n);
  if(n?.kind==="concept"&&!conceptEditing.has(n.id)){document.querySelectorAll(".concept-readable h1,.concept-readable h2,.concept-readable h3").forEach((h,i)=>h.id="concept-section-"+i);$("#concept-edit").onclick=()=>{conceptEditing.add(n.id);render({force:true});};}
  if(n){const a=$(".article");if(a){const back=document.createElement("button");back.textContent="← 内容目录";back.onclick=()=>{chosen=null;libraryRoute.nodeId=null;render({force:true});};const parentPath=document.createElement('nav');parentPath.className='document-parent-path';parentPath.setAttribute('aria-label','父级目录');const tree=buildSemanticNavigation(state.nodes,state.semanticNavigation,view);const add=(title,patch)=>{const b=document.createElement('button');b.textContent=title;b.onclick=()=>{rememberView();libraryRoute={...libraryRoute,...patch,nodeId:null};chosen=null;render({force:true});};parentPath.append(b);};add(labels[view],{domainId:null,projectId:null,page:0});const d=tree.domains.find(d=>d.id===libraryRoute.domainId);if(d)add(d.name,{projectId:null,page:0});if(libraryRoute.projectId){const p=tree.projects.find(p=>p.id===libraryRoute.projectId);add(p?.name||(libraryRoute.projectId===NAV_UNASSIGNED_PROJECT?'尚未归属项目':'项目待核对'),{page:0});}parentPath.append(back);a.prepend(parentPath);}}
  if(view==='vault')groupProjectEntries();
  if(n?.kind==='vault'){
    const article=document.querySelector('.article .metadata');if(article){article.insertAdjacentHTML('afterend','<div id="source-layer-progress" class="source-layer-progress"></div>');renderLayerControls($('#source-layer-progress'),n.id,{tr,esc,api,toast});}
  }
  if(n?.kind==='concept'){const methods=[...new Set((n.conceptReferences||[]).map(r=>r.recognitionMethod||'explicit'))];const metadata=document.querySelector('.article .metadata');if(metadata&&methods.length)metadata.insertAdjacentHTML('afterend','<p class="metric">'+tr('历史认可方式')+' · '+methods.map(method=>esc(tr(({explicit:'明确认可',implicit:'隐含认可','topic-ended':'话题结束'})[method]||method))).join(' / ')+' · '+tr('不构成操作授权')+'</p>');}
  if($('#concept-plan'))$('#concept-plan').onclick=conceptPlanDialog;
  if($('#concept-new'))$('#concept-new').onclick=conceptCreateDialog;
  if($('#concept-recheck-open'))$('#concept-recheck-open').onclick=conceptRecheckDialog;
  if ($("#queue-button")) $("#queue-button").onclick = () => queue(n);
  document.querySelectorAll('[data-reading-page]').forEach(b => b.onclick = () => {
    readingPages.set(n.id, Number(b.dataset.readingPage)); render({force:true});
  });
  if ($("#empty-import")) $("#empty-import").onclick = importDialog;
  if ($("#empty-codex")) $("#empty-codex").onclick = jobsDialog;
  if (n) {
    $(".article .metadata").insertAdjacentHTML(
      "afterend",
      '<div class="article-classification">' + mainTagsHTML(n) + classificationHTML(n) + projectDecisionHTML(n) + "</div>",
    );
    bindClassification();
  }
  bindNodes($("#main"));
  bindMainTags();
  renderInspector();
}
function emptyView() {
  if(view==='concept')return '<div class="empty"><div class="empty-symbol">◈</div><h2>'+tr('从对话中形成概念')+'</h2><p>'+tr('直接整理 Vault 中形成的认识、理由和技术线。')+'</p><p>'+tr('每篇包括：新标题、情境与目的的简短综述、解释认识及意义的正文，以及独立 Reference。操作日志、执行状态和排障碎片不作为概念。')+'</p><p class="subtle">'+tr(state.features?.concepts?'概念随后续分段与新增资料一并提炼；本批完成后自动补提历史缺失概念。':'概念云入口已就绪；增量提炼与历史补提接入待后端重新加载，本页不会自行启动新调用。')+'</p></div>';
  if (view === 'knowledge' && knowledgeSource && !selectedCategories(view).size) {
    const [title, detail] = knowledgeStatus(state.analysis, vaultId);
    return '<div class="empty"><h2>' + esc(title) + '</h2><p>' + esc(detail) + '</p></div>';
  }
  if (selectedCategories(view).size)
    return tr('<div class="empty"><h2>当前类别下暂无内容</h2><p>可以选择其他类别或显示全部。</p></div>');
  const copy =
    view === "vault"
      ? [
          tr("保存第一份原始资料"),
          tr("导入 Markdown，或主动保存一段文字。原文将独立保留，知识与能力分析逐步写入。"),
          tr("导入资料"),
        ]
      : view === "knowledge"
        ? [
            tr("等待这份资料的知识提取"),
            tr("选定一篇 MD 后，由 Codex 阅读原文、逐条保存知识与依据。这里始终是单篇分析。"),
            tr("查看 Codex 接入"),
          ]
        : [
            tr("能力从证据中形成"),
            tr("综合多个知识点，结合实践材料判断能力程度；提及一个概念不等于掌握。"),
            tr("查看 Codex 接入"),
          ];
  return (
    '<div class="empty"><div class="empty-symbol">◇</div><h2>' +
    copy[0] +
    "</h2><p>" +
    copy[1] +
    '</p><button class="primary" id="' +
    (view === "vault" ? "empty-import" : "empty-codex") +
    '">' +
    copy[2] +
    "</button></div>"
  );
}
async function conceptCreateDialog(){
  if(!state.features?.conceptAdmission)return;
  const r=await fetch('/api/concepts/template');if(!r.ok){toast(tr('概念模板读取失败'));return;}const {template}=await r.json();
  const vaults=state.nodes.filter(n=>n.kind==='vault'&&!n.mergedInto);
  const evidenceFields=[['questionQuote','提问原句'],['answerQuote','回答原句'],['userConfirmationQuote','用户认可原句'],['conclusionQuote','结论原句']];
  modal(tr('新建概念'),'<label class="field">'+tr('标题')+'<input name="title" required></label><label class="field">Vault<select name="sourceId">'+vaults.map(n=>'<option value="'+esc(n.id)+'">'+esc(n.title)+'</option>').join('')+'</select></label>'+evidenceFields.map(([name,label])=>'<label class="field">'+tr(label)+'<textarea name="'+name+'" required></textarea></label>').join('')+'<label class="field">'+tr('Markdown 正文')+'<textarea name="body" rows="16" required>'+esc(template)+'</textarea></label><p class="subtle">'+tr('手动保存，不调用模型；来源须是 Vault 原文。')+'</p>',async form=>{
    const source=state.nodes.find(n=>n.id===form.get('sourceId'));await loadBody(source);const admission=Object.fromEntries(evidenceFields.map(([name])=>[name,form.get(name)]));admission.confirmationMeaning='answer-endorsement';admission.confirmationTarget=admission.answerQuote;
    const at=source.body.indexOf(admission.conclusionQuote),ref={path:source.path,sourceId:source.id,sourceHash:source.hash,readRange:{start:0,end:source.body.length},admission,discussion:[],locator:{start:at,end:at+admission.conclusionQuote.length},formation:'手工整理用户已认可的讨论结论。',materials:[]};
    const title=form.get('title').trim(),body=form.get('body').replace(/^# [^\n]+/,'# '+title)+'\n\n'+source.path+'\n'+evidenceFields.map(([name,label])=>{const start=source.body.indexOf(admission[name]);return '- '+tr(label)+' · '+start+'–'+(start+admission[name].length);}).join('\n');
    const result=await api('upsert',{id:'c-'+crypto.randomUUID().replaceAll('-',''),kind:'concept',title,body,sources:[{id:source.id,sourceHash:source.hash,quote:admission.conclusionQuote}],conceptStance:'讨论假设',conceptReferences:[ref]});navigate('concept',result.id);
  });
}
async function conceptPlanDialog(){
  const fallback='# 概念名称\n\n## 综述\n情境、要求与目的。\n\n## 概念\n是什么、为何如此判断、形成的能力与认识、效果及边界；不是操作流水账。\n\n## 认识性质\n用户观点／讨论假设／助手建议／已确认结论。\n\n## Reference\n原 Vault 路径、讨论定位、原讨论参考资料与简短形成线索。';
  let template=fallback,plan=null;
  if(state.features?.concepts){try{const responses=await Promise.all([fetch('/api/concepts/template'),fetch('/api/concepts/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})]);if(responses.some(r=>!r.ok))throw Error(tr('概念范围读取失败'));const [t,p]=await Promise.all(responses.map(r=>r.json()));template=t.template;plan=p;}catch(error){toast(error.message);return;}}
  modal(tr('概念云 · 提炼范围与模板'),'<p>'+tr('只读取 Vault 原始对话，不经过 AI 知识点或 AI 技能；不外网验证、不改写原文。')+'</p>'+(plan?'<p>'+tr('待处理原文：')+plan.sourceCount+tr(' 篇；剩余字符：')+plan.remainingCharacters+tr('；预计分段调用：')+plan.estimatedModelCalls+'</p><p>'+tr('历史缺失概念预计分段调用：')+(plan.estimatedHistoryCalls||0)+tr('；本批完成后，五路中最多使用一路补提。')+'</p><p>'+tr('概念随现有后续分段一并提炼，不额外增加当次模型调用；本批完成后再仅补历史概念。查看范围不触发调用。')+'</p>':'<p>'+tr('当前后端尚未加载概念存储与增量接入；模板可查看，历史补提尚未启动。')+'</p>')+'<pre class="concept-template">'+esc(template)+'</pre>',async()=>{},tr('关闭'));
}
function article(n) {
  if(n.kind==="concept"&&!conceptEditing.has(n.id)){const readable=String(n.body||'').replace(/^# [^\r\n]+\r?\n/,'');const headings=[...readable.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m=>m[1]);return `<article class="article concept-document"><h1>${esc(n.title)}</h1><div class="metadata">${esc(n.conceptStance||"讨论假设")}</div><button id="concept-edit">编辑概念</button><nav aria-label="专题目录">${headings.map((h,i)=>`<a href="#concept-section-${i}">${esc(h)}</a>`).join(" · ")}</nav><div class="concept-readable">${safeMarkdown(readable)}</div><details><summary>查看原文依据片段</summary>${(n.sources||[]).map(x=>`<button data-node="${esc(x.id)}">${esc(state.nodes.find(y=>y.id===x.id)?.title||x.id)}</button><blockquote>${esc(x.quote||"")}</blockquote>`).join("")}</details></article>`;}
  const draft=inlineDrafts.open(n),size = 24000, count = Math.max(1, Math.ceil(draft.body.length / size));
  const page = Math.min(count - 1, readingPages.get(n.id) || 0);
  readingPages.set(n.id,page);
  const pager = count > 1 ? tr('<div class="reading-pagination"><span>长对话分段显示 · ') + (page+1) + ' / ' + count + tr(' · MD 原文完整保留</span>') +
    '<button data-reading-page="' + Math.max(0,page-1) + '" ' + (!page?'disabled':'') + tr('>上一段</button>') +
    '<button data-reading-page="' + Math.min(count-1,page+1) + '" ' + (page===count-1?'disabled':'') + tr('>下一段</button></div>') : '';
  return (
    '<article class="article" data-inline-node="'+esc(n.id)+'"><div class="breadcrumb">' +
    esc(labels[view]) +
    " <span>/</span> " +
    esc(uiPath(n.path)) +
    '<span class="spacer"></span><span id="inline-save-status" role="status">'+esc(tr(draft.status))+'</span><button id="inline-save"'+(!draft.dirty?' disabled':'')+'>'+tr('保存')+'</button><button id="inline-delete" class="danger" type="button">'+tr('删除')+'</button></div><input id="inline-title" class="inline-title" aria-label="'+esc(tr('标题'))+'" value="'+esc(draft.title)+'"><div class="metadata"><span class="tag">' +
    (n.kind === "vault"
      ? tr("原始 Markdown")
      : n.kind==='concept'?esc(n.conceptStance||tr('讨论假设')):n.kind === "skill"
        ? esc(tr(n.level)) + " · " + esc(n.domain || tr("能力分析"))
        : tr("单篇提取 · ") + esc(tr(n.decision) || tr("新增"))) +
    '</span><span class="subtle">' +
    (n.kind === "vault" ? tr("原文独立保存") : n.sources.length + tr(" 项可追溯依据")) +
    "</span>" +
    (n.kind === "vault"
      ? tr('<button class="text-button" id="queue-button">查看自动处理进度 →</button>')
      : "") +
    '</div>' + skillMethodHTML(n) + pager + '<textarea id="inline-body" class="inline-body" aria-label="'+esc(tr('Markdown 正文'))+'" spellcheck="false">' +
    esc(draft.body.slice(page*size,(page+1)*size)) +
    '</textarea>' + pager + '</article>'
  );
}
function skillMethodHTML(n){
  if(n.kind!=='skill')return '';const p=n.methodUse||{status:'legacy-unreviewed',usableAsMethod:false,notice:tr('旧记录保留，未标注用户认可；仅供参考，不覆盖当前指示。')};
  return '<section class="support"><h4>'+tr(p.usableAsMethod?'用户已认可的适用方法':'未确认或待复核的方法参考')+'</h4><p class="subtle">'+tr('来源角色：')+tr(p.originRole==='user'?'用户':p.originRole==='assistant'?'助手':'引用资料或角色未明')+'</p>'+(p.scope?'<p><strong>'+tr('适用范围')+'</strong> '+esc(p.scope)+'</p>':'')+(p.limitations?'<p><strong>'+tr('限制')+'</strong> '+esc(p.limitations)+'</p>':'')+'<p class="subtle">'+esc(p.notice)+'</p>'+(p.recognition?'<button class="wide" data-node="'+esc(p.recognition.sourceId)+'">'+tr('返回用户认可依据')+' ↗</button><blockquote>'+esc(p.recognition.quote)+'</blockquote>':'')+'</section>';
}
function bindInlineEditor(n){
  const draft=inlineDrafts.items.get(n.id),size=24000,page=readingPages.get(n.id)||0,start=page*size;
  let end=Math.min(draft.body.length,start+size);
  const status=()=>{if($('#inline-save-status'))$('#inline-save-status').textContent=tr(draft.status);if($('#inline-save'))$('#inline-save').disabled=draft.saving||!draft.dirty;};
  $('#inline-delete').onclick=()=>workspaceControls.deleteNode(n.id,{dirty:draft.dirty});
  $('#inline-title').oninput=e=>{inlineDrafts.change(n.id,{title:e.target.value});status();};
  $('#inline-body').oninput=e=>{end=inlineDrafts.replaceRange(n.id,start,end,e.target.value);status();};
  $('#inline-save').onclick=async()=>{
    if(draft.saving)return;const version=draft.version;draft.saving=true;draft.status='保存中…';status();
    try{const saved=await saveInlineDraft(n,draft,api,state.features);inlineDrafts.accept(n.id,saved,version);bodyCache.set(n.id,{hash:saved.hash,body:saved.body});if(draft.version===version&&document.querySelector('[data-inline-node]')?.dataset.inlineNode===n.id){$('#inline-body').value=draft.body.slice(start,start+size);$('#inline-title').value=draft.title;end=Math.min(draft.body.length,start+size);}status();toast(tr('已保存，原版本保留；仅复核受影响资料'));}
    catch(error){draft.saving=false;draft.status='保存失败，草稿已保留';status();toast(error.message);}
  };
  document.querySelector('[data-inline-node]').onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('#inline-save').click();}};
}
function sourceHTML(s) {
  const n = state.nodes.find((n) => n.id === s.id);
  return (
    '<div class="support"><button data-node="' +
    esc(s.id) +
    '">' +
    esc(n?.title || s.id) +
    " ↗</button><p>" +
    esc(uiPath(n?.path) || tr("来源缺失")) +
    (s.quoteValid === false || (typeof n?.body === 'string' && !n.body.includes(s.quote)) ? tr(" · 原文已修改，请复核依据") : "") +
    (s.locator ? " · " + esc(typeof s.locator==='object'?s.locator.start+'–'+s.locator.end:s.locator) : "") +
    "</p><blockquote>「" +
    esc(s.quote) +
    "」</blockquote></div>"
  );
}
function renderInspector() {
  const n = view.endsWith("-network")
    ? state.nodes.find((n) => n.id === graph?.selected)
    : current();
  if (view.endsWith("-network")) {
    const kind = view.replace("-network", "");
    $("#inspector").innerHTML =
      tr("<h3>分类与关系</h3>") +
      taxonomyFiltersHTML(kind)+
      '<p class="metric">'+tr('默认显示完整项目星云及全部所属节点；点击节点聚焦，查看全图显示整个星云。项目筛选仍生效，文字随距离缩小、隐藏。')+'</p>'+
      '<p class="metric">'+(state.semanticNavigation?.version===1?tr('语义大标签依据模型理解；项目按稳定身份共享引用，依据不足保留待归纳，不用同词频次代替归属。'):tr('同标签：3 份独立来源列为候选，5 份自动成为项目。')+' '+tr('自动项目：')+(state.recurringProjects||[]).filter(p=>p.status==='promoted').length+' · '+tr('候选：')+(state.recurringProjects||[]).filter(p=>p.status==='candidate').length)+'</p>'+
      categoryFilterHTML(kind) +
      tr('<h4>关系类型 · 多选筛选</h4><button class="text-button" id="select-all">全部显示</button>') +
      relationDisplayTypes(state.types)
        .map(
          (t) =>
            '<label class="filter"><input type="checkbox" data-filter="' +
            esc(t.id) +
            '" ' +
            (!hidden.has(t.id) ? "checked" : "") +
            '><span>'+(!t.membershipLink?'<input type="color" class="type-color" data-type-color="'+esc(t.id)+'" value="'+esc(t.color)+'" aria-label="'+esc(tr('颜色')+' '+tr(t.name))+'">':'') +
            esc(tr(t.name)) +
            "</span></label>",
        )
        .join("") +
      tr('<button class="text-button" id="type-open">＋ 定义关系类型</button><div class="metric">隐藏只改变视图，关系仍保存在 MD。<br>线粗表示强度；选中与连接数大小独立。</div><div class="rule"></div>') +
      (n
        ? tr('<h3>当前观察中心</h3><div class="support"><button data-node="') +
          esc(n.id) +
          '">' +
          esc(n.title) +
          " ↗</button><p>" +
          esc(uiPath(n.path)) +
          tr('</p></div><button id="relation-open" class="wide">＋ 建立有依据的关系</button>')
        : tr('<p class="subtle">点击任意节点将它设为观察中心。<br>双击节点进入内容。</p>')) +
      (n ? heatHTML(n) : '') +
      (selectedEdge ? edgeHTML(selectedEdge) : "") +
      (n
        ? state.relations
            .filter(
              (r) => (r.from === n.id || r.to === n.id) && !hidden.has(r.type),
            )
            .slice(0, 20)
            .map(
              (r) =>
                '<div class="edge-card">' +
                esc(state.types.find((t) => t.id === r.type)?.name) +
                " · " +
                esc(
                  state.nodes.find(
                    (x) => x.id === (r.from === n.id ? r.to : r.from),
                  )?.title,
                ) +
                '<br><button data-edge="' +
                esc(r.id) +
                tr('">查看理由、来源与强度 ↗</button></div>'),
            )
            .join("")
        : "") +
      tr('<div class="rule"></div><button id="relation-history-open" class="wide">关系版本与回退</button><button id="settings-open" class="wide">显示参数 · 可调初值</button><button id="benchmark-open" class="wide">临时性能试验</button>');
    $$("[data-filter]").forEach(
      (c) =>
        (c.onchange = () => {
          relationVisibility.set(c.dataset.filter,c.checked);
          hidden=relationVisibility.hiddenFor(state.types);
          if (!benchmark) updateGraph();
          else graph.update({ ...graphData, hidden });
          if(c.checked)focusFilteredContent({relationType:c.dataset.filter});else graph.setHighlight?.([]);
          renderInspector();
        }),
    );
    bindMainTags();
    $$('[data-type-color]').forEach(input=>{
      input.onclick=event=>event.stopPropagation();
      input.oninput=()=>{const type=state.types.find(t=>t.id===input.dataset.typeColor);type.color=input.value;if(graph)updateGraph();};
      input.onchange=async()=>{const type=state.types.find(t=>t.id===input.dataset.typeColor);try{await api('type',{...type,color:input.value,update:true});}catch(error){toast(error.message);}};
    });
    $("#select-all").onclick = () => {
      relationVisibility.selectAll(state.types);
      hidden=relationVisibility.hiddenFor(state.types);
      if (!benchmark) updateGraph();
      else graph.update({ ...graphData, hidden });
      renderInspector();
    };
    if (n) {
      $("#inspector").insertAdjacentHTML("beforeend", classificationHTML(n));
      bindClassification();
    }
    bindCategoryFilters();
    $("#type-open").onclick = typeDialog;
    $("#relation-history-open").onclick = () =>
      historyDialog({
        id: "@relations",
        title: tr("全部网络的关系"),
        hash: state.relationDocumentHash,
      });
    $("#settings-open").onclick = settingsDialog;
    $("#benchmark-open").onclick = benchmarkDialog;
    if ($("#relation-open"))
      $("#relation-open").onclick = () => relationDialog(null, n);
    $$("[data-edge]").forEach(
      (b) =>
        (b.onclick = () => {
          selectedEdge = state.relations.find((r) => r.id === b.dataset.edge);
          renderInspector();
        }),
    );
    if ($("#edge-edit"))
      $("#edge-edit").onclick = () => relationDialog(selectedEdge, n);
    bindNodes($("#inspector"));bindRecoveryActions();
    if(n){
      const neighbours=linkedNeighbours(state.nodes,state.relations,n.id,state.types);
      graph.setNavigation?.(neighbours,jumpToNeighbour);
      const context=navigationContext?.to===n.id?navigationContext:null;
      $('#inspector').insertAdjacentHTML('beforeend','<section class="neighbour-list"><h4>'+tr('沿真实连接前往')+'</h4><p class="subtle">'+tr('箭头表示导航去向，不改变关系方向。')+'</p>'+neighbours.map(entry=>'<button class="wide neighbour-jump" data-neighbour="'+esc(entry.id)+'">➜ '+esc(entry.node.title)+'<small>'+esc(entry.relations.map(r=>r.typeName).join(' · '))+'</small></button>').join('')+'</section>'+(context?'<section class="navigation-context"><h4>'+esc(tr('从 ')+context.fromTitle+tr(' 查看 ')+n.title)+'</h4>'+context.relations.map(r=>edgeHTML(r,false)).join('')+'</section>':'')+'<section class="neighbour-content"><h4>'+esc(n.title)+'</h4>'+(typeof n.body==='string'?'<div class="markdown">'+safeMarkdown(n.body.slice(0,24000))+'</div>':'<p>'+tr('正在读取正文…')+'</p>')+'<button class="wide" data-node="'+esc(n.id)+'">'+tr('打开完整内容与编辑器')+' ↗</button></section>');
      $('#inspector').querySelectorAll('[data-neighbour]').forEach(button=>button.onclick=()=>jumpToNeighbour(button.dataset.neighbour));bindNodes($('#inspector'));
      if(typeof n.body!=='string')loadBody(n).then(()=>{if(graph?.selected===n.id)renderInspector();}).catch(error=>toast(error.message));
    }else graph?.setNavigation?.([],jumpToNeighbour);
    return;
  }
  if (!n) {
    $("#inspector").innerHTML =
      tr('<h3>来源与依据</h3><p class="subtle">内容保存后，在这里沿依据返回原始资料。</p>');
    return;
  }
  if(n.kind==='concept'){
    $('#inspector').innerHTML='<h3>Reference</h3><p class="subtle">'+esc(n.conceptStance||tr('讨论假设'))+'</p>'+n.sources.map(sourceHTML).join('')+'<p class="subtle">'+tr('返回 Vault 原文查看讨论情境。概念不表示用户已掌握某项技能。')+'</p><button id="history-open" class="wide">'+tr('版本历史与回退')+'</button>';
    $('#history-open').onclick=()=>historyDialog(n);bindNodes($('#inspector'));return;
  }
  const knowledge = state.nodes
    .filter(
      (x) =>
        x.kind === "knowledge" &&
        x.sources.some((s) => [n.kind === "vault" ? n.id : vaultId,...(n.mergedFrom||[])].includes(s.id)) &&
        x.id !== n.id,
    )
    .slice(0, 5);
  $("#inspector").innerHTML =
    "<h3>" +
    (n.kind === "skill"
      ? tr("支撑知识与实践材料")
      : n.kind === "knowledge"
        ? tr("相关知识 · 当前单篇")
        : tr("文件信息")) +
    "</h3>" +
    heatHTML(n) +
    (n.kind === "vault" && n.mergedFrom?.length ? tr('<div class="support"><h4>连续资料已合并</h4><p>原始来源保留，可从下方逐份查看。</p>')+n.mergedFrom.map(id=>'<button class="wide" data-node="'+esc(id)+'">'+esc(state.nodes.find(x=>x.id===id)?.title||id)+' ↗</button>').join('')+tr('<button id="unmerge-open" class="wide">还原为独立文件</button></div>') : '') +
    (n.kind === "vault"
      ? '<div class="support"><p>' +
        esc(uiPath(n.path)) +
        tr("</p><p>原文 SHA-256<br>") +
        esc(n.hash.slice(0, 20)) +
        tr("…</p></div><h4>已提取知识</h4>")
      : "") +
    (n.kind === "skill"
      ? n.sources.map(sourceHTML).join("")
      : knowledge
          .map(
            (x, i) =>
              '<div class="support"><button data-node="' +
              esc(x.id) +
              '">' +
              String(i + 1).padStart(2, "0") +
              " " +
              esc(x.title) +
              " ↗</button><p>" +
              esc(
                state.nodes.find((z) => z.id === x.sources[0]?.id)?.path || "",
              ) +
              "</p></div>",
          )
          .join("")) +
    (n.kind === "knowledge"
      ? tr("<h4>本条知识的来源</h4>") + n.sources.map(sourceHTML).join("")
      : "") +
    (n.kind === "skill"
      ? tr('<h4>职业与领域</h4><p class="subtle">') +
        esc(n.occupations || tr("证据不足，待补充")) +
        tr('</p><h4>程度说明</h4><p class="subtle">涉及 → 实践 → 验证<br>升级判断需要相应材料支持。</p>')
      : "") +
    sourceRecoveryHTML(n.id)+tr('<div class="rule"></div><button id="history-open" class="wide">版本历史与回退</button>');
  $("#history-open").onclick = () => historyDialog(n);
  if($('#unmerge-open'))$('#unmerge-open').onclick=async()=>{
    try{await api('unmerge',{targetId:n.id,expectedHash:n.hash});await refresh();await render();toast(tr('已还原独立文件，合并版本仍可追溯'));}catch(error){toast(error.message);}
  };
  bindNodes($("#inspector"));bindRecoveryActions();
}
function jumpToNeighbour(id){
  if(!graph?.selected)return;
  const from=state.nodes.find(n=>n.id===graph.selected),entry=linkedNeighbours(state.nodes,state.relations,graph.selected,state.types).find(e=>e.id===id);if(!from||!entry)return;
  navigationContext={from:from.id,fromTitle:from.title,to:id,relations:entry.relations};
  const kind=view.replace('-network','');selectedCategories(kind).clear();mainTagSelections[kind]=null;updateGraph();graph.select(id,{smooth:true});
}
function heatHTML(n){
  if(!n.heat)return '';
  const heat=heatText(n.heat);
  return '<div class="support"><h4><i class="swatch" style="background:'+esc(n.heat.color)+'"></i> '+esc(heat.name+' · '+heat.label)+'</h4><p>'+esc(heat.reason)+tr('</p><p class="subtle">重要程度表示持续使用与推进，不表示技能掌握程度。</p></div>');
}
function edgeHTML(r,editable=true) {
  return (
    '<div class="support"><h4>'+tr('关系依据')+' · '+esc(tr(state.types.find(t=>t.id===r.type)?.name||r.type))+'</h4><p>' +
    esc(r.reason) +
    tr("</p><p>强度 ") +
    r.strength +
    " · " +
    esc(
      Object.entries(r.dimensions||{})
        .map(([k, v]) => k + "：" + (v ? tr("是") : tr("否")))
        .join(" · "),
    ) +
    "</p>" +
    (r.sources||[]).map(sourceHTML).join("") +
    (editable?tr('<button id="edge-edit" class="text-button">纠正这条关系</button></div>'):'</div>')
  );
}
function modal(title, body, action, label = tr("保存")) {
  submitAction = action;
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = body;
  $("#form-error").textContent = "";
  $("#modal-submit").textContent = label;
  $("#modal-submit").hidden = !action;
  if (!$("#modal").open) $("#modal").showModal();
}
$("#modal-form").onsubmit = (e) => {
  e.preventDefault();
  if (!submitAction) return;
  const button=$('#modal-submit');
  return runButtonAction(button,async()=>{const currentModalAction=currentButtonAction();button.disabled=true;try {
    const action=submitAction;await action(new FormData(e.target));
    if(submitAction===action)$("#modal").close();
  } catch (err) {
    $("#form-error").textContent = err.message;
    actionResult(currentModalAction,{error:err.message});
  } finally {
    button.disabled=false;
  }}).catch(()=>{});
};
$("#modal-close").onclick = () => $("#modal").close();
function importDialog() {
  modal(
    tr("保存原始资料"),
    tr('<p class="subtle">选择 MD 文件，或主动保存一段文字。只保存在本机。</p><label class="field">读取 Markdown 文件<input id="md-file" type="file" accept=".md,.markdown,.txt" hidden><span class="localized-file-picker"><button type="button" id="choose-md-file" aria-controls="md-file" aria-describedby="md-file-name">选择文件</button><span id="md-file-name" aria-live="polite">未选择文件</span></span></label><label class="field">文件名<input name="name" id="import-name" placeholder="例如：今日导入 第1.md" required></label><label class="field">原文<textarea name="body" id="import-body" placeholder="将资料粘贴到这里…" required></textarea></label>')+
    (state.features?.incrementalImportMetadata?'<details><summary>'+tr('来源与日期（可选）')+'</summary><label class="field">'+tr('资料原始日期')+'<input type="date" name="sourceDate"></label><label class="field">'+tr('来源标识')+'<input name="originId" maxlength="300"></label><label class="field">'+tr('来源版本')+'<input name="originVersion" maxlength="120"></label></details>':''),
    async (f) => {
      const r = await api("import", Object.fromEntries(f));
      navigate("vault", r.node.id);
      toast(
        r.duplicate
          ? tr("已存在相同原文，已打开原文件")
          : tr("原文已保存，已自动加入分析队列"),
      );
    },
  );
  $("#choose-md-file").onclick=()=>$("#md-file").click();
  $("#md-file").onchange = async (e) => {
    const f = e.target.files[0];
    $("#md-file-name").textContent=f?.name||tr("未选择文件");
    if (f) {
      $("#import-name").value = f.name;
      $("#import-body").value = await f.text();
    }
  };
}
function edit(n) {
  modal(
    tr("编辑 · ") + n.title,
    tr('<p class="subtle">原版本会保留。保存时检查是否发生并发修改。</p><label class="field">正文<textarea name="body" style="min-height:360px">') +
      esc(n.body) +
      "</textarea></label>",
    async (f) => {
      await api("edit", {
        id: n.id,
        body: f.get("body"),
        expectedHash: n.hash,
      });
      toast(tr('已保存并安排受影响资料复核；人工正文受到保护，旧版本可回退'));
    },
  );
}
async function queue(n) {
  jobsDialog();
}
function jobsDialog() {
  const a=state.analysis||{};
  const task=taskPresentation(state);
  const counts=state.jobs.reduce((c,j)=>(c[j.status]=(c[j.status]||0)+1,c),{});
  modal(
    tr("自动处理进度"),
    '<section id="processing-overview" role="status" aria-live="polite">'+processingDetailsHTML()+'</section>'+activityHTML()+'<div><strong>'+tr('联合提取队列')+' · '+esc(task.status)+'</strong><p>'+esc(task.current)+'</p><p>'+esc(task.progress)+'</p><p>'+esc(task.stage)+'</p>'+(task.problem?'<p>'+esc(task.problem)+'</p>':'')+'</div>'+activeFilesHTML()+
      tr('<p class="subtle">流程：导入原文 → 分段联合分析（知识提取 / 关系比较 / 主分类归纳 / 技能整合）→ 校验依据并落盘 → 下一段或下一篇。存量主分类随现有调用分批回填。最多五份文件并行，每份内部按段续接，无需逐篇启动。</p>')+
      '<div class="analysis-overview"><strong>'+(a.completed||0)+' / '+(a.total||0)+tr(' 篇已完成</strong><span>已读 ')+(a.segments||0)+tr(' 段 · 后续按顺序 ')+(counts.queued||0)+tr(' · 手动暂停 ')+(counts.paused||0)+tr(' · 重试 ')+(a.retrying||0)+tr(' · 实际失败 ')+(a.needsReview||0)+tr(' · 有核对说明 ')+(a.withNotes||0)+'</span></div>'+
      (a.mainTagProgress?'<p class="metric">'+tr('主分类覆盖 ')+a.mainTagProgress.covered+'/'+a.mainTagProgress.total+' · '+tr('待归纳 ')+(a.mainTagProgress.total-a.mainTagProgress.reviewed)+' · '+tr('依据不足 ')+a.mainTagProgress.unresolved+'</p>':'')+
      '<div class="analysis-controls"><button type="button" id="analysis-toggle">'+(a.enabled?tr('暂停全部自动处理'):tr('恢复自动处理'))+tr('</button><button type="button" id="analysis-retry">重试未通过的资料</button></div>')+
      (a.cooldownUntil>Date.now()?tr('<p class="metric">模型暂不可用，将在 ')+esc(new Date(a.cooldownUntil).toLocaleTimeString(uiLocale()))+tr(' 后自动重试。</p>'):'')+
      (a.lastError?tr('<details><summary>最近一次处理问题</summary><p class="metric">')+esc(uiError(a.lastError))+'</p></details>':'')+
      state.jobs
        .map(
          (j) =>
            '<div class="job"><strong>' +
            esc(
              state.nodes.find((n) => n.id === j.sourceId)?.title || j.sourceId,
            ) +
            "</strong><small>" +
            tr('状态：') + esc(a.fileProgress?.[j.sourceId]?.status==='review'?tr('失败'):a.fileProgress?.[j.sourceId]?.status==='retry'?tr('等待重试'):({queued:tr('排队'),working:tr('正在处理'),paused:tr('已暂停'),done:tr('整份分析已完成')})[j.status]||j.status) +
            " · " +
            esc(tr(j.stage)) +
            '</small>' + stageProgressHTML(j.sourceId) + (j.status === 'done' || a.fileProgress?.[j.sourceId]?.status === 'review' ? '' : '<button type="button" data-job-source="' +
            esc(j.sourceId) +
            '" data-status="' +
            (j.status === "paused" ? "queued" : "paused") +
            '">' +
            (j.status === "paused" ? tr("恢复此文件") : tr("暂停此文件")) +
            "</button>") + '</div>',
        )
        .join("") +
      (a.issues||[]).map(i=>'<details class="analysis-issue"><summary>'+esc(state.nodes.find(n=>n.id===i.sourceId)?.title||i.sourceId)+tr(' · 待核对说明</summary>')+i.messages.map(m=>'<p class="metric">'+esc(m)+'</p>').join('')+(i.error?'<p class="metric">'+esc(i.error)+'</p>':'')+sourceRecoveryHTML(i.sourceId)+'<p>先查看这份资料的原文与具体问题；已取消的旧流程不会因此重开。</p><button type="button" data-issue-source="'+esc(i.sourceId)+'">打开这份原文</button></details>').join('')+
      tr('<p class="metric">当前分析继续使用原有接入。其他模型可单独配置，保存不会切换在途请求。</p><button type="button" id="provider-open">模型与本地 AI 接入</button>')+' <button type="button" id="mcp-open">'+tr('MCP 连接')+'</button>',
    null,
  );
  $('#analysis-toggle').onclick=async()=>{try{await api('analysis',{enabled:!a.enabled});toast(a.enabled?tr('已暂停自动处理；已保存进度保留'):tr('自动处理已启动，将从已保存进度连续接续'));jobsDialog();}catch(e){toast(e.message);}};
  $('#analysis-retry').onclick=async()=>{try{await api('analysis',{retryFailed:true});jobsDialog();}catch(e){toast(e.message);}};
  $('#provider-open').onclick=providerDialog;
  const sources=state.nodes.filter(n=>n.kind==='vault'&&!n.mergedInto);if(!sources.some(n=>n.id===layerSourceId))layerSourceId=vaultId||sources[0]?.id;
  $('#modal-body').insertAdjacentHTML('afterbegin','<section class="source-layer-progress"><h3>'+tr('按资料单独处理')+'</h3><select id="layer-source-choice" aria-label="'+tr('选择资料')+'">'+sources.map(n=>'<option value="'+esc(n.id)+'"'+(n.id===layerSourceId?' selected':'')+'>'+esc(n.title)+'</option>').join('')+'</select><div id="job-layer-controls"></div></section>');
  const paintLayers=()=>{if(layerSourceId)renderLayerControls($('#job-layer-controls'),layerSourceId,{tr,esc,api,toast});};paintLayers();$('#layer-source-choice').onchange=e=>{layerSourceId=e.target.value;paintLayers();};bindRecoveryActions();
  $('#mcp-open').onclick=mcpDialog;
  $$("[data-job-source]").forEach(
    (b) =>
      (b.onclick = async () => {
        await api("job", {
          sourceId: b.dataset.jobSource,
          status: b.dataset.status,
          stage:
            b.dataset.status === "paused"
              ? tr("用户暂停，可续接")
              : tr("已恢复，后台将自动继续"),
        });
        jobsDialog();
      }),
  );
}
async function mcpDialog(){
  const control='/api/mcp-control',tunnelId='';let token='';
  modal(tr('MCP 连接'),'<label class="field">Tunnel ID<input id="tunnel-id" value="'+tunnelId+'" placeholder="tunnel_..." autocomplete="off"></label><label class="field">'+tr('运行 API 密钥（仅本机，不保存）')+'<input id="tunnel-key" type="password" autocomplete="off" spellcheck="false" maxlength="4096"></label><p class="metric">'+tr('仅六个只读工具。密钥不进入网址、日志或浏览器存储。ChatGPT 添加 MCP 时认证选择 None。')+'</p><button type="button" id="tunnel-start">'+tr('启动 Tunnel')+'</button> <button type="button" id="tunnel-stop">'+tr('停止 Tunnel')+'</button> <button type="button" id="tunnel-refresh">'+tr('刷新连接状态')+'</button><p id="tunnel-status" role="status"></p><p class="metric">'+tr('ChatGPT 注册与实际工具调用：尚未验证；不等同于 Tunnel READY。')+'</p><p><a target="_blank" rel="noopener noreferrer" href="https://platform.openai.com/settings/organization/api-keys">'+tr('创建运行密钥：仅 Tunnels Read + Use')+'</a></p><p><a target="_blank" rel="noopener noreferrer" href="https://platform.openai.com/settings/organization/tunnels">'+tr('官方 Tunnel 设置')+'</a> · <a target="_blank" rel="noopener noreferrer" href="http://127.0.0.1:10003/">'+tr('本机独立连接页')+'</a></p>',null);
  const refresh=async()=>{try{const response=await fetch(control+'/status',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();const s=await response.json();token=s.token;const el=$('#tunnel-status');if(el)el.textContent='stdio MCP: '+(s.localMcpReady?'6 read-only tools READY':'not ready')+' · Tunnel: '+(s.ready?'READY':s.processRunning?tr('启动中'):tr('未启动'))+(s.error&&!s.ready?' · '+s.error:'');if($('#tunnel-stop'))$('#tunnel-stop').disabled=!s.processRunning;return s;}catch{if($('#tunnel-status'))$('#tunnel-status').textContent=tr('本机连接控制器未运行。请打开“连接Venus私人隧道.cmd”，再刷新状态。');return null;}};
  $('#tunnel-start').onclick=async()=>{const input=$('#tunnel-key');const selectedTunnelId=$('#tunnel-id').value.trim();if(!/^tunnel_[A-Za-z0-9_-]+$/.test(selectedTunnelId)){toast('Enter your configured Tunnel ID');return;}let key=input.value.trim();if(!key){toast(tr('请先输入运行 API 密钥'));return;}input.value='';try{if(!token&&!await refresh())return;const response=await fetch(control+'/start',{method:'POST',headers:{'Content-Type':'application/json','X-Venus-Token':token},body:JSON.stringify({key,tunnelId:selectedTunnelId}),signal:AbortSignal.timeout(8000)});key='';const s=await response.json();if(!response.ok){$('#tunnel-status').textContent=s.error||tr('连接失败');return;}await refresh();}catch{if($('#tunnel-status'))$('#tunnel-status').textContent=tr('连接失败');}finally{key='';}};
  $('#tunnel-stop').onclick=async()=>{if(!token&&!await refresh())return;try{await fetch(control+'/stop',{method:'POST',headers:{'Content-Type':'application/json','X-Venus-Token':token},body:'{}',signal:AbortSignal.timeout(5000)});await refresh();}catch{toast(tr('连接失败'));}};
  $('#tunnel-refresh').onclick=refresh;await refresh();
}
async function providerDialog(){
  let info;try{const response=await fetch('/api/analysis-provider');if(!response.ok)throw Error('当前后台尚未加载模型接入接口；现有分析未改动。接口会在下一次正常启动后可用。');info=await response.json();}catch(error){toast(error.message);return;}
  const c=info.saved;
  modal(tr('模型与本地 AI 接入'),'<p class="subtle">'+esc(tr('仅保存下次后台启动使用的配置，不切换或终止当前分析。本地模式只连接回环地址，不会自动发送到云端。'))+'</p><p>'+esc(tr('当前：')+info.active.provider+' · '+(info.active.model||tr('模型未显式指定'))+' · '+(info.active.reasoningEffort||tr('推理强度未显式指定')))+'</p><label class="field">'+tr('接入方式')+'<select name="provider" id="provider-kind">'+[['codex','Codex CLI'],['http','HTTP / OpenAI 兼容'],['gemini','Gemini Interactions'],['local','本地 AI / OpenAI 兼容']].map(([id,label])=>'<option value="'+id+'"'+(c.provider===id?' selected':'')+'>'+esc(tr(label))+'</option>').join('')+'</select></label>'+[['model','模型名',c.model],['endpoint','服务基础地址（本地只允许 localhost / 127.0.0.1 / ::1）',c.endpoint],['keyEnv','密钥环境变量名（不填写密钥本身）',c.keyEnv],['reasoningEffort','推理强度（留空使用模型默认）',c.reasoningEffort]].map(([name,label,value])=>'<label class="field">'+esc(tr(label))+'<input name="'+name+'" value="'+esc(value)+'" autocomplete="off"></label>').join('')+'<div class="two-col">'+[['chunkCharacters','每段原文字符',c.chunkCharacters,1000,40000],['maxInputCharacters','总输入字符预算',c.maxInputCharacters,8000,2000000],['maxOutputTokens','输出 token 上限',c.maxOutputTokens,512,64000],['candidateLimit','每轮关联候选上限',c.candidateLimit,0,44],['candidateExcerptCharacters','候选摘录字符上限',c.candidateExcerptCharacters,200,8000],['mainTagCandidateLimit','每轮分类补全候选上限',c.mainTagCandidateLimit,0,20]].map(([name,label,value,min,max])=>'<label class="field">'+esc(tr(label))+'<input type="number" name="'+name+'" min="'+min+'" max="'+max+'" value="'+value+'" required></label>').join('')+'</div><label class="field">'+tr('结构化输出')+'<select name="format"><option value="schema"'+(c.format==='schema'?' selected':'')+'>JSON Schema</option><option value="json"'+(c.format==='json'?' selected':'')+'>JSON (compatibility mode)</option></select></label><p class="metric">'+esc(tr(c.status))+tr('。这里不会测试连接或调用模型。原文会分段完整处理，不会静默截断。')+'</p>',async form=>{await api('analysis-provider',Object.fromEntries(form));toast(tr('配置已保存，仅下次后台启动生效；当前分析保持原接入'));});
  $('#provider-kind').onchange=e=>{if(e.target.value==='local'){const form=e.target.form;for(const [key,value]of Object.entries({chunkCharacters:6000,maxInputCharacters:48000,maxOutputTokens:4096,candidateLimit:6,candidateExcerptCharacters:1000,mainTagCandidateLimit:2}))form.elements[key].value=value;form.elements.endpoint.value='';form.elements.keyEnv.value='';}};
}
async function historyDialog(n) {
  const versions = await (
    await fetch("/api/history?id=" + encodeURIComponent(n.id))
  ).json();
  modal(
    tr("版本历史 · ") + n.title,
    (n.id === "@relations"
      ? tr('<p class="subtle">回退会恢复这份快照中的全部网络关系；回退前的当前关系也会保留为新版本。筛选设置不变，节点继续按已知联系柔性调整。</p>')
      : "") +
      (versions.length
        ? versions
            .map(
              (v) =>
                '<div class="job"><strong>' +
                esc(
                  new Date(v.time).toLocaleString(uiLocale(), {
                    timeZone: "Australia/Sydney",
                  }),
                ) +
                "</strong><small>" +
                esc(v.version) +
                '</small><button type="button" data-version="' +
                esc(v.version) +
                tr('">回退到此版本</button></div>'),
            )
            .join("")
        : tr('<p class="subtle">还没有修改记录。首次修改后会保留原版本。</p>')),
    null,
  );
  $$("[data-version]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api("restore", {
            id: n.id,
            version: b.dataset.version,
            expectedHash: n.hash,
          });
          $("#modal").close();
          toast(tr("已回退；回退前的版本也已保留"));
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
function typeDialog() {
  modal(
    tr("定义新的关系类型"),
    tr('<label class="field">名称<input name="name" required placeholder="例如：互为前提"></label><label class="field">颜色<input name="color" type="color" value="#91b5bd"></label>'),
    async (f) => {
      await api("type", Object.fromEntries(f));
      toast(tr("已新增独立多选筛选项"));
    },
  );
}
function settingsDialog() {
  const s = state.settings;
  modal(
    tr("显示参数 · 可调初值"),
    '<p class="subtle">'+tr('默认显示完整项目星云及全部所属节点；点击节点聚焦，查看全图显示整个星云。项目筛选仍生效，文字随距离缩小、隐藏。')+'</p><div class="two-col">' +
      [
        ["baseRadius", tr("基础半径"), 0.2, 5, 0.1],
        ["growth", tr("每条连接增长比例"), 0, 0.1, 0.001],
        ["distance", tr("知识结构间距"), 5, 100, 1],
      ]
        .map(
          ([id, label, min, max, step]) =>
            '<label class="field">' +
            label +
            '<input name="' +
            id +
            '" type="number" min="' +
            min +
            '" max="' +
            max +
            '" step="' +
            step +
            '" value="' +
            s[id] +
            '"></label>',
        )
        .join("") +
      "</div>",
    async (f) => {
      await api(
        "settings",
        Object.fromEntries([...f].map(([k, v]) => [k, Number(v)])),
      );
      toast(tr("显示参数已保存"));
    },
  );
}
async function relationHash(r) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(r)),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function relationDialog(r, n) {
  const from = r?.from || n?.id,
    kind = state.nodes.find((x) => x.id === from)?.kind,
    options = state.nodes.filter((x) => x.kind === kind && x.id !== from),
    s = r?.sources[0];
  modal(
    r ? tr("纠正关系") : tr("建立有依据的关系"),
    tr('<p class="subtle">同一网络内连接不同内容，必须说明理由，并引用已保存内容中的原句。</p><label class="field">目标<select name="to">') +
      options
        .map(
          (x) =>
            '<option value="' +
            esc(x.id) +
            '" ' +
            (r?.to === x.id ? "selected" : "") +
            ">" +
            esc(x.title) +
            "</option>",
        )
        .join("") +
      tr('</select></label><div class="two-col"><label class="field">关系类型<select name="type">') +
      state.types
        .map(
          (t) =>
            '<option value="' +
            esc(t.id) +
            '" ' +
            (r?.type === t.id ? "selected" : "") +
            ">" +
            esc(tr(t.name)) +
            "</option>",
        )
        .join("") +
      tr('</select></label><label class="field">强度 0–1<input type="number" min="0" max="1" step=".01" name="strength" value="') +
      (r?.strength ?? 0.6) +
      tr('"></label></div><label class="field">连接原因简述<input name="summary" maxlength="60" value="') +
      esc(r?.summary || r?.reason?.slice(0, 28) || "") +
      tr('" required></label><label class="field">完整理由<input name="reason" value="') +
      esc(r?.reason || "") +
      tr('" required></label><label class="field">依据内容<select name="sourceId">') +
      state.nodes
        .map(
          (x) =>
            '<option value="' +
            esc(x.id) +
            '" ' +
            ((s?.id || from) === x.id ? "selected" : "") +
            ">" +
            esc(x.title) +
            "</option>",
        )
        .join("") +
      tr('</select></label><label class="field">逐字引文<textarea name="quote" style="min-height:90px" required>') +
      esc(s?.quote || "") +
      '</textarea></label><div class="two-col">' +
      [
        ...new Set([
          tr("结构"),
          tr("主导"),
          tr("直接"),
          tr("互相关联"),
          ...Object.keys(r?.dimensions || {}),
        ]),
      ]
        .map(
          (key) =>
            '<label class="field">' +
            esc(key) +
            '<select name="dim:' +
            esc(key) +
            tr('"><option value="">未指定</option><option value="true" ') +
            (r?.dimensions?.[key] === true ? "selected" : "") +
            tr('>是</option><option value="false" ') +
            (r?.dimensions?.[key] === false ? "selected" : "") +
            tr(">否</option></select></label>"),
        )
        .join("") +
      "</div>",
    async (f) => {
      const x = Object.fromEntries(f);
      selectedEdge = await api("relation", {
        id: r?.id,
        from,
        to: x.to,
        type: x.type,
        strength: Number(x.strength),
        reason: x.reason,
        summary: x.summary,
        sources: [
          { id: x.sourceId, quote: x.quote },
          ...(r?.sources?.slice(1) || []),
        ],
        dimensions: Object.fromEntries(
          [...f]
            .filter(([k, v]) => k.startsWith("dim:") && v !== "")
            .map(([k, v]) => [k.slice(4), v === "true"]),
        ),
        expectedHash: r ? await relationHash(r) : undefined,
      });
      renderInspector();
      toast(tr("关系与依据已写入 MD"));
    },
  );
}
const categoryFilters = new Map();
function selectedCategories(kind) {
  if (!categoryFilters.has(kind)) categoryFilters.set(kind, new Set());
  return categoryFilters.get(kind);
}
function matchesCategories(n, kind = n.kind) {
  const selected = selectedCategories(kind);
  return (
    !selected.size ||
    (n.categories || []).some((t) => selected.has(t)) ||
    (!n.categories?.length && selected.has("@unclassified"))
  );
}
function categoryFilterHTML(kind) {
  const counts = new Map();
  for (const n of state.nodes.filter((n) => n.kind === kind)) {
    for (const t of n.categories || []) counts.set(t, (counts.get(t) || 0) + 1);
    if (!n.categories?.length)
      counts.set("@unclassified", (counts.get("@unclassified") || 0) + 1);
  }
  return (
    '<details class="category-filter-panel" ' +
    (selectedCategories(kind).size ? "open" : "") +
    tr("><summary>类别标签 · ") +
    counts.size +
    tr(' <span>多选</span></summary><button type="button" class="text-button" data-category-all="') +
    kind +
    tr('">全部类别</button>') +
    [...counts]
      .sort()
      .map(
        ([name, count]) =>
          '<label class="filter category-filter"><input type="checkbox" data-category-filter="' +
          esc(name) +
          '" data-kind="' +
          kind +
          '" ' +
          (selectedCategories(kind).has(name) ? "checked" : "") +
          "><span>" +
          esc(name === "@unclassified" ? tr("待归纳分类") : name) +
          " <small>" +
          count +
          "</small></span></label>",
      )
      .join("") +
    tr('<p class="metric">勾选类别取并集；不删除资料或关系。</p></details>')
  );
}
function bindCategoryFilters() {
  document.querySelectorAll("[data-category-filter]").forEach(
    (c) =>
      (c.onchange = () => {
        const set = selectedCategories(c.dataset.kind);
        if (c.checked) set.add(c.dataset.categoryFilter);
        else set.delete(c.dataset.categoryFilter);
        if (graph) {
          updateGraph();
          if(c.checked)focusFilteredContent({category:c.dataset.categoryFilter});else graph.setHighlight?.([]);
          renderInspector();
        } else {
          chosen = null;
          render();
        }
      }),
  );
  document.querySelectorAll("[data-category-all]").forEach(
    (b) =>
      (b.onclick = () => {
        selectedCategories(b.dataset.categoryAll).clear();
        if (graph) {
          updateGraph();
          renderInspector();
        } else {
          chosen = null;
          render();
        }
      }),
  );
}
function focusFilteredContent({relationType,category,mainTag}={}){
  if(!graph)return;const kind=view.replace('-network',''),nodes=state.nodes.filter(n=>n.kind===kind&&!n.mergedInto),ids=new Set();
  if(mainTag){if(!graph.focusMainTag?.(mainTag.split('::')[0]))toast(tr('当前筛选没有匹配节点或关系'));return;}
  if(relationType){const visible=new Set(graph.renderNodes.map(n=>n.id));for(const r of state.relations)if(r.type===relationType&&!hidden.has(r.type)&&visible.has(r.from)&&visible.has(r.to)){ids.add(r.from);ids.add(r.to);}}
  else for(const n of nodes)if((!category||(n.categories||[]).includes(category))&&(!mainTag||(n.mainTags||[]).some(t=>t.name===mainTag)))ids.add(n.id);
  if(!ids.size||!graph.focusNodes?.([...ids]))toast(tr('当前筛选没有匹配节点或关系'));
}
function classificationHTML(n) {
  return (
    tr('<section class="classification-section"><h4>归纳分类') +
    (n.classificationNeedsReview || n.analysisNeedsReview ? tr(" · 依据待复核") : "") +
    '</h4><p class="subtle"'+(!n.classification?.summary?' data-classification-placeholder="'+esc(n.id)+'"':'')+'>' +
    esc(
      n.classification?.summary ||
        classificationPlaceholder(state.execution),
    ) +
    '</p><div class="category-chips">' +
    (n.categories || [])
      .map((t) => '<span class="category-chip"># ' + esc(t) + "</span>")
      .join("") +
    '</div><button class="text-button" data-classify="' +
    esc(n.id) +
    '">' +
    (n.categories?.length ? tr("查看依据 / 修正标签") : tr("归纳并添加标签")) +
    "</button></section>"
  );
}
function bindClassification() {
  document
    .querySelectorAll("[data-classify]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          classificationDialog(
            state.nodes.find((n) => n.id === b.dataset.classify),
          )),
    );
}
function classificationDialog(n) {
  const row = (tag = {}) =>
    tr('<fieldset class="tag-editor"><button type="button" class="remove-tag" title="移除此标签">×</button><label class="field">类别标签<input data-tag-name value="') +
    esc(tag.name || "") +
    tr('" required maxlength="40"></label><label class="field">分类理由<input data-tag-reason value="') +
    esc(tag.reason || "") +
    tr('" required></label><label class="field">正文中的依据原句<textarea data-tag-quote required>') +
    esc(tag.quote || "") +
    "</textarea></label></fieldset>";
  modal(
    tr("归纳分类 · ") + n.title,
    tr('<p class="subtle">这是') +
      esc(labels[n.kind]) +
      tr('的内容类别标签，与关系类型独立。每个标签都保留分类理由与原句依据。</p><label class="field">内容归纳<textarea name="summary" required style="min-height:80px">') +
      esc(n.classification?.summary || "") +
      '</textarea></label><div id="classification-rows">' +
      (n.classification?.tags?.length ? n.classification.tags : [{}])
        .map(row)
        .join("") +
      tr('</div><button type="button" class="text-button" id="add-tag-row">＋ 添加类别标签</button>'),
    async (f) => {
      const tags = [
        ...document.querySelectorAll("#classification-rows .tag-editor"),
      ].map((el) => ({
        name: el.querySelector("[data-tag-name]").value,
        reason: el.querySelector("[data-tag-reason]").value,
        quote: el.querySelector("[data-tag-quote]").value,
      }));
      if(!state.features?.classification)throw Error(tr("分类接口等待本机服务重新载入，当前归纳内容尚未保存。"));
      await api("classify", {
        id: n.id,
        summary: f.get("summary"),
        tags,
        expectedHash: n.classificationHash,
        sourceHash: n.hash,
        method: "manual",
      });
      toast(tr("归纳与类别标签已保存，原文保持完整"));
    },
  );
  const bindRows = () =>
    document
      .querySelectorAll(".remove-tag")
      .forEach((b) => (b.onclick = () => b.closest(".tag-editor").remove()));
  bindRows();
  $("#add-tag-row").onclick = () => {
    $("#classification-rows").insertAdjacentHTML("beforeend", row());
    bindRows();
  };
}
let graphData;
function updateGraph() {
  if (!graph) return;
  const kind = view.replace("-network", "");
  const {nodes,edges}=projectLayerRelations(state.nodes,state.relations,kind);
  graphData = {
    nodes,
    edges,
    positions: state.positions,
    layoutEpoch:state.layoutEpochs?.[kind]||0,
    types: state.types,
    settings: state.settings,
    hidden,
    visibleRelationTypes:relationVisibility.selected,
    mainTag:mainTagSelections[kind]||null,
    visibleIds: new Set(
      nodes.filter((n) => matchesCategories(n, kind)&& (kind!=='knowledge'||!knowledgeTopic||knowledgeTopicNames(n).includes(knowledgeTopic))).map((n) => n.id),
    ),
  };
  graph.update(graphData);
  if(kind==='knowledge'&&$('#knowledge-project'))$('#knowledge-project').value=knowledgeProjectFilter()||'';
  $("#node-locate").innerHTML =
    tr('<option value="">定位任意节点…</option>') +
    nodes
      .map(
        (n) =>
          '<option value="' +
          esc(n.id) +
          '" ' +
          (graph.selected === n.id ? "selected" : "") +
          ">" +
          esc(shortNodeLabel(n,42)) +
          "</option>",
      )
      .join("");
  $(".graph-empty").hidden = nodes.length > 0;
}
function renderNetwork() {
  $("#files-host").replaceChildren();
  const scope = {
    "vault-network": tr("跨 Markdown 文档关系"),
    "knowledge-network": tr("跨文档知识点关系"),
    "skill-network": tr("整合技能之间的关系"),
  };
  $("#main").innerHTML =
    '<div class="graph-shell"><div class="graph-toolbar"><div><h1>' +
    labels[view] +
    '</h1><div class="subtle">' +
    scope[view] +
    tr(' · 三维空间 · 依据联系紧密度浮动</div><div class="heat-legend" aria-label="重要程度由低到高">')+
    NETWORK_HEAT_LEVELS.map((h,i)=>'<span title="'+esc(h.name+' · '+h.label)+'"><i style="background:'+h.color+'"></i>'+(i+1)+'</span>').join('')+
    tr('</div></div><div class="actions"><select id="node-locate" aria-label="定位任意节点"></select><button id="fit-graph">查看全图</button></div></div><div id="graph-area" class="graph-area" aria-label="可环绕缩放的三维网络"><div class="graph-stats" id="graph-stats"></div><div class="graph-camera" id="graph-camera"></div><div class="graph-empty"><h2>让关系逐步浮现</h2><p>资料与依据保存后，节点会自动出现。</p></div><div class="graph-hint">颜色：使用与持续推进热度　拖动：环绕　滚轮：缩放　点击：观察中心　双击：进入内容　文字随距离缩小、隐藏</div></div></div>');
  try {
    $('#graph-area').insertAdjacentHTML('beforeend', '<details class="graph-task-float"><summary id="graph-task-summary">'+esc(taskSummaryText())+'</summary><div id="graph-activity" aria-label="'+esc(tr('活动文件'))+'">'+compactSlotsHTML()+'</div><div id="graph-token-usage">'+tokenUsageHTML()+'</div></details>');
    bindTaskDetails();
    if(view==='knowledge-network'){$('.graph-toolbar').insertAdjacentHTML('afterend','<div class="knowledge-project-controls">'+knowledgeOrganizationControls()+'</div>');bindKnowledgeOrganization();}
    graph = new Network($("#graph-area"), {
      layoutKey: view,
      onCheckpoint: (positions) => {
        if (!benchmark && state.features?.dynamicLayout)
          fetch("/api/layout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: view.replace("-network", ""),
              positions,
              epoch:graph.layoutEpoch||0,
              protocol:2,
            }),
          }).catch(() => {});
      },
      onSelect: (n) => {
        if(navigationContext?.to!==n.id)navigationContext=null;
        selectedEdge = null;
        $("#node-locate").value = n.id;
        renderInspector();
      },
      onMainTag:(name)=>{const kind=view.replace('-network','');mainTagSelections[kind]=mainTagSelections[kind]===name?null:name;updateGraph();if(mainTagSelections[kind])focusFilteredContent({mainTag:mainTagSelections[kind]});renderInspector();},
      onClearSelection:()=>{if($('#node-locate'))$('#node-locate').value='';selectedEdge=null;navigationContext=null;renderInspector();},
      onOpen: (n) => {
        if (benchmark) toast(tr("合成试验节点没有内容页"));
        else navigate(n.kind, n.id);
      },
      onEdge: (e) => {
        selectedEdge = e;
        renderInspector();
      },
      onStats: (s) => {
        $("#graph-area").dataset.layoutSteps = String(s.layoutSteps);
        $("#graph-area").dataset.runtimeMetrics=JSON.stringify(s.runtimeMetrics);
        $("#graph-area").dataset.layoutSample = JSON.stringify(
          graph?.renderNodes
            ?.slice(0, 3)
            .map((n) => ({ id: n.id, position: graph.positions[n.id] })),
        );
        $("#graph-stats").textContent =
          (benchmark ? tr("临时合成数据 · 不保存　") : "") +
          s.nodes + ' / ' + s.totalNodes +
          tr(" 个节点 / ") +
          s.edges +
          tr(" 条显示关系　·　") +
          s.fps +
          tr(" FPS · 浮动布局");
        $("#graph-camera").textContent =
          tr("相机 ") +
          s.camera.map((v) => v.toFixed(1)).join(" / ") +
          tr("　中心 ") +
          s.target.map((v) => v.toFixed(1)).join(" / ");
      },
    });
    updateGraph();
    graph.setAnimationPaused(networkAnimationPaused);
    const fit=$('#fit-graph');fit.insertAdjacentHTML('beforebegin','<button type="button" id="pause-network" aria-pressed="'+networkAnimationPaused+'">'+esc(tr(networkAnimationPaused?'继续动画':'暂停动画'))+'</button>');
    $('#pause-network').onclick=()=>{networkAnimationPaused=graph.setAnimationPaused(!networkAnimationPaused);$('#pause-network').setAttribute('aria-pressed',String(networkAnimationPaused));$('#pause-network').textContent=tr(networkAnimationPaused?'继续动画':'暂停动画');};
    $("#fit-graph").onclick = () => graph.fit();
    $("#node-locate").onchange = (e) => {
      if (e.target.value) graph.select(e.target.value);
      else graph.fit();
    };
  } catch (e) {
    $("#graph-area").innerHTML =
      tr('<div class="empty"><h2>三维视图暂不可用</h2><p>') +
      esc(e.message) +
      tr("</p><p>请使用支持 WebGL 2 的桌面浏览器。</p></div>");
    toast(tr("三维渲染失败，请检查浏览器图形支持"));
  }
  renderInspector();
}
function benchmarkDialog() {
  modal(
    tr("临时性能试验"),
    tr('<p class="subtle">仅在当前视图绘制合成节点与关系，不写入资料目录。结果只代表当前机器与当前布局。</p><label class="field">规模<select name="count"><option>100</option><option>1000</option><option>2306</option><option>9608</option><option>10000</option></select></label><label class="field">试验布局<select name="topology"><option value="orbital">24 域公转与共享节点</option><option value="legacy">原有连链试验</option></select></label>'),
    (f) => {
      const count = Number(f.get("count")),
        nodes = [],
        edges = [],
        positions = {};
      const orbital=f.get('topology')==='orbital',kind=view.replace('-network','');
      for (let i = 0; i < count; i++) {
        const id = "bench-" + i;
        nodes.push({ id, title: tr("试验节点 ") + i,...(orbital?{kind,mainTags:[{name:'Sample '+String(i%24).padStart(2,'0'),reason:'Synthetic orbital benchmark',quote:'Sample'},...(i<24?[{name:'Sample '+String((i+1)%24).padStart(2,'0'),reason:'Synthetic shared node',quote:'Sample'}]:[])]}:{}) });
        positions[id] = [
          Math.sin(i * 2.39) * Math.sqrt(i) * 3,
          Math.cos(i * 0.71) * Math.sqrt(i) * 3,
          Math.sin(i * 0.93) * Math.sqrt(i) * 3,
        ];
        if (i&&!orbital)
          edges.push({
            id: "be-" + i,
            from: id,
            to: "bench-" + Math.max(0, i - 1),
            type: state.types[i % state.types.length].id,
            strength: 0.5,
          });
      }
      benchmark = true;
      graph.selected = null;
      graphData = {
        nodes,
        edges,
        positions,
        types: state.types,
        settings: state.settings,
        hidden,
      };
      graph.update(graphData);
      graph.fit();
      $(".graph-empty").hidden = true;
      renderInspector();
      $("#node-locate").innerHTML =
        tr("<option>临时合成数据；切换视图退出</option>");
      toast(tr("试验数据不会保存，切换视图返回真实资料"));
    },
    tr("开始试验"),
  );
}
$$("[data-view]").forEach((b) => (b.onclick = () => {
  document.body.classList.remove('left-open', 'files-open');
  navigate(b.dataset.view);
}));
$("#import-open").onclick = importDialog;
$("#jobs-open").onclick = jobsDialog;
const events = new EventSource("/api/events");
let lifecycleBusy = false;
async function controlVenus(action) {
  if (lifecycleBusy) return;
  if ($("#modal").open) { toast(tr("请先保存或关闭正在编辑的内容")); return; }
  lifecycleBusy = true;
  const buttons = [$("#venus-restart"), $("#venus-shutdown")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    if (graph?.layout && !benchmark) {
      await fetch('/api/layout', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind:view.replace('-network',''), positions:graph.layout.checkpoint(),epoch:graph.layoutEpoch||0,protocol:2})});
    }
    const response = await fetch('/api/lifecycle', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action})});
    const result = await response.json();
    if (!response.ok) throw new Error(uiError(result.error));
    events.close();
    graph?.dispose(); graph = null;
    if (action === 'shutdown') {
      $('#connection').textContent = tr('关闭请求已接受，等待后台退出');
      $('#main').innerHTML = '<div class="empty"><h2>'+tr('关闭请求已接受，等待后台退出')+'</h2></div>';
      $('#inspector').replaceChildren();
      // The launcher reuses this window. Reconnect when the user starts Venus again.
      let shutdownObserved=false;
      const reconnect = setInterval(async () => {
        try {
          const response=await fetch('/api/state?summary=1',{cache:'no-store',signal:AbortSignal.timeout(1500)});
          if(response.ok&&shutdownObserved){clearInterval(reconnect);location.reload();}
        } catch {shutdownObserved=true;$('#connection').textContent=tr('后台连接已断开');$('#main').innerHTML='<div class="empty"><h2>'+tr('后台连接已断开')+'</h2><p>'+tr('重新使用时，请运行 Start-Venus.cmd。')+'</p></div>';}
      },3000);
      return;
    }
    $('#connection').textContent = tr('正在重启 Venus…');
    // Wait past the old process response before checking the replacement.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const ready = await fetch('/api/state', {cache:'no-store', signal:AbortSignal.timeout(1500)});
        if (ready.ok) { location.reload(); return; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(tr('未能确认重启成功，请运行 Start-Venus.cmd'));
  } catch (error) {
    toast(error.message);
    lifecycleBusy = false;
    buttons.forEach((b) => (b.disabled = false));
  }
}
$('#venus-restart').onclick = () => controlVenus('restart');
$('#venus-shutdown').onclick = () => controlVenus('shutdown');
let passiveProtocol=false,deltaRefreshInFlight=null;
function decorateChangedNode(node){const byId=new Map(state.nodes.map(n=>[n.id,n])),analysis=node.classification?.projectMembershipAnalysis;byId.set(node.id,node);const review=analysis?.method==='semantic-project-content'&&(analysis.sourceHash!==node.hash||(node.classification.projectMemberships||[]).some(p=>(p.grounds||[]).some(g=>[g.subject,g.project].some(e=>!e?.nodeId||byId.get(e.nodeId)?.hash!==e.sourceHash))));const prepared={...node,projectMembershipNeedsReview:!!review},direct=explicitProjects(prepared),inherited=(node.sources||[]).flatMap(s=>byId.get(s.id)?.projectScopes||[]);prepared.projectScopes=direct.length||Array.isArray(node.classification?.projectMemberships)?direct:[...new Map(inherited.map(p=>[p.id,p])).values()];prepared.projectOrganization=true;prepared.tagHierarchy=nodeTagHierarchy(prepared);return prepared;}
async function refreshDelta(){if(!libraryRefreshPolicy.loaded)return;if(deltaRefreshInFlight)return deltaRefreshInFlight;deltaRefreshInFlight=(async()=>{const response=await fetch('/api/library/delta?since='+state.revision);if(!response.ok)return;const delta=await response.json();if(delta.resetRequired){libraryRefreshPolicy.invalidate();await refresh({progressOnly:true});return;}if(!delta.upserts.length&&!delta.removed.length)return;const changed=new Map(delta.upserts.map(n=>[n.id,decorateChangedNode(n)])),removed=new Set(delta.removed),updated=state.nodes.filter(n=>!removed.has(n.id)).map(n=>{const replacement=changed.get(n.id);if(!replacement)return n;changed.delete(n.id);return {...n,...replacement,heat:networkActivityHeat(replacement.heat)};});for(const node of changed.values())updated.push({...node,heat:networkActivityHeat(node.heat)});state={...state,nodes:updated,revision:delta.revision,relations:delta.relations||state.relations};libraryRefreshPolicy.revision=delta.revision;for(const kind of ['vault','knowledge','skill','concept'])$('#'+kind+'-count').textContent=state.nodes.filter(n=>n.kind===kind&&!n.mergedInto).length;if(graph&&!benchmark){updateGraph();renderInspector();}else if(!benchmark)render();})().finally(()=>deltaRefreshInFlight=null);return deltaRefreshInFlight;}
events.onmessage = event => {if(!passiveProtocol){libraryRefreshPolicy.observeRevision(event.data);refresh({progressOnly:true}).catch(e=>toast(e.message));}};
events.addEventListener('library-delta',()=>{passiveProtocol=true;refreshDelta().catch(e=>toast(e.message));});
events.addEventListener('task-status',event=>{taskEventConnection='connected';passiveProtocol=true;const taskControl=JSON.parse(event.data);state={...state,taskControl,execution:acceptExecutionSnapshot(state.execution,taskControl.execution)};updateExecutionSourceViews();paintTaskControls();paintProcessingStatus();});
events.onopen = () => ($("#connection").textContent = tr("本机已连接"));
events.onerror = () => ($("#connection").textContent = tr("正在重新连接"));
// No periodic status/model requests. Completion events and explicit actions update state.
const refreshSavedTask=async()=>{await refresh({progressOnly:true});await refreshDelta();if(taskEventConnection!=='connected')taskEventConnection='snapshot';paintTaskControls();};
$('#manual-status-refresh').onclick=refreshSavedTask;
$('#fixed-progress-refresh').onclick=refreshSavedTask;
events.addEventListener('error',()=>{taskEventConnection='disconnected';paintTaskControls();});
events.addEventListener('open',()=>{taskEventConnection='snapshot';paintTaskControls();});
$('#manual-question-open').onclick=()=>{const operationId=crypto.randomUUID();modal('Ask a question','<p>This explicitly submits one question to gpt-6.1-sol. It may use model tokens. No library contents are attached. It will not interrupt active analysis.</p><label class="field">Question<textarea name="question" required maxlength="12000"></textarea></label>',async form=>{const response=await fetch('/api/manual-question',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId,question:form.get('question')})});const answer=await response.json();if(!response.ok)throw Error(answer.error);modal('Saved answer','<pre>'+esc(answer.answer)+'</pre>',null);});};
setInterval(()=>{const el=$('#request-timing'),request=state.execution?.taskRequest;if(!el||!request)return;const wallStart=Date.parse(request.issuedAt),end=Date.parse(request.savedAt||request.returnedAt||request.closedAt);el.textContent='Task '+request.taskId.slice(0,8)+' · '+request.status+(Number.isFinite(wallStart)?' · wall clock '+Math.max(0,Math.floor(((Number.isFinite(end)?end:Date.now())-wallStart)/1000))+' s':'')+(Number.isFinite(request.activeRequestMs)?' · completed requests '+Math.round(request.activeRequestMs/1000)+' s':'');},1000);
refresh().then(()=>refreshDelta()).catch((e) => {
  $("#connection").textContent = tr("连接失败");
  toast(e.message);
});

const uiIcons = {
  vault:
    '<path d="M3 7h7l2-3h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  knowledge:
    '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4V4ZM12 5v15"/>',
  skill: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/>',
  concept:'<path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4Z"/>',
  network:
    '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="11" cy="19" r="2"/><path d="m7 6 10-1M6 8l4 9m8-10-6 10"/>',
};
for (const b of document.querySelectorAll(".side-link[data-view]")) {
  const span = b.querySelector("span");
  if (span)
    span.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      uiIcons[
        b.dataset.view.endsWith("-network") ? "network" : b.dataset.view
      ] +
      "</svg>";
}
$("#left-pane-toggle").onclick = () => {
  if (matchMedia('(max-width: 1000px)').matches) document.body.classList.toggle('left-open');
  else document.body.classList.toggle('left-collapsed');
};
$("#right-pane-toggle").onclick = () => {
  if (matchMedia('(max-width: 1200px)').matches) document.body.classList.toggle('right-open');
  else document.body.classList.toggle('right-collapsed');
};
$('#file-pane-toggle').onclick = () => document.body.classList.toggle('files-open');
$("#ribbon-search").onclick = () => {
  document.body.classList.remove("left-collapsed");
  if (view.endsWith("-network")) navigate("vault");
  if (matchMedia('(max-width: 680px)').matches) document.body.classList.add('files-open');
  $("#list-search")?.focus();
};
$("#ribbon-import").onclick = importDialog;
$("#ribbon-jobs").onclick = jobsDialog;
const workspaceControls=initWorkspaceControls({getState:()=>state,refresh,onError:error=>toast(error.message)});
$("#ribbon-task-start").onclick=workspaceControls.start;
$("#ribbon-task-pause").onclick=()=>controlTasks("pause");


$('#mcp-connect-open').onclick=mcpDialog;
function paintAIConnection(entry){
 const button=document.querySelector('[data-ai-entry="'+entry.id+'"]');if(!button)return;
 const fresh=entry.checkedAt&&Date.now()-Date.parse(entry.checkedAt)<90000;
 const connected=entry.detected===true&&entry.ready===true&&fresh;
 button.classList.toggle('ai-connected',!!connected);
 button.dataset.connection=connected?'connected':entry.detected&&fresh?'unavailable':'unchecked';
 const name=({gpt:'GPT',claude:'Claude',gemini:'Gemini',local:tr('本地 AI')})[entry.id];
 const status=connected?tr('已连接'):entry.detected&&fresh?tr(entry.status):tr('尚未检测');
 button.title=name+' · '+status+(entry.checkedAt?' · '+entry.checkedAt:'');button.setAttribute('aria-label',name+' · '+status);
}
async function refreshAIConnections({detect=false}={}){
 try{const response=await fetch('/api/ai-connections');if(!response.ok)throw Error('unavailable');const info=await response.json();for(const entry of info.families)paintAIConnection(entry);
 if(detect)await Promise.allSettled(info.families.map(async entry=>{try{const r=await fetch('/api/ai-connections/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({family:entry.id})});if(!r.ok)throw Error('unavailable');paintAIConnection(await r.json());}catch{paintAIConnection({id:entry.id});}}));
 }catch{document.querySelectorAll('[data-ai-entry]').forEach(b=>paintAIConnection({id:b.dataset.aiEntry}));}
}
refreshAIConnections({detect:true});
// Connection detection runs on explicit UI actions, never on a timer.
async function aiConnectionDialog(family){
  const name=({claude:'Claude',gemini:'Gemini',gpt:'GPT',local:tr('本地 AI')})[family];
  modal(name+' · '+tr('连接'),'<p>'+tr('点击开始后，仅检查本机兼容客户端、已有配置和指定本地服务，不调用模型、不切换当前分析。')+'</p><p class="metric">'+tr('网页登录不等于本机模型 API。MCP 用于只读知识检索，不能代替模型推理连接。')+'</p><button type="button" id="ai-detect-start">'+tr('开始检测')+'</button><div id="ai-connection-result" role="status"></div>',null);
  $('#ai-detect-start').onclick=async event=>{const context=currentButtonAction();event.target.disabled=true;const host=$('#ai-connection-result');host.textContent=tr('正在检查本机连接…');try{
    const response=await fetch('/api/ai-connections/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({family})});const result=await response.json();if(!response.ok)throw Error(result.error||tr('当前后台尚未加载 AI 连接入口'));paintAIConnection(result);
    host.innerHTML='<p><strong>'+esc(tr(result.status))+'</strong></p>'+(result.connection?'<p>'+esc(result.connection.provider+' · '+result.connection.model)+'</p>':'')+(result.services?.length?'<ul>'+result.services.map(s=>'<li>'+esc(s.endpoint)+' · '+esc(s.models.join('、')||tr('尚未加载模型'))+'</li>').join('')+'</ul>':'')+'<ol>'+result.steps.map(step=>'<li>'+esc(tr(step))+'</li>').join('')+'</ol><p class="metric">'+tr('当前分析继续使用原接入。新增登录、凭证和授权由你完成，不会自动启用公网连接。')+'</p><button type="button" id="ai-model-config">'+tr('模型接入配置')+'</button> <button type="button" id="ai-mcp-config">'+tr('MCP 只读知识连接')+'</button>';
    if(result.ready){host.insertAdjacentHTML('beforeend','<p><button type="button" id="ai-use-new-tasks">'+tr('仅用于接下来新建的独立任务')+'</button></p>');$('#ai-use-new-tasks').onclick=()=>{pendingLayerProvider=family;toast(name+' · '+tr('已用于新任务；当前处理保持原接入'));$('#modal').close();};}
    actionResult(context,{message:tr(result.status)});$('#ai-model-config').onclick=()=>aiConnectionConfigDialog(family);$('#ai-mcp-config').onclick=mcpDialog;
  }catch(error){actionResult(context,{error:error.message});host.textContent=error.message;}finally{if(event.target.isConnected)event.target.disabled=false;}};
}
document.querySelectorAll('[data-ai-entry]').forEach(button=>button.onclick=()=>aiConnectionDialog(button.dataset.aiEntry));
async function aiConnectionConfigDialog(family){
  try{const response=await fetch('/api/ai-connections');if(!response.ok)throw Error(tr('当前后台尚未加载 AI 连接入口'));const info=await response.json(),c=info.saved?.[family]||{},providers=({claude:[['http','HTTP / OpenAI 兼容']],gemini:[['gemini','Gemini Interactions'],['http','HTTP / OpenAI 兼容']],gpt:[['codex','Codex CLI'],['http','HTTP / OpenAI 兼容']],local:[['local','本地 AI / OpenAI 兼容']]})[family];
    modal(tr('独立连接配置'),'<p>'+tr('此配置仅属于当前入口，不改变正在处理资料的模型。由你完成新增登录或密钥授权；这里只填写环境变量名。')+'</p><label class="field">'+tr('接入方式')+'<select name="provider">'+providers.map(([id,label])=>'<option value="'+id+'"'+(c.provider===id?' selected':'')+'>'+esc(tr(label))+'</option>').join('')+'</select></label>'+[['model','模型名',c.model],['endpoint','服务基础地址',c.endpoint],['keyEnv','密钥环境变量名（不填写密钥本身）',c.keyEnv]].map(([key,label,value])=>'<label class="field">'+esc(tr(label))+'<input name="'+key+'" value="'+esc(value||'')+'" autocomplete="off"></label>').join(''),async form=>{await api('ai-connections/configure',{family,...Object.fromEntries(form),reasoningEffort:'low'});paintAIConnection({id:family});toast(tr('独立连接已保存；当前处理保持原接入'));});
  }catch(error){toast(error.message);}
}
