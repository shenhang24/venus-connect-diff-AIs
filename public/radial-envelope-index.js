// Exact broad-phase index for swept radial envelopes; final geometry checks stay unchanged.
export class RadialEnvelopeIndex{
 constructor(){this.root=null;this.sequence=0;}
 add(value){const lo=.98*value.radius-value.extent,hi=1.02*value.radius+value.extent,node={lo,hi,max:hi,value,order:this.sequence++,height:1,left:null,right:null};this.root=this.insert(this.root,node);}
 height(n){return n?.height||0;}
 refresh(n){n.height=1+Math.max(this.height(n.left),this.height(n.right));n.max=Math.max(n.hi,n.left?.max??-Infinity,n.right?.max??-Infinity);return n;}
 rotateLeft(a){const b=a.right;a.right=b.left;b.left=a;this.refresh(a);return this.refresh(b);}
 rotateRight(a){const b=a.left;a.left=b.right;b.right=a;this.refresh(a);return this.refresh(b);}
 insert(root,node){if(!root)return node;if(node.lo<root.lo||node.lo===root.lo&&node.order<root.order)root.left=this.insert(root.left,node);else root.right=this.insert(root.right,node);this.refresh(root);const b=this.height(root.left)-this.height(root.right);if(b>1){if(this.height(root.left.left)<this.height(root.left.right))root.left=this.rotateLeft(root.left);return this.rotateRight(root);}if(b< -1){if(this.height(root.right.right)<this.height(root.right.left))root.right=this.rotateRight(root.right);return this.rotateLeft(root);}return root;}
 query(radius,extent,gap){const pad=(1+Math.abs(radius)+extent+gap)*1e-12+1e-7,lo=.98*radius-extent-gap-pad,hi=1.02*radius+extent+gap+pad,result=[];const visit=n=>{if(!n||n.max<lo)return;if(n.left?.max>=lo)visit(n.left);if(n.lo<=hi&&n.hi>=lo)result.push(n.value);if(n.lo<=hi)visit(n.right);};visit(this.root);return result;}
}
