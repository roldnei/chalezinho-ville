# Comunidade de hóspedes — implementação DEV

## Estado em 7 de outubro de 2026

Código e migração implantados exclusivamente em DEV. Validação automatizada e jornada pública no navegador concluídas; testes visuais autenticados e em celular ainda pendentes.

Migração aplicada em 07/10/2026 em `pxfqmnhqodqyaaqeyjgr`. As funções SQL são SECURITY INVOKER, sem execução por authenticated. Função `villegram-content` DEV v10 ACTIVE, hash `09f1f98f1f4bdff2b025305e0ea23fd7e950893aa0e705535088b6a7923a5868`. Sem novos avisos de segurança de nível warning/error. Tabelas service-only têm RLS sem políticas deliberadamente; o aviso anterior de proteção de senhas vazadas não foi alterado. PROD não foi alterado.

Base remota preservada: `cb3e43b4646ac6cb1a11f788a12c28adf72d4321`. Comunidade publicada no commit `4710b2b86a959d566267b30488676448853a279d` da branch `feature/romantic-stay-offers`.

Prévia frontend verificada: https://chalezinho-ville-bdfd6usgt-roldneicosta-4140.vercel.app/ — deployment `dpl_5Jq4tFK4VDtA2rSLVMppryr9xsGn`, READY, target preview. Assets conta, comunidade, editor e perfil conferidos contra o código. A correção v10 abaixo altera somente backend e teste.

## O que o código implementa

- `conta.html`: entrada **Meu Villegram**, perfil com foto, nome público, @nome e bio; abas Meus momentos, Atividade, Marcações e Pessoas. A aba Minhas reservas contém os controles privados existentes. Links com `charge` e `#reservas` abrem diretamente a área privada. Convites e parâmetros são preservados ao fazer login.
- Perfil público opcional e desativável. Não se copia nome privado automaticamente, contato, documento, datas, dados da reserva ou pagamento para o perfil público. Perfil desativado e seus momentos são excluídos de consultas públicas e interações. URLs assinadas já emitidas podem continuar válidas por até 30 minutos.
- `villegram-admin.html?mode=guest`: editor do hóspede reaproveita upload retomável, fotos, vídeo, capa, pinça, deslocamento e ordenação existentes. Oculta motor automático, catálogo de fotos da equipe, preços, pacotes e controles comerciais. Permite título, legenda, chalé opcional e @marcações; sugere um chalé de reserva confirmada, deixando a escolha editável e as datas privadas.
- Hóspedes com reserva confirmada ou convite aceito podem enviar momentos. Qualquer conta com login pode optar por um perfil público e seguir pessoas. Login anônimo do Supabase não autoriza as operações privadas.
- Rascunhos, envio para aprovação, edição e arquivamento mantêm a identidade da publicação. Hóspedes não podem publicar diretamente, impersonar equipe, reutilizar mídia de outro proprietário ou anexar preços/ofertas/datas. A edição de um momento publicado o retira do feed até nova aprovação.
- Equipe: filtro **Aguardando aprovação**, prévia, botão Revisar momento, aprovação/publicação e devolução com motivo. A API administrativa de edição comum não altera publicações de hóspedes; a moderação tem uma operação própria e registra auditoria.
- Seguir/deixar de seguir, busca por @nome e feed **Seguindo** com sessão autenticada. Descobrir continua acessível sem login. As trocas de feed são ações explícitas e não reorganizam automaticamente o reel em leitura.
- Marcações pendentes só se tornam links públicos após o aceite do destinatário. Pode remover a associação. Edição pede novo aceite; uma marcação removida não é reativada simplesmente ao salvar novamente. Texto livre na legenda não se transforma automaticamente em vínculo de perfil.
- Notificações dentro da conta para seguir, curtir, comentar, marcar, aprovar/arquivar e aceitar convite. São gravadas atomicamente com os eventos do banco e deduplicadas. Não há envio de e-mail, WhatsApp ou push.
- Convite de acompanhante: link criado sob demanda, um uso, validade de sete dias, revogável antes do aceite, armazenado como hash SHA-256. Aceitar não concede acesso à reserva de outra pessoa e não segue ninguém automaticamente. O usuário copia e envia o link; o sistema não manda mensagens a terceiros.

## Modelo e limites

Migração: `supabase/migrations/20261007120738_villegram_guest_community.sql`.

Novas tabelas: `villegram_profiles`, `villegram_follows`, `villegram_mentions`, `villegram_notifications`, `villegram_invites`. Todas têm RLS. Clientes não recebem permissão direta de escrita. Só a própria linha do perfil é legível diretamente por um usuário autenticado, para a política de upload. APIs públicas projetam campos de apresentação explicitamente.

Funções SQL `SECURITY INVOKER`, com execução revogada de PUBLIC/anon/authenticated e concedida somente a service_role. Autenticação da Edge Function usa `auth.getUser`; autorização administrativa consulta o perfil confiável do banco, não metadata editável. Mantém a trava do hostname Supabase DEV.

Storage permanece privado. A política nova permite arquivos novos somente na pasta do usuário. Vídeos exigem a elegibilidade armazenada no perfil; fotos também permitem a criação de avatar. Não é concedida permissão para sobrescrever ou apagar mídias. O backend verifica proprietário, formato e existência dos arquivos antes de salvar.

Limites: 8 fotos ou 1 vídeo; vídeo até 120 segundos/50 MiB; fotos de entrada até 10 MiB, convertidas pelo editor; até 10 momentos/dia, 10 marcações/momento e 5 convites/dia. Convites não dão acesso a reservas. Perfis públicos listam até 60 momentos, biblioteca própria até 100 e caixa de atividade até 60 notificações. Esta versão não inclui paginação de histórico extenso, push, mensagens privadas, transmissão ao vivo nem conversão automática de HEVC/HDR para H.264/SDR.

## Validação realizada

352 testes automatizados passaram (336 anteriores + 16 novos), além de verificação JavaScript, TypeScript, build DEV e `git diff --check`.

Cobertura nova executa a migração e as funções reais em Postgres/PGlite: isolamento de escrita/leitura e mídia, publicação moderada, conflitos de edição, propriedade de publicações, novo aceite de marcação após edição, idempotência de notificações, convite único/expirado/autoconvite. Testes de interface JSDOM exercitam o editor de hóspede com upload e envio para aprovação, perfil público, seguir/deixar de seguir, aceite de marcação, notificações lidas, criação de convite, navegação privada de reservas e entrada autenticada no feed Seguindo. JSDOM não substitui teste visual.

O teste de curtida revelou e corrigiu uma referência a `new.id` ausente na tabela de likes. O teste de Storage utiliza também a política preexistente da equipe e suas permissões de leitura em `profiles`.

A API DEV publicada revelou um erro no helper `check`: faltava aguardar a consulta Supabase antes de ler data/error. Corrigido na v10 e coberto por teste que executa um query builder thenable e verifica dados públicos e propagação de falha. Após a correção: people 200, perfil inexistente 404, feed anônimo 200 com 11 publicações; guest_list, moderation e following sem autenticação retornaram 401.

Teste transacional no banco DEV executou a RPC real de moderação, verificou publicação, notificação e auditoria e terminou com ROLLBACK, sem manter registros de teste.

### Navegador real — computador

- Home convencional; entrada no Villegram; vídeo; pausa/retomada; legenda completa; comentários abertos; compartilhamento com cópia do link (sem enviar mensagens).
- Navegação entre reels com total estável (1 de 11, 2 de 11); alternância dos controles som ligado/desligado. Não foi verificada reprodução audível.
- Datas 16–19/11/2026, dois hóspedes, motivo Romântico; navegação direta aos resultados durante o carregamento; indisponibilidade de Signature/Essenza e Amore disponível.
- Composição Amore: ambas as tarifas inicialmente desmarcadas, totais completos R$ 2.086,40 / R$ 1.936,70. Seleção explícita de cada tarifa.
- Motivo alterado para Descanso; sugestões atualizadas. Café da manhã DEV acrescentou R$ 1,00 a ambas as tarifas; remoção restaurou valores anteriores.
- Etapa final exigiu login e exibiu chalé, datas, tarifa selecionada e total preservados antes do login. Nenhum pagamento ou aceite contratual realizado.
- Capturas reais: `villegram-dev-feed-20261007.jpg` e `villegram-dev-reserva-20261007.jpg`, entregues separadamente.

### Pendências concretas

A solicitação segura browserAuth para a conta DEV expirou por timeout, e a navegação explícita de verificação também não respondeu. O resultado do login é desconhecido; não foi tentada entrada de credenciais por outro meio. A comunidade não está declarada validada visualmente de ponta a ponta.

Falta testar com conta DEV autenticada: opt-in/avatar/perfil, upload/falha/retry, pinça/arraste/ordenação, rascunho, moderação, edição após publicação, marcação aceita/removida, seguir, Seguindo vazio/erro, convite e desativação. Confirmar também preservação após login e retorno ao mesmo reel. Testes JSDOM e Postgres desses fluxos passaram, mas não substituem a jornada real.

Falta teste visual em viewport de celular e gestos multitouch: a superfície atual do navegador não expõe ajuste de viewport/multitouch. Não foi simulada captura móvel nem declarada aprovação dessa jornada. Testes de conexão lenta/erros de mídia também permanecem pendentes na interface real.

## Correção do formulário de perfil

A captura do usuário revelou validação HTML rejeitando @ e maiúsculas antes da normalização já aceita pelo servidor. O formulário agora aceita ambos, normaliza ao sair do campo e antes do envio, explica o formato e impede escolher avatar até salvar e ativar o perfil. Botões sociais recebem estilos explícitos e as instruções deixam de herdar espaçamento editorial. Cobertura reproduz @Rolds pelo formulário real JSDOM, limites válidos/inválidos e liberação do avatar. Validação visual dessa correção continua pendente por indisponibilidade da sessão de navegador.

## Avatar, composição na cena e Assistir (07/10/2026)

- Avatar: recorte circular com arraste, pinça, botões e teclado. Gera WebP quadrado 512 × 512 e mostra prévia circular; só envia no Salvar perfil, agora abaixo da foto. API autenticada valida tamanho/tipo, gera pasta pelo usuário e remove o novo arquivo se o perfil falhar. Não precisa criar um perfil público antes de escolher a foto.
- Texto por cena: ferramenta Aa, até cinco blocos de 280 caracteres, posição, tamanho, cor e fundo transparente/colorido. Arraste e teclado; edição/exclusão; metadados validados no servidor. O texto fica fora da transformação da foto e é mostrado no feed sem abrir a legenda. Descrição complementar continua acessível. Mídias e publicações anteriores são preservadas.
- Meu Villegram começa em Assistir, com o feed real incorporado e botão Ville Reels/tela inteira. Minhas postagens tem aba própria. Esconder o player pausa mídia e contagem; navegar por links sai do quadro para a página correspondente.
- Backend DEV v11 ACTIVE (hash 607952abe85057a688d42e6c275b3c42ef2b8cdd4b475f0505b79e6627ffd284). Nenhuma migração, alteração de política ou implantação PROD.
- Suíte final: **360 testes passaram**, incluindo navegação para fora do player incorporado e texto por cena fora da transformação de imagem. `npm run check` passou. TypeScript e build DEV passaram antes dos ajustes finais de navegação/CSS.
- Navegador real na prévia b871119: composição Aa, texto digitado, fundo ligado, cores #ffe7a8/#51301b, aumento de tamanho, arraste para nova posição e composição de visitante; recorte circular, dois incrementos de zoom, arraste e confirmação de WebP 512 × 512. Capturas `villegram-avatar-crop-dev.jpg` e `villegram-texto-e-previa-dev.jpg` são do ensaio real dos componentes, não da conta.
- Feed real no quadro responsivo (390 × 740): vídeo, entrada muda, próximo reel de 1/11 para 2/11, pausa e legenda completa. Não equivale a teste de pinça em telefone físico.
- Login browserAuth concluído e conta autenticada observada: Assistir selecionado, player real carregado abaixo do perfil, aba Minhas postagens, CTA de tela inteira; formulário com seleção de foto antes de Salvar perfil; editor de momentos aberto. Seleção/download de arquivos bloqueados pelo navegador após entrega segura de credenciais. Nenhum perfil ou post do usuário alterado no teste.
- Pendentes: salvar avatar e perfil em uma mesma ação pela UI autenticada, upload/rascunho/publicação/reabertura do texto pela UI autenticada, gesto multitouch real e falhas de rede. Cobertura automatizada não substitui esses passos.
- API DEV real: feed HTTP 200 com 11 publicações; tentativa anônima de salvar perfil HTTP 401. Nenhuma credencial exposta.
- `villegram-stories-qa.html` é um ensaio de componentes sem escrita no banco; não substitui a jornada completa da conta autenticada.

## Refinamento visual dos controles sociais (07/10/2026)

Ações de perfil com superfícies planas, ação principal clara, ícones SVG consistentes e navegação em cinco colunas com indicador de seleção. Abas permanecem nomeadas e operáveis por teclado; Postagens conserva o nome acessível Minhas postagens. Cabeçalho Ville Reels compacto e ação de tela inteira com nome acessível no celular. Ajuste restrito à conta/comunidade; não altera banco ou reserva. Os 16 testes da comunidade e a análise sintática passaram. Nova captura visual pendente: o navegador recusou observação por estado de credenciais nativas, inclusive após reiniciar o runtime uma vez.

## Texto direto na cena (07/10/2026)

O painel de texto que cobria a foto foi removido. Aa cria um bloco vazio perto do centro da imagem, com foco/cursor para digitar. Toque abre uma barra contextual em semicírculo: fonte, fundo (incluindo transparente), negrito, itálico, tachado e exclusão; lápis permite voltar à digitação. Arraste reposiciona, pinça ajusta tamanho dentro de limites, teclado oferece Enter/setas/+/-/Delete/Escape. Concluir ou tocar fora encerra a digitação sem um formulário separado; avançar também confirma o texto. Colagem é somente texto; limites e estilos são validados pelo servidor. Publicações anteriores mantêm a formatação original.

Validação: 364 testes passaram; 30 focados no editor/cenas, incluindo foco, remoção de vazios, colagem sem HTML, eventos de dois ponteiros para pinça, isolamento dos gestos da foto e ciclo salvar/editar/excluir com estilos. Verificação sintática e TypeScript passaram. Supabase DEV villegram-content v12 ACTIVE (1d853b65e025a55093c8e59f70e8a6de88701c60886742e67353ba1d2bc0fc23), feed real respondeu HTTP 200 com 11 posts. Demais arquivos remotos da função conferidos iguais antes da atualização. Sem migração ou mudança de autenticação.

Teste visual desta alteração pendente: navegador na nuvem recusou observação por estado de credenciais nativas mesmo após reiniciar o runtime. Não há nova captura nem validação de teclado Android, menu em tela pequena ou pinça em telefone físico. Os testes de ponteiros em JSDOM não substituem essa verificação.

## Controles compartilhados e formatação por seleção (07/10/2026)

`ui-controls.css` padroniza superfícies, campos, botões, foco e estados de seleção nas páginas existentes: conta, editor (todas as etapas), reserva, chalés e administração. Mantém fotografia e tipografia editorial pública. No editor, etapas recebem indicador discreto, CTA claro, ações secundárias neutras e menu de texto com arco, superfícies translúcidas e indicação de escopo.

A formatação agora usa intervalos de caracteres dentro da caixa ativa: fonte, fundo, negrito, itálico e tachado afetam somente o trecho selecionado. Sem seleção de palavras, afetam a caixa ativa. Seleção é preservada ao tocar nas ferramentas/cores e descartada ao trocar de caixa. Inserções e exclusões reposicionam os intervalos; salvar/editar e feed preservam o resultado. Servidor rejeita intervalos sobrepostos, fora dos limites e estilos inválidos. Exclusão continua removendo a caixa ativa inteira. Nenhuma alteração no schema, políticas, contratos, preços ou integração financeira.

Validação: **368 testes passaram**, sendo 34 do editor/cenas. Análise sintática, TypeScript e `git diff --check` passaram. Supabase DEV villegram-content **v13 ACTIVE**, hash b51f59bec99842c6de62cb9434a57adc9ff4f5ba6abad66228ec16be18892ac6. Todos os arquivos remotos conferidos contra o commit base antes de atualizar apenas o validador de mídia. PROD não alterado.

**Pendente:** teste visual desta versão em celular/computador e seleção nativa de palavras/teclado Android. O navegador na nuvem continua recusando observação por estado de credenciais nativas, mesmo após reinicialização do runtime. Não há nova captura e não se declara a aparência validada. Testes JSDOM de seleção e ponteiros não substituem gestos reais nem a jornada autenticada de upload/publicação.

## Mídia diretamente na cena (07/10/2026)

Prévia vazia é um botão acessível para escolher vídeo ou fotos. O seletor duplicado abaixo da imagem foi removido. Com fotos, Adicionar fica sobre a cena; no limite de oito ou com um vídeo, o botão é ocultado. A primeira etapa fica centrada na prévia e nas miniaturas. Opções secundárias da capa/ordem ficam recolhidas.

Progresso e status aparecem sobre a prévia durante envio. Ao concluir, a barra some imediatamente e a confirmação desaparece após 2,5 segundos. Uma nova operação cancela o temporizador anterior. Falhas permanecem visíveis com nova tentativa quando há envio retomável; nenhuma falha é ocultada automaticamente. O envio continua separado de salvar/publicar/aprovar.

Segurar a foto ou a área de imagem do vídeo por 550 ms abre a lixeira; só tocar na lixeira remove a mídia selecionada da composição. Movimento maior que dez pixels, segundo dedo, cancelamento ou troca de cena cancelam a espera. Ferramentas de texto e controles do vídeo não disparam a lixeira. Botão de opções e teclado são alternativas acessíveis. Remover preserva a capa remanescente e devolve o estado vazio quando era a última mídia. Não apaga arquivos no armazenamento nem publica a alteração automaticamente.

Validação: **373 testes passaram**, incluindo cinco casos novos de seleção/envio/temporizadores/retry, toque longo, pan/pinça/cancelamento, vídeo e preservação da capa. Os 39 testes focados no editor/cenas passaram; análise sintática e diff check passaram. Sem alteração de banco, backend ou PROD.

Teste visual desta versão continua pendente: nova tentativa de abrir o editor DEV após reiniciar o navegador retornou “Browser observation is unavailable because native credential state cannot be safely resumed”. Sem novas capturas, upload real pela UI ou validação de toque longo em telefone físico. A cobertura automatizada não substitui essa etapa.

### Status de envio compacto

Após a captura do usuário, o aviso saiu de dentro da imagem: fica no fluxo normal logo abaixo da prévia, antes das instruções, sem sobrepor os controles. Retirados fundo, sombra, moldura e espaçamento excessivo; barra de 2 px e texto de 12 px. Confirmação mantém desaparecimento automático; erro e nova tentativa continuam acessíveis. Os 28 testes do editor passaram. Conferida posição no DOM fora da cena; aparência em navegador ainda não validada devido ao bloqueio da sessão já registrado.

## Primeira etapa inteiramente na cena (07/10/2026)

Avançar passa a ser uma seta circular de 46 px no canto inferior direito da cena; miniaturas de 44 × 58 px ficam no canto inferior esquerdo, com rolagem e ordenação por arraste/teclado preservadas. No vídeo, ficam acima dos controles nativos. Adicionar e menu contextual ficam no topo. Capa e opções adicionais ficam no menu, não abaixo da imagem. A biblioteca de fotos da equipe continua acessível em um diálogo próprio. Voltar da legenda restaura a navegação na cena e o foco.

Instruções, rodapé, Opções da cena e sugestão de chalé deixaram de ocupar a área abaixo da prévia na primeira etapa. O chalé sugerido continua preenchido para revisão na publicação. Avisos de envio/erro são compactos e temporários quando resolvidos, dentro da cena numa região separada dos controles; erros não são descartados. Etapas posteriores mantêm os campos e ações necessários para legenda e publicação. Sem mudança de backend, schema, reservas ou PROD.

Validação: **374 testes passaram**; 29 do editor passaram novamente após ajuste final de foco. Cobertura adicional acompanha entrada pela biblioteca, avanço/retorno, localização dos controles, capa e salvamento. Sintaxe e diff check passaram. Teste visual e captura desta versão continuam pendentes pelo bloqueio da sessão de credenciais do navegador na nuvem; testes DOM não comprovam aparência ou gesto em Android real.

### Ferramentas discretas sobre a foto

Adicionar, opções e Aa usam círculos de 44 px com fundo translúcido e nomes acessíveis. O rótulo visual Texto foi retirado. Capa, enquadramento e zoom foram movidos para dentro do menu de opções, mantendo pinça e arraste diretos. Etapas no topo usam ícones pequenos e indicador de seleção sem blocos de fundo. A especificidade dos estilos foi ajustada para impedir que o estilo genérico dos botões restaurasse os retângulos vistos na captura do usuário. Os 40 testes focados no editor/texto passaram; diff check passou. Sem alterações de lógica, backend ou PROD. Conferência visual desta versão segue pendente pelo bloqueio da sessão do navegador.

### Estado vazio sem controles de edição

Sem mídia, a seta de avanço, as etapas, miniaturas e ferramentas ficam ocultas. Ao carregar mídia aparecem novamente; remover a última restaura o estado vazio. Biblioteca da equipe usa ícone de galeria com nome acessível, disponível para escolher a primeira foto. Os 40 testes de editor/texto passaram, incluindo verificações do estado vazio/carregado e retorno ao vazio. Sintaxe e diff check passaram. Sem alteração de backend ou PROD; validação visual continua pendente pelo bloqueio da sessão do navegador.

### Enquadramento direto na cena

O comando Preencher saiu do menu de três pontos e usa um ícone circular de enquadramento no canto direito, abaixo de Aa. O nome acessível e a dica alternam entre Mostrar foto inteira e Preencher a cena. Fica oculto sem mídia e nas etapas seguintes. Fotos novas enviadas ou escolhidas da biblioteca entram com fit cover; mídia existente conserva seu enquadramento e vídeos mantêm o padrão anterior. A alternância mantém zoom e deslocamento.

Validação: 41 testes de editor/texto passaram, cobrindo upload e biblioteca com preenchimento inicial, alternância fora do menu, persistência do enquadramento ao reabrir, navegação e remoção da última mídia. Sintaxe e diff check passaram. Sem backend, banco ou PROD alterados. Aparência em navegador continua sem nova validação devido ao bloqueio de retomada segura da sessão de credenciais já registrado.

### Preencher sem bordas deslocadas

Corrigido o comando que alterava apenas object-fit e conservava deslocamento/zoom: ao preencher, zera offsets, recentraliza posição e origem e restaura zoom 1 com cover. Quando a cena tem ajuste manual, o ícone oferece Preencher, mesmo se o modo anterior já era cover; após preencher, outro toque mostra a foto inteira. Não muda rascunhos existentes até tocar na ferramenta.

42 testes de editor/texto passaram, incluindo regressão com foto em cover deslocada e ampliada, preenchimento em um toque, persistência e alternância para foto inteira. Sintaxe e diff check passaram. Nova tentativa de observação pelo navegador retornou o mesmo bloqueio de retomada segura de credenciais; sem validação visual ou captura nova. Sem alterações de backend ou PROD.
