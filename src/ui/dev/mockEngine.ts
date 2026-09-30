import type { Action, CardDef, CardInst, Engine, GameEvent, GameState, Side } from '../../engine/api';
export const mockCards: CardDef[] = [
  { id: 'demo-luffy', name: 'Monkey D. Luffy', category: 'Leader', colors: ['Red'], cost: null, power: 5000, counter: null, life: 5, types: ['Straw Hat Crew'], attributes: ['Strike'], effectText: 'Your captain. Attach DON!! to increase power by 1000 each.', triggerText: null, keywords: {}, img: 'cards/OP01-003.png' },
  { id: 'demo-zoro', name: 'Roronoa Zoro', category: 'Character', colors: ['Red'], cost: 3, power: 5000, counter: null, life: null, types: ['Straw Hat Crew'], attributes: ['Slash'], effectText: '[Rush] This card can attack on the turn it is played.', triggerText: null, keywords: { rush: true }, img: 'cards/OP01-025.png' },
  { id: 'demo-chopper', name: 'Tony Tony Chopper', category: 'Character', colors: ['Red'], cost: 1, power: 1000, counter: 1000, life: null, types: ['Straw Hat Crew'], attributes: ['Wisdom'], effectText: '[Blocker] Rest this character to redirect an attack to it.', triggerText: null, keywords: { blocker: true }, img: 'cards/OP01-006.png' },
  { id: 'demo-nami', name: 'Nami', category: 'Character', colors: ['Red'], cost: 1, power: 2000, counter: 2000, life: null, types: ['Straw Hat Crew'], attributes: ['Special'], effectText: 'A +2000 counter in hand.', triggerText: null, keywords: {}, img: 'cards/OP01-016.png' },
];
function find(state: GameState, uid: string) {
  for (const side of ['me', 'opp'] as const) {
    const p = state[side];
    if (p.leader.uid === uid) return { side, zone: 'leader' as const, card: p.leader };
    if (p.stage?.uid === uid) return { side, zone: 'stage' as const, card: p.stage };
    for (const zone of ['characters','hand','life','trash','deck'] as const) { const card = p[zone].find(c => c.uid === uid); if (card) return { side, zone, card }; }
  }
  return null;
}
const getCard = (id: string) => mockCards.find(c => c.id === id) ?? mockCards[0];
const power = (s: GameState, uid: string) => { const item = find(s, uid); return item ? (getCard(item.card.defId).power ?? 0) + item.card.powerMod + (item.side === 'me' ? item.card.don * 1000 : 0) : 0; };
function legalActions(s: GameState): Action[] {
  if (s.phase === 'over') return [];
  const actions: Action[] = [];
  for (const c of s.me.hand) if ((getCard(c.defId).cost ?? 0) <= s.me.donActive && s.me.characters.length < 5) actions.push({type:'play',uid:c.uid});
  for (const c of [s.me.leader,...s.me.characters]) {
    if (s.me.donActive) actions.push({type:'attachDon',target:c.uid});
    if (!c.rested && (!c.playedThisTurn || getCard(c.defId).keywords.rush)) for (const target of [s.opp.leader,...s.opp.characters.filter(c => c.rested)]) actions.push({type:'attack',attacker:c.uid,target:target.uid});
  }
  actions.push({type:'endTurn'}); return actions;
}
function apply(before: GameState, a: Action) {
  if (!legalActions(before).some(x => JSON.stringify(x) === JSON.stringify(a))) throw Error('Illegal move');
  const state = structuredClone(before); const events: GameEvent[] = [];
  if (a.type === 'play') { const c = state.me.hand.find(c => c.uid === a.uid)!; const cost = getCard(c.defId).cost ?? 0; state.me.hand = state.me.hand.filter(x => x.uid !== a.uid); state.me.characters.push(c); c.playedThisTurn = true; state.me.donActive -= cost; state.me.donRested += cost; events.push({kind:'payCost',side:'me',amount:cost},{kind:'play',side:'me',uid:c.uid,to:'characters'}); }
  if (a.type === 'attachDon') { find(state,a.target)!.card.don++; state.me.donActive--; events.push({kind:'donAttach',side:'me',target:a.target,count:1}); }
  if (a.type === 'attack') {
    const attacker = find(state,a.attacker)!.card; attacker.rested = true; const attackPower = power(state, a.attacker); let target = a.target;
    events.push({kind:'rest',uid:a.attacker},{kind:'attack',attacker:a.attacker,target,power:attackPower});
    const blocker = state.opp.characters.find(c => !c.rested && getCard(c.defId).keywords.blocker);
    if (blocker) { blocker.rested = true; target = blocker.uid; events.push({kind:'block',blocker:target}); }
    let defensePower = power(state,target);
    for (const counter of [...state.opp.hand]) if (defensePower <= attackPower && getCard(counter.defId).counter && defensePower + (getCard(counter.defId).counter ?? 0) > attackPower) { const amount = getCard(counter.defId).counter!; defensePower += amount; state.opp.hand = state.opp.hand.filter(c => c.uid !== counter.uid); state.opp.trash.push(counter); events.push({kind:'counter',side:'opp',uid:counter.uid,amount}); }
    const hit = attackPower >= defensePower; events.push({kind:'battle',attacker:a.attacker,target,attackPower,defensePower,hit});
    if (hit && target !== state.opp.leader.uid) { const c = find(state,target)!.card; state.opp.characters = state.opp.characters.filter(c => c.uid !== target); state.opp.trash.push(c); events.push({kind:'ko',uid:target}); }
    else if (hit) { const life = state.opp.life.shift(); if (life) { state.opp.hand.push(life); events.push({kind:'lifeLost',side:'opp',uid:life.uid,to:'hand'}); } else { state.winner = 'me'; state.phase = 'over'; events.push({kind:'win',side:'me'}); } }
  }
  if (a.type === 'endTurn') state.phase = 'over';
  state.log.push(mockEngine.describeAction(before,a)); return {state,events};
}
export const mockEngine: Engine = { getCard, findCard: find, power, legalActions, apply,
  describeAction(s,a) { return a.type === 'attack' ? `Attack with ${getCard(find(s,a.attacker)!.card.defId).name}` : a.type === 'attachDon' ? `Attach DON!! to ${getCard(find(s,a.target)!.card.defId).name}` : a.type === 'play' || a.type === 'activate' ? `${a.type === 'play' ? 'Play' : 'Activate'} ${getCard(find(s,a.uid)!.card.defId).name}` : 'End turn'; },
  stillWinnable(s) { return s.winner === 'me' || (s.phase === 'main' && legalActions(s).some(a => a.type === 'attack' || a.type === 'play')); },
  bestMove(s) { return legalActions(s).find(a => a.type === 'play') ?? legalActions(s).find(a => a.type === 'attack') ?? null; },
};
export function mockInst(uid: string, defId: string, extras: Partial<CardInst> = {}): CardInst { return {uid,defId,rested:false,don:0,playedThisTurn:false,powerMod:0,...extras}; }
export function mockPlayer(side: Side) { return { leader: mockInst(`${side}-leader`,'demo-luffy'), characters: side === 'me' ? [mockInst('me-zoro','demo-zoro')] : [mockInst('opp-blocker','demo-chopper')], stage:null, hand:side === 'me' ? [mockInst('hand-zoro','demo-zoro')] : [mockInst('opp-counter','demo-nami')], handVisible:side === 'me', life:[], lifeVisible:false, deck:[], deckCount:20, trash:[], donActive:side === 'me' ? 3 : 0, donRested:side === 'me' ? 0 : 10, donDeck:0 }; }
