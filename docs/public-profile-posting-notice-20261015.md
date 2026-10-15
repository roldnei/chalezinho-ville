# Aviso de perfil público para postar

A conta mostra um aviso destacado para perfis novos ou privados, explicando que é necessário marcar Quero um perfil público e Salvar perfil. O botão Mostrar onde marcar e a ação Compartilhar momento abrem o formulário e focam a caixa de consentimento. A caixa permanece desmarcada e nenhuma gravação acontece sem ação explícita da pessoa.

O aviso explica quais informações ficam públicas, preserva a privacidade da reserva e informa a aprovação dos Trips. Perfis já públicos seguem diretamente ao editor.

Validação: `node --test tests/villegram-community.test.mjs`: 29 passaram, zero falhas. Inclui perfil novo, privado, foco na opção, ausência de ativação automática e perfil público. Interface exercitada em JSDOM; sem aparelho físico nesta alteração. Sem mudança de banco, permissões, cadastros ou consentimentos reais.
