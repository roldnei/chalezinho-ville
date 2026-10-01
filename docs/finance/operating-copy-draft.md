# Textos operacionais e preparação financeira

Minuta funcional para aprovação do responsável pelo Chalezinho Ville. Não publicada. Não substitui a revisão dos termos de hospedagem e privacidade.

## Texto da caução no checkout

A hospedagem exige caução de R$ 500 em cartão de crédito, separada do pagamento da reserva. Próximo ao check-in, solicitaremos uma pré-autorização: o valor fica temporariamente reservado no limite, sem cobrança. A aprovação depende do emissor do cartão.

Se houver recusa, você poderá atualizar o cartão na sua conta. A recusa da caução não cancela automaticamente uma hospedagem já paga; nossa equipe acompanhará a regularização antes da entrada.

Uma ocorrência documentada e aprovada pela equipe poderá gerar cobrança parcial ou integral, dentro do valor autorizado. Sem cobrança por danos, a equipe solicitará o cancelamento da autorização. A recomposição do limite depende da confirmação do provedor e do emissor; não prometemos prazo que ainda não foi validado.

Consentimento obrigatório, inicialmente desmarcado: “Autorizo o uso deste cartão exclusivamente para a caução desta reserva e eventuais danos comprovados, conforme as condições apresentadas.”

Consentimento separado e opcional, inicialmente desmarcado: “Autorizo novas pré-autorizações da caução durante esta estadia, quando necessárias para manter a cobertura. Entendo que a substituição pode reservar temporariamente até R$ 1.000 do limite até o cancelamento da autorização anterior.”

Sem consentimento para renovação, uma estadia que ultrapasse a validade da autorização exige contato e regularização com a equipe; o sistema não presume permissão.

## Textos de acompanhamento

- **Caução recusada:** “Não foi possível autorizar a caução. Sua reserva continua confirmada. Atualize o cartão ou fale com o atendimento.”
- **Resultado ainda desconhecido:** “Estamos consultando o resultado com o PagBank. Aguarde a confirmação antes de tentar novamente.”
- **Prazo não confirmado:** “O prazo da autorização ainda não foi confirmado. Consulte a caução ou fale com o atendimento.”
- **Estorno solicitado:** “Sua solicitação foi registrada. O valor só será mostrado como devolvido após confirmação do provedor.”
- **Captura parcial:** “Foram cobrados R$ 180 da caução de R$ 500. Os R$ 320 restantes não foram cobrados; a liberação desse limite ainda aguarda confirmação.”

## Operação da equipe

1. Antes do check-in, conferir autorização, validade e eventual alerta. Exceção de entrada sem cobertura exige justificativa registrada pelo administrador.
2. Na vistoria, registrar ocorrência e comprovantes antes da decisão. Uma ocorrência aberta impede liberação conflitante da caução.
3. Aprovar somente o valor documentado. O backend bloqueia captura quando resta uma hora ou menos para vencer a autorização. A interface deve refletir o mesmo limite.
4. Sem danos, encerrar a ocorrência sem cobrança e solicitar liberação. Neste fluxo, checkout sozinho não comprova cancelamento nem liberação de limite.
5. Não solicitar outro estorno enquanto o anterior estiver incerto. Conservar a intenção, a chave de idempotência e o histórico.
6. Acompanhar alertas de renovação recusada e de bloqueio anterior ainda não cancelado. A autorização antiga é preservada quando a nova não é confirmada.

## Decisões comerciais para aprovação

- Manter a caução atual de R$ 500 por reserva?
- Aceitar a renovação opcional com aviso de sobreposição temporária de limite?
- Quem será responsável pela vistoria, liberação sem danos e tratamento de recusas antes do check-in?
- Confirmar os textos finais de cancelamento associados a cada tarifa, sem alterar retroativamente a versão aceita em reservas existentes.

## Preparação de produção

O código atual continua deliberadamente restrito ao sandbox e ao desenvolvimento. **Promover o preview sozinho não habilita compras reais.**

Antes de publicar: confirmar habilitação PF e recursos com PagBank; resolver homologação dos estornos e do saldo de caução; implementar e revisar seleção do provedor de produção exclusivamente no servidor; configurar credenciais reais no cofre do backend, sem colocá-las em arquivos públicos; configurar URLs do frontend, backend e webhook; exigir autenticação de notificações conforme o contrato real do provedor; conferir RLS e permissões; habilitar monitoramento e alertas; validar pagamento, caução e estorno com valores reais controlados mediante autorização específica.

O backend precisa manter valores e estados confirmados pela API, segredos inacessíveis ao navegador, callbacks vinculados à cobrança/reserva correta e chaves estáveis por operação. O plano gratuito não deve ser substituído nem ampliado sem aprovação.

Proteção contra senhas vazadas foi apontada pelo advisor como desativada; verificar disponibilidade no plano antes de configurar. Fonte: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

Nenhum desses textos ou passos autoriza publicação em produção, cobrança real ou contratação paga.
