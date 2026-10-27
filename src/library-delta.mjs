// A bounded read cache of already-saved changes, not an analysis task queue.
export class LibraryDelta {
 constructor(store,{limit=100}={}){this.store=store;this.limit=limit;this.base=store.state.revision;this.changes=[];}
 record(change){const upserts=change.upserts.map(({body,...n})=>({...n,bodyLength:body.length,sources:n.sources.map(s=>({...s,quoteValid:this.store.sourceQuoteValid(s)}))}));this.changes.push({...change,upserts});if(this.changes.length>this.limit)this.base=this.changes.shift().revision;}
 read(since){if(!Number.isSafeInteger(since)||since<this.base||since>this.store.state.revision)return {resetRequired:true,revision:this.store.state.revision};const nodes=new Map(),removed=new Set();let relations;for(const change of this.changes.filter(c=>c.revision>since)){for(const n of change.upserts){nodes.set(n.id,n);removed.delete(n.id);}for(const id of change.removed){nodes.delete(id);removed.add(id);}relations=change.relations;}return {resetRequired:false,revision:this.store.state.revision,upserts:[...nodes.values()],removed:[...removed],...(relations?{relations}:{})};}
}
