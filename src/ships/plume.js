// Engine exhaust: an additive cone, brightest in its core and at the nozzle, flickering, with shock diamonds for chemical
// engines, a thin blue beam for ion drives and a long violet-white jet for the Wayfarer's fusion drive.
// Brightness is above white so the bloom pass picks it up.
import * as THREE from 'three';

const KIND = {chem: [1, .62, .32, 1], ion: [.45, .7, 1, 0], fusion: [.85, .8, 1, .3]};
const VS = `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN,vV;varying float vT;uniform float len;
void main(){vT=clamp(position.z/len,0.,1.);vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);
 gl_Position=projectionMatrix*viewMatrix*w;
#include <logdepthbuf_vertex>
}`;
const FS = `#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vN,vV;varying float vT;uniform vec3 col;uniform float thr,inten,time,shock;
float h(float x){return fract(sin(x*127.1)*43758.5453);}
void main(){
#include <logdepthbuf_fragment>
 float core=pow(abs(dot(normalize(vN),normalize(vV))),1.6);
 float fl=.85+.15*h(floor(time*30.)+vT*7.);
 float diam=shock>0.?.65+.35*pow(.5+.5*cos(vT*38.),6.)*(1.-vT):1.;
 float a=core*pow(1.-vT,1.8)*fl*diam*thr;
 vec3 c=mix(col,vec3(1.),pow(1.-vT,6.)*.8);
 gl_FragColor=vec4(c*a*inten,1.);}`;

export function makePlume(r, len, kind = 'chem') {
  const k = KIND[kind] || KIND.chem;
  const geo = new THREE.CylinderGeometry(r, r * (kind === 'ion' ? 1.1 : 1.9), len, 24, 12, true);
  geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
  const mat = new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {col: {value: new THREE.Color(k[0], k[1], k[2])}, thr: {value: 0}, inten: {value: 4}, time: {value: 0}, shock: {value: k[3]}, len: {value: len}}});
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false; m.visible = false; m.userData.kind = kind;
  return m;
}
// throttle 0..1 (and a stretch factor for boosted thrust), exposure for brightness, time for flicker
export function setPlume(m, thr, stretch, exp, t) {
  const u = m.material.uniforms;
  m.visible = thr > .005;
  u.thr.value = Math.min(1, thr); u.time.value = t; u.inten.value = (m.userData.kind === 'ion' ? 2.5 : 6) * Math.min(exp, 4);
  m.scale.set(1 + stretch * .15, 1 + stretch * .15, (.35 + Math.min(1, thr) * .9) * (1 + stretch * .5));
}
