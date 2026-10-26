import test from 'node:test';
import assert from 'node:assert/strict';
import {shortNodeLabel,labelDetail,labelLimits,showNodeLabel} from '../public/network-labels.js';

test('star names are hidden until that star is clicked; normal planet labels keep distance rules',()=>{
  const star={id:'star',isMainTag:true},other={id:'other',isMainTag:true};
  assert.equal(showNodeLabel(star),false);assert.equal(showNodeLabel(star,'other'),false);
  assert.equal(showNodeLabel(star,'star'),true);assert.equal(showNodeLabel(other,'star'),false);
  assert.equal(showNodeLabel({id:'planet'}),true);
});

test('网络标题去掉导入标识与重复分支前缀，保留主题',()=>{
  assert.equal(shortNodeLabel({title:'分支 · 分支 · 分支 · 示例项目'}),'示例项目');
  assert.equal(shortNodeLabel({path:'Vault/GPT-1234567890abcdef-战斗节奏设计.md'}),'战斗节奏设计');
  assert.equal(shortNodeLabel({title:'2026-09-29 关于项目框架设计'}),'项目框架设计');
});

test('透视标签随距离缩小并消失，选中节点保持可读，镜头后方不显示',()=>{
  const at=depth=>labelDetail({depth,radius:2,height:800});
  assert.ok(at(200).fontSize>at(800).fontSize);
  assert.equal(at(800).visible,true);
  assert.equal(at(1600).visible,false);
  assert.equal(labelDetail({depth:1600,radius:2,height:800,priority:true}).fontSize,12);
  assert.equal(labelDetail({depth:-10,radius:2,height:800,priority:true}).visible,false);
});
test('屏幕大小决定文字总量上限，海量节点不会全量标注',()=>{
  assert.ok(labelLimits(390,600).nodes<labelLimits(1920,1080).nodes);
  assert.equal(labelLimits(7680,4320).nodes,18);
  assert.equal(labelLimits(7680,4320).reasons,5);
});
test('短标签限制视觉长度，英文不截断半个单词，原始记录不变',()=>{
  const node={title:'关于多显示器环境中复杂的自适应布局与窗口管理设计',path:'Vault/完整原始文件.md'};
  const original=JSON.stringify(node),label=shortNodeLabel(node);
  assert.ok(label.length<=15);assert.ok(label.endsWith('…'));assert.equal(JSON.stringify(node),original);
  assert.equal(shortNodeLabel({title:'Implementing responsive desktop application architecture'}),'Implementing responsive…');
});
test('空标题使用已有类别作为主题线索，不生成无依据内容',()=>{
  assert.equal(shortNodeLabel({title:'New chat',categories:['游戏设计','界面布局']}),'游戏设计 · 界面布局');
  assert.equal(shortNodeLabel({title:'New chat'}),'未命名对话');
});
