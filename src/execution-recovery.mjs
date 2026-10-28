// Policy/state only. The original classifier owns and persists this ledger in
// progress.json; this module creates no worker, queue file or model request.
export function classifyExecutionFailure(error) {
  const message=String(error?.message||error||'');
  if(/^LOCAL_API_PROTOCOL GET \/api\/[^ ]+ (?:23|TimeoutError|AbortError)$/.test(message))return {kind:'transient',scope:'source',retryable:true};
  if(/USER_TASKS_PAUSED|USER_EXECUTION_CANCELLED|EXECUTION_SAFE_HANDOFF|SOURCE_VERSION_REFRESH|SELECTED_RERUN_COMPLETE/.test(message))return {kind:'control',scope:'control',retryable:false};
  if(/RECOVERY_WINDOW_EXHAUSTED|retry budget exhausted/i.test(message))return {kind:'budget',scope:'service',retryable:false};
  if(/policy|permission|authentication|credential|审批|认证|权限|blocked by/i.test(message))return {kind:'access',scope:'service',retryable:false};
  if(/quota|usage limit|insufficient_quota|额度|余额/i.test(message))return {kind:'quota',scope:'service',retryable:false};
  if(/selected model is at capacity|model.{0,30}(?:at capacity|capacity unavailable)|模型.{0,8}容量不足|^capacity(?:\s|$)/i.test(message))return {kind:'capacity',scope:'service',retryable:true};
  if(/^LOCAL_API_WRITE_OUTCOME_UNKNOWN|^LOCAL_API_PROTOCOL|ownership changed|fingerprint changed|identity changed/i.test(message))return {kind:'integrity',scope:'service',retryable:false};
  if(/^LOCAL_API_HTTP POST|^LOCAL_API_HTTP GET .* HTTP (?:4(?!08|29)\d\d)/.test(message))return {kind:'integrity',scope:'service',retryable:false};
  // This validator rejection is confined to the selected document's preserved return.
  if(message==='归属依据须是对应输入文档的具体逐字内容，不能仅引用孤立术语')return {kind:'content',scope:'source',retryable:false};
  if(/CORRECTION|literal|evidence|Invalid classification|omitted or repeated|Missing long-source synthesis|Source changed|Long source changed|ENOENT|EACCES.*(?:Vault|知识点|技能|概念云)/i.test(message))return {kind:'content',scope:'source',retryable:false};
  if(/^fetch failed$|LOCAL_API_TRANSPORT|ECONN|timeout|timed out|模型调用超过|HTTP 5\d\d|temporar|WORKER_EXIT|^EPERM: operation not permitted, rename .*model-lease\.json/i.test(message))return {kind:'transient',scope:'source',retryable:true};
  return {kind:'review',scope:'service',retryable:false};
}

export function automaticDeferralReason(error,current={}) {
  const failure=classifyExecutionFailure(error),location=current.path||current.id||current.ids?.join(', ')||'当前资料';
  return `${location}${Number.isFinite(current.start)?` · UTF-16 ${current.start}–${current.end??'未提供'}`:''}：${String(error?.message||error||'失败记录未提供具体错误')}。系统记录为${failure.kind==='content'?'文件／内容级未完成':'执行级未完成'}；保留原文、返回、已保存断点及纠正预算，不计完成。`;
}

export class ExecutionRecovery {
  constructor(ledger={}, {clock=Date.now,delays=[30000,120000,300000],maxServiceFailures=4,maxSourceFailures=3,fairDispatches=3}={}) {
    this.ledger=ledger;Object.assign(this,{clock,delays,maxServiceFailures,maxSourceFailures,fairDispatches});
    ledger.version||=1;ledger.sequence||=0;ledger.sources||={};ledger.history||=[];ledger.service||={failures:0,consecutive:0};
  }
  beforeModel(){const s=this.ledger.service;if(s.exhausted)throw Error('RECOVERY_WINDOW_EXHAUSTED: configured model capacity recovery budget exhausted; retained failures require availability/budget review');if(s.nextEligibleAt>this.clock())throw Error('RECOVERY_COOLDOWN_ACTIVE');this.ledger.sequence++;}
  modelReturned(){const s=this.ledger.service;if(s.consecutive){s.recoveredAt=this.clock();s.lastSuccessAt=this.clock();}s.consecutive=0;s.nextEligibleAt=null;}
  fail(error,{node,current={},model,provider='codex',serviceEvent=true}={}) {
    const classification=classifyExecutionFailure(error);
    if(classification.scope==='control'||classification.scope==='service'&&!classification.retryable)return {handled:false,classification};
    const now=this.clock(),previous=this.ledger.sources[node.id];
    if(previous&&previous.sourceHash!==node.hash){this.ledger.history.push({...previous,status:'source-version-replaced',resolvedAt:now});delete this.ledger.sources[node.id];}
    const entry=this.ledger.sources[node.id]||{id:node.id,path:node.path,sourceHash:node.hash,attempts:0,failures:[],firstFailedAt:now};
    entry.attempts++;entry.kind=classification.kind;entry.current={...current};entry.model=model;entry.provider=provider;entry.lastFailedAt=now;entry.tailSequence=this.ledger.sequence;entry.reason=automaticDeferralReason(error,{...current,id:node.id,path:node.path});
    entry.failures.push({at:new Date(now).toISOString(),message:String(error.message||error),executionFailure:error.executionFailure||null,current:{...current},model,provider,noCompletionClaim:true});
    const budget=classification.kind==='capacity'?this.maxServiceFailures:this.maxSourceFailures;
    entry.status=classification.retryable&&entry.attempts<budget?'waiting':'needs-action';entry.nextEligibleAt=entry.status==='waiting'?now+this.delays[Math.min(entry.attempts-1,this.delays.length-1)]:null;
    this.ledger.sources[node.id]=entry;
    if(classification.kind==='capacity'&&serviceEvent){
      const s=this.ledger.service;s.model=model;s.provider=provider;s.failures=(s.failures||0)+1;s.consecutive=(s.consecutive||0)+1;s.lastFailure=entry.failures.at(-1);s.exhausted=s.failures>=this.maxServiceFailures;
      s.nextEligibleAt=s.exhausted?null:now+this.delays[Math.min(s.consecutive-1,this.delays.length-1)];s.state=s.exhausted?'exhausted':s.consecutive>=2?'circuit-open':'cooldown';
      if(s.exhausted)entry.status='needs-action';
    }
    return {handled:true,classification,entry,serviceExhausted:!!this.ledger.service.exhausted};
  }
  reconcileSources(nodes){for(const node of nodes){const previous=this.ledger.sources[node.id];if(previous&&previous.sourceHash!==node.hash){this.ledger.history.push({...previous,status:'source-version-replaced',resolvedAt:this.clock()});delete this.ledger.sources[node.id];}}}
  complete(node){const entry=this.ledger.sources[node.id];if(entry){this.ledger.history.push({...entry,status:'saved-verified',resolvedAt:this.clock()});delete this.ledger.sources[node.id];}const s=this.ledger.service;if(s.failures&&!s.exhausted&&!Object.keys(this.ledger.sources).length&&s.lastSuccessAt>=Date.parse(s.lastFailure?.at||'')){this.ledger.history.push({...s,status:'service-window-recovered',resolvedAt:this.clock()});this.ledger.service={failures:0,consecutive:0,state:'healthy'};}}
  choose(todo){
    const now=this.clock(),service=this.ledger.service;if(service.exhausted)return {index:-1,exhausted:true};if(service.nextEligibleAt>now)return {index:-1,waitUntil:service.nextEligibleAt};
    const eligible=todo.map((node,index)=>({node,index,entry:this.ledger.sources[node.id]})).filter(x=>!x.entry||x.entry.status==='waiting'&&x.entry.nextEligibleAt<=now);
    const fair=eligible.filter(x=>x.entry&&this.ledger.sequence-x.entry.tailSequence>=this.fairDispatches).sort((a,b)=>a.entry.firstFailedAt-b.entry.firstFailedAt||a.entry.tailSequence-b.entry.tailSequence);
    const next=fair[0]||eligible.find(x=>!x.entry)||eligible[0];if(next)return {index:next.index};
    const times=todo.map(n=>this.ledger.sources[n.id]).filter(e=>e?.status==='waiting').map(e=>e.nextEligibleAt);return {index:-1,waitUntil:times.length?Math.min(...times):null};
  }
  shouldYield(id){const now=this.clock();return Object.values(this.ledger.sources).some(e=>e.id!==id&&e.status==='waiting'&&e.nextEligibleAt<=now&&this.ledger.sequence-e.tailSequence>=this.fairDispatches);}
  summary(){return {sequence:this.ledger.sequence,service:{...this.ledger.service},pending:Object.values(this.ledger.sources).map(e=>({id:e.id,path:e.path,sourceHash:e.sourceHash,current:e.current,kind:e.kind,status:e.status,attempts:e.attempts,nextEligibleAt:e.nextEligibleAt,reason:e.reason})),resolved:this.ledger.history.filter(e=>e.status==='saved-verified').length};}
}
