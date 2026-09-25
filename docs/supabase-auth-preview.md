# Supabase Auth — configuração atual de Preview

O frontend da branch `desenvolvimento` usa um callback estável:

`https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app/auth-callback.html`

O código já está preparado para confirmação de e-mail e recuperação de senha sem construir caminhos `null`.

Configuração confirmada no painel do Supabase em 2026-09-25:

1. Site URL: `https://chalezinhoville.com.br`
2. Additional Redirect URLs:
   - `https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app/**`
   - `https://chalezinhoville.com.br/**`

Sem essa allowlist, o Supabase ignora `emailRedirectTo` e pode usar o Site URL antigo (por exemplo localhost).

**Leaked Password Protection** permanece desativado. O painel confirma que o recurso só está disponível no plano Pro ou superior; o projeto está no plano Free. Portanto, sua habilitação é uma decisão externa de plano/custo antes do GO-LIVE.

Nenhuma dessas configurações torna o fluxo novo público na Home.
