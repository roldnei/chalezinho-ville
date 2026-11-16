// Send only website interactions to Ads. Reservation confirmation happens in the PMS.
(() => {
  if (!['chalezinhoville.com.br', 'www.chalezinhoville.com.br'].includes(location.hostname)) return;
  const adsId = 'AW-18468792311';
  const pageLabel = 'kEuZCO3QvaodEPfPzeZE';
  const whatsappLabel = '0JbfCLbP0rkdEPfPzeZE';
  const consentKey = 'ville-marketing-consent-v1';
  const sourceKey = 'ville-google-ads-source-v1';
  const sourceLine = 'Origem: anúncio no Google';
  const day = 86_400_000;
  const phone = window.CHALEZINHO_CONFIG?.whatsappNumber;
  const page = location.origin + location.pathname;
  const isHome = location.pathname === '/' || location.pathname === '/index.html';
  const denied = {
    ad_storage: 'denied', ad_user_data: 'denied',
    ad_personalization: 'denied', analytics_storage: 'denied',
  };
  const accepted = { ...denied, ad_storage: 'granted', ad_user_data: 'granted' };
  let choice;
  let started = false;
  let fromAd = false;
  let noticeSize;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function blocked() {
    try {
      return navigator.webdriver || navigator.globalPrivacyControl ||
        navigator.doNotTrack === '1' || localStorage.getItem('ville-measurement-excluded') === 'true';
    } catch { return true; }
  }

  function rememberSource() {
    const query = new URLSearchParams(location.search);
    const hasClickId = ['gclid', 'gbraid', 'wbraid'].some(key =>
      /^[A-Za-z0-9_-]{1,512}$/.test(query.get(key) || ''));
    const hasPaidSource = query.get('utm_source') === 'google' && query.get('utm_medium') === 'cpc';
    const now = Date.now();
    const last = read(sourceKey);
    fromAd = hasClickId || hasPaidSource || (last > now - 30 * day && last <= now);
    if (hasClickId || hasPaidSource) {
      try { localStorage.setItem(sourceKey, String(now)); } catch {}
    }
  }

  function command() {
    window.dataLayer.push(arguments);
  }

  function conversion(label, details = {}) {
    command('event', 'conversion', {
      send_to: adsId + '/' + label, page_location: page, page_referrer: '', ...details,
    });
  }

  function start() {
    if (blocked()) return;
    rememberSource();
    if (started) {
      command('consent', 'update', accepted);
      return;
    }
    started = true;
    window.dataLayer = window.dataLayer || [];
    command('consent', 'default', denied);
    command('consent', 'update', accepted);
    command('js', new Date());
    command('config', adsId, {
      send_page_view: false, page_location: page, page_referrer: '',
      allow_ad_personalization_signals: false,
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + adsId;
    document.head.append(script);
    conversion(pageLabel, { value: 0, currency: 'BRL' });
  }

  function contact(url) {
    if (!started || choice !== 'accepted' || blocked()) return url;
    conversion(whatsappLabel);
    if (!fromAd) return url;
    const message = url.searchParams.get('text') || 'Olá! Gostaria de informações sobre os chalés.';
    if (!message.split(/\r?\n/).includes(sourceLine)) {
      url.searchParams.set('text', message + '\n' + sourceLine);
    }
    return url;
  }

  function choose(value) {
    choice = value;
    try { localStorage.setItem(consentKey, JSON.stringify({ value, at: Date.now() })); } catch {}
    removeNotice();
    if (value === 'accepted') {
      start();
    } else {
      fromAd = false;
      try { localStorage.removeItem(sourceKey); } catch {}
      if (started) command('consent', 'update', denied);
      // Unload Google's script after revocation to stop future requests on this page.
      if (started) location.reload();
    }
  }

  function removeNotice() {
    noticeSize?.disconnect();
    document.getElementById('ville-marketing-consent')?.remove();
    document.documentElement.style.removeProperty('--ville-cookie-space');
  }

  function preferences() {
    removeNotice();
    const box = document.createElement('aside');
    box.id = 'ville-marketing-consent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Preferências de medição');
    const copy = document.createElement('p');
    copy.textContent = 'Nós usamos cookies para melhorar nosso site.';
    const actions = document.createElement('div');
    actions.className = 'ville-cookie-actions';
    for (const [label, value] of [['Aceitar', 'accepted'], ['Rejeitar', 'rejected']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = () => choose(value);
      actions.append(button);
    }
    const details = document.createElement('details');
    const more = document.createElement('summary');
    more.textContent = 'Saiba mais sobre os cookies';
    const purpose = document.createElement('p');
    purpose.textContent = 'Ao aceitar, você permite o uso de cookies e o envio ao Google Ads de informações sobre as páginas visitadas e os cliques que abrem o WhatsApp. A medição pode usar o identificador do clique no anúncio para mostrar quais anúncios geram visitas e contatos. A personalização de anúncios fica desativada.';
    const control = document.createElement('p');
    control.textContent = 'Ao rejeitar, a medição do Google Ads fica desativada. Você pode navegar e usar o WhatsApp com qualquer escolha. Sua preferência vale para todo o site, fica salva neste navegador por até 180 dias e pode ser alterada no rodapé, em Preferências de medição.';
    const policy = document.createElement('a');
    policy.href = '/documentos.html?type=privacy_policy';
    policy.textContent = 'Política de Privacidade';
    details.append(more, purpose, control, policy);
    box.append(copy, actions, details);
    document.body.append(box);
    if ('ResizeObserver' in window) {
      noticeSize = new ResizeObserver(() => {
        const bottom = parseFloat(getComputedStyle(box).bottom) || 0;
        const space = Math.ceil(box.getBoundingClientRect().height + bottom + 8);
        document.documentElement.style.setProperty('--ville-cookie-space', space + 'px');
      });
      noticeSize.observe(box);
    }
  }

  if (blocked() || !phone) return;
  const saved = read(consentKey);
  if (saved?.at <= Date.now() && saved.at > Date.now() - 180 * day) choice = saved.value;
  if (choice === 'accepted') start();
  else if (choice !== 'rejected' && isHome) preferences();

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.textContent = 'Preferências de medição';
  settings.style.cssText = 'display:block;margin:12px auto;padding:6px 9px;font:inherit;background:transparent;color:inherit;border:1px solid currentColor;border-radius:6px';
  settings.onclick = preferences;
  (document.querySelector('footer') || document.body).append(settings);

  window.VilleAds = { contact };
  // Run before the mobile experiment's handler so it retains both source and reference.
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || !started || choice !== 'accepted') return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    if (url.origin !== 'https://wa.me' || url.pathname !== '/' + phone) return;
    anchor.href = contact(url).href;
  }, true);
})();
