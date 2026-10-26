import fs from 'node:fs';
import path from 'node:path';

// Watch only library folders; periodically reconcile missed/coalesced events.
export function createLibraryRefresh(store,{watch=fs.watch,clock=Date.now,reconcileMs=60000,onChange=()=>{}}={}){
  const pending=new Set(),watchers=[];
  let full=false,lastFull=clock(),closed=false;
  const mark=(folder,event,name)=>{
    if(!name){full=true;return;}
    const relative=String(name).replaceAll('\\','/');
    if(folder==='.venus'){if(relative==='classifications.md')full=true;return;}
    if(relative.endsWith('.md'))pending.add(folder+'/'+relative);
    else if(event==='rename'&&!relative.endsWith('.tmp'))full=true;
  };
  for(const folder of ['Vault','知识点','技能','概念云','.venus']){
    try{
      const watcher=watch(path.join(store.root,folder),{recursive:folder!=='.venus',persistent:false},(event,name)=>mark(folder,event,name));
      watcher.on('error',()=>{full=true;});watchers.push(watcher);
    }catch{full=true;}
  }
  return {
    poll(){
      if(closed)return;
      const due=clock()-lastFull>=reconcileMs;
      if(!full&&!due&&!pending.size)return;
      const paths=[...pending];pending.clear();const all=full||due;full=false;
      try{const before=new Map((store.nodes||[]).map(n=>[n.id,n.hash+':'+(n.classificationHash||'')]));store.scan(all?{}:{paths});const changed=(store.nodes||[]).filter(n=>before.get(n.id)!==n.hash+':'+(n.classificationHash||'')).map(n=>n.id),present=new Set((store.nodes||[]).map(n=>n.id));for(const id of before.keys())if(!present.has(id))changed.push(id);if(changed.length)onChange({nodeIds:changed,sourceRevision:store.state.revision});if(all)lastFull=clock();}
      catch(error){full=true;for(const p of paths)pending.add(p);throw error;}
    },
    close(){closed=true;for(const watcher of watchers)watcher.close();pending.clear();}
  };
}
