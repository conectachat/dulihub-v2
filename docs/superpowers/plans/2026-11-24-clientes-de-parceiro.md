# Parceiros e clientes de parceiro — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (nativo) ou superpowers:subagent-driven-development, conforme o Renato escolher. Passos com checkbox (`- [ ]`). TDD em todo passo de código: teste vermelho visto antes do código.

**Objetivo:** o Renato cadastra parceiros (Thais Fabrini, nos EUA) em Configuração › Parceiros e cria o cliente de parceiro pelo Novo cliente › Parceiro, só com o nome. O cliente mostra o contato do parceiro em todo lugar, fica fora do funil e do link da ficha, e é cobrado à mão no perfil, como hoje.

**Arquitetura:**
- **Quatro migrations, que só acrescentam.** A 0068 traz os parceiros, a 0069 a fixture, a 0070 o vínculo e o Novo cliente, e a 0071 as guardas do funil e da ficha. Todas são compatíveis com o código no ar: `criar_cliente` só ganha um parâmetro com padrão, e `buscar_clientes` só ganha colunas. Por isso há um push só, no fim.
- **Configuração › Parceiros nasce migrada:** lê do espelho e grava pela fila. Clientes e Contatos continuam lendo do servidor (exceção registrada).
- **O contato do cliente de parceiro não é copiado.** Ele é lido do parceiro na hora de mostrar, por uma função pura só (`contatoExibido`).

**Tech stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), Dexie (espelho e fila), bun, vitest, jsdom e @testing-library.

**Spec:** `docs/superpowers/specs/2026-11-24-clientes-de-parceiro-design.md` (o desenho, commit `44be3a3`, revisto em duas rodadas) e `docs/spec.md` §7.17 (PAR-4 a PAR-11). Os critérios de aceite são os do §8 do desenho (1 a 15 e 9a), citados abaixo pelo número.

## Decisões deste plano

| # | Decisão | Por quê | Custo se errada |
|---|---|---|---|
| D1 | **A 0068 conserta a semente das organizações novas.** `private.seed_organization` (0019) grava `pipeline_stages` sem `organization_id`, que a 0027 tornou `not null`. Provado no banco em 24/nov, num bloco desfeito: `null value in column "organization_id" of relation "pipeline_stages"`. Hoje **nenhuma** organização nova nasce | Sem isso, o cadastro da Thais falharia | Nenhum: é a mesma semente, com a coluna |
| D2 | `organizations` entra em `sync_manifesto` | Agora ela é gravada pela fila e lida pelo Financeiro. Tabela fora do manifesto é puxada e nunca conferida (0033). Organização não se apaga, então não precisa de lápide | Uma linha a mais no manifesto |
| D3 | O `slug` ganha o padrão provisório `'provisorio-' \|\| gen_random_uuid()`, que o gatilho `organizations_slug_pelo_nome` troca pelo do nome (`private.slug_do_nome`), com `-2`, `-3`… quando já existe | O desenho §5.1 (M2, N3). Com o padrão, o tipo gerado deixa de exigir `slug` no `insert` | Nenhum |
| D4 | `criar_cliente` ganha `p_parceiro uuid default null`, como 5º parâmetro (`drop` e `create`). No ramo do parceiro, `p_novo_contato` traz só `full_name`; as outras chaves são ignoradas. "Criar mesmo assim" reaproveita `p_confirmar_contato_parecido` | A tela já confirma por `CAMPO_CONFIRMAR_PARECIDO` e `reenviarCom`. Um parâmetro só para o homônimo duplicaria o caminho | Nenhum |
| D5 | Marca de sessão `dulihub.via_parceiro`, ligada só em volta do `insert` do `criar_cliente` | É um recurso novo (o vínculo); o `via_ganho` é do estágio | Nenhum |
| D6 | **`criar_oportunidade` não muda.** A recusa é o gatilho de `opportunities`, que dispara dentro dela | Cliente de parceiro não tem contato nem negócio, então ela não para antes para perguntar (nem parecido, nem "já tem oportunidade"). Recriar a função de 180 linhas para repetir a guarda só criaria risco | Nenhum: o critério 9 é provado chamando `criar_oportunidade` |
| D7 | As guardas do funil e da ficha são `security invoker` e leem `people` com a permissão de quem grava, como `private.quem_tem_processo_e_cliente` (0045:118-122). Pessoa invisível passa calada | É o comportamento do desenho §5.5. O desenho cita a 0065/0067, mas aquelas são `definer` com teste de associação; o modelo `invoker` é o da 0045 | Nenhum |
| D8 | A recusa de quem não é dono, vinda da fila, aparece na Sincronização como "Você não tem permissão para isto." | O gatilho usa `42501` (desenho, N5), e `traduzirErro` traduz por código. A frase do gatilho aparece pela API (critério 2) | Nenhum: é o que toda recusa de permissão já mostra |
| D9 | O papel offline vem de `vinculoLocal(banco, userId)`, que devolve a associação escolhida com papel e tipo; `organizacaoLocal` passa a usá-la. No servidor, `contextoAtual()` ganha `tipo` | Nenhuma tela migrada decide por papel hoje. Uma regra de escolha só, nos dois lados (`escolherOrganizacao`) | Nenhum |
| D10 | A fixture é uma migration própria (0069), aplicada antes das funções | Os testes vermelhos da 0070 já entram com a `teste-executora` | Nenhum |
| D11 | A chave estrangeira do vínculo se chama `people_parceiro_fk`, e as leituras usam `parceiro:organizations!people_parceiro_fk(name, email, phone_country_code, phone)` | `people` tem três chaves para `organizations`; o PostgREST precisa do nome | Nenhum |
| D12 | Limites: razão social e cada campo de endereço até 200, documento fiscal até 50, com a frase de sempre "Texto longo demais em um dos campos." | O desenho não fixa limite no endereço | Nenhum |
| D13 | Texto novo, nosso: no Editar sem contato, a descrição do diálogo vira "O contato é o do parceiro." | A de hoje ("Nome, telefone e e-mail são obrigatórios.") mentiria | Nenhum |

## Restrições globais

- `bun`, nunca `npm`. Nunca ler valores do `.env.local`. Nunca `--no-verify`. Commit sem perguntar; o push é do Renato.
- Migration, `database.types.ts` e `docs/banco.md` no mesmo commit. Tipos: `generate_typescript_types` grava num arquivo, e só o campo `types` vai para `src/lib/supabase/database.types.ts`.
- `drop` + `create` quando a assinatura ou o retorno muda, com `revoke` de `public, anon` e `grant` a `authenticated`. Função nova em `public` nasce executável por `anon`.
- Testes em produção: só as contas de teste, só as organizações de teste (`parceiro-teste`, `executora-teste`). Quem cria, apaga, em `afterAll`/`finally`; apagar a pessoa leva tudo. A `teste-colaborador` nunca grava na Duli. Nunca apagar o "Cliente de Teste".
- Organização real **não** se cria em teste. O `insert` pelo dono da raiz só se prova em `supabase/provas/`, num bloco que termina em `raise exception` e desfaz tudo.
- Tokens de cor, os quatro raios, ícone como elemento. Criar vem antes da lista. `FormDialog`, `EmptyState`, `CopiarTexto`, `telefoneCompleto`.
- `bun run verify` verde antes de cada commit; `bun run test:rls` inteiro depois de cada migration.
- Erros do banco com `errcode = 'P0001'`, menos "Só o dono da Duli cadastra parceiro.", que é `42501`.

Frases, cópia exata do desenho §5.8 e §5.4:

| Situação | Frase |
|---|---|
| Novo cliente, sem parceiro | "Escolha o parceiro." |
| Novo cliente, sem nome | "Informe o nome do cliente." |
| Parceiro inválido, invisível, a raiz, a própria, teste trocado | "Parceiro não encontrado." |
| Nome repetido no mesmo parceiro | "Já existe um cliente com esse nome vindo de ‹parceiro›." e o botão "Criar mesmo assim" |
| Novo cliente sem parceiro cadastrado | "Nenhum parceiro cadastrado. Cadastre em Configuração › Parceiros." (o link só para quem pode cadastrar) |
| Vínculo pela API | "O parceiro do cliente só se define no Novo cliente." |
| Funil | "Cliente de parceiro não entra no funil: use + Novo processo no perfil." |
| Link da ficha | "Cliente de parceiro não recebe o link da ficha." |
| Parceiro sem nome / país | "Informe o nome do parceiro." / "Informe o país." |
| Parceiro com nome repetido | "Já existe um parceiro com esse nome." |
| Parceiro criado por quem não é dono da Duli | "Só o dono da Duli cadastra parceiro." |
| Contato do parceiro | as de `private.contato_valido` (0040): "Informe o e-mail", "E-mail inválido", "Informe o DDI", "DDI inválido (ex.: +55)", "Informe o telefone", "O telefone precisa ter de 8 a 15 dígitos" |
| Lugar do link, na ficha do cliente de parceiro | "Cliente de ‹parceiro›: os dados cadastrais são lançados aqui, em Editar." |
| Parceiros vazia | "Nenhum parceiro ainda. Cadastre aqui quem vende e contrata a Duli para montar o processo." |
| Selo do perfil | "Cliente de parceiro · ‹nome›" |
| Histórico | "Marcado como cliente — parceiro ‹nome›" |
| Anexo | "Nota fiscal / invoice" |

## Foco da revisão

1. **Linha do espelho sem as chaves novas.** As linhas de `people` e `organizations` que já estavam no aparelho não têm `partner_organization_id` nem as colunas do parceiro (`undefined`, não `null`). A lista de Parceiros e o "via" do Financeiro tratam as duas iguais (T5, T6, T8).
2. **Homônimo com outra caixa, espaço nas pontas ou na lixeira.** " fulano de TAL " pergunta; um homônimo na lixeira não pergunta; o mesmo nome em cliente direto ou em outro parceiro não pergunta (T3).
3. **Nome que vira `slug` estranho.** Acento ("Thaís" → `thais`), só símbolos ("!!!" → `parceiro`) e choque ("Thais" e "Thais!" → `thais` e `thais-2`) (T1, na prova).
4. **`%` e `_` na busca pelo nome do parceiro** são literais, como na busca da pessoa (T3).
5. **Ordem das recusas do parceiro.** Quem não é dono e manda dado inválido lê a recusa de permissão, não "Informe o país.". A gestão do próprio parceiro, editando com dado inválido, lê a frase do dado (T1).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0068_parceiros.sql` | A semente consertada, as colunas do parceiro, o `slug` pelo nome, a regra do parceiro, o nome único e `organizations` no manifesto. Preenche a `parceiro-teste` |
| `supabase/migrations/0069_fixture_executora_de_teste.sql` | A `executora-teste` e as duas associações da `teste-executora` |
| `supabase/migrations/0070_cliente_de_parceiro.sql` | `people.partner_organization_id` e a trava; `criar_cliente` com `p_parceiro`; o histórico com o parceiro; `buscar_clientes` com o parceiro |
| `supabase/migrations/0071_parceiro_fora_do_funil.sql` | As guardas de `opportunities` e de `registration_forms` |
| `supabase/provas/parceiro-pelo-dono.sql`, `supabase/provas/vinculo-do-parceiro.sql` | O que nenhuma conta de teste alcança: o `insert` pelo dono e o vínculo real ↔ teste |
| `tests/rls/parceiros.test.ts`, `cliente-de-parceiro.test.ts`, `parceiro-fora-do-funil.test.ts` | As provas no banco |
| `tests/rls/sincronia.test.ts`, `papeis.test.ts`, `fila.test.ts` | O manifesto, a conta nova e a recusa pela fila |
| `tests/contas.ts`, `tests/rls/README.md`, `.github/workflows/ci.yml` | A 5ª conta |
| `src/lib/parceiros.ts` | `contatoExibido`, `parceirosVisiveis`, `ehDonoDaRaiz` |
| `src/lib/local/organizacao-local.ts`, `src/lib/organizacao.ts`, `src/lib/erros.ts` | `vinculoLocal`; `tipo` em `contextoAtual`; o nome repetido |
| `src/features/settings/{schema,montagem,consultas-locais,escritas-locais,sections}.ts` | Configuração › Parceiros |
| `src/app/(app)/configuracoes/[section]/{page,secoes-locais}.tsx`, `parceiro-dialog.tsx` (novo) | A seção |
| `src/components/modos-do-contato.tsx`, `src/lib/parecidos.ts` | O terceiro modo, opcional; os homônimos |
| `src/features/clientes/{queries,novo-cliente-actions}.ts`, `src/app/(app)/clientes/{page,novo-cliente-dialog}.tsx`, `clientes/[id]/page.tsx` | Novo cliente › Parceiro; o contato na lista e no perfil |
| `src/components/via-do-parceiro.tsx` (novo) | O "via ‹nome›" das listas |
| `src/features/people/{queries,schema,actions}.ts`, `src/app/(app)/contatos/{page,person-dialog}.tsx`, `clientes/[id]/cliente-dialog.tsx` | Contatos e os dois Editar sem contato |
| `src/features/cadastro/{schema,actions}.ts`, `src/components/formulario-do-cadastro.tsx`, `src/components/perfil/{dados-cadastrais,controles-da-ficha}.tsx` | A ficha sem contato e sem link |
| `src/features/opportunities/queries.ts` | `listPeopleForPicker` sem cliente de parceiro |
| `src/features/financeiro/{consultas-locais,anexos}.ts`, `src/app/(app)/financeiro/lista.tsx`, `clientes/[id]/cobrancas.tsx` | O "via" e o "Nota fiscal / invoice" |

---

### T1 0068 — Parceiros no banco (PAR-4)

**Interfaces:**
- **Produz:**
  - Colunas novas em `organizations`, todas `text` nulas: `address_country`, `address_street`, `address_number`, `address_complement`, `address_district`, `address_city`, `address_state`, `address_postal_code`, `phone_country_code`. `slug` ganha o padrão provisório (D3).
  - `private.slug_do_nome(p_nome text) returns text`, `immutable`, `set search_path = ''`. Minúsculas, acentos trocados por `translate` (sem extensão nova), tudo que não é `[a-z0-9]` vira `-`, sem `-` nas pontas, e vazio vira `parceiro`.
  - Gatilho `organizations_regra_do_parceiro` (`before insert or update`, função `private.organizations_regra_do_parceiro()`, `security definer`), e gatilho `organizations_slug_pelo_nome` (`before insert`). Pela ordem alfabética, o primeiro apara o nome antes de o segundo fazer o `slug`.
  - Índice `organizations_nome_do_parceiro`, único em `(lower(name)) where type = 'partner'`.
  - `sync_manifesto()` com `'organizations'` na lista (entre `opportunities` e `organization_members`).

**Testes primeiro**, em `tests/rls/parceiros.test.ts` (`// @vitest-environment node`). Contas: `parceiro` (dona da `parceiro-teste`), `staff` (staff de lá) e `colaborador` (staff da Duli).
- **Quem não é dono não cria, nem com dado inválido** (critério 2, Foco 5): `parceiro` e `colaborador` fazem `insert({ name: \`Parceiro proibido ${s}\`, type: "partner" })`, sem país nem contato. Esperado: `error.code === "42501"` e `error.message === "Só o dono da Duli cadastra parceiro."`. Depois, o `colaborador` (que lê todas as organizações) não acha nenhuma com esse nome.
- **A gestão do parceiro edita, e o banco confere** (critério 1, Foco 5). O `parceiro` faz `update` na `parceiro-teste`. Os valores originais são lidos antes e voltam em `finally`.
  - `{ email: "invalido" }` → "E-mail inválido".
  - `{ address_country: "  " }` → "Informe o país.".
  - `{ name: " " }` → "Informe o nome do parceiro.".
  - `{ phone: "123" }` → "O telefone precisa ter de 8 a 15 dígitos".
  - `{ phone_country_code: "1", phone: "3055550100" }` passa, e a leitura devolve `phone_country_code === "+1"`.
  - `{ tax_id: "x".repeat(51) }` → "Texto longo demais em um dos campos.".
- **O `staff` do parceiro não edita:** o `update` dele não altera nenhuma linha (a policy da 0036).
- **Manifesto**, em `sincronia.test.ts`: a lista de `sync_manifesto` contém `"organizations"`, e a contagem do `parceiro` nela é `1`. O teste do espelho "a segunda sincronia… `recarregadas` = []" continua verde sem mudança.
- **A prova** `supabase/provas/parceiro-pelo-dono.sql`, no formato de `trava-da-forma.sql`. É um bloco `do $$` como `postgres`, que acha o dono da raiz (`organization_members` + `organizations.type = 'root'`, `role = 'owner'`) e o simula com `set_config('request.jwt.claims', json_build_object('sub', v_dono, 'role', 'authenticated')::text, true)` e `set local role authenticated` (por `execute`). Termina em `raise exception 'PROVA …'`. Linha esperada, no cabeçalho:
  - `ok=[passou]`: "Prova Thaís" com país, e-mail e telefone válidos;
  - `slug=[prova-thais]` e `slug2=[prova-thais-2]`: o segundo é "Prova Thaís!";
  - `simbolos=[parceiro…]`: o nome "!!!" dá um `slug` que começa por `parceiro`;
  - `semente=[1/3/3]`: um funil padrão, três etapas e três status na organização nova;
  - `sem_pais=[Informe o país.]`, `email=[E-mail inválido]` e `repetido=[Já existe um parceiro com esse nome.]` ("prova thaís");
  - `ddi=[+1]` ("1" gravado como "+1").

**Migration** (`0068_parceiros.sql`, cabeçalho com D1 a D3):
1. **`private.seed_organization`** recriada com o mesmo corpo da 0019, e o `insert` em `pipeline_stages` com `organization_id = p_org`.
2. As colunas e o padrão do `slug`.
3. **`private.organizations_regra_do_parceiro()`**. Volta sem fazer nada quando `new.type <> 'partner'`. Senão, nesta ordem:
   1. No `INSERT` com `auth.uid()` não nulo e `not private.current_user_is_root_owner()`, recusa com "Só o dono da Duli cadastra parceiro." (`42501`).
   2. Apara com `private.aparar` o nome, a razão social, o documento, os campos de endereço, o e-mail e o telefone. O DDI passa por `private.normalizar_ddi`.
   3. Sem nome: "Informe o nome do parceiro.". Os limites (D12, e nome até 200): "Texto longo demais em um dos campos.". Sem país: "Informe o país.". `private.contato_valido` dá a frase do contato.
   4. Outro parceiro com o mesmo `lower(name)` e `id` diferente: "Já existe um parceiro com esse nome.".
   5. Devolve `new`.
   A conferência dos dados vale também sem usuário (desenho §5.1, N2).
4. **`organizations_slug_pelo_nome`**: com `new.slug like 'provisorio-%'`, troca pelo `slug_do_nome(new.name)` livre (`-2`, `-3`…).
5. O índice único do nome.
6. `update` da `parceiro-teste` com `address_country = 'Brasil'`, `email = 'parceiro-teste@duliconsulting.com'`, `phone_country_code = '+55'` e `phone = '11999990000'`.
7. `sync_manifesto` recriada com `'organizations'`.

**Passos:**
- [ ] Vermelho: `bun x vitest run --no-file-parallelism tests/rls/parceiros.test.ts tests/rls/sincronia.test.ts`. Esperado: falham os testes novos (a frase do dono não existe, o país passa) e os outros passam.
- [ ] Aplicar a 0068 pelo conector.
- [ ] Verde nos dois arquivos e em `papeis.test.ts` (o `insert` de `type: "root"` continua `42501`).
- [ ] Rodar a prova pelo conector e conferir a linha esperada. Depois, conferir que nenhuma organização "Prova…" ficou no banco.
- [ ] Tipos. Conferir que `TablesInsert<"organizations">` não exige `slug`.
- [ ] `docs/banco.md`: as colunas, os dois gatilhos, o índice, a semente, o manifesto, e a situação "0001 a 0068". `src/lib/local/banco.ts:35-39`: o comentário de `organizations` passa a dizer que ela está no manifesto.
- [ ] `bun run test:rls` inteiro.
- [ ] Commit `feat(banco): parceiros e a semente das organizações novas (0068)`.

### T2 0069 — A conta `teste-executora` e a organização que faz o papel da Duli

**Antes, o Renato [Renato]:** no Supabase, Authentication → Users → Add user, com o e-mail `teste-executora@duliconsulting.com`, uma senha forte e "Auto confirm". Depois ele guarda a senha como `RLS_SENHA_EXECUTORA` no `.env.local` e nos segredos do GitHub (Settings → Secrets and variables → Actions). Sem isso a migration não liga a conta (como a 0039), e a suíte falha em vez de pular.

**Interfaces:**
- **Produz:** a organização `executora-teste` ("Executora de Teste", `partner`, `is_test`) e as associações `admin` dela e `staff` da `parceiro-teste`, com a da executora mais antiga. `EMAILS.executora` e `SENHAS.executora` em `tests/contas.ts`, e com eles `entrarComo("executora")`.

**Testes primeiro**, em `tests/rls/papeis.test.ts`, num `describe("a conta teste-executora (0069)")`:
- as associações dela, ordenadas por `created_at`, são exatamente `[{ role: "admin", slug: "executora-teste" }, { role: "staff", slug: "parceiro-teste" }]`;
- `escolherOrganizacao` (`@/lib/escolher-organizacao`) sobre elas devolve a `executora-teste`;
- a `executora-teste` tem um funil padrão (a semente do T1 rodou).

**Migration** (`0069_fixture_executora_de_teste.sql`, cabeçalho com o porquê do desenho §6 e a ordem "conta antes, migration depois, idempotente"):
- `insert` da organização com nome, `type`, `is_test`, `legal_name` ("Organização usada pela suíte de RLS no papel da Duli. Não é cliente real."), país "Brasil", e-mail `executora-teste@duliconsulting.com`, DDI "+55" e telefone "11999990001", `on conflict (slug) do nothing`;
- associação `admin` com `created_at = now() - interval '1 minute'` e associação `staff` da `parceiro-teste` com `now()`, ambas por `profiles.email` e `on conflict (organization_id, user_id) do update set role = …`.

**Passos:**
- [ ] [Renato] A conta e as duas senhas.
- [ ] Vermelho: `papeis.test.ts` (falha o `entrarComo("executora")` ou as associações).
- [ ] Aplicar a 0069. Verde.
- [ ] `tests/contas.ts`, `tests/rls/README.md` (tabela das contas, as fixtures e a variável), `.github/workflows/ci.yml` (`RLS_SENHA_EXECUTORA: ${{ secrets.RLS_SENHA_EXECUTORA }}` junto das outras quatro).
- [ ] `bun run test:rls` inteiro: `espelho.test.ts` e o teste da `teste-staff` passam sem mudança (critério 11, primeira parte).
- [ ] Tipos (nada muda, conferir). `docs/banco.md`: a situação.
- [ ] Commit `test: conta teste-executora e a organização executora-teste (0069)`.

### T3 0070 — O vínculo e o Novo cliente › Parceiro no banco (PAR-5, PAR-6, PAR-9, PAR-10)

**Interfaces:**
- **Consome:** T1 e T2.
- **Produz:**
  - `people.partner_organization_id uuid`, com `constraint people_parceiro_fk references public.organizations(id)` e o índice parcial `people_parceiro_idx where partner_organization_id is not null`.
  - `private.alvo_do_parceiro_valido(p_org_da_pessoa uuid, p_parceiro uuid) returns boolean`, `security definer`, `stable`. É verdadeiro só quando: o alvo é `partner`, o alvo é diferente da organização da pessoa, os dois têm a mesma `is_test`, e a organização da pessoa é a raiz ou é `is_test`.
  - Gatilho `people_vinculo_do_parceiro` (`before insert or update`, `security definer`).
  - `public.criar_cliente(p_organizacao uuid, p_contato uuid default null, p_novo_contato jsonb default null, p_confirmar_contato_parecido boolean default false, p_parceiro uuid default null) returns jsonb`, `security invoker`. Devolve:
    - `{"situacao":"criado","pessoa":uuid}`, como hoje;
    - `{"situacao":"precisa_confirmar","parecidos":[…]}`, como hoje;
    - novo: `{"situacao":"precisa_confirmar","homonimos":[{"id","nome"}],"parceiro":"‹nome›"}`.
  - `public.buscar_clientes(p_busca, p_limite, p_deslocamento)`, com as colunas de hoje mais `partner_organization_id uuid, parceiro_nome text, parceiro_email text, parceiro_ddi text, parceiro_telefone text`, antes de `total`.

**Testes primeiro**, em `tests/rls/cliente-de-parceiro.test.ts`. Contas: `executora` (gestão da `executora-teste`), `parceiro`, `staff` e `cliente`. Os ids das duas organizações vêm por `slug`, lidos pela `executora`, que enxerga as duas. O auxiliar `criarDeParceiro(nome, confirmar = false)` chama `criar_cliente` com `p_organizacao = executora-teste`, `p_parceiro = parceiro-teste` e `p_novo_contato = { full_name: nome }`. Tudo o que nasce é apagado pela `executora` no `afterAll` (a `people_delete` da 0036 deixa a gestão apagar na organização de teste).
- **Nasce** (critério 4): `{situacao: "criado"}`. A linha tem:
  - a organização da executora e o vínculo com a `parceiro-teste`;
  - `email`, `phone_country_code` e `phone` nulos;
  - `lifecycle_stage === "client"`, `client_since` de hoje em São Paulo e `owner_id` igual à `executora`;
  - uma `virou_cliente` com "Marcado como cliente — parceiro Parceiro de Teste".
- **Recusas:**
  - o `staff`, com `p_organizacao = executora-teste` → "Só a gestão marca alguém como cliente.";
  - nome `"   "` → "Informe o nome do cliente.";
  - 201 letras → "Texto longo demais em um dos campos.";
  - `p_parceiro = crypto.randomUUID()` → "Parceiro não encontrado.";
  - `p_parceiro` igual à `executora-teste`, a própria → "Parceiro não encontrado.";
  - com `p_contato` também → "Escolha um contato ou preencha um novo".
- **Homônimo** (critério 5, Foco 2). Depois de "Fulano ${s}":
  - `" fulano ${s.toUpperCase()} "` → `precisa_confirmar`, com `homonimos[0].id` o primeiro e `parceiro === "Parceiro de Teste"`, e nada nasce;
  - com `confirmar` → `criado`;
  - um homônimo que só existe na lixeira não pergunta;
  - um cliente direto da executora com o mesmo nome (contato novo, sem parceiro) não pergunta.
- **O vínculo é fixo** (critério 10). Pela `executora`:
  - `update` do vínculo para nulo, e depois para a própria organização → "O parceiro do cliente só se define no Novo cliente.";
  - `insert` em `people` já com o vínculo → a mesma frase.
  - O `cliente` (portal) tenta pôr o vínculo na própria linha: ela continua com o vínculo nulo.
- **Nada de acesso novo** (critério 11). A `executora` cria uma nota e uma cobrança à mão para o cliente de parceiro. `parceiro` e `staff` não enxergam a pessoa, a nota nem a cobrança, e `buscar_clientes` deles não o traz.
- **Financeiro** (critério 12): a cobrança à mão em `USD` com duas parcelas nasce para ele, no padrão de `tests/rls/financeiro.test.ts:52`.
- **O contato é lido do parceiro** (critérios 3 e 6, Foco 4):
  - `buscar_clientes({ p_busca: "Parceiro de Teste" })` pela `executora` traz o cliente, com `parceiro_nome`, `parceiro_email`, `parceiro_ddi` e `parceiro_telefone` da `parceiro-teste` e com o contato da pessoa nulo;
  - `p_busca: "Parceiro%Teste"` não traz;
  - o `parceiro` troca o telefone da `parceiro-teste` (e volta em `finally`), e `buscar_clientes` passa a trazer o telefone novo. A linha da pessoa continua nula.
- **Sem parecido** (critério 7): `contatos_parecidos` com o e-mail e o telefone da `parceiro-teste` não traz nenhum cliente de parceiro.
- **`buscar-clientes.test.ts` e `novo-cliente.test.ts`** continuam verdes sem mudança.
- **A prova** `supabase/provas/vinculo-do-parceiro.sql`, no formato do T1, simulando o dono da raiz. Cria um parceiro real e confere:
  - `criar_cliente(<Duli>, p_parceiro = parceiro-teste)` → "Parceiro não encontrado." (teste a partir do real);
  - um `insert` em `people` da `executora-teste` com o vínculo para o parceiro real, sob a marca → "Parceiro não encontrado." (real a partir do teste);
  - `criar_cliente(<Duli>, p_parceiro = <parceiro real>)` → `criado`.

**Migration** (`0070_cliente_de_parceiro.sql`, cabeçalho com D4, D5, D11 e a exceção registrada do vínculo que atravessa organizações):
1. A coluna, a chave e o índice.
2. **`private.people_vinculo_do_parceiro()`**:
   - No `INSERT` com vínculo: com usuário e sem a marca `dulihub.via_parceiro`, recusa com a frase do vínculo. Depois, alvo inválido → "Parceiro não encontrado.", e isso vale também sem usuário.
   - No `UPDATE` em que o vínculo muda, com usuário: a frase do vínculo.
3. **`private.people_guard_self_update`** recriada com o corpo da 0045:233, com `partner_organization_id` na lista do que volta ao antigo.
4. **`criar_cliente`**: `drop` da assinatura de 4 parâmetros, `create` da de 5, e `revoke`/`grant`. Com `p_parceiro` nulo, o corpo é o de hoje (0055:215-344). Com `p_parceiro`, nesta ordem:
   1. `p_contato` não nulo → "Escolha um contato ou preencha um novo".
   2. Não é gestão de `p_organizacao` → "Só a gestão marca alguém como cliente.".
   3. `select name from public.organizations where id = p_parceiro and type = 'partner'`, sob a RLS. Não achou → "Parceiro não encontrado.".
   4. O nome, aparado, de `p_novo_contato->>'full_name'`: vazio → "Informe o nome do cliente."; mais de 200 → "Texto longo demais em um dos campos.".
   5. Sem a confirmação: homônimos na mesma organização, com o mesmo vínculo, fora da lixeira e com `lower(full_name) = lower(v_nome)`. Havendo algum, devolve o `precisa_confirmar` com `homonimos` e `parceiro`.
   6. Liga a marca, faz o `insert` (`organization_id`, `full_name`, `lifecycle_stage = 'contact'`, `created_by` e o vínculo) e desliga a marca.
   7. `perform public.marcar_como_cliente(v_pessoa)` e devolve `criado`.
5. **`marcar_como_cliente`**: `create or replace` com o corpo da 0055:159, sem cláusula de segurança, como está (`invoker`). A `description` da atividade passa a ser "Marcado como cliente — parceiro " || nome quando a pessoa tem vínculo e o nome é legível. Senão, continua "Marcado como cliente".
6. **`buscar_clientes`**: `drop` e `create`, com `left join public.organizations o on o.id = p.partner_organization_id`. A busca acha também quando `o.name` casa com a mesma regra do nome em `private.pessoas_da_busca` (0057:22-49: aparado, `%`/`_`/`\` escapados, `ilike`).

**Passos:**
- [ ] Vermelho: `cliente-de-parceiro.test.ts` (a coluna e o parâmetro não existem).
- [ ] Aplicar a 0070. Verde nele, em `novo-cliente.test.ts`, `buscar-clientes.test.ts` e `estagio-do-cliente.test.ts`.
- [ ] Rodar a prova e conferir a linha esperada.
- [ ] Tipos. `ClienteDaLista` (`features/clientes/queries.ts:5-14`) continua compilando: as colunas novas só entram no T8.
- [ ] `docs/banco.md`: a coluna, o gatilho, as funções e a situação.
- [ ] `bun run test:rls` inteiro.
- [ ] Commit `feat(banco): cliente de parceiro e o vínculo fixo (0070)`.

### T4 0071 — Fora do funil e do link da ficha (PAR-7, PAR-8, no banco)

**Interfaces:**
- **Produz:** `private.opportunities_fora_do_parceiro()` e `private.registration_forms_fora_do_parceiro()`, `security invoker` (D7), com os `revoke`/`grant` de `private.quem_tem_processo_e_cliente` (0045). Gatilhos `opportunities_cliente_de_parceiro` e `registration_forms_cliente_de_parceiro`, `before insert or update of person_id`.

**Testes primeiro**, em `tests/rls/parceiro-fora-do-funil.test.ts`. Usa um cliente de parceiro e um contato comum, criados pela `executora` e apagados no fim. A etapa "Novo Lead" é a do funil da `executora-teste`, filtrado por `organization_id`.
- **Funil** (critério 9), sempre com "Cliente de parceiro não entra no funil: use + Novo processo no perfil.":
  - `criar_oportunidade` com `p_contato` = o cliente de parceiro;
  - `insert` direto em `opportunities`;
  - `update` do `person_id` de um negócio aberto do contato comum para ele.
- **Ficha** (critério 8): o `insert` em `registration_forms` para ele e o `update` do `person_id` de um link aberto do contato comum para ele recebem "Cliente de parceiro não recebe o link da ficha.".
- **Calado para quem não enxerga:** o `parceiro`, com `organization_id = executora-teste` e o `person_id` dele, nas duas tabelas, recebe uma recusa cuja mensagem não é nenhuma das duas frases.
- **"+ Novo processo" funciona:** o `insert` em `projects` para ele, pela `executora`, passa.
- **O contato comum** continua entrando no funil por `criar_oportunidade`.

**Passos:**
- [ ] Vermelho → aplicar a 0071 → verde → tipos → `docs/banco.md` → `test:rls` inteiro → commit `feat(banco): cliente de parceiro fora do funil e do link da ficha (0071)`.

### T5 Peças puras compartilhadas

**Interfaces:**
- **Produz**, em `src/lib/parceiros.ts`:
  - `type ParceiroDoContato = { name: string; email: string | null; phone_country_code: string | null; phone: string | null }`.
  - `type ContatoExibido = { email: string | null; ddi: string | null; telefone: string | null; via: string | null }`.
  - `contatoExibido(pessoa: { email: string | null; phone_country_code: string | null; phone: string | null; partner_organization_id?: string | null }, parceiro: ParceiroDoContato | null | undefined): ContatoExibido`. Sem vínculo (nulo ou ausente), devolve o contato da pessoa com `via: null`. Com vínculo, devolve o do parceiro (nulos se ele faltar), com `via` igual ao nome dele.
  - `parceirosVisiveis<T extends { id: string; name: string; type: string; is_test: boolean }>(orgs: T[], atualId: string | null): T[]`. Ficam só as `partner`, nunca a atual, e só as de teste quando a atual é de teste (só as reais quando não é). Em ordem de nome (`localeCompare` com `"pt-BR"`).
  - `ehDonoDaRaiz(papel: Enums<"member_role"> | null | undefined, tipo: Enums<"organization_type"> | null | undefined): boolean`.
  - `src/lib/parceiros.ts` roda nos dois lados: importa tipos só de `database.types.ts`, nunca de `src/lib/organizacao.ts`, que puxa o cliente do servidor.
- **Produz**, em `src/lib/local/organizacao-local.ts`, `vinculoLocal(banco: BancoLocal, userId: string): Promise<{ organizationId: string; papel: Enums<"member_role">; tipo: Enums<"organization_type"> | null } | null>`. `organizacaoLocal` passa a ser `(await vinculoLocal(banco, userId))?.organizationId ?? null`.
- **Produz:** `contextoAtual()` (`src/lib/organizacao.ts`) devolve também `tipo: Enums<"organization_type"> | null`, nulo nos ramos de erro.

**Testes primeiro**, em `src/lib/parceiros.test.ts` e `organizacao-local.test.ts`:
- **`contatoExibido`** (critério 6, Foco 1):
  - sem a chave do vínculo e com ela nula dão o mesmo resultado, que é o contato da pessoa;
  - com vínculo, a pessoa com `email: "x@y.com"` mostra o e-mail do parceiro, porque o do parceiro vence;
  - com vínculo e parceiro ausente, dá tudo nulo e `via: null`.
- **`parceirosVisiveis`** (critério 13):
  - com a atual sendo a Duli (raiz real), a lista `[Thais, parceiro-teste, executora-teste, Duli]` dá `[Thais]`;
  - com a atual sendo a `executora-teste`, dá `[parceiro-teste]`;
  - `atualId` nulo dá só as reais.
- **`ehDonoDaRaiz`:** `owner` com `root` dá verdadeiro. `admin` com `root`, `owner` com `partner` e nulos dão falso.
- **`vinculoLocal`:** com associação na raiz e num parceiro, devolve a da raiz com papel e tipo. Sem raiz, devolve a mais antiga. Os testes de `organizacaoLocal` continuam verdes.

- [ ] Vermelho → código → verde → `bun run verify` → commit `feat: peças puras dos parceiros`.

### T6 Configuração › Parceiros (PAR-4, na tela)

**Interfaces:**
- **Consome:** T1 e T5.
- **Produz:**
  - `parceiroSchema`, em `src/features/settings/schema.ts`. Campos: `name`, `legal_name`, `address_country`, `tax_id`, os sete de endereço, `email`, `phone_country_code` e `phone`. Apara tudo e manda vazio como `null`. Erros: "Informe o nome do parceiro.", "Informe o país.", os de `erroDeContato` no campo certo, e os limites de D12. O DDI passa por `normalizarDdi`.
  - `type ParceiroNaLista = Com<Tables<"organizations">> & { clientes: number }` e `montarParceiros(orgs, pessoas, atualId: string | null): ParceiroNaLista[]`, em `src/features/settings/montagem.ts`. Usa `parceirosVisiveis`. `clientes` conta as pessoas com o vínculo, `lifecycle_stage = 'client'` e fora da lixeira.
  - `parceirosLocais(banco, fila, userId: string): Promise<{ parceiros: ParceiroNaLista[]; podeCadastrar: boolean }>`, em `consultas-locais.ts`. `podeCadastrar` vem de `ehDonoDaRaiz` sobre `vinculoLocal`.
  - `saveParceiro(_prev: ActionState, formData: FormData): Promise<ActionState>`, em `escritas-locais.ts`, no molde de `saveVisaType` (l.707-762):
    - com `id`, grava um `update` com o `patch`, e o rótulo é "Alterar o parceiro ‹nome›";
    - sem `id`, antes de gravar confere o nome repetido contra o espelho (aparado, sem caixa, fora o próprio): "Já existe um parceiro com esse nome.";
    - depois grava um `insert` em `organizations` com `{ id: novoId(), type: "partner", ...dados }`, **sem** `organization_id` e **sem** `slug`, e o rótulo é "Cadastrar o parceiro ‹nome›".
  - `ParceiroDialog({ parceiro }: { parceiro?: ParceiroNaLista })`, em `configuracoes/[section]/parceiro-dialog.tsx`. É um `FormDialog` com `acao={saveParceiro}` e os campos do desenho §7. O DDI começa em `DDI_PADRAO`.
  - `SecaoParceiros`, em `secoes-locais.tsx`.
  - `traduzirErro`: `organizations_nome_do_parceiro` → "Já existe um parceiro com esse nome." em `POR_CONSTRAINT`.

**Testes primeiro**, de unidade:
- **`parceiroSchema`:**
  - sem nome dá a frase do nome, e sem país a do país;
  - `email: "x"` dá "E-mail inválido" no campo `email`;
  - DDI "1" vira "+1";
  - campos opcionais vazios viram `null`;
  - documento com 51 caracteres dá a frase do limite.
- **`montarParceiros`** (Foco 1):
  - conta 3 clientes, sem contar os da lixeira, o contato que não é cliente e o cliente de outro parceiro;
  - linha antiga do espelho, sem `address_country` e sem as chaves novas, não quebra;
  - pessoa sem a chave do vínculo não conta.
- **`saveParceiro`**, no molde de `escritas-locais.test.ts`:
  - o `insert` sai com `tipo: "insert"`, `tabela: "organizations"`, `type: "partner"` e `phone_country_code: "+1"`, e `linha` não tem as chaves `organization_id` nem `slug`;
  - "thais fabrini" com "Thais Fabrini" já no espelho dá a frase e não grava nada na fila;
  - com `id`, sai um `update`.
- **`SecaoParceiros`**, em `secoes-locais.test.tsx` (critério 2):
  - para o dono da raiz, mostra "Novo parceiro" no topo e o lápis em cada linha;
  - para o `staff` da Duli, mostra a lista sem nenhum dos dois;
  - a linha traz o nome, o país, o e-mail e o telefone, os dois com `CopiarTexto`, e o número de clientes;
  - sem parceiro, mostra o `EmptyState` com a frase.
- **`sections.test.ts`:** a seção `parceiros` não tem `phase` nem `planned`.
- **`erros.test.ts`:** o 23505 de `organizations_nome_do_parceiro` dá a frase.
- **RLS, em `tests/rls/fila.test.ts`** (critério 14): o `parceiro` põe na fila o `insert` de um parceiro e drena. O item fica em `conflito`, com o motivo "Você não tem permissão para isto." (D8), e nenhuma organização com aquele nome existe.

**Telas:**
- `sections.ts`: tirar `phase` e `planned` de `parceiros`.
- `page.tsx`: `"parceiros"` em `ESPELHADAS`.
- `SecaoParceiros` usa `useEspelho(userId, (b, f) => parceirosLocais(b, f, userId))`. A lista vira tabela no `md` e cartões abaixo dele, como Clientes (`clientes/page.tsx:103-184`). A linha mostra `SeloPendente`. Não há excluir.

- [ ] Vermelho → código → verde → `bun run verify` → commit `feat(configuracao): Parceiros (PAR-4)`.

### T7 Novo cliente › Parceiro (PAR-5, na tela)

**Interfaces:**
- **Consome:** T3 e T5.
- **Produz:**
  - `ModoDoContato = "existente" | "novo" | "parceiro"`. `ModosDoContato` ganha `comParceiro?: boolean`, e o botão "Parceiro" só aparece com ele. A Nova oportunidade não passa a prop.
  - `EstadoComConfirmacao` (`src/lib/parecidos.ts`) ganha `homonimos?: { id: string; nome: string }[]` e `parceiro?: string`. `respostaDoNovoCliente` aceita a resposta com `homonimos`.
  - `listarParceirosParaNovoCliente(): Promise<{ parceiros: { id: string; nome: string }[]; error: string | null }>`, em `features/clientes/queries.ts`. Lê `organizations(id, name, type, is_test)` e filtra com `parceirosVisiveis(orgs, contextoAtual().organizationId)`.
  - `NovoClienteDialog({ parceiros, podeCadastrarParceiro }: { parceiros: { id: string; nome: string }[]; podeCadastrarParceiro: boolean })`.
  - `criarCliente` (`novo-cliente-actions.ts`) com o modo `parceiro`. Os campos são `parceiro_id` e `nome_do_cliente`.

**Testes primeiro**, de unidade:
- **`ModosDoContato`**, em `src/components/modos-do-contato.test.tsx`:
  - sem `comParceiro`, mostra dois botões;
  - com ele, mostra três, e clicar em "Parceiro" põe `modo_contato = "parceiro"`.
  - `opportunity-dialog.test.tsx` continua verde.
- **`criarCliente`**, modo parceiro:
  - chama o banco com `{ p_organizacao, p_parceiro: "<uuid>", p_novo_contato: { full_name: "Fulano de Tal" }, p_confirmar_contato_parecido: false }`;
  - sem `parceiro_id` válido, devolve "Escolha o parceiro." sem chamar o banco;
  - com o nome em branco, devolve "Informe o nome do cliente." sem chamar o banco;
  - com homônimos, devolve `{ error: null, homonimos, parceiro, token }` sem `ok`;
  - `criado` faz o redirecionamento de hoje (`enderecoDoNovoCliente`).
- **`respostaDoNovoCliente`** lê a variante com homônimos.
- **`NovoClienteDialog`:**
  - "Parceiro" mostra o seletor "Parceiro *" e o campo "Nome do cliente *", sem e-mail nem telefone, e o `FormData` leva `modo_contato`, `parceiro_id` e `nome_do_cliente`;
  - o aviso de homônimo diz "Já existe um cliente com esse nome vindo de Thais Fabrini.", com o link para o perfil (`enderecoDaPessoa(id, "client")`) e "Criar mesmo assim", que reenvia com `CAMPO_CONFIRMAR_PARECIDO = "1"`;
  - com `parceiros = []`, mostra a frase de nenhum parceiro, e o link para `/configuracoes/parceiros` só com `podeCadastrarParceiro`;
  - trocar de modo tira o aviso (`BotaoQueDispensa`);
  - os testes de hoje continuam verdes.

**Telas:** `clientes/page.tsx` chama `listarParceirosParaNovoCliente()` e passa `podeCadastrarParceiro = ehDonoDaRaiz(papel, tipo)`, nos dois lugares onde o diálogo aparece (l.70 e l.94).

- [ ] Vermelho → código → verde → `bun run verify` → commit `feat(clientes): Novo cliente › Parceiro (PAR-5)`.

### T8 O contato do parceiro aparece; Financeiro (PAR-6, PAR-11)

**Interfaces:**
- **Consome:** T3 e T5.
- **Produz:**
  - `ClienteDaLista` ganha `partner_organization_id: string | null` e `parceiro: ParceiroDoContato | null`, montado das colunas `parceiro_*` de `buscar_clientes`.
  - `PersonListItem` (`features/people/queries.ts`) ganha `partner_organization_id` e `parceiro`, pela junção de D11. A busca de Contatos **não** muda (desenho §5.3).
  - `ViaDoParceiro({ nome }: { nome: string })`, em `src/components/via-do-parceiro.tsx`, que mostra "via ‹nome›" em `text-xs text-muted-foreground`.
  - `ParcelaNaLista` ganha `via: string | null`. `parcelasDoAparelho` lê também `organizations` do espelho.
  - `TIPOS_DE_ANEXO`: `nota_fiscal` com o rótulo "Nota fiscal / invoice".

**Testes primeiro**, de unidade:
- **`listarClientes`**, com um banco falso: a linha com `partner_organization_id` traz `parceiro` com nome e contato, e a linha sem ele traz `parceiro: null`.
- **`parcelasDoAparelho`** (Foco 1), em `financeiro/consultas-locais.test.ts`:
  - o cliente de parceiro tem `via: "Thais Fabrini"`;
  - o cliente direto tem `via: null`;
  - a pessoa sem a chave do vínculo tem `via: null`.
- **`TIPOS_DE_ANEXO`:** o rótulo de `nota_fiscal` é "Nota fiscal / invoice".
- **`ViaDoParceiro`** mostra "via Thais Fabrini".

**Telas** (todas por `contatoExibido`; a prova da regra é o T5, e a das telas é a revisão e a conferência à mão):
- **`clientes/page.tsx`:** tabela e cartões mostram o contato exibido, com `ViaDoParceiro` ao lado do e-mail.
- **`clientes/[id]/page.tsx`:**
  - o `select` ganha `partner_organization_id` e a junção;
  - o cabeçalho usa o contato exibido, com o copiar e o `mailto`;
  - ao lado do selo "Cliente" entra o selo "Cliente de parceiro · ‹nome›";
  - o "via ‹nome›" fica na linha do contato.
- **`contatos/page.tsx`:** o mesmo na tabela.
- **`financeiro/lista.tsx`:** `ViaDoParceiro` depois do link do cliente.
- **`cobrancas.tsx:447`:** a descrição vira "Boleto, nota fiscal / invoice ou comprovante. PDF, imagem, Word ou Excel, até 20 MB.".

- [ ] Vermelho → código → verde → `bun run verify` → commit `feat: o contato do parceiro no cliente (PAR-6, PAR-11)`.

### T9 Sem contato próprio, sem link e sem funil na tela (PAR-7, PAR-8)

**Interfaces:**
- **Consome:** T3, T4 e T8 (`partner_organization_id` nas leituras).
- **Produz:**
  - `personSemContatoFromForm(formData: FormData)`, em `features/people/schema.ts`. Lê só `full_name`, `company` e `job_title`, com as regras de hoje.
  - `PersonFormValues` (`contatos/person-dialog.tsx:16-28`) ganha `partner_organization_id?: string | null`. `PersonDialog` e `ClienteDialog` passam `semContato = Boolean(person.partner_organization_id)`.
  - `CamposDoContato({ person, semContato }: { person?: PersonFormValues; semContato?: boolean })`. Com `semContato`, não desenha DDI, telefone nem e-mail.
  - `fichaDoFormulario(formData, modo, hoje = hojeEmSaoPaulo(), opcoes: { semContato?: boolean } = {})`. Com `semContato`, `dados` **não tem** as chaves `email`, `phone_country_code` e `phone`, e `errosDeContato` não roda. Chave com `null` ainda conta para `salvar_cadastro` (0040), por isso as chaves saem do objeto.
  - `FormularioDoCadastro`, `EditarCadastro` e `DadosCadastrais` ganham `semContato?: boolean`. `DadosCadastrais` ganha também `parceiro?: string | null`.
- **Regra do servidor:** quem decide é a linha da pessoa, nunca o formulário. `atualizarCliente`, `updatePerson` e `salvarCadastro` leem primeiro `partner_organization_id` (junto com o contato que já leem). Com vínculo: não procuram parecido, usam a leitura sem contato e não escrevem as três colunas.

**Testes primeiro**, de unidade:
- **`fichaDoFormulario`**, com `semContato`: o formulário com `email: "x"` dá `ok`, e `dados` não tem nenhuma das três chaves (critério 8). Sem a opção, o comportamento é o de hoje.
- **`salvarCadastro`**, com um banco falso que devolve o vínculo: `salvar_cadastro` recebe `p_dados` sem as três chaves, e `contatos_parecidos` não é chamado.
- **`atualizarCliente` e `updatePerson`**, com o vínculo (critério 9a):
  - o `update` não tem `email`, `phone_country_code` nem `phone`;
  - nome, dono e "cliente desde" gravam;
  - `contatos_parecidos` não é chamado;
  - sem o vínculo, os testes de hoje continuam verdes.
- **`ClienteDialog` e `PersonDialog`**, com `partner_organization_id`: não há campo de e-mail nem de telefone, e a descrição é "O contato é o do parceiro." (D13).
- **`DadosCadastrais`**, com `parceiro="Thais Fabrini"`: no lugar do bloco do link aparece "Cliente de Thais Fabrini: os dados cadastrais são lançados aqui, em Editar.", sem `GerarLink` e sem "Gere o link para o cliente preencher". O Editar abre sem os três campos.
- **`listPeopleForPicker`** filtra com `.is("partner_organization_id", null)`. A prova de que a Nova oportunidade não o oferece é o filtro, conferido na revisão, e o banco recusa de qualquer jeito (T4).

**Telas:**
- `clientes/[id]/page.tsx` passa o nome do parceiro a `DadosCadastrais` e o vínculo a `ClienteDialog`.
- `contatos/page.tsx` passa o vínculo a `PersonDialog`.

- [ ] Vermelho → código → verde → `bun run verify` → commit `feat: cliente de parceiro sem contato próprio nem link da ficha (PAR-7, PAR-8)`.

### T10 Documentação, verificação e push

- [ ] **Documentação:**
  - `docs/spec.md`: PAR-4 a PAR-11 ✅.
  - `docs/plano.md`:
    - o que está no ar;
    - a pendência da Fase 7 (N1 da segunda revisão): `getBoard` (`features/opportunities/queries.ts`) e `etapasDoFunilLocal` (`features/settings/consultas-locais.ts:84`) procuram o funil padrão sem filtrar pela organização atual. Isso já morde a `teste-executora`;
    - o conserto da semente (D1).
  - `AGENTS.md`:
    - a exceção registrada: `people.partner_organization_id` aponta para outra organização de propósito, com as guardas do desenho §6 no lugar da chave composta;
    - na tabela "UI: use o que já existe": `contatoExibido` / `ViaDoParceiro`, `parceirosVisiveis`, `ehDonoDaRaiz` / `vinculoLocal`, e `ModosDoContato` com `comParceiro`.
  - `tests/rls/README.md`: já feito no T2. Conferir.
- [ ] **Verificação:** `bun run verify`, `bun run build` e a fumaça local (`bun run dev` e depois `bun run test:fumaca`). A seção `/configuracoes/parceiros` entra sozinha por `ALL_SECTIONS`.
- [ ] **Revisão final:** `superpowers:requesting-code-review` sobre o intervalo de commits, com o desenho e o §7.17 como requisito. Críticos e Importantes se corrigem antes de dizer pronto.
- [ ] **Push [Renato]**, e depois o CI e `/api/versao`.
- [ ] **Conferência à mão [Renato]**, depois do push:
  - cadastrar a Thais (critério 1);
  - criar um cliente dela e conferir o perfil, a lista e o Financeiro (critérios 4, 6 e 12);
  - celular com 375 px: os diálogos rolam inteiros e Parceiros vira cartões (critério 15);
  - Parceiros sem internet: lista do espelho, e o parceiro criado sobe quando a rede volta (critério 14).

## Como cada critério é provado

| Critério | Prova |
|---|---|
| 1 Cadastro | T1 (RLS do `update` e a prova do `insert`), T6 (schema e diálogo) e a conferência à mão |
| 2 Quem cadastra | T1 (API, `42501` com dado inválido), T6 (botões por papel) |
| 3 Editar muda todos | T3 (telefone novo em `buscar_clientes`, pessoa nula), T5 (`contatoExibido` sem cópia) |
| 4 Novo cliente › Parceiro | T3 (banco), T7 (ação e diálogo) |
| 5 Nome repetido | T3 (banco), T7 (aviso e "Criar mesmo assim") |
| 6 O contato aparece | T3 (busca por "Parceiro de Teste"), T5 (`null` = ausente), T8 (telas e Financeiro) |
| 7 Sem aviso de duplicado | T3 (`contatos_parecidos`); o ramo do parceiro não procura parecido |
| 8 Dados cadastrais | T4 (link recusado, `insert` e `update`), T9 (sem as chaves, frase no lugar do link) |
| 9 Fora do funil | T4 (as três recusas, calado para estranho, "+ Novo processo"), T9 (seletor) |
| 9a Os Editar | T9 |
| 10 Vínculo fixo | T3 (API e portal), prova `vinculo-do-parceiro.sql` (real ↔ teste) |
| 11 Nada de acesso novo | T2 (testes de hoje sem mudança), T3 (`parceiro` e `staff` não enxergam) |
| 12 Financeiro | T3 (cobrança em US$ com duas parcelas), T8 (rótulo e "via") |
| 13 Teste fora da tela real | T5 (`parceirosVisiveis`) |
| 14 Offline | T6 (fila e recusa na Sincronização) e a conferência à mão |
| 15 Celular | Conferência à mão |

## Verificação

- Por tarefa: o teste vermelho visto, depois verde.
- Antes de cada commit: `bun run verify`.
- Depois de cada migration: `bun run test:rls` inteiro.
- No fim: build e fumaça. Depois do push: CI verde e `/api/versao`.
