/** Hand-curated, whole-card rules. No runtime printed-text parsing. */
export interface Selector { side?: 'self'|'enemy'|'both'; zone?: 'characters'|'field'; maxCost?: number; maxPower?: number; rested?: boolean; type?: string; baseMax?: number }
export interface Effect { kind: 'power'|'ko'|'rest'|'bounce'|'attachRested'|'draw'|'addDon'|'trashLife'|'filmBuff'|'unblockable'|'readyDon'; amount?: number; select?: Selector; rested?: boolean }
export interface Ability { effects: Effect[]; once?: boolean; restSelf?: boolean; pay?: number; returnDon?: number; donMin?: number; lifeMax?: number; leaderType?: string }
export interface Rule { keywords?: {blocker?:boolean; rush?:boolean; doubleAttack?:boolean; banish?:boolean}; main?: Ability; activate?: Ability; onPlay?: Ability; trigger?: Ability; counter?: number; counterReady?: number; counterLowLife?: number; static?: 'zoroLeader'|'yamatoLeader'|'bigBlockers'|'donPower'|'donRush'|'donDouble'; donMin?: number; buff?: number; unblockableDon?: number }
const enemy: Selector = {side:'enemy',zone:'characters'};
const field: Selector = {side:'self',zone:'field'};
export const effects: Record<string,Rule> = {
 'OP01-001':{static:'zoroLeader'},
 'ST01-001':{activate:{once:true,effects:[{kind:'attachRested',amount:1,select:field}]}},
 'ST03-001':{activate:{once:true,returnDon:4,effects:[{kind:'bounce',select:{side:'both',maxCost:5}}]}},
 'ST04-001':{activate:{once:true,returnDon:7,effects:[{kind:'trashLife'}]}},
 'ST05-001':{activate:{once:true,returnDon:3,effects:[{kind:'filmBuff',amount:2000}]}},
 'ST09-001':{static:'yamatoLeader'},
 'OP06-022':{keywords:{doubleAttack:true},activate:{once:true,lifeMax:3,effects:[{kind:'attachRested',amount:2,select:{side:'self'}}]}},
 'OP17-079':{static:'bigBlockers'},
 'ST01-004':{static:'donRush',donMin:2},
 'ST01-013':{static:'donPower',donMin:1,buff:1000},
 'P-003':{static:'donDouble',donMin:2},
 'P-006':{static:'donPower',donMin:2,buff:2000},
 'ST01-012':{keywords:{rush:true},unblockableDon:2},
 'ST03-009':{onPlay:{effects:[{kind:'bounce',select:{side:'both',maxCost:7}}]}},
 'ST03-014':{onPlay:{effects:[{kind:'bounce',select:{side:'both',maxCost:3}}]}},
 'OP01-006':{onPlay:{effects:[{kind:'power',amount:-2000,select:enemy}]}},
 'OP01-033':{onPlay:{effects:[{kind:'rest',select:{...enemy,maxCost:4}}]}},
 'OP01-048':{onPlay:{effects:[{kind:'rest',select:{...enemy,maxCost:3}}]}},
 'OP01-054':{onPlay:{effects:[{kind:'ko',select:{...enemy,maxCost:4,rested:true}}]}},
 'EB01-049':{onPlay:{effects:[{kind:'ko',select:{...enemy,maxCost:2}}]}},
 'ST16-004':{onPlay:{effects:[{kind:'ko',select:{...enemy,rested:true}}]}},
 'ST05-002':{onPlay:{effects:[{kind:'addDon',rested:true,amount:1}]}},
 'P-045':{keywords:{banish:true}},
 'ST01-014':{counter:3000,trigger:{effects:[{kind:'power',amount:1000,select:field}]}},
 'ST02-016':{counter:4000,counterReady:1},
 'OP01-029':{counter:2000,counterLowLife:2000,trigger:{effects:[{kind:'power',amount:1000,select:field}]}},
 'ST08-015':{main:{effects:[{kind:'ko',select:{...enemy,maxCost:2}}]},trigger:{effects:[{kind:'draw',amount:1}]}},
 'ST01-015':{main:{effects:[{kind:'ko',select:{...enemy,maxPower:6000}}]},trigger:{effects:[{kind:'ko',select:{...enemy,maxPower:6000}}]}},
 'OP01-027':{main:{effects:[{kind:'power',amount:-10000,select:enemy}]}},
 'OP13-020':{main:{effects:[{kind:'power',amount:-5000,select:enemy}]},trigger:{effects:[{kind:'power',amount:-5000,select:enemy}]}},
 'ST03-015':{main:{effects:[{kind:'bounce',select:{side:'both',maxCost:7}}]},trigger:{effects:[{kind:'bounce',select:{side:'both',maxCost:7}}]}},
 'ST01-017':{activate:{restSelf:true,effects:[{kind:'power',amount:1000,select:{...field,type:'Straw Hat Crew'}}]}},
 'ST04-017':{activate:{restSelf:true,leaderType:'Animal Kingdom Pirates',effects:[{kind:'addDon',amount:1,rested:true}]}},
 'OP13-022':{activate:{restSelf:true,effects:[{kind:'power',amount:1000,select:{side:'self',baseMax:2000}}]}},
};
for (const id of ['ST01-006','OP08-003','ST02-004','EB01-017','ST03-008','OP12-050','ST04-011','ST05-003','ST06-007','OP06-087','OP12-106','ST29-011']) effects[id]={keywords:{blocker:true}};
effects['OP01-025']={keywords:{rush:true}};
effects['OP04-014']={keywords:{banish:true}};
effects['P-028']={keywords:{doubleAttack:true}};
effects['OP10-094']={static:'donDouble',donMin:1};
export const vanillaIds = ['EB03-002','OP11-003','ST01-003','ST01-008','ST01-009','OP11-032','OP11-033','ST02-002','ST02-006','ST02-011','OP11-045','OP11-053','ST03-002','ST03-006','ST03-011','EB03-030','OP11-068','ST04-007','ST04-009','ST04-012','EB03-040','OP11-087','ST06-003','ST06-009','ST06-011','OP11-105','OP11-111','ST07-002','ST07-006','ST07-012'];
for(const id of vanillaIds) effects[id]={};
