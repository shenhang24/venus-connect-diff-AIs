export function createClassificationApi({baseUrl,fetchImpl=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms)),readTimeout=15000,writeTimeout=120000}={}){
 const base=new URL(baseUrl||'http://127.0.0.1:10001');if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.search||base.hash||!['','/'].includes(base.pathname))throw Error('Classification API must use the existing local service');
 return async(route,body)=>{const method=body===undefined?'GET':'POST',url=base.origin+'/api/'+route;for(let attempt=0;;attempt++){
  let response,data;try{response=await fetchImpl(url,{signal:AbortSignal.timeout(method==='GET'?readTimeout:writeTimeout),...(method==='POST'?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});data=await response.json();}
  catch(error){const code=error.cause?.code||error.code||error.name||'UNKNOWN',transient=/^(ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|TimeoutError|AbortError)$/.test(code);if(method==='GET'&&transient&&attempt<1){await delay(250);continue;}throw Object.assign(Error((method==='GET'?(transient?'LOCAL_API_TRANSPORT':'LOCAL_API_PROTOCOL'):'LOCAL_API_WRITE_OUTCOME_UNKNOWN')+' '+method+' '+new URL(url).pathname+' '+code),{cause:error,code,route,method,writeOutcomeUnknown:method==='POST'});}
  if(!response.ok)throw Error(data.error||'HTTP '+response.status);return data;
 }};
}
export const localReadTransportFailure=error=>/^LOCAL_API_TRANSPORT|^fetch failed$/.test(String(error?.message||error));
