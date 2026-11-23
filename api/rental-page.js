import { readFile } from 'node:fs/promises';
import { publicServiceTarget } from '../scripts/public-service-target.mjs';
import { renderRentalSearchPage } from '../scripts/rental-search-page.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
  const slug = new URL(req.url, 'https://chalezinhoville.com.br').searchParams.get('slug');
  if (slug !== null && !/^[a-z0-9-]{1,160}$/.test(slug)) return res.status(404).end();
  try {
    const target = publicServiceTarget(process.env, String(req.headers.host || ''));
    const endpoint = new URL('/functions/v1/rental-catalog?action=catalog', target.endpoint);
    const [response, template] = await Promise.all([
      fetch(endpoint, { signal: AbortSignal.timeout(12000) }),
      readFile(new URL(slug ? '../hospedagem.html' : '../casas-e-apartamentos.html', import.meta.url), 'utf8'),
    ]);
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.listings)) throw Error('catalog_unavailable');
    const html = renderRentalSearchPage(template, data.listings, slug);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!html) {
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(404).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Imóvel não encontrado</title><h1>Imóvel não encontrado</h1><a href="/casas-e-apartamentos.html">Ver apartamentos disponíveis</a></html>');
    }
    res.status(200);
    return req.method === 'HEAD' ? res.end() : res.send(html);
  } catch {
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Retry-After', '60');
    return res.status(503).send('Não foi possível carregar os apartamentos agora. Tente novamente em instantes.');
  }
}
