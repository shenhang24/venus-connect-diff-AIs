import { tr, uiLocale } from './i18n.js';
// Shared UI feedback. Completion here means the handler returned, never that a queued job finished.
const activeActions=new Map();
let actionContext=null,feedbackDocument=null;
const wrappedAction=Symbol('venus-button-action');
function buttonKey(button){return button.id||JSON.stringify(Object.entries(button.dataset).filter(([key])=>!key.startsWith('action')).sort())+'|'+(button.getAttribute('aria-label')||button.textContent.trim());}
function showAction(context,status,message){
 if(!feedbackDocument)return;
 let host=feedbackDocument.querySelector('#action-feedback');
 if(!host){host=feedbackDocument.createElement('div');host.id='action-feedback';host.setAttribute('role','status');host.setAttribute('aria-live','polite');}
 const modal=feedbackDocument.querySelector('#modal[open] #modal-form');(modal||feedbackDocument.body).append(host);
 host.dataset.state=status;host.textContent=context.label+' · '+message;
 context.button.dataset.actionState=status;
}
export function currentButtonAction(){return actionContext||(activeActions.size===1?[...activeActions.values()][0]:null);}
export function actionResult(context,{error=null,message=null}={}){if(!context)return;if(error)context.error=error;else if(message)context.message=message;}
export function runButtonAction(button,action,existingContext=null){
 if(!button)return Promise.resolve().then(action);
 const key=buttonKey(button);if(activeActions.has(key))return activeActions.get(key).promise;
 const context=Object.assign(existingContext||{},{button,key,label:button.getAttribute('aria-label')||button.textContent.trim()});
 activeActions.set(key,context);button.dataset.actionBusy='true';button.setAttribute('aria-busy','true');button.setAttribute('aria-disabled','true');
 showAction(context,'running',tr('正在执行，等待实际结果…'));
 const previous=actionContext;actionContext=context;let result;
 try{result=action();}catch(error){result=Promise.reject(error);}finally{actionContext=previous;}
 context.promise=Promise.resolve(result).then(value=>{showAction(context,context.error?'failed':'returned',context.error?tr('失败：')+context.error:(context.message||tr('操作已返回，请查看实际结果')));return value;},error=>{context.error=error.message;showAction(context,'failed',tr('失败：')+error.message);throw error;}).finally(()=>{
  activeActions.delete(key);for(const item of feedbackDocument?.querySelectorAll('button')||[])if(buttonKey(item)===key){delete item.dataset.actionBusy;item.removeAttribute('aria-busy');item.removeAttribute('aria-disabled');}
  delete button.dataset.actionBusy;button.removeAttribute('aria-busy');button.removeAttribute('aria-disabled');
 });return context.promise;
}
export function installButtonFeedback(doc){
 if(feedbackDocument)return;feedbackDocument=doc;
 doc.addEventListener('click',event=>{
  const button=event.target.closest?.('button');if(!button)return;
  if(activeActions.has(buttonKey(button))){event.preventDefault();event.stopImmediatePropagation();return;}
  button.classList.add('is-pressed');setTimeout(()=>button.classList.remove('is-pressed'),150);
  const handler=button.onclick;if(!handler||handler[wrappedAction])return;
  const wrapper=function(event){
   // Native async handlers are tracked as one action, including API calls before their first await.
   if(handler.constructor.name==='AsyncFunction')return runButtonAction(button,()=>handler.call(this,event)).catch(()=>{});
   const previous=actionContext;const context={button,label:button.getAttribute('aria-label')||button.textContent.trim()};actionContext=context;let result;
   try{result=handler.call(this,event);}finally{actionContext=previous;}
   if(result?.then)return runButtonAction(button,()=>result,context).catch(()=>{});return result;
  };wrapper[wrappedAction]=true;button.onclick=wrapper;
 },true);
 new MutationObserver(()=>{for(const button of doc.querySelectorAll('button'))if(activeActions.has(buttonKey(button))){button.dataset.actionBusy='true';button.setAttribute('aria-busy','true');button.setAttribute('aria-disabled','true');}}).observe(doc.body,{childList:true,subtree:true});
}
export class SavedProgressObserver{
 constructor(){this.records=new Map();}
 observe(key,offset,now=Date.now(),savedToken=null){
  let old=this.records.get(key);if(old&&offset<old.offset)old=null;const next={offset,firstRead:old?.firstRead||now,lastRead:now,lastAdvance:old?.lastAdvance||null};
  if(old&&(offset>old.offset||(savedToken&&((old.savedToken&&savedToken>old.savedToken)||(!old.savedToken&&Date.parse(savedToken)>old.lastRead)))))next.lastAdvance=now;next.savedToken=savedToken;this.records.set(key,next);return next;
 }
}
export function conceptRecheckMessage(result){return tr(result.needsUser?result.message:result.fastPassed?'源指纹和覆盖未变，无缺口：本地跳过，未调用模型。':result.structuralPassed?'本地完整性核验通过，未调用模型。':result.inProgress?'现有概念执行器正在运行，未重复建立任务；可在当前核对结束后再次检查。':'仅覆盖缺口已登记到现有概念层；尚未完成。');}
export function processingState(state,now=Date.now()){
 const review=state.conceptContentReview,a=state.analysis,independent=state.independentLayers,flows=[],evidence=state.processingEvidence||{};
 const execution=state.execution;
 const executionPlans={transient:'系统会按保存断点有限重试；不会重复已有结果。',evidence:'先核验失败位置的原文与保存返回；不追加已用纠正预算。',access:'需要处理已报告的权限或登录问题；系统不会绕过限制。',capacity:'等待模型容量恢复；保留断点，不盲目重试。',budget:'自动恢复次数已用完；请核验保留的错误和断点。'};
 if(execution?.enabled||execution?.auxiliaryActivity?.kind==='semantic-navigation'){const phase=execution.phase,mode=['running','starting','resuming','pausing','cancelling'].includes(phase)?'running':phase==='complete'?'complete':phase==='cancelled'?'cancelled':phase==='paused'?'paused':['blocked','storage-blocked','owner-unverified','scheduler-conflict','model-still-running'].includes(phase)?'blocked':'queued',current=execution.current||{},saved=execution.lastSaved||{},labels={running:'全库归纳正在处理',starting:'正在启动原归纳器',resuming:'正在从断点恢复',pausing:'归纳正在保存断点并暂停',paused:'已暂停',cancelling:'正在保存断点并取消',cancelled:'已取消',complete:'当前队列已完成','waiting-recovery':'等待自动恢复',interrupted:'等待断点恢复',blocked:'需要按方案处理','owner-unverified':'执行器身份待核验','scheduler-conflict':'调度所有者冲突','model-still-running':'等待原模型进程退出'};
 flows.push({key:'execution:library',pipeline:tr('归纳分类'),mode,label:tr(labels[phase]||'等待运行状态'),sourceId:current.id||current.ids?.[0]||saved.id,title:current.path||current.paths?.join('、')||saved.path,offset:current.id===saved.id?saved.end:0,total:current.total||null,range:Number.isFinite(current.start)?[current.start,current.end]:null,count:execution.total?[execution.completed,execution.total]:null,lastUpdatedAt:execution.lastUpdatedAt,lastSavedAt:execution.lastSavedAt,step:current.stage||phase,reason:execution.reason,plan:tr(executionPlans[execution.errorKind]||'可先核验断点，再继续当前有效任务。'),error:execution.error?.message,executionControls:{...execution.controls,actions:execution.remediation?.actions||[]},retryAt:execution.retryAt,failureLocation:execution.failureLocation,reviewCard:execution.reviewCard,verification:execution.lastVerification});
 const nav=execution.auxiliaryActivity;if(nav?.kind==='semantic-navigation'){Object.assign(flows.at(-1),{pipeline:tr('语义导航维护'),mode:'running',label:tr(nav.libraryDesired==='paused'?'主归纳已暂停，':nav.libraryEnabled===false?'主归纳未启用，':'主归纳等待，')+tr(nav.phase==='stopping'?'索引维护正在收口':nav.phase==='owner-unverified'?'等待原索引模型核验退出':'索引维护运行中'),nonCharacterRange:true,sourceId:null,lastUpdatedAt:nav.observedAt||nav.startedAt||null,title:'索引维护 · '+(nav.operationId||'待核验')+' · '+(nav.labels||[]).join('、'),offset:0,total:null,range:null,count:null,step:tr(nav.phase==='stopping'?'索引维护收口':'索引维护运行'),lastSavedAt:null,reason:tr('原全库断点保留；本次只处理所列语义标签。索引模型尚未停稳前不恢复其他模型作业。'),executionControls:{...execution.controls,actions:['pause']}});}

 }
 const observation=evidence.$classification,observed=observation?.checkpoint,observedFresh=observed?.verifiedLivePid&&now-Date.parse(observation.observedAt)>=0&&now-Date.parse(observation.observedAt)<=300000;
 if(!execution?.enabled&&observedFresh){const current=observed.current||{},saved=observed.lastSavedSegment||{};flows.push({key:'classification:observed',pipeline:tr('归纳分类'),mode:state.taskControl?.phase==='paused'||state.taskControl?.phase==='pausing'?'paused':'running',label:tr(state.taskControl?.phase==='paused'?'已暂停':state.taskControl?.phase==='pausing'?'归纳正在保存断点并暂停':'全库归纳正在处理'),sourceId:current.id||current.ids?.[0]||saved.id,title:current.path||current.paths?.join('、')||saved.path,offset:current.id===saved.id?saved.end:0,total:observed.sourceTotal,range:Number.isFinite(current.start)?[current.start,current.end]:null,count:[observed.completed,observed.total],lastUpdatedAt:observed.lastUpdatedAt,lastSavedAt:saved.savedAt,step:current.stage||'CLASSIFYING',reason:tr('已核对原执行器存活及分段落盘；旧流程记录单独保留。')});}
 if(!execution?.enabled&&!observedFresh&&state.taskControl?.classificationActive)flows.push({key:'classification:original',pipeline:tr('归纳分类'),mode:state.taskControl.phase==='pausing'?'paused':'running',label:tr(state.taskControl.phase==='pausing'?'归纳正在保存断点并暂停':'全库归纳正在处理'),reason:tr('由原归纳执行器接续；旧派发器保持关闭。')});
 const saved=id=>evidence[id]?.time||null,mainComplete=Number.isFinite(a?.completed)&&a.completed===a.total&&(!a.concepts||a.concepts.coverageComplete===true),mainFailures=(a?.needsReview||0)+(a?.concepts?.failedSegments||0);
 if(review?.current){const c=review.current,restricted=review.blocked??(!review.workerRunning&&(!review.lastError?.current?.id||review.lastError.current.id===c.id)&&(!review.lastError?.time||review.lastError.time>=(review.lastUpdatedAt||''))&&/permission|authentication|blocked by policy|权限|审批|认证/i.test(review.lastError?.message||'')),mode=review.status==='cancelled-semantic-review'?'cancelled':review.workerRunning?'running':restricted?'blocked':review.status==='needs-review'?'failed':'paused';
  flows.push({key:c.id+':review',pipeline:tr('内容核对'),mode,label:tr(mode==='cancelled'?'重复语义复核已取消':mode==='running'?(review.queuePhase==='backfill'?'异常分段自动回补中':'概念内容核对正在处理'):mode==='blocked'?'审批或认证阻塞，未运行':mode==='failed'?'失败，已停止':review.status==='working'?'执行器已停止，保留断点':'概念内容核对已暂停'),title:c.title,sourceId:c.id,offset:c.savedOffset??c.offset,nextOffset:c.offset,total:c.total??null,range:c.range||null,count:[review.completed,review.total],error:mode==='failed'||mode==='blocked'?review.lastError?.message:null,reason:mode==='running'?null:review.stopReason||review.controls?.reason||tr('当前没有活动执行器，保留已保存断点。'),step:review.phase,lastAction:review.lastAction,lastUpdatedAt:review.lastUpdatedAt,lastSavedAt:[review.lastSavedAt,saved(c.id)].filter(Boolean).sort().at(-1)||null,controls:review.controls,lastTaskEvent:review.lastTaskEvent,exceptions:(review.exceptions||[]).filter(e=>!['resolved','superseded'].includes(e.status)),unresolvedSkips:review.unresolvedSkips||0});
 }
 for(const work of independent?.active||[])flows.push({key:work.sourceId+':'+work.layer,pipeline:tr('独立处理'),mode:'running',label:tr(work.step==='VALIDATING'?'校验引用与原文':work.step==='SAVED'?'结果已保存':'独立任务正在处理'),title:state.nodes?.find(n=>n.id===work.sourceId)?.title||work.sourceId,sourceId:work.sourceId,offset:work.offset,total:work.total,range:work.currentRange||null,step:work.step,lastAction:work.lastAction,lastUpdatedAt:work.lastUpdatedAt,lastSavedAt:work.lastSavedAt||saved(work.sourceId)});
 for(const file of a?.activeFiles||[]){const id=file.sourceId.replace(/^concept-only:/,''),progress=a.fileProgress?.[file.sourceId]||a.fileProgress?.[id];flows.push({key:file.sourceId+':main',pipeline:tr(file.taskKind==='concept-only'?'覆盖回补':'自动提取'),mode:'running',label:tr(file.taskKind==='concept-only'?'概念覆盖回补正在处理':file.taskKind==='main-tags'?'主分类归纳中':'正在处理'),title:file.title,sourceId:id,offset:file.taskKind==='concept-only'?(a.concepts?.fileProgress?.[id]?.offset??file.offset):(progress?.offset||0),total:file.total,range:[file.offset,file.end],step:file.taskKind==='concept-only'?'CONCEPT_BACKFILL':file.taskKind==='main-tags'?'CLASSIFYING':'MODEL_RUNNING',segment:(progress?.parts||0)+1,lastSavedAt:saved(id)});}
 if(independent?.queued)flows.push({key:'layers:queued',mode:'queued',label:tr('独立任务排队中'),offset:0,total:null});
 if(independent?.needsReview)flows.push({key:'layers:failed',mode:'failed',label:tr('独立任务失败，需核对'),offset:0,total:null});
 if(a&&!(a.activeFiles||[]).length&&flows.length){const mode=!a.enabled?'paused':a.cooldownUntil>now?'retrying':mainFailures?'failed':mainComplete?'complete':'queued';flows.push({key:'main:inactive',pipeline:tr('覆盖回补 / 自动提取'),mode,label:tr(mode==='paused'?'覆盖回补 / 自动提取未运行':mode==='retrying'?'等待自动重试':mode==='failed'?'有处理失败的资料，待核对':mode==='complete'?'原提取队列已处理':'排队中'),reason:a.pauseReason||(mode==='paused'?tr('自动处理已关闭；不代表内容核对停止。'):mode==='retrying'?new Date(a.cooldownUntil).toLocaleString(uiLocale()):a.lastError||null),offset:0,total:null});}
 const activities=flows.filter(f=>f.mode==='running');
 if(!activities.length&&!flows.length){const mode=!a?'unknown':a.cooldownUntil>now?'retrying':mainFailures?'failed':!a.enabled?'paused':mainComplete?'complete':a.cancelled?'paused':'queued';flows.push({key:'main',pipeline:tr('自动提取'),mode,label:tr(!a?'等待运行状态':mode==='retrying'?'等待自动重试':mode==='failed'?'有处理失败的资料，待核对':mode==='paused'?'已暂停':mode==='complete'?'当前队列已完成':'排队中'),reason:a?.pauseReason||a?.lastError||null,offset:a?.segments||0,total:null,count:a&&Number.isFinite(a.completed)&&Number.isFinite(a.total)?[a.completed,a.total]:null});}
 const primary=flows.find(f=>f.key==='execution:library')||activities[0]||flows.find(f=>f.mode==='blocked')||flows.find(f=>f.mode==='failed')||flows.find(f=>f.mode==='queued')||flows[0];
 const exceptions=flows.filter(f=>f.mode!=='cancelled').flatMap(f=>f.exceptions||[]),deferred=exceptions.filter(e=>!['user-skipped','needs-user'].includes(e.status));
 const latestSave=[...flows.map(f=>f.lastSavedAt),...Object.values(evidence).map(e=>e.time)].filter(Boolean).sort().at(-1)||null,lastSavedAction=Object.values(evidence).find(e=>e.time===latestSave)?.action;
 return {...primary,activities,flows,exceptions,deferredExceptions:deferred,notices:flows.filter(f=>f!==primary&&f.mode!=='running'),lastSavedAt:latestSave,lastSavedAction,label:activities.length?primary.label+(activities.length>1?' · '+activities.length+tr(' 项活动流程'):'')+(deferred.length?' · '+tr('异常后移，继续队列'):exceptions.length?' · '+tr('保留未完成缺口'):''):primary.label};
}
export function collectProcessingEvidence(rows,previous={}){const next={...previous};for(const e of rows||[]){if(e.action==='CLASSIFICATION_EXECUTOR_OBSERVED'&&e.origin==='classification-monitor'&&e.checkpoint?.version===1&&e.checkpoint.verifiedLivePid&&e.checkpoint.lastSavedSegment?.savedAt){if(!next.$classification||e.time>next.$classification.observedAt)next.$classification={time:e.checkpoint.lastSavedSegment.savedAt,observedAt:e.time,checkpoint:e.checkpoint,action:e.action};continue;}const actual=['CONCEPT_SAVED','SUPPLEMENT_SAVED','CONTENT_CHECK_SAVED','LAYER_SEGMENT_SAVED','DOCUMENT_CHECKED','ALL_CHECKED'].includes(e.action)&&(!['CONCEPT_SAVED','SUPPLEMENT_SAVED'].includes(e.action)||e.savedCount>0),api=e.status==='saved'&&['/api/import','/api/edit','/api/upsert','/api/relation','/api/main-tags'].includes(e.action);if((actual||api)&&e.sourceId&&(!next[e.sourceId]||e.time>next[e.sourceId].time))next[e.sourceId]={time:e.time,action:e.action,savedCount:e.savedCount};}return next;}
export function tokenUsagePresentation(snapshot){
 if(snapshot?.unavailableReason==='collector-not-loaded')return {headline:tr('Token：采集器待自然加载'),groups:[],note:tr('当前调用保持运行；采集前历史不回填。')};
 if(!snapshot?.enabledAt)return {headline:tr('Token：暂未返回用量'),groups:[],note:tr('尚无已采集回执；不表示零消耗。')};
 const groups=snapshot.groups||[],known=groups.filter(g=>g.coverage.total>0),sum=known.reduce((n,g)=>n+g.counts.total,0),coverage=known.reduce((n,g)=>n+g.coverage.total,0),returned=groups.reduce((n,g)=>n+g.returned,0),pending=groups.reduce((n,g)=>n+g.pending,0);
 const latest=groups.map(g=>g.latest).filter(Boolean).sort((a,b)=>a.endedAt.localeCompare(b.endedAt)).at(-1),rateHeadline=latest?.averageOutputPerSecond!==null&&Number.isFinite(latest?.averageOutputPerSecond)?tr('最近请求均速：')+latest.averageOutputPerSecond.toFixed(2)+' token/s · '+latest.family+'/'+latest.model:tr('均速：暂未返回');
 return {headline:coverage?tr('累计已返回 Token：')+sum.toLocaleString(uiLocale())+' · '+coverage+'/'+returned+tr(' 份总量回执'):tr('Token：暂未返回总量'),rateHeadline,groups,note:tr('仅累计采集启用后已返回的回执；缓存是输入子集，不重复相加。'),enabledAt:snapshot.enabledAt,pending};
}
export function knowledgeForSource(nodes, sourceId) {
  const source = nodes.find(n => n.id === sourceId);
  const ids = new Set([sourceId, ...(source?.mergedFrom || [])]);
  return nodes.filter(n => n.kind === 'knowledge' && !n.mergedInto &&
    (n.sources || []).some(s => ids.has(s.id)));
}
export function knowledgeInScope(nodes,sourceId=null){return sourceId?knowledgeForSource(nodes,sourceId):nodes.filter(n=>n.kind==='knowledge'&&!n.mergedInto);}
export function knowledgeListPage(nodes,{query='',page=0,pageSize=80}={}){
  const term=query.trim().toLocaleLowerCase(),matches=term?nodes.filter(n=>[n.title,n.path,...(n.mainTags||[]).map(t=>t.name)].join(' ').toLocaleLowerCase().includes(term)):nodes;
  const pages=Math.max(1,Math.ceil(matches.length/pageSize)),index=Math.max(0,Math.min(pages-1,page));
  return {items:matches.slice(index*pageSize,(index+1)*pageSize),total:matches.length,page:index,pages};
}
export function chooseKnowledgeSource(nodes, preferredId) {
  const vaults = nodes.filter(n => n.kind === 'vault' && !n.mergedInto);
  return vaults.find(n => n.id === preferredId)?.id ||
    vaults.find(n => knowledgeForSource(nodes, n.id).length)?.id || vaults[0]?.id || null;
}
export function knowledgeStatus(analysis, sourceId) {
  const status = analysis?.fileProgress?.[sourceId]?.status;
  if (status === 'done') return [tr('本篇已分析，未提取独立知识点'), tr('可查看原文；分析没有保存可独立成立的知识点。')];
  if (status === 'review') return [tr('本篇分析需要核对'), tr('处理遇到问题，请在自动处理进度中查看原因。')];
  if (status === 'working') return [tr('本篇正在分析'), tr('结果保存后会自动出现在这里，无需再次开始分析。')];
  return [tr('本篇尚无已保存的知识点'), tr('资料将按队列自动分析；可从左侧选择已有提取结果的资料。')];
}

export function taskPresentation(state, now = Date.now()) {
  const a = state.analysis;
  if (!a) return {status:tr('运行状态尚未取得'), current:tr('当前资料未知'), progress:tr('完成与剩余数量未知'), stage:tr('等待后端状态'), problem:''};
  const remaining = Number.isFinite(a.total) && Number.isFinite(a.completed) ? Math.max(0,a.total-a.completed) : null;
  const current = a.current;
  const progress = current && a.fileProgress?.[current.sourceId];
  return {
    status: !a.enabled ? tr('自动处理已暂停') : a.cooldownUntil > now ? tr('已启动 · 等待自动重试') : a.running ? tr('已启动 · 正在处理') : remaining === 0 ? tr('已启动 · 当前队列已完成') : tr('已启动 · 等待下一段'),
    current: (a.activeFiles?.length ? a.activeFiles.length + ' / ' + a.maxConcurrent + tr(' 个槽位正在处理 · ') : '') + (current ? tr('当前 MD：') + current.title : tr('当前没有正在处理的 MD')),
    progress: tr('已完成 ') + (a.completed ?? tr('未知')) + ' / ' + (a.total ?? tr('未知')) + tr(' 篇 · 剩余 ') + (remaining ?? tr('未知')) + tr(' 篇'),
    stage: current ? tr('知识提取、关系比较、分类归纳与技能整合合并执行；已落盘 ') + (progress?.offset ?? current.offset ?? 0) + ' / ' + (current.total ?? tr('未知')) + tr(' 字符') : tr('导入资料已入库；后台按顺序接续分析'),
    problem: a.cooldownUntil > now ? tr('重试时间：') + new Date(a.cooldownUntil).toLocaleString(uiLocale()) : a.needsReview ? a.needsReview + tr(' 篇处理失败，需核对') : a.retrying ? a.retrying + tr(' 篇等待重试') : '',
  };
}

export function activityState(analysis, now = Date.now()) {
  if (!analysis) return {mode:'idle',label:tr('等待运行状态')};
  if (!analysis.enabled) return {mode:'idle',label:tr('已暂停')};
  if (analysis.cancelled) return {mode:'idle',label:tr('已取消')};
  if (analysis.cooldownUntil > now) return {mode:'idle',label:tr('等待自动重试')};
  if (analysis.running) return {mode:'running',label:tr('正在处理')};
  if (analysis.needsReview) return {mode:'idle',label:tr('有处理失败的资料，待核对')};
  if (Number.isFinite(analysis.total) && analysis.total > 0 && analysis.completed === analysis.total)
    return {mode:'complete',label:tr('整队列已完成 · 100%')};
  return {mode:'idle',label:tr('等待下一段处理')};
}

export function fileStageProgress(analysis, sourceId, now = Date.now()) {
  const progress=analysis?.fileProgress?.[sourceId];
  const done=progress?.status==='done';
  const active=analysis?.activeFiles?.some(file=>file.sourceId===sourceId) || analysis?.current?.sourceId===sourceId;
  const stopped=!analysis?.enabled || analysis?.cancelled || analysis?.cooldownUntil>now || ['review','retry','paused'].includes(progress?.status);
  const completed=progress?.parts||0,total=progress?.totalParts??(done?completed:null);
  const current=done?completed:completed+1;
  const label=tr(done?'已完成分段 ':active&&!stopped?'当前分段 ':'后续分段 ')+current+(total===null?'':' / '+total)+tr(' · 已保存 ')+completed+tr(' 段');
  return {label,total,current,completed,animating:!!active&&!stopped&&!done,done};
}
// Drafts are independent of refreshed server snapshots and survive navigation.
export class InlineDrafts{
  constructor(){this.items=new Map();}
  open(node){let d=this.items.get(node.id);if(!d||(!d.dirty&&!d.saving&&d.hash!==node.hash)){d={id:node.id,title:node.title,body:node.body||'',hash:node.hash,baseTitle:node.title,version:0,dirty:false,saving:false,status:'已保存'};this.items.set(node.id,d);}return d;}
  change(id,fields){const d=this.items.get(id);Object.assign(d,fields);d.version++;d.dirty=true;d.status='未保存';return d;}
  replaceRange(id,start,end,text){const d=this.items.get(id);this.change(id,{body:d.body.slice(0,start)+text+d.body.slice(end)});return start+text.length;}
  accept(id,node,version){const d=this.items.get(id);d.hash=node.hash;d.baseTitle=node.title;d.saving=false;if(d.version===version){d.title=node.title;d.body=node.body;d.dirty=false;d.status='已保存';}else{d.dirty=true;d.status='有新的未保存修改';}return d;}
}
export async function saveInlineDraft(node,draft,transport,features={}){
  const title=draft.title.trim();if(!title||!draft.body.trim())throw Error('标题与正文不能为空');
  let body=draft.body;
  if(title!==draft.baseTitle)body=/^# .+$/m.test(body)?body.replace(/^# .+$/m,'# '+title):'# '+title+'\n\n'+body;
  let saved=await transport('edit',{id:node.id,body,title,expectedHash:draft.hash});
  // Older running backends already protect manual bodies through edit. Reuse
  // their versioned upsert only to persist the derived title, retaining metadata.
  if(node.kind!=='vault'&&saved.title!==title&&!features.inlineTitleEdit){
    try{saved=await transport('upsert',{id:node.id,kind:node.kind,title,body:saved.body,expectedHash:saved.hash,sources:saved.sources,level:saved.level,domain:saved.domain,occupations:saved.occupations,projects:saved.projects,decision:saved.decision});}
    catch(error){draft.hash=saved.hash;throw error;}
  }
  if(saved.title!==title)throw Error('正文已保存，标题尚未保存；草稿已保留');
  return saved;
}

export function linkedNeighbours(nodes,edges,id,types=[]){
  const byId=new Map(nodes.map(n=>[n.id,n])),result=new Map();
  for(const edge of edges){if(edge.from!==id&&edge.to!==id)continue;const other=edge.from===id?edge.to:edge.from;if(other===id||!byId.has(other))continue;
    if(!result.has(other))result.set(other,{id:other,node:byId.get(other),relations:[]});
    result.get(other).relations.push({...edge,typeName:types.find(t=>t.id===edge.type)?.name||edge.type});
  }
  return [...result.values()].sort((a,b)=>a.node.title.localeCompare(b.node.title));
}

export function acceptExecutionSnapshot(previous,next){
 if(!next||!next.jobId||!Number.isInteger(next.jobRevision))return previous||null;
 if(previous&&Date.parse(next.observedAt)<Date.parse(previous.observedAt))return previous;
 if(previous?.jobId===next.jobId){if(next.jobRevision<previous.jobRevision)return previous;if(next.jobRevision===previous.jobRevision&&next.runId===previous.runId&&next.transitionRevision<previous.transitionRevision)return previous;if(Date.parse(next.observedAt)<Date.parse(previous.observedAt))return previous;}
 return next;
}
