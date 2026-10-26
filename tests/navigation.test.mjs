import test from 'node:test';import assert from 'node:assert/strict';import {Vector3,PerspectiveCamera} from 'three';import {Network} from '../public/graph.js';
class Element{constructor(){this.children=[];this.style={};this.attributes={};}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(k,v){this.attributes[k]=v;}}
test('main-category focus targets the moving core and ignores remote-member fit bounds',()=>{
 const camera=new PerspectiveCamera(48,1.5,.1,8000);camera.position.set(20,30,50);
 const view={host:{clientWidth:1350,clientHeight:900},positions:{a:[100,30,0],remote:[1e9,0,0]},detailRadii:{a:4,remote:2},renderNodes:[{id:'a',isMainTag:true,mainTag:'A'},{id:'remote'}],radii:{a:4,remote:2},camera,controls:{target:new Vector3(),minDistance:8,maxDistance:2400},ring:{visible:true},nodes:[],setBranchSelection(){},setHighlight(ids){this.highlight=new Set(ids);}};
 view.nodes=view.renderNodes;const before=JSON.stringify(view.positions);assert.equal(Network.prototype.focusMainTag.call(view,'A'),true);assert.equal(view.focusTransition.nodeId,'a');assert.deepEqual([...view.highlight],['a']);assert.equal(view.localFocusAnchorId,'a');assert.equal(JSON.stringify(view.positions),before);
 const transition=view.focusTransition;assert.equal(Network.prototype.focusMainTag.call(view,'missing'),false);assert.equal(view.focusTransition,transition);
});
test('each real neighbor receives an independently clickable named navigation arrow',t=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new Element()};t.after(()=>globalThis.document=previous);
 const chosen=[],view={selected:'origin',navigationRoot:new Element()},entries=['a','b','c','d'].map(id=>({id,node:{id,title:'Target '+id},relations:[{typeName:'Related',reason:'existing reason'}]}));
 Network.prototype.setNavigation.call(view,entries,id=>chosen.push(id));assert.equal(view.navigationRoot.children.length,4);
 for(const button of view.navigationRoot.children)button.onclick({stopPropagation(){}});assert.deepEqual(chosen,['a','b','c','d']);assert.match(view.navigationRoot.children[0].attributes['aria-label'],/Target a/);
});
test('neighbor navigation selects the actual target immediately but prepares a smooth camera transition',()=>{
 let selected;const nodes=[{id:'a'},{id:'b'}],camera=new PerspectiveCamera(48,1.25,.1,8000),controls={target:new Vector3(),update(){}},view={setBranchSelection(){},detailRadii:{b:2},host:{clientWidth:1000,clientHeight:800},nodes,positions:{a:[0,0,0],b:[100,20,40]},renderNodes:nodes,camera,controls,ring:{position:new Vector3(),scale:new Vector3()},radii:{b:2},update(){},onSelect:n=>selected=n.id};
 camera.position.set(10,10,10);Network.prototype.select.call(view,'b',{smooth:true});assert.equal(view.selected,'b');assert.equal(selected,'b');assert.ok(view.focusTransition);assert.deepEqual(camera.position.toArray(),[10,10,10]);assert.deepEqual(controls.target.toArray(),[0,0,0]);
});
test('filter focus frames only real matches without changing coordinates; empty matches leave the camera untouched',()=>{
 const camera=new PerspectiveCamera(48,1.5,.1,8000);camera.position.set(20,30,50);const view={positions:{a:[100,30,0],b:[150,-20,80]},renderNodes:[{id:'a'},{id:'b'}],radii:{a:2,b:3},camera,controls:{target:new Vector3(),maxDistance:2400},ring:{visible:true},nodes:[],setBranchSelection(){},setHighlight(ids){this.highlight=new Set(ids);}};
 const before=JSON.stringify(view.positions);assert.equal(Network.prototype.focusNodes.call(view,['a','b']),true);assert.deepEqual([...view.highlight],['a','b']);assert.ok(view.focusTransition.destination.distanceTo(new Vector3(125,5,40))<1e-10);assert.equal(JSON.stringify(view.positions),before);
 const transition=view.focusTransition,position=camera.position.clone();assert.equal(Network.prototype.focusNodes.call(view,['missing']),false);assert.equal(view.focusTransition,transition);assert.ok(camera.position.equals(position));
});
