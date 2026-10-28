const transportNames=new Set(['TimeoutError','AbortError']);
const transportCodes=/^(ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)$/;
export function localApiDiagnostic(error,{route,method,status}={}){
 const name=typeof error?.name==='string'?error.name:'Error',code=error?.code,causeCode=error?.cause?.code;
 const transient=transportNames.has(name)||transportNames.has(error?.cause?.name)||[code,causeCode].some(value=>typeof value==='string'&&transportCodes.test(value));
 return {name,code:typeof code==='string'||typeof code==='number'?code:null,causeName:typeof error?.cause?.name==='string'?error.cause.name:null,causeCode:typeof causeCode==='string'||typeof causeCode==='number'?causeCode:null,route:route.split('?')[0],method,status:status??null,transient};
}
export function createClassificationApi({baseUrl,fetchImpl=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms)),readTimeout=15000,writeTimeout=120000}={}){
 const base=new URL(baseUrl||'http://127.0.0.1:10001');if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.search||base.hash||!['','/'].includes(base.pathname))throw Error('Classification API must use the existing local service');
 return async(route,body)=>{const method=body===undefined?'GET':'POST',url=base.origin+'/api/'+route;for(let attempt=0;;attempt++){
  let response,data;try{response=await fetchImpl(url,{signal:AbortSignal.timeout(method==='GET'?readTimeout:writeTimeout),headers:{Connection:'close',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{method,body:JSON.stringify(body)}:{})});data=await response.json();}
  catch(error){const diagnostic=localApiDiagnostic(error,{route,method,status:response?.status});if(response&&!response.ok){diagnostic.transient=method==='GET'&&[408,429,500,502,503,504].includes(response.status);throw Object.assign(Error('LOCAL_API_HTTP '+method+' '+new URL(url).pathname+' HTTP '+response.status),{cause:error,route,method,status:response.status,diagnostic,writeRejected:method==='POST'});}if(method==='GET'&&diagnostic.transient&&attempt<1){await delay(250);continue;}
   const kind=method==='POST'?'LOCAL_API_WRITE_OUTCOME_UNKNOWN':diagnostic.transient?'LOCAL_API_TRANSPORT':'LOCAL_API_PROTOCOL';
   throw Object.assign(Error(kind+' '+method+' '+new URL(url).pathname+' '+(diagnostic.causeCode||diagnostic.name)),{cause:error,code:diagnostic.code,route,method,diagnostic,writeOutcomeUnknown:method==='POST'});
  }
  if(!response.ok){const diagnostic=localApiDiagnostic(null,{route,method,status:response.status});diagnostic.transient=method==='GET'&&[408,429,500,502,503,504].includes(response.status);throw Object.assign(Error('LOCAL_API_HTTP '+method+' '+new URL(url).pathname+' HTTP '+response.status+(typeof data?.error==='string'?' '+data.error:'')),{route,method,status:response.status,diagnostic,writeRejected:method==='POST'});}return data;
 }};
}
export const localReadTransportFailure=error=>/^LOCAL_API_TRANSPORT|^fetch failed$/.test(String(error?.message||error))||error?.method==='GET'&&error?.diagnostic?.transient===true;
export async function reconnectLocalRead(read,{boundary=async()=>{},delay=ms=>new Promise(r=>setTimeout(r,ms)),delays=[1000,3000],observe=()=>{}}={}){
 for(let attempt=0;;attempt++){await boundary();try{const result=await read();observe({status:'known',attempt});return result;}catch(error){if(!localReadTransportFailure(error))throw error;observe({status:'unknown',attempt,diagnostic:error.diagnostic||{name:error.name},message:error.message});if(attempt>=delays.length)throw error;await delay(delays[attempt]);}}
}
