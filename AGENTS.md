<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# DuliHub — convenções do projeto

App interno da Duli Consulting (consultoria de imigração). Substitui o app
anterior feito no Lovable. Contexto e fases no plano da reconstrução.

## Regras que não se negociam

**Gerenciador de pacote: `bun`.** Nunca `npm`.

**Leitura de dado acontece no servidor.** Server Components e Server Actions
usam `@/lib/supabase/server`. O cliente de navegador (`@/lib/supabase/client`)
só entra onde a interatividade exige — realtime, upload com progresso. Este app
carrega passaporte, comprovante de renda e contrato: dado sensível não passa
pelo navegador sem motivo.

**`getUser()`, nunca `getSession()`** para decidir permissão. `getSession()`
apenas lê o cookie, que o cliente pode forjar. `getUser()` revalida no servidor.

**RLS é a segurança real.** Verificação na interface é conveniência, não
proteção. Toda tabela nova nasce com RLS ligada e policy escrita na mesma
migration.

**Todo dado de negócio carrega `organization_id`.** A Duli é a organização
raiz; cada parceiro é uma organização com marca própria. Nenhuma query
confia no `organization_id` vindo do cliente — quem filtra é a RLS.

## Estrutura

```
src/
  app/                    rotas e layouts, nada de lógica de negócio
  features/<dominio>/
    actions.ts            Server Actions ("use server")
    queries.ts            leitura no servidor
    schema.ts             validação Zod
    components/           componentes do domínio
  components/ui/          shadcn/ui, não editar à mão
  lib/supabase/           os três clientes
```

Uma feature não importa de outra feature. Se precisar, o compartilhado sobe
para `lib/`.

## Migrations

`supabase/migrations/NNNN_nome.sql`, numeradas em sequência. Cada migration
inclui as policies de RLS das tabelas que cria. Comentário no topo explicando
a decisão de modelagem, não o óbvio da sintaxe.

## Idioma

Interface, comentários e mensagens de erro em português. Nomes de tabela,
coluna e código em inglês.

## Marca

Azul `#022b64` é `--primary`. Laranja `#FF6600` é `--brand`. Use os tokens,
nunca o hex direto.

## Antes de dar algo por pronto

`bun run build` e `bun test` passando. Para mudança de schema, o teste de RLS:
usuário da organização A não enxerga dado da organização B.
