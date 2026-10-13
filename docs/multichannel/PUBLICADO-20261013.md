# Publicação em produção — 13/10/2026

Publicado por autorização explícita do proprietário: “Já podemos subir para produção? Faça”. Este registro substitui o estado pré-publicação dos documentos anteriores; não significa homologação de recursos fora desta etapa.

## Versão entregue

- Site: https://chalezinhoville.com.br
- Commit de aplicação: `697f22ce584b4379518bf1e0871e03d3d442f32e`.
- Deployment READY: `dpl_AhWoU38y8cxAvuZ3FAuj2g7PsoTo`.
- URL imutável: https://chalezinho-ville-l49vkphsk-roldneicosta-4140.vercel.app
- Build com ambiente PROD `irxsaladqhbzhkoaclxy`, perfil `whatsapp` e endpoint público `public-consultation`. Nenhum build DEV promovido.
- Checkout/PagBank preservados no código, sem habilitação pública nesta etapa.

## Banco e funções

Aplicada a migração atômica `multichannel_reviewed_rollout_20261013`, contendo as nove migrações revisadas listadas em `production-reviewed.sql`, sem copiar fixtures/dados DEV. O cron foi criado inativo, validado por execução controlada e depois ativado.

| Função | Versão PROD | Alteração |
|---|---:|---|
| multichannel-operations | 1 | Ledger e operação multicanal |
| pms-operations | 14 | Wrapper pms-launch-compat preservado; remove geração legada duplicada; fotos antigas somente leitura |
| booking-engine | 70 | Inventário operacional e exclusão explícita de fixtures; demais arquivos PROD preservados |
| public-consultation | 2 | Sem alteração |

A compatibilidade do wrapper PMS foi exercitada em DEV com administrador: atualização do hub sem aumento das 30 tarefas legadas ou 56 tarefas operacionais existentes. Depois foi restaurada a função completa DEV, versão 15.

## Resultado da sincronização

Execuções manuais pg_net 24349 e 24352: HTTP 200 e seis fontes com sucesso. A repetição não duplicou tarefas.

Execução automática real às **09:30 de São Paulo (12:30 UTC)**: cron run 35456 `succeeded`; seis `ops_sync_runs` concluídos com `success`, erro nulo, entre 12:30:00 e 12:30:04 UTC. Não houve mudança de relógio ou antecipação artificial do agendamento. Job ativo a cada dez minutos.

Conferência às 09:33:13 de São Paulo:

- 4 hospedagens identificadas, 5 tarefas operacionais, 0 hospedagens de teste.
- 45 contatos preservados; 0 reservas nativas e 0 pagamentos, como antes da publicação.
- Essenza 09–13/10: somente conferência de saída, sem preparação retroativa.
- Essenza 24–26/10 e Amore 23–25/10: preparação e conferência de saída.
- Amore 09–12/10: nenhuma tarefa retroativa. Saída informada pelo proprietário em 12/10 registrada; horário efetivo continua desconhecido, sem inventar checked_out_at.
- Os feeds Booking continuam informando bloqueios CLOSED; não foram convertidos em hospedagens confirmadas. Classificação ambígua requer revisão humana.

## Verificação e limites

- Suíte previamente executada no código entregue: **537 testes aprovados, zero falhas**. Log em `outputs/release-20261012/tests-preflight-20261013.txt`.
- Site oficial observado no navegador em 1440×900 e 360×800: home → datas 19–21/10, dois hóspedes → três chalés → Signature → resumo R$ 1.255,20 → botão Abrir WhatsApp. Nenhuma mensagem enviada, cobrança ou reserva criada.
- API pública search HTTP 200 com opções; start_payment HTTP 403 `consultation_operation_not_allowed`; hub multicanal sem autenticação HTTP 403 `operator_required`.
- Capturas reais: `production-desktop-20261013.jpg`, `production-mobile-20261013.jpg` e `pms-compat-dev-20261013.jpg`, na pasta de evidências acima. Emulação de viewport não equivale a aparelho Android físico.
- **Atualização após login:** painel PROD conferido no navegador em 1440×900: Hoje, Hospedagens, Calendários, fila com cinco tarefas, abertura do checklist de saída e PMS. As seis fontes mostram atualização concluída. Nenhuma tarefa real foi iniciada/concluída nem recebeu fotos de teste. A tentativa de viewport 360×800 nesta sessão não foi aplicada à aba (DOM permaneceu 1440×900), portanto não conta como validação móvel do painel autenticado.

## Correção dos vínculos de hóspedes após publicação

O proprietário identificou que os vínculos existentes em `guest_stay_links` não apareciam no hub novo, que lia apenas `ops_stays.guest_name`. Corrigido no commit `7eb8522e`: leitura dinâmica do cadastro por vínculo explícito de reserva ou calendário, imóvel, canal e período. Não houve migração, cópia de contato, alteração de datas, criação de hospedagens ou duplicação de tarefas. Identidades conflitantes não são resolvidas por adivinhação e permissões de acesso aos hóspedes continuam sendo respeitadas.

Publicada `multichannel-operations` DEV v4 e PROD v2, SHA256 `5ce4929fb992f65bea99986f40b6d7ad33a0614f3ec6ea5f841786045b8198a5`. Frontend permanece no deployment original desta entrega. Onze testes de diretório/vínculos e 41 testes multicanais aprovados (52 nesta correção). Hub DEV recarregado sem erro; em PROD, nomes vinculados foram observados em Hoje, Hospedagens e PMS, e contato no formulário de detalhes, sem salvar dados reais. Captura local `production-linked-guest-20261013.jpg`; dados de contato não são incluídos no relatório.

## Backup e retorno

Backup privado anterior às alterações: `C:\Users\Roldn\Documents\ChalezinhoVille-Backups\PROD-20261013\backup-20261013.zip`. SHA256 `7f28576ca9500e05565be70af31aac23a4eeaacb7fd38a15e7f5f500c6af6231`. Fora do Git, com acesso local restrito. Inclui snapshot de 78 tabelas/1552 linhas, definições, 12 pacotes de funções e 23 objetos Storage. Restauração de dados em PGlite e integridade de 44 arquivos do ZIP verificadas. Não é restauração integral da plataforma: não inclui secrets/sessões nem valida execução dos serviços externos.

Rollback frontend preservado: deployment `dpl_CSqwT4w5eHtc5gCQ3jyg6U2VmPDu`, commit `4b54aee214493337b27edcc780bc1de155c632f3`, https://chalezinho-ville-cp6rxhx84-roldneicosta-4140.vercel.app . Pacotes anteriores das funções estão no backup. Se necessário, pausar apenas o cron operacional, restaurar frontend/funções compatíveis e preservar ledger, tarefas, contatos, fotos e histórico; não apagar tabelas para reverter a publicação.

O commit que adiciona este relatório é documental; a aplicação publicada continua no commit indicado acima.

## Ajustes posteriores — presença, filtros e reserva Booking confirmada

Publicado frontend `b9af1412ac3078931ab950fbd6cfa65516b33686`, deployment READY `dpl_2y3rgUJVWD4kZSx16dhyVw4bSreL` (https://chalezinho-ville-mupd6t1bc-roldneicosta-4140.vercel.app), incluindo o ajuste anterior `690846f1`. Função multichannel-operations PROD v3 / DEV v5, hash `41d927d8f129e6619aa717af32ef535f808efcccec97ad159af8fc8e3a1a050c`.

- O relato de entrada sem efeito foi investigado: entrada existente às 09:45 de 13/10; tentativas subsequentes produziram attendance_not_allowed. Registro real preservado. Botões já realizados ficam desabilitados; entrada e saída têm formulário explícito, confirmação do horário atual, sucesso e erro visíveis. Saída exige referência de pelo menos cinco caracteres. Nenhuma saída real foi registrada pelo agente.
- Campo esclarecido como total de hóspedes (adultos e crianças), sem alterar o valor informado pelo proprietário.
- Indicadores Hoje viraram filtros de hospedagens e tarefas correspondentes, com Limpar filtro e estado aria-pressed.
- Reserva Booking confirmada pelo proprietário/captura Pulse foi reconciliada manualmente no Signature, 11–13/10/2026, dois adultos, mantendo pagamento externo e o contato existente. Não se generalizou a classificação de todos os eventos CLOSED. Criada uma única tarefa de saída, sem preparação retroativa. Agora há cinco hospedagens e seis tarefas.
- 33 testes UI/banco aprovados no ajuste de presença; teste transacional DEV de entrada e saída executou ambos com sucesso e ROLLBACK. Depois, 11 testes UI/vínculos aprovados incluindo filtros. Quantidades se sobrepõem e não devem ser somadas como suíte única.
- Navegador PROD: entrada já registrada desabilitada; formulário de saída abriu sem persistir; Saídas previstas mostra duas hospedagens e duas tarefas de saída; Limpar filtro restaura seis tarefas. Captura local production-departures-filter-20261013.jpg. Um carregamento PMS falhou transitoriamente após atualização, recuperando no botão Atualizar; causa não determinada nesta rodada.
