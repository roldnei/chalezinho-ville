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


## Regra final do upsell

- O valor do upsell nunca é fixo.
- O servidor procura o primeiro pacote com preço estritamente maior dentro do mesmo tipo.
- Esse pacote só é ofertado quando `upsell_enabled=true`.
- Diferença = preço atual do pacote superior - preço do pacote escolhido.
- Exemplo atual: R$ 599 - R$ 549 = +R$ 50.
- Se o pacote superior mudar para R$ 650, a diferença passa a ser calculada com R$ 650 automaticamente.
- Ao aceitar, o servidor clona a cotação atual e preserva hospedagem, taxa de limpeza, tarifa e expiração originais.
- Somente a experiência é substituída e o total aumenta exatamente pela diferença.
- O pagamento só começa usando a nova quote.
- O frontend mostra o novo total antes de prosseguir ao pagamento.


## Exibição de hospedagem ao hóspede

- A taxa de limpeza continua armazenada separadamente no banco para uso interno do proprietário.
- O hóspede vê apenas o valor consolidado da hospedagem.
- Valor da hospedagem = diárias + limpeza interna.
- Valor por noite = valor consolidado da hospedagem / número de noites.
- Nenhuma linha ou texto de taxa de limpeza aparece nas telas do hóspede.
- Experiências aparecem separadamente.
- Alterações aplicadas aparecem como "Revisão de tarifa da alteração" e entram no total pago.

## Alteração de reserva

- Antes da decisão administrativa, mostrar somente o possível valor da alteração.
- Estimativa = max(0, nova hospedagem consolidada - hospedagem consolidada atual).
- Experiências não entram nessa comparação.
- Depois da aprovação administrativa, mostrar o valor final para aceite do hóspede.
- Depois da aplicação, registrar lançamento financeiro e somar ao total da reserva.
