# Entrega 4b — a forma de pagamento vai pelo link e o cliente responde — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (nativo, como nas entregas anteriores) ou superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`). TDD em todo passo de código.

**Objetivo:** no lead, a equipe envia a forma de pagamento pelo link da ficha. O cliente preenche os dados, vê a forma (com o dólar de onde veio a parte em reais) e responde Confirmo ou Há algo errado. A recusa volta para a equipe ajustar, e a Início avisa do que pede ação.

**Arquitetura:**
- **Banco primeiro, em duas migrations** com teste de RLS vermelho antes (P1):
  - 0064, o lado da equipe: a conversão, o link com a forma, as travas, o envio, Editar/Cancelar/Ajustar e o negócio que fecha;
  - 0065, a porta do anônimo: abrir, enviar a ficha e responder.
- As duas são compatíveis com o código no ar: até o deploy não existe link com a forma, a chamada de hoje de `voltar_forma_para_rascunho` continua valendo pelo padrão do parâmetro novo, e as chaves novas de `forma_do_ganho` passam pelo esquema de hoje, que não é estrito. Por isso há **um push só**, no fim.
- **Telas.** O lead continua lendo do servidor. A forma vai e volta por Server Actions, que chamam as funções do banco. A ficha pública chama a função anônima pelo `clienteAnonimo`. A prévia do envio e a ficha desenham a forma com **o mesmo componente**, a partir do mesmo formato que o banco guarda como prova.

**Tecnologia:** Next.js 16 (App Router, Server Actions), Supabase Postgres com RLS, zod 4, vitest com jsdom e @testing-library, bun.

**Spec:**
- desenho: `docs/superpowers/specs/2026-11-23-entrega-4b-link-da-forma-design.md`. As §5 (regras), §6 (banco), §7 (telas) e §8 (critério de aceite) são o requisito;
- o que ele não diz: o desenho da 4a (`2026-11-21-entrega-4a-forma-de-pagamento-design.md`) e a §6.4 de `2026-11-17-contato-oportunidade-cliente-design.md`;
- requisitos: `docs/spec.md`, FIC-1, FIC-7 a FIC-13, INI-4, INI-8, CRM-14 e REC-6.

## Restrições globais

- Valem as restrições globais do plano da 4a (`docs/superpowers/plans/2026-11-21-entrega-4a-forma-de-pagamento.md`, "Restrições globais"): `bun`, banco que é produção, migration pelo conector com o arquivo, os tipos e o `docs/banco.md` no mesmo commit, `revoke`/`grant`, marcas, travas, hoje no banco, gestão, CRM-10 e dinheiro.
- **O nome** (desenho §1, "O nome, para não confundir"): o app não gera link de pagamento — o do C6 o Renato gera à mão. Na tela é sempre "link da ficha"; no código e nos comentários, "link com a forma" (`payment_plan_id` preenchido ou `mode = 'so_pagamento'`). A expressão "link de pagamento" não entra em frase, comentário nem nome.
- **A porta sem login** (`AGENTS.md`): token de 256 bits gerado no servidor, uso único e prazo, linha travada antes de gravar, lista fechada do que entra, só `anon` executa, e o app chama pelo `clienteAnonimo`, sem cookie. Nenhuma policy `to anon`. Função anônima: `security definer`, `set search_path = ''`, `revoke execute … from public, anon, authenticated` e `grant execute … to anon`.
- **Marcas novas:** `dulihub.via_ficha`, ligada e conferida como a `via_forma`. Quem liga as duas dentro de gatilho **guarda o valor anterior e o devolve** no fim, em vez de desligar (P15).
- **A ordem das travas:** negócio, depois forma, depois link. A função anônima começa pelo token só para achar o negócio, sem travar; trava na ordem e confere tudo de novo.
- **Versão da forma:** é o `payment_plans.updated_at`, e a tela a devolve **como leu**, em texto. `new Date()` perde os microssegundos, e o envio seria recusado sempre (foco 1).
- **Datas:** `due_on` é dia (`formatarDia`); `answered_at`, `created_at` e `expires_at` são instantes (`formatarData`). O último dia do link sai de `expires_at` por `ultimoDiaDoLink` (P13).
- **Frases fixas**, cópia exata. As da 4a continuam valendo; estas são as novas ou as que mudam:

  | Situação | Frase |
  |---|---|
  | Vistos com a forma enviada | "A forma de pagamento foi enviada ao cliente. Use Editar para mudar os vistos." |
  | Salvar ou enviar com a forma enviada | "A forma foi enviada ao cliente. Use Editar para mudar." |
  | Salvar, enviar ou confirmar com a forma recusada | "O cliente recusou a forma. Use Ajustar para mudar." |
  | Enviar sem visto ou sem parte | "Acrescente pelo menos um visto e uma parte antes de enviar." |
  | Outro link com a forma aberto | "Há um link da ficha aberto no negócio ‹título›. Cancele-o antes de enviar outro." |
  | Link novo da ficha com link com a forma aberto (P7) | "Há um link da ficha aberto no negócio ‹título›. Cancele-o no negócio antes." |
  | Excluir negócio com link com a forma aberto | "Cancele o link da ficha antes." |
  | Parte em outra moeda com conversão | "Só a parte em reais é convertida de dólar." |
  | Conversão zero, negativa ou NaN (P10) | "Informe de quantos dólares ‹rótulo› foi convertida." |
  | Conversão acima do limite, ou com mais de 2 casas (P10) | as frases da 4a: "O valor de ‹rótulo› passa do limite." e "Use no máximo 2 casas decimais em ‹rótulo›." |
  | Link vencido, para o cliente | "Este link expirou. Peça um novo à ‹organização›." |
  | Depois de Confirmo | "Obrigado! A ‹organização› vai preparar o seu contrato e enviar para assinatura." |
  | Depois de Há algo errado | "Recebemos. A ‹organização› vai rever a forma de pagamento e enviar um novo link." |
  | A forma mudou entre a tela e o clique | "A forma de pagamento mudou enquanto você olhava. Atualize a página." |
  | Mexer direto num link com a forma pela API | "Mude o link da ficha pela tela do negócio." |
  | Qualquer recusa de `responder_forma_de_pagamento` por estado do link | "Este link não está mais disponível." |
  | Motivo com mais de 500 caracteres (P9) | "O motivo vai até 500 caracteres." |
  | Link `so_pagamento`, no topo (P9) | "Seus dados já foram recebidos ✓" |
  | Ficha com forma, no topo (P9) | "Passo 1 de 2" e, no pagamento do modo `completa`, "Passo 2 de 2" |

- **Histórico** (tipo `forma_de_pagamento`): "Forma de pagamento enviada ao cliente", "Forma de pagamento confirmada pelo cliente", "Forma de pagamento recusada pelo cliente: ‹motivo›" (sem o ": ‹motivo›" quando vazio), "Forma de pagamento editada; o link enviado foi cancelado", "Forma de pagamento ajustada", "Link da ficha cancelado: o negócio foi encerrado". "Forma de pagamento refeita" e "… confirmada pela equipe" continuam.

## Decisões deste plano

Cada uma é um desvio do desenho ou um detalhe que ele deixou com quem constrói.

| # | Decisão | Por quê | Custo se errada |
|---|---|---|---|
| P1 | Duas migrations, 0064 (equipe) e 0065 (porta do anônimo). O desenho falava de uma | A porta anônima é a peça de segurança e merece uma revisão só para ela. As duas são compatíveis com o código no ar | Nenhum |
| P2 | `private.copia_da_forma(p_negocio uuid) returns jsonb` monta a cópia (`{ vistos, partes }`, com `usd_equivalent`), e é a mesma para a confirmação da equipe, a resposta do cliente e o `forma` que `abrir_ficha_de_cadastro` devolve | O que o cliente vê e o que a prova guarda saem da mesma função: não têm como divergir | Nenhum |
| P3 | `forma_do_ganho` ganha `ultima_decisao` e `enviada_em`. `confirmada_em` e `confirmada_por` continuam, como a data e o nome da última resposta, também na recusa | Renomear quebraria o resumo do código no ar entre a migration e o deploy | Nome menos claro num campo interno |
| P4 | Editar (com a forma enviada) e Cancelar link chamam a mesma função (`p_de => 'enviada'`) e gravam o mesmo histórico. Editar não abre a janela sozinho: a forma volta a rascunho, e a janela fica a um clique | O desenho lhes dá o mesmo efeito e a mesma frase de histórico (§5.10). Abrir a janela depois de uma ação de servidor pediria estado a mais no cartão | Um clique a mais |
| P5 | Depois de "Confirmar e gerar link", o diálogo fecha e o cartão mostra o link, com Copiar link e WhatsApp | O `FormDialog` fecha no `ok`, e o cartão com a forma enviada já tem os dois botões | Nenhum |
| P6 | O selo da forma confirmada é só "confirmada". Quem confirmou vai na linha abaixo: "Confirmada pelo cliente em ‹data›" ou "Confirmada pela equipe em ‹data›, por ‹nome›" | O selo com a frase inteira não cabe no cabeçalho do cartão no celular | Nenhum |
| P7 | O gatilho de `registration_forms` recusa o **insert** de link comum quando a pessoa tem link com a forma aberto, com a frase e o título. `gerarLink` cancela só links comuns abertos | A frase vale também pela API, sem uma conferência a mais em TypeScript | Nenhum |
| P8 | No contato, com link com a forma aberto, "Dados cadastrais" mostra "Link da ficha enviado com a forma do negócio ‹título›", com link para o lead, e **sem** Cancelar. `cancelarLink` passa a filtrar `payment_plan_id is null` | O desenho deixou com quem constrói (§11). Cancelar pela função da forma no contato duplicaria o cartão do lead | Um clique a mais para cancelar |
| P9 | Frases que o desenho não fixou: as marcadas "(P9)" na tabela acima | São do formulário, e o teste precisa de texto exato | Texto a ajustar |
| P10 | A conversão é conferida logo depois do total, nesta ordem: moeda (só BRL) → maior que zero → limite → 2 casas. `null` é "sem conversão" | A ordem precisa ser a mesma na tela e no banco | Nenhum |
| P11 | O teste do portal envia com `p_pedir_dados_de_novo => true`. Na limpeza: Cancelar link, apagar o negócio (o `set null` tira o `payment_plan_id` do link) e apagar o link, que virou link comum | O "Cliente de Teste" nunca é apagado. Com o modo `so_pagamento`, o link ficaria preso nele para sempre | Nenhum |
| P12 | "Pedir os dados pessoais de novo" só aparece quando a pessoa já mandou alguma ficha (`fichaRecebida` não nula) | É o único caso em que o padrão seria `so_pagamento` | Nenhum |
| P13 | A tela não conta dias úteis. O último dia sai de `expires_at` (`ultimoDiaDoLink`: o dia de São Paulo de `expires_at` menos 1 ms). O teste de RLS calcula o esperado à parte, como oráculo | A regra fica num lugar só, o banco | Nenhum |
| P14 | "Este link expirou…" só no link com forma. O link comum vencido continua com a frase de hoje | O desenho só fixou a do link com a forma | Nenhum |
| P15 | O gatilho do negócio que fecha guarda as marcas `via_forma` e `via_ficha` e as devolve no fim | Ele roda dentro do `ganhar_negocio`, que liga `via_forma` depois. Desligar à força quebraria quem chamou | Nenhum |
| P16 | Com Confirmo, o motivo é ignorado (`reason` nulo) | Motivo só faz sentido na recusa | Nenhum |
| P17 | A versão cobre a forma, não os vistos. Os vistos travam a partir do envio | Pôr os vistos na versão pediria um gatilho a mais em `opportunity_items`. O risco é só entre duas pessoas da equipe, na mesma hora, antes do envio | Um envio com um visto que o remetente não viu na prévia |
| P18 | `alertasDoDia` ganha `agora: Date` (padrão `new Date()`). O link vencido compara instantes, e `hoje` é um dia | O aviso do link vencido muda no meio do dia | Nenhum |

## Foco da revisão

Cada item tem teste na tarefa dona.

1. **A versão com microssegundos.** `updated_at` vem do PostgREST como `"2026-11-23T14:02:11.123456+00:00"`. A prévia devolve esse texto igual, e o envio passa. Passar por `new Date().toISOString()` cortaria em milissegundos, e todo envio cairia em "mudou enquanto você olhava" (T3, T5).
2. **Trocar a moeda de R$ para US$ com "Convertido de US$" preenchido.** O campo some, e o valor vira `null` junto. Sem isso, a parte em US$ levaria uma conversão escondida e o salvar recusaria com uma frase sobre um campo que a pessoa não vê (T7).
3. **O dia do envio em São Paulo, não em UTC.** Enviado na segunda às 22h de São Paulo (terça, 01h UTC), o link vale até quinta, e não até sexta. `fim_do_prazo_em_dias_uteis('2026-11-24 01:00+00', 3)` dá `2026-11-27 03:00+00`, e `ultimoDiaDoLink` desse valor dá `2026-11-26` (T2, T3).
4. **Confirmo em duas abas.** Duas respostas ao mesmo tempo: uma grava, a outra recebe "Este link não está mais disponível.", e fica **uma** resposta. Cancelar link chegando depois do Confirmo dá "mudou enquanto você olhava", e a confirmação fica (T3, T4).
5. **Motivo só com espaços, ou com 501 caracteres.** Só espaços vira `null`, e o histórico não leva ": ". 501 é recusado pelo banco com a frase (P9), e a tela limita a 500 (T4, T8).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/forma-do-cliente.ts` (+ `.test.ts`) | O formato da forma como o cliente vê, o esquema zod dele, `valorComConversao` e `formaParaOCliente` |
| `src/components/forma-de-pagamento-do-cliente.tsx` (+ teste) | O desenho da forma, igual na prévia e na ficha |
| `src/features/opportunities/forma-regras.ts`, `forma-schema.ts`, `montagem.ts` | A conversão; `estadoDaForma`; a forma lida com versão, link aberto e decisão |
| `src/features/opportunities/forma-actions.ts` | Enviar; voltar para rascunho (Editar, Cancelar link, Ajustar, Refazer) |
| `src/features/opportunities/queries.ts`, `schema.ts` | `obterNegocio` com o link; o quadro com `closed_at`; o resumo do Ganho |
| `src/features/cadastro/regras.ts`, `queries.ts`, `actions.ts` | A ficha recebida e o link atual separados (I4); o prazo e a mensagem do link com forma |
| `src/features/cadastro/publico-queries.ts`, `publico-actions.ts` | A ficha pública com a forma; `responderForma` |
| `src/lib/formatar.ts` | `formatarDiaDaSemana` |
| `supabase/migrations/0064_forma_enviada.sql` | O lado da equipe |
| `supabase/migrations/0065_porta_do_pagamento.sql` | A porta do anônimo |
| `supabase/provas/link-de-pagamento.sql` | Os dias úteis com datas fixas e o link vencido, que a API não alcança |
| `tests/rls/forma-enviada.test.ts`, `tests/rls/porta-do-pagamento.test.ts` | O banco |
| `tests/ficha-de-teste.ts` | `fichaCompleta`, `ACEITE` e `anonimoDeTeste()` (o cliente sem sessão), saídos de `tests/rls/ficha-de-cadastro.test.ts:26-71` para a fumaça usar também |
| `src/components/perfil/dados-cadastrais.tsx`, `src/app/(app)/crm/page.tsx` | I4 no contato, no lead e no quadro |
| `src/app/(app)/crm/[id]/forma-de-pagamento.tsx`, `janela-da-forma.tsx`, `enviar-ficha.tsx`, `vistos.tsx`, `page.tsx` | O cartão por estado, a conversão na janela, a prévia, a trava |
| `src/app/cadastro/[token]/page.tsx`, `ficha-publica.tsx`, `etapa-do-pagamento.tsx` | A ficha pública com o pagamento |
| `src/app/(app)/crm/dialogos.tsx` | O resumo do Ganho com `enviada` e `recusada` |
| `src/features/painel/queries.ts`, `regras.ts`, `src/app/(app)/alertas.tsx` | Os três avisos da Início |

---

### Task 1: A conversão e a forma como o cliente vê (FIC-13)

**Arquivos:**
- Criar: `src/lib/forma-do-cliente.ts`, `src/components/forma-de-pagamento-do-cliente.tsx` e os testes.
- Mexer: `src/features/opportunities/forma-regras.ts`, `forma-schema.ts`, `montagem.ts` e os testes.

**Interfaces** (produz):

```ts
// src/lib/forma-do-cliente.ts
export type ParteParaOCliente = {
  label: string; method: Metodo; currency: "BRL" | "USD"; total: number;
  usd_equivalent: number | null;
  parcelas: { number: number; amount: number; due_on: string }[];
};
export type FormaParaOCliente = {
  vistos: { visa_name: string; amount: number; currency: string }[];
  partes: ParteParaOCliente[];
};
export const formaParaOClienteSchema; // zod do jsonb de private.copia_da_forma (as chaves que sobram são ignoradas)
export function valorComConversao(total: number, currency: "BRL" | "USD", usdEquivalent: number | null): string;
// com conversão: formatarMoeda(usd, "USD") + " convertidos para " + formatarMoeda(total, "BRL")
export function formaParaOCliente(
  itens: { visa_name: string; amount: number; currency: string }[],
  partes: ParteParaOCliente[],
): FormaParaOCliente; // a prévia monta com isto o mesmo formato que o banco guarda
```

```tsx
// src/components/forma-de-pagamento-do-cliente.tsx
export function FormaDePagamentoDoCliente(props: { forma: FormaParaOCliente }): React.ReactNode;
```

- `ParteDaForma` (forma-regras) ganha `usd_equivalent: number | null`. `parteSugerida` o põe `null`.
- `erroDaParte` confere a conversão depois do total (P10).
- `linhaDaParte` usa `valorComConversao` no lugar do valor da parte. Com mais de uma parcela, fica "‹rótulo› · ‹método› · ‹valorComConversao› · ‹n› × ‹parcela› · ‹datas›".
- `parteSchema` ganha `usd_equivalent: z.number().nullable()`, com a frase de formato para o tipo errado.
- O `linhaSchema` de `montagem.ts` ganha `usd_equivalent`, e o `select` de `obterNegocio` (T5) o lê.

- [ ] **Testes primeiro.**
  - `valorComConversao(21527.76, "BRL", 3900)` é `formatarMoeda(3900, "USD") + " convertidos para " + formatarMoeda(21527.76, "BRL")`, ou seja, "US$ 3.900 convertidos para R$ 21.527,76". Sem conversão, é igual a `formatarMoeda`.
  - `erroDaParte`, parte "Cartão" em BRL 21527.76:
    - `usd_equivalent` 3900: `null`;
    - em USD com 3900: "Só a parte em reais é convertida de dólar.";
    - 0, -1 e `NaN`: "Informe de quantos dólares Cartão foi convertida.";
    - `10000000000`: "O valor de Cartão passa do limite.";
    - `3900.005`: "Use no máximo 2 casas decimais em Cartão.";
    - rótulo vazio **e** conversão em USD: a frase do rótulo (a ordem).
  - `linhaDaParte` da parte convertida, com 1 parcela em `2026-12-15`, contém "US$ 3.900 convertidos para R$ 21.527,76" e "15/12/2026".
  - `formaSchema` com `usd_equivalent: "abc"`: "A forma de pagamento veio num formato inválido.".
  - `formaParaOClienteSchema` lê o formato da cópia com uma chave a mais (`id`) e falha sem `partes`.
  - **Componente:** com os vistos EB-2 NIW US$ 6.000, a parte "Entrada", transferência, US$ 2.100 em `2026-12-10`, e a parte "Cartão", cartão, R$ 21.527,76 de US$ 3.900 em `2026-12-15`:
    - mostra "EB-2 NIW", o total por moeda dos vistos, "Entrada · Transferência", "Cartão · Cartão", "US$ 3.900 convertidos para R$ 21.527,76", "10/12/2026" e "15/12/2026";
    - uma parte de 3 parcelas mostra cada parcela numa linha, com data e valor;
    - o texto não tem "cotação".
- [ ] `bun x vitest run src/lib/forma-do-cliente.test.ts src/components/forma-de-pagamento-do-cliente.test.tsx src/features/opportunities`. Esperado: FALHA.
- [ ] Implementar. O componente: uma coluna, sem largura fixa. Cada parcela é uma linha `flex justify-between` com a data e o valor, tokens e raios do `AGENTS.md`.
- [ ] Rodar de novo, mais `bun x tsc --noEmit`. Esperado: verde. A janela da 4a ainda não usa o campo novo: as partes dela ganham `usd_equivalent: null`.
- [ ] Commit `feat(crm): a parte em reais diz de quantos dólares veio (FIC-13)`.

### Task 2: As regras do link (puras)

**Arquivos:** mexer em `src/features/cadastro/regras.ts`, `src/lib/formatar.ts` e nos testes. Trocar os usos de `linkVigente` e `situacaoDaFicha` (`src/app/(app)/crm/page.tsx:67`, `src/components/perfil/dados-cadastrais.tsx:51`), e **apagar** as duas.

**Interfaces** (produz):

```ts
// cadastro/regras.ts
export type LinkLido = {
  created_at: string; expires_at: string; cancelled_at: string | null;
  submitted_at: string | null; reviewed_at: string | null; closed_at: string | null;
};
export function fichaRecebida<T extends LinkLido>(links: T[]): T | null;  // o mais recente com submitted_at, cancelado ou não
export function linkAtual<T extends LinkLido>(links: T[]): T | null;      // o mais recente com closed_at e cancelled_at nulos
export function situacaoDoCadastro(links: LinkLido[], agora?: Date): SituacaoDaFicha;
// recebida sem reviewed_at → "recebida"; senão link atual → "expirada" (expires_at <= agora) ou "aguardando";
// senão recebida conferida → "conferida"; senão "sem-link"
export function ultimoDiaDoLink(expiresAt: string): string; // AAAA-MM-DD: diaEmSaoPaulo(expires_at − 1 ms)
export function mensagemDaFormaNoWhatsApp(nome: string, url: string, ultimoDia: string): string;
// "Olá, ‹primeiro›!" / "" / "Para fecharmos o seu contrato, preencha a ficha e confira a forma de pagamento neste link:" / url / "" /
// "O link é só seu e vale até ‹formatarDiaDaSemana(ultimoDia, "longo")›."
// formatar.ts
export function formatarDiaDaSemana(dia: string, estilo: "curto" | "longo"): string; // "qui, 26/11" | "quinta-feira, 26/11"
```

- [ ] **Testes primeiro** (`regras.test.ts`, `formatar.test.ts`):
  - **I4:** com uma ficha recebida em 20/11 sem `reviewed_at` e um link novo, aberto, de 22/11, `fichaRecebida` é a de 20/11, `linkAtual` é a de 22/11 e `situacaoDoCadastro` é "recebida". Com `reviewed_at`, é "aguardando".
  - Um link com `submitted_at` **e** `cancelled_at` (Editar depois dos dados) continua sendo a `fichaRecebida`.
  - Um link `completa` com os dados enviados e o pagamento pendente (`closed_at` nulo) é a `fichaRecebida` e também o `linkAtual`.
  - Sem links: "sem-link". Só um link cancelado, sem dados: "sem-link". Link aberto vencido: "expirada".
  - `ultimoDiaDoLink("2026-11-27T03:00:00+00:00")` é `"2026-11-26"` (foco 3).
  - `formatarDiaDaSemana("2026-11-26", "longo")` é `"quinta-feira, 26/11"`, e `"curto"` é `"qui, 26/11"`.
  - `mensagemDaFormaNoWhatsApp("Ricardo Wiest", url, "2026-11-26")` termina em "O link é só seu e vale até quinta-feira, 26/11." A `mensagemDoWhatsApp` da ficha comum não muda.
- [ ] Rodar `bun x vitest run src/features/cadastro src/lib/formatar.test.ts`. Esperado: FALHA.
- [ ] Implementar e trocar os dois usos. `getBoard` (`src/features/opportunities/queries.ts:97`) passa a ler `closed_at` em `fichas`.
- [ ] Rodar, mais `bun x tsc --noEmit` e `bun x vitest run "src/app/(app)/crm" src/components/perfil`. Esperado: verde.
- [ ] Commit `feat(cadastro): a ficha recebida e o link atual se separam (I4)`.

### Task 3: 0064 — o lado da equipe (FIC-7 a FIC-10, FIC-12, FIC-13)

**Arquivos:**
- Criar: `supabase/migrations/0064_forma_enviada.sql`, `tests/rls/forma-enviada.test.ts` e `supabase/provas/link-de-pagamento.sql` (a parte dos dias úteis).
- Mexer: `tests/rls/forma-de-pagamento.test.ts` (o caso 5), `src/lib/supabase/database.types.ts` e `docs/banco.md`.

**Interfaces** (produz), como na §6 do desenho, com:

- **`payment_plan_parts.usd_equivalent numeric(12,2)`**, com o `check` da §6.
- **`private.erro_da_forma`:** a conversão, na ordem do P10, com as frases da tabela global.
- **`private.copia_da_forma(p_negocio uuid) returns jsonb`** (P2):
  - `stable`, `security invoker`, `revoke … from public, anon` e `grant … to authenticated`;
  - o formato é o da cópia da 4a, mais `usd_equivalent` em cada parte;
  - `confirmar_forma_de_pagamento_pela_equipe` passa a usá-la.
- **`salvar_forma_de_pagamento`:**
  - grava `usd_equivalent`;
  - recusa `enviada` e `recusada` com as frases da tabela. A `confirmada` continua com a da 4a;
  - toca `updated_at` em toda gravação.
- **`registration_forms`:**
  - ganha `payment_plan_id` (FK `registration_forms_plan_same_org`, composta, `on delete set null (payment_plan_id)`), `mode text not null default 'completa' check (mode in ('completa','so_pagamento'))` e `closed_at timestamptz`;
  - `update … set closed_at = submitted_at where submitted_at is not null`, **antes** do gatilho;
  - o índice `registration_forms_um_em_aberto` é recriado com `where closed_at is null and cancelled_at is null`;
  - o índice parcial `registration_forms_plan_idx (payment_plan_id)`.
- **`private.registration_forms_link_de_pagamento()`**, no gatilho `registration_forms_link_de_pagamento` (`before insert or update or delete`). "Link com a forma" quer dizer `payment_plan_id` preenchido ou `mode = 'so_pagamento'`. Com a marca `via_ficha`, passa, depois de conferir que `person_id` é a pessoa do negócio da forma. Sem a marca:
  - **insert:** `mode`, `closed_at` e `payment_plan_id` só com os valores padrão. Com um link com a forma aberto da pessoa, a frase do P7, com o título;
  - **update de link com a forma:** a linha inteira congelada (`to_jsonb(new) - 'reviewed_at' - 'reviewed_by' - 'updated_at'` comparado com o `old`), menos a ação da chave estrangeira: profundidade > 1, e só `payment_plan_id` virando nulo;
  - **update de link comum:** recusa mudar `mode`, `closed_at` e `payment_plan_id`;
  - **delete de link com a forma:** recusa, menos com profundidade > 1;
  - a frase é "Mude o link da ficha pela tela do negócio.".
- **`private.fim_do_prazo_em_dias_uteis(p_de timestamptz, p_dias int) returns timestamptz`**, `stable`, como na §5.3.
- **`public.enviar_forma_de_pagamento(p_negocio uuid, p_versao timestamptz, p_pedir_dados_de_novo boolean default false) returns text`**, como na §6. A ordem das recusas:
  1. não encontrado;
  2. cobranças;
  3. encerrado;
  4. o estado (confirmada, enviada e recusada, cada um com a sua frase; sem forma, a frase de enviar sem visto);
  5. `updated_at <> p_versao`: "mudou enquanto você olhava";
  6. sem visto ou sem parte;
  7. `private.erro_da_forma(jsonb_build_object('partes', copia->'partes'))`;
  8. outro link com a forma aberto.

  Depois: cancela a ficha comum aberta e gera o token com `rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')`. Antes de escrever, conferir com `list_extensions` que o `pgcrypto` está em `extensions`.
- **`voltar_forma_para_rascunho(p_negocio uuid, p_de text default 'confirmada')`**, com `drop` e `create`:
  - CRM-10 só com `p_de = 'confirmada'`;
  - recusa `p_de` fora dos três estados com a frase de formato;
  - estado diferente de `p_de` (inclusive sem forma) dá a frase "mudou enquanto você olhava", que **substitui** "A forma não está confirmada.";
  - com `'enviada'`, cancela o link aberto, vencido ou não;
  - o histórico da §5.10;
  - `revoke`/`grant` da nova assinatura.
- **`confirmar_forma_de_pagamento_pela_equipe`:**
  - o ramo de `enviada` cancela o link aberto;
  - `recusada` dá a frase de Ajustar;
  - a cópia sai de `copia_da_forma`.
- **`payment_plan_responses_na_entrada`:**
  - com usuário, aceita `rascunho` ou `enviada`;
  - o ramo do cliente (sem usuário) entra já aqui, como na §6, conferindo também que o link é desta forma. Só a 0065 o alcança.
- **A trava dos vistos** recusa também `enviada`, com a frase dela.
- **`opportunities_ganho_nao_se_apaga`:** depois da regra das respostas, recusa o negócio com link com a forma aberto, com a frase.
- **`private.opportunities_fecha_o_link_de_pagamento()`**, no gatilho `after update of status on opportunities … when (old.status = 'open' and new.status <> 'open')`:
  - trava a forma;
  - se ela está `enviada`: guarda as marcas, cancela o link, põe a forma em `rascunho`, grava o histórico e devolve as marcas (P15).
- **`private.forma_do_ganho`:**
  - partes com `usd_equivalent`;
  - `ultima_decisao`, a `decision` da última resposta;
  - `enviada_em`, o `created_at` do link aberto da forma (P3).

- [ ] **Testes primeiro** em `tests/rls/forma-enviada.test.ts`.
  - **A base:**
    - os ajudantes de `forma-de-pagamento.test.ts:110-232` (`novaPessoa`, `novoNegocio`, `novoItem`, `comVistos`, `formaDo`, `respostasDa`, `historico`);
    - mais `versaoDa(negocio)`, que lê `payment_plans.updated_at` **como texto**, e `linksDa(pessoa)`;
    - a forma do critério da 4b: Entrada, transferência, USD 2.100, 1 parcela em hoje + 10 dias; Cartão, cartão, BRL 21.527,76 com `usd_equivalent` 3.900, 1 parcela em hoje + 15 dias;
    - o oráculo `fimDoPrazo(de: Date): number`: o dia de `de` em São Paulo, mais 3 dias de segunda a sexta, e devolve o instante 00h00 de São Paulo do dia seguinte;
    - as frases num `MSG`.
  - **Os casos:**
    1. Conversão:
       - salva e lê `usd_equivalent = 3900` só no Cartão;
       - a parte em USD com conversão, o 0, o `3900.005` e o `"abc"` são recusados com as frases, sem `22P02`;
       - a confirmação da equipe guarda a cópia com `usd_equivalent` 3900 no Cartão e `null` na Entrada.
    2. Enviar (`staff`, que não é dono):
       - devolve o token (`/^[A-Za-z0-9_-]{43}$/`), e a forma fica `enviada`;
       - há um link com `payment_plan_id`, `mode = 'completa'` e `new Date(expires_at).getTime() === fimDoPrazo(antes)` (tolera a virada do dia entre `antes` e `depois`, aceitando um dos dois);
       - o histórico tem "Forma de pagamento enviada ao cliente";
       - sem visto ou sem parte, a frase.
    3. Versão (foco 1):
       - a versão lida como texto passa;
       - uma versão anterior a outro salvar é recusada com "mudou enquanto você olhava", e nada muda.
    4. Modo:
       - quem tem um link comum com `submitted_at` recebe `so_pagamento`. Ele se cria pelo `enviar_ficha_de_cadastro` de hoje, chamado por `anonimoDeTeste()` com `fichaCompleta`. Os dois vêm de `tests/ficha-de-teste.ts`, criado neste passo;
       - com `p_pedir_dados_de_novo => true`, recebe `completa`.
    5. Forma enviada:
       - salvar é recusado com a frase;
       - `insert`, `update` e `delete` de visto, com a frase dos vistos;
       - `voltar_forma_para_rascunho(p_de => 'enviada')` pelo `staff` volta a `rascunho`, põe `cancelled_at` no link e grava o histórico de Editar;
       - os vistos voltam a mudar.
    6. Confirmar a partir de `enviada`:
       - o `staff` é recusado (CRM-10);
       - a gestão confirma: o link fica cancelado, e a resposta é `confirmada_pela_equipe`, com a cópia;
       - depois, `voltar(p_de => 'enviada')` dá "mudou enquanto você olhava", e a forma continua `confirmada` (foco 4);
       - sem forma, `voltar(p_de => 'recusada')` dá a mesma frase.
    7. Um link aberto por pessoa:
       - dois negócios da mesma pessoa: o segundo envio é recusado com a frase e o título do primeiro;
       - um link comum aberto é cancelado pelo envio;
       - com o link com a forma aberto, o `insert` de link comum dá a frase do P7.
    8. O link não se mexe pela API:
       - num link com a forma, mudar `expires_at`, `token`, `answers`, `mode`, `closed_at`, `payment_plan_id` ou `cancelled_at` dá a frase, e o `delete` também;
       - num link comum, `expires_at` muda, e `mode`, `closed_at` e `payment_plan_id` dão a frase;
       - o `insert` com `payment_plan_id` ou com `mode = 'so_pagamento'` dá a frase.
    9. Negócio encerrado:
       - Perdido por `update` (como no caso 9 da 4a), com a forma enviada: o link fica cancelado, a forma volta a `rascunho` e o histórico registra;
       - a pessoa recebe um link novo em outro negócio.
    10. Ganho:
        - com a forma enviada, a simulação traz `situacao = 'enviada'`, `enviada_em` preenchido e `cobrancas` vazia;
        - na gravação, nenhum `receivables`, o link fica cancelado e a forma fica em `rascunho`.
    11. Excluir:
        - o negócio com link aberto é recusado com a frase;
        - depois de Cancelar link, sem resposta, se apaga.
    12. Portal (P11): o `cliente` lê 0 linhas de `payment_plans`, partes, parcelas, respostas e `registration_forms`, com a forma `enviada` num negócio do "Cliente de Teste". No `finally`, a limpeza do P11, e o teste **falha** se cada `delete` não apagar exatamente 1 linha.
    13. A Duli não alcança o parceiro: o `colaborador` recebe "Negócio não encontrado." em `enviar_forma_de_pagamento` e em `voltar_forma_para_rascunho`, e lê 0 links do parceiro.
- [ ] **Mudar** o caso 5 de `forma-de-pagamento.test.ts`: refazer em rascunho passa a dar "mudou enquanto você olhava" (o `MSG.naoConfirmada` da linha 32 sai).
- [ ] **A prova** `supabase/provas/link-de-pagamento.sql`, no formato de `trava-da-forma.sql` (um bloco que termina em `raise exception` com o resultado numa linha). A parte dos dias úteis confere `fim_do_prazo_em_dias_uteis(…, 3)`:

  | De | Até |
  |---|---|
  | segunda, `2026-11-23 12:00-03` | `2026-11-27 00:00-03` |
  | sexta, `2026-11-27 12:00-03` | `2026-12-03 00:00-03` |
  | sábado, `2026-11-28 12:00-03` | `2026-12-03 00:00-03` |
  | domingo, `2026-11-29 12:00-03` | `2026-12-03 00:00-03` |
  | segunda às 22h de São Paulo, `2026-11-24 01:00+00` (foco 3) | `2026-11-27 00:00-03` |

- [ ] Rodar `bun x vitest run tests/rls/forma-enviada.test.ts`. Esperado: FALHA (coluna ou função inexistente).
- [ ] Escrever a 0064. O comentário do topo explica: a conversão sem cotação, o link com a forma congelado, a versão, quem clica diz de onde parte, e o gatilho do negócio que fecha.
- [ ] Aplicar a 0064 e regenerar os tipos. Rodar a prova pelo conector (`execute_sql`). Esperado: os cinco "ok" na mensagem.
- [ ] Rodar de novo. Esperado: verde.
- [ ] `tests/rls/ficha-de-cadastro.test.ts` passa a importar `fichaCompleta`, `ACEITE` e `anonimoDeTeste` de `tests/ficha-de-teste.ts`, sem cópia local.
- [ ] Regressão: `bun x vitest run tests/rls/forma-de-pagamento.test.ts tests/rls/cobrancas-do-ganho.test.ts tests/rls/ficha-de-cadastro.test.ts tests/rls/vistos-do-negocio.test.ts tests/rls/ganho.test.ts tests/rls/funil.test.ts tests/rls/portal-do-cliente.test.ts --no-file-parallelism`. Esperado: verde.
- [ ] `docs/banco.md`: "Situação: 0001 a 0064"; a coluna, as três de `registration_forms`, o gatilho novo, as funções novas e as mudadas, e as travas ampliadas.
- [ ] `bun run verify` → commit `feat(banco): a forma vai pelo link (0064)`.

### Task 4: 0065 — a porta do pagamento (FIC-8, FIC-9)

**Arquivos:**
- Criar: `supabase/migrations/0065_porta_do_pagamento.sql` e `tests/rls/porta-do-pagamento.test.ts`.
- Mexer:
  - `supabase/provas/link-de-pagamento.sql`, com a parte do link vencido;
  - `database.types.ts`, `docs/banco.md` e `AGENTS.md` ("Uma porta para quem não tem login": três funções, e o aviso do Supabase para as três).

**Interfaces** (produz):
- **`abrir_ficha_de_cadastro(p_token text)`**, com `drop` e `create`. Devolve `situacao`, `nome`, `email`, `ddi`, `telefone`, `organizacao`, `modo`, `tem_forma` e `forma jsonb`. A `situacao`, nesta precedência:
  1. `cancelada`: cancelado, pessoa na lixeira, ou link com a forma com o negócio fora de `open`;
  2. `respondida` (link com a forma) ou `enviada` (link comum): `closed_at` preenchido;
  3. `expirada`;
  4. `aguardando_pagamento`: link com a forma com `submitted_at` preenchido ou `mode = 'so_pagamento'`;
  5. `aberta`.

  `forma` vem **só** em `aguardando_pagamento`, de `private.copia_da_forma`. Nome e contato, só em `aberta`, como hoje.
- **`enviar_ficha_de_cadastro`** (mesma assinatura, `create or replace`):
  - liga e devolve `via_ficha`;
  - recusa `so_pagamento`, `submitted_at` já preenchido e o negócio fora de `open`, com a frase de hoje;
  - com forma, grava os dados e deixa `closed_at` nulo; sem forma, grava `submitted_at` e `closed_at` juntos.
- **`public.responder_forma_de_pagamento(p_token text, p_aceita boolean, p_motivo text default null) returns void`**, como na §6:
  - o motivo é aparado, e vazio vira nulo. Acima de 500, recusa com a frase do P9;
  - com `p_aceita`, o motivo é ignorado (P16);
  - toda recusa por estado dá "Este link não está mais disponível.".

- [ ] **Testes primeiro** em `tests/rls/porta-do-pagamento.test.ts`.
  - **A base:** a da T3, mais `anonimoDeTeste()` de `tests/ficha-de-teste.ts` e o ajudante `enviada(negocio, opcoes?)`, que salva a forma do critério, lê a versão e envia, devolvendo o token.
  - **Os casos:**
    1. Antes dos dados, `abrir` dá `aberta`, `tem_forma` verdadeiro, `modo` `completa`, `forma` nula e o nome da pessoa.
    2. Enviar os dados por `anonimoDeTeste()`:
       - grava `submitted_at` com `closed_at` nulo;
       - a busca da Início (`submitted_at` preenchido e `reviewed_at` nulo) acha o link;
       - `abrir` dá `aguardando_pagamento`, com a `forma` igual à `copia_da_forma` (o Cartão com `usd_equivalent` 3900).
    3. Em `aberta`, `aguardando_pagamento`, `respondida` e `cancelada`, o `JSON.stringify` da resposta de `abrir` não contém `reference_rate`, a anotação da cotação, o CPF, o RG nem a rua da `fichaCompleta`.
    4. Confirmo:
       - a forma fica `confirmada`;
       - a resposta é `confirmada`, com `registration_form_id`, `answered_by` nulo, `answered_by_name` igual ao nome da pessoa e a cópia igual à do caso 2;
       - o link fica com `closed_at`;
       - o histórico tem "Forma de pagamento confirmada pelo cliente";
       - `abrir` dá `respondida`, e responder de novo dá a frase.
    5. Há algo errado:
       - com "  O valor da entrada está errado  ": a forma fica `recusada`, a `reason` sai aparada e o histórico registra com o motivo, e o CPF enviado continua na pessoa;
       - com "   ": `reason` nula e o histórico sem ": " (foco 5);
       - com 501 caracteres: a frase do P9, e nada grava (foco 5).
    6. Reenviar:
       - `voltar(p_de => 'recusada')` pelo `staff` volta a forma e grava "Forma de pagamento ajustada";
       - salvar e enviar dá um link `so_pagamento`, e `abrir` dá `aguardando_pagamento` com `modo = 'so_pagamento'`;
       - `enviar_ficha_de_cadastro` com esse token é recusado, e a pessoa não muda;
       - a ficha do 1º link continua sem `reviewed_at` e aparece na busca da Início. `update reviewed_at` nela passa, pela API do `staff`.
    7. Clique duplo (foco 4): dois Confirmo em `Promise.all`, e um passa, o outro dá a frase, e fica uma resposta.
    8. Tokens que não gravam (cada um com a frase, e nenhuma resposta nova):
       - inventado;
       - cancelado por Editar;
       - já respondido;
       - de negócio perdido (o gatilho da 0064 o cancelou);
       - de pessoa na lixeira (`update people set deleted_at`, como na 0035).
    9. A porta continua estreita:
       - o `parceiro` logado chamando `responder_forma_de_pagamento` e `abrir_ficha_de_cadastro` é recusado;
       - o `insert` em `payment_plan_responses` pela API, com `confirmada` e `recusada` e um `registration_form_id`, dá erro.
    10. Ganho:
        - recusada: a simulação traz `situacao = 'recusada'`, `ultima_decisao = 'recusada'` e `cobrancas` vazia;
        - confirmada pelo cliente: `ultima_decisao = 'confirmada'`, e a gravação cria as 2 cobranças, como na 4a.
    11. A marca do parceiro: `abrir` devolve `organizacao` igual a `organizations.name` da organização de teste.
- [ ] **A prova do link vencido**, no mesmo arquivo, como `postgres`:
  - com uma pessoa, um negócio e uma forma da organização de teste, envia;
  - liga `via_ficha` e põe `expires_at` no passado;
  - confere que `abrir_ficha_de_cadastro` dá `expirada` e sem `forma`, e que `responder_forma_de_pagamento` recusa e não grava;
  - termina em `raise exception`.
- [ ] Rodar. Esperado: FALHA.
- [ ] Escrever a 0065. O comentário do topo explica a terceira função da porta e o que a mantém estreita, no formato da 0035.
- [ ] Aplicar, regenerar os tipos e rodar a prova. Rodar o teste novo e `tests/rls/ficha-de-cadastro.test.ts`. Esperado: verde.
- [ ] `get_advisors` (segurança): o aviso "definer executável por anon" aparece para as três funções da porta e para nenhuma outra. Registrar no ledger.
- [ ] `docs/banco.md` ("0001 a 0065") e `AGENTS.md`.
- [ ] `bun run verify` → commit `feat(banco): o cliente responde a forma pelo link (0065)`.

### Task 5: A leitura da forma e as ações do lead

**Arquivos:** mexer em `src/features/opportunities/montagem.ts`, `queries.ts`, `forma-regras.ts`, `forma-actions.ts` e nos testes.

**Interfaces:**
- **Consome** as funções da 0064.
- **`FormaDoNegocio`** ganha:
  - `updated_at: string`;
  - `linkAberto: { id: string; token: string; expires_at: string; created_at: string } | null`, o mais recente com `closed_at` e `cancelled_at` nulos, embutido por `links:registration_forms!registration_forms_plan_same_org(...)`;
  - `decision` em `ultimaResposta`.
- **Produz:**

```ts
// forma-regras.ts
export type EstadoDoCartao = "rascunho" | "enviada" | "vencida" | "recusada" | "confirmada";
export function estadoDaForma(forma: Pick<FormaDoNegocio, "status" | "linkAberto">, agora: Date): EstadoDoCartao;
// enviada com linkAberto vencido (ou sem link) → "vencida"
// forma-actions.ts
export async function enviarFormaDePagamento(anterior: ActionState, formData: FormData): Promise<ActionState>;
// campos: negocio, pessoa, versao (texto, igual ao lido), pedir_dados_de_novo ("on" ou ausente)
export async function voltarFormaParaRascunho(anterior: ActionState, formData: FormData): Promise<ActionState>;
// campos: negocio, pessoa, de ∈ "enviada" | "recusada" | "confirmada"; outro valor → falhou sem chamar o banco
```

- **`refazerFormaDePagamento` é apagada.** O Refazer do cartão (`forma-de-pagamento.tsx:263`) passa a usar `voltarFormaParaRascunho` com `de = "confirmada"`. Os testes dela (`forma-actions.test.ts:185-207`) viram testes de `voltarFormaParaRascunho`, e o mock de `forma-de-pagamento.test.tsx:19` troca de nome.
- As duas ações revalidam o lead, a pessoa (`revalidarPessoa`) e `/`, porque a Início avisa.

- [ ] **Testes primeiro.**
  - `formaDoNegocio`:
    - com dois links, um cancelado e um aberto, devolve o aberto;
    - `updated_at` passa sem mudar, com os microssegundos (foco 1);
    - `ultimaResposta.decision` vem junto.
  - `estadoDaForma`:
    - `enviada` com `expires_at` 1 minuto antes de `agora` é "vencida"; 1 minuto depois, "enviada";
    - `recusada` é "recusada".
  - `enviarFormaDePagamento`:
    - com `versao = "2026-11-23T14:02:11.123456+00:00"`, chama `rpc("enviar_forma_de_pagamento", { p_negocio, p_versao: "2026-11-23T14:02:11.123456+00:00", p_pedir_dados_de_novo: false })` com o texto igual (foco 1);
    - com a caixa marcada, `true`;
    - o `P0001` volta como a frase.
  - `voltarFormaParaRascunho`:
    - `de = "enviada"` chama `rpc("voltar_forma_para_rascunho", { p_negocio, p_de: "enviada" })`;
    - `de = "rascunho"` não chama o banco.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar, mais o `select` de `obterNegocio` com `updated_at`, `usd_equivalent`, `decision` e `links`.
- [ ] Rodar, mais `bun x tsc --noEmit`. Esperado: verde (o cartão ainda usa a `refazer` antiga: trocar o import no mesmo passo).
- [ ] Commit `feat(crm): enviar e voltar a forma, com a versão que a tela viu`.

### Task 6: Dados cadastrais sem o aviso preso (I4, INI-4) e o link com a forma no contato

**Arquivos:** mexer em `src/features/cadastro/queries.ts`, `actions.ts` (+ teste), `src/components/perfil/dados-cadastrais.tsx` (+ teste) e `controles-da-ficha.tsx`.

**Interfaces:**

```ts
export type LinkDaFicha = LinkLido & { id: string; token: string; mode: "completa" | "so_pagamento";
                                       negocio: { id: string; title: string } | null };
export type CadastroDoContato = {
  ficha: Record<CampoDaFicha, string | null>; dependentes: Dependente[];
  fichaRecebida: LinkDaFicha | null; linkAtual: LinkDaFicha | null;
};
```

- `cadastroDoContato` lê os links da pessoa (os 20 mais recentes, com o negócio pela forma) e escolhe com `fichaRecebida` e `linkAtual` (T2).
- `gerarLink` cancela só os links comuns abertos (`closed_at`, `cancelled_at` e `payment_plan_id` nulos). A frase do P7 vem do banco.
- `cancelarLink` filtra também `payment_plan_id` nulo (P8).
- **`DadosCadastrais`:**
  - o selo sai de `situacaoDoCadastro`;
  - **o bloco da ficha** mostra a `fichaRecebida`: sem `reviewed_at`, "O cliente preencheu a ficha em ‹data›…" com o Conferi; com ele, "Ficha preenchida pelo cliente em ‹data› e conferida.";
  - **o bloco do link** mostra o `linkAtual`. Link comum: aguardando com `LinkAberto`, ou vencido com Gerar novo. Link com a forma: "Link da ficha enviado com a forma do negócio ‹título›", com link para `/crm/<id>`. Sem link: `GerarLink`, com `novo = fichaRecebida !== null`.

- [ ] **Testes primeiro.**
  - **Componente (I4):**
    - ficha recebida sem conferir e um link novo aguardando: aparecem o "Conferi" **e** o campo do link;
    - com um link com a forma atual: aparece "Link da ficha enviado com a forma do negócio Contrato EB-2" com `href` `/crm/<id>`, e não aparece "Cancelar link";
    - só a ficha conferida, sem link: "Gerar novo link".
  - **Ação:**
    - `gerarLink` filtra o cancelamento por `payment_plan_id` nulo e `closed_at` nulo;
    - o erro `P0001` do insert volta com a frase do P7.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar. As páginas do contato, do cliente e do lead continuam passando `cadastro` como hoje.
- [ ] Rodar `bun x vitest run src/components/perfil src/features/cadastro "src/app/(app)"` e `bun x tsc --noEmit`. Esperado: verde.
- [ ] Commit `fix(cadastro): ficha recebida não some com um link novo (I4)`.

### Task 7: O cartão, a janela e a prévia no lead (FIC-7, FIC-10, FIC-12, FIC-13)

**Arquivos:**
- Criar: `src/app/(app)/crm/[id]/enviar-ficha.tsx` e o teste.
- Mexer: `forma-de-pagamento.tsx`, `janela-da-forma.tsx`, `vistos.tsx`, `page.tsx` e os testes.

**Interfaces:**
- Consome T1, T2, T5 e T6.
- `CartaoDaFormaDePagamento` ganha `origem: string`, `ddi`, `telefone`, `jaMandouFicha: boolean` (P12) e `fichaComumAbertaEm: string | null` (o `created_at` do `linkAtual` comum).
- `Vistos` troca `travadaPelaForma: boolean` por `travadaPelaForma: "confirmada" | "enviada" | null`, com a frase de cada um.

```tsx
export function EnviarFicha(props: {
  negocioId: string; pessoaId: string; versao: string;
  forma: FormaParaOCliente; jaMandouFicha: boolean; fichaComumAbertaEm: string | null;
}): React.ReactNode;
```

**O cartão**, por `estadoDaForma`, com a tabela da §7 do desenho e o P6:

| Estado | Selo | Linhas | Botões |
|---|---|---|---|
| `rascunho` | "rascunho" | as partes; com a última resposta `recusada`, "Recusada pelo cliente em ‹data›: ‹motivo›" | Editar (a janela), **Enviar ficha**, Confirmar pela equipe (`podeConfirmar`) |
| `enviada` | "enviada · vale até ‹formatarDiaDaSemana(ultimoDiaDoLink, "curto")›" | as partes | Copiar link (`CopiarTexto` com `urlDaFicha`), WhatsApp (`linkDoWhatsApp` + `mensagemDaFormaNoWhatsApp`), Editar e Cancelar link (`ConfirmAction` com a ação embrulhada em `ESTADO_INICIAL` e `de = "enviada"`; "O link enviado em ‹data› deixa de valer."), Confirmar pela equipe |
| `vencida` | "link vencido" | as partes | Editar (a mesma `ConfirmAction`), Confirmar pela equipe |
| `recusada` | "recusada" | "Motivo: ‹reason›", ou "Sem motivo informado." | Ajustar (`ConfirmAction` sem confirmação, `de = "recusada"`) |
| `confirmada` | "confirmada" | "Confirmada pelo cliente em ‹data›" ou a frase da equipe da 4a | Refazer (`FormDialog` da 4a, agora com `voltarFormaParaRascunho` e `de = "confirmada"`) |

**A janela:**
- na parte em R$, o campo "Convertido de US$" (`inputMode="decimal"`), vazio = `null`;
- trocar a moeda para US$ põe `usd_equivalent = null` (foco 2).

**A prévia (`EnviarFicha`):** `FormDialog`, gatilho "Enviar ficha", `salvar="Confirmar e gerar link"`, `pendente="Gerando..."`, com:
- `FormaDePagamentoDoCliente` com `formaParaOCliente(itens, partes)`;
- o `avisoDeVencidas` das parcelas, que avisa e não bloqueia;
- com `fichaComumAbertaEm`, "O link da ficha enviado em ‹data› deixa de valer.";
- a caixa `pedir_dados_de_novo`, só com `jaMandouFicha`;
- os escondidos `negocio`, `pessoa` e `versao`.

**A página:**
- passa `origem`, `ddi`, `telefone`, `jaMandouFicha` e `fichaComumAbertaEm` (de `cadastro`);
- `travadaPelaForma` vale `"confirmada"` ou `"enviada"` com `charges_created_at` nulo, e `null` nos outros casos.

- [ ] **Testes primeiro.**
  - **Cartão:** um caso por linha da tabela, com os botões que aparecem e os que não aparecem.
    - Em `enviada`, o selo diz "vale até qui, 26/11" para `expires_at = "2026-11-27T03:00:00+00:00"`, e o `href` do WhatsApp contém `encodeURIComponent("quinta-feira, 26/11")`.
    - Em `rascunho` depois da recusa, aparece o motivo.
    - Em `confirmada` com `decision = "confirmada"`, aparece "Confirmada pelo cliente em".
    - O Cartão convertido mostra "US$ 3.900 convertidos para R$ 21.527,76".
  - **Janela:**
    - "Convertido de US$" aparece na parte em R$ e não na parte em US$;
    - preencher 3900, trocar para US$ e voltar para R$ deixa o campo vazio (foco 2);
    - Salvar leva `usd_equivalent: 3900` no JSON.
  - **Prévia:**
    - mostra "US$ 3.900 convertidos para R$ 21.527,76";
    - com `jaMandouFicha`, mostra a caixa; sem, não mostra;
    - com `fichaComumAbertaEm`, mostra o aviso;
    - `versao` vai no escondido exatamente como recebida (foco 1).
  - **Vistos:** com `"enviada"`, a frase de enviada, e sem "Acrescentar visto".
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar, com os componentes, os tokens e os raios do `AGENTS.md`.
- [ ] Rodar `bun x vitest run "src/app/(app)/crm"`. Esperado: verde.
- [ ] Commit `feat(crm): enviar a forma pelo link, com a prévia (FIC-7)`.

### Task 8: A ficha pública com o pagamento (FIC-8, FIC-9)

**Arquivos:**
- Criar: `src/app/cadastro/[token]/etapa-do-pagamento.tsx` e o teste.
- Mexer: `page.tsx`, `ficha-publica.tsx` (+ teste), `src/features/cadastro/publico-queries.ts` e `publico-actions.ts` (+ teste).

**Interfaces:**

```ts
// publico-queries.ts
export type FichaAberta = {
  situacao: "aberta" | "aguardando_pagamento" | "respondida" | "enviada" | "expirada" | "cancelada";
  nome: string | null; email: string | null; ddi: string | null; telefone: string | null;
  organizacao: string; modo: "completa" | "so_pagamento"; tem_forma: boolean;
  forma: FormaParaOCliente | null; // por formaParaOClienteSchema; fora do formato → error
};
// publico-actions.ts
export async function responderForma(token: string, aceita: boolean, motivo: string): Promise<{ error: string | null }>;
// motivo aparado > 500 → a frase do P9, sem chamar o banco; erro do banco → traduzirErro
```

```tsx
export function EtapaDoPagamento(props: {
  token: string; forma: FormaParaOCliente; organizacao: string; soPagamento: boolean;
}): React.ReactNode;
```

**A página**, por `situacao`:
- `aberta`: `FichaPublica` com `temForma`. Com forma, mostra "Passo 1 de 2", e depois do envio chama `router.refresh()` em vez do recibo;
- `aguardando_pagamento`: `EtapaDoPagamento`, com "Seus dados já foram recebidos ✓" no `so_pagamento` e "Passo 2 de 2" no `completa`;
- `expirada` com forma: "Este link expirou. Peça um novo à ‹organização›." (P14);
- `enviada`: o recibo de hoje;
- o resto: a frase de hoje.

As duas frases de link indisponível saem de `LinkIndisponivel({ organizacao, expirado }: { organizacao: string; expirado: boolean })`, exportado de `ficha-publica.tsx`, para o teste alcançá-las sem a página de servidor.

**`EtapaDoPagamento`:**
- `FormaDePagamentoDoCliente`, e os botões **Confirmo** e **Há algo errado**;
- o segundo abre um `Textarea` (`maxLength` 500) e "Enviar";
- depois da resposta, a frase final com a organização;
- um erro aparece com `role="alert"`, e a escolha fica.

- [ ] **Testes primeiro.**
  - **`EtapaDoPagamento`:**
    - Confirmo chama `responderForma(token, true, "")` e mostra a frase com a organização "Parceiro de Teste" (e não "Duli");
    - Há algo errado + motivo + Enviar chama `(token, false, motivo)` e mostra a frase da recusa;
    - um erro do servidor aparece e os botões continuam;
    - com `soPagamento`, aparece "Seus dados já foram recebidos ✓".
  - **`FichaPublica`** com `temForma`: "Passo 1 de 2"; depois de gravar, `router.refresh` é chamado (o mock de `next/navigation`), e o recibo não aparece.
  - **`LinkIndisponivel`:** com `expirado`, "Este link expirou. Peça um novo à Parceiro de Teste."; sem, a frase de hoje.
  - **`responderForma`:** 501 caracteres não chama o `rpc` e devolve a frase. Com 500, chama `rpc("responder_forma_de_pagamento", { p_token, p_aceita: false, p_motivo })` (foco 5).
  - **`abrirFicha`:** com `forma` fora do formato, devolve `error`.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar. No celular de 375 px, uma coluna, os botões empilhados e nada de largura fixa.
- [ ] Rodar `bun x vitest run src/app/cadastro src/features/cadastro`. Esperado: verde.
- [ ] Commit `feat(cadastro): o cliente vê a forma e responde (FIC-8, FIC-9)`.

### Task 9: O resumo do Ganho e o excluir (CRM-14, REC-6)

**Arquivos:** mexer em `src/features/opportunities/schema.ts` (+ teste), `src/app/(app)/crm/dialogos.tsx` (+ teste) e `src/features/opportunities/actions.test.ts`.

**Interfaces:**
- `resumoDoGanhoSchema.forma` ganha `ultima_decisao: z.enum(["confirmada", "recusada", "confirmada_pela_equipe"]).nullable()` e `enviada_em: z.string().nullable()`.
- As partes ganham `usd_equivalent: z.number().nullable()`.
- O `RESUMO` simulado de `actions.test.ts` ganha os campos.

**O trecho "Forma de pagamento":**

| Situação | Mostra |
|---|---|
| `enviada` | "Enviada ao cliente em ‹formatarData(enviada_em)›, sem resposta: nenhuma cobrança será criada, e o link será cancelado. Para criá-las, confirme pela equipe antes do Ganho." |
| `recusada` | "Recusada pelo cliente em ‹formatarData(confirmada_em)›: nenhuma cobrança será criada. Ajuste a forma e envie de novo, ou confirme pela equipe." |
| `confirmada` com `ultima_decisao = "confirmada"` | "Confirmada pelo cliente em ‹data›", e as partes (`linhaDaParte`, com a conversão) |
| `rascunho` | a frase da 4a, só para `rascunho` |

- [ ] **Testes primeiro.**
  - as duas situações novas, com as frases;
  - "Confirmada pelo cliente em", e a parte convertida com "convertidos para";
  - `rascunho` com a frase da 4a;
  - o esquema recusa o resumo sem `ultima_decisao`;
  - `deleteOpportunity` com `{ code: "P0001", message: "Cancele o link da ficha antes." }` devolve a frase (se já passar, registrar no ledger que o teste fixa o comportamento).
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar.
- [ ] Rodar `bun x vitest run "src/app/(app)/crm" src/features/opportunities`. Esperado: verde.
- [ ] Commit `feat(crm): resumo do Ganho com a forma enviada e a recusada (CRM-14)`.

### Task 10: Os avisos da Início (INI-8)

**Arquivos:** mexer em `src/features/painel/queries.ts`, `regras.ts` (+ teste), `src/app/(app)/alertas.tsx` (+ teste) e `src/app/(app)/page.tsx`.

**Interfaces:**
- `DadosDoPainel` ganha `formas`, lido de `payment_plans`:
  - `status`, `charges_created_at`;
  - `negocio:opportunities!inner(id, status, person:people(full_name))`, com `.eq("negocio.status", "open")` e `.is("charges_created_at", null)`;
  - `respostas(decision, reason, answered_at, created_at)` e `links:registration_forms(expires_at, closed_at, cancelled_at, created_at)`.
- **Produz:**

```ts
export type AlertaDeForma = { negocio_id: string; nome: string };
// Alertas ganha:
formas: {
  recusadas: (AlertaDeForma & { motivo: string | null })[]; // última resposta recusada e status recusada ou rascunho
  prontas: AlertaDeForma[];                                  // confirmada, sem cobranças
  vencidas: AlertaDeForma[];                                 // enviada, link aberto vencido
};
export function alertasDoDia(dados, hoje: string, agora?: Date): Alertas; // P18; `vazio` conta os três
```

- **`AlertasDoDia`:** um bloco por lista, com "Forma de pagamento recusada — ‹pessoa›" (e o motivo), "Pronto para o contrato — ‹pessoa›" e "Forma de pagamento sem resposta, link vencido — ‹pessoa›". Cada um com link para `/crm/<negocio_id>`.

- [ ] **Testes primeiro.**
  - **`alertasDoDia`:**
    - recusada com motivo entra; depois de Ajustar (`rascunho`, última recusada), continua; enviada de novo, sai; confirmada pela equipe depois da recusa, sai e entra em prontas;
    - confirmada sem cobranças entra em prontas;
    - enviada com o link vencido 1 minuto antes de `agora` entra em vencidas; 1 minuto depois, não;
    - rascunho que nunca foi respondido não avisa;
    - com só um aviso de forma, `vazio` é falso.
  - **Componente:** os três textos, e o `href` `/crm/<id>`.
- [ ] Rodar. Esperado: FALHA.
- [ ] Implementar. A ficha `so_pagamento` não entra nas fichas recebidas, porque não tem `submitted_at`: o teste do componente fixa isso, com uma ficha sem `submitted_at`.
- [ ] Rodar `bun x vitest run src/features/painel "src/app/(app)/alertas.test.tsx"`. Esperado: verde.
- [ ] Commit `feat(inicio): avisos da forma de pagamento (INI-8)`.

### Task 11: Fumaça, documentação, verificação e revisão

- [ ] **Fumaça** (`tests/fumaca/rotas.test.ts`, "com um lead de verdade"). O lead é descartável e se apaga no fim:
  - um visto, a forma do critério (com a conversão), a versão e o envio, pela sessão do `parceiro`;
  - `/cadastro/<token>` sem login: 200 e "Passo 1 de 2";
  - os dados por `anonimoDeTeste()`, com `fichaCompleta`, os dois de `tests/ficha-de-teste.ts`. De novo: 200, "Confirmo", "Há algo errado" e "convertidos para";
  - `/crm/<negocio>`: "enviada" e "Copiar link".
- [ ] **`docs/spec.md`:**
  - FIC-7, FIC-8, FIC-9, FIC-10 e FIC-13 ✅;
  - FIC-1, FIC-12, INI-4, INI-8, CRM-14 e REC-6 com a nota "*Entrega 4b (data): …*" e ✅;
  - os critérios da 4b resumidos, como na 4a.
- [ ] **`docs/plano.md`:** a 4b no ar, a tabela "No ar" (Lead, Ficha de cadastro, Início) e a contagem de testes.
- [ ] **`AGENTS.md`**, "UI: use o que já existe": "Forma de pagamento como o cliente vê → `FormaDePagamentoDoCliente` (`@/components/forma-de-pagamento-do-cliente`), `formaParaOCliente` e `valorComConversao` (`@/lib/forma-do-cliente`) — a prévia e a ficha não podem divergir".
- [ ] **Verificação:** `bun run verify`, `bun run build`, e `bun run dev` num terminal com `bun run test:fumaca` no outro. Esperado: tudo verde. Registrar os números.
- [ ] Commit `docs: entrega 4b na spec, no plano e no AGENTS`.
- [ ] **Revisão final:**
  - Code Reviewer no modelo mais capaz, sobre o intervalo da entrega;
  - requisitos: o desenho da 4b e a spec, com o "Foco da revisão" deste plano e as linhas `Ruling:` do ledger;
  - rodadas até não sobrar ajuste, cada correção com o teste vermelho antes.
- [ ] **Entregar ao Renato** a tabela do que ficou pronto, como foi provado e o que ficou de fora (§3 "Fora" do desenho), com o comando:

  ```bash
  git -C "D:\Projetos Apps\dulihub-v2" push
  ```

## Verificação

- **Por tarefa:** o teste vermelho visto, depois verde.
  - Unidade: `bun x vitest run <arquivo>`.
  - RLS: `bun x vitest run tests/rls/<arquivo>`, e mais de um arquivo com `--no-file-parallelism`.
- **Antes de cada commit de banco:** `bun run verify`, mais a prova SQL pelo conector.
- **No fim:** `bun run build`, a fumaça local, e o CI verde depois do push. Depois do deploy, `/api/versao` com o commit.
- **No banco, depois da 0065, só leitura:**
  - `get_advisors` com o aviso do anônimo para as três funções, e só elas;
  - `select count(*) from registration_forms where payment_plan_id is not null` é 0 fora da organização de teste.
