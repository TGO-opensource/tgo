// NASA spacecraft models (NASA 3D Resources, github.com/nasa/NASA-3D-Resources), loaded from jsDelivr only when a ship is picked.
// Each model is turned so its nose points along -Z with its engines at +Z, scaled to real size in metres, and given
// physically based materials: the published files mark everything non-metallic, so foil, gold, solar cells and paint are
// recognised by material name and set up to reflect the environment the way the real hardware does.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

const NASA = 'https://cdn.jsdelivr.net/gh/nasa/NASA-3D-Resources@11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/';
const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

// a fine crinkle for multi-layer insulation, shared by every foil surface
let crinkle = null;
function crinkleMap() {
  if (crinkle) return crinkle;
  const n = 256, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const cx = cv.getContext('2d'), im = cx.createImageData(n, n), h = new Float32Array(n * n);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 90; k++) { // random creases
    const x0 = rnd() * n, y0 = rnd() * n, a = rnd() * Math.PI, L = 30 + rnd() * 120, w = .6 + rnd() * 1.6, d = rnd() < .5 ? -1 : 1;
    for (let t = -L; t < L; t++) for (let o = -3; o <= 3; o++) {
      const x = Math.round(x0 + Math.cos(a) * t - Math.sin(a) * o) & (n - 1), y = Math.round(y0 + Math.sin(a) * t + Math.cos(a) * o) & (n - 1);
      h[y * n + x] += d * Math.exp(-(o * o) / (w * w)) * .5;
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = h[y * n + ((x + 1) & (n - 1))] - h[y * n + ((x - 1) & (n - 1))], dy = h[((y + 1) & (n - 1)) * n + x] - h[((y - 1) & (n - 1)) * n + x];
    const nx = -dx, ny = -dy, nz = 1, l = Math.hypot(nx, ny, nz), o = (y * n + x) * 4;
    im.data[o] = (nx / l * .5 + .5) * 255; im.data[o + 1] = (ny / l * .5 + .5) * 255; im.data[o + 2] = (nz / l * .5 + .5) * 255; im.data[o + 3] = 255;
  }
  cx.putImageData(im, 0, 0);
  crinkle = new THREE.CanvasTexture(cv);
  crinkle.wrapS = crinkle.wrapT = THREE.RepeatWrapping;
  crinkle.repeat.set(3, 3);
  return crinkle;
}

// material rules, matched against the material name (first match wins)
const RULES = [
  [/gold|bronze|kapton|brass|copper/i, {color: 0xd9a441, metalness: 1, roughness: .35, foil: true}],
  [/silver|foil|mylar|chrome|mli|alum/i, {color: 0xcfd2d6, metalness: 1, roughness: .3, foil: true}],
  [/solar|cell|array|panel|purpley/i, {color: 0x1d2b55, metalness: .45, roughness: .22}],
  [/black|krinkle|dark|matte|carbon/i, {color: 0x1b1c1f, metalness: .1, roughness: .8}],
  [/dish|white|radiator|paint|base/i, {metalness: .05, roughness: .45}],
];

export function fixMaterials(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.material = [].concat(o.material).map(m => {
      const r = RULES.find(([re]) => re.test(m.name || ''));
      const p = r ? r[1] : {metalness: .15, roughness: .55};
      const n = new THREE.MeshPhysicalMaterial({
        name: m.name, map: m.map || null,
        metalness: p.metalness, roughness: p.roughness, side: THREE.DoubleSide,
        transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest,
        normalMap: m.normalMap || (p.foil ? crinkleMap() : null), clearcoat: p.foil ? .2 : 0,
      });
      // textured parts keep their texture; plain ones take the rule's colour, or keep their own
      if (m.map) n.color.set(0xffffff); else if (p.color !== undefined) n.color.set(p.color); else if (m.color) n.color.copy(m.color);
      if (p.foil) n.normalScale.set(.6, .6);
      return n;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
}

const cache = new Map();
// def.model = {file, scale (m per model unit), rot: [x, y, z] degrees}. Resolves to a Group in metres, centred, nose to -Z.
export function loadModel(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const p = loader.loadAsync(NASA + encodeURI(def.model.file)).then(g => {
    const m = g.scene, r = def.model.rot || [0, 0, 0], w = new THREE.Group();
    // some files carry stray parts parked away from the craft; def.model.hide names them
    if (def.model.hide) { const drop = []; m.traverse(o => { if (o.isMesh && def.model.hide.test(o.name)) drop.push(o); }); drop.forEach(o => o.parent.remove(o)); }
    m.rotation.set(r[0] * Math.PI / 180, r[1] * Math.PI / 180, r[2] * Math.PI / 180);
    w.add(m);
    w.scale.setScalar(def.model.scale);
    w.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
    const out = new THREE.Group();
    w.position.sub(c);
    out.add(w);
    out.updateMatrixWorld(true);
    out.userData.box = new THREE.Box3().setFromObject(out); // in metres, centred on the origin
    fixMaterials(out);
    return out;
  });
  cache.set(def.id, p);
  return p;
}
