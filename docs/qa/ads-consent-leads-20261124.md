# Consentimento nas entradas diretas e separação de eventos

Base: produção 753cd58eba6e79e39ec72bc2bd282fb7a66051e8.

## Alterações

- O mesmo aviso aparece na primeira entrada por qualquer página pública que carrega `ads-measurement.js`, inclusive os detalhes de apartamentos renderizados pelo servidor. A escolha existente, válida por 180 dias, continua sendo respeitada; navegar entre páginas não pede novo aceite.
- Texto principal, Aceitar/Rejeitar e detalhes discretos preservados. Detalhamento esclarece a diferença entre abrir o WhatsApp e confirmar reserva.
- Visitas não disparam mais a ação de conversão de visita. `page_view` usa o destino de tag existente e apenas a URL sem query/hash. Nenhuma ação de Analytics ou de Ads é criada por esse evento.
- Abertura do WhatsApp usa apenas a conversão de contato existente, identificada como lead. O helper aceita somente o contato oficial. Uma janela de 30 minutos por aba evita duplicatas de handlers e cliques repetidos; `sessionStorage` preserva a janela nas navegações/recargas e há fallback em memória.
- Rejeitar/revogar não inicia a tag, apaga a origem paga e a janela de deduplicação; revogação após carregamento mantém o comportamento de recarregar a página para interromper futuras solicitações. Privacidade global, exclusão interna e previews continuam bloqueando a tag.
- Oito entradas HTML atualizam a versão do script. O layout e a folha CSS do aviso não foram alterados.

## Validação

`node --test tests/ads-measurement.test.mjs`: 9 cenários passaram, incluindo 11 rotas de entrada, escolhas persistidas, ausência de conversão de visita/compra, URL sem dados pessoais, deduplicação entre páginas, expiração e falha de storage.

Suítes de medição, entrada mobile, apartamentos e Black Friday: **34 testes passaram**. `node --check ads-measurement.js` passou. Build `VILLE_RELEASE_PROFILE=whatsapp node scripts/build-finance-preview.mjs` passou, preservando o perfil público de consulta e a remoção da cópia estática do catálogo de apartamentos. Não houve mudança no CSS nem teste de clique em anúncio real.

O domínio público deve ser conferido após a implantação, tanto para a versão do script quanto para a ausência da antiga conversão de visita. A revisão das metas e a prova de recepção no painel Ads continuam indisponíveis devido ao bloqueio.

## Limites

O painel Ads permanece bloqueado para agentes de IA. Marcar metas como primárias/secundárias, criar conversão de reserva, ativar recursos e estender a campanha não foram executados na conta. O CSV de vigência e as instruções ficam em `docs/marketing/google-ads-vigencia-20261124/`.

Reserva é resultado confirmado pelo PMS, nunca um clique em contato. Não foi criado um evento de compra sem uma ação de conversão válida e integração verificada.
