import {createRequire} from 'node:module';
import {mkdir,copyFile,readdir,cp} from 'node:fs/promises';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
export async function buildReceiptOCR(output){
 const directory=output instanceof URL?output:new URL(output,import.meta.url);await mkdir(directory,{recursive:true});
 const qr=dirname(require.resolve('jsqr/package.json'));await copyFile(join(qr,'dist','jsQR.js'),new URL('jsQR.js',directory));await copyFile(join(qr,'LICENSE'),new URL('JSQR-LICENSE',directory));
 const tesseract=dirname(require.resolve('tesseract.js/package.json')),core=dirname(require.resolve('tesseract.js-core/package.json')),language=dirname(require.resolve('@tesseract.js-data/por/package.json')),pdf=dirname(require.resolve('pdfjs-dist/package.json'));
 for(const folder of ['core','lang','pdf'])await mkdir(new URL(folder+'/',directory),{recursive:true});
 for(const name of ['tesseract.min.js','worker.min.js'])await copyFile(join(tesseract,'dist',name),new URL(name,directory));
 for(const file of await readdir(core))if(/^tesseract-core.*\.wasm(?:\.js)?$/.test(file))await copyFile(join(core,file),new URL('core/'+file,directory));
 await copyFile(join(language,'4.0.0_best_int','por.traineddata.gz'),new URL('lang/por.traineddata.gz',directory));
 for(const file of ['pdf.mjs','pdf.worker.mjs'])await copyFile(join(pdf,'build',file),new URL('pdf/'+file,directory));
 for(const folder of ['wasm','standard_fonts','cmaps'])await cp(join(pdf,folder),new URL('pdf/'+folder+'/',directory),{recursive:true});
 for(const [name,source] of [['TESSERACT-LICENSE',join(tesseract,'LICENSE.md')],['CORE-LICENSE',join(core,'LICENSE')],['LANGUAGE-README.md',join(language,'README.md')],['PDFJS-LICENSE',join(pdf,'LICENSE')]])await copyFile(source,new URL(name,directory));
 const {buildReceiptNeural}=await import('./build-receipt-neural.mjs');await buildReceiptNeural(new URL('neural/',directory));
}
