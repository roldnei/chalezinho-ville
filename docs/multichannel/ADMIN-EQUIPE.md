# Gestão multicanal — guia de operação DEV

Estado: implementação em DEV; homologação visual de fotos e celular ainda pendente. Não usar como autorização de publicação.

## Administrador

1. Entre na Central e abra **Hoje**. Entradas e saídas são **previstas**. O campo **Presenças registradas** só aumenta após registrar a entrada. O relógio não confirma presença nem saída.
2. Abra **Calendários**. Confira a última atualização e as falhas de cada fonte. A rotina roda no servidor a cada 10 minutos; **Sincronizar agora** acrescenta uma leitura manual.
3. Em **Classificar / vincular**, confira o evento no canal. Bloqueio ou manutenção não é hospedagem. Se a informação for insuficiente, mantenha **Classificação pendente**. Se já houver cadastro, selecione a hospedagem correspondente; não crie outra.
4. Em **Hospedagens → Cadastrar hospedagem externa / direta**, informe imóvel, canal, datas e somente os dados conhecidos. Identifique a confirmação na observação. Isso não cria cobrança do site. Dados ausentes continuam pendentes.
5. Em uma hospedagem, use **Complementar dados / datas**. Eventos já vinculados preservam imóvel/canal/identificador. Conflitos importados precisam de conferência; não são resolvidos sobrescrevendo outra estadia.
6. Registre **entrada real** e **saída real** apenas após confirmação da equipe. Uma saída prevista às 11h não constitui checkout realizado. Reservas próprias devem ser alteradas na reserva original.
7. Em **Checklists**, crie um modelo global ou por imóvel, escolhendo **Preparação** ou **Conferência de saída**. Cada linha é um item ativo; retirar uma linha cria uma revisão sem aquele item. A tarefa guarda a versão utilizada quando foi criada.
8. Em **Tarefas**, abra cada preparação/conferência e escolha o responsável. A pessoa precisa ter acesso ativo ao imóvel e permissão de limpeza em **Equipe e acessos**. Funcionários veem somente suas tarefas autorizadas.
9. Confira horários, atraso e troca no mesmo dia. Preparação: prazo 30 minutos antes da entrada; a janela considera a saída da hospedagem anterior e sinaliza quando há menos de 2 horas. Conferência: prevista na saída, com prazo de uma hora. Horários dos imóveis, fuso America/Sao_Paulo.
10. Use **Limpeza avulsa** para serviços sem hospedagem. Ela não declara o imóvel pronto para uma chegada específica.
11. Abra uma tarefa **Aguardando vistoria**, confira resultado e foto de cada item e pressione **Aprovar esta preparação / conferência**. A aprovação vale para aquela tarefa e versão da hospedagem. Reabrir preserva o histórico.
12. Na hospedagem, **Comparar fotos da preparação e da saída** mostra as etapas lado a lado. **Consultar tarefas e fotos anteriores** abre o acervo anterior, sem reclassificar imagens antigas.

## Equipe de limpeza

1. Entre no PMS com seu próprio acesso e abra **Tarefas**. Se uma tarefa não aparecer, peça ao administrador para conferir imóvel, permissão e atribuição.
2. Abra a preparação correspondente à chegada e confira o prazo. Pressione **Iniciar**.
3. Para cada item, escolha **Conforme**, **Ocorrência / manutenção para análise** ou **Não se aplica**. Registre observações e salve o item.
4. Envie pelo menos uma foto por item. **Adicionar foto / usar câmera** permite selecionar arquivo; **Capturar agora** solicita a câmera do aparelho. Mesmo “Não se aplica” exige foto de contexto.
5. Aguarde o progresso e a miniatura. Se falhar, use **Reenviar foto pendente** na mesma conta/dispositivo. Não limpe os dados do navegador enquanto houver envio pendente. O identificador do envio evita duplicação na retentativa.
6. Pressione **Enviar para vistoria**. O servidor impede o envio se faltar resultado ou foto. Somente a administração aprova.
7. Após a saída, abra a tarefa distinta **Conferência de saída** e repita resultado, observação e foto por item. Não envie fotos da saída na tarefa de preparação.
8. Sinalize impedimentos e ocorrências para análise. A operação não manda mensagem ao hóspede nem gera cobrança, multa ou captura de garantia por uma anotação/foto.

## Limitações práticas

- iCal não garante nome, telefone, quantidade, preço ou pagamento. Uma indisponibilidade não comprova reserva.
- A ausência de evento ou falha de leitura mantém a hospedagem e gera divergência. Cancelamento explícito cancela tarefas futuras pertinentes; histórico concluído permanece.
- Imagens novas são privadas, anexadas com autor/horário/item/etapa. Links assinados expiram em 5 minutos. Não compartilhe esses links.
- HEIC não foi homologado. Use JPEG/PNG/WebP; limite de entrada 25 MB, compressão até 1600 px e 512 KiB. Câmera, orientação e recuperação após falha de rede precisam da validação pendente em celular real.

A geração automática abrange hospedagens sem checkout registrado, com saída prevista hoje ou depois (America/Sao_Paulo). Reservas antigas continuam no histórico e não criam novas tarefas. As pendências retroativas da implantação foram arquivadas; fotos e resultados permanecem em **Todas, incluindo histórico**. Conferências geradas para hospedagens atuais continuam disponíveis após a saída até sua conclusão. Limpezas avulsas não são afetadas.
