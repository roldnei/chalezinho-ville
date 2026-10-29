# Protocolo de entrada no celular — 29/10/2026

Experimento `mobile-home-v1`. Alterações partem do commit efetivamente servido em produção `1efbbf7c948abad12bc3b7766a59c1cd7a5687ce`; não publicam outros trabalhos pendentes.

## Decisão e alcance

Autorização: proprietário pediu “Resolva tudo então”, depois da explicação das pendências e da preparação para início. Publicar correções, verificar e ativar A/B 50/50. Apenas novas entradas elegíveis de celular na home; destino explícito, desktop, tablets, privacidade e exclusões da equipe preservados. Baseline anterior permanece separado, sem apagar nem fabricar dados.

Métrica principal: proporção de navegadores atribuídos que abriram ao menos uma página de chalé dentro de sete dias. Não mede necessariamente reservas. Secundárias: consultas, resumos, cliques WhatsApp, pedidos qualificados e reservas realmente vinculados. Não promover pedidos ou reservas a principal durante este teste.

Horizonte fixo: 84 dias completos de inscrições (12 semanas), mais 7 dias de maturação. Meta: no mínimo 70 atribuídos não excluídos por braço. A análise final depende de horizonte e janelas completos; não parar por vantagem observada diariamente. Se houver menos que 70 em qualquer braço, falha relevante de entrega, qualidade não resolvida ou vínculos comerciais insuficientes, resultado inconclusivo para a pergunta correspondente. Não prolongar automaticamente nem trocar métrica; um novo desenho exige novo experimento.

Baseline de planejamento: 4/17 = 23,5%, arredondado para 25%, estimativa muito incerta. Tráfego observado: cerca de 1,7 elegíveis novos por dia. Menor efeito dimensionado: aumento absoluto de 25 pontos percentuais (25% -> 50%), alfa bilateral 5%, poder 80%; aproximação de duas proporções requer 58 por braço, arredondada conservadoramente para 70. Isso só tem capacidade para diferenças grandes; não comprova equivalência nem ausência de efeito menor. Não há amostra para dimensionar conversão em reservas.

Análise final predefinida: teste exato bilateral de Fisher para a tabela 2x2 da principal, diferença absoluta e intervalo de confiança de 95% pelo método Newcombe/Wilson, sem correção por covariáveis. As secundárias e segmentos são descritivos. Unidade navegador, sem identificação entre dispositivos. Denominador por intenção de tratar: todos os atribuídos elegíveis, inclusive falhas e sem eventos. Não somar únicos diários.

## Pendências esclarecidas

- Uma atribuição de iPhone em 21/10 sem eventos: causa retrospectiva indeterminada; pode ser saída, interrupção ou falha. Preservada na calibração, não excluída para melhorar taxas. Não impede por si só uma nova comparação.
- Uma falha `feed_unavailable` em 22/10, com recuperação no mesmo navegador: incidente histórico; preservar. B não deve receber falha de entrada quando apenas o carregamento de Moments em segundo plano falhar.
- A entrada só é registrada uma vez por carregamento. Abrir Moments depois de entrar pela B não altera a exposição inicial.
- Eventos pendentes após atribuição persistem localmente, por participante, no máximo 24h e 50 itens, com UUID estável e timestamp validado no servidor. Falha de armazenamento usa envio direto. A saída antes da atribuição/exposição continua podendo deixar atribuição sem eventos; não inventar exposição.
- Decisão aguarda no máximo 4s. Na indisponibilidade a navegação atual continua; resposta tardia registra `decision_timeout`. Divergência entre atribuição e exposição é monitorada, mantendo o atribuído no denominador.
- Referência de atendimento aguarda até 1,5s pela medição ao preparar o resumo, sem impedir consulta em indisponibilidade.
- Administrador ativo pode qualificar contato direto com chalé, datas e hóspedes. O navegador público continua sem poder confirmar pedidos ou reservas. Reserva exige confirmação existente no PMS e correspondência comercial; nenhuma reserva criada para QA.
- Acompanhamento diário às 8h America/Sao_Paulo. Incidentes antigos são contexto, não bloqueios repetidos. Alertas de qualidade focam novos eventos após início e última janela de 24h. Mismatch/timeout >5% com pelo menos 20 atribuídos, falhas sistemáticas ou desequilíbrio SRM com p<0,001 exigem investigação, sem escolher vencedor. A rotina é somente leitura.

## Evidência

Testes de unidade, integração SQL, navegação e fluxo público de consulta. QA de API em produção usa visitantes sintéticos identificados e posteriormente excluídos de todos os agregados. Nunca registrar pedido ou reserva falsos em produção. Testes comerciais autorizados executados em fakes isolados, sem mensagens nem reservas reais. Interface real verificada em navegador de desktop; comportamento de celular verificado em DOM simulado, não em aparelho físico.
