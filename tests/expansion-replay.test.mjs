import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/graph-view.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'');const Network=vm.runInNewContext(source+';Network;',{performance,replayEpochs:new Map()});
for(const kind of ['vault','knowledge','skill'])test(kind+' replay unfolds once per epoch without modifying orbital positions or restarting on metadata updates',()=>{
 const positions={sun:[2,3,4],planet:[12,3,4],moon:[14,3,4]},make=epoch=>({layoutKey:kind,layoutEpoch:epoch,replayPending:true,nodes:[{id:'sun'},{id:'planet'},{id:'moon'}],layout:{positions,coreId:'sun'}}),n=make(6),update=(o,t)=>Network.prototype.updateReplayPositions.call(o,t);
 const before=JSON.stringify(positions);assert.equal(update(n,0),true);for(const p of Object.values(n.positions))assert.equal(JSON.stringify(p),'[2,3,4]');assert.equal(JSON.stringify(positions),before);
 n.replayPending=true;update(n,2500);assert.equal(n.expansion.start,0);assert.equal(JSON.stringify(n.positions.planet),'[7,3,4]');positions.planet=[22,3,4];update(n,2500);assert.equal(JSON.stringify(n.positions.planet),'[12,3,4]');update(n,5000);assert.equal(n.expansion,null);assert.equal(n.positions,positions);
 const again=make(6);assert.equal(update(again,6000),false);assert.equal(again.positions,positions);const next=make(7);assert.equal(update(next,7000),true);assert.equal(next.expansion.start,7000);
});
