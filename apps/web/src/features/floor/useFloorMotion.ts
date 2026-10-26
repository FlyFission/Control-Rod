import {useState,useEffect,useRef} from 'react';
import type {FloorEntity,MotionMode,FloorHealth} from './types.js';
import {effectiveMotion,submissionTransitions} from './motion.js';
export function useDocumentVisible(){const [visible,setVisible]=useState(()=>document.visibilityState!=='hidden');useEffect(()=>{const update=()=>setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);return visible;}
export function useFloorMotion({entities,requested,health,sceneVisible,resetKey}:{entities:readonly FloorEntity[];requested:MotionMode;health:FloorHealth['state'];sceneVisible:boolean;resetKey:string}) {
 const [reduced,setReduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false);
 useEffect(()=>{const q=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!q)return;const update=()=>setReduced(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 const mode=effectiveMotion(requested,reduced,sceneVisible,health);
 const previous=useRef<ReadonlyMap<string,string>>(new Map());const baseline=useRef('');const [submittingIds,setSubmittingIds]=useState<ReadonlySet<string>>(new Set());
 const signature=entities.map(e=>`${e.id}:${e.sourceState}`).join('|');
 useEffect(()=>{
  const healthy=health==='healthy'&&sceneVisible;const key=healthy?resetKey:'';
  const ids=submissionTransitions(previous.current,entities,Boolean(key)&&key===baseline.current);
  previous.current=new Map(entities.map(e=>[e.id,e.sourceState]));baseline.current=key;
  setSubmittingIds(new Set(mode==='still'?[]:ids));const t=setTimeout(()=>setSubmittingIds(new Set()),1200);return()=>clearTimeout(t);
 },[signature,resetKey,health,sceneVisible,mode]);
 return {mode,submittingIds};
}
