import { THEME_CATALOG } from './catalog.js';
import { PLAIN_THEME } from './plain.js';
import type { ThemePackV1, ThemeReleaseRecord, ThemeRegistryEntry } from './types.js';
export { THEME_CATALOG };
const loaders=import.meta.glob<{default:ThemePackV1}>('./packs/*.ts');
// A human release record is deliberately separate from author-generated art metadata.
export const RELEASE_RECORDS: readonly ThemeReleaseRecord[] = [];
const plainEntry:ThemeRegistryEntry={id:'plain',title:'Plain Floor',description:PLAIN_THEME.description,moodTags:[],palette:[],signature:'none',stationLabels:Object.fromEntries(Object.entries(PLAIN_THEME.stations).map(([k,v])=>[k,v.label])) as ThemeRegistryEntry['stationLabels']};
export function getThemeEntry(id:string):ThemeRegistryEntry|undefined {return id==='plain'?plainEntry:THEME_CATALOG.find(e=>e.id===id);}
function noExecutable(value:unknown):boolean {if(typeof value==='function')return false;if(value&&typeof value==='object')return Object.values(value).every(noExecutable);return true;}
export function validateThemePack(value:unknown):value is ThemePackV1 {
 if(!value||typeof value!=='object'||!noExecutable(value))return false;
 const p=value as ThemePackV1;
 if(p.schemaVersion!==1||!getThemeEntry(p.id)||p.motionProfile!=='shared-v1'||!['none','capsule','spark','dossier','parcel','lantern','ripple'].includes(p.signature))return false;
 if(!p.assets||!p.stations||!p.tokens||typeof p.title!=='string'||typeof p.version!=='string')return false;
 if(!Object.keys(PLAIN_THEME.stations).every(k=>{const s=p.stations[k as keyof typeof p.stations];return s&&typeof s.label==='string'&&[s.x,s.y,s.w,s.h].every(Number.isFinite);}))return false;
 if(!Object.values(p.tokens).every(v=>/^#[0-9a-f]{6}$/i.test(v)))return false;
 if(p.id==='plain')return true;
 const assets=[p.assets.scene,p.assets.thumbnail,...p.assets.characters,...Object.values(p.assets.props)];
 return p.assets.characters.length===6&&assets.every(a=>a&&a.path.startsWith(`/floor-themes/${p.id}/`)&&!a.path.includes('..')&&/^[a-f0-9]{64}$/.test(a.sha256)&&a.bytes>0&&a.width>0&&a.height>0);
}
export function isThemeEligible(entry:ThemeRegistryEntry,record:ThemeReleaseRecord|undefined,pack?:ThemePackV1):boolean {
 if(entry.id==='plain')return true;
 if(!pack||!record||!validateThemePack(pack)||pack.availability!=='released')return false;
 const hashes=[pack.assets.scene,pack.assets.thumbnail,...pack.assets.characters,...Object.values(pack.assets.props)].map(a=>a!.sha256);
 return record.packId===pack.id&&record.version===pack.version&&record.title===pack.title&&record.assets.join(',')===hashes.join(',')&&Boolean(record.reviewer&&record.reviewedAt&&record.evidence&&record.distribution)&&record.id===pack.releaseRecordId;
}
export async function loadTheme(id:string,allowDrafts=false):Promise<ThemePackV1> {
 if(id==='plain')return PLAIN_THEME;
 const entry=getThemeEntry(id);if(!entry)throw new Error('Unknown theme');
 if(!allowDrafts)throw new Error('This theme has no public release approval.');
 const load=loaders[`./packs/${id}.ts`];if(!load)throw new Error('Artwork is still in development.');
 const p=(await load()).default;if(!validateThemePack(p))throw new Error('Theme artwork is incompatible.');
 return p;
}
export function isThemeFeatureEnabled(raw:unknown):boolean{return raw==='true';}
