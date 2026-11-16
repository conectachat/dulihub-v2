# DuliHub 2

Sistema de gestão da Duli Consulting: contatos, CRM, processos de imigração,
documentos e financeiro. Next.js 16 + Supabase, no ar em
`app.duliconsulting.com` (VPS Hostinger, Easypanel).

| Documento | Para quê |
|---|---|
| `docs/spec.md` | O que o sistema faz, para quem, e como é montado (§12) |
| `docs/plano.md` | Onde estamos e o que vem |
| `AGENTS.md` | Como se constrói: regras, testes, estrutura do código |

## Rodar no computador

```bash
bun install
bun run dev
```

Copie `.env.example` para `.env.local` e preencha. Instale com `bun`, nunca
com `npm` (conflito de peer do Tailwind).

## Antes de publicar

```bash
bun run verify
```

Tipos, lint, testes de unidade e de RLS. A publicação é automática: o
Easypanel monta o `Dockerfile` a cada push no `main`.
