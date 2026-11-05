# Tabela própria no PMS

Correção de DEVQA-2026-11-05-2220-UTC-001. Escopo de implantação e teste remoto restrito ao DEV `pxfqmnhqodqyaaqeyjgr`.

## Operação

- Em **Imóveis → [imóvel] → Preços**, ou no cabeçalho do imóvel no Multicalendário, selecione uma noite ou clique na primeira e na última noite. O intervalo é inclusivo. É possível filtrar por dia da semana e alterar até 366 noites por operação.
- A tabela tem diária padrão, diária opcional de sexta e sábado e personalização para cada dia da semana. As alterações por data aceitam valor fixo, ajuste percentual sobre a tabela própria e retorno à origem padrão. Um ajuste substitui somente as noites selecionadas. O calendário identifica a origem de cada diária.
- A mesma tela permite bloquear todo o intervalo e remover bloqueios do PMS. Reservas e bloqueios importados aparecem na grade. Regras de duração por período de entrada, janela, antecedência, preparação, check-in e checkout ficam em **Regras de disponibilidade**.
- Cada imóvel novo pode ser salvo pausado. Ativar exige sete diárias positivas. A validação ocorre na interface, na API e no banco. Imóveis ativos anteriores à migração podem manter a integração existente enquanto o responsável cadastra a tabela própria. A migração não atribui preços aos chalés reais.

## Precedência na reserva direta

| Cenário | Diárias aplicadas |
| --- | --- |
| Sem integração ativa, ou modo **Usar somente a tabela própria** | Diária manual da data; na falta dela, diária do dia da semana. |
| PriceLabs ativo no modo automático | Diária manual nas datas personalizadas e PriceLabs nas demais. A integração usa o ID externo e o PMS do vínculo. |
| Falha, preço ausente ou inválido em uma noite que depende do PriceLabs | Tabela própria na estadia inteira, incluindo as diárias manuais. |
| Sem PriceLabs utilizável e sem tabela própria | A busca indica tarifa indisponível e o servidor recusa a cotação. |
| Mínimo de estadia | Regras do PMS. No modo automático, quando o check-in tem mínimo válido do PriceLabs e o PMS está configurado para respeitá-lo, vale o maior mínimo. |

O calendário mostra preços isolados por noite. Uma busca de várias noites pode migrar para a tabela própria inteira se uma das noites dependentes do PriceLabs estiver sem preço. A indisponibilidade dos calendários conectados continua protegida independentemente da origem do preço. A leitura do PriceLabs preserva o caminho de compatibilidade já utilizado para os anúncios Airbnb legados quando a chave está ausente no DEV. O PMS não envia preços ao PriceLabs, Airbnb ou Booking.

Os descontos opcionais da tabela própria cobrem estadia semanal e mensal, antecedência e última hora. Vale o maior desconto elegível, sem somar descontos da tabela. Só vale para uma estadia composta integralmente por diárias próprias. O arredondamento é por noite em centavos; o checkout é exclusivo. A multiplicação pelos planos existentes do site, taxa de limpeza e eventuais ofertas vêm depois.

A cotação registra origem, motivo de fallback, desconto e valor por noite em centavos. Alterações de preço afetam cotações novas. O checkout de uma cotação válida mantém os valores do snapshot e revalida disponibilidade e políticas.

## Fixture

No DEV, o imóvel `QA-DEV-20261105-2220` usa terça de R$ 231,37 e exceção de quarta de R$ 257,68 para a estadia de 17 a 19/11/2026, sem integração ou fonte de calendário e com exportação desligada. Espera-se subtotal de 48.905 centavos e limpeza de 9.000 centavos. Com os planos ativos, os totais são 62.796 centavos na tarifa não reembolsável e 67.686 centavos na reembolsável.
