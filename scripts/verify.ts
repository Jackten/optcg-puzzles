/** E2E proof at the shipping engine boundary.
 * Credible failures: wrong battle equality, opponent DON power, feeding counters from
 * Life, Double Attack winning one hit early, Banish allowing a Trigger, corrupting
 * sibling defense branches, inventing hidden information, or treating a budget
 * timeout as a win. Receipt below captures every shipped replay and fresh proof.
 */
import fs from 'node:fs';
import {engine,cards,attackResponses} from '../src/engine/index';
import {solve,greedy,proveLine,alternativeHands,hiddenRepresentative,instance,position,version} from './puzzle-tools';
import type {Action,GameState,PuzzleSet} from '../src/engine/api';
const set=JSON.parse(fs.readFileSync('public/puzzles.json','utf8')) as PuzzleSet;
const times:number[]=[],failures:string[]=[],receipts:any[]=[];
function check(ok:boolean,label:string){if(!ok)failures.push(label);}
function replay(s:GameState,line:Action[],timed=true):GameState {
 let st=structuredClone(s);for(const a of line){if(st.phase==='over')break;const before=JSON.stringify(st),t=performance.now();const result=engine.apply(st,a);if(a.type==='attack'&&timed)times.push(performance.now()-t);check(JSON.stringify(st)===before,'Engine mutated input');st=result.state;}return st;
}
/** Each hand identity is equivalent to its counter value in this declared domain.
 * Exhaust all distinct color-legal Character counter values, not just random hands.
 */
function hiddenClasses(s:GameState):GameState[]{
 const colors=engine.getCard(s.opp.leader.defId).colors,pool=cards.filter(c=>c.category==='Character'&&c.colors.some(x=>colors.includes(x))),reps=new Map<number,string>();for(const c of pool)reps.set(c.counter||0,c.id);
 let states=[structuredClone(s)];for(let i=0;i<s.opp.hand.length;i++)states=states.flatMap(st=>[...reps.values()].map(id=>{const x=structuredClone(st);x.opp.hand[i]=instance(id,st.opp.hand[i].uid);return x;}));return states;
}
for(const p of set.puzzles){const start=performance.now();try{
 const result=replay(p.state,p.solution.map(x=>x.action));check(result.winner==='me',`${p.id}: replay failed`);
 const budget=Math.max(300000,p.verified.nodes*3),proof=solve(p.state,budget,true);check(proof.win===true&&proof.complete,`${p.id}: fresh forced-win proof incomplete`);check(proof.minAttackerActions===p.verified.minAttackerActions,`${p.id}: minimum-action claim differs`);
 check(engine.apply(p.state,{type:'endTurn'}).state.winner==='opp',`${p.id}: endTurn didn't lose`);
 const wrong=greedy(p.state);check(wrong.state.winner!=='me',`${p.id}: greedy line wins`);
 const fixed=proveLine(p.state,p.solution.map(x=>x.action),budget);check(fixed.win,`${p.id}: walkthrough is not universal across defenses`);
 let hidden=0,samples=0;if(!p.state.opp.handVisible){check(p.intro.includes('Character')&&/\+2,?000/.test(p.intro),`${p.id}: missing hidden-domain disclosure`);for(const st of hiddenClasses(p.state)){hidden++;check(proveLine(st,p.solution.map(x=>x.action),budget).win,`${p.id}: hidden counter class fails`);}check(proveLine(hiddenRepresentative(p.state),p.solution.map(x=>x.action)).win,`${p.id}: strongest hidden hand fails`);for(const st of alternativeHands(p.state)){samples++;check(replay(st,p.solution.map(x=>x.action),false).winner==='me',`${p.id}: sampled hidden hand fails`);}}
 receipts.push({id:p.id,replayWinner:result.winner,freshWin:proof.win,complete:proof.complete,nodes:proof.nodes,winningFirstMoves:proof.winningFirstMoves,minActions:proof.minAttackerActions,greedyWinner:wrong.state.winner,universalWalkthroughNodes:fixed.nodes,hiddenClasses:hidden,hiddenSamples:samples,ms:performance.now()-start});
 console.log(`${p.id}: ${result.winner==='me'&&proof.win===true?'PASS':'FAIL'} (${proof.nodes} nodes)`);
 }catch(e){failures.push(`${p.id}: ${String(e)}`);}}
// Rules-critical battle flows: these are full engine calls with receipt events.
const rules:any[]=[];
function flow(name:string,s:GameState,line:Action[],predicate:(end:GameState)=>boolean){try{const end=replay(s,line,false);check(predicate(end),name);rules.push({name,pass:predicate(end),winner:end.winner,log:end.log});}catch(e){failures.push(`${name}: ${e}`);}}
{
 const s=position('OP17-079','ST03-001');s.me.characters=[instance('ST06-011','atk')];s.opp.leader.don=5;
 flow('Opponent attached DON gives no ordinary power; equality hits',s,[{type:'attack',attacker:'atk',target:'o-L'}],x=>x.winner==='me');
}
{
 const s=position('ST01-001','ST03-001');s.me.leader.rested=true;s.me.characters=[instance('P-028','double'),instance('ST01-008','follow')];s.opp.life=[instance('ST03-002','life')];
 const one=replay(s,[{type:'attack',attacker:'double',target:'o-L'}],false);check(one.phase==='main'&&one.opp.life.length===0&&one.opp.hand.length===1,'Double Attack with one Life must not win');
 flow('New Life card counters the later attack',one,[{type:'attack',attacker:'follow',target:'o-L'}],x=>x.winner!=='me'&&x.opp.trash.some(c=>c.uid==='life'));
 const branches=attackResponses(one,{type:'attack',attacker:'follow',target:'o-L'});check(branches.some(x=>x.state.winner==='me')&&branches.some(x=>x.state.winner===null),'Counter branches must not mutate one another');
}
{
 const s=position('ST05-001','ST01-001');s.me.leader.rested=true;s.me.characters=[instance('P-045','banish')];s.opp.life=[instance('OP13-020','trigger')];
 flow('Banish suppresses Trigger and sends Life to trash',s,[{type:'attack',attacker:'banish',target:'o-L'}],x=>x.opp.hand.length===0&&x.opp.trash.some(c=>c.uid==='trigger')&&x.me.characters[0].powerMod===0);
}
{
 const s=position('ST01-001','ST03-001');s.me.donActive=3;s.me.donRested=2;s.me.hand=[instance('OP01-025','rush')];
 flow('Paid Rush attacks immediately',s,[{type:'play',uid:'rush',targets:[]},{type:'attack',attacker:'rush',target:'o-L'}],x=>x.winner==='me'&&x.me.donActive===0&&x.me.donRested===5);
}
{
 const s=position('ST01-001','ST03-001');s.me.donActive=1;s.me.donRested=4;s.me.hand=[instance('ST01-003','new')];const st=engine.apply(s,{type:'play',uid:'new',targets:[]}).state;
 check(!engine.legalActions(st).some(a=>a.type==='attack'&&a.attacker==='new'),'Non-Rush summoning sickness');
 check(engine.stillWinnable(s,0)===null,'Zero budget reports unknown');
}
const summary={puzzles:set.puzzles.length,passed:set.puzzles.length-new Set(failures.filter(f=>/^(gen|hard)-/.test(f)).map(f=>f.split(':')[0])).size,failed:failures.length,attacks:times.length,defenderMs:{max:Math.max(0,...times),avg:times.reduce((n,x)=>n+x,0)/Math.max(1,times.length),p95:[...times].sort((a,b)=>a-b)[Math.floor(times.length*.95)]||0},hiddenPuzzles:set.puzzles.filter(p=>!p.state.opp.handVisible).length,hiddenClasses:receipts.reduce((n,r)=>n+r.hiddenClasses,0),hiddenSamples:receipts.reduce((n,r)=>n+r.hiddenSamples,0),difficultyHistogram:Object.fromEntries([1,2,3,4,5].map(d=>[d,set.puzzles.filter(p=>p.difficulty===d).length]))};
check(set.puzzles.filter(p=>p.id.startsWith('gen-')).length===45,'Expected 45 core puzzles');check(set.puzzles.filter(p=>p.id.startsWith('hard-')).every(p=>p.verified.minAttackerActions>=8),'Hard puzzles must need 8+ actions');check(set.puzzles.filter(p=>p.id.startsWith('gen-')&&!p.state.opp.handVisible).length===15,'Expected one third hidden puzzles');check(Object.values(summary.difficultyHistogram).every(n=>n>0),'Missing a difficulty');check(summary.defenderMs.max<150,'Defender exceeded 150 ms on this Mac');
summary.failed=failures.length;
fs.writeFileSync('reports/verify.json',JSON.stringify({solverVersion:version,environment:'Node on Mac; timings are not physical-phone acceptance',summary,failures,rules,puzzles:receipts},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
