# Vitrine de hospedagem e limpeza — DEV — 11/10/2026

Implementada na branch `feature/staged-whatsapp-launch`, sobre a versão de desenvolvimento mais recente inspecionada (`8a4cb175`). Código homologado: `1ea0f9f033ec0e971d6248c2b82cfef5af66f808`. Este relatório complementa `staged-whatsapp-20261011.md`; não declara homologado novamente todo o PMS ou o checkout financeiro.

Prévia testada: https://chalezinho-ville-oa8u04fkf-roldneicosta-4140.vercel.app/index.html?view=site#estadias-completas

## Ambientes confirmados, sem publicação em produção

- DEV Supabase: `pxfqmnhqodqyaaqeyjgr`, `chalezinho-ville-finance-dev`.
- PROD Supabase: `irxsaladqhbzhkoaclxy`, `chalezinho-ville` — somente leitura de identificação; nenhuma mutation.
- Vercel: projeto `chalezinho-ville`, `prj_qXld7h9Z3I7mV9mZKuXJ4yQ1j3dc`, equipe `team_YfhCyXyWKAtieREJ6eXj3szW`.
- Deployment homologado de prévia: `dpl_48QuP5dm7eCeuhT8dLFDgFgimvuA`; perfil WhatsApp, alvo desenvolvimento.
- Produção READY conferida: `dpl_GfCE3VYLNmxwSorGBUPYQjU6ys41`, SHA `9bc9e0e7d3b9d18bb643e724f999ff37f64bc2fc`. Sem promoção, deployment ou alteração de configuração/dados de produção.

## Resultado comercial

Nova oferta DEV `67cd3f37-0ac1-4b04-9a7f-d5e113395e38`, **Escapada · hospedagem e limpeza**, ativa para os três chalés, dois hóspedes, `product_ids=[]`, desconto zero. As cinco escapadas anteriores continuam pausadas. Não foram apagadas experiências, mídias, publicações ou históricos.

A janela é móvel: próximos 21 dias de **check-in**, começando amanhã no calendário local. Na conferência: 12/10 a 01/11/2026. O check-out pode ultrapassar a janela para completar a estadia exigida, incluindo Finados em 02/11. Check-in passado não é sugerido. A rotina existente de pausa de ofertas expiradas foi preservada; ofertas pausadas não são reativadas automaticamente.

Modo novo `duration_mode=minimum`: começa com duas noites e respeita o mínimo real informado pelo motor para cada chalé e data. Ao precisar ampliar para três ou mais noites, consulta novamente a disponibilidade de **todo** o intervalo ampliado, inclusive suas regras de entrada/saída. Não publica um intervalo ampliado sem validar as novas noites. Mantém reservas, bloqueios, calendários e indisponibilidades reais.

Reutiliza os motores de busca/preços e os dados PriceLabs existentes; não calcula diárias no navegador. Deduplicação por chalé/check-in. Nesta consulta retornaram 18 opções selecionadas, de dias de semana, fins de semana e feriados. O cache foi versionado para não reaproveitar cartões do modelo antigo.

| Tarifa configurada | Acréscimo sobre a base de hospedagem | Seleção |
| --- | ---: | --- |
| Não reembolsável | 10% | Disponível |
| Reembolsável | 20% | Disponível |
| Referência | 28% | Não selecionável |

O desconto de 5% das escapadas anteriores não foi transferido para esta oferta. Limpeza é somada separadamente: Signature R$ 150; Essenza e Amore R$ 292. Não alteramos esses percentuais ou taxas comerciais.

Isso alinha o site à base PriceLabs dos anúncios vinculados ao Airbnb. **Não foi verificado o total final de checkout do Airbnb**, que pode incluir taxas, promoções e condições próprias do canal. Encaminhamento ao Airbnb ou link de pagamento próprio continua uma decisão do atendimento; nenhuma consulta gera pagamento automaticamente.

Exemplos efetivamente cotados:

| Chalé / datas | Noites | Hospedagem com acréscimo de 10% | Limpeza | Total |
| --- | ---: | ---: | ---: | ---: |
| Amore · 19–21/10 | 2 | R$ 982,30 | R$ 292 | R$ 1.274,30 |
| Amore · 12–15/10 | 3 | R$ 1.819,40 | R$ 292 | R$ 2.111,40 |
| Signature · 01–04/11 | 3 | R$ 2.147,20 | R$ 150 | R$ 2.297,20 |

## Interface e PMS

Vitrine e Ville Moments usam os mesmos cartões e encaminham ao resumo/WhatsApp com datas, hóspedes, chalé, oferta e preço esperado. Foram removidos rótulos incorretos de experiência incluída nas ofertas sem produtos. As alternativas de tarifa são mostradas, e o resumo exige escolha explícita. Corrigido o contraste do resumo após inspeção visual real.

PMS: pacote passa a ser opcional e foi acrescentado o modo **Mínimo do calendário (a partir de 2 noites)**. Cadastro preserva janela de 21 dias, desconto zero, propriedades e pausa. A migration DEV `20261011151601_stay_only_showcase.sql` retira somente a obrigação de ter produtos na oferta; mantém propriedades obrigatórias e permissões existentes.

Validação de PMS nesta execução: leitura real do catálogo e regras pelo banco; gravação da oferta real pelo mecanismo administrativo de dados; teste funcional de interface com fixture carregando e salvando a oferta sem produtos, janela/mínimo e status pausado; chamada administrativa anônima real com Origin da prévia rejeitada com `admin_required`. **Salvamento pela interface com usuário administrativo autenticado e matriz de permissões de equipe ainda pendentes.** Não declarar homologados os demais cadastros/financeiro com base nesses testes.

## Evidências e limites

- 459 testes da suíte completa aprovados, zero falhas. Teste adicional do PMS aprovado e 12 testes afetados finais aprovados. `npm run check`, typecheck, sintaxe JS e build WhatsApp DEV aprovados.
- API real: cada um dos 18 cartões foi recalculado em consulta nova. Totais coincidem com hospedagem PriceLabs acrescida da tarifa, limpeza e zero desconto/experiências. Nenhum `quote_id` persistido; duplicatas de chalé/check-in: zero.
- Amore 12–14/10, duas noites, rejeitado pelo servidor com `minimum_stay`, mínimo 3. Amore 12–15/10 aprovado. Operações `hold`, `pay`, `checkout` e ação administrativa no endpoint público rejeitadas com HTTP 403.
- Navegador real em nuvem: vitrine → feriado → escolha explícita da tarifa → resumo → preparação do WhatsApp; filtros de duas/três noites e contexto preservado. Mensagem decodificada coincide exatamente com o resumo e solicita finalização pelo atendimento, sem confirmação.
- Ville Moments carregou 4 publicações existentes + 18 escapadas automaticamente, com navegação inferior. Interface testada em larguras 390 e 320 via iframe do site de QA: sem sobreposição do CTA com a navegação ou overflow horizontal em 320. **Não foram usados aparelhos físicos.**
- Não abriu nem enviou mensagem real pelo WhatsApp. Falha de abertura/cópia, alteração de seleção, invalidação de preço, disponibilidade e barreiras de checkout possuem regressões automatizadas; não confundir fixtures com falhas reais provocadas em serviços externos.
- Checkout completo preservado e coberto pelas regressões; uma nova jornada completa autenticada com PagBank não foi executada neste ajuste.

| Contagem DEV | Antes | Após API e navegador |
| --- | ---: | ---: |
| Reservas | 30 | 30 |
| Pagamentos | 34 | 34 |
| Quotes persistidas | 346 | 346 |
| Bloqueios PMS | 2 | 2 |
| Outbox de notificações | 136 | 136 |
| Holds / pending payment | 0 | 0 |

As únicas escritas desta etapa foram schema DEV, oferta de catálogo/auditoria e deploy de código DEV. Nenhuma reserva fictícia, cobrança, bloqueio ou confirmação foi criada. Proteções novas continuam no servidor; não são simples botões ocultos.

Arquivos: `stay-only-real-showcase-20261011.json`, `stay-only-real-verification-20261011.json`, `stay-only-full-tests-20261011.tap`, `stay-only-affected-tests-20261011.tap`; capturas na pasta `evidence` com prefixo `vitrine-minimo`. Capturas mobile foram feitas antes do ajuste exclusivamente visual do resumo; a captura final da vitrine e do resumo corresponde ao código `1ea0f9f`.

## Produção: proposta revisável e retorno

Nada abaixo foi executado em PROD. Seguir também a lista de dependências/proteções de `staged-whatsapp-20261011.md`.

1. Homologar salvamento autenticado no PMS, permissões, aparelhos físicos e condições comerciais. Conferir separadamente o total apresentado pelo Airbnb quando a intenção for reproduzir o preço final daquele canal.
2. Revisar o diff completo da candidata, schema/dependências, configuração e compatibilidade das funções com reservas e rotinas financeiras existentes. Registrar backups e o deployment realmente servido pelos aliases de produção.
3. Após autorização, aplicar somente migrations aprovadas, incluindo a possibilidade de oferta sem produtos; cadastrar uma oferta equivalente sem experiências, desconto zero, janela 21 dias e modo mínimo. Conferir propriedades/preços/limpeza PROD; não copiar IDs DEV nem reativar escapadas antigas automaticamente.
4. Preparar funções aprovadas e configuração explícita WhatsApp apontando ao Supabase PROD, conforme relatório principal. Preservar perfil de checkout em DEV. Publicar somente depois de aprovação do resultado e validação dos dados reais de produção.
5. Retorno: primeiro pausar a nova oferta pelo PMS. Restaurar deployment e versões anteriores de funções compatíveis previamente registradas; manter a proteção WhatsApp até autorização específica. Se restaurar o engine antigo que pressupõe produtos, deixar a nova oferta sem produtos pausada. Não reaplicar a constraint antiga enquanto houver tais ofertas; não apagar registros para desfazer esta mudança. Revalidar calendário, consultas e rotinas legítimas após retorno.

PagBank, checkout completo, termos, garantias, estornos, pós-reserva, comunidade, editor, Feelings, metadados históricos e mídias permanecem preservados. Publicação social e módulos restantes mantêm as pendências descritas no relatório principal.
