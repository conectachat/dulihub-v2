# Testes de RLS

Estes testes entram no banco **de verdade**, com login de verdade, pela mesma
chave publishable que o navegador usa. É a única forma de provar o que a RLS
promete: nenhuma query da aplicação filtra por organização — todas confiam na
policy.

## Uma vez, na máquina

Os três usuários existem em Authentication → Users do projeto Supabase, criados
com **Auto Confirm User** marcado:

| Email | Papel na fixture |
|---|---|
| `teste-parceiro@duliconsulting.com` | `owner` de "Parceiro de Teste" |
| `teste-colaborador@duliconsulting.com` | `staff` da Duli |
| `teste-cliente@duliconsulting.com` | cliente do portal, sem associação |

Depois de criados, aplicar `supabase/migrations/0015_fixture_de_teste.sql` — ela
liga as associações por email e é idempotente, então rodar de novo não duplica
nada.

As senhas vão no `.env.local`, que o `git` ignora:

```
RLS_SENHA_PARCEIRO=...
RLS_SENHA_COLABORADOR=...
RLS_SENHA_CLIENTE=...
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
