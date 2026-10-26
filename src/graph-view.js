import { AffinityLayout } from "/layout.js";
import { MotionTrails } from "/motion-trails.js";
import { NetworkAnimationClock } from "/animation-clock.js";
import { heatText } from "/i18n.js";
import { shortNodeLabel, labelDetail, labelLimits, showNodeLabel } from "/network-labels.js";
import { configureNetworkControls, followSelectedPosition, overviewDistance, mainTagRegion, nodeFocusRegion } from "/network-controls.js";
import { buildMainTagGraph, matchesMainTag, effectiveDegrees, displayedRadius } from "/main-tags.js";
import { branchVisibility, aggregateDisplayRadius, radiusTransition } from "/branch-visibility.js";
const layoutSessions = new Map();
const replayEpochs = new Map();
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export function proceduralStarMaterial(){return new THREE.ShaderMaterial({depthWrite:true,depthTest:true,toneMapped:false,
  vertexShader:'varying vec2 starUv;varying vec3 starColor;void main(){starUv=uv;starColor=vec3(1.0);\n#ifdef USE_INSTANCING_COLOR\nstarColor=instanceColor;\n#endif\nvec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);float radius=length(instanceMatrix[0].xyz);center.xy+=position.xy*radius;gl_Position=projectionMatrix*center;}',
  fragmentShader:'varying vec2 starUv;varying vec3 starColor;void main(){vec2 p=starUv*2.0-1.0;float r2=dot(p,p);if(r2>1.0)discard;float shade=0.86+0.14*sqrt(max(0.0,1.0-r2));gl_FragColor=vec4(starColor*shade,1.0);\n#include <colorspace_fragment>\n}'
});}
export function raycastProceduralStars(raycaster,hits){
  const matrix=new THREE.Matrix4(),center=new THREE.Vector3(),scale=new THREE.Vector3(),sphere=new THREE.Sphere(),hit=new THREE.Vector3();
  for(let i=0;i<this.count;i++){this.getMatrixAt(i,matrix);matrix.premultiply(this.matrixWorld);center.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);sphere.set(center,Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z)));if(!raycaster.ray.intersectSphere(sphere,hit))continue;const distance=raycaster.ray.origin.distanceTo(hit);if(distance<raycaster.near||distance>raycaster.far)continue;hits.push({distance,point:hit.clone(),object:this,instanceId:i});}
}
export class Network {
  constructor(
    host,
    { onSelect, onOpen, onEdge, onStats, layoutKey, onCheckpoint, onMainTag, onClearSelection },
  ) {
    this.layoutKey = layoutKey || "network";
    this.onCheckpoint = onCheckpoint;
    this.pose = new THREE.Object3D();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.host = host;
    this.onSelect = onSelect;
    this.onOpen = onOpen;
    this.onEdge = onEdge;
    this.onStats = onStats;
    this.onMainTag=onMainTag;
    this.onClearSelection=onClearSelection;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#000000");
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 8000);
    this.camera.position.set(130, 100, 200);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 2400;
    this.controls.addEventListener('start',()=>{this.overviewActive=false;this.focusTransition=null;this.localFocusAnchorId=null;this.localFollowPosition=null;});
    this.navigationRoot=document.createElement('div');this.navigationRoot.className='graph-neighbour-nav';host.append(this.navigationRoot);
    this.disposeInput=configureNetworkControls(this.controls,this.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.labelRoot = document.createElement("div");
    host.append(this.labelRoot);
    this.labels = [];
    this.selected = null;
    this.hidden = new Set();
    this.frames = [];
    this.last = performance.now();
    this.animationClock=new NetworkAnimationClock(this.last);
    this.visibilityClock=()=>{this.lastSimulationFrame=performance.now();this.last=this.lastSimulationFrame;this.animationClock.resetFrame(this.last);};
    document.addEventListener('visibilitychange',this.visibilityClock);
    this.frame = 0;
    this.resize = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      this.renderer.setSize(width, height);
      this.camera.aspect = width / Math.max(height, 1);
      this.camera.updateProjectionMatrix();
      if(this.overviewActive&&this.renderNodes?.length)this.fit();
    });
    this.resize.observe(host);
    this.down = (e) => {
      this.press = e.button===0?[e.clientX, e.clientY]:null;
    };
    this.click = (e) => {
      if (
        e.button!==0 || !this.press ||
        Math.hypot(e.clientX - this.press[0], e.clientY - this.press[1]) > 5
      )
        return;
      const hit = this.pick(e);
      if (hit?.node) this.select(hit.node.id);
      else if (hit?.edge) {
        if(hit.edge.membershipLink){this.onMainTag?.(hit.edge.mainTag);return;}
        this.focusEdge = hit.edge.id;
        this.onEdge(hit.edge);
      }
      else this.fit();
    };
    this.double = (e) => {
      const hit = this.pick(e);
      if (hit?.node&&!hit.node.isMainTag) this.onOpen(hit.node);
    };
    this.hover = (e) => {
      const now = performance.now();
      if (e.buttons || now - (this.lastHover || 0) < 60) return;
      this.lastHover = now;
      const hit = this.pick(e);
      this.hovered = hit?.node?.id || null;
      this.hoverEdge = hit?.edge?.id || null;
      this.lastLabelCandidates = 0;
    };
    this.leave = () => { this.hovered = null; this.hoverEdge = null; this.lastLabelCandidates = 0; };
    this.renderer.domElement.addEventListener("pointerdown", this.down);
    this.renderer.domElement.addEventListener("click", this.click);
    this.renderer.domElement.addEventListener("dblclick", this.double);
    this.renderer.domElement.addEventListener("pointermove", this.hover);
    this.renderer.domElement.addEventListener("pointerleave", this.leave);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.045, 6, 48),
      new THREE.MeshBasicMaterial({ color: "#d5baf5", depthTest: false }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);
    this.animate();
  }
  pick(e) {
    const b = this.host.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - b.left) / b.width) * 2 - 1,
      (-(e.clientY - b.top) / b.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const n = this.mesh ? this.raycaster.intersectObject(this.mesh)[0] : null;
    if (n) return { node: this.renderNodes[n.instanceId] };
    for (const m of this.edgeMeshes || []) {
      const hit = this.raycaster.intersectObject(m)[0];
      if (hit) return { edge: m.userData.edges[hit.instanceId] };
    }
    return null;
  }
  disposeMesh(m) {
    if (!m) return;
    this.scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  update({ nodes, edges, positions, types, settings, hidden, visibleRelationTypes=null,visibleIds, mainTag=this.mainTag,layoutEpoch=0 }) {
    this.updateInput={nodes,edges,positions,types,settings,hidden,visibleRelationTypes,visibleIds,mainTag,layoutEpoch};
    const oldRadii=this.radii||{},oldVisible=new Set((this.renderNodes||[]).map(n=>n.id));
    const syntheticBenchmark=nodes[0]?.id?.startsWith('bench-');
    const grouped=buildMainTagGraph(nodes.filter(n=>!n.isMainTag),edges.filter(e=>!e.semanticAnchor),positions,settings.distance);
    nodes=grouped.nodes;edges=grouped.edges;positions=grouped.positions;this.mainTag=mainTag||null;
    if(visibleIds){visibleIds=new Set(visibleIds);for(const n of nodes)if(n.isMainTag)visibleIds.add(n.id);}
    const key = syntheticBenchmark
      ? "benchmark/" + nodes.length
      : this.layoutKey;
    if(this.layoutEpoch!==layoutEpoch){layoutSessions.delete(key);this.layoutEpoch=layoutEpoch;this.replayPending=layoutEpoch>0;this.expansion=null;if(this.trailMesh)this.disposeMesh(this.trailMesh);this.trailMesh=null;this.motionTrails=null;this.selected=null;this.followPosition=null;this.primaryFollowPosition=null;this.revealedMainTag=null;this.initialFit=false;this.simulationFit=false;}
    if (!layoutSessions.has(key)) layoutSessions.set(key, new AffinityLayout());
    const previousLayout=this.layout;
    this.layout = layoutSessions.get(key);
    const previousLayoutSignature=this.layout.signature;
    this.layout.sync({
      nodes,
      edges,
      seeds: positions,
      spacing: settings.distance,
      growth: settings.growth??.01,
      baseRadius:settings.baseRadius,
    });
    this.branchState=branchVisibility(nodes,edges,this.layout.orbits,this.branchSelection,visibleIds);
    this.layout.setActiveNodes(this.branchState.visibleIds);
    // Place new/grown spheres safely before exposing their first rendered frame.
    if(this.layout.signature!==previousLayoutSignature&&!this.animationClock.paused)this.layout.step();
    positions = this.layout.positions;
    this.nodes = nodes;
    this.updateReplayPositions(this.animationClock.now);
    this.nodeById=new Map(nodes.map(n=>[n.id,n]));
    this.visibleIds = visibleIds;
    this.renderNodes = nodes.filter(n=>this.branchState.visibleIds.has(n.id));
    this.host.dataset.visibleNodes=String(this.renderNodes.length);this.host.dataset.totalNodes=String(nodes.length);this.host.dataset.activeNodes=String(this.layout.activeNodes.length);this.host.dataset.branchSelection=this.branchSelection||'';
    this.edges = edges;
    this.positions = positions;
    this.types = types;
    this.settings = settings;
    this.visibleRelationTypes=visibleRelationTypes;
    this.hidden = visibleRelationTypes?new Set([...types,{id:'@semantic'}].filter(t=>!visibleRelationTypes.has(t.id)).map(t=>t.id)):hidden||new Set([...types,{id:'@semantic'}].map(t=>t.id));
    this.disposeMesh(this.mesh);
    this.disposeMesh(this.glow);
    for (const m of this.edgeMeshes || []) this.disposeMesh(m);
    this.edgeMeshes = [];
    const degree = effectiveDegrees(edges);
    this.radii = {};
    this.detailRadii={};this.radiusTweens=new Map();this.radiusTweenStart=performance.now();
    this.degree = degree;
    const dummy = new THREE.Object3D();
    const pointStars=this.renderNodes.length>2000;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,pointStars?1:2));
    this.mesh = new THREE.InstancedMesh(
      pointStars?new THREE.PlaneGeometry(2,2):new THREE.SphereGeometry(1,10,8),
      pointStars?proceduralStarMaterial():new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      this.renderNodes.length,
    );
    if(pointStars)this.mesh.raycast=raycastProceduralStars;
    else this.mesh.material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 venusSurface;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvenusSurface=position;');
      shader.fragmentShader='varying vec3 venusSurface;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= 0.86 + 0.14 * (0.5 + 0.5 * sin(atan(venusSurface.z,venusSurface.x)*3.0+venusSurface.y*6.0));');
    };
    // One batched billboard layer: soft local halos without blurring lines or labels.
    this.glow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1,1),
      new THREE.ShaderMaterial({
        transparent:true, depthWrite:false, depthTest:true,
        blending:THREE.AdditiveBlending, toneMapped:false,
        uniforms:{viewportHeight:{value:Math.max(1,this.host.clientHeight)}},
        vertexShader:`
          uniform float viewportHeight;
          varying vec2 haloUv;
          varying vec3 haloColor;
          void main() {
            haloUv = uv;
            #ifdef USE_INSTANCING_COLOR
              haloColor = instanceColor;
            #else
              haloColor = vec3(1.0);
            #endif
            vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
            float radius = length(instanceMatrix[0].xyz);
            // Keep a six-CSS-pixel light visible at galactic overview scales.
            // The physical sphere and all orbital distances remain unchanged.
            float minimumDiameter = 12.0 * max(-center.z,0.0001) / (projectionMatrix[1][1] * max(viewportHeight,1.0));
            center.xy += position.xy * max(radius * 8.0,minimumDiameter);
            gl_Position = projectionMatrix * center;
          }
        `,
        fragmentShader:`
          varying vec2 haloUv;
          varying vec3 haloColor;
          void main() {
            float r = length(haloUv - vec2(0.5)) * 2.0;
            float falloff = exp(-5.0 * r * r) * (1.0 - smoothstep(0.65,1.0,r));
            float alpha = 0.22 * falloff;
            if (alpha < 0.002) discard;
            gl_FragColor = vec4(haloColor,alpha);
            #include <colorspace_fragment>
          }
        `,
      }),
      this.renderNodes.length,
    );
    this.glow.renderOrder=1;
    this.renderNodes.forEach((n, i) => {
      const detail=displayedRadius(n,settings,degree[n.id]||0);this.detailRadii[n.id]=detail;
      const count=this.branchState.aggregateCounts.get(n.id),target=count===undefined?detail:aggregateDisplayRadius(settings.baseRadius,count);
      const r=oldVisible.has(n.id)?oldRadii[n.id]??target:(oldVisible.size ? .001 : target);
      if(Math.abs(r-target)>1e-7)this.radiusTweens.set(n.id,{from:r,to:target});
      this.radii[n.id] = r;
      dummy.position.fromArray(positions[n.id]);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      const color=new THREE.Color(n.heat?.color||'#eeeeee');
      if(this.mainTag&&!matchesMainTag(n,this.mainTag))color.multiplyScalar(.18);
      if(this.highlightIds?.size&&!this.highlightIds.has(n.id))color.multiplyScalar(.24);
      this.mesh.setColorAt(i,color);
      this.glow.setMatrixAt(i,dummy.matrix);
      this.glow.setColorAt(i,color);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
    this.mesh.computeBoundingSphere();
    this.scene.add(this.mesh);
    this.syncMotionTrails();
    this.glow.instanceMatrix.needsUpdate=true;
    if(this.glow.instanceColor)this.glow.instanceColor.needsUpdate=true;
    // The billboard extends beyond its core sphere, so do not cull it using core bounds.
    this.glow.frustumCulled=false;
    this.scene.add(this.glow);
    const ids = new Set(this.renderNodes.map((n) => n.id));
    const up = new THREE.Vector3(0, 1, 0);
    let visible = 0;
    for (const t of [...types,{id:'@semantic',color:'#8a9aac',membershipLink:true}]) {
      const list = edges.filter(
        (e) =>
          e.type === t.id &&
          !this.hidden.has(t.id) &&
          ids.has(e.from) &&
          ids.has(e.to),
      );
      if (!list.length) continue;
      visible += list.length;
      const mesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, 5),
        new THREE.MeshBasicMaterial({
          color: t.color,
          transparent: true,
          opacity: t.membershipLink ? 0.36 : 0.43,
        }),
        list.length,
      );
      mesh.userData.edges = list;
      list.forEach((e, i) => {
        const a = new THREE.Vector3().fromArray(positions[e.from]),
          b = new THREE.Vector3().fromArray(positions[e.to]),
          v = b.clone().sub(a);
        dummy.position.copy(a).add(b).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(up, v.clone().normalize());
        dummy.scale.set(
          e.membershipLink ? 0.085 : 0.055 + e.strength * 0.17,
          v.length(),
          e.membershipLink ? 0.085 : 0.055 + e.strength * 0.17,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const linked=!this.mainTag||[e.from,e.to].some(id=>matchesMainTag(this.nodeById.get(id)||{},this.mainTag));
        mesh.setColorAt(i,new THREE.Color(linked?'#ffffff':'#404040'));
      });
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.edgeMeshes.push(mesh);
    }
    this.visibleEdges = visible;
    this.labelRoot.replaceChildren();
    this.labels = [];
    const top = this.renderNodes.slice(0, 96);
    for (const n of top) {
      const el = document.createElement("div");
      el.className =
        "graph-label" + (n.id === this.selected ? " selected" : "");
      el.textContent = shortNodeLabel(n, 20);
      el.onpointerenter = () => { this.hovered = el.dataset.nodeId; this.lastLabelCandidates = 0; };
      el.onpointerleave = () => { this.hovered = null; this.lastLabelCandidates = 0; };
      el.onclick = (event) => {
        event.stopPropagation(); clearTimeout(this.labelClickTimer);
        const id = el.dataset.nodeId;
        this.labelClickTimer = setTimeout(() => this.select(id), 230);
      };
      el.ondblclick = (event) => { event.stopPropagation(); clearTimeout(this.labelClickTimer); const node = this.nodes.find(n => n.id === el.dataset.nodeId); if (node) this.onOpen(node); };
      this.labelRoot.append(el);
      this.labels.push({ el, id: n.id });
    }
    this.lastLabelCandidates = 0;
    this.edgeLabels = [];
    const labelled = this.edgeMeshes
      .flatMap((m) => m.userData.edges)
      .sort(
        (a, b) =>
          (b.id === this.focusEdge ? 5 : 0) +
          (b.from === this.selected || b.to === this.selected ? 2 : 0) +
          b.strength -
          ((a.id === this.focusEdge ? 5 : 0) +
            (a.from === this.selected || a.to === this.selected ? 2 : 0) +
            a.strength),
      )
      .slice(0, 80);
    for (const edge of labelled) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "graph-edge-label";
      const rawReason = edge.summary || edge.reason || "合成连边 · 绘制试验";
      const reason = edge.semanticAnchor ? tr(rawReason) : rawReason;
      el.textContent = shortNodeLabel({title:reason},24);
      el.title =
        (types.find((t) => t.id === edge.type)?.name || "关系") +
        "：" +
        (edge.reason || reason);
      el.setAttribute("aria-label", tr("连接原因：") + reason);
      el.onclick = () => {
        if(edge.membershipLink){this.onMainTag?.(edge.mainTag);return;}
        this.focusEdge = edge.id;
        this.onEdge(edge);
      };
      this.labelRoot.append(el);
      this.edgeLabels.push({ el, edge });
    }
    if (!this.selected || !ids.has(this.selected)) {
      this.selected = null;
      this.ring.visible = false;
    }
    if (!this.initialFit && nodes.length) {
      this.initialFit = true;
      this.fit({track:true});
    }
    if(previousLayout!==this.layout){this.lastSimulationFrame=performance.now();this.animationClock.resetFrame(this.lastSimulationFrame);}
  }
  refreshLabelCandidates(now) {
    if (!this.positions || now - (this.lastLabelCandidates || 0) < 180) return;
    this.lastLabelCandidates = now;
    const candidates = [];
    for (const node of this.renderNodes) {
      if(!showNodeLabel(node,this.revealedMainTag))continue;
      this.a.fromArray(this.positions[node.id]).applyMatrix4(this.camera.matrixWorldInverse);
      const depth = -this.a.z;
      if (depth <= 0) continue;
      const priority = node.isMainTag || node.id === this.selected || node.id === this.hovered;
      const detail = labelDetail({depth, radius:this.radii[node.id], height:this.host.clientHeight, fov:this.camera.fov, priority});
      if (!detail.visible) continue;
      this.b.fromArray(this.positions[node.id]).project(this.camera);
      if (Math.abs(this.b.x) > 1 || Math.abs(this.b.y) > 1 || Math.abs(this.b.z) > 1) continue;
      candidates.push({node, score: (priority ? 1e6 : 0) + this.radii[node.id] / depth});
    }
    candidates.sort((a,b) => b.score - a.score);
    this.labels.forEach((entry, i) => {
      const node = candidates[i]?.node;
      entry.id = node?.id;
      entry.el.style.display = 'none';
      if (!node) return;
      entry.el.dataset.nodeId = node.id;
      entry.el.textContent = shortNodeLabel(node, 20);
      const heat=node.heat?.name?heatText(node.heat):null;
      entry.el.title = node.title + (node.path ? '\n' + node.path : '') + (heat ? '\n'+heat.name+' · '+heat.label+'\n'+heat.reason : '');
      entry.el.style.borderColor=node.heat?.color||'#eeeeee';
      entry.el.setAttribute('aria-label',node.title);
    });
  }
  syncMotionTrails(){
    const large=this.renderNodes.length>2000,samples=large?4:8;
    if(!this.motionTrails||this.motionTrails.samples!==samples)this.motionTrails=new MotionTrails({samples,sampleSpacing:large?1.4:1.05,uploadMs:1000/(large?20:30)});
    const changed=this.motionTrails.sync(this.renderNodes,this.radii,n=>{const c=new THREE.Color(n.heat?.color||'#eeeeee');if(this.mainTag&&!matchesMainTag(n,this.mainTag))c.multiplyScalar(.18);if(this.highlightIds?.size&&!this.highlightIds.has(n.id))c.multiplyScalar(.24);return [c.r,c.g,c.b];});
    if(changed||!this.trailMesh){
      this.disposeMesh(this.trailMesh);const geometry=new THREE.InstancedBufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.5,1,0,.5,1,0],3));geometry.setIndex([0,1,2,2,1,3]);geometry.instanceCount=this.renderNodes.length*this.motionTrails.samples;
      const points=new THREE.InstancedInterleavedBuffer(this.motionTrails.positions,6).setUsage(THREE.DynamicDrawUsage),colors=new THREE.InstancedInterleavedBuffer(this.motionTrails.colors,8).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('instanceStart',new THREE.InterleavedBufferAttribute(points,3,0));geometry.setAttribute('instanceEnd',new THREE.InterleavedBufferAttribute(points,3,3));geometry.setAttribute('startColor',new THREE.InterleavedBufferAttribute(colors,4,0));geometry.setAttribute('endColor',new THREE.InterleavedBufferAttribute(colors,4,4));geometry.setAttribute('instanceWidth',new THREE.InstancedBufferAttribute(this.motionTrails.widths,1).setUsage(THREE.DynamicDrawUsage));
      this.trailMesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
        vertexShader:'attribute vec3 instanceStart;attribute vec3 instanceEnd;attribute vec4 startColor;attribute vec4 endColor;attribute float instanceWidth;varying vec4 trailColor;varying float across;void main(){vec4 a=viewMatrix*vec4(instanceStart,1.0);vec4 b=viewMatrix*vec4(instanceEnd,1.0);vec2 delta=b.xy-a.xy;vec2 normal=length(delta)>0.000001?normalize(vec2(-delta.y,delta.x)):vec2(1.0,0.0);vec4 p=mix(a,b,position.y);p.xy+=normal*position.x*instanceWidth;gl_Position=projectionMatrix*p;trailColor=mix(startColor,endColor,position.y);across=position.x;}',
        fragmentShader:'varying vec4 trailColor;varying float across;void main(){float softness=1.0-smoothstep(0.25,0.5,abs(across));float alpha=trailColor.a*softness;if(alpha<0.001)discard;gl_FragColor=vec4(trailColor.rgb,alpha);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
      }));this.trailMesh.frustumCulled=false;this.trailMesh.renderOrder=0;this.scene.add(this.trailMesh);
    }
    this.trailMesh.geometry.attributes.instanceWidth.needsUpdate=true;
  }
  updateMotionTrails(now){
    if(this.motionTrails?.update(this.positions,now)){this.trailMesh.geometry.attributes.instanceStart.data.needsUpdate=true;this.trailMesh.geometry.attributes.startColor.data.needsUpdate=true;}
  }
  updateReplayPositions(now){
    if(!this.layout)return false;
    if(this.replayPending){
      const key='venus-expansion:'+this.layoutKey;let previous=replayEpochs.get(key);
      try{if(typeof sessionStorage!=='undefined')previous=Number(sessionStorage.getItem(key))||previous;}catch{}
      if(previous!==this.layoutEpoch){this.expansion={start:now,duration:5000};replayEpochs.set(key,this.layoutEpoch);try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem(key,String(this.layoutEpoch));}catch{}}
      this.replayPending=false;
    }
    if(!this.expansion){this.positions=this.layout.positions;return false;}
    const t=Math.min(1,Math.max(0,(now-this.expansion.start)/this.expansion.duration)),ease=t*t*(3-2*t),origin=this.layout.positions[this.layout.coreId]||this.layout.center||[0,0,0];
    this.positions=Object.fromEntries((this.renderNodes||this.nodes).map(n=>[n.id,this.layout.positions[n.id].map((x,k)=>origin[k]+(x-origin[k])*ease)]));
    if(t===1){this.expansion=null;this.positions=this.layout.positions;}return true;
  }
  updatePoses() {
    for(const [id,tween]of this.radiusTweens||[]){const value=radiusTransition(tween.from,tween.to,performance.now()-this.radiusTweenStart);this.radii[id]=value.radius;if(value.done)this.radiusTweens.delete(id);}
    const d = this.pose;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity,padding=1;
    for (let i = 0; i < this.renderNodes.length; i++) {
      const n = this.renderNodes[i];
      const p=this.positions[n.id];
      minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);minZ=Math.min(minZ,p[2]);
      maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);maxZ=Math.max(maxZ,p[2]);padding=Math.max(padding,this.radii[n.id]);
      d.position.fromArray(p);
      d.rotation.set(.15,this.layout.spinAngle(n.id),.12);
      d.scale.setScalar(this.radii[n.id]);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.glow?.setMatrixAt(i,d.matrix);
    }
    if (this.mesh) {
      this.mesh.instanceMatrix.needsUpdate = true;
      // One conservative bound collected during the pose upload, reused for
      // every edge batch. No second per-instance matrix/sphere traversal.
      this.mesh.boundingSphere||=new THREE.Sphere();
      if(this.renderNodes.length){this.mesh.boundingSphere.center.set((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);this.mesh.boundingSphere.radius=Math.hypot(maxX-minX,maxY-minY,maxZ-minZ)/2+padding;}
      else this.mesh.boundingSphere.makeEmpty();
    }
    if(this.glow)this.glow.instanceMatrix.needsUpdate=true;
    for (const mesh of this.edgeMeshes || []) {
      for (let i = 0; i < mesh.userData.edges.length; i++) {
        const e = mesh.userData.edges[i];
        this.a.fromArray(this.positions[e.from]);
        this.b.fromArray(this.positions[e.to]);
        this.direction.copy(this.b).sub(this.a);
        const length = this.direction.length();
        d.position.copy(this.a).add(this.b).multiplyScalar(0.5);
        d.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
        d.scale.set(
          e.membershipLink ? 0.085 : 0.055 + e.strength * 0.17,
          length,
          e.membershipLink ? 0.085 : 0.055 + e.strength * 0.17,
        );
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere||=new THREE.Sphere();
      mesh.boundingSphere.copy(this.mesh.boundingSphere);
    }
    if (this.selected && this.positions[this.selected]) {
      this.a.fromArray(this.positions[this.selected]);
      if(!this.focusTransition)this.followPosition=followSelectedPosition(this.camera,this.controls,this.positions[this.selected],this.followPosition);
      this.ring.position.copy(this.a);
    }else if(this.localFocusAnchorId&&this.positions[this.localFocusAnchorId]){
      if(!this.focusTransition)this.localFollowPosition=followSelectedPosition(this.camera,this.controls,this.positions[this.localFocusAnchorId],this.localFollowPosition);
    }else if(this.layout.coreId&&this.positions[this.layout.coreId]){
      this.primaryFollowPosition=followSelectedPosition(this.camera,this.controls,this.layout.focalPosition(),this.primaryFollowPosition);
    }
  }
  setNavigation(entries,onNavigate){
    this.navigateNeighbour=onNavigate;
    const key=this.selected+'|'+entries.map(e=>e.id+':'+e.node.title).join('|');if(key===this.navigationKey)return;
    this.navigationKey=key;this.navigationRoot.replaceChildren();this.navigationButtons=[];
    for(const entry of entries){const button=document.createElement('button');button.className='graph-neighbour-arrow';button.type='button';button.title=entry.node.title+'\n'+entry.relations.map(r=>r.typeName+'：'+(r.reason||r.summary||'')).join('\n');
      const arrow=document.createElement('span');arrow.textContent='➜';const label=document.createElement('span');label.textContent=shortNodeLabel(entry.node,12);button.append(arrow,label);button.setAttribute('aria-label','沿连接查看 '+entry.node.title);button.onclick=event=>{event.stopPropagation();this.navigateNeighbour?.(entry.id);};this.navigationRoot.append(button);this.navigationButtons.push({id:entry.id,button,arrow});}
  }
  setHighlight(ids){
    this.highlightIds=new Set(ids);
    for(let i=0;i<(this.renderNodes||[]).length;i++){const n=this.renderNodes[i],color=new THREE.Color(n.heat?.color||'#eeeeee');if(this.mainTag&&!matchesMainTag(n,this.mainTag))color.multiplyScalar(.18);if(this.highlightIds.size&&!this.highlightIds.has(n.id))color.multiplyScalar(.24);this.mesh?.setColorAt(i,color);this.glow?.setColorAt(i,color);}
    if(this.mesh?.instanceColor)this.mesh.instanceColor.needsUpdate=true;if(this.glow?.instanceColor)this.glow.instanceColor.needsUpdate=true;
  }
  focusNodes(ids){
    const available=[...new Set(ids)].filter(id=>this.positions[id]&&this.renderNodes.some(n=>n.id===id));if(!available.length)return false;
    const points=available.map(id=>new THREE.Vector3().fromArray(this.positions[id])),box=new THREE.Box3().setFromPoints(points),center=box.getCenter(new THREE.Vector3());
    const radius=Math.max(...points.map((p,i)=>p.distanceTo(center)+(this.radii[available[i]]||2)*2)),distance=overviewDistance(radius,this.camera.fov,this.camera.aspect);
    const direction=this.camera.position.clone().sub(this.controls.target);if(direction.length()<.001)direction.set(.65,.5,1);direction.normalize();
    this.selected=null;this.followPosition=null;this.ring.visible=false;this.overviewActive=false;this.setHighlight(available);
    this.localFocusAnchorId=null;this.localFollowPosition=null;
    this.camera.far=Math.max(this.camera.far,distance*5);this.camera.updateProjectionMatrix();this.controls.maxDistance=Math.max(this.controls.maxDistance,distance*4);
    this.focusTransition={from:this.controls.target.clone(),camera:this.camera.position.clone(),offset:direction.multiplyScalar(distance),destination:center,start:performance.now()};return true;
  }
  focusMainTag(name){
    const root=this.nodes.find(n=>n.isMainTag&&n.mainTag===name);if(root)this.setBranchSelection(root.id);
    const region=mainTagRegion({nodes:this.renderNodes,positions:this.positions,radii:this.detailRadii,mainTag:name,width:this.host.clientWidth,height:this.host.clientHeight,fov:this.camera.fov,aspect:this.camera.aspect,minDistance:this.controls.minDistance});if(!region)return false;
    const center=new THREE.Vector3().fromArray(region.center),direction=this.camera.position.clone().sub(this.controls.target);if(direction.length()<.001)direction.set(.65,.5,1);direction.normalize();
    this.selected=null;this.followPosition=null;this.ring.visible=false;this.overviewActive=false;this.simulationFit=true;this.localFocusAnchorId=region.anchorId;this.localFollowPosition=center.clone();this.revealedMainTag=region.anchorId;this.lastLabelCandidates=0;this.setHighlight(region.ids);
    this.camera.far=Math.max(this.camera.far,region.distance*5);this.camera.updateProjectionMatrix();this.controls.maxDistance=Math.max(this.controls.maxDistance,region.distance*4);
    this.focusTransition={from:this.controls.target.clone(),camera:this.camera.position.clone(),offset:direction.multiplyScalar(region.distance),nodeId:region.anchorId,start:performance.now()};this.lastMainTagRegion=region;return true;
  }
  updateNavigation(){
    if(!this.selected||!this.positions[this.selected]){this.navigationRoot.hidden=true;return;}this.navigationRoot.hidden=false;
    const w=this.host.clientWidth,h=this.host.clientHeight,origin=new THREE.Vector3().fromArray(this.positions[this.selected]).project(this.camera),ox=Math.max(20,Math.min(w-20,(origin.x*.5+.5)*w)),oy=Math.max(20,Math.min(h-20,(-origin.y*.5+.5)*h)),occupied=[];
    let shown=0;
    for(const entry of this.navigationButtons||[]){
      const position=this.positions[entry.id];if(!position||shown>=12){entry.button.hidden=true;continue;}
      const p=new THREE.Vector3().fromArray(position).project(this.camera);let dx=(p.x*.5+.5)*w-ox,dy=(-p.y*.5+.5)*h-oy;if(p.z>1){dx=-dx;dy=-dy;}
      const angle=Math.atan2(dy,dx);let accepted=false;
      for(let lane=0;lane<4;lane++){
        const radius=80+lane*35,x=Math.max(10,Math.min(w-145,ox+Math.cos(angle)*radius)),y=Math.max(42,Math.min(h-100,oy+Math.sin(angle)*radius));
        if(occupied.some(b=>Math.abs(x-b.x)<140&&Math.abs(y-b.y)<30))continue;
        occupied.push({x,y});entry.button.style.transform=`translate(${x}px,${y}px)`;entry.arrow.style.transform=`rotate(${angle}rad)`;entry.button.hidden=false;accepted=true;shown++;break;
      }
      if(!accepted)entry.button.hidden=true;
    }
  }
  select(id,{smooth=true}={}) {
    const node=this.nodes.find(n=>n.id===id);
    if(!node)return;
    if(node.isMainTag){this.revealedMainTag=id;this.lastLabelCandidates=0;this.setBranchSelection(id);this.onMainTag?.(node.mainTag);return;}
    this.setBranchSelection(id);
    this.revealedMainTag=null;
    if (!this.positions[id] || !this.renderNodes.some((n) => n.id === id))
      return;
    this.selected = id;
    this.localFocusAnchorId=null;this.localFollowPosition=null;
    this.overviewActive=false;
    const target = new THREE.Vector3().fromArray(this.positions[id]);
    const region=nodeFocusRegion({nodes:this.renderNodes,positions:this.positions,radii:this.detailRadii,nodeId:id,width:this.host.clientWidth,height:this.host.clientHeight,fov:this.camera.fov,aspect:this.camera.aspect,minDistance:this.controls.minDistance});
    const direction=this.camera.position.clone().sub(this.controls.target);if(direction.length()<.001)direction.set(.65,.5,1);direction.normalize();
    const offset=direction.multiplyScalar(region?.distance||Math.max(12,(this.radii[id]||2)*8));
    this.simulationFit=true;this.camera.far=Math.max(this.camera.far,offset.length()*5);this.camera.updateProjectionMatrix();
    if(smooth)this.focusTransition={from:this.controls.target.clone(),camera:this.camera.position.clone(),offset,nodeId:id,start:performance.now()};
    else{this.focusTransition=null;this.camera.position.copy(target).add(offset);this.controls.target.copy(target);}
    this.followPosition=target.clone();
    this.ring.position.copy(target);
    this.ring.scale.setScalar((this.radii[id] || 2) + 1.8);
    this.ring.visible = true;
    this.controls.update();
    this.update({
      nodes: this.nodes,
      edges: this.edges,
      positions: this.positions,
      types: this.types,
      settings: this.settings,
      hidden: this.hidden,
      visibleRelationTypes:this.visibleRelationTypes,
      visibleIds: this.visibleIds,
      mainTag:this.mainTag,
      layoutEpoch:this.layoutEpoch,
    });
    this.onSelect(this.nodes.find((n) => n.id === id));
  }
  fit({track=false}={}) {
    if(!track&&this.branchSelection){this.branchSelection=null;this.revealedMainTag=null;this.update(this.updateInput);}
    if (!this.renderNodes.length) return;
    this.overviewActive=true;
    if(!track){this.selected=null;this.followPosition=null;this.ring.visible=false;this.focusTransition=null;this.localFocusAnchorId=null;this.localFollowPosition=null;this.setHighlight([]);this.onClearSelection?.();}
    const center = new THREE.Vector3().fromArray(this.layout.focalPosition());
    this.primaryFollowPosition=center.clone();
    let radius=0;
    for(const n of this.renderNodes)radius=Math.max(radius,new THREE.Vector3().fromArray(this.positions[n.id]).distanceTo(center)+(this.detailRadii[n.id]||2)*2);
    const fitDistance=overviewDistance(radius,this.camera.fov,this.camera.aspect);
    const direction=track?this.camera.position.clone().sub(this.controls.target).normalize():new THREE.Vector3(.65,.5,1).normalize();
    const distance=track?Math.max(fitDistance,this.camera.position.distanceTo(this.controls.target)):fitDistance;
    this.controls.maxDistance=Math.max(2400,fitDistance*4);
    this.camera.far=Math.max(8000,fitDistance*5);this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(
        direction.multiplyScalar(distance),
      );
    this.controls.update();
  }
  setAnimationPaused(paused){const value=this.animationClock.setPaused(paused,performance.now());this.host.dataset.animationPaused=String(value);return value;}
  setBranchSelection(id){if(this.branchSelection===id)return;this.branchSelection=id;this.update(this.updateInput);this.layout.lockPlanetOrbits({advance:false});this.updateReplayPositions(this.animationClock.now);this.updatePoses();}
  animate() {
    this.frame = requestAnimationFrame(() => this.animate());
    if(typeof document!=='undefined'&&document.hidden){this.lastSimulationFrame=performance.now();this.last=this.lastSimulationFrame;this.animationClock.resetFrame(this.last);return;}
    const frameStart=performance.now(),elapsed=(frameStart-(this.lastSimulationFrame??this.last))/1000;
    this.lastSimulationFrame=frameStart;
    const motionElapsed=this.animationClock.sample(frameStart);
    const advanced=!this.animationClock.paused&&this.layout&&this.layout.advance(motionElapsed);
    this.simulationMs=performance.now()-frameStart;
    const poseStart=performance.now();
    const replaying=!this.animationClock.paused&&this.updateReplayPositions?.(this.animationClock.now);
    if(advanced||replaying||this.radiusTweens?.size){this.updatePoses();if(!this.simulationFit){const display=this.positions;this.positions=this.layout.positions;this.fit({track:true});this.positions=display;this.simulationFit=true;}}
    this.poseMs=performance.now()-poseStart;
    if(this.overviewActive&&performance.now()-(this.lastOverviewFit||0)>250){this.fit({track:true});this.lastOverviewFit=performance.now();}
    this.controls.update();
    if(this.focusTransition){
      const f=this.focusTransition,t=Math.min(1,(performance.now()-f.start)/450),ease=t*t*(3-2*t),target=f.nodeId&&this.positions[f.nodeId]?new THREE.Vector3().fromArray(this.positions[f.nodeId]):f.destination;
      if(target){
      this.controls.target.copy(f.from).lerp(target,ease);this.camera.position.copy(f.camera).lerp(target.clone().add(f.offset),ease);
      this.followPosition=target.clone();if(t===1)this.focusTransition=null;
      if(f.nodeId===this.localFocusAnchorId)this.localFollowPosition=target.clone();
      }else this.focusTransition=null;
    }
    this.updateNavigation();
    if (this.ring.visible) this.ring.quaternion.copy(this.camera.quaternion);
    if(!this.animationClock.paused)this.updateMotionTrails?.(this.animationClock.now);
    if(this.glow?.material.uniforms?.viewportHeight)this.glow.material.uniforms.viewportHeight.value=Math.max(1,this.host.clientHeight);
    const renderStart=performance.now();this.renderer.render(this.scene, this.camera);this.renderMs=performance.now()-renderStart;
    // Labels are an overlay; their paint cadence need not repeat every WebGL
    // frame. Selection/hover changes still paint immediately.
    const labelNow=performance.now(),labelKey=[this.selected,this.hovered,this.revealedMainTag,this.focusEdge,this.hoverEdge].join('|');
    if(labelNow-(this.lastLabelPaint||0)>=50||labelKey!==this.labelPaintKey){
    this.lastLabelPaint=labelNow;this.labelPaintKey=labelKey;
    this.refreshLabelCandidates(labelNow);
    const v = new THREE.Vector3(),
      w = this.host.clientWidth,
      h = this.host.clientHeight;
    const occupied = [];
    const limits = labelLimits(w, h);
    let shownNodes = 0;
    for (const { el, id } of this.labels
      .slice()
      .sort(
        (a, b) =>
          (b.id === this.selected ? 1 : 0) - (a.id === this.selected ? 1 : 0),
      )) {
      if (!id || !this.positions[id]||!showNodeLabel(this.nodeById.get(id),this.revealedMainTag)) { el.style.display = 'none'; continue; }
      this.a.fromArray(this.positions[id]).applyMatrix4(this.camera.matrixWorldInverse);
      const priority = this.nodeById.get(id)?.isMainTag || id === this.selected || id === this.hovered;
      const detail = labelDetail({depth:-this.a.z, radius:this.radii[id], height:h, fov:this.camera.fov, priority});
      el.style.fontSize = detail.fontSize + 'px';
      el.style.opacity = detail.opacity;
      v.fromArray(this.positions[id]).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w + 9,
        y = (-v.y * 0.5 + 0.5) * h - 12,
        bounds = [
          x,
          y,
          x + Math.min(el.textContent.length * detail.fontSize + 14, 150),
          y + detail.fontSize + 10,
        ];
      let visible =
        detail.visible &&
        (priority || shownNodes < limits.nodes) &&
        v.z > -1 &&
        v.z < 1 &&
        x > 10 &&
        bounds[2] < w - 10 &&
        y > 38 &&
        y < h - 45;
      if (
        visible &&
        id !== this.selected &&
        occupied.some(
          (b) =>
            bounds[0] < b[2] + 7 &&
            bounds[2] > b[0] - 7 &&
            bounds[1] < b[3] + 4 &&
            bounds[3] > b[1] - 4,
        )
      )
        visible = false;
      if (visible) { occupied.push(bounds); shownNodes++; }
      el.style.display = visible ? "block" : "none";
      el.style.left = x - 9 + "px";
      el.style.top = y + 12 + "px";
      el.classList.toggle("selected", id === this.selected);
    }
    let shownReasons = 0;
    for (const { el, edge } of this.edgeLabels || []) {
      const priority = edge.id === this.focusEdge || edge.id === this.hoverEdge;
      const connected = edge.from === this.selected || edge.to === this.selected || edge.from === this.hovered || edge.to === this.hovered;
      if(!priority&&!connected){el.style.display='none';continue;}
      this.a.fromArray(this.positions[edge.from]);
      this.b.fromArray(this.positions[edge.to]);
      this.direction.copy(this.a).lerp(this.b,0.5).applyMatrix4(this.camera.matrixWorldInverse);
      const detail = labelDetail({depth:-this.direction.z, radius:Math.min(this.radii[edge.from],this.radii[edge.to]), height:h, fov:this.camera.fov, priority});
      el.style.fontSize = Math.min(11,detail.fontSize) + 'px';
      el.style.opacity = detail.opacity;
      v.copy(this.a).lerp(this.b, 0.5).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      let y = (-v.y * 0.5 + 0.5) * h;
      const width = Math.min(el.textContent.length * 10 + 16, 265);
      const midpointY = y;
      let box = [x - width / 2, y - 11, x + width / 2, y + 11];
      const overlaps = (candidate) => occupied.some((b) =>
        candidate[0] < b[2] + 5 && candidate[2] > b[0] - 5 &&
        candidate[1] < b[3] + 4 && candidate[3] > b[1] - 4);
      for (const offset of [0, -27, 27, -52, 52]) {
        const candidate = [x - width / 2, midpointY + offset - 11, x + width / 2, midpointY + offset + 11];
        if (!overlaps(candidate)) { box = candidate; y = midpointY + offset; break; }
      }
      let visible =
        detail.visible && (priority || connected) &&
        v.z > -1 &&
        v.z < 1 &&
        box[0] > 10 &&
        box[2] < w - 10 &&
        y > 50 &&
        y < h - 65 &&
        (priority || shownReasons < limits.reasons);
      if (
        visible &&
        !priority &&
        occupied.some(
          (b) =>
            box[0] < b[2] + 5 &&
            box[2] > b[0] - 5 &&
            box[1] < b[3] + 4 &&
            box[3] > b[1] - 4,
        )
      )
        visible = false;
      if (visible) {
        occupied.push(box);
        shownReasons++;
      }
      el.style.display = visible ? "block" : "none";
      el.style.left = x + "px";
      el.style.top = y + "px";
    }
    }
    const now = performance.now();
    if (
      this.layout &&
      this.onCheckpoint &&
      now - (this.lastCheckpoint || 0) > 8000
    ) {
      this.lastCheckpoint = now;
      this.onCheckpoint(this.layout.checkpoint());
    }
    this.frames.push(now - this.last);
    if (this.frames.length > 120) this.frames.shift();
    this.last = now;
    if (this.nodes && now - (this.lastStats || 0) > 1000) {
      this.lastStats = now;
      this.onStats?.({
        nodes: this.renderNodes?.length || 0,
        totalNodes: this.nodes?.length || 0,
        layoutSteps: this.layout?.steps || 0,
        runtimeMetrics:{simulationMs:this.simulationMs,poseMs:this.poseMs,renderMs:this.renderMs,collision:this.layout?.bodyAvoidanceStats,stepCosts:this.layout?.stepCosts},
        edges: this.visibleEdges || 0,
        camera: this.camera.position.toArray(),
        target: this.controls.target.toArray(),
        fps: Math.round(
          1000 / (this.frames.reduce((a, b) => a + b, 0) / this.frames.length),
        ),
      });
    }
  }
  dispose() {
    document.removeEventListener('visibilitychange',this.visibilityClock);
    clearTimeout(this.labelClickTimer);
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.disposeInput?.();
    this.renderer.domElement.removeEventListener("pointerdown", this.down);
    this.renderer.domElement.removeEventListener("click", this.click);
    this.renderer.domElement.removeEventListener("dblclick", this.double);
    this.renderer.domElement.removeEventListener("pointermove", this.hover);
    this.renderer.domElement.removeEventListener("pointerleave", this.leave);
    this.disposeMesh(this.mesh);
    this.disposeMesh(this.glow);
    this.disposeMesh(this.trailMesh);
    for (const m of this.edgeMeshes || []) this.disposeMesh(m);
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRoot.remove();
    this.navigationRoot.remove();
  }
}
