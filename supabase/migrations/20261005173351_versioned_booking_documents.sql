-- Documents are append-only. Publishing changes the version used by future acceptances.
alter table public.policy_documents add column if not exists published_by uuid references auth.users(id);
alter table public.reservation_policy_acceptances add column if not exists document_snapshot jsonb;
alter table public.reservation_policy_acceptances add column if not exists snapshot_recorded_at timestamptz;
update public.reservation_policy_acceptances a set document_snapshot=jsonb_build_object('title',d.title,'body',d.body,'code',a.document_code,'version',a.document_version,'document_type',d.document_type),snapshot_recorded_at=now() from public.policy_documents d where d.id=a.document_id and a.document_snapshot is null;
create or replace function public.guard_policy_document() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'policy_document_immutable'; end if;
 if (new.code,new.version,new.title,new.body,new.document_type,new.created_at,new.effective_at,new.published_by) is distinct from (old.code,old.version,old.title,old.body,old.document_type,old.created_at,old.effective_at,old.published_by) then raise exception 'policy_document_immutable'; end if;
 return new;
end $$;
create trigger immutable_policy_document before update or delete on public.policy_documents for each row execute function public.guard_policy_document();
create or replace function public.snapshot_policy_acceptance() returns trigger language plpgsql set search_path=public as $$
declare d public.policy_documents; latest uuid;
begin
 if tg_op<>'INSERT' then raise exception 'policy_acceptance_immutable'; end if;
 perform pg_advisory_xact_lock(1052026);
 select * into d from public.policy_documents where id=new.document_id;
 if d.id is null then raise exception 'policy_unavailable'; end if;
 if d.document_type in ('hosting_terms','property_rules','privacy_policy') then
  select id into latest from public.policy_documents where document_type=d.document_type and status in ('active','draft') order by (status='active') desc,string_to_array(version,'.')::int[] desc,created_at desc limit 1;
  if latest is distinct from d.id then raise exception 'policy_version_changed'; end if;
 end if;
 new.document_code:=d.code;new.document_version:=d.version;new.accepted_at:=clock_timestamp();new.snapshot_recorded_at:=new.accepted_at;
 new.document_snapshot:=jsonb_build_object('title',d.title,'body',d.body,'code',d.code,'version',d.version,'document_type',d.document_type);
 return new;
end $$;
create trigger immutable_policy_acceptance before insert or update or delete on public.reservation_policy_acceptances for each row execute function public.snapshot_policy_acceptance();
create or replace function public.publish_booking_document(p_type text,p_title text,p_body text,p_actor uuid,p_previous_id uuid default null) returns uuid language plpgsql security invoker set search_path=public as $$
declare previous public.policy_documents; next_version text; result uuid;
begin
 perform pg_advisory_xact_lock(1052026);
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and pms_access_status='active') then raise exception 'admin_required'; end if;
 if p_type not in ('hosting_terms','property_rules','privacy_policy') or length(trim(p_title)) not between 3 and 200 or length(trim(p_body)) not between 100 and 100000 then raise exception 'invalid_document'; end if;
 select * into previous from public.policy_documents where document_type=p_type and status in ('active','draft') order by (status='active') desc,string_to_array(version,'.')::int[] desc,created_at desc limit 1;
 if p_previous_id is distinct from previous.id then raise exception 'policy_version_changed'; end if;
 next_version:=case when previous.id is null or previous.version='0.1' then '1.0' else split_part(previous.version,'.',1)||'.'||(coalesce(nullif(split_part(previous.version,'.',2),''),'0')::int+1)::text end;
 insert into public.policy_documents(document_type,code,version,title,body,status,effective_at,published_by) values(p_type,p_type,next_version,trim(p_title),trim(p_body),'active',clock_timestamp(),p_actor) returning id into result;
 return result;
end $$;
revoke execute on function public.publish_booking_document(text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_booking_document(text,text,text,uuid,uuid) to service_role;
revoke execute on function public.guard_policy_document() from public,anon,authenticated;
revoke execute on function public.snapshot_policy_acceptance() from public,anon,authenticated;
-- Access through authenticated, ownership-checked Edge Functions only.
revoke insert,update,delete on public.policy_documents from anon,authenticated;
revoke insert,update,delete on public.reservation_policy_acceptances from anon,authenticated;

insert into public.policy_documents(document_type,code,version,title,body,status,effective_at) select 'hosting_terms','hosting_terms','1.1','Termos de Hospedagem','Termos de Hospedagem
Chalezinho Ville • Versão 1.1 • 5 de outubro de 2026
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
A autorização da garantia e de sua renovação deve ser expressa e separada do aceite destes termos. Sem a 
autorização exigida e previamente informada, a reserva direta não poderá ser concluída. Mesmo pagando a 
estadia por Pix, poderá ser necessário um cartão compatível para a garantia.
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
Texto para aceite: “Li e aceito os Termos de Hospedagem, as Regras da Propriedade e a política de 
cancelamento da tarifa escolhida, disponíveis antes do pagamento.”
Texto para autorização separada: “Autorizo a pré-autorização da garantia no valor apresentado e suas 
renovações necessárias para esta reserva, conforme a cláusula 5. Entendo o bloqueio temporário de limite e 
a possibilidade de sobreposição transitória de duas autorizações. Cobranças por danos dependem da 
apuração descrita na cláusula 6.”
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
https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm','active',now() where not exists(select 1 from public.policy_documents where code='hosting_terms' and version='1.1');

insert into public.policy_documents(document_type,code,version,title,body,status,effective_at) select 'property_rules','property_rules','1.1','Regras da Propriedade','Regras da Propriedade
Chalezinho Ville • Versão 1.1 • 5 de outubro de 2026
Estas regras organizam a estadia no Chalezinho Ville e devem ser apresentadas antes da reserva. As 
características, a capacidade e os equipamentos da unidade escolhida constam do anúncio e da confirmação. 
Fotos de outro chalé não integram automaticamente a oferta.
1 Seu chalé
Ville Signature — CH1: unidade com piscina privativa e spa aquecido em terreno exclusivo.
Ville Essenza — CH2: unidade com hidromassagem privativa, sem piscina, em terreno compartilhado. Ville 
Amore — CH3: unidade com hidromassagem privativa, sem piscina; não dispõe de lava e seca.
Use somente os espaços identificados como pertencentes à sua reserva. Estar em terreno compartilhado não
autoriza acesso a outra unidade, seu deck ou sua hidromassagem. Não há promessa de área gourmet ou 
churrasqueira. A lista de comodidades da unidade contratada deve ser conferida antes da reserva.
2 Chegada e saída
Entrada a partir das 15h e saída até as 11h, horário de Brasília, salvo ajuste expresso registrado na reserva. 
Informe a previsão de chegada e avise sobre atrasos. Entrada antecipada ou saída posterior não se 
presumem autorizadas.
Siga as instruções de acesso remoto e não compartilhe códigos com terceiros não autorizados. Ao sair, feche 
portas e janelas, desligue equipamentos de uso do hóspede conforme orientação e devolva chaves ou 
controles no local combinado. Não desligue sistemas técnicos de piscina, segurança ou conectividade.
3 Ocupantes visitantes e tranquilidade
Respeite a quantidade máxima de hóspedes informada para a unidade e cadastre todos os ocupantes. 
Visitantes, ensaios comerciais e uso por pessoas não incluídas na reserva dependem de autorização prévia; 
essa autorização não permite realizar festas. A reserva não pode ser transferida ou sublocada sem 
concordância.
É proibida a realização de festas na propriedade. O descumprimento sujeita o responsável pela reserva à 
multa de R$ 5.000,00 (cinco mil reais) por dia em que a realização ou continuidade da festa for comprovada, 
observados os limites legais e o procedimento de apuração abaixo. Não é permitido som que perturbe os 
vizinhos. Mantenha volume moderado em qualquer horário e cuidado especial no período noturno. São 
vedadas atividades ilícitas, violência, assédio e discriminação.
Crianças e adolescentes precisam de identificação e acompanhamento ou autorização legalmente exigidos. O
responsável deve supervisionar seu acesso à água, ao fogo e aos equipamentos.
4 Piscina spa e hidromassagem
Utilize somente os equipamentos existentes na unidade reservada e observe as instruções de 
funcionamento. O aquecimento depende das condições técnicas e ambientais; uma temperatura específica 
somente será compromisso contratual quando expressamente anunciada. Essa informação não elimina a 
obrigação de entregar o aquecimento oferecido ou resolver falhas.
É proibido utilizar caixas de som na área da piscina, independentemente do volume. Não há multa específica 
estipulada para essa conduta; eventual dano comprovado segue os Termos de Hospedagem.
Não coloque vidro, aparelhos elétricos portáteis, alimentos, óleos, sais, corantes ou produtos de banho na 
água, salvo produto expressamente autorizado para o equipamento. Não acione hidromassagem sem o nível 
de água indicado e não altere válvulas, bombas, quadros elétricos ou regulagens técnicas.
Não corra nas bordas, não mergulhe de cabeça e respeite a profundidade sinalizada. Crianças devem 
permanecer sob supervisão direta de adulto. Não entre na água se sua condição comprometer a segurança. 
Em caso de mau funcionamento, interrompa o uso e avise o atendimento.
A piscina do Signature tem profundidade informada de aproximadamente 1,40 m. Confira a sinalização local. 
Não trate coberturas térmicas como superfícies de apoio ou proteção contra afogamento. Use as orientações
fornecidas para sua retirada e recolocação.
5 Pets
Pets são aceitos, mediante informação na reserva sobre quantidade e porte, observada a capacidade do 
espaço. Eventual taxa ou restrição específica precisa constar da oferta antes do pagamento; não haverá 
cobrança surpresa na chegada.
O tutor deve recolher resíduos, evitar ruído e manter o animal sob controle, especialmente nas áreas de 
circulação compartilhada. Não deixe o animal sozinho se houver risco de fuga, sofrimento, dano ou 
perturbação. Mantenha-o fora da piscina, spa e hidromassagem.
Danos atribuídos ao animal seguem o mesmo procedimento de evidências e manifestação previsto nos 
Termos de Hospedagem. Animais de assistência recebem o tratamento previsto na legislação aplicável, sem 
equiparação automática às regras comerciais de pets.
6 Fogo fumo e equipamentos
É proibido fumar nas áreas internas do chalé, inclusive utilizar cigarros eletrônicos. O descumprimento sujeita
o responsável pela reserva à multa de R$ 1.000,00 (mil reais), além do ressarcimento de lavagem, limpeza e 
higienização extraordinárias necessárias em decorrência da infração. Os serviços e custos devem ser 
discriminados e comprovados; a limpeza ordinária já incluída na reserva não será cobrada novamente. Em 
área externa permitida, evite que fumaça alcance outras unidades e descarte resíduos com segurança. Não 
jogue bitucas no jardim.
A fogueira, quando disponível, deve ser utilizada somente no local destinado e nas condições autorizadas. 
Não use combustíveis líquidos, não deixe o fogo sem supervisão e suspenda o uso em condições de vento ou 
restrição de segurança. Não improvise churrasqueiras ou fogo em decks e gramados.
Use ar-condicionado com portas e janelas fechadas. Não altere instalações elétricas nem conecte 
equipamentos de potência incompatível. Não desative proteções ou tente consertos. Comunique cheiro de 
queimado, vazamentos, faíscas ou aquecimento anormal.
7 Conservação limpeza e atendimento
A unidade é entregue limpa e com enxoval. Não oferecemos serviço de limpeza durante a estadia. A limpeza 
ordinária entre reservas, quando incluída no preço ou na taxa informada, não será cobrada novamente como
dano. Pedimos que descarte o lixo nos locais indicados, evite resíduos em ralos e cuide dos móveis e do 
enxoval. Não é exigida limpeza profissional pelo hóspede no checkout.
Comunique avarias e necessidades de manutenção. Fotografias podem ajudar a registrar o estado do imóvel, 
respeitando a privacidade de todos. A equipe combinará visitas, limpeza ou manutenção, salvo emergência 
concreta.
A entrada de funcionários deve ter finalidade definida e respeitar a privacidade. A ocorrência de falha 
relevante em uma comodidade anunciada será tratada conforme o contrato e a lei; estas regras não afastam 
direitos à correção ou à reparação cabível.
Dúvidas e esclarecimentos sobre o chalé, a reserva e estas regras: atendimento@chalezinhoville.com.br. 
Página oficial do Chalezinho Ville: https://chalezinhoville.com.br. Atendimento das 08h às 17h, horário de 
Brasília.
8 Segurança e privacidade
Há câmeras apontadas para áreas externas, destinadas à segurança. A localização e a área efetivamente 
monitorada de cada unidade devem ser informadas no anúncio antes da reserva. Não se admite câmera 
oculta ou monitoramento de quartos, banheiros, espaços internos privativos e locais com expectativa de 
intimidade. A presença de câmera em uma unidade não deve ser presumida nas demais.
Guarde seus pertences e confira portas e janelas. Esse cuidado não exclui a responsabilidade do 
estabelecimento quando legalmente existente. Não interfira nos equipamentos de segurança.
Use os contatos oficiais informados na confirmação. Para risco imediato, acione o serviço público adequado: 
Polícia Militar 190, SAMU 192 ou Bombeiros 193. Informe também a administração assim que for seguro.
9 Descumprimento e solução
Sempre que possível, a administração indicará a ocorrência e solicitará sua correção. Risco grave ou atividade
ilícita pode exigir medidas imediatas e acionamento das autoridades. Qualquer cobrança deve ter 
fundamento, valor demonstrado e oportunidade de resposta, sem penalidade automática inventada depois 
da reserva.
A aplicação de multa exige identificação da infração, evidências, comunicação ao responsável pela reserva e 
oportunidade razoável de manifestação. Serão observados os limites legais da cláusula penal, a 
proporcionalidade e a possibilidade de redução de penalidade excessiva. Fica convencionada indenização 
suplementar para prejuízos comprovados que excedam o valor coberto pela multa, inclusive despesas 
extraordinárias decorrentes do fumo, sem duplicidade de ressarcimento pelo mesmo prejuízo. As multas não
autorizam captura automática da garantia nem novos débitos no cartão sem autorização específica ou 
fundamento legal.
Referências
ECA, art. 82 e disposições aplicáveis à hospedagem de menores: 
https://www.planalto.gov.br/ccivil_03/leis/l8069.htm
Referência de boas práticas de privacidade e divulgação de câmeras, sem vínculo com o Airbnb: 
https://www.airbnb.com.br/help/article/2914
Referência de convivência e distinção entre desgaste e danos: https://www.airbnb.com.br/help/article/2894
Código Civil, arts. 408 a 416, sobre cláusula penal e indenização suplementar: 
https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm','active',now() where not exists(select 1 from public.policy_documents where code='property_rules' and version='1.1');

insert into public.policy_documents(document_type,code,version,title,body,status,effective_at) select 'privacy_policy','privacy_policy','1.0','Política de Privacidade','Política de Privacidade
Chalezinho Ville • Versão 1.0 • 4 de outubro de 2026
Esta política explica como o Chalezinho Ville trata dados de visitantes, hóspedes e pessoas que entram em 
contato ou fazem reservas. O tratamento deve limitar-se ao necessário para cada finalidade, respeitando a 
Lei Geral de Proteção de Dados Pessoais, a LGPD.
1 Quem é responsável
Controlador: Roldnei da Costa Candido. CPF: 111.271.437-51. Endereço de contato: Rua Juiz de Fora, 79, 
Guarapari – ES, CEP 29106-380. Canal para dúvidas, questões e solicitações de privacidade: 
atendimento@chalezinhoville.com.br, com atendimento das 08h às 17h, horário de Brasília. Canal 
alternativo: WhatsApp +55 (93) 99159-2266.
O responsável identifica e responde pelas decisões sobre os dados utilizados na operação do Chalezinho Ville.
Se uma reserva envolver imóvel de outro proprietário, a identificação de seu responsável e os 
compartilhamentos necessários deverão ser informados antes da contratação.
2 Dados utilizados e finalidades
Cadastro e contato: nome, e-mail, telefone, documento de identificação e dados necessários à conta são 
utilizados para identificar o responsável, autenticar o acesso, atender solicitações e preparar a reserva.
Reserva e estadia: imóvel, datas, ocupantes, previsão de chegada, serviços escolhidos, instruções e histórico 
de atendimento são utilizados para cumprir o contrato e organizar a estadia. Dados de acompanhantes e 
menores devem ser limitados aos necessários à identificação, segurança e obrigações aplicáveis.
Pagamento e garantia: valor, meio de pagamento, identificadores das transações, situação financeira, 
referência tokenizada do cartão, autorizações e liberações permitem processar pagamentos, conciliação e 
garantia. O processamento do cartão ocorre com o PagBank. Não envie dados completos de cartão nem 
código de segurança por mensagens.
Ocorrências e exercício de direitos: relatos, comunicações, fotos pertinentes e comprovantes podem ser 
necessários para apurar danos, resolver reclamações ou defender direitos. Não envie imagens de 
documentos ou de pessoas sem necessidade para o atendimento.
Navegação: o site pode registrar eventos de acesso, páginas de imóveis e identificador pseudônimo de 
sessão para medir uso e conversão em reservas. Os eventos de métricas implementados não incluem nome, 
e-mail, IP ou URL completa; o identificador pode ser relacionado à reserva para atribuição de conversão. Isso 
não significa que seja dado necessariamente anônimo. Provedores de infraestrutura podem manter registros 
técnicos, inclusive de rede, para operação e segurança.
3 Fundamentos do tratamento
Usamos a execução do contrato e os procedimentos solicitados antes dele para cadastro, reserva, 
pagamento e atendimento. Obrigações legais fundamentam registros obrigatórios, fiscais e outras exigências 
aplicáveis. O exercício regular de direitos fundamenta a conservação e utilização proporcional de provas.
Interesses legítimos podem fundamentar medidas proporcionais de segurança e melhoria do serviço, após 
avaliação de necessidade, impacto e salvaguardas. Não são autorização para uso irrestrito dos dados. 
Tratamentos que dependam de consentimento terão finalidade específica e escolha livre, com possibilidade 
de revogação.
Dados sensíveis, quando indispensáveis, exigem fundamento próprio e proteção adequada. Pedidos de 
acessibilidade devem evitar a coleta de diagnósticos desnecessários. Dados de crianças e adolescentes serão 
tratados considerando seu melhor interesse e as exigências legais aplicáveis.
A ciência desta política não equivale a consentimento genérico. Para reservar, são necessários os dados 
indispensáveis ao contrato e às obrigações legais, mas não a concordância com publicidade ou usos 
opcionais. A autorização da garantia financeira é apresentada separadamente.
4 Com quem compartilhamos
Compartilhamos apenas o necessário com pessoas autorizadas da operação, prestadores de limpeza e 
manutenção quando precisarem de informações para o serviço, suporte técnico e fornecedores de 
infraestrutura. Um prestador de limpeza não precisa receber dados completos de pagamento ou 
documentos do hóspede para executar sua atividade.
Entre os serviços utilizados no projeto estão Supabase, para autenticação e dados; Vercel, para hospedagem 
do site; PagBank, para pagamentos e garantia; e serviços de e-mail transacional, como Brevo. Cada 
fornecedor recebe os dados necessários à função contratada. Instituições financeiras podem atuar sob suas 
próprias obrigações e políticas.
Quando a reserva se origina em Airbnb, Booking ou outro canal, recebemos os dados disponibilizados para 
sua execução. A sincronização de calendários deve transmitir somente o necessário à disponibilidade. A 
integração de preços não autoriza compartilhar indiscriminadamente documentos ou dados financeiros de 
hóspedes.
Podemos compartilhar informações para cumprir exigência legal, ordem de autoridade competente ou 
exercício regular de direitos, com análise de necessidade. Dados não serão vendidos para publicidade. Outros
proprietários usuários do PMS não devem ter acesso às reservas do Chalezinho Ville sem fundamento e 
autorização pertinentes.
5 Armazenamento e transferências internacionais
O uso de infraestrutura em nuvem pode envolver processamento fora do Brasil. Nesses casos, o controlador 
deve verificar o país, o fornecedor e o mecanismo legal adequado de transferência, como cláusulas 
contratuais aprovadas ou outra hipótese admitida pela LGPD e pela regulamentação da ANPD.
A contratação de um provedor estrangeiro não dispensa essa verificação. O titular pode solicitar informações
sobre os compartilhamentos e as salvaguardas aplicáveis pelo canal de privacidade.
6 Cookies sessões e comunicações
Recursos de sessão e armazenamento do navegador podem ser necessários para autenticação, continuidade 
do fluxo e segurança. A opção “manter-me conectado”, quando utilizada, deve ser escolhida pelo usuário; 
evite-a em dispositivos compartilhados e encerre a sessão ao terminar.
As métricas de acesso utilizam identificador de sessão e respeitam os sinais DNT e Global Privacy Control na 
implementação examinada. A duração do identificador no navegador não é igual ao prazo de retenção dos 
eventos no servidor.
Tecnologias opcionais de publicidade ou rastreamento que dependam de consentimento somente poderão 
ser ativadas após escolha específica. Recusar publicidade não deve impedir a reserva. Uma futura mudança 
de tecnologias exige atualização das informações e dos controles aplicáveis.
Mensagens necessárias à reserva, ao pagamento, à segurança e ao atendimento não são publicidade. Ofertas
promocionais terão opção separada e cancelamento facilitado. Informar telefone para contato sobre a 
estadia não significa autorizar campanhas de WhatsApp.
7 Prazo de conservação
Mantemos dados pelo tempo necessário à finalidade, às obrigações legais e ao exercício regular de direitos. 
Dados de reserva e transações podem precisar ser conservados após a estadia; excluir a conta não elimina 
automaticamente esses registros.
Dados desnecessários deverão ser excluídos ou anonimizados. Informações mantidas para obrigação legal ou 
defesa de direitos terão uso restrito à justificativa de conservação. Cópias de segurança seguem seu ciclo de 
retenção e não devem reativar rotineiramente dados já excluídos.
O controlador deve manter uma tabela operacional de retenção por categoria, com fundamento, prazo e 
responsável. O titular pode solicitar esclarecimentos sobre o período aplicável aos seus dados; não adotamos
uma promessa única de exclusão imediata para todos os registros.
8 Segurança e imagens
Devem ser adotados controles de acesso por função, proteção das credenciais, registros pertinentes de 
operações e medidas proporcionais de prevenção e resposta a incidentes. Nenhum sistema oferece risco 
zero. Não forneça senhas ou códigos de autenticação a terceiros.
Há câmeras apontadas para áreas externas, com finalidade de segurança. Sua localização e o campo de visão 
devem ser informados antes da reserva e sinalizados no local. O acesso às imagens deve ser restrito e o prazo
de retenção definido. Não se admite câmera oculta ou monitoramento de ambientes íntimos. Uma 
ocorrência pode justificar preservação pontual de imagens relevantes.
Incidentes que possam causar risco ou dano relevante aos titulares serão avaliados e comunicados nos 
termos da legislação e dos prazos regulamentares. O canal de privacidade também recebe relatos de uso 
indevido de dados.
9 Seus direitos e atendimento
Você pode solicitar confirmação de tratamento, acesso, correção, informação sobre compartilhamentos e, 
nas hipóteses legais, anonimização, bloqueio, eliminação, portabilidade, oposição e revisão de decisões 
automatizadas. Pode revogar consentimentos sem tornar ilícito o tratamento anterior válido e sem afastar 
obrigações legais de conservação.
Envie a solicitação ao canal indicado na seção 1, informando o pedido e um meio de retorno. Podemos 
verificar sua identidade de modo proporcional para não entregar dados a terceiros. Não envie documentação
excessiva. Informaremos o andamento, a resposta ou o fundamento de eventual limitação nos prazos 
aplicáveis.
Você pode procurar a ANPD e os órgãos de defesa do consumidor. Não é obrigatório renunciar a esses canais
para utilizar o atendimento do Chalezinho Ville.
10 Atualizações e ciência
Mudanças relevantes serão comunicadas de forma adequada, com nova data e versão. Novas finalidades 
incompatíveis com as anteriores exigem avaliação e, quando necessário, nova autorização. A atualização 
desta política não constitui autorização retroativa.
Texto de ciência para a reserva: “Recebi e pude consultar a Política de Privacidade, que explica o tratamento 
dos dados necessários à reserva e os canais para exercer meus direitos.”
Texto opcional para marketing, em campo separado e desmarcado: “Quero receber ofertas do Chalezinho 
Ville pelo canal que escolher. Posso cancelar a qualquer momento.” A ausência dessa escolha não impede a 
reserva.
Referências
Lei nº 13.709/2018, LGPD, texto compilado: 
https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
Regulamentação e orientações de proteção de dados: https://www.gov.br/anpd/pt-br','active',now() where not exists(select 1 from public.policy_documents where code='privacy_policy' and version='1.0');
