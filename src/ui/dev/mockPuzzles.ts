import type { PuzzleSet } from '../../engine/api';
import { mockPlayer } from './mockEngine';
export const mockPuzzles: PuzzleSet = { generatedAt: 'development', dailyOrder: ['demo-001'], packs: [{id:'demo',title:'Practice table',puzzleIds:['demo-001']}], puzzles: [{
  id:'demo-001',title:'Three swords, one opening',difficulty:2,concepts:['bait the blocker','Rush','counter math'],intro:'Clear the blocker, draw out the counter, then let your last attacker finish. You have 3 active DON!!.',
  state:{me:mockPlayer('me'),opp:mockPlayer('opp'),phase:'main',winner:null,turnFlags:{},log:[]},
  solution:[{action:{type:'play',uid:'hand-zoro'},why:'Spend the 3 DON!! on a Rush attacker. One more attack matters more than extra power.'},{action:{type:'attack',attacker:'me-leader',target:'opp-leader'},why:'Your first attack draws out Chopper.'},{action:{type:'attack',attacker:'me-zoro',target:'opp-leader'},why:'The +2000 counter stops this attack but empties their hand.'},{action:{type:'attack',attacker:'hand-zoro',target:'opp-leader'},why:'The final Rush attack lands at zero Life. Lethal!'}],
  hints:['Count how many attacks they can stop.','Play your Rush character before attacking.','Use your Leader to clear the blocker; save a Zoro for the final attack.'],lesson:'An extra attack can be worth more than extra power. Spend resources to create enough threats to exhaust every defense.',verified:{solverVersion:'mock',nodes:0,forcedWin:true,minAttackerActions:3}
}] };
