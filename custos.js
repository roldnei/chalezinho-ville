import {CATEGORIES,TAX_SOURCE,cents,monthStart,selection,totals,reportCSV,safeName,zipBlob} from './costs-model.js';
import {readReceipt} from './cost-receipt-ocr.js';
const $=s=>document.querySelector(s),C=window.CHALEZINHO_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,C.authOptions);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=n=>(Number(n)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=d=>d?d.split('-').reverse().join('/'):'Não pago';
let entries=[],receipts=[],properties=[],edit=null,queue=[],busy=false,loadVersion=0,draftId=null;
let receiptController=null,receiptRun=0,receiptBusy=false,receiptActive=null,receiptReview=false,applyingReceipt=false;
const touchedFields=new Set(),receiptDefaults=new Map(),receiptAuto=new Map();
const form=$('#cost-form'),field=n=>form.elements.namedItem(n);
const check=result=>{if(result.error)throw result.error;return result.data};
function bindMoneyInput(name){
 const input=field(name),error=$('#cost-'+name+'-error');
 function validate(format=false){
  input.setCustomValidity('');input.removeAttribute('aria-invalid');error.hidden=true;error.textContent='';
  if(name==='exclusion'&&!field('confirm_fiscal').checked)return;
  if(!input.value.trim()&&!input.required)return;
  try{let value=input.value.trim();if(format&&/^\d+,$/.test(value))value+='00';const amount=cents(value);if(format)input.value=brl(amount);}
  catch(e){input.setCustomValidity(e.message);input.setAttribute('aria-invalid','true');error.textContent=e.message;error.hidden=false;}
 }
 input.addEventListener('focus',()=>{if(/^R\$/.test(input.value))input.value=input.value.replace(/^R\$\s*/,'').replaceAll('.','');});
 input.addEventListener('beforeinput',event=>{
  if(!event.cancelable||!event.inputType?.startsWith('insert')||event.isComposing||event.data?.length!==1)return;
  const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
  const char=event.data==='.'?',':event.data,next=input.value.slice(0,start)+char+input.value.slice(end);
  if(!/^\d*(?:,\d{0,2})?$/.test(next)){event.preventDefault();return;}
  if(event.data==='.'){event.preventDefault();input.setRangeText(',',start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));}
 });
 input.addEventListener('input',()=>validate());input.addEventListener('blur',()=>validate(true));
}
function message(text){$('#cost-status').textContent=text;}
function cancelReceiptRead(){receiptRun++;receiptController?.abort();receiptController=null;receiptBusy=false;receiptActive=null;$('#cost-receipt-progress').hidden=true;$('#cost-receipt-cancel').hidden=true;$('#cost-save').disabled=busy;$('#cost-archive').disabled=busy;}
function applyReceiptResult(result){
 const values={...result.fields};if(values.amount_cents)values.amount=brl(values.amount_cents);delete values.amount_cents;
 let filled=0;applyingReceipt=true;
 try{for(const name of ['supplier','supplier_document','document_date','competence','document_number','amount','category','description']){
  const input=field(name),value=values[name];if(!value||touchedFields.has(name)||(input.value!==''&&!(receiptAuto.has(name)&&receiptAuto.get(name)===input.value)&&!(!edit&&receiptDefaults.get(name)===input.value)))continue;
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));if(name==='category')input.dispatchEvent(new Event('change',{bubbles:true}));receiptAuto.set(name,input.value);input.classList.add('cost-ocr-filled');filled++;
 }}finally{applyingReceipt=false;}
 if(filled){receiptReview=true;field('receipt_reviewed').checked=false;field('receipt_reviewed').required=true;$('#cost-receipt-review').hidden=false;}
 $('#cost-receipt-status').textContent=filled?`${filled} campo(s) preenchido(s). Confira antes de salvar.`:'Leitura concluída. Os campos já preenchidos foram mantidos.';
 $('#cost-receipt-warnings').replaceChildren(...result.warnings.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('#cost-receipt-text').textContent=String(result.text||'').slice(0,30000);
}
async function startReceiptRead(item){
 if(busy)return;cancelReceiptRead();const run=receiptRun,controller=new AbortController();receiptController=controller;const deadline=setTimeout(()=>controller.abort(),90000);receiptBusy=true;receiptActive=item.id;
 $('#cost-receipt-panel').hidden=false;$('#cost-receipt-source').textContent=item.file.name;$('#cost-receipt-status').textContent='Lendo comprovante…';$('#cost-receipt-progress').hidden=false;$('#cost-receipt-cancel').hidden=false;$('#cost-receipt-warnings').replaceChildren();$('#cost-receipt-text').textContent='';$('#cost-save').disabled=true;$('#cost-archive').disabled=true;
 try{const result=item.readResult||await readReceipt(item.file,{signal:controller.signal,onProgress:text=>{if(run===receiptRun)$('#cost-receipt-status').textContent=text;}});if(run!==receiptRun||!$('#cost-dialog').open)return;item.readResult=result;applyReceiptResult(result);}
 catch(error){if(run!==receiptRun)return;$('#cost-receipt-status').textContent=error.name==='AbortError'?'Leitura cancelada. Você pode preencher os campos.':error.message||'Não foi possível ler a nota. Preencha os campos ou tente outra foto.';}
 finally{clearTimeout(deadline);if(run===receiptRun){receiptBusy=false;receiptController=null;receiptActive=null;$('#cost-receipt-progress').hidden=true;$('#cost-receipt-cancel').hidden=true;$('#cost-save').disabled=busy;$('#cost-archive').disabled=busy;}}
}
async function allRows(table,build=q=>q){let rows=[];for(let offset=0;;offset+=1000){const page=check(await build(sb.from(table).select('*')).range(offset,offset+999));rows.push(...page);if(page.length<1000)return rows;}}
function visible(){return selection(entries,$('#cost-month').value,$('#cost-property').value,$('#cost-basis').value);}
function propertyName(id){return properties.find(p=>String(p.id)===String(id))?.name||'Compartilhado / geral';}
function render(){
 const rows=visible(),t=totals(rows),missing=rows.filter(r=>!receipts.some(f=>f.expense_id===r.id)).length;
 $('#cost-totals').innerHTML=`<article><small>CUSTOS NO FILTRO</small><strong>${brl(t.cost)}</strong><small>${rows.length} lançamento(s) · pagos: ${brl(t.paid)}</small></article><article><small>EXCLUSÕES REVISADAS NO FILTRO</small><strong>${brl(t.exclusions)}</strong><small>Para apurar por mês fiscal, altere “Organizar por”.</small></article><article><small>PENDÊNCIAS</small><strong>${t.pending} para revisar</strong><small>${missing} lançamento(s) sem comprovante</small></article>`;
 $('#cost-period-title').textContent='Lançamentos · '+$('#cost-month').value.split('-').reverse().join('/');
 $('#cost-list').innerHTML=rows.map(r=>`<article class="cost-row"><div><h3>${esc(r.description)}</h3><p>${esc(propertyName(r.property_id))} · ${esc(CATEGORIES[r.category]?.[0])}</p><p>Referência: ${esc(r.competence.slice(0,7).split('-').reverse().join('/'))} · Pagamento: ${date(r.paid_on)}</p><span class="cost-badge ${r.fiscal_status}">${r.fiscal_status==='confirmed'?'Exclusão revisada · '+brl(r.exclusion_cents):r.fiscal_status==='review'?'Revisar enquadramento':'Custo operacional'}</span>${r.fiscal_month?`<span class="cost-badge">Mês fiscal: ${r.fiscal_month.slice(0,7).split('-').reverse().join('/')}</span>`:''}<div class="cost-receipts">${filesHTML(r.id)}</div></div><div><p class="cost-amount">${brl(r.amount_cents)}</p><button type="button" data-edit="${r.id}">Ver / editar</button></div></article>`).join('')||'<p class="cost-month-empty">Nenhum custo neste mês. Adicione o primeiro comprovante.</p>';
 $('#cost-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(entries.find(r=>r.id===b.dataset.edit)));
 bindDownloads($('#cost-list'));
}
function filesHTML(id){const files=receipts.filter(f=>f.expense_id===id);return files.map(f=>`<button type="button" data-download="${f.id}">↓ ${esc(f.original_name)}</button>`).join('')||'<small>Sem comprovante</small>';}
function bindDownloads(root){root.querySelectorAll('[data-download]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await downloadReceipt(receipts.find(f=>f.id===b.dataset.download));}catch{message('Não foi possível baixar o comprovante. Tente novamente.');}finally{b.disabled=false;}});}
async function load(){
 const version=++loadVersion;message('Consultando lançamentos…');$('#cost-csv').disabled=true;$('#cost-zip').disabled=true;
 try{const [nextEntries,nextReceipts,nextProperties]=await Promise.all([allRows('cost_entries',q=>q.order('created_at').order('id')),allRows('cost_receipts',q=>q.order('created_at').order('id')),allRows('properties',q=>q.order('id'))]);if(version!==loadVersion)return;
  entries=nextEntries;receipts=nextReceipts;properties=nextProperties;
  const selected=$('#cost-property').value;$('#cost-property').innerHTML='<option value="all">Todos os imóveis</option><option value="shared">Compartilhado / geral</option>'+properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');$('#cost-property').value=selected;
  $('#cost-loading').hidden=true;$('#cost-app').hidden=false;render();message('');$('#cost-csv').disabled=false;$('#cost-zip').disabled=false;
 }catch{if(version!==loadVersion)return;message('Não foi possível consultar os custos. Atualize para tentar novamente.');$('#cost-loading').textContent='Custos indisponíveis. Recarregue a página para tentar novamente.';}
}
function classify(){
 const eligible=!!CATEGORIES[field('category').value]?.[1];
 $('#cost-classification').textContent=eligible?'Exclusão possível, sujeita à revisão das condições legais e do comprovante.':'Custo operacional: não integra as exclusões de aluguel de pessoa física.';
 $('#cost-confirm-label').hidden=!eligible;
 if(!eligible)field('confirm_fiscal').checked=false;
 $('#cost-fiscal').hidden=!field('confirm_fiscal').checked;
 field('exclusion').required=field('confirm_fiscal').checked;
 if(!field('confirm_fiscal').checked){field('exclusion').setCustomValidity('');field('exclusion').removeAttribute('aria-invalid');$('#cost-exclusion-error').hidden=true;}
}
function openEditor(row){
 cancelReceiptRead();receiptReview=false;touchedFields.clear();receiptDefaults.clear();receiptAuto.clear();field('receipt_reviewed').required=false;$('#cost-receipt-panel').hidden=true;$('#cost-receipt-review').hidden=true;form.querySelectorAll('.cost-ocr-filled').forEach(input=>input.classList.remove('cost-ocr-filled'));
 edit=row?{...row}:null;draftId=row?.id||crypto.randomUUID();queue=[];form.reset();$('#cost-form-message').textContent='';$('#cost-dialog-title').textContent=row?'Editar custo':'Novo custo';$('#cost-archive').hidden=!row;
 field('category').innerHTML='<option value="">Selecione a categoria</option>'+Object.entries(CATEGORIES).map(([k,[v]])=>`<option value="${k}">${esc(v)}</option>`).join('');
 field('property_id').innerHTML='<option value="">Compartilhado / geral</option>'+properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
 for(const key of ['description','supplier','supplier_document','document_number','document_date','paid_on','notes','fiscal_note'])field(key).value=row?.[key]||'';
 for(const name of ['amount','exclusion']){field(name).setCustomValidity('');field(name).removeAttribute('aria-invalid');$('#cost-'+name+'-error').hidden=true;}
 field('amount').value=row?brl(row.amount_cents):'';field('category').value=row?.category||'';field('property_id').value=row?.property_id||'';
 field('competence').value=row?.competence.slice(0,7)||$('#cost-month').value;field('document_date').value=row?.document_date||today();field('paid_on').max=today();field('exclusion').value=row?.exclusion_cents?brl(row.exclusion_cents):'';field('fiscal_month').value=row?.fiscal_month?.slice(0,7)||row?.paid_on?.slice(0,7)||today().slice(0,7);
 field('owner_borne').checked=!!row?.owner_borne;field('confirm_fiscal').checked=row?.fiscal_status==='confirmed';$('#cost-existing-files').innerHTML=row?filesHTML(row.id):'';bindDownloads($('#cost-existing-files'));renderQueue();classify();for(const input of form.querySelectorAll('[name]'))receiptDefaults.set(input.name,input.value);$('#cost-dialog').showModal();
}
function renderQueue(){
 $('#cost-file-queue').innerHTML=queue.map((item,i)=>`<div class="cost-queued-receipt"><span>${esc(item.file.name)}</span><button type="button" data-read-file="${i}">Ler dados da nota</button><button type="button" data-remove-file="${i}" aria-label="Remover ${esc(item.file.name)}">Remover</button></div>`).join('');$('#cost-file-queue').querySelectorAll('[data-read-file]').forEach(b=>b.onclick=()=>startReceiptRead(queue[Number(b.dataset.readFile)]));$('#cost-file-queue').querySelectorAll('[data-remove-file]').forEach(b=>b.onclick=()=>{if(busy)return;const index=Number(b.dataset.removeFile);if(queue[index]?.id===receiptActive){cancelReceiptRead();$('#cost-receipt-status').textContent='Leitura cancelada. Comprovante removido.';}queue.splice(index,1);renderQueue();});
}
function addFiles(input){
 const added=[];
 for(const file of input.files){if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size>10485760||file.size===0){$('#cost-form-message').textContent='Use fotos JPG, PNG, WebP ou PDF com até 10 MB por arquivo. '+file.name+' não foi adicionado.';continue;}
 if(queue.length+receipts.filter(f=>f.expense_id===edit?.id).length>=30){$('#cost-form-message').textContent='Limite de 30 anexos por lançamento.';break;}
 if(!queue.some(q=>q.file.name===file.name&&q.file.size===file.size&&q.file.lastModified===file.lastModified)){const item={id:crypto.randomUUID(),file,uploaded:false,attached:false};queue.push(item);added.push(item);}}
 input.value='';renderQueue();if(added.length)void startReceiptRead(added[0]);
}
function payload(){
 if(receiptReview&&!field('receipt_reviewed').checked)throw Error('Confira os dados lidos da nota e marque a confirmação antes de salvar.');
 if(!CATEGORIES[field('category').value])throw Error('Selecione a categoria do custo.');
 const p={description:field('description').value.trim(),category:field('category').value,property_id:field('property_id').value?Number(field('property_id').value):null,amount_cents:cents(field('amount').value),competence:monthStart(field('competence').value),document_date:field('document_date').value,paid_on:field('paid_on').value||null,supplier:field('supplier').value.trim(),supplier_document:field('supplier_document').value.trim(),document_number:field('document_number').value.trim(),notes:field('notes').value.trim(),fiscal_note:field('fiscal_note').value.trim(),owner_borne:field('owner_borne').checked,fiscal_status:CATEGORIES[field('category').value][1]?'review':'operational',fiscal_month:null,exclusion_cents:0};
 if(p.paid_on&&p.paid_on>today())throw Error('A data do pagamento não pode estar no futuro.');
 if(field('confirm_fiscal').checked){if(!p.property_id)throw Error('Vincule a exclusão fiscal a um imóvel. Para custos compartilhados, registre o rateio documentado por imóvel.');if(!p.paid_on||!p.owner_borne||p.fiscal_note.length<5)throw Error('Informe pagamento, justificativa e confirme que o encargo foi do locador.');if(!queue.length&&!receipts.some(f=>f.expense_id===edit?.id))throw Error('Anexe o comprovante antes de revisar a exclusão.');
 const fiscal=monthStart(field('fiscal_month').value),value=cents(field('exclusion').value);if(value>p.amount_cents)throw Error('A exclusão não pode superar o custo.');if(fiscal<p.paid_on.slice(0,7)+'-01'||fiscal.slice(0,4)!==p.paid_on.slice(0,4))throw Error('Revise o mês fiscal: deve ser igual ou posterior ao pagamento, dentro do mesmo ano.');p.fiscal_status='confirmed';p.fiscal_month=fiscal;p.exclusion_cents=value;}
 return p;
}
async function writeEntry(p){
 if(edit){const rows=check(await sb.from('cost_entries').update(p).eq('id',edit.id).eq('updated_at',edit.updated_at).select());if(rows.length!==1)throw Error('Este custo foi alterado em outra tela. Feche e atualize antes de editar.');edit=rows[0];}
 else{const saved=check(await sb.from('cost_entries').upsert({...p,id:draftId},{onConflict:'id',ignoreDuplicates:true}).select());edit=saved?.[0]||check(await sb.from('cost_entries').select('*').eq('id',draftId).single());if(!saved?.length)await writeEntry(p);}
}
async function uploadQueue(){
 for(const item of queue){if(item.attached)continue;const file=item.file,extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[file.type],path=`${edit.id}/${item.id}.${extension}`;
 if(!item.uploaded){const uploaded=await sb.storage.from('cost-receipts').upload(path,file,{contentType:file.type,upsert:false});if(uploaded.error){if(String(uploaded.error.statusCode)!=='409')throw uploaded.error;const existing=await receiptBlob({object_path:path});if(existing.size!==file.size)throw Error('cost_upload_conflict');}item.uploaded=true;}
 const saved=check(await sb.from('cost_receipts').upsert({id:item.id,expense_id:edit.id,object_path:path,original_name:file.name.slice(0,240),mime_type:file.type,size_bytes:file.size},{onConflict:'id',ignoreDuplicates:true}).select());
 const receipt=saved?.[0]||check(await sb.from('cost_receipts').select('*').eq('id',item.id).single());
 item.attached=true;if(!receipts.some(r=>r.id===receipt.id))receipts.push(receipt);
 }
}
async function save(event){event.preventDefault();if(busy||receiptBusy)return;let p;try{p=payload();}catch(e){$('#cost-form-message').textContent=e.message;return;}busy=true;setBusy(true);$('#cost-form-message').textContent='Salvando lançamento e comprovantes…';
 try{const finalFiscal={fiscal_status:p.fiscal_status,fiscal_month:p.fiscal_month,exclusion_cents:p.exclusion_cents};
 // Always keep the entry pending until every selected receipt has been stored.
 await writeEntry({...p,fiscal_status:CATEGORIES[p.category][1]?'review':'operational',fiscal_month:null,exclusion_cents:0});await uploadQueue();if(finalFiscal.fiscal_status==='confirmed')await writeEntry(finalFiscal);
 $('#cost-dialog').close();await load();message('Custo salvo com os comprovantes.');
 }catch(e){$('#cost-form-message').textContent=(edit?'O lançamento está salvo; confira os anexos e tente salvar novamente. ':'Não foi possível salvar. ')+(e.message?.includes('alterado em outra')?e.message:'Verifique a conexão e os campos informados.');}
 finally{busy=false;setBusy(false);}
}
function setBusy(value){form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=value);$('#cost-close').disabled=value;}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeName(name);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function receiptBlob(r){return check(await sb.storage.from('cost-receipts').download(r.object_path));}
async function downloadReceipt(r){download(await receiptBlob(r),r.original_name);}
async function exportMonth(bundle){
 const rows=visible();if(!rows.length){message('Não há custos neste filtro para exportar.');return;}
 const files=receipts.filter(f=>rows.some(r=>r.id===f.expense_id)),csv=reportCSV(rows,files,properties),name='custos-'+$('#cost-month').value+'-'+$('#cost-basis').value;
 if(!bundle){download(new Blob([csv],{type:'text/csv;charset=utf-8'}),name+'.csv');return;}
 if(files.reduce((s,r)=>s+Number(r.size_bytes),0)>100*1024*1024){message('Os anexos superam 100 MB. Filtre por imóvel ou baixe os comprovantes individualmente.');return;}
 $('#cost-zip').disabled=true;$('#cost-csv').disabled=true;
 try{const archive=[{name:'resumo.csv',blob:new Blob([csv],{type:'text/csv;charset=utf-8'})},{name:'LEIA-ME.txt',blob:new Blob([`Custos Chalezinho Ville\nMês: ${$('#cost-month').value}\nCritério: ${$('#cost-basis').selectedOptions[0].textContent}\nImóvel: ${$('#cost-property').selectedOptions[0].textContent}\nValores de exclusão são revisados pelo administrador e não equivalem ao imposto devido. Receitas não fazem parte deste relatório. Documentos sem mês fiscal não compõem exclusões. Não é arquivo de importação na Receita.\nFonte: ${TAX_SOURCE}\n`])}];
 for(let i=0;i<files.length;i++){message(`Preparando comprovante ${i+1} de ${files.length}…`);const f=files[i];archive.push({name:`${f.expense_id}/${f.id}-${safeName(f.original_name)}`,blob:await receiptBlob(f)});}
 download(await zipBlob(archive),name+'.zip');message(`Pacote pronto: resumo e ${files.length} comprovante(s).`);
 }catch{message('O pacote não foi concluído porque um comprovante não pôde ser baixado. Tente novamente.');}finally{$('#cost-zip').disabled=false;$('#cost-csv').disabled=false;}
}
async function boot(){try{
 const {data:{session}}=await sb.auth.getSession();if(!session){location.href='auth.html?mode=login&return='+encodeURIComponent('custos.html');return;}
 const profile=check(await sb.from('profiles').select('role,full_name,pms_access_status').eq('id',session.user.id).single());if(profile.role!=='admin'||profile.pms_access_status!=='active'){$('#cost-loading').textContent='Custos e comprovantes são restritos à administração.';return;}
 $('#cost-user').textContent=profile.full_name||session.user.email;$('#cost-month').value=today().slice(0,7);$('#cost-tax-source').href=TAX_SOURCE;
 bindMoneyInput('amount');bindMoneyInput('exclusion');
 for(const id of ['cost-month','cost-property','cost-basis'])$('#'+id).onchange=()=>{if($('#cost-month').validity.valid&&$('#cost-month').value)render();};
 $('#cost-new').onclick=()=>openEditor();$('#cost-refresh').onclick=load;$('#cost-csv').onclick=()=>exportMonth(false);$('#cost-zip').onclick=()=>exportMonth(true);$('#cost-close').onclick=()=>{cancelReceiptRead();$('#cost-dialog').close();};$('#cost-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else cancelReceiptRead();});field('category').onchange=classify;field('confirm_fiscal').onchange=classify;
 $('#cost-receipt-cancel').onclick=()=>{cancelReceiptRead();$('#cost-receipt-status').textContent='Leitura cancelada. Você pode preencher os campos.';};
 for(const input of form.querySelectorAll('[name]'))for(const type of ['input','change'])input.addEventListener(type,()=>{if(!applyingReceipt){touchedFields.add(input.name);input.classList.remove('cost-ocr-filled');}});
 field('paid_on').onchange=()=>{if(!field('fiscal_month').value)field('fiscal_month').value=field('paid_on').value.slice(0,7);};
 $('#cost-camera').onchange=e=>addFiles(e.target);$('#cost-files').onchange=e=>addFiles(e.target);form.onsubmit=save;
 $('#cost-archive').onclick=async()=>{if(busy||!edit||!confirm('Arquivar este custo? Ele sairá dos totais, e os comprovantes serão preservados.'))return;busy=true;setBusy(true);try{await writeEntry({archived_at:new Date().toISOString()});$('#cost-dialog').close();await load();message('Custo arquivado. Os documentos e o histórico foram preservados.');}catch{$('#cost-form-message').textContent='Não foi possível arquivar. Atualize e tente novamente.';}finally{busy=false;setBusy(false);}};
 await load();
 }catch{$('#cost-loading').textContent='Não foi possível abrir os custos. Recarregue a página.';}}
boot();
