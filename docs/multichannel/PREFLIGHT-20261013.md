# Preflight de publicação — 13/10/2026

> Histórico anterior à publicação. Backup, validação DEV da função candidata e publicação autorizada foram realizados posteriormente; veja `PUBLICADO-20261013.md` para o estado vigente e a pendência de login para conferência visual administrativa PROD.

## Situação

Produção NÃO alterada. Recuperação do banco bloqueada por ausência de backup acessível. Revisão estática do pacote concluída; encontrada e corrigida geração legada no PMS. A alteração adicional ainda exige implantação DEV e verificação da função candidata antes de publicar. Não é aprovação de produção.

## Estado real reconfirmado

- Branch remota: feature/multichannel-operations-20261012, dc963d550846deabde3fb347862d34553bcdc027 antes desta rodada; nenhuma mudança concorrente.
- Domínio: https://chalezinhoville.com.br.
- PROD Vercel READY: dpl_CSqwT4w5eHtc5gCQ3jyg6U2VmPDu; commit 4b54aee214493337b27edcc780bc1de155c632f3.
- PROD Supabase: irxsaladqhbzhkoaclxy; 45 contatos, zero reservas nativas/confirmadas; ops_stays ausente; pg_cron e pg_net presentes.
- Funções PROD: booking-engine v69, pms-operations v13 (pms-launch-compat), public-consultation v2. Nenhuma substituída.
- Job multicanal ainda ausente em PROD; não foram alterados os quatro jobs existentes.
- DEV booking-engine v75 preservado.

## Backup e recuperação

Painel autenticado revisto: https://supabase.com/dashboard/project/irxsaladqhbzhkoaclxy/database/backups/scheduled. Continua Free e mostra “Free Plan does not include project backups”. Captura: outputs/release-20261012/backup-recheck-20261013.jpg.

Não foi encontrado dump no workspace da tarefa. pg_dump, psql, supabase e docker não estão no PATH da sessão; não há variáveis PG/DATABASE/SUPABASE de conexão configuradas. Conector SQL acessível não equivale a backup lógico completo/restaurável. Nenhum restore foi executado sobre PROD ou DEV; nenhum plano pago foi contratado.

Aguardando proprietário informar arquivo externo ou habilitar backups. Um backup externo é alternativa válida: não é obrigatório contratar um plano. Validar restauração em destino isolado e compatível antes de considerar recuperação aprovada. Objetos Storage não integram backup de banco; preservar fotos e mapear recuperação separadamente.

Documentação consultada: https://supabase.com/docs/guides/platform/backups (recomenda db dump no plano Free e esclarece exclusão dos objetos Storage).

## Compatibilidade encontrada e correção preparada

O código remoto pms-operations v13 usa pms-launch-compat e chama syncTurnovers ao abrir hub e registrar checkout. O código DEV completo já removia a chamada no hub, mas ainda a mantinha no checkout. Isso poderia criar tarefas antigas paralelas ao ledger novo.

Correção nos dois entrypoints: abertura do painel/checkout não chamam mais o gerador legado; checkout continua gravando saída/auditoria e o trigger multicanal cuida da reconciliação. O wrapper ganhou somente a rota task_photos com o leitor existente, que nega upload legado e preserva fotos antigas. Não foi trocado pelo pacote completo DEV.

Testes direcionados executam o caminho de checkout com banco controlado e verificam somente writes de reserva/auditoria; leitura de fotos autorizada e upload negado sem escrever Storage. São testes locais, não prova de execução da função remota candidata.

## Plano de instalação/retorno preservado

- Nove migrações no roteiro production-reviewed.sql, transação única e interrupção se ledger existir ou surgir reserva confirmada antes da instalação.
- ops_project_url validado para PROD; cron novo permanece inativo até Edge/autorização/fontes verificadas.
- Não copiar fixtures, cleanup ou dados DEV para PROD.
- Diff frontend funcional limita-se ao workspace operacional/contadores/host PMS. Diferença grande de linhas de admin.js é principalmente terminadores; comparação sem EOL mostra 2 inserções e 1 remoção.
- Perfil whatsapp e public-consultation mantidos. Checkout/PagBank preservados no código e desativados no público.
- Retorno de interface: deployment anterior identificado acima. Retorno operacional: pausar somente job multicanal, preservar ledger/fotos/histórico; correção aditiva do banco.
- Depois do backup, ainda fixar o pacote final, testar função candidata em DEV, conferir ambiente do build PROD, publicar e validar cron/fontes/UI sem operações financeiras ou mensagens reais.

Suíte completa após a correção: 537/537, zero falhas, 97,1 s. Log: outputs/release-20261012/tests-preflight-20261013.txt. Nenhuma evidência local foi apresentada como teste da função remota candidata.

## Backup manual executado — 13/10/2026, 09h09–09h20

Substitui a pendência de ausência de qualquer cópia: criado arquivo local protegido fora do repositório, C:/Users/Roldn/Documents/ChalezinhoVille-Backups/PROD-20261013/backup-20261013.zip, 19.940.276 bytes. SHA-256 7f28576ca9500e05565be70af31aac23a4eeaacb7fd38a15e7f5f500c6af6231.

Snapshot único de dados: 78 tabelas, 1.552 registros, incluindo os 45 contatos; definições schema/policies/triggers/grants preservadas; pacotes das 12 Edge Functions; 23 objetos Storage, 19.652.485 bytes, incluindo quatro privados copiados pelo painel autenticado. Nenhuma alteração PROD, limpeza ou substituição de dados.

Recuperação local em PGlite: tabelas tipadas/enums e todas as linhas restauradas; hashes normalizados dos registros iguais em 78/78 tabelas. ZIP aberto e 44 arquivos comparados com manifesto. ACL local restrita ao usuário atual e SYSTEM. Conteúdo privado não foi adicionado ao Git.

Limite: exportação lógica da aplicação, NÃO pg_dump integral. Teste não ativou triggers/RLS/cron/Edge nem recriou serviços de Auth/Storage. Sessões, segredos e infraestrutura gerenciada não integram a cópia. Procedimento/limites no LEIA-ME do arquivo. Portanto, recuperação dos dados verificada; reconstrução completa da plataforma não homologada. Publicação ainda não executada; correção adicional PMS necessita validação DEV antes do rollout.
