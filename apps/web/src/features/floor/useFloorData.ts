import { useEffect,useRef,useState } from 'react';
import { useQuery,useQueries } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import type { FloorPage,FloorData,SourceHealth } from './types.js';
import { selectPackagePage } from './paging.js';
import { projectFloor } from './project.js';
import { assessFloorHealth } from './freshness.js';
export function useFloorData(page:FloorPage,visible:boolean):FloorData {
 const [now,setNow]=useState(Date.now);const interval=visible?15000:false;
 const packages=useQuery({queryKey:['packages'],queryFn:api.packages,refetchInterval:interval});
 const office=useQuery({queryKey:['office'],queryFn:api.office,refetchInterval:interval});
 const selected=selectPackagePage(packages.data??[],page);
 const details=useQueries({queries:selected.items.map(p=>({queryKey:['views',p.id],queryFn:()=>api.packageView(p.id),refetchInterval:interval}))});
 const views=new Map(details.flatMap((q,i)=>q.data?[[selected.items[i]!.id,q.data] as const]:[]));
 const model=projectFloor({packages:packages.data??[],office:office.data??[],views,page});
 const sources:SourceHealth[]=[packages,office,...details].map((q,i)=>({key:i===0?'packages':i===1?'office':selected.items[i-2]!.id,updatedAt:q.dataUpdatedAt,pending:q.isPending,failed:q.isError}));
 const health=assessFloorHealth(sources,now);
 if(model.revisionConflicts.length&&health.state==='healthy')health.state='partial';
 async function refresh(){await Promise.all([packages.refetch(),office.refetch(),...details.map(q=>q.refetch())]);setNow(Date.now());}
 const refreshRef=useRef(refresh);refreshRef.current=refresh;
 useEffect(()=>{if(!visible)return;void refreshRef.current();const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[visible]);
 const attempted=useRef(new Set<string>());
 useEffect(()=>{
  for(const id of model.revisionConflicts){const key=`${id}:${packages.data?.find(p=>p.id===id)?.revision}:${views.get(id)?.package.revision}:${views.get(id)?.package.status}`;
   if(!attempted.current.has(key)){attempted.current.add(key);void details[selected.items.findIndex(p=>p.id===id)]?.refetch();}
  }
 },[model.revisionConflicts.join('|'),packages.data]);
 return {model,health,loadedDetails:details.filter(q=>q.data&&!model.revisionConflicts.includes(q.data.package.id)).length,requiredDetails:selected.items.length,refresh};
}
