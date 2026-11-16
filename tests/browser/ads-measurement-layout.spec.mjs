import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const origin = 'https://chalezinhoville.com.br';
const read = file => readFile(new URL('../../' + file, import.meta.url));
const styles = ['styles.css', 'villegram.css', 'ads-measurement.css'];

test.use({ hasTouch: true, isMobile: true });

async function fixture(page, viewport, moments = false) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { value: false });
    window.CHALEZINHO_CONFIG = {
      supabaseUrl: location.origin, bookingEngine: location.origin + '/engine',
      whatsappNumber: '5593991592266', features: { social: false },
    };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
      ${styles.map(file => `<link rel="stylesheet" href="/${file}">`).join('')}
      <main><h1>Chalezinho Ville</h1></main><footer></footer>
      <nav class="villegram-mobile-nav" aria-label="Navegação principal no celular"><a href="/">Site</a></nav>
      <a class="floating-whatsapp" href="https://wa.me/5593991592266">WhatsApp</a>
      <script src="/ads-measurement.js"></script>${moments ? '<script src="/villegram.js"></script>' : ''}
    ` });
    const file = url.pathname.slice(1);
    if (styles.includes(file)) return route.fulfill({ contentType: 'text/css', body: await read(file) });
    if (['ads-measurement.js', 'villegram.js'].includes(file)) {
      return route.fulfill({ contentType: 'text/javascript', body: await read(file) });
    }
    if (file === 'assets/hero-signature-opt-w640.webp') {
      return route.fulfill({ contentType: 'image/webp', body: await read(file) });
    }
    return route.abort();
  });
  await page.goto(origin);
  if (moments) {
    await page.evaluate(() => {
      const intro = {
        intro: true, property_name: 'Chalezinho Ville', offer_name: 'Conheça nossos chalés',
        intro_properties: ['Signature', 'Essenza', 'Amore'].map((name, i) => ({
          id: i + 1, code: 'CH' + (i + 1), name: 'Ville ' + name,
          summary: 'Piscina aquecida privativa + Spa',
          photo: { url: '/assets/hero-signature-opt-w640.webp' },
          url: '/chale-premium.html',
        })),
      };
      window.setInterval = () => 0;
      window.Villegram.configurePublications([intro], [], []);
      window.Villegram.openHome(intro);
    });
  }
  return page.getByRole('region', { name: 'Preferências de medição' });
}

async function expectClearOfNotice(notice, control) {
  await expect.poll(async () => {
    const banner = await notice.boundingBox();
    const target = await control.boundingBox();
    return target && banner && target.y + target.height <= banner.y;
  }).toBe(true);
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`Ville Moments keeps touch controls clear of the notice at ${viewport.width}px`, async ({page}) => {
    const notice = await fixture(page, viewport, true);
    const box = await notice.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 12);
    const moments = page.locator('#villegram.vg-home');
    await expectClearOfNotice(notice, moments.locator('.vg-bottom-nav'));
    await expectClearOfNotice(notice, moments.getByRole('link', { name: 'Conhecer Ville Signature' }));
    await notice.getByText('Saiba mais sobre os cookies').tap();
    await expect(notice.getByText(/Ao aceitar/)).toBeVisible();
    await expectClearOfNotice(notice, moments.locator('.vg-bottom-nav'));
    await notice.getByRole('button', { name: 'Rejeitar' }).tap();
    await expect(notice).toHaveCount(0);
    await expect.poll(async () => Math.round((await moments.boundingBox()).height)).toBe(viewport.height);
  });
}

test('the regular mobile home keeps the menu and WhatsApp button above the notice', async ({page}) => {
  const notice = await fixture(page, { width: 360, height: 740 });
  await expectClearOfNotice(notice, page.locator('.villegram-mobile-nav'));
  await expectClearOfNotice(notice, page.locator('.floating-whatsapp'));
  await notice.getByRole('button', { name: 'Aceitar' }).tap();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(1);
});
