import fs from 'node:fs';
import {effects} from '../src/engine/effects';
import {engine,cards} from '../src/engine/index';
import {instance,position,greedy,solve,proveLine,hiddenRepresentative,version} from './puzzle-tools';
import type {Action,GameState,Puzzle,PuzzleSet} from '../src/engine/api';
let seed=20261001;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const pick=<T>(xs:T[]):T=>xs[Math.floor(rand()*xs.length)];
const leaders=cards.filter(c=>c.category==='Leader');
const characters=(leader:string,min=0,max=10000)=>cards.filter(c=>c.category==='Character'&&(c.power||0)>=min&&(c.power||0)<=max&&c.colors.some(x=>engine.getCard(leader).colors.includes(x)));
const counter=(leader:string,n:number)=>pick(characters(leader).filter(c=>c.counter===n)).id;
function make(kind:number,index:number):GameState {
 const leader=kind===2||kind===3?'ST01-001':kind===4?'ST05-001':kind===5?'OP06-022':kind>=7?'OP17-079':pick(leaders).id;
 const opp=kind===4?'ST01-001':pick(leaders.filter(c=>c.power===5000)).id;
 const s=position(leader,opp);s.me.donActive=0;s.me.donRested=5;
 const add=(id:string,extra={})=>s.me.characters.push(instance(id,`m-${s.me.characters.length}`,extra));
 const block=()=>{const choices=characters(opp).filter(c=>c.keywords.blocker);if(!choices.length)return;const c=pick(choices);s.opp.characters.push(instance(c.id,`o-${s.opp.characters.length}`));};
 if(kind===0){s.me.leader.rested=true;add(pick(characters(leader,3000,4000)).id);add(pick(characters(leader,6000,7000)).id);s.me.donActive=1+index%2;s.me.donRested=5-s.me.donActive;block();}
 if(kind===1){add(pick(characters(leader,5000,6000)).id);add(pick(characters(leader,4000,6000)).id);s.me.donActive=2+index%3;s.me.donRested=5-s.me.donActive;block();s.opp.hand=Array.from({length:2},(_,i)=>instance(counter(opp,1000),`h-${i}`));}
 if(kind===2){s.me.leader.rested=true;add(pick(characters(leader,5000,6000)).id);block();s.me.hand=[instance('OP01-025','play-rush')];s.me.donActive=3+index%3;s.me.donRested=5-s.me.donActive;}
 if(kind===3){s.me.leader.rested=true;add(pick(characters(leader,5000,6000)).id);block();s.me.hand=[instance('ST01-015','play-removal')];s.me.donActive=4+index%2;s.me.donRested=5-s.me.donActive;}
 if(kind===4){s.me.leader.rested=true;add('OP11-068');add('P-045');s.opp.donActive=1;s.opp.donRested=4;s.opp.life=[instance(pick(['ST01-014','OP01-029','OP13-020']),'life-0')];}
 if(kind===5){add(pick(characters(leader,4000,6000)).id);add(pick(characters(leader,4000,7000)).id);s.me.donActive=index%3;s.me.donRested=5-s.me.donActive;block();s.opp.life=Array.from({length:1+index%2},(_,i)=>instance(counter(opp,pick([1000,2000])),`life-${i}`));}
 if(kind===6){s.me.leader.rested=rand()<.2;for(let i=0;i<2+index%2;i++)add(pick(characters(leader,3000,7000)).id);s.me.donActive=1+index%4;s.me.donRested=5-s.me.donActive;for(let i=0;i<index%3;i++)block();s.opp.hand=Array.from({length:index%3},(_,i)=>instance(counter(opp,pick([1000,2000])),`h-${i}`));s.opp.life=Array.from({length:index%2},(_,i)=>instance(counter(opp,1000),`life-${i}`));}
 if(kind===7||kind===8){for(let i=0;i<(kind===8?3:2);i++)add(pick(characters(leader,kind===7&&i===0?5000:6000,kind===7&&i===0?5000:6000)).id);s.me.donActive=kind===8?3:3;s.me.donRested=5-s.me.donActive;for(let i=0;i<(kind===8?2:1);i++)block();s.opp.hand=Array.from({length:2},(_,i)=>instance(counter(opp,2000),`h-${i}`));}
 // Deck tops are explicit so Trigger draws never invent an unknown card.
 s.opp.deck=Array.from({length:4},(_,i)=>instance(counter(opp,1000),`deck-${i}`));s.me.deck=Array.from({length:4},(_,i)=>instance(counter(leader,1000),`md-${i}`));
 s.me.donRested+=5;s.me.donDeck=0;s.opp.donRested+=5;s.opp.donDeck=0;
 return s;
}
function why(s:GameState,a:Action):string {
 if(a.type==='attachDon'){const before=engine.power(s,a.target),after=engine.power(engine.apply(s,a).state,a.target);return `${engine.getCard(engine.findCard(s,a.target)!.card.defId).name} goes from ${before} to ${after} power, including printed conditional buffs. Spread DON!! when one large attack can be absorbed by a Blocker.`;}
 if(a.type==='attack'){const ap=engine.power(s,a.attacker),dp=engine.power(s,a.target);const attacker=engine.findCard(s,a.attacker)!.card,name=engine.getCard(attacker.defId).name;const available=s.opp.hand.map(c=>{const d=engine.getCard(c.defId),r=effects[c.defId];const n=d.counter||(s.opp.donActive>=(d.cost||0)?(r.counter||0)+(s.opp.life.length<=2?r.counterLowLife||0:0):0);return n?`${d.name} (+${n})`:null;}).filter(Boolean);return `${name}: ${ap} into ${dp} needs at least +${Math.max(0,dp>ap?0:Math.ceil((ap-dp+1)/1000)*1000)} counter power to stop a hit. ${a.target!==s.opp.leader.uid?'A hit K.O.s this Character and returns its attached DON!! to their rested cost area.':s.opp.life.length?'A Leader hit takes Life into their hand unless Banish applies.':'A Leader hit now wins at 0 Life.'} ${!s.opp.handVisible?'The hidden-hand rule allows up to +'+s.opp.hand.length*2000+' total Character counter power.':available.length?'Their available hand counters are '+available.join(', ')+'.':'Their hand has no payable counters.'} ${effects[attacker.defId].unblockableDon&&attacker.don>=effects[attacker.defId].unblockableDon!?'Attached DON!! prevents Blocker on this battle.':s.opp.characters.some(c=>!c.rested&&engine.getCard(c.defId).keywords.blocker)?'An active Blocker can redirect this attack.':'No active Blocker can redirect this attack.'}`;}
 if(a.type==='play'){const c=engine.getCard(engine.findCard(s,a.uid)!.card.defId);return `${c.name} costs ${c.cost} active DON!!. ${c.keywords.rush?'Rush supplies an attacker immediately.':'Resolve the selected printed effect before choosing the next attack.'}`;}
 if(a.type==='activate'&&a.targets?.[0]?.includes('#')){const [uid,n]=a.targets[0].split('#');return `Give ${n} rested DON!! to ${engine.getCard(engine.findCard(s,uid)!.card.defId).name}: +${Number(n)*1000} power during your turn, without spending active DON!!. Use this once-per-turn ability before that card attacks.`;}
 if(a.type==='activate')return `Use ${engine.getCard(engine.findCard(s,a.uid)!.card.defId).name}'s printed ability now; its cost and once-per-turn limit matter before the next attack.`;
 return 'Ending the turn gives up the puzzle.';
}
const puzzles:Puzzle[]=[],signatures=new Set<string>();let attempts=0;const stats:Record<string,number>={};
while(puzzles.length<45&&attempts<2400){
 const kind=attempts%9,index=attempts++;if(kind===7&&puzzles.filter(p=>p.difficulty===4).length>=9||kind===8&&puzzles.filter(p=>p.difficulty===5).length>=9||[0,2,3,4].includes(kind)&&puzzles.filter(p=>p.difficulty<=2).length>=18)continue;const s=make(kind,index);
 if(s.opp.characters.length===0&&[0,1,2,3].includes(kind))continue;
 const sig=JSON.stringify([s.me.leader.defId,s.me.characters.map(c=>c.defId),s.me.hand.map(c=>c.defId),s.me.donActive,s.opp.leader.defId,s.opp.characters.map(c=>c.defId),s.opp.hand.map(c=>c.defId),s.opp.life.map(c=>c.defId)]);
 if(signatures.has(sig))continue;
 if(greedy(s).state.winner==='me'){stats.greedy=(stats.greedy||0)+1;continue;}
 const solved=solve(s,100000,true);if(solved.win!==true||!solved.complete||!solved.line.length){stats.search=(stats.search||0)+1;continue;}
 if(!proveLine(s,solved.line).win){stats.fixedLine=(stats.fixedLine||0)+1;continue;}
 // Hidden domain is declared, exhaustively represented by strongest +2000 Characters.
 let hidden=false;if(puzzles.filter(p=>!p.state.opp.handVisible).length<15&&s.opp.hand.length&&proveLine(hiddenRepresentative(s),solved.line).win){hidden=true;s.opp.handVisible=false;}
 let st=s;const descriptions:string[]=[];const solution=solved.line.map(action=>{const note=why(st,action);descriptions.push(engine.describeAction(st,action));st=engine.apply(st,action).state;return {action,why:note};});if(st.winner!=='me'){stats.replay=(stats.replay||0)+1;continue;}
 const concepts=kind===0?['DON!! distribution','Blockers']:kind===1?['counter math','DON!! distribution','Blockers']:kind===2?['Rush & removal','Blockers']:kind===3?['Rush & removal','Blockers']:kind===4?['Triggers & Banish','attack order']:kind===5?['Double Attack timing','Life to hand','DON!! distribution']:['counter math','attack order','Blockers'];
 const length=solved.minAttackerActions||solution.length;
 const idea=solution.some(x=>x.action.type==='activate')||kind===4||kind===5;const difficultyScore=length+(solved.winningFirstMoves===1?.5:solved.winningFirstMoves>=6?-.5:0)+(idea?.25:0);
 const difficulty=Math.min(5,Math.max(1,difficultyScore<=3.25?1:difficultyScore<=4.25?2:difficultyScore<=5.25?3:difficultyScore<=6.25?4:5)) as Puzzle['difficulty'];
 if(puzzles.filter(p=>p.difficulty===difficulty).length>=9)continue;
 const names=s.me.characters.map(c=>engine.getCard(c.defId).name);const id=`gen-${String(puzzles.length+1).padStart(4,'0')}`;
 const puzzle:Puzzle={id,title:`${pick(names)}: ${concepts[0]}`,difficulty,concepts,intro:`Win this Main Phase against every legal defense. They have ${s.opp.life.length} Life, ${s.opp.characters.filter(c=>engine.getCard(c.defId).keywords.blocker).length} Blocker(s), and ${s.opp.hand.length} hand card(s).${hidden?' Hidden-hand rule: their hand contains only color-legal Characters, each with at most +2000 counter; no Counter Events. The walkthrough wins even if every card has +2000.':''}`,state:s,solution,hints:[`Think about ${concepts.join(' and ')} before committing DON!!.`,engine.describeAction(s,solution[0].action),descriptions.join(' → ')],lesson:kind===5?'Double Attack removes up to two Life, but damage taken at one Life does not win. Plan a later attack at zero Life and account for the counters that Life supplies.':kind===4?'Banish trashes Life without feeding the defender another counter. Attack order can turn the same board from a failed finish into lethal.':kind===2?'Reserve DON!! for Rush before attaching power. One more attack can matter more than one large attack.':kind===3?'Spend DON!! on removal before attaching power. A cleared Blocker frees your remaining attack to reach the Leader.':'A Blocker can absorb one large attack. Allocate power across the attacks that must get through, and remember that equality still hits.',verified:{solverVersion:version,nodes:solved.nodes,forcedWin:true,minAttackerActions:length}};
 signatures.add(sig);puzzles.push(puzzle);console.log(`${id} d${difficulty} ${concepts[0]} ${solution.length} steps / ${solved.nodes} nodes${hidden?' hidden':''}`);
}
if(puzzles.filter(p=>!p.state.opp.handVisible).length<15)throw Error('Insufficient hidden puzzles');
if(puzzles.length!==45)throw Error(`Generated only ${puzzles.length}; attempts=${attempts} ${JSON.stringify(stats)}`);
const categories=['Blockers','counter math','DON!! distribution','Rush & removal','Triggers & Banish','Double Attack timing'];
const packs=categories.map((title,i)=>({id:`pack-${i+1}`,title,puzzleIds:puzzles.filter(p=>p.concepts.includes(title)).map(p=>p.id)}));packs.push({id:'starter',title:'Starter lessons',puzzleIds:puzzles.filter(p=>p.difficulty===1).map(p=>p.id)});
// Each consecutive week starts with the easiest remaining entries.
const remaining=[...puzzles].sort((a,b)=>a.difficulty-b.difficulty),dailyOrder:string[]=[];
while(remaining.length){for(let i=0;i<7&&remaining.length;i++){const ix=i<3?0:Math.min(remaining.length-1,Math.floor(remaining.length*(i-2)/5));dailyOrder.push(remaining.splice(ix,1)[0].id);}}
const set:PuzzleSet={generatedAt:'2026-10-01T00:00:00-04:00',puzzles,packs,dailyOrder};
fs.writeFileSync('public/puzzles.json',JSON.stringify(set,null,2)+'\n');fs.writeFileSync('reports/generation.json',JSON.stringify({seed:20261001,attempts,rejections:stats,hidden:puzzles.filter(p=>!p.state.opp.handVisible).length,histogram:Object.fromEntries([1,2,3,4,5].map(d=>[d,puzzles.filter(p=>p.difficulty===d).length]))},null,2));
