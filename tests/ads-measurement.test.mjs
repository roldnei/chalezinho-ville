import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const source = readFileSync(new URL('../ads-measurement.js', import.meta.url), 'utf8');
const phone = '5593991592266';
const pageLabel = 'kEuZCO3QvaodEPfPzeZE';
const whatsappLabel = '0JbfCLbP0rkdEPfPzeZE';
const site = 'https://chalezinhoville.com.br';

function fixture(t, url = site + '/reservar.html', setup = () => {}) {
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
    googleTag: () => find('script[src*="googletagmanager"]'),
    choose: index => window.document.querySelectorAll('#ville-marketing-consent button')[index].click(),
    conversions: () => Array.from(window.dataLayer || [])
      .filter(entry => entry[0] === 'event' && entry[1] === 'conversion')
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

test('view and direct WhatsApp clicks use different labels without forwarding message or URL details', t => {
  const visitor = fixture(t, site + '/reservar.html?gclid=SampleClick123&email=private@example.com#checkout');
  visitor.choose(0);
  assert.match(visitor.googleTag().src, /AW-18468792311$/);
  visitor.click('share');
  assert.equal(visitor.conversions().length, 1);
  assert.equal(visitor.click('contact'), 'Resumo\nReferência: MV-AABBCCDDEEFF\nOrigem: anúncio no Google');
  assert.equal(visitor.click('contact').match(/Origem/g).length, 1);
  const events = visitor.conversions();
  assert.deepEqual(events.map(e => e.send_to.split('/')[1]), [pageLabel, whatsappLabel, whatsappLabel]);
  assert.ok(events.every(e => e.page_location === site + '/reservar.html'));
  assert.doesNotMatch(JSON.stringify(events), /private@example|SampleClick123|Resumo|booking_confirmed/);

  visitor.window.document.querySelector('footer button').click();
  visitor.choose(1);
  visitor.click('contact');
  assert.equal(visitor.window.localStorage.getItem('ville-google-ads-source-v1'), null);
  assert.equal(visitor.conversions().length, 3);
});

test('date buttons can record the direct contact without marking an organic visitor as paid', t => {
  const visitor = fixture(t, site + '/');
  visitor.choose(0);
  const url = new URL('https://wa.me/' + phone + '?text=Consulta');
  assert.equal(visitor.window.VilleAds.contact(url).searchParams.get('text'), 'Consulta');
  assert.equal(visitor.conversions()[1].send_to.split('/')[1], whatsappLabel);
});
