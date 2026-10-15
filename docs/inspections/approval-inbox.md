# Fila de aprovações administrativas — DEV, 15/10/2026

Endereço: `aprovacoes.html`. Atalho **Aprovações**, com contador, no topo do PMS e da Central, também em tela pequena. A fila atualiza ao abrir, a cada 30 segundos enquanto visível, ao voltar à aba e após aprovar uma vistoria. Falha de consulta aparece como erro; não como zero pendências. Há filtros por tipo e busca por imóvel/pessoa/solicitação.

O RPC `admin_approval_inbox` consulta diretamente os registros que ainda precisam de decisão. Não duplica tarefas nem usa notificações lidas como situação da aprovação. Ordena prioridades e antiguidade. As respostas de entrada e saída abrem o executor do PMS na tarefa exata, com aprovação em destaque e reabertura com justificativa. As demais ações abrem o módulo já responsável pela decisão; as regras e o histórico desses módulos permanecem. Nenhuma ocorrência é convertida automaticamente em cobrança.

Fontes integradas: conferências de entrada/saída; tarefas anteriores em vistoria; alterações e pedidos de cancelamento de reservas; pedidos válidos para o mesmo dia; ocorrências aguardando decisão; publicações em revisão; faxinas concluídas, alterações e ocorrências; liberação de participantes e verificação de recebimento; inclusão de bairros; Pix informado e transferências divergentes. Pedidos vencidos, espera pelo hóspede/pagamento ou pelo processamento do provedor não contam como aprovação humana. Serviços de teste marcados como tais são excluídos. Faxina ligada a uma tarefa operacional não duplica sua aprovação na fila.

A implementação é uma consulta única para o catálogo atual de decisões; um novo fluxo de aprovação deve adicionar sua origem a essa consulta. O registro e o histórico persistem nos módulos originais após sair da fila.

Segurança: somente `profiles.role=admin`, usuário identificado por `auth.uid()` e acesso não suspenso/cancelado. O wrapper público é SECURITY INVOKER e chama função privada com verificação explícita. Nenhum acesso de leitura às tabelas operacionais foi concedido a usuários da equipe. Sem service key no navegador. A fila não concede poder de decisão além dos endpoints originais.

Migração versionada `20261015153616_admin_approval_inbox.sql`, aplicada somente em DEV `pxfqmnhqodqyaaqeyjgr`, registrada remotamente como `20261015154159`. Produção `irxsaladqhbzhkoaclxy` não foi alterada.

Validação: 747 testes passaram (740 anteriores + 4 SQL + 3 interface), zero falhas; check de JavaScript e build DEV passaram. Testes cobrem entrada/saída e reentrada na fila; exclusão após decisão; leitura sem consumo da pendência; exclusão de vencidos; ausência de duplicidade de faxina vinculada; negação a anônimo/equipe/admin suspenso; falta de acesso direto às tabelas; filtro/busca; escape de conteúdo e URL externa; abertura da tarefa exata; clique duplo em aprovar gera uma única ação; contador diminui e item some ao retornar; falhas não exibem zero indevido. A aprovação na interface usou APIs controladas no teste, e a autorização/consulta real foram verificadas no DEV por RPC sob `authenticated`.

A consulta real DEV retornou um item: `Conferir saída · Ville Essenza`, enviado em 15/10/2026 às 12:32 (Brasília), tarefa `5b1a5d55-191c-48b9-a8be-990d6d9c3a53`. Nenhuma aprovação nem resposta do proprietário foi alterada para testar. O proprietário continua responsável por essa decisão. Nenhum aparelho Android/iPhone físico foi utilizado nesta atualização.

Advisors: nenhum novo WARN/ERROR. Permanece o aviso preexistente de proteção contra senhas vazadas desativada: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
