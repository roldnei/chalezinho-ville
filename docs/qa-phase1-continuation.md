# QA técnico — Fase 1 (continuação)

Validações automatizadas executadas em desenvolvimento:

- busca válida, datas inválidas, capacidade e mínimo de noites;
- mínimo de noites individual por propriedade conforme PriceLabs;
- multiplicadores 1,28 / 1,20 / 1,10;
- taxa de limpeza mantida somente internamente e hospedagem consolidada para o hóspede;
- quote de 15 minutos e preço congelado;
- quote não bloqueia inventário;
- hold somente ao iniciar pagamento;
- double booking bloqueado no banco;
- checkout de uma reserva pode coincidir com check-in da próxima;
- expiração de pending_payment libera inventário;
- upsell usa o próximo preço maior do mesmo tipo e diferença real;
- upsell preserva hospedagem e substitui apenas a experiência;
- experiência sem estoque é recusada;
- antecedência mínima de experiência é respeitada;
- RLS: hóspede não lê reserva/pagamento de outro hóspede;
- endpoints sensíveis exigem autenticação/admin;
- uma única alteração ativa por reserva;
- garantia parcial aceita; captura acima do autorizado bloqueada também no banco;
- config e busca receberam retry server-side para falhas transitórias do Supabase;
- config stress: 10/10 respostas 200 após retry;
- busca stress: 10/10 respostas 200 após retry.

Pendências pré-GO-LIVE:
- ativar Leaked Password Protection no Supabase Auth;
- aprovar/publicar Termos de Hospedagem, Regras da Propriedade e Política de Privacidade;
- configurar definitivamente gateway real e testar seus webhooks/refunds/pré-autorização.
