# Entregas 0 e 1 — casa em ordem e contato completo, sem duplicata — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** aplicar as migrations pendentes e a conta de teste nova (entrega 0). Depois, fazer todo contato nascer com nome, telefone e e-mail, avisar quando o contato ou a oportunidade já existem, e criar a oportunidade junto com um contato novo (entrega 1).

**Arquitetura:**
- As regras de formato do contato vivem duas vezes, por desenho: em TypeScript (`src/lib/contato.ts`) e em SQL (`private.contato_valido`). Uma mesma lista de casos prova que as duas dizem o mesmo.
- A busca de parecidos é uma RPC `security invoker`; a RLS decide quem aparece.
- Criar oportunidade passa a ser uma RPC numa transação (`criar_oportunidade`), que devolve `jsonb` com `precisa_confirmar` em vez de lançar erro, porque o aviso precisa da lista.
- As telas mostram o aviso num componente só (`AvisoDeDuplicado`).

**Tecnologia:** Next.js (App Router, Server Actions), Supabase (Postgres + RLS + PostgREST), Zod, Vitest + Testing Library, bun.

**Spec:** `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`, §6.0 e §6.1. Requisitos em `docs/spec.md`: CON-4, CON-8, CRM-11, CRM-12.

**Fora deste plano:** as entregas 2 a 4. Cada uma terá o seu plano, escrito quando a anterior estiver no ar.

## Restrições globais

- Pacotes com `bun`, nunca `npm`. Nunca ler valores do `.env.local`.
- **Banco:**
  - toda mudança de banco vira arquivo em `supabase/migrations/NNNN_nome.sql`;
  - ela é aplicada pelo conector do Supabase (`apply_migration`);
  - `src/lib/supabase/database.types.ts` é regenerado (`generate_typescript_types`) **no mesmo commit**.
- **Antes de aplicar qualquer migration desta entrega:** o `pg_dump` do Renato (Tarefa 1). Sem ele, não se aplica nada.
- **Função que muda de assinatura** é apagada e recriada, nunca `create or replace`, e depois vem o `revoke … from public, anon, authenticated` e o `grant` certo. Função nova em `public` nasce sem `execute` para `anon`.
- **Testes:**
  - teste vermelho antes do código;
  - teste de RLS que grava só grava na organização de teste ("Parceiro de Teste") e limpa o que criou em `finally`;
  - a pessoa "Cliente de Teste" (`fixture()`) nunca é apagada.
- **Interface:**
  - em português;
  - ícone passado como elemento (`icon={<X />}`), nunca como componente;
  - cores só por token (`text-primary`, `text-brand`…), nunca hex nem paleta do Tailwind;
  - raios: campo/botão `rounded-xl`, linha `rounded-2xl`, superfície `rounded-3xl`.
- **Server Action** devolve `ActionState` (`@/lib/action-state`), com sucesso por `gravou()`.
- **Antes de cada commit:** `bun run verify` verde e lint em zero. Nunca `--no-verify`. O `push` é do Renato.
- **Mensagens de validação de contato** (cópia exata, iguais no TS e no SQL):

| Situação | Mensagem |
|---|---|
| e-mail vazio | `Informe o e-mail` |
| e-mail fora do formato `^[^@\s]+@[^@\s]+\.[^@\s]+$` | `E-mail inválido` |
| DDI vazio | `Informe o DDI` |
| DDI fora de `^\+\d{1,4}$` | `DDI inválido (ex.: +55)` |
| telefone vazio | `Informe o telefone` |
| telefone com menos de 8 ou mais de 15 dígitos | `O telefone precisa ter de 8 a 15 dígitos` |

## Foco da revisão

Situações que a spec implica e que mais podem morder quem usa. Cada uma ganhou teste na tarefa dona.

1. **O mesmo telefone digitado de outro jeito.** Por exemplo, "5531999990000" no campo telefone com DDI +55, contra um contato antigo "31 99999-0000" sem DDI. Tem de avisar.
   - A comparação é pelo **número nacional** (dígitos do telefone, sem o DDI repetido na frente), e não por DDI + número. Isso avisa em mais casos, nunca em menos.
   - É um refinamento do §6.1 da spec, que a Tarefa 9 registra lá.
   - Teste na Tarefa 4 (unidade) e na Tarefa 5 (RLS).
2. **Editar um contato sem mexer no telefone não pode avisar "já cadastrado em ‹ele mesmo›".** Teste na Tarefa 5 (`p_ignorar`) e na Tarefa 6.
3. **Contato de outra organização nunca aparece no aviso** (o aviso não pode vazar a carteira alheia). Teste na Tarefa 5.
4. **Contato antigo sem e-mail:** editar só o nome é recusado com "Informe o e-mail" (Tarefa 6, `schema.test.ts`), e mandá-lo para a lixeira continua funcionando (Tarefa 5).
5. **"Sim, é a mesma pessoa" para um contato que está na lixeira** oferece restaurar, em vez de abrir um contato escondido. Teste na Tarefa 6.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0037_atribuicao_na_criacao.sql`, `0038_negocio_nasce_aberto.sql` | Já escritas; só aplicar e fazer commit |
| `supabase/migrations/0039_fixture_staff_de_teste.sql` | Associação `staff` da conta `teste-staff` na organização de teste |
| `supabase/migrations/0040_contato_completo.sql` | `private.telefone_nacional`, `private.contato_valido`, índices, `public.contatos_parecidos` e a nova `salvar_cadastro` |
| `supabase/migrations/0041_criar_oportunidade.sql` | `public.criar_oportunidade` |
| `src/lib/contato.ts` | Regras puras: dígitos, número nacional, `erroDeContato` |
| `src/lib/contato.casos.ts` | A lista de casos, comum ao teste de unidade e ao de RLS |
| `src/lib/parecidos.ts` | Tipos `ContatoParecido`, `OportunidadeExistente` e `EstadoComConfirmacao`, e `buscarParecidos()` |
| `src/components/aviso-de-duplicado.tsx` | O aviso de contato já cadastrado (criar e editar) |
| `src/components/aviso-de-oportunidade.tsx` | O aviso de oportunidade já existente |
| `src/features/people/schema.ts`, `actions.ts` | Obrigatórios e a conferência de parecidos |
| `src/features/cadastro/schema.ts`, `actions.ts`, `estado.ts` | DDI obrigatório na ficha; parecidos na edição da equipe |
| `src/features/opportunities/actions.ts` | `createOpportunity` chama a RPC |
| `src/app/(app)/contatos/person-dialog.tsx` | Campos obrigatórios e o aviso |
| `src/app/(app)/contatos/[id]/dados-cadastrais.tsx` | O aviso na edição da ficha |
| `src/app/(app)/crm/opportunity-dialog.tsx` | Contato existente ou novo; os dois avisos |
| `tests/contas.ts`, `tests/rls/README.md`, `.github/workflows/ci.yml` | A conta `staff` de teste |
| `tests/rls/contatos.test.ts` (novo), `tests/rls/oportunidade-nova.test.ts` (novo) | Provas no banco |

---

## Entrega 0 — casa em ordem

### Tarefa 1: [Renato] cópia do banco antes das migrations

Não é código. A pessoa que executa **para aqui** e espera o Renato dizer "cópia feita".

- [ ] **Passo 0:** se o `pg_dump` não estiver instalado, o Renato instala o cliente do PostgreSQL (versão igual ou maior que a do banco).
- [ ] **Passo 1:** o Renato copia a *connection string* (modo **Session**, porta 5432) em Supabase → Connect.
- [ ] **Passo 2:** o Renato roda, no terminal dele (o `!` faz rodar nesta sessão):

  ```bash
  ! pg_dump "<connection string com a senha>" -Fc -f "dulihub-2026-11-17.dump"
  ```

  Resultado esperado: o arquivo `.dump` com mais de 0 bytes.
- [ ] **Passo 3:** o Renato cifra o arquivo (7-Zip, AES-256, senha guardada no cofre dele), guarda **fora** do Supabase e da VPS, e apaga o `.dump` sem cifra.
- [ ] **Passo 4:** o Renato confirma na conversa. Só então seguem as tarefas que aplicam migration (2, 3, 5 e 7).

Repete-se antes de cada sessão de migrations em dia diferente.

### Tarefa 2: aplicar 0037 e 0038, com os testes que já estão escritos

O banco foi conferido em 17/nov: a 0037 e a 0038 **não** estão aplicadas. O gatilho `people_organizacao_fixa` ainda é só de `update`, e `private.negocio_nasce_aberto` não existe. Os testes alterados em `tests/rls/papeis.test.ts` e `tests/rls/funil.test.ts` já estão no disco, sem commit.

**Arquivos:**
- Aplicar: `supabase/migrations/0037_atribuicao_na_criacao.sql`, `supabase/migrations/0038_negocio_nasce_aberto.sql`
- Testes (já escritos): `tests/rls/papeis.test.ts`, `tests/rls/funil.test.ts`
- Modificar: `src/lib/supabase/database.types.ts`, `docs/banco.md`, `docs/spec.md`

- [ ] **Passo 1: confirmar o vermelho**

  Rodar: `bun run test:rls -- tests/rls/papeis.test.ts tests/rls/funil.test.ts`

  Esperado: FALHA em "colaborador não cria contato já atribuído a um parceiro" (sem 42501), "negócio novo não nasce ganho — nem pela API (G5)" e "nem em etapa terminal com status aberto, nem em Perdido".
- [ ] **Passo 2: aplicar a 0037 e depois a 0038**, pelo `apply_migration` do conector do Supabase, com os nomes `atribuicao_na_criacao` e `negocio_nasce_aberto` e o conteúdo exato dos arquivos.
- [ ] **Passo 3: regenerar `database.types.ts`** (`generate_typescript_types`).
- [ ] **Passo 4: verde.** Rodar o comando do Passo 1. Esperado: PASS.
- [ ] **Passo 5: atualizar a documentação.**
  - `docs/banco.md`: tirar "(0037, ainda não aplicada)" e "(0038, ainda não aplicada)".
  - `docs/spec.md`: na linha O5 do §3, tirar "migration 0037 não aplicada".
- [ ] **Passo 6:** `bun run verify` verde.
- [ ] **Passo 7: commit**

  ```bash
  git add supabase/migrations/0037_atribuicao_na_criacao.sql supabase/migrations/0038_negocio_nasce_aberto.sql tests/rls/papeis.test.ts tests/rls/funil.test.ts src/lib/supabase/database.types.ts docs/banco.md docs/spec.md
  git commit -m "fix(banco): atribuição na criação e negócio que nasce aberto (0037, 0038)"
  ```

### Tarefa 3 (parte A): [Renato] a conta `teste-staff`

- [ ] **Passo 1:** o Renato cria `teste-staff@duliconsulting.com` em Supabase → Authentication → Users, com **Auto Confirm User** marcado.
- [ ] **Passo 2:** o Renato põe `RLS_SENHA_STAFF=…` no `.env.local` e cria o segredo `RLS_SENHA_STAFF` no GitHub (Settings → Secrets and variables → Actions).
- [ ] **Passo 3:** o Renato confirma. Segue a parte B.

### Tarefa 3 (parte B): fixture e contas da suíte

**Arquivos:**
- Criar: `supabase/migrations/0039_fixture_staff_de_teste.sql`
- Modificar: `tests/contas.ts`, `tests/rls/README.md`, `.github/workflows/ci.yml`, `tests/rls/papeis.test.ts`

**Interfaces:**
- Produz: `Papel` passa a incluir `"staff"`, com `EMAILS.staff = "teste-staff@duliconsulting.com"` e `SENHAS.staff = "RLS_SENHA_STAFF"`. `entrarComo("staff")` é a conta `staff` da organização de teste, e as entregas 3 e 4 dependem dela.

- [ ] **Passo 1: escrever o teste que falha** em `tests/rls/papeis.test.ts`:

  ```ts
  it("teste-staff é staff da organização de teste, e só dela", async () => {
    const staff = await entrarComo("staff");
    const { data } = await staff.from("organization_members").select("role, organization:organizations(slug)");
    const minhas = (data ?? []).filter((m) => m.organization?.slug === "parceiro-teste");
    expect(minhas.map((m) => m.role)).toEqual(["staff"]);
  });
  ```

  O filtro deixa o teste de pé mesmo se a leitura de `organization_members` mostrar outras associações. O que se afirma é a linha da organização de teste.
- [ ] **Passo 2:** acrescentar `staff` em `tests/contas.ts` e o `RLS_SENHA_STAFF` no `env` do `ci.yml`, ao lado dos outros três.
- [ ] **Passo 3: rodar e ver falhar.**

  Rodar: `bun run test:rls -- tests/rls/papeis.test.ts -t "teste-staff"`

  Esperado: FALHA, `[]` diferente de `["staff"]`.
- [ ] **Passo 4: escrever a `0039_fixture_staff_de_teste.sql`**, no padrão idempotente da 0015: `insert into organization_members … select … from profiles p where p.email = 'teste-staff@duliconsulting.com' on conflict (organization_id, user_id) do update set role = 'staff'`. O comentário do topo diz por que a conta existe (spec §6.0). Aplicar pelo conector e regenerar os tipos.
- [ ] **Passo 5:** rodar o comando do Passo 3. Esperado: PASS.
- [ ] **Passo 6:** acrescentar a linha `teste-staff@duliconsulting.com | staff de "Parceiro de Teste"` na tabela do `tests/rls/README.md`, e `RLS_SENHA_STAFF=...` no bloco do `.env.local`.
- [ ] **Passo 7:** `bun run verify` verde e commit:

  ```bash
  git add supabase/migrations/0039_fixture_staff_de_teste.sql src/lib/supabase/database.types.ts tests/contas.ts tests/rls/README.md tests/rls/papeis.test.ts .github/workflows/ci.yml
  git commit -m "test: conta staff da organização de teste (0039)"
  ```

---

## Entrega 1 — contato completo e sem duplicata

### Tarefa 4: regras do contato em TypeScript, com a lista de casos

**Arquivos:**
- Criar: `src/lib/contato.ts`, `src/lib/contato.casos.ts`, `src/lib/contato.test.ts`

**Interfaces — produz:**

```ts
export const DDI_PADRAO = "+55";
export function digitos(valor: string | null | undefined): string;
/** Dígitos do telefone; tira o DDI da frente quando ele foi digitado junto
 *  (o número tem mais de 11 dígitos e começa pelos dígitos do DDI). Vazio → null. */
export function telefoneNacional(ddi: string | null, numero: string | null): string | null;
export type Contato = { email: string | null; ddi: string | null; telefone: string | null };
/** A primeira mensagem da tabela das restrições globais que se aplica, na ordem
 *  e-mail → DDI → telefone; null quando está tudo certo. Apara espaço antes. */
export function erroDeContato(contato: Contato): string | null;
// contato.casos.ts
export const CASOS_DE_CONTATO: { nome: string; contato: Contato; erro: string | null }[];
```

- [ ] **Passo 1: escrever `CASOS_DE_CONTATO`** com, no mínimo, estes casos (o `nome` é o rótulo do teste):

  | nome | email | ddi | telefone | erro |
  |---|---|---|---|---|
  | completo | `ana@x.com` | `+55` | `31 99999-0000` | `null` |
  | e-mail com espaço e maiúscula | `  Ana@X.com ` | `+55` | `31999990000` | `null` |
  | sem e-mail | `""` | `+55` | `31999990000` | `Informe o e-mail` |
  | e-mail sem domínio | `ana@x` | `+55` | `31999990000` | `E-mail inválido` |
  | sem DDI | `ana@x.com` | `""` | `31999990000` | `Informe o DDI` |
  | DDI sem mais | `ana@x.com` | `55` | `31999990000` | `DDI inválido (ex.: +55)` |
  | sem telefone | `ana@x.com` | `+55` | `""` | `Informe o telefone` |
  | telefone curto | `ana@x.com` | `+55` | `9999-000` | `O telefone precisa ter de 8 a 15 dígitos` |
  | telefone longo | `ana@x.com` | `+1` | `1234567890123456` | `O telefone precisa ter de 8 a 15 dígitos` |
  | EUA | `john@x.com` | `+1` | `(305) 555-0100` | `null` |
- [ ] **Passo 2: escrever os testes que falham** em `src/lib/contato.test.ts`:
  - `it.each(CASOS_DE_CONTATO)("$nome", …)`, com `expect(erroDeContato(c.contato)).toBe(c.erro)`;
  - `telefoneNacional("+55", "5531999990000")` → `"31999990000"`;
  - `telefoneNacional("+55", "(31) 99999-0000")` → `"31999990000"`;
  - `telefoneNacional(null, "31 99999 0000")` → `"31999990000"`;
  - `telefoneNacional("+1", "13055550100")` → `"13055550100"` (11 dígitos: não tira);
  - `telefoneNacional("+55", "")` → `null`.
- [ ] **Passo 3:** rodar `bun run test -- src/lib/contato.test.ts`. Esperado: FALHA (módulo inexistente).
- [ ] **Passo 4:** implementar `src/lib/contato.ts`. As expressões são as da tabela das restrições globais.
- [ ] **Passo 5:** rodar o comando do Passo 3. Esperado: PASS.
- [ ] **Passo 6: commit** — `feat(contato): regras de telefone e e-mail, com a lista de casos`.

### Tarefa 5: o banco — formato, parecidos e a ficha (0040)

**Arquivos:**
- Criar: `supabase/migrations/0040_contato_completo.sql`, `tests/rls/contatos.test.ts`
- Modificar: `src/lib/supabase/database.types.ts`

**Interfaces — produz:**
- `private.telefone_nacional(ddi text, numero text) returns text`: `immutable`, a mesma regra de `telefoneNacional`.
- `private.contato_valido(email text, ddi text, telefone text) returns text`: `immutable`, a mesma ordem e as mesmas mensagens de `erroDeContato`. `grant execute … to authenticated`; `revoke … from public, anon`.
- Índices: `people_email_normalizado` em `(organization_id, lower(btrim(email)))` e `people_telefone_nacional` em `(organization_id, private.telefone_nacional(phone_country_code, phone))`.
- RPC `public.contatos_parecidos(p_email text, p_ddi text, p_telefone text, p_ignorar uuid default null) returns table (id uuid, full_name text, lifecycle_stage person_lifecycle_stage, na_lixeira boolean, bate_email boolean, bate_telefone boolean)`:
  - `security invoker`, `stable`;
  - compara o e-mail por `lower(btrim())` e o telefone por `telefone_nacional`;
  - inclui a lixeira e exclui `p_ignorar`;
  - no máximo 10 linhas, em ordem de nome;
  - entrada vazia nunca bate com coluna vazia;
  - `revoke … from public, anon; grant … to authenticated`.
- `public.salvar_cadastro` com o mesmo corpo e a mesma assinatura (`create or replace`), mais duas coisas:
  1. o DDI deixa de ser opcional no modo completo;
  2. quando qualquer uma das chaves `email`, `phone_country_code` ou `phone` está em `p_dados`, ou quando `p_completo`, a função calcula o valor final de cada uma (o de `p_dados` se presente, senão o da linha atual) e lança `private.contato_valido(...)` como `P0001` se não for nulo. Isso substitui a conferência de e-mail própria da 0035.

- [ ] **Passo 1: escrever os testes que falham** em `tests/rls/contatos.test.ts`, como `parceiro` (gestão da organização de teste), criando pessoas descartáveis e apagando-as em `afterAll`:
  - `"acha pelo telefone escrito de outro jeito"`: Carlos com `+55` / `31 99999-0000`. Chamar `contatos_parecidos(null, '+55', '5531999990000')` devolve Carlos com `bate_telefone = true`.
  - `"acha pelo e-mail sem diferenciar maiúscula"`: `contatos_parecidos(' CARLOS@X.COM', null, null)` → Carlos, `bate_email = true`.
  - `"acha quem está na lixeira, marcado"`: Carlos com `deleted_at` preenchido → `na_lixeira = true`.
  - `"não avisa sobre o próprio contato"`: com `p_ignorar` = Carlos → zero linhas.
  - `"não mostra contato de outra organização"`: `entrarComo("colaborador")` (Duli) chamando com o telefone do Carlos → zero linhas.
  - `"a equipe não apaga o e-mail pela ficha"`: `salvar_cadastro(Carlos, {email: ""})` → erro com a mensagem `Informe o e-mail`.
  - `"a ficha completa exige o DDI"`: `salvar_cadastro(Carlos, {…ficha completa sem phone_country_code…}, true)` → `Informe o DDI`.
  - `"contato antigo sem e-mail ainda vai para a lixeira"`: pessoa inserida sem e-mail, com `update {deleted_at}` → sem erro.
- [ ] **Passo 2:** rodar `bun run test:rls -- tests/rls/contatos.test.ts`. Esperado: FALHA (função inexistente).
- [ ] **Passo 3:** escrever a 0040, com o comentário do topo dizendo a decisão: obrigatório na tela e na função, **não** `not null` (spec §6.1); e comparação pelo número nacional (Foco da revisão, item 1). Aplicar pelo conector e regenerar os tipos.
- [ ] **Passo 4:** rodar o comando do Passo 2. Esperado: PASS. Rodar também `bun run test:rls -- tests/rls/ficha-de-cadastro.test.ts`. Esperado: PASS; se algum caso desse arquivo mandava a ficha sem DDI, ele passa a mandar `+55`.
- [ ] **Passo 5: commit** — `feat(banco): contato com formato e busca de parecidos (0040)`.

### Tarefa 6: telas e ações de contato — obrigatórios e o aviso

**Arquivos:**
- Criar: `src/lib/parecidos.ts`, `src/components/aviso-de-duplicado.tsx`, `src/components/aviso-de-duplicado.test.tsx`, `src/app/(app)/contatos/person-dialog.test.tsx`
- Modificar:
  - `src/features/people/schema.ts`, `src/features/people/schema.test.ts`, `src/features/people/actions.ts`
  - `src/features/cadastro/schema.ts` (tirar `phone_country_code` de `OPCIONAIS`; no modo `parcial`, e-mail, DDI e telefone usam `erroDeContato`), `src/features/cadastro/estado.ts`, `src/features/cadastro/actions.ts`
  - `src/app/(app)/contatos/person-dialog.tsx`, `src/app/(app)/contatos/[id]/dados-cadastrais.tsx`, `src/app/(app)/contatos/[id]/dados-cadastrais.test.tsx`
  - `src/components/formulario-do-cadastro.tsx` (DDI obrigatório, `+55` já preenchido)

**Interfaces:**
- Consome: `erroDeContato`, `DDI_PADRAO` (Tarefa 4); a RPC `contatos_parecidos` (Tarefa 5).
- Produz, em `src/lib/parecidos.ts`:

  ```ts
  export type ContatoParecido = { id: string; nome: string; estagio: Enums<"person_lifecycle_stage">;
    naLixeira: boolean; bateEmail: boolean; bateTelefone: boolean };
  export type OportunidadeExistente = { id: string; titulo: string;
    status: Enums<"opportunity_status">; criadaEm: string };
  export type EstadoComConfirmacao = ActionState & {
    parecidos?: ContatoParecido[]; oportunidades?: OportunidadeExistente[] };
  export const CAMPO_CONFIRMAR_PARECIDO = "confirmar_contato_parecido";
  export const CAMPO_CONFIRMAR_OPORTUNIDADE = "confirmar_outra_oportunidade";
  export async function buscarParecidos(supabase: SupabaseClient<Database>,
    c: Contato & { ignorar?: string }): Promise<{ parecidos: ContatoParecido[]; error: string | null }>;
  ```
- Produz, em `src/components/aviso-de-duplicado.tsx`:

  ```ts
  export function AvisoDeDuplicado(props: {
    parecidos: ContatoParecido[];
    modo: "criar" | "editar";
    aoUsarExistente: (id: string) => void;           // "Sim, é a mesma pessoa"
    aoRestaurar?: (id: string) => Promise<ActionState>; // só para quem está na lixeira
    aoGravarMesmoAssim: () => void;                    // "Não" → confirmar
  }): React.ReactElement;
  ```

- `createPerson` e `updatePerson` passam a devolver `Promise<EstadoComConfirmacao>`. Sem `formData.get(CAMPO_CONFIRMAR_PARECIDO) === "1"` e com parecidos, devolvem `{ error: null, parecidos, token: novoId() }` e **não gravam**. `updatePerson` passa `ignorar: id`.
- `salvarCadastro` faz o mesmo e devolve `EstadoDaFicha & { parecidos?: ContatoParecido[] }`.

- [ ] **Passo 1: escrever os testes que falham.**
  - `schema.test.ts`: o teste que afirmava "só o nome é obrigatório" é **invertido**. O formulário da tela com e-mail vazio devolve `Informe o e-mail`, e com telefone vazio devolve `Informe o telefone`. Com tudo preenchido, passa.
  - `aviso-de-duplicado.test.tsx`:
    - `"diz qual dado bateu e com quem, com o link"`: `bateTelefone` → o texto "Telefone já cadastrado em" e um link para `/contatos/<id>` com `target="_blank"`.
    - `"no criar, Não pergunta 'Criar outro contato com essas informações?' e Criar mesmo assim confirma"`: espera `aoGravarMesmoAssim` chamado uma vez.
    - `"no editar, Sim abre o existente e não grava"`: `aoUsarExistente("p1")` chamado e `aoGravarMesmoAssim` não.
    - `"quem está na lixeira ganha Restaurar"`: `naLixeira` → o botão "Restaurar", que chama `aoRestaurar("p1")`.
  - `person-dialog.test.tsx`, com `vi.mock("@/features/people/actions")` no padrão de `crm/dialogos.test.tsx`:
    - `"a primeira gravação com parecido mostra o aviso e não fecha"`;
    - `"Criar mesmo assim reenvia com confirmar_contato_parecido=1"`: inspecionar o `FormData` da segunda chamada.
  - `dados-cadastrais.test.tsx`: `"parecido ao salvar a ficha mostra o mesmo aviso"`.
- [ ] **Passo 2:** rodar `bun run test -- src/components/aviso-de-duplicado.test.tsx "src/app/(app)/contatos" src/features/people`. Esperado: FALHA.
- [ ] **Passo 3: implementar.**
  - `personSchema` usa `erroDeContato` num `superRefine` sobre `email`, `phone_country_code` e `phone`, para a mensagem sair da mesma função.
  - Reescrever o comentário de `people/schema.ts` com a decisão de 17/nov (spec §6.1).
  - `person-dialog.tsx`:
    - "Telefone \*", "Email \*" e "DDI \*", com `required`;
    - descrição "Nome, telefone e e-mail são obrigatórios.";
    - o aviso aparece **dentro** do formulário, acima dos botões;
    - "Criar mesmo assim" põe `<input type="hidden" name="confirmar_contato_parecido" value="1">` e chama `form.requestSubmit()`;
    - "Sim, é a mesma pessoa" fecha o diálogo e navega para `/contatos/<id>`.
- [ ] **Passo 4:** rodar o comando do Passo 2. Esperado: PASS. Depois, `bun run verify`.
- [ ] **Passo 5: commit** — `feat(contatos): nome, telefone e e-mail obrigatórios, com aviso de contato já cadastrado`.

### Tarefa 7: `criar_oportunidade` no banco (0041)

**Arquivos:**
- Criar: `supabase/migrations/0041_criar_oportunidade.sql`, `tests/rls/oportunidade-nova.test.ts`
- Modificar: `src/lib/supabase/database.types.ts`

**Interfaces — produz** a RPC:

```
public.criar_oportunidade(
  p_contato uuid, p_novo_contato jsonb, p_etapa uuid, p_titulo text, p_origem text,
  p_confirmar_contato_parecido boolean, p_confirmar_outra_oportunidade boolean,
  p_valor numeric default null, p_moeda text default null) returns jsonb
```

- `security invoker`, uma transação. `revoke … from public, anon, authenticated`; `grant … to authenticated`.
- **Entrada:**
  - exatamente um entre `p_contato` e `p_novo_contato`; senão, `P0001` "Escolha um contato ou preencha um novo";
  - `p_novo_contato` traz as chaves `full_name`, `email`, `phone_country_code` e `phone`;
  - `p_moeda` ∈ `BRL` ou `USD` quando `p_valor` não é nulo.
- **Organização:**
  - é a do funil de `p_etapa`;
  - recusa `42501` "Você não tem permissão para isto." se quem chama não é membro dela;
  - com `p_contato`, a pessoa tem de ser dessa organização.
- **Contato novo:** valida com `contato_valido` (`P0001`, mensagem exata). Sem `p_confirmar_contato_parecido` e com parecido (`contatos_parecidos`), devolve `{"situacao":"precisa_confirmar","parecidos":[...]}` **sem gravar nada**.
- **Oportunidade existente:** sem `p_confirmar_outra_oportunidade` e com oportunidade do contato, devolve `{"situacao":"precisa_confirmar","oportunidades":[{id,titulo,status,criada_em}]}`.
- **Grava:**
  - o contato novo, com `lifecycle_stage 'contact'` e `created_by = auth.uid()`;
  - o negócio, com a organização da pessoa, `pipeline_id` da etapa, `probability` da etapa, `status 'open'`, `owner_id` e `created_by = auth.uid()`;
  - a promoção a `opportunity` sem rebaixar `client`;
  - etapa terminal → `P0001` "Negócio novo começa numa etapa aberta. Para ganhar ou perder, mova o cartão." (a mesma frase da 0038).
- **Devolve** `{"situacao":"criada","negocio":<uuid>,"pessoa":<uuid>}`.

- [ ] **Passo 1: escrever os testes que falham** (como `parceiro`, na organização de teste, apagando as pessoas criadas em `finally`):
  - `"contato novo e negócio nascem juntos"`: `situacao = criada`; a pessoa está na organização de teste com `lifecycle_stage = 'opportunity'`; o negócio tem `owner_id` = o `parceiro`.
  - `"contato parecido pede confirmação e não grava nada"`: contar `people` antes e depois (iguais), com `parecidos[0].id` = o Carlos.
  - `"confirmado, cria o segundo contato com o mesmo telefone"`.
  - `"etapa terminal não deixa contato pela metade"`: erro e contagem de `people` igual.
  - `"oportunidade existente pede confirmação; confirmada, cria a segunda"`: `oportunidades[0].criada_em` presente.
  - `"quem não é da organização da etapa é recusado"`: `entrarComo("colaborador")` com uma etapa da organização de teste → código `42501`.
  - `"cliente continua cliente"`: pessoa `client` → nova oportunidade → estágio `client`.
  - `it.each(CASOS_DE_CONTATO)` (de `@/lib/contato.casos`) `"paridade: $nome"`: contato novo com aquele contato → erro com `c.erro` quando não nulo; `situacao = criada` quando nulo, com a pessoa apagada depois. **Usa telefones únicos por caso** (sufixo do índice), para um caso não ser parecido com outro.
- [ ] **Passo 2:** rodar `bun run test:rls -- tests/rls/oportunidade-nova.test.ts`. Esperado: FALHA.
- [ ] **Passo 3:** escrever a 0041 (o comentário do topo diz por que devolve `jsonb` e não erro: spec §4.5). Aplicar e regenerar os tipos.
- [ ] **Passo 4:** rodar o comando do Passo 2 e também `tests/rls/funil.test.ts`. Esperado: PASS.
- [ ] **Passo 5: commit** — `feat(banco): criar oportunidade com contato novo, numa gravação só (0041)`.

### Tarefa 8: Nova oportunidade — contato existente ou novo, com os dois avisos

**Arquivos:**
- Criar: `src/components/aviso-de-oportunidade.tsx`, `src/app/(app)/crm/opportunity-dialog.test.tsx`
- Modificar: `src/features/opportunities/actions.ts` (`createOpportunity` e o `opportunitySchema` dela), `src/app/(app)/crm/opportunity-dialog.tsx`

**Interfaces:**
- Consome: `EstadoComConfirmacao`, `CAMPO_CONFIRMAR_*` e `AvisoDeDuplicado` (Tarefa 6); a RPC `criar_oportunidade` (Tarefa 7).
- Produz:

  ```ts
  export function AvisoDeOportunidade(props: {
    oportunidades: OportunidadeExistente[];
    aoCriarOutra: () => void;
  }): React.ReactElement;
  ```

- `createOpportunity(_prev, formData): Promise<EstadoComConfirmacao>` lê:
  - `modo_contato` (`existente` | `novo`);
  - `person_id`, ou `novo_full_name`, `novo_email`, `novo_phone_country_code` e `novo_phone`;
  - `stage_id`, `title`, `value`, `currency`, `source`;
  - os dois campos de confirmação.

  Chama `supabase.rpc("criar_oportunidade", …)`. Com `precisa_confirmar`, devolve `parecidos` ou `oportunidades`. Com `criada`, revalida `/crm`, `/contatos` e `/` e devolve `gravou()`.
- O contato novo é validado antes com `erroDeContato`, para a mensagem sair sem ida ao banco.

- [ ] **Passo 1: escrever os testes que falham** em `opportunity-dialog.test.tsx` (com `vi.mock("@/features/opportunities/actions")`):
  - `"Novo contato mostra nome, DDI, telefone e e-mail obrigatórios"`;
  - `"parecido mostra o aviso; Sim troca para o contato existente e reenvia"`: na segunda chamada, `modo_contato = existente` e `person_id = id do parecido`;
  - `"oportunidade existente mostra título, situação e data; Criar outra reenvia com confirmar_outra_oportunidade=1"`;
  - `"o valor digitado vai junto"`: `value` e `currency` no `FormData`.
- [ ] **Passo 2:** rodar `bun run test -- "src/app/(app)/crm/opportunity-dialog.test.tsx"`. Esperado: FALHA.
- [ ] **Passo 3: implementar.**
  - O seletor "Contato existente | Novo contato" é um par de botões com `aria-pressed`, `rounded-xl`, com o ativo em `bg-primary`.
  - O aviso fica dentro do formulário, acima dos botões.
  - A situação aparece como "aberta", "ganha" ou "perdida", e a data no formato de `formatarData`.
- [ ] **Passo 4:** rodar o comando do Passo 2. Esperado: PASS. Depois, `bun run verify`.
- [ ] **Passo 5: commit** — `feat(crm): nova oportunidade com contato novo e aviso de oportunidade existente`.

### Tarefa 9: documentação, fumaça e revisão de código

**Arquivos:**
- Modificar: `docs/spec.md`, `docs/banco.md`, `docs/plano.md`, `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`

- [ ] **Passo 1: spec técnica, §6.1.**
  - A comparação de telefone passa a ser por `telefone_nacional` (número nacional, sem o DDI repetido), e não por DDI + número, com o motivo do Foco da revisão, item 1.
  - O nome `telefone_normalizado` vira `telefone_nacional`.
- [ ] **Passo 2: `docs/spec.md`.** CON-4, CON-8, CRM-11 e CRM-12 passam de ⬜ para ✅.
- [ ] **Passo 3: `docs/banco.md`.**
  - Em §3 (RPC), entram `contatos_parecidos` e `criar_oportunidade`.
  - Em §1, entram as funções auxiliares `telefone_nacional` e `contato_valido`.
  - A `salvar_cadastro` passa a exigir e-mail, DDI e telefone.
  - Entra a fixture 0039.
- [ ] **Passo 4: `docs/plano.md`.** Entregas 0 e 1 no ar, com a data.
- [ ] **Passo 5: fumaça.** Com `bun run dev` num terminal, rodar `bun run test:fumaca` no outro. Esperado: PASS. Se algum teste da fumaça cria contato sem e-mail ou telefone, ele passa a mandar os dois.
- [ ] **Passo 6:** `bun run build` e `bun run verify` verdes. Commit `docs: entregas 0 e 1 do fluxo de cliente`.
- [ ] **Passo 7: revisão de código.** `superpowers:requesting-code-review` sobre o intervalo do primeiro ao último commit deste plano, com os §6.0 e §6.1 da spec como requisito.
  - Crítico e Importante são corrigidos e revisados de novo, em loop, até não sobrar ajuste.
  - Achado recusado fica registrado com o motivo.
- [ ] **Passo 8:** dizer ao Renato, em tabela, o que ficou pronto, como foi provado e o que ficou de fora, com o comando de `push`.

---

## Autorrevisão

- **Cobertura da spec (§6.0 e §6.1):**
  - **Entrega 0:** 0037/0038 (T2), conta `staff` (T3) e cópia (T1).
  - **CON-8:**
    - diálogo (T6);
    - Dados cadastrais (T5 no banco, T6 na tela);
    - ficha pública com DDI (T5, T6);
    - `criar_oportunidade` (T7);
    - a importação não muda (spec).
  - **CON-4:** criar e editar (T6), com link (T6), lixeira (T5, T6) e o servidor conferindo de novo (T6, T7).
  - **CRM-11:** T7 e T8.
  - **CRM-12:** T7 e T8.
  - **Valor e moeda mantidos até a entrega 3:** T7 (`p_valor`) e T8.
  - **Paridade Zod ↔ SQL:** T4 e T7.
- **Nada da spec §6.0–6.1 ficou sem tarefa.** O "processo-sentinela" saiu da spec na rodada 4 e não entra.
- **Tipos coerentes:** `EstadoComConfirmacao`, `ContatoParecido` e `CAMPO_CONFIRMAR_*` são definidos na T6 e usados na T8; `telefoneNacional` e `telefone_nacional` são nomeados igual nas T4, T5 e T9.
