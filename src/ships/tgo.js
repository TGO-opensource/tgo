// TGO original ships, built from code in metres with the nose along -Z and engines at +Z.
// Hull panels, grime and decals are painted onto canvases from a fixed seed, so every visit looks the same.
// Each builder fills g.userData with: pl (engine mounts [radius, length, [x,y,z], kind]), lights (blinking markers),
// spin (a part that turns), cockpit (an interior group shown only in the cockpit view) and mount (the pilot's eye).
import * as THREE from 'three';

const TAU = Math.PI * 2;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0, (s >>> 8) / 16777216); }

// hull textures: light panels with seams, slightly varied tone and roughness, grime toward the engines, stripes and a registration
function hullSet(seed, {w = 1024, h = 512, base = [208, 212, 216], stripe = '#b23a2e', reg = 'TGO', cells = 18} = {}) {
  const R = rng(seed), mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const col = mk(), rough = mk(), hgt = mk(), cx = col.getContext('2d'), rx = rough.getContext('2d'), hx = hgt.getContext('2d');
  cx.fillStyle = `rgb(${base})`; cx.fillRect(0, 0, w, h);
  rx.fillStyle = '#8c8c8c'; rx.fillRect(0, 0, w, h);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, w, h);
  // panels: split the sheet into irregular rectangles
  const split = (x, y, pw, ph, d) => {
    if (d > 4 || (pw < w / cells && ph < h / cells * 2)) {
      const t = (R() - .5) * 14, q = 140 + R() * 40;
      cx.fillStyle = `rgba(${base[0] + t},${base[1] + t},${base[2] + t},1)`; cx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
      rx.fillStyle = `rgb(${q},${q},${q})`; rx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
      cx.strokeStyle = 'rgba(40,44,50,.55)'; cx.lineWidth = 1.2; cx.strokeRect(x + .5, y + .5, pw - 1, ph - 1);
      hx.strokeStyle = '#3a3a3a'; hx.lineWidth = 2; hx.strokeRect(x + .5, y + .5, pw - 1, ph - 1);
      if (R() < .25) { // rivet rows
        cx.fillStyle = 'rgba(60,64,70,.5)';
        for (let i = 6; i < pw - 4; i += 7) { cx.fillRect(x + i, y + 3, 1.5, 1.5); cx.fillRect(x + i, y + ph - 5, 1.5, 1.5); }
      }
      return;
    }
    if (pw / w > ph / h * .9 ? R() < .75 : R() < .25) { const s = pw * (.3 + R() * .4); split(x, y, s, ph, d + 1); split(x + s, y, pw - s, ph, d + 1); }
    else { const s = ph * (.3 + R() * .4); split(x, y, pw, s, d + 1); split(x, y + s, pw, ph - s, d + 1); }
  };
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells / 2; j++) split(i * w / cells, j * h / (cells / 2), w / cells, h / (cells / 2), 0);
  // engine soot and streaks toward the rear (v near 1)
  const gr = cx.createLinearGradient(0, h * .55, 0, h); gr.addColorStop(0, 'rgba(30,26,22,0)'); gr.addColorStop(1, 'rgba(30,26,22,.45)');
  cx.fillStyle = gr; cx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { cx.fillStyle = `rgba(35,30,25,${.04 + R() * .08})`; cx.fillRect(R() * w, h * (.4 + R() * .5), 1 + R() * 3, 10 + R() * 60); }
  // stripe and registration
  cx.fillStyle = stripe; cx.fillRect(0, h * .3, w, h * .025); cx.fillRect(0, h * .34, w, h * .008);
  cx.font = `bold ${h * .06}px sans-serif`; cx.fillStyle = 'rgba(30,34,40,.85)';
  for (const x of [w * .12, w * .62]) cx.fillText(reg, x, h * .27);
  const tex = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const map = tex(col); map.colorSpace = THREE.SRGBColorSpace;
  // normal map from the seam heights
  const hd = hx.getImageData(0, 0, w, h).data, nc = mk(), nx = nc.getContext('2d'), im = nx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const H = (xx, yy) => hd[(((yy + h) % h) * w + ((xx + w) % w)) * 4];
    const dx = (H(x + 1, y) - H(x - 1, y)) / 255 * 2.5, dy = (H(x, y + 1) - H(x, y - 1)) / 255 * 2.5, l = Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
    im.data[o] = (-dx / l * .5 + .5) * 255; im.data[o + 1] = (dy / l * .5 + .5) * 255; im.data[o + 2] = (1 / l * .5 + .5) * 255; im.data[o + 3] = 255;
  }
  nx.putImageData(im, 0, 0);
  return {map, roughnessMap: tex(rough), normalMap: tex(nc)};
}

function hullMat(set, o = {}) {
  return new THREE.MeshPhysicalMaterial({...set, color: 0xffffff, metalness: o.metal ?? .35, roughness: 1, clearcoat: o.coat ?? .25, clearcoatRoughness: .35, side: THREE.FrontSide});
}
const darkMetal = () => new THREE.MeshStandardMaterial({color: 0x2a2d33, metalness: .85, roughness: .4});
const glass = () => new THREE.MeshPhysicalMaterial({color: 0x0b1622, metalness: 0, roughness: .04, clearcoat: 1, clearcoatRoughness: .02, transparent: true, opacity: .62, envMapIntensity: 1.6});
// emissive parts are plain colours above white, so they bloom; their brightness is rescaled with the exposure each frame
export const glowMats = [];
function glow(hex, k) { const m = new THREE.MeshBasicMaterial({color: hex, toneMapped: false}); m.userData = {base: new THREE.Color(hex), k}; glowMats.push(m); return m; }

function mesh(p, geo, mat, pos, rot) { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = m.receiveShadow = true; p.add(m); return m; }
// a solid of revolution along Z from a profile of [z, radius] pairs, squashed to an oval
function loft(prof, n, sx = 1, sy = 1) {
  const g = new THREE.LatheGeometry(prof.map(([z, r]) => new THREE.Vector2(Math.max(r, 1e-3), z)), n);
  g.rotateX(Math.PI / 2); g.scale(sx, sy, 1); g.computeVertexNormals(); return g;
}
function light(g, color, pos, size, kind) {
  const m = mesh(g, new THREE.SphereGeometry(size, 10, 8), glow(color, kind === 'strobe' ? 40 : 14), pos);
  m.castShadow = false; m.userData.blink = kind; g.userData.lights.push(m); return m;
}
// a dashboard face drawn on a canvas, redrawn by the cockpit code with live numbers
export function dashTexture() { const c = document.createElement('canvas'); c.width = 512; c.height = 160; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData = {canvas: c}; return t; }

export function buildKestrel(g) {
  const U = g.userData; U.lights = []; U.pl = [];
  const hull = hullMat(hullSet(11, {reg: 'TGO-K1  KESTREL', stripe: '#c0392b'}), {metal: .3});
  // fuselage: pointed nose, widest under the canopy, tapering to the engine block
  const body = mesh(g, loft([[-11.6, 0], [-10.6, .35], [-9, .85], [-7, 1.25], [-4.5, 1.55], [-1, 1.7], [3, 1.7], [7, 1.55], [10, 1.35], [11.2, 1.25]], 40, 1.15, .78), hull);
  body.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * 2; }); // wrap the panel sheet twice around
  // canopy
  const can = new THREE.SphereGeometry(1, 32, 16, 0, TAU, 0, Math.PI / 2); can.scale(.85, .62, 2.7);
  mesh(g, can, glass(), [0, .82, -5.2]);
  mesh(g, new THREE.TorusGeometry(.86, .05, 6, 40, Math.PI).scale(1, .72, 1), darkMetal(), [0, .82, -3.6], [0, 0, 0]);
  // cranked delta wings with a bevelled edge
  const ws = new THREE.Shape(); ws.moveTo(1.2, -3); ws.lineTo(5.5, 3); ws.lineTo(10.5, 7); ws.lineTo(10.5, 8.8); ws.lineTo(1.2, 9.6); ws.closePath();
  const wg = new THREE.ExtrudeGeometry(ws, {depth: .28, bevelEnabled: true, bevelThickness: .06, bevelSize: .08, bevelSegments: 2}); wg.rotateX(Math.PI / 2); wg.translate(0, .1, 0);
  // the left wing is the right one mirrored (three.js flips face winding for negatively scaled meshes)
  const uv12 = geo => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12); }; // extrusions get UVs in metres
  uv12(wg);
  const wingMat = hullMat(hullSet(12, {reg: 'TGO', stripe: '#c0392b', cells: 12}), {metal: .3});
  mesh(g, wg, wingMat); mesh(g, wg, wingMat).scale.x = -1;
  // canted twin fins
  const fs = new THREE.Shape(); fs.moveTo(0, 5.2); fs.lineTo(2.6, 8.6); fs.lineTo(2.6, 10); fs.lineTo(0, 10.6); fs.closePath();
  const fg = new THREE.ExtrudeGeometry(fs, {depth: .16, bevelEnabled: true, bevelThickness: .03, bevelSize: .04, bevelSegments: 1}); fg.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)); // shape x is the fin's height (Y), shape y runs along the ship (Z)
  uv12(fg);
  for (const s of [-1, 1]) { const f = mesh(g, fg, wingMat, [s * 1.35, .9, 0], [0, 0, -s * .38]); f.scale.x = s; }
  // engine nacelles, bell nozzles and their hot throats
  for (const s of [-1, 1]) {
    const x = s * 1.45;
    mesh(g, loft([[4, .55], [5, .95], [10.6, 1], [11.4, .92]], 24), hull, [x, -.25, 0]);
    mesh(g, loft([[11.3, .78], [11.9, .82], [12.6, 1.02]], 24), darkMetal(), [x, -.25, 0]).material.side = THREE.DoubleSide;
    mesh(g, new THREE.CircleGeometry(.76, 24), glow(0xffb070, 6), [x, -.25, 11.32]).rotation.y = Math.PI;
    U.pl.push([.8, 6, [x, -.25, 12.5], 'chem']);
    // intake under the wing root
    mesh(g, new THREE.BoxGeometry(.9, .55, 2.2), darkMetal(), [s * 2.1, -.45, 1]);
  }
  // greebles: vents, sensor blisters and access hatches along the spine
  const R = rng(5), gb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0x9aa0a8, metalness: .6, roughness: .45}), 48);
  const q = new THREE.Quaternion(), M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3();
  for (let i = 0; i < 48; i++) {
    const z = -2 + R() * 11.5, side = R() < .5 ? -1 : 1, a = side * (.15 + R() * .9);
    P.set(Math.sin(a) * 1.15 * 1.66, Math.cos(a) * .78 * 1.66 + .02, z); q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    S.set(.15 + R() * .5, .06 + R() * .14, .2 + R() * .9); M.compose(P, q, S); gb.setMatrixAt(i, M);
  }
  gb.castShadow = gb.receiveShadow = true; g.add(gb);
  // nose sensor and landing lights, wingtip navigation lights and a tail strobe
  mesh(g, new THREE.CylinderGeometry(.02, .05, 1.2, 8).rotateX(Math.PI / 2), darkMetal(), [0, 0, -12.1]);
  light(g, 0xff2a20, [-10.5, .12, 7.9], .13, 'nav'); light(g, 0x20ff60, [10.5, .12, 7.9], .13, 'nav');
  light(g, 0xffffff, [0, 1.1, 10.4], .1, 'strobe'); light(g, 0xffffff, [0, -.7, -8], .08, 'steady');
  // cockpit interior: seat, side consoles, a dashboard with live numbers, and the canopy frame seen from inside
  const ck = new THREE.Group(); ck.visible = false; g.add(ck); U.cockpit = ck; U.mount = [0, 1.02, -4.7];
  const panel = new THREE.MeshStandardMaterial({color: 0x24272c, metalness: .3, roughness: .7});
  mesh(ck, new THREE.BoxGeometry(1.5, .35, .5), panel, [0, .62, -5.75], [-.5, 0, 0]);
  const dash = dashTexture(); U.dash = dash;
  mesh(ck, new THREE.PlaneGeometry(1.24, .39), new THREE.MeshBasicMaterial({map: dash, toneMapped: false}), [0, .79, -5.98 + .02 * 9], [-.5, 0, 0]).castShadow = false;
  for (const s of [-1, 1]) mesh(ck, new THREE.BoxGeometry(.25, .3, 1.4), panel, [s * .72, .55, -4.9]);
  for (const z of [-6.6, -5.4]) mesh(ck, new THREE.TorusGeometry(.84, .03, 6, 32, Math.PI).scale(1, .72, 1), darkMetal(), [0, .82, z]);
  return g;
}

export function buildWayfarer(g) {
  const U = g.userData; U.lights = []; U.pl = [];
  const hull = hullMat(hullSet(21, {reg: 'TGO-W3  WAYFARER', stripe: '#2e6fb2', cells: 26, w: 2048, h: 512}), {metal: .4, coat: .1});
  const dm = darkMetal();
  // command section with a lit bridge band
  mesh(g, loft([[-172, 0], [-170, 5], [-162, 11], [-150, 14], [-128, 14], [-120, 9]], 40), hull);
  const RW = rng(33);
  const wc = document.createElement('canvas'); wc.width = 1024; wc.height = 32; const wx = wc.getContext('2d'); wx.fillStyle = '#000'; wx.fillRect(0, 0, 1024, 32);
  for (let i = 0; i < 1024; i += 16) { wx.fillStyle = RW() < .85 ? '#ffd9a0' : '#333'; wx.fillRect(i + 3, 10, 9, 12); }
  const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace;
  const winMat = new THREE.MeshBasicMaterial({map: wt, toneMapped: false}); winMat.userData = {base: new THREE.Color(1, 1, 1), k: 3}; glowMats.push(winMat);
  mesh(g, new THREE.CylinderGeometry(14.05, 14.05, 3, 48, 1, true).rotateX(Math.PI / 2), winMat, [0, 0, -142]);
  // spine: a core tube with four longerons and cross bracing
  mesh(g, new THREE.CylinderGeometry(5, 5, 240, 20).rotateX(Math.PI / 2), hull, [0, 0, -5]);
  const lon = new THREE.CylinderGeometry(.8, .8, 240, 8).rotateX(Math.PI / 2);
  for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + TAU / 8; mesh(g, lon, dm, [Math.cos(a) * 9, Math.sin(a) * 9, -5]); }
  const br = new THREE.InstancedMesh(new THREE.CylinderGeometry(.35, .35, 1, 6), dm, 96), M = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let z = -115; z < 110 && n < 96; z += 10) for (let k = 0; k < 4 && n < 96; k++) {
    const a0 = k * TAU / 4 + TAU / 8, a1 = a0 + TAU / 4, A = new THREE.Vector3(Math.cos(a0) * 9, Math.sin(a0) * 9, z), Bv = new THREE.Vector3(Math.cos(a1) * 9, Math.sin(a1) * 9, z + 10);
    const d = Bv.clone().sub(A); P.copy(A).add(Bv).multiplyScalar(.5); q.setFromUnitVectors(up, d.clone().normalize()); S.set(1, d.length(), 1); M.compose(P, q, S); br.setMatrixAt(n++, M);
  }
  br.count = n; br.castShadow = br.receiveShadow = true; g.add(br);
  // cargo and habitat modules along the spine
  const R = rng(9);
  for (let i = 0; i < 10; i++) { const z = -100 + i * 18 + R() * 6, a = R() * TAU; mesh(g, new THREE.BoxGeometry(7 + R() * 5, 7 + R() * 5, 12 + R() * 6), hull, [Math.cos(a) * 12, Math.sin(a) * 12, z], [0, 0, a]); }
  // the spinning habitat ring: a rectangular section swept around, with spokes and lit windows on its outer face
  const ring = new THREE.Group(); ring.position.z = -60; g.add(ring); U.spin = ring;
  const prof = [[63, -6], [77, -6], [77, 6], [63, 6], [63, -6]].map(([r, y]) => new THREE.Vector2(r, y));
  const rg = new THREE.LatheGeometry(prof, 96); rg.rotateX(Math.PI / 2);
  mesh(ring, rg, hull);
  const rw = document.createElement('canvas'); rw.width = 2048; rw.height = 16; const rx = rw.getContext('2d'); rx.fillStyle = '#000'; rx.fillRect(0, 0, 2048, 16);
  for (let i = 0; i < 2048; i += 8) { rx.fillStyle = RW() < .7 ? '#ffe2b0' : '#222'; rx.fillRect(i + 2, 4, 4, 8); }
  const rt = new THREE.CanvasTexture(rw); rt.colorSpace = THREE.SRGBColorSpace;
  const rwin = new THREE.MeshBasicMaterial({map: rt, toneMapped: false}); rwin.userData = {base: new THREE.Color(1, 1, 1), k: 2.5}; glowMats.push(rwin);
  mesh(ring, new THREE.CylinderGeometry(77.1, 77.1, 2.5, 96, 1, true).rotateX(Math.PI / 2), rwin);
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; mesh(ring, new THREE.CylinderGeometry(1.6, 1.6, 58, 10), dm, [Math.cos(a) * 34, Math.sin(a) * 34, 0], [0, 0, a - Math.PI / 2]); }
  mesh(ring, new THREE.CylinderGeometry(8, 8, 10, 24).rotateX(Math.PI / 2), hull);
  // radiator wings, glowing a dull red from the reactor's heat
  const rad = document.createElement('canvas'); rad.width = 256; rad.height = 256; const ra = rad.getContext('2d');
  ra.fillStyle = '#1a1416'; ra.fillRect(0, 0, 256, 256); for (let i = 0; i < 256; i += 8) { ra.fillStyle = '#3a1810'; ra.fillRect(i, 0, 4, 256); }
  const radT = new THREE.CanvasTexture(rad); radT.colorSpace = THREE.SRGBColorSpace;
  const radM = new THREE.MeshStandardMaterial({map: radT, metalness: .5, roughness: .5, emissive: 0x5a1a08, emissiveIntensity: .4});
  for (const s of [-1, 1]) { mesh(g, new THREE.BoxGeometry(80, .8, 46), radM, [s * 54, 0, 30]); mesh(g, new THREE.BoxGeometry(14, 2, 4), dm, [s * 10, 0, 30]); }
  // four engine pods and the main drive
  for (let k = 0; k < 4; k++) {
    const a = k * TAU / 4 + TAU / 8, x = Math.cos(a) * 18, y = Math.sin(a) * 18;
    mesh(g, loft([[60, 4], [64, 8.5], [118, 9], [124, 7.5]], 24), hull, [x, y, 0]);
    mesh(g, loft([[123, 6.5], [128, 7.5], [134, 9.5]], 24), dm, [x, y, 0]).material.side = THREE.DoubleSide;
    mesh(g, new THREE.CircleGeometry(6.4, 24), glow(0x9fd8ff, 5), [x, y, 123.2]).rotation.y = Math.PI;
    U.pl.push([7, 60, [x, y, 134], 'ion']);
  }
  mesh(g, loft([[112, 6], [118, 12], [140, 22], [152, 30]], 32), dm, [0, 0, 0]).material.side = THREE.DoubleSide;
  mesh(g, new THREE.CircleGeometry(11.5, 32), glow(0xc8e8ff, 8), [0, 0, 118.5]).rotation.y = Math.PI;
  U.pl.push([24, 160, [0, 0, 152], 'fusion']);
  // running lights: radiator tips, strobes on the spine, docking lights at the bow
  light(g, 0xff2a20, [-94, 0, 30], 1.2, 'nav'); light(g, 0x20ff60, [94, 0, 30], 1.2, 'nav');
  for (const z of [-110, 0, 100]) light(g, 0xffffff, [0, 10.5, z], .9, 'strobe');
  for (const a of [0, TAU / 3, 2 * TAU / 3]) light(g, 0x6fb6ff, [Math.cos(a) * 6, Math.sin(a) * 6, -171], .7, 'steady');
  // bridge interior: window frames and a console with live numbers
  const ck = new THREE.Group(); ck.visible = false; g.add(ck); U.cockpit = ck; U.mount = [0, 1.2, -163];
  const pm = new THREE.MeshStandardMaterial({color: 0x23262b, metalness: .3, roughness: .7});
  mesh(ck, new THREE.BoxGeometry(5, .9, 1.2), pm, [0, -.2, -165.4]);
  const dash = dashTexture(); U.dash = dash;
  mesh(ck, new THREE.PlaneGeometry(2.4, .75), new THREE.MeshBasicMaterial({map: dash, toneMapped: false}), [0, .3, -165.95], [-.35, 0, 0]).castShadow = false;
  for (const x of [-3, -1, 1, 3]) mesh(ck, new THREE.BoxGeometry(.12, 4, .12), pm, [x, 1.5, -167.5]);
  mesh(ck, new THREE.BoxGeometry(7, .15, .15), pm, [0, 3.4, -167.5]); mesh(ck, new THREE.BoxGeometry(7, .15, .15), pm, [0, -.3, -167.5]);
  return g;
}
