# Supabase Auth — configuração necessária para Preview

O frontend da branch `desenvolvimento` usa um callback estável:

`https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app/auth-callback.html`

O código já está preparado para confirmação de e-mail e recuperação de senha sem construir caminhos `null`.

No painel do Supabase, em **Authentication > URL Configuration**:

1. Site URL: `https://chalezinhoville.com.br`
2. Additional Redirect URLs:
   - `https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app/**`
   - ou, para cobrir todos os previews Vercel da conta: `https://*-roldneicosta-4140.vercel.app/**`

Sem essa allowlist, o Supabase ignora `emailRedirectTo` e pode usar o Site URL antigo (por exemplo localhost).

Também permanece recomendado habilitar **Leaked Password Protection** em Authentication > Providers/Password Security antes do GO-LIVE.

Nenhuma dessas configurações torna o fluxo novo público na Home.
