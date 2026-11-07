# reCAPTCHA no checkout PagBank

O checkout gera um token reCAPTCHA Enterprise por tentativa, no clique de pagamento. O servidor verifica token, ação, domínio e pontuação mínima de 0,5 antes de criar reserva, bloquear datas, tokenizar o cartão inicial ou enviar o pedido ao PagBank. A proteção cobre Pix e cartão na reserva e nas cobranças adicionais. A consulta de cobranças já abertas continua disponível.

## Configuração em DEV

1. No Google Cloud, habilite a API reCAPTCHA Enterprise e crie uma chave **Website · Score** de teste para `chalezinho-ville-git-dev-recaptcha-roldneicosta-4140.vercel.app`. Mantenha a validação de domínio habilitada.
2. Crie uma API key de servidor restrita à API reCAPTCHA Enterprise. Use uma chave separada para DEV.
3. Cadastre `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_API_KEY` e `RECAPTCHA_ALLOWED_HOSTS` em Edge Functions → Secrets do projeto Supabase DEV. O último aceita domínios exatos separados por vírgula, sem esquema ou barra. Apenas a site key é devolvida pelo endpoint de configuração.
4. Abra a prévia da branch `dev/recaptcha` pelo domínio cadastrado. O ambiente Vercel Preview desta branch usa `VILLE_CHECKOUT_RECAPTCHA_PREVIEW=true` para direcionar a configuração e a criação de pagamentos à função DEV `booking-engine-recaptcha`. As demais prévias continuam usando a função habitual.
5. Com dados sintéticos no PagBank Sandbox, confirme que um token aceito permite continuar e que token ausente, expirado ou repetido e falha no Google interrompem o pagamento. A implantação DEV não usa as chaves públicas de teste do reCAPTCHA clássico.

Sem configuração completa, a função recusa criar pagamentos. Antes de uma publicação futura, configure credenciais específicas para o domínio de produção e confirme a homologação PagBank. O perfil público de consulta por WhatsApp é separado do checkout.
