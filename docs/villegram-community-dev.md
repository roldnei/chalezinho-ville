# Comunidade de hóspedes — implementação DEV

## Estado em 7 de outubro de 2026

Implementação concluída no código. **Migração DEV aplicada e função DEV v9 implantada; validação da prévia em andamento.** A chamada para executar a migração DEV foi recusada pela aprovação automática (`SQL execution was declined`), sem justificativa adicional. A consulta após a recusa retornou `to_regclass('public.villegram_profiles') = null`: a migração não foi aplicada. Não foi tentado outro caminho de escrita para contornar a recusa.

Após nova autorização do usuário, a migração foi aplicada em 07/10/2026. As funções SQL conferidas são SECURITY INVOKER e sem execução por authenticated. A função villegram-content DEV v9 está ACTIVE, hash ed086d21c3a12e202de70fa2cc3512ecbe400baddea84a32e936e39314d6c587. Os avisos de segurança após a migração continuam sendo os anteriores: tabelas service-only com RLS sem políticas e proteção de senhas vazadas desativada. PROD não foi acessado nem alterado.

Base remota conferida: `feature/romantic-stay-offers`, HEAD `cb3e43b4646ac6cb1a11f788a12c28adf72d4321`. Os quatro arquivos da função `villegram-content` DEV v8 correspondem exatamente à base local. Conferir novamente antes da implantação, para preservar avanços concorrentes.

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

350 testes automatizados passaram (336 anteriores + 14 novos), além de verificação JavaScript, TypeScript, build DEV e `git diff --check`.

Cobertura nova executa a migração e as funções reais em Postgres/PGlite: isolamento de escrita/leitura e mídia, publicação moderada, conflitos de edição, propriedade de publicações, novo aceite de marcação após edição, idempotência de notificações, convite único/expirado/autoconvite. Testes de interface JSDOM exercitam o editor de hóspede com upload e envio para aprovação, perfil público, seguir/deixar de seguir, aceite de marcação, notificações lidas, criação de convite, navegação privada de reservas e entrada autenticada no feed Seguindo. JSDOM não substitui teste visual.

O navegador virtual voltou a abrir nesta retomada; acesso à prévia está sendo autenticado pela Vercel.

O teste de curtida revelou e corrigiu uma referência a `new.id` ausente na tabela de likes. O teste de Storage utiliza também a política preexistente da equipe e suas permissões de leitura em `profiles`.

Tentativa real no navegador virtual: reset da sessão e abertura da conta DEV falharam com `Browser observation is unavailable because native credential state cannot be safely resumed. Start a new browser runtime to continue.` Não há capturas novas nem alegação de aprovação visual/autenticada. A prévia anterior permanece em https://chalezinho-ville-o8xp3ir8b-roldneicosta-4140.vercel.app/ e não contém esta comunidade.

## Para concluir após liberar a migração

1. Revalidar HEAD remoto e função DEV. Aplicar a migração exclusivamente em `pxfqmnhqodqyaaqeyjgr` e verificar RLS, grants, funções e advisors. A consulta anterior à implantação só apontava avisos já existentes de RLS sem políticas em tabelas service-only e proteção contra senhas vazadas desativada; não alterar configurações de Auth por este trabalho.
2. Implantar `villegram-content` com o novo `_shared/villegram-community.ts` e dependências preservadas. Verificar feed anônimo, operações privadas sem token e fluxo autenticado com contas de teste autorizadas; limpar os registros de teste.
3. Publicar commit em preview Vercel, sem target produção, e verificar versão e assets servidos.
4. Em navegador funcional, testar celular e computador: opt-in, avatar, perfil, upload/falha/retry, pinça/arraste/ordenação, rascunho, moderação, edição após publicação, marcação aceita/removida, seguir, Seguindo vazio/erro, convite, desativação de perfil e retorno ao reel. Testar também acesso às reservas e preservação do checkout. Registrar capturas reais.
