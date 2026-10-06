-- Development only: source UUID guards against application to another environment.
DO $consent$
DECLARE source public.policy_documents;
BEGIN
 SELECT * INTO source FROM public.policy_documents WHERE id='f4aebd1f-ae83-45aa-9ce5-42725a2103c3' AND version='1.1' AND document_type='hosting_terms';
 IF source.id IS NULL THEN RAISE EXCEPTION 'development_terms_source_mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.policy_documents WHERE code='hosting_terms' AND version='1.2') THEN
 INSERT INTO public.policy_documents(document_type,code,version,title,body,status,effective_at)
 VALUES('hosting_terms','hosting_terms','1.2','Termos de Hospedagem',$newterms$Termos de Hospedagem
Chalezinho Ville • Versão 1.2 • 6 de outubro de 2026
Estes termos regulam as reservas diretas do Chalezinho Ville, em Guarapari, Espírito Santo. Leia também as 
Regras da Propriedade, a política de cancelamento da tarifa escolhida e a Política de Privacidade. O resumo 
da reserva identifica o imóvel, os ocupantes, as datas, os horários, o preço e as condições efetivamente 
contratadas.
1 Identificação e atendimento
Responsável contratante: Roldnei da Costa Candido. CPF: 111.271.437-51. Endereço para correspondência: 
Rua Juiz de Fora, 79, Guarapari – ES, CEP 29106-380. E-mail para dúvidas, esclarecimentos e questões de 
privacidade: atendimento@chalezinhoville.com.br. WhatsApp oficial: +55 (93) 99159-2266. Horário de 
atendimento: das 08h às 17h, horário de Brasília. Página oficial do chalé para informações, dúvidas e 
esclarecimentos: https://chalezinhoville.com.br.
A confirmação identifica a unidade e seu endereço de acesso. Esses dados e os canais oficiais devem estar 
disponíveis antes do pagamento. A denominação comercial destes termos não altera o enquadramento 
jurídico aplicável à operação.
2 Reserva e confirmação
A pessoa responsável pela reserva deve ser maior de 18 anos ou legalmente capaz, informar dados corretos e
identificar os demais ocupantes. Crianças e adolescentes serão recebidos com a documentação e o 
acompanhamento ou autorização exigidos pela legislação.
Consultar datas, receber uma proposta ou enviar um pedido não confirma a reserva. A confirmação depende 
da disponibilidade, da aceitação das condições e da aprovação do pagamento, e será identificada por um 
código. O hóspede deve conferir a confirmação e comunicar divergências.
Pedidos de entrada no mesmo dia passam por aprovação. Informe a previsão de chegada. A aprovação 
permite prosseguir para pagamento dentro do prazo informado, mas não substitui a confirmação da reserva. 
Não se desloque contando com a acomodação antes de receber essa confirmação.
3 Preço e pagamento
O resumo apresenta diárias, limpeza, extras, descontos e total em reais, além das condições de parcelamento
e juros antes da contratação. Extras são opcionais e exigem escolha expressa. Nenhum serviço adicional será 
incluído apenas por silêncio do hóspede.
Nas reservas diretas, o pagamento da estadia é integral na contratação, pelos meios disponíveis no checkout.
O Pix possui vencimento informado na tela; não pague um código vencido sem nova orientação. No cartão, o 
valor de cada parcela, os juros e o total prevalecem conforme a opção escolhida e registrada.
Preço ou regra alterados depois da confirmação não modificam retroativamente o contrato. Mudanças de 
datas, unidade, ocupação ou extras dependem de nova disponibilidade e orçamento aceito pelo hóspede. 
Valores a pagar ou devolver serão discriminados.
4 Entrada saída e uso da unidade
O horário padrão é entrada a partir das 15h e saída até as 11h, no horário de Brasília, conforme a oferta e a 
confirmação. Entrada antecipada e saída posterior dependem de autorização expressa, disponibilidade e 
eventual preço informado previamente. A previsão de chegada não altera esses horários.
O acesso é coordenado remotamente. As instruções serão fornecidas pelos canais oficiais após a confirmação
e a conferência dos requisitos da reserva. O hóspede deve manter telefone e e-mail atualizados. Se houver 
impedimento de acesso atribuível ao Chalezinho Ville, serão oferecidas providências compatíveis com a 
situação e os direitos aplicáveis.
A unidade deve corresponder ao anúncio e é entregue limpa, com enxoval. Não há serviço de limpeza 
durante a estadia. Trocas adicionais de enxoval não se presumem incluídas e, quando solicitadas, dependem 
de disponibilidade e condições previamente informadas. Essas condições não afastam obrigações legais 
aplicáveis. A equipe combinará o acesso para manutenção necessária, salvo emergência concreta que exija 
intervenção imediata.
5 Garantia de danos e renovação
Quando indicada no resumo, a garantia padrão é de R$ 500,00 por reserva, mediante pré-autorização no 
cartão pelo PagBank. Trata-se de bloqueio temporário de limite, separado do pagamento da estadia, e não 
de cobrança antecipada de danos. Qualquer valor diferente deve ser apresentado antes do aceite.
A autorização da garantia e de sua renovação é expressa no aceite único da reserva. A caixa de aceite identifica os termos, as regras, a política da tarifa escolhida e a autorização do uso do cartão para a caução e suas renovações, inclusive a possível sobreposição temporária de limites. Nada é marcado automaticamente. Sem esse aceite, a reserva direta não poderá ser concluída. Mesmo pagando a estadia por Pix, poderá ser necessário um cartão compatível para a garantia.
A pré-autorização poderá ser realizada próximo à chegada. Quando sua validade não cobrir o período 
necessário da reserva e da vistoria informada, poderá ser renovada automaticamente, apenas para a mesma 
finalidade e até o valor autorizado. A autorização anterior será liberada após o sucesso da nova. Durante a 
atualização do emissor, poderão coexistir dois bloqueios: para garantia de R$ 500,00, até R$ 1.000,00 
temporariamente comprometidos. Isso não autoriza dupla cobrança.
Falha de autorização ou renovação será comunicada para regularização por meio seguro. Não haverá multa 
automática nem nova cobrança da estadia por essa falha. Eventual impossibilidade de prosseguir será 
tratada conforme o contrato e os direitos aplicáveis, sem perda automática de todos os valores pagos.
A garantia não é seguro nem autorização ilimitada para debitar o cartão. A tokenização permite ao 
processador referenciar o cartão sem que seja necessário solicitar novamente seus dados completos em cada
renovação. Nunca envie número completo do cartão ou código de segurança por WhatsApp ou e-mail.
6 Apuração de danos e liberação
O hóspede pode comunicar defeitos ou danos preexistentes na chegada, preferencialmente com fotos. A 
ausência de comunicação imediata não transforma automaticamente um defeito preexistente em 
responsabilidade do hóspede.
Uma solicitação de ressarcimento deve identificar o fato, o vínculo com a estadia, as evidências e o valor 
justificado, considerando o estado anterior e o desgaste do bem. Antes de efetivar cobrança por danos, o 
Chalezinho Ville comunicará a ocorrência e dará oportunidade razoável de resposta e apresentação de 
provas.
Desgaste normal, manutenção, defeitos preexistentes e limpeza ordinária já incluída não serão tratados 
como dano. Não haverá multa automática por avaliação negativa, reclamação ou simples descumprimento 
de uma tarefa de checkout. Valores controvertidos terão análise individual; a existência da garantia não 
dispensa a demonstração do prejuízo.
A cobrança por danos, quando devida, limita-se ao prejuízo demonstrado e ao montante autorizado para 
captura. As multas por infração às regras seguem a cláusula 8 e não se confundem com a apuração de danos. 
Eventual pretensão excedente exige acordo específico ou via legal, sem novos débitos automáticos não 
autorizados. A parte não utilizada será liberada. Sem ocorrência, a liberação será solicitada após a vistoria de 
saída, sem prolongamento injustificado; o prazo de recomposição do limite depende também do emissor. O 
hóspede poderá solicitar o comprovante e acompanhamento da liberação.
7 Cancelamento alteração e não comparecimento
A política da tarifa escolhida integra a reserva e deve apresentar prazos, percentuais de retenção e valores 
reembolsáveis antes do pagamento. O rótulo “não reembolsável” não afasta direitos legais. Uma janela 
comercial de 24 horas não reduz o prazo legal de arrependimento quando aplicável.
Nas contratações a distância abrangidas pelo art. 49 do Código de Defesa do Consumidor, será assegurado o 
direito de arrependimento em sete dias, com restituição na forma legal. Reservas para o mesmo dia ou 
estadias já iniciadas exigem análise das circunstâncias; o simples aceite não constitui renúncia genérica a esse
direito.
Cancelamentos devem ser solicitados pelos canais oficiais ou pela área da reserva, quando disponível. O 
recebimento será confirmado e o cálculo discriminado. Alteração, saída antecipada e não comparecimento 
seguem a política aceita, ressalvados direitos legais e situações que exijam análise individual. Serviços e 
extras não prestados serão considerados separadamente no cálculo.
Se o Chalezinho Ville não puder cumprir a reserva, informará o hóspede e oferecerá as soluções legalmente 
cabíveis. Remarcação ou unidade alternativa dependem de concordância; não serão impostas como 
substituição obrigatória de restituição devida. Eventos externos não afastam automaticamente toda 
responsabilidade ou direito a reembolso.
8 Convivência responsabilidade e solução de problemas
As Regras da Propriedade integram o contrato. Ocorrências devem ser comunicadas para permitir solução. 
Medidas por infração serão proporcionais à gravidade e ao risco; não autorizam retirada arbitrária de 
pertences, interrupção abusiva de serviços ou retenção automática de toda a garantia.
É proibida a realização de festas na propriedade. O descumprimento sujeita o responsável pela reserva à 
multa de R$ 5.000,00 (cinco mil reais) por dia em que a realização ou continuidade da festa for comprovada, 
observados os limites legais e o procedimento de apuração abaixo.
É proibido fumar nas áreas internas do chalé, inclusive utilizar cigarros eletrônicos. O descumprimento sujeita
o responsável pela reserva à multa de R$ 1.000,00 (mil reais), além do ressarcimento de lavagem, limpeza e 
higienização extraordinárias necessárias em decorrência da infração. Os serviços e custos devem ser 
discriminados e comprovados; a limpeza ordinária já incluída na reserva não será cobrada novamente.
É proibido utilizar caixas de som na área da piscina, independentemente do volume. Não há multa específica 
estipulada para essa conduta; eventual dano comprovado segue o procedimento de apuração previsto nestes
termos.
A aplicação de multa exige identificação da infração, evidências, comunicação ao responsável pela reserva e 
oportunidade razoável de manifestação. Serão observados os limites legais da cláusula penal, a 
proporcionalidade e a possibilidade de redução de penalidade excessiva. Fica convencionada indenização 
suplementar para prejuízos comprovados que excedam o valor coberto pela multa, inclusive despesas 
extraordinárias decorrentes do fumo, sem duplicidade de ressarcimento pelo mesmo prejuízo. As multas não
autorizam captura automática da garantia nem novos débitos no cartão sem autorização específica ou 
fundamento legal.
O Chalezinho Ville responde por suas obrigações e pelas falhas que lhe sejam legalmente atribuíveis. As 
orientações de segurança não excluem responsabilidade por defeitos, informação insuficiente ou condições 
inseguras. O hóspede responde pelos prejuízos que lhe sejam comprovadamente imputáveis, na forma da lei.
A busca de solução pelo atendimento não impede acesso ao Procon, aos órgãos competentes ou ao 
Judiciário. Não se exige foro exclusivo que restrinja os direitos do consumidor.
9 Aceite e versões
Antes do pagamento, o hóspede deve poder ler, corrigir seus dados e guardar estes termos, as regras e a 
política de cancelamento. O registro eletrônico deve identificar a versão aceita, a reserva e a data do aceite. 
Alterações posteriores aplicam-se a novas contratações, sem reduzir direitos já adquiridos.
Texto para aceite único: “Li e aceito os Termos de Hospedagem, as Regras da Propriedade e a política de cancelamento da tarifa que escolhi, incluindo o uso do cartão para a caução e suas renovações, com possível sobreposição temporária dos limites bloqueados. Estou ciente da Política de Privacidade.”
A marcação única registra o aceite de cada documento e, quando houver garantia, a autorização da pré-autorização e das renovações necessárias para esta reserva, conforme a cláusula 5. Cobranças por danos continuam sujeitas à apuração descrita na cláusula 6.
Referências
Código de Defesa do Consumidor, especialmente arts. 6, 14, 30, 46, 49 e 51: 
https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
Decreto nº 7.962/2013, contratação eletrônica: https://www.planalto.gov.br/ccivil_03/_ato2011-
2014/2013/decreto/d7962.htm
Lei nº 8.245/1991, quando caracterizada locação por temporada: 
https://www.planalto.gov.br/ccivil_03/leis/l8245.htm
Referência comparativa de transparência e apuração de danos, sem incorporar o contrato da plataforma: 
https://www.booking.com/content/terms.pt-br.html
Código Civil, especialmente arts. 408 a 416, sobre cláusula penal e indenização suplementar: 
https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm$newterms$,'active',clock_timestamp());
 END IF;
END $consent$;
