# Publicação futura e retorno — revisão obrigatória

**Não executar em PROD nesta entrega. Homologação incompleta.**

## Antes de aprovar produção

1. Concluir as pendências de `ENTREGA-20261012.md`: publicar Edge atualizada em DEV, testar fotos completas, retentativa, permissões na API/Storage com ambos os perfis, desktop/móvel e aparelho físico. Confirmar Central/PMS com dados iguais no build novo.
2. Fixar o commit aprovado da branch `feature/multichannel-operations-20261012`. Não usar apenas “último deployment”. Preservar todo o checkout/PagBank no repositório.
3. Inspecionar novamente PROD e a Vercel, pois pode haver avanço posterior. Base de produção observada nesta sessão: `4b54aee214493337b27edcc780bc1de155c632f3`; deployment `dpl_CSqwT4w5eHtc5gCQ3jyg6U2VmPDu`.
4. Salvar definição/versionamento das funções atuais, configuração da Vercel, versão do banco e comprovar restauração do backup/PITR. Não exportar dados pessoais ou credenciais para o repositório.
5. Revisar o delta de schema. As tabelas-base e pg_cron/pg_net/Vault consultados estavam presentes em PROD, mas `ops_stays` não existia e `finance_project_url` não estava provisionado. O procedimento cria `ops_project_url` próprio. Não copiar secrets DEV para PROD.
6. Conferir permissões de equipe e horários por imóvel. Modelos padrão poderão criar tarefas históricas pendentes no backfill; não convertê-las em realizadas automaticamente. Planejar a triagem histórica com o administrador.

## Migrações desta entrega

Aplicar somente este conjunto revisado, nesta ordem, comparando **nomes e conteúdo** com o histórico remoto. Timestamps remotos de migração podem diferir dos nomes locais porque o conector os gera na aplicação.

| Arquivo | Função |
|---|---|
| `20261012162927_multichannel_operations.sql` | Ledger, tarefas, histórico, evidências privadas, triggers de reservas/inventário |
| `20261012163532_multichannel_schedule.sql` | Segredo próprio da rotina e job de 10 minutos |
| `20261012192148_multichannel_reconciliation_hardening.sql` | Conflitos de datas, edição, conferência antecipada, lease de falha |
| `20261012193354_multichannel_dispatch_target.sql` | Destino operacional próprio, validação de configuração ausente |

O arquivo `production-reviewed.sql` é um roteiro psql com transação única e `ON_ERROR_STOP`. Ele provisiona apenas o destino PROD conhecido, aplica as quatro migrações e deixa o cron **inativo**. Ele **não foi executado em produção**. Revise antes de usar. Em ambientes com migrações parcialmente aplicadas, pare e reconcilie o histórico; não force repetição de DDL nem execute `db push` indiscriminadamente.

## Serviços e frontend

1. Publicar `multichannel-operations` no projeto PROD somente após aprovação. O pacote precisa incluir seus imports relativos, com versões npm fixadas. `verify_jwt=false` é intencional: a função valida token com `getUser`, perfil ativo e escopo, ou segredo da rotina via Vault. Não remover essas verificações.
2. Revisar o delta de `booking-engine`: leitura do inventário operacional na busca e exportação iCal manual. Confirmar que o runtime de produção mantém `public-consultation`, nega criação pública de holds/pagamentos e respeita o perfil WhatsApp.
3. Revisar a diferença entre o `pms-operations` completo de DEV e o wrapper `pms-launch-compat` de produção. Não substituir cegamente a versão PROD por uma função de DEV com recursos financeiros/futuros. Portar e validar somente o necessário para acesso/hub legado e fotos antigas somente leitura; o novo workspace chama sua Edge própria.
4. Construir frontend com ambiente PROD, `VILLE_RELEASE_PROFILE=whatsapp`, a aprovação de lançamento existente e URL/chave pública do PROD. Não expor chave de serviço. Não usar o build de preview DEV como build de produção.
5. Manter domínios atuais e proteção da Vercel. A configuração nova criada nesta sessão foi **apenas preview**, restrita à branch multicanal. Nenhuma alteração no perfil de produção é necessária para habilitar checkout.
6. Publicar de forma revisável, verificar consulta → WhatsApp, login administrativo, funções e fontes. Não enviar mensagens reais de teste.
7. Só então ativar `multichannel-operational-sync`, executar `ops_private.dispatch()` e conferir HTTP 200 **e** resultado individual das seis fontes. Job “executado” por si só não comprova sucesso remoto.

## Rotina e monitoramento

- Job: `multichannel-operational-sync`.
- Expressão: `*/10 * * * *`.
- Comando: `select ops_private.dispatch();`.
- Destino: Vault `ops_project_url`; DEV já aponta para `https://pxfqmnhqodqyaaqeyjgr.supabase.co`. PROD deve apontar explicitamente para `https://irxsaladqhbzhkoaclxy.supabase.co` após aprovação.
- Autorização: Vault `ops_dispatch_secret`, gerado por ambiente; nunca imprimir o valor.
- Acompanhar `ops_sync_state`, `ops_sync_runs`, histórico `cron.job_run_details` e resposta de `pg_net`.
- `last_success_at`/`last_error` e divergências são exibidos em Calendários. Lease expirado não autoriza resultado de worker antigo. Um evento ausente não é cancelamento.
- Nenhum e-mail/WhatsApp decorre dessas tarefas. Notificações internas não substituem conferência de responsável e prazo.

## Retorno à versão anterior

### Problema no frontend

Restaurar o deployment de produção anterior revisado, no mesmo projeto/equipe. Conferir URL, commit, target e variáveis antes da ação. Preservar tabelas, tarefas, resultados, fotos e histórico. Voltar o frontend não desfaz automaticamente os dados novos nem deve eliminá-los.

### Problema na sincronização

Desativar apenas o job `multichannel-operational-sync` via `cron.alter_job(jobid,active:=false)`. Preservar o ledger e o inventário, e operar cadastros/classificações manualmente. Conferir requests em voo e leases. Reverter a Edge ao pacote anterior salvo, se compatível; não apagar tarefas importadas para mascarar falhas.

### Problema no banco

Preferir correção aditiva ou restauração controlada testada. Não executar DROP/TRUNCATE, não remover fotos e não desabilitar triggers de inventário sem avaliar o risco de vender datas já ocupadas. Migrações não têm um “down destrutivo” nesta entrega justamente para preservar evidências e finanças. Se precisar desativar um trigger novo, fazer uma alteração pequena revisada, depois de pausar a rotina e confirmar que disponibilidade e cadastro manual permanecem protegidos.

Antes de reativar, repetir idempotência, vínculo manual/importado, mudança/cancelamento e leitura das duas etapas fotográficas. O retorno deve conservar os dados criados durante a operação.
