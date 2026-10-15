# Link de conferência para conta já cadastrada

O cadastro por e-mail existente é reutilizado. Gerar o link não exige contato WhatsApp nem cria outro usuário. O número é opcional para abrir a conversa diretamente; sem número o administrador copia o link ou escolhe a conversa no compartilhamento do WhatsApp. Nenhum envio é automático.

A tela carrega o nome e ID do responsável no formulário de contato desde a primeira renderização. Trocas ainda não salvas e ausência de atribuição têm instruções ao lado do botão. O link aparece em campo copiável, com mensagens de andamento e erro no mesmo lugar. Conferências encerradas exigem reabertura justificada antes de um novo link.

## Validação

- `node --test tests/team-inspections.test.mjs`: 12 passaram, incluindo link para conta sem contato, restrição administrativa, vinculação exata à tarefa e revogação após troca.
- `node --test tests/inspection-admin-link.test.mjs`: 5 passaram; formulário preenchido, geração/cópia/compartilhamento sem telefone, erro local, atribuição salva, cliques repetidos e tarefa encerrada.
- `npm test`: 780 passaram, zero falhas.
- DEV Supabase: migração aplicada; transação com usuário QA existente sem telefone e tarefa sintética abriu a tarefa pelo link e confirmou revogação após remover o responsável. Rollback de todos os dados do ensaio.
- DEV privilégios: `anon` e `authenticated` continuam sem EXECUTE no dispatcher; somente backend autorizado pode chamá-lo.
- Migração: `20261015194229_inspection_links_for_existing_accounts.sql`, aplicada em DEV e PROD após validação DEV.

Os testes de interface desta correção usaram JSDOM; não houve aparelho Android/iPhone real nem envio de mensagem para pessoa real. Não foram modificadas a atribuição, a conta ou a tarefa real da pessoa relatada.
