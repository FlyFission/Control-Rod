import { describe,it,expect } from 'vitest';
import { screen,waitFor } from '@testing-library/react';
import { http,HttpResponse } from 'msw';
import { server } from '../../test/server.js';
import { pkg,view } from '../../test/fixtures.js';
import { renderPage } from '../../test/render.js';
import { assessFloorHealth } from './freshness.js';
import { useFloorData } from './useFloorData.js';
describe('snapshot health',()=>{
 it('distinguishes initial, partial, stale and healthy snapshots',()=>{
  expect(assessFloorHealth([{key:'p',updatedAt:0,pending:true,failed:false}],100).state).toBe('loading');
  expect(assessFloorHealth([{key:'p',updatedAt:10,pending:false,failed:false},{key:'v',updatedAt:0,pending:true,failed:false}],100).state).toBe('partial');
  expect(assessFloorHealth([{key:'p',updatedAt:10,pending:false,failed:false}],30011).state).toBe('stale');
  expect(assessFloorHealth([{key:'p',updatedAt:10,pending:false,failed:true}],20).state).toBe('stale');
  expect(assessFloorHealth([{key:'p',updatedAt:10,pending:false,failed:false}],20).state).toBe('healthy');
 });
});
function Probe(){const d=useFloorData({index:0,size:30,filter:'active'},true);return <p>{d.health.state}: {d.loadedDetails}/{d.requiredDetails} ({d.model.matchingPackageCount})</p>;}
it('loads a bounded page without silently losing coverage',async()=>{
 const packages=Array.from({length:31},(_,i)=>pkg({id:`WP-${i.toString().padStart(3,'0')}`}));
 const requested:string[]=[];
 server.use(http.get('*/packages',()=>HttpResponse.json(packages)),http.get('*/office',()=>HttpResponse.json([])),http.get('*/packages/:id',({params})=>{requested.push(String(params['id']));return HttpResponse.json(view({}, {id:String(params['id'])}));}));
 await renderPage(<Probe/>);
 await waitFor(()=>expect(screen.getByText('healthy: 30/30 (31)')).toBeDefined());
 expect(new Set(requested).size).toBe(30);expect(requested).not.toContain('WP-030');
});
it('reports a failed package detail as stale, not empty success',async()=>{
 server.use(http.get('*/packages',()=>HttpResponse.json([pkg()])),http.get('*/office',()=>HttpResponse.json([])),http.get('*/packages/:id',()=>HttpResponse.json({message:'offline'},{status:503})));
 await renderPage(<Probe/>);await waitFor(()=>expect(screen.getByText('stale: 0/1 (1)')).toBeDefined());
});
