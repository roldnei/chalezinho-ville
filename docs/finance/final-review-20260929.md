# Revisão técnica financeira — 29/09/2026

Ambiente: somente desenvolvimento, Supabase gratuito `pxfqmnhqodqyaaqeyjgr`, PagBank sandbox. Produção permanece bloqueada.

## Correções realizadas

- Caução sem identificador/validade verificável não apresenta saldo disponível para captura. Data vencida aparece como vencida, sem presumir que o emissor liberou o limite.
- Saldo capturável e botão administrativo respeitam a mesma margem do backend: mais de uma hora antes do vencimento. O painel explica o bloqueio.
- Conta do hóspede informa prazo ainda não confirmado em vez de exibir uma data inválida.
- Backend aceita o endereço fixo desta branch de desenvolvimento. Os controles de autenticação, propriedade da reserva e papel administrativo continuam obrigatórios.

## Validação

- 135 testes automatizados aprovados, incluindo três regressões para validade ausente, vencimento/margem de captura e mensagem ao hóspede.
- 9 testes de interface aprovados em celular, notebook e desktop, com respostas simuladas.
- Sintaxe de JavaScript, TypeScript e build de preview aprovados.
- API real, conta fictícia temporariamente como hóspede: painel administrativo, captura, estorno, disparo manual de pré-autorização e tabela de tokens negados com HTTP 403; próprio resumo financeiro permitido com HTTP 200, sem eventos internos. Papel administrativo restaurado ao final.
- RLS remoto, identidade autenticada diferente: zero reservas, pagamentos e cauções visíveis. Perfil não permite UPDATE de role/permissões; somente nome e telefone são editáveis diretamente.
- Funções financeiras de captura, estorno e autorização não têm EXECUTE para anon/authenticated. Tabelas internas usam RLS sem políticas para acesso direto.
- Últimas seis execuções do processamento automático: HTTP 200, ok=true; última resposta consultada sem estados reconciliation_pending. Cron ativo a cada cinco minutos.
- Advisor sem erro crítico. Aviso remanescente: proteção contra senhas vazadas desativada, cuja disponibilidade no plano deve ser verificada. [Orientação Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Prints recebidos

O usuário comprovou visualmente no Portal Dev: Pix de R$ 8,08 Cancelado; caução anterior de R$ 500 Cancelada; nova caução de R$ 500 Autorizada. Esses prints complementam as consultas de API. Não há print de estorno de cartão registrado; isso não impede investigar a falha de API já documentada.

Evidências locais: `portal-caucao-anterior-cancelada.jpg` e `portal-caucao-renovada-autorizada.jpg`.

## Continuidade programada

Verificação única neste chat criada para **02/10/2026 às 11h20 de São Paulo**, após a renovação agendada no sistema para 11h12:22. Identificador da automação: `conferir-renova-o-real-da-cau-o`. Ela deve conferir o ciclo real sem antecipar datas nem criar autorizações duplicadas. A execução depende da disponibilidade do ambiente local e das conexões; criar a automação não comprova o evento futuro.

## O que permanece aberto

- Resposta/habilitação PagBank: estornos de cartão com 40008/40005, comprovação da liberação dos R$ 320 restantes e recursos disponíveis para PF.
- Conclusão do acompanhamento temporal da renovação na data programada.
- Aprovação dos textos operacionais e decisões comerciais pelo responsável.
- Integração/homologação de produção e teste real controlado após autorização; a implementação atual é deliberadamente sandbox. Não basta promover o preview.

Minuta funcional preparada em `textos-e-operacao-financeira-para-aprovacao.md`, sem publicação. Esta revisão cobre os fluxos financeiros descritos; não equivale a auditoria independente de segurança nem revisão integral de todos os módulos do site.
