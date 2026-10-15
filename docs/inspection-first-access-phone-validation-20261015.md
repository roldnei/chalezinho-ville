# Telefone no primeiro acesso à conferência

Ao abrir um link individual, a pessoa sem perfil de conferência concluído confirma o nome e informa o próprio telefone/WhatsApp com DDD. O campo é editável mesmo quando o administrador já informou um número. A interface valida o formato, salva e abre o checklist existente do PMS. Falha de envio mantém os campos preenchidos; botão em andamento não envia duas vezes.

O dispatcher retorna perfil pendente também para quem tem apenas cadastro por e-mail, sem contato operacional. O perfil é criado/atualizado no ID derivado da sessão ou do link autorizado. Um `user_id` enviado no formulário é ignorado. Telefone duplicado falha sem mover contas ou permissões. O número é um contato operacional informado pela pessoa; não altera o telefone de autenticação nem o trata como verificado por SMS.

Validação:

- `npm test`: 784 passaram, zero falhas.

- 16 testes direcionados passaram (4 de primeiro acesso, 12 de banco/fluxo integrado): número obrigatório, normalização com DDD, falha com dados preservados, edição de número pré-preenchido, conta existente sem contato, ID forjado ignorado, conflito de telefone, nenhuma nova conta Auth, atribuição e revogação.
- DEV real: migração aplicada e transação com tarefa sintética e usuário QA existente comprovou perfil pendente, telefone salvo no mesmo ID e ausência de nova conta. Todos os dados de ensaio sofreram rollback.
- Revisão de segurança: dispatcher segue SECURITY INVOKER com caminho explícito; sem novos grants/policies/tabelas; autorização e revogação anteriores preservadas. Advisor DEV não indicou novo problema da alteração.
- Interface validada em JSDOM; esta correção não foi testada em aparelho físico Android/iPhone.

Migração: `20261015195137_inspection_first_access_phone.sql`. Aplicada em DEV e PROD após validar DEV e suíte completa.
