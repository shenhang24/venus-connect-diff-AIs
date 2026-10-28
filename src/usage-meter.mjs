import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
// Terminal receipts only. Codex: learn.chatgpt.com/docs/non-interactive-mode
// Gemini Interactions: ai.google.dev/api/interactions-api (thoughts are separate).
const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const clean=s=>String(s||'').replace(/[\r\n\x00-\x1f]/g,'').slice(0,160);
const caches=new Map();
export function normalizeUsage(raw,format){
 if(!raw||typeof raw!=='object')return null;
 const gemini=format==='gemini',codex=format==='codex';if(!['gemini','codex','http','local'].includes(format))return null;
 const input=count(gemini?raw.total_input_tokens:codex?raw.input_tokens:raw.prompt_tokens),output=count(gemini?raw.total_output_tokens:codex?raw.output_tokens:raw.completion_tokens);
 let cached=count(gemini?raw.total_cached_tokens:raw.cached_input_tokens??raw.input_tokens_details?.cached_tokens??raw.prompt_tokens_details?.cached_tokens);
 if(cached!==null&&input!==null&&cached>input)cached=null;
 const reasoning=count(gemini?raw.total_thought_tokens:raw.reasoning_output_tokens??raw.output_tokens_details?.reasoning_tokens??raw.completion_tokens_details?.reasoning_tokens);
 const reported=count(raw.total_tokens),total=reported??(!gemini&&input!==null&&output!==null?count(input+output):null);
 if([input,output,cached,reasoning,total].every(n=>n===null))return null;
 return {input,output,cached,reasoning,total,cachedIsInputSubset:true,reasoningIsOutputSubset:!gemini,totalSource:reported!==null?'provider':total!==null?'input+output':'unavailable',outputScope:gemini?'generated-responses-excludes-thoughts':'provider-output-includes-reasoning'};
}
const write=(file,value)=>{const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file);};
export class UsageRequest{
 constructor(meta,{provider,model,family,clock=Date.now}={}){
  this.clock=clock;this.closed=false;this.enabled=false;this.record={version:1,id:randomUUID(),pid:process.pid,provider:clean(provider),family:clean(family||({codex:'gpt',gemini:'gemini',local:'local'})[provider]||provider),model:clean(model)||'unreported',modelSource:'configured',startedAt:new Date(clock()).toISOString(),endedAt:null,status:'pending',usage:null};
  try{const root=path.join(meta,'token-usage');this.dir=path.join(root,'requests');fs.mkdirSync(this.dir,{recursive:true});try{fs.writeFileSync(path.join(root,'collection.json'),JSON.stringify({enabledAt:this.record.startedAt,history:'No pre-collection usage is reconstructed.'}),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}this.file=path.join(this.dir,this.record.id+'.json');write(this.file,this.record);this.enabled=true;}catch{ /* Metering must never interrupt inference. */ }
 }
 save(){if(this.enabled)try{write(this.file,this.record);}catch{this.enabled=false;}}
 finish(raw,format,{providerRequestId,model,status='completed'}={}){
  if(this.closed)return false;this.closed=true;const usage=normalizeUsage(raw,format),ended=this.clock();Object.assign(this.record,{endedAt:new Date(ended).toISOString(),durationMs:Math.max(0,ended-Date.parse(this.record.startedAt)),status,usage,providerRequestId:clean(providerRequestId)||null,rateKind:usage?'recent-request-average-output':'unavailable',timing:'end-to-end-including-wait-and-transfer'});
  if(model){this.record.model=clean(model);this.record.modelSource='provider';}if(!usage)this.record.unavailableReason=raw?'unrecognized-usage':'usage-not-returned';this.save();return true;
 }
}
export class CodexUsageCollector{
 constructor(request){this.request=request;this.threadId=null;}
 accept(event){if(event.type==='thread.started')this.threadId=event.thread_id;if(event.type==='turn.completed')this.request.finish(event.usage,'codex',{providerRequestId:event.request_id||this.threadId,model:event.model});}
 close(status){this.request.finish(null,'codex',{providerRequestId:this.threadId,status});}
}
export function readUsageSummary(meta,{profiles=[],clock=Date.now}={}){
 const root=path.join(meta,'token-usage'),dir=path.join(root,'requests');let enabledAt=null,records=[];
 try{enabledAt=JSON.parse(fs.readFileSync(path.join(root,'collection.json'))).enabledAt;const stamp=fs.statSync(dir).mtimeMs,old=caches.get(dir);if(old?.stamp===stamp)records=old.records;else{for(const name of fs.readdirSync(dir).filter(n=>/^[\da-f-]+\.json$/i.test(n)))try{const r=JSON.parse(fs.readFileSync(path.join(dir,name)));if(r.version===1&&r.id&&r.provider)records.push(r);}catch{}caches.set(dir,{stamp,records});}}catch{}
 const groups=new Map(),seen=new Set();
 const group=p=>{const key=[p.family||p.provider,p.provider,p.model||'unreported'].join('|');if(!groups.has(key))groups.set(key,{family:p.family||p.provider,provider:p.provider,model:p.model||'unreported',modelSource:p.modelSource||'configured',returned:0,pending:0,unavailable:0,interrupted:0,counts:{input:null,output:null,cached:null,reasoning:null,total:null},coverage:{input:0,output:0,cached:0,reasoning:0,total:0},latest:null});return groups.get(key);};
 for(const p of profiles)group(p);
 for(const r of records){const g=group(r);if(r.modelSource==='provider')g.modelSource='provider';if(r.status==='pending'){let alive=true;if(r.pid)try{process.kill(r.pid,0);}catch{alive=false;}if(alive)g.pending++;else g.interrupted++;continue;}if(!r.usage){g.unavailable++;continue;}const key=[r.provider,r.family,r.model,r.providerRequestId||r.id].join('|');if(seen.has(key))continue;seen.add(key);g.returned++;for(const metric of Object.keys(g.counts))if(count(r.usage[metric])!==null){g.counts[metric]=(g.counts[metric]??0)+r.usage[metric];g.coverage[metric]++;}if(!g.latest||r.endedAt>g.latest.endedAt)g.latest={...r,averageOutputPerSecond:r.usage.output!==null&&r.durationMs>0?r.usage.output/(r.durationMs/1000):null};}
 const currentModels=profiles.map(p=>({family:p.family||p.provider,provider:p.provider,model:p.model||'unreported',modelSource:'configured',providerConfirmed:false}));
 return {enabledAt,readAt:new Date(clock()).toISOString(),currentModels,groups:[...groups.values()],history:'since-collection-enabled-only',rateKind:'recent-request-average-output',rateScope:'one-request; never the sum of per-request speeds',includesWaiting:true};
}
