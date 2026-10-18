# Convites do Ville Moments pelo WhatsApp

Base preservada: produção `1f0aea87a479a13a6e21818493ddad105958f107`, branch `feature/close-standalone-cleaning-20261017`. Entrega apenas em desenvolvimento, sem promover produção ou enviar convites a pessoas reais.

## Comportamento entregue

- Administração do Ville Moments: **Convidar pelo WhatsApp**, **Enviar convite pelo WhatsApp** e **Copiar convite**. O WhatsApp abre com o texto e o link; o administrador escolhe o destinatário e envia. Nenhuma dependência da API de WhatsApp.
- Convite público para o Moments: o e-mail do destinatário não é necessário para preparar o link. Cada pessoa cria sua própria conta ou entra em uma existente.
- Em Meu Ville Moments → Pessoas, o convite de acompanhante existente também tem **Enviar pelo WhatsApp**. Mantidos os sete dias de validade, cancelamento e uso único. O token desse convite não é um token de autenticação.
- Primeiro acesso: nome, e-mail e senha; confirmação de e-mail pelo fluxo existente (link ou código), seguida do Moments. Quem já tem conta pode entrar ou recuperar a senha. Documento e telefone não são exigidos no cadastro exclusivo do Moments.
- O destino com token é preservado no cadastro, confirmação, login, recuperação e troca de abas da conta. Links antigos de `conta.html?convite=…` continuam funcionando.
- Ativar perfil público continua sendo uma escolha explícita. Publicações continuam sujeitas à moderação. A conta não recebe acesso a imóveis, reservas, pagamentos ou ao PMS de outras pessoas.
- Cadastros de hospedagem preservam os requisitos anteriores; o checkout continua exigindo identidade válida. A exceção de onboarding Moments apenas adia a coleta de documento.

## Evidências

- Testes de fluxos afetados: **60 aprovados**, incluindo Auth, cadastro de faxinas, convites da equipe PMS, comunidade, privacidade e os sete testes novos de WhatsApp/primeiro acesso.
- Suíte geral executada antes da última adição de teste: **908 aprovados de 909**. A falha `tests/pms-review.test.mjs`, linha 8 (`0 !== 2`, calendário), foi reproduzida isoladamente na base de produção `1f0aea…` em `/tmp/moments-production-baseline`; não foi causada por esta alteração. Nenhum arquivo de calendário foi alterado.
- Sintaxe, TypeScript e build do perfil WhatsApp/DEV: aprovados.
- Postgres local/PGlite: migração repetível, cadastro Moments sem documento, rejeição de documento inválido fornecido, manutenção das exigências do cadastro de hospedagem e negação do RPC privado ao usuário autenticado.
- Convites de acompanhante: usado, expirado, revogado, autoaceite, tentativas concorrentes e acesso anônimo/administrativo continuam cobertos.
- Banco DEV `pxfqmnhqodqyaaqeyjgr`: migração `20261018001251_moments_short_signup` aplicada. Inserção de QA em transação confirmou `application_role=guest` e `lodging_identity_present=false`, mesmo com metadado forjado `role=admin`. A transação foi revertida; consulta posterior confirmou zero contas de QA remanescentes.
- Não houve alteração no banco de produção `irxsaladqhbzhkoaclxy`.

## Limites e validação externa

Os testes automatizados de cadastro, confirmação e recuperação usam respostas simuladas do Auth. O teste no banco DEV executou os gatilhos reais, sem envio de e-mail. Entrega real de confirmação e abertura/envio no aplicativo WhatsApp do celular exigem validação com uma pessoa de teste; nenhuma mensagem foi enviada automaticamente. A prévia depende de o domínio de validação estar autorizado no redirect do Supabase Auth, como qualquer cadastro existente. Antes de promover produção, aplicar a migração correspondente naquele ambiente e validar o callback no domínio final.
