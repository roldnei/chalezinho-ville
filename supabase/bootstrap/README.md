# Backend isolado de homologação

Destino criado: `pxfqmnhqodqyaaqeyjgr` (`chalezinho-ville-finance-dev`). Plano gratuito.
O banco anterior `irxsaladqhbzhkoaclxy` não foi alterado.

Os três SQL numerados recuperam a estrutura histórica que antecede a refatoração.
São exclusivos para um projeto vazio: executar em ordem, uma única vez. Não fazem
parte da sequência incremental normal de migrations. Não contêm hóspedes,
reservas, pagamentos ou credenciais copiados. Apenas três chalés são semeados.
O histórico veio de `supabase_migrations.schema_migrations` do projeto original.

Depois, aplicar as migrations de `20260929023043_reservation_finance_ledger.sql`
em diante. No destino acima, essas quatro etapas já estão registradas como
`finance_isolated_foundation`, `finance_isolated_booking_history`,
`finance_isolated_operations_payments` e `reservation_finance_refactor`.

Os agendamentos de chamada HTTP do projeto anterior foram excluídos para evitar
contato com o backend compartilhado. O envio de e-mail não está habilitado.
O agendamento de cauções deve apontar exclusivamente para o novo projeto após a
validação de suas funções. Não copiar tokens ou usuários do banco original.

Segredos necessários nas Edge Functions: `FINANCE_ENVIRONMENT=development` e
`PAGBANK_SANDBOX_TOKEN`. O token nunca deve entrar no frontend ou no repositório.
Funções: `booking-engine`, `guarantee-preview`, `pagbank-webhook`.
Todas verificam o ambiente; as ações autenticadas verificam o usuário no servidor.

Configuração pública em `app-config.js`; reserva, estorno e consulta financeira
usam `booking-engine`. Caução usa `guarantee-preview` e o mesmo ledger por reserva.
O build recusa produção e o projeto compartilhado anterior.
