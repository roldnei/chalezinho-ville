# Publicação autorizada em produção — 15/10/2026

Autorização: “Pode colocar em produção tudo que produzimos em desenvolvimento”.

Publicação da branch `feature/team-inspections-20261015`, descendente direta do frontend de produção `ea48097e282be325778054fce22f8cd50834eb2a`, preservando seus avanços do Ville Moments. O perfil público permanece WhatsApp, com aprovação obrigatória de publicações e sem ativar checkout financeiro.

## Banco e serviços

Aplicadas em PROD as 21 migrações de faxinas, conferências, comodidades, aprovação e vínculo de limpeza já testadas no DEV (de `20261013170432_cleaning_platform.sql` até `20261015180248_link_standalone_preparation.sql`). A ordem e os nomes originais foram preservados no histórico remoto, que gera seus próprios timestamps.

Duas compatibilidades adicionais foram aplicadas primeiro no DEV e depois em PROD:

- `20261015183654_production_approval_dependencies.sql`: inicializa a fonte de pedidos de mesmo dia apenas onde ausente; não insere pedidos nem reservas. Links de notificação usam o domínio de produção.
- `20261015184011_approval_incident_schema_compatibility.sql`: a caixa aceita ocorrências com referência direta à reserva (DEV) ou via garantia (schema de produção). Não modifica ocorrências ou valores.

Edge Functions PROD: `multichannel-operations` v5, `team-inspections` v1 e `cleaning-platform` v1. As duas primeiras usam exatamente os bundles validados no DEV. A plataforma de faxinas usa os mesmos arquivos e mapa de importações do DEV. Todas verificam identidade/permissões internamente. A função `villegram-content` v8 já publicada foi preservada.

As novas configurações de faxinas começam com Pix manual e provedor desativados até cadastro da chave/destinatário e liberação pelo administrador. Não foram copiados dados bancários, usuários, imóveis de faxina, tarefas, fotos ou fixtures de desenvolvimento. Nenhuma cobrança, transferência ou repasse foi executado pela publicação.

## Verificação

- Suite completa atualizada: **763/763 testes**, incluindo compatibilidade de ocorrências nos dois schemas; seis testes da caixa de aprovação passaram separadamente.
- Chamadas reais sem autenticação em PROD: conferências 403 `access_unavailable`, faxinas 401 `login_required`, vínculo PMS 403 `operator_required`.
- Caixa de aprovação consultada com identidade administrativa no banco de produção: resposta válida, total zero no momento da publicação. Não foram inventadas tarefas para preencher a caixa.
- `inspection_dispatch` e `ops_link_preparation` continuam sem permissão de execução direta pelos clientes. Tabelas de conferências e fotos são privadas.
- Hospedagens mantiveram a mesma impressão MD5 antes/depois (`379df2132cc473819357525e5a302584`). Oito tarefas existentes mantiveram suas situações: três aprovadas e cinco pendentes; 26 evidências existentes preservadas. Nenhum job, contato ou link de teste foi importado.
- Advisor: nenhum novo aviso de segurança; permanece o aviso anterior de proteção contra senhas vazadas desativada ([documentação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).
- Não houve uso de hospedagem real para testar alterações. O fluxo completo com escrita e upload foi testado no DEV; PROD recebeu verificações de leitura, publicação e negação de acesso. Câmera Android/iPhone físicos não foi testada.

## Acesso

- PMS: `https://chalezinhoville.com.br/pms-operacao.html`
- Aprovações: `https://chalezinhoville.com.br/aprovacoes.html`
- Equipe: `https://chalezinhoville.com.br/conferencias.html` (ou link individual emitido pelo PMS).
- Faxinas: `https://chalezinhoville.com.br/faxinas/contratar/`, `/faxinas/trabalhar/` e `/faxinas/administracao/`.

Links antigos de prévias continuam apontando ao ambiente de desenvolvimento. Para operação real, gerar novos links pelo PMS de produção. Os registros de testes continuam exclusivamente no DEV.
