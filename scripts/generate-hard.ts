// Hard tier: rich boards (several tools in hand, decoys, more DON!! than you can spend well)
// kept only when the solver proves a forced win, greedy play fails, the win is long,
// and at most two first moves keep lethal. Appends to public/puzzles.json; existing puzzles untouched.
import fs from 'node:fs';
import {engine,cards} from '../src/engine/index';
import {instance,position,greedy,solve,proveLine,hiddenRepresentative,version} from './puzzle-tools';
import type {GameState,Puzzle,PuzzleSet} from '../src/engine/api';
import {teachSet} from './teach';

const WANT=Number(process.env.HARD_COUNT||15),MIN_ACTIONS=Number(process.env.HARD_MIN||8),BUDGET=Number(process.env.HARD_BUDGET||600000),DEADLINE=Date.now()+Number(process.env.HARD_MINUTES||40)*60000;
let seed=Number(process.env.HARD_SEED||20261002);const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const pick=<T>(xs:T[]):T=>xs[Math.floor(rand()*xs.length)];
const int=(a:number,b:number)=>a+Math.floor(rand()*(b-a+1));
const leaders=cards.filter(c=>c.category==='Leader');
const inColors=(leader:string)=>(c:typeof cards[number])=>c.colors.some(x=>engine.getCard(leader).colors.includes(x));
const vanilla=/^-?$|^\s*-\s*$/;

function make():GameState {
 const leader=pick(leaders).id,opp=pick(leaders.filter(c=>c.power===5000&&c.id!==leader)).id;
 const s=position(leader,opp),mine=cards.filter(inColors(leader)),theirs=cards.filter(inColors(opp));
 let n=0;const uid=(p:string)=>`${p}-${n++}`;
 // My board: 2-4 Characters already in play, optionally the Leader already rested.
 const bodies=mine.filter(c=>c.category==='Character'&&(c.power||0)>=3000);
 for(let i=int(2,4);i>0;i--)s.me.characters.push(instance(pick(bodies).id,uid('m')));
 s.me.leader.rested=rand()<.3;
 // My hand: 2-4 cards with effects (removal, Rush, rest, bounce, stages, ramp), some of them decoys.
 const tools=mine.filter(c=>c.category!=='Leader'&&(c.category!=='Character'||!vanilla.test(c.effectText)||c.keywords.rush)&&!(c.category==='Event'&&/\[Counter\]/.test(c.effectText))&&(c.cost||0)<=7);
 // At most 2 copies of a card, so the hand reads like a real one.
 if(tools.length)for(let i=int(2,4),tries=0;i>0&&tries<20;tries++){const id=pick(tools).id;if(s.me.hand.filter(c=>c.defId===id).length<2){s.me.hand.push(instance(id,uid('mh')));i--;}}
 const donTotal=10;s.me.donActive=int(3,5);s.me.donRested=donTotal-s.me.donActive;s.me.donDeck=0;
 // Their board: 1-2 Blockers plus maybe a big body, 1-2 Life, 1-3 counter cards.
 const blockers=theirs.filter(c=>c.category==='Character'&&c.keywords.blocker),bigs=theirs.filter(c=>c.category==='Character'&&(c.power||0)>=6000);
 for(let i=int(1,2);i>0&&blockers.length;i--)s.opp.characters.push(instance(pick(blockers).id,uid('o')));
 if(rand()<.35&&bigs.length)s.opp.characters.push(instance(pick(bigs).id,uid('o'),{rested:rand()<.5}));
 const counters=theirs.filter(c=>c.category==='Character'&&(c.counter||0)>0);
 s.opp.life=Array.from({length:int(1,2)},()=>instance(pick(counters).id,uid('life')));
 s.opp.hand=Array.from({length:int(1,3)},()=>instance(pick(counters).id,uid('h')));
 s.opp.deck=Array.from({length:4},()=>instance(pick(counters).id,uid('deck')));s.me.deck=Array.from({length:4},()=>instance(pick(bodies).id,uid('md')));
 s.opp.donActive=0;s.opp.donRested=10;s.opp.donDeck=0;
 return s;
}

const set:PuzzleSet=JSON.parse(fs.readFileSync('public/puzzles.json','utf8'));
const base=set.puzzles.filter(p=>!p.id.startsWith('hard-'));
const names=['Gear Shift','Conqueror\'s Haki','Final Voyage','Emperor\'s Gambit','Road Poneglyph','Onigashima Roof','Marineford','Enies Lobby','Sabaody Break','Wano Dawn','Laugh Tale','Red Line','Raftel Bound','Gomu Gomu Finish','Thousand Sunny','King of the Pirates','Punk Hazard','Dressrosa Coliseum','Whole Cake','Egghead'];
const found:Puzzle[]=[],stats:Record<string,number>={},sigs=new Set<string>();let attempts=0;
while(!process.env.HARD_FROM&&found.length<WANT&&Date.now()<DEADLINE){
 attempts++;const s=make();
 const sig=JSON.stringify([s.me.leader.defId,s.me.characters.map(c=>c.defId).sort(),s.me.hand.map(c=>c.defId).sort(),s.opp.characters.map(c=>c.defId).sort()]);
 if(sigs.has(sig)){stats.dup=(stats.dup||0)+1;continue;}sigs.add(sig);
  // Tighten: start short on DON!! and add one at a time until a forced win first appears.
 let t0=Date.now(),solved=solve(s,BUDGET,false);
 while(solved.win===false&&solved.complete&&s.me.donActive<8){s.me.donActive++;s.me.donRested--;solved=solve(s,BUDGET,false);}
 if(solved.win===true&&solved.complete)solved=solve(s,BUDGET,true);
 if(process.env.HARD_DEBUG)console.error(`#${attempts} win=${solved.win} complete=${solved.complete} nodes=${solved.nodes} min=${solved.minAttackerActions} first=${solved.winningFirstMoves} ${Date.now()-t0}ms hand=${s.me.hand.length} don=${s.me.donActive} blockers=${s.opp.characters.length} life=${s.opp.life.length} ohand=${s.opp.hand.length}`);
 if(solved.win!==true||!solved.complete){stats[solved.win===null||!solved.complete?'budget':'noWin']=(stats[solved.win===null||!solved.complete?'budget':'noWin']||0)+1;continue;}
 if(greedy(s).state.winner==='me'){stats.greedy=(stats.greedy||0)+1;continue;}
 if((solved.minAttackerActions||0)<MIN_ACTIONS){stats.short=(stats.short||0)+1;continue;}
 const legalFirst=engine.legalActions(s).filter(a=>a.type!=='endTurn').length;
 if(solved.winningFirstMoves>Math.max(2,Math.floor(legalFirst*.2))){stats.loose=(stats.loose||0)+1;continue;}
 if(!proveLine(s,solved.line,BUDGET).win){stats.fixedLine=(stats.fixedLine||0)+1;continue;}
 let st=s;for(const a of solved.line)st=engine.apply(st,a).state;if(st.winner!=='me'){stats.replay=(stats.replay||0)+1;continue;}
 // Hide the hand when the walkthrough beats the strongest legal hidden hand.
 if(s.opp.hand.length&&proveLine(hiddenRepresentative(s),solved.line,BUDGET).win)s.opp.handVisible=false;
 const id=`hard-${String(found.length+1).padStart(3,'0')}`;
 found.push({id,title:`${names[found.length%names.length]}: hard`,difficulty:5,concepts:[],intro:'',state:s,
  solution:solved.line.map(action=>({action,why:''})),hints:['','',''],lesson:'',
  verified:{solverVersion:version,nodes:solved.nodes,forcedWin:true,minAttackerActions:solved.minAttackerActions!}});
 console.log(`${id} ${solved.minAttackerActions} actions, ${solved.winningFirstMoves}/${legalFirst} first moves win, ${solved.nodes} nodes, hand ${s.me.hand.map(c=>engine.getCard(c.defId).name).join(', ')}${s.opp.handVisible?'':' [hidden]'}`);
}
console.log(JSON.stringify({attempts,found:found.length,stats}));
// Parallel seeds: HARD_OUT saves raw candidates; HARD_FROM=a.json,b.json merges them instead of searching.
if(process.env.HARD_OUT){fs.writeFileSync(process.env.HARD_OUT,JSON.stringify(found));process.exit(0);}
if(process.env.HARD_FROM){const seen=new Set<string>();for(const f of process.env.HARD_FROM.split(','))for(const p of JSON.parse(fs.readFileSync(f,'utf8')) as Puzzle[]){const k=JSON.stringify(p.state);if(seen.has(k))continue;seen.add(k);found.push(p);}
 found.sort((a,b)=>a.verified.minAttackerActions-b.verified.minAttackerActions||a.verified.nodes-b.verified.nodes);found.forEach((p,i)=>{p.id=`hard-${String(i+1).padStart(3,'0')}`;p.title=`${names[i%names.length]}: hard`;});}
const taught=teachSet({...set,puzzles:[...base,...found]});
const hard=taught.puzzles.filter(p=>p.id.startsWith('hard-'));
taught.packs=[{id:'hard',title:'Captain\'s gauntlet',puzzleIds:hard.map(p=>p.id)},...taught.packs.filter(p=>p.id!=='hard').map(p=>({...p,puzzleIds:p.puzzleIds.filter(id=>!id.startsWith('hard-'))}))];
// Existing daily order stays fixed; hard puzzles join at the end of the rotation.
taught.dailyOrder=[...set.dailyOrder.filter(id=>!id.startsWith('hard-')),...hard.map(p=>p.id)];
if(process.env.HARD_WRITE!=='0')fs.writeFileSync('public/puzzles.json',JSON.stringify(taught,null,2)+'\n');
