import type { Engine, GameEvent, GameState, CardInst, Side, Action } from '../engine/api';
// Presentation only. The authoritative apply() result is always installed after replay.
export function presentEvent(before: GameState, final: GameState, event: GameEvent, engine: Engine, action?: Action): GameState {
  const s = structuredClone(before);
  const find = (uid:string) => engine.findCard(s,uid)?.card;
  const move = (uid:string, side:Side, to:'characters'|'stage'|'hand'|'trash') => {
    const source = engine.findCard(s,uid); const card:CardInst|undefined = source?.card ?? engine.findCard(final,uid)?.card;
    if (!card) return;
    for (const owner of ['me','opp'] as const) {
      for (const zone of ['characters','hand','life','trash','deck'] as const) s[owner][zone] = s[owner][zone].filter(c=>c.uid!==uid);
      if(s[owner].stage?.uid===uid) s[owner].stage=null;
    }
    if(to==='stage') {if(s[side].stage&&s[side].stage!.uid!==uid)s[side].trash.push(s[side].stage!);s[side].stage=card;} else s[side][to].push(card);
  };
  switch(event.kind) {
    case 'rest': if(find(event.uid)) find(event.uid)!.rested=true; break;
    case 'block': if(find(event.blocker)) find(event.blocker)!.rested=true; break;
    case 'play': move(event.uid,event.side,event.to); if(find(event.uid)) find(event.uid)!.playedThisTurn=true; break;
    case 'payCost': s[event.side].donActive=Math.max(0,s[event.side].donActive-event.amount); s[event.side].donRested+=event.amount; break;
    case 'donAttach': {
      if(find(event.target)) find(event.target)!.don+=event.count;
      const encodedRested = action && (action.type==='play'||action.type==='activate') && action.targets?.some(t=>t.startsWith(`${event.target}#`));
      const rested = action?.type!=='attachDon' && (encodedRested || s[event.side].donRested>final[event.side].donRested);
      const pool = rested ? 'donRested' : 'donActive';
      s[event.side][pool]=Math.max(0,s[event.side][pool]-event.count);break;
    }
    case 'powerChange': if(find(event.uid)) find(event.uid)!.powerMod+=event.delta; break;
    case 'counter': move(event.uid,event.side,'trash'); break;
    case 'lifeLost': move(event.uid,event.side,event.to); break;
    case 'draw': move(event.uid,event.side,'hand'); break;
    case 'ko': { const owner=engine.findCard(s,event.uid)?.side; if(owner) {const card=find(event.uid);if(card){s[owner].donRested+=card.don;card.don=0;card.rested=false;card.powerMod=0;}move(event.uid,owner,'trash');} break; }
    case 'win': s.winner=event.side; s.phase='over'; break;
  }
  return s;
}
