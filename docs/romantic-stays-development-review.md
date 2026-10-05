# Estadias com experiências — avaliação, implementação e testes

Atualizado em 5 de outubro de 2026 após login e testes autenticados.

## Ambiente e preservação

- Repositório `roldnei/chalezinho-ville`, branch isolada `feature/romantic-stay-offers`.
- Código final desta rodada: `4534b1a59755c6f86811b3bc655ce0917baef36d`.
- Preview READY: https://chalezinho-ville-rl8vg5qql-roldneicosta-4140.vercel.app/ — deployment `dpl_Cu7tCo751CeYmjDn2eDC4FHNwjZL`, sem destino de produção. Exige acesso pela Vercel.
- Banco exclusivo `chalezinho-ville-finance-dev`, referência `pxfqmnhqodqyaaqeyjgr`.
- Migrações DEV: `20261005201531_romantic_stay_offers`, `20261005203843_experience_service_day_capacity` e `20261005225000_settled_experience_credit`.
- Funções DEV: booking-engine v45; pms-operations v12. Autenticação existente preservada.
- Produção não foi alterada. Lançamentos financeiros e contratos anteriores não foram reescritos.

As jornadas públicas e autenticadas foram percorridas em https://chalezinho-ville-gmmyquwng-roldneicosta-4140.vercel.app/ com os serviços DEV. A segunda compra já utilizou booking-engine v45. As últimas correções de interface também passaram pelos testes locais e build; a navegação no Preview final parou na proteção de login da Vercel. As capturas autenticadas registram a jornada anterior, não uma inspeção visual completa do novo deployment.

## Avaliação revalidada

Código, banco e telas confirmaram o motor de diárias PriceLabs com tarifas, limpeza, experiências e pagamentos; catálogo vinculado a imóveis; preparação antes genérica; conteúdo público parcialmente fixo e ausência de oferta completa desde a primeira cotação. Comodidades, documentos versionados, cobrança, caução e estornos existentes foram reaproveitados. O login agora permitiu verificar visualmente PMS, cadastro, área do hóspede, compra e financeiro.

## Implementação

- Home, imóvel, comparação e reserva oferecem **Com experiência incluída** e **Somente hospedagem**. A opção acompanha datas, imóvel, preferências e retomada. Duas noites são aceitas conforme disponibilidade e regras; não existe mínimo geral de três noites.
- PMS integrado: pacotes com fotos, componentes, quantidades, frequência, escolhas, imóveis, antecedência, capacidade, estoque, venda avulsa e uso em ofertas; estadias completas reutilizam esses pacotes e configuram duração, período, fotos, pausa e desconto.
- Prévia explica configurações incompatíveis antes de salvar. Cadastros novos começam pausados.
- Servidor calcula diárias na tarifa escolhida + limpeza + experiências incluídas; aplica o percentual da oferta explicitamente selecionada. Avulsos ficam pelo preço cheio, sem desconto retroativo. Caução fica separada; parcelamento usa o módulo existente.
- Rateio do desconto em centavos preserva o total e a identificação de hospedagem, limpeza e experiências. A composição, preferências, preços e condições são copiados para a reserva e os pedidos; editar o catálogo não altera contratos anteriores.
- Itens incluídos não reaparecem como adicionais cobrados. Área do hóspede e confirmação apresentam contratação e experiências atuais; os aceites versionados continuam disponíveis.
- Eventos geram preparação com checklist por componente, dia de entrega, antecedência, prazo e preferências. Mudanças e retirada de serviço cancelam preparos obsoletos sem apagar histórico.
- Corrigidos três problemas observados nesta rodada: cobrança adicional recém-criada invisível até recarga; cartão oferecido abaixo do mínimo de R$ 5,00; experiência inicial sem vínculo financeiro com seu item contratado. Novos lançamentos possuem esse vínculo e validam a soma antes de enviar a cobrança ao provedor.
- Cobranças adicionais já pagas deixam de bloquear um crédito de experiência por serem tratadas como pendentes. Cobranças realmente pendentes e atribuição ambígua continuam bloqueadas. Nenhum lançamento antigo foi adivinhado ou modificado.
- Ajustados contraste/navegação do editor, apresentação dos prazos de preparo e identificação de pagamentos sandbox no financeiro.

## Evidências obtidas

**245 testes automatizados aprovados**, typecheck, sintaxe e build DEV aprovados. JSDOM e PGlite são simulações, não homologação do provedor.

| Cenário | Resultado e tipo de evidência |
| --- | --- |
| Home e página individual | Navegador real: oferta evidente e imóvel preservado ao reservar |
| Duas noites e tarifas | Navegador/API: 10–12/11/2026; tarifas reembolsável e não reembolsável calculadas; datas ocupadas corretamente indisponíveis |
| Somente hospedagem e troca de opção | API real e UI simulada: sem inclusões automáticas nem desconto; preços anteriores removidos enquanto recalcula |
| Cadastro no PMS | Navegador + banco: criada `[DEV] Cadastro de QA — pausado`, Ville Amore, pacote existente, mínimo de duas noites, máximo flexível e 5%; permaneceu pausada |
| Alterar desconto | PMS real: 10%, desativado e retorno a 5%; banco e novas cotações conferidos |
| Pacote antes do pagamento | API real: avulso sem desconto; item incluído reenviado não duplicou a cobrança |
| Compra completa | PagBank sandbox real: Signature R$ 1.518,95 em 6x, reserva `82501E85B9` confirmada |
| Avulso depois do pagamento | PagBank sandbox real: café R$ 5,00 em 1x; total atualizado R$ 1.523,95; desconto original permaneceu R$ 79,95 |
| Compra após correção financeira | PagBank sandbox real: Amore R$ 1.256,66 em 1x, reserva `5BD966165D` confirmada; experiência vinculada ao pagamento por R$ 0,95 |
| Documentos | Navegador e banco: quatro aceites por compra; cancelamento v1.2, hospedagem v1.1, regras v1.1 e privacidade v1.0 |
| Preparação | Navegador + banco: checklist de três componentes românticos, preparo do café e prazos; geração ocorreu por eventos |
| Crédito de serviço não prestado | PMS/API/banco: crédito de R$ 0,95 calculado e aprovado; item e preparo cancelados; reserva permaneceu ativa |
| Alteração de datas/imóvel e catálogo | Banco DEV e PGlite: contratos preservados, preparos anteriores cancelados e novos criados; frequência contratada não muda com o catálogo |
| Login, retomada, recarga, cliques | Login real e compra autenticada; UI simulada cobre preferências obrigatórias, retomada e bloqueio durante recálculo |
| Indisponibilidade/antecedência/capacidade | API e Postgres simulado: rejeições reais e ocupação por dia de serviço |
| Responsividade | Público no navegador desktop em largura móvel por iframe e testes de UI; não equivale a aparelho físico. Revisão visual autenticada móvel final ainda pendente |

O café foi temporariamente alterado para R$ 5,00 no DEV para atingir o mínimo do cartão e testar pagamento avulso. Foi restaurado para R$ 1,00 no PMS. O pedido pago preservou seu preço contratado de R$ 5,00. A oferta principal terminou ativa com 5% habilitado.

## Preço demonstrativo conferido

Signature, 10–12/11/2026, dois hóspedes, tarifa não reembolsável:

| Componente | Valor |
| --- | ---: |
| Hospedagem na tarifa | R$ 1.307,90 |
| Limpeza | R$ 290,00 |
| Pacote incluído de teste | R$ 1,00 |
| Total antes do desconto | R$ 1.598,90 |
| Desconto de 5% | R$ 79,95 |
| Total antes de juros | R$ 1.518,95 |
| Desconto de 10%, sem avulso | R$ 1.439,01 |
| Desconto desativado | R$ 1.598,90 |
| Somente hospedagem e limpeza | R$ 1.597,90 |

Rateio de 5%: desconto de R$ 65,40 na hospedagem, R$ 14,50 na limpeza e R$ 0,05 na experiência. Pacotes de R$ 1,00 são dados de QA, não preços comerciais aprovados. Não foram inventados vinho, queijos ou frutas que não constam da composição cadastrada.

## Estornos: pendência externa concreta

O cancelamento integral da reserva `82501E85B9` calculou R$ 1.523,95, incluindo os dois pagamentos, conforme a política aceita. A aprovação chamou o PagBank sandbox. O provedor retornou **40008**, serviço temporariamente indisponível. Depois de consultar ambas as cobranças e conferir devolução zero, uma única retomada da mesma operação retornou **40005**, chave em uso. A solicitação permaneceu pendente, sem nova chave e sem devolução fictícia.

O crédito parcial da reserva `5BD966165D` calculou exatamente **R$ 0,95**, valor líquido contratado. Sua aprovação retirou a experiência e cancelou o preparo por evento. O PagBank sandbox também retornou **40008**. A devolução financeira continua pendente; a hospedagem permanece ativa.

**Nenhum desses estornos foi confirmado pelo provedor.** Retomar pela conciliação existente quando o PagBank permitir; não criar uma nova operação nem marcar sucesso manualmente. A homologação de estorno integral/parcial não está concluída.

## Preservação e limites restantes

Após QA: 17 reservas, 18 pagamentos, três produtos, seis pedidos de experiências e 20 tarefas no DEV. As reservas e os pagamentos anteriores foram preservados. Duas reservas anteriores desta implementação foram simulações identificadas e canceladas; duas novas reservas nesta rodada receberam pagamentos sandbox reais. Os três pagamentos novos são exclusivamente sandbox.

Pendente: conciliação dos estornos acima; upgrade com pagamento sandbox nesta rodada; confirmação final de Pix; inspeção visual da última revisão após login Vercel, especialmente PMS móvel; aparelhos físicos. O BIN de teste deixou disponíveis 1–6 parcelas após consulta; 7–12 com juros não foram homologadas com esse BIN. Uma foto preexistente do catálogo retornou 404 e não foi substituída por imagem inventada.

O link temporário que dispensaria login Vercel foi bloqueado pela revisão automática por ampliar o acesso ao deployment. A proteção permaneceu ativa. O endereço de Preview pode ser aberto com a conta autorizada da Vercel.

## Demonstração repetível

1. PMS → **Pacotes de experiências**: editar pacote existente, componentes e escolhas realmente entregáveis.
2. **Estadias completas** → **Nova estadia completa**: nome, descrição, imóveis e pacote existente; usar a prévia; salvar pausada; ativar quando a configuração comercial estiver conferida.
3. Na oferta `[DEV] Chegada romântica`, alterar percentual ou desmarcar **Aplicar desconto**; salvar. Consultas novas mudam, contratos antigos permanecem iguais.
4. Home ou imóvel → **Com experiência incluída** → datas → tarifa → resumo com inclusões/desconto → pagamento de teste e aceite dos documentos.
5. **Minhas reservas**: conferir contratação e comprar um pacote avulso pelo preço cheio. PMS → **Operação**: conferir itens, data de entrega, prazo e responsável.
6. Para as reservas de QA desta rodada, consultar os casos pendentes no financeiro. Não considerar o estorno concluído enquanto a conciliação mostrar zero confirmado.
