import fs from 'node:fs';
import path from 'node:path';
import {ExecutionHandoff} from './execution-handoff.mjs';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let handoff=null;
// Restart only after the previous server has exited and released its port.
function launch() {
  let restart = false;
  const child = fork(fileURLToPath(new URL('./server.mjs', import.meta.url)), [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true,
  });
  child.on('message', (message) => {
    if (message?.action === 'restart') restart = true;
    if (message?.action === 'shutdown') restart = false;
  });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code) => {
    if (restart) launch();
    else {process.exitCode = code || 0;handoff?.close();}
  });
  return child;
}
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=process.env.VENUS_DATA||path.join(project,'data'),work=process.env.VENUS_CLASSIFICATION_WORK||path.resolve(root,'../work/precise-classification-20261022');
let pending=null;try{pending=JSON.parse(fs.readFileSync(path.join(work,'execution-handoff.json'),'utf8'));}catch{}
if(pending?.phase==='blocked'){console.error('Persistent handoff requires the recorded issue to be resolved: '+pending.reason);process.exitCode=1;}else if(process.argv.includes('--handoff-wait')||pending&&!['managed-ready','managed-blocked','blocked'].includes(pending.phase)){handoff=new ExecutionHandoff({project,work,port:Number(process.env.VENUS_PORT||10001),launch});await handoff.start();}else launch();
