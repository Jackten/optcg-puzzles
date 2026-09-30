import {engine,cards,attackResponses,solve,hash} from '../src/engine/index';
import type {Action,CardInst,GameState,PlayerState} from '../src/engine/api';
export const version='optcg-main-1.0.0';
export function instance(defId:string,uid:string,extra:Partial<CardInst>={}):CardInst{return {uid,defId,rested:false,don:0,playedThisTurn:false,powerMod:0,...extra};}
export function player(leader:string,side:string):PlayerState{return {leader:instance(leader,`${side}-L`),characters:[],stage:null,hand:[],handVisible:true,life:[],lifeVisible:true,deck:[],deckCount:20,trash:[],donActive:0,donRested:5,donDeck:5};}
export function position(me='ST01-001',opp='ST03-001'):GameState{return {me:player(me,'m'),opp:player(opp,'o'),phase:'main',winner:null,turnFlags:{},log:[]};}
export function greedy(start:GameState):{state:GameState;line:Action[]} {
 let s=structuredClone(start);const line:Action[]=[];
 const attackers=[s.me.leader,...s.me.characters].filter(c=>!c.rested&&!c.playedThisTurn);
 const biggest=attackers.sort((a,b)=>engine.power(s,b.uid)-engine.power(s,a.uid))[0];
 if(biggest)while(s.me.donActive&&s.phase==='main'){const a:Action={type:'attachDon',target:biggest.uid};line.push(a);s=engine.apply(s,a).state;}
 for(const c of attackers){const a:Action={type:'attack',attacker:c.uid,target:s.opp.leader.uid};if(engine.legalActions(s).some(x=>JSON.stringify(x)===JSON.stringify(a))){line.push(a);s=engine.apply(s,a).state;}}
 if(s.phase==='main'){line.push({type:'endTurn'});s=engine.apply(s,{type:'endTurn'}).state;}return {state:s,line};
}
/** Verify a fixed walkthrough against all defenses, not just the AI's principal response. */
export function proveLine(start:GameState,line:Action[],budget=100000):{win:boolean;nodes:number} {
 let nodes=0;const memo=new Map<string,boolean>();
 const visit=(s:GameState,i:number):boolean=>{if(s.phase==='over')return s.winner==='me';if(i===line.length||++nodes>budget)return false;const k=i+hash(s),known=memo.get(k);if(known!==undefined)return known;
 const a=line[i];let result=false;try{const allowed=engine.legalActions(s).some(x=>JSON.stringify(x)===JSON.stringify(a));if(allowed){const rs=a.type==='attack'?attackResponses(s,a):[engine.apply(s,a)];result=rs.every(r=>visit(r.state,i+1));}}catch{result=false;}memo.set(k,result);return result;};return {win:visit(start,0),nodes};
}
/** Hidden hand domain: Character cards only, at most 2000 per card. Their identities have no effect in hand in this pool. */
export function hiddenRepresentative(s:GameState):GameState {
 const st=structuredClone(s),colors=engine.getCard(st.opp.leader.defId).colors;
 const max=cards.find(c=>c.category==='Character'&&c.counter===2000&&c.colors.some(x=>colors.includes(x)))!;
 st.opp.hand=st.opp.hand.map(c=>instance(max.id,c.uid));return st;
}
export function alternativeHands(s:GameState,n=16):GameState[]{
 const colors=engine.getCard(s.opp.leader.defId).colors,pool=cards.filter(c=>c.category==='Character'&&c.colors.some(x=>colors.includes(x)));
 return Array.from({length:n},(_,j)=>{const st=structuredClone(s);st.opp.hand=st.opp.hand.map((c,i)=>instance(pool[(j*13+i*7)%pool.length].id,c.uid));return st;});
}
export {solve};
