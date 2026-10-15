# Correções da jornada do hóspede — 13/10/2026

Base: versão pública `6804f1d`, com a correção de densidade de feed `167f0a7` preservada. O trabalho da plataforma de limpeza permanece na sua própria branch.

- Foto de perfil: recorte em JPEG; servidor identifica JPEG, PNG e WebP pelos bytes, limita a 1 MB e deriva caminho e MIME do formato real. Mantém o recorte em caso de erro e explica a falha junto ao botão de salvar.
- Cadastro: uma solicitação por vez; sucesso abre uma tela de confirmação, com e-mail, código alternativo, reenvio com espera e opção de corrigir o endereço. Um limite de envio sem sucesso anterior não é apresentado como novo e-mail enviado.
- Confirmação: suporta os links antigos, aguarda/restaura a sessão de forma explícita e aceita links com token hash mediante confirmação deliberada. Não declara um e-mail confirmado na ausência de sessão ou token válido.
- Datas: campos contidos no formulário; uma coluna no celular estreito; botão de fechar fora do título; controles nativos limitados à largura disponível.
- Preço: total anterior riscado acima do total com desconto. Remove o cartão vazio de desconto separado. Mantém os itens reais das experiências.
- Trip de hóspede: texto sobre a cena sem duplicação em título, legenda ou botão de legenda. Título/legenda deixam de ser obrigatórios quando existe texto na cena. Os metadados usados no catálogo e na revisão continuam preenchidos.

## Configuração de e-mail a aplicar junto à publicação

Aplicar `supabase/templates/confirmation.html` em Authentication → Email Templates → Confirm signup, com assunto `Confirme seu e-mail | Chalezinho Ville`. A página e o modelo são compatíveis entre si. O modelo oferece botão real e código de seis dígitos; abrir/pré-carregar a página não consome a confirmação.

Verificar Site URL e redirect allowlist para `https://chalezinhoville.com.br/**`. Desativar tracking de links no provedor de e-mail de autenticação se estiver habilitado. Preservar SMTP, remetente, limites de envio e templates de recuperação/invite.

Esse modelo não é aplicado ao Supabase hospedado pelo build do site. A integração atual não expõe atualização de configuração Auth; a configuração precisa ser aplicada no painel quando a publicação for autorizada.

## Validação

566 testes passaram, além das verificações de sintaxe, TypeScript e build. O backend do avatar foi aplicado somente em DEV (villegram-content v26); a chamada sem sessão foi recusada. O bucket continua privado e a configuração de PNG é aditiva.

Testes em navegador Chromium em 320, 390 e 430 pixels comprovaram que as datas não se sobrepõem nem ultrapassam o formulário/painel. Recorte real de imagem exportou JPEG válido abaixo de 1 MB. Testes de regressão cobrem envio duplicado, limite de e-mail, abertura do token sem consumir, links antigos, bytes e MIME do avatar, título/legenda e desconto.

A configuração do e-mail e o fluxo real de envio/abertura em Mail ou Gmail no iPhone devem ser conferidos após aplicar o modelo. O teste de layout executado em Chromium não substitui uma verificação no Safari real.
