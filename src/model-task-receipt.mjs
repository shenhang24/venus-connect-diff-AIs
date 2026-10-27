import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {classifyExecutionFailure} from './execution-recovery.mjs';
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function write(file,value){const text=JSON.stringify(value,null,2),tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,file);if(fs.readFileSync(file,'utf8')!==text)throw Error('LOCAL_API_WRITE_OUTCOME_UNKNOWN: task receipt readback failed');}
// A receipt for one immutable request, not a dispatcher or an additional queue.
export function claimModelTask(directory,{payload,prompt,model,reasoningEffort,schema}){
 const taskId=digest({payload,prompt,model,reasoningEffort,schema}),folder=path.join(directory,'tasks');fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,taskId+'.json'),md=path.join(folder,taskId+'.md'),claim=file+'.lock';
 const sources=(payload.items||payload.documents||payload.nodes||[payload.source].filter(Boolean)).map(n=>({id:n.nodeId||n.id,sourceHash:n.sourceHash||n.hash||null,start:n.start??n.offset??n.readRange?.start??null,end:n.end??n.readRange?.end??null}));
 const markdown=`# Model task ${taskId}\n\nPurpose: ${payload.purpose||payload.stage||'analysis'}\nModel: ${model}\nReasoning: ${reasoningEffort}\n\n## Source versions and ranges\n\n\`\`\`json\n${JSON.stringify(sources,null,2)}\n\`\`\`\n\n## Fixed request\n\n${prompt}\n`;
 if(fs.existsSync(md)){if(fs.readFileSync(md,'utf8')!==markdown)throw Error('LOCAL_API_PROTOCOL: immutable task Markdown identity changed');}else fs.writeFileSync(md,markdown,{flag:'wx'});
 let record=fs.existsSync(file)?read(file):null;
 if(record?.status==='returned'){if(record.resultHash!==digest(record.result))throw Error('LOCAL_API_PROTOCOL: task result fingerprint changed');return {taskId,md,reused:true,result:record.result,timing:{issuedAt:record.issuedAt,acceptedAt:record.attempts.at(-1)?.acceptedAt||null,returnedAt:record.returnedAt,activeRequestMs:record.activeRequestMs}};}
 if(record&&!['failed-no-return'].includes(record.status))throw Error('LOCAL_API_WRITE_OUTCOME_UNKNOWN: task '+taskId+' has an unresolved submission; retain receipt and verify its original process/output before any resend');
 if(record&&(!record.retryable||!record.exitConfirmed))throw Error('LOCAL_API_WRITE_OUTCOME_UNKNOWN: task '+taskId+' has no proven safe retry boundary');
 try{fs.writeFileSync(claim,JSON.stringify({pid:process.pid,taskId}),{flag:'wx'});}catch(error){if(error.code==='EEXIST')throw Error('LOCAL_API_WRITE_OUTCOME_UNKNOWN: task '+taskId+' is already claimed; duplicate submission prevented');throw error;}
 record||={version:1,taskId,model,reasoningEffort,purpose:payload.purpose||null,sources,markdown:md,promptHash:digest(markdown),attempts:[]};
 const attempt={at:new Date().toISOString(),status:'prepared',ownerPid:process.pid};record.issuedAt||=attempt.at;record.jobId||=process.env.VENUS_EXECUTION_JOB_ID||null;record.attempts.push(attempt);record.status='prepared';write(file,record);
 const release=()=>{if(fs.existsSync(claim)&&read(claim).pid===process.pid)fs.unlinkSync(claim);};
 return {taskId,md,prompt:markdown,reused:false,
  started(pid){attempt.status='submitted';attempt.pid=pid??null;attempt.submittedAt=new Date().toISOString();record.status='submitted';write(file,record);},
  accepted(){attempt.acceptedAt=new Date().toISOString();attempt.acceptanceScope='local-process-spawn';write(file,record);return {issuedAt:record.issuedAt,acceptedAt:attempt.acceptedAt,acceptanceScope:attempt.acceptanceScope};},
  returned(result){record.result=result;record.resultHash=digest(result);record.status='returned';record.returnedAt=new Date().toISOString();attempt.returnedAt=record.returnedAt;attempt.status='returned';attempt.exitConfirmed=true;record.activeRequestMs=record.attempts.reduce((sum,a)=>sum+(a.acceptedAt&&a.returnedAt?Date.parse(a.returnedAt)-Date.parse(a.acceptedAt):0),0);write(file,record);release();return {issuedAt:record.issuedAt,acceptedAt:attempt.acceptedAt||null,returnedAt:record.returnedAt,activeRequestMs:record.activeRequestMs};},
  failed(error,{exitConfirmed=false,returnedResult=false}={}){attempt.status='failed';attempt.error=error.message;attempt.executionFailure=error.executionFailure||null;attempt.exitConfirmed=exitConfirmed;record.exitConfirmed=exitConfirmed;record.retryable=exitConfirmed&&!returnedResult&&classifyExecutionFailure(error).retryable;record.status=record.retryable?'failed-no-return':'outcome-retained';record.error=error.message;write(file,record);release();}
 };
}
export function markModelTaskSaved(markdown,proof){const file=markdown.replace(/\.md$/,'.json'),record=read(file);if(record.status!=='returned')throw Error('LOCAL_API_PROTOCOL: cannot mark an unreturned model task saved');if(!record.sources.some(s=>s.id===proof.id&&(!s.sourceHash||s.sourceHash===proof.sourceHash)&&(proof.stage==='project-membership'||!Number.isFinite(s.end)||s.end===proof.end)))return null;record.saveReceipts||=[];record.saveReceipts.push({...proof,verified:true});record.savedAt=proof.savedAt;record.wallClockMs=Date.parse(record.savedAt)-Date.parse(record.issuedAt);write(file,record);return {taskId:record.taskId,markdown,status:'saved',issuedAt:record.issuedAt,returnedAt:record.returnedAt,savedAt:record.savedAt,activeRequestMs:record.activeRequestMs,wallClockMs:record.wallClockMs};}
