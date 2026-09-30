# Grand Line (working title): One Piece Card Game lethal puzzles

Chess.com-style puzzles for the One Piece Card Game. You sit at a playmat table, drag DON!! onto your cards, swing, and try to find the line that wins this turn against any defense. The opponent blocks and counters for real, and every puzzle is proven solvable by a solver before it ships.

Play it: https://jackten.github.io/optcg-puzzles/

## What's in here

- `src/engine`: rules engine (DON!!, battles, Blockers, counters, Triggers, Banish, Double Attack, Rush, card effects) plus the defender AI and a bounded solver. `api.ts` is the contract between engine and UI.
- `src/ui`: the React table UI (drag input, animated opponent responses, hint ladder, walkthroughs, daily puzzle, streaks, share grid).
- `scripts`: card pool builder, puzzle generator (seeded), and verifier that re-proves every puzzle.
- `e2e`: headless Chrome runs that solve every puzzle through the UI and check the layout at several screen sizes.

## Run it

```bash
npm install
npm run dev
```

Other scripts: `npm run gen` (regenerate puzzles), `npm run verify` (re-prove them), `npm run build`.

Card images are official Bandai sample art, used for a non-commercial fan project. One Piece Card Game is a trademark of Bandai; this project is not affiliated with Bandai or Toei.
