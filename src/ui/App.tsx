import { useEffect, useRef, useState } from 'react';
import type { Action, CardInst, Engine, GameEvent, GameState, Puzzle, PuzzleSet, Side } from '../engine/api';
import { engine as realEngine } from './engineSource';
import { mockEngine } from './dev/mockEngine';
import { mockPuzzles } from './dev/mockPuzzles';
import { Card, CardFace } from './Card';
import { presentEvent } from './replay';
import { sound, unlockAudio } from './audio';
import { dailyOffset, loadProgress, localDate, saveProgress } from './storage';
let engine: Engine = realEngine;
type Selection = { source:string; actions:Action[]; prefix:string[] };
type Point = {x:number;y:number};
type Arrow = {from:Point;to:Point;blocked?:boolean};
type Zoom = {card:CardInst;rect:DOMRect};
const clone = (s:GameState) => structuredClone(s);
function cardName(s:GameState,uid:string) { const c=engine.findCard(s,uid)?.card; return c ? engine.getCard(c.defId).name : 'Card'; }
function destinations(a:Action,s:GameState):string[] {
  if(a.type==='attack') return [a.target];
  if(a.type==='attachDon') return [a.target];
  if(a.type==='endTurn') return [];
  if(a.targets?.length) return a.targets;
  if(a.type==='activate') return [];
  const card=engine.findCard(s,a.uid)?.card;
  const category=card && engine.getCard(card.defId).category;
  return [category==='Stage' ? 'me-stage' : category==='Event' ? 'event-zone' : 'me-characters'];
}
function ArrowLine({arrow}:{arrow:Arrow|null}) {
  if(!arrow) return null;
  const {from:a,to:b}=arrow; const dx=b.x-a.x,dy=b.y-a.y;
  return <svg className={`attack-arrow ${arrow.blocked?'blocked':''}`} aria-hidden="true"><defs><marker id="arrowhead" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3Z" fill="currentColor"/></marker></defs><path d={`M${a.x},${a.y} Q${(a.x+b.x)/2+dy*.19},${(a.y+b.y)/2-dx*.19} ${b.x},${b.y}`} markerEnd="url(#arrowhead)"/></svg>;
}
export function App() {
  const [set,setSet]=useState<PuzzleSet|null>(null); const [fallback,setFallback]=useState(false);
  const [progress,setProgress]=useState(loadProgress); const [screen,setScreen]=useState<'home'|'packs'|'table'>('home');
  const [puzzle,setPuzzle]=useState<Puzzle|null>(null); const [state,setState]=useState<GameState|null>(null); const [view,setView]=useState<GameState|null>(null);
  const [history,setHistory]=useState<GameState[]>([]); const [tries,setTries]=useState(1); const [hints,setHints]=useState(0); const [showHints,setShowHints]=useState(false);
  const [choiceOptions,setChoiceOptions]=useState<string[]|null>(null);
  const [selection,setSelection]=useState<Selection|null>(null); const selectionRef=useRef<Selection|null>(null);
  const [drag,setDrag]=useState<{source:string;point:Point;rect:DOMRect}|null>(null); const [arrow,setArrow]=useState<Arrow|null>(null);
  const [zoom,setZoom]=useState<Zoom|null>(null); const [settings,setSettings]=useState(false); const [logOpen,setLogOpen]=useState(false);
  const [caption,setCaption]=useState(''); const [busy,setBusy]=useState(false); const [event,setEvent]=useState<GameEvent|null>(null); const [lost,setLost]=useState(false); const [shake,setShake]=useState('');
  const [introOpen,setIntroOpen]=useState(false); const [showWin,setShowWin]=useState(false); const [walkthrough,setWalkthrough]=useState(false); const [copied,setCopied]=useState(false); const [reviewStep,setReviewStep]=useState(0);
  const [flight,setFlight]=useState<{card:CardInst;from:Point;to:Point;label:string;kind:string}|null>(null);
  const board=useRef<HTMLDivElement>(null); const run=useRef(0); const fast=useRef(false); const release=useRef<(()=>void)|null>(null); const longPress=useRef<ReturnType<typeof setTimeout>>(); const hoverTimer=useRef<ReturnType<typeof setTimeout>>();
  const pointer=useRef<{id:number;source:string;start:Point;rect:DOMRect;moved:boolean;long:boolean;targetIntent:boolean}|null>(null);
  const alive=useRef(true); const reduced=useRef(typeof matchMedia!=='undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{alive.current=true; let cancelled=false; fetch('puzzles.json').then(r=>{if(!r.ok) throw Error('No puzzle file'); return r.json();}).then((data:PuzzleSet)=>{if(!data.puzzles?.length || !data.dailyOrder?.length) throw Error('Empty puzzles'); if(!cancelled){engine=realEngine;setSet(data);}}).catch(()=>{if(!cancelled){engine=mockEngine;setSet(mockPuzzles);setFallback(true);}}); return()=>{cancelled=true;alive.current=false;run.current++;release.current?.();clearTimeout(longPress.current);clearTimeout(hoverTimer.current);};},[]);
  useEffect(()=>saveProgress(progress),[progress]);
  // Deep link: #p=<puzzle id> opens that puzzle directly (share links, E2E runs).
  useEffect(()=>{if(!set)return;const id=new URLSearchParams(location.hash.slice(1)).get('p');const p=id&&set.puzzles.find(x=>x.id===id);if(p)open(p);},[set]);
  const updateProgress=(patch:Partial<typeof progress>)=>setProgress(p=>({...p,...patch}));
  const select=(s:Selection|null)=>{selectionRef.current=s;setSelection(s);setChoiceOptions(null);};
  const clear=()=>{select(null);setDrag(null);setZoom(null);setArrow(null);clearTimeout(longPress.current);clearTimeout(hoverTimer.current);};
  const cancelReplay=()=>{run.current++;fast.current=true;release.current?.();setBusy(false);setEvent(null);setFlight(null);clear();};
  const daily = set ? set.puzzles.find(p=>p.id===set.dailyOrder[((dailyOffset()%set.dailyOrder.length)+set.dailyOrder.length)%set.dailyOrder.length]) ?? set.puzzles[0] : null;
  function open(p:Puzzle) { cancelReplay();try{window.history.replaceState(null,'',`#p=${p.id}`);}catch{}setPuzzle(p);setState(clone(p.state));setView(clone(p.state));setHistory([]);setTries(1);setHints(0);setLost(false);setShowWin(false);setCopied(false);setWalkthrough(false);setReviewStep(0);setShowHints(false);setCaption(p.intro);setScreen('table');setLogOpen(false);setIntroOpen(true); }
  function reset(countTry=true) { if(!puzzle)return;cancelReplay();setState(clone(puzzle.state));setView(clone(puzzle.state));setHistory([]);if(countTry)setTries(n=>n+1);setLost(false);setShowWin(false);setCopied(false);setWalkthrough(false);setReviewStep(0);setCaption(puzzle.intro); }
  function undo() { if(!history.length || busy)return;if(lost)setTries(n=>n+1);const prev=history[history.length-1];clear();setState(prev);setView(clone(prev));setHistory(h=>h.slice(0,-1));setLost(false);setShowWin(false);setCaption('Back one move. Find another line.'); }
  const center=(uid:string):Point=>{const el=board.current?.querySelector<HTMLElement>(`[data-target="${CSS.escape(uid)}"]`);const r=el?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y+r.height/2}:{x:innerWidth/2,y:innerHeight/2};};
  const zoneCenter=(side:Side,zone:string):Point=>center(`${side}-${zone}`);
  const pause=async(ms:number)=>{if(fast.current||reduced.current)return;await new Promise<void>(resolve=>{const timer=setTimeout(()=>{release.current=null;resolve();},ms);release.current=()=>{clearTimeout(timer);release.current=null;resolve();};});};
  async function perform(a:Action,before=state!,why?:string,isReview=false):Promise<GameState> {
    if(!before)return before;const token=++run.current;fast.current=false;clear();setBusy(true);setLost(false);
    let result;try {result=engine.apply(before,a);} catch {setCaption('That move is unavailable. Choose a highlighted target.');setBusy(false);return before;}
    if(!isReview)setHistory(h=>[...h,before]);
    let shown=clone(before);let attackFrom='';let attackTo='';
    if(why)setCaption(why);else setCaption(engine.describeAction(before,a));
    for(const e of result.events) {
      if(token!==run.current)return before;
      setEvent(e);const next=presentEvent(shown,result.state,e,engine,a);
      if(e.kind==='attack'){attackFrom=e.attacker;attackTo=e.target;setArrow({from:center(attackFrom),to:center(attackTo)});sound('slide',progress.sound);}
      if(e.kind==='block'){attackTo=e.blocker;setArrow({from:center(attackFrom),to:center(attackTo),blocked:true});setCaption(`${cardName(before,e.blocker)} blocks the attack`);sound('flip',progress.sound);}
      if(e.kind==='ko'){const c=engine.findCard(shown,e.uid)?.card;const side=engine.findCard(shown,e.uid)?.side;if(c&&side)setFlight({card:c,from:center(e.uid),to:zoneCenter(side,'trash'),label:'K.O.',kind:'ko'});setCaption(`${cardName(shown,e.uid)} is knocked out`);sound('hit',progress.sound);await pause(400);if(token!==run.current)return before;}
      if(e.kind==='counter' || e.kind==='lifeLost' || e.kind==='draw') {
        const c=engine.findCard(shown,e.uid)?.card ?? engine.findCard(result.state,e.uid)?.card;
        const origin=e.kind==='counter'?zoneCenter(e.side,'hand'):e.kind==='lifeLost'?zoneCenter(e.side,'life'):zoneCenter(e.side,'deck');
        const dest=e.kind==='counter'?center(attackTo):zoneCenter(e.side,e.kind==='draw'?'hand':e.to);
        if(c)setFlight({card:c,from:origin,to:dest,label:e.kind==='counter'?`+${e.amount}`:e.kind==='lifeLost'?'Life → '+e.to:'Draw',kind:e.kind});
        sound('flip',progress.sound);setCaption(e.kind==='counter'?`${cardName(shown,e.uid)} · +${e.amount} counter`:e.kind==='lifeLost'?`Life taken${e.to==='trash'?' · Banish':''}`:'Draw a card');
        await pause(450);if(token!==run.current)return before;
        if(e.kind==='counter'&&c) {setFlight({card:c,from:dest,to:zoneCenter(e.side,'trash'),label:'Counter used',kind:'slide'});await pause(350);if(token!==run.current)return before;}
      }
      if(e.kind==='battle'){setCaption(`${e.attackPower.toLocaleString()} vs ${e.defensePower.toLocaleString()} → ${e.hit?'HIT':'BLOCKED'}`);sound(e.hit?'hit':'slide',progress.sound);}
      if(e.kind==='effect'||e.kind==='trigger')setCaption(e.text);
      if(e.kind==='play')sound('slap',progress.sound);
      if(e.kind==='donAttach')sound('don',progress.sound);
      if(e.kind==='win')sound('win',progress.sound);
      shown=next;setView(shown);await pause(['counter','lifeLost','draw','ko'].includes(e.kind)?0:e.kind==='battle'?600:e.kind==='attack'?550:380);if(token!==run.current)return before;setFlight(null);
    }
    if(token!==run.current)return before;
    setState(result.state);setView(result.state);setEvent(null);setArrow(null);setFlight(null);setBusy(false);
    if(why)setCaption(why);
    if(result.state.winner==='me') {
      if(!isReview && puzzle) {
        const today=localDate(); const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
        setProgress(p=>({...p,solved:{...p.solved,[puzzle.id]:{tries,hints,date:today}},streak:puzzle.id===daily?.id && p.lastDaily!==today ? p.lastDaily===localDate(yesterday)?p.streak+1:1:p.streak,lastDaily:puzzle.id===daily?.id?today:p.lastDaily}));
      }
      setShowWin(true);
    } else if(!isReview) {const noLethal=engine.stillWinnable(result.state,2000)===false;setLost(noLethal);}
    return result.state;
  }
  function sourceActions(source:string,mode:'default'|'activate'='default'):Action[] { if(!state)return [];return engine.legalActions(state).filter(a=>source==='don'?a.type==='attachDon':mode==='activate'?a.type==='activate'&&a.uid===source:(a.type==='play'&&a.uid===source)||(a.type==='attack'&&a.attacker===source)); }
  function chooseSource(source:string,mode:'default'|'activate'='default',commit=false) {
    const actions=sourceActions(source,mode);if(!actions.length&&mode==='default'&&sourceActions(source,'activate').length){chooseSource(source,'activate',commit);return;}if(!actions.length){select(null);setCaption('This card has no available move. Try another card.');return;}
    const s={source,actions,prefix:[]};select(s);setZoom(null);clearTimeout(hoverTimer.current);
    if(commit && mode==='activate' && actions.some(a=>destinations(a,state!).length===0)){void perform(actions.find(a=>destinations(a,state!).length===0)!);return;}
    setCaption(source==='don'?'Choose a highlighted card to attach 1 DON!!':mode==='activate'?'Choose an effect target':'Drag or tap a highlighted target');
  }
  function rawTargets(s=selectionRef.current) { if(!s||!state)return [];return [...new Set(s.actions.map(a=>destinations(a,state)[s.prefix.length]).filter((x):x is string=>x!==undefined))]; }
  function physicalTarget(token:string) {
    if(!token||token==='yes')return null;
    if(token.startsWith('$trash:'))return token.slice(7);
    if(token.startsWith('$don:')){const [,uid]=token.split(':');return uid==='active'?'me-don':uid==='rested'?'me-don-rested':uid;}
    return token.split('#')[0];
  }
  function nextTargets(s=selectionRef.current) {return [...new Set(rawTargets(s).map(physicalTarget).filter((x):x is string=>!!x))];}
  function choiceLabel(token:string) {
    if(token==='')return 'Skip optional effect';if(token==='yes')return 'Resolve effect';
    if(token.startsWith('$trash:'))return `Make room: trash ${cardName(state!,token.slice(7))}`;
    if(token.startsWith('$don:')){const [,uid,n]=token.split(':');return `Return ${n} DON!! from ${uid==='active'?'active cost area':uid==='rested'?'rested cost area':cardName(state!,uid)}`;}
    if(token.includes('#')){const [uid,n]=token.split('#');return `${cardName(state!,uid)} · ${n} rested DON!!`;}
    return token==='me-characters'?'Play in Character area':token==='me-stage'?'Play Stage':token==='event-zone'?'Play event':cardName(state!,token);
  }
  function chooseToken(token:string,s=selectionRef.current) {
    if(!s||!state)return false;
    const candidates=s.actions.filter(a=>destinations(a,state)[s.prefix.length]===token);
    if(!candidates.length)return false;
    const prefix=[...s.prefix,token];const finished=candidates.find(a=>destinations(a,state).length===prefix.length);
    if(finished){setChoiceOptions(null);void perform(finished);}else {select({...s,actions:candidates,prefix});setCaption(`Choice ${prefix.length} selected. Choose the next highlighted target or effect option.`);}return true;
  }
  function chooseTarget(target:string,s=selectionRef.current) {
    const tokens=rawTargets(s).filter(t=>physicalTarget(t)===target);
    if(!tokens.length)return false;if(tokens.length>1){setChoiceOptions(tokens);return true;}
    return chooseToken(tokens[0],s);
  }
  function pointedTarget(x:number,y:number) {let el=document.elementFromPoint(x,y) as HTMLElement|null;let first:string|undefined;while(el&&el!==board.current){if(el.dataset?.target){first??=el.dataset.target;if(nextTargets().includes(el.dataset.target))return el.dataset.target;}el=el.parentElement;}return first;}
  const shakeBack=(source:string)=>{clear();setShake(source);setTimeout(()=>setShake(''),400);setCaption('Choose a highlighted target. Your card returns to the table.');};
  function pointerDown(e:React.PointerEvent<HTMLDivElement>) {
    if(e.button!==0||settings||logOpen||showWin||choiceOptions||introOpen)return;if(busy){fast.current=true;release.current?.();return;}if(walkthrough||!state)return;
    const el=(e.target as HTMLElement).closest<HTMLElement>('[data-source],[data-target]');if(!el)return;
    const source=el.dataset.source || '';const target=pointedTarget(e.clientX,e.clientY) || '';const targetIntent=!!selectionRef.current && nextTargets().includes(target);
    if(!source&&!targetIntent)return;
    const rect=el.getBoundingClientRect();pointer.current={id:e.pointerId,source,start:{x:e.clientX,y:e.clientY},rect,moved:false,long:false,targetIntent};
    if(!targetIntent&&source)chooseSource(source);
    e.currentTarget.setPointerCapture(e.pointerId);
    if(source && source!=='don') {const c=engine.findCard(state,source)?.card;if(c)longPress.current=setTimeout(()=>{if(pointer.current&&!pointer.current.moved){pointer.current.long=true;select(null);setZoom({card:c,rect});}},500);}
  }
  function pointerMove(e:React.PointerEvent<HTMLDivElement>) {
    const p=pointer.current;if(!p||p.id!==e.pointerId||p.targetIntent||p.long)return;
    if(Math.hypot(e.clientX-p.start.x,e.clientY-p.start.y)>7 && selectionRef.current?.actions.length){p.moved=true;clearTimeout(longPress.current);setZoom(null);setDrag({source:p.source,point:{x:e.clientX,y:e.clientY},rect:p.rect});if(selectionRef.current.actions[0]?.type==='attack')setArrow({from:{x:p.rect.x+p.rect.width/2,y:p.rect.y+p.rect.height/2},to:{x:e.clientX,y:e.clientY}});e.preventDefault();}
  }
  function pointerUp(e:React.PointerEvent<HTMLDivElement>) {
    clearTimeout(longPress.current);const p=pointer.current;pointer.current=null;if(!p)return;
    if(p.long)return;
    const target=pointedTarget(e.clientX,e.clientY);
    if(p.moved){setDrag(null);setArrow(null);if(!target||!chooseTarget(target))shakeBack(p.source);}
    else if(p.targetIntent&&target)chooseTarget(target);
    else {const action=selectionRef.current?.actions.find(a=>a.type==='activate'&&destinations(a,state!).length===0);if(action)void perform(action);}
  }
  function keyboardClick(e:React.MouseEvent<HTMLDivElement>) {if(e.detail!==0||busy||walkthrough)return;const el=(e.target as HTMLElement).closest<HTMLElement>('[data-target],[data-source]');if(!el)return;if(el.dataset.target&&chooseTarget(el.dataset.target))return;if(el.dataset.source)chooseSource(el.dataset.source);}
  async function solution() {if(!puzzle||busy)return;cancelReplay();setWalkthrough(true);setShowWin(false);setLost(false);setHistory([]);setReviewStep(0);let current=clone(puzzle.state);setState(current);setView(current);for(let i=0;i<puzzle.solution.length;i++){setReviewStep(i+1);const oldRun=run.current;current=await perform(puzzle.solution[i].action,current,puzzle.solution[i].why,true);if(run.current!==oldRun+1)return;await pause(900);if(run.current!==oldRun+1)return;} }
  function hint() {
    setShowHints(true);setHints(h=>h+1);if(!puzzle||!state)return;
    let expected=clone(puzzle.state);let inLine=true;
    try {for(let i=0;i<history.length;i++){if(!puzzle.solution[i]){inLine=false;break;}expected=engine.apply(expected,puzzle.solution[i].action).state;}inLine=inLine&&JSON.stringify(expected)===JSON.stringify(state);}catch{inLine=false;}
    if(inLine)setCaption(puzzle.hints[Math.min(hints,2)]);
    else {const live=engine.bestMove(state,3000);setCaption(live?`Try: ${engine.describeAction(state,live)}`:'No next move was found within the hint search budget. Undo or reset to explore another line.');}
  }
  async function share() {if(!puzzle)return;const id=set?.puzzles.findIndex(p=>p.id===puzzle.id) ?? 0;const text=`OPTCG Lethal #${id+1} ${'⭐'.repeat(puzzle.difficulty)}\n${walkthrough?'Solution reviewed':`Solved in ${tries} ${tries===1?'try':'tries'}, ${hints} ${hints===1?'hint':'hints'}`}\n${'🟥'.repeat(Math.min(tries-1,8))}🟩\n${puzzle.concepts.join(' · ')}`;try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setCaption('Clipboard unavailable. Select and copy the share text below.');} }
  const legal=nextTargets(selection); const mark=(uid:string)=>event && (('uid' in event&&event.uid===uid)||('blocker'in event&&event.blocker===uid)||('target'in event&&event.target===uid)) ? `anim-${event.kind}` : shake===uid?'shake':'';
  function hover(c:CardInst,el:HTMLElement) {clearTimeout(hoverTimer.current);if(busy||selectionRef.current||drag)return;hoverTimer.current=setTimeout(()=>{if(!selectionRef.current&&!pointer.current)setZoom({card:c,rect:el.getBoundingClientRect()});},380);}
  function renderCard(c:CardInst,hidden=false) {return <Card key={c.uid} card={c} def={engine.getCard(c.defId)} power={view?engine.power(view,c.uid):0} hidden={hidden} legal={legal.includes(c.uid)} selected={selection?.source===c.uid} animation={mark(c.uid)} onHover={hover} onLeave={()=>{clearTimeout(hoverTimer.current);setZoom(null);}}/>;}
  function player(side:Side) {
    if(!view)return null;const p=view[side];return <section className={`player ${side}`} aria-label={side==='me'?'Your playmat':'Opponent playmat'}>
      <div className="character-row" data-target={`${side}-characters`}><span className="zone-label">CHARACTERS</span>{Array.from({length:5},(_,i)=><div key={i} className={`card-slot ${side==='me'&&legal.includes('me-characters')?'legal-zone':''}`} data-target={`${side}-characters`}>{p.characters[i]?renderCard(p.characters[i]):<span>{i+1}</span>}</div>)}</div>
      <div className="base-row"><div className="life-zone" data-target={`${side}-life`}><span className="zone-label">LIFE · {p.life.length}</span><div className="life-stack">{p.life.slice(0,5).map((c,i)=><div key={c.uid} style={{transform:`translate(${i*5}px,${i*3}px) rotate(90deg)`}}>{renderCard(c,!p.lifeVisible)}</div>)}{!p.life.length&&<b className="empty-life">0 LIFE</b>}</div></div>
      <div className={`stage-zone card-slot ${legal.includes(`${side}-stage`)?'legal-zone':''}`} data-target={`${side}-stage`}><span className="zone-label">STAGE</span>{p.stage?renderCard(p.stage):<span>⚓</span>}</div>
      <div className="leader-zone">{renderCard(p.leader)}<span className="owner-label">{side==='me'?'YOU':'OPPONENT'}</span></div>
      <div className="hand-zone" data-target={`${side}-hand`}><span className="zone-label">HAND · {p.hand.length}</span><div className={`hand ${side==='opp'?'opponent-hand':''}`}>{p.hand.map((c,i)=><div className="hand-card" key={c.uid} style={{'--angle':`${(i-(p.hand.length-1)/2)*Math.min(7,32/Math.max(1,p.hand.length))}deg`,'--lift':`${Math.abs(i-(p.hand.length-1)/2)*3}px`,'--index':i} as React.CSSProperties}>{renderCard(c,side==='opp'&&!p.handVisible)}</div>)}</div></div>
      <div className="piles"><div className="deck-pile" data-target={`${side}-deck`}><div className="mini-back">✦</div><span>DECK · {p.deckCount}</span></div><div className="trash-pile" data-target={`${side}-trash`}>{p.trash.length?<div className="trash-card"><CardFace def={engine.getCard(p.trash[p.trash.length-1].defId)}/></div>:<div className="empty-pile">↘</div>}<span>TRASH · {p.trash.length}</span></div></div></div>
      <div className="cost-row"><span className="zone-label">DON!! COST AREA</span><button className={`don-source ${side==='me'&&selection?.source==='don'?'selected':''}`} data-source={side==='me'&&p.donActive?'don':undefined} data-target={`${side}-don`} aria-label={`${p.donActive} active DON, select to attach`} disabled={!p.donActive||side==='opp'}><span className="don-fan">{Array.from({length:Math.min(p.donActive,8)},(_,i)=><i key={i} style={{left:i*9}}>DON!!</i>)}</span><b>{p.donActive} active</b></button><div className="rested-don" data-target={`${side}-don-rested`}><span>▰</span>{p.donRested} rested</div><div className="don-deck">✦ <b>{p.donDeck}</b><span> DON!! deck</span></div></div>
    </section>;
  }
  const zoomDef=zoom?engine.getCard(zoom.card.defId):null;
  return <div className={`app mat-${progress.mat} ${progress.portrait?'allow-portrait':''}`} onPointerDownCapture={()=>{unlockAudio();if(busy){fast.current=true;release.current?.();}}}>
    <div className="orientation"><div className="phone-turn">▯ ↻</div><h1>A real table needs a little room.</h1><p>Turn your phone sideways to play.</p><button onClick={()=>updateProgress({portrait:true})}>Play in portrait anyway</button></div>
    <header className="topbar"><button className="brand" onClick={()=>{cancelReplay();setScreen('home');}} aria-label="Grand Line home"><span>✦</span><b>GRAND LINE</b></button>{screen==='table'&&puzzle?<div className="table-title"><strong>{puzzle.title}</strong><span>{'●'.repeat(puzzle.difficulty)}{'○'.repeat(5-puzzle.difficulty)} · Try {tries}{walkthrough?` · Walkthrough ${reviewStep}/${puzzle.solution.length}`:''}</span></div>:<span className="top-subtitle">ONE PIECE · DAILY LETHAL</span>}<div className="top-actions"><button className="icon-button" onClick={()=>updateProgress({sound:!progress.sound})} aria-label={progress.sound?'Mute sound':'Enable sound'} title="Sound">{progress.sound?'♪':'♩̸'}</button><button className="icon-button" onClick={()=>setSettings(true)} aria-label="Settings">⚙</button></div></header>
    {screen!=='table' ? <main className="home"><nav className="home-tabs"><button className={screen==='home'?'active':''} onClick={()=>setScreen('home')}>Today</button><button className={screen==='packs'?'active':''} onClick={()=>setScreen('packs')}>Puzzle packs</button><span>🔥 {progress.streak} day streak</span></nav>{!set?<div className="loading">Shuffling the deck…</div>:screen==='home'&&daily?<div className="daily-layout"><div className="daily-copy"><span className="eyebrow">TODAY'S PUZZLE · {new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><h1>{daily.title}</h1><div className="difficulty">{'●'.repeat(daily.difficulty)}{'○'.repeat(5-daily.difficulty)}<span>{['','A fresh start','Find the opening','Think ahead','A tight line','Captain level'][daily.difficulty]}</span></div><p>{daily.intro}</p><div className="tags">{daily.concepts.map(t=><span key={t}>{t}</span>)}</div><button className="primary" onClick={()=>open(daily)}>{progress.solved[daily.id]?'✓ Play again':'Find lethal'} <span>↗</span></button><small>One turn. Every DON!! counts.</small></div><div className="home-art" aria-hidden="true"><div className="compass">✦</div><div className="preview-card"><CardFace def={engine.getCard(daily.state.me.leader.defId)}/></div><div className="preview-card second"><CardFace def={engine.getCard(daily.state.me.characters[0]?.defId??daily.state.me.leader.defId)}/></div><span>THE LAST ATTACK IS YOURS.</span></div></div>:<div className="pack-list">{set.packs.map(pack=><section key={pack.id}><h2>{pack.title}</h2><div className="pack-grid">{pack.puzzleIds.map(id=>{const p=set.puzzles.find(p=>p.id===id);return p?<button key={id} onClick={()=>open(p)}><span className="solved-check">{progress.solved[id]?'✓':'◇'}</span><strong>{p.title}</strong><small>{'●'.repeat(p.difficulty)} · {p.concepts[0]}</small></button>:null;})}</div></section>)}</div>}{fallback&&<div className="dev-notice">Practice mode · puzzles.json could not be loaded</div>}</main>:view&&puzzle?<>
      <div className="table-shell"><div className="table" data-busy={busy?"1":"0"} ref={board} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{pointer.current=null;clear();}} onClick={keyboardClick} onContextMenu={e=>e.preventDefault()}>
        {player('opp')}<div className="table-seam"><span>✦</span><button data-target="event-zone" className={legal.includes('event-zone')?'event-drop legal-zone':'event-drop'} aria-label="Play selected event here">{legal.includes('event-zone')?'PLAY EVENT':'GRAND LINE'}</button><span>✦</span></div>{player('me')}
      </div>{lost&&<div className="lost-banner"><span>No lethal left from here</span><button onClick={undo}>Undo</button><button onClick={()=>reset()}>Reset</button></div>}
      <div className="caption" role="status">{busy&&<span className="replay-dot"/>}<span>{caption}</span>{busy&&<button onClick={()=>{fast.current=true;release.current?.();}}>Skip ↠</button>}</div></div>
      <footer className={`controls ${selection?'has-selection':''}`}><button disabled={!history.length||busy||walkthrough} onClick={undo}>↶ <span>Undo</span></button><button disabled={busy} onClick={()=>reset()}>↻ <span>Reset</span></button><button disabled={busy||walkthrough||state?.winner==='me'} onClick={hint}>✧ <span>Hint{hints?` · ${hints}`:''}</span></button>{selection?.source&&selection.source!=='don'&&engine.legalActions(state!).some(a=>a.type==='activate'&&a.uid===selection.source)&&<button disabled={busy} onClick={()=>chooseSource(selection.source,'activate',true)}>⚡ Activate</button>}{selection&&<><button onClick={()=>setChoiceOptions(rawTargets())}>Options</button><button onClick={()=>{clear();setCaption('Selection cleared.');}} className="cancel-selection" aria-label="Cancel card selection">×</button></>}<span className="control-spacer"/><button onClick={()=>setLogOpen(true)}>☷ <span>Moves · {state?.log.length ?? 0}</span></button></footer>
    </>:null}
    <ArrowLine arrow={arrow}/>
    {drag&&state&&<div className="drag-ghost" style={{left:drag.point.x-drag.rect.width/2,top:drag.point.y-drag.rect.height/2,width:drag.rect.width,height:drag.rect.height}}>{drag.source==='don'?<div className="don-ghost">DON!!<strong>+1000</strong></div>:<CardFace def={engine.getCard(engine.findCard(state,drag.source)!.card.defId)}/>}</div>}
    {flight&&<div key={`${event?.kind}-${'uid'in(event??{})?(event as {uid:string}).uid:''}-${flight.kind}`} className={`flying-card ${flight.kind}`} style={{left:flight.from.x,top:flight.from.y,'--dx':`${flight.to.x-flight.from.x}px`,'--dy':`${flight.to.y-flight.from.y}px`} as React.CSSProperties}><CardFace def={engine.getCard(flight.card.defId)} hidden={event?.kind==='draw'&&event.side==='opp'&&!view?.opp.handVisible}/><b>{flight.label}</b></div>}
    {zoom&&zoomDef&&!drag&&!busy&&<aside className="card-zoom" style={{left:zoom.rect.x+zoom.rect.width/2>innerWidth/2?16:undefined,right:zoom.rect.x+zoom.rect.width/2<=innerWidth/2?16:undefined}} onPointerDown={e=>e.stopPropagation()}><button className="zoom-close" onClick={()=>setZoom(null)} aria-label="Close card details">×</button><div className="zoom-image"><CardFace def={zoomDef}/></div><div className="zoom-text"><strong>{zoomDef.name}</strong><small>{zoomDef.category} · {zoomDef.colors.join(' / ')} · {zoomDef.cost!==null?`Cost ${zoomDef.cost}`:''} · {zoomDef.power!==null?`${zoomDef.power} power`:''}</small><p>{zoomDef.effectText || 'No printed effect.'}</p>{zoomDef.triggerText&&<p><b>Trigger:</b> {zoomDef.triggerText}</p>}{zoomDef.counter&&<b>Counter +{zoomDef.counter}</b>}</div></aside>}
    {introOpen&&puzzle&&screen==='table'&&<div className="modal-backdrop"><section className="modal intro-modal"><span className="eyebrow">ONE TURN TO FIND LETHAL · {'●'.repeat(puzzle.difficulty)}</span><h2>{puzzle.title}</h2><p>{puzzle.intro}</p><div className="tags">{puzzle.concepts.map(t=><span key={t}>{t}</span>)}</div><p className="install-note">Drag cards, or tap a card then a highlighted target. Long-press to read a card. Tap during an opponent response to fast-forward.</p><button className="primary" onClick={()=>setIntroOpen(false)}>Take your seat ↗</button></section></div>}
    {choiceOptions&&selection&&<div className="modal-backdrop" onClick={()=>setChoiceOptions(null)}><section className="modal choice-modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setChoiceOptions(null)} aria-label="Close target choices">×</button><span className="eyebrow">LEGAL OPTIONS ONLY</span><h2>Choose the next effect</h2><p>Effects resolve in order. You can also tap highlighted cards on the table.</p><div className="choice-list">{choiceOptions.map(t=><button key={t} data-token={t} onClick={()=>chooseToken(t)}>{choiceLabel(t)}</button>)}</div></section></div>}
    {showHints&&puzzle&&!busy&&<div className="modal-backdrop" onClick={()=>setShowHints(false)}><section className="modal hint-modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowHints(false)} aria-label="Close hints">×</button><span className="eyebrow">A LITTLE HELP · HINT {Math.min(hints,3)} OF 3</span><h2>Find the next opening</h2>{!puzzle.hints.includes(caption)&&<p>{caption}</p>}<div className="hint-ladder">{puzzle.hints.slice(0,Math.min(hints,3)).map((h,i)=>{const parts=h.split(/\s{2}(?=\d+\. )/),lead=/^\d+\. /.test(parts[0])?'':parts[0],moves=lead?parts.slice(1):parts;return <div key={i} className="hint-step"><b>{i+1}</b><div>{lead&&<p>{lead}</p>}{moves.length>0&&<ol>{moves.map((m,j)=><li key={j}>{m.replace(/^\d+\.\s*/,'')}</li>)}</ol>}</div></div>;})}</div><div className="modal-actions"><button onClick={()=>{setShowHints(false);hint();}} disabled={hints>=3}>Next hint</button>{hints>=3&&<button className="primary" onClick={()=>{setShowHints(false);void solution();}}>Show solution</button>}<button onClick={()=>setShowHints(false)}>Back to table</button></div></section></div>}
    {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSettings(false)} aria-label="Close settings">×</button><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>Your table</h2><div className="mat-picker">{['Emerald felt','Midnight voyage','Warm canvas'].map((name,i)=><button className={`mat-${i} ${progress.mat===i?'chosen':''}`} key={i} onClick={()=>updateProgress({mat:i})}><span>✦</span>{name}{progress.mat===i?' ✓':''}</button>)}</div><label className="setting-row">Card sounds <input type="checkbox" checked={progress.sound} onChange={e=>updateProgress({sound:e.target.checked})}/></label><label className="setting-row">Play in portrait <input type="checkbox" checked={progress.portrait} onChange={e=>updateProgress({portrait:e.target.checked})}/></label><p className="install-note">Keep the table handy: use your browser's “Add to Home Screen” or “Install app”. Long-press a card to read it. Drag, or tap a card then a highlighted target.</p><button className="primary" onClick={()=>setSettings(false)}>Back to the table</button></section></div>}
    {logOpen&&<div className="drawer-backdrop" onClick={()=>setLogOpen(false)}><aside className="move-drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setLogOpen(false)} aria-label="Close move log">×</button><h2>Your line</h2><p>Every move, in order.</p><ol>{state?.log.map((line,i)=><li key={i}>{line}</li>)}</ol>{!state?.log.length&&<p>The table is set. Make your first move.</p>}</aside></div>}
    {showWin&&puzzle&&<div className="modal-backdrop win-backdrop"><section className="modal win-modal"><button className="close" onClick={()=>setShowWin(false)} aria-label="Return to solved table">×</button><div className="win-star">✦</div><span className="eyebrow">{walkthrough?'THE LINE, EXPLAINED':'LETHAL FOUND'}</span><h2>{walkthrough?'Now try it yourself.':'Beautifully played.'}</h2><p>{puzzle.lesson}</p><div className="tags">{puzzle.concepts.map(t=><span key={t}>{t}</span>)}</div><div className="win-stats"><b>{tries}<small>TRIES</small></b><b>{hints}<small>HINTS</small></b><b>{progress.streak}<small>DAY STREAK</small></b></div>{!walkthrough&&<><button className="primary" onClick={()=>void share()}>{copied?'✓ Copied':'Copy result'} ↗</button><textarea readOnly aria-label="Share result" value={`OPTCG Lethal #${(set?.puzzles.findIndex(p=>p.id===puzzle.id)??0)+1} ${'⭐'.repeat(puzzle.difficulty)}\nSolved in ${tries} tries, ${hints} hints\n${'🟥'.repeat(Math.min(tries-1,8))}🟩`}/></>}<div className="modal-actions"><button onClick={()=>{reset(false);}}>Play again</button><button onClick={()=>{setShowWin(false);setScreen('packs');}}>More puzzles</button></div></section></div>}
  </div>;
}
