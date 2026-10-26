import type { SourceHealth,FloorHealth } from './types.js';
export function assessFloorHealth(sources:readonly SourceHealth[],now:number):FloorHealth {
 const good=sources.filter(s=>s.updatedAt>0);const failedKeys=sources.filter(s=>s.failed).map(s=>s.key);
 const oldest=good.length?Math.min(...good.map(s=>s.updatedAt)):undefined;
 let state:FloorHealth['state']='healthy';
 if(failedKeys.length||(oldest!==undefined&&now-oldest>30000))state='stale';
 else if(sources.some(s=>s.pending||!s.updatedAt))state=good.length?'partial':'loading';
 return {state,failedKeys,...(oldest!==undefined?{oldestSuccessAt:oldest}:{})};
}
