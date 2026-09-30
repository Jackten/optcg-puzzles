import fs from 'node:fs';
import path from 'node:path';
import { effects, vanillaIds } from '../src/engine/effects';
import type { CardDef } from '../src/engine/api';
const root='data/pr/english/cards';
const raw=new Map<string,any>();
for(const pack of fs.readdirSync(root).sort()) for(const file of fs.readdirSync(path.join(root,pack)).sort()) {
 if(!file.endsWith('.json')||file.includes('_'))continue;
 const c=JSON.parse(fs.readFileSync(path.join(root,pack,file),'utf8'));
 if(!raw.has(c.id))raw.set(c.id,c);
}
const cards: CardDef[]=Object.keys(effects).sort().map(id=>{
 const c=raw.get(id);if(!c)throw Error(`Missing ${id}`);
 if(vanillaIds.includes(id)&&((c.effect&&c.effect!=='-')||c.trigger))throw Error(`Vanilla changed: ${id}`);
 return {id,name:c.name,category:c.category,colors:c.colors,cost:c.category==='Leader'?null:c.cost,power:c.power??null,counter:c.counter??null,life:c.category==='Leader'?c.cost:null,types:c.types,attributes:c.attributes,effectText:c.effect||'',triggerText:c.trigger||null,keywords:effects[id].keywords||{},img:`cards/${id}.png`};
});
fs.writeFileSync('src/engine/cards.generated.json',JSON.stringify(cards,null,2)+'\n');
fs.writeFileSync('public/pool-ids.txt',cards.map(c=>c.id).join('\n')+'\n');
fs.writeFileSync('reports/pool-source.json',JSON.stringify(cards.map(c=>({id:c.id,effect:c.effectText,trigger:c.triggerText,rule:effects[c.id]})),null,2));
console.log(`Pool: ${cards.length} cards, ${cards.filter(c=>c.category==='Leader').length} leaders`);
