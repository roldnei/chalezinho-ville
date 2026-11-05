# Homologação DEV — 2026-11-05-2220-UTC

## Ambiente e veredito

- Início: 05/11/2026, 19h20 (Brasília). Roteiro: `docs/qa/dev-e2e/README.md`, `MATRIZ.md` e `MODELO-RELATORIO.md` na base `741e3c8a9b0d4edb0527b69828341b579b4e4c26`.
- Prévia Vercel autorizada: `chalezinho-ville-jg7qzrugb-roldneicosta-4140.vercel.app`, estado READY, commit servido `3dc9e9c66af1dcde98cf9fa492081828c04399d0` da branch `fix/cancellation-policy-integrity-20261105` (metadados do deployment). Perfil servido `checkout-development`, `environment: development`.
- Supabase DEV `pxfqmnhqodqyaaqeyjgr`, projeto `chalezinho-ville-finance-dev`, estado ACTIVE_HEALTHY. Funções observadas: `booking-engine` v79, `guarantee-preview` v16, `pagbank-webhook` v13 e `pms-operations` v17. Não foi provado que cada chamada de uma jornada autenticada alcançou essas versões.
- O código aponta o PagBank para `https://sandbox.api.pagseguro.com`; o banner do checkout indica sandbox. Sem transação nem consulta autenticada ao provedor nesta rodada, o destino efetivo da cobrança não foi confirmado.
- Navegador: navegador embutido Chromium, viewport móvel aproximado de 465 px. Não houve sessão autenticada, desktop, WebKit ou medição formal de toque/teclado. A correção local `5658a1d` não estava no checkout inicial e não foi retestada.
- **Veredito: BLOQUEADO.** Na matriz de 41 casos: 1 FAIL, 37 BLOCKED, 3 NOT_RUN, 0 PASS ponta a ponta. Todos os P0 permanecem fora de PASS. A inspeção local e os trechos de UI observados não homologam checkout, PMS ou sandbox.

## Execução observada

1. A prévia abriu no navegador após login Vercel feito pelo usuário. Ville Moments → Chalés → Reserva CH1 navegou corretamente. A busca sem check-in mostrou “Escolha a data de entrada.”
2. Às 19h aproximadamente, foi criado por SQL no Supabase DEV o imóvel sintético `QA-DEV-20261105-2220` (apelido “Imóvel QA DEV 20261105”), com taxa de limpeza fictícia de R$ 90 e caução fictícia de R$ 500. A conexão Supabase foi usada apenas no projeto DEV indicado. Foi comprovado: 0 integrações, 0 fontes de calendário e exportação automática desabilitada. Nenhuma reserva ou cobrança foi criada.
3. O imóvel apareceu no seletor da página de reserva. A busca de 17 a 19/11/2026, 2 hóspedes, mostrou “0 opções disponíveis”, “Tarifa indisponível” e botão “Indisponível”. O backend de busca lê preço da API `/api/pricelabs-availability`, inclusive no DEV, e não há tabela de preços própria configurável no cadastro. Achado `DEVQA-2026-11-05-2220-UTC-001`.
4. Os três chalés ativos existentes no DEV têm 3 integrações e 2 fontes de calendário ativas cada um. Por isso não foram usados para escrita nesta rodada. O registro histórico de 29/09 descreve transações em backend isolado e testes de interface com respostas simuladas; não demonstra isolamento da sincronização externa para novas reservas nesta prévia.

## Comandos locais

- `npm run check`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: interrompido ao pausar a rodada, sem resultado conclusivo. Não contar como PASS.
- `npm run test:browser`: BLOCKED por infraestrutura. Os 105 casos falharam ao iniciar o Chromium porque o executável do Playwright não estava instalado; não são 105 falhas do produto.
- Roteiros adicionais de custos, recibos e OCR: não executados nesta rodada.

## Bloqueios, limpeza e encaminhamento

- Sem tabela de preços por imóvel e sem preço configurável para o imóvel QA; checkout não avança. A Work deve implementar tabela própria por imóvel, exigida no cadastro inclusive quando PriceLabs estiver vinculado, e definir precedência/fallback antes do reteste.
- Sem contas A/B/C, administrador, anfitrião, equipe e caixa de e-mail de teste preparada nesta sessão. Fluxos autenticados, permissões e envio de mensagens ficaram bloqueados.
- Sem pagamento sintético iniciado pelo PMS ou pelo checkout; Pix, cartão, estornos, caução e conciliação no PagBank não foram executados. **Estornos iniciados no PMS e confirmados no PagBank: nenhum** para reserva, experiência ou pacote.
- O imóvel QA permanece como fixture identificada para a Work, sem integrações e com exportação desabilitada. Removê-lo após o reteste, quando for seguro. Não ficaram bloqueios de datas, contas, cobranças ou notificações criados por esta rodada.
- Nenhuma alteração de código, merge, deploy de produto, política global, produção ou canal externo foi realizada. Os relatórios contêm apenas evidência sanitizada.

Ver [COBERTURA.md](COBERTURA.md) e [ACHADOS.md](ACHADOS.md).
