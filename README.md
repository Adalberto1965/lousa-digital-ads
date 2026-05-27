# Lousa Digital ADS

Projeto React/Vite publicável na Vercel, com banco Supabase.

## Rodar localmente

```bash
npm install
npm run dev
```

## Configurar Supabase

1. Crie um projeto em Supabase.
2. Abra SQL Editor.
3. Execute o arquivo `supabase/schema.sql`.
4. Copie `Project URL` e `anon public key`.
5. Crie um arquivo `.env` com base no `.env.example`.

## Publicar na Vercel

1. Suba este projeto para um repositório GitHub.
2. Conecte o repositório na Vercel.
3. Configure as variáveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clique em Deploy.

## Observação importante

As políticas RLS deste MVP liberam leitura e escrita para a chave pública anon. Isso é útil para validação interna rápida, mas para uso definitivo recomenda-se adicionar login por usuário e permissões por perfil.
