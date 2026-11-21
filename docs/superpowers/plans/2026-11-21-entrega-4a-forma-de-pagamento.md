# Entrega 4a — forma de pagamento pela equipe e cobranças no Ganho — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (nativo, como nas entregas anteriores) ou superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`). TDD em todo passo de código.

**Objetivo:** no lead, a equipe define a forma de pagamento a partir dos vistos e o dono ou a gestão a confirma. No Ganho, nasce uma cobrança por parte, com as parcelas, uma vez só.

**Arquitetura:**
- **Banco primeiro.** Duas migrations com teste de RLS vermelho antes:
  - 0058: a forma, as travas e as três funções;
  - 0059: o passo (7) do `ganhar_negocio`.
- As duas são compatíveis com o código no ar. Nenhuma forma fica `confirmada` antes do deploy, então `cobrancas` sai vazia e a chave nova `forma` é ignorada pelo esquema antigo, que não é estrito. Por isso há **um push só**, no fim.
- **Telas.** O lead continua lendo do servidor, como o CRM inteiro. A forma vai e volta por Server Actions, que chamam as funções do banco. A cotação é a única coluna gravada direto.

**Tecnologia:** Next.js 16 (App Router, Server Actions), Supabase Postgres com RLS, zod 4, vitest com jsdom e @testing-library, bun.

**Spec:**
- desenho: `docs/superpowers/specs/2026-11-21-entrega-4a-forma-de-pagamento-design.md`;
- o que ele não diz: §6.4 e §6.3 (linhas ~614–638) de `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`;
- requisitos: `docs/spec.md`, FIC-7, FIC-10, FIC-11, FIC-12, REC-6 e CRM-14, com os critérios.

## Restrições globais

- `bun`, nunca `npm`. Nunca ler valores do `.env.local`. Nunca `--no-verify`. O push é do Renato.
- **O banco é produção.**
  - Os testes gravam só na organização de teste, em pessoas descartáveis apagadas no fim; a cascata da pessoa leva tudo.
  - O "Cliente de Teste" nunca é apagado.
  - O que se cria nele (só no T3, portal) é apagado em `finally`.
- **Migration:**
  - aplicada pelo conector do Supabase (`apply_migration`, projeto `xigmtofpmfqeehhcdasf`);
  - no mesmo commit vão o arquivo `supabase/migrations/NNNN_nome.sql`, o `src/lib/supabase/database.types.ts` regenerado (`generate_typescript_types` → `python -I <scratchpad>/tipos.py <arquivo> src/lib/supabase/database.types.ts`) e o `docs/banco.md`;
  - o tipo gerado perde a nulidade em `returns table`, então alargar à mão se aparecer.
- **Função nova em `public`:** `security invoker` e `set search_path = ''`, com `revoke execute … from public, anon` e `grant execute … to authenticated`. Função de gatilho em `private` é `security definer`, com `revoke … from public, anon, authenticated`.
- **Marca:**
  - ligar com `set_config('dulihub.via_forma', 'on', true)` e desligar com `'off'`;
  - conferir com `coalesce(current_setting('dulihub.via_forma', true), '') = 'on'`;
  - a marca `via_ganho` não abre a trava da forma, nem o contrário.
- **Trava:** a liberação é só `pg_trigger_depth() > 1` (cascata e ação da chave estrangeira). A trava vale também na organização de teste.
- **Hoje no banco:** `(now() at time zone 'America/Sao_Paulo')::date`. Na tela: `hojeEmSaoPaulo()` (`@/lib/formatar`).
- **Gestão:** `private.current_user_manages(org)`. **CRM-10:** `owner_id = auth.uid()` ou gestão. **Membro:** `organization_id in (select private.current_user_organizations())`; o cliente do portal não é membro.
- **Dinheiro:**
  - conta em centavos na tela (`emCentavos`, `emMoeda`, `@/lib/totals`);
  - comparação em `numeric` no banco;
  - exibição com `formatarMoeda` (`R$ 10.000`, centavos só quando há);
  - nunca somar uma moeda na outra.
- **Frases fixas**, cópia exata:

  | Situação | Frase |
  |---|---|
  | Salvar ou confirmar com a forma confirmada | "A forma está confirmada. Use Refazer para mudar." |
  | Salvar, confirmar ou refazer com o negócio encerrado | "O negócio está encerrado; reabra para mexer na forma de pagamento." |
  | Salvar, confirmar ou refazer depois das cobranças (vence as outras) | "As cobranças já foram criadas. Para mudar, exclua a cobrança e crie outra na aba Financeiro do cliente." |
  | Confirmar sem parte ou sem visto | "Acrescente pelo menos um visto e uma parte antes de confirmar." |
  | Confirmar ou refazer sem ser o dono nem da gestão | "Só o dono do negócio ou a gestão confirmam a forma de pagamento." |
  | Parcelas que não somam o total | "As parcelas de ‹rótulo› somam ‹valor›; o total é ‹valor›." |
  | Parcelas fora de 1 a 36 | "Parcelas vão de 1 a 36." |
  | Mexer em visto com a forma confirmada e sem cobranças | "A forma de pagamento está confirmada. Use Refazer para mudar os vistos." |
  | Excluir negócio com confirmação registrada | "A forma de pagamento já foi confirmada; o negócio fica como registro." |
  | Aviso de coerência | "A forma soma ‹valor› e os vistos, ‹valor›." |
  | Aviso de vencida | "1 parcela já vencida" / "‹n› parcelas já vencidas" |
  | Aviso de visto fora da forma | "‹visto› não está na forma de pagamento: crie a cobrança à mão na aba Financeiro." |
  | Cartão com mais de 1 parcela (P5) | "Cartão é um pagamento só, numa data." |
  | 11ª parte (P5) | "A forma vai até 10 partes." |
  | Rótulo vazio ou longo (P5) | "Dê um nome à parte, com até 80 caracteres." |
  | Total da parte zero ou negativo (P5) | "Informe o valor de ‹rótulo›." |
  | Parcela com valor zero ou negativo (P5) | "Cada parcela de ‹rótulo› precisa de valor." |
  | Observação longa (P5) | "A observação vai até 500 caracteres." |
  | Refazer sem forma confirmada (P5) | "A forma não está confirmada." |

## Decisões deste plano

Cada uma é um desvio do desenho ou um detalhe que ele deixou com quem constrói.

| # | Decisão | Por quê | Custo se errada |
|---|---|---|---|
| P1 | Os três avisos novos do resumo do Ganho são montados **na tela**, por `avisosDoResumo`, a partir de `forma`, `itens` e `processos` que o `ganhar_negocio` devolve: parcela vencida, coerência e visto fora da forma. O desenho os punha em `avisos` | Formatar dinheiro em SQL duplicaria `formatarMoeda`, e a frase de coerência é a mesma da janela e da confirmação. O dado continua saindo da mesma função que grava, então o resumo e a gravação não divergem | Nenhum. `avisos` continua trazendo os avisos de dono de hoje |
| P2 | Duas migrations: 0058 (a forma) e 0059 (o Ganho) | O T3 se prova sozinho, sem o Ganho. A 0059 só recria `ganhar_negocio` | Nenhum |
| P3 | `somarMeses`, `gerarParcelas`, `ParcelaNova`, `METODOS`, `Metodo` e `ROTULO_DO_METODO` sobem para `src/lib/parcelas.ts` | A forma mora em `features/opportunities`, e uma feature não importa de outra (`AGENTS.md`) | Nenhum |
| P4 | A tela gera as parcelas com `gerarParcelas` e manda prontas. `salvar_forma_de_pagamento` só confere e não gera | O desenho deixa editar valor e data de cada parcela, então o banco precisa aceitar a lista que a pessoa vê | Nenhum: o banco confere soma, contagem e limites |
| P5 | Frases que o desenho não fixou: as marcadas "(P5)" na tabela acima | São do formulário, e o teste precisa de texto exato | Texto a ajustar |
| P6 | `payment_plan_parts`, `payment_plan_installments` e `payment_plan_responses` são lidas pela subconsulta em `payment_plans`, como `opportunity_items` lê pela de `opportunities` (0051:70-74). `payment_plans` é lida só por membros | Uma regra de leitura só. O cliente do portal não lê a forma, e por isso não lê nada abaixo dela | Nenhum |
| P7 | O teste do portal (T3) usa uma forma em **rascunho** num negócio do "Cliente de Teste", e não uma forma confirmada | Negócio com resposta não se apaga (§5.5), e o "Cliente de Teste" nunca é apagado: uma confirmação deixaria lixo permanente. A leitura não depende do estado (P6), então o rascunho prova o mesmo | Se um dia a policy depender do estado, o teste não pega. Ela não depende, e a revisão confere |
| P8 | Salvar mantém o id da parte pela posição. As parcelas de cada parte são trocadas inteiras (apagar e inserir) | O desenho pede o id da parte. O da parcela nada usa até o Ganho, que copia | Nenhum |
| P9 | `situacao` em `forma` aceita também `enviada` e `recusada` no esquema zod. Na 4a elas não aparecem, e a tela as trata como `rascunho` | A 4b não quebra a leitura do resumo | Nenhum |
| P10 | Os padrões dos botões: Entrada é pix com 1 parcela; Parcelas, transferência com 3; Cartão, cartão com 1; À vista, pix com 1. A moeda é a dos vistos, quando são todos da mesma, e BRL nos outros casos. A 1ª data é hoje mais 7 dias | O desenho deixou com quem constrói, e o teste precisa de valor | Padrões a ajustar |

## Foco da revisão

Cada item tem teste na tarefa dona.

1. **Um centavo de diferença.** Parcelas editadas à mão que somam R$ 9.999,99 contra R$ 10.000: a tela e o banco recusam, com a frase e os dois valores (T2, T3).
2. **Cotação com vírgula.** "5,425" grava 5,425, e não 5425 (G3). A mesma leitura da baixa, `parseCotacao` (T5).
3. **Clique duplo em "Confirmar pela equipe".** A segunda chamada é recusada, e fica uma resposta só (T3).
4. **Salvar duas vezes a mesma forma.** Os ids das partes não mudam e nenhuma parcela se duplica. Tirar a parte do meio deixa as outras inteiras (T3).
5. **Data inválida e valor grande demais.** "2026-02-31" e um total acima de 9.999.999.999,99 são recusados com frase, nunca com erro cru do banco (T2 e T3).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/parcelas.ts` (+ `.test.ts`) | Movidos do Financeiro (P3) |
| `src/features/opportunities/forma-regras.ts` (+ `.test.ts`) | Regras puras: sugerir parte, gerar parcelas, erros, totais, avisos |
| `src/features/opportunities/forma-schema.ts` (+ `.test.ts`) | zod da forma, da observação e da cotação |
| `src/features/opportunities/forma-actions.ts` (+ `.test.ts`) | Salvar, confirmar, refazer e cotação |
| `src/features/opportunities/schema.ts` | `resumoDoGanhoSchema` com `forma` e `cobrancas` |
| `src/features/opportunities/queries.ts` | `obterNegocio` traz a forma |
| `supabase/migrations/0058_forma_de_pagamento.sql` | Tabelas, RLS, travas e as três funções |
| `supabase/migrations/0059_cobrancas_no_ganho.sql` | `ganhar_negocio` com o passo (7) e a chave `forma` |
| `tests/rls/forma-de-pagamento.test.ts` | A forma no banco |
| `tests/rls/cobrancas-do-ganho.test.ts` | O Ganho com a forma |
| `src/app/(app)/crm/[id]/forma-de-pagamento.tsx` (+ teste) | O cartão do lead |
| `src/app/(app)/crm/[id]/janela-da-forma.tsx` (+ teste) | A janela de editar |
| `src/app/(app)/crm/[id]/vistos.tsx`, `page.tsx` | A trava na tela e o cartão novo no lugar |
| `src/app/(app)/crm/dialogos.tsx` (+ teste) | O resumo do Ganho com a forma |
| `src/features/people/montagem.ts` | `forma_de_pagamento` em `TIPOS_DO_SISTEMA` |

---

### T1 Parcelas e métodos sobem para `src/lib/` (P3)

**Arquivos:**
- Criar: `src/lib/parcelas.ts` e `src/lib/parcelas.test.ts`.
- Mexer:
  - `src/features/financeiro/regras.ts` e `regras.test.ts`: sai a parte de `somarMeses` e `gerarParcelas`;
  - `src/features/financeiro/schema.ts:20-28`: sai `METODOS` e `ROTULO_DO_METODO`;
  - `src/features/financeiro/escritas-locais.ts:20`;
  - `src/app/(app)/clientes/[id]/cobrancas.tsx:35`;
  - `src/app/(app)/financeiro/lista.tsx:15`.

**Interfaces:**
- Produz, em `@/lib/parcelas`:
  - `somarMeses(data: string, meses: number): string`;
  - `gerarParcelas({ total, quantidade, primeiroVencimento, entrada? }): ParcelaNova[]`;
  - `type ParcelaNova = { number: number; amount: number; due_on: string }`;
  - `METODOS`;
  - `type Metodo = (typeof METODOS)[number]`;
  - `ROTULO_DO_METODO: Record<Metodo, string>`.
- **Sem reexportar** de `features/financeiro`. Os importadores passam a usar `@/lib/parcelas`.

- [ ] Mover os testes de `somarMeses` e `gerarParcelas` de `financeiro/regras.test.ts` para `src/lib/parcelas.test.ts`, importando de `./parcelas`.
- [ ] `bun x vitest run src/lib/parcelas.test.ts`. Esperado: FALHA (módulo `./parcelas` não existe).
- [ ] Mover o código e trocar os imports.
- [ ] `bun x vitest run src/lib/parcelas.test.ts src/features/financeiro "src/app/(app)/clientes" "src/app/(app)/financeiro"` e `bun x tsc --noEmit`. Esperado: tudo verde.
- [ ] Commit `refactor: parcelas e métodos de pagamento sobem para lib (entrega 4a)`.

### T2 Regras e esquema da forma (puros)

**Arquivos:** criar `src/features/opportunities/forma-regras.ts`, `forma-schema.ts` e os dois `.test.ts`.

**Interfaces** (produz):

```ts
// forma-regras.ts
export type Moeda = "BRL" | "USD";
export type ParteDaForma = {
  label: string; method: Metodo; currency: Moeda; total: number;
  installments_count: number; parcelas: ParcelaNova[];
};
export type TipoDeParte = "entrada" | "parcelas" | "cartao" | "a_vista";
export const LIMITES = { partes: 10, rotulo: 80, observacao: 500, parcelas: 36 } as const;
export function moedaSugerida(itens: { currency: string }[]): Moeda;           // P10
export function parteSugerida(tipo: TipoDeParte, moeda: Moeda, primeiraData: string): ParteDaForma; // total 0
export function comParcelasGeradas(parte: ParteDaForma, primeiraData: string): ParteDaForma;
export function errosDaParte(parte: ParteDaForma): string[];
export function erroDaForma(partes: ParteDaForma[]): string | null;           // 11ª parte e erros das partes
export function totaisDaForma(partes: Pick<ParteDaForma, "total" | "currency">[]): PorMoeda;
export function totalDaForma(partes: Pick<ParteDaForma, "total" | "currency">[]): string; // "R$ 10.000 + US$ 9.000"
export function avisoDeCoerencia(itens: { amount: number; currency: string }[], partes: Pick<ParteDaForma, "total" | "currency">[]): string | null;
export function avisoDeVencidas(partes: { parcelas: { due_on: string }[] }[], hoje: string): string | null;
export function avisosDoResumo(resumo: ResumoDoGanho, hoje: string): string[]; // P1; usa o tipo do T4
```

```ts
// forma-schema.ts
export const parteSchema; // label trim 1..80, method z.enum(METODOS), currency, total > 0 e ≤ 9999999999.99,
                          // installments_count int 1..36, parcelas [{ number int ≥ 1, amount > 0, due_on z.iso.date() }],
                          // superRefine com errosDaParte
export const formaSchema = z.object({ partes: z.array(parteSchema).max(10, "A forma vai até 10 partes.") });
export type FormaParaSalvar = z.infer<typeof formaSchema>;
export const observacaoSchema; // string trim ≤ 500 ("A observação vai até 500 caracteres."), vazia → null
export const cotacaoSchema;    // parseCotacao; nula aceita (limpar); > 0
```

`avisosDoResumo` depende do `ResumoDoGanho` com `forma`, que nasce no T4. Ela entra no T4, junto com o esquema. O resto entra aqui.

- [ ] **Testes primeiro** em `forma-regras.test.ts`. A data base é `2026-12-10`.
  - `parteSugerida("parcelas", "USD", "2026-12-10")`: rótulo "Parcelas", `transferencia`, 3 parcelas; `"cartao"`: `cartao`, 1 parcela; `"entrada"` e `"a_vista"`: `pix`, 1 parcela.
  - `comParcelasGeradas({ ...parcelas, total: 9000 }, "2026-12-10")`: 3 × 3000 em `2026-12-10`, `2027-01-10` e `2027-02-10`. No cartão, sempre 1 parcela com o total.
  - `errosDaParte`:
    - parcelas 3000 + 3000 + 2999,99 contra o total 9000: `["As parcelas de Parcelas somam " + formatarMoeda(8999.99, "USD") + "; o total é " + formatarMoeda(9000, "USD") + "."]`;
    - 37 parcelas: "Parcelas vão de 1 a 36.";
    - cartão com 2: "Cartão é um pagamento só, numa data.";
    - rótulo "" ou com 81 caracteres: "Dê um nome à parte, com até 80 caracteres.";
    - total 0: "Informe o valor de Parcelas.".
  - `erroDaForma` com 11 partes: "A forma vai até 10 partes.".
  - `totalDaForma([{ total: 10000, currency: "BRL" }, { total: 9000, currency: "USD" }])`: `formatarMoeda(10000, "BRL") + " + " + formatarMoeda(9000, "USD")`, com BRL antes de USD.
  - `avisoDeCoerencia`:
    - itens US$ 8.000 e US$ 6.000 contra a parte de US$ 13.000: `"A forma soma " + formatarMoeda(13000, "USD") + " e os vistos, " + formatarMoeda(14000, "USD") + "."`;
    - US$ 14.000 contra US$ 14.000: `null`;
    - partes em BRL e USD: `null`;
    - nenhuma parte: `null`.
  - `avisoDeVencidas`, com hoje `2026-12-10`:
    - uma parcela em `2026-12-09`: "1 parcela já vencida";
    - duas antes de hoje: "2 parcelas já vencidas";
    - a de `2026-12-10` não conta.
- [ ] **Testes** em `forma-schema.test.ts`:
  - `due_on: "2026-02-31"` é recusado;
  - total `10000000000` é recusado;
  - a mesma soma errada de cima é recusada com a mesma frase;
  - `observacaoSchema` com 501 caracteres é recusado;
  - `cotacaoSchema.parse("5,425") === 5.425`;
  - `cotacaoSchema.parse("") === null`.
- [ ] `bun x vitest run src/features/opportunities/forma-regras.test.ts src/features/opportunities/forma-schema.test.ts`. Esperado: FALHA (módulos não existem).
- [ ] Implementar.
  - `comParcelasGeradas` usa `gerarParcelas` sem `entrada`.
  - As somas são em centavos.
  - `errosDaParte` e o esquema usam as frases da tabela global.
- [ ] Rodar de novo. Esperado: verde.
- [ ] Commit `feat(crm): regras da forma de pagamento (entrega 4a)`.

### T3 0058 — a forma no banco (FIC-7, FIC-10, FIC-11, FIC-12)

**Arquivos:**
- Criar: `supabase/migrations/0058_forma_de_pagamento.sql` e `tests/rls/forma-de-pagamento.test.ts`.
- Mexer: `src/lib/supabase/database.types.ts` e `docs/banco.md`.

**Interfaces** (produz):
- Tabelas, como na §6.4 e no §6 do desenho da 4a:
  - **`payment_plans`:** sem `card_with_interest` em lugar nenhum. `status` com `check in ('rascunho','enviada','confirmada','recusada')`, padrão `'rascunho'`.
  - **`payment_plan_parts`:** `method` com o `check` de `installments.method`; `check` `(method = 'cartao' and installments_count = 1) or (method <> 'cartao' and installments_count between 1 and 36)`; `label` com `check` de 1 a 80; `total numeric(12,2) check (total > 0)`.
  - **`payment_plan_installments`:** `amount numeric(12,2) check (amount > 0)`.
  - **`payment_plan_responses`:**
    - mais `answered_by_name text`;
    - `answered_by` com `on delete set null`;
    - o `check` só de `registration_form_id`: nulo em `confirmada_pela_equipe`, preenchido nas outras;
    - `reason` com `check` de até 500.
  - **Em todas:** lápide (`private.marcar_lapide`), `set_updated_at`, `unique (id, organization_id)` e chaves compostas.
  - **`receivables.payment_plan_part_id`:** único parcial; FK composta `on delete set null (payment_plan_part_id)`.
- **RLS** (P6):
  - **`payment_plans`:** `select`, `insert` e `update` para membros. Sem `delete`.
  - **Partes e parcelas:** `select` por `exists` em `payment_plans`; `insert`, `update` e `delete` para membros.
  - **Respostas:** `select` por `exists` em `payment_plans`; `insert` para membros. Sem `update` e sem `delete`.
- **Gatilhos**, com nomes que rodam na ordem certa:
  - `payment_plans_so_pelas_funcoes` (`before insert or update`): sem a marca, recusa o insert, e no update deixa mudar só `reference_rate`, `reference_rate_note` e `updated_at`;
  - `payment_plans_nao_se_apaga` (`before delete`): recusa se `pg_trigger_depth() < 2`;
  - `payment_plan_parts_so_pelas_funcoes` e `payment_plan_installments_so_pelas_funcoes` (`before insert or update or delete`): marca, ou profundidade > 1;
  - `payment_plan_responses_na_entrada` (`before insert`), sem a marca, recusa. Com ela:
    - exige a forma em `rascunho`;
    - força `decision = 'confirmada_pela_equipe'`, `answered_by = auth.uid()`, `answered_by_name` (de `profiles.full_name`, ou do e-mail), `registration_form_id = null` e `answered_at = now()`;
  - `payment_plan_responses_nao_mudam` (`before update or delete`): profundidade > 1 passa, o resto recusa.
- **`private.opportunity_items_trava_do_ganho`** (`create or replace` da 0054:110-146): depois do ramo "ganho", lê a forma com `for share`. Com `status = 'confirmada'` e `charges_created_at` nulo, recusa com a frase dos vistos. A ordem de travas é negócio, depois forma.
- **`private.opportunities_ganho_nao_se_apaga`** (`create or replace` da 0054:183-200): depois do ramo "ganho", recusa com a frase de excluir quando há resposta da forma do negócio.
- **`public.salvar_forma_de_pagamento(p_negocio uuid, p_forma jsonb) returns uuid`** (o id da forma). O `jsonb` é `{ "partes": [ { "label", "method", "currency", "total", "installments_count", "parcelas": [ { "number", "amount", "due_on" } ] } ] }`, e `position` é o índice. Faz:
  - trava o negócio com `for share`;
  - `insert … on conflict (opportunity_id) do nothing`, com a organização do negócio, e depois a forma com `for update`;
  - a ordem das frases: `charges_created_at` preenchido → a frase das cobranças, antes de todas; negócio com status diferente de `open` → a de encerrado; `status` diferente de `rascunho` → "A forma está confirmada…";
  - valida o que o T2 valida, com as mesmas frases, em `numeric`;
  - grava as partes por posição (P8).
- **`public.confirmar_forma_de_pagamento_pela_equipe(p_negocio uuid, p_observacao text default null) returns void`:**
  - as mesmas travas e a ordem de frases do salvar, sem criar a forma (sem forma → "Acrescente pelo menos um visto e uma parte…"), e o CRM-10;
  - pelo menos um item e uma parte;
  - monta a cópia `{ "vistos": [ { "visa_name", "amount", "currency" } ], "partes": [ … como no p_forma … ] }`, sem cotação;
  - insere a resposta, põe `confirmada` e grava a atividade `forma_de_pagamento` "Forma de pagamento confirmada pela equipe".
- **`public.voltar_forma_para_rascunho(p_negocio uuid) returns void`:** o CRM-10; a mesma ordem de frases (cobranças, encerrado); sem forma ou fora de `confirmada` → "A forma não está confirmada."; volta a `rascunho` e grava a atividade "Forma de pagamento refeita".
- **As três funções:** ligam a marca e a desligam no fim; travam negócio e depois forma; `revoke`/`grant` como nas restrições.

- [ ] **Testes primeiro** em `tests/rls/forma-de-pagamento.test.ts`.
  - **A base do arquivo:**
    - os ajudantes são os de `ganho.test.ts:55-160`: `novaPessoa`, `novoNegocio` e `novoItem`, com dois itens EB-1A US$ 8.000 e O-1 US$ 6.000;
    - a forma do critério: Entrada, pix, BRL 10.000, 1 parcela em hoje + 10 dias; Parcelas, transferência, USD 9.000, 3 × 3.000 a partir de hoje + 1 mês. As datas são calculadas com `somarMeses` de `@/lib/parcelas`;
    - as frases vêm num `MSG` com as da tabela global.
  - **Os casos:**
    1. `staff` salva a forma do critério: `status = 'rascunho'`, 2 partes e 4 parcelas. Salvar de novo igual deixa os mesmos ids de parte. Salvar só a 2ª parte deixa 1 parte e 3 parcelas (foco 4).
    2. Salvar é recusado, cada caso com a frase:
       - a soma 3000 + 3000 + 2999,99 (foco 1);
       - 37 parcelas;
       - cartão com 2;
       - 11 partes;
       - `due_on` inválido e total `10000000000` (foco 5): recusados com frase, e o erro não traz `22008` nem `22003` cru.
    3. Confirmar:
       - `staff`, que não é dono, é recusado com a frase;
       - sem parte e sem visto, recusado com a frase;
       - o `parceiro` (gestão) confirma com "acertado por WhatsApp": a forma fica `confirmada`, e há uma resposta com `decision = 'confirmada_pela_equipe'`, `reason`, `answered_by = parceiroId`, `answered_by_name` preenchido e `registration_form_id` nulo;
       - a cópia tem 2 vistos e 2 partes, e `JSON.stringify(snapshot)` não contém `reference_rate`;
       - o histórico tem `{ type: "forma_de_pagamento", description: "Forma de pagamento confirmada pela equipe" }`.
    4. Confirmar de novo é recusado ("A forma está confirmada…"), e continua havendo **uma** resposta (foco 3). Salvar com a forma confirmada também é recusado.
    5. Refazer: `staff` é recusado. A gestão volta a forma para `rascunho`, a resposta continua lá e o histórico ganha "Forma de pagamento refeita".
    6. A prova não se forja: pela API do `parceiro`,
       - o `insert` em `payment_plan_responses`, com cada um dos três `decision`, dá erro;
       - `update payment_plans set status = 'confirmada'` dá erro;
       - `update … set charges_created_at = now()` dá erro;
       - o `insert` direto em `payment_plans`, num negócio sem forma, dá erro;
       - o `delete` em `payment_plans` devolve 0 linhas, e a forma e a resposta continuam;
       - `insert`, `update` e `delete` em partes e parcelas dão erro;
       - `update` e `delete` em respostas devolvem 0 linhas, e a resposta não muda.
    7. Cotação: com a forma `confirmada`, `update payment_plans set reference_rate = 5.425, reference_rate_note = 'C6, hoje'` funciona, e a cópia não muda.
    8. Vistos travados:
       - com a forma `confirmada`, `insert`, `update` e `delete` em `opportunity_items` são recusados com a frase dos vistos;
       - depois de Refazer, passam;
       - um visto descartável (`novoVisto`) usado num item, com a forma confirmada: apagá-lo em `visa_types` funciona, e o item fica com `visa_type_id` nulo.
    9. Negócio encerrado: o negócio é posto em `status = 'lost'` e na etapa de perda, por `update` direto, que a 0054 deixa. Salvar, confirmar e refazer são recusados com a frase de encerrado, e a cotação ainda muda.
    10. Excluir:
        - o negócio com resposta, mesmo depois de Refazer, é recusado com a frase, e o negócio continua;
        - o negócio só com forma em rascunho se apaga, e a forma some.
    11. Portal (P7): num negócio novo do "Cliente de Teste", criado pelo `parceiro`, com a forma em rascunho, o `cliente` lê 0 linhas de `payment_plans`, partes e parcelas. Em `finally`, o `parceiro` apaga esse negócio.
    12. Apagar a pessoa descartável com a forma confirmada e com resposta funciona, e o `parceiro` passa a ler 0 formas daquele negócio.
- [ ] `bun x vitest run tests/rls/forma-de-pagamento.test.ts`. Esperado: FALHA (`relation "payment_plans" does not exist` ou função inexistente).
- [ ] Escrever a 0058, com o comentário do topo explicando: a forma só pelas funções, a prova imutável, a trava dos vistos até as cobranças e o P6.
- [ ] Aplicar a migration e regenerar os tipos.
- [ ] Rodar de novo. Esperado: verde.
- [ ] Regressão: `bun x vitest run tests/rls/vistos-do-negocio.test.ts tests/rls/ganho.test.ts tests/rls/funil.test.ts tests/rls/portal-do-cliente.test.ts tests/rls/financeiro.test.ts --no-file-parallelism`. Esperado: verde.
- [ ] `docs/banco.md`:
  - "Situação: 0001 a 0058";
  - as quatro tabelas, a coluna de `receivables`, os gatilhos, as três funções e as duas travas ampliadas.
- [ ] `bun run verify` → commit `feat(banco): forma de pagamento (0058)`.

### T4 0059 — cobranças no Ganho (REC-6, CRM-14)

**Arquivos:**
- Criar: `supabase/migrations/0059_cobrancas_no_ganho.sql` e `tests/rls/cobrancas-do-ganho.test.ts`.
- Mexer:
  - `src/features/opportunities/schema.ts:35-60` e `schema.test.ts`;
  - `forma-regras.ts` e o teste, com `avisosDoResumo`;
  - `database.types.ts` e `docs/banco.md`.

**Interfaces:**
- Consome a 0058 e `ParteDaForma`.
- Produz:

```ts
// schema.ts — resumoDoGanhoSchema ganha:
forma: z.object({
  situacao: z.enum(["sem_forma", "rascunho", "enviada", "recusada", "confirmada", "cobrancas_criadas"]), // P9
  confirmada_em: z.string().nullable(),       // answered_at da última resposta
  confirmada_por: z.string().nullable(),      // answered_by_name da última resposta
  cobrancas_criadas_em: z.string().nullable(),
  partes: z.array(z.object({ label, method, currency, total, installments_count,
                             parcelas: z.array(z.object({ number, amount, due_on })) })),
}),
cobrancas: z.array(z.object({ id: z.string().nullable(), titulo: z.string(),
                              moeda: z.enum(["BRL", "USD"]), total: z.number(), parcelas: z.number().int() })),
```

- **SQL:**
  - `private.forma_do_ganho(p_negocio uuid) returns jsonb`, `security invoker`, com `grant` a `authenticated`. Devolve `{ forma, cobrancas }`, com as cobranças **sem id** e na ordem das partes. A situação vem nesta precedência: `charges_created_at` preenchido → `cobrancas_criadas`; sem linha → `sem_forma`; senão, o `status`. As cobranças só aparecem com `confirmada`.
  - **Títulos:** "‹label› — ‹vistos›", com os `visa_name` dos itens por `position`, separados por ", ".
- **`ganhar_negocio`**, com `create or replace` e a mesma assinatura:
  - **na simulação:** devolve `forma` e `cobrancas` de `private.forma_do_ganho`;
  - **na gravação,** depois do passo (6):
    - `perform … from payment_plans where opportunity_id = p_negocio for update`;
    - lê `private.forma_do_ganho`;
    - se a situação é `confirmada`, liga `via_forma`;
    - por parte, faz `insert` em `receivables` (organização e pessoa do negócio, `project_id` nulo, `created_by = v_eu`, `payment_plan_part_id`) e em `installments` (as parcelas e o `method` da parte);
    - grava `charges_created_at = now()` e desliga `via_forma`;
    - devolve `cobrancas` com os ids e `forma` relida;
  - `avisos` não muda (P1).

- [ ] **Testes primeiro** em `tests/rls/cobrancas-do-ganho.test.ts`. A base é a do T3, e as funções do T3 montam a forma.
  1. Forma do critério confirmada pela gestão:
     - a simulação traz `forma.situacao = 'confirmada'`, `confirmada_por` preenchido e 2 cobranças: "Entrada — EB-1A, O-1" (BRL 10000, 1 parcela) e "Parcelas — EB-1A, O-1" (USD 9000, 3 parcelas), com `id` nulo;
     - a gravação traz as mesmas 2, com `id`;
     - no banco, 2 `receivables` da pessoa, com `organization_id` da pessoa, `project_id` nulo e `payment_plan_part_id` preenchido;
     - as parcelas são 1 em pix e 3 em transferência, com as datas da forma;
     - `charges_created_at` fica preenchido.
  2. Parte "Cartão", USD 9000: 1 cobrança "Cartão — EB-1A, O-1", com 1 parcela e `method = 'cartao'`.
  3. Forma em rascunho: `situacao = 'rascunho'` e nenhuma cobrança, nem no banco. Sem forma: `situacao = 'sem_forma'`.
  4. Reabrir e ganhar de novo:
     - Refazer, salvar e confirmar são recusados com a frase das cobranças;
     - a simulação traz `situacao = 'cobrancas_criadas'` e `cobrancas` vazia;
     - acrescentar um item "EB-2 NIW" passa;
     - o Ganho cria só o processo dele, e continua havendo 2 cobranças;
     - `update payment_plans set charges_created_at = null` pela API dá erro.
  5. Parcela com vencimento ontem: o Ganho passa e cria a cobrança, e a parte devolvida em `forma` traz essa data.
- [ ] **Testes** em `forma-regras.test.ts`, para `avisosDoResumo`, com um resumo montado à mão:
  - `confirmada` com uma parcela ontem e coerência ok: `["1 parcela já vencida"]`;
  - `confirmada` em US$ 13.000 com vistos de US$ 14.000: o aviso de coerência;
  - `cobrancas_criadas` com `processos` do item "EB-2 NIW": `["EB-2 NIW não está na forma de pagamento: crie a cobrança à mão na aba Financeiro."]`, sem coerência;
  - `sem_forma`: `[]`.
- [ ] **Teste** em `schema.test.ts`: o resumo sem `forma` falha, e com `forma` passa.
- [ ] Rodar os três. Esperado: FALHA.
- [ ] Escrever a 0059, aplicá-la, regenerar os tipos e implementar o esquema e `avisosDoResumo`.
- [ ] Rodar de novo, mais `tests/rls/ganho.test.ts`. Esperado: verde. O `expect(resumo.cobrancas).toEqual([])` de `ganho.test.ts:230` continua valendo, porque ali não há forma.
- [ ] `docs/banco.md`: 0059, o passo (7) e `private.forma_do_ganho`.
- [ ] `bun run verify` → commit `feat(banco): cobranças no Ganho (0059)`.

### T5 Ações da forma e a leitura do lead

**Arquivos:**
- Criar: `src/features/opportunities/forma-actions.ts` e o `.test.ts`.
- Mexer:
  - `src/features/opportunities/queries.ts:170-217` (`obterNegocio`);
  - `src/features/people/montagem.ts:48` e o teste dele.

**Interfaces:**
- Consome `formaSchema`, `observacaoSchema` e `cotacaoSchema` (T2), e as funções da 0058.
- Produz:

```ts
export async function salvarFormaDePagamento(anterior: ActionState, formData: FormData): Promise<ActionState>;
// campos: negocio (uuid), forma (JSON de FormaParaSalvar). Inválido → falhou(primeira frase do zod), sem chamar o banco.
export async function confirmarFormaPelaEquipe(anterior: ActionState, formData: FormData): Promise<ActionState>;
// campos: negocio, observacao
export async function refazerFormaDePagamento(formData: FormData): Promise<ActionState>;   // campo: negocio
export async function salvarCotacao(formData: FormData): Promise<ActionState>;
// campos: plano (uuid), negocio (uuid), e reference_rate OU reference_rate_note (o name do InlineText)
```

  - Todas usam `contextoAtual()`, `traduzirErro`, `gravou()`/`falhou()` e `revalidatePath(`/crm/${negocio}`)`.
  - **`obterNegocio`** passa a devolver também:

    ```ts
    forma: {
      id, status, reference_rate, reference_rate_note, charges_created_at,
      partes: ParteDaForma[] (por position, parcelas por number),
      ultimaResposta: { answered_at, answered_by_name, reason } | null,
    } | null
    ```

    Vem embutida no mesmo `select`: `payment_plans` é um para um. O tipo sai como `export type FormaDoNegocio`, usado pelo T6.
  - **`TIPOS_DO_SISTEMA`** ganha `"forma_de_pagamento"`.

- [ ] **Testes primeiro.** Cliente Supabase simulado, como em `itens-actions.test.ts`:
  - `salvarFormaDePagamento` com uma forma de soma errada não chama `rpc` e devolve a frase;
  - com uma forma válida, chama `rpc("salvar_forma_de_pagamento", { p_negocio, p_forma })` com o objeto validado;
  - um erro `P0001` do banco volta como a frase;
  - `confirmarFormaPelaEquipe` manda `p_observacao: null` para uma observação vazia;
  - `salvarCotacao` com `reference_rate = "5,425"` faz `update({ reference_rate: 5.425 })` filtrado por `id = plano` (foco 2), e com `""` grava `null`.
- [ ] **Teste:** um `activities` do tipo `forma_de_pagamento` sai com `system: true` na montagem da linha do tempo.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar, mais o `obterNegocio`.
- [ ] Rodar, mais `bun x tsc --noEmit`. Esperado: verde.
- [ ] Commit `feat(crm): ações da forma de pagamento (entrega 4a)`.

### T6 O cartão e a janela da forma no lead (FIC-7, FIC-10, FIC-11, FIC-12)

**Arquivos:**
- Criar: `src/app/(app)/crm/[id]/forma-de-pagamento.tsx` e `janela-da-forma.tsx`, cada um com o seu `.test.tsx`.
- Mexer: `src/app/(app)/crm/[id]/page.tsx` e `vistos.tsx`, com o teste.

**Interfaces:**
- Consome T2, T5 e `obterNegocio().negocio.forma`.
- Produz:

```tsx
export function CartaoDaFormaDePagamento(props: {
  negocioId: string; pessoaId: string; nomeDaPessoa: string;
  itens: { visa_name: string; amount: number; currency: string }[];
  forma: FormaDoNegocio | null;           // o tipo de obterNegocio
  aberto: boolean;                         // negocio.status === "open"
  podeConfirmar: boolean;                  // dono ou gestão
}): React.ReactNode;
export function JanelaDaForma(props: {
  negocioId: string; nomeDaPessoa: string;
  itens: { visa_name: string; amount: number; currency: string }[];
  partes: ParteDaForma[]; gatilho: React.ReactNode;
}): React.ReactNode;
// Vistos ganha a prop travadaPelaForma: boolean
```

**O cartão:**
- **Sem forma:** `EmptyState` com "Definir forma de pagamento", que abre a janela.
- **Com forma:**
  - selo "rascunho" ou "confirmada";
  - uma linha por parte: "‹rótulo› · ‹método› · ‹n› × ‹valor› · ‹datas›", ou "‹rótulo› · ‹método› · ‹valor› · ‹data›" com 1 parcela;
  - "Total: " + `totalDaForma`;
  - a confirmação: "Confirmada pela equipe em ‹formatarData› por ‹nome›", e a observação entre aspas, quando há;
  - a cotação em dois `InlineText`, `reference_rate` com `inputMode="decimal"` e `reference_rate_note`, em qualquer estado.
- **Botões:**
  - rascunho e negócio aberto: "Editar", e "Confirmar pela equipe" só com `podeConfirmar`;
  - confirmada, negócio aberto, sem cobranças: "Refazer" só com `podeConfirmar`, por `ConfirmAction`;
  - encerrado, ou com `charges_created_at`: só leitura;
  - com `charges_created_at`: "Cobranças criadas no Ganho em ‹data›", ligado a `enderecoDaPessoa(pessoaId, "client", "financeiro")`.
- **"Confirmar pela equipe"** é um `FormDialog`: o resumo das partes, o `avisoDeCoerencia` quando há, e um `Textarea` com `name="observacao"` e `maxLength` 500.

**A janela:**
- `FormDialog` com `acao={salvarFormaDePagamento}`. O estado das partes fica no cliente, e um `<input type="hidden" name="forma">` leva o JSON.
- **Cabeçalho:** os vistos e os totais por moeda (`somarItensPorMoeda`).
- **Botões de parte:** "+ Entrada", "+ Parcelas", "+ Cartão" e "+ À vista", com `parteSugerida` e `moedaSugerida`. Com 10 partes, ficam desabilitados.
- **Cada parte:**
  - campos de rótulo, método (`METODOS` e `ROTULO_DO_METODO`), moeda, total, número de parcelas (fora do cartão) e 1ª data;
  - mudar o total, o número ou a 1ª data chama `comParcelasGeradas`;
  - cada parcela tem a data e o valor editáveis;
  - os `errosDaParte` aparecem junto da parte;
  - um botão "remover".
- **Rodapé:** "Total da forma: " + `totalDaForma`, e o aviso de coerência, se houver.
- **Salvar** fica desabilitado enquanto `erroDaForma` não for nulo.
- **No celular:** as partes empilham, e cada parcela é uma linha com data e valor (`grid-cols-[auto_1fr_1fr]`), sem largura fixa.

**A página:**
- O cartão vai logo abaixo do card Negócio, na coluna da esquerda.
- `daGestaoDe` passa a ser consultado sempre, e não só com o negócio ganho.
- `podeConfirmar` é `negocio.owner_id === user.id || daGestao`.
- `Vistos` recebe `travadaPelaForma`, que vale `forma?.status === "confirmada" && !forma.charges_created_at`. Travada, ela esconde acrescentar, editar e remover, e mostra a frase dos vistos.

- [ ] **Testes primeiro.**
  - **Cartão:**
    - sem forma, mostra "Definir forma de pagamento";
    - com a forma do critério, mostra as 2 linhas e `totalDaForma`;
    - "Confirmar pela equipe" aparece só com `podeConfirmar` e em rascunho;
    - "Refazer" aparece só confirmada, sem `charges_created_at` e com `podeConfirmar`;
    - com `charges_created_at`, mostra "Cobranças criadas no Ganho em …" com `href` `/clientes/<id>?aba=financeiro`, sem Refazer;
    - com o negócio encerrado, sem Editar; a cotação continua editável.
  - **Janela:**
    - "+ Parcelas" gera 3 parcelas;
    - mudar o total para 9000 regera 3 × 3000;
    - editar uma parcela para 2999,99 mostra a frase da soma e desabilita Salvar;
    - "+ Cartão" não mostra número de parcelas;
    - com 10 partes, os botões ficam desabilitados;
    - Salvar manda `forma` com o JSON das partes.
  - **Vistos:** com `travadaPelaForma`, não há "Acrescentar visto" e aparece a frase; com `false` e o negócio aberto, há.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar, com os componentes do `AGENTS.md` (`FormDialog`, `ConfirmAction`, `EmptyState`, `InlineText`), os tokens e os raios.
- [ ] Rodar os testes de `src/app/(app)/crm/[id]`. Esperado: verde.
- [ ] Commit `feat(crm): forma de pagamento no lead (entrega 4a)`.

### T7 O resumo do Ganho com a forma (CRM-14)

**Arquivos:** mexer em `src/app/(app)/crm/dialogos.tsx:143-195` e `dialogos.test.tsx` (linhas 33, 51 e 56, os fixos de hoje).

**Interfaces:** consome `ResumoDoGanho` com `forma` e `cobrancas` (T4), e `avisosDoResumo` e `totalDaForma` (T2/T4).

**O trecho "Forma de pagamento"**, pela §5.4 do desenho:

| Situação | O que mostra |
|---|---|
| `confirmada` | "Confirmada pela equipe em ‹data›, por ‹nome›" e uma linha por parte |
| `rascunho`, `enviada` ou `recusada` | "Em rascunho: nenhuma cobrança será criada. Para criá-las, confirme a forma antes do Ganho." |
| `sem_forma` | "Não definida: nenhuma cobrança será criada." |
| `cobrancas_criadas` | "As cobranças desta forma já foram criadas em ‹data›." |

**Em "Ao confirmar":**
- com cobranças: "Será criada 1 cobrança (‹valor›)" ou "Serão criadas ‹n› cobranças (‹valor›; ‹valor›)", com `formatarMoeda(total, moeda)` de cada uma. Sem cobranças, nada.
- os avisos: `resumo.avisos` seguidos de `avisosDoResumo(resumo, hojeEmSaoPaulo())`.

- [ ] **Testes primeiro.**
  - Resumo `confirmada` com 2 cobranças: "Serão criadas 2 cobranças (R$ 10.000; US$ 9.000)", pela mesma `formatarMoeda`, e a linha "Confirmada pela equipe em …".
  - `rascunho` e `sem_forma`: as frases da tabela, sem linha de cobrança.
  - `cobrancas_criadas` com um processo do "EB-2 NIW": a frase das cobranças já criadas e o aviso do visto fora da forma.
  - "Forma de pagamento: definir na aba Financeiro" e "Nenhuma cobrança será criada." não aparecem mais.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar.
- [ ] Rodar `src/app/(app)/crm`. Esperado: verde.
- [ ] **Teste em `opportunities/actions.test.ts`:** o `deleteOpportunity` com o erro `{ code: "P0001", message: <frase de excluir> }` devolve a frase. A trava é da 0058, e a ação só repassa. Se já passar sem mudança, registrar no ledger que o teste fixa o comportamento.
- [ ] Commit `feat(crm): resumo do Ganho com a forma de pagamento (CRM-14)`.

### T8 Documentação, verificação e revisão

- [ ] **`docs/spec.md`:**
  - FIC-7 🟡 (o envio na 4b), FIC-10 🟡 (a partir de `enviada` na 4b), FIC-11 ✅, FIC-12 ✅, REC-6 🟡 ("mesmo assim" na 4b), CRM-14 🟡 (as formas enviada e recusada);
  - a nota "*Entrega 4a (data): …*" em cada um.
- [ ] **`docs/plano.md`** (linha ~302): a 4a no ar, e o que fica para a 4b.
- [ ] **`AGENTS.md`**, tabela "UI: use o que já existe": "Parcelas mês a mês sem perder centavo; métodos de pagamento → `gerarParcelas`, `somarMeses`, `METODOS`, `ROTULO_DO_METODO` (`@/lib/parcelas`)".
- [ ] **Verificação:**
  - `bun run verify`;
  - `bun run build`;
  - `bun run dev` num terminal e `bun run test:fumaca` no outro.

  Esperado: tudo verde. Registrar os números.
- [ ] Commit `docs: entrega 4a na spec, no plano e no AGENTS`.
- [ ] **Revisão final:**
  - Code Reviewer no modelo mais capaz, sobre o intervalo da entrega;
  - requisitos: o desenho da 4a e a spec;
  - com o "Foco da revisão" deste plano e as linhas `Ruling:` do ledger;
  - rodadas até não sobrar ajuste, em crítico, importante, médio e cosmético;
  - cada correção com o teste vermelho antes.
- [ ] Entregar ao Renato a tabela do que ficou pronto, como foi provado e o que fica para a 4b, com o comando:

  ```bash
  git -C "D:\Projetos Apps\dulihub-v2" push
  ```

  Lembrar a troca da senha do banco que vazou.

## Verificação

- **Por tarefa:** o teste vermelho visto, depois verde.
  - Unidade: `bun x vitest run <arquivo>`.
  - RLS: `bun x vitest run tests/rls/<arquivo>`, e mais de um arquivo com `--no-file-parallelism`.
- **Antes de cada commit de banco:** `bun run verify` (tipos, lint, unidade e RLS).
- **No fim:** `bun run build`, a fumaça local, e o CI verde depois do push. Depois do deploy, `/api/versao` com o commit.
- **No banco**, depois da 0058, só leitura:
  - o aviso "definer executável por anon" do Supabase (`get_advisors`) continua aparecendo só para as duas funções da ficha;
  - `select count(*) from payment_plans` é 0 fora da organização de teste.
