// Compare full-photo outputs, not cropped-line CER. Inputs stay private.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const normalize=(k,v)=>k==='document_number'?String(Number(v)):k==='amount'?String(v).replace(/[^0-9,]/g,''):String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function score(result){
 const fields=['supplier','supplier_document','document_number','amount','document_date'];let correct=0,wrong=0,pending=0;const byField=Object.fromEntries(fields.map(k=>[k,{correct:0,wrong:0,pending:0}]));
 for(const row of result.rows){for(const k of fields){if(!Object.hasOwn(row.expected,k)||!Object.hasOwn(row.actual,k))throw Error('Incomplete five-field evaluation');
  const value=row.actual[k],kind=!String(value).trim()?'pending':normalize(k,value)===normalize(k,row.expected[k])?'correct':'wrong';byField[k][kind]++;if(kind==='correct')correct++;else if(kind==='wrong')wrong++;else pending++;
 }}return {photos:result.rows.length,correct,wrong,pending,byField};
}
export function compare(before,after){
 if(!before.rows.length||before.rows.length!==after.rows.length||before.rows.some((r,i)=>r.file!==after.rows[i].file||JSON.stringify(r.expected)!==JSON.stringify(after.rows[i].expected)))throw Error('Use the same photos and reviewed labels for both versions');
 const baseline=score(before),candidate=score(after);
 const approved=candidate.correct>baseline.correct&&candidate.wrong<=baseline.wrong&&Object.keys(baseline.byField).every(k=>candidate.byField[k].wrong<=baseline.byField[k].wrong&&candidate.byField[k].correct>=baseline.byField[k].correct);
 return {approved,baseline,candidate,scope:'Regression cases only; not an independent accuracy estimate.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2]||!process.argv[3])throw Error('Usage: node compare.mjs BASELINE.json CANDIDATE.json');
 const [a,b]=await Promise.all(process.argv.slice(2,4).map(path=>readFile(path,'utf8').then(JSON.parse)));const result=compare(a,b);console.log(JSON.stringify(result,null,2));if(!result.approved)process.exitCode=1;
}
