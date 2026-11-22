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
  - no mesmo commit vão o arquivo `supabase/migrations/NNNN_nome.sql`, o `src/lib/supabase/database.types.ts` regenerado e o `docs/banco.md`. Para regenerar: `generate_typescript_types` devolve um JSON; o script `tipos.py` do rascunho da sessão (`python -I <scratchpad>/tipos.py <arquivo> src/lib/supabase/database.types.ts`) só extrai o campo `types` e grava o arquivo. Sem o script, extrair à mão;
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
  | Parcelas que não somam o total, na tela | "As parcelas de ‹rótulo› somam ‹valor›; o total é ‹valor›." |
  | Parcelas que não somam o total, no banco (P11) | "As parcelas de ‹rótulo› não somam o total." |
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
  | Negócio que não existe ou que a RLS esconde, nas três funções (como a 0054) | "Negócio não encontrado." |
  | `payment_plan_part_id` gravado fora do Ganho (P13) | "A cobrança da forma de pagamento só nasce no Ganho." |
  | Data de parcela inválida (P5) | "A data da parcela ‹n› de ‹rótulo› não é válida." |
  | Valor acima de 9.999.999.999,99 (P5) | "O valor de ‹rótulo› passa do limite." |
  | Valor com mais de 2 casas decimais (P5) | "Use no máximo 2 casas decimais em ‹rótulo›." |
  | Número de parcelas diferente da lista, ou numeração fora de 1..N (P5) | "O número de parcelas de ‹rótulo› não bate com a lista." |
  | `p_forma` fora do formato, pela API (P5) | "A forma de pagamento veio num formato inválido." |
  | Cotação zero ou negativa (P5) | "Informe uma cotação maior que zero." |
  | Anotação da cotação com mais de 200 caracteres (P5) | "A anotação da cotação vai até 200 caracteres." |

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
| P10 | Os padrões dos botões: Entrada é pix com 1 parcela; Parcelas, transferência com 3; Cartão, cartão com 1; À vista, pix com 1. A moeda é a dos vistos, quando são todos da mesma, e BRL nos outros casos. A 1ª data é hoje (`hojeEmSaoPaulo()`) | O desenho deixou com quem constrói, e o teste precisa de valor. Hoje dispensa uma função de somar dias | Padrões a ajustar |
| P11 | No banco, a frase da soma errada não leva os valores: "As parcelas de ‹rótulo› não somam o total." A tela continua dando a frase com os valores | O banco confere a mesma regra, mas formatar dinheiro em SQL igual ao `formatarMoeda` (Intl, espaço rígido, centavos só quando há) seria uma segunda implementação para manter. A frase do banco só aparece para quem chama a API direto, porque a tela pega o erro antes | Nenhum para quem usa a tela |
| P12 | Salvar não fica desabilitado: o `FormDialog` não deixa o filho travar o botão. A janela embrulha a ação (`exigeFormaValida`, como `exigeValor` em `vistos.tsx:45-50`), e ela devolve `falhou(erroDaForma(...))` sem chamar o servidor | O padrão da casa, sem mexer no `FormDialog` | Nenhum: a frase aparece no rodapé, como nos outros diálogos |
| P13 | `receivables.payment_plan_part_id` só se grava com a marca `via_forma`, ou na ação da chave estrangeira | Sem isso, um membro marcaria uma cobrança manual como da forma pela API, e o próximo Ganho daquela parte cairia com duplicata | Nenhum |
| P14 | `payment_plan_responses` tem `updated_at` e o gatilho `set_updated_at`, como toda tabela (§3 do desenho de origem) | O único update que a resposta sofre é o `set null` de `answered_by`, e ele grava `updated_at` | Nenhum |
| P15 | No resumo do Ganho, a parcela vencida só é avisada com a forma `confirmada`, porque só aí a parcela vai nascer. A coerência é avisada em `confirmada`, `rascunho`, `enviada` e `recusada` com partes; em `cobrancas_criadas` e `sem_forma`, não | O desenho, §5.2 e §5.4 | Nenhum |

## Foco da revisão

Cada item tem teste na tarefa dona.

1. **Um centavo de diferença.** Parcelas editadas à mão que somam R$ 9.999,99 contra R$ 10.000: a tela recusa com a frase e os dois valores, e o banco recusa com a frase do P11. Valor com 3 casas decimais pela API também é recusado (T2, T3).
2. **Campo vazio no meio da digitação.** Apagar o "3" para digitar "12", ou limpar a 1ª data, não derruba a janela: as parcelas somem, e a frase aparece até o campo ficar válido. Trocar uma parte "Parcelas" para cartão a deixa com 1 parcela (T2, T6).
3. **Data de parcela um dia antes.** `due_on` é dia, não instante: "2026-12-10" aparece "10/12/2026" no cartão, na janela e no resumo, e nunca "09/12/2026" (T6, T7).
4. **Clique duplo em "Confirmar pela equipe".** Duas chamadas ao mesmo tempo: uma passa, a outra é recusada, e fica uma resposta só (T3).
5. **Vistos com a mesma posição.** O título da cobrança e a cópia saem na ordem `position, created_at`, sem depender da sorte (T3, T4).

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
// Nunca lança: número fora de 1..36 (ou NaN), data inválida ou total que não é número → parcelas: [].
// No cartão, sempre 1 parcela com o total. A tela chama também ao trocar o método.
export function erroDaParte(parte: ParteDaForma): string | null;
// No máximo UMA frase por parte: a primeira falha, nesta ordem, que é a mesma do banco:
// rótulo → total (> 0, ≤ 9.999.999.999,99, até 2 casas) → número de parcelas (1..36; 1 no cartão)
// → lista (installments_count itens, numerados 1..N) → cada parcela, em ordem (valor > 0, até 2 casas,
// due_on no formato AAAA-MM-DD e dia válido) → soma (em centavos) igual ao total.
// "Até 2 casas" é emMoeda(emCentavos(v)) === v, nunca Number.isInteger(v * 100) (2999.99 * 100 não é inteiro exato).
// Falhou o número ou a lista, não se confere a soma. Frases da tabela global.
export function erroDaForma(partes: ParteDaForma[]): string | null;           // 11ª parte, ou o primeiro erroDaParte
export function totaisDaForma(partes: Pick<ParteDaForma, "total" | "currency">[]): PorMoeda;
export function totalDaForma(partes: Pick<ParteDaForma, "total" | "currency">[]): string; // "R$ 10.000 + US$ 9.000"
export function avisoDeCoerencia(itens: { amount: number; currency: string }[], partes: Pick<ParteDaForma, "total" | "currency">[]): string | null;
export function avisoDeVencidas(partes: { parcelas: { due_on: string }[] }[], hoje: string): string | null;
export function avisosDoResumo(resumo: ResumoDoGanho, hoje: string): string[]; // P1; usa o tipo do T4
```

```ts
// forma-schema.ts
export const parteSchema; // label, method z.enum(METODOS), currency z.enum(["BRL","USD"]), total, installments_count,
                          // parcelas [{ number, amount, due_on: z.string() }] — o campo confere só o tipo; o dia
                          // válido é conferido em erroDaParte, para a frase dela vir primeiro (o zod 4 põe a
                          // mensagem estática do campo na frente). superRefine com erroDaParte.
                          // Toda mensagem em português, campo a campo (o zod 4 responde em inglês por padrão):
                          // as frases da tabela global, e "A forma de pagamento veio num formato inválido."
                          // para tipo errado.
export const formaSchema = z.object({ partes: z.array(parteSchema).max(10, "A forma vai até 10 partes.") });
export type FormaParaSalvar = z.infer<typeof formaSchema>;
export const observacaoSchema; // string trim ≤ 500 ("A observação vai até 500 caracteres."), vazia → null
export const cotacaoSchema;    // parseCotacao; vazia → null (limpar); ≤ 0 → "Informe uma cotação maior que zero."
export const anotacaoDaCotacaoSchema; // trim ≤ 200 ("A anotação da cotação vai até 200 caracteres."), vazia → null
```

`avisosDoResumo` depende do `ResumoDoGanho` com `forma`, que nasce no T4. Ela entra no T4, junto com o esquema. O resto entra aqui.

- [ ] **Testes primeiro** em `forma-regras.test.ts`. A data base é `2026-12-10`.
  - `parteSugerida("parcelas", "USD", "2026-12-10")`: rótulo "Parcelas", `transferencia`, 3 parcelas; `"cartao"`: `cartao`, 1 parcela; `"entrada"` e `"a_vista"`: `pix`, 1 parcela.
  - `comParcelasGeradas({ ...parcelas, total: 9000 }, "2026-12-10")`: 3 × 3000 em `2026-12-10`, `2027-01-10` e `2027-02-10`. No cartão, sempre 1 parcela com o total; uma parte "Parcelas" com 3, passada a `method: "cartao"`, sai com 1.
  - `comParcelasGeradas` com `installments_count` 0, `NaN` ou 37, ou com a data `""`, devolve `parcelas: []` sem lançar (foco 2).
  - `erroDaParte`, sempre **uma** frase (ou `null` na parte válida):
    - parcelas 3000 + 3000 + 2999,99 contra o total 9000: `"As parcelas de Parcelas somam " + formatarMoeda(8999.99, "USD") + "; o total é " + formatarMoeda(9000, "USD") + "."`;
    - 3 parcelas declaradas com só 2 na lista (que também somariam errado): só a frase da lista;
    - 37 parcelas: "Parcelas vão de 1 a 36.";
    - cartão com 2: "Cartão é um pagamento só, numa data.";
    - rótulo "" ou com 81 caracteres: "Dê um nome à parte, com até 80 caracteres.";
    - total 0: "Informe o valor de Parcelas.";
    - total `10000000000`: "O valor de Parcelas passa do limite.";
    - total `9000.005`: "Use no máximo 2 casas decimais em Parcelas.";
    - `installments_count` 3 com 2 parcelas na lista, ou com a numeração 1, 2, 4: "O número de parcelas de Parcelas não bate com a lista.";
    - uma parcela com `due_on: "2026-02-31"`: "A data da parcela 1 de Parcelas não é válida.".
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
  - `due_on: "2026-02-31"` e total `10000000000` são recusados com as frases em português de cima;
  - `method: "dinheiro"` ou `total: "abc"`: "A forma de pagamento veio num formato inválido.";
  - a mesma soma errada de cima é recusada com a mesma frase;
  - `observacaoSchema` com 501 caracteres é recusado;
  - `cotacaoSchema.parse("5,425") === 5.425`, `cotacaoSchema.parse("") === null`, e `"0"` é recusado com a frase;
  - `anotacaoDaCotacaoSchema` com 201 caracteres é recusado.
- [ ] `bun x vitest run src/features/opportunities/forma-regras.test.ts src/features/opportunities/forma-schema.test.ts`. Esperado: FALHA (módulos não existem).
- [ ] Implementar.
  - `comParcelasGeradas` usa `gerarParcelas` sem `entrada`.
  - As somas são em centavos.
  - `erroDaParte` e o esquema usam as frases da tabela global.
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
  - **`payment_plans`:** `reference_rate numeric(12,4) check (reference_rate > 0)` e `reference_rate_note` com `check` de até 200.
  - **Em todas as quatro:** `updated_at` com `set_updated_at` (também nas respostas, P14), lápide (`private.marcar_lapide`), `unique (id, organization_id)` e chaves compostas.
  - **`receivables.payment_plan_part_id`:** único parcial; FK composta `on delete set null (payment_plan_part_id)`; gatilho `receivables_parte_so_pelo_ganho` (`before insert or update of payment_plan_part_id`): valor não nulo no insert, ou mudado no update, exige a marca `via_forma` ou profundidade > 1 (P13).
- **RLS** (P6):
  - **`payment_plans`:** `select`, `insert` e `update` para membros. Sem `delete`.
  - **Partes:** `select` por `exists` em `payment_plans`. **Parcelas:** `select` por `exists` na parte, que passa pela forma (a parcela não tem `plan_id`). As duas: `insert`, `update` e `delete` para membros.
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
  - trava o negócio com `for share`; sem linha (a RLS esconde o de outra organização) → "Negócio não encontrado.", antes de qualquer outra conferência, como `0054:395-397`;
  - `insert … on conflict (opportunity_id) do nothing`, com a organização do negócio, e depois a forma com `for update`;
  - a ordem das frases: `charges_created_at` preenchido → a frase das cobranças, antes de todas; negócio com status diferente de `open` → a de encerrado; `status` diferente de `rascunho` → "A forma está confirmada…";
  - valida o que o T2 valida, em `numeric`, na **mesma ordem** de `erroDaParte` e parando na primeira falha, com as mesmas frases, menos a da soma (P11):
    - confere `jsonb_typeof` de `partes` (array), de cada parte (objeto) e dos campos numéricos e de texto, e o `due_on`, que precisa casar com `^\d{4}-\d{2}-\d{2}$` **antes** de virar `date` (o Postgres aceitaria "today", "infinity" e "2026-2-3") e depois converter: fora disso, "A forma de pagamento veio num formato inválido." para tipo errado, e a frase da data para o `due_on` que não casa ou não converte (a mesma da tela), nunca o erro cru (`22P02`, `22008`, `22003`);
    - valor com `v <> round(v, 2)` → a frase das 2 casas, antes de gravar (o `numeric(12,2)` arredondaria em silêncio);
    - número de itens da lista igual a `installments_count`, numerados 1..N;
  - grava as partes por posição (P8).
- **`public.confirmar_forma_de_pagamento_pela_equipe(p_negocio uuid, p_observacao text default null) returns void`:**
  - as mesmas travas e a ordem de frases do salvar, sem criar a forma (sem forma → "Acrescente pelo menos um visto e uma parte…"), e o CRM-10;
  - pelo menos um item e uma parte;
  - monta a cópia `{ "vistos": [ { "visa_name", "amount", "currency" } ], "partes": [ … como no p_forma … ] }`, sem cotação, com os vistos em `order by position, created_at` e as partes por `position`;
  - insere a resposta, põe `confirmada` e grava a atividade `forma_de_pagamento` "Forma de pagamento confirmada pela equipe".
- **`public.voltar_forma_para_rascunho(p_negocio uuid) returns void`:** nesta ordem: não encontrado → CRM-10 → cobranças → encerrado → sem forma ou fora de `confirmada` ("A forma não está confirmada."); volta a `rascunho` e grava a atividade "Forma de pagamento refeita".
- **As três funções:** ligam a marca e a desligam no fim; travam negócio e depois forma; `revoke`/`grant` como nas restrições.

- [ ] **Testes primeiro** em `tests/rls/forma-de-pagamento.test.ts`.
  - **A base do arquivo:**
    - os ajudantes são os de `ganho.test.ts:55-160`: `novaPessoa`, `novoNegocio` e `novoItem`, com dois itens EB-1A US$ 8.000 (`position: 0`) e O-1 US$ 6.000 (`position: 1`);
    - a forma do critério: Entrada, pix, BRL 10.000, 1 parcela em hoje + 10 dias; Parcelas, transferência, USD 9.000, 3 × 3.000 a partir de hoje + 1 mês. "Hoje + 10 dias" é um ajudante do próprio arquivo; os meses vêm de `somarMeses` (`@/lib/parcelas`);
    - as frases vêm num `MSG` com as da tabela global.
  - **Os casos:**
    1. `staff` salva a forma do critério: `status = 'rascunho'`, 2 partes e 4 parcelas. Salvar de novo igual deixa os mesmos ids de parte. Salvar só a 2ª parte deixa 1 parte e 3 parcelas (foco 4).
    2. Salvar é recusado, cada caso com a frase:
       - a soma 3000 + 3000 + 2999,99: "As parcelas de Parcelas não somam o total." (foco 1, P11);
       - 3333,335 + 3333,335 + 3333,33 contra 10000: a frase das 2 casas (foco 1);
       - `installments_count` 3 com 2 parcelas na lista;
       - 37 parcelas; cartão com 2; 11 partes;
       - rótulo com 81 caracteres;
       - `due_on: "2026-02-31"`, total `10000000000` e `total: "abc"`: recusados com frase, e o erro não traz `22P02`, `22008` nem `22003`.
    3. Confirmar:
       - `staff`, que não é dono, é recusado com a frase;
       - sem parte e sem visto, recusado com a frase;
       - o `parceiro` (gestão) confirma com "acertado por WhatsApp": a forma fica `confirmada`, e há uma resposta com `decision = 'confirmada_pela_equipe'`, `reason`, `answered_by = parceiroId`, `answered_by_name` preenchido e `registration_form_id` nulo;
       - a cópia tem 2 vistos e 2 partes, e `JSON.stringify(snapshot)` não contém `reference_rate`;
       - o histórico tem `{ type: "forma_de_pagamento", description: "Forma de pagamento confirmada pela equipe" }`;
       - a observação com 501 caracteres é recusada com a frase da observação;
       - o lado "dono" do CRM-10: num negócio do `staff` (`novoNegocio(p, staffId, staff)`), o `staff` confirma, com `answered_by = staffId`, e depois refaz.
    4. Clique duplo (foco 4): duas confirmações ao mesmo tempo (`Promise.all`, como `ganho.test.ts:356-367`). Uma passa, a outra é recusada com "A forma está confirmada…", e há **uma** resposta. Salvar com a forma confirmada também é recusado.
    5. Refazer:
       - `staff`, que não é dono, é recusado;
       - a gestão volta a forma para `rascunho`, a resposta continua lá e o histórico ganha "Forma de pagamento refeita";
       - refazer de novo, em rascunho: "A forma não está confirmada.";
       - confirmar outra vez deixa **duas** respostas.
    6. A prova não se forja: pela API do `parceiro`,
       - o `insert` em `payment_plan_responses`, com cada um dos três `decision`, dá erro;
       - `update payment_plans set status = 'confirmada'` dá erro;
       - `update … set charges_created_at = now()` dá erro;
       - o `insert` direto em `payment_plans`, num negócio sem forma, dá erro;
       - o `delete` em `payment_plans` devolve 0 linhas, e a forma e a resposta continuam;
       - `insert`, `update` e `delete` em partes e parcelas dão erro;
       - `update` e `delete` em respostas devolvem 0 linhas, e a resposta não muda;
       - `insert` em `receivables` com `payment_plan_part_id` preenchido, e `update` que o preenche numa cobrança manual, dão erro com a frase do P13. A cobrança manual nasce numa pessoa descartável só deste caso, promovida pela gestão (a cobrança a torna cliente e grava histórico), e apagada no fim.
    7. Cotação:
       - com a forma `confirmada`, `update payment_plans set reference_rate = 5.425, reference_rate_note = 'C6, hoje'` funciona, e a cópia não muda;
       - `reference_rate = 0` e uma anotação com 201 caracteres dão erro (`check`);
       - `reference_rate = null` funciona (limpar).
    8. Vistos travados:
       - com a forma `confirmada`, `insert`, `update` e `delete` em `opportunity_items` são recusados com a frase dos vistos;
       - depois de Refazer, passam;
       - um visto descartável (`novoVisto`) usado num item, com a forma confirmada: apagá-lo em `visa_types` funciona, e o item fica com `visa_type_id` nulo.
    9. Negócio encerrado: o negócio é posto em `status = 'lost'` e na etapa de perda, por `update` direto, que a 0054 deixa. Salvar, confirmar e refazer são recusados com a frase de encerrado, e a cotação ainda muda.
    10. Excluir:
        - o negócio com resposta, mesmo depois de Refazer, é recusado com a frase, e o negócio continua;
        - o negócio só com forma em rascunho se apaga, e a forma some.
    11. Portal (P7): num negócio novo do "Cliente de Teste", criado pelo `parceiro`, com a forma em rascunho, o `cliente` lê 0 linhas de `payment_plans`, partes, parcelas e respostas. Em `finally`, o `parceiro` apaga esse negócio, e o teste **falha** se o delete não apagou exatamente 1 linha. O ledger registra que a resposta não é provada aqui pelo portal (P7); o caso 13 a prova para outra organização.
    12. Apagar a pessoa descartável com a forma confirmada e com resposta funciona, e o `parceiro` passa a ler 0 formas daquele negócio.
    13. A organização A não vê a B. Com o padrão de `ganho.test.ts:520-528`, o `colaborador` da Duli, diante de uma forma confirmada do parceiro:
        - lê 0 linhas de `payment_plans`, partes, parcelas e respostas;
        - o `update` da cotação devolve 0 linhas;
        - as três funções devolvem "Negócio não encontrado.".
- [ ] `bun x vitest run tests/rls/forma-de-pagamento.test.ts`. Esperado: FALHA (`relation "payment_plans" does not exist` ou função inexistente).
- [ ] Escrever a 0058, com o comentário do topo explicando: a forma só pelas funções, a prova imutável, a trava dos vistos até as cobranças e o P6. A tarefa fica inteira, sem dividir: as travas só se provam com uma forma, e a forma só nasce pelas funções.
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
  - `src/features/opportunities/actions.test.ts:160-167`: o `RESUMO` simulado ganha `forma` (`situacao: "sem_forma"`, o resto nulo ou vazio), senão "simula o Ganho" e "ganha pela função" caem com o esquema novo;
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
  partes: z.array(z.object({ id: z.string(), label: z.string(), method: z.enum(METODOS),
                             currency: z.enum(["BRL", "USD"]), total: z.number(), installments_count: z.number().int(),
                             parcelas: z.array(z.object({ number: z.number().int(), amount: z.number(), due_on: z.string() })) })),
}),
cobrancas: z.array(z.object({ id: z.string().nullable(), titulo: z.string(),
                              moeda: z.enum(["BRL", "USD"]), total: z.number(), parcelas: z.number().int() })),
```

- **SQL:**
  - `private.forma_do_ganho(p_negocio uuid) returns jsonb`, `security invoker`, com `revoke … from public, anon` e `grant` a `authenticated` (em `private`, a execução padrão é de `public`). Devolve `{ forma, cobrancas }`:
    - as partes de `forma` levam o `id` da parte;
    - cada cobrança leva `parte` (o id da parte), sem `id` de cobrança, na ordem das partes;
    - a situação vem nesta precedência: `charges_created_at` preenchido → `cobrancas_criadas`; sem linha → `sem_forma`; senão, o `status`;
    - as cobranças só aparecem com `confirmada`;
    - `confirmada_em` e `confirmada_por` vêm da última resposta (`order by answered_at desc limit 1`).
  - **Títulos:** "‹label› — ‹vistos›", com os `visa_name` dos itens em `order by position, created_at` (foco 5), separados por ", ".
- **`ganhar_negocio`**, com `create or replace` e a mesma assinatura:
  - **na simulação:** devolve `forma` e `cobrancas` de `private.forma_do_ganho`;
  - **na gravação,** depois do passo (6):
    - `perform … from payment_plans where opportunity_id = p_negocio for update`;
    - lê `private.forma_do_ganho`;
    - se a situação é `confirmada`, liga `via_forma`;
    - itera **o mesmo** `jsonb` de `cobrancas` que `forma_do_ganho` devolveu, e não uma segunda leitura das tabelas. Por item, faz `insert` em `receivables` (organização e pessoa do negócio, `project_id` nulo, `created_by = v_eu`, `payment_plan_part_id = parte`) e em `installments` (as parcelas daquela parte em `forma`, com o `method` dela);
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
  6. Refazer e confirmar de novo, antes do Ganho: `forma.confirmada_por` e `confirmada_em` saem da **segunda** resposta.
  7. Negócio ganho:
     - com a forma em rascunho, salvar e confirmar são recusados com a frase de encerrado;
     - com as cobranças criadas, a cotação ainda muda pela API (FIC-11, "inclusive com o negócio ganho").
  8. Itens com a mesma `position` (os dois com 0): o título sai na ordem de criação (foco 5).
- [ ] **Testes** em `forma-regras.test.ts`, para `avisosDoResumo`, com um resumo montado à mão:
  - `confirmada` com uma parcela ontem e coerência ok: `["1 parcela já vencida"]`;
  - `rascunho` com uma parcela ontem e US$ 13.000 contra US$ 14.000: só o aviso de coerência (P15);
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
  - `src/features/people/montagem.ts:48` e o teste dele;
  - `src/components/perfil/timeline.tsx:39-61` e `src/features/people/timeline-queries.ts:7-18`.

**Interfaces:**
- Consome `formaSchema`, `observacaoSchema` e `cotacaoSchema` (T2), e as funções da 0058.
- Produz:

```ts
export async function salvarFormaDePagamento(anterior: ActionState, formData: FormData): Promise<ActionState>;
// campos: negocio (uuid), forma (JSON de FormaParaSalvar). Inválido → falhou(primeira frase do zod), sem chamar o banco.
export async function confirmarFormaPelaEquipe(anterior: ActionState, formData: FormData): Promise<ActionState>;
// campos: negocio, observacao
// observação vazia → a chamada não leva p_observacao (o tipo gerado não aceita null; como actions.ts:88)
export async function refazerFormaDePagamento(anterior: ActionState, formData: FormData): Promise<ActionState>; // campo: negocio
export async function salvarCotacao(formData: FormData): Promise<ActionState>;
// campos: plano (uuid), negocio (uuid), e reference_rate (cotacaoSchema) OU reference_rate_note
// (anotacaoDaCotacaoSchema) — o name do InlineText
```

  - Todas usam `contextoAtual()`, `traduzirErro`, `gravou()`/`falhou()` e `revalidatePath(`/crm/${negocio}`)`. Confirmar e refazer também chamam `revalidarPessoa(pessoaId)` (`@/lib/revalidar`), por causa do histórico no perfil do cliente: o campo escondido `pessoa` vai junto.
  - **`obterNegocio`** passa a devolver também:

    ```ts
    forma: {
      id, status, reference_rate, reference_rate_note, charges_created_at,
      partes: ParteDaForma[] (por position, parcelas por number),
      ultimaResposta: { answered_at, answered_by_name, reason } | null,
    } | null
    ```

    Vem embutida no mesmo `select`. O PostgREST a devolve como **lista**, porque o único é só `(opportunity_id)` e a chave é composta: ler `forma[0] ?? null`. `ultimaResposta` é a de maior `answered_at`. `method` e `currency` se estreitam com `METODOS` e a lista de moedas, sem `as`. O tipo sai como `export type FormaDoNegocio`, usado pelo T6.
  - **`TIPOS_DO_SISTEMA`** ganha `"forma_de_pagamento"`. O tipo também entra em `LABELS` e `ICONS` (`src/components/perfil/timeline.tsx:39-61`, rótulo "Forma de pagamento", ícone `Wallet`) e em `ACTIVITY_LABELS` (`src/features/people/timeline-queries.ts:7-18`), senão o histórico mostra "Registro".

- [ ] **Testes primeiro.** Cliente Supabase simulado, como em `itens-actions.test.ts`:
  - `salvarFormaDePagamento` com uma forma de soma errada não chama `rpc` e devolve a frase;
  - com uma forma válida, chama `rpc("salvar_forma_de_pagamento", { p_negocio, p_forma })` com o objeto validado;
  - um erro `P0001` do banco volta como a frase;
  - `confirmarFormaPelaEquipe` com observação vazia chama o `rpc` **sem** `p_observacao`;
  - `obterNegocio` com a forma em lista de 1 devolve o objeto, e com lista vazia devolve `null`;
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

**Datas (foco 3):** `due_on` é dia e se mostra com `formatarDia` (`@/lib/formatar`). `answered_at` e `charges_created_at` são instantes e se mostram com `formatarData`. Vale para o cartão, a janela e o resumo (T7).

**O cartão:**
- **Sem forma, negócio aberto:** `EmptyState` com o botão "Definir forma de pagamento", que abre a janela.
- **Sem forma, negócio encerrado:** `EmptyState` sem botão ("Sem forma de pagamento.").
- **Com forma:**
  - selo "rascunho" ou "confirmada";
  - uma linha por parte: "‹rótulo› · ‹método› · ‹n› × ‹valor› · ‹datas›", ou "‹rótulo› · ‹método› · ‹valor› · ‹data›" com 1 parcela;
  - "Total: " + `totalDaForma`;
  - **só com `status = 'confirmada'`:** "Confirmada pela equipe em ‹data›, por ‹nome›", da `ultimaResposta`, e a observação entre aspas, quando há. Em rascunho, depois de Refazer, a linha não aparece;
  - a cotação em dois `InlineText` com `required={false}` (o padrão é obrigatório, e o campo vazio voltaria ao valor antigo): `reference_rate` com `inputMode="decimal"` e `reference_rate_note`, em qualquer estado.
- **Botões:**
  - rascunho e negócio aberto: "Editar", e "Confirmar pela equipe" só com `podeConfirmar`;
  - confirmada, negócio aberto, sem cobranças: "Refazer" só com `podeConfirmar`. É um `FormDialog` com `salvar="Refazer"` e `pendente="Refazendo..."`, gatilho com o ícone `RotateCcw`, o texto "A forma volta para rascunho. A confirmação de ‹data› continua registrada." e a ação `refazerFormaDePagamento`. Não é `ConfirmAction`, que tem o visual de excluir;
  - encerrado, ou com `charges_created_at`: só leitura;
  - com `charges_created_at`: "Cobranças criadas no Ganho em ‹data›", ligado a `enderecoDaPessoa(pessoaId, "client", "financeiro")`.
- **Os diálogos de confirmar e refazer** levam os campos escondidos `negocio` e `pessoa` (a T5 revalida a pessoa).
- **"Confirmar pela equipe"** é um `FormDialog`: o resumo das partes, o `avisoDeCoerencia` quando há, e um `Textarea` com `name="observacao"` e `maxLength` 500.

**A janela:**
- `FormDialog` com `acao={exigeFormaValida(salvarFormaDePagamento)}` (P12). O embrulho lê o `forma` escondido e, se `erroDaForma` não for nulo, devolve `falhou(erro)` sem chamar o servidor. O estado das partes fica no cliente, e um `<input type="hidden" name="forma">` leva o JSON.
- **Cabeçalho:** os vistos e os totais por moeda (`somarItensPorMoeda`).
- **Botões de parte:** "+ Entrada", "+ Parcelas", "+ Cartão" e "+ À vista", com `parteSugerida` e `moedaSugerida`. Com 10 partes, ficam desabilitados.
- **Cada parte:**
  - campos de rótulo, método (`METODOS` e `ROTULO_DO_METODO`), moeda, total, número de parcelas (fora do cartão) e 1ª data;
  - mudar o total, o número, a 1ª data ou o método chama `comParcelasGeradas`. O campo guarda o que se digita, mesmo vazio ou inválido: as parcelas somem e a frase aparece, sem derrubar a janela (foco 2);
  - parte de 1 parcela, e todo cartão: só o valor e uma data, sem a lista;
  - cada parcela tem a data e o valor editáveis;
  - o `erroDaParte` aparece junto da parte;
  - um botão "remover".
- **Rodapé:** "Total da forma: " + `totalDaForma`, e o aviso de coerência, se houver.
- **Salvar** continua clicável (P12). Com erro, a frase aparece no rodapé, e nada vai ao servidor.
- **No celular:** as partes empilham, e cada parcela é uma linha com data e valor (`grid-cols-[auto_1fr_1fr]`), sem largura fixa.

**A página:**
- O cartão vai logo abaixo do card Negócio, na coluna da esquerda.
- `daGestaoDe` passa a ser consultado sempre, e não só com o negócio ganho.
- `podeConfirmar` é `negocio.owner_id === user.id || daGestao`.
- `Vistos` recebe `travadaPelaForma`, que vale `forma?.status === "confirmada" && !forma.charges_created_at`. Travada, ela esconde acrescentar, editar e remover, e mostra a frase dos vistos.

- [ ] **Testes primeiro.**
  - **Cartão:**
    - sem forma e aberto, mostra "Definir forma de pagamento"; sem forma e encerrado, não mostra botão;
    - com a forma do critério, mostra as 2 linhas e `totalDaForma`, e a parcela com `due_on: "2026-12-10"` aparece como "10/12/2026", escrito à mão no teste (foco 3);
    - "Confirmar pela equipe" aparece só com `podeConfirmar` e em rascunho;
    - "Refazer" aparece só confirmada, sem `charges_created_at` e com `podeConfirmar`;
    - em rascunho com `ultimaResposta` preenchida (depois de Refazer), não aparece "Confirmada pela equipe";
    - com `charges_created_at`, mostra "Cobranças criadas no Ganho em …" com `href` `/clientes/<id>?aba=financeiro`, sem Refazer;
    - com o negócio encerrado, sem Editar; a cotação continua editável e não é obrigatória;
    - a confirmação com partes de US$ 13.000 e vistos de US$ 14.000 mostra o aviso de coerência.
  - **Janela:**
    - "+ Parcelas" gera 3 parcelas;
    - mudar o total para 9000 regera 3 × 3000;
    - apagar o número de parcelas não derruba a janela: as parcelas somem e a frase aparece; digitar "12" gera 12 (foco 2);
    - trocar o método de uma parte "Parcelas" para cartão a deixa com 1 parcela (foco 2);
    - editar uma parcela para 2999,99 mostra a frase da soma; clicar Salvar mostra a frase e **não** chama a ação (P12);
    - "+ Cartão" não mostra número de parcelas;
    - com 10 partes, os botões ficam desabilitados;
    - US$ 13.000 contra vistos de US$ 14.000 mostra o aviso de coerência; R$ e US$ mostram os dois totais, sem aviso;
    - Salvar com a forma válida chama a ação com `forma` levando o JSON das partes.
  - **Vistos:** com `travadaPelaForma`, não há "Acrescentar visto" e aparece a frase; com `false` e o negócio aberto, há.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar, com os componentes do `AGENTS.md` (`FormDialog`, `EmptyState`, `InlineText`), os tokens e os raios.
- [ ] Rodar os testes de `src/app/(app)/crm/[id]`. Esperado: verde.
- [ ] Commit `feat(crm): forma de pagamento no lead (entrega 4a)`.

### T7 O resumo do Ganho com a forma (CRM-14)

**Arquivos:** mexer em `src/app/(app)/crm/dialogos.tsx:143-195` e `dialogos.test.tsx` (linhas 33, 51 e 56, os fixos de hoje).

**Interfaces:** consome `ResumoDoGanho` com `forma` e `cobrancas` (T4), e `avisosDoResumo` e `totalDaForma` (T2/T4).

**O trecho "Forma de pagamento"**, pela §5.4 do desenho:

| Situação | O que mostra |
|---|---|
| `confirmada` | "Confirmada pela equipe em ‹data›, por ‹nome›" (`formatarData`) e uma linha por parte, com as datas por `formatarDia` |
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
  - `confirmada` com uma parcela de ontem (a data calculada no teste a partir de `hojeEmSaoPaulo()`): "1 parcela já vencida" na lista "Ao confirmar".
  - `confirmada` com partes de US$ 13.000 e vistos de US$ 14.000: o aviso de coerência.
  - A parcela com `due_on: "2026-12-10"` aparece como "10/12/2026" (foco 3).
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
- [ ] Registrar no ledger a conferência do espelho (desenho §6): `receivables` desce por `select("*")`, e o Dexie guarda a coluna nova sem mudar o esquema local nem o `sync_manifesto`; as lápides das tabelas novas, fora do espelho, são filtradas (`espelho.ts:93-96`).
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

  Dizer também que, no banco, a frase da soma errada não leva os valores (P11): a tabela §5.6 do desenho continua valendo para a tela. Lembrar a troca da senha do banco que vazou.

## Verificação

- **Por tarefa:** o teste vermelho visto, depois verde.
  - Unidade: `bun x vitest run <arquivo>`.
  - RLS: `bun x vitest run tests/rls/<arquivo>`, e mais de um arquivo com `--no-file-parallelism`.
- **Antes de cada commit de banco:** `bun run verify` (tipos, lint, unidade e RLS).
- **No fim:** `bun run build`, a fumaça local, e o CI verde depois do push. Depois do deploy, `/api/versao` com o commit.
- **No banco**, depois da 0058, só leitura:
  - o aviso "definer executável por anon" do Supabase (`get_advisors`) continua aparecendo só para as duas funções da ficha;
  - `select count(*) from payment_plans` é 0 fora da organização de teste.
