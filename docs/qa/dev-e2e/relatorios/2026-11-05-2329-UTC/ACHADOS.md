# Achados — reteste DEV 2026-11-05-2329-UTC

## DEVQA-2026-11-05-2329-UTC-001 — Chalés ativos sem tabela própria

- **Caso/prioridade/severidade:** RES-01, RES-02, OPS-01; P0, alto. A exigência do produto é que cada imóvel tenha tabela configurável própria, inclusive se estiver vinculado ao PriceLabs. Sem isso, uma falha ou desligamento da integração pode deixar o imóvel sem preço próprio.
- **Pré-condições:** prévia DEV da correção Work; inspeção somente leitura dos três chalés ativos CH1, CH2 e CH3 e do imóvel QA, em 05/11/2026 aproximadamente 20h40 Brasília.
- **Reprodução segura:** consultar no PMS/DEV a configuração de preço próprio dos imóveis ativos, sem alterar integrações ou inventário. Esperado: tabela própria persistida por imóvel e regra explícita de precedência/fallback. Observado: `own_pricing=null` para CH1, CH2 e CH3, apesar de integrações PriceLabs ativas; o imóvel QA possui tabela própria e cota normalmente sem PriceLabs.
- **Evidência:** leitura sanitizada do banco DEV e cotação UI do imóvel QA de 17–19/11 (R$ 676,86 reembolsável, R$ 627,96 não reembolsável). Não se concluiu que as cotações atuais dos chalés ativos estejam erradas; o defeito comprovado é a ausência da tabela exigida.
- **Diagnóstico:** migração/configuração de dados dos imóveis preexistentes ou fluxo de cadastro; confiança alta quanto ao estado persistido. A correção de precificação do imóvel QA funciona, mas não preenche os três imóveis reais. A Work deve validar as tarifas reais com o responsável antes de gravá-las.
- **Aceite:** cada imóvel existente e novo tem tabela própria válida e editável, com feriados/exceções e fallback definido mesmo com PriceLabs conectado. Retestar cotação e reserva em imóvel sintético com integração simulada/desconectada, sem tocar nos canais reais. Criar regressão para cadastro e migração.
- **Handoff:** NOVO; PR/commit de correção, prévia e data de reteste pendentes.

## DEVQA-2026-11-05-2329-UTC-002 — Imóvel de teste sem condições de parcelamento persistidas

- **Caso/prioridade/severidade:** PAY-03, OPS-01; P0, alto. Um imóvel disponível para reserva chegou à etapa de cartão sem opções de parcelas.
- **Pré-condições:** imóvel sintético `QA-DEV-20261105-2220`, criado antes da correção Work; checkout DEV de 24–26/11, hóspede B, 05/11/2026 aproximadamente 20h50 Brasília. Sem dados de cartão reais.
- **Reprodução:** abrir checkout do imóvel sintético e consultar as parcelas para uma cotação válida. Esperado: condições explícitas configuradas no cadastro/PMS e opções retornadas. Observado: UI “Parcelas indisponíveis”; API `installment_options` HTTP 503 `invalid_payment_terms`; registro tinha `features.payment_terms=null` enquanto PMS exibia 12×/6× como padrão visual.
- **Evidência e diagnóstico:** resposta API e leitura do registro DEV sanitizadas. Após atualizar **somente esse imóvel sintético** para 12× máximo, 6× sem juros e juros pagos pelo hóspede, as opções foram oferecidas e uma cobrança 8× foi aprovada. A causa provável é ausência de persistência/validação no cadastro ou um padrão visual não gravado. Como este imóvel foi criado antes da correção, um cadastro novo pelo fluxo atual é necessário para distinguir dado legado de falha ainda ativa.
- **Aceite:** cadastro de novo imóvel exige e grava condições de pagamento válidas, ou o backend usa um padrão documentado e coerente; PMS mostra o que está efetivamente persistido; checkout oferece 1×, 6×, 8× e máximo permitido, com juros e totais conferidos em centavos. Adicionar regressão de imóvel legado sem `payment_terms`.
- **Handoff:** NOVO; PR/commit de correção, prévia e data de reteste pendentes.

## Observações sem classificação de defeito

- O redirecionamento de confirmação das contas criadas por API foi para a prévia antiga configurada; testar o cadastro iniciado pela UI antes de abrir achado de produto.
- Uma tentativa de salvar condições no PMS ocorreu após a sessão administrativa ser substituída pela sessão do hóspede em outra aba da mesma origem. Não atribuir essa falha à tela de edição sem reprodução em sessão administrativa isolada.
- Após o estorno, uma gaveta já aberta no PMS mostrou dados antigos até ser fechada e reaberta; a lista, o banco, o provedor e a busca de disponibilidade já estavam atualizados. Reproduzir isoladamente para classificar eventual problema de atualização da UI.
