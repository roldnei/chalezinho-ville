# Acesso de hóspedes ao Ville Moments — DEV, 11/10/2026

## Resultado

O perfil de lançamento WhatsApp ocultava `Meu Ville Moments`, a comunidade e suas ações junto com o Feelings. A prévia DEV agora permite homologar as publicações de hóspedes independentemente do checkout e do Feelings. Nenhum conteúdo, mídia, perfil, contrato ou histórico foi apagado.

Código testado: `3578447f26577d97eead45426a49fe680e8a7de1`, branch `feature/staged-whatsapp-launch`.
Prévia READY, sem target de produção: https://chalezinho-ville-iao5utpwt-roldneicosta-4140.vercel.app/conta.html
Deployment: `dpl_BM3zBUieTc6CvJHMUP9u2YS2ui9v`.

Ambientes e projeto conferidos por leitura antes das alterações: DEV `pxfqmnhqodqyaaqeyjgr`, PROD `irxsaladqhbzhkoaclxy`; Vercel `chalezinho-ville`, `prj_qXld7h9Z3I7mV9mZKuXJ4yQ1j3dc`. Não houve alteração de dados/configuração/deployment de produção nem mudança das proteções de ambiente.

## Alterações

- Matriz de recursos explícita: WhatsApp DEV mantém publicação/comunidade para homologação e desativa Feelings. WhatsApp PROD continua com publicação/comunidade/Feelings desativados. Checkout completo DEV preserva todos esses recursos.
- CSS do lançamento respeita os recursos do ambiente, em vez de sempre esconder a aba social.
- A conta privada DEV usa o booking-engine autenticado. A lista de pedidos existentes não passa mais pelo endpoint restrito de consulta pública. O fluxo público de cotação continua usando public-consultation e não ganha operações de pagamento.
- Criar Feelings e a timeline dessa ferramenta não são montados quando `features.feelings=false`. O código, renderização de conteúdo antigo e metadados permanecem preservados.
- Navegação de conta continua alternando entre Meu Ville Moments e Minhas reservas, preservando links diretos de reserva/cobrança.
- QA de layout DEV ganhou a opção Minha conta. Não foi usado para declarar homologação móvel completa.

## Evidências e limites

Browser real em computador, na nova prévia DEV, com autenticação pelo formulário seguro: Minha conta mostrou Meu Ville Moments selecionado, o perfil previamente cadastrado, Compartilhar momento e as abas Assistir, Meus Trips, Atividade, Marcações e Pessoas. Clicar em Compartilhar momento abriu o editor do hóspede, com Adicionar vídeo ou fotos, Nova publicação e Minhas publicações. Nenhum botão Criar Feelings apareceu nessa observação.

A proteção de credenciais do navegador impediu continuar a automação após essas observações. O próximo lote não pôde ser executado com segurança: troca da página QA para Minha conta em largura móvel e envio de uma foto de homologação. Não foi criado um post de teste. Não há screenshot dessa rodada disponível para anexar, e não houve tentativa de contornar a proteção.

66 testes automatizados relacionados passaram: `guest-release`, `public-consultation`, `villegram-community`, `villegram-editor` e `villegram-timeline`. Incluem matriz DEV/PROD, DOM da navegação, Feelings desativado, leitura autenticada de pedidos, upload/retry com fixtures, sanitização de hóspedes, propriedade das mídias, estados de aprovação, permissões/RLS e moderação em PGlite. Esses testes não substituem upload real e aprovação pela interface.

Também passaram `npm run check`, `npm run typecheck`, `node --check launch-ui.js`, `git diff --check` e build `VILLE_RELEASE_PROFILE=whatsapp node scripts/build-finance-preview.mjs`.

Contagens reais DEV, iguais antes/depois da verificação do editor: reservas 30; pagamentos 34; cotações persistidas 346; bloqueios PMS 2; notification_outbox 136; reservas pendentes 0; holds ativos 0; publicações 71. O acesso à conta e ao editor não criou reserva, bloqueio, pagamento ou publicação nesta execução. Contagens agregadas não demonstram por si só ausência de atualização em todos os registros; nenhuma operação de escrita foi acionada pela interface nessa rodada.

## Pendências antes de liberar hóspedes em produção

- Upload real de foto/vídeo, salvar rascunho, enviar para aprovação e retorno de erros de rede.
- Aprovação/recusa no PMS, edição exigindo nova aprovação, visibilidade pública e conteúdo de perfil desativado.
- Navegação completa em largura de celular e teste em aparelho físico.
- Homologação separada de comentários, curtidas, marcações, convites e moderação. As implementações DEV estão preservadas; a disponibilidade DEV não equivale à aprovação para produção.
- O feed público do lançamento continua usando public_feed, que exclui guest_submission. Abrir o editor não libera automaticamente conteúdo de hóspedes no feed público. Essa política e os bloqueios de servidor PROD deverão ser revisados explicitamente após a homologação.

## Publicação e retorno

Esta execução não autoriza publicação em produção. Uma futura liberação de hóspedes exige revisão das flags e da política de servidor/feed, build com ambiente PROD correto e aprovação posterior do resultado homologado. Não basta alterar flags no navegador.

Para retornar apenas a esta alteração de acesso, reverter o commit de código indicado acima na branch DEV e criar outra prévia. A prévia anterior do fluxo de hospedagem, `0240247f630142fcf18b7e49150b198edf933c0b`, permanece como referência. Nenhuma reversão exige apagar publicações ou migrar dados. Produção permanece na versão anterior.
