// Teaching text: rewrites each puzzle's intro, step notes, hint ladder, lesson, concepts,
// title and packs from what actually happens when the stored solution is replayed.
// Pure post-process: board states and solutions are untouched, so verification still holds.
// Usage: node --import tsx scripts/teach.ts   (rewrites public/puzzles.json in place)
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {engine} from '../src/engine/index';
import type {Action,GameEvent,GameState,Puzzle,PuzzleSet} from '../src/engine/api';

const n = (x:number) => x.toLocaleString('en-US');
const def = (s:GameState,uid:string) => engine.getCard(engine.findCard(s,uid)!.card.defId);
function name(s:GameState,uid:string) {
  const f=engine.findCard(s,uid)!, nm=def(s,uid).name;
  if(f.zone!=='characters') return nm;
  const row=s[f.side].characters, twins=row.filter(c=>engine.getCard(c.defId).name===nm);
  return twins.length>1 ? `${nm} (slot ${row.findIndex(c=>c.uid===uid)+1})` : nm;
}
const list = (xs:string[]) => xs.length<=1 ? xs.join('') : `${xs.slice(0,-1).join(', ')} and ${xs[xs.length-1]}`;
const count = (k:number,one:string,many=one+'s') => `${n(k)} ${k===1?one:many}`;
const cap = (t:string) => t[0].toUpperCase()+t.slice(1);

// "their Leader, Zoro" / "Twenty Doctors"
function who(s:GameState,uid:string,side:'me'|'opp'=engine.findCard(s,uid)!.side) {
  const isLeader = s[side].leader.uid===uid;
  return isLeader ? `${side==='opp'?'their':'your'} Leader ${name(s,uid)}` : name(s,uid);
}
function activeBlockers(s:GameState) { return s.opp.characters.filter(c=>!c.rested&&engine.getCard(c.defId).keywords.blocker); }
function counterValue(s:GameState) { return s.opp.handVisible ? s.opp.hand.reduce((t,c)=>t+(engine.getCard(c.defId).counter||0),0) : s.opp.hand.length*2000; }
// Smallest counter that stops `ap` into `dp` (the attacker wins ties, so the defender must go strictly above).
const toStop = (ap:number,dp:number) => ap<dp ? 0 : (Math.floor((ap-dp)/1000)+1)*1000;

function effectText(s:GameState,ev:GameEvent&{kind:'effect'},all:GameEvent[]):string {
  const [kind,target] = ev.text.split(' → ');
  const ret = /^Return (\d+) DON!!/.exec(ev.text);
  if(ret) return `costs ${ret[1]} DON!! (returned to your DON!! deck)`;
  switch(kind) {
    case 'attachRested': return `tucks rested DON!! under ${target} for extra power`;
    case 'bounce': return `sends ${target} back to its owner's hand`;
    case 'ko': return `K.O.s ${target}`;
    case 'rest': return `rests ${target}, so it can't block`;
    case 'power': { const d=all.find(e=>e.kind==='powerChange') as {delta:number}|undefined; return `gives ${target} ${d?`${d.delta>0?'+':''}${n(d.delta)} power`:'a power boost'}`; }
    case 'filmBuff': return `powers up ${target}`;
    case 'trashLife': return `trashes the top card of their Life`;
    case 'addDon': return `adds DON!! from your DON!! deck`;
    case 'draw': return `draws a card`;
    default: return ev.text;
  }
}

function stepNote(s:GameState,a:Action,rest:Action[]):string {
  const r = engine.apply(s,a), ev = r.events, after = r.state;
  if(a.type==='attachDon') {
    const before=engine.power(s,a.target), now=engine.power(after,a.target), who1=cap(who(s,a.target,'me'));
    const more = rest.findIndex(x=>x.type!=='attachDon')>0 && rest.slice(0,rest.findIndex(x=>x.type!=='attachDon')).some(x=>x.type==='attachDon'&&x.target===a.target) || rest.length>0 && rest.every(x=>x.type==='attachDon'&&x.target===a.target);
    const attack = rest.find(x=>x.type==='attack'&&x.attacker===a.target) as Extract<Action,{type:'attack'}>|undefined;
    if(!attack) return `${who1} goes from ${n(before)} to ${n(now)} power.`;
    const dp=engine.power(after,attack.target), tgt=who(after,attack.target,'opp');
    if(more) return `${who1} goes to ${n(now)}. Keep loading it: it's going after ${tgt} (${n(dp)}), and every extra 1,000 is another counter they have to find.`;
    if(now<dp) return `${who1} goes to ${n(now)}, still under ${tgt} (${n(dp)}). It doesn't need to win its fight, only to make them react.`;
    const need=toStop(now,dp), supply=counterValue(after);
    const tail = !after.opp.hand.length ? (after.opp.life.length?'Their hand is empty right now, though any Life card they take goes there.':'Their hand is empty, so nothing can counter it.')
      : supply<need ? `They'd need +${n(need)} to stop it, and ${after.opp.handVisible?'their hand only has':'even at +2,000 a card they only have'} +${n(supply)}.`
      : `They'd need +${n(need)} to stop it.`;
    return `${who1} goes to ${n(now)} against ${tgt} (${n(dp)}). Ties go to the attacker. ${tail}`;
  }
  if(a.type==='attack') {
    const ap=engine.power(s,a.attacker), dp=engine.power(s,a.target), att=cap(who(s,a.attacker,'me')), tgt=who(s,a.target,'opp');
    const block=ev.find(e=>e.kind==='block') as {blocker:string}|undefined;
    const counters=ev.filter(e=>e.kind==='counter') as {amount:number}[];
    const battle=ev.find(e=>e.kind==='battle') as {hit:boolean}|undefined;
    const won=ev.some(e=>e.kind==='win'), ko=ev.find(e=>e.kind==='ko') as {uid:string}|undefined;
    const life=ev.filter(e=>e.kind==='lifeLost'&&e.side==='opp') as {to:string}[];
    const trig=ev.find(e=>e.kind==='trigger') as {text:string}|undefined;
    const parts=[`${att} swings at ${tgt}, ${n(ap)} into ${n(dp)}.`];
    if(block) {
      const left=activeBlockers(after).length;
      parts.push(`${name(s,block.blocker)} blocks${ko&&ko.uid===block.blocker?' and is K.O.\'d':''}. ${left?`That's 1 Blocker used up, ${n(left)} more to go.`:`That was their last Blocker, so the next attack can't be redirected.`}`);
    }
    const c=counters.reduce((t,x)=>t+x.amount,0);
    if(c) parts.push(battle?.hit ? `They counter for +${n(c)} and it still wins the battle.` : `They spend +${n(c)} in counters to stop it. Those cards are gone for the attacks that matter.`);
    if(won) parts.push(counters.length||block ? 'It connects at 0 Life. Lethal.' : `Nothing can stop it at 0 Life. Lethal.`);
    else if(block) { if(!ko&&!c) parts.push(`${name(s,block.blocker)} survives, but it's rested now and can't block again.`); }
    else if(battle?.hit && a.target===s.opp.leader.uid) {
      const toHand=life.filter(l=>l.to==='hand').length, trashed=life.length-toHand;
      if(def(s,a.attacker).keywords.doubleAttack&&life.length===1&&s.opp.life.length===1) parts.push(`Double Attack would deal 2, but they only had 1 Life card, so this can't be the winning hit.`);
      if(toHand) parts.push(`It hits. They take ${count(toHand,'Life card')} into hand, and that card could be a counter later.`);
      if(trashed) parts.push(`It hits, and Banish sends ${trashed===1?'the Life card':'those Life cards'} to the trash, so they get nothing back.`);
    }
    else if(battle?.hit) parts.push(`${tgt} is K.O.'d.`);
    else if(!c) parts.push(`It doesn't get through, but it forced the issue.`);
    if(trig) parts.push(`The Life card's Trigger fires: ${trig.text.replace(/^\[Trigger\]\s*/,'')}`);
    if(!won && after.opp.life.length===0 && s.opp.life.length>0) parts.push('They are at 0 Life now; the next clean hit wins.');
    return parts.join(' ');
  }
  if(a.type==='play') {
    const d=def(s,a.uid), effs=ev.filter(e=>e.kind==='effect') as (GameEvent&{kind:'effect'})[];
    const bits=[`Play ${d.name} for ${d.cost} DON!!.`];
    if(effs.length) bits.push(`It ${list(effs.map(e=>effectText(s,e,ev)))}.`);
    if(d.keywords.rush) bits.push('Rush means it can attack this turn, which gives you one more attacker than they planned for.');
    return bits.join(' ');
  }
  if(a.type==='activate') {
    const effs=ev.filter(e=>e.kind==='effect') as (GameEvent&{kind:'effect'})[];
    const abil=s.me.leader.uid===a.uid?`${name(s,a.uid)}'s Leader ability`:`${name(s,a.uid)}'s ability`;
    const don=a.targets?.find(t=>t.includes('#'));
    if(don){const [uid,k]=don.split('#');return `Use ${abil}: ${name(s,uid)} gets ${k} rested DON!! (+${n(Number(k)*1000)}) without touching your active DON!!. Free power comes first.`;}
    return `Use ${abil} first. It ${list(effs.map(e=>effectText(s,e,ev)))||'resolves'}.`;
  }
  return 'Ending the turn gives up the puzzle.';
}

// Short move names for the hint ladder.
function move(s:GameState,a:Action):string {
  if(a.type==='attachDon') return `DON!! to ${name(s,a.target)}`;
  if(a.type==='attack') return `${name(s,a.attacker)} attacks ${s.opp.leader.uid===a.target?'their Leader':name(s,a.target)}`;
  if(a.type==='play') return `play ${name(s,a.uid)}`;
  if(a.type==='activate') { const don=a.targets?.find(t=>t.includes('#')); return don?`${name(s,a.uid)}'s ability onto ${name(s,don.split('#')[0])}`:`${name(s,a.uid)}'s ability`; }
  return 'end turn';
}
// Collapse runs of DON!! attaches: "2 DON!! to Luffy".
function line(s:GameState,actions:Action[]):string[] {
  const out:string[]=[];let st=s;
  for(let i=0;i<actions.length;i++){const a=actions[i];
    if(a.type==='attachDon'){let k=1;while(actions[i+k]?.type==='attachDon'&&(actions[i+k] as {target:string}).target===a.target)k++;out.push(`${k} DON!! to ${name(st,a.target)}`);for(let j=0;j<k;j++)st=engine.apply(st,actions[i+j]).state;i+=k-1;continue;}
    out.push(move(st,a));st=engine.apply(st,a).state;}
  return out;
}

function concepts(p:Puzzle):string[] {
  const s=p.state, acts=p.solution.map(x=>x.action), tags:string[]=[];
  let st=s, bait=false;
  for(const a of acts){const r=engine.apply(st,a);if(a.type==='attack'&&!r.events.some(e=>e.kind==='win')&&r.events.some(e=>e.kind==='block'||e.kind==='counter'))bait=true;st=r.state;}
  const mine=[s.me.leader,...s.me.characters,...s.me.hand].map(c=>engine.getCard(c.defId));
  if(mine.some(d=>d.keywords.doubleAttack)) tags.push('Double Attack timing');
  if(mine.some(d=>d.keywords.banish)||s.opp.life.some(c=>engine.getCard(c.defId).triggerText)) tags.push('Triggers & Banish');
  if(acts.some(a=>a.type==='play')) tags.push('Rush & removal');
  if(acts.some(a=>a.type==='activate')) tags.push('Leader abilities');
  if(bait) tags.push('bait the Blocker');
  if(s.opp.hand.length||s.opp.life.length) tags.push('counter math');
  if(new Set(acts.filter(a=>a.type==='attachDon').map(a=>(a as {target:string}).target)).size>1||acts.some(a=>a.type==='activate'&&a.targets?.some(t=>t.includes('#')))) tags.push('DON!! distribution');
  if(s.opp.characters.some(c=>engine.getCard(c.defId).keywords.blocker)&&!bait) tags.push('Blockers');
  return tags.length?tags:['DON!! distribution'];
}

function nudge(p:Puzzle,primary:string):string {
  const s=p.state, b=activeBlockers(s);
  switch(primary){
    case 'Double Attack timing': return `Double Attack takes two Life at once, but a hit at 1 Life doesn't win. Which attack needs to land after they reach 0?`;
    case 'Triggers & Banish': return `Look at their Life before you swing. What happens if the wrong attack flips it?`;
    case 'Rush & removal': return `Your hand changes the board. Count your attackers and their Blockers before and after you play it.`;
    case 'Leader abilities': return `Long-press your Leader, ${name(s,s.me.leader.uid)}, and read its ability. What does it buy you before your first attack?`;
    case 'bait the Blocker': return b.length===1 ? `${name(s,b[0].uid)} can stop exactly one attack. Make sure it's one you can afford to lose.` : `Their Blockers each stop one attack. Feed them attacks you don't need.`;
    case 'counter math': return s.opp.handVisible ? `Add up their counters: ${s.opp.hand.length?list(s.opp.hand.map(c=>`${engine.getCard(c.defId).name} +${n(engine.getCard(c.defId).counter||0)}`)):'none in hand'}. Which attack can they still afford to stop?` : `Assume +2,000 per face-down card. Your finishing attack has to beat that.`;
    case 'Blockers': return `Their Blocker only matters if it's standing when your last attack comes in.`;
    default: return `One big attack is easy to stop. Where does your power do the most work?`;
  }
}
const lessons:Record<string,string> = {
  'Double Attack timing':'Double Attack is two damage, but a Leader at 1 Life only loses that last card. Use it to get them to 0, then finish with a separate hit.',
  'Triggers & Banish':'A Life card can fight back through its Trigger. Banish trashes it instead, so choose which attacker takes the Life card.',
  'Rush & removal':'Before you attach DON!!, check whether a card in hand adds an attacker or clears a Blocker. That usually does more than +1,000.',
  'Leader abilities':'Start with your Leader\'s ability. Free DON!! or removal before your first attack often decides whether the numbers work.',
  'bait the Blocker':'Swing with the attack you can afford to lose first. Once the Blocker or the counters are spent, the real attack walks in.',
  'counter math':'Count their counters before you attach. Your finisher only has to beat their Leader plus what they can still add, and ties go to the attacker.',
  'Blockers':'A Blocker stops one attack. Plan around the attack it takes, not the one you hope it ignores.',
  'DON!! distribution':'Spread DON!! so every attack you need clears its target. Extra power on an attack that was already winning is wasted.',
};

export function teach(p:Puzzle):Puzzle {
  const s=p.state, acts=p.solution.map(x=>x.action), tags=concepts(p), primary=tags[0];
  const b=activeBlockers(s), hidden=!s.opp.handVisible;
  const lifeLine = s.opp.life.length===0 ? `Their Leader is at 0 Life: one clean hit wins.` : `Their Leader has ${count(s.opp.life.length,'Life card')} left, so it has to lose ${s.opp.life.length===1?'that card':'all of them'} before a final hit can win.`;
  const blockLine = b.length===0 ? `Nothing on their side can block.` : b.length===1 ? `${name(s,b[0].uid)} can block.` : `${list(b.map(c=>name(s,c.uid)))} can block.`;
  const handLine = !s.opp.hand.length ? `Their hand is empty.` : hidden ? `They hold ${count(s.opp.hand.length,'face-down card')}. Each is a Character in their Leader's colors with at most +2,000 counter, and none are Counter Events.` : (()=>{const c=s.opp.hand.filter(h=>engine.getCard(h.defId).counter);return c.length?`They can counter with ${list(c.map(h=>`${engine.getCard(h.defId).name} (+${n(engine.getCard(h.defId).counter!)})`))}.`:`Nothing in their hand can counter.`;})();
  const mine = `You have ${n(s.me.donActive)} active DON!!${s.me.hand.length?` and ${list(s.me.hand.map(h=>engine.getCard(h.defId).name))} in hand`:''}.`;
  const intro = `${lifeLine} ${blockLine} ${handLine} ${mine} Find the line that wins against any defense.`;
  let st=s;const solution=p.solution.map((step,i)=>{const why=stepNote(st,step.action,acts.slice(i+1));st=engine.apply(st,step.action).state;return {...step,why};});
  const moves=line(s,acts);
  const hints:[string,string,string]=[nudge(p,primary),`First move: ${cap(moves[0])}.`,moves.map((m,i)=>`${i+1}. ${cap(m)}`).join('  ')];
  const title=`${p.title.split(':')[0]}: ${primary}`;
  return {...p,title,concepts:tags,intro,solution,hints,lesson:lessons[primary]??lessons['DON!! distribution']};
}

export function teachSet(set:PuzzleSet):PuzzleSet {
  const puzzles=set.puzzles.map(teach);
  const all=[...new Set(puzzles.flatMap(p=>p.concepts))];
  const packs=all.map(t=>({id:`pack-${t.toLowerCase().replace(/[^a-z]+/g,'-').replace(/-$/,'')}`,title:cap(t),puzzleIds:puzzles.filter(p=>p.concepts.includes(t)).map(p=>p.id)})).filter(x=>x.puzzleIds.length>=3);
  packs.unshift({id:'starter',title:'Starter lessons',puzzleIds:puzzles.filter(p=>p.difficulty===1).map(p=>p.id)});
  return {...set,puzzles,packs};
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const set=JSON.parse(fs.readFileSync('public/puzzles.json','utf8')) as PuzzleSet;
  fs.writeFileSync('public/puzzles.json',JSON.stringify(teachSet(set),null,2)+'\n');
  console.log('taught',set.puzzles.length,'puzzles');
}
