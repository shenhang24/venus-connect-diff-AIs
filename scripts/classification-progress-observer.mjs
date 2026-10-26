import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ExecutionJournal} from '../src/execution-journal.mjs';
// One read-only checkpoint observation, invoked by the existing monitor.
// No timers, model dispatch, queues, source writes or executor startup.
export function recordClassificationObservation({work,meta,commandLine}){
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),p=read(path.join(work,'progress.json')),lock=read(path.join(work,'executor.lock'));
 if(!Number.isInteger(lock.pid)||lock.pid<=0||!commandLine?.includes('reclassify-current-library.mjs')||p.model!=='gpt-6.1-sol')throw Error('Original classification executor identity unavailable');
 process.kill(lock.pid,0);
 if(p.status!=='running')throw Error('Original classification executor is not running');
 const s=p.lastSavedSegment;if(!s?.id||!Number.isInteger(s.start)||!Number.isInteger(s.end)||!s.savedAt)throw Error('Saved checkpoint unavailable');
 const parts=read(path.join(work,s.id+'.astra-segments.json')),matches=parts.segments.filter(v=>v.start===s.start&&v.end===s.end);
 const root=path.resolve(meta,'..'),file=path.resolve(root,s.path),relative=path.relative(root,file);
 if(relative.startsWith('..')||path.isAbsolute(relative)||!relative.endsWith('.md'))throw Error('Checkpoint source outside Venus');
 const raw=fs.readFileSync(file,'utf8'),match=raw.match(/^<!-- venus:(.*?) -->\r?\n/s),body=match?raw.slice(match[0].length):raw;
 if(createHash('sha256').update(raw).digest('hex')!==parts.hash||matches.length!==1||!matches[0].summary?.trim()||matches[0].tags.some(t=>!t.quote||!body.slice(s.start,s.end).includes(t.quote)))throw Error('Checkpoint source or literal evidence readback failed');
 const checkpoint={version:1,status:p.status,model:p.model,current:p.current,lastSavedSegment:s,total:p.total,completed:Object.keys(p.entries).length,sourceTotal:p.current?.id===s.id?body.length:null,verifiedLivePid:lock.pid,lastUpdatedAt:p.updatedAt};
 const journal=new ExecutionJournal(meta,path.dirname(work));return journal.append({kind:'execution',action:'CLASSIFICATION_EXECUTOR_OBSERVED',status:'running',origin:'classification-monitor',sourceId:s.id,file:s.path,pid:lock.pid,offset:s.end,start:s.start,end:s.end,checkpoint});
}
