// Presentation only: the API remains responsible for authorization. Keep filters
// in this tab's memory, scoped to the signed-in account; never persist record data.
const states=new Map();
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function mountList(container,{id,label,scope='anonymous',records=[],filters=[],action='Editar',compact=true,after,empty='Nenhum cadastro por enquanto.'}){
 const doc=container.ownerDocument,key=JSON.stringify([scope,id]);
 const state=states.get(key)||{query:'',filter:'',size:10,page:1};states.set(key,state);
 if(!filters.some(f=>f.value===state.filter))state.filter='';
 const el=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
 const root=el('section','record-list');root.dataset.list=id;root.setAttribute('aria-label',label);
 const toolbar=el('div','list-toolbar');
 const field=(text,control)=>{const box=el('label','',text);box.append(control);toolbar.append(box);return control;};
 const search=field('Pesquisar '+label.toLocaleLowerCase('pt-BR'),el('input'));search.type='search';search.placeholder='Nome, bairro ou palavra-chave';search.value=state.query;search.autocomplete='off';
 const filter=field('Filtrar',el('select'));
 for(const f of [{value:'',label:'Todos'},...filters]){const o=el('option','',f.label);o.value=f.value;filter.append(o);}filter.value=state.filter;
 filter.parentElement.hidden=!filters.length;
 const size=field('Itens por página',el('select'));
 for(const n of [10,25,50]){const o=el('option','',n);o.value=n;size.append(o);}size.value=state.size;
 const status=el('p','list-count');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 const rows=el('div','list-rows');
 const noResults=el('div','list-empty');const emptyText=el('p');const reset=el('button','','Limpar pesquisa e filtros');reset.type='button';noResults.append(emptyText,reset);
 const pager=el('nav','list-pagination');pager.setAttribute('aria-label','Páginas de '+label.toLocaleLowerCase('pt-BR'));
 const previous=el('button','','← Anterior'),next=el('button','','Próxima →'),page=el('span','list-page');previous.type=next.type='button';pager.append(previous,page,next);
 root.append(toolbar,status,rows,noResults,pager);
 const first=records.find(r=>r.node?.parentElement===container)?.node;
 if(first)container.insertBefore(root,first);else if(after)after.after(root);else container.append(root);
 const entries=records.map(r=>{
  const node=r.node;if(!node)throw Error('List record needs its existing node');
  let row=node;
  if(compact){
   row=el(r.primaryAction?'article':'details','list-record');row.dataset.listRow=r.key;
   const summary=el(r.primaryAction?'div':'summary','list-summary');
   const avatar=el('span','list-avatar',String(r.title||'?').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase());avatar.setAttribute('aria-hidden','true');
   const title=el('span','list-title');title.append(el('strong','',r.title),el('span','list-subtitle',r.subtitle||''));
   const badges=el('span','list-badges');for(const b of r.badges||[])badges.append(el('span','badge',b));
   const edit=el('span','list-action',action+' ＋');
   summary.append(avatar,title,badges,r.primaryAction||edit);
   const editor=el('div','list-editor');if(r.primaryAction)editor.hidden=true;node.classList.remove('card');editor.append(node);row.append(summary,editor);
   if(!r.primaryAction)row.addEventListener('toggle',()=>{edit.textContent=row.open?'Fechar −':action+' ＋';});
   node.addEventListener('input',()=>{if(!row.querySelector('.list-dirty')){const dirty=el('span','list-dirty','Alterações não salvas');title.append(dirty);}});
  }else{row.dataset.listRow=r.key;}
  rows.append(row);
  return {...r,row,index:normalize([r.title,r.subtitle,...(r.search||[]),...(r.badges||[])].join(' '))};
 });
 function draw(){
  const tokens=normalize(state.query).trim().split(/\s+/).filter(Boolean);
  const matching=entries.filter(r=>(!state.filter||(r.tags||[]).includes(state.filter))&&tokens.every(token=>r.index.includes(token)));
  const pages=Math.max(1,Math.ceil(matching.length/state.size));state.page=Math.min(Math.max(1,state.page),pages);
  const start=(state.page-1)*state.size,visible=new Set(matching.slice(start,start+state.size));
  for(const r of entries)r.row.hidden=!visible.has(r);
  status.textContent=matching.length?`Mostrando ${start+1}–${Math.min(start+state.size,matching.length)} de ${matching.length}${matching.length!==entries.length?' · '+entries.length+' no total':''}`:`0 de ${entries.length}`;
  noResults.hidden=!!matching.length;emptyText.textContent=entries.length?'Não encontramos resultados. Tente outro nome ou limpe os filtros.':empty;reset.hidden=!entries.length;
  page.textContent=`Página ${state.page} de ${pages}`;previous.disabled=state.page===1;next.disabled=state.page===pages;pager.hidden=!matching.length;
 }
 const change=()=>{state.query=search.value;state.filter=filter.value;state.size=Number(size.value);state.page=1;draw();};
 search.addEventListener('input',change);filter.addEventListener('change',change);size.addEventListener('change',change);
 reset.onclick=()=>{search.value='';filter.value='';change();search.focus();};
 const move=delta=>{state.page+=delta;draw();root.scrollIntoView?.({block:'start',behavior:'smooth'});};previous.onclick=()=>move(-1);next.onclick=()=>move(1);draw();
 return root;
}
