// HDR frame: every scene pass draws linear light into one half-float target, then bloom picks out only what is
// brighter than white after exposure, and the output pass tone-maps and converts to sRGB once.
import * as THREE from 'three';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

export function createHDR(renderer, {low = false} = {}) {
  const px = new THREE.Vector2();
  renderer.getDrawingBufferSize(px);
  const rt = new THREE.WebGLRenderTarget(px.x, px.y, {type: THREE.HalfFloatType, samples: low ? 0 : 4, depthBuffer: true});
  renderer.toneMapping = THREE.NeutralToneMapping;
  const out = new OutputPass();
  out.renderToScreen = true;
  let bloom = null;
  const h = {
    rt,
    exposure: 1,        // set every frame by the auto-exposure in main.js
    bloomOn: !low,
    bloomStrength: .45,
    begin() {
      renderer.getDrawingBufferSize(px);
      if (px.x !== rt.width || px.y !== rt.height) h.setSize();
      renderer.setRenderTarget(rt);
      renderer.clear();
    },
    end() {
      if (h.bloomOn) {
        if (!bloom) bloom = new UnrealBloomPass(new THREE.Vector2(px.x, px.y), h.bloomStrength, .55, 1);
        // the shaders already apply exposure, so only what is twice as bright as white blooms
        bloom.threshold = 2;
        bloom.strength = h.bloomStrength;
        bloom.render(renderer, null, rt, 0, false);
      }
      renderer.toneMappingExposure = h.exposure;
      renderer.setRenderTarget(null);
      out.render(renderer, null, rt);
    },
    setSize() {
      renderer.getDrawingBufferSize(px);
      rt.setSize(px.x, px.y);
      if (bloom) bloom.setSize(px.x, px.y);
    },
  };
  return h;
}
