import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {JSDOM} from 'jsdom';import * as model from '../costs-model.js';
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
async function setup({reader=async()=>({fields:{},warnings:[],text:''})}={}){
 const dom=new JSDOM(await readFile(new URL('../custos.html',import.meta.url),'utf8'),{url:'https://test.local/custos.html',runScripts:'outside-only'}),w=dom.window;
 const data={cost_entries:[],cost_receipts:[],properties:[{id:1,name:'Ville Signature'},{id:2,name:'Ville Essenza'}]},files=new Map();let tick=0,uploadFailure=false;
 class Query{constructor(table){this.table=table;this.filters=[];this.mode='read';}select(){return this;}eq(k,v){this.filters.push([k,v]);return this;}order(){return this;}range(){return this;}single(){this.singleRow=true;return this;}insert(p){this.mode='insert';this.p=p;return this;}upsert(p){this.mode='upsert';this.p=p;return this;}update(p){this.mode='update';this.p=p;return this;}
 then(resolve){if(this.table==='profiles')return Promise.resolve({data:{role:'admin',full_name:'QA',pms_access_status:'active'}}).then(resolve);
 let rows=data[this.table].filter(r=>this.filters.every(([k,v])=>r[k]===v));
 if(this.mode==='insert'||this.mode==='upsert'){const existing=data[this.table].find(r=>r.id===this.p.id);if(existing)rows=[];else{const r={fiscal_status:'operational',exclusion_cents:0,archived_at:null,...this.p,updated_at:String(++tick),created_at:String(tick)};data[this.table].push(r);rows=[r];}}
 if(this.mode==='update'){for(const r of rows)Object.assign(r,this.p,{updated_at:String(++tick)});}
 return Promise.resolve({data:structuredClone(this.singleRow?rows[0]:rows),error:null}).then(resolve);}}
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://test.supabase.co',supabaseKey:'public'};
 w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}}})},
  from:t=>new Query(t),
  storage:{from:()=>({upload:async(path,file)=>{if(uploadFailure)return {error:{message:'Network'}};files.set(path,file);return {data:{path}}},download:async path=>({data:files.get(path)})})}
 })};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};
 Object.assign(w,model,{readReceipt:reader});const source=(await readFile(new URL('../custos.js',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'');vm.runInContext(source,dom.getInternalVMContext());await pause();
 return {dom,w,data,files,failUploads:value=>{uploadFailure=value},$:s=>w.document.querySelector(s),field:n=>w.document.querySelector(`[name="${n}"]`)};
}
test('UI persists expense, photo, fiscal review and separate reporting months without auto deduction',async()=>{
 const s=await setup(),{$,field,w,data,files}=s;try{
 $('#cost-new').click();field('description').value='IPTU Signature';field('amount').value='123,45';field('category').value='property_tax';field('category').dispatchEvent(new w.Event('change'));field('property_id').value='1';field('competence').value='2026-09';field('paid_on').value='2026-10-01';
 assert.equal(field('confirm_fiscal').checked,false);assert.equal($('#cost-fiscal').hidden,true);
 const file=new w.File(['%PDF-1.4 QA'],'iptu.pdf',{type:'application/pdf'});Object.defineProperty($('#cost-files'),'files',{value:[file],configurable:true});$('#cost-files').dispatchEvent(new w.Event('change'));await pause();
 field('confirm_fiscal').checked=true;field('confirm_fiscal').dispatchEvent(new w.Event('change'));field('exclusion').value='100,00';field('fiscal_month').value='2026-10';field('owner_borne').checked=true;field('fiscal_note').value='Revisado com documento e vínculo ao imóvel';
 $('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();await pause();
 assert.equal(data.cost_entries.length,1);assert.equal(data.cost_entries[0].fiscal_status,'confirmed');assert.equal(data.cost_entries[0].exclusion_cents,10000);assert.equal(data.cost_receipts.length,1);assert.equal(files.size,1);assert.equal($('#cost-dialog').open,false);
 $('#cost-month').value='2026-10';$('#cost-basis').value='competence';$('#cost-month').dispatchEvent(new w.Event('change'));assert.ok($('#cost-list').textContent.includes('Nenhum custo'));
 $('#cost-basis').value='fiscal_month';$('#cost-basis').dispatchEvent(new w.Event('change'));assert.ok($('#cost-list').textContent.includes('IPTU Signature'));assert.ok($('#cost-totals').textContent.includes('100,00'));
 $('[data-edit]').click();field('category').value='energy';field('category').dispatchEvent(new w.Event('change'));assert.equal(field('confirm_fiscal').checked,false);assert.equal($('#cost-confirm-label').hidden,true);
 }finally{s.dom.window.close();}
});
test('upload failure leaves a single pending expense and retry attaches once',async()=>{
 const s=await setup(),{$,field,w,data}=s;try{
 $('#cost-new').click();field('description').value='Faxina';field('category').value='cleaning';field('amount').value='130,00';const file=new w.File(['photo'],'faxina.jpg',{type:'image/jpeg'});Object.defineProperty($('#cost-files'),'files',{value:[file],configurable:true});$('#cost-files').dispatchEvent(new w.Event('change'));await pause();s.failUploads(true);
 $('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();await pause();assert.equal(data.cost_entries.length,1);assert.equal(data.cost_receipts.length,0);assert.equal($('#cost-dialog').open,true);assert.ok($('#cost-form-message').textContent.includes('lançamento está salvo'));
 s.failUploads(false);$('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();await pause();assert.equal(data.cost_entries.length,1);assert.equal(data.cost_receipts.length,1);assert.equal(data.cost_entries[0].exclusion_cents,0);assert.equal($('#cost-dialog').open,false);
 }finally{s.dom.window.close();}
});
test('currency fields format BRL, validate two decimals and persist exact cents',async()=>{
 const s=await setup(),{$,field,w,data}=s;try{
 $('#cost-new').click();const input=field('amount');field('description').value='Produto piscina';field('category').value='pool';input.value='130,5';input.dispatchEvent(new w.Event('input'));input.dispatchEvent(new w.Event('blur'));
 assert.match(input.value,/^R\$\s130,50$/);assert.equal(input.checkValidity(),true);
 input.dispatchEvent(new w.Event('focus'));assert.equal(input.value,'130,50');input.setSelectionRange(input.value.length,input.value.length);
 const third=new w.InputEvent('beforeinput',{inputType:'insertText',data:'7',cancelable:true});assert.equal(input.dispatchEvent(third),false);assert.equal(input.value,'130,50');
 input.value='130.50';input.dispatchEvent(new w.Event('input'));input.dispatchEvent(new w.Event('blur'));assert.match(input.value,/^R\$\s130,50$/);
 $('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();await pause();assert.equal(data.cost_entries[0].amount_cents,13050);
 $('[data-edit]').click();assert.match(field('amount').value,/^R\$\s130,50$/);
 }finally{s.dom.window.close();}
});
test('pasted invalid money cannot save and hidden fiscal values do not block operational costs',async()=>{
 const s=await setup(),{$,field,w,data}=s;try{
 $('#cost-new').click();field('description').value='Faxina';const input=field('amount');
 for(const bad of ['1,234','abc','-1,00','0,00']){input.value=bad;input.dispatchEvent(new w.Event('input'));assert.equal(input.checkValidity(),false);assert.equal($('#cost-amount-error').hidden,false);$('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();assert.equal(data.cost_entries.length,0);}
 input.value='150,00';input.dispatchEvent(new w.Event('input'));assert.equal(input.checkValidity(),true);assert.equal($('#cost-amount-error').hidden,true);
 field('category').value='property_tax';field('category').dispatchEvent(new w.Event('change'));field('confirm_fiscal').checked=true;field('confirm_fiscal').dispatchEvent(new w.Event('change'));field('exclusion').value='2,345';field('exclusion').dispatchEvent(new w.Event('input'));assert.equal(field('exclusion').checkValidity(),false);
 field('category').value='cleaning';field('category').dispatchEvent(new w.Event('change'));assert.equal(field('exclusion').checkValidity(),true);assert.equal(field('exclusion').required,false);
 }finally{s.dom.window.close();}
});
const recognized={fields:{supplier:'Loja da Piscina',supplier_document:'11.222.333/0001-81',amount_cents:14000,document_date:'2026-09-15',competence:'2026-09',document_number:'000123',category:'pool',description:'Nota · Loja da Piscina'},warnings:[],text:'TOTAL A PAGAR 140,00'};
function addReceipt(s,name='nota.jpg'){const input=s.$('#cost-files');Object.defineProperty(input,'files',{value:[new s.w.File(['photo'],name,{type:'image/jpeg'})],configurable:true});input.dispatchEvent(new s.w.Event('change'));}
test('upload reads and fills fields automatically, preserves manual edits, and requires review before saving',async()=>{
 let resolve;const s=await setup({reader:()=>new Promise(done=>{resolve=done})}),{$,field,w,data}=s;try{
 $('#cost-new').click();addReceipt(s);assert.equal($('#cost-save').disabled,true);field('supplier').value='Meu fornecedor';field('supplier').dispatchEvent(new w.Event('input'));resolve(recognized);await pause();
 assert.equal(field('supplier').value,'Meu fornecedor');assert.equal(field('supplier_document').value,'11.222.333/0001-81');assert.match(field('amount').value,/^R\$\s140,00$/);assert.equal(field('document_date').value,'2026-09-15');assert.equal(field('competence').value,'2026-09');assert.equal(field('document_number').value,'000123');assert.equal(field('category').value,'pool');assert.equal(field('paid_on').value,'');assert.equal(field('confirm_fiscal').checked,false);
 $('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();assert.equal(data.cost_entries.length,0);assert.ok($('#cost-form-message').textContent.includes('Confira os dados'));
 field('receipt_reviewed').checked=true;$('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();await pause();assert.equal(data.cost_entries.length,1);assert.equal(data.cost_entries[0].amount_cents,14000);assert.equal(data.cost_receipts.length,1);
 }finally{s.dom.window.close();}
});
test('OCR failure preserves attachment and manual entry; closing prevents stale reading from filling another cost',async()=>{
 const failed=await setup({reader:async()=>{throw Error('Não foi possível ler a nota.')}});try{failed.$('#cost-new').click();addReceipt(failed);await pause();assert.ok(failed.$('#cost-receipt-status').textContent.includes('Não foi possível'));assert.equal(failed.$('[data-read-file]').textContent,'Ler dados da nota');assert.equal(failed.$('#cost-save').disabled,false);}finally{failed.dom.window.close();}
 let resolve;const s=await setup({reader:()=>new Promise(done=>{resolve=done})});try{s.$('#cost-new').click();addReceipt(s);s.$('#cost-close').click();s.$('#cost-new').click();resolve(recognized);await pause();assert.equal(s.field('supplier').value,'');assert.equal(s.field('amount').value,'');assert.equal(s.$('#cost-receipt-panel').hidden,true);}finally{s.dom.window.close();}
});
test('an unidentified category remains pending instead of assuming cleaning',async()=>{
 const s=await setup({reader:async()=>({fields:{description:'Nota de compra',amount_cents:4094},warnings:['Categoria não identificada; selecione antes de salvar.'],text:'TOTAL A PAGAR 40,94'})});try{s.$('#cost-new').click();assert.equal(s.field('category').value,'');addReceipt(s);await pause();assert.equal(s.field('category').value,'');s.field('receipt_reviewed').checked=true;s.$('#cost-form').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await pause();assert.equal(s.data.cost_entries.length,0);assert.ok(s.$('#cost-form-message').textContent.includes('Selecione a categoria'));}finally{s.dom.window.close();}
});
test('switching the photo clears earlier document fields including corrections and absent fields, then replaces them',async()=>{
 let resolveSecond;const s=await setup({reader:file=>file.name==='primeira.jpg'?Promise.resolve(recognized):new Promise(done=>{resolveSecond=done})});const {$,field,w,data}=s;
 try{$('#cost-new').click();field('property_id').value='1';field('notes').value='Compra para o chalé';field('paid_on').value='2026-10-01';addReceipt(s,'primeira.jpg');await pause();field('supplier').value='Correção da primeira nota';field('supplier').dispatchEvent(new w.Event('input'));field('receipt_reviewed').checked=true;
 addReceipt(s,'segunda.jpg');for(const n of ['description','supplier','supplier_document','amount','document_number','document_date','competence','category'])assert.equal(field(n).value,'',n);assert.equal(field('receipt_reviewed').checked,false);assert.equal($('#cost-save').disabled,true);
 assert.equal(field('property_id').value,'1');assert.equal(field('notes').value,'Compra para o chalé');assert.equal(field('paid_on').value,'2026-10-01');
 resolveSecond({fields:{description:'Segunda compra',supplier:'Outro fornecedor',amount_cents:4094,document_date:'2026-08-10',competence:'2026-08',category:'cleaning_products'},warnings:[],text:'Segunda nota'});await pause();
 assert.equal(field('supplier').value,'Outro fornecedor');assert.match(field('amount').value,/^R\$\s40,94$/);assert.equal(field('document_date').value,'2026-08-10');assert.equal(field('competence').value,'2026-08');assert.equal(field('category').value,'cleaning_products');assert.equal(field('supplier_document').value,'');assert.equal(field('document_number').value,'');assert.equal(field('receipt_reviewed').checked,false);
 $('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();assert.equal(data.cost_entries.length,0);assert.ok($('#cost-form-message').textContent.includes('Confira os dados'));
 field('receipt_reviewed').checked=true;$('#cost-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();await pause();assert.equal(data.cost_entries.length,1);assert.equal(data.cost_entries[0].amount_cents,4094);assert.equal(data.cost_entries[0].supplier_document,'');assert.equal(data.cost_entries[0].document_number,'');
 }finally{s.dom.window.close();}
});
test('switching an unfinished photo ignores its late result and preserves edits made during the new reading',async()=>{
 const resolvers=new Map();const s=await setup({reader:file=>new Promise(done=>resolvers.set(file.name,done))});try{s.$('#cost-new').click();addReceipt(s,'lenta.jpg');addReceipt(s,'nova.jpg');s.field('supplier').value='Correção da nova nota';s.field('supplier').dispatchEvent(new s.w.Event('input'));
 resolvers.get('nova.jpg')({...recognized,fields:{...recognized.fields,amount_cents:5000,document_number:'222'}});await pause();resolvers.get('lenta.jpg')(recognized);await pause();assert.equal(s.field('supplier').value,'Correção da nova nota');assert.match(s.field('amount').value,/^R\$\s50,00$/);assert.equal(s.field('document_number').value,'222');assert.equal(s.$('#cost-receipt-source').textContent,'nova.jpg');assert.equal(s.$('#cost-save').disabled,false);
 }finally{s.dom.window.close();}
});
test('failed or cancelled replacement cannot leave the preceding values ready to save',async()=>{
 const s=await setup({reader:async file=>{if(file.name==='primeira.jpg')return recognized;throw Error('Falha de leitura');}});try{s.$('#cost-new').click();addReceipt(s,'primeira.jpg');await pause();s.field('receipt_reviewed').checked=true;addReceipt(s,'erro.jpg');await pause();assert.equal(s.field('amount').value,'');assert.equal(s.field('supplier_document').value,'');assert.equal(s.field('receipt_reviewed').checked,false);assert.ok(s.$('#cost-receipt-status').textContent.includes('Falha'));assert.equal(s.$('#cost-save').disabled,false);
 s.$('[data-read-file="0"]').click();await pause();assert.match(s.field('amount').value,/^R\$\s140,00$/);assert.equal(s.field('supplier_document').value,recognized.fields.supplier_document);
 }finally{s.dom.window.close();}
});
test('rereading the same attachment preserves its manual corrections',async()=>{
 let calls=0;const s=await setup({reader:async()=>{calls++;return recognized}});try{s.$('#cost-new').click();addReceipt(s);await pause();s.field('supplier').value='Nome corrigido';s.field('supplier').dispatchEvent(new s.w.Event('input'));s.$('[data-read-file]').click();await pause();assert.equal(s.field('supplier').value,'Nome corrigido');assert.equal(calls,1);}finally{s.dom.window.close();}
});
test('cancelling the new reading keeps old document values cleared',async()=>{
 const s=await setup({reader:(file,{signal})=>file.name==='primeira.jpg'?Promise.resolve(recognized):new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelado','AbortError')),{once:true}))});try{s.$('#cost-new').click();addReceipt(s,'primeira.jpg');await pause();addReceipt(s,'cancelar.jpg');s.$('#cost-receipt-cancel').click();await pause();for(const n of ['supplier','supplier_document','document_number','amount','description','document_date','competence','category'])assert.equal(s.field(n).value,'',n);assert.equal(s.$('#cost-save').disabled,false);assert.equal(s.field('receipt_reviewed').checked,false);assert.ok(s.$('#cost-receipt-status').textContent.includes('cancelada'));}finally{s.dom.window.close();}
});
test('ambiguous OCR dates clear untouched date defaults but preserve a date chosen manually',async()=>{
 const result={fields:{amount_cents:4890,category:'cleaning_products'},warnings:['Datas com leituras diferentes; confira a emissão no comprovante.'],text:'Datas divergentes'};const s=await setup({reader:async()=>result});try{s.$('#cost-new').click();assert.ok(s.field('document_date').value);addReceipt(s);await pause();assert.equal(s.field('document_date').value,'');assert.equal(s.field('competence').value,'');s.$('#cost-close').click();s.$('#cost-new').click();s.field('document_date').value='2026-10-16';s.field('document_date').dispatchEvent(new s.w.Event('input'));addReceipt(s,'manual.jpg');await pause();assert.equal(s.field('document_date').value,'2026-10-16');}finally{s.dom.window.close();}
});
test('selecting an already queued photo after another returns to its fields without duplicating the attachment',async()=>{
 let calls=0;const s=await setup({reader:async file=>{calls++;return file.name==='primeira.jpg'?recognized:{fields:{description:'Outra nota',document_number:'000456',amount_cents:6000},warnings:[],text:'Outra nota'};}});
 try{s.$('#cost-new').click();const a=new s.w.File(['receipt A'],'primeira.jpg',{type:'image/jpeg',lastModified:1234}),b=new s.w.File(['receipt B'],'segunda.jpg',{type:'image/jpeg',lastModified:5678});
 const select=file=>{Object.defineProperty(s.$('#cost-files'),'files',{value:[file],configurable:true});s.$('#cost-files').dispatchEvent(new s.w.Event('change'));};
 select(a);await pause();select(b);await pause();assert.equal(s.field('document_number').value,'000456');s.field('receipt_reviewed').checked=true;
 select(a);await pause();assert.equal(s.field('document_number').value,'000123');assert.equal(s.field('description').value,recognized.fields.description);assert.match(s.field('amount').value,/140,00/);assert.equal(s.field('receipt_reviewed').checked,false);assert.equal(s.$('#cost-receipt-source').textContent,'primeira.jpg');assert.equal(s.w.document.querySelectorAll('[data-read-file]').length,2);assert.equal(calls,2);
 assert.equal(s.w.document.querySelectorAll('[name=document_date]').length,1);
 }finally{s.dom.window.close();}
});
