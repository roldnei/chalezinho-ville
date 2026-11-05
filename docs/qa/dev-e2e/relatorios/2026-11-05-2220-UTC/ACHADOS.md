# Achados — 2026-11-05-2220-UTC

## DEVQA-2026-11-05-2220-UTC-001 — Imóvel novo sem tabela de preços não chega ao checkout

- Caso: RES-01, RES-02 e ENV-01. Prioridade P0; severidade alta. Estado: NOVO.
- Pré-condição: prévia DEV no commit `3dc9e9c`, imóvel sintético ativo `QA-DEV-20261105-2220`, sem integrações ou calendário externo. Navegador embutido em viewport móvel aproximado de 465 px. 05/11/2026, após 19h20 BRT.
- Reprodução segura: abrir Reserva direta, selecionar o imóvel QA, informar 17–19/11/2026 e 2 hóspedes, consultar. Esperado: uma tabela própria configurada para o imóvel fornece preço e a busca apresenta a tarifa. Observado: “0 opções disponíveis”, “Tarifa indisponível” e botão “Indisponível”. A consulta foi somente leitura; nenhuma reserva ou cobrança foi criada.
- Evidência sanitizada: UI DEV exibiu o imóvel e o estado acima. Banco DEV confirmou 0 integrações, 0 fontes de calendário e exportação desabilitada. Inspeção local do `booking-engine` mostra consulta a `/api/pricelabs-availability` e ausência de preço local; o formulário do PMS não solicita tabela de diárias. Sem HAR ou identificadores financeiros publicados.
- Diagnóstico: alta confiança de lacuna de precificação para imóvel novo sem PriceLabs. A busca do imóvel QA funcionou, mas não havia preço na fonte consultada. Não generalizar o resultado para datas ou imóveis com preço cadastrado.
- Critério de reteste: cada imóvel possui tabela própria persistida e editável no PMS, com preços por período/dia e regras de mínimo; cadastro novo exige configuração antes de oferecer reserva. Quando PriceLabs está conectado, documentar e testar precedência e fallback sem sobrescrever valores do imóvel. Validar no servidor preço em centavos, cotação, aceite, checkout e recibo, mantendo canais reais sem escrita. Adicionar regressões para imóvel sem PriceLabs, com PriceLabs, preço ausente e preço alterado durante a cotação.
- Handoff: Work. Correção/PR/prévia/reteste: pendentes.

## Impedimentos de homologação, não classificados como defeitos do produto

- `DEVQA-2026-11-05-2220-UTC-002` — Ausência de contas e caixa de e-mail sintéticas autorizadas impediu cadastro, papéis, isolamento A/B e PMS. Estado: BLOQUEADO. Preparar identidades e caixa de teste antes do reteste.
- `DEVQA-2026-11-05-2220-UTC-003` — Playwright local sem executável Chromium: 105 testes não iniciaram. Estado: BLOQUEADO. Instalar navegador oficial e repetir `npm run test:browser`; não tratar as 105 falhas como regressões do site.
- `DEVQA-2026-11-05-2220-UTC-004` — Sem reserva paga sintética nem confirmação autenticada do PagBank. Estado: BLOQUEADO. Executar checkout e estorno iniciado no PMS após preço e inventário isolados; registrar solicitado, enviado e confirmado separadamente.
