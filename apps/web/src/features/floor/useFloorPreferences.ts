import {useState,useEffect,useCallback} from 'react';
import type {FloorPreferencesV1} from './types.js';
import {readFloorPreferences,writeFloorPreferences,parseFloorPreferences,PREFERENCES_KEY} from './preferences.js';
export function useFloorPreferences(){
 const [preferences,setPreferences]=useState(readFloorPreferences);
 const update=useCallback((patch:Partial<Omit<FloorPreferencesV1,'schemaVersion'>>)=>setPreferences(prev=>{const next=parseFloorPreferences(JSON.stringify({...prev,...patch}));writeFloorPreferences(next);return next;}),[]);
 useEffect(()=>{const change=(e:StorageEvent)=>{if(e.key!==PREFERENCES_KEY||e.newValue===null)return;const parsed=parseFloorPreferences(e.newValue);try{if(JSON.parse(e.newValue)?.schemaVersion!==1)return;}catch{return;}setPreferences(parsed);};window.addEventListener('storage',change);return()=>window.removeEventListener('storage',change);},[]);
 return {preferences,update};
}
