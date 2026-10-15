# Publicações abertas com aprovação — produção, 15/10/2026

Autorização explícita do proprietário: liberar em produção publicações para qualquer pessoa cadastrada, mantendo sua aprovação. A elegibilidade agora aceita qualquer conta autenticada não anônima. Reserva, convite ou liberação prévia não são exigidos. O perfil público continua exigindo consentimento. Reservas existentes são consultadas somente para sugerir o imóvel.

O frontend de produção foi preservado no deployment `dpl_2NRbG5Pd9XPsu4ybdL3oZrUWbnbe`, commit `ea48097e282be325778054fce22f8cd50834eb2a`, domínio `chalezinhoville.com.br`. A alteração foi aplicada somente ao módulo de comunidade da Edge `villegram-content`: DEV versão 26 → 27; PROD versão 7 → 8, ACTIVE. Os demais arquivos do pacote de produção foram preservados e a igualdade do pacote implantado foi conferida. Sem migrações nesta liberação. As conferências e a fila administrativa desenvolvidas nesta branch não foram promovidas para produção por esta ação.

Validação: 25 testes específicos passaram. Suíte completa final: 748 testes, zero falhas. A primeira execução teve um timeout intermitente no teste de entrada operacional que usa espera fixa de 30 ms; o teste isolado e a repetição da suíte completa passaram sem alteração nesse fluxo.

API real DEV: conta temporária com zero reservas e zero convites; criação do perfil público com foto JPEG retornou 200; `guest_save` solicitando `published` retornou 200 e persistiu `pending_review`; tentativa de `community_moderate` pela conta comum retornou 403 `admin_required`. A aprovação pelo RPC administrativo publicou o fixture e seu arquivamento encerrou o teste. Conta/perfil temporários foram suspensos/desativados. Nenhum usuário, postagem ou mídia de teste foi criado em PROD.

A conta temporária foi criada como fixture de Auth; o primeiro login falhou porque os timestamps da identidade não tinham sido preenchidos. Logs identificaram o problema do fixture; após preencher seus timestamps, o login Auth real funcionou. Não houve alteração em cadastro ou autenticação de usuários reais. Não foi executado cadastro manual completo no navegador nesta liberação, nem teste em Android/iPhone físico.

Moderação preservada: publicação enviada pelo usuário não pode usar `published`; passa a `pending_review`, não aparece no feed público e só um administrador pode aprovar. Edições de conteúdo publicado voltam para revisão. As regras de autoria, mídia própria, limite diário e permissões diretas do banco continuam existentes. Sem autoaprovação nem poder administrativo para contas comuns.

Rollback: restaurar o pacote PROD versão 7, cujo módulo de comunidade corresponde ao commit de produção `ea48097e282be325778054fce22f8cd50834eb2a`. A mudança funcional é apenas a função local `eligible` em `_shared/villegram-community.ts`.
