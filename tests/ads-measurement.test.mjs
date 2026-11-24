import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const source = readFileSync(new URL('../ads-measurement.js', import.meta.url), 'utf8');
const phone = '5593991592266';
const whatsappLabel = '0JbfCLbP0rkdEPfPzeZE';
const site = 'https://chalezinhoville.com.br';
const consentKey = 'ville-marketing-consent-v1';

function fixture(t, url = site + '/', setup = () => {}) {
  const dom = new JSDOM(`<a id="contact" href="https://wa.me/${phone}?text=Resumo%0ARefer%C3%AAncia%3A%20MV-AABBCCDDEEFF">Contato</a>
    <a id="share" href="https://wa.me/?text=Compartilhar">Compartilhar</a><footer></footer>`, {
    url, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  t.after(() => window.close());
  window.CHALEZINHO_CONFIG = { whatsappNumber: phone };
  setup(window);
  window.eval(source);
  const find = selector => window.document.querySelector(selector);
  function click(id) {
    const link = find('#' + id);
    link.addEventListener('click', event => event.preventDefault(), { once: true });
    link.click();
    return new URL(link.href).searchParams.get('text');
  }
  return {
    window, click,
    prompt: () => find('#ville-marketing-consent'),
    googleTag: () => find('script[src*="googletagmanager"]'),
    choose: index => window.document.querySelectorAll('#ville-marketing-consent button')[index].click(),
    conversions: () => Array.from(window.dataLayer || [])
      .filter(entry => entry[0] === 'event' && entry[1] === 'conversion')
      .map(entry => entry[2]),
    views: () => Array.from(window.dataLayer || [])
      .filter(entry => entry[0] === 'event' && entry[1] === 'page_view')
      .map(entry => entry[2]),
  };
}

test('Ads is opt-in and does not run in previews or after a privacy signal', t => {
  const visitor = fixture(t);
  visitor.click('contact');
  assert.equal(visitor.googleTag(), null);
  assert.equal(visitor.conversions().length, 0);
  visitor.choose(1);
  visitor.click('contact');
  assert.equal(visitor.googleTag(), null);

  const preview = fixture(t, 'https://site-preview.vercel.app/reservar.html');
  assert.equal(preview.window.VilleAds, undefined);
  const gpc = fixture(t, site, w =>
    Object.defineProperty(w.navigator, 'globalPrivacyControl', { value: true }));
  assert.equal(gpc.window.VilleAds, undefined);
});

test('direct entrants get the notice on every landing page before any click or measurement', t => {
  for (const path of ['/', '/index.html', '/reservar.html', '/chale-premium.html',
    '/chale-com-hidro.html', '/chale-romantico.html', '/casas-e-apartamentos.html',
    '/hospedagem.html', '/imovel.html', '/imoveis/apartamento-centro-guarapari',
    '/imoveis/apartamento-praia-do-morro-guarapari']) {
    const visitor = fixture(t, site + path + '?utm_source=google&utm_medium=cpc');
    assert.ok(visitor.prompt(), path);
    assert.equal(visitor.googleTag(), null);
    assert.equal(visitor.views().length, 0);
    visitor.click('contact');
    assert.equal(visitor.conversions().length, 0);
    assert.equal(visitor.window.localStorage.getItem('ville-google-ads-source-v1'), null);
  }
});

test('one choice applies to the whole site and is not requested again on other pages', t => {
  for (const [index, value] of ['accepted', 'rejected'].entries()) {
    const home = fixture(t, site + '/index.html?view=site#colecao');
    assert.ok(home.prompt());
    assert.equal(home.prompt().firstElementChild.textContent, 'Nós usamos cookies para melhorar nosso site.');
    assert.deepEqual(Array.from(home.prompt().querySelectorAll('button'), button => button.textContent), ['Aceitar', 'Rejeitar']);
    const details = home.prompt().querySelector('details');
    assert.equal(details.open, false);
    details.querySelector('summary').click();
    assert.equal(details.open, true);
    assert.match(details.textContent, /Google Ads/);
    assert.ok(details.querySelector('a[href*="privacy_policy"]'));
    assert.equal(home.googleTag(), null);
    home.choose(index);
    const saved = home.window.localStorage.getItem(consentKey);
    assert.equal(JSON.parse(saved).value, value);

    for (const path of ['/', '/chale-com-hidro.html', '/reservar.html',
      '/imoveis/apartamento-centro-guarapari', '/imoveis/apartamento-praia-do-morro-guarapari']) {
      const returning = fixture(t, site + path, w => w.localStorage.setItem(consentKey, saved));
      assert.equal(returning.prompt(), null);
      assert.equal(Boolean(returning.googleTag()), value === 'accepted');
    }
  }
});

test('visits are not conversions, contacts are leads and no message or URL details are forwarded', t => {
  const visitor = fixture(t, site + '/reservar.html?gclid=SampleClick123&email=private@example.com#checkout');
  visitor.choose(0);
  assert.match(visitor.googleTag().src, /AW-18468792311$/);
  visitor.click('share');
  assert.equal(visitor.conversions().length, 0);
  assert.equal(visitor.views().length, 1);
  assert.equal(visitor.click('contact'), 'Resumo\nReferência: MV-AABBCCDDEEFF\nOrigem: anúncio no Google');
  assert.equal(visitor.click('contact').match(/Origem/g).length, 1);
  const events = visitor.conversions();
  assert.deepEqual(events.map(e => e.send_to.split('/')[1]), [whatsappLabel]);
  assert.equal(events[0].event_category, 'lead');
  assert.ok(events.every(e => e.page_location === site + '/reservar.html'));
  assert.equal(visitor.views()[0].page_location, site + '/reservar.html');
  assert.doesNotMatch(JSON.stringify([...events, ...visitor.views()]), /private@example|SampleClick123|Resumo|booking_confirmed|purchase|kEuZCO3QvaodEPfPzeZE/);

  visitor.window.document.querySelector('footer button').click();
  visitor.choose(1);
  visitor.click('contact');
  assert.equal(visitor.window.localStorage.getItem('ville-google-ads-source-v1'), null);
  assert.equal(visitor.window.sessionStorage.getItem('ville-google-ads-contact-v1'), null);
  assert.equal(visitor.conversions().length, 1);
});

test('date buttons can record the direct contact without marking an organic visitor as paid', t => {
  const visitor = fixture(t, site + '/');
  visitor.choose(0);
  const url = new URL('https://wa.me/' + phone + '?text=Consulta');
  assert.equal(visitor.window.VilleAds.contact(url).searchParams.get('text'), 'Consulta');
  assert.equal(visitor.conversions()[0].send_to.split('/')[1], whatsappLabel);
});

test('contact deduplication survives navigation and expires after thirty minutes', t => {
  const visitor = fixture(t);
  visitor.choose(0);
  visitor.click('contact');
  visitor.window.VilleAds.contact(new URL('https://wa.me/' + phone + '?text=Outra%20consulta'));
  assert.equal(visitor.conversions().length, 1);
  const consent = visitor.window.localStorage.getItem(consentKey);
  const lead = visitor.window.sessionStorage.getItem('ville-google-ads-contact-v1');
  const returning = fixture(t, site + '/casas-e-apartamentos.html', w => {
    w.localStorage.setItem(consentKey, consent);
    w.sessionStorage.setItem('ville-google-ads-contact-v1', lead);
  });
  returning.click('contact');
  assert.equal(returning.conversions().length, 0);
  returning.window.Date.now = () => JSON.parse(lead).at + 30 * 60_000;
  returning.click('contact');
  assert.equal(returning.conversions().length, 1);
});

test('unrelated URLs never create contact conversions through the public helper', t => {
  const visitor = fixture(t);
  visitor.choose(0);
  for (const url of ['https://example.com/', 'https://wa.me/?text=Compartilhar', 'https://wa.me/5511111111111']) {
    const input = new URL(url);
    assert.equal(visitor.window.VilleAds.contact(input), input);
  }
  assert.equal(visitor.conversions().length, 0);
});

test('expired consent prompts again on a direct apartment entry and repeated acceptance does not duplicate a view', t => {
  const visitor = fixture(t, site + '/imoveis/apartamento-centro-guarapari', w => {
    w.localStorage.setItem(consentKey, JSON.stringify({ value: 'accepted', at: Date.now() - 181 * 86_400_000 }));
  });
  assert.ok(visitor.prompt());
  assert.equal(visitor.views().length, 0);
  visitor.choose(0);
  visitor.window.document.querySelector('footer button').click();
  visitor.choose(0);
  assert.equal(visitor.views().length, 1);
  assert.equal(visitor.conversions().length, 0);
});

test('lead deduplication still works when session storage is unavailable', t => {
  const visitor = fixture(t, site, w => Object.defineProperty(w, 'sessionStorage', {
    get() { throw new Error('Storage blocked'); },
  }));
  visitor.choose(0);
  visitor.click('contact');
  visitor.click('contact');
  assert.equal(visitor.conversions().length, 1);
});
