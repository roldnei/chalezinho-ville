# Correção de convite da equipe — 15/10/2026

Falha real de produção às 16:29 (Brasília): Auth `/invite` recebeu `document_required`, porque insere o usuário antes de preencher `invited_at`. Não havia conta nem convite persistido para a pessoa informada. O retorno do convite também apontava para uma prévia antiga.

## Correção

- Após verificar o administrador, a Edge prepara o convite privado com e-mail, escopo e prazo antes de chamar Auth.
- A rotina de identidade permite adiar o documento apenas para o marcador `pms_team` quando existe convite pendente, válido, do mesmo e-mail, criado por administrador ativo. Marcador fornecido pelo cliente, sozinho, não funciona. Não concede papel, acesso ou identidade verificada.
- Documentos fornecidos continuam validados, e a contratação de hospedagem mantém sua exigência de identidade. O fluxo de cadastro curto de faxinas foi preservado.
- Se o envio falhar, o convite preparado é cancelado para não deixar a exceção de identidade aberta. A interface diferencia limite de envio e destinatário não autorizado quando Auth fornece esses códigos.
- Produção sempre retorna para `https://chalezinhoville.com.br/auth-callback.html?next=conferencias.html`, mesmo com uma variável antiga de prévia. Nenhuma senha é compartilhada.

## Validação e ambientes

774 testes completos e nove testes específicos passaram. Cobertura de convite antes de `invited_at`, ausência de identidade fictícia, metadados forjados, convite expirado/cancelado/aceito, convidante suspenso ou sem administração, vínculo a outro usuário, CPF inválido, ordem de gravação/envio, falha do provedor e endereço de retorno.

DEV real: reprodução em transação com conta e convite sintéticos, sem enviar e-mail. O convite autorizado passou, não criou identidade de hóspede e não concedeu papel administrativo; o marcador forjado foi rejeitado. Transação encerrada com rollback.

Migração `20261015193233_pms_invitation_identity_guard.sql` aplicada primeiro no DEV e depois em PROD. Função `pms-operations`: DEV v16, PROD v15, mantendo o bundle próprio de compatibilidade de produção e suas dependências existentes. Build e sintaxe passaram. Advisor continua apenas com o aviso preexistente de proteção contra senhas vazadas desativada ([documentação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

Não foi enviado convite para a pessoa real durante os testes. A entrega do e-mail externo permanece para a nova tentativa pelo administrador, usando o formulário do PMS. As tentativas anteriores não foram apresentadas como entregues.
