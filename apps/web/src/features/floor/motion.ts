import type {MotionMode,FloorHealth,FloorEntity} from './types.js';
export function effectiveMotion(requested:MotionMode,reduced:boolean,visible:boolean,health:FloorHealth['state']):MotionMode{return reduced||!visible||health!=='healthy'?'still':requested;}
export function submissionTransitions(previous:ReadonlyMap<string,string>,next:readonly FloorEntity[],baselineReady:boolean):readonly string[]{return baselineReady?next.filter(e=>e.kind==='run'&&e.sourceState==='succeeded'&&previous.get(e.id)==='running').map(e=>e.id):[];}
