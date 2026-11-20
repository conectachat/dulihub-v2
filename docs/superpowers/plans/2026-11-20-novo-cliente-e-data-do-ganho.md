# Novo cliente e ajustar a data do Ganho — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (nativo, como nas entregas 0 a 3). Passos com checkbox (`- [ ]`). TDD em todo passo de código: teste vermelho visto antes do código.

**Objetivo:** a gestão cria cliente à mão na tela Clientes (o cliente antigo que não passou pelo funil) e ajusta a data de um Ganho; o "Marcar como cliente" passa a pôr quem marca como dono.

**Arquitetura:**
- **Duas migrations que só acrescentam.** A 0055 traz o Novo cliente e a 0056 traz a data do Ganho. As duas são compatíveis com o código no ar (`d0a7905`): nenhuma tela grava `closed_at` de negócio ganho, e o dono novo no `marcar_como_cliente` só acrescenta. Por isso há um push só, no fim.
- **Cada gravação é uma função do banco, numa transação**, como `criar_oportunidade` e `ganhar_negocio`. A tela só chama.
- **Clientes e CRM continuam lendo do servidor** (exceção registrada no `AGENTS.md`).

**Tech stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), bun, vitest, jsdom, @testing-library.

**Spec:** `docs/spec.md`: CLI-15 (§7.16, com o critério abaixo da tabela), CRM-17 (§7.3, com o critério abaixo da tabela) e a mudança no CLI-12. Commit `f33c076`, revisada em 4 rodadas.

## Decisões deste plano

| # | Decisão | Por quê | Custo se errada |
|---|---|---|---|
| D1 | `criar_cliente` recebe `p_organizacao` da tela (`contextoAtual().organizationId`) e confere a gestão dela antes de tudo | O contato novo não tem registro-pai; é o que `createPerson` já faz ao carimbar a organização atual. Para o contato existente, a organização é a da pessoa, e ela tem de ser a `p_organizacao` | Nenhum: quem não é da gestão daquela organização é recusado |
| D2 | `criar_cliente` grava pelo `marcar_como_cliente` (`perform`), que já liga a marca, grava "cliente desde", histórico e, agora, o dono | Um caminho só para "tornar cliente à mão": os dois gravam igual (CLI-15, "vale também para o Marcar como cliente") | Nenhum |
| D3 | O contato novo nasce como `contact` e vira cliente pelo `marcar_como_cliente`, na mesma transação | Inserir já como `client` não preenche "cliente desde" (0045) nem o histórico | Nenhum |
| D4 | O teste de "busca" de `buscar_clientes` (0049/0050) sobe para `private.casa_com_a_busca(...)`, usada por `buscar_clientes` (recriada com a mesma assinatura) e pela nova `buscar_contatos_para_cliente` | É a segunda cópia de uma regra de telefone que já teve dois defeitos (0050). Extrair na segunda (AGENTS) | Um `create or replace` a mais; `buscar-clientes.test.ts` segura |
| D5 | A data do Ganho usa a marca `dulihub.via_ganho`. A trava nova é `before update of closed_at`, passa com a marca ou com `pg_trigger_depth() > 1`, e só recusa quando o negócio **continua** ganho (`old.status = 'won' and new.status = 'won'`). Sair do ganho fica com a trava da 0054, que dispara depois pela ordem alfabética | O recurso é o mesmo, o ganho do negócio (§3: uma marca por recurso). `ganhar_negocio` e `reabrir_negocio` já gravam `closed_at` sob ela | Nenhum |
| D6 | `?novo-processo=novo` abre o "+ Novo processo" sem negócio. O valor `novo` é a constante `NOVO_PROCESSO_SEM_NEGOCIO`, e `enderecoDoNovoCliente(id)` monta o endereço | O parâmetro de hoje só aceita o id de um negócio do cliente (M4 da revisão da spec) | Nenhum |
| D7 | `CamposDoContatoNovo` (os quatro campos `novo_*`) sobe de `crm/opportunity-dialog.tsx` para `src/components/`, e a leitura deles no servidor sobe de `createOpportunity` para `contatoNovoDoFormulario` (`src/lib/contato.ts`) | Segunda cópia (AGENTS) | Nenhum |
| D8 | "É da gestão" vira `ehDaGestao(papel)` (regra pura) e `daGestaoDe(supabase, organizationId, userId)` (a consulta), em `src/lib/organizacao.ts`, usados por `contatos/[id]`, pelo lead e por Clientes | Segunda cópia da consulta de `contatos/[id]/page.tsx:95-117` e da regra "owner ou admin" | Nenhum |
| D9 | O histórico do ajuste formata as datas com `private.dia_em_sao_paulo(timestamptz) → 'DD/MM/AAAA'` | O fuso da sessão no Supabase é UTC: um ganho às 22h30 de 31/10 escreveria "01/11" (rodada 3 da spec) | Nenhum |
| D10 | O seletor de contato existente busca no servidor (`buscar_contatos_para_cliente`, até 20, com o total), já ao abrir, com 350 ms de espera entre teclas; resposta atrasada é descartada | A spec pede busca e "Mostrando 20 de N". As Server Functions do Next 16 rodam uma de cada vez, então a espera evita fila | Uma consulta por pausa de digitação |
| D11 | Ajustar para o mesmo dia que já está gravado não grava nada nem escreve histórico (confirmado pelo Renato em 20/nov, e na spec) | Quem confirma sem mudar nada espera que nada aconteça | Nenhum |

## Restrições globais

As das entregas 0 a 3 continuam valendo:
- `bun`, nunca `.env.local`, nunca `--no-verify`.
- Migration, `database.types.ts` e `docs/banco.md` no mesmo commit.
- `drop` + `create` quando a assinatura muda, com `revoke`/`grant`; função nova em `public` nasce executável por `anon`.
- Dado de teste aleatório, só na organização de teste, limpo em `finally` (apagar a pessoa leva tudo).
- Nunca apagar o "Cliente de Teste".
- Tokens, raios e ícone como elemento.
- `verify` verde antes de cada commit.
- Push só pelo Renato.

Da spec, cópia exata:

| Situação | Mensagem |
|---|---|
| Novo cliente sem ser da gestão (função) | "Só a gestão marca alguém como cliente." |
| Contato de outra organização | "Este contato é de outra organização; quem o torna cliente é a gestão de lá." |
| Contato no funil | "Este contato está no funil: use o Ganho." |
| Já é cliente / lixeira / não existe | "Já é cliente." / "Este contato está na lixeira. Restaure antes." / "Contato não encontrado." |
| Nem contato nem contato novo, ou os dois | "Escolha um contato ou preencha um novo" (a mesma da 0041) |
| Aviso no diálogo | "Não tem volta: cliente não volta a ser lead." |
| Busca acima do limite | "Mostrando 20 de N; refine a busca." |
| Clientes vazia, para a gestão | "Um contato vira cliente quando o negócio dele é ganho, ou pelo Novo cliente." |
| Ajuste sem ser da gestão | "Só a gestão ajusta a data do ganho." |
| `update` direto de `closed_at` de negócio ganho | "Use o Ajustar data." |
| Negócio não ganho | "Só o negócio ganho tem a data ajustada." |
| Dia no futuro | "A data do ganho não pode ser no futuro." |
| Dia antes de 01/01/2000 | "A data do ganho não pode ser antes de 2000." |
| Negócio que não se enxerga | "Negócio não encontrado." |
| Sem dia | "Informe a data." |
| Histórico do ajuste | "Data do ganho ajustada de DD/MM/AAAA para DD/MM/AAAA" |

Todas com `errcode = 'P0001'`. "Hoje" no banco é `(now() at time zone 'America/Sao_Paulo')::date`.

## Foco da revisão

1. **Duplo clique em "Criar cliente"** com contato existente: a segunda chamada recebe "Já é cliente." e nada se duplica (T1).
2. **Contato que entra no funil entre a busca e o clique:** o banco recusa com a frase do funil (T1).
3. **Ajuste feito às 22h de São Paulo:** o dia mostrado é o escolhido, e o "hoje" do diálogo é o de São Paulo, não o do UTC (T2 no banco, T5 na tela).
4. **Contato de outra organização:** a separação por `organization_id` tem prova no T1, com uma pessoa da organização de teste atribuída à Duli (o precedente é `tests/rls/oportunidade-nova.test.ts:323-358`). Só o `outra_organizacao: true` no aviso não dá para provar contra o banco: o `colaborador` é `staff` (é recusado antes dos parecidos) e o `parceiro` só enxerga a organização de teste. Esse cálculo fica provado por revisão; a tela, por teste de unidade (T3).
5. **Busca com `%`, `_`, máscara de telefone e DDI** (T1, reaproveitando os casos de `buscar-clientes.test.ts`).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0055_novo_cliente.sql` | `private.casa_com_a_busca`, `buscar_clientes` recriada com ela, `buscar_contatos_para_cliente`, `criar_cliente`, `marcar_como_cliente` com dono |
| `supabase/migrations/0056_data_do_ganho.sql` | `private.dia_em_sao_paulo`, `ajustar_data_do_ganho`, gatilho `opportunities_data_do_ganho` |
| `tests/rls/novo-cliente.test.ts`, `tests/rls/data-do-ganho.test.ts` | As provas no banco |
| `tests/rls/estagio-do-cliente.test.ts`, `tests/rls/buscar-encerradas.test.ts` | O dono no Marcar como cliente; a janela do quadro pelo ajuste |
| `src/components/modos-do-contato.tsx` | `BotaoQueDispensa` e o par "Contato existente / Novo contato" |
| `src/features/clientes/regras.ts` | `dicaDaListaVazia`, `oQueAbrir` |
| `src/lib/contato.ts` | `contatoNovoDoFormulario` |
| `src/lib/organizacao.ts` | `ehDaGestao`, `daGestaoDe` |
| `src/lib/pessoa.ts` | `NOVO_PROCESSO_SEM_NEGOCIO`, `enderecoDoNovoCliente` |
| `src/lib/parecidos.ts` | `outraOrganizacao` em `ContatoParecido`; `respostaDoNovoCliente` |
| `src/lib/formatar.ts` | `diaEmSaoPaulo` |
| `src/components/campos-do-contato-novo.tsx` | Os quatro campos do contato novo |
| `src/components/aviso-de-duplicado.tsx` | Parecido de outra organização |
| `src/features/clientes/novo-cliente-actions.ts` | `criarCliente`, `buscarContatosParaCliente` |
| `src/app/(app)/clientes/novo-cliente-dialog.tsx`, `clientes/page.tsx` | O botão e o diálogo |
| `src/app/(app)/clientes/[id]/page.tsx`, `novo-processo-dialog.tsx` | O "+ Novo processo" aberto sem negócio |
| `src/features/opportunities/actions.ts` | `ajustarDataDoGanho` |
| `src/app/(app)/crm/[id]/acoes-do-negocio.tsx`, `crm/[id]/page.tsx` | "Ajustar data" no lead ganho |

---

### T1 0055 — Novo cliente no banco (CLI-15, CLI-12)

**Interfaces:**
- **Produz:**
  - `public.criar_cliente(p_organizacao uuid, p_contato uuid default null, p_novo_contato jsonb default null, p_confirmar_contato_parecido boolean default false) returns jsonb`, `security invoker`, `revoke` de `public, anon` e `grant` a `authenticated`.
    - Devolve `{"situacao":"criado","pessoa":uuid}` ou `{"situacao":"precisa_confirmar","parecidos":[{id, nome, estagio, na_lixeira, bate_email, bate_telefone, outra_organizacao}]}`.
  - `public.buscar_contatos_para_cliente(p_organizacao uuid, p_busca text default '', p_limite int default 20) returns table (id uuid, full_name text, email text, phone_country_code text, phone text, total bigint)`, `stable`, `security invoker`.
  - `public.marcar_como_cliente(p_pessoa, p_desde)`: mesma assinatura, agora com `owner_id = coalesce(owner_id, auth.uid())`.

**Testes primeiro**, em `tests/rls/novo-cliente.test.ts`, com pessoas descartáveis da organização de teste (`pessoaDescartavel` de `tests/rls/clientes.ts`, ou `insert` pelo `parceiro`), apagadas no `afterAll`. Contas: `parceiro` é a gestão, `staff` é o membro comum e `colaborador` é da Duli.

- **`staff`:** com contato novo, recebe "Só a gestão marca alguém como cliente." e nenhuma pessoa com aquele e-mail existe depois. Com contato existente, a mesma frase, e o estágio não muda.
- **Organização errada:** o `parceiro` passando a organização da Duli em `p_organizacao`, com contato novo, recebe "Só a gestão marca alguém como cliente.".
- **Contato existente sem dono,** sem negócio: vira `client`, com `client_since` de hoje em São Paulo, `owner_id` igual ao `parceiro`, e o histórico tem exatamente uma `virou_cliente` "Marcado como cliente". Duas chamadas ao mesmo tempo (`Promise.all`): exatamente uma recebe "Já é cliente.", e há exatamente uma `virou_cliente` (Foco 1).
- **Contato existente com dono** (o `staff`): o dono não muda.
- **Negócio aberto:** contato com negócio aberto recebe "Este contato está no funil: use o Ganho." e nada muda (Foco 2). Com o negócio perdido, passa.
- **Outras recusas:** lixeira → "Este contato está na lixeira. Restaure antes."; `crypto.randomUUID()` → "Contato não encontrado."; contato e contato novo juntos → "Escolha um contato ou preencha um novo".
- **Contato novo válido:** nasce na organização de teste como `client`, com dono `parceiro` e "Marcado como cliente". E-mail inválido recebe a frase de `contato_valido` e nada nasce.
- **Parecido:** contato novo com o e-mail de uma pessoa existente → `precisa_confirmar`, com aquela pessoa em `parecidos` e `outra_organizacao: false`, e nada nasce. Com `p_confirmar_contato_parecido: true`, nasce.
- **`marcar_como_cliente`** (em `estagio-do-cliente.test.ts`, no teste "a gestão marca com a data escolhida"): passa a esperar `owner_id = parceiro`. Teste novo: pessoa com dono `staff` marcada pela gestão continua com o dono `staff`.
- **`buscar_contatos_para_cliente(org de teste, busca)`:**
  - acha por parte do nome, por "@dominio" e pelos dígitos do telefone com máscara e DDI;
  - não traz cliente, lixeira nem quem tem negócio aberto;
  - `p_limite: 2` com 3 resultados devolve 2 linhas e `total` 3;
  - `%` e `_` são literais.
- **`buscar-clientes.test.ts`** continua verde sem mudança: prova o D4.
- **Organização atual** (Foco 4): o `parceiro` cria, na organização de teste, uma pessoa atribuída à Duli, como em `oportunidade-nova.test.ts:323-358`, e a apaga em `finally`. O `colaborador`, que a enxerga:
  - em `buscar_contatos_para_cliente(<Duli>, ‹nome dela›)`, não a recebe;
  - em `criar_cliente(<Duli>, p_contato = ela)`, recebe recusa ("Só a gestão marca alguém como cliente."), e o estágio dela não muda.

**Migration** (`0055_novo_cliente.sql`, cabeçalho com D1 a D4):

- `private.casa_com_a_busca(p_busca text, p_nome text, p_email text, p_ddi text, p_telefone text) returns boolean`:
  - `language sql`, `stable`, `set search_path = ''`;
  - o corpo copia literalmente a CTE `termo` e o `where` de `buscar_clientes` na 0050 (inclusive "sem letra nem @ → dígitos" e o DDI 55 quando falta), trocando as colunas pelos parâmetros;
  - `grant execute … to authenticated`, como `private.telefone_nacional`.
- `create or replace public.buscar_clientes(...)`, com a mesma assinatura e o `where` trocado por `private.casa_com_a_busca(p_busca, p.full_name, p.email, p.phone_country_code, p.phone)`.
- `buscar_contatos_para_cliente`:
  - `p.organization_id = p_organizacao`, `lifecycle_stage <> 'client'`, `deleted_at is null`;
  - `not exists (select 1 from public.opportunities o where o.person_id = p.id and o.status = 'open')`;
  - casa a busca;
  - `order by full_name, id`, `count(*) over ()`, `limit greatest(coalesce(p_limite, 20), 0)`.
- `criar_cliente`, nesta ordem:
  1. Exatamente um de `p_contato` e `p_novo_contato`.
  2. **Existente:** `select organization_id, lifecycle_stage, deleted_at … for update` (sob a RLS).
     - Não achou: "Contato não encontrado.".
     - Não é gestão da organização da pessoa: frase da gestão.
     - Organização diferente de `p_organizacao` (`is distinct from`, para `p_organizacao` nulo não passar): frase de outra organização.
     - Na lixeira: frase da lixeira.
     - Já é `client`: "Já é cliente.".
     - Tem negócio `open`: frase do funil.
  3. **Novo:**
     - Não é gestão de `p_organizacao`: frase da gestão.
     - Nome, tamanho, `contato_valido` e `normalizar_ddi`, com as frases e a ordem do passo 5 da `criar_oportunidade` (0041).
     - Sem a confirmação, os parecidos de `contatos_parecidos` com `outra_organizacao = (select organization_id from public.people where id = c.id) <> p_organizacao` devolvem `precisa_confirmar`.
     - Senão, `insert` em `people` com `organization_id = p_organizacao`, `lifecycle_stage = 'contact'` e `created_by = auth.uid()`.
  4. `perform public.marcar_como_cliente(v_pessoa)`.
  5. Devolve `criado`.
- `create or replace public.marcar_como_cliente`: o corpo da 0054, com `owner_id = coalesce(owner_id, (select auth.uid()))` no `update`.

**Passos:**
- [ ] Vermelho: `bun x vitest run --no-file-parallelism tests/rls/novo-cliente.test.ts tests/rls/estagio-do-cliente.test.ts`. Esperado: falham os testes novos (função inexistente, dono nulo), e os outros passam.
- [ ] Aplicar a 0055 pelo conector.
- [ ] Verde nos dois arquivos e em `tests/rls/buscar-clientes.test.ts`.
- [ ] Tipos: `generate_typescript_types` grava o resultado num arquivo; o script `tipos.py` do rascunho da sessão (`C:\Users\renat\AppData\Local\Temp\claude\5e04d219d31dad4a\e1aa611e-0d4d-4e32-9670-a1be0bd7428e\scratchpad\tipos.py <arquivo> src/lib/supabase/database.types.ts`) só extrai o campo `types` e grava. O gerador perde a nulidade das colunas de função que devolve tabela; quem lê alarga o tipo à mão (T4).
- [ ] `docs/banco.md`: as RPCs novas, a linha de `buscar_clientes`, `private.casa_com_a_busca` nas auxiliares, a linha de `marcar_como_cliente`, a §6 e a situação "0001 a 0055".
- [ ] `bun run test:rls` inteiro.
- [ ] Commit `feat(banco): Novo cliente (0055)`.

### T2 0056 — a data do Ganho no banco (CRM-17)

**Interfaces:**
- **Produz:**
  - `public.ajustar_data_do_ganho(p_negocio uuid, p_data date) returns uuid` (o `person_id` do negócio, para a tela revalidar a pessoa), `security invoker`, com `revoke`/`grant`.
  - `private.dia_em_sao_paulo(p_momento timestamptz) returns text`, que devolve `to_char(p_momento at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')`, `stable`, `set search_path = ''`, com `revoke` de `public, anon` e `grant execute` a `authenticated` (ela roda dentro de função `invoker`).
  - Gatilho `opportunities_data_do_ganho`, `before update of closed_at`, `security definer`, com `revoke` de `public, anon, authenticated`.

**Testes primeiro**, em `tests/rls/data-do-ganho.test.ts`. Cada negócio é ganho pelo `ganhar_negocio`, numa pessoa descartável.

- **Ajuste válido:** a gestão ajusta para um dia passado `D`. `closed_at` passa a ser `new Date(\`${D}T00:00:00-03:00\`)`. O histórico da pessoa tem "Data do ganho ajustada de ‹hoje em DD/MM/AAAA› para ‹D em DD/MM/AAAA›". Ajustar de novo para `E` grava "de ‹D› para ‹E›".
- **Mesmo dia:** ajustar para o dia que já está gravado não muda `closed_at` nem cria linha no histórico.
- **Antes de 2000:** `1999-12-31` recebe "A data do ganho não pode ser antes de 2000."; `2000-01-01` passa — neste caso confere-se o dia em São Paulo (`hojeEmSaoPaulo(new Date(closed_at)) === "2000-01-01"`), não o instante: em 01/01/2000 São Paulo estava em horário de verão (`-02:00`), e a regra `-03:00` do ajuste válido não vale.
- **Hoje e futuro:** ajustar para hoje passa. Amanhã, em São Paulo, recebe "A data do ganho não pode ser no futuro.".
- **Recusas:**
  - o `staff`: "Só a gestão ajusta a data do ganho.";
  - o `colaborador` da Duli: "Negócio não encontrado.";
  - negócio aberto: "Só o negócio ganho tem a data ajustada.";
  - `p_data` nulo: "Informe a data.".
- **`update` direto** de `closed_at` de negócio ganho, pela gestão: "Use o Ajustar data.", e a data não muda.
- **Sair do ganho** por `update` com `{status: 'open', stage_id, closed_at: null}` continua recebendo "Use o Ganho ou o Reabrir do negócio." — `ganho.test.ts:458-462` fica sem mudança e é a prova.
- **Quadro:** com `filtroDoQuadro(new Date())` (como em `buscar-encerradas.test.ts`), ajustado para 31 dias atrás o negócio sai do quadro; para 29, fica.
- **"Cliente desde":** o `client_since` da pessoa não muda com o ajuste.
- **Reabrir e ganhar de novo** passam: `closed_at` vai a nulo e depois a hoje. Apagar a pessoa leva tudo.
- **Ajuste na suíte:** `tests/rls/buscar-encerradas.test.ts:242-245` deixa de fazer `update` direto e passa a usar `ajustar_data_do_ganho` com o dia de 40 dias atrás.
- **Conferência à mão** (Foco 3), registrada no ledger, depois de aplicar: `select private.dia_em_sao_paulo('2026-10-31 22:30-03')` devolve `31/10/2026`.

**Migration** (`0056_data_do_ganho.sql`):
- **`ajustar_data_do_ganho`**, nesta ordem:
  1. `select … for update` sob a RLS. Não achou: "Negócio não encontrado.".
  2. Não é gestão da organização do negócio: frase da gestão do ajuste.
  3. Status diferente de `won`: frase do não ganho.
  4. `p_data` nulo: "Informe a data.".
  5. `p_data` maior que hoje em São Paulo: frase do futuro. `p_data` antes de `date '2000-01-01'`: frase de antes de 2000.
  5a. O mesmo dia que já está gravado (em São Paulo): não grava nada nem escreve histórico, e devolve o `person_id`.
  6. Liga a marca e faz `update closed_at = (p_data::timestamp at time zone 'America/Sao_Paulo')`.
  7. Desliga a marca.
  8. Grava a atividade `stage_change`, com `opportunity_id`, "Data do ganho ajustada de " || `dia_em_sao_paulo(antes)` || " para " || `dia_em_sao_paulo(depois)`.
  9. Devolve o `person_id`.
- **Gatilho:** passa com `pg_trigger_depth() > 1` ou com a marca. Com `old.status = 'won' and new.status = 'won' and new.closed_at is distinct from old.closed_at`, recusa com "Use o Ajustar data.". O `update` que tenta sair do ganho (status muda) não é recusado por ele: quem garante é a condição `new.status = 'won'`. Sem ela, como `opportunities_data_do_ganho` vem antes de `opportunities_ganho_so_pela_funcao` na ordem alfabética, a frase daquele caso deixaria de ser a da 0054.

**Passos:**
- [ ] Vermelho: `data-do-ganho.test.ts`.
- [ ] Aplicar a 0056.
- [ ] Verde.
- [ ] Tipos.
- [ ] `banco.md`: a linha de `opportunities`, as RPCs, as funções de gatilho e a situação "0001 a 0056".
- [ ] `test:rls` inteiro.
- [ ] Conferência à mão.
- [ ] Commit `feat(banco): ajustar a data do Ganho (0056)`.

### T3 Peças compartilhadas

**Interfaces:**
- **Produz:**
  - `contatoNovoDoFormulario(formData: FormData): { ok: true; contato: { full_name: string; email: string | null; phone_country_code: string | null; phone: string | null } } | { ok: false; erro: string }`, em `src/lib/contato.ts`. Lê os quatro campos `novo_*`. Sem nome, devolve "Informe o nome". Depois aplica `erroDeContato` e `normalizarDdi`.
  - `CamposDoContatoNovo()`, em `src/components/campos-do-contato-novo.tsx`. É o bloco de `opportunity-dialog.tsx:197-222`, sem mudança visível.
  - `ehDaGestao(papel: PapelNaOrganizacao | null | undefined): boolean` (`owner` ou `admin`) e `daGestaoDe(supabase, organizationId: string, userId: string | null): Promise<{ daGestao: boolean; error: string | null }>`, em `src/lib/organizacao.ts`. A segunda usa a primeira.
  - `BotaoQueDispensa` e `ModosDoContato({ modo, aoTrocar, rotulo }: { modo: "existente" | "novo"; aoTrocar: (m) => void; rotulo: string })` (o `aria-label` do grupo: "Contato da oportunidade" na Nova oportunidade, "Contato do cliente" no Novo cliente) sobem de `crm/opportunity-dialog.tsx:30-48 e 136-158` para `src/components/modos-do-contato.tsx` (segunda cópia: o Novo cliente usa os dois). O campo oculto `modo_contato` vai junto.
  - `NOVO_PROCESSO_SEM_NEGOCIO = "novo"` e `enderecoDoNovoCliente(id: string): string`, que devolve `/clientes/<id>?aba=projetos&novo-processo=novo`, em `src/lib/pessoa.ts`.
  - `ContatoParecido.outraOrganizacao?: boolean`.
  - `respostaDoNovoCliente`, schema zod em `src/lib/parecidos.ts`, com `outra_organizacao` virando `outraOrganizacao`.
  - `diaEmSaoPaulo(iso: string): string` (`AAAA-MM-DD`), em `src/lib/formatar.ts`: é `hojeEmSaoPaulo(new Date(iso))`.

**Testes primeiro**, de unidade:
- **`contatoNovoDoFormulario`:**
  - DDI "55" vira "+55";
  - sem nome: "Informe o nome";
  - e-mail inválido: a frase de `erroDeContato`.
- **`createOpportunity`:** os testes de hoje continuam verdes com a leitura nova.
- **`opportunity-dialog.test.tsx`:** continua verde, o que prova a extração.
- **`ehDaGestao`:** `owner` e `admin` dão `true`; `staff`, nulo e indefinido dão `false`.
- **`daGestaoDe`**, com banco falso: o papel da linha passa por `ehDaGestao`; nenhuma linha dá `false`; erro de leitura vem como `error`; `userId` nulo dá `false` sem consultar.
- **`contatos/[id]/page.tsx`** passa a usar `daGestaoDe`. O teste de `marcar-como-cliente` continua verde.
- **`enderecoDoNovoCliente("p1")`** devolve `/clientes/p1?aba=projetos&novo-processo=novo`.
- **`AvisoDeDuplicado`:**
  - parecido com `outraOrganizacao: true` mostra "Este contato é de outra organização; quem o torna cliente é a gestão de lá." e um link "Abrir perfil", sem "Sim, é a mesma pessoa" e sem "Restaurar" — também quando está na lixeira;
  - os outros parecidos da lista continuam com "Sim".
- **`respostaDoNovoCliente`:** lê `criado` e `precisa_confirmar`.
- **`diaEmSaoPaulo`:**
  - `"2026-11-02T01:30:00Z"` dá `"2026-11-01"`;
  - `"2026-11-01T03:00:00Z"` dá `"2026-11-01"`.
- **`formatarData("2026-11-01T03:00:00+00:00")`** mostra 01/11/2026.

- [ ] Vermelho → código → verde → `bun run verify` → commit `refactor: peças do Novo cliente e da data do Ganho`.

### T4 Novo cliente na tela (CLI-15)

**Interfaces:**
- **Consome:** T1 e T3.
- **Produz:**
  - `criarCliente(prev: EstadoComConfirmacao, formData: FormData): Promise<EstadoComConfirmacao>` e `buscarContatosParaCliente(busca: string): Promise<{ linhas: ContatoParaCliente[]; total: number; error: string | null }>`, em `src/features/clientes/novo-cliente-actions.ts` (`"use server"`). `ContatoParaCliente` é declarado à mão — `{ id: string; full_name: string; email: string | null; phone_country_code: string | null; phone: string | null }` — e a leitura alarga o tipo gerado com um comentário do motivo, como `ClienteDaLista` (`features/clientes/queries.ts:5-14`): o gerador dá as três como não nulas, e contato sem e-mail ou telefone existe (0040). O formulário usa os campos da Nova oportunidade: `modo_contato`, `person_id` e os quatro `novo_*`;
  - `NovoClienteDialog()`, em `src/app/(app)/clientes/novo-cliente-dialog.tsx`;
  - `dicaDaListaVazia(daGestao: boolean): string`, em `src/features/clientes/regras.ts`.

**Testes primeiro**, de unidade:
- **`criarCliente`:**
  - manda `p_organizacao` de `contextoAtual`; sem organização, devolve `falhou(SEM_ORGANIZACAO)` sem chamar o banco;
  - no modo existente, manda `p_contato`; no modo novo, manda `p_novo_contato` por `contatoNovoDoFormulario`;
  - a confirmação vem só de `CAMPO_CONFIRMAR_PARECIDO`;
  - `precisa_confirmar` devolve `parecidos`, com `outraOrganizacao`, sem `ok`;
  - `criado` chama `revalidarPessoa(id)`, `revalidatePath("/")` (o Início conta clientes) e `redirect(enderecoDoNovoCliente(id))`;
  - erro do banco passa por `traduzirErro`.
- **`buscarContatosParaCliente`:** chama a RPC com `p_organizacao` e `p_limite: 20`; devolve as linhas e o `total` da primeira linha, ou 0.
- **`NovoClienteDialog`:**
  - abre com "Contato existente" e já busca com o termo vazio — no `aoAbrir` do `FormDialog`, que é um evento (como o `recomecar` da Nova oportunidade), junto com a volta do termo, da lista e do escolhido ao começo; nada de `useEffect` —: os 20 primeiros e o total;
  - digitar busca, depois de 350 ms (a espera de `BuscaNaUrl`, num timer do `onChange`, sem `setState` em `useEffect`), mostra as linhas com nome, e-mail e telefone;
  - resposta atrasada não vale: com duas buscas resolvidas fora de ordem, a lista é a do termo que está na caixa;
  - Enter na caixa de busca não envia o formulário, e a caixa não tem `name`;
  - com `total` 25, mostra "Mostrando 20 de 25; refine a busca.";
  - escolher grava o `person_id` oculto, e "Trocar" volta à busca;
  - "Novo contato" mostra `CamposDoContatoNovo`;
  - o aviso "Não tem volta: cliente não volta a ser lead." aparece nos dois modos;
  - com `parecidos`, mostra `AvisoDeDuplicado`. "Sim" num parecido que não é cliente reenvia no modo existente; num parecido que já é cliente, navega para `enderecoDoNovoCliente`; "Restaurar" chama `restorePerson` e reenvia.
- **O botão:** `clientes/page.tsx` decide por `ehDaGestao(papel)` (provado no T3).
- **`dicaDaListaVazia`:**
  - com `true`, devolve "Um contato vira cliente quando o negócio dele é ganho, ou pelo Novo cliente.";
  - com `false`, devolve a frase de hoje.
- **`?novo-processo=novo`:**
  - função pura `oQueAbrir(atalho: string | undefined, negocios: {id: string}[]): { abrir: boolean; negocioInicial?: string }`, em `src/features/clientes/regras.ts`:
    - `novo` dá `{abrir: true}`;
    - o id de um negócio do cliente dá `{abrir: true, negocioInicial}`;
    - um id desconhecido ou nada dá `{abrir: false}`;
  - `NovoProcessoDialog` ganha a prop `abertoDeInicio: boolean` (o mesmo nome do `FormDialog`) e abre sem negócio.

**Telas:**
- `clientes/page.tsx`:
  - `papel` de `contextoAtual()`; `daGestao = ehDaGestao(papel)`;
  - `<NovoClienteDialog />` nas `actions` do `PageHeader` só para a gestão;
  - `EmptyState` com `dicaDaListaVazia(daGestao)` e, para a gestão, o botão como `action` só no caso `pagina === 1 && !q` (nos outros, a `action` continua a de hoje).
- `clientes/[id]/page.tsx`: usa `oQueAbrir`. A `key` do diálogo muda quando `abrir` muda.

- [ ] Vermelho → código → verde → `bun run verify` → commit `feat(clientes): Novo cliente (CLI-15)`.

### T5 Ajustar a data do Ganho na tela (CRM-17)

**Interfaces:**
- **Consome:** T2 e T3 (`daGestaoDe`, `diaEmSaoPaulo`).
- **Produz:**
  - `ajustarDataDoGanho(prev: ActionState, formData: FormData): Promise<ActionState>`, em `src/features/opportunities/actions.ts`. Recebe os campos `id` e `data` (`AAAA-MM-DD`, validado por zod).
  - `AjustarDataDoGanho({ negocioId, dia, hoje }: { negocioId: string; dia: string; hoje: string })`, em `crm/[id]/acoes-do-negocio.tsx`. `hoje` vem do servidor (`hojeEmSaoPaulo()`), como em `MarcarComoCliente`.

**Testes primeiro**, de unidade:
- **A ação:**
  - chama `ajustar_data_do_ganho` com `p_negocio` e `p_data`;
  - dia fora do formato vira "Informe a data." sem chamar o banco;
  - sucesso usa o `person_id` devolvido pela função: `revalidar(id, personId)` (o que já existe em `actions.ts`) e `revalidatePath("/crm/encerradas")`;
  - erro passa por `traduzirErro`.
- **O componente:**
  - o gatilho é "Ajustar data";
  - o campo `type="date"` vem com `dia`, `min="2000-01-01"` e `max={hoje}`;
  - salvar chama a ação com o dia escolhido.

**Tela:**
- `crm/[id]/page.tsx`:
  - `daGestaoDe(supabase, negocio.organization_id, user.id)`;
  - no bloco "Negócio ganho em ‹data›.", `<AjustarDataDoGanho negocioId dia={diaEmSaoPaulo(negocio.closed_at)} hoje={hojeEmSaoPaulo()} />` só para a gestão e só com `negocio.closed_at` preenchido (o tipo é `string | null`; o bloco já faz `negocio.closed_at ? … : …`).
- **Prova do Foco 3 na tela:** já existe — `formatar.test.ts:54-58` prova que 22h30 de São Paulo continua sendo o dia de São Paulo em `hojeEmSaoPaulo`; `diaEmSaoPaulo` é ela com a data do negócio, e o teste dela é o do T3.

- [ ] Vermelho → código → verde → `bun run verify` → commit `feat(crm): ajustar a data do Ganho (CRM-17)`.

### T6 Documentação, verificação e push

- [ ] **Documentação:**
  - `docs/spec.md`: CLI-15 e CRM-17 ✅.
  - `docs/plano.md`: o que está no ar.
  - `AGENTS.md`, tabela "UI: use o que já existe":
    - `CamposDoContatoNovo` com `contatoNovoDoFormulario`;
    - `ehDaGestao` / `daGestaoDe`;
    - `ModosDoContato` / `BotaoQueDispensa`;
    - `enderecoDoNovoCliente`.
  - O desenho de 17/nov, linha de `marcar_como_cliente` (§6.2): nota de que, desde 20/nov, quem marca fica como dono (CLI-15). O comentário da 0045 não se edita (migration aplicada).
- [ ] **Verificação:** `bun run verify`, `bun run build` e a fumaça local (`bun run dev` e depois `bun run test:fumaca`).
- [ ] **Celular** (critério do CLI-15, conferência à mão do Renato depois do push): o botão fica no topo de Clientes e o diálogo rola por inteiro numa tela de 375 px.
- [ ] **Revisão final** (Code Reviewer, em rodadas até não sobrar ajuste).
- [ ] **Push [Renato]**, e depois CI e `/api/versao`.

## Verificação

- Por tarefa: o teste vermelho visto, depois verde.
- Antes de cada commit: `bun run verify`.
- Depois de cada migration: `bun run test:rls` inteiro.
- No fim: build e fumaça. Depois do push: CI verde e `/api/versao`.
