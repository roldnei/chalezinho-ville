# reCAPTCHA no checkout PagBank

O checkout gera um token reCAPTCHA Enterprise por tentativa, no clique de pagamento. O servidor verifica token, ação, domínio e pontuação mínima de 0,5 antes de criar reserva, bloquear datas, tokenizar o cartão inicial ou enviar o pedido ao PagBank. A proteção cobre Pix e cartão na reserva e nas cobranças adicionais. A consulta de cobranças já abertas continua disponível.

## Configuração em DEV

1. No Google Cloud, habilite a API reCAPTCHA Enterprise e crie uma chave **Website · Score** de teste para `chalezinho-ville-git-dev-recaptcha-roldneicosta-4140.vercel.app`. Mantenha a validação de domínio habilitada.
2. Crie uma API key de servidor restrita à API reCAPTCHA Enterprise. Use uma chave separada para DEV.
3. Cadastre `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_API_KEY` e `RECAPTCHA_ALLOWED_HOSTS` em Edge Functions → Secrets do projeto Supabase DEV. O último aceita domínios exatos separados por vírgula, sem esquema ou barra. Apenas a site key é devolvida pelo endpoint de configuração.
4. Abra a prévia da branch `dev/recaptcha` pelo domínio cadastrado. O ambiente Vercel Preview desta branch usa `VILLE_CHECKOUT_RECAPTCHA_PREVIEW=true` para direcionar a configuração e a criação de pagamentos à função DEV `booking-engine-recaptcha`. As demais prévias continuam usando a função habitual.
5. Com dados sintéticos no PagBank Sandbox, confirme que um token aceito permite continuar e que token ausente, expirado ou repetido e falha no Google interrompem o pagamento. A implantação DEV não usa as chaves públicas de teste do reCAPTCHA clássico.

Sem configuração completa, a função recusa criar pagamentos. Antes de uma publicação futura, configure credenciais específicas para o domínio de produção e confirme a homologação PagBank. O perfil público de consulta por WhatsApp é separado do checkout.

## Evidência de homologação

No PR #16, commit `893b5f84e1e592b8504b7c820d024275dd6716f3`, 48 testes automatizados passaram. Em 09/11/2026, o servidor DEV aceitou tokens reais do Google nas ações `checkout_payment` e `post_booking_payment`. O teste parou nos identificadores fictícios de cotação e cobrança. Tokens inválidos retornaram HTTP 403 com `checkout_captcha_rejected` nas duas rotas. Nenhuma cobrança foi criada.

O PagBank confirmou a triagem dos logs do Sandbox no chamado 1476421701. O aceite de Integrações ainda é necessário para liberar a integração financeira em produção.

## Preparação do domínio público

A atualização parte do commit `47a5e5cfc66153dbbfa9d0f408fd66c39ca7a950`, publicado em `chalezinhoville.com.br`. A prévia padrão mantém o perfil de consulta por WhatsApp, com Feelings desativado. O script do Google só é solicitado ao iniciar um pagamento pelo checkout isolado com a proteção habilitada.

1. No Google Cloud, prepare um projeto para produção e uma chave de site baseada em pontuação com o nome **Chalezinho Ville Checkout PROD**. Cadastre `chalezinhoville.com.br` na lista de domínios e mantenha a verificação de domínio habilitada. A chave DEV permanece separada.
2. No projeto Google Cloud de produção, crie uma chave de API de servidor restrita à **reCAPTCHA Enterprise API**. Guarde o valor em um cofre de segredos e preencha os segredos do projeto Supabase de produção apenas na janela de publicação autorizada.
3. Use `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_API_KEY` e `RECAPTCHA_ALLOWED_HOSTS` na Edge Function do checkout. Defina o último como `chalezinhoville.com.br`, pois `www.chalezinhoville.com.br` redireciona para o domínio principal na configuração atual. O cliente recebe somente a chave de site. A chave da API fica no servidor.

## Condições para liberar o checkout financeiro

- Obtenha o aceite do PagBank e confirme as credenciais próprias de produção. A implementação de pagamentos desta base ainda usa `pagbank_sandbox` nas rotas de criação, consulta e conciliação. A proteção do reCAPTCHA está preparada, e o perfil de produção continua a bloquear o checkout público até que o fluxo do provedor de produção seja implementado e validado.
- Revise o perfil Vercel, os segredos e os destinos de API, o webhook, as permissões e a conciliação para o projeto Supabase de produção. Valide primeiro em prévia isolada, preservando Pix, cartão, pagamentos pós-reserva e as regras existentes de garantia e estorno.
- Verifique token válido, inválido, ausente, vencido, reutilizado e indisponibilidade do Google antes de autorizar a publicação. Qualquer teste com transação real requer autorização própria.
- Para voltar ao atendimento por WhatsApp em caso de regressão, restaure o deployment aprovado anterior e confirme o perfil de consulta. Revise cobranças já iniciadas no PagBank antes de alterar o processamento ou a conciliação dessas cobranças.
