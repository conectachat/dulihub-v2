# Testes de RLS

Estes testes entram no banco **de verdade**, com login de verdade, pela mesma
chave publishable que o navegador usa. É a única forma de provar o que a RLS
promete: nenhuma query da aplicação filtra por organização — todas confiam na
policy.

## Uma vez, na máquina

Os cinco usuários existem em Authentication → Users do projeto Supabase, criados
com **Auto Confirm User** marcado:

| Email | Papel na fixture |
|---|---|
| `teste-parceiro@duliconsulting.com` | `owner` de "Parceiro de Teste" |
| `teste-colaborador@duliconsulting.com` | `staff` da Duli |
| `teste-cliente@duliconsulting.com` | cliente do portal, sem associação |
| `teste-staff@duliconsulting.com` | `staff` de "Parceiro de Teste" |
| `teste-executora@duliconsulting.com` | `admin` de "Executora de Teste" e `staff` de "Parceiro de Teste" |

Depois de criados, aplicar `supabase/migrations/0015_fixture_de_teste.sql`,
`0039_fixture_staff_de_teste.sql` e `0069_fixture_executora_de_teste.sql` —
elas ligam as associações por email e são idempotentes, então rodar de novo
não duplica nada.

A "Executora de Teste" (0069) faz nos testes o papel da Duli para os clientes
de parceiro: eles moram nela, e o parceiro deles é a "Parceiro de Teste". A
`teste-executora` existe porque nenhuma das outras serve: a `teste-parceiro`
precisa enxergar só a própria organização (`espelho.test.ts`), e a
`teste-colaborador`, com uma segunda organização, veria dois funis padrão e o
CRM dela quebraria em silêncio. Pelo mesmo motivo, o CRM da `teste-executora`
não serve para conferir nada — ela é membro de duas organizações de teste.

As senhas vão no `.env.local`, que o `git` ignora:

```
RLS_SENHA_PARCEIRO=...
RLS_SENHA_COLABORADOR=...
RLS_SENHA_CLIENTE=...
RLS_SENHA_STAFF=...
RLS_SENHA_EXECUTORA=...
```

## Rodar

```
bun run test:rls
```

`bun run test` roda só a suíte de unidade, que é rápida e não depende de rede.
`bun run verify` roda as duas.

## Por que a suíte falha em vez de pular

Sem as senhas no ambiente, ela **falha**. Suíte que se cala por falta de
segredo reporta verde sem verificar nada — foi exatamente o que
`passWithNoTests` fez durante nove dias, período em que cinco defeitos
chegaram à produção.
