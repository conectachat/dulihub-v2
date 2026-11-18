# Entrega 2 — Clientes — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (nativo, como nas entregas 0 e 1) ou superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`). TDD em todo passo de código.

## Contexto

As entregas 0 e 1 estão no ar (commits até `276a693`, CI verde). A entrega 2 dá ao cliente um lugar próprio: item **Clientes** no menu, lista e perfil em abas (Dados cadastrais, Financeiro, Projetos, Documentos, Notas). Ela também leva para o banco as regras que hoje só a tela garante: cliente não volta a lead (M17); quem tem processo ou cobrança é cliente (substitui o CON-3); só a gestão marca cliente à mão; e o cliente do portal deixa de ler notas (POR-2). Requisitos CLI-1 a CLI-14.

**Spec:** `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md` §3, §4.1, §6.2, §7–§10 e §13. Requisitos em `docs/spec.md:397-410`.

**Objetivo:** o Renato abre Clientes, acha qualquer cliente por nome, e-mail ou telefone, e no perfil vê e mexe em tudo dele, com as regras de estágio garantidas no banco.

**Arquitetura:**
- **Banco primeiro.** Cinco migrations (0044–0048) com teste de RLS vermelho antes, todas compatíveis com a tela antiga: vão ao ar antes das telas (push 1). A 0049 (busca de clientes) vai com as telas.
- **Clientes lê do servidor**, como Contatos e CRM. É uma exceção à regra "tela nova nasce migrada", registrada no `AGENTS.md` (spec §4.1). A aba Financeiro reaproveita `Cobrancas`, que lê do aparelho.
- **O perfil é movido** de `contatos/[id]` para `clientes/[id]`. O que as duas rotas usam sobe para `src/components/perfil/`. `/contatos/[id]` de cliente redireciona.
- **Arquivos:**
  - os documentos do cliente vão para o depósito `pessoas` (navegador → depósito, e o registro gravado por Server Action);
  - os anexos de parcela vão para o depósito `financeiro`, direto do navegador, porque a tela Financeiro é migrada e não tem `actions.ts`. Só funcionam com internet.

**Histórico:**
- rodada 1 do Code Reviewer no plano (18/nov): 0 crítico; corrigidos I1–I4, M1–M12 e C1–C10;
- rodada 2: 0 crítico; corrigidos I1 (teste da fila deixaria lead permanente na Duli), M1–M8 e C1–C11.

**Fora deste plano:**
- a entrega 3: vistos na oportunidade, `ganhar_negocio` e a marca `via_ganho`, regra (2) do estágio, "processo nunca é apagado" (PRO-12);
- a tela de dono e participantes **da oportunidade**: a tabela entra aqui, a tela vai com a herança no Ganho.

## Decisões deste plano (desvios da spec, cada um com o motivo)

| # | Decisão | Por quê | Custo se errada |
|---|---|---|---|
| D1 | A regra (2) de `estagio_do_cliente` ("só a gestão ou a marca `via_ganho` tornam cliente") **vai para a entrega 3**. Aqui entra só a regra (1), "não volta", junto com o `client_since` | O Ganho de hoje (`features/opportunities/mover.ts:87-99`) promove por `update people` direto. Com a regra (2) já ativa, um colaborador que não é da gestão deixaria de conseguir ganhar negócio. Hoje o único membro real da Duli é o dono (T2), então o efeito prático é nulo nos dois sentidos; a regra entra com a marca, de uma vez, para não haver janela em que o Ganho de um colaborador novo quebre. A própria spec põe a trava do Ganho na migration B da entrega 3 (§6.3, linha 644). Até lá, promover pela API continua como hoje | Brecha que já existe hoje, por uma entrega a mais: até lá, qualquer membro contorna o "só a gestão" em duas chamadas (`people_update_staff` deixa promover, e depois cria o processo). Por isso CLI-12 e CLI-14 ficam 🟡 no `docs/spec.md` até a entrega 3 |
| D2 | `quem_tem_processo_e_cliente` nasce **sem** o ramo da marca: pessoa que não é cliente → só a gestão cria processo ou cobrança, e isso a promove | Ninguém liga a marca antes da entrega 3 | Nenhum: a 3 acrescenta o ramo |
| D3 | A busca de clientes é uma RPC `public.buscar_clientes`, `security invoker`, que devolve também o total | O PostgREST não filtra por `telefone_nacional`, e a lista precisa do total ("mostrando 50 de 72") | Uma função a mais para manter |
| D4 | `files` está vazia (T2), e o app não a usa. O `check` de caminho `{org}/{pessoa}/{arquivo}/{nome}` vale para toda linha, e `bucket` fica restrito a `'pessoas'` | Sem linha antiga, a trava pode ser inteira. Um uso novo de `files` com outro depósito revê o `check` | Nenhum |
| D5 | A aba Financeiro, ao abrir com rede, espera um `sincronizarAgora` e mostra "sincronizando…" | Cobre o I26 e o "logo depois do Ganho" com uma regra só | Uma sincronia a cada abertura da aba |
| D6 | A âncora `#dados-cadastrais` não se converte no `redirect` (o servidor nunca a recebe). Os links passam a apontar direto para `/clientes/<id>?aba=dados`, por uma função `enderecoDaPessoa`. No perfil, um `#dados-cadastrais` que chegue mesmo assim abre a aba Dados | Limite do HTTP | Nenhum |
| D7 | Promover nunca mexe no dono. A migration põe o dono da organização nos clientes atuais. Nos outros, o dono é escolhido em Editar | A herança do dono é do Ganho (entrega 3) | Cliente novo aparece com dono "—" até alguém escolher |
| D8 | A trava de estágio se chama `people_trava_do_estagio`, para rodar **depois** de `people_guard_self_update`. Os gatilhos `before` rodam em ordem alfabética | O cliente do portal continua tendo a mudança desfeita em silêncio, sem erro novo | Nenhum |
| D9 | A fumaça deixa de criar processo em "a primeira pessoa visível" (`rotas.test.ts:243`). Passa a usar uma pessoa descartável, promovida e apagada pelo próprio teste | Com o D2, o teste tornaria cliente, para sempre, quem estivesse lá | Nenhum |
| D10 | Histórico com o tipo de atividade `virou_cliente`, de sistema e que ninguém apaga. Textos: "Oportunidade ganha — virou cliente" (no Ganho, em `mover.ts`), "Virou cliente (processo ‹título›)" e "Virou cliente (cobrança ‹título›)" (no gatilho), "Marcado como cliente" (na função) | Uma linha por promoção, escrita por quem promove. O do Ganho tem teste vermelho próprio no T16 | Textos a ajustar |
| D11 | A importação passa a gravar o **maior** estágio entre o do banco e o do app antigo, e o DDI como "+NN" | Sem isso, rodar de novo rebaixa cliente (`import-people.mjs:205-279`, `366-375`), e a trava recusaria o lote inteiro. O DDI é o item 8 da 4ª revisão | Nenhum |
| D12 | Dono e participantes **da oportunidade**: a tabela entra no T3, a tela vai para a entrega 3 (com a herança no Ganho). CLI-10 fica 🟡 | A spec só desenha a tela do cliente nesta entrega | Uma tabela sem tela por uma entrega |
| D13 | **Limitação conhecida:** consultor de organização **atribuída** vê a lista de documentos (`files_select` usa `can_access_person`), mas não abre nem envia (o depósito e `files_write` decidem pela organização dona) — o mesmo que já acontece hoje com processos e financeiro (`projects_all`, `receivables_all`). Fica registrado no `banco.md` | Mudar o acesso da atribuída é desenho próprio, fora da spec | Consultor atribuído vê lista que não abre |

## Restrições globais

Valem as das entregas 0 e 1 (`docs/superpowers/plans/2026-11-17-entregas-0-e-1-contato.md`, "Restrições globais"):
- `bun`, nunca o `.env.local`;
- comandos de teste por arquivo;
- migration, `database.types.ts` e `banco.md` no mesmo commit;
- `drop` + `create` quando a assinatura muda, com `revoke`/`grant` depois;
- dado de teste aleatório e limpo em `finally`;
- nunca apagar o "Cliente de Teste";
- tokens, raios e ícone como elemento;
- `verify` verde antes de cada commit, nunca `--no-verify`.

Valem também as da spec §3:
- tabela nova com `id`, `unique (id, organization_id)`, chaves estrangeiras compostas, lápide e `updated_at`;
- `on delete set null (coluna)`;
- trava vale também na organização de teste, e só passa com `pg_trigger_depth() > 1` — **exceto** a trava de estágio (T4), que é absoluta em qualquer profundidade (spec §3).

Mais quatro:
- **Fuso:** "hoje" no banco é `(now() at time zone 'America/Sao_Paulo')::date`.
- **Gestão** é `private.current_user_manages(org)` (`0013:51-60`, owner ou admin). Nunca reimplementar.
- **Erros novos**, cópia exata:

  | Situação | Mensagem | Código |
  |---|---|---|
  | Rebaixar um cliente | "Cliente não volta a ser lead." | P0001 |
  | Processo ou cobrança para quem não é cliente, sem ser da gestão | "Só a gestão torna alguém cliente; use o Ganho." | P0001 |
  | Marcar como cliente sem ser da gestão | "Só a gestão marca alguém como cliente." | P0001 |
  | Marcar quem já é cliente | "Já é cliente." | P0001 |
  | Marcar quem está na lixeira | "Este contato está na lixeira. Restaure antes." (a mesma da 0041) | P0001 |
  | Marcar com data no futuro | "A data de cliente não pode ser no futuro." | P0001 |
  | Apagar parcela ou cobrança que tem anexo | "Remova os anexos antes." | P0001 |
  | Trocar o dono do negócio sem ser o dono ou a gestão | "Só o dono do negócio ou a gestão trocam o dono." | P0001 |

  **Por que P0001:** `traduzirErro` (`src/lib/erros.ts:75-77`) só repassa o texto do banco para `P0001` e `23001`; `42501` vira "Você não tem permissão para isto." e `23503`, uma frase genérica. A fila também passa por ele (`fila.ts:238`). Os testes conferem a frase **e** o código.

- **Push é do Renato, em dois pontos:** fim do T8 (banco) e fim do T16 (telas).

## Foco da revisão

Cada item tem teste na tarefa dona.

1. **Cliente voltando a lead por qualquer caminho.** Pela API (T4), pela importação (T6) e pelo portal, com a mudança desfeita em silêncio (T4).
2. **Promoção por processo ou cobrança sem ser da gestão:** pela API, por `criar_processo`, por troca de `person_id` e pela fila do Financeiro, onde a recusa vira conflito e nada é gravado (T4).
3. **Cliente do portal lendo notas ou histórico:** zero linhas, e ele continua lendo a própria pessoa (T5).
4. **Arquivo órfão:** apagar parcela ou cobrança com anexo é recusado, inclusive na organização de teste; apagar a pessoa leva tudo; `excluirCobranca` sem internet manda só o delete da cobrança (T8).
5. **Endereço:** `/contatos/<cliente>?x=1` vai para `/clientes/<id>?x=1`. `?novo-processo=` vai para a aba Projetos. `/contatos/<não cliente>` nunca mostra processos nem financeiro. Testes: `destinoDoContato` no T11 e a fumaça no T16.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0044_dono_e_participantes.sql` | `people.owner_id`, `person_participants`, `opportunity_participants`, trava do dono do negócio, `people_guard_self_update` com `owner_id` e `client_since` |
| `0045_estagio_do_cliente.sql` | `people.client_since`, `people_trava_do_estagio`, `quem_tem_processo_e_cliente`, `marcar_como_cliente`, conversão dos dados (§7) |
| `0046_notas_so_da_equipe.sql` | `private.equipe_alcanca_pessoa` e as policies de leitura de `notes` e `activities` |
| `0047_documentos_do_cliente.sql` | `files.category`, `check` de caminho, chave composta da oportunidade, depósito `pessoas` |
| `0048_anexos_da_parcela.sql` | `installment_files`, depósito `financeiro`, travas de delete com anexo |
| `0049_buscar_clientes.sql` | `public.buscar_clientes` |
| `migration/import-people.mjs`, `migration/regras-da-importacao.mjs` | Maior estágio e DDI "+NN"; as regras puras ficam no segundo, testadas por `src/lib/importacao.test.ts` |
| `src/features/clientes/{queries,documentos-actions,regras}.ts` | Lista, perfil e documentos |
| `src/features/people/actions.ts` | `atualizarCliente`, `marcarComoCliente` |
| `src/features/financeiro/{regras,escritas-locais,anexos}.ts` | `totaisPorMoeda`; `excluirCobranca` com um delete só; anexos da parcela pelo cliente de navegador |
| `src/lib/pessoa.ts` | `enderecoDaPessoa(id, estagio, aba?)` e `revalidarPessoa(id)` |
| `src/lib/arquivos.ts` | `arquivoAceito` e o limite de 20 MB, movidos de `features/projects` |
| `src/components/copiar-texto.tsx`, `abas-na-url.tsx` | Copiar com "Copiado"; `Tabs` com `?aba=` por `window.history.replaceState` (usado também em `projetos/[id]`) |
| `src/components/perfil/*` | Movidos de `contatos/[id]` porque `contatos`, `clientes` ou `crm` os usam: `DadosCadastrais`, `controles-da-ficha`, `PersonTags`, `Timeline`. `Cobrancas` e `NovoProcessoDialog` só servem a `clientes/[id]` e vão para lá |
| `src/app/(app)/clientes/page.tsx`, `clientes/[id]/page.tsx` e as abas | As telas |
| `src/app/(app)/contatos/[id]/page.tsx` | Perfil enxuto, `redirect` e "Marcar como cliente" |
| `src/components/app-sidebar.tsx` | Item Clientes |

---

## Fase A — banco

### T1 [Renato] Cópia do banco
- [ ] O Renato roda o `pg_dump` como em 17/nov e diz **"cópia feita"**. A 0045 converte contatos em clientes, e isso não tem volta. Nenhuma migration antes disso.

### T2 Medir antes (só leitura, contagens, sem ler nomes) — feito em 18/nov

| Medida | Valor |
|---|---|
| Clientes (1 é o "Cliente de Teste") | 28, nenhum na lixeira |
| Não clientes com processo / com cobrança | 2 / 0 (nenhum na lixeira) |
| Linhas em `files` | 0, e o app não lê `files` |
| Membros: Duli | 1 `owner` (Renato) e 1 `staff` (`teste-colaborador`) |
| Membros: `parceiro-teste` | 1 `owner` (`teste-parceiro`) e 1 `staff` (`teste-staff`) |
| Organizações com mais de um `owner`, ou sem `owner` | 0 e 0 |
| Negócios com `owner_id` | 2; o app só grava `owner_id` no insert (`criar_oportunidade`, 0041:213-218), nunca em update |

Daí: a conversão promove 2 pessoas e põe dono em 30 (28 + 2); o D4 vale para a tabela inteira; a trava do dono do negócio não quebra caminho de hoje.

- [x] Contar:
  - clientes, inclusive na lixeira;
  - não clientes com processo ou com cobrança;
  - `files` por `bucket`, e se alguma linha fere o formato `{org}/{pessoa}/{arquivo}/{nome}`;
  - `files` com `opportunity_id` de outra organização;
  - membros por papel em cada organização;
  - quantas organizações têm mais de um `owner`.
- [x] Anotar os números (tabela acima).

### T3 0044 — dono e participantes (CLI-10)
**Testes primeiro**, em `tests/rls/clientes-dono.test.ts`, como parceiro na organização de teste, sempre numa **pessoa descartável** — com **uma** exceção, o teste do portal abaixo, que só pode usar o "Cliente de Teste" (é a única pessoa com login de cliente):
- `owner_id` aceita um membro da organização da pessoa, e recusa o membro de outra (chave composta → `23503`);
- "remover o membro anula o dono" **não** é teste da suíte (ela só fala com o PostgREST e não lê catálogo): é conferido à mão, só leitura, em `pg_constraint` (`confdeltype = 'n'`, com a coluna em `confdelsetcols`), e o resultado fica no `banco.md`;
- `person_participants`: o membro grava e lê. Colaborador da Duli não lê os participantes da pessoa da parceira. Duplicado `(person_id, user_id)` → `23505`;
- `opportunity_participants`: o mesmo;
- trocar `opportunities.owner_id`: o `teste-staff`, que não é dono, é recusado com a mensagem; o dono da parceira (gestão) consegue; um update do `teste-staff` que repete o **mesmo** `owner_id` passa (o `before update of owner_id` dispara sempre que a coluna está no `SET`);
- o cliente do portal mudando o próprio `owner_id` para um membro **válido** da parceira (para uma falha aparecer como mudança, não como `23503`): a mudança é desfeita em silêncio. O parceiro guarda o valor antes e o restaura em `finally`. O mesmo para `client_since` fica no T4, onde a coluna nasce, com a mesma restauração.

**Migration:**
- `people.owner_id uuid` com a FK `(organization_id, owner_id)` → `organization_members (organization_id, user_id)`, `on delete set null (owner_id)`;
- as duas tabelas de participantes (spec §6.2): RLS de membros, lápide, `updated_at`, fora do espelho e do `sync_manifesto`;
- gatilho `opportunities_dono_protegido` (`before update of owner_id`): sem usuário, passa; só recusa quando `new.owner_id is distinct from old.owner_id`;
- `create or replace` de `private.people_guard_self_update` (`0013:89-110`) acrescentando `owner_id`. A 0045 o refaz com `client_since`.

Antes de escrever o gatilho, procurar no app quem atualiza `opportunities.owner_id` (`grep owner_id src/`), para a trava não quebrar um caminho de hoje.

- [ ] Vermelho → aplicar → verde → tipos → `banco.md` → commit `feat(banco): dono e participantes (0044)`.

### T4 0045 — estágio do cliente (CLI-11, CLI-12, CLI-13, CLI-14)
**Testes primeiro**, em `tests/rls/estagio-do-cliente.test.ts`, com pessoas descartáveis da organização de teste, apagadas pela pessoa:
- `update` de `client` para `opportunity` pela API → "Cliente não volta a ser lead.";
- passar a cliente preenche `client_since` com hoje (São Paulo). Quem já é cliente com data não tem a data trocada. `insert` já como `client` não preenche;
- `teste-staff` com `criar_processo` para um lead → recusado com a mensagem; insert em `receivables` para um lead → recusado;
- a gestão (parceiro) fazendo o mesmo → a pessoa vira `client` com `client_since` de hoje e uma atividade `virou_cliente` "Virou cliente (processo ‹título›)" ou "(cobrança ‹título›)";
- processo ou cobrança para quem já é cliente não gera histórico novo;
- `marcar_como_cliente`:
  - chamado pelo `teste-staff` → "Só a gestão marca alguém como cliente.";
  - pela gestão → estágio, `client_since = p_desde` e "Marcado como cliente";
  - sem `p_desde` → `client_since` de hoje;
  - `p_desde` amanhã → "A data de cliente não pode ser no futuro.";
  - para quem já é cliente → erro "Já é cliente.";
  - pessoa na lixeira → "Este contato está na lixeira. Restaure antes.";
- o cliente do portal tentando rebaixar a si mesmo → mudança desfeita em silêncio, sem erro (D8);
- trocar o `person_id` de um processo ou cobrança para um lead, pelo `teste-staff` → recusado (CLI-14 não se contorna por update);
- em `tests/rls/fila.test.ts`: o **`teste-staff`** (`entrarComo("staff")`, staff do Parceiro de Teste — **nunca** o `colaborador`, que é da Duli, onde pessoa não se apaga) cria pela fila uma cobrança para um lead descartável do Parceiro de Teste → o item fica em conflito com a frase, e nada é gravado (o parceiro confere lendo `receivables` e apaga o lead em `finally`).

**Migration, nesta ordem** (a ordem importa: com o gatilho criado antes, a conversão gravaria hoje como "cliente desde" dos 2 convertidos):
1. `people.client_since date`;
2. **conversão (§7)**, ainda sem gatilho:
   - não clientes fora da lixeira, com processo ou cobrança → `client`;
   - todo cliente com `client_since` nulo → o menor entre o primeiro `started_on` e o primeiro `created_at` de cobrança (data de São Paulo);
   - todo cliente com `owner_id` nulo → o `owner` mais antigo da organização (`order by created_at limit 1`);
3. funções e gatilhos:
   - `people_trava_do_estagio`, `before insert or update`: regra (1) sempre, inclusive sem usuário e **sem** a liberação de `pg_trigger_depth()`, mais o preenchimento do `client_since` só quando `new.client_since is null` (preserva o `p_desde` de `marcar_como_cliente`);
   - `private.quem_tem_processo_e_cliente()`, `security invoker`, nos gatilhos `projects_quem_tem_processo_e_cliente` e `receivables_quem_tem_processo_e_cliente`, `before insert or update of person_id` (os nomes rodam depois de `projects_processo_do_mesmo_contato`, que mantém a frase dele). Lê a pessoa por `id = new.person_id and organization_id = new.organization_id`; se não achar, devolve `new` e deixa a chave composta recusar. Pessoa já cliente → passa. Sem usuário → promove. `private.current_user_manages(organização da pessoa)` → promove e grava a atividade `virou_cliente` com a organização da pessoa e `created_by = auth.uid()`. Senão → "Só a gestão torna alguém cliente; use o Ganho." (D2);
   - `public.marcar_como_cliente(p_pessoa uuid, p_desde date default null) returns void`, `security invoker`, com `revoke`/`grant`; `p_desde` nulo = hoje; no futuro, recusa;
   - `people_guard_self_update` com `owner_id` e `client_since` (T3).

**Na tela, já neste passo** (o gatilho grava `virou_cliente` a partir do push 1): `virou_cliente` entra em `SYSTEM_TYPES` (`timeline-queries.ts:17`, sem botão de apagar) e em `LABELS`/`ICONS` de `timeline.tsx:38-57` ("Virou cliente"), com teste de unidade.

**Ajustes na suíte:**
- rodar `bun run test:rls` inteiro depois de aplicar;
- todo teste que cria processo ou cobrança para quem não é cliente com conta que não é da gestão passa a usar o "Cliente de Teste" ou uma pessoa promovida pela gestão;
- fumaça (D9).

- [ ] Vermelho → aplicar → verde → tipos → `banco.md` (seção `people`, travas, a função) → commit.
- [ ] **Conferência à mão, sem usuário**, no SQL Editor, tudo dentro de uma transação: `begin;` → `insert` de uma pessoa descartável na organização de teste já como `client` (`returning id`) → `update people set lifecycle_stage = 'opportunity' where id = <esse id>` deve dar "Cliente não volta a ser lead." → `rollback;`. Nada fica no banco; nunca num cliente real.
- [ ] **Contagens (só leitura):** clientes sem dono = 0; clientes sem `client_since` = os que não têm processo nem cobrança; clientes com `client_since` = hoje = **0**.

### T5 0046 — notas só para a equipe (CLI-9, POR-2)
- [ ] **Vermelho:** inverter `portal-do-cliente.test.ts:77-87`. No `beforeAll`, o parceiro grava uma atividade na fixture (e a apaga no `afterAll`), para a metade `activities` nascer vermelha: o parceiro a lê, o cliente lê zero; em `notes`, a nota da 0015, o cliente lê zero. O teste "vê exatamente uma pessoa" continua verde.
- [ ] **Migration:**
  - `private.equipe_alcanca_pessoa(uuid)`: `can_access_person` sem o ramo `p.user_id = auth.uid()`, `security definer`, com `grant` a `authenticated`;
  - `notes_select` e `activities_select` passam a usá-la;
  - a escrita não muda.
- [ ] Verde, inclusive `isolamento.test.ts` (a equipe ainda lê) → tipos → `banco.md` → commit.

### T6 Importação sem rebaixar
- [ ] Regras puras em `migration/regras-da-importacao.mjs` (JavaScript, porque o script roda com `node`), testadas por `src/lib/importacao.test.ts` — dentro do `include` do Vitest (`vitest.config.mts:15`); um `.test.mjs` em `migration/` nunca rodaria:
  - `estagioFinal(doBanco, doAntigo)` devolve o maior na ordem `contact < opportunity < client`;
  - `ddiGravado("55")` devolve "+55".
- [ ] O script lê os `lifecycle_stage` existentes por `legacy_id` antes do upsert e grava o maior.
- [ ] Commit. O script não roda nesta entrega.

### T7 0047 — documentos do cliente (CLI-8, banco)
- [ ] **Vermelho**, em `tests/rls/documentos-do-cliente.test.ts`:
  - o parceiro envia para `pessoas/{org}/{pessoa}/{uuid}/teste.pdf` e grava em `files` com `category = 'passaporte'`;
  - o colaborador da Duli não lê o objeto nem a linha;
  - um caminho com outra organização na frente é recusado pelo `check`;
  - `category = 'xyz'` → `23514`;
  - a limpeza remove o objeto e a linha em `finally`.
- [ ] **Migration:**
  - `files.category` com `check`;
  - o `check` de caminho e `bucket = 'pessoas'` (D4): `split_part(path,'/',1) = organization_id::text`, `…2 = person_id::text`, `…3 = id::text` (o id da linha nasce no navegador e vai no caminho), `…4 <> ''` e `…5 = ''`;
  - a FK de `opportunity_id` composta, com `on delete set null (opportunity_id)` (tabela vazia: valida direto);
  - o depósito `pessoas` e as 4 policies no padrão da 0020:273-313.
- [ ] Verde → tipos → `banco.md` → commit.

### T8 0048 — anexos da parcela (CLI-6, banco) e `excluirCobranca`
- [ ] **Vermelho**, em `tests/rls/anexos-da-parcela.test.ts`, numa pessoa descartável promovida pela gestão:
  - anexo na parcela 2 aparece só nela, e lê por URL assinada;
  - delete direto da parcela 2 → "Remova os anexos antes.";
  - delete direto da cobrança → a mesma recusa;
  - apagar a pessoa leva tudo (cascata, `pg_trigger_depth() > 1`);
  - o colaborador da Duli não lê o anexo;
  - o objeto do depósito é removido em `finally`.
- [ ] **Vermelho**, em `src/features/financeiro/escritas-locais.test.ts`:
  - **inverter** `escritas-locais.test.ts:163-185`: `excluirCobranca` enfileira **um** delete só, o da cobrança;
  - a leitura local esconde as parcelas dela (já é assim, `consultas-locais.ts:104-114,138-145`: teste de proteção, não vermelho).
- [ ] **Migration:**
  - `installment_files` como na spec, com lápide, `updated_at` e fora do espelho; o caminho `{org}/{pessoa}/{cobrança}/{parcela}/{arquivo}/{nome}` é conferido pelo gatilho `installment_files_caminho` (`before insert or update`), que lê parcela → cobrança → pessoa e exige essas 4 partes iguais aos ids reais, a 5ª = `id`, a 6ª não vazia e a 7ª vazia (um `check` não consulta outra tabela, e as partes 2 e 3 são as que a anonimização usa);
  - o depósito `financeiro`: privado, 20 MB, os mesmos tipos de `documentos`, e as 4 policies no padrão de `0020:273-313`;
  - os gatilhos de delete em `receivables` e `installments`.

  Mudar `excluirCobranca` (`escritas-locais.ts:185-213`).
- [ ] Verde → tipos → `banco.md` → `bun run verify` → commit.
- [ ] **Push 1 [Renato].** A tela antiga continua funcionando: ninguém anexa ainda, e o Ganho de hoje passa (D1).

---

## Fase B — telas

### T9 Totais por moeda (CLI-5)
- [ ] **Vermelho**, em `financeiro/regras.test.ts`, para `totaisPorMoeda(cobrancas, hoje): Record<Moeda, {contratado, pago, saldo, vencido}>`:
  - soma em centavos (`0.1 + 0.2` não vira `0.30000000000000004`);
  - aparece uma entrada por moeda que tem pelo menos uma cobrança, mesmo com total zero; moeda sem cobrança não aparece;
  - BRL e USD nunca se somam;
  - vencido conta só parcela em aberto com vencimento antes de hoje (reaproveita `situacaoDaParcela`, `regras.ts:112-115`).
- [ ] Implementar sobre `resumoDoRecebivel` (`regras.ts:153-183`), sem usar `somarPorMoeda` (`totals.ts:16-25`) → commit.

### T10 Lista de Clientes (CLI-1) e 0049
- [ ] **Vermelho (RLS):** `buscar_clientes`:
  - acha por parte do nome, por "@dominio", por "9999" e pelo telefone com máscara e DDI;
  - não traz lead, quem está na lixeira, nem cliente de outra organização;
  - `total` é o total do filtro, não o da página;
  - `%` e `_` na busca são literais.
- [ ] **Migration 0049:** `buscar_clientes(p_busca text default '', p_limite int default 50, p_deslocamento int default 0) returns table (id, full_name, email, phone_country_code, phone, owner_id, client_since, total bigint)`:
  - ordem por nome, desempate por `id` (paginação estável);
  - total por `count(*) over ()`;
  - `revoke execute … from public, anon` e `grant … to authenticated` (padrão de `0040:215-216`);
  - filtro do telefone, só quando a busca tem dígitos: `(coalesce(nullif(regexp_replace(coalesce(p.phone_country_code,''),'[^0-9]','','g'),''),'55') || private.telefone_nacional(p.phone_country_code, p.phone)) like '%' || v_digitos || '%'` — assim "+55 31 99999-0000", "31 99999-0000" e "9999" acham o mesmo contato;
  - nome e e-mail por `ilike '%' || v_texto || '%' escape '\'`, com `\`, `%` e `_` escapados antes;
  - com `%` na frente nenhum índice é usado; para o volume de hoje basta, e o `banco.md` diz isso.
- [ ] Tipos → `banco.md`.
- [ ] **Vermelho (unidade):** `listarClientes` monta o "mostrando X de Y" e busca os nomes dos donos em `profiles` numa segunda consulta (conferir que a RLS de `profiles` deixa ler os colegas).
- [ ] **Telas:**
  - `clientes/page.tsx`: `PageHeader`, busca na URL (`?q=`, como `contatos/filters.tsx`), tabela no computador e cartões no celular, `EmptyState`, `?pagina=`;
  - item "Clientes" no `NAV` depois do CRM (`app-sidebar.tsx:32-39`). Conferir que os 7 cabem na barra do celular.
- [ ] Commit.

### T11 Perfil do cliente: casca, cabeçalho e endereços (CLI-2, CLI-3)
- [ ] **Vermelho (unidade):**
  - `enderecoDaPessoa`: cliente → `/clientes/<id>?aba=…`; outro → `/contatos/<id>`;
  - `destinoDoContato(id, searchParams)`, a função pura que monta o `redirect` de `/contatos/<cliente>`: preserva a query (`?x=1` → `/clientes/<id>?x=1`) e transforma `novo-processo=<n>` em `aba=projetos&novo-processo=<n>`;
  - `CopiarTexto` põe "+55 31 99999-0000" na área de transferência e mostra "Copiado";
  - `AbasNaUrl` troca `?aba=` por `window.history.replaceState` (sem refazer a página no servidor; integrado ao `useSearchParams`, `next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`) e abre a aba Dados com `#dados-cadastrais` (D6). `projetos/[id]/page.tsx:33-45,131` passa a usá-lo (segunda cópia).
- [ ] **Mover** para `src/components/perfil/` os que mais de uma rota usa (ver Mapa), e `Cobrancas` e `NovoProcessoDialog` para `clientes/[id]/` (os imports do CRM também). Extrair o `copiar` de `LinkAberto` (`controles-da-ficha.tsx:131-139`) para `CopiarTexto`.
- [ ] **`clientes/[id]/page.tsx`:**
  - quem não é cliente → `redirect('/contatos/<id>')`;
  - cabeçalho numa linha: nome e selo; telefone e e-mail com `CopiarTexto`; dono, cliente desde, `PersonTags` e Editar (T15);
  - as 5 abas, com `?aba=` validado e `dados` como padrão.
- [ ] **`contatos/[id]/page.tsx`:**
  - cliente → `redirect` preservando a query;
  - `novo-processo` → `?aba=projetos&novo-processo=`;
  - sem cliente, o perfil enxuto: apagar `perfilCompleto` (`features/people/regras.ts:16-26`) e os cartões de processos e financeiro.
- [ ] Commit.

### T12 Abas Dados, Projetos, Notas e Financeiro (CLI-4, 5, 7, 9)
- [ ] **Vermelho:**
  - Notas: o campo Nova nota fica acima da linha do tempo (já é assim, `timeline.tsx:155`: teste de proteção, não vermelho). As "Observações do cadastro antigo" vêm por último. `virou_cliente` entra em `SYSTEM_TYPES` (`timeline-queries.ts:17`), sem botão de apagar;
  - Financeiro: com rede, mostra "sincronizando…" até o `sincronizarAgora` acabar, **com prazo de 5 s**: passado o prazo, ou se a sincronia falhar, mostra a lista do aparelho com o indicador de sincronia (Wi-Fi sem saída não pode esconder o que já está no aparelho). Sem rede, mostra a lista do aparelho direto (D5). Teste também para "sincronia que não responde". Os totais por moeda vêm do T9.
- [ ] **Aba Projetos:** a lista de `processosDoContato` com `BarraDeProgresso` e o selo, o clique abre o processo, e "+ Novo processo" com `?novo-processo=`.
- [ ] **Aba Dados:** `DadosCadastrais` como está.
- [ ] Commit.

### T13 Aba Documentos (CLI-8, tela)
- [ ] **Vermelho (unidade):** `caminhoDoDocumento(org, pessoa, id, nome)` e `documentosPorCategoria` (ordem: identidade, passaporte, comprovante de residência, contrato, outro). O nome do arquivo é saneado (barra e caracteres de controle viram `-`), senão uma `/` no nome fere o `check` de 5 partes do T7 e o gatilho do T8.
- [ ] **Extrair (segunda cópia, `AGENTS.md`):** para `src/lib/arquivos.ts`, `arquivoAceito`, o saneamento do nome e `enviarERegistrar(depósito, caminho, arquivo, registrar)` — envia o objeto, chama o registro e remove o objeto se o registro falhar. `ArquivosDaPasta` (`projetos/[id]/documentos.tsx:459-568`) passa a usá-los, e o T14 também; teste de unidade com o Storage falso.
- [ ] **`features/clientes/documentos-actions.ts`:**
  - `registrarDocumento` grava a linha de `files`, com a organização vinda da pessoa;
  - `enderecoDoDocumento(id, baixar)` faz `createSignedUrl` de 300 s;
  - `excluirDocumento` apaga a linha, depois o objeto.
- [ ] **Tela:**
  - envio no topo, com categoria, por `enviarERegistrar`;
  - lista agrupada por categoria;
  - excluir com `ConfirmAction`.
- [ ] Commit.

### T14 Anexos da parcela (CLI-6, tela)
- [ ] **Vermelho (unidade):**
  - `caminhoDoAnexo` com as 6 partes;
  - sem rede, a parcela mostra "Anexos precisam de internet" e nenhum botão de enviar.
- [ ] **Em `clientes/[id]/cobrancas.tsx`:**
  - por parcela: anexar (com tipo), ver e baixar por URL assinada, e remover;
  - código em `src/features/financeiro/anexos.ts`, com o cliente de navegador: a organização vem da parcela (registro-pai); a lista de anexos é lida por `installment_files` filtrado pela parcela; enviar = objeto, depois a linha (se a linha falhar, remove o objeto); remover = linha, depois o objeto.
- [ ] Registrar a exceção no `AGENTS.md` (T16).
- [ ] Commit.

### T15 Editar do cliente e Marcar como cliente (CLI-10, 11, 12)
- [ ] **Vermelho (unidade):**
  - `atualizarCliente` grava os campos de `PersonDialog`, mais `owner_id`, `client_since` e os participantes (a diferença entre a lista atual e a nova). A conferência de parecidos é a mesma de `updatePerson`;
  - `marcarComoCliente` chama a RPC e redireciona para `/clientes/<id>`.
- [ ] **Tela:**
  - diálogo do cliente, com dono (membros da organização da pessoa) e participantes;
  - em `/contatos/[id]`, "Marcar como cliente", só para a gestão (consultar o papel no servidor), num `FormDialog` (não `ConfirmAction`, que só leva campos ocultos e tem cara de exclusão): descrição com o aviso "Não tem volta: cliente não volta a ser lead.", campo de data (`type="date"`, `max` = hoje, hoje por padrão) e botão "Marcar como cliente".
- [ ] Commit.

### T16 Endereços que mudam, fumaça e documentação
- [ ] **Vermelho (I4 da rodada 1):** pelo mesmo caminho do app (`aplicarEtapa`, como `funil.test.ts:173-187` já faz contra o banco), ganhar o negócio de um lead grava exatamente uma atividade `virou_cliente` "Oportunidade ganha — virou cliente"; ganhar de novo para quem já é cliente não grava outra. O texto do Ganho aparece com o rótulo de `virou_cliente` que o T4 já pôs em `LABELS`/`ICONS` de `timeline.tsx` (`ACTIVITY_LABELS`, de `timeline-queries.ts:19`, não é lido por ninguém). Critério de aceite do §6.2: uma nota criada quando a pessoa era lead aparece, na linha do tempo, **abaixo** de "Oportunidade ganha — virou cliente" — conferir a ordem.
- [ ] **Endereços.** Onde a pessoa é cliente por força (tem processo ou cobrança), o link vai direto para `/clientes/<id>`: `projetos/page.tsx:63`, `projetos/[id]/page.tsx:94`, `financeiro/lista.tsx:212`, `alertas.tsx:148`. Onde o estágio varia, ler `lifecycle_stage` e usar `enderecoDaPessoa`: `alertas.tsx:117` (e `painel/queries.ts:59,68,75` passa a ler o estágio), `crm/[id]/page.tsx:126`, `aviso-de-duplicado.tsx:95`. No quadro, `quadro.tsx:220-224` só troca a âncora quando o endereço é de cliente (no cartão aberto, o endereço é `/crm/<id>` e a âncora fica). Também:
  - `enderecoDoCartao` (`opportunities/regras.ts:133`) e o teste dele;
  - `quadro.tsx:243` (novo-processo → `/clientes/<id>?aba=projetos&novo-processo=`);
  - `ganharOportunidade`, que redireciona para `/clientes/<id>?aba=projetos` (`actions.ts:213`);
  - `mover.ts`, que grava "Oportunidade ganha — virou cliente" quando a pessoa ainda não era cliente (D10, teste acima);
  - a dica de `projetos/page.tsx:41`;
  - os `revalidatePath('/contatos…')`, por `revalidarPessoa`.
- [ ] **Fumaça:**
  - `TOPO` com `/clientes`;
  - "ficha de contato" (`rotas.test.ts:84-94`, `146-158`): `pessoaId` passa a ser escolhido com `.neq('lifecycle_stage','client')`, senão recebe 307 (a Duli tem 28 clientes); e o HTML **não** contém `id="processos"` nem `id="financeiro"`;
  - "ficha do contato" (`:308-316`) vira `/clientes/<id>?aba=projetos` (com o TITULO) e `?aba=financeiro`;
  - um bloco que cria uma pessoa descartável, marca como cliente (parceiro), abre `/clientes/<id>` em cada `?aba=`, confere o `307` de `/contatos/<id>?x=1` para `/clientes/<id>?x=1`, e apaga a pessoa (D9).
- [ ] **Documentação:**
  - `docs/spec.md`: CLI-1 a 14 (CLI-10, CLI-12 e CLI-14 em 🟡 até a entrega 3, D1 e D12), CON-3 substituído, M17, POR-2;
  - `docs/banco.md`;
  - `AGENTS.md`: a exceção de Clientes lendo do servidor, os anexos direto do navegador, e na tabela "UI" `CopiarTexto`, `AbasNaUrl` e `enderecoDaPessoa`;
  - `docs/plano.md`;
  - spec técnica: o D1, o D6, e a correção de que a 0025 **não** desliga a marca no caminho de erro (ela conta com o `is_local` e o fim da transação).
- [ ] `bun run verify`, `bun run build`, fumaça local → commit.
- [ ] **Revisão final** (Code Reviewer, em loop até não sobrar ajuste, classificando em crítico, importante, médio e cosmético) → correções com teste → **Push 2 [Renato]**.

---

## Verificação

- Por tarefa: o teste vermelho visto, depois verde. `bun x vitest run <arquivo>` na unidade; `--no-file-parallelism` no RLS.
- Antes de cada commit: `bun run verify` (tipos, lint, unidade e RLS).
- No fim: `bun run build`, depois a fumaça local (`bun run dev` mais `bun run test:fumaca`), e o CI verde depois de cada push.
- No banco: depois da 0045, contar (só leitura) clientes, clientes sem dono e clientes sem `client_since`, e conferir com o T2. No SQL Editor, conferir à mão a recusa do rebaixamento sem usuário.

## Depois de aprovado

1. ~~Salvar este plano em `docs/` e fazer o commit~~ — feito (cc8adca).
2. Rodar o Code Reviewer **no plano**, em rodadas, até não sobrar ajuste (método do Renato). Rodada 1 feita.
3. Executar em modo nativo, com o registro em `.superpowers/sdd/`.
