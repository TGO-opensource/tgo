// TGO engine entry point. three.js and its add-ons come from the import map in index.html.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createHDR} from "./render/hdr.js";
import {D2R,TAU,AU,KM,CKM,G,J2000} from "./core/units.js";
import {B,byId,PL1,PL2,MEL,POLE,OBL,eqToScene,poleQuat,moonPos,moonNode,moonPlane} from "./data/solar.js";
import {COAST,BORDERS} from "./data/coast.js";
import {TEMP,ATMO,heatX,GLSL_HEAT,GSTOP,GLSL_GRAV,gravRGB,gravX,HEATS,heatRGB,VS,GLSL_OCC,FS_BODY,FS_CLOUD,SCAT,FS_SCAT,FS_RING,FS_ATMO} from "./render/shaders.js";

// the star catalog downloads alongside three.js (see the preload links) and is awaited only where it is first needed
const getData=(u,k)=>fetch(u).then(r=>{if(!r.ok)throw new Error(u+': HTTP '+r.status);return r[k]()});
const STAR_DATA=Promise.all([getData('data/stars.bin','arrayBuffer'),getData('data/stars.json','json')]);
const $=s=>document.querySelector(s);
// colour images are sRGB; shaders work in linear light and the HDR pass converts once at the end
function canvasTex(cv){const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;return t}
function srgbLoader(){const L=new THREE.TextureLoader();return {load(u,ok,pr,no){const t=L.load(u,ok,pr,no);t.colorSpace=THREE.SRGBColorSpace;return t},raw:L}}

/* renderer */
const canvas=$('#c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,logarithmicDepthBuffer:true});
// low tier for phones and modest machines: no bloom by default, 2k maps only, fewer faint stars and asteroids, cheaper atmospheres (glass blur is dropped in CSS)
const LOW=matchMedia("(pointer:coarse)").matches||(navigator.deviceMemory||8)<4||renderer.capabilities.maxTextureSize<8192;
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x000000,1);renderer.autoClear=false;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,1e-7,1e16);
const controls=new OrbitControls(camera,canvas);
controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;controls.zoomSpeed=1.4;controls.rotateSpeed=.6;
controls.maxDistance=3000*9.4607304725808e9;controls.target.set(0,0,0);

const X=new THREE.Vector3(1,0,0),tmp=new THREE.Vector3();
function kepler(M,e){let E=M+e*Math.sin(M);for(let k=0;k<7;k++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));return E}
function ell(a,e,i,O,om,E,out){const xp=a*(Math.cos(E)-e),yp=a*Math.sqrt(1-e*e)*Math.sin(E);
 const cO=Math.cos(O),sO=Math.sin(O),co=Math.cos(om),so=Math.sin(om),ci=Math.cos(i),si=Math.sin(i);
 const x=(co*cO-so*sO*ci)*xp+(-so*cO-co*sO*ci)*yp,y=(co*sO+so*cO*ci)*xp+(-so*sO+co*cO*ci)*yp,z=(so*si)*xp+(co*si)*yp;
 return out.set(x*AU,z*AU,-y*AU)}
function planetEl(b,T){const tb=PL1[b.id];if(!tb){const [a,e,I,L0,w0,O0,Ld]=b.el;return [a,e,I,L0+Ld*T,w0,O0,0]}
 const row=(T<-2||T>.5?PL2:PL1)[b.id],o=row[0],r=row[1],x=o.map((v,k)=>v+r[k]*T);let fix=0;
 if(row[2]){const [bb,c,sn,f]=row[2];fix=bb*T*T+c*Math.cos(f*T*D2R)+sn*Math.sin(f*T*D2R)}x.push(fix);return x}
function planetPos(b,T,out){const [a,e,I,L,w,O,fix]=planetEl(b,T);let M=(L-w+fix)*D2R;M%=TAU;if(M>Math.PI)M-=TAU;if(M<-Math.PI)M+=TAU;
 return ell(a,e,I*D2R,O*D2R,(w-O)*D2R,kepler(M,e),out)}
// moons from JPL mean elements: a precessing ellipse in each moon's Laplace plane
function moonFrame(id){const m=MEL[id],a=m[7]*D2R,d=m[8]*D2R,N=eqToScene(-Math.sin(a),Math.cos(a),0,new THREE.Vector3()),P=eqToScene(Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d),new THREE.Vector3());
 return {N,P,M:new THREE.Vector3().crossVectors(P,N)}}
function moonState(b,days){const m=MEL[b.id],ci=Math.cos(m[4]*D2R),Od=m[6]?-Math.sign(ci||1)*360/(m[6]*365.25):0,n=360/Math.abs(b.P);
 return {O:(m[5]+Od*days)*D2R,u:(m[2]+m[3]+(n-Od*ci)*days)*D2R}}
function moonVec(b,O,u,out){const m=MEL[b.id],e=m[1],i=m[4]*D2R,f=b.fr;let r=m[0];
 if(e>.002){const M=u-m[2]*D2R;r*=1-e*Math.cos(M);if(e>.01)u+=2*e*Math.sin(M)}
 const cu=Math.cos(u),su=Math.sin(u),cO=Math.cos(O),sO=Math.sin(O),x=cO*cu-sO*su*Math.cos(i),y=sO*cu+cO*su*Math.cos(i),z=su*Math.sin(i);r*=KM;
 return out.set(0,0,0).addScaledVector(f.N,x*r).addScaledVector(f.M,y*r).addScaledVector(f.P,z*r)}
function globeGeo(){const p=[],nLon=24,nLat=12,s=48;
 for(let i=0;i<nLon;i++){const lo=i/nLon*TAU;for(let j=0;j<s;j++){const a1=j/s*Math.PI,a2=(j+1)/s*Math.PI;p.push(Math.sin(a1)*Math.cos(lo),Math.cos(a1),Math.sin(a1)*Math.sin(lo),Math.sin(a2)*Math.cos(lo),Math.cos(a2),Math.sin(a2)*Math.sin(lo))}}
 for(let k=1;k<nLat;k++){const la=k/nLat*Math.PI,y=Math.cos(la),r=Math.sin(la);for(let j=0;j<s*2;j++){const b1=j/(s*2)*TAU,b2=(j+1)/(s*2)*TAU;p.push(r*Math.cos(b1),y,r*Math.sin(b1),r*Math.cos(b2),y,r*Math.sin(b2))}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return g}
function circleGeo(r,n){const p=[];for(let k=0;k<n;k++){const t=k/n*TAU;p.push(Math.cos(t)*r,0,Math.sin(t)*r)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return g}

/* bodies */
const globeG=globeGeo(),occG=new THREE.SphereGeometry(.998,96,48);
const occM=new THREE.MeshBasicMaterial({color:0x000000,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
const ringM=new THREE.LineBasicMaterial({color:0x25b862,transparent:true,opacity:.7});
B.forEach((b,i)=>{
 b.pos=new THREE.Vector3();b.loc=new THREE.Vector3();b.ph=i*2.399;
 b.eq=POLE[b.id]?poleQuat(POLE[b.id][0],POLE[b.id][1]):b.parent?byId[b.parent].eq:new THREE.Quaternion();
 if(b.parent){b.q=b.id==='moon'?moonPlane((Date.now()-J2000)/864e5/36525):byId[b.parent].eq;b.rot=b.P*24;b.fr=MEL[b.id]?moonFrame(b.id):null;b.lO=1e9}else b.oT=1e9;
 const col=b.kind==='star'?0xd8ffe6:b.kind==='moon'?0x2fd476:0x3dff8a;
 const obj=new THREE.Group();obj.scale.setScalar(b.R*KM);
 const tilt=new THREE.Group();tilt.quaternion.copy(b.eq);obj.add(tilt);
 const spin=new THREE.Group();tilt.add(spin);
 spin.add(new THREE.LineSegments(globeG,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.92})));
 spin.add(new THREE.Mesh(occG,occM));
 if(b.rings)b.rings.forEach(r=>tilt.add(new THREE.LineLoop(circleGeo(r/b.R,256),ringM)));
 b.obj=obj;b.spin=spin;scene.add(obj);
 // orbit
 const pts=[];
 if(b.el){const [a,e,I,,w0,O0]=b.el;for(let k=0;k<=360;k++){ell(a,e,I*D2R,O0*D2R,(w0-O0)*D2R,k/360*TAU,tmp);pts.push(tmp.x,tmp.y,tmp.z)}}
 else if(b.parent){for(let k=0;k<=128;k++){const t=k/128*TAU;tmp.set(Math.cos(t)*b.a*KM,0,-Math.sin(t)*b.a*KM).applyQuaternion(b.q);pts.push(tmp.x,tmp.y,tmp.z)}}
 if(pts.length){b.obase=new Float64Array(pts);const g=new THREE.BufferGeometry();const at=new THREE.BufferAttribute(new Float32Array(pts),3);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute('position',at);
  b.omat=new THREE.LineBasicMaterial({color:b.parent?0x1a7a42:0x1f8f4c,transparent:true,opacity:b.parent?.6:.6});
  b.orbit=new THREE.Line(g,b.omat);b.orbit.frustumCulled=false;scene.add(b.orbit)}
});
const helio=new THREE.LineLoop(circleGeo(120*AU,512),new THREE.LineDashedMaterial({color:0x1f8f4c,dashSize:2*AU,gapSize:2*AU,transparent:true,opacity:.7}));
helio.computeLineDistances();scene.add(helio);

/* surface: Earth map (Natural Earth, public domain) and real places */
function sph(lat,lon,r,out){lat*=D2R;lon*=D2R;return out.set(r*Math.cos(lat)*Math.cos(lon),r*Math.sin(lat),-r*Math.cos(lat)*Math.sin(lon))} // east longitude, body frame
function mapLines(str,r){const p=[];for(const ln of str.split(';')){const v=ln.split(',').map(Number);let x=0,y=0,px=null;
 for(let i=0;i<v.length;i+=2){x+=v[i];y+=v[i+1];sph(y/10,x/10,r,tmp);if(px)p.push(px[0],px[1],px[2],tmp.x,tmp.y,tmp.z);px=[tmp.x,tmp.y,tmp.z]}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return g}
byId.earth.spin.add(new THREE.LineSegments(mapLines(COAST,1.0002),new THREE.LineBasicMaterial({color:0xc8ffda})));
byId.earth.spin.add(new THREE.LineSegments(mapLines(BORDERS,1.0002),new THREE.LineBasicMaterial({color:0x2fd476,transparent:true,opacity:.55})));
const SITES={
earth:[['Islamabad',33.69,73.05],['Chicago',41.88,-87.63],['San Francisco',37.77,-122.42],['Vancouver',49.28,-123.12],['Rio de Janeiro',-22.91,-43.17],['Lima',-12.05,-77.04],['Bogotá',4.71,-74.07],['Nairobi',-1.29,36.82],['Addis Ababa',9.03,38.74],['Cape Town',-33.92,18.42],['Riyadh',24.71,46.68],['Tehran',35.69,51.39],['Dhaka',23.81,90.41],['Kolkata',22.57,88.36],['Bengaluru',12.97,77.59],['Bangkok',13.76,100.5],['Jakarta',-6.21,106.85],['Manila',14.6,120.98],['Seoul',37.57,126.98],['Hong Kong',22.32,114.17],['Rome',41.9,12.5],['Berlin',52.52,13.4],['Madrid',40.42,-3.7],['Athens',37.98,23.73],['Stockholm',59.33,18.07],['Reykjavík',64.15,-21.94],['Auckland',-36.85,174.76],
 ['K2',35.881,76.513,'Second-highest mountain on Earth, 8,611 m.'],['Mohenjo-daro',27.329,68.139,'Indus Valley city, built around 2500 BC.'],['Badshahi Mosque',31.588,74.31,'Mughal mosque in Lahore, completed 1673.'],['Golden Temple',31.62,74.877,'Harmandir Sahib in Amritsar, the holiest gurdwara of Sikhism.'],['Taj Mahal',27.175,78.042,'Mausoleum in Agra, completed around 1653.'],['Great Wall (Badaling)',40.36,116.02,'Most visited section of the Great Wall of China.'],['Angkor Wat',13.412,103.867,'Largest religious monument on Earth, early 12th century.'],['Petra',30.328,35.444,'Nabataean city carved into rock.'],['Colosseum',41.89,12.492,'Roman amphitheatre, completed AD 80.'],['Stonehenge',51.179,-1.826,'Stone circle begun around 3000 BC.'],['Machu Picchu',-13.163,-72.545,'Inca citadel, 15th century.'],['Christ the Redeemer',-22.952,-43.211,'Statue above Rio de Janeiro, 30 m tall.'],['Grand Canyon',36.1,-112.11,'Carved by the Colorado River, up to 1.8 km deep.'],['Niagara Falls',43.08,-79.07,'Waterfalls on the Canada and US border.'],['Mount Kilimanjaro',-3.068,37.356,'Highest mountain in Africa, 5,895 m.'],['Uluru',-25.345,131.036,'Sandstone monolith, 348 m high.'],['Challenger Deep',11.35,142.2,'Deepest known point of the ocean, about 10,935 m.'],
 ['CERN',46.234,6.055,'Home of the Large Hadron Collider.'],['Mauna Kea Observatories',19.821,-155.468,'Telescopes at 4,200 m on Hawaii.'],['ALMA',-23.029,-67.755,'Radio telescope array at 5,000 m in the Atacama Desert.'],['Jodrell Bank',53.236,-2.307,'Lovell radio telescope, 76 m dish.'],['Starbase',25.997,-97.155,'SpaceX Starship launch site.'],['Guiana Space Centre',5.236,-52.775,'Europe’s spaceport. Launched the James Webb Space Telescope.'],['Satish Dhawan Space Centre',13.72,80.23,'India’s spaceport. Launched Chandrayaan-3.'],['Wenchang',19.614,110.951,'China’s coastal spaceport.'],['Vostochny Cosmodrome',51.884,128.333,'Russia’s newest spaceport.'],
 ['New York',40.71,-74.01],['Toronto',43.65,-79.38],['Mexico City',19.43,-99.13],['Los Angeles',34.05,-118.24],['São Paulo',-23.55,-46.63],['Buenos Aires',-34.6,-58.38],['London',51.51,-.13],['Paris',48.86,2.35],['Moscow',55.76,37.62],['Istanbul',41.01,28.98],['Cairo',30.04,31.24],['Lagos',6.52,3.38],['Johannesburg',-26.2,28.05],['Dubai',25.2,55.27],['Karachi',24.86,67.01],['Lahore',31.55,74.34],['Delhi',28.61,77.21],['Mumbai',19.08,72.88],['Beijing',39.9,116.41],['Shanghai',31.23,121.47],['Tokyo',35.68,139.69],['Singapore',1.35,103.82],['Sydney',-33.87,151.21],
 ['Mount Everest',27.988,86.925,'Highest point on Earth, 8,849 m.'],['Great Pyramid of Giza',29.979,31.134,'Built around 2560 BC.'],['Kennedy Space Center',28.573,-80.649,'Launch site of Apollo 11.'],['Baikonur Cosmodrome',45.965,63.305,'Launch site of Sputnik 1 and Yuri Gagarin.']],
moon:[['Luna 9',7.08,-64.37,'First soft landing on the Moon, 3 February 1966.'],['Chang’e 5',43.06,-51.92,'Returned samples to Earth, December 2020.'],['Chang’e 6',-41.64,-153.99,'First samples from the far side, June 2024.'],['Chandrayaan-3',-69.37,32.32,'First landing near the south pole, 23 August 2023.'],['SLIM',-13.32,25.25,'Japan’s precision lander, January 2024.'],['Odysseus (IM-1)',-80.13,1.44,'First commercial landing, 22 February 2024.'],['Shackleton',-89.67,129.78,'Crater at the south pole, 21 km across.'],['Mare Tranquillitatis',8.5,31.4,'Sea of Tranquillity.'],['Mare Imbrium',32.8,-15.6,'Sea of Showers, 1,145 km across.'],['Apollo 11',.674,23.473,'First crewed landing, 20 July 1969.'],['Apollo 12',-3.012,-23.422,'Landed 19 November 1969.'],['Apollo 14',-3.645,-17.471,'Landed 5 February 1971.'],['Apollo 15',26.132,3.634,'Landed 30 July 1971, first lunar rover.'],['Apollo 16',-8.973,15.501,'Landed 21 April 1972.'],['Apollo 17',20.191,30.772,'Last crewed landing, 11 December 1972.'],['Chang’e 4',-45.444,177.588,'First landing on the far side, 3 January 2019.'],['Tycho',-43.31,-11.36,'Crater 85 km across.'],['Copernicus',9.62,-20.08,'Crater 93 km across.']],
mars:[['Spirit',-14.568,175.472,'Landed 4 January 2004.'],['Opportunity',-1.946,-5.527,'Landed 25 January 2004, drove 45 km.'],['Mars Pathfinder',19.13,-33.22,'Landed 4 July 1997 with the Sojourner rover.'],['Viking 2',48.27,-134.01,'Landed 3 September 1976.'],['Phoenix',68.22,-125.75,'Found water ice near the pole, 2008.'],['InSight',4.502,135.623,'Landed 26 November 2018, listened for marsquakes.'],['Zhurong',25.066,109.925,'China’s rover, landed 15 May 2021.'],['Elysium Mons',25.02,147.21,'Volcano about 12.6 km high.'],['Arsia Mons',-8.26,-120.09,'Volcano about 17.8 km high.'],['Olympus Mons',18.65,-133.8,'Tallest volcano in the solar system, about 22 km high.'],['Valles Marineris',-13.9,-59.2,'Canyon system over 4,000 km long.'],['Curiosity (Gale Crater)',-4.59,137.44,'Landed 6 August 2012.'],['Perseverance (Jezero Crater)',18.44,77.45,'Landed 18 February 2021.'],['Hellas Planitia',-42.4,70.5,'Impact basin about 2,300 km wide.'],['Viking 1',22.27,-47.95,'First successful Mars landing, 20 July 1976.']],
venus:[['Maxwell Montes',65.2,3.3,'Highest mountains on Venus, about 11 km.'],['Venera 7',-5,-9,'First data sent from another planet’s surface, 15 December 1970.'],['Venera 13',-7.55,-56.31,'First colour photos from the surface, 1 March 1982.'],['Aphrodite Terra',-5.8,104.8,'Highland region the size of South America.']],
mercury:[['Caloris Planitia',30.5,170.2,'Impact basin about 1,550 km across.'],['MESSENGER impact',54.44,-149.9,'MESSENGER ended its mission here, 30 April 2015.']],
io:[['Loki Patera',12.6,51.2,'Largest volcanic depression on Io, a lava lake 200 km across.'],['Pele',-18.7,104.7,'Volcano with a plume 300 km high.']],
europa:[['Pwyll',-25.2,88.6,'Young impact crater, 26 km across.'],['Conamara Chaos',9.7,86.3,'Jumbled ice rafts above the hidden ocean.']],
ganymede:[['Galileo Regio',35.7,-144.2,'Ancient dark terrain about 3,200 km across.']],
callisto:[['Valhalla',14.7,-56,'Multi-ring impact basin about 3,800 km across.']],
enceladus:[['Tiger stripes',-82,-150,'South polar fractures venting water plumes into space.']],
charon:[['Mordor Macula',85,0,'Dark red cap at the north pole.']],
titan:[['Huygens landing site',-10.57,167.67,'Huygens probe touched down 14 January 2005.'],['Kraken Mare',68,50,'Largest methane sea on Titan.'],['Ligeia Mare',79,112,'Second-largest sea, liquid methane and ethane.'],['Selk crater',7,161,'Target of NASA’s Dragonfly rotorcraft.']],
pluto:[['Sputnik Planitia',25,175,'Nitrogen-ice plain forming Pluto’s heart.'],['Wright Mons',-21.5,173.6,'Possible ice volcano, about 4 km high.']]};
const site=[];let curSite=null;
Object.entries(SITES).forEach(([id,list])=>{const b=byId[id];list.forEach(([name,lat,lon,about])=>{
 const s={b,name,lat,lon,about:about||'',loc:sph(lat,lon,1.0003,new THREE.Vector3())};
 const el=document.createElement('button');el.className='lb site off';el.innerHTML='<i></i><span>'+name+'</span>';el.addEventListener('click',()=>flySite(s));s.lb=el;site.push(s)})});
function siteDir(s,out){return out.copy(s.loc).normalize().applyQuaternion(s.b.spin.getWorldQuaternion(tq0))}
const tq0=new THREE.Quaternion(),sv=new THREE.Vector3();
function flySite(s){if(ship.on){setTarget(s.b);flash('Target set to '+s.b.name+' ('+s.name+')');return}
 stopTour();const sp=$('#speed');if(+sp.value!==5){sp.value=5;sp.dispatchEvent(new Event('input'))}
 curSite=s;go(s.b,s.b.R*KM*1.5,siteDir(s,new THREE.Vector3()));$('#i-site').textContent=s.name+(s.about?'. '+s.about:'')}

// imagery lives in data/ and streams in after the page opens
const TEX={earth:'data/tex/earth-2k.jpg',night:'data/tex/earth-night-2k.jpg',clouds:'data/tex/earth-clouds-2k.jpg',moon:'data/tex/moon-2k.jpg'};

/* procedural surfaces for worlds without open imagery */
function hsh(x,y,z,s){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1274126177)^Math.imul(s,1442695041);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296}
function vn(x,y,z,s){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),u=x-X,v=y-Y,w=z-Z,a=u*u*(3-2*u),b=v*v*(3-2*v),c=w*w*(3-2*w),L=(p,q,t)=>p+(q-p)*t;
 return L(L(L(hsh(X,Y,Z,s),hsh(X+1,Y,Z,s),a),L(hsh(X,Y+1,Z,s),hsh(X+1,Y+1,Z,s),a),b),L(L(hsh(X,Y,Z+1,s),hsh(X+1,Y,Z+1,s),a),L(hsh(X,Y+1,Z+1,s),hsh(X+1,Y+1,Z+1,s),a),b),c)}
function fbm(x,y,z,s,o){let t=0,a=.5,f=1;for(let i=0;i<o;i++){t+=a*vn(x*f,y*f,z*f,s+i);f*=2.03;a*=.5}return t/(1-Math.pow(.5,o))}
const mixc=(p,q,t)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t];
const smst=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
const hx=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
function craters(n,seed){const c=[];for(let i=0;i<n;i++){const u=hsh(i,1,seed,7)*2-1,t=hsh(i,2,seed,7)*TAU,r=Math.sqrt(1-u*u);c.push([r*Math.cos(t),u,r*Math.sin(t),.02+Math.pow(hsh(i,3,seed,7),3)*.16])}return c}
function crat(c,x,y,z){let k=0;for(const q of c){const d=Math.hypot(x-q[0],y-q[1],z-q[2])/q[3];if(d<1.15)k+=d<.85?-.12*(1-d):.18*(1-Math.abs(d-1)/.15)}return k}
function grey(base,var_,seed,nc){const cr=craters(nc,seed);return (x,y,z)=>{const n=fbm(x*4,y*4,z*4,seed,5),v=base+(n-.5)*var_+crat(cr,x,y,z);return [v*255,v*244,v*232]}}
function bands(cols,freq,turb,seed,extra){return (x,y,z,la,lo)=>{const t=la+turb*(fbm(x*5,y*9,z*5,seed,4)-.5),s=.5+.5*Math.sin(t*freq)+.25*Math.sin(t*freq*2.3+1),i=Math.min(cols.length-1.001,Math.max(0,s*(cols.length-1)));
 const k=Math.floor(i);let c=mixc(cols[k],cols[k+1],i-k);const n=.9+.2*fbm(x*14,y*30,z*14,seed+9,3);c=[c[0]*n,c[1]*n,c[2]*n];return extra?extra(c,x,y,z,la,lo):c}}
const PAINT={
 sun:(x,y,z)=>{const n=fbm(x*38,y*38,z*38,3,4),m=fbm(x*6,y*6,z*6,5,3);return mixc(hx('#ff8a1e'),hx('#fff1b8'),Math.min(1,n*.9+m*.3))},
 mercury:grey(.5,.35,11,70),
 venus:(x,y,z,la)=>{const n=fbm(x*2,y*7+la,z*2,21,5);return mixc(hx('#b98a4d'),hx('#f0d9a4'),n)},
 mars:(x,y,z,la)=>{const n=fbm(x*2.6,y*2.6,z*2.6,31,6),d=smst(.42,.56,n);let c=mixc(hx('#5b2a17'),hx('#c8622f'),d);c=mixc(c,hx('#e08a55'),smst(.62,.8,n)*.6);
  const cap=smst(1.22,1.33,Math.abs(la)+.08*fbm(x*8,y*8,z*8,33,3));return mixc(c,hx('#f4f1ec'),cap)},
 jupiter:bands([hx('#7d5638'),hx('#b48a63'),hx('#d8c6a8'),hx('#c49e74'),hx('#e3d5bd')],16,.045,41,(c,x,y,z,la,lo)=>{const dl=(((lo-1.05)+Math.PI*3)%TAU)-Math.PI,dp=la+.384,e=(dl/.2)**2+(dp/.1)**2;return e<1?mixc(c,hx('#c0583a'),smst(1,.3,e)):c}),
 saturn:bands([hx('#c9ad78'),hx('#d6bd8b'),hx('#e2cfa2'),hx('#d9c394')],22,.025,51),
 uranus:bands([hx('#8fcad6'),hx('#a9dde6'),hx('#b8e6ee')],10,.05,61),
 neptune:bands([hx('#2a46b8'),hx('#3c5fd6'),hx('#5277e6')],12,.04,71,(c,x,y,z,la,lo)=>{const e=((lo-2)/.18)**2+((la+.35)/.08)**2;return e<1?mixc(c,hx('#16245e'),smst(1,.2,e)):c}),
 pluto:(x,y,z,la,lo)=>{const n=fbm(x*3,y*3,z*3,81,5);let c=mixc(hx('#5e3420'),hx('#cfa57c'),smst(.38,.62,n));const dl=Math.abs(((lo-3.05)+Math.PI*3)%TAU-Math.PI),h=(dl/.5)**2+((la-.42)/.48)**2;
  return mixc(c,hx('#f3ead9'),smst(1.15,.55,h+.3*(fbm(x*6,y*6,z*6,83,3)-.5)))},
 io:(x,y,z)=>{const n=fbm(x*5,y*5,z*5,91,5),m=fbm(x*16,y*16,z*16,92,3);let c=mixc(hx('#d9c05a'),hx('#f2e6a0'),n);c=mixc(c,hx('#b8622a'),smst(.62,.72,m)*.8);return mixc(c,hx('#2b1d14'),smst(.8,.86,m))},
 europa:(x,y,z)=>{const n=fbm(x*3,y*3,z*3,101,4),l=Math.abs(fbm(x*7,y*7,z*7,102,4)-.5);let c=mixc(hx('#cdbca2'),hx('#f1ebe1'),n);return mixc(c,hx('#8a5a3a'),smst(.035,.0,l)*.8)},
 ganymede:(x,y,z)=>mixc(hx('#6d6156'),hx('#c8beb1'),smst(.4,.6,fbm(x*3,y*3,z*3,111,6))),
 callisto:(x,y,z)=>{const n=fbm(x*4,y*4,z*4,121,5),m=hsh(Math.floor(x*90),Math.floor(y*90),Math.floor(z*90),5);return mixc(mixc(hx('#3e352e'),hx('#6e6257'),n),hx('#e8e0d4'),m>.985?.8:0)},
 titan:(x,y,z,la)=>mixc(hx('#b07a2a'),hx('#e3a94a'),.5+.3*(fbm(x*2,y*5,z*2,131,4)-.5)+.2*Math.cos(la)),
 enceladus:(x,y,z)=>mixc(hx('#dfe6ea'),hx('#ffffff'),fbm(x*5,y*5,z*5,141,4)),
 rhea:grey(.7,.25,151,40),titania:grey(.55,.25,161,35),oberon:grey(.45,.25,171,35),
 triton:(x,y,z,la)=>{const n=fbm(x*4,y*4,z*4,181,5);return mixc(mixc(hx('#9c7e70'),hx('#efdcd0'),n),hx('#f6efe9'),smst(-.2,-.6,la))},
 charon:(x,y,z,la)=>{const v=.45+.35*fbm(x*4,y*4,z*4,191,5);return mixc([v*240,v*236,v*230],hx('#7a3b25'),smst(1.15,1.35,la))},
 phobos:grey(.32,.22,201,25),deimos:grey(.36,.18,211,15),
 // dwarf planets and big asteroids: painted from their measured albedo and colour (Ceres dark with bright salt spots, Eris and Haumea icy white, Makemake and Sedna red)
 ceres:((G)=>(x,y,z)=>{const c=G(x,y,z),s=hsh(Math.floor(x*40),Math.floor(y*40),Math.floor(z*40),9);return s>.996?[235,235,230]:c})(grey(.3,.12,401,45)),
 pallas:grey(.36,.16,411,30),vesta:grey(.55,.28,421,40),hygiea:grey(.26,.1,431,25),
 eris:(x,y,z)=>{const v=.88+.1*fbm(x*4,y*4,z*4,441,4);return [v*250,v*248,v*244]},haumea:(x,y,z)=>{const v=.82+.14*fbm(x*5,y*5,z*5,451,4);return [v*245,v*245,v*248]},
 makemake:(x,y,z)=>mixc(hx('#8a5a3c'),hx('#d9b48f'),fbm(x*3,y*3,z*3,461,5)),sedna:(x,y,z)=>mixc(hx('#6e2414'),hx('#b8553a'),fbm(x*3,y*3,z*3,471,5)),
 mimas:grey(.62,.2,221,55),tethys:grey(.8,.16,231,30),dione:grey(.66,.22,241,35),miranda:grey(.58,.32,251,30),ariel:grey(.64,.2,261,30),umbriel:grey(.3,.12,271,30),
 iapetus:((G)=>(x,y,z,la,lo)=>{const g=G(x,y,z),c=Math.cos(la)*Math.cos(lo+Math.PI/2),k=smst(.15,.35,c+.12*(fbm(x*6,y*6,z*6,283,3)-.5));return mixc(g,hx('#3a2418'),k)})(grey(.72,.2,281,30))};
function paint(id,w,h){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d'),im=cx.createImageData(w,h),d=im.data,f=PAINT[id];
 for(let j=0;j<h;j++){const la=(.5-(j+.5)/h)*Math.PI,cl=Math.cos(la),sl=Math.sin(la);
  for(let i=0;i<w;i++){const lo=(i+.5)/w*TAU-Math.PI,x=cl*Math.cos(lo),z=-cl*Math.sin(lo),c=f(x,sl,z,la,lo),o=(j*w+i)*4;d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255}}
 cx.putImageData(im,0,0);const t=canvasTex(cv);t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t}
// Saturn's ring texture spans 69,462 to 141,072 km (fitted to the Cassini Division and the A ring's outer edge in the Solar System Scope strip)
const RING=[69462,141072];
function ringTex(){const cv=document.createElement('canvas');cv.width=1024;cv.height=4;const cx=cv.getContext('2d'),im=cx.createImageData(1024,4),d=im.data,r0=RING[0],r1=RING[1];
 for(let i=0;i<1024;i++){const r=r0+(r1-r0)*i/1023;let a=r<74658||r>136775?0:r<92000?.18:r<117580?.85:r<122170?.06:r<133400||r>133800?.6:.05;if(r>117580&&r<122170)a=.06;
  a*=.75+.5*vn(i*.35,0,0,7)*vn(i*.05,1,0,8);const k=r<92000?.55:r<117580?1:.85;
  for(let j=0;j<4;j++){const o=(j*1024+i)*4;d[o]=228*k;d[o+1]=210*k;d[o+2]=170*k;d[o+3]=Math.min(255,a*255)}}
 cx.putImageData(im,0,0);return canvasTex(cv)}
function glowTex(stops){const cv=document.createElement('canvas');cv.width=cv.height=256;const cx=cv.getContext('2d'),g=cx.createRadialGradient(128,128,0,128,128,128);stops.forEach(s=>g.addColorStop(s[0],s[1]));cx.fillStyle=g;cx.fillRect(0,0,256,256);return canvasTex(cv)}

const sphG=new THREE.SphereGeometry(1,128,64),texL=srgbLoader(),blank=new THREE.DataTexture(new Uint8Array([90,90,90,255]),1,1);blank.needsUpdate=true;
const look={view:'real',lit:true,mats:[],atm:[],queue:[]};
// preExp: the camera exposure, applied inside every physically lit shader so overlays (orbits, labels, markers) keep a fixed brightness.
// sunE: sunlight on each world relative to 1 AU. SUN_DISC: the Sun's surface brightness in the same units, kept within half-float range.
const PE={value:1},SUN_DISC=4e3,GAS={jupiter:1,saturn:1,uranus:1,neptune:1};
B.forEach(b=>{b.sunEU={value:1};
 b.wire=[...b.spin.children.filter(c=>c.isLineSegments),...b.obj.children[0].children.filter(c=>c.isLineLoop)];
 const T=TEMP[b.id]||[-150,-200,10];
 b.g=b.GM/(b.R*b.R)*1000;const w=TAU/(Math.abs(b.rot)*3600);b.gc=w*w*b.R*1000;
 if(b.id!=='sun'){const p=b.parent?byId[b.parent]:B[0];b.soi=(b.parent?b.a:b.el[0]*149597870.7)*Math.pow(b.GM/p.GM,.4)}
 const m=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_BODY,uniforms:{map:{value:blank},night:{value:blank},spec:{value:blank},hasNight:{value:0},hasSpec:{value:0},lit:{value:1},mode:{value:0},emissive:{value:b.kind==='star'?1:0},sunPos:{value:new THREE.Vector3()},temp:{value:new THREE.Vector3(T[0],T[1],T[2])},gsurf:{value:b.g},gcent:{value:b.gc},sunE:b.sunEU,preExp:PE,sunDisc:{value:SUN_DISC},photo:{value:GAS[b.id]?2:SCAT[b.id]||b.kind==='star'?0:1}}});
 b.real=new THREE.Mesh(sphG,m);b.spin.add(b.real);look.mats.push(m);
 // every lit surface gets its own eclipse occluders (filled in by updateLook)
 const occU={occ:{value:[0,1,2,3].map(()=>new THREE.Vector4())},occA:{value:[0,0,0,0]},sunR:{value:695700*KM},sunE:b.sunEU,preExp:PE};b.occU=occU;Object.assign(m.uniforms,occU);
 if(b.rings){m.defines={RINGS:1};Object.assign(m.uniforms,{ringT:{value:blank},ringN:{value:new THREE.Vector3(0,1,0)},ringC:{value:new THREE.Vector3()},ringR:{value:new THREE.Vector2(RING[0]*KM,RING[1]*KM)}})}
 if(SCAT[b.id]){const s=SCAT[b.id],am=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_SCAT,defines:{NS:LOW?4:8},transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
   uniforms:{...occU,sunPos:{value:new THREE.Vector3()},lit:{value:1},pc:{value:new THREE.Vector3()},R:{value:b.R*KM},Ra:{value:s.Ra},bR:{value:new THREE.Vector3(...s.bR)},bM:{value:s.bM},hR:{value:s.hR},hM:{value:s.hM},g:{value:s.g},sunI:{value:s.I}}});
  b.atmo=new THREE.Mesh(sphG,am);b.atmo.scale.setScalar(s.Ra);b.atmo.renderOrder=2;b.obj.add(b.atmo);look.atm.push(am)}
 else if(ATMO[b.id]){const a=ATMO[b.id],am=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_ATMO,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{color:{value:new THREE.Color(a[0],a[1],a[2])},sunPos:{value:new THREE.Vector3()},lit:{value:1},sunE:b.sunEU,preExp:PE,near:{value:1}}});
  b.atmo=new THREE.Mesh(sphG,am);b.atmo.scale.setScalar(a[3]);b.atmo.renderOrder=2;b.obj.add(b.atmo);look.atm.push(am)}
 if(b.id==='earth'){m.uniforms.hasNight.value=1;m.uniforms.hasSpec.value=1;
  m.uniforms.map.value=texL.load(TEX.earth);m.uniforms.night.value=texL.raw.load(TEX.night);
  const cm=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_CLOUD,transparent:true,depthWrite:false,uniforms:{...occU,map:{value:texL.raw.load(TEX.clouds)},sunPos:{value:new THREE.Vector3()},lit:{value:1},fade:{value:1},detail:{value:0}}});
  b.clouds=new THREE.Mesh(sphG,cm);b.clouds.renderOrder=1;b.clouds.scale.setScalar(1.004);b.spin.add(b.clouds);look.atm.push(cm)}
 else if(b.id==='moon')m.uniforms.map.value=b.proc=texL.load(TEX.moon);
 else look.queue.push(b);
 [m.uniforms.map.value,m.uniforms.night.value].forEach(t=>{if(t!==blank)t.anisotropy=renderer.capabilities.getMaxAnisotropy()});
 if(b.rings){const r0=RING[0]/b.R,r1=RING[1]/b.R,g=new THREE.RingGeometry(r0,r1,256,1),p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){const r=Math.hypot(p.getX(i),p.getY(i));uv.setXY(i,(r-r0)/(r1-r0),.5)}g.rotateX(-Math.PI/2);
  const rt=ringTex();m.uniforms.ringT.value=rt;
  b.ringReal=new THREE.Mesh(g,new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_RING,transparent:true,side:THREE.DoubleSide,depthWrite:false,
   uniforms:{map:{value:rt},sunPos:{value:new THREE.Vector3()},lit:{value:1},pc:m.uniforms.ringC,ringN:m.uniforms.ringN,pR:{value:b.R*KM},sunE:b.sunEU,preExp:PE}}));b.ringReal.renderOrder=1;b.obj.children[0].add(b.ringReal)}
});
const sunB=byId.sun;sunB.glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex([[0,'rgba(255,250,230,1)'],[.12,'rgba(255,220,150,.9)'],[.3,'rgba(255,170,70,.28)'],[.6,'rgba(255,120,40,.07)'],[1,'rgba(255,100,30,0)']]),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
sunB.glow.scale.setScalar(16);sunB.obj.add(sunB.glow);
// paint the procedural worlds a few at a time so the page stays responsive
function paintNext(){const b=look.queue.shift();if(!b)return;const big=b.kind!=='moon'||b.id==='titan';b.proc=paint(b.id,big?768:384,big?384:192);if(b.mapLv==null||b.mapLv<0)b.real.material.uniforms.map.value=b.proc;setTimeout(paintNext,30)}
setTimeout(paintNext,200);

/* real surface maps (data/tex/), fetched when a world is big enough on screen to need them; the painted surfaces stand in until then,
   and stay for worlds without an openly licensed map. 2k loads at about 40 px across (or when focused), 4k at about 500 px; few are kept at once */
const MAPS={sun:['sun-2k.jpg'],mercury:['mercury-2k.jpg'],venus:['venus-2k.jpg'],moon:['moon-2k.jpg','moon-4k.jpg'],mars:['mars-2k.jpg','mars-4k.jpg'],
 jupiter:['jupiter-2k.jpg','jupiter-4k.jpg'],saturn:['saturn-2k.jpg','saturn-4k.jpg'],uranus:['uranus-2k.jpg'],neptune:['neptune-2k.jpg'],
 io:['io-2k.jpg'],ganymede:['ganymede-2k.jpg'],triton:['triton-2k.jpg'],ariel:['ariel-1k.jpg'],miranda:['miranda-1k.jpg'],phobos:['phobos-1k.jpg'],deimos:['deimos-1k.jpg']};
const MP={busy:0,live:2,t:0,f:{},keep2:8,keep4:1};
function mapFile(name){return MP.f[name]||(MP.f[name]={name,st:0,tex:null,used:0,big:/-4k/.test(name)})}
function mapLoad(m){m.st=1;MP.busy++;texL.load('data/tex/'+m.name,t=>{MP.busy--;t.anisotropy=renderer.capabilities.getMaxAnisotropy();m.tex=t;m.st=2},undefined,()=>{MP.busy--;m.st=3;m.retry=performance.now()+3e4})}
function mapShow(b,lv){const L=MAPS[b.id];b.mapLv=lv;b.real.material.uniforms.map.value=lv<0?(b.proc||blank):mapFile(L[lv]).tex}
function updateMaps(now){if(now-MP.t<250)return;MP.t=now;if(look.view!=='real')return;const k=innerHeight/(2*Math.tan(camera.fov*D2R/2));
 for(const id in MAPS){const b=byId[id],L=MAPS[id];if(!b.obj.visible)continue;
  const px=b.R*KM/Math.max(b.obj.position.distanceTo(camera.position),1e-9)*k,want=L[1]&&px>500&&!LOW?1:px>40||b===focus?0:-1;
  for(let lv=0;lv<=want;lv++){const m=mapFile(L[lv]);m.used=now;if((m.st===0||(m.st===3&&now>m.retry))&&MP.busy<MP.live)mapLoad(m)}
  // show the sharpest wanted map that has arrived; a sharper one already showing stays until it is evicted
  const cur=b.mapLv??-1;let best=-1;for(let lv=want;lv>=0;lv--)if(mapFile(L[lv]).st===2){best=lv;break}
  if(cur>best&&mapFile(L[cur]).st===2)best=cur;if(best!==cur)mapShow(b,best)}
 if(byId.saturn.ringReal&&!MP.ring&&mapFile('saturn-2k.jpg').st>0){MP.ring=1;texL.load('data/tex/saturn-ring.png',t=>{byId.saturn.ringReal.material.uniforms.map.value=t;byId.saturn.real.material.uniforms.ringT.value=t})}
 // keep GPU memory bounded: drop the least recently wanted maps beyond the budget, falling back to the next sharpest one
 for(const big of [true,false]){const ld=Object.values(MP.f).filter(m=>m.st===2&&m.big===big).sort((a,b)=>a.used-b.used),cap=big?MP.keep4:MP.keep2;
  for(const m of ld.slice(0,Math.max(0,ld.length-cap))){if(m.used===now)continue;
   for(const id in MAPS){const b=byId[id],lv=MAPS[id].indexOf(m.name);if(lv>=0&&b.mapLv===lv)mapShow(b,lv>0&&mapFile(MAPS[id][0]).st===2?0:-1)}
   m.tex.dispose();m.tex=null;m.st=0}}}

/* streamed Earth imagery: NASA GIBS Blue Marble (shaded relief and bathymetry), public domain, no key.
   EPSG:4326 tiles are 512 px and 288/2^z degrees wide from (-180, 90); levels 3 to 7 tile the globe exactly, 36° down to 2.25° (about 500 m per pixel).
   Only tiles on screen and above the horizon load, each refined until its pixels are about screen-sized; far away the built-in map is sharp enough and nothing loads. */
const GIBS='https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/';
const FS_TILE=FS_BODY.replace('uniform sampler2D map','uniform vec4 tileR;uniform sampler2D map').replace('texture2D(map,vUv)','texture2D(map,vUv*tileR.zw+tileR.xy)');
const TL={z0:3,z1:7,live:6,keep:160,busy:0,f:0,tiles:new Map(),group:new THREE.Group(),baseRad:TAU/2048,inv:new THREE.Matrix4(),cam:new THREE.Vector3(),fr:new THREE.Frustum(),pm:new THREE.Matrix4(),bs:new THREE.Sphere(),want:[]};
TL.group.scale.setScalar(1+2e-5);TL.group.visible=false;byId.earth.spin.add(TL.group); // just above the base sphere; the patches sag less than this between vertices
function tileAt(z,x,y){const k=z+'/'+y+'/'+x;let t=TL.tiles.get(k);if(t)return t;
 const s=288/(1<<z),lon0=-180+x*s,lat0=90-y*s;
 t={k,z,x,y,s,lon0,lat0,st:0,used:0,c:sph(lat0-s/2,lon0+s/2,1,new THREE.Vector3())};
 t.a=Math.max(...[[lat0,lon0],[lat0,lon0+s],[lat0-s,lon0],[lat0-s,lon0+s]].map(p=>t.c.angleTo(sph(p[0],p[1],1,tmp))));
 TL.tiles.set(k,t);return t}
function tileGeo(t){const n=Math.min(64,Math.max(16,Math.ceil(t.s/.6))),p=[],uv=[],ix=[];
 for(let j=0;j<=n;j++){const la=t.lat0-t.s*j/n;for(let i=0;i<=n;i++){const lo=t.lon0+t.s*i/n;sph(la,lo,1,tmp);p.push(tmp.x,tmp.y,tmp.z);uv.push((lo+180)/360,(la+90)/180)}}
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i+1,b=j*(n+1)+i,c=b+n+1,d=a+n+1;ix.push(a,b,d,b,c,d)}
 const g=new THREE.BufferGeometry();g.setIndex(ix);g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 g.boundingSphere=new THREE.Sphere(t.c.clone(),2*Math.sin(t.a/2));return g}
function tileLoad(t){t.st=1;TL.busy++;
 texL.load(GIBS+t.z+'/'+t.y+'/'+t.x+'.jpeg',tex=>{TL.busy--;if(t.st!==1){tex.dispose();return}
  tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  // the map uniform is this tile's own; everything else (sun, lighting, view mode, night lights) is shared with Earth's material
  const m=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_TILE,uniforms:{...byId.earth.real.material.uniforms,map:{value:tex},
   tileR:{value:new THREE.Vector4(-(t.lon0+180)/t.s,-(t.lat0-t.s+90)/t.s,360/t.s,180/t.s)}}});
  t.mesh=new THREE.Mesh(tileGeo(t),m);t.mesh.visible=false;TL.group.add(t.mesh);t.st=2},
  undefined,()=>{TL.busy--;t.st=3;t.retry=performance.now()+3e4})}
function tileDrop(t){if(t.mesh){TL.group.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.uniforms.map.value.dispose();t.mesh.material.dispose();t.mesh=null}t.st=0}
function tileVis(t,d){const h=Math.acos(Math.min(1,1/d));if(t.c.angleTo(TL.cam)>h+t.a)return false; // behind the horizon
 TL.bs.center.copy(t.c).applyMatrix4(byId.earth.spin.matrixWorld);TL.bs.radius=2*Math.sin(t.a/2)*byId.earth.R*KM;return TL.fr.intersectsSphere(TL.bs)}
// screen pixels covered by one texel of angular size rad, at this tile's nearest distance
function tilePx(t,rad,d,k){return rad/Math.max(d-1,TL.cam.distanceTo(t.c)-2*Math.sin(t.a/2))*k}
function tileVisit(t,d,k){if(!tileVis(t,d))return;t.used=TL.f;
 if(t.st!==2){if(t.st===0||(t.st===3&&performance.now()>t.retry))TL.want.push(t);return}
 if(t.z<TL.z1&&tilePx(t,t.s*D2R/512,d,k)>1.25){const kids=[0,1,2,3].map(i=>tileAt(t.z+1,t.x*2+(i&1),t.y*2+(i>>1)));let ready=true;
  for(const c of kids)if(tileVis(c,d)){c.used=TL.f;if(c.st!==2){ready=false;if(c.st===0||(c.st===3&&performance.now()>c.retry))TL.want.push(c)}}
  if(ready){for(const c of kids)tileVisit(c,d,k);return}}
 t.drawn=TL.f}
// Earth's 4k day and cloud maps, fetched once you come within a few Earth radii
let earthHiSt=0;
function earthHi(){if(earthHiSt||LOW)return;earthHiSt=1;const e=byId.earth,an=renderer.capabilities.getMaxAnisotropy();
 texL.load('data/tex/earth-4k.jpg',t=>{t.anisotropy=an;e.real.material.uniforms.map.value=t});
 texL.raw.load('data/tex/earth-clouds-4k.jpg',t=>{t.anisotropy=an;e.clouds.material.uniforms.map.value=t})}
function updateTiles(){const e=byId.earth,cl=e.clouds.material.uniforms.fade;TL.f++;
 if(look.view!=='real'||!e.obj.visible){TL.group.visible=false;cl.value=1;return}
 e.obj.updateMatrixWorld(true);TL.inv.copy(e.spin.matrixWorld).invert();TL.cam.copy(camera.position).applyMatrix4(TL.inv); // camera in Earth radii, body frame
 const d=TL.cam.length(),k=innerHeight/(2*Math.tan(camera.fov*D2R/2));
 cl.value=.3+.7*smst(.05,.5,d-1); // thin the clouds near the ground so the imagery shows through
 e.clouds.material.uniforms.detail.value=1-smst(.2,2,d-1);if(d<6)earthHi();
 // far away the built-in 2048 px map already gives a texel per pixel or better
 if(TL.baseRad/Math.max(d-1,1e-6)*k<=1.25){TL.group.visible=false;return}
 camera.updateMatrixWorld();TL.fr.setFromProjectionMatrix(TL.pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 TL.want.length=0;
 for(let y=0;y<5;y++)for(let x=0;x<10;x++){const t=tileAt(TL.z0,x,y);if(tileVis(t,d)&&tilePx(t,TL.baseRad,d,k)>1.25)tileVisit(t,d,k)}
 TL.group.visible=true;
 for(const t of TL.tiles.values())if(t.mesh)t.mesh.visible=t.drawn===TL.f;
 // coarse levels first, nearest first within a level
 TL.want.sort((a,b)=>a.z-b.z||a.c.distanceTo(TL.cam)-b.c.distanceTo(TL.cam));
 for(const t of TL.want){if(TL.busy>=TL.live)break;if(t.st!==1)tileLoad(t)}
 // keep GPU memory bounded: free the least recently used tiles
 const ready=[...TL.tiles.values()].filter(t=>t.st===2);
 if(ready.length>TL.keep)ready.filter(t=>t.used<TL.f).sort((a,b)=>a.used-b.used).slice(0,ready.length-TL.keep*.75).forEach(tileDrop)}

// gravity view: each world's sphere of influence, where its pull outweighs its parent's for orbit planning
const FS_SOI=`#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 color;varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
void main(){
#include <logdepthbuf_fragment>
 vec3 N=normalize(vN),V=normalize(cameraPosition-vP);float f=1.-abs(dot(N,V));gl_FragColor=vec4(color*(pow(f,4.)*.9+.04),1.);}`;
B.forEach(b=>{if(!b.soi||b.soi<b.R*1.3)return;const c=gravRGB(gravX(b.g));
 b.soiM=new THREE.Mesh(sphG,new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_SOI,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{color:{value:new THREE.Color(c[0]*.7,c[1]*.7,c[2]*.7)}}}));
 b.soiM.scale.setScalar(b.soi*KM);b.soiM.visible=false;b.soiM.renderOrder=1;scene.add(b.soiM)});
const HUE={sun:0xffcf6b,mercury:0xb3aca3,venus:0xf0c66e,earth:0x4f9cff,moon:0xc9c9d6,mars:0xff6a3d,jupiter:0xe8a764,saturn:0xf5d58a,uranus:0x7fe6ef,neptune:0x5a82ff,pluto:0xe0b58e};
const oc=new THREE.Color(),white=new THREE.Color(1,1,1);
function paintOrbit(x,f){if(!x.omat)return;const v=look.view;
 if(v==='wire'){x.omat.color.setHex(f?0x3dff8a:(x.parent?0x1a7a42:0x1f8f4c));return}
 if(v==='gravity')oc.setRGB(...gravRGB(gravX(x.g)));else if(v==='thermal'){const t=TEMP[x.id]||[-150,-200,10];oc.setRGB(...heatRGB(heatX((t[0]+t[1])/2)))}
 else oc.setHex(HUE[x.id]||(x.parent?0x8299b3:0x8fa8c4));
 if(f)oc.lerp(white,.35);else oc.multiplyScalar(x.parent?.62:.78);x.omat.color.copy(oc)}
const minus=n=>String(n).replace('-','\u2212');
const fmtG=g=>(g>=1?g.toPrecision(3):g>=.01?g.toPrecision(2):g.toPrecision(2))+' m/s\u00b2';
function fmtA(a){return a>=.1?a.toPrecision(3)+' m/s\u00b2':a>=1e-4?(a*1e3).toPrecision(3)+' mm/s\u00b2':(a*1e6).toPrecision(3)+' \u00b5m/s\u00b2'}
const LEG={thermal:{bar:'linear-gradient(90deg,'+HEATS.map((c,i)=>'rgb('+c.map(x=>Math.round(x*255))+') '+i*25+'%').join(',')+')',ticks:[-250,-150,-50,100,500].map(t=>[heatX(t),minus(t)]),
  note:'Surface temperature, \u00b0C. Day sides heat up, night sides and poles cool.'},
 gravity:{bar:'linear-gradient(90deg,'+GSTOP.map((c,i)=>'rgb('+c.map(x=>Math.round(x*255))+') '+i*25+'%').join(',')+')',ticks:[.01,.1,1,10,100].map(g=>[gravX(g),String(g)]),
  note:'Surface gravity, m/s\u00b2 (log scale), lowered at the equator by each world\u2019s spin. Glowing shells mark spheres of influence; the fabric shows the potential well.'}};
function setView(v){look.view=v;document.querySelectorAll('[data-view]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.view===v)));
 const wire=v==='wire',outline=v==='thermal'||v==='gravity';B.forEach(b=>{b.real.visible=!wire;b.wire.forEach(w=>w.visible=wire||(outline&&b.id==='earth'&&w.isLineSegments&&w.geometry!==b.spin.children[0].geometry));
  if(b.atmo)b.atmo.visible=v==='real';if(b.clouds)b.clouds.visible=v==='real';if(b.ringReal)b.ringReal.visible=!wire;if(b.soiM)b.soiM.visible=v==='gravity';
  const t=TEMP[b.id];b.lb.querySelector('em').textContent=v==='gravity'?fmtG(b.g):v==='thermal'&&t?(t[0]===t[1]?minus(t[0]):minus(t[1])+' to '+minus(t[0]))+' \u00b0C':''});
 sunB.glow.visible=v==='real';look.mats.forEach(m=>m.uniforms.mode.value=v==='thermal'?1:v==='gravity'?2:0);
 const L=LEG[v];$('#legend').hidden=!L;if(L){$('#legend .bar').style.background=L.bar;$('#lg-ticks').innerHTML=L.ticks.map(t=>'<span style="left:'+(t[0]*100).toFixed(1)+'%">'+t[1]+'</span>').join('');$('#lg-note').textContent=L.note}
 $('#lg-here').hidden=v!=='gravity';if(v==='gravity')updatePull();
 const fb=$('#l-fabric');if(v==='gravity'&&!fb.checked){fb.checked=true;fb.dispatchEvent(new Event('change'));look.autoFab=true}
 else if(v!=='gravity'&&look.autoFab){look.autoFab=false;if(fb.checked){fb.checked=false;fb.dispatchEvent(new Event('change'))}}
 shipLook(v);sky.glow.visible=v!=='wire'&&!!sky.glow.material.uniforms.map.value;
 B.forEach(x=>paintOrbit(x,x===focus));if(typeof XS!=='undefined')XS.forEach(starView);document.body.dataset.view=v}
// net gravitational pull at a point, summed over every body
const gA=new THREE.Vector3(),gD=new THREE.Vector3();
function pullAt(p){gA.set(0,0,0);let top=null,ta=0,phi=0;for(const b of ALL){if(!b.GM)continue;gD.subVectors(b.pos,p);const r=Math.max(gD.length()/KM,b.R),a=b.GM/(r*r)*1000;phi+=b.GM/r;gA.addScaledVector(gD.normalize(),a);if(a>ta){ta=a;top=b}}
 return {a:gA.length(),top,ta,ve:Math.sqrt(2*phi)}}
function herePoint(){return ship.on?ship.pos:w0.copy(camera.position).add(origin)}
function updatePull(){const p=pullAt(herePoint());
 $('#lg-here').innerHTML='<dt>Pull here</dt><dd>'+fmtA(p.a)+'</dd><dt>Strongest</dt><dd>'+p.top.name+' '+Math.round(Math.min(100,p.ta/p.a*100))+'%</dd><dt>Escape speed</dt><dd>'+p.ve.toPrecision(3)+' km/s</dd>'}
// eclipse occluders for each world: family members (parent, siblings, moons) lying sunward of it within reach of its shadow, nearest four
B.forEach(b=>{b.fam=B.filter(c=>c!==b&&c.kind!=='star'&&(c.parent===b.id||b.parent===c.id||(!!b.parent&&c.parent===b.parent)))});
const oL=new THREE.Vector3(),oR=new THREE.Vector3(),oN=new THREE.Vector3();
function pickOcc(b){const u=b.occU;if(!u)return;const P=b.obj.position;oL.subVectors(B[0].obj.position,P);const ds=oL.length();oL.divideScalar(ds);const hit=[];
 for(const c of b.fam){if(!c.obj.visible)continue;oR.subVectors(c.obj.position,P);const t=oR.dot(oL);if(t<=0)continue;
  if(oR.addScaledVector(oL,-t).length()<(c.R+b.R)*KM+695700*KM*t/ds)hit.push([t,c])}
 hit.sort((a,c)=>a[0]-c[0]);for(let i=0;i<4;i++){const c=hit[i]&&hit[i][1];if(c){u.occ.value[i].set(c.obj.position.x,c.obj.position.y,c.obj.position.z,c.R*KM);u.occA.value[i]=SCAT[c.id]?1:0}else u.occ.value[i].w=0}}
function updateLook(){const s=B[0].loc;for(const m of look.mats){m.uniforms.sunPos.value.copy(s);m.uniforms.lit.value=look.lit?1:0}
 for(const m of look.atm){m.uniforms.sunPos.value.copy(s);m.uniforms.lit.value=look.lit?1:0}
 for(const b of B){if(b.kind!=='star')pickOcc(b);b.sunEU.value=b.kind==='star'?1:Math.pow(AU/Math.max(b.pos.distanceTo(B[0].pos),1),2);
  if(b.atmo&&!SCAT[b.id]){const r=b.obj.position.distanceTo(camera.position)/(b.R*KM);b.atmo.material.uniforms.near.value=Math.min(1,Math.max(0,(r-1.5)/2.5))}
  // scattering shells: centre, and which faces to draw (back faces once the camera is inside the air)
  if(b.atmo&&SCAT[b.id]){const u=b.atmo.material.uniforms;u.pc.value.copy(b.obj.position);b.atmo.material.side=b.obj.position.distanceTo(camera.position)<b.R*KM*SCAT[b.id].Ra?THREE.BackSide:THREE.FrontSide}}
 const sat=byId.saturn;if(sat.ringReal){const u=sat.real.material.uniforms;u.ringC.value.copy(sat.obj.position);u.ringN.value.set(0,1,0).applyQuaternion(sat.obj.children[0].quaternion);
  const r=sat.ringReal.material.uniforms;r.sunPos.value.copy(s);r.lit.value=look.lit?1:0}
 if(byId.earth.clouds)byId.earth.clouds.rotation.y=(sim/864e5*.06)%TAU}

/* labels */
const labelsEl=$('#labels');
B.forEach(b=>{const el=document.createElement('button');el.className='lb '+b.kind;el.innerHTML='<i></i><span>'+b.name+'</span><em></em>';el.addEventListener('click',()=>pick(b));labelsEl.appendChild(el);b.lb=el});
site.forEach(s=>labelsEl.appendChild(s.lb));
const helioLb=document.createElement('div');helioLb.className='lb static';helioLb.innerHTML='<i></i><span>Heliopause, about 120 AU</span>';labelsEl.appendChild(helioLb);

/* fly list */
const list=$('#list');
B.forEach(b=>{const li=document.createElement('li');const bt=document.createElement('button');bt.textContent=b.name;bt.className=b.kind;bt.addEventListener('click',()=>pick(b));li.appendChild(bt);list.appendChild(li);b.li=bt});
$('#q').addEventListener('input',e=>filterList(e.target.value.trim().toLowerCase()));
$('#q').addEventListener('keydown',e=>{if(e.key==='Escape')e.target.blur();if(e.key!=='Enter')return;const v=e.target.value.trim().toLowerCase();if(!v)return;if(ship.on)e.target.blur(); // give the keys back to the ship
 
 const li=[...list.querySelectorAll('li')].find(l=>!l.classList.contains('hd')&&l.style.display!=='none');if(li){li.querySelector('button').click();return}
 const N=CAT.names.map(n=>n.toLowerCase());let i=N.indexOf(v);if(i<0){const k=xcFind(v);if(k>=0)i=xcPromote(k)}if(i<0)i=N.findIndex(n=>n.startsWith(v));if(i<0)i=N.findIndex(n=>n.includes(v));if(i>=0)pick(getStar(i))});

/* panels */
document.querySelectorAll('.panel').forEach(p=>{const bt=p.querySelector('.mn');const t=()=>{const m=p.classList.toggle('min');bt.textContent=m?'+':'–';bt.setAttribute('aria-expanded',String(!m));bt.setAttribute('aria-label',m?'Expand panel':'Minimize panel')};
 p.querySelector('header').addEventListener('click',()=>{t();
  // while flying, the ship panel and the info panel share the left edge, so opening one folds the other
  const o={'p-ship':'#p-info','p-info':'#p-ship'}[p.id];if(o&&document.body.classList.contains('flying')&&!p.classList.contains('min')&&!$(o).classList.contains('min'))$(o+' header').click()})});
if(innerWidth<640)['#p-fly','#p-layers','#p-info','#p-time'].forEach(s=>$(s+' header').click());

/* state */
let sim=Date.now(),playing=true;
const SPEEDS=[[-31557600,'−1 yr/s'],[-2629800,'−1 mo/s'],[-604800,'−1 wk/s'],[-86400,'−1 day/s'],[-3600,'−1 h/s'],[1,'real time'],[3600,'1 h/s'],[86400,'1 day/s'],[604800,'1 wk/s'],[2629800,'1 mo/s'],[31557600,'1 yr/s']];
let speed=SPEEDS[7][0];
$('#speed').addEventListener('input',e=>{const s=SPEEDS[+e.target.value];speed=s[0];$('#speedv').textContent=s[1]});
$('#play').addEventListener('click',e=>{playing=!playing;e.target.textContent=playing?'Pause':'Play';e.target.setAttribute('aria-pressed',String(playing))});
$('#now').addEventListener('click',()=>{sim=Date.now()});
const opt={fabric:false,time:true,solo:false,ride:true,orbits:true,labels:true,moons:true,helio:true,stars:true,sites:false,rel:true,probes:true,small:false,bloom:!LOW};
['fabric','time','solo','ride','orbits','labels','moons','helio','stars','sites','rel','probes','small','bloom'].forEach(k=>{const el=$('#l-'+k);el.checked=opt[k];el.addEventListener('change',()=>{opt[k]=el.checked;if(k==='stars')starsDirty=true;if(k==='fabric')$('#fabric-opts').hidden=!el.checked})});
// HDR target, bloom above white and tone mapping (src/render/hdr.js)
const hdr=createHDR(renderer,{low:LOW});
let warp=1;$('#warp').addEventListener('input',e=>warp=+e.target.value);

/* fly */
const origin=new THREE.Vector3();let focus=byId.sun,fly=null,tour=null;
function viewDist(b){return b.kind==='comet'?Math.max(b.R*KM*400,(b.act||0)*1.5e6*KM):b.R*KM*(b.kind==='star'?6:4.5)}
function flyTo(b,d1,dirO){
 const fromPt=origin.clone(),fromBody=fly?null:focus;
 const d0=camera.position.length();d1=d1||viewDist(b);
 const travel=fromPt.distanceTo(b.pos),mid=Math.sqrt(d0*d1);
 const bump=Math.max(0,Math.log(travel*1.15/mid));
 const dur=Math.min(4200,Math.max(1300,1300+260*Math.log(1+travel/Math.min(d0,d1))))*(matchMedia('(prefers-reduced-motion: reduce)').matches?.4:1);
 const dir=dirO?dirO.clone():camera.position.clone().normalize();if(!dirO&&Math.abs(dir.y)<.15){dir.y=.35;dir.normalize()}
 fly={fromBody:fromBody===b?null:fromBody,fromPt,to:b,t0:performance.now(),dur,l0:Math.log(d0),l1:Math.log(d1),bump,dir};
 controls.enabled=false;setFocusUI(b)}
function land(){focus=fly.to;fly=null;controls.minDistance=focus.R*KM*1.0006;controls.enabled=true;controls.update();if(tour)tour.next=performance.now()+3500}
function setFocusUI(b){ALL.forEach(x=>{if(x.li)x.li.setAttribute('aria-current',String(x===b));if(x.lb)x.lb.classList.toggle('cur',x===b)});$('#i-name').textContent=b.name;updateInfo(b);
 B.forEach(x=>{if(x.omat){paintOrbit(x,x===b);x.omat.opacity=x===b?1:.6}})}
const TOUR=['sun','mercury','venus','earth','moon','mars','phobos','jupiter','io','europa','saturn','titan','uranus','neptune','triton','pluto','charon'];
function stopTour(){tour=null;$('#tour').setAttribute('aria-pressed','false');$('#tour').textContent='Grand tour'}
$('#tour').addEventListener('click',()=>{if(tour){stopTour();return}tour={i:-1,next:0};$('#tour').setAttribute('aria-pressed','true');$('#tour').textContent='Stop tour'});
$('#overview').addEventListener('click',()=>{stopTour();go(byId.sun,6*AU)});
addEventListener('keydown',e=>{if(e.key==='Escape'){stopTour();if(ship.on&&ship.ap)apOff('Autopilot off')}});
// zoom works on height above the focused body in log space: steady at any range, faster the farther out, and it eases rather than jumps
const zm={t:null};
function zoomBy(f){if(ship.on&&ship.cam==='cockpit')return;if(ship.on&&ship.cam==='chase'){ship.chaseT=Math.min(ship.def.size*150,Math.max(ship.def.size*1.5,ship.chaseT*f));return}if(fly)return;
 if(ship.on){camera.position.setLength(Math.min(controls.maxDistance,Math.max(controls.minDistance,camera.position.length()*f)));controls.update();return}
 const R=focus.R*KM,lo=Math.log(controls.minDistance-R),hi=Math.log(controls.maxDistance-R);if(zm.t===null)zm.t=Math.log(Math.max(camera.position.length()-R,controls.minDistance-R));
 zm.t=Math.min(hi,Math.max(lo,zm.t+Math.log(f)))}
function zoomStep(dt){if(zm.t===null||fly||ship.on){zm.t=null;return}const R=focus.R*KM,cur=Math.log(Math.max(camera.position.length()-R,1e-12)),n=cur+(zm.t-cur)*Math.min(1,dt*9);
 camera.position.setLength(R+Math.exp(n));if(Math.abs(zm.t-n)<1e-3)zm.t=null}
$('#zin').addEventListener('click',()=>zoomBy(.6));$('#zout').addEventListener('click',()=>zoomBy(1/.6));

/* fabric */
let N=128,fab=null;
const fabMat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
let fabLine=null;
function buildFabric(n){N=n;const V=(N+1)*(N+1);const g=new THREE.BufferGeometry();
 const pa=new THREE.BufferAttribute(new Float32Array(V*3),3);pa.setUsage(THREE.DynamicDrawUsage);
 const ca=new THREE.BufferAttribute(new Float32Array(V*3),3);ca.setUsage(THREE.DynamicDrawUsage);
 g.setAttribute('position',pa);g.setAttribute('color',ca);
 const idx=new Uint32Array(N*(N+1)*4);let k=0;
 for(let j=0;j<=N;j++)for(let i=0;i<N;i++){idx[k++]=j*(N+1)+i;idx[k++]=j*(N+1)+i+1}
 for(let i=0;i<=N;i++)for(let j=0;j<N;j++){idx[k++]=j*(N+1)+i;idx[k++]=(j+1)*(N+1)+i}
 g.setIndex(new THREE.BufferAttribute(idx,1));
 if(fabLine){scene.remove(fabLine);fabLine.geometry.dispose()}
 fabLine=new THREE.LineSegments(g,fabMat);fabLine.frustumCulled=false;fabLine.renderOrder=2;scene.add(fabLine);
 fab={phi:new Float64Array(V),pmax:0,range:1,D:0,off:0}}
buildFabric(128);
$('#mesh').addEventListener('change',e=>buildFabric(+e.target.value));
let sx=new Float64Array(B.length),sz=new Float64Array(B.length),sg=new Float64Array(B.length),ss=new Float64Array(B.length),ns=0;
function phiAt(x,z){let p=0;for(let k=0;k<ns;k++){const dx=x-sx[k],dz=z-sz[k];p-=sg[k]/Math.sqrt(dx*dx+dz*dz+ss[k])}return p}
function heightAt(x,z){let h=(phiAt(x,z)-fab.pmax)/fab.range;if(h>0)h=0;return fab.D*h+fab.off}
let fk=0;const GLUT=new Float32Array(768);for(let i=0;i<256;i++)GLUT.set(gravRGB(i/255),i*3);
function updateFabric(dist,cur){
 const L=Math.pow(2,Math.ceil(Math.log2(dist*4.5))),half=L/2,cell=L/N;
 const src=opt.solo||cur.cat!==undefined||cur.kind==='probe'?[cur]:B;ns=0;
 for(const b of src){sx[ns]=b.loc.x;sz[ns]=b.loc.z;sg[ns]=b.GM;const s=Math.max(b.R*KM,cell*1.2);ss[ns]=s*s;ns++}
 const phi=fab.phi;let mn=Infinity,mx=-Infinity;
 for(let j=0;j<=N;j++){const z=-half+j*cell;for(let i=0;i<=N;i++){const x=-half+i*cell,p=phiAt(x,z);phi[j*(N+1)+i]=p;if(p<mn)mn=p;if(p>mx)mx=p}}
 fab.pmax=mx;fab.range=Math.max(1e-30,mx-mn);fab.D=warp*.6*dist;
 const c=(N/2)*(N+1)+N/2;fab.off=-cur.R*KM*1.02-fab.D*((phi[c]-mx)/fab.range);
 const P=fabLine.geometry.attributes.position.array,C=fabLine.geometry.attributes.color.array;
 for(let j=0;j<=N;j++){const z=-half+j*cell;for(let i=0;i<=N;i++){const x=-half+i*cell,v=j*(N+1)+i,h=(phi[v]-mx)/fab.range,o=v*3;
  P[o]=x;P[o+1]=fab.D*h+fab.off;P[o+2]=z;
  const rr=Math.sqrt(x*x+z*z)/half,f=Math.max(0,Math.min(1,(1-rr)/.35))*fk;
  let r,g,bb;if(look.view==='gravity'){const q=Math.min(255,Math.round((.12+.88*Math.pow(-h,.45))*255))*3;r=GLUT[q];g=GLUT[q+1];bb=GLUT[q+2]}else if(opt.time){const t=Math.pow(-h,.55);r=.04+.74*t;g=.32+.68*t;bb=.16+.66*t}else{r=.08;g=.55;bb=.28}
  C[o]=r*f;C[o+1]=g*f;C[o+2]=bb*f}}
 fabLine.geometry.attributes.position.needsUpdate=true;fabLine.geometry.attributes.color.needsUpdate=true}

/* labels + info */
const v3=new THREE.Vector3();
function behind(p){const c=cv.obj.position,r=cv.R*KM;w3a.subVectors(p,camera.position);const L=w3a.length();w3a.divideScalar(L);v3.subVectors(c,camera.position);const t=v3.dot(w3a);
 return t>0&&t<L&&v3.lengthSq()-t*t<r*r} // the focused body is in the way
let cv=null;
// labels hide behind any world that covers more than a couple of pixels, not only the one in focus
const OCCL=[],v3h=new THREE.Vector3();
function buildOccluders(H,th){OCCL.length=0;for(const b of B){if(!b.obj.visible)continue;const d=b.obj.position.distanceTo(camera.position),r=b.R*KM;if(d>r&&r/(d*th)*H/2>1.5)OCCL.push(b)}}
function hiddenBy(p,self){w3a.subVectors(p,camera.position);const L=w3a.length();w3a.divideScalar(L);
 for(const b of OCCL){if(b===self)continue;v3h.subVectors(b.obj.position,camera.position);const t=v3h.dot(w3a);if(t<=0||t>=L)continue;const r=b.R*KM;if(v3h.lengthSq()-t*t<r*r*.98)return true}
 return false}
function updateLabels(){const W=innerWidth,H=innerHeight,th=Math.tan(camera.fov*D2R/2);cv=fly?fly.to:focus;buildOccluders(H,th);const far=w0.copy(camera.position).add(origin).length()>3e8;
 for(const b of B){const el=b.lb;let show=opt.labels||b===focus;if(show&&far&&b!==focus&&b.id!=='sun')show=false;
  if(show&&b.parent){if(!opt.moons)show=b===focus;else{const pd=camera.position.distanceTo(byId[b.parent].obj.position);if(pd>b.a*KM*60&&b!==focus)show=false}}
  if(show){v3.copy(b.obj.position);const dc=v3.distanceTo(camera.position);v3.project(camera);
   if(v3.z>1)show=false;else{const x=(v3.x+1)/2*W,y=(1-v3.y)/2*H,pr=b.R*KM/(dc*th)*H/2;
    if(hiddenBy(b.obj.position,b))show=false;
    // dwarf planets only when near or large on screen, so the view isn't a field of names
    if(b.kind==='dwarf'&&b!==focus&&!(ship.on&&ship.target===b)&&pr<1.5&&dc>.5*AU)show=false;
    if(pr>Math.min(W,H)*.42)show=false;else{const big=pr>3;el.classList.toggle('big',big);el.style.transform='translate('+(x+(big?pr+4:0)).toFixed(1)+'px,'+y.toFixed(1)+'px)'}}}
  el.classList.toggle('off',!show)}
 updateSiteLabels(W,H,th);updateStarLabels(W,H);updateProbeLabels(W,H,far);updateCometLabels(W,H,far);
 let hs=opt.helio&&opt.labels&&!far;if(hs){v3.set(120*AU,0,0).sub(origin);v3.project(camera);if(v3.z>1)hs=false;else helioLb.style.transform='translate('+((v3.x+1)/2*W).toFixed(1)+'px,'+((1-v3.y)/2*H).toFixed(1)+'px)'}
 helioLb.classList.toggle('off',!hs)}
function updateSiteLabels(W,H,th){for(const s of site){const b=s.b;let show=opt.sites&&b.obj.visible;
 if(show){const dc=b.obj.position.distanceTo(camera.position),pr=b.R*KM/(dc*th)*H/2;show=pr>180||(curSite===s&&pr>40)}
 if(show){sv.copy(s.loc).applyMatrix4(b.spin.matrixWorld);v3.subVectors(sv,b.obj.position);w3a.subVectors(camera.position,sv);show=v3.dot(w3a)>0;
  if(show){sv.project(camera);if(sv.z>1||Math.abs(sv.x)>1.05||Math.abs(sv.y)>1.05)show=false;else s.lb.style.transform='translate('+((sv.x+1)/2*W).toFixed(1)+'px,'+((1-sv.y)/2*H).toFixed(1)+'px)'}}
 s.lb.classList.toggle('off',!show);s.lb.classList.toggle('cur',curSite===s)}}
const w3a=new THREE.Vector3();
function sci(x){const e=Math.floor(Math.log10(x));return (x/Math.pow(10,e)).toFixed(2)+' × 10<sup>'+e+'</sup>'}
function dist(km){if(km<1)return (km*1000).toPrecision(3)+' m';if(km>=4.7e11){const l=km/9.4607304725808e12;return (l<10?l.toFixed(3):l<1000?l.toFixed(2):Math.round(l).toLocaleString('en-US'))+' ly'}if(km<2e6)return Math.round(km).toLocaleString('en-US')+' km';return (km/149597870.7).toFixed(km<1.5e9?3:2)+' AU'}
function len(km){if(km<1e-3)return (km*1e6).toPrecision(3)+' mm';if(km<1)return (km*1e3).toPrecision(3)+' m';return km.toPrecision(3)+' km'}
function lag(s){if(s<1e-3)return (s*1e6).toPrecision(3)+' µs/day';if(s<1)return (s*1e3).toPrecision(3)+' ms/day';return s.toPrecision(3)+' s/day'}
function updateInfo(b){b=b||(fly?fly.to:focus);if(b.cat!==undefined)return starInfo(b);if(b.kind==='probe')return probeInfo(b);if(b.kind==='comet')return cometInfo(b);
 const g=b.GM/(b.R*b.R)*1000,ve=Math.sqrt(2*b.GM/b.R),rs=2*b.GM/(CKM*CKM),cl=b.GM/(b.R*CKM*CKM)*86400;
 let per='';if(b.el){const d=Math.pow(b.el[0],1.5)*365.256;per=d>730?(d/365.256).toFixed(1)+' yr':d.toFixed(1)+' days'}else if(b.parent)per=Math.abs(b.P).toFixed(2)+' days'+(b.P<0?' (retro)':'');
 const alt=fly?null:((ship.on?ship.pos:w0.copy(camera.position).add(origin)).distanceTo(b.pos)-b.R*KM)/KM;
 const rows=[['Type',{star:'Star',planet:'Planet',moon:'Moon of '+(b.parent?byId[b.parent].name:''),dwarf:'Dwarf planet'}[b.kind]],['Radius',Math.round(b.R).toLocaleString('en-US')+' km'],['Mass',sci(b.GM/G)+' kg'],['Gravity',g.toPrecision(3)+' m/s²'],['Escape v',ve.toPrecision(3)+' km/s']];
 if(per)rows.push(['Orbit',per]);if(b.soi)rows.push(['Gravity reach',dist(b.soi)]);if(b.id!=='sun')rows.push(['From Sun',dist(b.pos.length()/KM)]);
 {const tp=TEMP[b.id];if(tp)rows.push(['Surface temp',tp[0]===tp[1]?tp[0]+' °C':tp[1]+' to '+tp[0]+' °C'])}
 rows.push(['Event horizon',len(rs)+' if collapsed'],['Clock lag',lag(cl)]);if(alt!==null)rows.push([ship.on?'Ship alt':'Camera alt',dist(Math.max(0,alt))]);
 $('#i-dl').innerHTML=rows.map(r=>'<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>').join('')}

function starInfo(b){const ph=b.ph,dPc=starDistPc(b.cat),ly=dPc*3.26156,app=CAT.M[b.cat]+5*Math.log10(dPc)-5,e=ph.est?' (est.)':'',big=x=>x<10?x.toPrecision(3):Math.round(x).toLocaleString('en-US');
 const rows=[['Type','Star'+(CAT.spect[b.cat]?', '+CAT.spect[b.cat]:'')],['From Sun',(ly<100?ly.toFixed(2):Math.round(ly).toLocaleString('en-US'))+' ly'],['From Earth','mag '+app.toFixed(2)],
  ['Temperature',Math.round(ph.T).toLocaleString('en-US')+' K'+e],['Radius',big(ph.R)+' R☉'+e],['Luminosity',big(ph.L)+' L☉'+e],['Mass',ph.m.toPrecision(3)+' M☉'+e],
  ['Gravity',fmtG(b.g)],['Escape v',Math.sqrt(2*b.GM/b.R).toPrecision(3)+' km/s'],['Light to Earth',fmtDur(b.pos.distanceTo(byId.earth.pos)/(CKM*KM))],
  [ship.on?'Ship dist':'Camera dist',dist(Math.max(0,herePoint().distanceTo(b.pos)/KM-b.R))]];
 $('#i-dl').innerHTML=rows.map(r=>'<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>').join('')}
function probeInfo(b){const rows=[['Type','Spacecraft'],['Launched',b.launch],['Speed',b.v+' km/s from Sun'],['From Sun',dist(b.pos.length()/KM)],['Signal to Earth',fmtDur(b.pos.distanceTo(byId.earth.pos)/(CKM*KM))],
  ['Position','Modelled, approx.'],[ship.on?'Ship dist':'Camera dist',dist(herePoint().distanceTo(b.pos)/KM)]];
 $('#i-dl').innerHTML=rows.map(r=>'<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>').join('')}

/* positions */
const qInv=new THREE.Quaternion(),wq=new THREE.Vector3();
function setLine(b,fill){const A=b.orbit.geometry.attributes.position;for(let k=0;k<=(b.parent?128:360);k++){fill(k);b.obase[k*3]=tmp.x;b.obase[k*3+1]=tmp.y;b.obase[k*3+2]=tmp.z;A.array[k*3]=tmp.x;A.array[k*3+1]=tmp.y;A.array[k*3+2]=tmp.z}A.needsUpdate=true}
function planetOrbit(b,T){const [a,e,I,,w,O]=planetEl(b,T);b.oT=T;setLine(b,k=>ell(a,e,I*D2R,O*D2R,(w-O)*D2R,k/360*TAU,tmp))}
function moonOrbit(b,O){b.lO=O;setLine(b,k=>moonVec(b,O,k/128*TAU,tmp))}
function updatePositions(){const days=(sim-J2000)/864e5,T=days/36525;
 for(const b of B){if(b.el){planetPos(b,T,b.pos);if(Math.abs(T-b.oT)>.1)planetOrbit(b,T)}else if(!b.parent)b.pos.set(0,0,0)}
 for(const b of B)if(b.parent){if(b.id==='moon')moonPos(T,tmp);else if(b.fr){const st=moonState(b,days);if(Math.abs(st.O-b.lO)>.004)moonOrbit(b,st.O);moonVec(b,st.O,st.u,tmp)}
  else{const th=TAU*days/b.P;tmp.set(Math.cos(th)*b.a*KM,0,-Math.sin(th)*b.a*KM).applyQuaternion(b.q)}
  if(!POLE[b.id]){wq.copy(tmp).applyQuaternion(qInv.copy(byId[b.parent].eq).invert());b.th=Math.atan2(-wq.z,wq.x)}
  b.pos.copy(byId[b.parent].pos).add(tmp)}
 for(const b of B){const P=POLE[b.id];b.spin.rotation.y=P?((P[2]+P[3]*days)%360)*D2R:b.parent?b.th+Math.PI:TAU*((days*24/b.rot)%1)}
 const mo=byId.moon;if(Math.abs(moonNode(T)-mo.node)>.5)setMoonOrbit(T);if(typeof probePos==='function')probePos();if(typeof cometPos==='function')cometPos()}
function setMoonOrbit(T){const b=byId.moon;b.node=moonNode(T);b.q=moonPlane(T);const a=b.orbit.geometry.attributes.position;
 for(let k=0;k<=128;k++){const t=k/128*TAU;tmp.set(Math.cos(t)*b.a*KM,0,-Math.sin(t)*b.a*KM).applyQuaternion(b.q);b.obase[k*3]=tmp.x;b.obase[k*3+1]=tmp.y;b.obase[k*3+2]=tmp.z;a.array[k*3]=tmp.x;a.array[k*3+1]=tmp.y;a.array[k*3+2]=tmp.z}
 a.needsUpdate=true}
byId.moon.node=moonNode((Date.now()-J2000)/864e5/36525);
function moonVisible(b){return opt.moons&&camera.position.distanceTo(byId[b.parent].loc)<b.a*KM*60}
function placeOrbit(b,ride){if(!b.orbit)return;
 let vis=opt.orbits&&(!b.parent||moonVisible(b)||b===focus);
 if(vis&&ship.on&&b!==ship.target)vis=false;
 if(vis){const d=b.obj.position.distanceTo(camera.position);if(b.R*KM/(d*Math.tan(camera.fov*D2R/2))*innerHeight/2>30)vis=false} // big on screen: its own orbit would run through it
 b.orbit.visible=vis;if(!vis)return;
 const op=b.parent?byId[b.parent].loc:B[0].loc;b.orbit.position.copy(op);
 const A=b.orbit.geometry.attributes.position,a=A.array,base=b.obase;
 if(ride>0){for(let k=0;k<a.length;k+=3){const by=base[k+1],ty=heightAt(base[k]+op.x,base[k+2]+op.z)-op.y;a[k]=base[k];a[k+1]=by+(ty-by)*ride;a[k+2]=base[k+2]}A.needsUpdate=true;b.dirty=true}
 else if(b.dirty){for(let k=0;k<a.length;k++)a[k]=base[k];A.needsUpdate=true;b.dirty=false}}

// star catalog from data/: stars.bin holds 5 float32 per star (x, y, z in parsecs on the ICRF equator, absolute magnitude, B-V); stars.json the names, spectral types and which stars have proper names
const [STAR_BUF,STAR_META]=await STAR_DATA;
/* real stars: HYG 3.8 catalog (Hipparcos, Yale Bright Star, Gliese). Every naked-eye star plus everything within 20 light-years, at its real 3D position */
const PC=3.0856775814913673e10,LY=9.4607304725808e9; // scene units, 1 unit = 1,000 km
function teff(bv){return 4600*(1/(.92*bv+1.7)+1/(.92*bv+.62))} // Ballesteros (2012)
function bolc(T){const x=Math.log10(T),c=x<3.7?[-.190537291496456e5,.155144866764412e5,-.421278819301717e4,.381476328422343e3]:x<3.9?[-.370510203809015e5,.385672629965804e5,-.150651486316025e5,.261724637119416e4,-.170623810323864e3]:[-.118115450538963e6,.137145973583929e6,-.636233812100225e5,.147412923562646e5,-.170587278406872e4,.788731721804990e2];
 let s=0;for(let k=c.length-1;k>=0;k--)s=s*x+c[k];return s} // bolometric correction, Torres (2010)
function bbRGB(T){const t=T/100;let r,g,b;if(t<=66){r=255;g=99.4708025861*Math.log(t)-161.1195681661;b=t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307}
 else{r=329.698727446*Math.pow(t-60,-.1332047592);g=288.1221695283*Math.pow(t-60,-.0755148492);b=255}const c=x=>Math.min(1,Math.max(0,x/255));return [c(r),c(g),c(b)]}
// measured values for well-studied stars: [radius R☉, mass M☉, temperature K]; everything else is estimated from colour and brightness
const STAR_OVR={'Proxima Centauri':[.1542,.1221,3042],'Rigil Kentaurus':[1.2234,1.0788,5790],'Toliman':[.8632,.9092,5260],"Barnard's Star":[.187,.162,3195],'Wolf 359':[.144,.11,2749],
 'Sirius':[1.711,2.063,9940],'Sirius B':[.0084,1.018,25000],'Vega':[2.36,2.135,9602],'Betelgeuse':[764,18,3600],'Rigel':[78.9,21,12100],'Polaris':[37.5,5.4,6015],'Arcturus':[25.4,1.08,4286],
 'Aldebaran':[44.2,1.16,3910],'Antares':[680,12,3660],'Canopus':[71,8,7400],'Altair':[1.79,1.86,7550],'Deneb':[203,19,8525],'Procyon':[2.048,1.499,6530],'Spica':[7.47,11.43,25300],
 'Tau Ceti':[.793,.783,5344],'Ran':[.735,.82,5084],'Fomalhaut':[1.84,1.92,8590],'Capella':[11.98,2.57,4970],'Pollux':[9.06,1.91,4586],'Regulus':[4.35,3.8,12460]};
const STAR_ALIAS={'τ Cet':'Tau Ceti','Gliese 244B':'Sirius B','Gliese 65A':'Luyten 726-8 A','Gliese 65B':'Luyten 726-8 B (UV Ceti)'};
const CAT=(()=>{
 const f=new Float32Array(STAR_BUF),n=f.length/5,names=STAR_META.names.split('|').map(s=>STAR_ALIAS[s]||s),spect=STAR_META.spect.split('|');
 const X=n+1+64,pos=new Float64Array(X*3),M=new Float32Array(X),ci=new Float32Array(X),RU=new Float64Array(X),proper=new Uint8Array(X),v=new THREE.Vector3();
 for(let i=0;i<n;i++){eqToScene(f[i*5],f[i*5+1],f[i*5+2],v).multiplyScalar(PC);pos[i*3]=v.x;pos[i*3+1]=v.y;pos[i*3+2]=v.z;M[i]=f[i*5+3];ci[i]=f[i*5+4]}
 M[n]=4.83;ci[n]=.656;names.push('Sun');spect.push('G2V');STAR_META.proper.forEach(i=>proper[i]=1);
 const C={n:n+1,sun:n,nx:n+1,cap:X,pos,M,ci,names,spect,proper,RU}; // slots past n hold faint stars promoted from the GPU layer when you pick one
 for(let i=0;i<C.n;i++)RU[i]=starPhys(i,C).R*695700*KM;return C})();
function starPhys(i,C){C=C||CAT;const o=STAR_OVR[C.names[i]];if(i===C.sun)return {T:5772,R:1,m:1,L:1,est:false};
 if(o)return {T:o[2],R:o[0],m:o[1],L:o[0]*o[0]*Math.pow(o[2]/5772,4),est:false};
 const T=teff(C.ci[i]),L=Math.pow(10,-.4*(C.M[i]+bolc(T)-4.74)),R=Math.sqrt(L)*Math.pow(5772/T,2),sp=C.spect[i]||'';
 return {T,R,L,m:sp[0]==='D'?.6:Math.min(60,Math.max(.08,Math.pow(L,1/3.5))),est:true}}
function starDistPc(i){const p=CAT.pos;return Math.hypot(p[i*3],p[i*3+1],p[i*3+2])/PC}
/* sky: Milky Way glow and stars on the real galactic plane, with relativistic aberration at speed */
// relativistic aberration and Doppler shift at ship speed: one set of uniforms and GLSL shared by the sky photo and every star layer, so they never drift apart
const AB={beta:{value:0},vdir:{value:new THREE.Vector3(0,0,-1)},sg:{value:1}}; // sg: star and sky gain, which follows the exposure only part way so the sky never blows out
const GLSL_ABERR=`uniform float beta;uniform vec3 vdir;
vec3 aberr(vec3 d,out float D){float ct=dot(d,vdir),cp=(ct+beta)/(1.+beta*ct);vec3 pp=d-ct*vdir;float pl=length(pp);D=sqrt(1.-beta*beta)/(1.-beta*cp);return pl>1e-6?pp/pl*sqrt(max(0.,1.-cp*cp))+vdir*cp:d;}`;
const GLSL_DOP=`vec3 doppler(vec3 c,float D){c*=clamp(pow(D,1.4),.05,5.);c=mix(c,c*vec3(.55,.75,1.5),clamp(D-1.,0.,1.)*.7);return mix(c,c*vec3(1.5,.6,.35),clamp(1.-D,0.,1.)*.8);}`;
const sky=(()=>{const gp=[192.85948*D2R,27.12825*D2R],gc=[266.4051*D2R,-28.93617*D2R],eqv=(a,d)=>new THREE.Vector3(Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d));
 const Zg=eqv(gp[0],gp[1]),Xg0=eqv(gc[0],gc[1]),Yg=new THREE.Vector3().crossVectors(Zg,Xg0).normalize(),Xg=new THREE.Vector3().crossVectors(Yg,Zg);
 const toS=v=>eqToScene(v.x,v.y,v.z,new THREE.Vector3()),SX=toS(Xg),SY=toS(Yg),SZ=toS(Zg);
 const gal=(l,b,out)=>out.set(0,0,0).addScaledVector(SX,Math.cos(b)*Math.cos(l)).addScaledVector(SY,Math.cos(b)*Math.sin(l)).addScaledVector(SZ,Math.sin(b));
 // the Milky Way: an all-sky photo (Solar System Scope, CC BY 4.0) in galactic coordinates, looked up per pixel so there is no seam.
 // In that image galactic longitude runs right to left from the centre and south is up; a painted glow (longitude left to right, north up) stands in if it cannot load.
 const glowMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{...AB,map:{value:null},flip:{value:new THREE.Vector2(-1,-1)},gain:{value:1},black:{value:0},gx:{value:SX},gy:{value:SY},gz:{value:SZ}},
  vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
${GLSL_ABERR}
varying vec3 vD;varying float vDop;
void main(){vec3 d=normalize(position);float D;vec3 dp=aberr(d,D);vD=d;vDop=D;gl_Position=projectionMatrix*modelViewMatrix*vec4(dp*4e8,1.);
#include <logdepthbuf_vertex>
}`,
  fragmentShader:`#include <common>
uniform float sg;
#include <logdepthbuf_pars_fragment>
${GLSL_DOP}
uniform sampler2D map;uniform vec2 flip;uniform float gain,black;uniform vec3 gx,gy,gz;varying vec3 vD;varying float vDop;
void main(){
#include <logdepthbuf_fragment>
 vec3 d=normalize(vD);float l=atan(dot(d,gy),dot(d,gx)),b=asin(clamp(dot(d,gz),-1.,1.));
 vec3 c=max(texture2D(map,vec2(.5+flip.x*l/6.2831853,.5+flip.y*b/3.1415927)).rgb-black,0.)*gain;gl_FragColor=vec4(doppler(c,vDop)*sg,1.);}`});
 const glow=new THREE.Mesh(new THREE.SphereGeometry(1,96,48),glowMat);glow.renderOrder=-2;glow.frustumCulled=false;scene.add(glow);glow.visible=false;
 const skyTex=t=>{t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.wrapS=THREE.RepeatWrapping;glowMat.uniforms.map.value=t};
 setTimeout(()=>texL.load('data/tex/milkyway-4k.jpg',t=>{skyTex(t);glowMat.uniforms.gain.value=1.5;glowMat.uniforms.black.value=.01},undefined,paintGlow),300);
 function paintGlow(){const cv=document.createElement('canvas');cv.width=1024;cv.height=512;const cx=cv.getContext('2d'),im=cx.createImageData(1024,512),d=im.data;
  for(let j=0;j<512;j++){const b=(.5-(j+.5)/512)*Math.PI,cb=Math.cos(b),sb=Math.sin(b);for(let i=0;i<1024;i++){let l=((i+.5)/1024-.5)*TAU;
   const x=cb*Math.cos(l),y=cb*Math.sin(l),bd=b/D2R,ld=l/D2R,sg=6+7*Math.exp(-((ld/28)**2)),core=Math.exp(-((bd/sg)**2))*(.35+.65*Math.exp(-((ld/55)**2)));
   const n=fbm(x*5,y*5,sb*5,301,5),rift=1-.75*smst(.45,.7,n)*Math.exp(-((bd/3.5)**2))*Math.exp(-((ld/70)**2)),I=core*rift*(.65+.7*fbm(x*12,y*12,sb*12,303,3))*.32+.012;
   const w=Math.exp(-((ld/40)**2)),o=(j*1024+i)*4;d[o]=I*(190+65*w);d[o+1]=I*(200+35*w);d[o+2]=I*(255-50*w);d[o+3]=255}}
  cx.putImageData(im,0,0);glowMat.uniforms.flip.value.set(1,1);skyTex(canvasTex(cv))}
 // stars: the real catalog. Each frame they are placed by their direction from wherever the camera is, so the sky changes as you travel
 const n=CAT.n,p=new Float32Array(n*3),t=new Float32Array(n*3),sz=new Float32Array(n),col=new Float32Array(n*3);
 for(let i=0;i<n;i++){const c=bbRGB(starPhys(i).T),l=(c[0]+c[1]+c[2])/3,k=[0,1,2].map(j=>l+(c[j]-l)*.8),mx=Math.max(...k);col.set(k.map(x=>x/mx),i*3);p.set([0,0,-1],i*3)}
 const g=new THREE.BufferGeometry();const pa=new THREE.BufferAttribute(p,3),ta=new THREE.BufferAttribute(t,3),sa=new THREE.BufferAttribute(sz,1);
 [pa,ta,sa].forEach(a=>a.setUsage(THREE.DynamicDrawUsage));g.setAttribute('position',pa);g.setAttribute('tint',ta);g.setAttribute('sz',sa);
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{...AB,px:{value:2.2*Math.min(window.devicePixelRatio||1,2)}},
  vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
${GLSL_ABERR}
${GLSL_DOP}
uniform float px;attribute vec3 tint;attribute float sz;varying vec3 vC;
void main(){vec3 d=normalize(position);float D;vec3 dp=aberr(d,D);vec3 c=doppler(tint,D);
 vC=c;gl_Position=projectionMatrix*modelViewMatrix*vec4(dp*5e8,1.);gl_PointSize=px*sz*clamp(.9+(D-1.)*.35,.6,3.);if(dot(c,c)<1e-6)gl_PointSize=0.;
#include <logdepthbuf_vertex>
}`,
  fragmentShader:`#include <common>
uniform float sg;
#include <logdepthbuf_pars_fragment>
varying vec3 vC;void main(){
#include <logdepthbuf_fragment>
 float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(vC*(1.-r*1.7)*sg,1.);}`});
 const pts=new THREE.Points(g,mat);pts.frustumCulled=false;pts.renderOrder=-1;scene.add(pts);
 return {glow,pts,mat,p,t,sz,col,pa,ta,sa}})();
function updateSky(){const on=opt.stars;sky.pts.visible=on;sky.glow.visible=on&&look.view!=='wire'&&!!sky.glow.material.uniforms.map.value;sky.pts.position.copy(camera.position);sky.glow.position.copy(camera.position);
 const k=ship.on&&opt.rel&&ship.mode!=='free'?ship.v/(CKM*KM):0,beta=Math.min(.985,k*.9);sky.mat.uniforms.beta.value=beta;if(ship.on)sky.mat.uniforms.vdir.value.copy(ship.mv);}

/* ships */
const V3=THREE.Vector3,w0=new V3(),w3=new V3(),sdir=new V3(),fwd=new V3(),up=new V3(),ZERO=new V3(),tgt=new V3();
const qd=new THREE.Quaternion(),tq=new THREE.Quaternion(),cq=new THREE.Quaternion(),eul=new THREE.Euler(),m4=new THREE.Matrix4();
const shipScene=new THREE.Scene(),shipCam=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,1e-9,1);
const shipLine=new THREE.LineBasicMaterial({color:0x3dff8a});
const shipOcc=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
const shipMetal=new THREE.MeshStandardMaterial({color:0x9aa3ad,metalness:.2,roughness:.55,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}),shipMeshes=[];
const sunL=new THREE.DirectionalLight(0xfff4e0,1.25),shipAmb=new THREE.AmbientLight(0x6f86a8,.05);shipScene.add(sunL,shipAmb);
function shipLook(v){const w=v==='wire';shipMeshes.forEach(m=>m.material=w?shipOcc:shipMetal);shipLine.color.setHex(w?0x3dff8a:0x2a3138)}
const plumeM=new THREE.MeshBasicMaterial({color:0x9fdcff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
const fore=g=>g.rotateX(-Math.PI/2);
function part(p,geo,o){o=o||{};const g=new THREE.Group();const mm=new THREE.Mesh(geo,look.view==='wire'?shipOcc:shipMetal);shipMeshes.push(mm);g.add(mm);g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo,o.th||14),shipLine));
 if(o.p)g.position.set(o.p[0],o.p[1],o.p[2]);if(o.r)g.rotation.set(o.r[0],o.r[1],o.r[2]);p.add(g);return g}
function seg(p,pts){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));p.add(new THREE.LineSegments(g,shipLine))}
function dish(r,depth,n){const pr=[];for(let k=0;k<=8;k++){const x=r*(.04+.96*k/8);pr.push(new THREE.Vector2(x,depth*x*x/(r*r)))}return fore(new THREE.LatheGeometry(pr,n||20))}
function struts(p,r,z0,z1){const a=[];for(let k=0;k<3;k++){const t=k*TAU/3+.5;a.push(Math.cos(t)*r,Math.sin(t)*r,z0,0,0,z1)}seg(p,a)}
const SHIPS=[
{id:'voyager',kind:'real',name:'Voyager 1',fact:'Launched 1977. Now cruising at about 17 km/s, the farthest human-made object.',build(g){
 part(g,dish(1.83,.42,24));struts(g,1.7,-.4,-1.2);part(g,new THREE.CylinderGeometry(.14,.14,.12,8).rotateX(Math.PI/2),{p:[0,0,-1.25]});
 part(g,new THREE.CylinderGeometry(.89,.89,.47,10).rotateX(Math.PI/2),{p:[0,0,.26]});
 seg(g,[.8,0,.3,3.1,0,.75]);part(g,new THREE.BoxGeometry(.5,.45,.55),{p:[3.35,0,.8]});
 seg(g,[-.8,0,.3,-3,0,.6]);for(let k=0;k<3;k++)part(g,new THREE.CylinderGeometry(.2,.2,.5,8).rotateZ(Math.PI/2),{p:[-1.6-k*.55,0,.42+k*.06]});
 seg(g,[0,.7,.45,-1.6,10.5,5.5])}},
{id:'apollo',kind:'real',name:'Apollo CSM',fact:'Command and service module. Apollo 10’s crew reached 11.08 km/s, the fastest humans have flown.',build(g){
 part(g,fore(new THREE.CylinderGeometry(.2,1.95,3.2,16)),{p:[0,0,-1.6]});part(g,fore(new THREE.CylinderGeometry(1.96,1.96,7.5,16)),{p:[0,0,3.75]});
 part(g,fore(new THREE.CylinderGeometry(.55,1.95,3.9,16,1,true)),{p:[0,0,9.45]});
 for(let k=0;k<4;k++){const a=k*TAU/4+TAU/8;part(g,new THREE.BoxGeometry(.3,.3,.7),{p:[Math.cos(a)*2.15,Math.sin(a)*2.15,1.4]})}
 seg(g,[0,-1.96,6.6,0,-3.3,8.1]);part(g,dish(.8,.22,12),{p:[0,-3.5,8.3]});g.userData.pl=[[1.5,9,[0,0,11.4]]]}},
{id:'newhorizons',kind:'real',name:'New Horizons',fact:'Left Earth at 16.26 km/s in 2006, the fastest launch ever, and flew past Pluto in 2015.',build(g){
 part(g,fore(new THREE.CylinderGeometry(1.25,1.25,.7,3)),{p:[0,0,.35]});part(g,dish(1.05,.28,20));struts(g,.95,-.27,-.8);
 seg(g,[.9,-.2,.5,1.2,-.4,.5]);part(g,new THREE.CylinderGeometry(.21,.21,1.1,10).rotateZ(Math.PI/2),{p:[1.75,-.4,.5]});part(g,new THREE.BoxGeometry(.5,.35,.4),{p:[-.7,-.6,.55]})}},
{id:'cassini',kind:'real',name:'Cassini',fact:'Orbited Saturn from 2004 to 2017 and carried ESA’s Huygens probe down to Titan.',build(g){
 part(g,dish(2,.55,24));struts(g,1.9,-.5,-1.15);part(g,new THREE.CylinderGeometry(.12,.12,.15,8).rotateX(Math.PI/2),{p:[0,0,-1.2]});
 part(g,fore(new THREE.CylinderGeometry(1,1,1.3,10)),{p:[0,0,1]});part(g,fore(new THREE.CylinderGeometry(1.25,1.25,3.2,12)),{p:[0,0,3.3]});
 part(g,fore(new THREE.CylinderGeometry(.3,.62,1.1,10)),{p:[0,0,5.45]});
 part(g,new THREE.CylinderGeometry(.45,1.35,.55,18).rotateZ(Math.PI/2),{p:[1.6,0,3.1]});
 for(const a of[2.1,3.3,4.5]){part(g,fore(new THREE.CylinderGeometry(.22,.22,1.1,8)),{p:[Math.cos(a)*1.85,Math.sin(a)*1.85,4.4]});seg(g,[Math.cos(a)*1.2,Math.sin(a)*1.2,4.4,Math.cos(a)*1.75,Math.sin(a)*1.75,4.4])}
 seg(g,[0,1,1.1,0,11,1.4]);g.userData.pl=[[.45,3,[0,0,6]]]}},
{id:'parker',kind:'real',name:'Parker Solar Probe',fact:'Passed 6.1 million km from the Sun’s surface on 24 December 2024 at about 192 km/s, the fastest object humans have built.',build(g){
 part(g,fore(new THREE.CylinderGeometry(1.15,1.15,.115,28)),{p:[0,0,-1.45]});
 const tr=[];for(let k=0;k<6;k++){const a=k*TAU/6;tr.push(Math.cos(a)*.95,Math.sin(a)*.95,-1.38,Math.cos(a)*.62,Math.sin(a)*.62,-.62)}seg(g,tr);
 part(g,fore(new THREE.CylinderGeometry(.7,.7,1.4,6)),{p:[0,0,.1]});
 for(const s of[-1,1]){part(g,new THREE.BoxGeometry(.95,.03,.55),{p:[s*1.25,0,.25]});seg(g,[s*.7,0,.25,s*.78,0,.25])}
 part(g,dish(.3,.1,12),{p:[0,-.85,.5]});seg(g,[0,.7,.2,0,2.6,1.5])}},
{id:'kestrel',kind:'tgo',name:'TGO Kestrel',fact:'TGO original. A 23 m two-seat interceptor built for fast hops between worlds.',build(g){
 part(g,fore(new THREE.CylinderGeometry(.12,1.5,14,8)),{p:[0,0,-4]});part(g,new THREE.BoxGeometry(3.4,1.7,8),{p:[0,0,7]});
 part(g,new THREE.SphereGeometry(1,10,5,0,TAU,0,Math.PI/2).scale(.85,.65,2.4),{p:[0,.6,-3]});
 const s=new THREE.Shape();s.moveTo(1.3,-1);s.lineTo(11,8.5);s.lineTo(11,10.5);s.lineTo(1.3,10.5);s.closePath();
 const w=new THREE.ExtrudeGeometry(s,{depth:.3,bevelEnabled:false});w.rotateX(Math.PI/2);w.translate(0,.15,0);part(g,w);part(g,w.clone().scale(-1,1,1));
 for(const x of[-11,11])part(g,new THREE.BoxGeometry(.25,2.6,2.8),{p:[x,1.3,9.3]});
 for(const x of[-1.7,1.7])part(g,fore(new THREE.CylinderGeometry(.85,1.05,5,10)),{p:[x,0,9]});
 g.userData.pl=[[.85,7,[-1.7,0,11.5]],[.85,7,[1.7,0,11.5]]]}},
{id:'wayfarer',kind:'tgo',name:'TGO Wayfarer',fact:'TGO original. A 340 m long-haul cruiser with a spinning habitat ring for its crew.',build(g){
 part(g,fore(new THREE.CylinderGeometry(5,5,260,10)));part(g,fore(new THREE.CylinderGeometry(4,15,40,10)),{p:[0,0,-150]});
 const ring=new THREE.Group();ring.position.z=-60;g.add(ring);part(ring,new THREE.TorusGeometry(70,7,6,48),{th:20});
 const sp=[];for(let k=0;k<6;k++){const a=k*TAU/6;sp.push(Math.cos(a)*5,Math.sin(a)*5,0,Math.cos(a)*63,Math.sin(a)*63,0)}seg(ring,sp);
 for(const x of[-62,62])part(g,new THREE.BoxGeometry(80,1,50),{p:[x,0,25]});
 for(let k=0;k<4;k++){const a=k*TAU/4+TAU/8;part(g,fore(new THREE.CylinderGeometry(9,9,60,10)),{p:[Math.cos(a)*16,Math.sin(a)*16,90]})}
 part(g,fore(new THREE.CylinderGeometry(10,30,40,16,1,true)),{p:[0,0,150]});g.userData.pl=[[26,110,[0,0,170]]];g.userData.spin=ring}}];
function makeShip(def){if(def.obj)return;const o=new THREE.Group(),g=new THREE.Group();g.scale.setScalar(1e-6);o.add(g);def.build(g);
 o.updateMatrixWorld(true);def.size=new THREE.Box3().setFromObject(o).getSize(new V3()).length()/2;
 def.plumes=(g.userData.pl||[]).map(([r,l,p])=>{const geo=new THREE.ConeGeometry(r,l,14,1,true);geo.rotateX(Math.PI/2);geo.translate(0,0,l/2);
  const m=new THREE.Mesh(geo,plumeM);m.position.set(p[0],p[1],p[2]);m.visible=false;g.add(m);return m});
 def.spin=g.userData.spin||null;def.obj=o;o.visible=false;shipScene.add(o)}

const DN=420,dustP=new Float32Array(DN*3).map(()=>Math.random()*2-1),dustA=new THREE.BufferAttribute(new Float32Array(DN*6),3);dustA.setUsage(THREE.DynamicDrawUsage);
const dustG=new THREE.BufferGeometry();dustG.setAttribute('position',dustA);
const dustM=new THREE.LineBasicMaterial({color:0xcfe6ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
const dust=new THREE.LineSegments(dustG,dustM);dust.frustumCulled=false;shipScene.add(dust);

/* stars you can visit, and real spacecraft at their real distances */
const ALL=B.slice(),XS=[],xsBy={};
const FS_STAR=`#include <common>
uniform float preExp,sunDisc;
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;uniform vec3 color;uniform float mode,temp,gs;
varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
${GLSL_HEAT}
${GLSL_GRAV}
void main(){
#include <logdepthbuf_fragment>
 vec3 N=normalize(vN),V=normalize(cameraPosition-vP);float mu=max(dot(N,V),0.);vec3 col;
 if(mode<.5){float g=texture2D(map,vUv).r;col=color*(.5+.65*g)*(.32+.78*pow(mu,.55));col=mix(col,vec3(1.),.3*pow(mu,3.));}
 else if(mode<1.5)col=heat(pow(clamp((temp+273.)/800.,0.,1.),.6));
 else col=grav(clamp((log(gs)/log(10.)+3.)/5.5,0.,1.));
 gl_FragColor=vec4(mode<.5?min(col*sunDisc*preExp,vec3(40.)):pow(col,vec3(2.2)),1.);}`;
let granT=null;
function granTex(){if(granT)return granT;const w=512,h=256,cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d'),im=cx.createImageData(w,h),d=im.data;
 for(let j=0;j<h;j++){const la=(.5-(j+.5)/h)*Math.PI,cl=Math.cos(la),sl=Math.sin(la);for(let i=0;i<w;i++){const lo=(i+.5)/w*TAU,x=cl*Math.cos(lo),z=-cl*Math.sin(lo);
  const v=Math.min(1,fbm(x*40,sl*40,z*40,7,3)*.75+fbm(x*6,sl*6,z*6,9,3)*.35)*255,o=(j*w+i)*4;d[o]=d[o+1]=d[o+2]=v;d[o+3]=255}}
 cx.putImageData(im,0,0);granT=canvasTex(cv);return granT}
function starView(s){const v=look.view;s.real.visible=v!=='wire';s.wire[0].visible=v==='wire';s.glow.visible=v==='real';s.mat.uniforms.mode.value=v==='thermal'?1:v==='gravity'?2:0;
 if(s.lb)s.lb.querySelector('em').textContent=v==='gravity'?fmtG(s.g):v==='thermal'?Math.round(s.ph.T).toLocaleString('en-US')+' K':''}
function getStar(i){if(i===CAT.sun)return byId.sun;if(xsBy[i])return xsBy[i];
 const ph=starPhys(i),R=ph.R*695700,c0=bbRGB(ph.T),l0=(c0[0]+c0[1]+c0[2])/3,c1=c0.map(x=>Math.max(0,l0+(x-l0)*2.2)),cm=Math.max(...c1),c=c1.map(x=>x/cm),p=CAT.pos;
 const s={id:'star'+i,cat:i,name:CAT.names[i],kind:'star',R,GM:ph.m*1.32712440018e11,ph,pos:new THREE.Vector3(p[i*3],p[i*3+1],p[i*3+2]),loc:new THREE.Vector3(),rot:600};
 s.g=s.GM/(R*R)*1000;
 const obj=new THREE.Group();obj.scale.setScalar(R*KM);const spin=new THREE.Group();obj.add(spin);
 const wire=new THREE.LineSegments(globeG,new THREE.LineBasicMaterial({color:0xd8ffe6,transparent:true,opacity:.92}));spin.add(wire,new THREE.Mesh(occG,occM));
 const m=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS_STAR,uniforms:{preExp:PE,sunDisc:{value:SUN_DISC},map:{value:granTex()},color:{value:new THREE.Color(c[0],c[1],c[2])},mode:{value:0},temp:{value:ph.T-273.15},gs:{value:s.g}}});
 const real=new THREE.Mesh(sphG,m);spin.add(real);
 const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:sunB.glow.material.map,color:new THREE.Color(c[0],c[1],c[2]),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));glow.scale.setScalar(16);obj.add(glow);
 Object.assign(s,{obj,spin,real,wire:[wire],glow,mat:m});scene.add(obj);
 s.lb=starLbl[i]||makeStarLbl(i);s.li=starLi[i]||null;
 xsBy[i]=s;XS.push(s);ALL.push(s);starView(s);return s}
// labels for named stars, and for any star you pick
const starLbl={},starLi={},LBL_SET=new Set();
function makeStarLbl(i){const el=document.createElement('button');el.className='lb xstar off';el.innerHTML='<i></i><span>'+CAT.names[i]+'</span><em></em>';
 el.addEventListener('click',()=>pick(getStar(i)));labelsEl.appendChild(el);starLbl[i]=el;return el}
const NAMED=[];for(let i=0;i<CAT.n-1;i++)if(CAT.proper[i]){NAMED.push(i);makeStarLbl(i)}
const APP=new Float32Array(CAT.n),SDIR=new Float32Array(CAT.n*3),camW=new THREE.Vector3(),lastCam=new THREE.Vector3(1e30,0,0);
let nearStar=Infinity,starsDirty=true,shownStars=[];
function updateStars(){camW.copy(camera.position).add(origin);
 if(!starsDirty&&camW.distanceTo(lastCam)<Math.max(500,nearStar*1e-5))return;starsDirty=false;lastCam.copy(camW);
 const P=CAT.pos,A=sky.p,TI=sky.t,S=sky.sz,C=sky.col;let nd=Infinity;
 for(let i=0;i<CAT.n;i++){const x=P[i*3]-camW.x,y=P[i*3+1]-camW.y,z=P[i*3+2]-camW.z,d=Math.sqrt(x*x+y*y+z*z)||1,o=i*3;
  if(d<nd)nd=d;A[o]=SDIR[o]=x/d;A[o+1]=SDIR[o+1]=y/d;A[o+2]=SDIR[o+2]=z/d;
  const m=CAT.M[i]+5*Math.log10(d/PC)-5,f=Math.pow(10,-.4*(m-6.5));APP[i]=m;
  let I=f<1?.085*f:Math.min(1.6,.085*Math.pow(f,.38));const ru=CAT.RU[i];I*=smst(1000*ru,5000*ru,d);
  S[i]=Math.min(4.2,.85+.42*Math.log10(Math.max(1,f)));TI[o]=C[o]*I;TI[o+1]=C[o+1]*I;TI[o+2]=C[o+2]*I}
 nearStar=nd;sky.pa.needsUpdate=sky.ta.needsUpdate=sky.sa.needsUpdate=true;
 // the brightest named stars from here get labels
 shownStars=NAMED.filter(i=>APP[i]<3.2).sort((a,b)=>APP[a]-APP[b]).slice(0,28)}
function updateStarLabels(W,H){const beta=sky.mat.uniforms.beta.value,tgt=ship.on?ship.target:null;LBL_SET.clear();
 if(opt.labels&&opt.stars&&beta<.02&&!ship.on)shownStars.forEach(i=>LBL_SET.add(i));
 XS.forEach(s=>{if(s===focus||s===tgt||(fly&&fly.to===s))LBL_SET.add(s.cat)});
 for(const k in starLbl){const i=+k,el=starLbl[k];let show=LBL_SET.has(i);
  if(show){const s=xsBy[i];if(s&&s.obj.visible&&(s===focus||s===tgt)&&s.loc.distanceTo(camera.position)<s.R*KM*2e4){v3.copy(s.obj.position)}
   else v3.set(SDIR[i*3],SDIR[i*3+1],SDIR[i*3+2]).multiplyScalar(5e8).add(camera.position);
   if(hiddenBy(v3,null))show=false;
   v3.project(camera);if(!show||v3.z>1||Math.abs(v3.x)>1.05||Math.abs(v3.y)>1.05)show=false;else el.style.transform='translate('+((v3.x+1)/2*W).toFixed(1)+'px,'+((1-v3.y)/2*H).toFixed(1)+'px)'}
  el.classList.toggle('off',!show)}}
// click anywhere on the sky to pick the star under the pointer
function starAt(cx,cy){const W=innerWidth,H=innerHeight;let best=-1,bd=14*14;
 for(let i=0;i<CAT.n;i++){if(sky.t[i*3]+sky.t[i*3+1]+sky.t[i*3+2]<.02)continue;v3.set(SDIR[i*3],SDIR[i*3+1],SDIR[i*3+2]).multiplyScalar(5e8).add(camera.position).project(camera);
  if(v3.z>1)continue;const dx=(v3.x+1)/2*W-cx,dy=(1-v3.y)/2*H-cy,d=dx*dx+dy*dy;if(d<bd){bd=d;best=i}}
 if(best<0&&XC.ready){const k=xcAt(cx,cy);if(k>=0)best=xcPromote(k)}
 return best}

/* the rest of HYG: about 100,000 fainter stars, drawn entirely on the GPU (each one works out its own brightness from where the camera is),
   loaded quietly a few seconds after the page opens. Picking one copies it into the catalogue above so you can visit it. */
const E2S=new THREE.Matrix3();{const c=Math.cos(OBL),s=Math.sin(OBL);E2S.set(1,0,0,0,-s,c,0,-c,-s)} // equatorial to scene axes, as eqToScene
const S2E=E2S.clone().transpose(),XC={ready:false,n:0,pts:null,fade:{value:0},camPc:{value:new THREE.Vector3()},prom:{}};
async function loadXC(){try{const r=await fetch('data/stars-hyg.bin.gz');if(!r.ok)return;
 const buf=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),dv=new DataView(buf);if(dv.getUint32(0,true)!==0x534f4754)return;
 const n=dv.getUint32(4,true);let o=12;const xyzm=new Float32Array(buf,o,n*4);o+=n*16;const ci=new Int16Array(buf,o,n);o+=n*2+(n%2?2:0);
 Object.assign(XC,{n,xyzm,ci,num:new Uint32Array(buf,o,n),cat:new Uint8Array(buf,o+n*4,n),cls:new Uint8Array(buf,o+n*5,n)});
 const ib=new THREE.InterleavedBuffer(xyzm,4),g=new THREE.BufferGeometry(),tint=new THREE.BufferAttribute(new Uint8Array(n*3),3,true);
 g.setAttribute('position',new THREE.InterleavedBufferAttribute(ib,3,0));g.setAttribute('absMag',new THREE.InterleavedBufferAttribute(ib,1,3));g.setAttribute('tint',tint);
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{...AB,camPc:XC.camPc,fade:XC.fade,e2s:{value:E2S},px:sky.mat.uniforms.px},
  vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
${GLSL_ABERR}
${GLSL_DOP}
uniform vec3 camPc;uniform mat3 e2s;uniform float px,fade;attribute float absMag;attribute vec3 tint;varying vec3 vC;
void main(){vec3 rel=position-camPc;float d=length(rel);vC=vec3(0.);gl_PointSize=0.;gl_Position=vec4(2.,2.,2.,1.);
 if(d>1e-4){float m=absMag+5.*log(d)/log(10.)-5.,f=pow(10.,-.4*(m-6.5)),I=f<1.?.085*f:min(1.6,.085*pow(f,.38)),sz=min(4.2,.85+.42*log(max(1.,f))/log(10.));
  float D;vec3 dp=aberr(normalize(e2s*rel),D);vC=doppler(tint*I*fade,D);gl_Position=projectionMatrix*modelViewMatrix*vec4(dp*5e8,1.);
  gl_PointSize=dot(vC,vC)<1e-6?0.:px*sz*clamp(.9+(D-1.)*.35,.6,3.);}
#include <logdepthbuf_vertex>
}`,fragmentShader:sky.mat.fragmentShader});
 XC.pts=new THREE.Points(g,mat);if(LOW)g.setDrawRange(0,30000);XC.pts.frustumCulled=false;XC.pts.renderOrder=-1;scene.add(XC.pts);XC.ready=true;
 // colours from B-V, in slices so the page stays smooth
 for(let s=0;s<n;s+=20000){for(let i=s;i<Math.min(n,s+20000);i++){const c=bbRGB(teff(ci[i]/1000)),l=(c[0]+c[1]+c[2])/3,k=c.map(x=>l+(x-l)*.8),mx=Math.max(...k);
   tint.array[i*3]=k[0]/mx*255;tint.array[i*3+1]=k[1]/mx*255;tint.array[i*3+2]=k[2]/mx*255}tint.needsUpdate=true;await new Promise(r=>setTimeout(r,0))}}catch(e){}}
setTimeout(()=>(window.requestIdleCallback||setTimeout)(loadXC),4000);
function updateXC(){if(!XC.ready)return;XC.pts.visible=opt.stars;XC.pts.position.copy(camera.position);XC.fade.value=Math.min(1,XC.fade.value+.02);
 v3.copy(camera.position).add(origin).applyMatrix3(S2E).divideScalar(PC);XC.camPc.value.copy(v3)}
const xcName=k=>(XC.cat[k]===1?'HIP ':XC.cat[k]===2?'HD ':'HYG ')+XC.num[k];
function xcPromote(k){if(XC.prom[k]!=null)return XC.prom[k];let i=CAT.nx;if(i>=CAT.cap){i=CAT.n;CAT.nx=CAT.n}CAT.nx=i+1;
 const x=XC.xyzm;eqToScene(x[k*4],x[k*4+1],x[k*4+2],v3).multiplyScalar(PC);CAT.pos[i*3]=v3.x;CAT.pos[i*3+1]=v3.y;CAT.pos[i*3+2]=v3.z;
 CAT.M[i]=x[k*4+3];CAT.ci[i]=XC.ci[k]/1000;CAT.names[i]=xcName(k);CAT.spect[i]=XC.cls[k]?String.fromCharCode(XC.cls[k]):'';CAT.RU[i]=starPhys(i).R*695700*KM;
 for(const q in XC.prom)if(XC.prom[q]===i)delete XC.prom[q];XC.prom[k]=i;return i}
// the faint star under the pointer, among those bright enough to see from here
function xcAt(cx,cy){const W=innerWidth,H=innerHeight,c=XC.camPc.value,x=XC.xyzm;let best=-1,bd=10*10;
 for(let k=0;k<XC.n;k++){const dx0=x[k*4]-c.x,dy0=x[k*4+1]-c.y,dz0=x[k*4+2]-c.z,d=Math.sqrt(dx0*dx0+dy0*dy0+dz0*dz0);if(x[k*4+3]+5*Math.log10(d)-5>7.5)continue;
  v3.set(dx0,dy0,dz0).applyMatrix3(E2S).normalize().multiplyScalar(5e8).add(camera.position).project(camera);if(v3.z>1)continue;
  const ex=(v3.x+1)/2*W-cx,ey=(1-v3.y)/2*H-cy,dd=ex*ex+ey*ey;if(dd<bd){bd=dd;best=k}}
 return best}
function xcFind(q){const m=/^(hip|hd)\s*(\d+)$/i.exec(q);if(!m||!XC.ready)return -1;const cat=m[1].toLowerCase()==='hip'?1:2,num=+m[2];
 for(let k=0;k<XC.n;k++)if(XC.num[k]===num&&XC.cat[k]===cat)return k;return -1}
const clk={x:0,y:0,t:0};
canvas.addEventListener('pointerdown',e=>{clk.x=e.clientX;clk.y=e.clientY;clk.t=performance.now()});
canvas.addEventListener('pointerup',e=>{if(performance.now()-clk.t>450||Math.hypot(e.clientX-clk.x,e.clientY-clk.y)>5)return;
 if(bodyAt(e.clientX,e.clientY))return; // clicked a world (double-click flies there), not the sky
 const i=starAt(e.clientX,e.clientY);if(i<0)return;pick(getStar(i))});

// real spacecraft, modelled from their published distances and directions (ecliptic J2000). Positions are approximate, good to a few degrees.
const PROBES=[
 {id:'v1',name:'Voyager 1',ship:'voyager',lon:255.6,lat:34.8,r0:166.4,rate:3.58,launch:'5 Sep 1977',v:16.9,from:2012,note:'Crossed the heliopause in August 2012, the first spacecraft in interstellar space. Reaches one light-day from Earth in November 2026.'},
 {id:'v2',name:'Voyager 2',ship:'voyager',lon:289.6,lat:-35,r0:138.4,rate:3.24,launch:'20 Aug 1977',v:15.3,from:2012,note:'The only spacecraft to visit Uranus and Neptune. Crossed the heliopause in November 2018.'},
 {id:'nh',name:'New Horizons',ship:'newhorizons',lon:289,lat:1.5,r0:60.6,rate:2.89,launch:'19 Jan 2006',v:13.7,from:2016,note:'Flew past Pluto on 14 July 2015 and Arrokoth on 1 January 2019.'}];
const probeSun=new THREE.DirectionalLight(0xfff4e0,1.25);const probeAmb=new THREE.AmbientLight(0x6f86a8,.05);scene.add(probeSun,probeSun.target,probeAmb);
PROBES.forEach(pr=>{const def=SHIPS.find(s=>s.id===pr.ship),o=new THREE.Group(),g=new THREE.Group();g.scale.setScalar(1e-6);o.add(g);def.build(g);
 o.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(o).getSize(new V3()).length()/2;
 Object.assign(pr,{kind:'probe',R:size/KM,GM:0,g:0,pos:new V3(),loc:new V3(),obj:o,rot:1});scene.add(o);
 const el=document.createElement('button');el.className='lb probe';el.innerHTML='<i></i><span>'+pr.name+'</span><em></em>';el.addEventListener('click',()=>pick(pr));labelsEl.appendChild(el);pr.lb=el;ALL.push(pr)});
function probePos(){const yr=2000+(sim-J2000)/(864e5*365.25),D=(sim-Date.UTC(2025,0,1))/(864e5*365.25);
 for(const pr of PROBES){pr.on=opt.probes&&yr>=pr.from&&yr<2100;const r=(pr.r0+pr.rate*D)*AU,l=pr.lon*D2R,b=pr.lat*D2R;
  pr.pos.set(r*Math.cos(b)*Math.cos(l),r*Math.sin(b),-r*Math.cos(b)*Math.sin(l))}}
function updateProbes(){for(const pr of PROBES){pr.loc.subVectors(pr.pos,origin);pr.obj.position.copy(pr.loc);pr.obj.visible=pr.on||pr===focus;
  pr.obj.lookAt(w3.copy(B[0].loc))} // high-gain antennas point home
 probeSun.position.copy(B[0].loc);probeSun.target.position.set(0,0,0)}
function updateProbeLabels(W,H,far){for(const pr of PROBES){let show=(pr.on&&opt.labels&&!far)||pr===focus||(ship.on&&ship.target===pr);
 if(show){v3.copy(pr.obj.position);v3.project(camera);if(v3.z>1)show=false;else pr.lb.style.transform='translate('+((v3.x+1)/2*W).toFixed(1)+'px,'+((1-v3.y)/2*H).toFixed(1)+'px)'}
 pr.lb.classList.toggle('off',!show)}}

/* comets, from JPL SBDB osculating elements: [name, nucleus radius km, e, q AU, i, node, arg. perihelion (deg), perihelion time JD].
   Inside about 4 AU they grow a coma, a straight blue gas tail pointing away from the Sun and a curved dust tail lagging along the orbit. */
const COMETS=[['1P/Halley',5.5,.967935996,.574863831,162.19053,59.098947,112.241431,2446469.9736162],['2P/Encke',2.4,.846953407,.339529392,11.337695,334.015436,187.286269,2460240.0289887],
 ['67P/Churyumov–Gerasimenko',1.7,.640908131,1.243265641,7.040295,50.135574,12.79825,2457247.5886578],['C/1995 O1 Hale–Bopp',30,.994981003,.890537664,89.287594,282.733421,130.414667,2450537.1349071],
 ['109P/Swift–Tuttle',13,.963225755,.959516155,113.453817,139.381192,152.982168,2448968.4997846],['C/2020 F3 NEOWISE',2.5,.999178026,.294651249,128.937503,61.010428,37.278658,2459034.178898],
 ['9P/Tempel 1',3,.509702833,1.54254047,10.473428,68.753575,179.197275,2457603.0707246],['103P/Hartley 2',.8,.693597857,1.064947369,13.599468,219.742174,181.321844,2457863.9579831]];
function keplerE(M,e){let E=M+.85*e*Math.sign(Math.sin(M)||1);for(let k=0;k<60;k++){const d=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));E-=d;if(Math.abs(d)<1e-12)break}return E}
// a point on the orbit at true anomaly nu, in scene units (heliocentric)
function cometXY(c,nu,out){const r=c.a*(1-c.e*c.e)/(1+c.e*Math.cos(nu));return orbRot(c,r*Math.cos(nu),r*Math.sin(nu),out)}
function orbRot(c,xp,yp,out){const cO=Math.cos(c.O),sO=Math.sin(c.O),co=Math.cos(c.w),so=Math.sin(c.w),ci=Math.cos(c.i),si=Math.sin(c.i);
 const x=(co*cO-so*sO*ci)*xp+(-so*cO-co*sO*ci)*yp,y=(co*sO+so*cO*ci)*xp+(-so*sO+co*cO*ci)*yp,z=(so*si)*xp+(co*si)*yp;return out.set(x*AU,z*AU,-y*AU)}
const tailM=new THREE.ShaderMaterial({uniforms:{sg:AB.sg},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 tc;varying vec4 vC;void main(){vC=tc;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
#include <logdepthbuf_vertex>
}`,fragmentShader:`#include <common>
uniform float sg;
#include <logdepthbuf_pars_fragment>
varying vec4 vC;void main(){
#include <logdepthbuf_fragment>
 gl_FragColor=vec4(vC.rgb*vC.a*sg,1.);}`});
const comaTex=glowTex([[0,'rgba(235,245,255,1)'],[.08,'rgba(200,225,255,.7)'],[.35,'rgba(150,190,255,.12)'],[1,'rgba(120,170,255,0)']]),TN=24;
COMETS.forEach(([name,R,e,q,i,O,w,tp])=>{const a=q/(1-e),c={id:'comet'+name.replace(/\W/g,''),name,kind:'comet',R,GM:6.674e-20*4/3*Math.PI*Math.pow(R*1e3,3)*600*1e-9,e,q,a,i:i*D2R,O:O*D2R,w:w*D2R,tp,
  n:.9856076686/Math.pow(a,1.5),pos:new V3(),loc:new V3(),vdir:new V3(),obj:new THREE.Group(),rot:1,act:0};
 c.coma=new THREE.Sprite(new THREE.SpriteMaterial({map:comaTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));c.obj.add(c.coma);scene.add(c.obj);
 c.tails=[[.55,.75,1],[1,.92,.75]].map(col=>{const g=new THREE.BufferGeometry(),p=new THREE.BufferAttribute(new Float32Array((TN+1)*6),3),t=new THREE.BufferAttribute(new Float32Array((TN+1)*8),4);
  p.setUsage(THREE.DynamicDrawUsage);g.setAttribute('position',p);g.setAttribute('tc',t);const ix=[];for(let k=0;k<TN;k++)ix.push(k*2,k*2+1,k*2+2,k*2+1,k*2+3,k*2+2);g.setIndex(ix);
  for(let k=0;k<=TN;k++)for(const s of [0,1])t.setXYZW(k*2+s,col[0],col[1],col[2],0);const m=new THREE.Mesh(g,tailM);m.frustumCulled=false;scene.add(m);return m});
 // the orbit, sampled by true anomaly so the tight turn at perihelion stays smooth; long-period orbits are drawn out to 60 AU
 const rmax=Math.min(60,a*(1+e)),nm=rmax>=a*(1+e)-1e-9?Math.PI:Math.acos(Math.min(1,(a*(1-e*e)/rmax-1)/e)),pts=[];
 for(let k=0;k<=400;k++){cometXY(c,-nm+2*nm*k/400,tmp);pts.push(tmp.x,tmp.y,tmp.z)}const og=new THREE.BufferGeometry();og.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
 c.orbit=new THREE.Line(og,new THREE.LineBasicMaterial({color:0x7fa8c8,transparent:true,opacity:.22}));c.orbit.frustumCulled=false;scene.add(c.orbit);
 const el=document.createElement('button');el.className='lb comet';el.innerHTML='<i></i><span>'+name+'</span><em></em>';el.addEventListener('click',()=>pick(c));labelsEl.appendChild(el);c.lb=el;ALL.push(c)});
const CM=ALL.filter(b=>b.kind==='comet');
function cometPos(){const jd=sim/864e5+2440587.5;for(const c of CM){let M=c.n*(jd-c.tp)*D2R;M=((M%TAU)+TAU*1.5)%TAU-Math.PI;
  const E=keplerE(M,c.e),xp=c.a*(Math.cos(E)-c.e),yp=c.a*Math.sqrt(1-c.e*c.e)*Math.sin(E);orbRot(c,xp,yp,c.pos);
  // velocity direction (for the dust tail) from the derivative of the same ellipse
  const dE=1/(1-c.e*Math.cos(E));orbRot(c,-c.a*Math.sin(E)*dE,c.a*Math.sqrt(1-c.e*c.e)*Math.cos(E)*dE,c.vdir).normalize();
  c.r=c.pos.length()/AU;c.act=Math.pow(Math.min(1,Math.max(0,(4-c.r)/3.2)),1.5)}}
const tA=new V3(),tV=new V3(),tS=new V3(),tP=new V3();
function updateComets(){const on=opt.small;for(const c of CM){c.loc.subVectors(c.pos,origin);c.obj.position.copy(c.loc);const vis=on||c===focus;c.obj.visible=vis;c.orbit.visible=vis&&opt.orbits;
  c.orbit.position.copy(B[0].loc);const act=look.view==='real'?c.act:0;c.coma.visible=act>0;c.coma.scale.setScalar(Math.max(c.R*KM*40,3e5*KM*act));
  tA.copy(c.pos).normalize();tS.subVectors(c.loc,camera.position).normalize();
  c.tails.forEach((m,j)=>{m.visible=vis&&act>0;if(!m.visible)return;const L=Math.min(.3,.12/Math.max(c.r*c.r,.05))*AU*act*(j?.8:1),W=(j?5e5:1.6e5)*KM*(.4+act),p=m.geometry.attributes.position,t=m.geometry.attributes.tc;
   for(let k=0;k<=TN;k++){const s=k/TN;tP.copy(c.loc).addScaledVector(tA,L*s);if(j)tP.addScaledVector(c.vdir,-L*.45*s*s); // dust lags behind the comet's motion
    tV.copy(tA);if(j)tV.addScaledVector(c.vdir,-.9*s).normalize();tV.cross(tS).normalize().multiplyScalar(W*(.25+s)*.5);
    p.setXYZ(k*2,tP.x+tV.x,tP.y+tV.y,tP.z+tV.z);p.setXYZ(k*2+1,tP.x-tV.x,tP.y-tV.y,tP.z-tV.z);const a=(1-s)*(1-s)*act*(j?.5:.65);t.setW(k*2,a);t.setW(k*2+1,a)}
   p.needsUpdate=t.needsUpdate=true})}}
/* asteroids, Jupiter's Trojans, Centaurs and the Kuiper belt: about 50,000 JPL orbits drawn as one point cloud. Each point solves Kepler's
   equation on the GPU from its elements and the time since the shared epoch, so the whole belt moves with the clock at no CPU cost. */
const SB={pts:null,t:{value:0},sunLoc:{value:new THREE.Vector3()},epoch:0,n:0};
async function loadSB(){try{const r=await fetch('data/asteroids.bin.gz');if(!r.ok)return;
 const buf=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),dv=new DataView(buf);if(dv.getUint32(0,true)!==0x414f4754)return; // 'TGOA'
 const n=dv.getUint32(4,true),blk=k=>new Float32Array(buf,16+k*n*4,n),H=new Uint8Array(buf,16+24*n,n),C=new Uint8Array(buf,16+25*n,n),g=new THREE.BufferGeometry();
 const el1=new Float32Array(n*3),el2=new Float32Array(n*3),[A,E,I,O,W,M]=[0,1,2,3,4,5].map(blk);for(let k=0;k<n;k++){el1[k*3]=A[k];el1[k*3+1]=E[k];el1[k*3+2]=I[k];el2[k*3]=O[k];el2[k*3+1]=W[k];el2[k*3+2]=M[k]}
 g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('el1',new THREE.BufferAttribute(el1,3));g.setAttribute('el2',new THREE.BufferAttribute(el2,3));
 g.setAttribute('cls',new THREE.BufferAttribute(new Float32Array(C),1));g.setAttribute('hmag',new THREE.BufferAttribute(new Float32Array(H).map(h=>h/10),1));
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{sg:AB.sg,t:SB.t,sunLoc:SB.sunLoc,au:{value:AU},px:{value:Math.min(devicePixelRatio||1,2)}},
  vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
uniform float t,au,px;uniform vec3 sunLoc;attribute vec3 el1,el2;attribute float cls,hmag;varying vec3 vC;
void main(){float a=el1.x,e=el1.y,n=.01720209895/pow(a,1.5),M=mod(el2.z+n*t,6.2831853),E=e>.8?3.1415927:M;
 for(int k=0;k<6;k++)E-=(E-e*sin(E)-M)/(1.-e*cos(E));
 float xp=a*(cos(E)-e),yp=a*sqrt(1.-e*e)*sin(E),cO=cos(el2.x),sO=sin(el2.x),co=cos(el2.y),so=sin(el2.y),ci=cos(el1.z),si=sin(el1.z);
 float x=(co*cO-so*sO*ci)*xp+(-so*cO-co*sO*ci)*yp,y=(co*sO+so*cO*ci)*xp+(-so*sO+co*cO*ci)*yp,z=so*si*xp+co*si*yp;
 vec3 p=vec3(x,z,-y)*au+sunLoc;
 // tint by family: main belt grey-tan, Trojans ruddy, Kuiper belt and Centaurs blue-grey, near-Earth orange
 vC=cls<1.5?vec3(.78,.72,.62):cls<2.5?vec3(.9,.62,.45):cls<3.5?vec3(.55,.66,.88):cls<4.5?vec3(.7,.62,.85):cls<5.5?vec3(1.,.55,.35):vec3(.6);
 vC*=.55*clamp(1.3-(hmag-8.)*.06,.35,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=px*(cls>2.5&&cls<4.5?1.8:1.5);
#include <logdepthbuf_vertex>
}`,fragmentShader:`#include <common>
uniform float sg;
#include <logdepthbuf_pars_fragment>
varying vec3 vC;void main(){
#include <logdepthbuf_fragment>
 float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(vC*(1.-r*1.4)*sg,1.);}`});
 SB.epoch=dv.getFloat64(8,true);SB.n=n;SB.pts=new THREE.Points(g,mat);if(LOW)g.setDrawRange(0,15000);SB.pts.frustumCulled=false;scene.add(SB.pts)}catch(e){}}
// fetched only once "Asteroids and comets" is switched on
let sbAsked=false;function wantSB(){if(sbAsked||!opt.small)return;sbAsked=true;(window.requestIdleCallback||setTimeout)(loadSB)}
setTimeout(wantSB,5000);$('#l-small').addEventListener('change',wantSB);
function updateSB(){if(!SB.pts)return;SB.pts.visible=opt.small&&look.view!=='wire';SB.t.value=(sim/864e5+2440587.5)-SB.epoch;SB.sunLoc.value.copy(B[0].loc)}
function updateCometLabels(W,H,far){for(const c of CM){let show=(opt.small&&opt.labels&&c.act>0&&!far)||c===focus||(ship.on&&ship.target===c);
 if(show){v3.copy(c.obj.position).project(camera);if(v3.z>1)show=false;else c.lb.style.transform='translate('+((v3.x+1)/2*W).toFixed(1)+'px,'+((1-v3.y)/2*H).toFixed(1)+'px)'}
 c.lb.classList.toggle('off',!show)}}
function cometInfo(b){const P=Math.pow(b.a,1.5),near=b.tp+Math.round(((sim/864e5+2440587.5)-b.tp)/(P*365.25))*P*365.25,d=new Date((near-2440587.5)*864e5);
 const rows=[['Type','Comet'],['Nucleus',(b.R*2).toLocaleString('en-US')+' km across'],['Orbit',P<1000?P.toFixed(1)+' yr':'about '+Math.round(P).toLocaleString('en-US')+' yr'],['Perihelion',b.q.toFixed(3)+' AU'],
  [P<1000?'Nearest perihelion':'Perihelion',d.toISOString().slice(0,10)],['From Sun',dist(b.pos.length()/KM)],['Activity',b.act>0?Math.round(b.act*100)+'%':'dormant']];
 $('#i-dl').innerHTML=rows.map(r=>'<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>').join('')}

// fly list: planets and moons, then spacecraft, then stars (search finds every star in the catalog)
function listHead(t){const li=document.createElement('li');li.className='hd';li.textContent=t;list.appendChild(li)}
listHead('Spacecraft');
PROBES.forEach(pr=>{const li=document.createElement('li'),bt=document.createElement('button');bt.textContent=pr.name;bt.className='probe';bt.addEventListener('click',()=>pick(pr));li.appendChild(bt);li.dataset.n=pr.name.toLowerCase();li.dataset.d='1';list.appendChild(li);pr.li=bt});
listHead('Comets');
CM.forEach(c=>{const li=document.createElement('li'),bt=document.createElement('button');bt.textContent=c.name;bt.className='probe';bt.addEventListener('click',()=>pick(c));li.appendChild(bt);li.dataset.n=c.name.toLowerCase();li.dataset.d='1';list.appendChild(li);c.li=bt});
listHead('Stars');
{const near=NAMED.slice().sort((a,b)=>starDistPc(a)-starDistPc(b)).slice(0,14),bright=NAMED.slice().sort((a,b)=>CAT.M[a]+5*Math.log10(starDistPc(a))-(CAT.M[b]+5*Math.log10(starDistPc(b)))).slice(0,16),def=new Set([...near,...bright]);
 const extra=[];for(let i=0;i<CAT.n-1;i++)if(!CAT.proper[i]&&starDistPc(i)*3.26156<12)extra.push(i); // nearby stars without a proper name
 NAMED.concat(extra).sort((a,b)=>starDistPc(a)-starDistPc(b)).forEach(i=>{const li=document.createElement('li'),bt=document.createElement('button');
  bt.innerHTML=CAT.names[i]+' <small>'+(starDistPc(i)*3.26156).toFixed(starDistPc(i)<30?1:0)+' ly</small>';bt.className='xstar';bt.addEventListener('click',()=>pick(getStar(i)));
  li.appendChild(bt);li.dataset.n=CAT.names[i].toLowerCase();li.dataset.d=def.has(i)||extra.includes(i)&&starDistPc(i)*3.26156<9?'1':'0';if(li.dataset.d==='0')li.style.display='none';list.appendChild(li);starLi[i]=bt})}
B.forEach(b=>{b.li.parentNode.dataset.n=b.name.toLowerCase();b.li.parentNode.dataset.d='1'});
function filterList(v){list.querySelectorAll('li').forEach(li=>{li.style.display=li.classList.contains('hd')?(v?'none':''):(v?li.dataset.n.includes(v):li.dataset.d==='1')?'':'none'})}

/* flight */
const ship={on:false,def:null,pos:new V3(),q:new THREE.Quaternion(),v:0,thr:0,ap:null,mult:1,anchor:null,off:new V3(),target:null,cam:'chase',chase:1,chaseT:1,cy:0,cyT:0,cp:0,cpT:0,av:new V3(),avT:new V3(),rated:9.80665,restore:null,msg:'',msgT:0,mv:new V3(0,0,-1),stop:false,fov:45,mode:'free',fs:0,fk:.5,fdir:new V3(0,0,-1),kick:0,vel:new V3(),vr:new V3(),vb:null,acc:9.80665,land:null,hold:null,ref:null,tf:0,warpCapS:1e12,capP:1e12,warpLim:false,drag:0};
const keys={},mouse={x:0,y:0,down:false,sx:0,sy:0,lx:0,ly:0},qo=new THREE.Quaternion(),eo=new THREE.Euler();
const K=(...c)=>c.some(k=>keys[k]);
const arriveR=b=>Math.max(b.R*KM*(b.kind==='star'?4:3),ship.def?ship.def.size*4:0);
function flash(m,ms){ship.msg=m;ship.msgT=performance.now()+(ms||5000);$('#h-msg').textContent=m}
function fmtDur(s){if(!isFinite(s))return '—';if(s<60)return s.toFixed(s<10?1:0)+' s';const m=Math.floor(s/60);if(s<3600)return m+' min '+Math.floor(s%60)+' s';
 const h=Math.floor(s/3600);if(s<86400)return h+' h '+Math.floor(s%3600/60)+' min';const d=Math.floor(s/86400);if(d<730)return d+' d '+Math.floor(s%86400/3600)+' h';return (s/31557600).toFixed(1)+' yr'}
const fmtX=x=>x<10?x.toFixed(1):x<1e4?Math.round(x).toLocaleString('en-US'):x.toExponential(0).replace('e+',' × 10^');
function fmtV(k){const p=x=>x>=1e3?Math.round(x).toLocaleString('en-US'):x>=100?x.toFixed(1):x>=10?x.toFixed(2):x.toFixed(3);
 if(k<1)return p(k*1000)+' m/s';if(k<1e5)return p(k)+' km/s';const c=k/CKM;if(c<1e3)return p(c)+' c';const ly=k/9.4607304725808e12;return ly<1e3?p(ly)+' ly/s':p(ly/3.2615638e6)+' Mpc/s'}
function fmtC(k){const c=k/CKM;return c===0?'0 c':c>=1e3?(k/149597870.7).toPrecision(3)+' AU/s':c>=.01?c.toPrecision(3)+' c':(c*100).toPrecision(2)+'% of c'}

/* travel: fly there smoothly, or jump instantly */
let travel='fly';
function jumpFX(fn){const el=$('#jumpfx');el.classList.remove('go');void el.offsetWidth;el.classList.add('go');setTimeout(fn,matchMedia('(prefers-reduced-motion: reduce)').matches?60:230)}
function go(b,d1,dir){zm.t=null;if(travel==='jump'){jumpFX(()=>{fly=null;focus=b;d1=d1||viewDist(b);const dv=dir?dir.clone():camera.position.clone().normalize();camera.position.copy(dv).multiplyScalar(d1);
  camera.lookAt(0,0,0);controls.minDistance=b.R*KM*1.0006;controls.enabled=true;origin.copy(b.pos);controls.update();setFocusUI(b);if(tour)tour.next=performance.now()+3500})}
 else flyTo(b,d1,dir)}
function pick(b){if(ship.on)setTarget(b);else{stopTour();curSite=null;$('#i-site').textContent=b.note||'';go(b)}}
function setTarget(b){ship.target=b;focus=b;setFocusUI(b);if(ship.ap&&ship.ap.to&&ship.ap.to!==b&&(!ship.ap.mode||ship.ap.mode==='go')){ship.ap=Object.assign({},ship.ap,{to:b,t0:performance.now()});flash('Autopilot retargeted to '+b.name)}apUI()}
function apUI(){['circ','land','match'].forEach(m=>{const e=$('#b-'+(m==='circ'?'orbit':m));if(e)e.setAttribute('aria-pressed',String(!!(ship.ap&&ship.ap.mode===m)))});const g=$('#apGo');g.textContent=ship.ap?'Stop autopilot':'Autopilot to '+(ship.target?ship.target.name:'…');g.setAttribute('aria-pressed',String(!!ship.ap));
 $('#sjump').textContent='Jump to '+(ship.target?ship.target.name:'…')}
function apOn(){const b=ship.target;if(!b)return;
 if(ship.mode==='newton'){if(b===(ship.land?ship.land.b:null)){flash('You’re on '+b.name+'. Pick another target.');return}ship.hold=null;ship.ap={mode:'go',to:b,t0:performance.now(),sim0:sim};
  flash('Autopilot: burn to '+b.name+' at '+gee(ship.acc)+', flip and brake, arriving at its speed. Time speeds up on the way and slows for the arrival.',8000);apUI();return}
 if(ship.pos.distanceTo(b.pos)-arriveR(b)<b.R*KM*.05){flash('You’re already at '+b.name+'. Pick another target.');return}
 ship.ap={to:b,t0:performance.now()};ship.anchor=null;flash('Autopilot: '+b.name+' at '+ship.mult+'c');apUI()}
const CRUISE=[0,10,1000,.1*CKM,CKM,5*CKM];
function cruise(i){const k=CRUISE[i];if(ship.ap)apOff();ship.anchor=null;
 if(k/CKM>ship.mult+1e-9){ship.mult=Math.min(10,Math.ceil(k/CKM-1e-9));$('#mult').value=ship.mult;$('#multv').textContent=ship.mult+'c'}
 ship.thr=k*KM;flash(k?'Cruise speed '+(k>=.1*CKM?(k/CKM)+'c':fmtV(k))+'. Arrow keys steer.':'Throttle to zero');
 document.querySelectorAll('[data-cr]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.cr===i)))}
function apOff(m){ship.ap=null;ship.thr=ship.v;if(m)flash(m);apUI()}
function arrive(b,now){const t=(now-ship.ap.t0)/1000;ship.ap=null;ship.v=0;ship.thr=0;ship.anchor=b;ship.off.subVectors(ship.pos,b.pos);flash('Arrived at '+b.name+' after '+fmtDur(t)+'.',12000);apUI()}
function shipJump(){const b=ship.target;if(!b)return;jumpFX(()=>{const dv=w3.subVectors(ship.pos,b.pos);if(dv.lengthSq()<1e-30)dv.set(0,.3,1);dv.normalize();
 ship.pos.copy(b.pos).addScaledVector(dv,arriveR(b));m4.lookAt(ZERO,dv.clone().negate().applyAxisAngle(new V3(0,1,0),.6),new V3(0,1,0));ship.q.setFromRotationMatrix(m4);cq.copy(ship.q);
 ship.v=0;ship.thr=0;ship.ap=null;ship.anchor=b;ship.off.subVectors(ship.pos,b.pos);if(ship.mode==='newton'){ship.anchor=null;ship.land=null;ship.hold={b,off:ship.off.clone()};ship.vel.copy(b.vel||ZERO)}flash('Jumped to '+b.name+'.');apUI()})}

function launch(){const def=SHIPS[+$('#shipSel').value];makeShip(def);ship.def=def;
 if(!playing)$('#play').click();
 stopTour();if(fly){focus=fly.to;fly=null}
 // start somewhere with something to see: in a low circular orbit around the world in view (Earth when looking at the Sun),
 // heading prograde with the ground sliding by below. Other stars keep the old parking spot a few radii out.
 let base=focus;if(base===B[0]||base.kind==='comet'||base.kind==='probe'||!base.GM)base=byId.earth;const orbit=base.kind!=='star';
 const out=camera.position.clone();if(focus!==base||out.lengthSq()<1e-30)out.set(.3,.25,1);out.normalize();
 const ro=orbit?base.R*KM*(base.R>20000?1.12:AIR[base.id]?1.065:1.15):Math.max(base.R*KM*6,def.size*40);ship.pos.copy(base.pos).addScaledVector(out,ro);
 const axis=Y1.clone().applyQuaternion(base.eq||IDQ),tan=new V3().crossVectors(axis,out);if(tan.lengthSq()<1e-6)tan.crossVectors(new V3(1,0,0),out);tan.normalize();
 if(orbit)m4.lookAt(ZERO,tan,out);else{const toB=out.clone().negate(),side=new V3().crossVectors(toB,new V3(0,1,0));if(side.lengthSq()<1e-6)side.set(1,0,0);side.normalize();
  m4.lookAt(ZERO,toB.multiplyScalar(Math.cos(35*D2R)).addScaledVector(side,Math.sin(35*D2R)).normalize(),new V3(0,1,0))}
 ship.q.setFromRotationMatrix(m4);cq.copy(ship.q);ship.vb=null;
 Object.assign(ship,{v:0,thr:0,ap:null,anchor:base,cam:'chase',chase:def.size*3.6,chaseT:def.size*3.6,cy:0,cyT:0,cp:0,cpT:0,target:base,stop:false});ship.av.set(0,0,0);ship.avT.set(0,0,0);ship.off.subVectors(ship.pos,base.pos);
 SHIPS.forEach(s=>{if(s.obj)s.obj.visible=s===def});ship.on=true;controls.enabled=false;
 const sp=$('#speed');sp.value=5;sp.dispatchEvent(new Event('input'));
 // fold the side panels into tabs while flying, and remember which to reopen on the way out
 ship.restore=['#p-fly','#p-layers','#p-time','#p-info'].filter(s=>!$(s).classList.contains('min'));ship.restore.forEach(s=>$(s+' header').click());
 if(document.activeElement)document.activeElement.blur();
 $('#h-fact').textContent=def.fact;ship.vel.copy(base.vel||ZERO);ship.land=null;ship.hold=null;ship.drag=0;ship.ref=base;ship.boostT=0;ship.boost=1;ship.warpAuto=1;
 if(ship.mode==='newton'){ship.anchor=null;if(orbit)ship.vel.addScaledVector(tan,Math.sqrt(base.GM*1e-9/ro));else ship.hold={b:base,off:ship.pos.clone().sub(base.pos)}}
 if(ship.mode==='free'){ship.anchor=null;ship.fs=0;ship.v=0}
 focus=base;origin.copy(base.pos);if(orbit&&ship.mode!=="cruise"){ship.cp=ship.cpT=-.5} // in orbit, the camera starts above the ship looking down on the world below
 // every ship gets at least 1 g so it moves; the real engine rating is one tick away
 ship.rated=RATED[def.id]||9.80665;$('#l-realthr').checked=false;$('#l-realthr').parentElement.hidden=ship.rated>=9.80665;realThrust();
 shipUI(true);fmUI();setTarget(base);
 // on smaller screens the ship panel folds to its title too, so it never covers the view (click the title to open it)
 if((innerWidth<1300||innerHeight<850)&&!document.querySelector("#p-ship").classList.contains("min"))document.querySelector("#p-ship header").click();
 flash(ship.mode==='free'?def.name+' above '+base.name+'. Hold W to fly: speed follows your height, so it eases you down to the ground and races you out to the planets and stars. Arrows turn, A D strafe, + and − change the pace, P flies to any target.':ship.mode==='newton'?(orbit?def.name+' in orbit '+dist((ro-base.R*KM)/KM)+' above '+base.name+'. Hold W to burn (the engine builds up the longer you hold), arrows to turn, P to fly to any target.':def.name+' is station-keeping near '+base.name+'. Hold W to fly; P flies to the target.'):def.name+' launched near '+base.name+'. Press 4 to cruise at light speed, or hold W to throttle up. Arrow keys steer.',9000)}
function realThrust(){const r=$('#l-realthr').checked,a=r?ship.rated:Math.max(ship.rated,9.80665);setThrust(Math.log10(a/9.80665));
 $('#nw-rated').textContent=ship.rated>=9.80665?'Rated '+gee(ship.rated)+'.':r?'Real engine, '+gee(ship.rated)+': raise the time warp to get anywhere.':'Real engine: '+gee(ship.rated)+'. Boosted to 1 g so you can fly.'}
function exitShip(){ship.on=false;ship.ap=null;ship.land=null;ship.hold=null;pred.visible=false;updateMarkers();
 (ship.restore||[]).forEach(s=>{if($(s).classList.contains('min'))$(s+' header').click()});ship.restore=null;if(ship.cam==='cockpit')ship.cam='chase';for(const k in keys)keys[k]=false;mouse.x=mouse.y=0;if(ship.def.obj)ship.def.obj.visible=false;camera.up.set(0,1,0);camera.fov=45;camera.updateProjectionMatrix();shipUI(false);
 let best=B[0],bd=Infinity;for(const b of ALL){if(b.kind==='probe'&&!b.on)continue;const d=ship.pos.distanceTo(b.pos)-b.R*KM;if(d<bd){bd=d;best=b}}focus=best;fly=null;flyTo(best)}
function shipUI(on){$('#launch').textContent=on?'Leave ship':'Launch';$('#ap').hidden=!on;$('#p-ship').hidden=!on;$('#hud').hidden=!on;document.body.classList.toggle('flying',on);
 if(on){$('#ps-name').textContent=ship.def.name;if($('#p-ship').classList.contains('min'))$('#p-ship header').click();hudH()}else $('#h-msg').textContent='';
 $('#shipSel').disabled=on;$('#tour').disabled=on;$('#overview').disabled=on;apUI()}
function toggleCam(){ship.cam=ship.cam==='chase'?'cockpit':ship.cam==='cockpit'?'look':'chase';if(ship.cam==='cockpit'){controls.enabled=false;flash('Cockpit view');return}
 if(ship.cam==='look'){camera.up.set(0,1,0);controls.enabled=true;controls.rotateSpeed=.6;controls.target.set(0,0,0);controls.minDistance=ship.def.size*1.2;controls.update();flash('Free look: drag to orbit the ship, press C to return')}
 else{controls.enabled=false;flash('Chase camera')}}

/* Newtonian flight: momentum, real gravity from every body, thrust in g, atmospheres, landing, orbits and time warp */
const Y1=new V3(0,1,0),IDQ=new THREE.Quaternion(),qY=new THREE.Quaternion(),qS=new THREE.Quaternion(),gT=new V3(),gT2=new V3();
const arriveN=b=>b.R*KM*(b.kind==='star'?4:1.25)+(ship.def?ship.def.size*4:0);
const NV={r:new V3(),v:new V3(),A:new V3(),tp:new V3(),tv:new V3(),tp0:new V3(),d:new V3(),u:new V3(),tid:new V3(),om:new V3(),os:new V3(),w:new V3(),inp:new V3(),n:new V3(),x:new V3(),y:new V3(),ga:new V3(),lastA:new V3()};
// atmospheres: [scale height km, surface density kg/m³] (gas giants: at the 1-bar level)
const AIR={earth:[8.5,1.225],venus:[15.9,65],mars:[11.1,.02],titan:[21,5.3],jupiter:[27,.16],saturn:[59.5,.19],uranus:[27.7,.42],neptune:[19.7,.45],pluto:[50,6e-5],triton:[8,3e-5]};
// rated acceleration of each ship (m/s²): real values for real spacecraft, so they are slow; raise the thrust slider to play
const RATED={voyager:.005,apollo:3.2,newhorizons:.04,cassini:.08,parker:.03,kestrel:49,wayfarer:3};
const gee=a=>{const g=a/9.80665;return g>=1?g.toFixed(g<10?2:1)+' g':g>=.01?g.toFixed(3)+' g':(a*1000).toPrecision(2)+' mm/s²'};
function refBody(p,old){let best=B[0],ba=-1;for(const b of ALL){if(!b.GM)continue;const a=b.GM/Math.max(p.distanceToSquared(old&&b.prev?b.prev:b.pos),1e-30);if(a>ba){ba=a;best=b}}return best}
function gOf(b,p,out){out.subVectors(b.pos,p);const r=out.length(),rr=Math.max(r,b.R*KM);return out.multiplyScalar(b.GM*1e-9/(rr*rr*Math.max(r,1e-12)))}
function gAll(p,out,skip){out.set(0,0,0);for(const b of ALL){if(!b.GM||b===skip)continue;out.add(gOf(b,p,gT2))}return out}
function spinQ(b,out){out.copy(b.eq||IDQ);if(b.spin)out.multiply(qY.setFromAxisAngle(Y1,b.spin.rotation.y));return out}
function omegaOf(b,out){if(!b.rot)return out.set(0,0,0);return out.copy(Y1).applyQuaternion(b.eq||IDQ).multiplyScalar(TAU/(b.rot*3600))}
function thrustInput(out){out.set((K('KeyD')?1:0)-(K('KeyA')?1:0),(K('Space','KeyR')?1:0)-(K('ShiftLeft','ShiftRight','KeyF')?1:0),(K('KeyS','Minus','NumpadSubtract')?1:0)-(K('KeyW','Equal','NumpadAdd')?1:0));return out.lengthSq()}
const matching=()=>K('KeyX','KeyM');
function surfAlt(b,p){return p.distanceTo(b.pos)-b.R*KM-(ship.def?ship.def.size*.6:0)}
function newtonStep(dt,simDt,now){if(ship.land||ship.hold)ship.vb=null;const def=ship.def,amax=ship.acc*1e-6*(ship.ap?1:ship.boost||1),cap=CKM*KM*ship.mult;ship.tf=0;ship.warpCapS=1e12;
 const wantThrust=thrustInput(NV.inp)>0;
 // landed: ride the surface as the world turns
 if(ship.land){const L=ship.land.b;if(wantThrust||(ship.ap&&ship.ap.mode!=='land')){ship.land=null;flash('Lift-off from '+L.name+'.')}
  else{spinQ(L,qS);const old=w0.copy(ship.pos);ship.pos.copy(ship.land.lo).applyQuaternion(qS).add(L.pos);ship.q.copy(qS).multiply(ship.land.lq);
   if(simDt>0)ship.vel.subVectors(ship.pos,old).divideScalar(simDt);ship.ref=L;ship.warpCapS=ship.capP||1e12;return}}
 // station-keeping: hold a fixed offset from a body (after launch, arrival or a jump)
 if(ship.hold){const H=ship.hold.b;if(wantThrust||ship.ap||matching()){ship.hold=null;if(!ship.ap)flash('Station-keeping released. You are flying free under gravity: X matches velocity, O enters orbit, P flies to the target.',7000)}
  else{ship.pos.copy(H.pos).add(ship.hold.off);ship.vel.copy(H.vel||ZERO);ship.ref=refBody(ship.pos);return}}
 const ref=refBody(ship.pos,true);ship.ref=ref;const mu=ref.GM*1e-9,R0=ref.R*KM+def.size*.6,rp=ref.prev||ref.pos,rv=ref.vel||ZERO;
 const r=NV.r.subVectors(ship.pos,rp),v=ship.vb===ref?NV.v.copy(ship.vr):NV.v.subVectors(ship.vel,rv);
 // pulls from everything else, minus what they do to the reference body (tides)
 gAll(w0.copy(ref.pos).add(r),NV.tid,ref).sub(gAll(ref.pos,gT,ref));
 const T=ship.target||ref,ap=ship.ap,mode=ap?(ap.mode||'go'):null;
 NV.tp0.subVectors(T.prev||T.pos,rp);NV.tv.subVectors(T.vel||ZERO,rv);if(T===ref){NV.tp0.set(0,0,0);NV.tv.set(0,0,0)}
 const air=AIR[ref.id];omegaOf(ref,NV.om);const beta=def.beta||400;
 // steering: autopilot points the nose along its burn, landing keeps the belly to the ground
 if(ap&&NV.lastA.lengthSq()>0){if(mode==='land'){NV.n.copy(r).normalize();fwd.set(0,0,-1).applyQuaternion(ship.q);fwd.addScaledVector(NV.n,-fwd.dot(NV.n));if(fwd.lengthSq()<1e-6)fwd.set(1,0,0).cross(NV.n);m4.lookAt(ZERO,fwd.normalize(),NV.n)}
  else{up.set(0,1,0).applyQuaternion(ship.q);m4.lookAt(ZERO,w3.copy(NV.lastA).normalize(),up)}tq.setFromRotationMatrix(m4);ship.q.rotateTowards(tq,dt*1.6)}
 const inW=NV.inp.clone();inW.x*=.5;inW.y*=.5;inW.z*=inW.z>0?.5:1;inW.applyQuaternion(ship.q);
 // adaptive steps: small enough to follow the orbit, steer a landing, and never tunnel through a world
 const ctl=wantThrust||!!ap||matching();
 const stepH=()=>{const rl=r.length(),vl=v.length(),alt=Math.max(rl-R0,1e-6);let h=.015*Math.sqrt(rl*rl*rl/mu);if(vl>0)h=Math.min(h,.12*Math.max(alt,R0*.002)/vl);
  if(ctl&&amax>0)h=Math.min(h,Math.max(.05,.1*Math.sqrt(alt/amax)));return h};
 let t=0,steps=0,arrived=null,done=null,touched=false,hk=stepH();
 while(simDt>0&&t<simDt&&steps<4000){hk=stepH();const hs=Math.min(hk,simDt-t),rr=r.length();steps++;
  NV.ga.copy(r).multiplyScalar(-mu/(rr*rr*rr)).add(NV.tid); // gravity
  const A=NV.A.set(0,0,0),tau=Math.max(hs,1.2);
  if(!ap&&matching()){NV.u.copy(NV.tv).sub(v);A.copy(NV.u).divideScalar(tau)}
  else if(!ap){if(wantThrust)A.copy(inW).multiplyScalar(amax)}
  else if(mode==='go'||mode==='match'){NV.tp.copy(NV.tp0).addScaledVector(NV.tv,t);NV.d.subVectors(NV.tp,r);const dl=NV.d.length(),dist=dl-arriveN(T);NV.u.subVectors(v,NV.tv);
   if(mode==='match'){A.copy(NV.u).negate().divideScalar(tau);if(NV.u.length()<1e-6){done='Velocity matched with '+T.name+'.'}}
   else{// leaving a world that stands between us and the target: climb away first (up and along our motion) instead of burning into the ground
    if(T!==ref&&rr<R0*20&&v.lengthSq()>0){NV.w.copy(NV.d).divideScalar(Math.max(dl,1e-12));const tca=-r.dot(NV.w);
     if(tca>0&&NV.x.copy(r).addScaledVector(NV.w,tca).length()<R0*1.3)NV.d.copy(r).normalize().addScaledVector(NV.os.copy(v).normalize(),.6).normalize().multiplyScalar(dl)}
    const vd=Math.min(Math.sqrt(2*.8*amax*Math.max(dist,0)),cap);A.copy(NV.d).multiplyScalar(vd/Math.max(dl,1e-12)).sub(NV.u).divideScalar(tau);
    // cancel the difference in gravity between ship and target
    A.sub(NV.ga);if(T!==ref){const tl=NV.tp.length();A.addScaledVector(NV.tp,-mu/(tl*tl*tl))}
    if(dist<=0&&NV.u.length()<2e-6)arrived=T}}
  else if(mode==='circ'){NV.n.copy(r).normalize();NV.w.copy(v).addScaledVector(NV.n,-v.dot(NV.n));if(NV.w.lengthSq()<1e-24)NV.w.crossVectors(NV.om.lengthSq()>0?NV.om:Y1,NV.n);
   NV.w.normalize().multiplyScalar(Math.sqrt(mu/rr));A.subVectors(NV.w,v).divideScalar(tau);if(A.length()*tau<5e-7)done='Circular orbit '+dist(rr/KM-ref.R)+' above '+ref.name+', period '+fmtDur(TAU*Math.sqrt(rr*rr*rr/mu))+'.'}
  else if(mode==='land'){NV.n.copy(r).normalize();const g=mu/(rr*rr),alt=rr-R0;
   if(amax<=g*1.05){done='Engines too weak to land on '+ref.name+' (needs more than '+gee(g*1e6)+').'}
   else{const vd=Math.max(2e-6,Math.sqrt(2*.5*(amax-g)*Math.max(alt-1e-4,0)));NV.os.crossVectors(NV.om,r);A.copy(NV.os).addScaledVector(NV.n,-vd).sub(v).divideScalar(tau).addScaledVector(NV.n,g)}}
  const al=A.length();if(al>amax)A.multiplyScalar(amax/al);if(A.lengthSq()>0)NV.lastA.copy(A);ship.tf=Math.min(1,A.length()/Math.max(amax,1e-30));
  v.addScaledVector(NV.ga,hs*.5).addScaledVector(A,hs);
  if(air){const alt=(rr-ref.R*KM)/KM;if(alt<air[0]*14){const rho=air[1]*Math.exp(-Math.max(alt,0)/air[0]);NV.os.crossVectors(NV.om,r);NV.w.subVectors(v,NV.os);
   const kk=rho/(2*beta)*1e6;NV.w.divideScalar(1+kk*NV.w.length()*hs);ship.drag=kk*NV.w.lengthSq()*1e6;v.copy(NV.os).add(NV.w)}else ship.drag=0}else ship.drag=0;
  const vr=v.length();if(vr>cap)v.multiplyScalar(cap/vr);
  r.addScaledVector(v,hs);t+=hs;{const r2=r.length();NV.ga.copy(r).multiplyScalar(-mu/(r2*r2*r2)).add(NV.tid);v.addScaledVector(NV.ga,hs*.5)}
  if(r.length()<R0){touchdown(ref,r,v,NV.om);touched=true;break}
  if(arrived||done)break}
 ship.warpCapS=Math.min(ship.capP||1e12,steps>=4000?Math.max(t,1):Math.max(simDt,1)*Math.min(20,4000/Math.max(steps,1)));
 ship.pos.copy(ref.pos).add(r);ship.vel.copy(rv).add(v);ship.vr.copy(v);ship.vb=ship.land?null:ref;
 if(arrived){const el=(sim-ap.sim0)/1000;ship.ap=null;ship.hold={b:arrived,off:ship.pos.clone().sub(arrived.pos)};ship.vel.copy(arrived.vel||ZERO);
  flash('Arrived at '+arrived.name+' after '+fmtDur(el)+' of flight time.',12000);apUI()}
 if(done){ship.ap=null;flash(done,9000);apUI()}
 if(touched&&ship.ap){ship.ap=null;apUI()}}
function touchdown(b,r,v,om){const R0=b.R*KM+ship.def.size*.6;NV.n.copy(r).normalize();r.copy(NV.n).multiplyScalar(R0);NV.os.crossVectors(om,r);const sp=w3.subVectors(v,NV.os).length()*1e6;
 if(b.kind==='star'){ship.hold={b,off:r.clone()};v.set(0,0,0);flash('Too close to '+b.name+'. Holding at the photosphere.');return}
 fwd.set(0,0,-1).applyQuaternion(ship.q);fwd.addScaledVector(NV.n,-fwd.dot(NV.n));if(fwd.lengthSq()<1e-8)fwd.set(1,0,0).cross(NV.n);m4.lookAt(ZERO,fwd.normalize(),NV.n);ship.q.setFromRotationMatrix(m4);
 spinQ(b,qS);const inv=qS.clone().invert();ship.land={b,lo:r.clone().applyQuaternion(inv),lq:inv.multiply(ship.q)};v.copy(NV.os);
 const gas=b.kind==='planet'&&['jupiter','saturn','uranus','neptune'].includes(b.id),sv=fmtV(sp/1000);
 flash(gas?'Reached the 1-bar cloud level of '+b.name+' at '+sv+'. There is no surface to stand on.':sp<=12?'Touched down on '+b.name+' at '+sv+'.':sp<=60?'Hard landing on '+b.name+' at '+sv+'.':'Crashed into '+b.name+' at '+sv+'. In reality the ship would not survive.',9000)}
// predicted path around the dominant body
const predA=new THREE.BufferAttribute(new Float32Array(1201*3),3);predA.setUsage(THREE.DynamicDrawUsage);
const predG=new THREE.BufferGeometry();predG.setAttribute('position',predA);predG.setDrawRange(0,0);
const predM=new THREE.LineBasicMaterial({color:0xffc861,transparent:true,opacity:.85});const pred=new THREE.Line(predG,predM);pred.frustumCulled=false;pred.visible=false;scene.add(pred);
const orb={txt:'—',alt:'—'};
function predictOrbit(){const ref=ship.ref;pred.visible=false;if(!ship.on||ship.mode!=='newton'||!ref)return;const mu=ref.GM*1e-9,R=ref.R*KM;
 const r=NV.x.subVectors(ship.pos,ref.pos),v=NV.y.subVectors(ship.vel,ref.vel||ZERO),rl=r.length(),vl=v.length(),alt=(rl-R-ship.def.size*.6)/KM;
 const vr=v.dot(r)/rl;orb.alt=dist(Math.max(0,alt))+(Math.abs(vr)>1e-9?', '+(vr>0?'climbing ':'falling ')+fmtV(Math.abs(vr)/KM):'');
 if(ship.land){orb.txt='Landed on '+ref.name;orb.alt='On the surface';return}if(ship.hold){orb.txt='Station-keeping (not orbiting)';return}
 const E=vl*vl/2-mu/rl,hv=w3.crossVectors(r,v),ev=gT.crossVectors(v,hv).divideScalar(mu).addScaledVector(r,-1/rl),e=ev.length();
 let total,N=1200;if(E<0){const a=-mu/(2*E),P=TAU*Math.sqrt(a*a*a/mu),pe=(a*(1-e)-R)/KM,apo=(a*(1+e)-R)/KM;total=P;
  orb.txt=pe<0?'Suborbital, will hit '+ref.name:'Pe '+dist(pe)+' · Ap '+dist(apo)+' · period '+fmtDur(P)}
 else{total=8*rl/Math.max(vl,1e-12);orb.txt='Escaping '+ref.name+(e<1.0001?'':' (e '+e.toFixed(2)+')')}
 const P=predA.array,h=total/N/4,x=r.clone(),u=v.clone(),g=new V3();let k=0;
 for(;k<=N;k++){P[k*3]=x.x;P[k*3+1]=x.y;P[k*3+2]=x.z;if(x.length()<R)break;
  for(let s=0;s<4;s++){const xl=x.length();g.copy(x).multiplyScalar(-mu/(xl*xl*xl));u.addScaledVector(g,h*.5);x.addScaledVector(u,h);const xl2=x.length();g.copy(x).multiplyScalar(-mu/(xl2*xl2*xl2));u.addScaledVector(g,h*.5)}}
 predG.setDrawRange(0,Math.min(N+1,k+1));predA.needsUpdate=true;pred.visible=true;predM.color.setHex(look.view==='wire'?0x3dff8a:0xffc861)}
function setFM(m){if(!ship.on){ship.mode=m;fmUI();return}if(m===ship.mode)return;
 if(ship.mode==='free'){const b=ship.fref||refBody(ship.pos);ship.v=0;ship.fs=0;ship.anchor=b;ship.off.subVectors(ship.pos,b.pos);ship.mv.set(0,0,-1).applyQuaternion(ship.q)}
 if(m==='free'){ship.ap=null;ship.land=null;ship.hold=null;ship.anchor=null;ship.v=0;ship.fs=0;ship.thr=0;pred.visible=false;ship.mode=m;fmUI();apUI();
  flash('Free flight. Hold W to fly; your speed follows your height above the nearest world. + and − change the pace.',7000);return}
 if(m==='newton'){ship.ap=null;const a=ship.anchor;ship.vel.copy(ship.mv).multiplyScalar(ship.v);if(a){ship.hold={b:a,off:ship.pos.clone().sub(a.pos)};ship.vel.copy(a.vel||ZERO)}ship.anchor=null;ship.v=0;ship.thr=0;
  flash('Newtonian flight. W S thrust, A D strafe, Space Shift up and down, X matches velocity, O orbits, L lands.',8000)}
 else{ship.ap=null;const b=ship.land?ship.land.b:ship.hold?ship.hold.b:null;ship.land=null;ship.hold=null;ship.v=0;ship.thr=0;if(b){ship.anchor=b;ship.off.subVectors(ship.pos,b.pos)}pred.visible=false;
  flash('Cruise flight. Press 0 to 5 for a cruise speed, P for light-speed autopilot.',7000)}
 ship.mode=m;fmUI();apUI()}
function fmUI(){const nw=ship.mode==='newton';document.querySelectorAll('[data-fm]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fm===ship.mode)));$('#nw-opts').hidden=!nw;$('#cr-opts').hidden=ship.mode!=='cruise';
 $('#h-keys').textContent=(ship.mode==='free'?'Hold W to fly, S back, A D strafe, Space Shift up and down, arrows turn, Q E roll, + and − change the pace, X stop, P autopilot, N switch flight model, C camera':nw?'Arrows rotate, Q E roll, W S thrust, A D strafe, Space Shift up and down, X match velocity, P autopilot, O orbit, L land, N cruise mode, , and . time warp, C camera':'Arrow keys steer, Q E roll, W S throttle, 0 to 5 cruise speeds, X stop, P autopilot, J jump, N Newtonian mode, C camera')+'. Drag to orbit the camera, scroll to zoom, Home resets the camera.';
 document.querySelectorAll('.nwrow').forEach(e=>e.hidden=!nw)}
function setThrust(lg){ship.acc=Math.pow(10,lg)*9.80665;$('#thrust').value=lg;$('#thrv').textContent=gee(ship.acc)}
function apMode(mode){if(!ship.on||ship.mode!=='newton')return;if(ship.ap&&ship.ap.mode===mode){apOff('Autopilot off');return}
 const ref=ship.ref||refBody(ship.pos);if(mode==='land'&&ref.kind==='star'){flash('You can’t land on a star.');return}
 if(mode==='land'&&ship.land){flash('Already on the ground.');return}
 ship.hold=null;if(mode!=='land')ship.land=null;ship.ap={mode,to:ship.target,t0:performance.now(),sim0:sim};
 flash({circ:'Burning for a circular orbit around '+ref.name+'.',land:'Landing on '+ref.name+'.',match:'Matching velocity with '+(ship.target||ref).name+'.'}[mode]);apUI()}
// prograde and retrograde markers (relative to the target)
// the yellow line is the predicted path under gravity; a label a little way along it says so
const predLb=document.createElement('div');predLb.className='lb static off';predLb.style.color='#ffc861';predLb.innerHTML='<i></i><span>Predicted path</span>';$('#labels').appendChild(predLb);
function updatePredLabel(){let show=pred.visible&&opt.labels;if(show){const n=predG.drawRange.count,k=Math.min(n-1,Math.max(3,Math.floor(n*.06))),a=predA.array;
  v3.set(a[k*3],a[k*3+1],a[k*3+2]).add(pred.position).project(camera);if(v3.z>1||Math.abs(v3.x)>.95||Math.abs(v3.y)>.95)show=false;
  else predLb.style.transform='translate('+((v3.x+1)/2*innerWidth).toFixed(1)+'px,'+((1-v3.y)/2*innerHeight).toFixed(1)+'px)'}
 predLb.classList.toggle('off',!show)}
function updateMarkers(){updatePredLabel();const pro=$('#mk-pro'),ret=$('#mk-ret');let ok=ship.on&&ship.mode==='newton'&&!ship.land&&!ship.hold;
 if(ok){const T=ship.target||ship.ref;NV.u.subVectors(ship.vel,T.vel||ZERO);if(NV.u.lengthSq()<1e-18)ok=false;else{NV.u.normalize();
  [[pro,1],[ret,-1]].forEach(([el,s])=>{v3.copy(NV.u).multiplyScalar(s*camera.position.length()*40+1e-3).add(camera.position).project(camera);
   if(v3.z>1||Math.abs(v3.x)>1||Math.abs(v3.y)>1)el.style.display='none';else{el.style.display='block';el.style.transform='translate('+((v3.x+1)/2*innerWidth).toFixed(1)+'px,'+((1-v3.y)/2*innerHeight).toFixed(1)+'px)'}})}}
 if(!ok){pro.style.display='none';ret.style.display='none'}}

function capFor(b){return b.el?Math.pow(b.el[0],1.5)*3.15576e7*.01:b.parent?Math.abs(b.P)*864:1e12}
function updateShip(raw,now,simDt){const NW=ship.mode==='newton',FR=ship.mode==='free';const def=ship.def,dt=Math.min(.1,raw),cap=FR?1e300:CKM*KM*ship.mult;
 if(!ship.ap){const SN=NW||FR;tgt.set((SN?K('ArrowUp','PageUp'):K('ArrowUp','KeyR','PageUp')?1:0)-(SN?K('ArrowDown','PageDown'):K('ArrowDown','KeyF','PageDown')?1:0)+mouse.y,(SN?K('ArrowLeft'):K('KeyA','ArrowLeft')?1:0)-(SN?K('ArrowRight'):K('KeyD','ArrowRight')?1:0)+mouse.x,(K('KeyQ')?1:0)-(K('KeyE')?1:0)).multiplyScalar(1.15);
  // two smoothing stages give an S-curve: turns ease in and ease out instead of snapping to full rate
  ship.avT.lerp(tgt,Math.min(1,dt*5));ship.av.lerp(ship.avT,Math.min(1,dt*5))}
 else{ship.avT.multiplyScalar(1-Math.min(1,dt*6));ship.av.multiplyScalar(1-Math.min(1,dt*6))}
 if(ship.av.lengthSq()>1e-8){eul.set(ship.av.x*dt,ship.av.y*dt,ship.av.z*dt);qd.setFromEuler(eul);ship.q.multiply(qd).normalize()}
 let rem=0,ang=0;
 if(NW){
  // holding W builds the engine up smoothly, from the set thrust to about a thousand times it, so real distances stay crossable (not with realistic thrust)
  if(!ship.ap&&!$('#l-realthr').checked&&K('KeyW','Equal','NumpadAdd'))ship.boostT=(ship.boostT||0)+dt;else ship.boostT=Math.max(0,(ship.boostT||0)-dt*3);
  ship.boost=Math.pow(10,Math.min(3,Math.max(0,ship.boostT-1.2)*.75));
  // the autopilot speeds time up on its own so a trip takes seconds to a minute, and eases back to real time for the arrival
  {let want=1;if(ship.ap&&(ship.ap.mode||'go')==='go'&&ship.ap.to){const T=ship.ap.to,rem=Math.max(0,ship.pos.distanceTo(T.pos)-arriveN(T))/KM*1000,a=ship.acc*.8,cm=CKM*1000*ship.mult,vm=Math.sqrt(a*rem);
    want=Math.min(1e6,Math.max(1,Math.sqrt((vm>cm?rem/cm+cm/a:2*Math.sqrt(rem/a))*2000))); // warp ~ sqrt(time left): Mars in ~20 s, the Moon in ~5
    // and never so fast that a world comes up within a couple of real seconds: what limits it is how quickly we are closing on the ground
    // (climbing away or circling is free to speed up; coming in, time settles back toward real time)
    for(const w of [ship.ref||T,T]){const rp=w3.subVectors(ship.pos,w.pos),rl=rp.length(),alt=Math.max(0,rl/KM-w.R),close=Math.max(0,-gT.subVectors(ship.vel,w.vel||ZERO).dot(rp)/rl/KM)+.2;
     want=Math.min(want,Math.max(1,alt/(close*2)))}}
   ship.warpAuto=Math.exp(Math.log(ship.warpAuto||1)+(Math.log(want)-Math.log(ship.warpAuto||1))*Math.min(1,dt*(want>1?1.2:5)))}
  newtonStep(dt,simDt||0,now);if(ship.ref)ship.capP=Math.min(capFor(ship.land?ship.land.b:ship.ref),ship.ap&&ship.ap.to?capFor(ship.ap.to):1e12);const T=ship.target||ship.ref||B[0];w3.subVectors(ship.vel,T.vel||ZERO);ship.v=w3.length();if(ship.v>0)ship.mv.copy(w3).normalize();else fwd.set(0,0,-1).applyQuaternion(ship.q)}
 else{
 if(ship.ap){const b=ship.ap.to;sdir.subVectors(b.pos,ship.pos);const d=sdir.length();sdir.divideScalar(d);rem=d-arriveR(b);
  if(rem<=b.R*KM*.003)arrive(b,now);
  else{up.set(0,1,0).applyQuaternion(ship.q);m4.lookAt(ZERO,sdir,up);tq.setFromRotationMatrix(m4);ang=ship.q.angleTo(tq);ship.q.rotateTowards(tq,raw*1.4);
   const vt=ang>.35?0:Math.min(cap,rem*1.6)*(ang>.06?.08:1),a=Math.min(1,raw*2.2);
   if(vt<=0){ship.v*=1-a}else if(vt<ship.v)ship.v+=(vt-ship.v)*Math.min(1,raw*3);else{const lv=Math.log(Math.max(ship.v,vt*1e-4));ship.v=Math.exp(lv+(Math.log(vt)-lv)*a)}}}
 else if(FR){
  // free flight: speed is a fraction of your height above the nearest surface, so the same key eases you down to the ground and races you
  // across interplanetary and interstellar distances. You ride along with that world, and turn with it near the ground.
  let fb=null,h=Infinity;for(const b of ALL){if(b.kind==='probe')continue;const d=ship.pos.distanceTo(b.pos)-b.R*KM;if(d<h){h=d;fb=b}}
  ship.fref=fb;
  if(fb&&fb.prev&&simDt>0){ship.pos.add(w3.subVectors(fb.pos,fb.prev));
   const low=1-smst(.15,.6,h/(fb.R*KM));
   if(low>0&&fb.rot&&fb.kind!=='star'){qd.setFromAxisAngle(w3.copy(Y1).applyQuaternion(fb.eq||IDQ),TAU*simDt/(fb.rot*3600)*low);
    w0.subVectors(ship.pos,fb.pos).applyQuaternion(qd);ship.pos.copy(fb.pos).add(w0);ship.q.premultiply(qd);cq.premultiply(qd)}}
  if(K('Equal','NumpadAdd'))ship.fk=Math.min(8,ship.fk*Math.exp(raw*1.5));if(K('Minus','NumpadSubtract'))ship.fk=Math.max(.03,ship.fk*Math.exp(-raw*1.5));
  tgt.set((K('KeyD')?1:0)-(K('KeyA')?1:0),(K('Space')?1:0)-(K('ShiftLeft','ShiftRight')?1:0),(K('KeyS')?1:0)-(K('KeyW')?1:0));
  const on=tgt.lengthSq()>0&&!ship.stop;ship.fs+=((on?1:0)-ship.fs)*Math.min(1,raw*(on?2.2:4));if(ship.fs<1e-4)ship.fs=0;
  if(on)ship.fdir.copy(tgt).normalize().applyQuaternion(ship.q);
  ship.v=ship.fs*ship.fk*Math.max(h,def.size*2);ship.mv.copy(ship.fdir)}
 else{ // the throttle sets a cruise speed (W raises it, S lowers it, X zeroes it); the engines ease the ship to it
  if(K('KeyW','Equal','NumpadAdd'))ship.thr=Math.max(ship.thr,.5*KM)*Math.exp(raw*1.4);
  if(K('KeyS','Minus','NumpadSubtract')){ship.thr*=Math.exp(-raw*2.2);if(ship.thr<.02*KM)ship.thr=0}
  ship.thr=Math.min(ship.thr,cap);
  if(ship.v<ship.thr)ship.v=Math.min(ship.thr,Math.max(ship.v,.5*KM)*Math.exp(raw*2.2));
  else if(ship.v>ship.thr){ship.v=ship.thr+(ship.v-ship.thr)*Math.exp(-raw*(ship.thr?2.5:5));if(!ship.thr&&ship.v<.02*KM)ship.v=0}}
 if(FR&&!ship.ap)ship.anchor=null;
 else if(ship.anchor){if(ship.v>0)ship.anchor=null;else ship.pos.copy(ship.anchor.pos).add(ship.off)}
 else if(ship.v===0){let best=null,bd=Infinity;for(const b of ALL){if(b.kind==='probe'&&!b.on)continue;const d=ship.pos.distanceTo(b.pos);if(d<b.R*KM*200&&d-b.R*KM<bd){bd=d-b.R*KM;best=b}}if(best){ship.anchor=best;ship.off.subVectors(ship.pos,best.pos)}}
 fwd.set(0,0,-1).applyQuaternion(ship.q);if(!FR||ship.ap)ship.mv.copy(ship.ap&&ang<.06?sdir:fwd);
 if(ship.v>0){let step=ship.v*raw;if(ship.ap)step=Math.min(step,Math.max(0,rem));ship.pos.addScaledVector(ship.mv,step)}
 for(const b of ALL){if(b.kind==='probe')continue;const r=b.R*KM+def.size*.6;if(ship.pos.distanceTo(b.pos)<r*.9999){w3.subVectors(ship.pos,b.pos).normalize();ship.pos.copy(b.pos).addScaledVector(w3,r);
  if(ship.v>0&&ship.mv.dot(w3)<0){ship.v=0;ship.thr=0;ship.ap=null;ship.anchor=b;ship.off.subVectors(ship.pos,b.pos);apUI();flash(b.kind==='star'?'Too close to '+b.name+'. Holding at the photosphere.':'Touched down on '+b.name+'.')}}}}
 origin.copy(ship.pos);
 const kms=ship.v/KM,f=kms>0?Math.min(1.4,Math.log10(1+kms)/5.5):0;
 const push=FR?ship.fs*(K('KeyS')&&!K('KeyW')?0:1):NW?Math.min(1,ship.tf*(1+Math.log10(ship.boost||1))):(K('KeyW','Equal','NumpadAdd')||ship.v<ship.thr*.98?1:0);
 ship.kick=(ship.kick||0)+(push-(ship.kick||0))*Math.min(1,dt*(push>(ship.kick||0)?2.5:1.5));
 const fov=45+24*smst(.55,1.3,f)+8*ship.kick;if(Math.abs(fov-camera.fov)>.05){camera.fov+=(fov-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix()}
 if(ship.cam==='chase'){cq.slerp(ship.q,Math.min(1,dt*4.5));
  // drag swings the rig around the ship and the wheel sets its distance; both glide to where you put them
  const e=Math.min(1,dt*8);ship.cy+=(ship.cyT-ship.cy)*e;ship.cp+=(ship.cpT-ship.cp)*e;ship.chase*=Math.pow(ship.chaseT/ship.chase,e);
  const D=ship.chase*(1+.18*f+.3*ship.kick);qo.setFromEuler(eo.set(ship.cp,ship.cy,0,'YXZ')).premultiply(cq);
  camera.position.set(0,D*.12,D).applyQuaternion(qo);camera.up.set(0,1,0).applyQuaternion(qo);w3.set(0,D*.09,-D*2).applyQuaternion(qo);camera.lookAt(w3)}
 else if(ship.cam==='cockpit'){camera.position.set(0,def.size*.06,-def.size*.3).applyQuaternion(ship.q);camera.quaternion.copy(ship.q);camera.up.set(0,1,0).applyQuaternion(ship.q)}
 else controls.update();
 def.obj.visible=ship.cam!=='cockpit';def.obj.quaternion.copy(ship.q);if(def.spin)def.spin.rotation.z+=dt*.06;
 if(NW){const bl=Math.log10(ship.boost||1);def.plumes.forEach(p=>{p.visible=ship.tf>.005;p.scale.set(1+bl*.15,1+bl*.15,(.35+ship.tf*1.4)*(1+bl*.6))});plumeM.opacity=.55*Math.min(1,.25+ship.tf)}
 else{const thrusting=K('KeyW','Equal','NumpadAdd')||ship.v<ship.thr*.98||!!ship.ap;def.plumes.forEach(p=>{p.visible=f>.01;p.scale.set(1,1,(.25+f)*(thrusting?1.25:.7))});plumeM.opacity=.5*Math.min(1,f*1.6)}
 // dust drifting past the ship, so motion shows at any speed: at walking pace it creeps by at its true rate (the box is about 14 ship lengths),
 // faster than one box a second the rate is compressed logarithmically and the streaks lengthen
 const S=def.size*14,rate=ship.v*(NW?Math.max(1,speed,ship.warpAuto||1):1)/S,disp=rate<1?rate:1+Math.log(rate),sh=disp*2*dt,st=Math.min(.12,.015+disp*.02+.08*f*f*f),P=dustA.array,mv=ship.mv;
 for(let i=0;i<DN;i++){let x=dustP[i*3]-mv.x*sh,y=dustP[i*3+1]-mv.y*sh,z=dustP[i*3+2]-mv.z*sh;
  x=x>1?x-2:x<-1?x+2:x;y=y>1?y-2:y<-1?y+2:y;z=z>1?z-2:z<-1?z+2:z;dustP[i*3]=x;dustP[i*3+1]=y;dustP[i*3+2]=z;
  const o=i*6;P[o]=x*S;P[o+1]=y*S;P[o+2]=z*S;P[o+3]=(x+mv.x*st)*S;P[o+4]=(y+mv.y*st)*S;P[o+5]=(z+mv.z*st)*S}
 dustA.needsUpdate=true;dustM.opacity=.25*Math.min(1,rate*3)/(1+Math.log(Math.max(1,rate))*.6);dust.visible=rate>.005&&ship.cam!=='look'}
function renderShip(){const def=ship.def,cd=camera.position.length();shipCam.position.copy(camera.position);shipCam.quaternion.copy(camera.quaternion);
 shipCam.near=Math.max(def.size*.004,cd*.002);shipCam.far=cd*3+def.size*120;shipCam.aspect=camera.aspect;shipCam.fov=camera.fov;shipCam.updateProjectionMatrix();
 sunL.position.copy(B[0].loc).normalize();sunL.intensity=Math.PI*1.1*Math.min(1e3,Math.pow(AU/Math.max(ship.pos.distanceTo(B[0].pos),1),2))*PE.value;shipAmb.intensity=.05*PE.value;renderer.clearDepth();renderer.render(shipScene,shipCam)}

/* Sun glare: a starburst, halo and lens ghosts drawn over everything in screen space. How much of the Sun's disk is in view (any world in
   front of it, worked out like the eclipse shader) sets its strength, so it dims at a planet's limb and vanishes behind it. */
const GL={scene:new THREE.Scene(),cam:new THREE.OrthographicCamera(-1,1,1,-1,-1,1),on:false};
function glareTex(spikes,ghost){const n=256,cv=document.createElement('canvas');cv.width=cv.height=n;const cx=cv.getContext('2d'),c=n/2;cx.globalCompositeOperation='lighter';
 const rad=(r,s)=>{const g=cx.createRadialGradient(c,c,0,c,c,r);s.forEach(x=>g.addColorStop(x[0],x[1]));cx.fillStyle=g;cx.fillRect(0,0,n,n)};
 if(ghost){rad(c,[[0,'rgba(255,255,255,0)'],[.7,'rgba(255,255,255,.25)'],[.85,'rgba(255,255,255,.5)'],[1,'rgba(255,255,255,0)']]);return canvasTex(cv)}
 rad(c,[[0,'rgba(255,255,255,1)'],[.04,'rgba(255,250,235,.95)'],[.12,'rgba(255,230,190,.35)'],[.4,'rgba(255,210,160,.08)'],[1,'rgba(255,200,150,0)']]);
 for(let k=0;k<spikes;k++){cx.save();cx.translate(c,c);cx.rotate(k/spikes*Math.PI+.3);const g=cx.createLinearGradient(-c,0,c,0);
  g.addColorStop(0,'rgba(255,240,220,0)');g.addColorStop(.5,'rgba(255,245,230,.55)');g.addColorStop(1,'rgba(255,240,220,0)');cx.fillStyle=g;cx.fillRect(-c,-1.2,n,2.4);cx.restore()}
 return canvasTex(cv)}
const glareM=(t,col)=>new THREE.MeshBasicMaterial({map:t,color:col,transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
GL.burst=new THREE.Mesh(new THREE.PlaneGeometry(2,2),glareM(glareTex(6,false),0xffffff));GL.scene.add(GL.burst);
GL.ghosts=[[-.35,.09,0x7fb2ff],[-.75,.05,0xffd27a],[-1.25,.14,0x9cffc6],[.45,.04,0xff9a7a]].map(([f,s,c])=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2),glareM(glareTex(0,true),c));m.userData={f,s};GL.scene.add(m);return m});
const gS=new THREE.Vector3(),gO=new THREE.Vector3();
function updateGlare(){const s=B[0];GL.on=false;if(look.view!=='real'||!s.obj.visible)return;
 gS.copy(s.obj.position).sub(camera.position);const ds=gS.length(),as=s.R*KM/ds;if(ds<s.R*KM*1.5)return;gS.divideScalar(ds);
 // fraction of the Sun's disk in view: every other world, judged as overlapping disks
 let vis=1;for(const b of ALL){if(b===s||!b.obj||!b.obj.visible||!b.R)continue;gO.copy(b.obj.position).sub(camera.position);const t=gO.dot(gS);if(t<=0||t>ds)continue;
  const dO=gO.length(),ao=Math.asin(Math.min(1,b.R*KM/dO)),sep=Math.acos(Math.min(1,Math.max(-1,gO.dot(gS)/dO)));if(sep>as+ao)continue;
  const full=Math.min(1,ao*ao/(as*as)),x=Math.min(1,Math.max(0,(sep-Math.abs(as-ao))/(as+ao-Math.abs(as-ao))));vis*=1-full*(1-x*x*(3-2*x))}
 v3.copy(s.obj.position).project(camera);if(v3.z>1)return;const edge=Math.max(Math.abs(v3.x),Math.abs(v3.y));vis*=1-smst(1,1.35,edge);if(vis<.003)return;
 const asp=camera.aspect,au=ds/AU,I=vis*Math.min(2.5,1/Math.max(au,.2)),r=.55*Math.min(1.6,Math.pow(I,.35))*Math.max(.5,Math.min(1.4,as*120));
 GL.cam.left=-asp;GL.cam.right=asp;GL.cam.updateProjectionMatrix();const x=v3.x*asp,y=v3.y;
 GL.burst.position.set(x,y,0);GL.burst.scale.setScalar(r);GL.burst.material.opacity=Math.min(1,I*.9);
 for(const g of GL.ghosts){const u=g.userData;g.position.set(x*u.f,y*u.f,0);g.scale.setScalar(u.s*(1+edge*.6));g.material.opacity=Math.min(.3,I*.16)*(1-smst(.9,1.3,edge))}
 GL.on=true}

function hud(now){const t=ship.target,k=ship.v/KM,capK=CKM*ship.mult;
 $('#h-ship').textContent=ship.def.name;$('#h-setl').textContent='Cruise set';
 if(ship.mode==='newton'){predictOrbit();const T=t||ship.ref,ap=ship.ap;
  $('#h-mode').textContent='Newtonian · '+(ship.land?'Landed on '+ship.land.b.name:ship.hold?'Station-keeping at '+ship.hold.b.name+' · W to fly':ap?{go:'Autopilot to '+(ap.to||T).name,circ:'Orbit insertion',land:'Landing',match:'Matching velocity'}[ap.mode]+(ship.warpAuto>1.5?' · time ×'+fmtX(ship.warpAuto):''):ship.tf>.005?'Thrusting'+(ship.boost>1.5?' ×'+fmtX(ship.boost):''):'Coasting');
  const kk=ship.land?0:k;$('#h-spd').innerHTML=fmtV(kk)+'<small>'+(ship.land?'on the surface of '+ship.land.b.name:'relative to '+T.name)+(kk>.01*CKM?', '+fmtC(kk):'')+'</small>';
  $('#thr i').style.width=(ship.tf*100).toFixed(1)+'%';$('#thr b').style.display='none';
  $('#h-setl').textContent='Engine';$('#h-set').textContent='Thrust '+gee(ship.acc)+(ship.drag>.5?' · drag '+gee(ship.drag)+(ship.drag>30&&k>3?', re-entry heating':''):'');
  {const p=pullAt(ship.pos);$('#h-g').textContent=fmtA(p.a)+', mostly '+p.top.name}
  const d=ship.pos.distanceTo(T.pos),sd=Math.max(0,d-T.R*KM-ship.def.size*.6);$('#h-tgt').textContent=T.name;$('#h-dist').textContent=dist(sd/KM);$('#h-lt').textContent=fmtDur(sd/(CKM*KM));
  let eta='—';const rem=Math.max(0,d-arriveN(T))/KM*1000,a=ship.acc*.8;
  if(ap&&ap.mode==='go'){const vm=Math.sqrt(a*rem),cm=CKM*1000*ship.mult;eta=rem<1?'Arriving':vm>cm?fmtDur(rem/cm+cm/a):fmtDur(2*Math.sqrt(rem/a))}
  else{w3.subVectors(T.pos,ship.pos).normalize();const cl=-NV.u.subVectors(ship.vel,T.vel||ZERO).dot(w3);if(cl>1e-9&&!ship.hold&&!ship.land)eta=fmtDur(sd/cl)+' at this speed'}
  $('#h-eta').textContent=eta;
  {const e=ship.pos.distanceTo(byId.earth.pos)/KM;$('#h-sig').textContent=e<5e4?'Under 0.2 s':fmtDur(e/CKM)}
  $('#h-alt').textContent=!ship.ref?'—':ship.land?orb.alt:orb.alt+' above '+ship.ref.name;$('#h-orb').textContent=orb.txt;
  $('#h-warp').textContent=(ship.warpAuto>1.5?'Autopilot ×'+fmtX(ship.warpAuto):speed<=1?'Real time':$('#speedv').textContent)+(ship.warpLim?', limited near '+(ship.ref?ship.ref.name:'')+' for accuracy':'')+'  (, and . to change)';
  $('#h-msg').textContent=now<ship.msgT?ship.msg:'';return}
 const FR=ship.mode==='free',fb=ship.fref;
 $('#h-mode').textContent=FR?(ship.ap?'Free flight · autopilot to '+ship.ap.to.name:ship.fs>.01?'Free flight · flying':'Free flight · hovering'+(fb?' near '+fb.name:'')):ship.ap?'Autopilot '+ship.mult+'c':ship.anchor?'Holding at '+ship.anchor.name:ship.v<ship.thr*.98?'Accelerating':ship.v>ship.thr*1.02?'Slowing':ship.v>0?'Cruising':'Drifting';
 $('#h-spd').innerHTML=fmtV(k)+'<small>'+(FR&&fb?'relative to '+fb.name+(k>.01*CKM?', '+fmtC(k):''):fmtC(k))+'</small>';
 const lw=x=>x>0?Math.min(100,Math.log10(1+x)/Math.log10(1+capK)*100):0;$('#thr i').style.width=(FR?ship.fs*100:lw(k)).toFixed(1)+'%';
 {const tb=$('#thr b'),ts=ship.thr/KM;tb.style.display=ship.ap?'none':'block';tb.style.left='calc('+lw(ts).toFixed(1)+'% - 1px)';$('#h-set').textContent=ship.ap?'Autopilot':ts?(ts>=.01*CKM?fmtC(ts):fmtV(ts)):'Stopped'}
 if(FR){$('#thr b').style.display='none';$('#h-setl').textContent='Pace';$('#h-set').textContent=ship.fk.toPrecision(2)+' × height per second (+ and −)'}
 {const p=pullAt(ship.pos);$('#h-g').textContent=fmtA(p.a)+', mostly '+p.top.name}
 if(t){const d=ship.pos.distanceTo(t.pos),sd=Math.max(0,d-t.R*KM);$('#h-tgt').textContent=t.name;$('#h-dist').textContent=dist(sd/KM);$('#h-lt').textContent=fmtDur(sd/(CKM*KM));
  let eta='—';if(ship.ap&&FR){const r=Math.max(0,d-arriveR(t));eta=fmtDur(Math.log(Math.max(1,r/(t.R*KM*.003)))/1.6+1)}
  else if(ship.ap){const vc=CKM*KM*ship.mult,r=Math.max(0,d-arriveR(t));eta=r*1.6<vc?'Arriving':fmtDur(r/vc)}
  else if(ship.v>0){w3.subVectors(t.pos,ship.pos).normalize();if(w3.dot(fwd)>.995)eta=fmtDur(sd/ship.v)}
  $('#h-eta').textContent=eta}
 {const e=ship.pos.distanceTo(byId.earth.pos)/KM;$('#h-sig').textContent=e<5e4?'Under 0.2 s':fmtDur(e/CKM)}
 $('#h-msg').textContent=now<ship.msgT?ship.msg:''}

/* controls */
const shipSel=$('#shipSel');[['real','Real spacecraft'],['tgo','TGO originals']].forEach(([k,l])=>{const og=document.createElement('optgroup');og.label=l;
 SHIPS.forEach((s,i)=>{if(s.kind===k){const o=document.createElement('option');o.value=i;o.textContent=s.name;og.appendChild(o)}});shipSel.appendChild(og)});
$('#launch').addEventListener('click',()=>{ship.on?exitShip():launch()});
$('#mult').addEventListener('input',e=>{ship.mult=+e.target.value;$('#multv').textContent=ship.mult+'c'});
document.querySelectorAll('[data-cr]').forEach(b=>b.addEventListener('click',()=>{if(ship.on){if(ship.mode!=='cruise')setFM('cruise');cruise(+b.dataset.cr)}}));
document.querySelectorAll('[data-fm]').forEach(b=>b.addEventListener('click',()=>setFM(b.dataset.fm)));
$('#thrust').addEventListener('input',e=>{setThrust(+e.target.value);$('#l-realthr').checked=Math.abs(ship.acc/ship.rated-1)<.02});
$('#b-orbit').addEventListener('click',()=>apMode('circ'));$('#b-land').addEventListener('click',()=>apMode('land'));$('#b-match').addEventListener('click',()=>apMode('match'));
fmUI();
$('#apGo').addEventListener('click',()=>{ship.ap?apOff('Autopilot off'):apOn()});
$('#sjump').addEventListener('click',shipJump);
document.querySelectorAll('[data-travel]').forEach(b=>b.addEventListener('click',()=>{travel=b.dataset.travel;document.querySelectorAll('[data-travel]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}));
const STEER=['Space','ShiftLeft','ShiftRight','KeyM','KeyW','KeyA','KeyS','KeyD','Equal','Minus','NumpadAdd','NumpadSubtract','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','KeyR','KeyF','PageUp','PageDown'];
function press(c){
 if(c==='Comma'||c==='Period'){const sp=$('#speed');sp.value=Math.max(ship.mode==='newton'?5:0,Math.min(10,+sp.value+(c==='Period'?1:-1)));sp.dispatchEvent(new Event('input'));return true}
 if(c==='KeyN'){setFM({free:'newton',newton:'cruise',cruise:'free'}[ship.mode]);return true}
 if(ship.mode==='free'){if(c==='KeyX'){ship.fs=0;ship.v=0;if(ship.ap)apOff('Stopped');return true}if(/^(?:Digit|Numpad)[0-5]$/.test(c))setFM('cruise')}
 if(ship.mode==='newton'){if(c==='KeyX'){keys[c]=true;if(ship.ap)apOff('Manual control');return true}if(c==='KeyO'){apMode('circ');return true}if(c==='KeyL'){apMode('land');return true}if(/^(?:Digit|Numpad)[0-5]$/.test(c))setFM('cruise')}
 if(STEER.includes(c)){keys[c]=true;if(ship.ap&&!['KeyW','ArrowUp'].includes(c))apOff('Manual control');else if(ship.ap&&['KeyW','ArrowUp'].includes(c))apOff('Manual control');return true}
 {const m=/^(?:Digit|Numpad)([0-5])$/.exec(c);if(m){cruise(+m[1]);return true}}
 switch(c){case 'KeyX':if(ship.ap)apOff('Manual control');cruise(0);return true;case 'KeyP':ship.ap?apOff('Autopilot off'):apOn();return true;
  case 'KeyJ':shipJump();return true;case 'KeyC':toggleCam();return true}
 return false}
const typing=t=>t&&(t.tagName==='INPUT'&&t.type!=='checkbox'&&t.type!=='range'||t.tagName==='SELECT'||t.tagName==='TEXTAREA');
addEventListener('keydown',e=>{if(!ship.on||e.ctrlKey||e.metaKey||e.altKey||typing(e.target))return;if(e.target.type==='range')e.target.blur();if(press(e.code))e.preventDefault()});
addEventListener('keyup',e=>{keys[e.code]=false});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false});
// drag on the view: in chase view it orbits the camera around the ship; in the cockpit it steers, like a joystick
canvas.addEventListener('pointerdown',e=>{if(!ship.on||ship.cam==='look')return;mouse.down=true;mouse.sx=mouse.lx=e.clientX;mouse.sy=mouse.ly=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!mouse.down)return;
 if(ship.cam==='chase'){ship.cyT-=(e.clientX-mouse.lx)*.006;ship.cpT=Math.max(-1.35,Math.min(1.35,ship.cpT-(e.clientY-mouse.ly)*.006));mouse.lx=e.clientX;mouse.ly=e.clientY;return}
 const k=Math.min(innerWidth,innerHeight)*.25;mouse.x=Math.max(-1,Math.min(1,-(e.clientX-mouse.sx)/k));mouse.y=Math.max(-1,Math.min(1,-(e.clientY-mouse.sy)/k))});
const mUp=()=>{mouse.down=false;mouse.x=mouse.y=0};canvas.addEventListener('pointerup',mUp);canvas.addEventListener('pointercancel',mUp);
document.querySelectorAll('#pad button').forEach(bt=>{const c=bt.dataset.k,rel=()=>{keys[c]=false};
 bt.addEventListener('pointerdown',e=>{e.preventDefault();bt.setPointerCapture(e.pointerId);if(ship.on)press(c)});
 bt.addEventListener('pointerup',rel);bt.addEventListener('pointercancel',rel);bt.addEventListener('lostpointercapture',rel)});

// scroll wheel: chase distance when flying, otherwise our eased zoom (free look keeps the orbit controls' own)
addEventListener('wheel',e=>{if(e.target!==canvas||(ship.on&&ship.cam==='look'))return;e.preventDefault();e.stopPropagation();
 const dy=e.deltaY*(e.deltaMode===1?33:e.deltaMode===2?innerHeight:1);zoomBy(Math.exp(Math.max(-600,Math.min(600,dy))*.0016))},{capture:true,passive:false});
// the world under the pointer, nearest first; tiny ones get a few pixels of slack
function bodyAt(cx,cy){let best=null,bd=Infinity;const W=innerWidth,H=innerHeight,t=Math.tan(camera.fov*D2R/2);
 for(const b of ALL){if(!b.obj||!b.obj.visible||!b.R)continue;v3.copy(b.obj.position).project(camera);if(v3.z>1)continue;
  const d=b.obj.position.distanceTo(camera.position),r=b.R*KM/(d*t)*H/2;if(Math.hypot((v3.x+1)/2*W-cx,(1-v3.y)/2*H-cy)<Math.max(r,6)+3&&d<bd){bd=d;best=b}}
 return best}
canvas.addEventListener('dblclick',e=>{const b=bodyAt(e.clientX,e.clientY);if(b)pick(b)});
function resetCam(){if(ship.on){if(ship.cam==='look')controls.enabled=false;ship.cam='chase';ship.cyT=ship.cpT=0;ship.chaseT=ship.def.size*3.6;flash('Camera reset',2500);return}if(!fly)go(focus)}
addEventListener('keydown',e=>{if(e.code!=='Home'||e.ctrlKey||e.metaKey||e.altKey||typing(e.target))return;e.preventDefault();resetCam()});
// flight bar: More, help and collapse; the panels above it follow its height
function hudH(){document.documentElement.style.setProperty('--hudh',$('#hud').offsetHeight+'px')}
function hudTog(btn,box){const o=box.hidden;box.hidden=!o;btn.setAttribute('aria-expanded',String(o));hudH()}
$('#h-more').addEventListener('click',()=>hudTog($('#h-more'),$('#h-extra')));
$('#h-help').addEventListener('click',()=>hudTog($('#h-help'),$('#h-helpbox')));
$('#h-min').addEventListener('click',()=>{const m=$('#hud').classList.toggle('min'),b=$('#h-min');b.textContent=m?'+':'–';b.setAttribute('aria-expanded',String(!m));b.setAttribute('aria-label',m?'Expand flight bar':'Collapse flight bar');hudH()});
new ResizeObserver(hudH).observe($('#hud'));
$('#l-realthr').addEventListener('change',realThrust);
$('#leave').addEventListener('click',exitShip);

/* view, lighting and theme */
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#l-light').addEventListener('change',e=>{look.lit=e.target.checked});
// interface colour and light/dark, remembered per browser (the head script applies them before the first paint)
const ui={accent:document.documentElement.dataset.accent||'gray',mode:document.documentElement.dataset.theme||'dark'};
function applyUI(){const r=document.documentElement;r.dataset.accent=ui.accent;r.dataset.theme=ui.mode;$('#theme').textContent=ui.mode==='light'?'Dark interface':'Light interface';
 document.querySelectorAll('[data-accent]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.accent===ui.accent))});try{localStorage.setItem('tgo.ui',JSON.stringify(ui))}catch(e){}}
$('#theme').addEventListener('click',()=>{ui.mode=ui.mode==='light'?'dark':'light';applyUI()});
document.querySelectorAll('.sw [data-accent]').forEach(b=>b.addEventListener('click',()=>{ui.accent=b.dataset.accent;applyUI()}));applyUI();


// ?debug exposes the internals for checking things from the browser console
if(/[?&]debug\b/.test(location.search))window.TGO={B,byId,ALL,sky,CAT,XC,SB,camera,controls,renderer,look,origin,ship,TL,hdr,opt,go:id=>go(byId[id]),launch,get playing(){return playing},set playing(v){playing=v},get focus(){return focus},setSim:t=>{sim=t},
 // render n frames now, for checks while the tab is in the background (where requestAnimationFrame pauses)
 step:(n=1,ms=16)=>{const raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;try{for(let i=0;i<n;i++){last=performance.now()-ms;frame(performance.now())}}finally{window.requestAnimationFrame=raf}}};

// auto-exposure, like an eye adapting: each sunlit world pulls the exposure toward its own brightness in proportion to how much of the
// view it fills, so a small dot changes nothing and a planet filling the screen sets it fully. Empty space sits at exposure 1. Inside an
// atmosphere by day the sky itself is metered. Darkening is quick, brightening slow, as with eyes.
const EXP={e:1,key:.42,min:1e-4,max:400},ef=new THREE.Vector3();
function updateExposure(dt){
 if(look.view!=='real'||!look.lit){EXP.e=1;PE.value=1;AB.sg.value=1;return}
 const W=innerWidth,H=innerHeight,k=H/(2*Math.tan(camera.fov*D2R/2));camera.getWorldDirection(ef);
 let sw=0,sl=0;
 for(const b of B){if(!b.obj.visible)continue;const p=b.obj.position,R=b.R*KM;w3a.subVectors(p,camera.position);const d=w3a.length();
  if(d<=R||w3a.dot(ef)<-R)continue;
  const rp=R/Math.sqrt(d*d-R*R)*k,cover=Math.min(1,Math.PI*rp*rp/(W*H)),w=smst(.0004,.07,cover);if(w<=0)continue;
  let L;if(b.kind==='star')L=SUN_DISC*.6;else{w3.subVectors(B[0].obj.position,p).normalize();const ph=(1-w3.dot(w3a.normalize()))/2;
   L=(GAS[b.id]?.5:.3)*b.sunEU.value*Math.max(ph,.004)}
  sw+=w;sl+=w*Math.log(Math.min(EXP.max,Math.max(EXP.min,EXP.key/L)))}
 for(const id in SCAT){const b=byId[id],R=b.R*KM,d=b.obj.position.distanceTo(camera.position);if(d>R*SCAT[id].Ra)continue;
  w3a.subVectors(camera.position,b.obj.position).normalize();w3.subVectors(B[0].obj.position,b.obj.position).normalize();
  const day=smst(-.12,.25,w3a.dot(w3)),air=1-(d/R-1)/(SCAT[id].Ra-1),w=day*Math.min(1,air*3);if(w<=0)continue;
  const L=.35*b.sunEU.value;sw+=w*2;sl+=w*2*Math.log(Math.min(EXP.max,Math.max(EXP.min,EXP.key/L)))}
 const tgt=sw>0?sl/Math.max(1,sw):0,cur=Math.log(EXP.e),r=tgt<cur?3.5:1.2;
 EXP.e=Math.exp(cur+(tgt-cur)*(1-Math.exp(-dt*r)));PE.value=EXP.e;
 AB.sg.value=Math.pow(Math.min(EXP.e,4),.6);
 sunB.glow.material.color.setScalar(4*Math.min(EXP.e,3));
 probeSun.intensity=Math.PI*1.1*Math.min(1e3,Math.pow(AU/Math.max(B[0].obj.position.distanceTo(camera.position),1),2))*EXP.e;probeAmb.intensity=.05*EXP.e}

/* loop */
setView('real');
updatePositions(); // so everything has a real position even before the first frame (a launch from a background tab, for example)
camera.position.set(0,.8,1).setLength(6*AU);controls.minDistance=focus.R*KM*1.0006;controls.update();setFocusUI(focus);
let last=performance.now(),infoT=0,lastSimEnd=sim;
function frame(now){
 const raw=Math.min(86400,Math.max(0,(now-last)/1000)),dt=Math.min(.1,raw);last=now;
 let simDt=0;if(playing){if(ship.on&&ship.mode==="newton"){simDt=Math.max(1,speed,ship.warpAuto||1)*dt;if(simDt>ship.warpCapS){simDt=ship.warpCapS;ship.warpLim=true}else ship.warpLim=false}else simDt=speed*(ship.on?raw:dt)}
 const jumped=Math.abs(sim-lastSimEnd)>1;for(const b of ALL)(b.prev||(b.prev=new THREE.Vector3())).copy(b.pos);
 sim+=simDt*1000;
 updatePositions();
 if(jumped){if(ship.on&&ship.mode==='newton'&&!ship.land&&!ship.hold){const rb=ship.ref||B[0];ship.hold={b:rb,off:ship.pos.clone().sub(rb.prev)};flash('Time jump: holding position relative to '+rb.name+'.')}for(const b of ALL)b.prev.copy(b.pos)}
 else if(simDt>0)for(const b of ALL)(b.vel||(b.vel=new THREE.Vector3())).subVectors(b.pos,b.prev).divideScalar(simDt);
 lastSimEnd=sim;
 if(tour&&!fly&&now>tour.next){tour.i++;if(tour.i>=TOUR.length)stopTour();else go(byId[TOUR[tour.i]])}
 if(ship.on)updateShip(raw,now,simDt);
 else if(fly){let s=Math.min(1,(now-fly.t0)/fly.dur);const e=s<.5?4*s*s*s:1-Math.pow(-2*s+2,3)/2;
  origin.lerpVectors(fly.fromBody?fly.fromBody.pos:fly.fromPt,fly.to.pos,e);
  camera.position.copy(fly.dir).multiplyScalar(Math.exp(fly.l0+(fly.l1-fly.l0)*e+fly.bump*Math.sin(Math.PI*e)));camera.lookAt(0,0,0);
  if(s>=1)land()}
 else{origin.copy(focus.pos);zoomStep(dt);controls.rotateSpeed=.6*Math.min(1,Math.max(.003,(camera.position.length()/(focus.R*KM)-1)*1.2));controls.update()}
 for(const b of B)b.loc.subVectors(b.pos,origin);
 for(const s of XS){s.loc.subVectors(s.pos,origin);s.obj.position.copy(s.loc)}updateProbes();updateComets();updateSB();
 if(pred.visible&&ship.ref)pred.position.copy(ship.ref.pos).sub(origin);
 const cur=fly?fly.to:focus,cd=camera.position.length();
 const fon=opt.fabric&&!ship.on?1:0;fk+=(fon-fk)*Math.min(1,dt*6);if(Math.abs(fk-fon)<.002)fk=fon;
 fabLine.visible=fk>0;if(fk>0)updateFabric(cd,cur);
 const ride=opt.ride?fk:0;
 for(const b of B){b.obj.position.copy(b.loc);if(ride>0){const y=heightAt(b.loc.x,b.loc.z)+b.R*KM;b.obj.position.y+=(y-b.loc.y)*ride}
  b.obj.visible=!b.parent||opt.moons||b===focus;if(b.soiM){b.soiM.position.copy(b.obj.position);b.soiM.visible=look.view==='gravity'&&b.obj.visible&&(!b.parent||moonVisible(b)||b===focus)}}
 for(const b of B)placeOrbit(b,ride);
 helio.visible=opt.helio&&!ship.on;helio.position.copy(B[0].loc).negate().add(B[0].loc).sub(origin);
 updateSky();updateStars();updateXC();updateLook();updateExposure(dt);updateTiles();updateMaps(now);
 hdr.bloomOn=opt.bloom;hdr.begin();renderer.render(scene,camera);if(ship.on)renderShip();
 updateGlare();if(GL.on){renderer.clearDepth();renderer.render(GL.scene,GL.cam)}hdr.end();updateLabels();updateMarkers();
 if(now-infoT>250){infoT=now;updateInfo();if(look.view==='gravity')updatePull();if(ship.on)hud(now);const d=new Date(sim);$('#date').textContent=isNaN(d)?'—':d.toISOString().slice(0,16).replace('T',' ')+' UTC';const yr=d.getUTCFullYear();$('#dwarn').hidden=!(yr<-3000||yr>3000)}
 requestAnimationFrame(frame)}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;shipCam.aspect=camera.aspect;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);hdr.setSize()});
requestAnimationFrame(frame);
