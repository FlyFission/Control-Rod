import type { StationId } from '../types.js';
export type SignatureId = 'none'|'capsule'|'spark'|'dossier'|'parcel'|'lantern'|'ripple';
export interface ThemeRegistryEntry {id:string; title:string; description:string; moodTags:readonly string[]; palette:readonly string[]; signature:SignatureId; stationLabels:Readonly<Record<StationId,string>>}
export interface AssetRef {path:string; sha256:string; bytes:number; width:number; height:number; creator:string; rightsBasis:'original'|'licensed'|'public-domain'; licenseNoticeId:string}
export interface ThemePackV1 {
 schemaVersion:1; id:string; version:string; title:string; description:string; moodTags:readonly string[]; availability:'development'|'released';
 tokens:{backdrop:string;surface:string;ink:string;mutedInk:string;accent:string;focus:string};
 assets:{scene:AssetRef|null;thumbnail:AssetRef|null;characters:readonly AssetRef[];props:Readonly<Record<string,AssetRef>>};
 stations:Readonly<Record<StationId,{label:string;x:number;y:number;w:number;h:number}>>;
 motionProfile:'shared-v1'; signature:SignatureId; credits:readonly string[]; influenceNoteId?:string; releaseRecordId?:string;
}
export interface ThemeReleaseRecord {id:string; packId:string; version:string; title:string; assets:readonly string[]; approvedInfluenceText:string; reviewer:string; reviewedAt:string; evidence:string; distribution:string}
