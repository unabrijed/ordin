import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, Pause, Play, RotateCcw, X } from 'lucide-react';

const chapters = [
 {label:'Your wallet',kicker:'RECURRING PAYMENTS, ON YOUR TERMS',title:<>Put payments<br/>on <em>repeat.</em></>,body:<>One permission. Recurring token payments.<br/>Your wallet stays yours.</>},
 {label:'Your rules',kicker:'01 / DEFINE THE PERMISSION',title:<>You write<br/>the <em>rules.</em></>,body:<>The amount. The recipient. The interval.<br/>Every collection has to match.</>},
 {label:'The renewal',kicker:'02 / LET IT REPEAT',title:<>Right amount.<br/>Right <em>on time.</em></>,body:<>The authorized spender requests payment.<br/>Ordin checks before tokens move.</>},
 {label:'Your control',kicker:'03 / YOU KEEP THE LAST WORD',title:<>Automatic.<br/>Still <em>your call.</em></>,body:<>Confirmed cancellation stops future collections.<br/>Try stopping the loop.</>},
];

function OrbitWorld({paused,phase,cancelled}:{paused:boolean;phase:number;cancelled:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);const scene=useRef({phase,cancelled,paused});scene.current={phase,cancelled,paused};
 useEffect(()=>{
  const el=canvas.current;if(!el)return;const ctx=el.getContext('2d',{alpha:true});if(!ctx)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');const fine=matchMedia('(pointer: fine)');
  let width=0,height=0,frame=0,visible=true,time=0,last=0,mx=0,my=0,px=0,py=0;
  const resize=()=>{const box=el.getBoundingClientRect();width=box.width;height=box.height;const dpr=Math.min(devicePixelRatio||1,1.5);el.width=width*dpr;el.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)};
  const ro=new ResizeObserver(resize);ro.observe(el);resize();
  const move=(e:PointerEvent)=>{if(!fine.matches)return;mx=(e.clientX/innerWidth-.5);my=(e.clientY/innerHeight-.5)};
  const project=(x:number,y:number,z:number)=>{const yaw=.18+px*.16,tilt=.85+py*.15;const x1=x*Math.cos(yaw)+z*Math.sin(yaw),z1=-x*Math.sin(yaw)+z*Math.cos(yaw);const y1=y*Math.cos(tilt)-z1*Math.sin(tilt),z2=y*Math.sin(tilt)+z1*Math.cos(tilt);const k=850/(850+z2);return [width*.62+x1*k,height*.53+y1*k,k]};
  const draw=(now:number)=>{frame=0;if(!visible||document.hidden)return;const still=reduce.matches||scene.current.paused;const dt=last?Math.min(now-last,40):16;last=now;if(!still)time+=dt*.00012;px+=(still?0:mx-px)*.035;py+=(still?0:my-py)*.035;
   ctx.clearRect(0,0,width,height);const size=Math.min(width*.37,height*.43);const green=scene.current.cancelled?'176,191,204':'192,244,162';
   for(let j=0;j<4;j++){ctx.beginPath();for(let i=0;i<=150;i++){const a=i/150*Math.PI*2;const r=size*(.79+j*.16);const p=project(Math.cos(a)*r,Math.sin(a)*r,Math.sin(a*2+time)*15+j*12);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}ctx.strokeStyle=`rgba(${green},${j===1?.23:.07})`;ctx.lineWidth=j===1?1.2:.7;ctx.stroke()}
   for(let i=0;i<38;i++){const a=i*2.39996,r=size*(1.05+(i%7)*.06);const p=project(Math.cos(a)*r,Math.sin(a)*r,((i%9)-4)*35);ctx.fillStyle=`rgba(203,225,223,${.14+(i%4)*.05})`;ctx.beginPath();ctx.arc(p[0],p[1],i%5===0?1.6:.8,0,Math.PI*2);ctx.fill()}
   if(!scene.current.cancelled){for(let k=0;k<3;k++){for(let n=20;n>=0;n--){const a=time+k*Math.PI*2/3-n*.012;const p=project(Math.cos(a)*size*.95,Math.sin(a)*size*.95,12);ctx.fillStyle=`rgba(${green},${(1-n/21)*.8})`;ctx.shadowColor=`rgba(${green},.6)`;ctx.shadowBlur=n===0?16:0;ctx.beginPath();ctx.arc(p[0],p[1],n===0?3.3:1.3,0,Math.PI*2);ctx.fill()}ctx.shadowBlur=0}}
   frame=requestAnimationFrame(draw);
  };
  const start=()=>{last=0;if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(draw)};
  const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)start();else{cancelAnimationFrame(frame);frame=0}},{threshold:0});io.observe(el);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else start()};
  window.addEventListener('pointermove',move,{passive:true});document.addEventListener('visibilitychange',visibility);start();
  return()=>{cancelAnimationFrame(frame);ro.disconnect();io.disconnect();window.removeEventListener('pointermove',move);document.removeEventListener('visibilitychange',visibility)};
 },[]);
 return <canvas ref={canvas} className="orbit-world" aria-hidden="true"/>;
}

export function ImmersiveHero({paused,onPause}:{paused:boolean;onPause:()=>void}){
 const section=useRef<HTMLElement>(null);const[phase,setPhase]=useState(0);const[cancelled,setCancelled]=useState(false);const[manual,setManual]=useState(false);const[reduced,setReduced]=useState(false);const[scrollProgress,setScrollProgress]=useState(0);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[]);
 useEffect(()=>{if(manual||reduced||paused)return;let frame=0;const update=()=>{frame=0;const el=section.current;if(!el)return;const rect=el.getBoundingClientRect();const travel=el.offsetHeight-innerHeight;const progress=Math.max(0,Math.min(1,-rect.top/Math.max(1,travel)));setScrollProgress(progress);setPhase(Math.min(3,Math.floor(progress*4)))};const scroll=()=>{if(!frame)frame=requestAnimationFrame(update)};addEventListener('scroll',scroll,{passive:true});addEventListener('resize',scroll);update();return()=>{cancelAnimationFrame(frame);removeEventListener('scroll',scroll);removeEventListener('resize',scroll)}},[manual,reduced,paused]);
 const choose=(index:number)=>{setManual(true);setPhase(index)};
 return <section id="home" ref={section} className={`immersive-story ${reduced?'reduced-story':''}`} aria-label="Explore how Ordin works">
 <div className={`story-viewport chapter-${phase} ${cancelled?'story-cancelled':''}`} id="playground">
  <div className="story-atmosphere" aria-hidden="true"/><OrbitWorld paused={paused} phase={phase} cancelled={cancelled}/>
  <div className="story-ghost" aria-hidden="true">{['repeat','permission','renew','control'][phase]}</div>
  <div className="story-layout">
   <div className="story-copy" key={phase}><span className="story-kicker"><i/>{chapters[phase].kicker}</span>{phase===0?<h1>{chapters[phase].title}</h1>:<h2>{chapters[phase].title}</h2>}<p>{chapters[phase].body}</p>{phase<3?<button className="story-next" onClick={()=>choose(phase+1)}>{phase===0?'Enter the loop':'Keep going'}<ArrowUpRight size={18}/></button>:<button className="story-next" onClick={()=>setCancelled(!cancelled)}>{cancelled?'Reset illustration':'Cancel future payments'}{cancelled?<RotateCcw size={17}/>:<X size={17}/>}</button>}<span className="story-feedback" role="status">{phase===3?(cancelled?'Loop stopped. Tokens stay in your wallet.':'Your permission has an off switch.'):'Scroll to explore · or use the chapters below'}</span></div>
   <div className="story-object" aria-label={['Tokens remain in your wallet until collected','Policy: 5 USDT every 30 days to your approved merchant','One eligible payment transfers to the merchant',cancelled?'Policy cancelled, future collections stopped':'You can cancel future payments'][phase]}>
    <div className="object-halo"/><div className="object-floor"/>
    <div className="world-wallet"><div className="wallet-rim"/><div className="wallet-face"><span>YOUR WALLET</span><div className="wallet-brand">o<span>↗</span></div><div className="wallet-pill"><span/>In your control</div></div><div className="wallet-clasp"><i/></div><div className="wallet-token"><b>₮</b></div><span className="object-caption wallet-caption">The funds stay with you.</span></div>
    <div className="world-policy"><div className="policy-top"><span>YOUR PERMISSION</span><span className="policy-light"/></div><strong>5<span>USDT</span></strong><div className="policy-interval">Every <b>30 days</b></div><div className="policy-recipient"><span>To</span><b>Approved merchant <Check size={14}/></b></div><div className="policy-bottom"><Check size={15}/> One collection per period</div><span className="object-caption policy-caption">No more. No sooner. No one else.</span></div>
    <div className="world-renewal"><div className="renewal-token"><b>₮</b></div><div className="transfer-trail"/><div className="merchant-orb"><svg viewBox="0 0 60 60" fill="none" aria-hidden="true"><path d="M13 25v25h34V25M9 25l6-15h30l6 15M10 25q5 10 10 0 5 10 10 0 5 10 10 0 5 10 10 0M24 50V36h12v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div><div className="payment-receipt"><span><Check size={13}/> TERMS MATCHED</span><strong>5 USDT <ArrowUpRight size={20}/></strong><small>To your approved merchant</small></div><span className="object-caption renewal-caption">Another period. The same rules.</span></div>
    <div className="world-control"><button className="permission-switch" role="switch" aria-checked={!cancelled} aria-label="Allow future collections in this illustration" onClick={()=>setCancelled(!cancelled)}><span>{cancelled?<X size={32}/>:<Check size={32}/>}</span></button><strong>{cancelled?'Stopped.':'Your call.'}</strong><span>{cancelled?'Future collections blocked':'Tap to cancel future payments'}</span></div>
    <div className="scene-coordinate"><span>ORDIN / PAYMENT PROTOCOL</span><span>0{phase+1} — 04</span></div>
   </div>
  </div>
  <div className="story-controls"><div className="chapter-nav" aria-label="Payment story chapters">{chapters.map((chapter,i)=><button key={chapter.label} onClick={()=>choose(i)} aria-current={phase===i?'step':undefined}><span>0{i+1}</span>{chapter.label}<i/></button>)}</div><div className="story-tools"><button onClick={onPause} aria-label={paused?'Play animations':'Pause animations'}>{paused?<Play size={15}/>:<Pause size={15}/>}</button>{manual&&<button className="resume-scroll" onClick={()=>setManual(false)}>Follow scroll</button>}<a href="#how">Skip story<ArrowDown size={13}/></a></div></div>
  <div className="story-fineprint">Interactive illustration. No tokens move.</div>
  <div className="story-scroll-progress" style={{transform:`scaleX(${manual||reduced?(phase+1)/4:scrollProgress})`}}/>
 </div>
 </section>
}
