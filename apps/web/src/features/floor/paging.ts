import type { WorkPackage } from '../../api/types.js';
import type { FloorPage } from './types.js';
const active=new Set(['draft','released','in-work','in-verification']);
export function selectPackagePage(packages:readonly WorkPackage[],page:FloorPage):{items:readonly WorkPackage[];total:number;index:number} {
 const matching=packages.filter(p=>page.filter==='all'||active.has(p.status)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const index=Math.max(0,Math.min(Number.isFinite(page.index)?Math.floor(page.index):0,Math.ceil(matching.length/30)-1));
 return {items:matching.slice(index*30,(index+1)*30),total:matching.length,index};
}
