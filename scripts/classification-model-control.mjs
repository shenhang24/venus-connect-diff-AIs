// HTTP observation is verified at work boundaries, never used as a model liveness probe.
export async function runWithLocalControl(run,payload,{boundary,interval=1000,setTimer=setInterval,clearTimer=clearInterval}={}){
 const controller=new AbortController();let failure=null,checking=false,closed=false;
 const timer=setTimer(async()=>{if(checking||closed)return;checking=true;try{await boundary();}catch(error){if(!closed){failure=error;controller.abort();}}finally{checking=false;}},interval);
 try{await boundary();const result=await run(payload,{signal:controller.signal});if(failure)throw failure;return result;}catch(error){throw failure||error;}finally{closed=true;clearTimer(timer);}
}
