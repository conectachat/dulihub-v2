# Entrega 3 — Vistos na oportunidade e Ganho com resumo — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (nativo, como nas entregas 0, 1 e 2). Passos com checkbox (`- [ ]`). TDD em todo passo de código: teste vermelho visto antes do código.

**Objetivo:** a oportunidade passa a ter um ou mais vistos com valor. O Ganho mostra um resumo e, numa gravação só, faz o cliente e cria um processo por visto. Quem pode ganhar, reabrir e trocar o dono é conferido no banco. Processo nunca é apagado. Ganhas e perdidas saem do quadro e são achadas em CRM › Encerradas.

**Arquitetura:**
- **Duas fases, como a spec manda (§6.3).**
  - **Fase 1:** migrations que só acrescentam (0051–0053), aplicadas antes do código novo. O código antigo continua funcionando com elas. Depois vem o código novo, e o push 1.
  - **Fase 2:** só depois do código da fase 1 estar **no ar** (conferido em `/api/versao`) entra a 0054, com as travas que recusariam o código antigo e a retirada de `value`, `currency`, `products` e `opportunity_products`. Depois, o push 2.
- **O Ganho é uma função do banco**, `ganhar_negocio`, numa transação. O resumo da tela é a mesma função com `p_simular`, então o resumo e a gravação nunca divergem (spec §4.5).
- **O CRM continua lendo do servidor.** `opportunity_items` fica fora do espelho.

**Tech stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), bun, vitest, jsdom, @testing-library.

**Spec:** `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md` §6.3, com §3 (restrições), §4.2, §4.3 e §4.5. Requisitos CRM-10, CRM-13 a CRM-16 e PRO-12.

**Fora deste plano (entrega 4):**
- cobranças no Ganho (passo 7 de `ganhar_negocio`);
- forma de pagamento e "link de pagamento aberto";
- aviso de vencimento passado.

Antes da entrega 4, o resumo diz "Forma de pagamento: definir na aba Financeiro", e `cobrancas` volta sempre vazia.

## Dados de hoje (19/nov, contagem só de leitura)

| O quê | Quantos |
|---|---|
| Negócios | 2. Um aberto, sem valor. Um ganho, com valor em BRL e 1 processo ligado |
| `products` / `opportunity_products` | 0 / 0 |
| Processos | 6, um deles ligado a negócio |
| Tipos de visto | 2, ambos ativos. Um está sem preço; há moedas BRL e USD |
| Funis | 2 (Duli e organização de teste), cada um com etapa de ganho |
| `pg_graphql` | Não instalado (continua sendo pressuposto da marca de transação, §3) |

## Decisões deste plano (desvios ou lacunas da spec, cada uma com o motivo)

| # | Decisão | Por quê | Custo se errada |
|---|---|---|---|
| D1 | `ganhar_negocio` já nasce com `p_cobrancas_sem_confirmacao`, ignorado até a entrega 4, e devolve `cobrancas: []` | A assinatura da spec não muda na entrega 4, que só troca o corpo com `create or replace` | Um parâmetro morto por uma entrega |
| D2 | A trava do dono do negócio **já existe** (`opportunities_dono_protegido`, 0044), com teste (`clientes-dono.test.ts`, "dono do negócio"). A 0054 não a recria | O plano da entrega 2 a adiantou | Nenhum |
| D3 | A "migration A" vira três arquivos: 0051 (vistos e processo), 0052 (Ganho) e 0053 (busca de encerradas). A "migration B" é a 0054 | Uma migration por tarefa, cada uma com o seu teste vermelho | Nenhum |
| D4 | Vão para a 0054, e não para a fase 1: a regra (2) de estágio, a marca em `marcar_como_cliente`, o ramo `via_ganho` de `quem_tem_processo_e_cliente` e a trava "negócio ganho não se exclui" | As quatro recusariam o código antigo ainda no ar: o Ganho de hoje, feito por quem não é da gestão, e o Excluir do cartão ganho | Entre o push 1 e a 0054, quem não é da gestão ainda promove por `update` direto pela API (a brecha de hoje) |
| D5 | `reabrir_negocio` só reabre negócio **ganho**. Perdido continua reabrindo por `aplicarEtapa`, como hoje, sem a regra do CRM-10 | O CRM-10 e o I3 falam do ganho. O gatilho da 0054 só guarda a entrada e a saída do ganho | Qualquer membro reabre um perdido, como hoje |
| D6 | Perdido → Ganho direto é permitido, pelo `ganhar_negocio`, com resumo. O motivo da perda é apagado | A spec só proíbe Ganho → Perdido. Recuperar um negócio perdido é o caso feliz | Nenhum |
| D7 | Soltar um cartão ganho em **qualquer** etapa aberta reabre na **primeira** etapa aberta, e o diálogo diz qual é | A spec fixa "volta para a primeira etapa aberta" | O cartão não fica onde foi solto |
| D8 | Os participantes do negócio entram na pessoa também quando ela **já era** cliente. O dono e o "cliente desde" não mudam | A spec os lista sob "Dono do cliente no Ganho", sem distinguir. Acrescentar quem cuida não tira nada de ninguém | Participantes a mais num cliente antigo |
| D9 | Dono no Ganho, só quando a pessoa **vira cliente neste Ganho** e não tem dono: o dono do negócio, se for membro da organização da pessoa; senão, quem confirmou, se for membro; senão, fica sem dono. **Nunca falha o Ganho.** Cliente que já existe não tem o dono mexido, nem quando está sem dono | A chave composta de `people.owner_id` (0044) recusaria um não membro e derrubaria a transação inteira. A spec diz que, no cliente que já existe, "o dono e o 'cliente desde' não mudam" | Cliente sem dono, a escolher em Editar |
| D10 | A leitura de `opportunity_items` é "quem vê o negócio vê o item" (`exists` em `opportunities`, que já passa pela RLS dela). A escrita é da equipe da organização | É o "como `opportunities`" da spec, sem reescrever `can_access_person` | Nenhum |
| D11 | O valor sai do diálogo "Nova oportunidade" e de "Editar negócio". Os vistos se acrescentam na tela do lead | `criar_oportunidade` não recebe itens, e a 0054 tira `p_valor` e `p_moeda` | Um passo a mais ao criar |
| D12 | Na fase 1, o Excluir some do cartão ganho na tela. A recusa no banco vem com a 0054 (D4) | O código antigo não pode ser recusado antes do deploy | Nenhum |
| D13 | A cópia do valor (0051) liga o processo existente ao item novo quando o negócio tem **um** processo e **um** item | O negócio ganho de hoje tem 1 processo. Sem a ligação, reabrir e ganhar de novo duplicaria o processo | Nenhum |
| D14 | Histórico. Ganho que promove: `virou_cliente` "Oportunidade ganha — virou cliente". Ganho de quem já é cliente: `stage_change` "Oportunidade ganha". Reabrir: `stage_change` "Negócio reaberto — voltou para ‹etapa›" | Os dois tipos já são de sistema, sem botão de apagar (entrega 2) | Textos a ajustar |
| D15 | O filtro "aberto, ou encerrado há até 30 dias" vira a função pura `filtroDoQuadro(agora)`, usada por `getBoard` e pelo teste de RLS | Assim o teste roda o mesmo filtro contra o banco de verdade | Nenhum |
| D16 | `POR_PAGINA`, `paginaPedida` e `contagemDaLista` sobem de `features/clientes/regras.ts` para `src/lib/paginacao.ts`, com o substantivo como parâmetro | Encerradas precisa das mesmas, e uma feature não importa de outra | Nenhum |
| D17 | "Item sem visto" só recusa o Ganho quando o item **ainda não tem processo**, porque só ele vai ao `criar_processo`. Item que já tem processo e perdeu o visto, seja pela cópia da 0051 (D13) ou por um tipo apagado nas Configurações, não impede ganhar de novo | Sem isso, o negócio reaberto nunca mais seria ganho. E o único caminho da tela (remover e acrescentar o item) desligaria o processo e criaria outro: o "processo repetido" que a spec lista como fracasso | Nenhum |
| D18 | A ligação do processo com o item tem **duas** FKs. A da spec, `(opportunity_item_id, organization_id)` → `opportunity_items`, confere sempre e garante o `set null` quando o item some. Outra, `(opportunity_item_id, opportunity_id)` → `opportunity_items (id, opportunity_id)`, amarra o item ao negócio do processo. Processo com item e sem negócio é recusado, no insert e no update de `opportunity_id`. A ligação não muda depois de gravada, e o item não muda de negócio. **Desvio da §3:** a trava da ligação deixa passar também quando não há usuário (migration, SQL Editor), além da ação da FK, como a 0044 já faz. As policies de `projects` são `to authenticated`, então nenhum caminho da API chega sem usuário | A segunda FK é `MATCH SIMPLE` e não confere nada com `opportunity_id` nulo. Ao apagar o negócio, a ordem das ações de FK é a do nome do gatilho interno; se o `set null (opportunity_id)` vier antes, o `set null` dela não acha a linha. A da spec cobre esse caso. Ligação que muda permitiria desligar o processo e duplicá-lo no próximo Ganho, o caso que a 0022 fechou para `opportunity_id` | Nenhum |
| D19 | A recópia da 0054 também corrige o item único sem visto cujo valor ou moeda difere do negócio, **só** se o item nunca foi editado (`updated_at = created_at`) e o negócio tem `value` | Entre a 0051 e o push 1 passam dias, com o "Editar negócio" antigo no ar. Uma mudança no valor do negócio ganho de hoje sumiria sem aviso. O código antigo não edita item, então item editado é do código novo e vale mais que a coluna velha. Sem `value`, o `amount` viraria nulo e a 0054 abortaria | Nenhum |
| D20 | Os totais dos itens somam em centavos e mostram a moeda com total zero, numa função nova de `src/lib/totals.ts`: `somarItensPorMoeda`. `emCentavos` e `emMoeda`, hoje privadas em `features/financeiro/regras.ts:21-23`, sobem para o mesmo arquivo, e o Financeiro passa a importá-las | A spec manda contas em centavos (§3). `somarPorMoeda` soma em ponto flutuante e pula o zero, e a entrega 2 já a recusou por isso. É a segunda cópia da conversão: extrair agora (AGENTS) | Nenhum |

## Restrições globais

Valem as das entregas 0, 1 e 2 (planos em `docs/superpowers/plans/`):
- `bun`, nunca o `.env.local`, nunca `--no-verify`;
- comandos de teste por arquivo;
- migration, `database.types.ts` e `docs/banco.md` no mesmo commit;
- `drop` + `create` quando a assinatura muda, com `revoke`/`grant` depois (no Supabase, função nova em `public` nasce executável por `anon`);
- dado de teste aleatório e limpo em `finally`;
- nunca apagar o "Cliente de Teste";
- tokens, raios e ícone como elemento;
- `verify` verde antes de cada commit.

Da spec §3:
- tabela nova com `id`, `unique (id, organization_id)`, chaves estrangeiras compostas, lápide (`marcar_lapide`) e `updated_at`;
- `on delete set null (coluna)`;
- toda trava nova vale também na organização de teste, para update e para delete direto. Só passa com `pg_trigger_depth() > 1`;
- marca `dulihub.via_ganho`, ligada com `set_config(..., 'on', true)` e desligada no fim da função.

Mais:
- **Gestão** é `private.current_user_manages(org)`. Nunca reimplementar.
- **A organização vem do registro-pai.** O item herda do negócio; o processo, da pessoa.
- **Lição de 19/nov.** A VPS monta sem `tests/`, `migration/`, `supabase/` e `docs/`. `src/lib/contexto-do-docker.test.ts` barra quem importar dessas pastas. Depois de cada push, conferir em `/api/versao` que o commit novo está no ar, antes de dizer que está publicado.
- **Push é do Renato, em dois pontos:** fim do T9 (fase 1) e fim do T11 (fase 2). A 0054 só é aplicada **depois** que `/api/versao` mostrar o commit do push 1.
- **Erros novos, cópia exata**, todos com `errcode = 'P0001'`, como na 0045 (`traduzirErro` mostra a frase):

  | Situação | Mensagem |
  |---|---|
  | Ganhar sem ser dono do negócio nem gestão | "Só o dono do negócio ou a gestão ganham o negócio." |
  | Reabrir sem ser dono do negócio nem gestão | "Só o dono do negócio ou a gestão reabrem o negócio." |
  | Ganhar negócio já ganho | "Este negócio já foi ganho." |
  | Reabrir negócio que não está ganho | "Este negócio não está ganho." |
  | Ganhar sem item | "Acrescente pelo menos um visto antes do Ganho." |
  | Item sem processo e sem visto (D17) | "O item ‹visa_name› está sem visto. Remova o item e acrescente um visto do catálogo." |
  | Pessoa na lixeira | "Este contato está na lixeira. Restaure antes." (a mesma da 0045) |
  | Funil sem etapa de ganho | "O funil não tem etapa de ganho. Crie em Configurações › Etapas do funil." (a mesma de `etapaTerminal`) |
  | Funil sem etapa aberta (reabrir) | "O funil não tem etapa aberta para onde voltar." |
  | Mexer em item de negócio ganho | "Negócio ganho: os vistos não mudam. Para desistir de um visto, encerre o processo dele." |
  | Apagar processo | "Processo não se apaga: encerre-o." |
  | Trocar o item de um processo (D18) | "O processo não muda de visto do negócio." |
  | Trocar o negócio de um item (D18) | "O visto não muda de negócio." |
  | Processo com item e sem negócio (D18) | "Processo ligado a visto do negócio precisa estar ligado ao negócio." |
  | Entrar ou sair do ganho fora das funções (0054) | "Use o Ganho ou o Reabrir do negócio." |
  | Apagar negócio ganho (0054) | "Reabra ou encerre os processos; o negócio ganho fica como registro." (texto da spec) |
  | `aplicarEtapa` para a etapa de ganho (app) | "Use o Ganho, que mostra o resumo antes." |
  | `aplicarEtapa` ou perder saindo do ganho (app) | "Reabra o negócio antes." |

## Foco da revisão

Cada item tem teste na tarefa dona.

1. **Dois Ganhos ao mesmo tempo:** duplo clique, ou duas pessoas. Um ganha e o outro recebe "Este negócio já foi ganho.", com um processo por item (T3, com `Promise.all`).
2. **Visto desativado depois de entrar no negócio:** o item continua ganhando com o molde dele, e o seletor de novos vistos não o mostra mais (T3 e T6).
3. **Cartão ganho arrastado por quem não pode reabrir:** o banco recusa, a mensagem aparece e o cartão volta para a coluna Ganho (T7).
4. **Busca de Encerradas com `%`, `_` e o nome do contato:** acha pelo contato, trata `%` e `_` como literais e nunca traz negócio aberto nem de outra organização (T4).
5. **Ganho visto por quem não alcança o negócio:** o colaborador da Duli, num negócio da parceira, recebe "Negócio não encontrado." e nada muda (T3).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0051_vistos_do_negocio.sql` | `opportunity_items`, `projects.opportunity_item_id`, `criar_processo` com `p_item`, processo que não se apaga, cópia do valor |
| `supabase/migrations/0052_ganhar_e_reabrir.sql` | `ganhar_negocio` e `reabrir_negocio` |
| `supabase/migrations/0053_buscar_encerradas.sql` | `buscar_encerradas` |
| `supabase/migrations/0054_ganho_so_pela_funcao.sql` | Recópia, travas da fase 2, retirada das colunas e tabelas, `sync_manifesto` e `criar_oportunidade` recriados |
| `src/features/opportunities/regras.ts` | `aoSoltar` novo, `valorSugerido`, `filtroDoQuadro` |
| `src/lib/totals.ts` | `somarItensPorMoeda`, em centavos (D20) |
| `src/features/opportunities/schema.ts` | `itemFromForm`, `resumoDoGanhoSchema` |
| `src/features/opportunities/mover.ts` | `aplicarEtapa` sem ganho |
| `src/features/opportunities/actions.ts` | `ganharOportunidade`, `reabrirOportunidade`, `resumoDoGanho`; criação e edição sem valor |
| `src/features/opportunities/itens-actions.ts` | `adicionarItem`, `editarItem`, `removerItem` |
| `src/features/opportunities/queries.ts` | `getBoard` com itens e janela; `obterNegocio` com itens e vistos ativos; `listarEncerradas` |
| `src/lib/paginacao.ts` | Movido de `features/clientes/regras.ts` (D16) |
| `src/app/(app)/crm/dialogos.tsx` | Diálogo de Ganho com o resumo; diálogo de reabrir |
| `src/app/(app)/crm/[id]/vistos.tsx` | Cartão Vistos da tela do lead |
| `src/app/(app)/crm/quadro.tsx`, `crm/page.tsx`, `crm/[id]/*` | Totais, janela, reabrir, Excluir, link Encerradas |
| `src/app/(app)/crm/encerradas/page.tsx` | CRM › Encerradas |

---

## Fase A — banco que só acrescenta

### T1 Cópia do banco — dispensada
- [x] Em 19/nov, ao aprovar este plano, o Renato dispensou a cópia à mão antes de cada migration. As migrations da fase 1 só acrescentam; o que a 0054 apaga está no T10.

### T2 0051 — vistos do negócio e processo que não se apaga (CRM-13 banco, PRO-12)

**Testes primeiro**, em `tests/rls/vistos-do-negocio.test.ts`. Cada teste cria uma pessoa descartável na organização de teste (parceiro) e a apaga em `finally`.
- `"a cascata de people atravessa a RLS de projects"`: processo da pessoa descartável → apagar a pessoa → o processo some. É o pressuposto de toda a limpeza nova, por isso vem **primeiro** no arquivo;
- `"delete em projects pela API apaga 0 linhas"`: `parceiro.from("projects").delete().eq("id", p).select("id")` devolve `[]` e o processo continua lá;
- item:
  - o parceiro grava `{ organization_id: <org do negócio>, opportunity_id, visa_type_id: <Visto do Parceiro>, visa_name, amount: 8000, currency: "USD" }` e lê de volta. `organization_id` é obrigatório e não tem padrão;
  - o colaborador da Duli não lê;
  - `currency = 'EUR'` → `23514`;
  - `amount = -1` → `23514`;
- `"mudar o preço do visto não muda o item"`: `update visa_types set base_price = base_price + 1` → `amount` do item igual. Restaurar o preço em `finally`;
- `"item de negócio ganho não muda"`: ganhar o negócio. Hoje, pelo `update` direto de `status`/`stage_id`, como faz o código antigo; nenhuma trava de ganho existe antes da 0054. Então insert, update e delete do item → a mensagem "Negócio ganho: os vistos não mudam…". Apagar a pessoa leva o negócio e o item (a cascata passa);
- `criar_processo` com `p_item` grava `opportunity_item_id`. Um segundo processo com o mesmo `p_item` → `23505`;
- D18:
  - `criar_processo` com `p_item` de **outro** negócio → `23503`;
  - `update projects set opportunity_item_id = null` → "O processo não muda de visto do negócio.";
  - `update opportunity_items set opportunity_id = <outro negócio aberto>` → "O visto não muda de negócio.";
  - `criar_processo` com `p_item` e sem `p_opportunity`, e o insert direto em `projects` com `opportunity_item_id` e sem `opportunity_id` → "Processo ligado a visto do negócio precisa estar ligado ao negócio.";
  - `update projects set opportunity_id = null` num processo ligado a item → a mesma frase;
  - `"apagar negócio aberto com processo ligado ao item"`: o processo continua, sem negócio **e** sem item.

**Ajustes na suíte, no mesmo commit:** com a policy dividida, o delete direto de processo passa a apagar 0 linhas **em silêncio**, e o lixo ficaria no "Cliente de Teste".
- `processos.test.ts`, `documentos.test.ts` e `paginas.test.ts` passam a criar o processo numa pessoa descartável, promovida pela gestão de teste (o parceiro, que promove ao criar o processo, 0045), e a limpar apagando a pessoa;
- conferir `tests/fumaca/rotas.test.ts:281` (já usa pessoa descartável desde o D9) e qualquer outro `from("projects").delete()` em `tests/` (`grep`);
- os quatro chamadores de `criar_processo` nos testes continuam válidos, porque `p_item` tem padrão nulo.

**Migration 0051:**
- `opportunity_items` como na spec (§6.3, Banco), com:
  - `created_by uuid default auth.uid()`, FK para `profiles` com `on delete set null`;
  - índice em `(opportunity_id, position)`;
  - RLS: `opportunity_items_select` com `exists (select 1 from public.opportunities o where o.id = opportunity_id)` (D10), e `opportunity_items_write` (`for all`) com a organização em `current_user_organizations()`;
  - gatilhos: `guard_child_row`, `set_updated_at`, `marcar_lapide`;
  - `opportunity_items_trava_do_ganho` (`before insert or update or delete`), numa função `security definer` como as outras travas. Assim o `for share` não depende da RLS de quem grava. Com `pg_trigger_depth() > 1`, passa. Senão:
    - no update, recusa a troca de `opportunity_id` (D18);
    - lê o `status` do negócio com `for share` e, se for `won`, recusa;
  - `unique (id, organization_id)` (alvo da FK da spec) e `unique (id, opportunity_id)` (alvo da FK da D18);
- `projects.opportunity_item_id` (D18), com:
  - a FK `(opportunity_item_id, organization_id)` → `opportunity_items`, `on delete set null (opportunity_item_id)`;
  - a FK `(opportunity_item_id, opportunity_id)` → `opportunity_items (id, opportunity_id)`, `on delete set null (opportunity_item_id)`;
  - o índice único parcial;
- gatilho `projects_item_do_negocio` (`before insert or update of opportunity_id`): `opportunity_item_id` sem `opportunity_id` é recusado. Com `pg_trigger_depth() > 1`, passa, para o `set null` de quando o negócio é apagado. O `criar_processo` recusa o mesmo antes de inserir, com a mesma frase;
- gatilho `projects_item_imutavel` (`before update of opportunity_item_id`), com o valor mudando:
  - sem usuário (migration, SQL Editor), passa, como a 0044. É o que deixa a ligação da D13 e a recópia da 0054 funcionarem;
  - com `pg_trigger_depth() > 1`, passa: é o `set null` da FK;
  - senão, recusa;
- `drop function public.criar_processo(uuid, uuid, text, uuid)` + `create` com `p_item uuid default null`, gravando `opportunity_item_id`, e `revoke`/`grant` como na 0020:423-424;
- `projects_all` vira `projects_select`, `projects_insert` e `projects_update`, com o mesmo `using`/`with check` e **sem** delete;
- gatilho `projects_nunca_apagado` (`before delete`): com `pg_trigger_depth() < 2`, recusa "Processo não se apaga: encerre-o.";
- cópia, sem usuário, **antes** de criar a trava do item: o negócio com valor de hoje está ganho, e a trava recusaria o item dele. Para cada negócio com `value` e sem item, um item com `visa_type_id` nulo, `visa_name = title`, `amount = value`, a moeda do negócio e `position = 0`. Se esse negócio tem exatamente um processo, ligá-lo ao item (D13).

- [ ] Vermelho → aplicar → verde → `bun run test:rls` inteiro verde, **inclusive `funil.test.ts`**: o Ganho antigo continua funcionando com a 0051 → tipos → `banco.md` → commit `feat(banco): vistos do negócio e processo que não se apaga (0051)`.
- [ ] Conferir no banco (só leitura): 1 item sem visto, no negócio ganho, ligado ao processo dele.
- [ ] Conferir a segunda camada do PRO-12, que a API nunca alcança (sem policy de delete, o gatilho não dispara). Pelo conector, numa pessoa descartável da organização de teste criada para isso: `begin; delete from public.projects where id = <processo dela>; rollback;` → "Processo não se apaga: encerre-o.". Depois, apagar a pessoa.

### T3 0052 — `ganhar_negocio` e `reabrir_negocio` (CRM-10, CRM-14, CRM-15, banco)

**Interfaces:**

```sql
public.ganhar_negocio(p_negocio uuid,
                      p_cobrancas_sem_confirmacao boolean default false,
                      p_simular boolean default false) returns jsonb
public.reabrir_negocio(p_negocio uuid) returns void
```

Formato devolvido, igual com e sem `p_simular`. Sem `p_simular`, o `id` de cada processo vem preenchido; simulando, vem nulo:

```json
{ "negocio": "<uuid>",
  "pessoa": { "id": "<uuid>", "nome": "Maria Souza", "vira_cliente": true },
  "itens": [ { "id": "<uuid>", "visa_name": "EB-1A", "amount": 8000, "currency": "USD" } ],
  "processos": [ { "item": "<uuid>", "titulo": "EB-1A — Maria Souza", "id": null } ],
  "cobrancas": [],
  "avisos": [] }
```

**Testes primeiro**, em `tests/rls/ganho.test.ts`, sempre com pessoa e negócio descartáveis da organização de teste. Os negócios nascem por `criar_oportunidade` (dono = quem chama). Itens usam o "Visto do Parceiro":
- `"Ganho com EB-1A e O-1 cria 2 processos com o molde"`:
  - dois itens → `ganhar_negocio`;
  - o negócio fica `won`, na etapa de ganho e com `closed_at`;
  - a pessoa vira `client` com `client_since` de hoje;
  - 2 processos com título "‹visto› — ‹nome›", `opportunity_item_id`, e as etapas **e** as pastas do molde (`project_stages` e `project_documents` > 0);
  - histórico "Oportunidade ganha — virou cliente";
- `"o resumo e a gravação listam os mesmos processos"`:
  - `p_simular` primeiro: nada muda (negócio aberto, pessoa como estava, 0 processos);
  - depois o real: os mesmos `titulo`s, na mesma ordem;
- recusas, cada uma com a mensagem exata e "nada muda" conferido:
  - sem item;
  - item sem processo e sem visto (o item é criado com `visa_type_id` nulo) → "O item ‹visa_name› está sem visto. Remova o item e acrescente um visto do catálogo.";
  - pessoa na lixeira;
- `"falha no meio desfaz tudo"`: tirar o `is_default` do status padrão da organização de teste (restaurar em `finally`) → `ganhar_negocio` falha → negócio aberto, pessoa no estágio de antes, 0 processos, 0 linhas novas no histórico;
- `"duas vezes"`:
  - em sequência: a segunda chamada recebe "Este negócio já foi ganho.";
  - em `Promise.all` (Foco 1): um sucesso e uma recusa;
  - em ambos, um processo por item;
- `"reabrir e ganhar de novo cria só o processo do visto novo"`: ganhar → `reabrir_negocio` → a etapa é a primeira aberta, `closed_at` nulo, a pessoa continua `client` e os processos continuam lá → acrescentar um terceiro item → ganhar → 3 processos no total;
- CRM-10, com negócio criado pelo parceiro:
  - o `staff` chamando `ganhar_negocio` → "Só o dono do negócio ou a gestão ganham o negócio.";
  - depois do ganho pelo parceiro, o `staff` chamando `reabrir_negocio` → "Só o dono do negócio ou a gestão reabrem o negócio.";
  - o `staff` como **dono** (negócio criado por ele) ganha o próprio negócio;
- `"colaborador da Duli não alcança"` (Foco 5) → "Negócio não encontrado.", e o negócio continua aberto;
- dono e participantes:
  - pessoa sem dono recebe o dono do negócio;
  - pessoa que já é cliente, com dono e data, não muda nenhum dos dois, mas ganha os processos novos e os participantes do negócio (D8);
  - pessoa que já é cliente **sem** dono continua sem dono (D9);
  - participante do negócio vira participante da pessoa sem duplicar;
- `"visto desativado ganha mesmo assim"` (Foco 2): `is_active = false` no visto do item (restaurar em `finally`) → o Ganho cria o processo;
- `"apagar o tipo de visto de um negócio ganho funciona"`:
  - criar um tipo de visto descartável, usar num item e ganhar;
  - apagar o tipo → o item fica com `visa_type_id` nulo e o mesmo `visa_name`; o processo fica com `visa_type_id` nulo (0020:72-73);
- `"Ganho → reabrir não toca em processo"`: os `id`s dos processos são os mesmos antes e depois;
- `"item com processo que perdeu o visto não impede ganhar de novo"` (D17): ganhar → apagar o tipo de visto descartável → reabrir → ganhar → sucesso, sem processo novo.

**Migration 0052.** Ambas são `security invoker`, com `revoke` de `public` e `anon` e `grant` a `authenticated`.

`ganhar_negocio`, na ordem da spec:
1. Lê o negócio com `for update`. A RLS de quem chama vale; sem linha → "Negócio não encontrado.".
2. Confere: já ganho; CRM-10 (`owner_id = auth.uid()` ou `current_user_manages(org)`); pessoa na lixeira; sem item; item **sem processo** e sem visto (D17); etapa de ganho do funil. Com `p_simular`, devolve o formato depois das conferências, sem gravar nada.
3. Liga a marca. Move para a etapa de ganho, com `status = 'won'`, `closed_at = now()`, a `probability` da etapa e `lost_reason` nulo.
4. Histórico (D14).
5. Pessoa:
   - estágio `client` se não era. O `client_since` vem do gatilho da 0045;
   - o dono, só se ela vira cliente agora (D9);
   - os participantes (D8), com `on conflict do nothing`.
6. Para cada item sem processo, por `position`, chama `criar_processo(pessoa, visa_type_id, visa_name || ' — ' || full_name, p_negocio, item)`.
7. Cobranças: nada até a entrega 4 (D1).
8. Desliga a marca e devolve o formato com os `id`s.

`reabrir_negocio`:
- `for update`;
- "Este negócio não está ganho.";
- CRM-10;
- marca ligada, depois desligada;
- primeira etapa aberta por `position` ("O funil não tem etapa aberta para onde voltar."), `status = 'open'`, `closed_at` nulo, a `probability` da etapa;
- histórico (D14).

- [ ] Vermelho → aplicar → verde → tipos → `banco.md` → commit `feat(banco): ganhar e reabrir negócio pelo banco (0052)`.

### T4 0053 — `buscar_encerradas` (CRM-16, banco)

**Interface:**

```sql
public.buscar_encerradas(p_busca text default '', p_situacao text default null,
                         p_limite int default 50, p_deslocamento int default 0)
returns table (id uuid, title text, status text, closed_at timestamptz,
               person_id uuid, full_name text, totais jsonb, total bigint)
```

- `p_situacao` aceita `null`, `'won'` ou `'lost'`; outro valor → erro;
- `totais` é `[{ "currency": "USD", "amount": 14000 }]`, a soma dos itens por moeda;
- ordem `closed_at desc nulls last, id`;
- escapa `\`, `%` e `_` como a 0049.

**Testes primeiro**, em `tests/rls/buscar-encerradas.test.ts`, com negócios e pessoas descartáveis. Ganha por `ganhar_negocio`; perdida pelo `update` direto, que nenhuma trava recusa:
- acha pelo título e pelo nome do contato;
- `%` e `_` literais (Foco 4);
- filtra `won`/`lost`;
- não traz negócio aberto, nem de outra organização (colaborador da Duli → 0 linhas);
- `total` é o do filtro, não o da página;
- `totais` soma por moeda e não mistura moedas.

- [ ] Vermelho → aplicar → verde → tipos → `banco.md` → commit.

---

## Fase B — o código da fase 1

### T5 Ganho e reabrir pelo app (CRM-14, CRM-15)

**Interfaces:**
- `aoSoltar(origem: Pick<EtapaDoFunil, "id" | "is_won" | "is_lost">, destino: Pick<EtapaDoFunil, "id" | "is_won" | "is_lost">): "nada" | "mover" | "ganhar" | "perder" | "reabrir" | "reabra-antes"`;
- `resumoDoGanhoSchema` (Zod, em `schema.ts`) descreve o formato do T3, e `ResumoDoGanho = z.infer<…>`. É o que tira o `Json` sem `as unknown as`;
- `resumoDoGanho(id: string): Promise<{ resumo: ResumoDoGanho | null; error: string | null }>`;
- `ganharOportunidade(formData)`: redireciona para `enderecoDaPessoa(resumo.pessoa.id, "client", "projetos")`;
- `reabrirOportunidade(formData): Promise<ActionState>`.

- [ ] **Vermelho (unidade), `regras.test.ts`, `aoSoltar`:**
  - mesma etapa → `nada`;
  - de ganho para perdido → `reabra-antes`;
  - de ganho para aberta → `reabrir`;
  - para ganho → `ganhar` (inclusive de perdido, D6);
  - para perdido → `perder`;
  - entre abertas → `mover`;
  - de perdido para aberta → `mover` (D5).
- [ ] **Vermelho (unidade):** `resumoDoGanhoSchema` aceita o exemplo do T3 e recusa um `processos` sem `titulo`.
- [ ] **Vermelho (RLS), `funil.test.ts`:**
  - `aplicarEtapa` para a etapa de ganho → "Use o Ganho, que mostra o resumo antes.", e nada muda;
  - `aplicarEtapa` de um negócio ganho para outra etapa → "Reabra o negócio antes.";
  - os testes de ganhar e reabrir (`:166-186`) passam a usar `ganhar_negocio` e `reabrir_negocio`, limpando pela pessoa descartável;
  - "a Duli não move o negócio do parceiro" passa a mirar uma etapa **aberta**: com a etapa de ganho, a recusa nova do app passaria antes de chegar à RLS, e o teste deixaria de provar o que diz.
- [ ] **Implementar:**
  - `aplicarEtapa` perde o bloco de promoção e recusa as duas situações acima, lendo o `status` atual antes do `update`;
  - `etapaTerminal` continua, usada pelo Perdido;
  - `perderOportunidade` herda a recusa.
- [ ] Commit.

### T6 Vistos na tela do lead (CRM-13, tela)

**Interfaces:**
- `valorSugerido(visto: { base_price: number | null; currency: string }, moeda: string): number | null` — o preço do visto quando a moeda é a do preço; senão `null`, nunca convertido;
- `somarItensPorMoeda(itens: { amount: number; currency: string }[]): PorMoeda`, em `src/lib/totals.ts` (D20). Soma em centavos e mantém a moeda com total zero. O quadro, a tela do lead e o resumo usam esta;
- `itemFromForm` (Zod): `amount` obrigatório (`parseMoney`, ≥ 0) e `currency` BRL ou USD;
- `adicionarItem(formData)`, `editarItem(formData)` e `removerItem(formData)`, todas `Promise<ActionState>`:
  - `adicionarItem` lê no servidor o negócio (organização) e o visto (nome), nunca do formulário, e põe `position` = maior + 1;
  - todas revalidam `/crm/<id>` e `/crm`.

- [ ] **Vermelho (unidade):**
  - `valorSugerido({ base_price: 8000, currency: "USD" }, "BRL")` → `null` (critério da spec);
  - `valorSugerido({ base_price: 8000, currency: "USD" }, "USD")` → `8000`;
  - `valorSugerido({ base_price: null, … })` → `null`;
  - `somarItensPorMoeda`: `0.1 + 0.2` em BRL dá `0.3`; BRL e USD não se somam; um item de 0 em USD faz a moeda aparecer com 0;
  - `emCentavos` e `emMoeda` movidas (D20): `bun x vitest run src/features/financeiro` continua verde.
- [ ] **Vermelho (componente), `crm/[id]/vistos.test.tsx`:**
  - acrescentar com o visto em USD preenche 8000 e USD;
  - trocar a moeda para BRL esvazia o valor, e salvar sem valor mostra o erro;
  - o seletor só lista vistos ativos (Foco 2);
  - negócio ganho mostra a lista **sem** acrescentar, editar nem remover, com a frase "Negócio ganho: para desistir de um visto, encerre o processo dele.";
  - o total aparece por moeda, inclusive a moeda com zero quando o único item em dólar vale 0. O teste casa com `/US\$\s0/`, porque `formatarMoeda` só mostra centavos quando existem (`totals.ts:46-54`). O cartão Vistos e o resumo listam moeda por moeda. O quadro continua com `formatarPorMoeda`, que omite o zero, como hoje (D20).
- [ ] **Implementar:**
  - `obterNegocio` (`queries.ts:158`) traz `itens` (ordenados por `position`) e os vistos ativos da organização do negócio (`id, name, base_price, currency`);
  - o cartão "Negócio" troca o valor único pelo cartão Vistos;
  - `EditarNegocio` e o diálogo de nova oportunidade perdem valor e moeda (D11);
  - `createOpportunity` deixa de mandar `p_valor`/`p_moeda`, e os testes (`actions.test.ts`, `opportunity-dialog.test.tsx`) acompanham;
  - `contatos/[id]/page.tsx` troca `value, currency` por `itens:opportunity_items(amount, currency)`.
- [ ] Commit.

### T7 Quadro: totais, janela de 30 dias, Ganho com resumo e reabrir (CRM-14, CRM-15, CRM-16)

**Interfaces:**
- `filtroDoQuadro(agora: Date): string` — o `or` do PostgREST: `status.eq.open,closed_at.gte.<ISO de agora − 30 dias>` (D15).

- [ ] **Vermelho (unidade):** `filtroDoQuadro(new Date("2026-11-19T12:00:00Z"))` → `"status.eq.open,closed_at.gte.2026-10-20T12:00:00.000Z"`.
- [ ] **Vermelho (RLS), em `buscar-encerradas.test.ts`:**
  - negócio ganho com `closed_at` posto 40 dias atrás, por `update` direto (só `closed_at`, que nenhuma trava guarda): com `.or(filtroDoQuadro(new Date()))`, não aparece;
  - aparece em `buscar_encerradas` pelo nome do contato (critério da spec);
  - um ganho de hoje aparece no filtro.
- [ ] **Vermelho (componente), `quadro.test.tsx` e `dialogos.test.tsx`:**
  - o cartão mostra os totais por moeda dos itens;
  - as colunas Ganho e Perdido dizem "últimos 30 dias";
  - cartão ganho não tem Excluir (D12);
  - soltar um ganho numa etapa aberta abre "Reabrir este negócio?", que diz "Ele volta para ‹primeira etapa aberta›." (D7). Cancelar não muda nada;
  - soltar um ganho em Perdido mostra "Reabra o negócio antes" e não move;
  - reabrir recusado pelo banco mostra a mensagem, e o cartão volta para Ganho (Foco 3);
  - o diálogo de Ganho mostra, a partir de um `ResumoDoGanho`:
    - os vistos e o total por moeda;
    - "Forma de pagamento: definir na aba Financeiro";
    - "‹nome› passa a ser cliente" só com `vira_cliente`;
    - "Serão criados N processos: ‹títulos›";
    - "Nenhuma cobrança será criada.";
  - Confirmar chama `ganharOportunidade`;
  - resumo que volta com erro (sem item, CRM-10) mostra a frase e **não** oferece Confirmar;
  - resumo sem processo novo (D17: todos os itens já têm processo) diz "Nenhum processo novo.";
  - cartão ganho com mais de um processo: "Ver processos" leva à aba Projetos do cliente (`quadro.tsx:229-245` hoje abre só o primeiro).
- [ ] **Implementar:**
  - `getBoard`:
    - `.or(filtroDoQuadro(new Date()))`;
    - `itens:opportunity_items(amount, currency)` no lugar de `value, currency`;
    - o tipo `BoardCard` acompanha;
  - os totais da coluna e o cabeçalho "em negociação" (`crm/page.tsx`, hoje `juntarMoedas` em ponto flutuante) passam a `somarItensPorMoeda`;
  - o diálogo de Ganho busca o resumo ao abrir, como o `pronto` de `clientes/[id]/cobrancas.tsx`;
  - o diálogo de reabrir chama `reabrirOportunidade`;
  - na tela do lead, o negócio ganho ganha "Reabrir", com o mesmo diálogo, e a trilha continua travada.
- [ ] Commit.

### T8 CRM › Encerradas (CRM-16, tela)

- [ ] **Mover (D16)** `POR_PAGINA`, `paginaPedida` e `contagemDaLista` para `src/lib/paginacao.ts`, com o substantivo como parâmetro (`{ singular: "cliente", plural: "clientes" }`). Os testes vão junto, e Clientes continua mostrando "30 clientes".
- [ ] **Vermelho (unidade):** `listarEncerradas` monta a contagem e lê `totais` sem `as unknown as`, com um Zod pequeno.
- [ ] **Tela `crm/encerradas/page.tsx`:**
  - `PageHeader` "Oportunidades encerradas";
  - `BuscaNaUrl`, e o filtro `?situacao=ganha|perdida` em links "Todas | Ganhas | Perdidas" que mantêm o `q`;
  - tabela no computador e cartões no celular, com título, contato, selo (Ganha/Perdida), data e totais;
  - paginação de 50, com o total;
  - `EmptyState`;
  - o clique abre `/crm/<id>`.
- [ ] Link "Encerradas" no topo do quadro (`crm/page.tsx`).
- [ ] Fumaça: `TOPO` com `/crm/encerradas`.
- [ ] Commit.

### T9 Documentação, verificação e push 1
- [ ] Documentação:
  - `docs/spec.md`: CRM-6 → substituído pelo CRM-13; CRM-10, 13, 14, 15 e 16 e PRO-12 com o estado (🟡 onde a fase 2 ainda falta);
  - `docs/banco.md`: 0051–0053;
  - `docs/plano.md`;
  - spec técnica: notas dos D1, D4, D5, D9, D17 e D18. E os critérios da §6.3 que dependem da forma de pagamento passam para a §6.4, ou ganham lá uma nota, para o plano da entrega 4 herdá-los: excluir negócio com link aberto ou forma respondida, o aviso de parcelas já vencidas, e a parte da forma na trava de excluir negócio;
  - `AGENTS.md`: `@/lib/paginacao` na tabela "UI: use o que já existe" (D16).
- [ ] **Prova de que a fase 1 não lê o que a 0054 tira.** Editar o próprio `src/lib/supabase/database.types.ts` (o git guarda o original): tirar `value` e `currency` de `opportunities`, as tabelas `products` e `opportunity_products`, e `p_valor` e `p_moeda`. Rodar `bun x tsc --noEmit`. Esperado: zero erros em `src/`. Em `tests/`, só os de `oportunidade-nova.test.ts` e `rotas.test.ts:449`, que entram no T10. Depois, `git checkout -- src/lib/supabase/database.types.ts`.
- [ ] `bun run verify`, `bun run build` e a fumaça local (`bun run dev` mais `bun run test:fumaca`).
- [ ] **Revisão** (Code Reviewer, em loop até não sobrar ajuste, classificando em crítico, importante, médio e cosmético) → correções com teste.
- [ ] **Push 1 [Renato]** → CI verde → `/api/versao` com o commit novo.

---

## Fase C — a fase 2

### T10 0054 — Ganho só pela função, e o que sai (CRM-10, regra (2) de estágio)

**Antes de escrever:** `/api/versao` mostra o commit do push 1. Se não mostrar, **parar**: a 0054 recusaria o código antigo.

- Sem cópia à mão (dispensada pelo Renato em 19/nov). O que se perde de verdade: `products` e `opportunity_products` (vazias em 19/nov; recontar antes) e as colunas `value`/`currency`, já copiadas para os itens pela recópia.

**Testes primeiro**, em `ganho.test.ts`, `estagio-do-cliente.test.ts` e `vistos-do-negocio.test.ts`:
- o `staff`, com `update opportunities set status = 'won', stage_id = <ganho>`, é recusado com "Use o Ganho ou o Reabrir do negócio.". O mesmo vale para o parceiro (gestão): a regra é o caminho, não o papel;
- sair do ganho por `update` direto também é recusado;
- `update opportunities set owner_id = auth.uid()` pelo `staff` → a mensagem da 0044 (confere que o teste existe em `clientes-dono.test.ts`; se não, entra aqui);
- o `staff`, com `update people set lifecycle_stage = 'client'` num lead → "Só a gestão torna alguém cliente; use o Ganho.";
- o `staff`, com `insert` de pessoa já como `client` → a mesma recusa. O parceiro (gestão) consegue: buscar-clientes, anexos e documentos-do-cliente inserem assim e continuam passando;
- a gestão consegue, e `marcar_como_cliente` continua registrando no histórico;
- o `staff` dono do negócio ganha pelo `ganhar_negocio`, e a pessoa vira cliente: prova a marca;
- `delete` de negócio ganho, inclusive na organização de teste → "Reabra ou encerre os processos; o negócio ganho fica como registro.". Apagar a pessoa leva tudo;
- `sync_manifesto()` responde sem erro, e `sincronia.test.ts` passa;
- *(revisão final da fase 1)* `delete` de item que já tem processo, num negócio reaberto, é recusado com "Este visto já tem processo: para desistir, encerre o processo." (o app já recusa desde a fase 1); a cascata da pessoa e do negócio passa;
- *(revisão final da fase 1)* o resumo de um negócio sem dono avisa "O negócio está sem dono: você fica como dono do cliente.", e não "O dono do negócio não está na equipe…";
- *(revisão final da fase 1)* `update opportunities set owner_id = <perfil de fora da organização>` pela gestão → `23503`.

**Ajustes na suíte, no mesmo commit:**
- todo teste que põe negócio em ganho por `update` direto passa a usar `ganhar_negocio`. Entre eles o "item de negócio ganho não muda" do T2. Para achar os outros, `grep -rn "\"won\"" tests/`;
- os que usam o valor do negócio: `tests/fumaca/rotas.test.ts:449` (insere `value: 5000`) e `tests/rls/oportunidade-nova.test.ts:67-68` e `:182-190` (manda `p_valor`/`p_moeda` e confere `value`/`currency`).

**A Configuração não esbarra no gatilho novo.** Ela não toca no `status` nem no `stage_id` de negócio ganho: excluir etapa com negócio é recusado (`escritas-locais.ts:541-576`), e a etapa de ganho ou perda nem se exclui (`pipeline_stages_protect_terminal`, 0005:27).

**Migration 0054**, na ordem da spec:
1. Recópia: negócio com `value` e sem item vira item, como na 0051. Negócio com `value`, um item só, sem visto e nunca editado (`updated_at = created_at`), cujo `amount` ou moeda difere de `value`/`currency`, tem o item corrigido (D19). A trava do item já existe, e o negócio pode ter sido ganho na janela: a recópia roda entre `alter table opportunity_items disable trigger opportunity_items_trava_do_ganho` e o `enable` correspondente, dentro da migration.
2. Gatilhos:
   - `opportunities_ganho_so_pela_funcao` (`before update`), sem a marca `via_ganho`, recusa só (spec:651):
     - `status` mudando, com `old.status = 'won'` ou `new.status = 'won'`;
     - `stage_id` mudando, com a etapa antiga ou a nova sendo de ganho (`is_won`).

     O resto do negócio ganho continua editável: título e origem pelo "Editar negócio", e `closed_at` no teste do T7. O dono é guardado pela 0044;
   - `opportunities_ganho_nao_se_apaga` (`before delete`, `pg_trigger_depth() < 2` e `old.status = 'won'`).
3. A regra (2), no update **e no insert** (spec: "no update, ou no insert já como `client`"):
   - `people_trava_do_estagio` ganha a regra no update;
   - gatilho novo `people_trava_do_estagio_no_insert` (`before insert`), com a mesma regra;
   - sem usuário, passa;
   - com usuário, passar a `client` exige a marca `via_ganho` ou `current_user_manages`;
   - **sem** a liberação por profundidade (§3).
4. `marcar_como_cliente` liga e desliga a marca.
5. `quem_tem_processo_e_cliente` ganha o ramo `via_ganho`.
6. `alter table opportunities drop column value, drop column currency`; `drop table opportunity_products, products`.
7. `public.sync_manifesto()` recriada sem as duas tabelas, **na mesma migration**.
8. `drop` + `create` de `criar_oportunidade` sem `p_valor` e `p_moeda`, a partir da última definição (`grep`), com `revoke`/`grant`.

*Da revisão final da fase 1 (19/nov):*

9. **Cópia dentro do banco, antes do passo 6:** `create table private.backup_opportunities_value as select id, value, currency from public.opportunities where value is not null`. Uma linha, e o valor não se perde sem volta se a recópia falhar.
10. **Ligação da D13 de novo, depois da recópia:** negócio com exatamente um processo sem item e exatamente um item sem processo tem os dois ligados. É o negócio ganho pelo código antigo na janela, com "Criar processo →". A `projects_item_imutavel` deixa passar sem usuário.
11. **A trava do item recusa o `delete` de item com processo** em profundidade 1: remover e acrescentar de novo duplicaria o processo.
12. **`create or replace` de `ganhar_negocio`** com o aviso próprio para negócio sem dono.
13. **Dono do negócio preso à equipe:** FK composta `(organization_id, owner_id)` → `organization_members (organization_id, user_id)`, `on delete set null (owner_id)`, como a de `people` (0044). Antes, contar os negócios com dono fora da organização: tem de dar 0.

Depois:
- [ ] **Antes de aplicar, conferir à mão** (SQL Editor, organização de teste), com uma pessoa de teste e dois negócios:
  - um com `value` e sem item. Depois de aplicar, ele tem o item;
  - um com um item só, sem visto e nunca editado, e `value` diferente do `amount` (D19). Depois de aplicar, o item tem o `value`.

  Por fim, apagar a pessoa de teste.
- [ ] Vermelho → aplicar → verde → tipos. `tsc` acusa toda leitura que sobrou de `value`/`currency`, e o T6 já deve ter zerado. → Dexie: conferir que nada do esquema local cita as colunas → `banco.md` → commit.

### T11 Documentação e push 2
- [ ] `docs/spec.md` (CRM-10 e o resto da entrega ✅), `docs/banco.md`, `docs/plano.md` e a seção "Decisões que valem até a entrega 3" do plano, que fecha.
- [ ] `bun run verify`, `bun run build` e a fumaça local.
- [ ] **Revisão da fase 2** (Code Reviewer, em loop até não sobrar ajuste).
- [ ] **Push 2 [Renato]** → CI verde → `/api/versao`.

---

## Verificação

- Por tarefa: o teste vermelho visto, depois verde. `bun x vitest run <arquivo>` na unidade; `--no-file-parallelism` no RLS.
- Antes de cada commit: `bun run verify`.
- Depois de cada migration: `bun run test:rls` inteiro, porque mudança de policy quebra testes de outros arquivos.
- No fim de cada fase: `bun run build`, a fumaça local e, depois do push, CI verde **e** `/api/versao` com o commit.
- No banco: depois da 0051, 1 item sem visto ligado ao processo do negócio ganho. Depois da 0054, as colunas e as tabelas sumiram, e `sync_manifesto()` responde.

## Depois de aprovado

1. Commit deste plano.
2. Code Reviewer **no plano**, em rodadas, até não sobrar ajuste (método do Renato).
3. Execução nativa, com o registro em `.superpowers/sdd/`.
