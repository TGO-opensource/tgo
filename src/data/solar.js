// The Sun, planets, moons and dwarf planets with their elements, rotation poles and the Moon's theory.
import * as THREE from 'three';
import {D2R,TAU,AU,KM,CKM,G,J2000} from '../core/units.js';

const B=[
{id:'sun',name:'Sun',kind:'star',R:695700,GM:1.32712440018e11,rot:609.12,tilt:7.25},
{id:'mercury',name:'Mercury',kind:'planet',R:2439.7,GM:22031.8,rot:1407.6,tilt:.03,el:[.38709927,.20563593,7.00497902,252.2503235,77.45779628,48.33076593,149472.67411175]},
{id:'venus',name:'Venus',kind:'planet',R:6051.8,GM:324858.6,rot:-5832.5,tilt:2.64,el:[.72333566,.00677672,3.39467605,181.9790995,131.60246718,76.67984255,58517.81538729]},
{id:'earth',name:'Earth',kind:'planet',R:6371,GM:398600.4,rot:23.9345,tilt:23.44,el:[1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0,35999.37244981]},
{id:'moon',name:'Moon',kind:'moon',parent:'earth',R:1737.4,GM:4902.8,a:384400,P:27.321661},
{id:'mars',name:'Mars',kind:'planet',R:3389.5,GM:42828.4,rot:24.6229,tilt:25.19,el:[1.52371034,.0933941,1.84969142,-4.55343205,-23.94362959,49.55953891,19140.30268499]},
{id:'phobos',name:'Phobos',kind:'moon',parent:'mars',R:11.27,GM:7.087e-4,a:9376,P:.31891},
{id:'deimos',name:'Deimos',kind:'moon',parent:'mars',R:6.2,GM:9.6e-5,a:23463,P:1.26244},
{id:'jupiter',name:'Jupiter',kind:'planet',R:69911,GM:1.26686534e8,rot:9.925,tilt:3.13,el:[5.202887,.04838624,1.30439695,34.39644051,14.72847983,100.47390909,3034.74612775]},
{id:'io',name:'Io',kind:'moon',parent:'jupiter',R:1821.6,GM:5959.9,a:421700,P:1.769138},
{id:'europa',name:'Europa',kind:'moon',parent:'jupiter',R:1560.8,GM:3202.7,a:671034,P:3.551181},
{id:'ganymede',name:'Ganymede',kind:'moon',parent:'jupiter',R:2634.1,GM:9887.8,a:1070412,P:7.154553},
{id:'callisto',name:'Callisto',kind:'moon',parent:'jupiter',R:2410.3,GM:7179.3,a:1882709,P:16.689017},
{id:'saturn',name:'Saturn',kind:'planet',R:58232,GM:3.7931187e7,rot:10.656,tilt:26.73,rings:[74658,92000,117580,122170,136775],el:[9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448,1222.49362201]},
{id:'mimas',name:'Mimas',kind:'moon',parent:'saturn',R:198.2,GM:2.503,a:186000,P:.942422},
{id:'enceladus',name:'Enceladus',kind:'moon',parent:'saturn',R:252.1,GM:7.21,a:238400,P:1.370218},
{id:'tethys',name:'Tethys',kind:'moon',parent:'saturn',R:531.1,GM:41.21,a:295000,P:1.887802},
{id:'dione',name:'Dione',kind:'moon',parent:'saturn',R:561.4,GM:73.12,a:377700,P:2.736915},
{id:'rhea',name:'Rhea',kind:'moon',parent:'saturn',R:763.8,GM:153.9,a:527108,P:4.518212},
{id:'titan',name:'Titan',kind:'moon',parent:'saturn',R:2574.7,GM:8978.1,a:1221870,P:15.945421},
{id:'iapetus',name:'Iapetus',kind:'moon',parent:'saturn',R:734.5,GM:120.5,a:3561700,P:79.3215},
{id:'uranus',name:'Uranus',kind:'planet',R:25362,GM:5.793939e6,rot:-17.24,tilt:97.77,el:[19.18916464,.04725744,.77263783,313.23810451,170.9542763,74.01692503,428.48202785]},
{id:'miranda',name:'Miranda',kind:'moon',parent:'uranus',R:235.8,GM:4.32,a:129846,P:1.413479},
{id:'ariel',name:'Ariel',kind:'moon',parent:'uranus',R:578.9,GM:83.46,a:190929,P:2.520379},
{id:'umbriel',name:'Umbriel',kind:'moon',parent:'uranus',R:584.7,GM:85.09,a:265986,P:4.144177},
{id:'titania',name:'Titania',kind:'moon',parent:'uranus',R:788.4,GM:228.2,a:435910,P:8.705872},
{id:'oberon',name:'Oberon',kind:'moon',parent:'uranus',R:761.4,GM:205.3,a:583520,P:13.463239},
{id:'neptune',name:'Neptune',kind:'planet',R:24622,GM:6.836529e6,rot:16.11,tilt:28.32,el:[30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574,218.45945325]},
{id:'triton',name:'Triton',kind:'moon',parent:'neptune',R:1353.4,GM:1427.6,a:354759,P:-5.876854},
{id:'pluto',name:'Pluto',kind:'dwarf',R:1188.3,GM:869.6,rot:-153.29,tilt:119.6,el:[39.48211675,.2488273,17.14001206,238.92903833,224.06891629,110.30393684,145.20780515]},
{id:'charon',name:'Charon',kind:'moon',parent:'pluto',R:606,GM:105.9,a:19591,P:6.387221}
];
// dwarf planets and the largest asteroids, from JPL SBDB osculating elements (ecliptic J2000):
// [id, name, mean radius km, GM km³/s², rotation h, e, perihelion q AU, i, node, arg. perihelion (deg), perihelion time JD]. Sedna's mass is an estimate.
[['ceres','Ceres',469.7,62.6284,9.074,.0796923,2.5451594,10.5880278,80.2486268,73.2942145,2461599.8414666],
 ['pallas','Pallas',256.5,13.63,7.813,.2307001,2.1306215,34.9327932,172.8866193,310.9699162,2461695.0311644],
 ['vesta','Vesta',261.4,17.2883,5.342,.0902037,2.1483619,7.1439255,103.7012933,151.4686478,2460901.5873798],
 ['hygiea','Hygiea',203.6,7,13.83,.1067093,2.8147359,3.8295299,283.1198928,312.4242387,2461813.2008287],
 ['eris','Eris',1163,1108,378.9,.4382385,38.1626735,43.9258279,36.0047704,150.7949236,2545407.716847],
 ['makemake','Makemake',715,207,22.83,.158889,38.3302134,29.027856,79.2948338,297.0922733,2408158.6940986],
 ['haumea','Haumea',780,267.4,3.915,.194443,34.6875176,28.2084739,121.7860561,240.6905473,2500416.5996153],
 ['sedna','Sedna',500,66,10.27,.8598825,76.1846436,11.9252758,144.5061663,311.0987726,2479264.7506871]].forEach(([id,name,R,GM,rot,e,q,i,om,w,tp])=>{
 const a=q/(1-e),n=.9856076686/Math.pow(a,1.5);B.push({id,name,kind:'dwarf',R,GM,rot,tilt:0,el:[a,e,i,om+w+n*(2451545-tp),om+w,om,n*36525]})});
const byId={};B.forEach(b=>byId[b.id]=b);
// JPL "Approximate Positions of the Planets" (Standish and Williams): Table 1 for 1800 to 2050, Tables 2a and 2b for 3000 BC to AD 3000.
// Each row: [a, e, I, L, long. perihelion, long. node] and their rates per Julian century.
const PL1={mercury:[[.38709927,.20563593,7.00497902,252.2503235,77.45779628,48.33076593],[.00000037,.00001906,-.00594749,149472.67411175,.16047689,-.12534081]],
venus:[[.72333566,.00677672,3.39467605,181.9790995,131.60246718,76.67984255],[.0000039,-.00004107,-.0007889,58517.81538729,.00268329,-.27769418]],
earth:[[1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0],[.00000562,-.00004392,-.01294668,35999.37244981,.32327364,0]],
mars:[[1.52371034,.0933941,1.84969142,-4.55343205,-23.94362959,49.55953891],[.00001847,.00007882,-.00813131,19140.30268499,.44441088,-.29257343]],
jupiter:[[5.202887,.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-.00011607,-.00013253,-.00183714,3034.74612775,.21252668,.20469106]],
saturn:[[9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-.0012506,-.00050991,.00193609,1222.49362201,-.41897216,-.28867794]],
uranus:[[19.18916464,.04725744,.77263783,313.23810451,170.9542763,74.01692503],[-.00196176,-.00004397,-.00242939,428.48202785,.40805281,.04240589]],
neptune:[[30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574],[.00026291,.00005105,.00035372,218.45945325,-.32241464,-.00508664]]};
const PL2={mercury:[[.38709843,.20563661,7.00559432,252.25166724,77.45771895,48.33961819],[0,.00002123,-.00590158,149472.67486623,.15940013,-.12214182]],
venus:[[.72332102,.00676399,3.39777545,181.9797085,131.76755713,76.67261496],[-.00000026,-.00005107,.00043494,58517.8156026,.05679648,-.27274174]],
earth:[[1.00000018,.01673163,-.00054346,100.46691572,102.93005885,-5.11260389],[-.00000003,-.00003661,-.01337178,35999.37306329,.3179526,-.24123856]],
mars:[[1.52371243,.09336511,1.85181869,-4.56813164,-23.91744784,49.71320984],[.00000097,.00009149,-.00724757,19140.29934243,.45223625,-.26852431]],
jupiter:[[5.20248019,.0485359,1.29861416,34.33479152,14.27495244,100.29282654],[-.00002864,.00018026,-.00322699,3034.90371757,.18199196,.13024619],[-.00012452,.0606406,-.35635438,38.35125]],
saturn:[[9.54149883,.05550825,2.49424102,50.07571329,92.86136063,113.63998702],[-.00003065,-.00032044,.00451969,1222.11494724,.54179478,-.25015002],[.00025899,-.13434469,.87320147,38.35125]],
uranus:[[19.18797948,.0468574,.77298127,314.20276625,172.43404441,73.96250215],[-.00020455,-.0000155,-.00180155,428.49512595,.09266985,.05739699],[.00058331,-.97731848,.17689245,7.67025]],
neptune:[[30.06952752,.00895439,1.7700552,304.22289287,46.68158724,131.78635853],[.00006447,.00000818,.000224,218.46515314,.01009938,-.00606302],[-.00041348,.68346318,-.10162547,7.67025]]};
// JPL planetary satellite mean elements, epoch J2000 (MAR099, JUP365, SAT441, URA182, NEP098, PLU060).
// [a km, e, arg. periapsis, mean anomaly, i, node, node precession period (yr), reference pole RA, Dec]. Angles in degrees,
// i and node measured in the Laplace plane (or planet equator) from its ascending node on the ICRF equator.
const MEL={phobos:[9375,.015,216.3,189.7,1.1,169.2,2.3,317.7,52.9],deimos:[23457,0,0,205,1.8,54.3,56.2,316.6,53.5],
io:[421800,.004,49.1,330.9,0,0,0,268.1,64.5],europa:[671100,.009,45,345.4,.5,184,30.202,268.1,64.5],ganymede:[1070400,.001,198.3,324.8,.2,58.5,137.812,268.2,64.6],callisto:[1882700,.007,43.8,87.4,.3,309.1,577.264,268.7,64.8],
mimas:[186000,.02,160.4,275.3,1.6,66.2,.986,40.6,83.5],enceladus:[238400,.005,119.5,57,0,0,0,40.6,83.5],tethys:[295000,.001,335.3,0,1.1,273,4.982,40.6,83.5],dione:[377700,.002,116,212,0,0,0,40.6,83.5],
rhea:[527200,.001,44.3,31.5,.3,133.7,35.775,40.6,83.5],titan:[1221900,.029,78.3,11.7,.3,78.6,687.37,36.4,84],iapetus:[3561700,.028,254.5,74.8,7.6,86.5,3130.302,288.7,78.9],
miranda:[129846,.001,154.8,73,4.4,100.9,17.787,77.311,15.175],ariel:[190929,.001,9.6,193.5,0,0,0,77.311,15.175],umbriel:[265986,.004,183.4,253,.1,174.8,129.945,77.311,15.175],
titania:[436298,.002,184,68.1,.1,29.5,1644.649,77.311,15.175],oberon:[583511,.002,132.2,143.6,.1,76.8,192.798,77.311,15.175],
triton:[354800,0,0,63,157.3,177.7,299.4,299.36,43.46],charon:[19600,0,0,304.1,0,0,0,312.993,6.163]};
// IAU rotation models: pole RA, pole Dec, prime meridian W0 and daily rate (degrees). Moons without one stay tidally locked to their planet.
const POLE={sun:[286.13,63.87,84.176,14.1844],mercury:[281.01,61.45,329.548,6.1385025],venus:[272.76,67.16,160.2,-1.4813688],earth:[0,90,190.147,360.9856235],moon:[269.9949,66.5392,38.3213,13.17635815],mars:[317.68143,52.8865,176.63,350.89198226],jupiter:[268.056595,64.495303,284.95,870.536],saturn:[40.589,83.537,38.9,810.7939024],uranus:[257.311,-15.175,203.81,-501.1600928],neptune:[299.36,43.46,253.18,536.3128492],pluto:[132.993,-6.163,302.695,56.3625225]};
const OBL=23.4392911*D2R;
function eqToScene(x,y,z,out){const ye=y*Math.cos(OBL)+z*Math.sin(OBL),ze=-y*Math.sin(OBL)+z*Math.cos(OBL);return out.set(x,ze,-ye)}
function poleQuat(a0,d0){a0*=D2R;d0*=D2R;const p=eqToScene(Math.cos(d0)*Math.cos(a0),Math.cos(d0)*Math.sin(a0),Math.sin(d0),new THREE.Vector3()),
 q=eqToScene(-Math.sin(a0),Math.cos(a0),0,new THREE.Vector3()),z=new THREE.Vector3().crossVectors(q,p);return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(q,p,z))}
// Earth's Moon from the main terms of Meeus' lunar theory (ch. 47), referred to the J2000 ecliptic
function moonPos(T,out){const r=x=>(x%360)*D2R,s=Math.sin,c=Math.cos;
 const Lp=218.3164477+481267.88123421*T,D=r(297.8501921+445267.1114034*T),M=r(357.5291092+35999.0502909*T),Mp=r(134.9633964+477198.8675055*T),F=r(93.272095+483202.0175233*T);
 const lon=Lp+6.288774*s(Mp)+1.274027*s(2*D-Mp)+.658314*s(2*D)+.213618*s(2*Mp)-.185116*s(M)-.114332*s(2*F)+.058793*s(2*D-2*Mp)+.057066*s(2*D-M-Mp)+.053322*s(2*D+Mp)+.045758*s(2*D-M)-.040923*s(M-Mp)-.03472*s(D)-.030383*s(M+Mp)-1.396971*T;
 const lat=5.128122*s(F)+.280602*s(Mp+F)+.277693*s(Mp-F)+.173237*s(2*D-F)+.055413*s(2*D-Mp+F)+.046271*s(2*D-Mp-F);
 const dk=385000.56-20905.355*c(Mp)-3699.111*c(2*D-Mp)-2955.968*c(2*D)-569.925*c(2*Mp)+48.888*c(M)-3.149*c(2*F)+246.158*c(2*D-2*Mp)-152.138*c(2*D-M-Mp)-170.733*c(2*D+Mp)-204.586*c(2*D-M)-129.62*c(M-Mp)+108.743*c(D)+104.755*c(M+Mp);
 const L=lon*D2R,Bt=lat*D2R,k=dk*KM;return out.set(k*Math.cos(Bt)*Math.cos(L),k*Math.sin(Bt),-k*Math.cos(Bt)*Math.sin(L))}
const moonNode=T=>125.0445479-1934.1362891*T-1.396971*T;
function moonPlane(T){return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),moonNode(T)*D2R).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),5.145*D2R))}
export {B,byId,PL1,PL2,MEL,POLE,OBL,eqToScene,poleQuat,moonPos,moonNode,moonPlane};
