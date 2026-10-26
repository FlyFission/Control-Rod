import {useId,useState} from 'react';
import type {FloorEntity} from './types.js';
import {StateMark} from '../../components/StateMark.js';
export function entityLabel(e:FloorEntity){return `${e.packageId} rev ${e.revision}, ${e.role??e.kind}, ${e.runId??''}: ${e.label}. ${e.detail}`;}
export function FloorActor({entity:e,art,selected,onSelect,onOpen,submitting=false}:{entity:FloorEntity;art:string|undefined;selected:boolean;onSelect:(id:string)=>void;onOpen:(entity:FloorEntity)=>void;submitting?:boolean}){
 const [tooltip,setTooltip]=useState(false),[broken,setBroken]=useState(false);const tip=useId();
 return <button type="button" className={`floor-actor ${selected?'is-selected':''} action-${e.action} ${submitting?'is-submitting':''}`} aria-label={entityLabel(e)} aria-describedby={tooltip?tip:undefined}
 onClick={()=>onOpen(e)} onFocus={()=>{onSelect(e.id);setTooltip(true);}} onBlur={()=>setTooltip(false)} onMouseEnter={()=>setTooltip(true)} onMouseLeave={()=>setTooltip(false)} onKeyDown={event=>{if(event.key==='Escape'){setTooltip(false);event.stopPropagation();}}}>
  {tooltip&&<span id={tip} role="tooltip" className="floor-tooltip">{e.label}{e.detail?` · ${e.detail}`:''}</span>}
  <span className="floor-avatar" aria-hidden="true">{art&&!broken?<img src={art} alt="" onError={()=>setBroken(true)}/>:<span className={`floor-neutral-icon kind-${e.kind}`}>{e.kind==='run'?'◉':e.kind==='request'?'!':'▤'}</span>}{submitting&&<span className="floor-signature"/>}</span>
  <span className="floor-actor-code">{e.packageId} <span className="floor-run-badge">{e.runId??(e.kind==='request'?'REQUEST':'RECORD')}</span></span>
  <span className="floor-actor-status"><StateMark kind={e.mark} size={10}/>{e.label}</span>
 </button>;
}
