# Estadias com experiências — implementação em desenvolvimento

Avaliação e verificação em 5 de outubro de 2026.

## Ambiente confirmado

- Repositório: `roldnei/chalezinho-ville`.
- Branch isolada: `feature/romantic-stay-offers`, criada sobre `b9fc94499b64de79a40efc4446176f8222019808`.
- Código verificado: `ba60e4a9bef6a6f1b1bca217a70b79e78c42a29f`.
- Deployment Preview: https://chalezinho-ville-gmmyquwng-roldneicosta-4140.vercel.app/ — `dpl_9TDZvmmYuyfRvHt4oiQ53qiaJiK7`, READY, sem destino de produção. A Vercel exige sessão ou link temporário de revisão.
- Banco exclusivo: `chalezinho-ville-finance-dev`, referência `pxfqmnhqodqyaaqeyjgr`.
- Nenhum deployment ou banco de produção foi alterado.
- Migrações aplicadas no DEV: `20261005201531_romantic_stay_offers` e `20261005203843_experience_service_day_capacity`.
- Funções DEV: booking-engine versão 44; pms-operations versão 12. Autenticação existente preservada.

## Avaliação da versão anterior

Revalidados pelo código, banco e navegação pública: tarifas sobre diárias do PriceLabs, limpeza, experiências, pagamento, catálogo com imóveis participantes, preparação genérica, páginas públicas parcialmente fixas e ausência de oferta completa na cotação inicial. As comodidades e os documentos versionados já existentes foram preservados.

O PMS e a área do hóspede exigiram autenticação. Sua estrutura e persistência foram avaliadas pelo código e banco, mas o login seguro não produziu uma sessão confirmada no navegador. Não considerar a avaliação visual autenticada concluída.

## Mudanças entregues

- Catálogo de estadias completas com pacotes existentes, imóveis participantes, duração flexível, período, fotos, ativação e desconto configurável. Prévia valida incompatibilidades e pacotes pausados.
- Editor de experiências com componentes, quantidades, frequência, escolhas, imóveis, venda avulsa, uso em ofertas, antecedência, capacidade diária e estoque.
- Oferta visível na home, páginas individuais, comparação e reserva. Somente hospedagem permanece disponível. Nenhuma regra geral de três noites foi adicionada.
- Cotação do servidor: tarifa dinâmica + limpeza + pacotes incluídos, menos desconto da oferta identificada explicitamente. Extras avulsos ficam pelo preço cheio; caução e juros usam o módulo existente.
- Rateio do desconto por componente em centavos com preservação do total. Valores líquidos alimentam reserva, pedidos de experiências e financeiro existentes.
- Composição, preferências, condições e preços contratados copiados para a reserva e pedidos. Catálogo editado posteriormente não reescreve contratos.
- Seleção e preferências preservadas na navegação, retomada e recarga. Trocas removem imediatamente preços antigos e aguardam recálculo antes de novos cliques.
- Preparação automática por eventos, com checklist dos itens e preferências. Frequência define os dias de entrega; alteração e cancelamento retiram tarefas antigas, preservando histórico.
- Área do hóspede distingue contratação original das experiências atuais. Confirmação exibe a composição contratada.
- Condições completas de cancelamento em seção expansível. Histórico e aceite dos documentos versionados continuam no fluxo existente.

## Resultados

Typecheck, build com proteção contra produção e **239 testes automatizados aprovados**. Os testes de UI com JSDOM e de Postgres com PGlite são simulações; não substituem homologação do provedor ou navegação autenticada.

| Cenário | Evidência obtida |
| --- | --- |
| Oferta desde home e imóvel | Navegador real: oferta e link com CH1 preservado |
| Duas noites | Navegador e API: 10–12/11/2026, Signature e Amore disponíveis; Essenza ocupada |
| Somente hospedagem | API real e UI automatizada: desconto zero e sem inclusões automáticas |
| Tarifas | API: reembolsável e não reembolsável calculadas; referência não selecionável |
| 5%, 10% e desativado | Percentual alterado no banco DEV e novas cotações conferidas na API; não foi uma edição visual pelo PMS |
| Avulso antes do pagamento | API: café com desconto zero; item romântico incluído enviado novamente não duplicou a cobrança |
| Avulso depois da reserva | RPCs reais de carrinho e checkout no DEV: café pelo preço cheio, sem desconto retroativo. Nenhum pagamento enviado ao provedor |
| Composição e preparação | Reserva simulada no DEV, cópia persistida e dois checklists de três itens gerados por eventos |
| Alteração de datas | Banco DEV: preparos antigos cancelados, novos criados; PGlite também cobre troca de imóvel |
| Pausa/edição | Banco DEV e PGlite: composição contratada permanece igual |
| Cancelamento | Duas reservas de QA encerradas; zero tarefas novas ativas; histórico preservado |
| Capacidade e frequência | Postgres simulado: chegada não bloqueia dias seguintes; serviço diário ocupa seus dias; edição do catálogo não muda frequência contratada |
| Preferências, retomada e cliques | UI automatizada: escolhas obrigatórias, retomada, remoção de preços antigos e bloqueio durante recálculo |
| Acesso administrativo | API real: edição sem autenticação negada com `403 admin_required` |
| Responsividade pública | Navegador real com conteúdo em iframe de largura definida; não é um aparelho físico. Seletor do checkout corrigido para caber na largura móvel |

### Exemplo de preço conferido

Ville Signature, 10–12/11/2026, dois hóspedes, tarifa não reembolsável. O pacote demonstrativo custa R$ 1,00 e não representa preço comercial aprovado.

| Composição | Valor |
| --- | ---: |
| Hospedagem na tarifa | R$ 1.307,90 |
| Limpeza | R$ 290,00 |
| Experiência incluída de teste | R$ 1,00 |
| Total antes do desconto | R$ 1.598,90 |
| Desconto de 5%, arredondado em centavos | R$ 79,95 |
| Total antes de juros | R$ 1.518,95 |
| Com café avulso de teste, pelo preço cheio | R$ 1.519,95 |
| Com desconto de 10%, sem café | R$ 1.439,01 |
| Desconto desativado, sem café | R$ 1.598,90 |
| Somente hospedagem e limpeza | R$ 1.597,90 |

O desconto de 5% foi distribuído em R$ 65,40 na hospedagem, R$ 14,50 na limpeza e R$ 0,05 na experiência incluída. O avulso não recebeu desconto.

### Preservação dos dados

Após migrações e QA: as 13 reservas anteriores continuam presentes, assim como 15 pagamentos, três produtos, dois pedidos anteriores e 11 tarefas anteriores. Foram acrescentadas duas reservas explicitamente identificadas como `[DEV SIMULAÇÃO]`, depois canceladas, e quatro tarefas históricas canceladas. Nenhum pagamento novo foi registrado ou enviado ao PagBank neste QA. Não apagar essas evidências como se fossem reservas comerciais.

## Demonstração no PMS após login

1. Abrir **Pacotes de experiências**. Selecionar um pacote existente, conferir preço cheio, imóveis e componentes. Cada escolha deve listar somente opções que a equipe pode entregar.
2. Abrir **Estadias completas**, selecionar `[DEV] Chegada romântica`. Conferir imóveis, pacote incluído, duração e percentual. Usar **Ver prévia e conferir configuração** antes de salvar.
3. Trocar 5% para outro percentual ou desmarcar **Aplicar desconto**. Salvar atualiza consultas novas; reservas anteriores mantêm a composição e preço originais.
4. Na home ou imóvel, escolher **Consultar datas e preço completo**, selecionar duas noites permitidas e comparar as tarifas. Trocar para somente hospedagem deve retirar inclusões e desconto.
5. Concluir compra com autenticação e meio de teste. Conferir aceite dos documentos, confirmação, área do hóspede e checklists do PMS. Esta última etapa ainda precisa ser executada no navegador com sessão válida.

## Pendências para homologação completa

- Login confirmado para verificar visualmente cadastro/salvamento no PMS, área do hóspede e capturas administrativas em desktop e largura móvel.
- Compra ponta a ponta com pagamento sandbox real, parcelamento retornado pelo provedor, webhook e reserva resultante. As confirmações de QA desta entrega foram simulações no banco, explicitamente auditadas; não são homologação do PagBank.
- Upgrade e devolução de experiência após pagamento devem ser homologados com transação sandbox elegível no motor financeiro existente. Esta evolução não repetiu a homologação de estorno do provedor.
- Preços, itens concretos e escolhas comerciais precisam ser aprovados e cadastrados. Foram reutilizados pacotes `[DEV]` existentes de R$ 1,00, sem inventar vinho, queijos ou frutas na oferta comercial.
- Validação em aparelhos físicos e navegadores móveis. A verificação de largura em iframe utiliza o navegador desktop.

O resultado está implementado e disponível para revisão em desenvolvimento; a homologação completa permanece pendente das etapas acima.
