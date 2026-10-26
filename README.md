# TGO: The Ghuman Orrery

A real-universe explorer in one HTML file. Every planet, moon, star and spacecraft sits where it really is for the date on the clock, and everything is clickable. No procedural content: what you see comes from published data.

**Open it:** after enabling GitHub Pages, TGO lives at `https://<your-user>.github.io/<repo>/`.

## What it does

- **Solar system on the real date.** Planets from JPL’s approximate Keplerian elements (reliable 3000 BC to AD 3000), the Moon from Meeus’ lunar theory, and 31 moons from JPL mean elements with precessing orbits. Time runs from −1 year/s to +1 year/s.
- **8,800 real stars in 3D.** Every naked-eye star plus every catalogued star within 20 light-years, placed at its measured distance. Travel and the sky changes: from Alpha Centauri the Sun is a bright star in Cassiopeia. Click any star to visit it.
- **Two flight models, any ship.** Real spacecraft (Voyager 1, Apollo CSM, New Horizons, Cassini, Parker Solar Probe) and TGO originals (Kestrel, Wayfarer).
  - *Newtonian:* momentum carries you, gravity from every world pulls on you, thrust is set in g (real ships start at their real engine rating), atmospheres cause drag, and you can land and take off again from any solid world as it turns. Autopilot burns, flips and brakes to arrive at the target’s speed; one key enters a circular orbit, another flies a powered landing. A predicted orbit line, apoapsis and periapsis, and prograde and retrograde markers help you fly by hand. Time warp is capped automatically to keep the physics accurate.
  - *Cruise:* fixed speeds up to 5c and a straight-line autopilot at 1–10c, for crossing interstellar distances.
  - Chase, cockpit and free-look cameras, and a HUD with speed, distance, ETA, altitude, orbit and signal delay to Earth.
- **Real spacecraft positions.** Voyager 1, Voyager 2 and New Horizons, modelled from their published distances and directions (approximate, good to a few degrees).
- **Places.** 130+ cities, landmarks, landing sites and features on Earth, the Moon, Mars, Mercury, Venus, Io, Europa, Ganymede, Callisto, Enceladus, Titan, Pluto and Charon.
- **Views.** Realistic, Thermal, Gravity and Matrix (wireframe), plus a spacetime-fabric layer and relativistic aberration at speed.

## Controls

| Action | Newtonian | Cruise |
| --- | --- | --- |
| Rotate | Arrow keys (or drag) | Arrow keys (or drag) |
| Roll | Q / E | Q / E |
| Thrust | W / S forward and back, A / D strafe, Space / Shift up and down | W / S throttle, 0–5 presets |
| Match velocity / stop | Hold X | X |
| Orbit / land | O / L | |
| Autopilot / jump | P / J | P / J |
| Switch flight model | N | N |
| Time warp | , and . | , and . |
| Camera (chase, cockpit, free look) | C | C |

## Publish on GitHub Pages

1. Create a public repository and upload `index.html`, `README.md`, `LICENSE` and `.nojekyll`.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Your link appears on the same page within a minute or two.

## Data and credits

- Star catalog: [HYG Database v3.8](https://github.com/astronexus/HYG-Database) (Hipparcos, Yale Bright Star, Gliese), **CC BY-SA 4.0**. Star radii and masses are measured values for well-known stars and estimates from colour and brightness for the rest.
- Planet elements: E. M. Standish, JPL *Approximate Positions of the Planets*. Moon: J. Meeus, *Astronomical Algorithms*, ch. 47. Satellites: JPL planetary satellite mean elements. Rotation: IAU WGCCRE models.
- Coastlines and borders: Natural Earth (public domain).
- Earth and Moon imagery: **confirm the source and licence of the embedded textures before release.**
- Rendering: [three.js](https://threejs.org) r128 (MIT).

## Roadmap

Done: ships and flight, autopilot at 1c and 5c, HUD, real moon ephemerides, extended date range, real stars, spacecraft positions, more places, open-source packaging.

Next: known exoplanets around nearby stars, asteroids and comets from JPL orbital elements, spacecraft trajectories from JPL Horizons, and tiled surface imagery so zooming into a city shows real streets rather than a single global map.

## Licence

Code: MIT (see `LICENSE`). Star data: CC BY-SA 4.0.
