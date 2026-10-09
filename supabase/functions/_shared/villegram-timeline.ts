type Row=Record<string,any>;
export const soundIds=['coffee','pour','bubbles','fire','rain','birds'];
const soundDuration:Row={coffee:5.642,pour:4.493,bubbles:20.036,fire:20.036,rain:20.036,birds:20.036};
export function mediaTimelineInput(m:Row){
 const out:Row={};
 const numeric=(key:string,min:number,max:number)=>{if(m[key]===undefined)return;const n=m[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('invalid_media_timeline');out[key]=n;};
 if(m.kind==='photo')numeric('clip_duration',1,20);else if(m.clip_duration!==undefined)throw Error('invalid_media_timeline');
 if(m.kind==='video'){numeric('trim_start',0,Number(m.duration));numeric('trim_end',0,Number(m.duration));numeric('original_volume',0,1);if((out.trim_end??m.duration)-(out.trim_start??0)<.25)throw Error('invalid_media_timeline');}
 else if(['trim_start','trim_end','original_volume'].some(k=>m[k]!==undefined))throw Error('invalid_media_timeline');
 if(m.transition!==undefined){if(!['cut','fade','slide'].includes(m.transition))throw Error('invalid_media_timeline');out.transition=m.transition;}
 const length=m.kind==='video'?((out.trim_end??m.duration)-(out.trim_start??0))/(m.speed||1):out.clip_duration??({breathe:8,pulse:3.2,cinema:6,feelings:6} as Row)[m.mode]??6.5;
 if(m.sound!==undefined&&m.sound!==null){const s=m.sound;if(!s||typeof s!=='object'||!soundIds.includes(s.id)||!['offset','source_start','length','volume'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k]))||s.offset<0||s.offset>=length||s.source_start<0||s.source_start>soundDuration[s.id]-.1||['coffee','pour'].includes(s.id)&&s.length>soundDuration[s.id]-s.source_start+.001||s.length<.1||s.length>length-s.offset+.001||s.volume<0||s.volume>1)throw Error('invalid_media_sound');out.sound={id:s.id,offset:s.offset,source_start:s.source_start,length:s.length,volume:s.volume};}
 return out;
}
