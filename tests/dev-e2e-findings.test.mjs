import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
const wait = async predicate => {
  for(let i=0;i<100;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail('The page did not reach the expected state');
};
const ok = data => ({ok:true,json:async()=>({ok:true,...data})});

function adminPage(respond){
  const {window:w}=new JSDOM(source('admin.html'),{url:'https://qa.example/admin.html?view=properties',runScripts:'outside-only'});
  w.CHALEZINHO_CONFIG={bookingEngine:'https://qa.example/engine'};
  w.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{access_token:'test-only',user:{id:'qa'}}}})},
    from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'admin'}})}),
  })};
  w.fetch=async (_,opts)=>{
    const body=JSON.parse(opts.body);
    if(body.action==='admin_hub')return ok({properties:[],reservations:[],notifications:[],experience_orders:[],payments:[],guarantees:[],modifications:[],charges:[],notes:[],channel_periods:[]});
    if(body.action==='admin_property_action')return respond(body);
    return ok({requests:[],contacts:[],links:[]});
  };
  w.eval(source('property-pricing-calendar.js'));
  w.eval(source('admin.js'));
  return w;
}

test('PMS sends valid active pricing and payment terms in one save; a blank paused property remains possible',async()=>{
  for(const active of [true,false]){
    let payload;
    const w=adminPage(body=>{payload=body;return ok({property:{id:1}})});
    try{
      await wait(()=>w.document.querySelector('#new-property'));
      w.document.querySelector('#new-property').click();
      const form=w.document.querySelector('#property-form');
      for(const [name,value] of Object.entries({name:'QA',code:'QA-PROBE',slug:'qa-probe',base_price:active?'80,00':'',weekend_price:active?'100,00':'',cleaning_fee:'20',guarantee_amount:'500'}))form.elements[name].value=value;
      form.elements.active.checked=active;
      form.requestSubmit();
      await wait(()=>payload||w.document.querySelector('.admin-form-message')?.textContent!=='Salvando…');
      assert.ok(payload,w.document.querySelector('.admin-form-message')?.textContent);
      assert.equal(payload.active,active);
      assert.deepEqual(payload.own_pricing,active?{weekdays_cents:[8000,8000,8000,8000,8000,10000,10000],periods:[]}:null);
      assert.equal(payload.max_installments,12);
      assert.equal(payload.no_interest_installments,6);
    }finally{w.close();}
  }
});

test('PMS distinguishes validation, actual conflict and internal error',async()=>{
  const errors={
    invalid_payment_terms:/parcelas sem juros/,
    property_conflict:/Já existe/,
    property_save_failed:/Não foi possível salvar agora/,
  };
  for(const [error,message] of Object.entries(errors)){
    let attempted=false;
    const w=adminPage(()=>{attempted=true;return {ok:false,json:async()=>({ok:false,error})}});
    try{
      await wait(()=>w.document.querySelector('#new-property'));
      w.document.querySelector('#new-property').click();
      const form=w.document.querySelector('#property-form');
      for(const [name,value] of Object.entries({name:'QA',code:'QA-PROBE',slug:'qa-probe',base_price:'80'}))form.elements[name].value=value;
      form.requestSubmit();
      await wait(()=>attempted&&form.querySelector('.admin-form-message').textContent!=='Salvando…');
      assert.match(form.querySelector('.admin-form-message').textContent,message);
    }finally{w.close();}
  }
});

function bookingPage(guests,{photo=null}={}){
  const property={id:7,code:'QA-DEV',name:'QA',max_guests:2,cover_image:photo};
  const url='https://qa.example/reservar.html?chalet=QA-DEV&check_in=2099-11-17&check_out=2099-11-18&guests='+guests;
  const {window:w}=new JSDOM(source('reservar.html'),{url,runScripts:'outside-only'});
  const requests=[];
  w.CHALEZINHO_CONFIG={bookingEngine:'https://qa.example/engine',environment:'development'};
  w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};
  w.VilleOffers={contractMarkup:()=>''};
  w.VilleImages={set(img,url){img.src=url;}};
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.fetch=async url=>{
    const q=new URL(url).searchParams;
    if(q.get('action')==='property_media')return ok({properties:[property]});
    if(q.get('action')==='search'){
      requests.push(q.get('guests'));
      return ok({listings:[{...property,available:true,from_stay_price:116}]});
    }
    return ok({});
  };
  w.document.documentElement.classList.add('booking-dates-arrival');
  w.eval(source('booking.js'));
  return {w,requests};
}

test('deep links for one and two guests search, and an excessive count can be corrected',async()=>{
  for(const guests of [1,2,3]){
    const {w,requests}=bookingPage(guests);
    try{
      if(guests===3){
        await wait(()=>w.document.querySelector('#book-guests-error'));
        assert.match(w.document.querySelector('#book-guests-error').textContent,/até 2 hóspedes/);
        assert.equal(w.document.querySelector('#book-guests').getAttribute('aria-invalid'),'true');
        assert.deepEqual(requests,[]);
        assert.equal(w.document.documentElement.classList.contains('booking-dates-arrival'),false);
        w.document.querySelector('#book-search').click();
      }
      await wait(()=>w.document.querySelector('.booking-property'));
      assert.deepEqual(requests,[String(Math.min(guests,2))]);
      assert.equal(w.document.querySelector('#book-guests-error'),null);
    }finally{w.close();}
  }
});

test('search shows a placeholder with no photo and falls back if a stored photo fails',async()=>{
  for(const photo of [null,'assets/qa.webp']){
    const {w}=bookingPage(2,{photo});
    try{
      await wait(()=>w.document.querySelector('.booking-gallery'));
      const gallery=w.document.querySelector('.booking-gallery');
      if(photo){
        const image=gallery.querySelector('img');
        assert.equal(image.getAttribute('src'),photo);
        image.dispatchEvent(new w.Event('error'));
      }
      assert.equal(gallery.querySelector('img'),null);
      assert.equal(gallery.textContent,'Foto indisponível');
    }finally{w.close();}
  }
});

test('one and two nights use the correct label in the rate comparison and consultation receipt',()=>{
  const booking=source('booking.js'),start=booking.indexOf('function renderCheckoutRates(){'),end=booking.indexOf('\nfunction ',start+1);
  const {window:w}=new JSDOM('<div id="checkout-panel"><div id="summary-content"></div></div>',{runScripts:'outside-only'});
  try{
    w.$=s=>w.document.querySelector(s);
    w.state={quote:{rate_options:[{code:'r',selectable:true,name:'Reembolsável',total_amount_cents:11600}]}};
    w.brlC=String;w.esc=String;w.lodgingOnly=()=>false;
    w.eval(source('consultation-summary.js'));
    const nightsLabel=booking.split('\n').find(line=>line.startsWith('const nightsLabel='));
    w.eval(nightsLabel+'\n'+booking.slice(start,end));
    for(const n of [1,2]){
      w.stayNights=()=>n;
      w.renderCheckoutRates();
      const label=n===1?'1 noite':'2 noites';
      assert.equal(w.document.querySelector('#checkout-rate-options small').textContent,'Total para '+label);
      const receipt=w.VilleConsultationSummary.summary({
        quote:{checked_at:'2026-11-06T20:00:00Z'},
        rate:{total_amount_cents:11600,name:'Reembolsável',contract_snapshot:{check_in:'2026-11-17',check_out:'2026-11-'+(17+n),guests:2}},
      });
      assert.ok(receipt.includes(' · '+label+'\n'));
    }
  }finally{w.close();}
});

test('account reports an elapsed Pix hold and never describes a refunded experience as pending',()=>{
  const account=source('account.js');
  const {window:w}=new JSDOM('',{runScripts:'outside-only'});
  try{
    w.esc=String;w.brlC=String;w.fmtDateTime=String;
    w.eval(account.slice(account.indexOf('function initialPayment('),account.indexOf('function renderPendingPayments('))+
      account.slice(account.indexOf('function renderExperiencePaymentHistory('),account.indexOf('function renderModificationPaymentHistory(')));
    const reservation={id:'res',status:'pending_payment',hold_expires_at:'2026-11-06T16:30:00Z'};
    const pix={method:'pix',status:'awaiting_payment'};
    assert.equal(w.pixHoldElapsed(reservation,pix,Date.parse('2026-11-06T16:29:59Z')),false);
    assert.equal(w.pixHoldElapsed(reservation,pix,Date.parse('2026-11-06T16:30:00Z')),true);
    assert.equal(w.pixHoldElapsed({...reservation,hold_expires_at:null},pix),false);
    assert.match(w.reservationStatus(reservation,pix).label,/prazo do Pix encerrado/i);
    assert.match(w.paymentStatus(pix,{pixExpired:true}).label,/Prazo do Pix encerrado/);
    assert.match(w.reservationStatus(reservation,{...pix,status:'paid',metadata:{manual_review:'paid_after_hold'}}).label,/reserva em análise/);
    w.charges=[{id:'charge',payment_id:'pay',reservation_id:'res',kind:'experience_add',amount_cents:4000,status:'applied'}];
    const html=w.renderExperiencePaymentHistory({id:'res',payments:[{id:'pay',status:'refunded',amount_cents:4000,method:'card'}]});
    assert.match(html,/Pagamento estornado/);
    assert.doesNotMatch(html,/aguardando confirmação/);
  }finally{w.close();}
});
