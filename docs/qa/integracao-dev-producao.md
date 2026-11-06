# Integrar correções de produção à homologação

1. Na Vercel, identifique o SHA do deploy que atende o domínio de produção. Use também o SHA da prévia de produto em homologação, identificado na rodada de QA. A branch `main` e a prévia de um relatório podem apontar para versões diferentes das que estão em uso.
2. Crie uma branch de integração a partir da prévia de produto validada. Incorpore o commit em produção com um merge. Em conflitos, preserve o comportamento de DEV e aplique a correção de produção. Mantenha a branch de homologação original como referência até o reteste.
3. Confira que os dois SHAs são ancestrais do candidato com `git merge-base --is-ancestor SHA HEAD` para cada um. Rode `npm run check`, `npm run typecheck` e `npm test`. Gere uma prévia DEV e repita os fluxos afetados, incluindo WhatsApp, cotação e pagamentos em sandbox. Registre SHA, URL, resultados e pendências.
4. Antes de publicar uma versão aprovada, confirme novamente o SHA em produção. Se houver uma correção mais recente, integre e reteste antes de publicar. Migrações e funções do Supabase precisam ser comparadas e homologadas separadamente. Use o perfil de publicação aprovado e mantenha uma versão de produção disponível para retorno.
5. Guarde as evidências nas branches `qa/dev-e2e-report-*` e `qa/dev-e2e-handoff-*`. A configuração da Vercel desliga o deploy automático dessas branches quando derivam de uma base que já contém essa regra. Para testar código, use uma branch de produto.

## Feelings

O código em evolução permanece nas branches `feature/feelings-original-audio` e `feature/ville-moments`. A prévia de integração mantém o Feelings pausado. Quando houver uma rodada dedicada ao recurso, use `VILLE_DEV_FEELINGS=enabled` somente na prévia da branch dedicada, com o perfil `checkout-development`. O perfil de produção mantém o recurso desligado.
