# TGO: The Ghuman Orrery

A real-universe explorer in the browser: one HTML page, a `src/` folder of JavaScript modules and a `data/` folder. Every planet, moon, star, comet and spacecraft sits where it really is for the date on the clock, and everything is clickable. What you see comes from published data.

**Open it:** after enabling GitHub Pages, TGO lives at `https://<your-user>.github.io/<repo>/`. To run it locally, serve the folder with any static web server (for example `pwsh -File tools/serve.ps1`, or `python -m http.server`) and open the address it prints. Opening `index.html` straight from disk does not work, because browsers block it from loading the modules in `src/` and the files in `data/`.

## What it does

- **Solar system on the real date.** Planets from JPL's approximate Keplerian elements (reliable 3000 BC to AD 3000), the Moon from Meeus' lunar theory, and 31 moons from JPL mean elements with precessing orbits. Time runs from −1 year/s to +1 year/s.
- **Real surfaces.** Spacecraft-derived maps for the Sun, the planets, the Moon, Io, Ganymede, Triton, Ariel, Miranda, Phobos and Deimos, fetched only when a world gets big on screen (sharper 4k maps for Mars, Jupiter, Saturn and the Moon up close). Earth streams NASA GIBS imagery as you zoom in. Worlds without an openly licensed map keep a painted surface.
- **Real exposure.** Light is rendered in high dynamic range: sunlight falls off with distance, and the camera's exposure adapts like an eye to whatever fills the view. A sunlit Earth, Neptune 30 times farther out and Earth's night side all look right, and only truly bright things (the Sun, sun glints) bloom. Gas giants darken toward their edges and airless worlds have the flat, dusty look of the Moon.
- **Real light.** Eclipses cast real umbra and penumbra (the Moon's shadow crosses Earth on eclipse days, and the Moon turns copper in Earth's shadow), Saturn's rings shadow the planet and the planet shadows the rings, and Earth, Mars, Venus and Titan have scattering atmospheres: blue limbs, orange twilight, a butterscotch Martian sky, and a daytime sky that hides the stars. The Sun gets glare and lens ghosts that vanish behind a planet's limb, plus optional bloom.
- **The real sky.** An all-sky Milky Way photograph behind about 109,000 HYG stars at their measured distances. Travel and the sky changes: from Alpha Centauri the Sun is a bright star in Cassiopeia. Click any star, or search for a name or a `HIP`/`HD` number, to visit it.
- **Small bodies.** Ceres, Pallas, Vesta, Hygiea, Eris, Makemake, Haumea and Sedna as full worlds; Halley, Encke, 67P, Hale–Bopp, Swift–Tuttle, NEOWISE, Tempel 1 and Hartley 2 with comas and gas and dust tails; and (when `data/asteroids.bin.gz` is present) about 50,000 asteroids, Jupiter Trojans, Centaurs and Kuiper belt objects moving on their real orbits.
- **Three flight models, any ship.** Real spacecraft (Voyager 1, Apollo CSM, New Horizons, Cassini, Parker Solar Probe) and TGO originals (Kestrel, Wayfarer).
  - *Free (the default):* your speed is a fraction of your height above the nearest world, the way SpaceEngine's free flight works. Holding W eases you down toward the ground and races you out to the planets and the stars with the same key, and you ride along with the world you are near. + and − change the pace.
  - *Newtonian:* every ship starts at 1 g so it actually moves; tick *Realistic thrust* to fly on the real engine rating. Momentum carries you, gravity from every world pulls on you, atmospheres cause drag, and you can land and take off again from any solid world as it turns. Autopilot burns, flips and brakes to arrive at the target's speed; one key enters a circular orbit, another flies a powered landing.
  - *Cruise:* fixed speeds up to 5c and a straight-line autopilot at 1–10c, for crossing interstellar distances.
- **Views.** Realistic, Thermal, Gravity and Matrix (wireframe), plus a spacetime-fabric layer and relativistic aberration at speed.
- **Interface.** Glass panels in gray, blue, amber or matrix green, light or dark, remembered per browser (Layers panel).

## Controls

| Action | Free | Newtonian | Cruise |
| --- | --- | --- | --- |
| Rotate | Arrow keys | Arrow keys | Arrow keys |
| Roll | Q / E | Q / E | Q / E |
| Move | W / S forward and back, A / D strafe, Space / Shift up and down | W / S forward and back, A / D strafe, Space / Shift up and down | W / S throttle, 0–5 presets |
| Pace | + / − | | |
| Match velocity / stop | X | Hold X | X |
| Orbit / land | | O / L | |
| Autopilot / jump | P / J | P / J | P / J |
| Switch flight model | N | N | N |
| Time warp | , and . | , and . | , and . |
| Camera (chase, cockpit, free look) | C | C | C |
| Orbit / zoom the chase camera | Drag / scroll | Drag / scroll | Drag / scroll |
| Reset camera | Home | Home | Home |

Launch puts you just above the world you are looking at (Earth from the solar-system view) and starts the clock if it was paused. In free flight at the default pace, holding W while pointed away from Earth reaches the Moon's distance in about 15 seconds and Neptune's in about 35 (+ speeds that up); the autopilot (P) gets to any target in seconds. Holding W builds the engine up from the set thrust to about a thousand times it over a few seconds; P flies to the target and speeds time up on its own, so Earth to Mars takes about half a minute, then eases back to real time for the arrival. The yellow line is your predicted path under gravity.

Outside the ship: drag to orbit, scroll to zoom (it speeds up the farther out you are), double-click any world to fly there, Home to reframe.

## Publish on GitHub Pages

1. Create a public repository and upload `index.html`, the `data/` folder, `README.md`, `LICENSE` and `.nojekyll`.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Your link appears on the same page within a minute or two.

## Rebuilding the data

Everything in `data/` can be rebuilt with PowerShell 7 from the original downloads, which go in `tools/raw/` (not committed):

- `tools/resize.ps1` makes the web-size maps in `data/tex/` from the Solar System Scope set (`tools/raw/sss/`) and the Celestia maps (`tools/raw/celestia/`).
- `tools/build-stars.ps1` makes `data/stars-hyg.bin.gz` from `tools/raw/hyg/hyg_v38.csv.gz` (HYG v3.8).
- `tools/build-asteroids.ps1` makes `data/asteroids.bin.gz` from a JPL SBDB query saved as `tools/raw/sbdb-asteroids.json`:
  `https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=spkid,a,e,i,om,w,ma,epoch,H,class&sb-kind=a&sb-cdata={"OR":["H|LT|14","a|GT|5.05",{"AND":["q|LT|1.3","H|LT|20"]}]}` (URL-encode the `sb-cdata` value).
- `tools/serve.ps1` serves the folder locally.

## Code layout

`index.html` holds the page and its styles and loads `src/main.js` as an ES module; an import map pins three.js. There is no build step.

- `src/main.js`: the app (scene, bodies, stars, ships, flight, interface and the frame loop).
- `src/render/hdr.js`: the HDR frame (half-float target, bloom above white, tone mapping).
- `src/render/shaders.js`: shaders for planet surfaces, clouds, atmospheres and rings, and the thermal and gravity palettes.
- `src/data/solar.js`: the Sun, planets, moons and dwarf planets, their orbital elements and rotation poles, and the Moon's theory.
- `src/data/coast.js`: coastlines and borders for the Matrix view.
- `src/core/units.js`: units and constants.

More of `main.js` moves into modules as the roadmap below is built.

## Data and credits

- **Star catalogue:** [HYG Database v3.8](https://github.com/astronexus/HYG-Database) (Hipparcos, Yale Bright Star, Gliese), **CC BY-SA 4.0**. Star radii and masses are measured values for well-known stars and estimates from colour and brightness for the rest.
- **Milky Way and planet maps:** [Solar System Scope](https://www.solarsystemscope.com/textures/), **CC BY 4.0**: the all-sky Milky Way, Sun, Mercury, Venus (cloud tops), Earth (day, night lights and clouds), Mars, Jupiter, Saturn and its rings, Uranus, Neptune and the Moon.
- **Moon maps** from [Celestia](https://github.com/CelestiaProject/CelestiaContent), under each file's own licence:
  - Io: NASA/JPL-Caltech/ASI/USGS, ItzImcool, AstroChara and others, CC BY 4.0.
  - Ganymede: Askaniy Anpilogov, NASA/JPL-Caltech/USGS, Björn Jónsson and others, CC BY 3.0.
  - Triton: Askaniy Anpilogov, NASA/JPL-Caltech/USGS, CC BY 3.0.
  - Ariel and Miranda: ItzImcool, Paul Schenk, NASA/JPL/Ted Stryk, CC BY-SA 4.0.
  - Phobos: Askaniy Anpilogov and Phil Stooke (NASA PDS), CC BY 3.0.
  - Deimos: Phil Stooke (NASA PDS), CC0.
- **Close-up Earth imagery:** NASA [GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) *Blue Marble: Shaded Relief and Bathymetry*, public domain. Streamed as tiles when the camera is within a few Earth radii, sharpening to about 500 m per pixel; no API key is needed.
- **Small bodies:** orbits of the comets, dwarf planets and asteroids from the [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_query.html). Positions are two-body orbits from published elements, so long-period comets drift by months far from their element epoch (Halley's 2061 return comes about six months late).
- **Planet elements:** E. M. Standish, JPL *Approximate Positions of the Planets*. Moon: J. Meeus, *Astronomical Algorithms*, ch. 47. Satellites: JPL planetary satellite mean elements. Rotation: IAU WGCCRE models.
- **Coastlines and borders:** Natural Earth (public domain).
- **Rendering:** [three.js](https://threejs.org) 0.180 (MIT), loaded as ES modules from jsDelivr.

Worlds still painted procedurally, because no openly licensed map was found: Europa, Callisto, Titan's surface (its haze is simulated), the inner Saturnian moons, Umbriel, Titania, Oberon, Pluto, Charon, Ceres, Vesta and the other dwarf planets.

## Roadmap

Done: ships and flight, autopilot at 1c and 5c, HUD, real moon ephemerides, extended date range, real stars, spacecraft positions, more places, open-source packaging, streamed Earth imagery, real maps, eclipses and atmospheres, the full HYG catalogue, comets and dwarf planets.

Also done: the move to ES modules and current three.js, HDR with auto-exposure, free flight.

Next, in order:
1. Real ships: NASA's 3D models of real spacecraft, rebuilt TGO ships, a cockpit view and a warp drive.
2. Planet surfaces you can fly down to: streamed elevation and imagery for Earth, the Moon, Mars, Mercury and Ceres, with generated detail below the data's resolution, and skies seen from the ground.
3. Black holes with real gravitational lensing and accretion disks, at the positions of known ones (Gaia BH1–3, Cygnus X-1, Sagittarius A*, M87*).
4. The galaxy and beyond: the Milky Way as a 3D model you can fly out of, generated stars and planetary systems, known exoplanets, nebulae and other galaxies.
5. Polish: volumetric clouds, ring particles, a universe map, sound and mobile.

## Licence

Code: MIT (see `LICENSE`). Star data: CC BY-SA 4.0. Maps: as credited above.
