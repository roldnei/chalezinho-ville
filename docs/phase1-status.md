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
- Entrega de e-mail desacoplada por `EmailProvider`; Brevo é o primeiro adaptador e pode ser substituído por configuração.
- PIX 15 min e parcelamento configuráveis.
- Hold transacional somente no início de pagamento.
- Expiração de holds.
- Ciclos de vida independentes para reserva e pagamento: falha antes da confirmação gera `not_confirmed`, nunca `cancelled`.
- Reserva `cancelled` é exclusiva para hospedagem que já havia sido confirmada; `no_show` está previsto para ausência do hóspede.
- Pagamentos distinguem aguardando, ação necessária, processamento, análise, aprovação, recusa, expiração, cancelamento, reembolso, disputa e chargeback.
- Ledger financeiro em centavos.
- Minhas Reservas.
- Alteração de data/propriedade com referência, decisão do admin, aceite e histórico.
- Garantia/caução mock, ocorrência e captura parcial.
- Analytics event model e instrumentação da jornada no frontend.
- Carrinho pós-reserva separado de cobrança, pagamentos pendentes e retry de tentativa recusada.
- Outbox transacional com catálogo de templates, dedupe, claim, retry/backoff e falha final.
- RLS e papéis guest/admin.
- Rota interna de operações da Fase 1 (não é o PMS da Fase 2).
- Central administrativa unificada em desenvolvimento: agenda, entradas/saídas, reservas, alertas, financeiro, experiências e imóveis.

## Não é GO-LIVE

- páginas novas permanecem no Preview / branch desenvolvimento;
- páginas possuem noindex;
- pagamento real desativado;
- produtos de experiência atuais são marcados [DEV]/draft;
- Termos/Regras/Privacidade são rascunhos de desenvolvimento;
- nenhum botão/login novo deve ser promovido para produção sem autorização explícita.

## Fechamento técnico

- Edge Function booking-engine: versão 40 ativa no Supabase.
- Último smoke técnico: config 200, search 200 e cobertura Booking.com ativa para CH1/CH2/CH3.
- pg_net temporário removido após QA.
- Índices de FKs adicionados para crescimento.
- Advisors de segurança sem alerta crítico; avisos restantes são tabelas server-only deliberadamente sem policy pública.
- Site URL e redirects do Supabase Auth configurados para produção e Preview.
- Booking.com ativo nos três chalés por feeds iCal independentes.

## Dependências antes do GO-LIVE

1. Aprovação dos documentos jurídicos finais.
2. Escolher/configurar gateway real.
3. QA visual final e aprovação do produto.
4. Limpeza dos registros/dados marcados como desenvolvimento.
5. Checklist de GO-LIVE e rollback.
6. Escolher/configurar o provedor transacional de e-mail.
7. Avaliar upgrade do Supabase para habilitar Leaked Password Protection (recurso indisponível no plano Free atual).


## QA técnico mais recente

- booking-engine ativa no Supabase: v40.
- alteração de reserva e captura de garantia endurecidas com operações atômicas no banco.
- nenhum pagamento real ativado.
- produção pública continua fora deste fluxo de GO-LIVE.

### Lacunas técnicas ainda abertas da Fase 1

1. Documentos jurídicos finais aprovados.
2. Gateway real + webhooks/refunds/pré-autorização.
3. Provedor transacional de e-mail e credenciais.
4. Leaked Password Protection, dependente de plano Supabase Pro ou superior.
5. Aprovação visual humana final nos viewports obrigatórios.
