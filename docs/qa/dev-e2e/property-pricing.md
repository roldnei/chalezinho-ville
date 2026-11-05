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

## Reteste DEV em 05/11/2026

- Busca restrita ao imóvel sintético antes de configurar preço retornou `rate_unavailable`. Depois da configuração retornou um imóvel disponível, origem `own` e 48.905 centavos.
- A cotação DEV e suas opções gravadas tiveram diárias de 23.137 e 25.768 centavos, limpeza de 9.000 centavos e totais de 62.796 e 67.686 centavos. Ao acrescentar 100 centavos à exceção de quarta, a nova cotação teve subtotal de 49.005 centavos e total não reembolsável de 62.906 centavos. A anterior manteve seu snapshot. A exceção foi restaurada.
- O imóvel sintético terminou com zero reservas, zero integrações, zero fontes de calendário e exportação desabilitada. Conexões, configurações de calendário, exportações e regras de disponibilidade dos três chalés reais foram comparadas antes e depois e mantiveram os mesmos valores.
- Seis regressões específicas aprovadas. A suíte geral aprovou 1.052 de 1.054 testes. As falhas de `pms-review.test.mjs` e `stay-showcase.test.mjs` também reproduziram no commit-base. O build de checkout e o TypeScript passaram.
- O reteste remoto cobriu busca e cotação sem sessão. PriceLabs e controles do PMS foram testados com fixtures. O checkout, o recibo e o PMS autenticado em navegador fazem parte da homologação seguinte.
- O patch de preço foi aplicado sobre a versão 79 do booking-engine já ativa no DEV para preservar as regras de calendário e o formato da exportação que estavam implantados. O booking-engine resultante é a versão 80.
