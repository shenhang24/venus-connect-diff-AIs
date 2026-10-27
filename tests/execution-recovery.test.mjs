import test from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionRecovery,classifyExecutionFailure,automaticDeferralReason} from '../src/execution-recovery.mjs';
const a={id:'a',path:'Vault/a.md',hash:'v1'},b={id:'b',path:'Vault/b.md',hash:'v1'};
const capacity=()=>Error('Selected model is at capacity. Please try a different model.');
test('provider capacity is distinct from quota, unknown HTTP 429, permissions and literal validation',()=>{
 assert.equal(classifyExecutionFailure(capacity()).kind,'capacity');
 for(const [message,kind] of [['HTTP 429','review'],['insufficient_quota','quota'],['authentication rejected','access'],['Invalid literal evidence','content'],['USER_TASKS_PAUSED','control']])assert.equal(classifyExecutionFailure(Error(message)).kind,kind);
});
test('capacity cooldown survives reload, then a returned and saved retry closes an archived finite window',()=>{
 let now=1000;let r=new ExecutionRecovery({}, {clock:()=>now,delays:[10,20,30]});r.beforeModel();r.fail(capacity(),{node:a,current:{start:0,end:12},model:'gpt-6.1-sol'});
 r=new ExecutionRecovery(JSON.parse(JSON.stringify(r.ledger)),{clock:()=>now,delays:[10,20,30]});assert.equal(r.choose([b,a]).waitUntil,1010);assert.throws(()=>r.beforeModel(),/COOLDOWN/);
 now=1010;assert.equal(r.choose([b,a]).index,0);r.beforeModel();r.modelReturned();r.complete(b);assert.equal(r.ledger.service.failures,1,'unresolved source keeps its budget');
 r.beforeModel();r.modelReturned();r.complete(a);assert.equal(r.ledger.service.failures,0);assert.equal(r.ledger.history.filter(e=>e.status==='saved-verified').length,1);assert.equal(r.ledger.history.filter(e=>e.status==='service-window-recovered').length,1);
});
test('persistent capacity stops after four actual dispatches, including after restart',()=>{
 let now=1000,r=new ExecutionRecovery({}, {clock:()=>now,delays:[1]});
 for(let i=0;i<4;i++){r.beforeModel();r.fail(capacity(),{node:a,model:'gpt-6.1-sol'});now+=2;r=new ExecutionRecovery(JSON.parse(JSON.stringify(r.ledger)),{clock:()=>now,delays:[1]});}
 assert.equal(r.ledger.sequence,4);assert.equal(r.choose([b,a]).exhausted,true);assert.throws(()=>r.beforeModel(),/EXHAUSTED/);assert.equal(r.ledger.sources.a.failures.length,4);assert.equal(r.ledger.sources.b,undefined);
});
test('source failures move behind independent work and return fairly without duplicate dispatch or starvation',()=>{
 let now=1000;const r=new ExecutionRecovery({}, {clock:()=>now,delays:[10],fairDispatches:3});const todo=[b,a,{...b,id:'c'},{...b,id:'d'},{...b,id:'e'}];r.beforeModel();r.fail(Error('ECONNRESET'),{node:a});assert.equal(r.choose(todo).index,0);now+=10;
 const dispatched=[];for(let i=0;i<4;i++){const {index}=r.choose(todo);const node=todo.splice(index,1)[0];dispatched.push(node.id);r.beforeModel();r.modelReturned();r.complete(node);}
 assert.deepEqual(dispatched,['b','c','d','a']);assert.equal(new Set(dispatched).size,4);assert.equal(r.ledger.sources.a,undefined);
});
test('file-level failure records its own reason without user input and allows remaining sources',()=>{
 const r=new ExecutionRecovery();r.fail(Error('Invalid literal tag evidence'),{node:a,current:{start:20,end:40}});assert.match(r.ledger.sources.a.reason,/Vault\/a.md.*20–40.*Invalid literal/);assert.equal(r.ledger.sources.a.status,'needs-action');assert.equal(r.choose([a,b]).index,1);assert.match(automaticDeferralReason(Error('ENOENT'),{path:a.path}),/ENOENT/);
});
test('only changed source versions archive prior failure; same-version exhausted budgets survive reconciliation',()=>{
 const r=new ExecutionRecovery();r.fail(Error('Invalid literal evidence'),{node:a});r.reconcileSources([a]);assert.equal(r.ledger.sources.a.attempts,1);r.reconcileSources([{...a,hash:'v2'}]);assert.equal(r.ledger.sources.a,undefined);assert.equal(r.ledger.history[0].sourceHash,'v1');assert.equal(r.choose([{...a,hash:'v2'}]).index,0);
});
test('one failed batch is one service event while all affected source receipts remain',()=>{
 const r=new ExecutionRecovery();r.fail(capacity(),{node:a,serviceEvent:true});r.fail(capacity(),{node:b,serviceEvent:false});assert.equal(r.ledger.service.failures,1);assert.equal(Object.keys(r.ledger.sources).length,2);
});
