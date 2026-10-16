# E-mail no primeiro convite da equipe

O proprietário relatou que o e-mail só chegou ao clicar em Reenviar. Leitura dos registros de produção confirmou `/invite` aceito às 13:02:22 (Brasília) e `/resend` aceito às 13:08:16. O primeiro HTTP 200 comprova aceitação pelo serviço, não entrega à caixa de entrada. Não foi possível determinar a razão de entregabilidade do modelo inicial por esses registros.

O código usava `inviteUserByEmail` no primeiro cadastro e `auth.resend({type:'signup'})` no botão Reenviar. Além disso, contas já existentes sem confirmação eram reutilizadas sem qualquer solicitação de envio no primeiro cadastro do convite.

## Correção

O primeiro convite prepara a exceção privada de cadastro e cria a identidade convidada com `generateLink(type:'invite')`, sem enviar o modelo de convite. Somente o objeto `user` é consumido: link privilegiado, OTP e hash não são logados ou retornados. Em seguida, aguarda o mesmo `auth.resend(type:'signup')` usado pelo reenvio manual. Não são disparados os dois modelos de e-mail.

Contas preexistentes sem confirmação também passam pelo envio. Contas já confirmadas preservam o comportamento anterior, sem recriação ou redefinição de senha. Erros de consulta de usuários ou do provedor não informam sucesso nem concedem novos acessos; falhas cancelam a preparação privada de cadastro. Redirecionamento PROD continua em `https://chalezinhoville.com.br/auth-callback.html?next=conferencias.html`.

Foram alterados o helper compartilhado e os dois pontos de entrada (PMS completo de DEV e compatibilidade de PROD). As fontes remotas publicadas foram comparadas com a base local antes da mudança. Nenhuma migração, convite existente, reserva ou frontend é alterado por esta correção. O módulo de custos da outra branch permanece separado.

## Verificação

24 testes passaram para primeiro envio único, conta sem confirmação preexistente, reenvio pelo mesmo caminho, erro de provedor/consulta, retorno sem tokens, autorização administrativa, escopo de imóveis e primeiro acesso da equipe. Esses testes usam cliente Auth simulado e banco PGlite para as regras de identidade; não comprovam entrega física de mensagens.

DEV: função `pms-operations` atualizada de v16 para v17; manifesto recuperado e comparado com as fontes testadas. Smoke HTTP sem autenticação deve permanecer 403 `operator_required`, sem criar conta ou enviar mensagem.

PROD: função `pms-operations` atualizada de v15 para v16 em `irxsaladqhbzhkoaclxy`; fontes recuperadas após a publicação coincidem com as testadas, e as demais dependências permanecem idênticas. Smoke sem autenticação retorna 403 `operator_required`.

12 testes adicionais de inspeções passaram. Um teste antigo de interface do multicalendário (`pms-review.test.mjs`) falhou por procurar `.calendar-property` após a mudança anterior do calendário; os arquivos de calendário e o teste não foram alterados nesta correção. O resultado foi conferido também usando os arquivos originais da base publicada. Não foi declarado que a suíte inteira está verde.

Nenhum e-mail de teste foi enviado aos destinatários reais nem foi repetido o convite relatado. A confirmação de chegada à caixa de entrada depende do serviço de e-mail e do destinatário; não se presume entrega pelo HTTP 200.

Referências primárias:
- https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- https://supabase.com/docs/reference/javascript/auth-resend

Retorno: republicar o conjunto anterior exato da função. A verificação JWT do gateway permanece desativada como nas versões anteriores; a função exige autenticação e autorização próprias (`operator` + administrador em `teamAction`).
