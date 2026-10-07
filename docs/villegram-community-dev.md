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
- Testes focados: 42 passaram. Verificação visual e suíte completa em andamento. `villegram-stories-qa.html` é um ensaio de componentes sem escrita no banco; não substitui teste da conta autenticada.
