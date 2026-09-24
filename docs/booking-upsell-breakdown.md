# Price breakdown e upsell final

Regras implementadas no desenvolvimento:

- Experiência não é diluída no valor por noite.
- Resumo e Minhas Reservas exibem:
  - hospedagem total;
  - valor da hospedagem por noite;
  - taxa de limpeza;
  - cada experiência adquirida;
  - total da reserva / total pago.
- A reserva persiste snapshots separados:
  - accommodation_amount;
  - cleaning_fee;
  - experience_amount;
  - total_amount.
- O pacote adquirido também permanece em experience_order_items com nome e preço snapshot.

Upsell:
- não aparece junto do card da experiência;
- dispara somente quando o hóspede clica para iniciar pagamento;
- procura apenas o pacote imediatamente acima no mesmo package_type;
- só oferece se esse pacote superior estiver com upsell_enabled=true;
- oferece no máximo um pacote;
- recusar mantém a experiência original;
- aceitar substitui a experiência, recalcula quote e só então inicia pagamento.

Configuração atual de teste:
- Noite Romântica: R$ 549, upsell=false.
- Ultra Premium Lua de Mel: R$ 599, upsell=true.
- diferença oferecida: R$ 50.

Garantia:
- tratada como pré-autorização, não cobrança;
- captura somente em caso de dano/ocorrência comprovada;
- o texto informa corretamente que, conforme emissor, pode haver reserva temporária de limite.
