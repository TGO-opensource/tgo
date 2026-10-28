// Image-based light for ships: the world around the ship (sky, stars, the planet below, its atmosphere) is rendered into a small
// cube map from the ship's position and pre-filtered, so hulls pick up planetshine and reflect the real surroundings.
// The ship sits at the scene origin (the floating origin follows it), so the cube camera stays at (0, 0, 0).
import * as THREE from 'three';

export function createEnv(renderer, scene, shipScene, {low = false} = {}) {
  const crt = new THREE.WebGLCubeRenderTarget(low ? 64 : 128, {type: THREE.HalfFloatType});
  const cam = new THREE.CubeCamera(1e-7, 1e16, crt);
  const pm = new THREE.PMREMGenerator(renderer);
  let env = null, last = -1e9, n = 0;
  const e = {
    get count() { return n; },
    // refresh about once a second (every 3 s on the low tier), or now if forced (after a launch or a jump)
    update(now, force) {
      if (!force && now - last < (low ? 3000 : 1000)) return;
      last = now;
      const prev = renderer.getRenderTarget(), ac = renderer.autoClear;
      renderer.autoClear = true; // the app draws with autoClear off; each cube face needs a clean slate
      cam.update(renderer, scene);
      renderer.autoClear = ac;
      const rt = pm.fromCubemap(crt.texture);
      if (env) env.dispose();
      env = rt; n++;
      shipScene.environment = rt.texture;
      renderer.setRenderTarget(prev);
    },
  };
  return e;
}
