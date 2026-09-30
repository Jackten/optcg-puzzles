import { useEffect, useRef, useState } from 'react';
import type { CardDef, CardInst } from '../engine/api';
function PowerBadge({power}:{power:number}) {
  const [shown,setShown]=useState(power);const current=useRef(power);
  useEffect(()=>{const from=current.current;const started=performance.now();let frame=0;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){current.current=power;setShown(power);return;}
    const tick=(now:number)=>{const t=Math.min(1,(now-started)/240);const value=t===1?power:Math.round((from+(power-from)*t)/100)*100;current.current=value;setShown(value);if(t<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[power]);
  return <span className="power-badge">{shown.toLocaleString()}</span>;
}
export function CardFace({def,hidden=false}: {def:CardDef;hidden?:boolean}) {
  const [failed,setFailed] = useState(false);
  if (hidden) return <div className="card-back"><span>✦</span><b>GRAND<br/>LINE</b><small>CARD GAME</small></div>;
  return <div className={`card-face color-${def.colors[0]?.toLowerCase() || 'red'}`}>
    <div className="text-frame"><div className="printed-top"><b>{def.cost ?? 'L'}</b><span>{def.category}</span><b>{def.power ?? '—'}</b></div><div className="card-art"><span>{def.category === 'Leader' ? '♜' : def.category === 'Stage' ? '⚓' : '✦'}</span></div><strong>{def.name}</strong><p>{def.effectText}</p><small>{def.id} {def.counter ? ` · +${def.counter} counter` : ''}</small></div>
    {!failed && def.img && <img src={def.img} alt="" draggable={false} onError={()=>setFailed(true)}/>}
  </div>;
}
export function Card({card,def,power,hidden,legal,selected,animation,onHover,onLeave}: {card:CardInst;def:CardDef;power:number;hidden?:boolean;legal?:boolean;selected?:boolean;animation?:string;onHover?:(card:CardInst,element:HTMLElement)=>void;onLeave?:()=>void}) {
  return <button type="button" data-target={card.uid} data-source={hidden ? undefined : card.uid} aria-label={hidden ? 'Face-down card' : `${def.name}${card.rested ? ', rested' : ''}${power ? `, ${power} power` : ''}`} className={`card ${card.rested ? 'rested' : ''} ${legal ? 'legal' : ''} ${selected ? 'selected' : ''} ${animation || ''}`} onPointerEnter={e=>{if(e.pointerType==='mouse' && !hidden) onHover?.(card,e.currentTarget);}} onPointerLeave={onLeave}>
    {card.don > 0 && <div className="attached-don" aria-label={`${card.don} attached DON!!`}>{Array.from({length:Math.min(card.don,5)},(_,i)=><i key={i} style={{transform:`translate(${i*4}px,${i*3}px)`}}>DON!!</i>)}<b>{card.don} DON!!</b></div>}
    <div className="card-body"><CardFace def={def} hidden={hidden}/></div>
    {!hidden && def.power !== null && <PowerBadge power={power}/>}
    {!hidden && def.keywords.blocker && <span className="keyword-badge">B</span>}
  </button>;
}
