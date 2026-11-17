# Entregas 0 e 1 — casa em ordem e contato completo, sem duplicata — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** aplicar as migrations pendentes e a conta de teste nova (entrega 0). Depois, fazer todo contato ter nome, telefone e e-mail, avisar quando o contato ou a oportunidade já existem, e criar a oportunidade junto com um contato novo (entrega 1).

**Arquitetura:**
- **A regra de formato do contato** vive em TypeScript (`src/lib/contato.ts`) e em SQL (`private.contato_valido`). Uma mesma lista de casos prova que as duas dizem o mesmo.
- **A busca de parecidos** é uma RPC `security invoker`, e a RLS decide quem aparece.
- **Criar oportunidade** é uma RPC numa transação (`criar_oportunidade`), que devolve `jsonb` com `precisa_confirmar`.
- **As três telas** mostram o aviso por uma área nova e genérica do `FormDialog` (e do `FormularioDoCadastro`). A confirmação só existe no clique do botão: nunca fica guardada no formulário entre um envio e outro.

**Tecnologia:** Next.js (App Router, Server Actions), Supabase (Postgres + RLS + PostgREST), Zod, Vitest + Testing Library + jsdom, bun.

**Spec:** `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`, §3, §4.5, §6.0 e §6.1. Requisitos em `docs/spec.md`: CON-4, CON-8, CRM-11, CRM-12.

**Fora deste plano:** as entregas 2 a 4. Cada uma terá o seu plano, escrito quando a anterior estiver no ar.

**Histórico:** rodada 1 do Code Reviewer no plano em 17/nov. Corrigidos C1–C3, I1–I10 e os menores. A medição da produção (I3) mudou a regra do DDI (ver "Dados de hoje").

## Dados de hoje (medidos em 17/nov, só leitura, fora da organização de teste)

| Situação | Contatos (de 80) |
|---|---|
| DDI gravado **sem o "+"** (`55`, `1`) — vieram da importação | 76 |
| Sem e-mail | 4 |
| Sem telefone | 4 |
| Sem DDI | 1 |
| E-mail ou telefone com formato inválido | 0 |

Daí duas decisões deste plano:

- **O DDI aceita "55" ou "+55"** na entrada e grava sempre "+55", em TS e em SQL.
- **A 0040 corrige os 76 DDIs** gravados sem "+": "55" vira "+55" e "1" vira "+1". É inequívoco, e a exibição, que hoje mostra "55 31…", passa a mostrar "+55 31…".

Os 4 contatos sem e-mail ou telefone só cobram os campos quando alguém os edita (spec §6.1).

## Restrições globais

- Pacotes com `bun`, nunca `npm`. Nunca ler valores do `.env.local`.
- **Comandos de teste** (os scripts do `package.json` não estreitam por arquivo):
  - unidade: `bun x vitest run <arquivo>`;
  - RLS: `bun x vitest run <arquivo> --no-file-parallelism`;
  - suíte inteira: só no `bun run verify`.
- **Banco:**
  - toda mudança vira arquivo em `supabase/migrations/NNNN_nome.sql`, aplicado pelo conector do Supabase (`apply_migration`);
  - no **mesmo commit**: `src/lib/supabase/database.types.ts` regenerado (`generate_typescript_types`) **e** `docs/banco.md` atualizado (banco.md:10).
- **Antes de aplicar qualquer migration:** a cópia do banco do Renato (Tarefa 1). Sem ela, nada é aplicado.
- **Funções:**
  - função que muda de assinatura: `drop` + `create`, nunca `create or replace`;
  - `create or replace` de função existente repete o cabeçalho inteiro (`security invoker`/`definer`, `set search_path = ''`);
  - depois de criar: `revoke execute … from public, anon` e o `grant` certo;
  - função usada em **índice** ou por função `invoker` precisa de `grant execute … to authenticated`, porque o Postgres a avalia com o papel de quem grava. Revogar de `authenticated` derruba todo `insert` em `people`.
- **Testes:**
  - teste vermelho antes do código;
  - teste de RLS que grava só grava na organização de teste ("Parceiro de Teste"), com dado **aleatório por rodada**: `const sufixo = crypto.randomUUID().replace(/\D/g, "").slice(0, 8)`, usado em nome, e-mail e telefone;
  - ele limpa em `finally` o que criou, pelo id;
  - não conta o total de uma tabela, só pelo nome único da tentativa (o CI de `b653195` caiu por contagem);
  - a pessoa "Cliente de Teste" (`fixture()`) nunca é apagada.
- **Interface:**
  - em português;
  - ícone passado como elemento (`icon={<X />}`);
  - cores só por token;
  - raios: campo/botão `rounded-xl`, linha `rounded-2xl`, superfície `rounded-3xl`;
  - uma feature não importa de outra: o que é comum fica em `src/lib/` ou `src/components/`.
- **Server Action** devolve `ActionState` (`@/lib/action-state`), com sucesso por `gravou()`. Dado do banco é tipado por `Tables<>`/`Enums<>` ou validado por Zod; nunca `as unknown as`.
- **Antes de cada commit:** `bun run verify` verde, lint zero, nunca `--no-verify`.
- **Push:** é do Renato, nos três pontos marcados (fim da T3, fim da T6, fim da T9). Migration nova não fica no ar com a tela antiga mais que o necessário (spec §12.7.4).
- **Mensagens de validação de contato** (cópia exata, iguais no TS e no SQL; o espaço em volta é aparado antes, inclusive tab e NBSP):

| Campo | Situação | Mensagem |
|---|---|---|
| `email` | vazio | `Informe o e-mail` |
| `email` | fora de `^[^@\s]+@[^@\s]+\.[^@\s]+$` | `E-mail inválido` |
| `ddi` | vazio | `Informe o DDI` |
| `ddi` | fora de `^\+?\d{1,4}$` | `DDI inválido (ex.: +55)` |
| `telefone` | vazio | `Informe o telefone` |
| `telefone` | menos de 8 ou mais de 15 dígitos | `O telefone precisa ter de 8 a 15 dígitos` |

A ordem é e-mail → DDI → telefone. O DDI válido grava como `+` + dígitos.

## Foco da revisão

Situações que a spec implica e que mais podem morder quem usa. Cada uma ganhou teste na tarefa dona.

1. **O mesmo telefone digitado de outro jeito.** Por exemplo, "5531…" no campo telefone com DDI +55, contra um contato antigo "31 …" **sem DDI**.
   - A comparação é pelo **número nacional**: dígitos do telefone, tirando o DDI da frente quando ele foi digitado junto e o número tem mais de 11 dígitos.
   - Isso avisa em mais casos, nunca em menos. A T9 registra o refinamento no §6.1 da spec.
   - Teste na T5, com um contato sem DDI.
2. **Editar um contato não pode avisar "já cadastrado em ‹ele mesmo›",** e só confere parecidos quando e-mail, DDI ou telefone **mudaram**. Testes na T5 (`p_ignorar`) e na T6 (ações).
3. **Contato de outra organização nunca aparece no aviso.** Teste na T5.
4. **Contato antigo sem e-mail:** editá-lo exige o e-mail; mandá-lo para a lixeira continua funcionando. Testes na T6 (schema) e na T5 (guarda).
5. **"Sim, é a mesma pessoa" para um contato na lixeira** oferece restaurar antes de usar. Testes na T6 e na T8.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0037_…`, `0038_…` | Já escritas: aplicar e fazer commit |
| `supabase/migrations/0039_fixture_staff_de_teste.sql` | Associação `staff` de `teste-staff` na organização de teste |
| `supabase/migrations/0040_contato_completo.sql` | Corrige os DDIs, cria as funções de formato, índices e `contatos_parecidos`, e a nova `salvar_cadastro` |
| `supabase/migrations/0041_criar_oportunidade.sql` | `public.criar_oportunidade` |
| `src/lib/contato.ts`, `src/lib/contato.casos.ts` | Regras puras e a lista de casos comum |
| `src/lib/parecidos.ts` | Tipos, `buscarParecidos()` e `respostaDaCriacao` (Zod) |
| `src/lib/use-formulario.ts`, `src/components/form-dialog.tsx` | Área de aviso e o reenvio com confirmação |
| `src/components/formulario-do-cadastro.tsx` | Área de aviso (só equipe); DDI obrigatório |
| `src/components/aviso-de-duplicado.tsx`, `aviso-de-oportunidade.tsx` | Os dois avisos |
| `src/features/people/{schema,actions}.ts` | Obrigatórios e a conferência de parecidos |
| `src/features/cadastro/{schema,actions,estado}.ts` | A mesma regra na ficha; parecidos na edição da equipe |
| `src/features/opportunities/actions.ts` | `createOpportunity` chama a RPC |
| `src/app/(app)/contatos/person-dialog.tsx`, `src/app/(app)/contatos/[id]/controles-da-ficha.tsx` | Telas de contato |
| `src/app/(app)/crm/opportunity-dialog.tsx` | Contato existente ou novo, com os dois avisos |
| `tests/contas.ts`, `tests/rls/README.md`, `.github/workflows/ci.yml` | A conta `staff` de teste |
| `tests/rls/contatos.test.ts`, `tests/rls/oportunidade-nova.test.ts` | Provas no banco (novos) |

---

## Entrega 0 — casa em ordem

### Tarefa 1: [Renato] cópia do banco antes das migrations

Não é código. Quem executa **para aqui** e espera o Renato dizer "cópia feita". Repete-se em cada dia em que houver migration.

- [ ] **Passo 0:** se faltar o `pg_dump`, o Renato instala o cliente do PostgreSQL (versão igual ou maior que a do banco).
- [ ] **Passo 1:** o Renato copia a *connection string* (modo **Session**, porta 5432) em Supabase → Connect.
- [ ] **Passo 2:** o Renato roda **no terminal dele, fora desta conversa** (a senha não pode entrar na transcrição), gravando **fora do repositório**:

  ```bash
  pg_dump "<connection string com a senha>" -Fc -f "C:\Backups\dulihub\dulihub-2026-11-17.dump"
  pg_restore --list "C:\Backups\dulihub\dulihub-2026-11-17.dump" | Select-Object -First 5
  ```

  Esperado: o `pg_restore --list` lista o conteúdo, sem erro.
- [ ] **Passo 3:** o Renato cifra o arquivo (7-Zip, AES-256, senha no cofre dele), guarda a cópia cifrada fora do Supabase e da VPS, e apaga o `.dump` sem cifra.
- [ ] **Passo 4:** o Renato confirma na conversa. Só então seguem as tarefas que aplicam migration (2, 3, 5 e 7).

### Tarefa 2: aplicar 0037 e 0038, com os testes que já estão escritos

O banco foi conferido em 17/nov: nenhuma das duas está aplicada. Os testes alterados em `tests/rls/papeis.test.ts` e `tests/rls/funil.test.ts` estão no disco, sem commit.

**Arquivos:** as duas migrations, os dois testes, `database.types.ts`, `docs/banco.md` e `docs/spec.md`.

- [ ] **Passo 1: vermelho.**

  Rodar: `bun x vitest run tests/rls/papeis.test.ts tests/rls/funil.test.ts --no-file-parallelism`

  Esperado: FALHA em "colaborador não cria contato já atribuído a um parceiro", "negócio novo não nasce ganho — nem pela API (G5)" e "nem em etapa terminal com status aberto, nem em Perdido".
- [ ] **Passo 2:** aplicar a 0037 e depois a 0038 pelo `apply_migration`, com os nomes `atribuicao_na_criacao` e `negocio_nasce_aberto` e o conteúdo exato dos arquivos. Regenerar os tipos.
- [ ] **Passo 3: verde.** Rodar o comando do Passo 1. Esperado: PASS.
- [ ] **Passo 4: documentação.**
  - Tirar todas as marcas "ainda não aplicada" e os asteriscos da 0037/0038: em `docs/banco.md` (`grep -n "0037\|0038\|não aplicada"`, hoje nas linhas 12-13, 55, 72, 80, 95, 204, 207, 215 e 237) e em `docs/spec.md` (linha O5 do §3, e as linhas 436 e 556).
- [ ] **Passo 5:** `bun run verify` verde e commit:

  ```bash
  git add supabase/migrations/0037_atribuicao_na_criacao.sql supabase/migrations/0038_negocio_nasce_aberto.sql tests/rls/papeis.test.ts tests/rls/funil.test.ts src/lib/supabase/database.types.ts docs/banco.md docs/spec.md
  git commit -m "fix(banco): atribuição na criação e negócio que nasce aberto (0037, 0038)"
  ```

### Tarefa 3 (parte A): [Renato] a conta `teste-staff`

- [ ] **Passo 1:** o Renato cria `teste-staff@duliconsulting.com` em Supabase → Authentication → Users, com **Auto Confirm User**.
- [ ] **Passo 2:** o Renato põe `RLS_SENHA_STAFF=…` no `.env.local` e cria o segredo `RLS_SENHA_STAFF` no GitHub (Settings → Secrets and variables → Actions).
- [ ] **Passo 3:** o Renato confirma.

### Tarefa 3 (parte B): fixture e contas da suíte

**Arquivos:**
- Criar: `supabase/migrations/0039_fixture_staff_de_teste.sql`
- Modificar:
  - `tests/contas.ts`, `tests/rls/README.md`, `.github/workflows/ci.yml`, `tests/rls/papeis.test.ts`, `docs/banco.md`, `docs/plano.md`;
  - os testes que leem `organization_members` com `.limit(1)` sem ordem — `financeiro.test.ts:125-129` e `:142-146`, `sincronia.test.ts:77-81`, `ficha-de-cadastro.test.ts:456-460` — passam a filtrar pelo `slug` da organização que querem.

**Interfaces — produz:** `Papel` inclui `"staff"`, com `EMAILS.staff = "teste-staff@duliconsulting.com"` e `SENHAS.staff = "RLS_SENHA_STAFF"`. `entrarComo("staff")` é o `staff` da organização de teste (as entregas 3 e 4 dependem dele).

- [ ] **Passo 1: teste que falha**, em `tests/rls/papeis.test.ts`. A variável se chama `staffDoTeste`, porque `staff` já é o colaborador na linha 39.

  ```ts
  it("teste-staff é staff da organização de teste, e só dela", async () => {
    const staffDoTeste = await entrarComo("staff");
    const eu = (await staffDoTeste.auth.getUser()).data.user!.id;
    const { data, error } = await staffDoTeste
      .from("organization_members")
      .select("role, organization:organizations(slug)")
      .eq("user_id", eu);
    expect(error).toBeNull();
    expect(data).toEqual([{ role: "staff", organization: { slug: "parceiro-teste" } }]);
  });
  ```
- [ ] **Passo 2:** acrescentar `staff` em `tests/contas.ts`, e o `RLS_SENHA_STAFF` no `env` do `ci.yml`, ao lado dos outros três.
- [ ] **Passo 3: vermelho.**

  Rodar: `bun x vitest run tests/rls/papeis.test.ts -t "teste-staff" --no-file-parallelism`

  Esperado: FALHA, `[]`.
- [ ] **Passo 4: a 0039**, no padrão idempotente da 0015 (`insert … select … from profiles p where p.email = 'teste-staff@duliconsulting.com' on conflict (organization_id, user_id) do update set role = 'staff'`). O comentário do topo diz por que a conta existe (spec §6.0). Aplicar, regenerar os tipos e atualizar o banco.md.
- [ ] **Passo 5: verde.** Rodar o comando do Passo 3. Esperado: PASS. Depois, rodar os quatro arquivos com `.limit(1)` corrigido. Esperado: PASS.
- [ ] **Passo 6:** linha nova no README (`teste-staff@duliconsulting.com | staff de "Parceiro de Teste"`) e `RLS_SENHA_STAFF=...` no bloco do `.env.local`. Em `docs/plano.md`: "Entrega 0 no ar (17/nov)".
- [ ] **Passo 7:** `bun run verify` verde e commit `test: conta staff da organização de teste (0039)`.
- [ ] **Passo 8: [Renato] push 1.** O código no ar não muda; só o banco e os testes.

---

## Entrega 1 — contato completo e sem duplicata

### Tarefa 4: regras do contato em TypeScript, com a lista de casos

**Arquivos:**
- Criar: `src/lib/contato.ts`, `src/lib/contato.casos.ts`, `src/lib/contato.test.ts`

**Interfaces — produz:**

```ts
export const DDI_PADRAO = "+55";
export type CampoDeContato = "email" | "ddi" | "telefone";
export type Contato = { email: string | null; ddi: string | null; telefone: string | null };
/** "55" e "+55" → "+55"; aparado; vazio → null; fora do formato → devolve como veio (o erro sai de erroDeContato). */
export function normalizarDdi(ddi: string | null): string | null;
/** A primeira regra da tabela das restrições globais que falha, na ordem e-mail → DDI → telefone. */
export function erroDeContato(contato: Contato): { campo: CampoDeContato; mensagem: string } | null;
// contato.casos.ts
export const CASOS_DE_CONTATO: { nome: string; contato: Contato; erro: string | null }[];
```

Reaproveita `soDigitos` de `src/lib/documentos.ts`. O aparo usa a mesma regra do SQL: `^\s+|\s+$`, inclusive tab e NBSP.

- [ ] **Passo 1: `CASOS_DE_CONTATO`.** Cada caso tem e-mail **diferente** dos outros, para a paridade da T7 não achar parecido entre casos.

  | nome | email | ddi | telefone | erro |
  |---|---|---|---|---|
  | completo | `caso1@teste.dulihub` | `+55` | `31 99999-0001` | `null` |
  | e-mail com espaço, tab e maiúscula | `\t Caso2@Teste.Dulihub ` | `+55` | `31999990002` | `null` |
  | DDI sem o mais | `caso3@teste.dulihub` | `55` | `31999990003` | `null` |
  | sem e-mail | `""` | `+55` | `31999990004` | `Informe o e-mail` |
  | e-mail sem domínio | `caso5@teste` | `+55` | `31999990005` | `E-mail inválido` |
  | sem DDI | `caso6@teste.dulihub` | `""` | `31999990006` | `Informe o DDI` |
  | DDI com letra | `caso7@teste.dulihub` | `+5a` | `31999990007` | `DDI inválido (ex.: +55)` |
  | sem telefone | `caso8@teste.dulihub` | `+55` | `""` | `Informe o telefone` |
  | telefone curto (7 dígitos) | `caso9@teste.dulihub` | `+55` | `9999-000` | `O telefone precisa ter de 8 a 15 dígitos` |
  | telefone longo (16 dígitos) | `caso10@teste.dulihub` | `+1` | `1234567890123456` | `O telefone precisa ter de 8 a 15 dígitos` |
  | EUA | `caso11@teste.dulihub` | `+1` | `(305) 555-0111` | `null` |
- [ ] **Passo 2: testes que falham** em `contato.test.ts`:
  - `it.each(CASOS_DE_CONTATO)("$nome", …)`, com `expect(erroDeContato(c.contato)?.mensagem ?? null).toBe(c.erro)`;
  - o campo certo: "sem DDI" → `campo = "ddi"`, "sem telefone" → `"telefone"`;
  - `normalizarDdi("55")` → `"+55"`, `normalizarDdi(" +1 ")` → `"+1"`, `normalizarDdi("")` → `null`.
- [ ] **Passo 3: vermelho.** `bun x vitest run src/lib/contato.test.ts`. Esperado: FALHA (módulo inexistente).
- [ ] **Passo 4:** implementar.
- [ ] **Passo 5: verde.** Rodar o comando do Passo 3. Esperado: PASS.
- [ ] **Passo 6:** commit `feat(contato): regras de telefone e e-mail, com a lista de casos`.

### Tarefa 5: o banco — DDIs corrigidos, formato, parecidos e a ficha (0040)

**Arquivos:**
- Criar: `supabase/migrations/0040_contato_completo.sql`, `tests/rls/contatos.test.ts`
- Modificar: `database.types.ts`, `docs/banco.md`

**Interfaces — produz:**
- **Correção de dado, antes de tudo:** `update public.people set phone_country_code = '+' || btrim(phone_country_code) where btrim(phone_country_code) ~ '^\d{1,4}$'`. O comentário registra a medição de "Dados de hoje".
- **Funções auxiliares** (`immutable`, `set search_path = ''`; `revoke execute … from public, anon`; `grant execute … to authenticated`, com um comentário dizendo que o índice e as funções `invoker` as avaliam com o papel de quem grava):
  - `private.aparar(t text) returns text` — `regexp_replace(t, '^\s+|\s+$', '', 'g')`, vazio → null;
  - `private.normalizar_ddi(ddi text) returns text`;
  - `private.telefone_nacional(ddi text, numero text) returns text` — dígitos do número; tira os dígitos do DDI da frente quando o número tem mais de 11 dígitos e começa por eles; vazio → null;
  - `private.contato_valido(email text, ddi text, telefone text) returns text` — a mensagem da tabela, ou null.
- **Índices:**
  - `people_email_normalizado` em `(organization_id, lower(private.aparar(email)))`;
  - `people_telefone_nacional` em `(organization_id, private.telefone_nacional(phone_country_code, phone))`;
  - o comentário avisa que mudar a função exige `reindex`.
- **RPC** `public.contatos_parecidos(p_email text, p_ddi text, p_telefone text, p_ignorar uuid default null) returns table (id uuid, full_name text, lifecycle_stage person_lifecycle_stage, na_lixeira boolean, bate_email boolean, bate_telefone boolean)`:
  - `security invoker`, `stable`, com a lixeira incluída e `p_ignorar` fora;
  - **entrada vazia nunca bate**, nem com coluna vazia nem com `''`;
  - no máximo 10 linhas, em ordem de nome;
  - `revoke … from public, anon; grant … to authenticated`.
- **`public.salvar_cadastro`:** `create or replace` com o cabeçalho inteiro da 0035 (`security invoker`, `set search_path = ''`).
  - O `phone_country_code` **continua** nas exceções de "Ficha incompleta" (0035:254 e :266).
  - Depois do passo 1, normaliza o DDI.
  - Quando qualquer uma das chaves `email`, `phone_country_code` ou `phone` está em `p_dados`, ou quando `p_completo`, calcula o valor final de cada uma (o de `p_dados` se presente, senão o da linha) e lança `private.contato_valido(...)` como `P0001` se não for nulo.
  - Isso substitui a conferência de e-mail própria da 0035.

- [ ] **Passo 1: testes que falham**, em `tests/rls/contatos.test.ts`, como `parceiro`, com dado aleatório por rodada:
  - **Contatos de apoio:**
    - Carlos, com `+55`, telefone `"31" + sufixo` e e-mail `carlos.<sufixo>@teste.dulihub`;
    - Antigo, **sem DDI**, com telefone `"31" + sufixo2`.

    Os dois são apagados em `afterAll`.
  - `"acha pelo telefone com o DDI digitado junto"`: `contatos_parecidos(null, '+55', '55' + telefoneDoCarlos)`, com `.some(p => p.id === carlos && p.bate_telefone)`.
  - `"acha o contato antigo sem DDI"`: `contatos_parecidos(null, '+55', '55' + telefoneDoAntigo)` acha o Antigo.
  - `"acha pelo e-mail com espaço e maiúscula"`.
  - `"acha quem está na lixeira, marcado"`.
  - `"não avisa sobre o próprio contato"`: com `p_ignorar = carlos`, a lista não contém Carlos.
  - `"entrada vazia não bate com ninguém"`: `contatos_parecidos('', '', '')` → zero linhas.
  - `"não mostra contato de outra organização"`: o colaborador da Duli com o telefone do Carlos, e a lista `not.toContain(carlos)`.
  - `"DDI 55 grava como +55"`: `salvar_cadastro(carlos, {phone_country_code: "55"})`, e a linha fica `+55`.
  - `"a equipe não apaga o e-mail pela ficha"`: `{email: ""}` → `Informe o e-mail`.
  - `"a ficha completa exige o DDI"`: ficha completa com `phone_country_code: ""` → `Informe o DDI`.
  - `"contato antigo sem e-mail ainda vai para a lixeira"`: este é uma **guarda**, verde desde o início.
- [ ] **Passo 2: vermelho.** `bun x vitest run tests/rls/contatos.test.ts --no-file-parallelism`. Esperado: FALHA (função inexistente), exceto a guarda.
- [ ] **Passo 3:** escrever a 0040, com o comentário do topo dizendo as decisões (obrigatório na tela e na função e não `not null`, spec §6.1; número nacional, Foco 1; correção dos DDIs). Aplicar.
- [ ] **Passo 4: logo depois de aplicar, antes de qualquer outra coisa,** gravar um contato na organização de teste pela API (como `parceiro`: `insert` em `people` com nome, e-mail, `+55` e telefone) e apagá-lo. Se falhar, a causa provável é o grant das auxiliares.
- [ ] **Passo 5:** regenerar os tipos e atualizar o banco.md. Rodar o comando do Passo 2. Esperado: PASS. Rodar também `bun x vitest run tests/rls/ficha-de-cadastro.test.ts --no-file-parallelism`. Esperado: PASS.
- [ ] **Passo 6:** commit `feat(banco): contato com formato, DDI corrigido e busca de parecidos (0040)`.

A partir daqui, a tela antiga continua no ar com a função nova. Editar Dados cadastrais de um dos 4 contatos sem e-mail ou telefone é recusado, com a frase no pé do formulário. A janela se fecha no push 2, logo após a T6.

### Tarefa 6: telas e ações de contato — obrigatórios e o aviso

**Arquivos:**
- Criar:
  - `src/lib/parecidos.ts`;
  - `src/components/aviso-de-duplicado.tsx` e `.test.tsx`;
  - `src/features/people/actions.test.ts`;
  - `src/app/(app)/contatos/person-dialog.test.tsx`.
- Modificar:
  - `src/lib/use-formulario.ts`, `src/components/form-dialog.tsx`, `src/components/form-dialog.test.tsx`;
  - `src/components/formulario-do-cadastro.tsx` e o seu teste;
  - `src/features/people/{schema,actions}.ts`, `schema.test.ts`;
  - `src/features/cadastro/{schema,actions,estado}.ts`, `schema.test.ts`;
  - `src/app/(app)/contatos/person-dialog.tsx`;
  - `src/app/(app)/contatos/[id]/controles-da-ficha.tsx` (é aqui que mora a edição da ficha pela equipe, `EditarCadastro` :34-79).

**Interfaces:**
- **Consome:** `erroDeContato`, `normalizarDdi` e `DDI_PADRAO` (T4); a RPC `contatos_parecidos` (T5).
- **Produz, em `src/lib/parecidos.ts`:**

  ```ts
  export type ContatoParecido = { id: string; nome: string; estagio: Enums<"person_lifecycle_stage">;
    naLixeira: boolean; bateEmail: boolean; bateTelefone: boolean };
  export type OportunidadeExistente = { id: string; titulo: string;
    status: Enums<"opportunity_status">; criadaEm: string /* timestamptz ISO */ };
  export type EstadoComConfirmacao = ActionState & {
    parecidos?: ContatoParecido[]; oportunidades?: OportunidadeExistente[] };
  export const CAMPO_CONFIRMAR_PARECIDO = "confirmar_contato_parecido";
  export const CAMPO_CONFIRMAR_OPORTUNIDADE = "confirmar_outra_oportunidade";
  export async function buscarParecidos(supabase: SupabaseClient<Database>,
    c: Contato & { ignorar?: string }): Promise<{ parecidos: ContatoParecido[]; error: string | null }>;
  ```
- **Produz, em `use-formulario.ts`:** `useFormulario` ganha `reenviarCom(form: HTMLFormElement, extra: Record<string, string>): void`. Ele monta `new FormData(form)`, acrescenta `extra` e despacha na mesma transição. A confirmação **nunca** é um campo do formulário.
- **Produz, em `form-dialog.tsx`:**
  - `FormDialog` fica genérico, `<E extends ActionState = ActionState>`, com a prop nova `aviso?: (estado: E, acoes: { fechar: () => void; reenviarCom: (extra: Record<string, string>) => void }) => React.ReactNode`, desenhada acima do `FieldError`;
  - o estado do formulário vive num componente interno, com `key` nova a cada abertura: reabrir não mostra aviso velho;
  - as outras 5 telas que usam `FormDialog` não mudam.
- **Produz, em `formulario-do-cadastro.tsx`:**
  - a mesma prop `aviso` (opcional), usada só pela equipe (`controles-da-ficha.tsx`);
  - resposta com `parecidos` conta como **não gravou**: não chama `aoGravar`.
- **Produz, em `src/components/aviso-de-duplicado.tsx`:**

  ```ts
  export function AvisoDeDuplicado(props: {
    parecidos: ContatoParecido[];
    modo: "criar" | "editar";
    aoUsarExistente: (id: string) => void;              // "Sim, é a mesma pessoa"
    aoRestaurar?: (id: string) => Promise<ActionState>;  // só para quem está na lixeira
    aoGravarMesmoAssim: () => void;                     // "Não" → "Criar/Salvar mesmo assim"
  }): React.ReactElement;
  ```

  Cada parecido é uma linha com "Telefone já cadastrado em" ou "E-mail já cadastrado em", o link `/contatos/<id>` (`target="_blank"`) com o nome, o estágio entre parênteses e "· na lixeira" quando for o caso.
- **Ações:**
  - `createPerson` e `updatePerson` passam a devolver `Promise<EstadoComConfirmacao>`;
  - `updatePerson` lê a linha atual e só confere parecidos se e-mail, DDI ou telefone **mudaram**, passando `ignorar: id`;
  - sem `formData.get(CAMPO_CONFIRMAR_PARECIDO) === "1"` e com parecidos, devolvem `{ error: null, parecidos, token: novoId() }` e **não gravam**;
  - `salvarCadastro` segue a mesma regra, com `ignorar: personId`, e devolve `EstadoDaFicha & { parecidos?: ContatoParecido[] }`.
- **Regra no schema:** `personSchema` usa `erroDeContato` num `superRefine`, pondo a mensagem no campo devolvido, e grava o DDI normalizado. `fichaDoFormulario` aplica `erroDeContato` **nos dois modos** e põe a mensagem em `campos[email|phone_country_code|phone]`. O `phone_country_code` sai de `OPCIONAIS`.

- [ ] **Passo 1: testes que falham.**
  - **`people/schema.test.ts`:**
    - os testes que dependiam de "só o nome é obrigatório" passam a afirmar o contrário: linhas 39, 44, 64, 76, 101 e 107 (o formulário da tela com e-mail ou telefone vazios recusa);
    - "Email inválido" vira "E-mail inválido" (:58);
    - a proteção "vazio vira null, não some" continua, agora em `company` e `job_title`;
    - mais `it.each(CASOS_DE_CONTATO)` por `personFromForm`, comparando com o mesmo `erro`.
  - **`cadastro/schema.test.ts`:**
    - :82 ("complemento e DDI podem ficar em branco") passa a exigir o DDI;
    - :204 ("só o nome é obrigatório") é invertido;
    - mais `it.each(CASOS_DE_CONTATO)` por `fichaDoFormulario(…, "parcial")`.
  - **`form-dialog.test.tsx`:**
    - `"reenviarCom manda o FormData do formulário mais o campo extra"`;
    - `"reabrir não mostra o aviso da abertura anterior"`;
    - `"estado com parecidos e sem ok não fecha o diálogo"`.
  - **`formulario-do-cadastro.test.tsx`:** `"resposta com parecidos não chama aoGravar e mostra o aviso"`.
  - **`aviso-de-duplicado.test.tsx`:**
    - `"diz qual dado bateu, com quem, o estágio e o link"` (texto "Telefone já cadastrado em", "(cliente)" e `href="/contatos/p1"` com `target="_blank"`);
    - `"marca quem está na lixeira e oferece Restaurar"`;
    - `"no criar, Não pergunta 'Criar outro contato com essas informações?' e Criar mesmo assim confirma"`;
    - `"no editar, Sim abre o existente e não grava"`.
  - **`people/actions.test.ts`**, com `vi.mock` de `@/lib/supabase/server`, `@/lib/organizacao` e `@/lib/parecidos`:
    - `"createPerson com parecido e sem confirmação não insere"`;
    - `"com confirmação, insere"`;
    - `"updatePerson sem mudar e-mail, DDI ou telefone não busca parecidos"`;
    - `"mudando o telefone, busca com ignorar = id"`.
  - **`buscarParecidos`:** `"traduz as linhas da RPC"`, com um cliente falso.
  - **`person-dialog.test.tsx`**, com `vi.mock("@/features/people/actions")`:
    - `"parecido mostra o aviso e não fecha"`;
    - `"Criar mesmo assim reenvia com confirmar_contato_parecido=1"`, inspecionando o `FormData` da segunda chamada.
- [ ] **Passo 2: vermelho.** Rodar `bun x vitest run` com os arquivos acima. Esperado: FALHA.
- [ ] **Passo 3: implementar.**
  - **Reescrever o comentário** de `people/schema.ts` com a decisão de 17/nov (spec §6.1).
  - **`person-dialog.tsx`:**
    - "Telefone \*", "Email \*" e "DDI \*", com `required`;
    - a descrição vira "Nome, telefone e e-mail são obrigatórios.";
    - "Sim, é a mesma pessoa" fecha e navega para `/contatos/<id>`;
    - "Restaurar" chama `restorePerson` e navega.
  - **`controles-da-ficha.tsx`:** a descrição ":58" vira "Nome, telefone e e-mail são obrigatórios."
- [ ] **Passo 4: verde.** Rodar o comando do Passo 2. Esperado: PASS. Depois, `bun run verify`.
- [ ] **Passo 5:** commit `feat(contatos): nome, telefone e e-mail obrigatórios, com aviso de contato já cadastrado`.
- [ ] **Passo 6: [Renato] push 2.** É o que fecha a janela da 0040 com a tela antiga.

### Tarefa 7: `criar_oportunidade` no banco (0041)

**Arquivos:**
- Criar: `supabase/migrations/0041_criar_oportunidade.sql`, `tests/rls/oportunidade-nova.test.ts`
- Modificar: `src/lib/parecidos.ts` (`respostaDaCriacao`), `src/lib/parecidos.test.ts`, `database.types.ts`, `docs/banco.md`

**Interfaces — produz** a RPC:

```
public.criar_oportunidade(
  p_contato uuid, p_novo_contato jsonb, p_etapa uuid, p_titulo text, p_origem text,
  p_confirmar_contato_parecido boolean, p_confirmar_outra_oportunidade boolean,
  p_valor numeric default null, p_moeda text default null) returns jsonb
```

- `security invoker`, uma transação. `revoke … from public, anon, authenticated; grant … to authenticated`.
- **Ordem das conferências** (nenhuma grava antes de todas passarem):
  1. **Exatamente um contato:** `p_contato` ou `p_novo_contato`, senão `P0001` "Escolha um contato ou preencha um novo".
  2. **A etapa:**
     - lida com a RLS de quem chama; invisível ou de organização da qual a pessoa não é membro → `42501` "Você não tem permissão para isto.";
     - terminal → `P0001` "Negócio novo começa numa etapa aberta. Para ganhar ou perder, mova o cartão." (checado aqui para não cair no `23514` da 0038, que vira uma frase genérica).
  3. **O título:** aparado e não vazio, senão `P0001` "Informe um título". `p_moeda` ∈ `BRL`/`USD` quando `p_valor` não é nulo, e `BRL` como padrão.
  4. **Contato existente:** da mesma organização da etapa, e fora da lixeira ("Este contato está na lixeira. Restaure antes."), senão `P0001`.
  5. **Contato novo:**
     - chaves `full_name`, `email`, `phone_country_code` e `phone`, todas aparadas;
     - sem nome → "Informe o nome";
     - `contato_valido` → `P0001` com a mensagem exata;
     - parecidos (`contatos_parecidos`) sem confirmação → devolve `{"situacao":"precisa_confirmar","parecidos":[{id,nome,estagio,na_lixeira,bate_email,bate_telefone}]}`.
  6. **Oportunidade existente** do contato, sem confirmação → `{"situacao":"precisa_confirmar","oportunidades":[{id,titulo,status,criada_em}]}`, com `criada_em = created_at` (timestamptz).
- **Grava:**
  - o contato novo, com a organização da etapa, `lifecycle_stage 'contact'`, DDI normalizado e `created_by`;
  - o negócio, com a organização da pessoa, `pipeline_id` e `probability` da etapa, `status 'open'`, `owner_id` e `created_by = auth.uid()`;
  - a promoção a `opportunity`, sem rebaixar `client`.
- **Devolve** `{"situacao":"criada","negocio":…,"pessoa":…}`.
- **Em `src/lib/parecidos.ts`:** `respostaDaCriacao` (Zod), de `Json` para `{ situacao: "criada"; negocio: string; pessoa: string } | { situacao: "precisa_confirmar"; parecidos: ContatoParecido[]; oportunidades: OportunidadeExistente[] }`, convertendo as chaves para camelCase.

- [ ] **Passo 1: testes que falham.** Como `parceiro`, na organização de teste, com dado aleatório; tudo que tiver `situacao = criada` é apagado pelo `pessoa` devolvido, em `finally`.
  - `"contato novo e negócio nascem juntos"`: a pessoa está na organização de teste, com `opportunity`; o negócio tem `owner_id` = `parceiro`.
  - `"contato parecido pede confirmação e não grava nada"`: nenhuma pessoa com o nome único da tentativa.
  - `"confirmado, cria o segundo contato com o mesmo telefone"`.
  - `"etapa terminal não cria nada"`, com a frase da 0038 e nenhuma pessoa com o nome da tentativa. A atomicidade em si vem de a RPC ser uma transação; o teste prova a ordem das conferências.
  - `"oportunidade existente pede confirmação; confirmada, cria a segunda"`.
  - `"contato na lixeira é recusado"`.
  - `"quem não é da organização da etapa é recusado"`: o colaborador da Duli com uma etapa da organização de teste → `42501`.
  - `"cliente continua cliente"`.
  - `it.each(CASOS_DE_CONTATO)("paridade: $nome")`: contato novo com aquele contato e as duas confirmações `true`. Quando `erro` não é nulo, espera erro com essa mensagem; quando é nulo, espera `situacao = criada`.
  - **`parecidos.test.ts`:** `"respostaDaCriacao traduz as duas situações e recusa formato desconhecido"`.
- [ ] **Passo 2: vermelho.** `bun x vitest run tests/rls/oportunidade-nova.test.ts --no-file-parallelism`. Esperado: FALHA.
- [ ] **Passo 3:** escrever a 0041 (o comentário do topo diz por que devolve `jsonb`: spec §4.5). Aplicar, regenerar os tipos e atualizar o banco.md.
- [ ] **Passo 4: verde.** Rodar o comando do Passo 2, `tests/rls/funil.test.ts` e `src/lib/parecidos.test.ts`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat(banco): criar oportunidade com contato novo, numa gravação só (0041)`.

### Tarefa 8: Nova oportunidade — contato existente ou novo, com os dois avisos

**Arquivos:**
- Criar: `src/components/aviso-de-oportunidade.tsx` e `.test.tsx`, `src/app/(app)/crm/opportunity-dialog.test.tsx`
- Modificar: `src/features/opportunities/actions.ts`, `src/app/(app)/crm/opportunity-dialog.tsx`

**Interfaces:**
- **Consome:** `EstadoComConfirmacao`, `CAMPO_CONFIRMAR_*`, `respostaDaCriacao`, `AvisoDeDuplicado` e `FormDialog<E>` com `aviso` (T6 e T7).
- **Produz:**

  ```ts
  export function AvisoDeOportunidade(props: {
    oportunidades: OportunidadeExistente[];
    aoCriarOutra: () => void;
  }): React.ReactElement; // título com link /crm/<id>, situação (aberta/ganha/perdida), data por formatarData
  ```
- **`createOpportunity(_prev, formData): Promise<EstadoComConfirmacao>`:**
  - lê `modo_contato` (`existente` | `novo`), `person_id`, `novo_full_name`, `novo_email`, `novo_phone_country_code`, `novo_phone`, `stage_id`, `title`, `value`, `currency`, `source` e os dois campos de confirmação;
  - valida o contato novo antes com `erroDeContato`;
  - chama a RPC e traduz a resposta com `respostaDaCriacao`;
  - `criada` revalida `/crm`, `/contatos` e `/`.
- **"Sim, é a mesma pessoa":**
  - grava o `person_id` num campo **oculto** e mostra o nome do escolhido, porque o seletor só tem os 500 primeiros e não tem a lixeira;
  - troca para `existente` e reenvia;
  - se o parecido está na lixeira, chama antes `restorePerson`, passado do `crm/page.tsx` como prop.

- [ ] **Passo 1: testes que falham:**
  - `opportunity-dialog.test.tsx`, com `vi.mock("@/features/opportunities/actions")`:
    - `"Novo contato mostra nome, DDI, telefone e e-mail obrigatórios"`;
    - `"parecido: Sim usa o existente mesmo fora da lista e reenvia"`: na segunda chamada, `modo_contato = existente` e `person_id` = o id do parecido;
    - `"parecido na lixeira: Sim restaura antes de usar"`;
    - `"oportunidade existente: Criar outra reenvia com confirmar_outra_oportunidade=1"`;
    - `"o valor digitado vai junto"`.
  - `aviso-de-oportunidade.test.tsx`: `"mostra título com link, situação e data"`.
- [ ] **Passo 2: vermelho.** `bun x vitest run "src/app/(app)/crm/opportunity-dialog.test.tsx" src/components/aviso-de-oportunidade.test.tsx`. Esperado: FALHA.
- [ ] **Passo 3: implementar.** O seletor "Contato existente | Novo contato" é um par de botões com `aria-pressed`, `rounded-xl`, com o ativo em `bg-primary`.
- [ ] **Passo 4: verde.** Rodar o comando do Passo 2. Esperado: PASS. Depois, `bun run verify`.
- [ ] **Passo 5:** commit `feat(crm): nova oportunidade com contato novo e aviso de oportunidade existente`.

### Tarefa 9: documentação, fumaça e revisão de código

- [ ] **Passo 1: spec técnica, §6.1.**
  - A comparação de telefone é por `telefone_nacional` (Foco 1), e o nome `telefone_normalizado` vira `telefone_nacional`.
  - O DDI aceita "55" e grava "+55", e a 0040 corrigiu os 76 antigos.
- [ ] **Passo 2:** `docs/spec.md`: CON-4, CON-8, CRM-11 e CRM-12 passam de ⬜ para ✅.
- [ ] **Passo 3:** `AGENTS.md`, tabela "UI: use o que já existe": linhas para `AvisoDeDuplicado` / `AvisoDeOportunidade` e para a área `aviso` do `FormDialog`.
- [ ] **Passo 4:** `docs/plano.md`: entrega 1 no ar, com a data.
- [ ] **Passo 5: fumaça.** Com `bun run dev` num terminal, rodar `bun run test:fumaca` no outro. Esperado: PASS. Teste da fumaça que cria contato sem e-mail ou telefone passa a mandar os dois.
- [ ] **Passo 6:** `bun run build` e `bun run verify` verdes. Commit `docs: entrega 1 do fluxo de cliente`.
- [ ] **Passo 7: revisão de código.** `superpowers:requesting-code-review` sobre o intervalo do primeiro ao último commit deste plano, com §6.0 e §6.1 da spec como requisito, em loop até não sobrar Crítico nem Importante. Achado recusado fica registrado com o motivo.
- [ ] **Passo 8:** tabela para o Renato: o que ficou pronto, como foi provado e o que ficou de fora.
- [ ] **Passo 9: [Renato] push 3.**

---

## Autorrevisão

- **Cobertura da spec §6.0–6.1:**
  - **Entrega 0:** cópia (T1), 0037/0038 (T2) e conta `staff` (T3).
  - **CON-8:**
    - diálogo (T6);
    - Dados cadastrais (T5, T6);
    - ficha pública com DDI (T5, T6);
    - `criar_oportunidade` (T7);
    - a importação não muda.
  - **CON-4:** criar e editar, com link e lixeira (T5, T6), e o servidor conferindo de novo (T6, T7).
  - **CRM-11 e CRM-12:** T7 e T8.
  - **Valor e moeda até a entrega 3:** T7 e T8.
  - **Paridade TS ↔ Zod ↔ SQL:** T4, T6 e T7.
- **Tipos:**
  - `EstadoComConfirmacao`, `ContatoParecido`, `OportunidadeExistente`, `CAMPO_CONFIRMAR_*` e `respostaDaCriacao` ficam em `src/lib/parecidos.ts` (T6/T7) e são usados na T8;
  - `erroDeContato` devolve `{campo, mensagem}` em todas as tarefas;
  - `telefone_nacional` só existe em SQL.
- **Produção:**
  - nenhuma migration sem a cópia;
  - a 0040 corrige os dados antes de exigir formato, e o teste de gravação vem logo depois de aplicar;
  - os pushes estão nos pontos que fecham cada janela.
