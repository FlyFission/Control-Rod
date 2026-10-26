import { describe,it,expect,vi,afterEach } from 'vitest';
import { parseFloorPreferences,readFloorPreferences,writeFloorPreferences } from './preferences.js';
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
describe('viewer preferences',()=>{
 it.each([null,'{bad','{"schemaVersion":9}','{"schemaVersion":1,"themeId":"x","motion":"loud","view":"scene"}'])('defaults invalid input %s',raw=>expect(parseFloorPreferences(raw)).toEqual({schemaVersion:1,themeId:'plain',motion:'full',view:'scene'}));
 it('remembers an unavailable pack without storing work data',()=>{
  writeFloorPreferences({schemaVersion:1,themeId:'future-pack',motion:'quiet',view:'list'});
  expect(readFloorPreferences().themeId).toBe('future-pack');
  expect(Object.keys(JSON.parse(localStorage.getItem('cr.floor.preferences.v1')!)).sort()).toEqual(['motion','schemaVersion','themeId','view']);
 });
 it('survives blocked and full storage',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  expect(readFloorPreferences().themeId).toBe('plain');expect(()=>writeFloorPreferences({schemaVersion:1,themeId:'plain',motion:'still',view:'scene'})).not.toThrow();
 });
});
