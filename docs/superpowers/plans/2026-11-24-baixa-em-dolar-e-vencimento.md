# Baixa em dólar sem cotação e vencimento renegociado — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (nativo). Passos com checkbox (`- [ ]`). TDD: teste vermelho visto antes do código.

**Objetivo:** dar baixa em parcela em dólar sem cotação (o dinheiro fica em dólar e é convertido depois, juntando vários) e mudar o vencimento de parcela não paga, com o registro no histórico do cliente.

**Arquitetura:** só tela e fila — nenhuma migration. O banco já aceita `paid_rate` nulo e `due_on` alterado. A tela Financeiro é migrada: as duas gravações vão pela fila (`features/financeiro/escritas-locais.ts`), e a mudança de vencimento leva o histórico no mesmo item da fila.

**Tech stack:** Next.js 16, Supabase, Dexie (espelho e fila), bun, vitest, @testing-library.

**Spec:** `docs/superpowers/specs/2026-11-24-baixa-em-dolar-sem-cotacao-design.md` (aprovado pelo Renato em 24/nov, critérios 1 a 8).

## Decisões deste plano

| # | Decisão | Por quê |
|---|---|---|
| D1 | Cotação "0" é recusada com "Cotação fora do normal — confira (ex.: 5,42)" | Hoje o zero cai em "Informe a cotação do dólar no dia do pagamento", frase que não faz sentido num campo opcional. O banco recusa `paid_rate` ≤ 0 (0063), e recusar na tela evita um conflito na Sincronização |
| D2 | O tipo de atividade novo é `vencimento_alterado`, rotulado "Vencimento" na linha do tempo (ícone `CalendarClock`), e entra em `TIPOS_DO_SISTEMA` | É escrito pelo sistema: não se edita nem se apaga, como `virou_cliente` |
| D3 | A parcela, a cobrança e a data antiga vêm do espelho (`lerTabela`, com a fila por cima) | Funciona sem internet, e a data antiga é a que a tela mostrava |
| D4 | Um item de fila com dois passos: `update` em `installments` (`due_on`) e `insert` em `activities` | Sobem juntos; se o servidor recusar um, o item inteiro fica em conflito com o motivo |

## Restrições globais

- `bun`, nunca `.env.local`, nunca `--no-verify`. Commit sem perguntar; o push é do Renato.
- Testes de RLS só nas organizações de teste; quem cria, apaga.
- Frases exatas: "Cotação do dólar (opcional)"; "Deixe em branco se o dinheiro ficou em dólar. Com a cotação, a parcela entra no recebido em reais."; "Cotação fora do normal — confira (ex.: 5,42)"; "Mudar vencimento"; histórico "Vencimento da parcela ‹n› de ‹cobrança› mudado de DD/MM/AAAA para DD/MM/AAAA"; "Parcela paga não muda de vencimento."
- `bun run verify` antes de cada commit.

## Foco da revisão

1. **A cotação sugerida voltar escondida**: nenhum `defaultValue` no campo, nem a última cotação como exemplo (Renato, 24/nov) — T1.
2. **Vírgula e três casas** na cotação opcional ("5,425") continuam lidas como cotação — o teste de hoje segue verde (T1).
3. **Parcela que ainda não subiu** (pendente na fila): mudar o vencimento depende do item dela (`dependeDe`) — T2.
4. **Data no formato do campo** (`AAAA-MM-DD`) e no histórico (`DD/MM/AAAA`) sem escorregar de dia pelo fuso — T2.
5. **Mesma data** não grava nada nem escreve histórico — T2.

---

### Task 1: Cotação opcional na baixa em dólar (critérios 1 a 4)

**Files:**
- Modify: `src/features/financeiro/schema.ts` (`baixaSchema`), `src/features/financeiro/escritas-locais.ts` (comentário de `darBaixa`), `src/app/(app)/clientes/[id]/cobrancas.tsx` (`Baixa` e o cálculo de `ultimaCotacao`)
- Test: `src/features/financeiro/escritas-locais.test.ts`, `src/app/(app)/clientes/[id]/cobrancas.test.tsx`

**Interfaces:**
- **Produz:** `baixaSchema` sem a exigência de cotação em dólar. A cotação continua nula ou maior que 0 e menor que 100. `Baixa({ parcela, moeda })`, sem a prop `ultimaCotacao`.

- [ ] **Vermelho**, em `escritas-locais.test.ts` ("dar baixa"):
  - o teste "em dólar sem cotação, recusa" vira "em dólar sem cotação, grava a baixa só com a data": o `patch` é `{ paid_on: "2026-10-03", paid_rate: null }`;
  - novo: `paid_rate: "0"` dá "Cotação fora do normal — confira (ex.: 5,42)" e nada entra na fila;
  - os testes de "5,42", "5,425", "5425" e de real seguem como estão.
- [ ] **Vermelho**, em `cobrancas.test.tsx`, numa cobrança em USD com uma parcela já paga a 5,42 e outra em aberto:
  - abrir a baixa da parcela em aberto mostra o campo "Cotação do dólar (opcional)", com valor `""` e sem `required`;
  - o texto de ajuda aparece.
- [ ] `bun x vitest run src/features/financeiro/escritas-locais.test.ts "src/app/(app)/clientes/[id]/cobrancas.test.tsx"`. Esperado: falham os novos.
- [ ] **Código:**
  - `baixaSchema`: sai o primeiro `refine`, e o segundo vira `d.paid_rate === null || (d.paid_rate > 0 && d.paid_rate < 100)`, com a mesma mensagem;
  - `Baixa`: rótulo e ajuda da spec, sem `required`, sem `defaultValue`, `placeholder="Ex.: 5,42"`;
  - o cálculo de `ultimaCotacao` e a prop saem;
  - o comentário de `darBaixa` passa a dizer que, sem cotação, a parcela fica em dólar e fora do recebido em reais.
- [ ] Verde → `bun run verify` → commit `feat(financeiro): baixa em dólar sem cotação`.

### Task 2: Mudar vencimento, com o histórico (critérios 5 a 8)

**Files:**
- Modify: `src/features/financeiro/escritas-locais.ts`, `src/app/(app)/clientes/[id]/cobrancas.tsx`, `src/features/people/montagem.ts` (`TIPOS_DO_SISTEMA`), `src/features/people/timeline-queries.ts` e `src/components/perfil/timeline.tsx` (rótulo e ícone)
- Test: `src/features/financeiro/escritas-locais.test.ts`, `src/app/(app)/clientes/[id]/cobrancas.test.tsx`, `src/features/people/montagem.test.ts`, `tests/rls/financeiro.test.ts`

**Interfaces:**
- **Produz:**
  - `mudarVencimento(_prev: ActionState, formData: FormData): Promise<ActionState>`, em `escritas-locais.ts`. Lê os campos `id` (uuid) e `due_on` (o `dataISO` do schema do Financeiro).
  - `MudarVencimento({ parcela }: { parcela: Cobranca["parcelas"][number] })`, em `cobrancas.tsx`: `FormDialog` com um campo de data que vem com o vencimento atual.

**`mudarVencimento`**, nesta ordem:
1. Valida `id` e `due_on`.
2. Lê `contexto()`.
3. Lê a parcela e a cobrança do espelho, com a fila por cima. Faltando: "Parcela não encontrada neste aparelho.".
4. Paga (`paid_on` preenchido): "Parcela paga não muda de vencimento.".
5. A mesma data: devolve `gravou()` sem gravar nada.
6. Senão, `gravarLocal` com `alvo` igual ao id da parcela, `depende: dependeDe(...)`, o rótulo "Mudar o vencimento da parcela ‹n› para DD/MM/AAAA" e dois passos:
   - `update` em `installments` com `{ due_on }`;
   - `insert` em `activities` com `{ id: novoId(), organization_id` da parcela, `person_id` da cobrança, `type: "vencimento_alterado"`, `description` = a frase da spec com `formatarDia` nas duas datas, `created_by: ctx.userId }`.

- [ ] **Vermelho**, em `escritas-locais.test.ts`:
  - parcela em aberto de 2026-10-01 mudada para 2026-10-08: os dois passos, com a frase "Vencimento da parcela 1 de EB-1A mudado de 01/10/2026 para 08/10/2026";
  - parcela paga: a frase de paga, e a fila vazia;
  - mesma data: a fila vazia e sem erro;
  - id desconhecido: a frase de "não encontrada".
- [ ] **Vermelho**, em `cobrancas.test.tsx`: a parcela em aberto tem o botão "Mudar o vencimento da parcela 2" e a paga não. O diálogo abre com o vencimento atual no campo.
- [ ] **Vermelho**, em `montagem.test.ts`: `vencimento_alterado` está em `TIPOS_DO_SISTEMA`, e `montarLinhaDoTempo` marca o item com `system: true`.
- [ ] **Vermelho**, em `tests/rls/financeiro.test.ts`: o `parceiro` drena pela fila (`drenar` + `transporteDaFila`, como em `tests/rls/fila.test.ts`) um item com os dois passos sobre a parcela de teste. Esperado:
  - `subiram === 1`;
  - o `due_on` novo é lido de volta;
  - a atividade existe;
  - no `finally`, volta o vencimento e apaga a atividade.
- [ ] `bun x vitest run` nos três arquivos de unidade e `bun x vitest run --no-file-parallelism tests/rls/financeiro.test.ts`. Esperado: falham os novos.
- [ ] **Código:** `mudarVencimento`, `MudarVencimento` ao lado de `Baixa` (só sem `paid_on`), o tipo em `TIPOS_DO_SISTEMA`, o rótulo "Vencimento" e o ícone `CalendarClock` nos dois mapas da linha do tempo.
- [ ] Verde → `bun run verify` → commit `feat(financeiro): mudar o vencimento da parcela, com o histórico`.

### Task 3: Documentação, verificação e push

- [ ] `docs/spec.md`:
  - REC-2: "baixa com data e, em dólar, cotação opcional";
  - CLI-5: acrescentar "mudar vencimento (com histórico)";
  - em "Decididas", a linha de 24/nov.
- [ ] `docs/plano.md`: a entrega. `docs/banco.md`: o tipo `vencimento_alterado` onde os tipos de atividade estão listados.
- [ ] `bun run verify`, `bun run build` e a fumaça local.
- [ ] Revisão de código final.
- [ ] Push [Renato] e `/api/versao`.
