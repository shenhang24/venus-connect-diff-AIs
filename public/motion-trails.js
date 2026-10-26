// Render-only distance-sampled histories; no writes to layout or knowledge data.
export class MotionTrails {
 constructor({samples=8,uploadMs=1000/30,stopFadeMs=1500,sampleSpacing=1.05}={}){this.samples=samples;this.uploadMs=uploadMs;this.stopFadeMs=stopFadeMs;this.sampleSpacing=sampleSpacing;this.ids=[];this.lastUpload=-Infinity;}
 sync(nodes,radii,colorFor){
  const same=this.positions instanceof Float32Array&&nodes.length===this.ids.length&&nodes.every((n,i)=>n.id===this.ids[i]);
  if(!same){const old=this.ids.length?{index:new Map(this.ids.map((id,i)=>[id,i])),history:this.history,times:this.times,counts:this.counts,heads:this.heads,lastPosition:this.lastPosition,lastMovement:this.lastMovement}:null;this.ids=nodes.map(n=>n.id);const n=nodes.length,s=this.samples;this.history=new Float64Array(n*s*3);this.times=new Float64Array(n*s);this.counts=new Uint8Array(n);this.heads=new Uint8Array(n);this.lastPosition=new Float64Array(n*3);this.lastMovement=new Float64Array(n);this.positions=new Float32Array(n*s*6);this.colors=new Float32Array(n*s*8);this.widths=new Float32Array(n*s);this.distances=new Float32Array(n*s*2);
   if(old)for(let i=0;i<n;i++){const j=old.index.get(this.ids[i]);if(j===undefined)continue;this.history.set(old.history.subarray(j*s*3,(j+1)*s*3),i*s*3);this.times.set(old.times.subarray(j*s,(j+1)*s),i*s);this.counts[i]=old.counts[j];this.heads[i]=old.heads[j];this.lastPosition.set(old.lastPosition.subarray(j*3,j*3+3),i*3);this.lastMovement[i]=old.lastMovement[j];}
  }
  this.radii=nodes.map(n=>Math.max(.001,radii[n.id]||1));for(let i=0;i<nodes.length;i++){const c=colorFor(nodes[i]);for(let j=0;j<this.samples;j++)this.widths[i*this.samples+j]=this.radii[i];for(let j=0;j<this.samples*2;j++){const k=(i*this.samples*2+j)*4;this.colors[k]=c[0];this.colors[k+1]=c[1];this.colors[k+2]=c[2];}}
  this.lastUpload=-Infinity;return !same;
 }
 update(points,now){
  if(now-this.lastUpload<this.uploadMs)return false;this.lastUpload=now;const slots=this.samples;this.visibleSegments=0;
  for(let i=0;i<this.ids.length;i++){
   const p=points[this.ids[i]],base=i*slots,vertex=i*slots*2,r=this.radii[i];for(let j=0;j<slots*2;j++)this.colors[(vertex+j)*4+3]=0;
   if(!p||!p.every(Number.isFinite))continue;let head=this.heads[i],count=this.counts[i];const previous=i*3,movement=count?Math.hypot(p[0]-this.lastPosition[previous],p[1]-this.lastPosition[previous+1],p[2]-this.lastPosition[previous+2]):0;
   if(movement>1e-9){if(now-this.lastMovement[i]>=this.stopFadeMs)count=0;this.lastMovement[i]=now;}
   this.lastPosition[previous]=p[0];this.lastPosition[previous+1]=p[1];this.lastPosition[previous+2]=p[2];
   const k0=(base+head)*3;
   if(!count||Math.hypot(p[0]-this.history[k0],p[1]-this.history[k0+1],p[2]-this.history[k0+2])>=r*this.sampleSpacing){head=count?(head+1)%slots:0;this.heads[i]=head;this.counts[i]=count=Math.min(slots,count+1);const k=(base+head)*3;this.history[k]=p[0];this.history[k+1]=p[1];this.history[k+2]=p[2];this.times[base+head]=now;if(count===1)this.lastMovement[i]=now;}
   const stoppedFade=Math.max(0,1-(now-this.lastMovement[i])/this.stopFadeMs);if(!stoppedFade)continue;
   let ax=p[0],ay=p[1],az=p[2],travel=0;const maximum=r*8;
   for(let segment=0;segment<count;segment++){
    const index=base+(head-segment+slots)%slots,k=index*3;let bx=this.history[k],by=this.history[k+1],bz=this.history[k+2],d=Math.hypot(bx-ax,by-ay,bz-az);if(d<1e-9)continue;const cut=travel+d>maximum;
    if(cut){const t=Math.max(0,(maximum-travel)/d);bx=ax+(bx-ax)*t;by=ay+(by-ay)*t;bz=az+(bz-az)*t;d=maximum-travel;}
    const pos=(i*slots+segment)*6,dist=(i*slots+segment)*2;this.positions[pos]=ax;this.positions[pos+1]=ay;this.positions[pos+2]=az;this.positions[pos+3]=bx;this.positions[pos+4]=by;this.positions[pos+5]=bz;this.distances[dist]=travel;this.distances[dist+1]=travel+d;this.colors[(i*slots+segment)*8+3]=1;this.visibleSegments++;travel+=d;
    if(cut)break;ax=bx;ay=by;az=bz;
   }
   if(travel)for(let segment=0;segment<slots;segment++){const a=(i*slots+segment)*8,d=(i*slots+segment)*2;if(this.colors[a+3]!==1)continue;this.colors[a+3]=Math.max(0,1-(this.distances[d]/travel)**3)*.28*stoppedFade;this.colors[a+7]=Math.max(0,1-(this.distances[d+1]/travel)**3)*.28*stoppedFade;}
  }
  return true;
 }
}
