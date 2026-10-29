# Entrada mobile: Ville Moments x site

Histórico da preparação; o protocolo vigente está em `mobile-entry-launch-20261029.md`.

Preparado em 19/10/2026. Experimento `mobile-home-v1`. A preparação não inicia o teste.

## Estado e alcance

- Banco: `mobile_entry_experiments.status = baseline`, `started_at = null`.
- Navegador: `CHALEZINHO_CONFIG.mobileEntryExperimentEnabled = false`.
- A calibração coleta entradas móveis elegíveis e o funil da experiência atual, sem aguardar a medição para abrir o Moments.
- Elegíveis: iPhone/iPod e Android Mobile com viewport até 700 px, entrando em `/` ou `/index.html`, sem hash ou destino explícito. UTMs e identificadores de anúncios não alteram o destino. Só a campanha sanitizada e a categoria de origem são armazenadas, nunca a URL completa.
- Links diretos, desktop, tablets, DNT/GPC, automação e exclusão local não entram na randomização. Se não houver armazenamento persistente, a navegação continua e a medição é omitida.
- Unidade: navegador com UUID próprio em armazenamento local. Dispositivos distintos e limpeza dos dados podem gerar outra unidade; não há identificação entre dispositivos.
- Administrador, anfitrião e equipe autenticados são excluídos; a exclusão também remove seu histórico dos agregados. Testes manuais sem login exigem exclusão local (`ville-measurement-excluded=true`). Não é possível reconhecer equipe deslogada automaticamente.

## Fluxo

`mobile-entry.js` -> `public-consultation?action=mobile_telemetry` -> módulo independente `mobile-entry-service.ts` -> tabelas `mobile_entry_*`.

O endpoint público anterior e a allowlist de consultas permanecem preservados. As tabelas novas têm RLS e nenhum privilégio para `anon`/`authenticated`; o serviço valida cada operação. Relatórios e vínculos comerciais exigem administrador ativo autenticado. O coletor público não aceita `request_received` nem `reservation_confirmed`.

Eventos: entrada efetivamente exibida, página de chalé, busca iniciada/concluída, resumo preparado com chalé/datas/hóspedes, clique no WhatsApp, cópia do resumo, falha da entrada/busca e duração de carregamento. IDs de eventos tornam reenvios idempotentes. Participantes são únicos por navegador, experimento e fase. A fase de calibração nunca compõe os braços A/B.

A referência `MV-…` acompanha a mensagem de WhatsApp. Preparar o resumo não comprova envio. Na administração, **Teste A/B celular**, o administrador pode registrar o pedido realmente recebido e vincular uma reserva já confirmada. O serviço lê a reserva existente e confere origem direta/manual, imóvel, datas, hóspedes e criação posterior à atribuição; não cria ou modifica reservas/pagamentos.

## Relatório diário

- Ontem completo em America/Sao_Paulo: visitantes atribuídos que tiveram atividade naquele dia, eventos e resultados nesse dia. Não é a mesma base do acumulado.
- Acumulado: visitantes únicos por versão e pessoas que chegaram a cada etapa, sem somar únicos diários.
- Janela completa: coortes com pelo menos `attribution_days` desde atribuição.
- Denominador A/B: todos os atribuídos, inclusive quem sofreu falha na entrega da entrada. `entry_rendered` e `entry_failed` mostram cobertura e falhas; não excluir retrospectivamente fracassos para melhorar a taxa.
- Sem inferência ou vencedor automático nos relatórios diários. Contagens de reservas são vínculos confirmados no momento do registro, sem inferir receita líquida ou cancelamentos posteriores.

## Ativação posterior

1. Validar sete dias de calibração e qualidade da coleta em produção. Estimar visitantes móveis únicos/dia e taxa da métrica candidata.
2. Definir previamente UMA métrica principal, baseline, menor efeito relevante, amostra por braço, horizonte fixo em semanas completas e janela de atribuição. Referência inicial: 28 dias de inscrições e 7 dias de acompanhamento; o volume pode exigir outro horizonte definido antes do início. Taxas de pedidos só servem como principal quando o atendimento estiver registrando os pedidos com cobertura suficiente.
3. Habilitar o sinalizador do navegador numa versão revisada, mantendo o banco em baseline até confirmar a versão. Atribuições de teste são recusadas se o cliente não declarar suporte à divisão.
4. Iniciar o experimento com atualização administrativa de `status=running`, `started_at` e protocolo completo (`primary_metric`: `property_viewed` ou `request_received`; `sample_per_arm`; `enrollment_days` >=14; `attribution_days` entre 1 e 30). Guardar também hipótese, baseline, efeito, alpha, poder e plano de análise no JSON do protocolo. Não executar esta etapa nesta preparação.
5. O servidor deriva a atribuição 50/50 de um hash estável e a persiste. A=Moments; B=site tradicional responsivo. A entrada espera no máximo 1,3 s pela atribuição quando o sinalizador estiver ligado; na falha preserva o caminho atual e registra falha quando a resposta chega. Monitorar cobertura antes de aceitar resultados.
6. Ao atingir o horizonte, novas inscrições são recusadas; participantes anteriores ainda podem completar sua janela. Encerrar após a última janela. O protocolo e início ficam bloqueados depois da primeira ativação. Outro desenho exige outro experimento.

## Verificação e publicação

- Migração versionada: `20261019174019_mobile_entry_instrumentation.sql`.
- Executar testes `mobile-entry`, `mobile-entry-database`, `access-metrics`, consultas/WhatsApp e navegação Moments, além do typecheck dos módulos novos.
- Aplicar apenas esta migração ao ambiente-alvo. Não aplicar em lote migrações financeiras ou de custos pendentes.
- Implantar a função `public-consultation` com seus módulos relativos, preservando a autenticação customizada existente (`verify_jwt=false`); o administrador continua autenticado dentro do handler.
- Frontend de produção usa as variáveis e guardas já existentes do perfil WhatsApp. O sinalizador fica falso e o banco baseline ao publicar a instrumentação.
- A rotina diária usa exclusivamente leitura das tabelas novas e não ativa, pausa ou publica o experimento.
