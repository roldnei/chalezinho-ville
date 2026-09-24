# Cadastro simples de experiências

A tela `experiencias-admin.html` foi simplificada para operação diária.

Campos visíveis:
- Tipo do pacote
- Nome
- Preço
- Descrição
- Upsell: Sim/Não
- Fotos (mínimo 5)

Ações:
- Salvar experiência / Salvar alterações
- Pausar / Ativar
- Excluir

A tela não expõe mais códigos, variantes, ordem, antecedência, propriedades ou motivos de viagem.

Compatibilidade:
- o modelo antigo de variantes permanece apenas por baixo para não quebrar o funil atual;
- ao salvar um pacote simples, o preço sincroniza com a primeira variante ativa;
- novas experiências recebem uma variante técnica única automaticamente;
- excluir apaga quando não há histórico; se houver histórico, arquiva e remove da operação.

O comportamento visual do hóspede não foi alterado nesta rodada.
