# Fase 1 — Estado atual

## Implementado em desenvolvimento

- Fundação data-driven de propriedades.
- Supabase Auth: cadastro, confirmação de e-mail, login, logout, recuperação e redefinição de senha.
- Perfil do hóspede + solicitação de exclusão.
- Busca de disponibilidade e preço.
- Quote server-side por 15 minutos.
- Tarifas 1,28 / 1,20 / 1,10 com limpeza separada.
- Funil sem carrinho e login tardio.
- Catálogo configurável de experiências, variantes, elegibilidade e antecedência.
- Payment provider desacoplado, provider atual mock.
- PIX 15 min e parcelamento configuráveis.
- Hold transacional somente no início de pagamento.
- Expiração de holds.
- Ledger financeiro em centavos.
- Minhas Reservas.
- Alteração de data/propriedade com referência, decisão do admin, aceite e histórico.
- Garantia/caução mock, ocorrência e captura parcial.
- Analytics event model.
- RLS e papéis guest/admin.
- Rota interna de operações da Fase 1 (não é o PMS da Fase 2).

## Não é GO-LIVE

- páginas novas permanecem no Preview / branch desenvolvimento;
- páginas possuem noindex;
- pagamento real desativado;
- produtos de experiência atuais são marcados [DEV]/draft;
- Termos/Regras/Privacidade são rascunhos de desenvolvimento;
- nenhum botão/login novo deve ser promovido para produção sem autorização explícita.

## Fechamento técnico

- Edge Function booking-engine: versão 10 ativa no Supabase.
- Último smoke técnico: config 200 e search 200.
- pg_net temporário removido após QA.
- Índices de FKs adicionados para crescimento.
- Advisors de segurança sem alerta crítico; avisos restantes são tabelas server-only deliberadamente sem policy pública.

## Dependências antes do GO-LIVE

1. Aprovação dos documentos jurídicos finais.
2. Definir cobertura de disponibilidade do Booking.com.
3. Escolher/configurar gateway real.
4. QA visual final e aprovação do produto.
5. Limpeza dos registros/dados marcados como desenvolvimento.
6. Checklist de GO-LIVE e rollback.


## QA técnico mais recente

- booking-engine ativa no Supabase: v24.
- alteração de reserva e captura de garantia endurecidas com operações atômicas no banco.
- nenhum pagamento real ativado.
- produção pública continua fora deste fluxo de GO-LIVE.

### Lacunas técnicas ainda abertas da Fase 1

1. Cobertura explícita de Booking.com na disponibilidade.
2. Instrumentação dos eventos de analytics no frontend.
3. Compra de experiências pós-reserva na Área do Hóspede.
4. Documentos jurídicos finais aprovados.
5. Gateway real + webhooks/refunds/pré-autorização.
6. Leaked Password Protection no Supabase Auth.
7. QA visual final nos viewports obrigatórios.
