# PMS — Equipe e acessos

## Perfis operacionais

- `admin`: proprietário administrador, todos os imóveis e módulos.
- `host`: gerente ou anfitrião, com imóveis e módulos explicitamente autorizados.
- `staff`: limpeza/operação, normalmente limitado a tarefas e checklists.
- `service_provider`: prestador, normalmente limitado a manutenção e demandas atribuídas.

O perfil de hóspede (`guest`) não entra no PMS.

## Fluxo

1. O administrador informa nome, e-mail, função, atividade e imóveis.
2. O Supabase Auth envia o convite sem compartilhar senha.
3. Após confirmar o e-mail, o acesso operacional passa a `active`.
4. O administrador pode alterar escopo ou suspender a conta. Suspensão não apaga tarefas, auditoria nem histórico.

## Segurança

- Convites e alterações passam exclusivamente pela Edge Function `pms-operations` usando `service_role`.
- `pms_team_invitations` tem RLS e nenhum grant para `anon` ou `authenticated`.
- O frontend nunca decide autorização nem envia preço/valor financeiro.
- Administrador acessa todos os imóveis; qualquer outro papel precisa de IDs explícitos.
- Operadores sem permissão financeira não recebem pagamentos, cobranças ou garantias no payload.
- Operadores sem permissão de reservas não recebem e-mail, telefone ou valores do hóspede.
- O último administrador ativo não pode ser suspenso ou rebaixado.

## Auditoria

Convite, edição, suspensão e cancelamento de convite geram eventos em `audit_events`, com responsável e alterações relevantes.
