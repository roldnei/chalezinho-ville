# Central administrativa

Rota interna: `admin.html` (somente usuários com `profiles.role = admin`).

## Objetivo

A Central administrativa reúne a operação diária da reserva direta em linguagem de hospedagem, sem exigir acesso ao Supabase ou conhecimento de códigos internos.

## Áreas

- **Hoje:** entradas, saídas, hóspedes presentes, próximas chegadas e pendências.
- **Calendário:** reservas diretas, reservas manuais, pagamentos em andamento e bloqueios Airbnb/Booking.com por imóvel.
- **Reservas:** busca por hóspede, código, telefone ou e-mail; filtros por imóvel e situação.
- **Detalhe da estadia:** contato, datas e horários, experiências, pagamentos, alterações, garantia, notas internas e ações operacionais.
- **Notificações:** novas reservas, solicitações de alteração, pagamentos em análise/recusados, experiências/upsells aplicados e ocorrências de garantia.
- **Alterações:** aprovação ou recusa, valor adicional, proteção temporária das novas datas e acompanhamento até aplicação ou vencimento.
- **Financeiro:** leitura consolidada dos pagamentos registrados no núcleo financeiro independente do gateway.
- **Garantias:** pré-autorizações, registro de ocorrência, captura parcial e liberação.
- **Imóveis:** cadastro e edição dos dados operacionais, capacidade, taxa de limpeza, garantia e horários.
- **Experiências:** acesso ao cadastro existente de pacotes, fotos, preço, status e upsell.
- **Configurações:** parcelamento, validade do Pix, prazos pós-reserva/alteração e saúde das integrações de calendário.

## Ações operacionais

- registrar check-in e checkout;
- adicionar notas internas com histórico;
- criar reserva manual com verificação de conflito em reservas diretas, holds, alterações e calendários externos;
- cancelar reserva confirmada, registrando ator e motivo (sem reembolso automático);
- marcar notificações como lidas;
- cadastrar ou atualizar imóveis.
- analisar alterações de reserva sem retirar a validade da reserva original;
- gerir garantias e ocorrências sem confundir pré-autorização com pagamento;
- alterar regras comerciais sem editar o banco manualmente.

## Segurança

- a tela exige sessão autenticada e papel `admin`;
- os endpoints repetem a validação de administrador no servidor;
- `admin_notifications` e `reservation_notes` não concedem acesso a `anon` ou `authenticated`;
- as tabelas são acessadas somente pelo backend com `service_role`;
- ações relevantes geram `audit_events`.

## Limites atuais de desenvolvimento

- gateway financeiro continua mock;
- cancelamento não gera reembolso automático;
- calendários externos trazem apenas períodos bloqueados, porque iCal não expõe todos os dados do hóspede;
- produção e `main` permanecem sem esta rota até autorização de GO-LIVE.
