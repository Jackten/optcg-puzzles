// Shared contract between the rules engine (src/engine) and the table UI (src/ui).
// Owned by the integrator. Workers read it; changing it needs a note in your return summary.
//
// Model: "lethal puzzles". The human is always `me` and it is always my Main Phase.
// A puzzle is solved when the opponent's Leader takes damage at 0 Life this turn.
// The opponent is the defender AI: it answers every attack (block / counters / take it).
// All engine functions are pure. States are plain JSON (structuredClone-safe) and never mutated.

export type Side = 'me' | 'opp';
export type Color = 'Red' | 'Green' | 'Blue' | 'Purple' | 'Black' | 'Yellow';
export type Category = 'Leader' | 'Character' | 'Event' | 'Stage';

export interface CardDef {
  id: string;              // e.g. "OP01-001" (base print id, no _p1)
  name: string;
  category: Category;
  colors: Color[];
  cost: number | null;     // Leaders: null
  power: number | null;    // Events/Stages: null
  counter: number | null;  // printed +1000/+2000 counter value on Characters
  life: number | null;     // Leaders only
  types: string[];
  attributes: string[];
  effectText: string;      // printed text, shown in the card zoom
  triggerText: string | null;
  keywords: { blocker?: boolean; rush?: boolean; doubleAttack?: boolean; banish?: boolean };
  img: string;             // relative URL, "cards/OP01-001.png"
}

export interface CardInst {
  uid: string;             // unique within a puzzle, stable across states
  defId: string;
  rested: boolean;
  don: number;             // DON!! attached (+1000 each during its owner's turn)
  playedThisTurn: boolean; // summoning sickness unless Rush
  powerMod: number;        // temporary +/- power until end of turn (effects, counters in battle are separate)
  flags?: Record<string, boolean | number>; // engine-private bookkeeping (once-per-turn used, etc.)
}

export interface PlayerState {
  leader: CardInst;
  characters: CardInst[];  // max 5
  stage: CardInst | null;
  hand: CardInst[];
  handVisible: boolean;    // for opp: can the solver/human see these cards? (me: always true)
  life: CardInst[];        // index 0 = top of life
  lifeVisible: boolean;    // opp life cards known (for Trigger reasoning)
  deck: CardInst[];        // known top cards if the puzzle defines them, else empty
  deckCount: number;       // total cards left in deck (for display)
  trash: CardInst[];
  donActive: number;       // active DON!! in cost area
  donRested: number;       // rested DON!! in cost area
  donDeck: number;
}

export type Phase = 'main' | 'over';

export interface GameState {
  me: PlayerState;
  opp: PlayerState;
  phase: Phase;
  winner: Side | null;     // 'me' when puzzle solved
  turnFlags: Record<string, boolean | number>;
  log: string[];           // human-readable move log, oldest first
}

// Every action is fully specified. The engine enumerates all of them (with targets),
// so the UI only has to match a drag gesture to one of the listed actions.
export type Action =
  | { type: 'play'; uid: string; targets?: string[] }        // Character/Stage/Event from hand (Main)
  | { type: 'attachDon'; target: string }                    // one active DON!! onto my Leader/Character
  | { type: 'activate'; uid: string; targets?: string[] }    // [Activate: Main] on Leader/Character/Stage
  | { type: 'attack'; attacker: string; target: string }     // rest attacker; target = opp Leader or rested opp Character
  | { type: 'endTurn' };                                     // gives up (puzzle failed)

// Ordered events so the UI can animate exactly what happened (card by card).
export type GameEvent =
  | { kind: 'play'; side: Side; uid: string; to: 'characters' | 'stage' | 'trash' }
  | { kind: 'payCost'; side: Side; amount: number }                 // DON!! rested in cost area
  | { kind: 'donAttach'; side: Side; target: string; count: number }
  | { kind: 'rest'; uid: string }
  | { kind: 'activate'; uid: string }
  | { kind: 'effect'; source: string; text: string }                // any resolved effect, human-readable
  | { kind: 'powerChange'; uid: string; delta: number }
  | { kind: 'attack'; attacker: string; target: string; power: number }
  | { kind: 'block'; blocker: string }                               // defender redirects to blocker
  | { kind: 'counter'; side: Side; uid: string; amount: number }    // card from hand (trashed) or Counter event
  | { kind: 'battle'; attacker: string; target: string; attackPower: number; defensePower: number; hit: boolean }
  | { kind: 'ko'; uid: string }
  | { kind: 'lifeLost'; side: Side; uid: string; to: 'hand' | 'trash' } // Banish sends to trash
  | { kind: 'trigger'; side: Side; uid: string; text: string }
  | { kind: 'draw'; side: Side; uid: string }
  | { kind: 'win'; side: Side };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

export interface Engine {
  getCard(defId: string): CardDef;
  legalActions(state: GameState): Action[];
  apply(state: GameState, action: Action): StepResult;   // attacks include the defender AI's full response
  power(state: GameState, uid: string): number;          // current effective power (my turn)
  findCard(state: GameState, uid: string): { side: Side; zone: 'leader' | 'characters' | 'stage' | 'hand' | 'life' | 'trash' | 'deck'; card: CardInst } | null;
  describeAction(state: GameState, action: Action): string; // "Attach 1 DON!! to Zoro", for logs/hints
  // Can `me` still force a win from here? Bounded search; null = gave up within budget.
  // The UI uses it to say "No lethal left from here, undo or reset" after a wrong move.
  stillWinnable(state: GameState, nodeBudget?: number): boolean | null;
  // Best next move from here, for hints after the player has deviated from the stored solution.
  bestMove(state: GameState, nodeBudget?: number): Action | null;
}

// src/engine/index.ts must export: `export const engine: Engine` (browser-safe: no node imports).
// Puzzles ship as public/puzzles.json (a PuzzleSet) and the UI fetches "puzzles.json" relative to the page.

export interface SolutionStep {
  action: Action;
  why: string;            // teaching note shown in the walkthrough ("Swing with Nami first to bait the blocker")
}

export interface Puzzle {
  id: string;             // stable, e.g. "gen-0042"
  title: string;          // short, flavorful
  difficulty: 1 | 2 | 3 | 4 | 5;
  concepts: string[];     // teaching tags, e.g. ["bait the blocker", "DON!! distribution", "counter math"]
  intro: string;          // one or two sentences of setup shown before play
  state: GameState;       // starting position
  solution: SolutionStep[];
  hints: [string, string, string]; // ladder: concept nudge -> first move -> near-full line
  lesson: string;         // chess.com-style takeaway after solving
  verified: { solverVersion: string; nodes: number; forcedWin: true; minAttackerActions: number };
}

export interface PuzzleSet {
  generatedAt: string;
  puzzles: Puzzle[];
  packs: { id: string; title: string; puzzleIds: string[] }[];
  dailyOrder: string[];   // puzzle ids; daily index = days since 2026-10-01 mod length
}
