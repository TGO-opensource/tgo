// The ships you can fly. Real craft come from NASA's 3D models (model: file under NASA-3D-Resources/3D Models, scale in metres per
// model unit, rot to point the nose along -Z); TGO originals are built in code (src/ships/tgo.js).
// len: overall size in metres, used until a model arrives. rated: the real engine's acceleration in m/s² (0: attitude thrusters only).
import {buildKestrel, buildWayfarer} from './tgo.js';

export const FLEET = [
  {id: 'voyager', kind: 'real', name: 'Voyager 1', len: 13, rated: .005, plume: [.12, 1.2, 'chem'],
   model: {file: 'Voyager Probe (A)/Voyager Probe (A).glb', scale: 36.6, rot: [-90, 0, 0]},
   fact: 'Launched 1977. Now cruising at about 17 km/s, the farthest human-made object. The 3.7 m dish still talks to Earth.'},
  {id: 'cassini', kind: 'real', name: 'Cassini', len: 10, rated: .08, plume: [.35, 3, 'chem'],
   model: {file: 'Cassini-Huygens (B)/Cassini-Huygens (B).glb', scale: .154, rot: [0, 180, 0]},
   fact: 'Orbited Saturn from 2004 to 2017 and carried ESA’s Huygens probe down to Titan.'},
  {id: 'parker', kind: 'real', name: 'Parker Solar Probe', len: 6.6, rated: .03, plume: [.1, 1, 'chem'],
   model: {file: 'Parker Solar Probe/Parker Solar Probe.glb', scale: 1, rot: [0, 180, 0]},
   fact: 'Passed 6.1 million km from the Sun’s surface on 24 December 2024 at about 192 km/s, the fastest object humans have built. Its heat shield faces forward.'},
  {id: 'dawn', kind: 'real', name: 'Dawn', len: 19.7, rated: 7e-5, plume: [.2, 6, 'ion'],
   model: {file: 'Dawn/Dawn.glb', scale: 1, rot: [0, 0, 0]},
   fact: 'Orbited Vesta and then Ceres on ion engines, the first spacecraft to orbit two worlds beyond Earth.'},
  {id: 'hubble', kind: 'real', name: 'Hubble Space Telescope', len: 13.2, rated: 0,
   model: {file: 'Hubble Space Telescope (A)/Hubble Space Telescope (A).glb', scale: .0251, rot: [-90, 0, 0]},
   fact: 'In low Earth orbit since 1990, about 540 km up. It has no rocket engine; it points itself with gyroscopes and reaction wheels.'},
  {id: 'webb', kind: 'real', name: 'James Webb Space Telescope', len: 21, rated: .001, plume: [.08, .8, 'chem'],
   model: {file: 'James Webb Space Telescope (B)/James Webb Space Telescope (B).glb', scale: 1, rot: [0, 180, 0]},
   fact: 'Orbits the Sun–Earth L2 point, 1.5 million km out. Its sunshield is the size of a tennis court.'},
  {id: 'iss', kind: 'real', name: 'International Space Station', len: 109, rated: .002, plume: [.5, 4, 'chem'],
   model: {file: 'International Space Station (ISS) (B)/International Space Station (ISS) (B).glb', scale: 2.39, rot: [0, 90, 0], hide: /^(bendedtru|pCylinder)/},
   fact: 'Crewed since 2000, about 420 km up, going round Earth every 93 minutes. Its truss is 109 m long.'},
  {id: 'lm', kind: 'real', name: 'Apollo Lunar Module', len: 9.4, rated: 3.2, plume: [.8, 6, 'chem'],
   model: {file: 'Apollo Lunar Module/Apollo Lunar Module.glb', scale: 1.43, rot: [-90, 0, 0]},
   fact: 'Landed twelve astronauts on the Moon between 1969 and 1972. Its descent engine points straight down, so “forward” is up.'},
  {id: 'shuttle', kind: 'real', name: 'Space Shuttle (with tank)', len: 47, rated: .5, plume: [1.6, 14, 'chem'],
   model: {file: 'Space Shuttle (A)/Space Shuttle (A).glb', scale: 1.12, rot: [0, 180, 0]},
   fact: 'Flew 135 missions from 1981 to 2011. Shown with its external tank and boosters as it was at launch.'},
  {id: 'kestrel', kind: 'tgo', name: 'TGO Kestrel', len: 23, rated: 49, build: buildKestrel,
   fact: 'TGO original. A 23 m two-seat interceptor built for fast hops between worlds, with a warp drive for the long ones.'},
  {id: 'wayfarer', kind: 'tgo', name: 'TGO Wayfarer', len: 340, rated: 3, build: buildWayfarer,
   fact: 'TGO original. A 340 m long-haul cruiser with a spinning habitat ring, a fusion drive and a warp drive for crossing between stars.'},
];
