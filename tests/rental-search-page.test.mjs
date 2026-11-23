import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderRentalSearchPage } from '../scripts/rental-search-page.mjs';
import handler from '../api/rental-page.js';

const template = await readFile(new URL('../hospedagem.html', import.meta.url), 'utf8');
const catalogTemplate = await readFile(new URL('../casas-e-apartamentos.html', import.meta.url), 'utf8');
const seed = JSON.parse(await readFile(new URL('../docs/catalog/apartments.json', import.meta.url), 'utf8'));
const listings = seed.map(property => ({ ...property, listing: property.features.public_listing }));

test('HTML exposes each apartment and its stable canonical before JavaScript runs', () => {
  const catalog = renderRentalSearchPage(catalogTemplate, listings);
  assert.match(catalog, /Apartamentos em Guarapari para temporada/);
  for (const property of listings) {
    assert.ok(catalog.includes('href="https://chalezinhoville.com.br/imoveis/' + property.slug + '"'));
    const html = renderRentalSearchPage(template, listings, property.slug);
    assert.ok(html.includes('<h1>' + property.name + '</h1>'));
    assert.ok(html.includes(property.summary));
    assert.ok(html.includes('rel="canonical" href="https://chalezinhoville.com.br/imoveis/' + property.slug + '"'));
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.ok(!html.includes('Carregando imóvel…'));
    assert.ok(!html.includes('"price"'));
  }
  assert.match(renderRentalSearchPage(template, listings, listings[0].slug), /Home Office Guarapari/);
  assert.equal(renderRentalSearchPage(template, listings, 'retirado-do-catalogo'), null);
});

test('PMS edits appear in server HTML and embedded data cannot close a script element', () => {
  const property = {
    ...listings[0], name: 'Novo & atualizado $&',
    summary: '</script><img src=x onerror="alert(1)">',
    max_guests: 3,
  };
  const html = renderRentalSearchPage(template, [property], property.slug);
  assert.ok(html.includes('<h1>Novo &amp; atualizado $&amp;</h1>'));
  assert.ok(html.includes('&lt;/script&gt;&lt;img'));
  assert.ok(!html.includes('</script><img'));
  const embedded = html.match(/id="rental-catalog-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(embedded).listings[0].max_guests, 3);
});

function response() {
  return {
    headers: {}, statusCode: 200, body: '',
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('missing and unavailable catalog rows get real error statuses, never an indexable empty property', async () => {
  const fetchBefore = globalThis.fetch;
  const environment = { VERCEL_ENV: process.env.VERCEL_ENV, VILLE_RELEASE_PROFILE: process.env.VILLE_RELEASE_PROFILE };
  process.env.VERCEL_ENV = 'preview';
  process.env.VILLE_RELEASE_PROFILE = 'whatsapp';
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, listings: [] }) });
    const missing = response();
    await handler({ method: 'GET', url: '/api/rental-page?slug=retirado', headers: { host: 'preview.vercel.app' } }, missing);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.headers['X-Robots-Tag'], 'noindex');

    globalThis.fetch = async () => { throw Error('network_unavailable'); };
    const outage = response();
    await handler({ method: 'GET', url: '/api/rental-page', headers: { host: 'preview.vercel.app' } }, outage);
    assert.equal(outage.statusCode, 503);
    assert.equal(outage.headers['Cache-Control'], 'no-store');
    assert.equal(outage.headers['Retry-After'], '60');
  } finally {
    globalThis.fetch = fetchBefore;
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
