# Convite por WhatsApp na tarefa de faxina

## Problema e correção

Tela identificada pelas imagens do proprietário: PMS → Tarefas → Gerenciar conferência → Atribuir responsável. A opção para nova pessoa estava escondida em um acordeão; o caminho visível sugeria escolher uma conta existente ou passar pelo convite de equipe com e-mail.

Agora existe o botão explícito **Convidar pessoa nova pelo WhatsApp**. Em tarefas sem responsável, o formulário já aparece aberto. Ele pede nome e WhatsApp, sem e-mail. **Salvar e gerar convite** salva o contato, atribui a tarefa, atualiza a tela e gera o link individual em sequência. A pessoa confirma nome e WhatsApp no primeiro acesso; e-mail continua opcional.

Uma pessoa já cadastrada continua recebendo link sem repetir cadastro ou informar telefone à administração. Ao escolher uma pessoa nova, o identificador da conta anterior é limpo; nenhuma atribuição muda até o salvamento. Se apenas a geração do link falhar, é possível tentar novamente pelo botão existente, sem recriar a pessoa.

## Limites preservados

- Link continua limitado à tarefa atribuída, por sete dias e até sua conclusão.
- Reatribuição, expiração e encerramento continuam invalidando o acesso anterior.
- O convite não concede acesso amplo ao PMS ou à plataforma pública de faxinas.
- Tarefas encerradas não permitem novo convite sem reabertura justificada.
- Dados incorretos ou falha de rede preservam os campos. Ações simultâneas não geram convites duplicados.
- Nenhuma mensagem é enviada automaticamente: o administrador escolhe abrir a conversa no WhatsApp ou copiar o link.

## Verificação

29 testes aprovados em `inspection-admin-link`, `inspection-first-access`, `inspection-shared-screen` e `team-inspections`, incluindo testes de integração com o dispatcher SQL em PGlite. `node --check conferencias-admin.js` e `git diff --check` aprovados.

A Edge Function `team-inspections` e o dispatcher já publicados foram inspecionados somente para leitura. O cadastro por telefone sem e-mail e a confirmação no primeiro acesso já são suportados; a correção usa esse caminho existente. Não há migração, alteração de permissões ou deploy de backend nesta entrega. Nenhum contato ou convite de teste foi criado na produção e nenhuma mensagem foi enviada a uma profissional real.

Base: produção `dc2e8d944a7daa8e4ca50c30b35612a6468dee5e`. Escopo desta correção: somente a tela de administração da conferência e os testes correspondentes. A implementação anterior dos convites Ville Moments permanece preservada.
