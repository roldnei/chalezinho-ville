# Homologação real do lançamento parcial — 11/10/2026

Estado: **DEV validado parcialmente; produção NÃO publicada.** Este relatório complementa os relatórios anteriores e substitui suas afirmações de validação somente nos cenários listados aqui.

## Versões e isolamento

Branch `feature/staged-whatsapp-launch`; código comercial até `64cc312d` (inclui primeiro Trip, fotos distintas, fallback de cópia, isolamento da consulta, erros explícitos no PMS e cache da vitrine). HEAD remoto conferido antes de cada envio, sem force push. Checkout completo preservado na mesma base; prévia independente `https://chalezinho-ville-fbesamini-roldneicosta-4140.vercel.app/` (ac649e45).

Supabase DEV `pxfqmnhqodqyaaqeyjgr`: booking-engine v72, villegram-content v25. Supabase PROD `irxsaladqhbzhkoaclxy`: somente leituras de estrutura/configuração e contagens nesta execução. Nenhuma promoção, migration, variável, função ou dado PROD foi alterado.

## Correções realizadas

- Primeiro Trip preservado durante carregamento do feed; seletores Signature, Essenza e Amore sincronizam nome, foto e destino. Controles inferiores ajustados sem sobrepor a navegação. Essenza usa foto da própria página com cama e hidro. Amore usa o interior (`assets/amore.webp`), conforme escolha explícita do proprietário; não se afirma que a hidro esteja visível nessa foto.
- Consulta WhatsApp sem alternativas de tarifa, experiências ou ações redundantes. Resumo perde valores antigos durante recálculo. Cópia tem seleção manual imediata e limite de espera da área de transferência.
- Configuração da consulta não depende da tabela de meios de pagamento.
- PMS falha explicitamente quando não consegue ler dados financeiros ou disponibilidade; não apresenta ausência falsa de registros e não cria reserva manual com leitura incompleta.
- Administração de imóveis e suas configurações continua autenticada no modo de lançamento; configurar pagamentos públicos continua bloqueado.
- Publicação de hóspede aprovada pode aparecer no feed DEV. Edição retorna à moderação. Produção continua sem liberação social.
- Vitrine sem cache CDN intermediário: evita manter uma oferta pausada/reativada por até um minuto. O cache do backend vinculado ao catálogo permanece.

## Matriz observada

| Jornada | Resultado e limites |
|---|---|
| Primeiro Trip / três seletores | Aprovado em navegador com viewports móveis e desktop; fotos e links conferidos. Foto interna do Amore autorizada pelo proprietário. Sem novo teste físico Android. |
| Home → chalé → datas → resumo | Aprovado em DEV; somente Escapada, total, datas e hóspedes; sem login obrigatório. |
| Vitrine → Moments → consulta | Aprovado em navegador: Essenza, 16–18/10/2026, 2 hóspedes, R$ 1.619,05 preservados até o link WhatsApp. |
| WhatsApp | Abertura da página de destino observada em execução anterior desta homologação; telefone e mensagem conferidos. Nenhuma mensagem enviada. Cópia manual de contingência exercitada. |
| Datas ocupadas / alteração / reload | Observado sem disponibilidade em 09–11/11; troca de hóspedes e reload recalculam. Não reutiliza preço anterior. |
| Feriado / mínimo | 31/10–02/11 recusado por mínimo de três noites; 31/10–03/11 aprovado, totais CH1 2600, CH2 2087, CH3 2096. |
| Checkout completo preservado | Navegador: 19–21/10, Signature, tarifas inicialmente sem seleção, login sem perder composição, aceites separados. Cartão em 12x de R$154,28, total R$1851,39 e juros estimados R$206,59 visíveis antes de dados do cartão. Não enviado pagamento. |
| PMS fotos / comodidades | Upload real de imagem fictícia, compressão para WebP, salvamento e leitura no banco; 6→7→6 fotos. Comodidade fictícia salva e removida; configuração original restaurada. |
| PMS pausa de oferta | Oferta Escapada pausada pela UI; vitrine sem cards e mensagem de pausa observada; reativada. Configuração comercial original restaurada, hash `61c6a50f86ae4cf2c6839273dbe06fbe` excluindo status/updated_at. Demais cinco ofertas permaneceram pausadas. |
| Hóspede / foto / moderação | Foto real de teste: rascunho → envio → admin aprova → público vê → edição remove publicação pública → admin arquiva → hóspede recebe notificações. Registro `7dc4610c-3027-4d6f-9ebe-3ea99b962795`, agora arquivado. |
| Vídeo, falha de upload/rede e isolamento social completo | Não concluídos nesta execução. Social/Feelings não liberados em PROD. |
| PMS migração / reservas existentes PROD | Bloqueado para publicação; dependências incompatíveis descritas abaixo. |
| Pagamento/estorno novo | Não executado nesta rodada de lançamento WhatsApp. Histórico de testes financeiros não equivale a nova confirmação do provedor. |

## Preços comparados no Airbnb real

Mesmas datas e dois hóspedes, observados em navegador:

- Signature 19–21/10: R$1.419 no site e Airbnb.
- Essenza 17–19/10: site R$1.531,65; Airbnb R$1.533,65, diferença R$2. A antiga configuração de limpeza R$292 versus a nova regra explícita R$290 é uma explicação possível, não confirmação da configuração privada Airbnb. Não foi alterado Airbnb/Booking/PriceLabs nem compensado valor silenciosamente.
- Amore 17–19/10: R$1.491,75 em ambos.

Não se declara equivalência geral de todos os dias.

## Evidência de ausência de efeitos financeiros

Chamadas reais em DEV aos endpoints `public-consultation` e alias `consult_` no engine: `start_payment`, `hold`, `create_reservation`, `start_post_booking_payment`, `same_day_request` retornaram 403 `consultation_operation_not_allowed`. Cotação repetida com `persist=true`, corpo/action divergentes, preço forjado e cabeçalho DEV retornou `quote_id=null`, apenas Escapada e preço recalculado R$1531,65, limpeza 29000 centavos.

Contagens após repetição: 30 reservas, 34 pagamentos, 350 quotes, 2 pms_calendar_blocks, 136 notification_outbox. Quotes eram 346 antes do teste deliberado do checkout completo; os quatro adicionais são daquele fluxo, não das consultas WhatsApp. Nenhuma reserva, pagamento, bloqueio ou notificação financeira nova foi criada pelas consultas. Artefatos locais: `outputs/launch-api-checks-20261011.json` e `outputs/launch-api-repeats-20261011.json`.

O bloqueio em PROD com cabeçalho DEV falsificado foi exercitado no handler transpilado e no teste de trigger em PGlite, não mediante pagamento em PROD. O backend novo ainda não foi implantado lá: não declarar proteção real PROD homologada.

## Testes automatizados e evidências visuais

487/487 testes completos passaram em ba79ae0c, zero falhas (`outputs/launch-tests-20261011-current.tap`); TypeScript do engine e villegram-content passou. Alterações posteriores: foto do Amore verificada por sintaxe/navegador e cache da vitrine com 6/6 testes específicos. Testes com fixtures/JSDOM/VM/PGlite são complementares, não jornada real.

Capturas reais na pasta outputs deste chat:
- launch-final-essenza-distinct-412.png
- launch-vitrine-moments-whatsapp-412.png
- launch-paused-live-360.png
- launch-checkout-preserved-12x.png
- launch-pms-upload.png
- launch-guest-approved-public.png / launch-guest-decisions.png
- launch-holiday-minimum-360.png / launch-occupied-360.png

Viewports conferidos pelo DOM: 360×800, 412×915 e 1440×1000. Capturas antigas da conversa e mockups não foram usados como prova desta execução.

## Bloqueio para produção e retorno seguro

PROD contém 47 reservas, 52 pagamentos, 25 garantias, 21 tarefas PMS e nove integrações. Faltam `stay_offers`, `stay_showcase_cache`, `property_calendar_sources`, `villegram_publications`, `guarantee_refunds` e RPC `check_in_with_guarantee(uuid,uuid,text)`; também há diferenças de colunas de garantias/incidentes. O novo painel consulta essas estruturas. Implantar todo o engine quebraria a leitura de reservas/financeiro e operações existentes. A lista de operações permitidas no lançamento ainda não contempla a compatibilidade de todas as operações administrativas de reserva do backend antigo.

A migration original de ofertas mistura estruturas comerciais com contratos/rotinas financeiras; a de calendário cria fontes vazias. Não foram aplicadas indiscriminadamente. Os seis links legítimos de calendários DEV foram identificados e os IDs Airbnb comparados às integrações PROD, mas não foram copiados. Valores/tokens privados não constam deste relatório.

Antes de promover: preparar migração comercial mínima e caminho compatível de PMS/financeiro existente; testar com estrutura equivalente à PROD; snapshot dos objetos afetados; restaurar apenas configurações legítimas, nunca usuários/reservas de QA; conferir calendários, limpeza e regras; validar guardas reais no ambiente publicado. Essas etapas continuam pendentes.

Retorno frontend identificado: deployment `dpl_GfCE3VYLNmxwSorGBUPYQjU6ys41`, commit `9bc9e0e7d3b9d18bb643e724f999ff37f64bc2fc`. Reconfirmar alias oficial imediatamente antes de promover. Reverter frontend sozinho não reverte banco/funções: qualquer futura migration exige backup e reversão próprios. Como não houve mudança PROD, não foi necessário rollback.

## Revalidação da última prévia

Código `64cc312dc299187cafa60c2a776caddda38a6027`, deployment DEV `dpl_5BsjSVdxURUcdfLrD4vxSZNQEqcv`, https://chalezinho-ville-lt1cvk9cc-roldneicosta-4140.vercel.app/ . A pausa foi repetida nesta versão: sem espera de TTL, após concluir a consulta, zero links “Quero estes dias” e mensagem de pausada. A oferta foi reativada e seu hash original restaurado novamente. A foto interna do Amore foi observada a 360×800 na prévia 2f1e6166; captura `outputs/launch-amore-interior-360.png`.

Resultado final da revalidação: 20 opções retornaram na vitrine após reativação; outras cinco ofertas permaneceram pausadas. Captura desktop 1440×1000 `outputs/launch-amore-interior-1440.png` mostra interior, três seletores, botão Conhecer e navegação sem sobreposição. A suíte específica final passou 31/31 (publicações e caches), após as duas últimas correções; nenhuma alegação de nova suíte completa além dos 487 registrados acima.
