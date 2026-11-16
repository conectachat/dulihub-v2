---
name: criar-funcionalidade
description: Use ao criar ou mudar uma funcionalidade do DuliHub 2 (tela nova, regra de negócio, tabela, integração) — antes de qualquer código. Lê spec, arquitetura, banco e AGENTS; conduz desenho → spec → plano → teste antes do código → revisão de código; e no fim atualiza a documentação para ela continuar igual ao sistema. Não use para correção pequena de um defeito já descrito (aí é teste vermelho, correção e commit).
---

# Criar funcionalidade no DuliHub 2

O Renato não programa: o papel dele é dizer o que o negócio precisa e
decidir. Fale em português simples, uma pergunta de cada vez, tabela em vez de
texto corrido, e só pergunte o que é dele decidir.

## 1. Ler antes de propor

Sem isto, cada pedido novo quebra algo que funcionava e duplica código.

| Ler | Para saber |
|---|---|
| `docs/spec.md` — o módulo em §7, as regras em §6, as perguntas em §10 | O que já foi decidido e o que está em aberto |
| `docs/spec.md` §12 (Arquitetura) | Onde a peça nova vai morar e com quem fala |
| `docs/banco.md` | Que tabelas existem, quem lê e quem grava |
| `AGENTS.md` | As regras de construção (segurança, testes, UI) |
| `docs/plano.md` | O estado atual e a ordem combinada |

Se a funcionalidade **não cabe** na arquitetura de §12, diga isso primeiro:
a arquitetura muda antes, na spec, com o Renato.

## 2. Desenho com o Renato

Use `superpowers:brainstorming`. Separe:

- **Pergunta do negócio** (só ele sabe): responda com o caso real dele.
- **Pergunta técnica**: traga a recomendada, explicada como para leigo.

Inclua sempre: quem usa e com que papel; o que acontece com dado de cliente
(LGPD); o que muda no celular; se precisa funcionar sem internet; se entra
algum sistema de fora (vai para §12.5).

## 3. Spec

Escreva a seção do módulo em `docs/spec.md`: requisitos com ID, prioridade
(P0/P1/P2), estado (⬜) e **critério de aceite** testável. Decisão nova vai
para "Decididas"; pergunta sem resposta, para §10.

Rode a revisão da **spec** com `superpowers:requesting-code-review` (a spec
como objeto, não código) e repita até sobrar só cosmético. Mostre ao Renato o
que mudou e por quê.

## 4. Plano

Use `superpowers:writing-plans`: banco (migration + RLS), telas, ordem dos
commits, e **como cada critério de aceite será provado**. Peça a aprovação do
Renato antes do código.

## 5. Código

- `superpowers:test-driven-development`: teste vermelho antes, sempre.
- Mudança no banco: migration nova em `supabase/migrations/NNNN_nome.sql`,
  com teste RLS vermelho antes, aplicada pelo conector do Supabase, com o
  arquivo e `src/lib/supabase/database.types.ts` **no mesmo commit**. Não há
  banco de teste (spec §12.6): o teste nunca pode estragar dado real se falhar
  — quem cria, limpa; e só na organização de teste.
- `bun run verify` verde antes de cada commit. Commit sem perguntar; **nunca**
  `--no-verify`. O `push` é do Renato.
- Instalar com `bun`, nunca `npm`. Nunca ler valores do `.env.local`.

## 6. Revisão de código

`superpowers:requesting-code-review` sobre o intervalo de commits da
funcionalidade, com a seção da spec como requisito. Confira cada achado antes
de acreditar. Crítico e Importante se corrigem antes de dizer pronto; achado
recusado fica registrado com o motivo.

## 7. Atualizar a documentação — no mesmo trabalho, antes de dizer pronto

| O que mudou | Atualizar |
|---|---|
| Requisito entregue | Estado em `docs/spec.md` (⬜ → ✅ ou 🟡) |
| Tabela, coluna, policy, função ou gatilho | `docs/banco.md` |
| Parte nova, sistema de fora, tarefa agendada, ambiente | `docs/spec.md` §12 |
| Regra de construção nova | `AGENTS.md` |
| O que está no ar, decisão de fase | `docs/plano.md` |

Na revisão, confira se a documentação diz o que o sistema faz de verdade.
Documentação que diverge do código é defeito.

## 8. Entregar

Diga ao Renato, em tabela: o que ficou pronto, como foi provado, o que ficou
de fora e por quê, e o comando de `push`:

```bash
git -C "D:\Projetos Apps\dulihub-v2" push
```

Ao enviar, o Easypanel publica sozinho em `app.duliconsulting.com`.
