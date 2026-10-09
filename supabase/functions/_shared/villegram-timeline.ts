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
 if(m.audio_treatment!==undefined){
  const p=m.audio_treatment;if(m.kind!=='video'||!p||![1,2].includes(p.version)||typeof p.enabled!=='boolean'||typeof p.compress!=='boolean'||!['quiet','clipped','ready'].includes(p.status)||typeof p.gain_db!=='number'||!Number.isFinite(p.gain_db)||p.gain_db < -24||p.gain_db>6||![0,35].includes(p.highpass_hz)||![0,50,60].includes(p.hum_hz)||p.fade_ms!==80||!Array.isArray(p.waveform)||p.waveform.length>240||!p.waveform.length||p.waveform.some((n:any)=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))throw Error('invalid_media_treatment');
  out.audio_treatment={version:p.version,enabled:p.enabled,compress:p.compress,status:p.status,gain_db:p.gain_db,highpass_hz:p.highpass_hz,hum_hz:p.hum_hz,fade_ms:80,waveform:p.waveform};
  if(p.version===2){
   const bounded=(values:any,min:number,max:number)=>Array.isArray(values)&&values.length===12&&values.every((n:any)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max);
   if(!bounded(p.noise_db,-120,-6)||!bounded(p.reduction_db,0,9)||typeof p.dereverb_db!=='number'||!Number.isFinite(p.dereverb_db)||p.dereverb_db<0||p.dereverb_db>3||!['gentle','strong'].includes(p.cleanup))throw Error('invalid_media_treatment');
   Object.assign(out.audio_treatment,{noise_db:p.noise_db,reduction_db:p.reduction_db,dereverb_db:p.dereverb_db,cleanup:p.cleanup});
  }
 }
 const length=m.kind==='video'?((out.trim_end??m.duration)-(out.trim_start??0))/(m.speed||1):out.clip_duration??({breathe:8,pulse:3.2,cinema:6,feelings:6} as Row)[m.mode]??6.5;
 if(m.sound!==undefined&&m.sound!==null){const s=m.sound;if(!s||typeof s!=='object'||!soundIds.includes(s.id)||!['offset','source_start','length','volume'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k]))||s.offset<0||s.offset>=length||s.source_start<0||s.source_start>soundDuration[s.id]-.1||['coffee','pour'].includes(s.id)&&s.length>soundDuration[s.id]-s.source_start+.001||s.length<.1||s.length>length-s.offset+.001||s.volume<0||s.volume>1)throw Error('invalid_media_sound');out.sound={id:s.id,offset:s.offset,source_start:s.source_start,length:s.length,volume:s.volume};}
 return out;
}
