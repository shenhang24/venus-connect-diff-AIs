// Own only the existing local extraction queues; never create a second executor.
export class TaskControl {
  constructor({analyzer,layers,reviewControl,provider,journal,classificationWorker=()=>false}) {
    Object.assign(this,{analyzer,layers,reviewControl,provider,journal,classificationWorker});
  }
  status() {
    const available=!!this.analyzer||!!this.execution?.state.enabled,requested=!!this.analyzer?.state.tasksPaused;
    const active=(this.analyzer?.active.size||0)+(this.layers?.active.size||0);
    const externalActive=!!this.reviewControl?.worker(),classificationActive=!!this.classificationWorker();
    const phase=!available?'unavailable':requested?(active||externalActive||classificationActive?'pausing':'paused'):(this.analyzer?.state.enabled||classificationActive)?'enabled':'stopped';
    const execution=this.execution?.status();const effectivePhase=execution?.enabled&&execution.phase==='paused'&&(active||externalActive)?'pausing':execution?.enabled?(execution.phase==='pausing'?'pausing':execution.phase==='paused'?'paused':['running','resuming','starting'].includes(execution.phase)?'enabled':execution.phase):phase;
    return {available,phase:effectivePhase,pauseMode:execution?.enabled?'checkpoint':null,execution,active,externalActive,classificationActive,canStart:execution?.enabled?!!execution.controls.resume&&!active&&!externalActive:available&&!active&&!externalActive&&!classificationActive&&phase!=='enabled',canPause:execution?.enabled?!!execution.controls.pause:available&&phase!=='paused'&&phase!=='pausing',provider:this.provider,
      checkpointsPreserved:true,externalControlRequired:requested&&(externalActive||classificationActive)};
  }
  control({action,operationId}) {
    if(!['start','pause'].includes(action))throw Object.assign(Error('任务控制操作无效'),{status:400});
    if(!this.analyzer&&!this.execution?.state.enabled)throw Object.assign(Error('任务控制将在后台下次正常启动后可用'),{status:503});
    if(this.execution?.state.enabled||!this.analyzer&&this.execution){if(action==='pause'&&!this.execution.onIntent)this.onPause?.();if(this.analyzer&&!this.analyzer.active.size){this.analyzer.state.tasksPaused=false;this.analyzer.configure({enabled:false});}const r=this.execution.request({action:action==='start'?'resume':'pause',operationId:operationId||'toolbar-'+action+'-'+Date.now()});return {...r,...this.status()};}
    const before=this.status();
    if(action==='start') {
      if(before.phase==='pausing'||before.externalActive||(before.active&&before.phase!=='enabled'))throw Object.assign(Error('任务仍在退出，请等待暂停完成后继续'),{status:409});
      if(before.phase==='enabled')return {accepted:false,unchanged:true,...before};
      this.analyzer.state.tasksPaused=false;
      this.layers?.resumeGlobal();
      this.analyzer.configure({enabled:true});
    } else {
      this.onPause?.();
      this.analyzer.state.tasksPaused=true;
      this.analyzer.configure({enabled:false});
      this.layers?.pauseGlobal();
    }
    const status=this.status();
    this.journal?.append({kind:'operation',action:action==='start'?'TASKS_RESUME_REQUESTED':'TASKS_PAUSE_REQUESTED',status:status.phase==='paused'?'paused':'accepted'});
    return {accepted:true,...status};
  }
}
