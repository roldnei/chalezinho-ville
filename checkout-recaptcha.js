(() => {
  let sdk;
  const unavailable = () => new Error("checkout_captcha_unavailable");

  function load(siteKey) {
    if (!sdk) {
      sdk = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const fail = () => {
          clearTimeout(timer);
          script.remove();
          reject(unavailable());
        };
        const timer = setTimeout(fail, 8000);
        script.src = "https://www.google.com/recaptcha/enterprise.js?render=" + encodeURIComponent(siteKey);
        script.async = true;
        script.onerror = fail;
        script.onload = () => {
          const enterprise = window.grecaptcha?.enterprise;
          if (!enterprise?.ready || !enterprise?.execute) return fail();
          enterprise.ready(() => {
            clearTimeout(timer);
            resolve(enterprise);
          });
        };
        document.head.appendChild(script);
      }).catch(error => {
        sdk = null;
        throw error;
      });
    }
    return sdk;
  }

  async function token(settings, action) {
    const siteKey = settings?.site_key;
    if (!siteKey) throw unavailable();
    const enterprise = await load(siteKey);
    let timer;
    try {
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), 8000); });
      const value = await Promise.race([enterprise.execute(siteKey, { action }), deadline]);
      if (typeof value !== "string" || !value) throw unavailable();
      return value;
    } catch {
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }

  function message(code) {
    return {
      checkout_captcha_required: "A verificação de segurança expirou. Toque em Pagar novamente para tentar.",
      checkout_captcha_rejected: "Não foi possível validar a segurança deste pagamento. Tente novamente em instantes.",
      checkout_captcha_unavailable: "A verificação de segurança está indisponível. Tente novamente mais tarde.",
    }[code];
  }

  window.VilleCheckoutCaptcha = { token, message };
})();
