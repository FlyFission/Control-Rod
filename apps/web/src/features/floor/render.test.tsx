import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {FloorScene} from './FloorScene.js';
import {FloorList} from './FloorList.js';
import {PLAIN_THEME} from './themes/plain.js';
import type {FloorEntity,FloorModel} from './types.js';
const entity:FloorEntity={id:'run:R1',runId:'R1',kind:'run',packageId:'WP-1',revision:0,role:'pre-check',sourceState:'succeeded',label:'Pre-check run finished',detail:'<script>unsafe</script>',station:'verify',action:'submitted',mark:'idle',attentionRank:7,variant:0};
const model:FloorModel={entities:[entity],selectedPackages:[],matchingPackageCount:0,revisionConflicts:[],warnings:[]};
it('opens the real run with keyboard and exposes escaped semantic text',()=>{
 const open=vi.fn();render(<FloorList model={model} stationFilter={undefined} selectedId={undefined} onSelect={()=>{}} onOpen={open}/>);
 const button=screen.getByRole('button',{name:/WP-1.*R1.*Pre-check run finished/});fireEvent.click(button);
 expect(open).toHaveBeenCalledWith(entity);expect(document.querySelector('script')).toBeNull();
});
it('renders six actors and a truthful overflow control',()=>{
 const more=vi.fn();const full={...model,entities:Array.from({length:7},(_,i)=>({...entity,id:`run:R${i}`,runId:`R${i}`}))};
 render(<FloorScene model={full} pack={PLAIN_THEME} selectedId={undefined} onSelect={()=>{}} onOpen={()=>{}} onShowStation={more} mode="still" submittingIds={new Set()}/>);
 expect(screen.getAllByRole('button').length).toBe(7);fireEvent.click(screen.getByRole('button',{name:/1 more.*Verification/i}));expect(more).toHaveBeenCalledWith('verify');
});
it('shows the same tooltip on focus and hover and dismisses it with Escape',()=>{
 render(<FloorScene model={model} pack={PLAIN_THEME} selectedId={undefined} onSelect={()=>{}} onOpen={()=>{}} onShowStation={()=>{}} mode="still" submittingIds={new Set()}/>);
 const button=screen.getByRole('button',{name:/R1.*Pre-check run finished/});fireEvent.focus(button);expect(screen.getByRole('tooltip')).toBeDefined();fireEvent.keyDown(button,{key:'Escape'});expect(screen.queryByRole('tooltip')).toBeNull();fireEvent.mouseEnter(button);expect(screen.getByRole('tooltip')).toBeDefined();
});
