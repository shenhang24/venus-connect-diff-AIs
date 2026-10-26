import {createReadQuery,queryId} from '../src/readonly-query.mjs';
export function createReadonlyClient({baseUrl=process.env.VENUS_URL||'http://127.0.0.1:10001',fetchImpl=fetch,allowAuxiliaryTags=false}={}){
 const url=new URL(baseUrl);if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('只读桥接仅允许指定本机 Venus 服务，不接受外部地址或文件路径');
 const get=async route=>{let response;try{response=await fetchImpl(url.origin+route,{method:'GET',redirect:'error',signal:AbortSignal.timeout(45000)});}catch{throw Object.assign(Error('本机 Venus 不可达'),{status:503,code:'VENUS_UNREACHABLE'});}if(!response.ok)throw Object.assign(Error(response.status===403?'无权限读取此 Venus 内容':'本机 Venus 查询失败（'+response.status+'）'),{status:response.status});return response.json();};
 const client=async(operation,args={})=>{
   if(!['search','node','sources','neighbors','source-fragment','handoff','task-context'].includes(operation))throw Error('只允许只读查询');
   const allowed={'task-context':['ids','budget'],search:['q','kind','mainTag','project','source','date','limit','offset'],node:['id','offset','length'],sources:['id'],neighbors:['id','offset','limit'],'source-fragment':['id','sourceId','offset','length'],handoff:['originId']}[operation];if(Object.keys(args).some(k=>!allowed.includes(k)))throw Error('不接受额外路径或写入参数');
   if(!['search','handoff','task-context'].includes(operation))queryId(args.id);
   try{return await get('/api/read/'+operation+'?'+new URLSearchParams(args));}
   catch(error){if(error.status!==404)throw error;}
   if(operation==='task-context')throw Object.assign(Error('后台尚未加载任务上下文读取接口'),{status:503});
   if(operation==='handoff')throw Object.assign(Error('后台尚未加载交接读取接口'),{status:503});
   // Compatibility with an already-running older backend: no full-library dump.
   if(operation==='node'){const n=await get('/api/node?id='+encodeURIComponent(args.id));return createReadQuery({nodes:[n],relations:[]})(operation,args);}
   if(operation==='source-fragment'){queryId(args.sourceId);const n=await get('/api/node?id='+encodeURIComponent(args.id));if(!n.sources?.some(s=>s.id===args.sourceId))throw Object.assign(Error('没有此来源关联'),{status:403});const source=await get('/api/node?id='+encodeURIComponent(args.sourceId));return createReadQuery({nodes:[n,source],relations:[]})(operation,args);}
   const snapshot=await get('/api/state?summary=1'),store={nodes:snapshot.nodes,relations:snapshot.relations,state:{types:snapshot.types},metadataOnly:true};
   return createReadQuery(store)(operation,args);
 };
 client.setAuxiliary=async args=>{if(!allowAuxiliaryTags)throw Error('此连接默认只读，辅助标签写入尚未授权启用');queryId(args.id);if(Object.keys(args).some(k=>!['id','expectedHash','expectedVersion','tags','aliases','projects'].includes(k)))throw Error('只允许辅助检索字段');const response=await fetchImpl(url.origin+'/api/read/aux-tags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('辅助标签未保存（'+response.status+'），原文未改动');return response.json();};
 return client;
}
