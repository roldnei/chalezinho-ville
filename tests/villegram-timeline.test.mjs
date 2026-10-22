import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
import {publicationInput} from '../supabase/functions/_shared/villegram-publications.ts';import {guestInput} from '../supabase/functions/_shared/villegram-community.ts';
const id='4069a585-7cc6-48ad-9263-567358a45c0c',project='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
const video={kind:'video',path:id+'/'+id+'.mp4',poster_path:id+'/'+id+'.webp',duration:8,bytes:10000,speed:.5,trim_start:1,trim_end:5,original_volume:.5,transition:'slide',sound:{id:'coffee',offset:2,source_start:0,length:3,volume:.3}};
const photo={kind:'photo',url:'assets/photo.webp',clip_duration:4,mode:'feelings',transition:'fade'};
const post=media=>({type:'trust',title:'Feelings',caption:'Nossa estadia',media});
test('mixed timeline validates and persists trims, transitions and synchronized sound, while guest ownership stays enforced',()=>{const saved=publicationInput(post([photo,video]),project);assert.equal(saved.media.length,2);assert.equal(saved.media[1].trim_start,1);assert.deepEqual(saved.media[1].sound,video.sound);assert.equal(saved.media[0].mode,'feelings');const owned={...photo,path:id+'/'+id+'.webp',url:undefined};assert.equal(guestInput(post([owned,video]),project,id).status,'pending_review');assert.throws(()=>guestInput(post([owned,{...video,path:'00000000-0000-0000-0000-000000000000/'+id+'.mp4'}]),project,id),/invalid_media_owner/)});
test('invalid timeline edits and arbitrary audio URLs cannot enter saved publications',()=>{for(const updates of [{trim_start:9},{trim_start:4,trim_end:4},{transition:'<script>'},{original_volume:2},{clip_duration:3},{sound:{...video.sound,id:'https://example.com/a.mp3'}},{sound:{...video.sound,offset:9}},{sound:{...video.sound,length:99}},{sound:{...video.sound,volume:NaN}}])assert.throws(()=>publicationInput(post([{...video,...updates}]),project),/invalid_media_(timeline|sound)/);for(const clip_duration of [0,21,'6',NaN])assert.throws(()=>publicationInput(post([{...photo,clip_duration}]),project),/invalid_media_timeline/)});
test('legacy publications remain valid and have no generated sound or timeline values',()=>{const m=publicationInput(post([{kind:'photo',url:'assets/photo.webp'}]),project).media[0];assert.equal(m.sound,undefined);assert.equal(m.clip_duration,undefined);assert.equal(m.mode,undefined)});
test('mixed sequence uses displayed seconds after speed and locates every scene across a boundary',async()=>{const d=new JSDOM('',{runScripts:'outside-only'}),w=d.window;w.eval(await readFile(new URL('../villegram-timeline.js',import.meta.url),'utf8'));const T=w.VillegramTimeline,clips=T.sequence([photo,video,photo]);assert.deepEqual(Array.from(clips,c=>[c.start,c.end]),[[0,4],[4,12],[12,16]]);assert.equal(T.locate(clips,4).index,1);assert.equal(T.locate(clips,7).local,3);assert.equal(T.locate(clips,999).index,2);assert.equal(T.enabled([photo,video]),true);d.window.close()});

test('changing speed or photo duration keeps the selected sound inside the shortened scene',async()=>{const d=new JSDOM('',{runScripts:'outside-only'});d.window.eval(await readFile(new URL('../villegram-timeline.js',import.meta.url),'utf8'));const m={kind:'photo',clip_duration:1,sound:{id:'coffee',offset:2,length:3,source_start:0,volume:.5}};d.window.VillegramTimeline.fitSound(m);assert.equal(m.sound.offset,.9);assert.equal(m.sound.length,.1);const v={...video,speed:1,sound:{...video.sound}};d.window.VillegramTimeline.fitSound(v);assert.equal(v.sound.offset,2);assert.equal(v.sound.length,2);d.window.close()});

test('player defers hidden videos and distant photos, loads on seek and releases media on exit',async()=>{
 const d=new JSDOM('<div id="host"></div>',{runScripts:'outside-only'}),w=d.window;
 w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.eval(await readFile(new URL('../villegram-timeline.js',import.meta.url),'utf8'));
 const media=[{...photo,url:'https://media.example/first.webp'},{...video,url:'https://media.example/second.mp4'},{...photo,url:'https://media.example/third.webp'},{...video,url:'https://media.example/fourth.mp4'}];
 const player=w.VillegramTimeline.player({host:w.document.querySelector('#host'),media});
 assert.equal(player.elements[0].hasAttribute('src'),true);
 for(const n of [1,2,3])assert.equal(player.elements[n].hasAttribute('src'),false);
 player.seek(4);assert.equal(player.elements[1].preload,'metadata');assert.equal(player.elements[1].getAttribute('src'),media[1].url);assert.equal(player.elements[2].getAttribute('src'),media[2].url);assert.equal(player.elements[3].hasAttribute('src'),false);
 player.seek(16);assert.equal(player.elements[3].getAttribute('src'),media[3].url);
 player.destroy();assert.equal(player.elements.some(el=>el.hasAttribute('src')),false);d.window.close();
});
test('export can explicitly load every scene while normal playback remains selective',async()=>{
 const d=new JSDOM('<div></div>',{runScripts:'outside-only'}),w=d.window;w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.eval(await readFile(new URL('../villegram-timeline.js',import.meta.url),'utf8'));
 const player=w.VillegramTimeline.player({host:w.document.querySelector('div'),media:[{...photo,url:'a.webp'},{...video,url:'b.mp4'}],preloadAll:true});assert.equal(player.elements.every(el=>el.hasAttribute('src')),true);player.destroy();d.window.close();
});
