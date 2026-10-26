import test from 'node:test';import assert from 'node:assert/strict';import {remainingSegments} from '../scripts/classification-segments.mjs';
test('timeout recovery preserves prior 32k segments and splits only uncovered text',()=>{const saved=Array.from({length:8},(_,i)=>({start:i*32000,end:(i+1)*32000}));assert.deepEqual(remainingSegments(300001,saved),[{start:256000,end:272000},{start:272000,end:288000},{start:288000,end:300001}]);});
test('mixed-size saved segments and internal holes resume without rereading completed text',()=>{assert.deepEqual(remainingSegments(64000,[{start:0,end:32000},{start:48000,end:64000}]),[{start:32000,end:48000}]);assert.deepEqual(remainingSegments(64000,[{start:0,end:32000},{start:32000,end:48000},{start:48000,end:64000}]),[]);});
test('malformed checkpoint ranges fail closed rather than silently skip content',()=>{for(const saved of [[{start:0,end:32001},{start:32000,end:40000}],[{start:0,end:65000}],[{start:2,end:1}]])assert.throws(()=>remainingSegments(64000,saved));});

test('model transition preserves prior chunk provenance and resumes only the remaining range', () => {
 const saved=[{start:0,end:32000,model:'gpt-6-astra',summary:'previous summary'},{start:32000,end:48000,model:'gpt-6.1-sol',summary:'new summary'}];
 const before=structuredClone(saved);
 assert.deepEqual(remainingSegments(64000,saved,16000),[{start:48000,end:64000}]);
 assert.deepEqual(saved,before);
});
