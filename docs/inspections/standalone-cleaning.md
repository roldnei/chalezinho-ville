# Limpeza antes de existir uma hospedagem

Implementado e validado em DEV em 15/10/2026. Produção não foi alterada por esta entrega.

## Uso

1. PMS → Tarefas → **+ Limpeza sem hospedagem**. Escolher chalé, início e prazo.
2. Atribuir o responsável e enviar o link individual pelo fluxo existente.
3. A pessoa executa o mesmo checklist de preparação, envia fotos e conclui. A conferência vai para aprovação normalmente, mesmo sem hospedagem.
4. Em **Limpezas aguardando hospedagem**, abrir a limpeza concluída e escolher **Vincular limpeza à hospedagem** quando aparecer uma hospedagem confirmada do mesmo chalé.
5. A hospedagem passa a mostrar a mesma tarefa, checklist aplicado, respostas, fotos e histórico. Aprovar antes ou depois do vínculo não muda a decisão já registrada.

O vínculo exige administrador ativo e conferência enviada para inspeção ou aprovada. Não cria reserva fictícia, cobrança ou contrato de limpeza. Uma preparação automática somente pode ser substituída se estiver pendente, sem responsável, início, respostas, fotos ou contrato. Havendo trabalho iniciado, o vínculo é recusado. Uma hospedagem intermediária ou limpeza concluída após a entrada também exige outra limpeza.

O banco faz o vínculo e a substituição atomicamente, com a mesma trava da sincronização. A tarefa automática substituída permanece no histórico com sua versão original. Repetir o vínculo é idempotente. As fotos conservam IDs e caminhos privados; somente recebem a referência da hospedagem. Fotos de saída permanecem separadas. Permissões da equipe e links individuais seguem o fluxo existente; somente o administrador pode vincular.

## Validação

- Suite completa: **762 testes passaram**, zero falhas. Inclui 8 novos testes PostgreSQL/PGlite e 3 de interface JSDOM para este fluxo.
- `npm run check`, `node --check operations-workspace.js`, `git diff --check` e build DEV com perfil `whatsapp`: aprovados.
- API real DEV: criação de limpeza avulsa HTTP 200; cinco uploads JPEG HTTP 200; conclusão HTTP 200; vínculo posterior HTTP 200; repetição HTTP 200. Uma tentativa com checklist incompleto recebeu HTTP 409 `invalid_checklist`, antes da conclusão válida.
- Consulta de aprovação/detalhe retornou a mesma tarefa em inspeção, cinco fotos e seis respostas (incluindo o item de comodidade ausente, oculto). Os cinco URLs privados das fotos responderam HTTP 200.
- Duas sincronizações e repetição do vínculo mantiveram uma preparação ativa e um evento de vínculo. O placeholder ficou arquivado, sem exclusão.
- Chamada do vínculo com perfil de equipe recebeu HTTP 403 `admin_required`. A função SQL não é executável por `anon` ou `authenticated`.
- Fixtures usadas exclusivamente no DEV: chalé QA inativo ID 5, hospedagem `3621979e-4311-475b-aab9-09e87e25dbc7`, tarefa `4ed0eaa1-15c9-4721-a34f-98ba5f712fc4`. Após os testes, hospedagem marcada como teste/cancelada e tarefas arquivadas. Conta sintética restaurada para convidado suspenso, bloqueada e com senha aleatória. Nenhuma hospedagem real foi alterada.
- Não houve teste com câmera em Android/iPhone físico nesta entrega. Interface coberta por JSDOM; uploads e abertura das fotos verificados por API no DEV. Essa validação não equivale a uso de câmera em aparelho real.
- Advisor de segurança: nenhuma nova exposição identificada; permanece o aviso preexistente de proteção contra senhas vazadas desativada ([referência](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

## Ambientes e mudanças

- Branch: `feature/team-inspections-20261015`.
- Migração no repositório: `20261015180248_link_standalone_preparation.sql`. Registrada pelo Supabase DEV como `20261015180924_link_standalone_preparation`.
- Edge Function DEV `multichannel-operations`: versão **7**, ação `link_preparation`.
- Supabase DEV: `pxfqmnhqodqyaaqeyjgr`. Supabase PROD `irxsaladqhbzhkoaclxy`: sem alterações por esta entrega.
- Não inclui associação de serviços já contratados pela plataforma de limpeza; o fluxo preserva esses contratos recusando substituí-los automaticamente.
