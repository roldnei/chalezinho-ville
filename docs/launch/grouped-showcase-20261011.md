# Vitrine agrupada por período — 11/10/2026

Implementação em DEV na branch `feature/staged-whatsapp-launch`, após reconferir branches, projetos Supabase e deployments Vercel. Base remota anterior `01fe852c`; código final de interface `9a6560fb7cfd65296f7fadabb063013b2e230207`, deployment preview `dpl_4HLn69gaiYDASEijWvnj2vkt7mAr`.

Prévia: https://chalezinho-ville-ik5r0ccen-roldneicosta-4140.vercel.app/index.html?view=site#estadias-completas

## Comportamento

- Cada coluna corresponde a entrada, saída e hóspedes. Datas aparecem uma vez no cabeçalho da coluna.
- Sempre três linhas na ordem: Ville Signature, Ville Essenza, Ville Amore. Cada opção com preço válido tem **Quero estes dias** e **Assistir no Ville Moments**, preservando exatamente chalé, datas, hóspedes, oferta, tarifa e total consultado.
- Deslize horizontal, setas no computador e teclas esquerda/direita avançam entre períodos. Filtros de duas/três noites agem na coluna inteira. Há rolagem vertical normal para acessar todas as linhas no celular.
- Fotos reais inspecionadas: piscina `assets/01-piscina.webp` para Signature; hidro `assets/04-banheira-petalas.webp` para Essenza; hidro do catálogo Amore `assets/03-banheira-petalas-compartilhada.webp`. Não foram geradas ou apagadas fotos. Ville Moments inicia a oferta pela mesma foto de piscina/hidro e preserva a galeria e publicações existentes.
- Linha sem opção validada não mostra preço nem permite comprar uma oferta inexistente. Informa ausência de oferta, falha de consulta ou mínimo de noites, conforme resposta do motor, e oferece consulta de outras datas.

O servidor agora completa os pares disponíveis em cada período escolhido: a antiga curadoria por chalé podia deixar de fora um chalé disponível só por ter preço maior que outras datas. Continua usando o motor existente para disponibilidade, mínimo e cotação sem persistir reservas/quotes. Não cria fórmula de preço no navegador. Cache versionado para `showcase-v6`.

Resposta real: **nove períodos / 20 opções válidas**, com sete espaços sem oferta por ocupação real. Exemplos 16–18 e 17–19/10 com os três chalés disponíveis. 12–15/10 preserva três noites e mostra somente Amore disponível. Regras de calendário não foram alteradas para preencher linhas.

## Evidências

- 462 testes completos aprovados; 26 testes afetados aprovados antes da inspeção visual, typecheck, check JS e build WhatsApp DEV aprovados. Dois novos testes cobrem completar pares elegíveis e agrupamento/ordem/contexto/fotos/linhas indisponíveis.
- API real: todas as 20 opções recalculadas em consultas novas com total idêntico ao feed, experiências vazias e nenhum `quote_id` persistido.
- Navegador em nuvem: comparação no computador, avanço de uma coluna, filtros e Ville Moments do Essenza em 17–19/10 com R$ 1.729,70 e foto de hidro; navegação inferior presente. Ajuste visual posterior manteve cabeçalhos dentro das colunas, evitando herdar o cabeçalho absoluto global do site.
- Conteúdo real via QA em iframe nas larguras 390 e 320: três linhas em ordem, navegação inferior e sem overflow horizontal do documento. Em 320, clique em Amore 17–19/10 chegou à consulta com as datas preservadas. **Não são testes em aparelhos físicos.**
- Pela terceira linha em 320 px: Amore 17–19/10, total R$ 1.683,50, escolha explícita da tarifa e preparação do WhatsApp. Mensagem decodificada idêntica ao resumo; alternativa de copiar presente.
- Sem mensagem enviada pelo WhatsApp. Sem teste financeiro novo. Barreiras e checkout completo continuam preservados e cobertos pela suíte.
- Contagens DEV antes/após consultas: reservas 30, pagamentos 34, quotes 346, bloqueios PMS 2, outbox 136 e holds/pending payment 0 — sem mudança.

Arquivos de apoio: `grouped-showcase-real-feed-20261011.json`, `grouped-showcase-real-verification-20261011.json`, `grouped-showcase-tests-20261011.tap`; capturas `evidence/vitrine-agrupada-*`.

## Ambientes, preservação e produção

Somente engine **DEV** `pxfqmnhqodqyaaqeyjgr` passou de versão 66 para 67, alterando os dois módulos de vitrine/cache; demais arquivos remotos da função preservados. Sem alteração de schema, catálogo, permissões ou rotinas financeiras nesta etapa. Fotos, publicações, reservas e configuração comercial permanecem preservadas.

PROD `irxsaladqhbzhkoaclxy` não recebeu nenhuma alteração. Vercel produção READY permaneceu `dpl_GfCE3VYLNmxwSorGBUPYQjU6ys41`. Não houve promoção. Acesso ao preview protegido usou link temporário da integração Vercel; proteção não foi desativada.

Para publicação futura, revisar este diff junto aos relatórios `staged-whatsapp-20261011.md` e `stay-only-showcase-20261011.md`; homologar pendências de PMS/aparelhos físicos e aprovar a candidata antes de aplicar funções/assets/configuração PROD. Nenhuma migration nova é necessária especificamente para o agrupamento.

Retorno deste ajuste em DEV: restaurar assets do commit anterior e os dois módulos de vitrine/cache da versão 66 registrados no repositório. Não restaurar indiscriminadamente versões financeiras antigas. Em PROD, usar somente o deployment e funções previamente registrados na publicação autorizada; preservar trava WhatsApp e todos os dados.
