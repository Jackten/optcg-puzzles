import definitions from './cards.generated.json';
import {effects, type Ability, type Effect, type Selector} from './effects';
import type {Action,CardDef,CardInst,Engine,GameEvent,GameState,PlayerState,Side,StepResult} from './api';
export const cards = definitions as CardDef[];
const catalog=new Map(cards.map(c=>[c.id,c]));
export function getCard(id:string):CardDef { const c=catalog.get(id);if(!c)throw Error(`Card outside implemented pool: ${id}`);return c; }
const rule=(c:CardInst)=>effects[c.defId]||{};
const field=(s:GameState,side:Side)=>[s[side].leader,...s[side].characters];
export function findCard(s:GameState,uid:string):ReturnType<Engine['findCard']> {
 for(const side of ['me','opp'] as const){const p=s[side];for(const zone of ['leader','characters','stage','hand','life','trash','deck'] as const){const cs=zone==='leader'?[p.leader]:zone==='stage'?(p.stage?[p.stage]:[]):p[zone];const card=cs.find(c=>c.uid===uid);if(card)return {side,zone,card};}}return null;
}
export function power(s:GameState,uid:string):number {
 const f=findCard(s,uid);if(!f)return 0;const {side,card:c}=f,p=s[side],r=rule(c);
 let n=(getCard(c.defId).power||0)+c.powerMod+(side==='me'?c.don*1000:0);
 if(r.static==='donPower'&&(c.defId!=='P-006'||side==='me')&&c.don>=(r.donMin||1))n+=r.buff||0;
 if(r.static==='yamatoLeader'&&side==='opp'&&c.don>=1&&p.life.length<=2)n+=1000;
 if(side==='me'&&f.zone==='characters'&&rule(p.leader).static==='zoroLeader'&&p.leader.don>=1)n+=1000;
 return n;
}
function keyword(s:GameState,c:CardInst,k:'blocker'|'rush'|'doubleAttack'|'banish'):boolean {
 const r=rule(c),f=findCard(s,c.uid);if(r.keywords?.[k]||c.flags?.[k])return true;
 if(k==='blocker'&&f&&rule(s[f.side].leader).static==='bigBlockers'&&(getCard(c.defId).cost||0)>=12)return true;
 return (k==='rush'&&r.static==='donRush'||k==='doubleAttack'&&r.static==='donDouble')&&c.don>=(r.donMin||1);
}
function candidates(s:GameState,side:Side,sel:Selector):CardInst[]{
 const sides:Side[]=sel.side==='both'?['me','opp']:[sel.side==='enemy'?(side==='me'?'opp':'me'):side];
 return sides.flatMap(x=>sel.zone==='field'?field(s,x):s[x].characters).filter(c=>{
 const d=getCard(c.defId);return (sel.maxCost===undefined||(d.cost||0)<=sel.maxCost)&&(sel.maxPower===undefined||power(s,c.uid)<=sel.maxPower)&&(sel.rested===undefined||c.rested===sel.rested)&&(!sel.type||d.types.includes(sel.type))&&(sel.baseMax===undefined||(d.power||0)<=sel.baseMax);
 });
}
// Hand-rolled deep copy of the plain-JSON state; structuredClone dominated solver time.
const cloneCard=(c:CardInst):CardInst=>{const x={...c};if(c.flags)x.flags={...c.flags};return x;};
const cloneCards=(xs:CardInst[]):CardInst[]=>xs.map(cloneCard);
const clonePlayer=(p:PlayerState):PlayerState=>({...p,leader:cloneCard(p.leader),characters:cloneCards(p.characters),stage:p.stage&&cloneCard(p.stage),hand:cloneCards(p.hand),life:cloneCards(p.life),deck:cloneCards(p.deck),trash:cloneCards(p.trash)});
const clone=(s:GameState):GameState=>({...s,me:clonePlayer(s.me),opp:clonePlayer(s.opp),turnFlags:{...s.turnFlags},log:[...s.log]});
function allowed(s:GameState,side:Side,src:CardInst,a:Ability):boolean {
 const p=s[side];return (!a.once||!src.flags?.used)&&(!a.restSelf||!src.rested)&&p.donActive>=(a.pay||0)&&totalDon(s,side)>=(a.returnDon||0)&&src.don>=(a.donMin||0)&&(a.lifeMax===undefined||s[side==='me'?'opp':'me'].life.length<=a.lifeMax);
}
function totalDon(s:GameState,side:Side):number{return s[side].donActive+s[side].donRested+field(s,side).reduce((n,c)=>n+c.don,0);}
/** Targets are positional per DSL effect. Empty string means decline an up-to effect. */
function choices(s:GameState,side:Side,a:Ability):string[][] {
 let acc:string[][]=[[]];for(const e of a.effects){let opts=(e.kind==='addDon'||e.kind==='trashLife')?['','yes']:[''];if(e.select){opts.push(...candidates(s,side,e.select).map(c=>c.uid));if(e.kind==='attachRested')opts=opts.flatMap(u=>u?Array.from({length:Math.min(e.amount||1,s[side].donRested)},(_,i)=>`${u}#${i+1}`):['']);}
 acc=acc.flatMap(xs=>opts.map(u=>[...xs,u]));}
 if(a.returnDon){const sources=[['active',s[side].donActive],['rested',s[side].donRested],...field(s,side).map(c=>[c.uid,c.don])] as [string,number][];const pays:string[][]=[];
 const visit=(i:number,left:number,t:string[])=>{if(i===sources.length){if(!left)pays.push(t);return;}const [uid,n]=sources[i];for(let k=0;k<=Math.min(n,left);k++)visit(i+1,left-k,k?[...t,`$don:${uid}:${k}`]:t);};visit(0,a.returnDon,[]);acc=acc.flatMap(t=>pays.map(p=>[...t,...p]));}
 return acc;
}
export function legalActions(s:GameState):Action[]{
 if(s.phase!=='main')return [];const p=s.me,out:Action[]=[];
 for(const c of p.hand){const d=getCard(c.defId),r=rule(c);if(!d.colors.some(x=>getCard(p.leader.defId).colors.includes(x))||(d.cost||0)>p.donActive)continue;
 if(d.category==='Event'&&!r.main)continue;if(d.category==='Leader')continue;
 const a=d.category==='Event'?r.main:r.onPlay;
 if(a&&!allowed(s,'me',c,a))continue;
 // Include the newly played Character among its own on-play target options.
 const replacements=d.category==='Character'&&p.characters.length===5?p.characters:[null];
 for(const old of replacements){const preview=clone(s);if(old)preview.me.characters=preview.me.characters.filter(x=>x.uid!==old.uid);if(d.category==='Character')preview.me.characters.push({...c,playedThisTurn:true});
 const ts=a?choices(preview,'me',a):[[]];for(const t of ts)out.push({type:'play',uid:c.uid,targets:old?[...t,`$trash:${old.uid}`]:t});}

 }
 for(const c of [...field(s,'me'),...(p.stage?[p.stage]:[])]){const a=rule(c).activate;if(a&&allowed(s,'me',c,a))for(const t of choices(s,'me',a))out.push({type:'activate',uid:c.uid,targets:t});}
 if(p.donActive)for(const c of field(s,'me'))out.push({type:'attachDon',target:c.uid});
 for(const c of field(s,'me'))if(!c.rested&&(!c.playedThisTurn||keyword(s,c,'rush')))for(const target of [s.opp.leader,...s.opp.characters.filter(t=>t.rested)])out.push({type:'attack',attacker:c.uid,target:target.uid});
 out.push({type:'endTurn'});return out;
}
function pay(s:GameState,side:Side,n:number,ev:GameEvent[]){s[side].donActive-=n;s[side].donRested+=n;if(n)ev.push({kind:'payCost',side,amount:n});}
function remove(s:GameState,uid:string,to:'trash'|'hand',ev:GameEvent[],ko=false){const f=findCard(s,uid);if(!f||f.zone!=='characters')return;const p=s[f.side];p.characters=p.characters.filter(c=>c.uid!==uid);p.donRested+=f.card.don;f.card.don=0;f.card.powerMod=0;f.card.flags={};f.card.rested=false;p[to].push(f.card);if(ko)ev.push({kind:'ko',uid});}
function resolve(s:GameState,side:Side,src:CardInst,a:Ability,targets:string[],ev:GameEvent[]){
 const p=s[side];if(a.once)src.flags={...src.flags,used:true};if(a.restSelf){src.rested=true;ev.push({kind:'rest',uid:src.uid});}pay(s,side,a.pay||0,ev);
 for(const t of targets.filter(t=>t.startsWith('$don:'))){const [,uid,nstr]=t.split(':'),n=Number(nstr);if(uid==='active')p.donActive-=n;else if(uid==='rested')p.donRested-=n;else {const c=findCard(s,uid)?.card;if(c)c.don-=n;}p.donDeck+=n;}
 if(a.leaderType&&!getCard(p.leader.defId).types.includes(a.leaderType))return;
 if(a.returnDon)ev.push({kind:'effect',source:src.uid,text:`Return ${a.returnDon} DON!! to the DON!! deck`});
 a.effects.forEach((e,i)=>{
 const t=targets[i]||'', [uid,nstr]=t.split('#'),c=uid?findCard(s,uid)?.card:undefined;
 if(e.kind==='power'&&c){c.powerMod+=e.amount||0;ev.push({kind:'powerChange',uid,delta:e.amount||0});}
 if(e.kind==='ko'&&c)remove(s,uid,'trash',ev,true);
 if(e.kind==='bounce'&&c)remove(s,uid,'hand',ev);
 if(e.kind==='rest'&&c){c.rested=true;ev.push({kind:'rest',uid});}
 if(e.kind==='attachRested'&&c){const n=Math.min(Number(nstr)||1,e.amount||1,p.donRested);p.donRested-=n;c.don+=n;ev.push({kind:'donAttach',side,target:uid,count:n});}
 if(e.kind==='filmBuff')for(const x of p.characters)if(getCard(x.defId).types.includes('FILM')){x.powerMod+=e.amount||0;ev.push({kind:'powerChange',uid:x.uid,delta:e.amount||0});}
 if(e.kind==='addDon'&&t){const n=Math.min(e.amount||1,p.donDeck);p.donDeck-=n;if(e.rested)p.donRested+=n;else p.donActive+=n;}
 if(e.kind==='readyDon'){const n=Math.min(e.amount||1,p.donRested);p.donRested-=n;p.donActive+=n;}
 if(e.kind==='draw')for(let j=0;j<(e.amount||1);j++){const x=p.deck.shift();if(x){p.hand.push(x);p.deckCount--;ev.push({kind:'draw',side,uid:x.uid});if(p.deckCount===0){s.phase='over';s.winner=side==='opp'?'me':'opp';ev.push({kind:'win',side:s.winner});}}else if(p.deckCount===0){s.phase='over';s.winner=side==='opp'?'me':'opp';ev.push({kind:'win',side:s.winner});}else throw Error('Known draw requires a specified deck top');}
 if(e.kind==='trashLife'&&t&&p!==s.opp){const x=s.opp.life.shift();if(x){s.opp.trash.push(x);ev.push({kind:'lifeLost',side:'opp',uid:x.uid,to:'trash'});}}
 ev.push({kind:'effect',source:src.uid,text:`${e.kind}${c?' → '+getCard(c.defId).name:''}`});
 });
}
function mainApply(s:GameState,a:Action):StepResult {
 const st=clone(s),ev:GameEvent[]=[];if(a.type==='endTurn'){st.phase='over';st.winner='opp';return {state:st,events:ev};}
 if(a.type==='attachDon'){const c=findCard(st,a.target)!.card;st.me.donActive--;c.don++;ev.push({kind:'donAttach',side:'me',target:c.uid,count:1});}
 if(a.type==='activate'){const c=findCard(st,a.uid)!.card;ev.push({kind:'activate',uid:c.uid});resolve(st,'me',c,rule(c).activate!,a.targets||[],ev);}
 if(a.type==='play'){const c=st.me.hand.find(x=>x.uid===a.uid)!,d=getCard(c.defId),r=rule(c);pay(st,'me',d.cost||0,ev);st.me.hand=st.me.hand.filter(x=>x.uid!==c.uid);
 for(const t of a.targets||[])if(t.startsWith('$trash:'))remove(st,t.slice(7),'trash',ev);
 const to=d.category==='Character'?'characters':d.category==='Stage'?'stage':'trash';if(to==='characters'){c.playedThisTurn=true;st.me.characters.push(c);}else if(to==='stage'){if(st.me.stage)st.me.trash.push(st.me.stage);st.me.stage=c;}else st.me.trash.push(c);
 ev.push({kind:'play',side:'me',uid:c.uid,to});const ability=d.category==='Event'?r.main:r.onPlay;if(ability)resolve(st,'me',c,ability,a.targets||[],ev);
 }
 return {state:st,events:ev};
}
interface Defense { state:GameState; events:GameEvent[] }
/** Full battle response tree: blocker, counter subsets, then every trigger target/decline. */
export function attackResponses(s:GameState,a:Extract<Action,{type:'attack'}>):Defense[]{
 const base=clone(s),att=findCard(base,a.attacker)!.card;att.rested=true;
 const start:GameEvent[]=[{kind:'rest',uid:att.uid},{kind:'attack',attacker:att.uid,target:a.target,power:power(base,att.uid)}];
 const cannot=att.flags?.unblockable||((rule(att).unblockableDon||Infinity)<=att.don);
 const blockers=cannot?[]:base.opp.characters.filter(c=>!c.rested&&keyword(base,c,'blocker'));
 const outcomes:Defense[]=[];
 for(const b of [null,...blockers]){
 const bs=clone(base),be=[...start],target=b?b.uid:a.target;
 if(b){findCard(bs,b.uid)!.card.rested=true;be.push({kind:'block',blocker:b.uid});}
 const hand=bs.opp.hand;
 // Counter events in the pool only buff the battle target; off-target buffs are dominated.
 const enumerate=(i:number,st:GameState,bonus:number,events:GameEvent[])=>{
 if(i===hand.length){finish(st,bonus,events);return;}
 enumerate(i+1,st,bonus,events);
 const h=hand[i],d=getCard(h.defId),r=rule(h);let amount=d.category==='Character'?(d.counter||0):r.counter||0;
 if(!amount||d.category==='Event'&&((d.cost||0)>st.opp.donActive||!d.colors.some(x=>getCard(st.opp.leader.defId).colors.includes(x))))return;
 const next=clone(st),x=next.opp.hand.find(c=>c.uid===h.uid)!;next.opp.hand=next.opp.hand.filter(c=>c.uid!==h.uid);next.opp.trash.push(x);const ne=[...events];if(d.category==='Event'){pay(next,'opp',d.cost||0,ne);if(r.counterLowLife&&next.opp.life.length<=2)amount+=r.counterLowLife;const n=Math.min(r.counterReady||0,next.opp.donRested);next.opp.donRested-=n;next.opp.donActive+=n;}
 ne.push({kind:'counter',side:'opp',uid:h.uid,amount});enumerate(i+1,next,bonus+amount,ne);
 };
 const finish=(incoming:GameState,bonus:number,events:GameEvent[])=>{
 const st=clone(incoming);
 const ap=power(st,att.uid),dp=power(st,target)+bonus,hit=ap>=dp,ne=[...events,{kind:'battle',attacker:att.uid,target,attackPower:ap,defensePower:dp,hit} as GameEvent];
 if(!hit){outcomes.push({state:st,events:ne});return;}
 if(target!==st.opp.leader.uid){remove(st,target,'trash',ne,true);outcomes.push({state:st,events:ne});return;}
 if(!st.opp.life.length){st.phase='over';st.winner='me';ne.push({kind:'win',side:'me'});outcomes.push({state:st,events:ne});return;}
 const n=Math.min(st.opp.life.length,keyword(st,att,'doubleAttack')?2:1);
 const damage=(ds:GameState,de:GameEvent[],left:number)=>{
 if(!left||ds.phase==='over'){outcomes.push({state:ds,events:de});return;}
 const x=ds.opp.life.shift()!;if(keyword(ds,att,'banish')){ds.opp.trash.push(x);damage(ds,[...de,{kind:'lifeLost',side:'opp',uid:x.uid,to:'trash'}],left-1);return;}
 const take=clone(ds);take.opp.hand.push(x);damage(take,[...de,{kind:'lifeLost',side:'opp',uid:x.uid,to:'hand'}],left-1);
 const tr=rule(x).trigger;if(tr&&allowed(ds,'opp',x,tr))for(const ts of choices(ds,'opp',tr)){const nt=clone(ds),te=[...de,{kind:'lifeLost',side:'opp',uid:x.uid,to:'trash'} as GameEvent,{kind:'trigger',side:'opp',uid:x.uid,text:getCard(x.defId).triggerText||''} as GameEvent];nt.opp.trash.push({...x});resolve(nt,'opp',x,tr,ts,te);damage(nt,te,left-1);}
 };damage(st,ne,n);
 };
 enumerate(0,bs,0,be);
 }
 // Transpositions arising from equivalent optional choices are explored once.
 const unique=new Map<string,Defense>();for(const o of outcomes){const k=hash(o.state);if(!unique.has(k))unique.set(k,o);}return [...unique.values()];
}
export function hash(s:GameState):string {
 const card=(c:CardInst)=>[c.uid,c.defId,+c.rested,c.don,+c.playedThisTurn,c.powerMod,c.flags||{}];
 const p=(side:Side)=>{const x=s[side];return [card(x.leader),x.characters.map(card).sort(),x.stage?card(x.stage):null,x.hand.map(card).sort(),x.life.map(card),x.deck.map(card),x.deckCount,x.donActive,x.donRested,x.donDeck];};return JSON.stringify([s.phase,s.winner,p('me'),p('opp'),s.turnFlags]);
}
export interface SolveResult {win:boolean|null;line:Action[];nodes:number;winningFirstMoves:number;complete:boolean;minAttackerActions:number|null}
interface Search {depthLimit:number;left:number;nodes:number;memo:Map<string,boolean>;winAt:Map<string,number>;lossAt:Map<string,number>;pv:Map<string,Action>;deadline:number}
function ordered(s:GameState):Action[]{return legalActions(s).filter(a=>a.type!=='endTurn').sort((a,b)=>score(s,b)-score(s,a));}
function score(s:GameState,a:Action):number {
 if(a.type==='play')return 50+(rule(findCard(s,a.uid)!.card).onPlay?10:0);
 if(a.type==='activate')return 45;
 if(a.type==='attachDon'){const c=findCard(s,a.target)!.card;return c.rested?-20:30;}
 if(a.type==='attack')return (a.target===s.opp.leader.uid?10:25)-power(s,a.attacker)/10000;
 return -100;
}
// Sound cutoff: most Leader damage still reachable this turn (Double Attack = 2, Rush cards in hand count),
// ignoring Blockers and counters. Below Life+1 the position is lost whatever happens next.
function mayDouble(c:CardInst):boolean{const d=getCard(c.defId),r=rule(c);return !!(d.keywords.doubleAttack||r.keywords?.doubleAttack||r.static==='donDouble');}
function mayRush(c:CardInst):boolean{const d=getCard(c.defId),r=rule(c);return !!(d.keywords.rush||r.keywords?.rush||r.static==='donRush');}
function damageCeiling(s:GameState):number{let n=0;for(const c of field(s,'me'))if(!c.rested&&(!c.playedThisTurn||mayRush(c)))n+=mayDouble(c)?2:1;for(const c of s.me.hand)if(getCard(c.defId).category==='Character'&&mayRush(c))n+=mayDouble(c)?2:1;return n;}
// Consecutive DON!! attaches commute, so only attach in uid order within a run (lastDon = previous target).
function search(s:GameState,c:Search,depth=c.depthLimit,lastDon=''):boolean|null {
 if(s.phase==='over')return s.winner==='me';if(depth<=0)return false;if(damageCeiling(s)<s.opp.life.length+1)return false;if(--c.left<0||performance.now()>c.deadline)return null;c.nodes++;
 // A win holds under any attach-order restriction; a loss found under one holds only for that restriction (or for none).
 const key=hash(s),lk=key+'|'+lastDon,w=c.winAt.get(key);if(w!==undefined&&w<=depth)return true;const l=c.lossAt.get(lk),l0=lastDon?c.lossAt.get(key+'|'):undefined;if(l!==undefined&&l>=depth||l0!==undefined&&l0>=depth)return false;
 let unknown=false;
 for(const a of ordered(s)){
 if(a.type==='attachDon'&&a.target<lastDon)continue;
 const responses=a.type==='attack'?attackResponses(s,a):[mainApply(s,a)];let yes=true,uncertain=false;
 // Best defender resource state first, to find a refutation quickly.
 responses.sort((x,y)=>compareDefense(y.state,x.state));
 for(const r of responses){const ok=search(r.state,c,depth-1,a.type==='attachDon'?a.target:'');if(ok===false){yes=false;break;}if(ok===null)uncertain=true;}
 if(yes&&!uncertain){c.winAt.set(key,Math.min(depth,w??Infinity));if(w===undefined||depth<w)c.pv.set(key,a);return true;}if(yes&&uncertain)unknown=true;
 }
 if(unknown)return null;c.lossAt.set(lk,Math.max(depth,l??-Infinity));return false;
}
function defenseResources(s:GameState):number[]{return [s.winner==='me'?-1:0,s.opp.life.length,s.opp.characters.filter(c=>!c.rested&&keyword(s,c,'blocker')).length,s.opp.characters.filter(c=>keyword(s,c,'blocker')).length,s.opp.hand.reduce((n,c)=>{const r=rule(c);return n+(getCard(c.defId).counter||((r.counter||0)+(s.opp.life.length<=2?r.counterLowLife||0:0)));},0),s.opp.donActive];}
function compareDefense(a:GameState,b:GameState):number {const x=defenseResources(a),y=defenseResources(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}

function context(budget:number,ms=Infinity):Search{return {depthLimit:Infinity,left:budget,nodes:0,memo:new Map(),winAt:new Map(),lossAt:new Map(),pv:new Map(),deadline:performance.now()+ms};}
export function solve(s:GameState,nodeBudget=200000,countFirst=true):SolveResult {
 const ctx=context(nodeBudget);let min:number|null=null;
 // Unbounded pass first: its losses hold at every depth, so the shortest-line pass below skips them.
 let win=search(s,ctx,Infinity);if(win){for(let d=1;d<=30;d++){ctx.depthLimit=d;const w=search(s,ctx,d);if(w!==false){if(w)min=d;else win=null;break;}}}ctx.depthLimit=Infinity;const principal=new Map(ctx.pv);let winningFirstMoves=0,complete=win!==null;
 if(win&&countFirst)for(const a of ordered(s)){const responses=a.type==='attack'?attackResponses(s,a):[mainApply(s,a)];let w=true;for(const r of responses){const ok=search(r.state,ctx);if(ok!==true){w=false;if(ok===null)complete=false;break;}}if(w)winningFirstMoves++;}
 const line:Action[]=[];let st=s;for(let i=0;i<50&&st.phase==='main';i++){const a=principal.get(hash(st));if(!a)break;line.push(a);const rs=a.type==='attack'?attackResponses(st,a):[mainApply(st,a)];rs.sort((x,y)=>compareDefense(y.state,x.state));st=rs[0].state;}
 return {win,line,nodes:ctx.nodes,winningFirstMoves,complete,minAttackerActions:min};
}
function actionKey(a:Action):string {return JSON.stringify(a.type==='play'||a.type==='activate'?{...a,targets:a.targets||[]}:a);}
export function apply(s:GameState,a:Action):StepResult {
 if(!legalActions(s).some(x=>actionKey(x)===actionKey(a)))throw Error(`Illegal action: ${JSON.stringify(a)}`);
 let result:StepResult;
 if(a.type!=='attack')result=mainApply(s,a);else {
 const ctx=context(1800,85),responses=attackResponses(s,a);responses.sort((x,y)=>compareDefense(y.state,x.state));let chosen=responses[0],rank=-1;
 for(const r of responses){const w=search(r.state,ctx);const n=w===false?2:w===null?1:0;if(n>rank||n===rank&&compareDefense(r.state,chosen.state)>0){rank=n;chosen=r;}}
 result=chosen;
 }
 result.state.log=[...s.log,describeAction(s,a)];return result;
}
export function describeAction(s:GameState,a:Action):string {const name=(uid:string)=>{const c=findCard(s,uid)?.card;return c?getCard(c.defId).name:uid;};switch(a.type){case 'attachDon':return `Attach 1 DON!! to ${name(a.target)}`;case 'play':return `Play ${name(a.uid)}${a.targets?.filter(t=>t&&!t.startsWith('$')).length?' → '+a.targets.filter(t=>t&&!t.startsWith('$')).map(t=>name(t.split('#')[0])).join(', '):''}`;case 'activate':return `Activate ${name(a.uid)}${a.targets?.some(t=>t&&!t.startsWith('$'))?' → '+a.targets.filter(t=>t&&!t.startsWith('$')).map(t=>name(t.split('#')[0])+(t.includes('#')?' ('+t.split('#')[1]+' rested DON!!)':'')).join(', '):''}`;case 'attack':return `Attack ${name(a.target)} with ${name(a.attacker)} (${power(s,a.attacker)} power)`;case 'endTurn':return 'End turn';}}
export const engine:Engine={getCard,legalActions,apply,power,findCard,describeAction,stillWinnable:(s,b=10000)=>solve(s,b,false).win,bestMove:(s,b=10000)=>solve(s,b,false).line[0]||null};
