import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveHeat,activityLevel,messageActivity} from '../src/heat.mjs';
const msg=(id,day,text='继续推进测试')=>`### user · 2026-10-${day}T09:00:00+11:00\n\n消息节点：${id}；父节点：无\n\n${text}\n\n`;
const vault=(id,body,title='普通资料')=>({id,kind:'vault',body,title,hash:body,sources:[]});
test('十三色按明确推进次数和跨天门槛升级',()=>{
  assert.deepEqual([[1,1],[2,1],[4,1],[3,2],[8,3],[16,5]].map(([t,d])=>activityLevel(t,d)),[0,1,3,6,10,12]);
  assert.equal(activityLevel(1000,1),5);
  assert.equal(activityLevel(0,0,3),3);
});
test('重复消息 ID 和纯寒暄不增加热度，重复关键词不改变颜色',()=>{
  const body=msg('1','17')+msg('1','17')+msg('2','17','谢谢');
  const a=vault('v',body),b=vault('v',body.replace('继续推进测试','推进'.repeat(10000)));
  assert.equal(messageActivity(body).length,2);
  assert.equal(deriveHeat([a]).get('v').level,0);
  assert.equal(deriveHeat([b]).get('v').level,0);
});
test('ExampleProject项目基准优先，依据链可继承，无关提及不升金',()=>{
  const v=vault('v',msg('1','17','准备实现'), '接手ExampleProject未完成任务');
  const k={id:'k',kind:'knowledge',title:'战斗设计',body:'设计知识',sources:[{id:'v',quote:'准备实现'}]};
  const s={id:'s',kind:'skill',title:'能力分析',body:'技能',sources:[{id:'k',quote:'设计知识'}]};
  const unrelated=vault('u',msg('2','17','偶尔提到ExampleProject'), '早餐做法');
  const h=deriveHeat([v,k,s,unrelated],{rules:[{id:'example-priority',name:'ExampleProject',level:12,terms:['ExampleProject'],reason:'Synthetic explicit priority fixture'}]});
  for(const id of ['v','k','s']){assert.equal(h.get(id).level,12);assert.equal(h.get(id).basis,'user-project');}
  assert.equal(h.get('u').level,0);
});

test('the same cited activity reaches every one of thirteen tiers in all four networks',()=>{
  const cases=[[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[3,2],[5,2],[5,3],[6,3],[8,3],[12,4],[16,5]];
  for(const [expected,[turns,days]]of cases.entries()){
    const quotes=Array.from({length:turns},(_,i)=>'活动证据-'+i+'。');
    const v=vault('v',quotes.map((quote,i)=>msg('m'+i,String(1+i%days).padStart(2,'0'),quote)).join(''));
    const sources=quotes.map(quote=>({id:'v',quote})),k={id:'k',kind:'knowledge',title:'Knowledge',body:'Synthesis.',sources},s={id:'s',kind:'skill',title:'Skill',body:'Method.',sources:[{id:'k',quote:'Synthesis.'}]},c={id:'c',kind:'concept',title:'Concept',body:'Insight.',sources};
    const heat=deriveHeat([v,k,s,c],{rules:[]});for(const id of ['v','k','s','c']){assert.equal(heat.get(id).level,expected,id+' tier '+expected);assert.equal(heat.get(id).color,heat.get('v').color);}
  }
});
test('派生知识只统计被引消息，不继承长对话的所有活动',()=>{
  const v=vault('v',Array.from({length:20},(_,i)=>msg('m'+i,String(1+i%5).padStart(2,'0'),'讨论'+i)).join(''));
  const k={id:'k',kind:'knowledge',title:'独立知识',body:'知识',sources:[{id:'v',quote:'讨论0'}]};
  const h=deriveHeat([v,k]);
  assert.equal(h.get('v').level,12);assert.equal(h.get('k').level,0);
  assert.equal(h.get('k').userTurns,1);
});

test('citation activity cache reuses unchanged evidence and invalidates on source edits',()=>{
  const cache=new Map(),v=vault('v',msg('first','17','原始证据句'));
  const k={id:'k',kind:'knowledge',title:'独立知识',body:'知识',sources:[{id:'v',quote:'原始证据句'}]};
  assert.equal(deriveHeat([v,k],{cache}).get('k').userTurns,1);
  const attribution=[...cache.citations.values()][0];
  deriveHeat([v,k],{cache});assert.equal([...cache.citations.values()][0],attribution);
  const edited=vault('v',msg('second','18','替换后的正文'));
  assert.equal(deriveHeat([edited,k],{cache}).get('k').userTurns,0);
  assert.equal(deriveHeat([v,k],{cache}).get('k').userTurns,1);
});
