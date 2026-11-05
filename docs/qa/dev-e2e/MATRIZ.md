# Matriz de homologação DEV

P0 = impedimento de liberação do fluxo principal se falhar ou ficar sem evidência. P1 = importante. P2 = acabamento. Identificadores devem permanecer estáveis no relatório. Quando houver variações (ex.: cartão 1×/6×/8×/12×), desdobre em linhas com sufixo.

| ID | Pri. | Cenário | Resultado a comprovar |
|---|---|---|---|
| ENV-01 | P0 | Prévia, Supabase, gateway e inventário | Perfil DEV e sandbox verificados; destinos, commit e versão registrados; dados sintéticos isolados. |
| AUTH-01 | P0 | Cadastro, confirmação e login de hóspede | Confirmação recebida em caixa de teste; login correto, erro útil para senha inválida e retorno ao passo original. |
| AUTH-02 | P0 | Logout, sessão vencida e recuperação | Sessão expirada não permite ação; recuperação usa link de teste válido, reutilização rejeitada e logout encerra acesso no navegador. |
| AUTH-03 | P0 | Administrador, anfitrião e equipe | Rotas e ações condizem com o papel e a propriedade; ações administrativas não ficam disponíveis ao hóspede. |
| AUTH-04 | P1 | Navegação direta, abas e redes sociais | Redirecionamento seguro e retorno correto; se houver login externo, validar apenas com conta de teste autorizada. |
| PUB-01 | P1 | Home, vitrine, chalés, escapadas e Ville Moments | Links, chamadas à ação, ofertas e datas chegam ao destino certo sem perder contexto. |
| RES-01 | P0 | Busca, datas, hóspedes e disponibilidade | Mínimo de noites, capacidade, datas inválidas/indisponíveis e regras de mesma data aplicadas por servidor e refletidas na tela. |
| RES-02 | P0 | Comparação de tarifas e composição | Tarifa não reembolsável não vem selecionada; valor de hospedagem, limpeza, adicionais, descontos e total coerentes. |
| RES-03 | P0 | Cotação, aceite e reserva | Versão/tarifa exibidas antes do aceite; servidor grava versão e horário da reserva. Cotação vencida ou adulterada não cobra. |
| RES-04 | P0 | Concorrência sobre datas e cliques repetidos | Uma reserva válida por disponibilidade; repetição não duplica cobrança nem deixa bloqueio indevido. |
| RES-05 | P1 | Experiências e pacotes no checkout | Seleção, troca e remoção; combinações incompatíveis bloqueadas; preço e itens permanecem corretos ao voltar/retomar. |
| PAY-01 | P0 | Pix criado, pago, expirado e abandonado | QR/copia e cola, prazo, estados no hóspede/admin e banco; vencido não confirma nem mantém bloqueio indevido. |
| PAY-02 | P0 | Cartão aprovado, recusado e erro recuperável | Valores e estados batem; sem dados completos de cartão em console, armazenamento, tráfego do app ou relatórios. |
| PAY-03 | P0 | Parcelas 1×, 6×, 8× e máximo configurado | Conferir opções reais retornadas; juros/pagador/centavos iguais na tela, API, cobrança e histórico. |
| PAY-04 | P0 | Repetição, refresh, rede interrompida e retorno | Uma cobrança por intenção; resultado incerto fica pendente e é conciliado antes de novo envio. |
| PAY-05 | P0 | Webhook válido, inválido, duplicado, atrasado e fora de ordem | Assinatura e origem validadas; eventos repetidos não duplicam nem regridem estado; pagamento tardio é conciliado sem reocupar datas indevidamente. |
| PAY-06 | P1 | Pós-reserva: experiência, upgrade e alteração | Cobrança ou crédito apenas pela diferença aprovada; falha mantém a reserva original; parcelas e recibos corretos. |
| CAN-01 | P0 | Política vigente versus aceita | Nova versão aparece para novas cotações; cotação antiga sem aceite exige atualização; reserva anterior conserva texto/versão. Tente ler a reserva da outra conta e com sessão ausente. |
| CAN-02 | P0 | Solicitação sem justificativa e protocolo | Hóspede registra sem motivo, recebe protocolo imediato e vê estado persistente; pedido repetido não cria segundo processo. Após início da estadia, encaminha para análise sem estornar sozinho. |
| CAN-03 | P0 | Fronteiras de cancelamento das duas tarifas | Compare antes/no/depois de 24h, 7 dias da contratação e 20 dias da entrada com a política realmente aceita. Na base 1.2, valide a janela de devolução integral e, fora dela, reembolsável integral com antecedência suficiente ou 50% da hospedagem; não reembolsável sem devolução da hospedagem. Não confunda prazos da contratação com antecedência do check-in. |
| CAN-04 | P0 | Estorno Pix e cartão integral/parcial | Conferir protocolo, elegibilidade, valores acumulados, estado no provedor e conciliação. Regressão do cartão parcelado com juros e do Pix parcial. |
| CAN-05 | P0 | Estorno repetido, excedente ou com resposta incerta | Não excede saldo, não duplica, não confirma sem prova do gateway; recuperação preserva a chave e o histórico. |
| CAN-06 | P0 | Experiências prestadas e não prestadas | Fora da janela de devolução integral, administrativo precisa classificar os itens; só não prestados entram no cálculo. Teste combinação mista, upgrade e tratamento de estorno prévio ou prestação parcial. |
| CAN-07 | P1 | Rejeitar/analisar pedido, estornar e liberar datas | Hóspede/admin concordam no estado; protocolo, razão de revisão, comprovante e histórico persistem; data só volta ao inventário no estado previsto. |
| CAU-01 | P0 | Pré-autorização, recusa e liberação sem ocorrência | Confirmar no sandbox e no painel; autorização não é receita; repetição não cria retenção duplicada. |
| CAU-02 | P0 | Ocorrência, captura parcial/total, saldo e estorno | Permissão e decisão registradas; limite cumulativo respeitado; comprovar o destino do saldo não capturado (ex.: R$ 500 autorizados, R$ 180 capturados, R$ 320 restantes), ou marcar bloqueado. |
| CAU-03 | P1 | Vencimento, renovação, troca de cartão e exceção de check-in | Tratar recusa e autorização vencida com estado claro e sem captura indevida. |
| SEC-01 | P0 | A/B acessam reserva, política, recibo, estorno, mídia ou caução alheia | API/RLS/Storage impedem leitura e escrita cruzadas, inclusive alterando identificadores em URL e corpo. |
| SEC-02 | P0 | Elevação de privilégio e ação administrativa direta | Usuário comum/sem sessão não publica políticas, cancela em nome de outro, estorna, captura nem muda papéis, inclusive por API/RPC. |
| SEC-03 | P0 | Alteração de preço, tarifa, cupom, valor e estado pelo cliente | Servidor usa valores próprios e bloqueia alteração de versão aceita, montante, moeda, pagador, propriedade e estado. |
| SEC-04 | P0 | Assinatura, replay, segredos e dados sensíveis | Verificar webhooks falsos/repetidos, isolamento de credenciais, ausência de token/PII no frontend, logs e mensagens de erro. |
| SEC-05 | P1 | Entradas de texto, redirecionamento, uploads e dependências | Checagens não destrutivas de XSS/injeção, redirecionamento de login, tipo/tamanho do arquivo e riscos de dependências; confirmar achados em vez de copiar alertas. |
| UX-01 | P1 | Celular/desktop, toque e teclado | Conferir a partir de 360px, mobile 390–412px e desktop ≥1280px; foco, ordem, zoom, contraste, alvos, rolagem e ausência de sobreposição. |
| UX-02 | P1 | Botões, formulários e erros por tela | Inventariar todos os controles visíveis das jornadas; testar voltar, fechar, confirmar, desabilitado, carregando, falha, vazio e recuperação. Botão ativo precisa cumprir o rótulo. |
| UX-03 | P1 | Clareza de valores, termos e mensagens | Antes de pagar, preço/parcelas/política claros; depois, rótulos distinguem pedido, pendência e confirmação. Textos em português, sem mensagens técnicas cruas. |
| UX-04 | P2 | Navegadores e desempenho percebido | Repetir cenário principal em Chromium e, se disponível, Safari/WebKit; registrar atraso, falhas de rede e diferenças visuais. |
| OPS-01 | P1 | PMS, multicalendário e reservas | Só dados sintéticos: lista, filtros, mudança de estado, check-in/checkout, limpeza e disponibilidade; integrações com canais reais ficam fora das escritas. |
| OPS-02 | P1 | Painel e fila de aprovações | Hóspede, anfitrião e administração veem somente o permitido; filtros e botões funcionam; consulta financeira reproduz a trilha. |
| OPS-03 | P1 | Comunicações, anexos, inspeção e custos | Testar recursos que a prévia expuser com dados e canais de teste; conferir permissões, erro, cancelamento e remoção dos próprios arquivos. |
| OPS-04 | P2 | Perfil e Ville Moments autenticado | Checar perfil privado/público, mídia de teste e moderação quando habilitados; sem compartilhar/publicar a terceiros. |
| FIN-01 | P0 | Conciliação final | Somar em centavos por reserva: principal, adicionais, créditos, estornos e caução; verificar que histórico e estoque estão consistentes e limpos. |

## Controles financeiros de referência

Resultados anteriores são controles de comparação. O Pix parcial de R$ 75 sobre R$ 150 foi confirmado no sandbox; isso não comprova checkout autenticado. Para R$ 150, o simulador pode demorar alguns minutos para confirmar o pagamento. Confirme a regra de teste vigente e consulte o gateway antes de iniciar o estorno. Nos testes de cartão em 8×, já houve sucessos de total/parcial e ocorrências antigas não conciliadas. Não reutilize operações antigas nem repita estornos pendentes. Use novas operações sintéticas e reporte respostas inesperadas sem classificá-las automaticamente como falhas do site.

Para cada P0, registre as telas, a requisição sanitizada, o estado observado e o ponto em que a jornada parou. Ausência de acesso, papel, navegador, meio de teste ou provedor se traduz em `BLOCKED`, não em aprovação por inferência.
