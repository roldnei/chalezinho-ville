/* Feelings v2: causal, stereo-linked, bounded multiband attenuation.
 * No lookahead, resampling, synthesized audio or speech model. Unity gains
 * reconstruct the input exactly. This file runs in analysis and AudioWorklet.
 */
(()=>{
 'use strict';
 const edges=[80,125,200,315,500,800,1250,2000,3150,5000,8000];
 class Bands{
  constructor(rate,channels=2){this.coefficients=edges.map(hz=>1-Math.exp(-2*Math.PI*Math.min(hz,rate*.45)/rate));this.state=Array.from({length:channels},()=>new Float64Array(edges.length));this.values=Array.from({length:channels},()=>new Float64Array(edges.length+1));}
  split(value,channel){const state=this.state[channel],out=this.values[channel];let previous=0;for(let b=0;b<edges.length;b++){state[b]+=this.coefficients[b]*(value-state[b]);out[b]=state[b]-previous;previous=state[b];}out[edges.length]=value-previous;return out;}
  reset(){this.state.forEach(s=>s.fill(0));}
 }
 class Cleaner{
  constructor(rate,profile,channels=2){this.rate=rate;this.bands=new Bands(rate,channels);this.fast=new Float64Array(12);this.tail=new Float64Array(12);this.gains=new Float64Array(12).fill(1);this.result=new Float64Array(channels);this.attack=1-Math.exp(-1/(rate*.002));this.release=1-Math.exp(-1/(rate*.07));this.energy=1-Math.exp(-1/(rate*.008));this.decay=Math.exp(-1/(rate*.16));this.setProfile(profile);}
  setProfile(p){this.floor=(p.noise_db||Array(12).fill(-120)).map(db=>10**(db/10));this.max=(p.reduction_db||Array(12).fill(0)).map(db=>10**(-Math.min(9,db+(p.cleanup==='strong'?3:0))/20));this.reverb=10**(-Math.min(3,(p.dereverb_db||0)+(p.cleanup==='strong'?3:0))/20);}
  reset(){this.bands.reset();this.fast.fill(0);this.tail.fill(0);this.gains.fill(1);}
  sample(input){const channels=input.length;for(let c=0;c<channels;c++)this.bands.split(input[c],c);this.result.fill(0);
   for(let b=0;b<12;b++){let power=0;for(let c=0;c<channels;c++)power+=this.bands.values[c][b]**2;power/=channels;this.fast[b]+=this.energy*(power-this.fast[b]);
    // A detected onset opens immediately. The slowly decaying reference only
    // attenuates a weaker tail, never the onset itself or a steady ambience.
    this.tail[b]=Math.max(this.fast[b],this.tail[b]*this.decay);
    const ratio=this.fast[b]/Math.max(1e-14,this.floor[b]),above=Math.max(0,Math.min(1,(Math.sqrt(ratio)-1)/2));
    const noise=this.max[b]+(1-this.max[b])*above;
    const tailRatio=this.fast[b]/Math.max(1e-14,this.tail[b]);
    const late=b>=3&&tailRatio<.5?this.reverb+(1-this.reverb)*Math.min(1,tailRatio/.5):1;
    const target=noise*late;this.gains[b]+=(target>this.gains[b]?this.attack:this.release)*(target-this.gains[b]);
    for(let c=0;c<channels;c++)this.result[c]+=this.bands.values[c][b]*this.gains[b];
   }return this.result;
  }
 }
 globalThis.VillegramAudioDSP={Bands,Cleaner,edges};
 if(typeof AudioWorkletProcessor!=='undefined'){
  class FeelingsCleaner extends AudioWorkletProcessor{
   constructor(options){super();this.cleaner=new Cleaner(sampleRate,options.processorOptions.profile,2);this.input=new Float64Array(2);this.port.onmessage=({data})=>{if(data.reset)this.cleaner.reset();if(data.profile)this.cleaner.setProfile(data.profile);};}
   process(inputs,outputs){const source=inputs[0],out=outputs[0];if(!source?.length)return true;for(let i=0;i<out[0].length;i++){this.input[0]=source[0][i];this.input[1]=(source[1]||source[0])[i];const values=this.cleaner.sample(this.input);for(let c=0;c<out.length;c++)out[c][i]=values[Math.min(c,1)];}return true;}
  }
  registerProcessor('villegram-feelings-v2',FeelingsCleaner);
 }
})();
