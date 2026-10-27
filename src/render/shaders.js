// Shaders and palettes for worlds: surfaces, clouds, atmospheres (scattering and rim haze), rings, and the thermal and gravity views.
// Every lit shader outputs linear radiance (1 = a white surface facing the Sun at 1 AU) times preExp, the camera exposure.
/* look: realistic, thermal and blueprint views */
const TEMP={sun:[5500,5500,0],mercury:[430,-180,100],venus:[464,464,0],earth:[30,10,60],moon:[120,-170,60],mars:[20,-80,60],phobos:[-4,-112,10],deimos:[-4,-112,10],jupiter:[-110,-110,0],io:[-130,-160,10],europa:[-160,-190,30],ganymede:[-120,-190,30],callisto:[-110,-190,30],saturn:[-140,-140,0],enceladus:[-198,-210,10],rhea:[-174,-220,20],titan:[-179,-180,3],uranus:[-195,-195,0],titania:[-190,-210,10],oberon:[-190,-210,10],neptune:[-200,-200,0],triton:[-235,-237,2],pluto:[-225,-235,5],charon:[-220,-240,5],mimas:[-200,-210,10],tethys:[-187,-207,10],dione:[-186,-200,10],iapetus:[-143,-213,20],miranda:[-187,-213,10],ariel:[-190,-213,10],umbriel:[-198,-213,10]};
const ATMO={earth:[.35,.6,1,1.025],venus:[1,.88,.6,1.03],mars:[1,.6,.4,1.015],titan:[1,.62,.25,1.06],jupiter:[.95,.85,.65,1.012],saturn:[1,.92,.7,1.012],uranus:[.6,.9,1,1.02],neptune:[.45,.62,1,1.02],pluto:[.6,.75,1,1.01]};
const heatX=T=>Math.pow(Math.min(1,Math.max(0,(T+273)/800)),.6);
const GLSL_HEAT=`vec3 heat(float t){t=clamp(t,0.,1.);vec3 a=vec3(0.,0.,.04),b=vec3(.33,.06,.43),c=vec3(.75,.21,.33),d=vec3(.98,.55,.04),e=vec3(.99,1.,.7);
 return t<.25?mix(a,b,t/.25):t<.5?mix(b,c,(t-.25)/.25):t<.75?mix(c,d,(t-.5)/.25):mix(d,e,(t-.75)/.25);}`;
// gravity palette: weak pull deep blue, strong pull pale gold. Scale is log10 of m/s², from 0.001 to about 316.
const GSTOP=[[.04,.05,.2],[.1,.26,.66],[.1,.64,.82],[.52,.92,.6],[1,.97,.72]];
const GLSL_GRAV=`vec3 grav(float t){t=clamp(t,0.,1.);vec3 a=vec3(${GSTOP[0]}),b=vec3(${GSTOP[1]}),c=vec3(${GSTOP[2]}),d=vec3(${GSTOP[3]}),e=vec3(${GSTOP[4]});
 return t<.25?mix(a,b,t/.25):t<.5?mix(b,c,(t-.25)/.25):t<.75?mix(c,d,(t-.5)/.25):mix(d,e,(t-.75)/.25);}`;
function gravRGB(t){t=Math.min(1,Math.max(0,t))*4;const k=Math.min(3,Math.floor(t)),f=t-k,a=GSTOP[k],b=GSTOP[k+1];return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f]}
const gravX=g=>(Math.log10(Math.max(g,1e-5))+3)/5.5;
const HEATS=[[0,0,.04],[.33,.06,.43],[.75,.21,.33],[.98,.55,.04],[.99,1,.7]];
function heatRGB(t){t=Math.min(1,Math.max(0,t))*4;const k=Math.min(3,Math.floor(t)),f=t-k,a=HEATS[k],b=HEATS[k+1];return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f]}
const VS=`#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
void main(){vUv=uv;vL=position;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;
#include <logdepthbuf_vertex>
}`;
// eclipses: how much of the Sun's disk the nearest few bodies hide from a point (umbra, penumbra and annular), as two overlapping disks.
// occ[i] = centre and radius of an occluder (scene units, camera-relative), occA[i] = 1 if it has an atmosphere that bends red light into its shadow
const GLSL_OCC=`uniform vec4 occ[4];uniform float occA[4],sunR;
float diskOcc(float as,float ao,float d){if(d>=as+ao)return 0.;float full=min(1.,ao*ao/(as*as));return full*(1.-smoothstep(abs(as-ao),as+ao,d));}
vec3 shade(vec3 P){vec3 S=sunPos-P;float ds=length(S);vec3 Ls=S/ds;float as=sunR/ds,lf=1.,red=0.;
 for(int i=0;i<4;i++){if(occ[i].w<=0.)continue;vec3 O=occ[i].xyz-P;if(dot(O,Ls)<=0.)continue;float dO=length(O),ao=asin(min(1.,occ[i].w/dO));
  float f=diskOcc(as,ao,acos(clamp(dot(O/dO,Ls),-1.,1.)));lf*=1.-f;red=max(red,smoothstep(.97,1.,f)*occA[i]);}
 return vec3(lf)+vec3(.62,.2,.06)*red*.5;}`;
const FS_BODY=`#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map,night,spec;uniform float hasNight,hasSpec,lit,mode,emissive,gsurf,gcent,sunE,preExp,photo,sunDisc;uniform vec3 sunPos,temp;
varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
${GLSL_HEAT}
${GLSL_GRAV}
${GLSL_OCC}
#ifdef RINGS
uniform sampler2D ringT;uniform vec3 ringN,ringC;uniform vec2 ringR;
// the rings' shadow: follow the ray toward the Sun to the ring plane and read the ring's opacity there
float ringShade(vec3 P,vec3 L){float dn=dot(L,ringN);if(abs(dn)<1e-4)return 1.;float t=dot(ringC-P,ringN)/dn;if(t<=0.)return 1.;
 float r=length(P+L*t-ringC);if(r<ringR.x||r>ringR.y)return 1.;return 1.-.92*texture2D(ringT,vec2((r-ringR.x)/(ringR.y-ringR.x),.5)).a;}
#endif
void main(){
#include <logdepthbuf_fragment>
 vec3 N=normalize(vN),L=normalize(sunPos-vP),V=normalize(cameraPosition-vP);float ndl=dot(N,L);vec3 col;
 if(mode<.5){vec3 tex=texture2D(map,vUv).rgb;
  if(emissive>.5){float mu=max(dot(N,V),0.);col=tex*mix(vec3(1.,.5,.2),vec3(1.),pow(mu,.5))*(.3+.75*pow(mu,.6))*sunDisc;}
  else{vec3 sh=lit>.5?shade(vP):vec3(1.);
#ifdef RINGS
   if(lit>.5)sh*=ringShade(vP,L);
#endif
   float mu0=max(ndl,0.),mv=max(dot(N,V),0.),d=mu0;
   if(lit<.5)d=1.;else if(photo>1.5)d=pow(mu0,1.25)*pow(max(mv,.05),.25);else if(photo>.5)d=mix(mu0,2.*mu0/(mu0+mv+1e-4),.7);
   col=tex*(lit>.5?3e-4+d*sunE*sh:vec3(1.));
   if(hasSpec>.5&&lit>.5)col+=vec3(1.,.95,.85)*pow(max(dot(reflect(-L,N),V),0.),38.)*clamp((tex.b-max(tex.r,tex.g*.85))*20.,0.,1.)*(1.-smoothstep(.05,.15,dot(tex,vec3(.333))))*.55*step(0.,ndl)*sh.x*sunE;
   if(hasNight>.5&&lit>.5)col+=max(texture2D(night,vUv).r-.16,0.)*1.19*vec3(1.,.8,.5)*(1.-smoothstep(-.12,.06,ndl))*.06;}
  float lu=dot(col,vec3(.2126,.7152,.0722));col=max(mix(vec3(lu),col,1.08),0.)*preExp;}
 else if(mode<1.5){float la=normalize(vL).y;float T=emissive>.5?temp.x:mix(temp.y,temp.x,pow(max(ndl,0.),.35))-temp.z*la*la;
  col=heat(pow(clamp((T+273.)/800.,0.,1.),.6));if(lit<.5&&emissive<.5)col=heat(pow(clamp((temp.x+273.)/800.,0.,1.),.6));}
 else{float la=normalize(vL).y,g=max(gsurf-gcent*(1.-la*la),1e-5),lg=log(g)/log(10.);col=grav(clamp((lg+3.)/5.5,0.,1.));
  col*=.8+.2*smoothstep(0.,.14,abs(fract(lg*20.)-.5)*2.);if(emissive<.5&&lit>.5)col*=.42+.66*max(ndl,0.);}
 if(mode>.5)col=pow(col,vec3(2.2)); // false-colour palettes are authored in sRGB
 gl_FragColor=vec4(min(col,vec3(40.)),1.);}`; // capped so bloom stays a soft round glow (the glare overlay draws the rest)
const FS_CLOUD=`#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;uniform vec3 sunPos;uniform float lit,fade,sunE,preExp,detail;varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
${GLSL_OCC}
float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
#include <logdepthbuf_fragment>
 float a=clamp(texture2D(map,vUv).r*2.4,0.,1.);
 // close up the map's texels are kilometres wide, so break the edges into wisps with fine noise
 if(detail>0.){vec3 q=normalize(vL);float n=vn3(q*160.)*.5+vn3(q*410.)*.3+vn3(q*1050.)*.2;a=mix(a,smoothstep(.2,.8,a+(n-.5)*.85),detail);}vec3 d=lit>.5?max(dot(normalize(vN),normalize(sunPos-vP)),0.)*.9*shade(vP)*sunE+3e-4:vec3(1.);gl_FragColor=vec4(d*preExp,a*.92*fade);}`;
// atmospheres you can see through: single scattering (Rayleigh for air, Mie with a forward lobe for haze and dust) along the view ray, 8 samples,
// with sunlight dimmed on its way in by the Chapman airmass. Lengths are in planet radii; coefficients are per radius. Output is premultiplied,
// so daylit sky washes out the stars behind it while the ground seen from orbit only picks up a thin blue veil.
const SCAT={earth:{bR:[36.9,86,210.9],bM:133.8,hR:8/6371,hM:1.2/6371,g:.76,I:3.6,Ra:1.025},
 mars:{bR:[67.5,46.1,19.6],bM:67.8,hR:11.1/3389.5,hM:11.1/3389.5,g:.76,I:6.5,Ra:1.035},
 venus:{bR:[30,24,12],bM:60,hR:15.9/6051.8,hM:15.9/6051.8,g:.7,I:4,Ra:1.03},
 titan:{bR:[51,31,10],bM:40,hR:40/2574.7,hM:40/2574.7,g:.6,I:6,Ra:1.12}};
const FS_SCAT=`#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunPos,pc,bR;uniform float lit,R,Ra,hR,hM,bM,g,sunI,sunE,preExp;varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
${GLSL_OCC}
vec2 hitS(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,h=b*b-c;if(h<0.)return vec2(-1.);h=sqrt(h);return vec2(-b-h,-b+h);}
float am(float mu,float X){float c=sqrt(1.5708*X);return c/((c-1.)*max(mu,0.)+1.)*(1.+max(-mu,0.)*c*4.);}
void main(){
#include <logdepthbuf_fragment>
 vec3 o=(cameraPosition-pc)/R,d=normalize(vP-cameraPosition),Ls=normalize(sunPos-pc);
 vec2 ta=hitS(o,d,Ra),tp=hitS(o,d,1.);float t0=max(ta.x,0.),t1=ta.y;bool ground=tp.x>0.;if(ground)t1=min(t1,tp.x);if(t1<=t0)discard;
 float dt=(t1-t0)/float(NS),odR=0.,odM=0.;vec3 sR=vec3(0.),sM=vec3(0.);
 for(int i=0;i<NS;i++){vec3 p=o+d*(t0+dt*(float(i)+.5));float r=length(p),h=max(r-1.,0.),dR=exp(-h/hR)*dt,dM=exp(-h/hM)*dt;odR+=dR;odM+=dM;
  if(lit>.5&&hitS(p,Ls,1.).x>0.)continue;
  float mu=dot(p/r,Ls),lR=exp(-h/hR)*hR*am(mu,r/hR),lM=exp(-h/hM)*hM*am(mu,r/hM);vec3 T=exp(-(bR*(odR+lR)+bM*1.1*(odM+lM)));sR+=T*dR;sM+=T*dM;}
 float c=dot(d,Ls),g2=g*g,pR=.0596831*(1.+c*c),pM=.1193662*(1.-g2)*(1.+c*c)/((2.+g2)*pow(1.+g2-2.*g*c,1.5));
 vec3 sc=lit>.5?(sR*bR*pR+sM*bM*pM)*sunI*shade(vP):(odR*bR*.08+odM*bM*.03)*sunI*.25;
 vec3 col=1.-exp(-sc),Tv=exp(-(bR*odR+bM*1.1*odM));
 float a=clamp(1.-dot(Tv,vec3(.3333))+(ground?0.:dot(col,vec3(.3,.59,.11))*1.6),0.,1.);gl_FragColor=vec4(col*(lit>.5?sunE:1.)*preExp,a);}`;
// Saturn's rings: lit from the Sun, crossed by the planet's shadow; the side facing away from the Sun only glows where light leaks through thinner rings
const FS_RING=`#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;uniform vec3 sunPos,pc,ringN;uniform float pR,lit,sunE,preExp;varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
void main(){
#include <logdepthbuf_fragment>
 vec4 t=texture2D(map,vUv);if(t.a<.01)discard;vec3 L=normalize(sunPos-vP),V=normalize(cameraPosition-vP);float sh=1.,k=1.;
 if(lit>.5){vec3 C=pc-vP;float tc=dot(C,L);if(tc>0.)sh=smoothstep(pR*.985,pR*1.015,length(C-L*tc));
  k=dot(L,ringN)*dot(V,ringN)>0.?1.:.12+.5*(1.-t.a);}
 gl_FragColor=vec4(t.rgb*(lit>.5?k*sh*sunE+3e-4:1.)*preExp,t.a);}`;
// the cheap rim glow for gas giants and thin hazes
const FS_ATMO=`#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 color,sunPos;uniform float lit,sunE,preExp,near;varying vec3 vN;varying vec3 vP;varying vec3 vL;varying vec2 vUv;
void main(){
#include <logdepthbuf_fragment>
 vec3 N=normalize(vN),V=normalize(cameraPosition-vP);float f=pow(1.-max(dot(N,V),0.),5.);float s=lit>.5?smoothstep(-.35,.45,dot(N,normalize(sunPos-vP))):1.;
 gl_FragColor=vec4(color*f*s*.7*near*(lit>.5?sunE:1.)*preExp,1.);}`;
export {TEMP,ATMO,heatX,GLSL_HEAT,GSTOP,GLSL_GRAV,gravRGB,gravX,HEATS,heatRGB,VS,GLSL_OCC,FS_BODY,FS_CLOUD,SCAT,FS_SCAT,FS_RING,FS_ATMO};
