# Achados — continuação DEV 06/11/2026

## DEVQA-2026-11-06-1600-UTC-001 — Cadastro ativo com tabela própria falha

- **Caso/prioridade/severidade:** OPS-01, RES-01; P1, alto. O fluxo oferecido pelo PMS para ativar um imóvel novo já com diária configurada não conclui, embora exista caminho alternativo em etapas.
- **Pré-condições:** deployment Vercel `e68ce6472f4b17a7c2347587a1c0a122be903612`, administrador autorizado, Supabase DEV, navegador Chromium, 06/11/2026 aproximadamente 13h02 Brasília. Dados sintéticos inéditos `QA-DEV-20261106-E2E`, sem integrações.
- **Reprodução:** PMS → Imóveis → Novo imóvel; preencher nome/código/slug inéditos, diária padrão 80, fim de semana 100, limpeza 20, garantia 500, 12 parcelas máximas, 6 sem juros; manter “ativo” marcado e salvar. Esperado: registro ativo com `own_pricing` e `payment_terms` persistidos. Observado: mensagem genérica sobre código/slug e nenhum imóvel na lista após atualização.
- **Controle para descartar duplicidade:** com **o mesmo código e slug**, desmarcar “ativo” e salvar sem preço funcionou. A tabela própria foi salva no painel de preços, taxas/parcelas foram salvas e a ativação posterior funcionou. O checkout cotou e ofereceu parcelas. Isso localiza a falha na criação ativa em uma etapa; o código e o slug não estavam em uso.
- **Evidência:** UI DEV às ~13h02–13h06; sem HAR, credenciais ou IDs financeiros no Git. O backend respondeu erro ao formulário, mas o código HTTP específico não foi capturado; não inferir causa de banco sem log. A UI oculta a causa real sob mensagem de duplicidade.
- **Aceite:** criar outro imóvel sintético **ativo de primeira** pelo formulário com preço e condições preenchidos; verificar no banco `own_pricing`, `features.payment_terms`, ausência de integrações por padrão, cotação e parcelas. Exibir erro específico em caso de validação, conflito e falha interna. Adicionar regressão de cadastro direto e do caminho pausado→preço→ativação.
- **Handoff:** NOVO; correção/PR, prévia, data e resultado de reteste pendentes.

## DEVQA-2026-11-06-1600-UTC-002 — Capacidade inválida por URL vira falha genérica

- **Caso/prioridade/severidade:** RES-01, UX-03; P2, baixo. A tela não explica ao hóspede por que a consulta com mais pessoas que a capacidade não pode continuar.
- **Pré-condições:** imóvel QA novo ativo, máximo 2 hóspedes, 17–19/11/2026, Chromium, aproximadamente 13h10 Brasília.
- **Reprodução:** abrir diretamente uma busca com `guests=3` para o imóvel QA. Esperado: mensagem de capacidade excedida ou ajuste explícito para 2 antes de consultar. Observado: a URL perdeu o parâmetro, a tela mostrou “Consulta indisponível” e “Não foi possível consultar agora. Tente novamente.” Nenhuma opção/reserva foi oferecida.
- **Diagnóstico:** validação/apresentação no frontend ou mapeamento de erro da busca; confiança média. Não é prova de aceitação indevida pelo servidor, pois não houve reserva nem cobrança.
- **Aceite:** deep link inválido informa o limite e deixa corrigir hóspedes sem erro genérico; servidor continua rejeitando capacidade excedida. Testar 1, 2 e 3 hóspedes no mesmo imóvel sintético.
- **Handoff:** NOVO; correção/PR, prévia, data e resultado de reteste pendentes.

## Achados anteriores

- [Tabela própria ausente em CH1–CH3](../2026-11-05-2329-UTC/ACHADOS.md): os três foram reinspecionados em leitura e ainda aparecem sem diária base própria. Não atribuir preço próprio aos chalés reais sem validação do responsável.
- [Condições de parcelamento ausentes no imóvel QA legado](../2026-11-05-2329-UTC/ACHADOS.md): o imóvel **novo**, criado pausado e configurado pelo PMS, ofereceu 1× a 12×. O dado legado segue como caso de migração/fallback, não como falha comprovada do fluxo pausado atual.

## DEVQA-2026-11-06-1600-UTC-003 — Singular incorreto na tarifa de uma noite

- **Caso/prioridade/severidade:** UX-03; P2, baixo. No checkout do imóvel QA para 23–24/11/2026, as duas tarifas e o resumo exibiram “1 noites”. O valor e a disponibilidade estavam corretos, então o impacto é de clareza e acabamento.
- **Reprodução:** buscar uma noite útil permitida, abrir “Escolher esta estadia” e comparar os rótulos de tarifa e resumo. Esperado: “1 noite”. Observado: “Total para 1 noites” e “Hospedagem e limpeza · 1 noites”.
- **Aceite:** pluralização correta em busca, comparação, resumo e recibo para 1 e para 2 noites, sem mudar cálculo financeiro.
- **Handoff:** NOVO; correção/PR, prévia, data e resultado de reteste pendentes.

## DEVQA-2026-11-06-1600-UTC-004 — Imóvel ativo sem foto mostra imagem quebrada

- **Caso/prioridade/severidade:** PUB-01, UX-03; P2, baixo. A vitrine de resultados apresenta área escura com ícone de imagem quebrada quando um imóvel ativo ainda não tem fotos.
- **Pré-condições:** imóvel sintético `QA-DEV-20261106-E2E` ativo, 0 fotos no PMS, busca disponível para 17–19/11/2026 na prévia DEV.
- **Reprodução:** abrir a busca e observar o cartão do imóvel. Esperado: placeholder visual íntegro e informativo ou impedimento explícito de ativar anúncio sem foto, conforme regra de produto. Observado: o elemento `<img>` tinha `src="null"`, `naturalWidth=0` e `naturalHeight=0`; a captura de tela exibiu imagem quebrada sobre retângulo escuro. O preço e o botão de escolha permaneciam visíveis.
- **Aceite:** a busca renderiza um placeholder acessível quando não há imagem válida, sem requisitar `null`; ao cadastrar foto, a imagem real aparece. Definir se foto deve ser requisito de ativação, mantendo erro de validação claro no PMS.
- **Handoff:** NOVO; correção/PR, prévia, data e resultado de reteste pendentes.

## DEVQA-2026-11-06-1600-UTC-005 — Conta defasada entre liberação das datas e baixa do Pix

- **Caso/prioridade/severidade:** PAY-01, RES-04, FIN-01; P2, médio, para investigação. A apresentação do estado financeiro divergiu temporariamente da disponibilidade após a retenção.
- **Pré-condições:** reserva sintética do imóvel QA para 17–19/11, Pix sandbox de R$ 212 criado e não pago. O checkout informa expiração em 15 minutos; o simulador mantém essa faixa de valor em espera sem pagamento automático.
- **Reprodução:** iniciar o Pix, constatar busca pública com 0 opções durante a retenção, aguardar a liberação e recarregar busca e conta. Observado: a busca voltou a mostrar **1 opção disponível** por volta de 13h30, enquanto a conta ainda exibia “Aguardando confirmação / Aguardando pagamento” às ~13h34. O portal PagBank DEV registrou notificação às **13h35**, webhook HTTP 200 e cobrança **Cancelado**; mais tarde o PMS exibiu **NÃO CONFIRMADA**. Não houve pagamento tardio nem segunda reserva realizada no intervalo.
- **Risco a verificar:** durante a janela entre liberar datas e receber/conciliar a baixa final, uma confirmação tardia do provedor precisa ser tratada sem dupla reserva. A observação prova defasagem temporária da UI; não prova falha financeira ou overbooking.
- **Aceite:** exibir estado/expiração coerente na conta durante a janela de baixa; garantir que confirmação tardia nunca resulte em duas reservas válidas para as mesmas noites; testar com relógio controlado e webhook tardio/repetido.
- **Handoff:** NOVO; regra de sincronização e segurança para confirmação tardia, correção/PR, prévia e reteste pendentes. A baixa normal foi confirmada no provedor e PMS nesta rodada.

## DEVQA-2026-11-06-1600-UTC-006 — Cobrança de experiência estornada aparece aguardando confirmação

- **Caso/prioridade/severidade:** PAY-06, UX-03, FIN-01; P2, baixo. A conta do hóspede mantém um rótulo de pagamento pendente após estorno já concluído.
- **Pré-condições:** imóvel QA, reserva confirmada de 09–11/12/2026, hospedagem paga em cartão 1× por R$ 212 e café avulso comprado depois em cobrança própria de R$ 40.
- **Reprodução:** no PMS, retirar o café antes da prestação, calcular R$ 40 de crédito e aprovar o estorno. Atualizar conta do hóspede e abrir a reserva. Esperado: pagamento da experiência “Estornado” ou estado equivalente, com reserva de hospedagem confirmada. Observado: a conta exibiu “DEVOLUÇÃO DE EXPERIÊNCIA Concluído”, R$ 40 confirmado e R$ 0 restante, mas em “Pagamentos das experiências” exibiu “Pagamento aguardando confirmação” para o mesmo café. O PMS mostrou a cobrança de R$ 40 “Estornado”, a hospedagem de R$ 212 “Pago”; o portal PagBank DEV mostrou a transação do café **Cancelado** e webhook HTTP 200.
- **Diagnóstico:** divergência de apresentação do status histórico da experiência após retirada/estorno; a conciliação monetária observada permaneceu correta. Não há evidência de cobrança pendente real.
- **Aceite:** após estorno confirmado, a conta mostra “Estornado” no pagamento da experiência e mantém R$ 40 devolvidos, R$ 0 a devolver e a hospedagem ativa por R$ 212; recarregar a página e repetir o cenário não reintroduz “aguardando confirmação”.
- **Handoff:** NOVO; correção/PR, prévia e reteste pendentes.
