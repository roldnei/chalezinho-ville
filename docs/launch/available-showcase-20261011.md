# Vitrine: somente chalés disponíveis e variação de fotos — 11/10/2026

Atualização da prévia agrupada documentada em `grouped-showcase-20261011.md`. A regra anterior de três linhas, inclusive indisponíveis, foi substituída a pedido do usuário.

## Resultado

- Cada período contém somente cards com consulta válida devolvida pelo motor existente. Chalés ocupados, sem preço ou incompatíveis com o mínimo de noites não recebem card nem botão desativado.
- A ordem dos disponíveis continua Signature, Essenza, Amore. Um ou dois cards ocupam a coluna inteira, com mais espaço para a foto. Não há posições vazias para os demais chalés.
- Fotos reais inspecionadas visualmente: quatro ângulos de piscina/spa do Signature, incluindo casal com espuma, spa em primeiro plano e chalé ao fundo; dois ângulos de hidro para Essenza e dois para Amore. A rotação segue a ocorrência cronológica de cada chalé, evitando repetição consecutiva do mesmo arquivo. Após percorrer as fotos existentes, o ciclo recomeça.
- Foram evitados arquivos diferentes contendo a mesma fotografia de pétalas. O catálogo histórico já compartilha imagens entre Essenza e Amore; preservada essa compatibilidade. Amore usa a hidro com pétalas e o ângulo da hidro junto à janela no ambiente também presente na sua foto de experiência compartilhada. Não foram geradas fotos, alteradas mídias ou publicações.
- Ville Moments recebe a mesma imagem escolhida para a oferta, sem perder datas, chalé, hóspedes, tarifa ou total. Catálogo, disponibilidade, motores de preços e proteções de consulta/WhatsApp continuam os mesmos.

## Evidência desta atualização

Prévia testada: https://chalezinho-ville-gbdnczcmm-roldneicosta-4140.vercel.app/index.html?view=site#estadias-completas

Commit de código testado: `a5ad944b44e53e72794dc8bc70994b356a0a02a0`.

- Navegador Chrome real remoto, dados reais do DEV: nove períodos, 20 cards válidos, quantidades por coluna **1, 3, 3, 3, 1, 1, 3, 3, 2**. Nenhum `.showcase-unavailable` renderizado. As nove colunas têm a mesma altura; desktop aproximadamente 880 px, conteúdo de 320 px aproximadamente 859 px. A altura segue o conteúdo e a largura; não é uma altura fixa.
- Desktop: conferidos foto de casal no spa, piscina/spa à frente do chalé, hidros, ações e redistribuição do período 12–15/10 com somente Amore. Screenshot: `evidence/vitrine-disponiveis-desktop-20261011.jpg`.
- QA com iframe de largura 390 e 320: sem overflow horizontal do documento. Largura útil de 305 px no teste de 320 com scrollbar. **Não houve teste em aparelhos físicos nem em Safari móvel.**
- Em 320: filtro de duas noites → Signature 16–18/10 → Assistir no Ville Moments → Quero estes dias → consulta. Datas, dois hóspedes e R$ 1.950,70 mantidos; tarifa exigiu escolha explícita; WhatsApp desabilitado antes dessa escolha. Nenhuma mensagem foi enviada.
- 21 testes direcionados passaram: `stay-showcase`, `villegram-escape-feed`, `villegram`. Evidência: `available-showcase-tests-20261011.tap`. `npm run check`, `node --check stay-showcase.js`, `git diff --check` e build `VILLE_RELEASE_PROFILE=whatsapp` passaram; build confirmou alvo development.

## Limites e operação

Alteração somente em JS/CSS da apresentação, cache de assets e teste. Nenhuma função Supabase, tabela, catálogo, calendário, cobrança ou configuração de produção foi modificada nesta atualização. A ausência de efeitos financeiros do fluxo foi validada historicamente nos relatórios anteriores; não foi realizada uma nova comparação SQL antes/depois nesta atualização de apresentação. O PMS e o checkout completo não foram novamente homologados aqui, pois não foram alterados.

DEV continua `pxfqmnhqodqyaaqeyjgr`; PROD continua `irxsaladqhbzhkoaclxy`. Projeto Vercel identificado previamente: `chalezinho-ville`, ID `prj_qXld7h9Z3I7mV9mZKuXJ4yQ1j3dc`. Deployments desta atualização são previews da branch `feature/staged-whatsapp-launch`, com target null. Nenhuma publicação ou promoção em produção.

Para produção: revisar o conjunto candidato e a configuração do lançamento parcial conforme relatório geral; publicação somente após autorização. Para retornar esta mudança visual em desenvolvimento, usar o código anterior `9a6560fb7cfd65296f7fadabb063013b2e230207` ou reverter os commits desta atualização. Não exige migração nem restauração de dados.
