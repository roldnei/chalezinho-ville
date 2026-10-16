import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
// Official, redistributable Apache-2.0 model archives. Fail closed on changed
// bytes; no moving "latest" model is downloaded by a visitor's browser.
export const receiptModels=[
 {name:'PP-OCRv6_small_det',bytes:9891840,sha256:'d218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4'},
 {name:'PP-OCRv6_small_rec',bytes:21319680,sha256:'d267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1'}
];
export async function buildReceiptNeural(directory){
 await mkdir(directory,{recursive:true});const sdk=dirname(fileURLToPath(import.meta.resolve('@paddleocr/paddleocr-js'))),ort=dirname(dirname(fileURLToPath(import.meta.resolve('onnxruntime-web'))));
 await build({stdin:{contents:"export {PaddleOCR} from '@paddleocr/paddleocr-js';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,format:'esm',platform:'browser',external:['fs','path','crypto','module'],outfile:new URL('paddle.mjs',directory).pathname,minify:true,legalComments:'linked'});
 const workers=(await readdir(join(sdk,'assets'))).filter(name=>/^worker-entry-.*\.js$/.test(name));if(workers.length!==1)throw Error('Unexpected Paddle worker assets');await copyFile(join(sdk,'assets',workers[0]),new URL('worker.js',directory));
 await mkdir(new URL('ort/',directory),{recursive:true});for(const name of await readdir(join(ort,'dist')))if(/^ort-wasm-simd-threaded\.jsep\.(wasm|mjs)$/.test(name))await copyFile(join(ort,'dist',name),new URL('ort/'+name,directory));
 const cache=process.env.RECEIPT_MODEL_CACHE||join(tmpdir(),'chalezinho-receipt-models');await mkdir(cache,{recursive:true});
 for(const model of receiptModels){const name=model.name+'.tar',path=join(cache,name);let bytes;try{bytes=await readFile(path);}catch{}
  const valid=data=>data&&data.length===model.bytes&&createHash('sha256').update(data).digest('hex')===model.sha256;
  if(!valid(bytes)){const response=await fetch('https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/'+model.name+'_onnx_infer.tar',{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Falha no download do modelo '+model.name);bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes))throw Error('Modelo OCR não corresponde ao hash fixado: '+model.name);await writeFile(path,bytes);}
  await writeFile(new URL(name,directory),bytes);
 }
 const licenses=new URL('../assets/receipt-model-licenses/',import.meta.url);for(const name of await readdir(licenses))await copyFile(new URL(name,licenses),new URL(name,directory));
 console.log('Free browser OCR models built and SHA-256 verified.');
}
