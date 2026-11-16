# Banco de dados — onde mora cada coisa e quem mexe nela

Mapa do banco do DuliHub 2 para consulta rápida: que tabela guarda o quê, de
onde vem a organização de cada linha, quem lê, quem grava e que regra o banco
impõe sozinho. Serve ao Renato e às próximas sessões de IA, para ninguém
precisar ler 38 migrations para responder "onde está X e quem pode tocar".

**Quem manda são as migrations** (`supabase/migrations/`). Este documento é um
resumo delas; se divergir, a migration vence e este arquivo está errado.
**Toda migration atualiza este arquivo no mesmo commit.**

Situação: 0001 a 0036 aplicadas. **0037 e 0038 estão escritas e ainda não
aplicadas** — o que vem só delas aparece marcado "(0037/0038, ainda não
aplicada)". Colunas atuais: `src/lib/supabase/database.types.ts` (gerado, não
se edita à mão).

---

## 1. Regras que valem para toda tabela

| Regra | Como funciona |
|---|---|
| **`organization_id` em toda linha** | Herdado do registro-pai (nota herda da pessoa, pasta herda do processo, exigência herda do tipo de visto), nunca da associação de quem clicou. As três que não tinham (`pipeline_stages`, `visa_stages`, `opportunity_products`) ganharam na 0027. Exceções: `profiles` (é o usuário) e `organizations` (é a própria). |
| **Chave composta `(id, organization_id)`** | Cada tabela tem `unique (id, organization_id)` e as estrangeiras levam a organização junto (0016 em diante). O banco recusa pasta de A filha de pasta de B, negócio de A na etapa de B etc. — coisa que a RLS não vê, porque `with check` só olha a linha gravada. |
| **RLS ligada em todas** | Toda policy é `to authenticated`. Nenhuma é `to anon`. O anônimo só entra pelas duas funções da ficha de cadastro (§3). Ninguém usa a chave mestra (service role) no app. |
| **Papéis** | Por organização: `owner` (dono), `admin`, `staff` (colaborador). "Gestão" = `owner` ou `admin`. O cliente do portal **não** é membro de organização: chega pelo `people.user_id`. |
| **Lápides** | Gatilho `private.marcar_lapide` (depois do `delete`) grava tabela, id e organização em `deleted_rows`, para o espelho offline saber o que sumiu. Cobertas: todas as tabelas de negócio com `id`, menos `person_tags`, `project_page_updates`, `organizations` e `profiles`. |
| **`updated_at`** | Gatilho `private.set_updated_at` antes do `update`, em todas as tabelas menos `project_page_updates` (só acrescenta) e `deleted_rows`. Índice `(organization_id, updated_at)` para a sincronia (0028). |
| **Gatilhos de guarda e o dono do banco** | Os gatilhos da 0036 em diante deixam passar quando não há usuário (`auth.uid()` nulo) — é migration ou painel, não chamada pela API. |
| **Estado não guardado** | Status de parcela, saldo da cobrança e contagens saem de conta, não de coluna (0033). |

### Funções auxiliares (`private`, não chamáveis pela API)

O schema `private` não é publicado pelo PostgREST. As auxiliares de RLS são
`security definer` com `search_path` vazio (0013) e executáveis só por
`authenticated`.

| Função | O que confere | Definição atual |
|---|---|---|
| `current_user_organizations()` | Lista as organizações de que o usuário logado é membro (qualquer papel). | 0013 |
| `current_user_is_root()` | O usuário é membro da organização raiz (Duli), com qualquer papel. Hoje só usada para **ler** organizações e associações. | 0013 |
| `current_user_is_root_owner()` | O usuário é **dono** (`owner`) da organização raiz. Exigido para criar organização e para mexer em organização/associação alheia. | 0036 |
| `current_user_manages(org)` | O usuário é `owner` ou `admin` da organização informada. | 0013 |
| `can_access_person(pessoa)` | O usuário alcança a pessoa: é membro da organização dona, ou da organização atribuída, ou **é a própria pessoa** (`people.user_id`). | 0013 |
| `can_access_opportunity(negócio)` | `can_access_person` da pessoa dona do negócio. | 0013 |
| `campos_da_ficha()` | Lista fechada dos 20 campos de `people` que a ficha de cadastro pode gravar. | 0035 |

Funções de gatilho (ninguém chama direto): `set_updated_at`, `handle_new_user`
(cria `profiles` quando nasce usuário), `people_guard_self_update`,
`people_organizacao_fixa`, `organizations_campos_fixos`,
`organization_members_guarda`, `guard_child_row`, `prevent_tree_cycle`,
`protect_terminal_stages`, `protect_system_statuses`, `seed_organization` /
`seed_new_organization`, `processo_do_mesmo_contato`,
`pasta_so_resolve_aprovada`, `arquivo_pendente_reabre_pasta`, `marcar_lapide`,
`negocio_nasce_aberto` (0038, ainda não aplicada). Agendada:
`limpar_lapides` (§2.7).

---

## 2. Mapa das tabelas

Legenda de "quem": **membros** = qualquer membro da organização da linha;
**gestão** = `owner`/`admin` da organização da linha; **dono da raiz** =
`owner` da Duli; **cliente** = a própria pessoa logada no portal
(`people.user_id`); **atribuída** = membros da organização em
`people.assigned_organization_id`.

### 2.1 Organizações e acesso

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `organizations` | A Duli (raiz) e cada parceiro, com marca e dados fiscais. `is_test` marca a organização dos testes. | É a própria. | Membros dela; **qualquer membro da Duli** lê todas. | Criar: dono da raiz. Alterar: gestão dela ou dono da raiz. Apagar: ninguém (sem policy). | Uma raiz só (índice). Ao nascer, gatilho semeia funil padrão (Novo Lead / Ganho / Perdido) e os três status de etapa (0019). `type` e `is_test` não mudam pela API (0036); nascer já `is_test` pela API é recusado (0037, ainda não aplicada). |
| `profiles` | Espelho de `auth.users`: nome, e-mail, foto, telefone. | Usuário (`id` = `auth.users.id`). | O próprio e colegas de alguma organização em comum. | Criar: gatilho `handle_new_user`. Alterar: só o próprio. Apagar: ninguém pela API (cascade de `auth.users`). | Não vai ao espelho offline (`AGENTS.md`). |
| `organization_members` | Quem trabalha em qual organização, e com que papel. Cliente não entra aqui. | `organization_id`. | Membros da mesma organização; qualquer membro da Duli lê todas. | Gestão da organização ou dono da raiz. | Gatilho `organization_members_guarda` (0036): ninguém altera nem remove a própria linha, nem se associa sozinho (exceto dono da raiz); linha não muda de pessoa nem de organização; só dono (daquela organização ou da raiz) cria, altera ou remove um `owner`. Único `(organization_id, user_id)`. |

### 2.2 Contatos

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `people` | Cadastro único da pessoa: contato, lead e cliente são a mesma linha com `lifecycle_stage`. Dados da ficha, endereço, documentos. `deleted_at` = lixeira. | `organization_id` próprio (quem trouxe a pessoa); `assigned_organization_id` = organização atribuída. | Membros; atribuída; cliente. | Criar: membros. Alterar: membros e atribuída; o cliente altera o próprio, com colunas travadas. Apagar de vez: só gestão **e** só em organização `is_test` (0036). | `people_guard_self_update`: no portal, o cliente não muda organização, atribuída, estágio, `user_id`, CPF, RG, órgão, `created_by`, `deleted_at`. `people_organizacao_fixa`: `organization_id` nunca muda; `assigned_organization_id` só muda por gestão da dona ou dono da raiz (0036); a mesma regra vale ao **criar** já atribuído (0037, ainda não aplicada). Um login por pessoa; `legacy_id` único por organização. |
| `tags` | Etiquetas da organização. | `organization_id` próprio. | Membros. | Gestão (0018). | Nome único por organização, sem diferenciar maiúscula. |
| `person_tags` | Etiqueta aplicada a uma pessoa. | Da pessoa; chave composta amarra pessoa **e** tag à mesma organização. | Quem alcança a pessoa (`can_access_person`: membros, atribuída, cliente). | Membros. | Chave é o par `(person_id, tag_id)`, sem `id`: **sem lápide** (0029b) — o espelho relê inteira. `guard_child_row` congela vínculo se quem edita não é da organização. |
| `person_dependents` | Cônjuge e filhos do contratante, para os formulários americanos. | Da pessoa. | Quem alcança a pessoa. | Membros (na prática, via `salvar_cadastro`). | `relationship` ∈ spouse/child/other; nome e país obrigatórios; no máximo 10 por ficha (regra da função). Fora do manifesto por ora. |
| `registration_forms` | Link da ficha de cadastro (token) e a resposta do lead: `answers`, `previous` (o que havia antes), texto do consentimento, conferência. | Da pessoa. | Membros. Anônimo: só pelas funções da ficha. | Membros; o envio do lead grava via `enviar_ficha_de_cadastro`. | Token ≥ 40 caracteres, único. Um link em aberto por pessoa (vencido conta como aberto). Enviada exige resposta; conferida exige enviada. Fora do manifesto por ora. |
| `notes` | Notas sobre a pessoa (opcionalmente ligadas a um negócio). | Da pessoa. | Quem alcança a pessoa — inclui cliente e atribuída. | Membros da organização dona (0017). | `guard_child_row` congela `organization_id`, `person_id`, `opportunity_id`, `created_by` para quem não é membro. |
| `activities` | Histórico (ligação, mudança de etapa, ficha recebida…). `type` é texto livre. | Da pessoa. | Quem alcança a pessoa. | Membros. | Mesmo `guard_child_row`. A ficha enviada grava aqui `registration_submitted`. |
| `files` | Registro de arquivo do CRM (bucket + caminho). | Da pessoa. | Quem alcança a pessoa. | Membros. | Único `(bucket, path)`. `guard_child_row`. Nenhuma migration cria bucket com policy para estes arquivos. |

### 2.3 CRM

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `pipelines` | Funis de venda. | `organization_id` próprio. | Membros. | Gestão (0018). | Um funil padrão por organização. Semeado ao criar a organização. |
| `pipeline_stages` | Colunas do funil. | Do funil (coluna desde 0027). | Membros. | Gestão. | Uma etapa de ganho e uma de perda por funil, nunca as duas na mesma; ganho/perda **não se apagam**, só se renomeiam (0005). `probability` 0–100. |
| `opportunities` | Negócio de uma pessoa (a pessoa pode ter vários). Valor, moeda, etapa, status open/won/lost. | Da pessoa; funil da mesma organização; etapa do mesmo funil. | Quem alcança a pessoa — inclui cliente e atribuída. | Membros (0017). | Encerrado ⇔ tem `closed_at`. `guard_child_row`. Nasce sempre aberto e em etapa não terminal; ganhar/perder é mover (0038, ainda não aplicada). |
| `products` | Catálogo de produtos/serviços da organização. | `organization_id` próprio. | Membros. | **Membros** (policy da 0004, não passou pela 0018). | Produto usado num negócio não pode ser apagado (FK sem cascade). |
| `opportunity_products` | Produto dentro de um negócio, com o preço da negociação congelado. | Do negócio (coluna desde 0027). | Quem alcança o negócio (`can_access_opportunity`). | **Também `can_access_opportunity`** — inclui o cliente (ver §7). | `product_id` é FK simples, sem organização. |

### 2.4 Catálogo de vistos e configuração

Tudo aqui é **molde**: o processo recebe uma cópia e não muda quando o molde
muda. Leitura livre para qualquer membro; escrita exige gestão (0018).

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `document_types` | Catálogo único de pastas de documento, em árvore. Toda pasta tem subpasta e recebe arquivo. | `organization_id` próprio; pai da mesma organização. | Membros. | Gestão. | Sem ciclo na árvore (`prevent_tree_cycle`). Apagar pasta apaga as filhas e as exigências que a usam. |
| `visa_types` | Tipos de visto: preço de referência, prazo estimado, ativo. | `organization_id` próprio. | Membros. | Gestão. | Nome único por organização. Apagar o visto apaga molde de etapas e exigências; processos ficam (perdem só a origem). |
| `visa_stages` | Molde de etapas (e sub-etapas) de um visto. | Do visto (coluna desde 0027); pai do mesmo visto. | Membros. | Gestão. | Sem ciclo. |
| `visa_type_documents` | Quais pastas do catálogo o visto exige, com obrigatoriedade, prazo em dias e ordem **do visto**. | Do visto; a pasta tem de ser da mesma organização. | Membros. | Gestão. | Único `(visa_type_id, document_type_id)`. Seleção gravada nó a nó. |
| `stage_statuses` | Status de etapa de processo (Pendente, Em andamento, Concluído + próprios). | `organization_id` próprio. | Membros. | Gestão. | Código único por organização; um padrão por organização (troca atômica por `set_default_stage_status`); os três de fábrica (`is_system`) não se apagam; status em uso por etapa não se apaga (FK). Semeados ao criar a organização. |

### 2.5 Processos

Trabalho do dia a dia: **qualquer membro** da organização lê e grava (0020).
Organização atribuída e cliente **não** enxergam processos por enquanto.

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `projects` | O processo: título, status, datas, recibo USCIS, priority date, RFE (recebida, prazo, respondida), decisão. | Da pessoa; visto e negócio da mesma organização. | Membros. | Membros. | `status` ∈ active/filed/approved/denied/closed. O negócio tem de ser **do mesmo contato** (gatilho + FK, 0022). RFE respondida não antes de recebida (0034). Apagar visto ou negócio só zera a origem. Nasce por `criar_processo`. |
| `project_stages` | Etapas copiadas do molde, editáveis no processo (data prevista `due_on`, conclusão). | Do processo; pai do mesmo processo; status da mesma organização. | Membros. | Membros. | Status em uso não pode ser apagado do catálogo. |
| `project_documents` | Pastas do processo (copiadas do visto ou criadas só nele), com prazo e "resolvida". | Do processo; pai do mesmo processo. | Membros. | Membros. | Só resolve com **todos** os arquivos aprovados; arquivo novo, pendente ou recusado **reabre** a pasta (0026). |
| `document_files` | Cada arquivo enviado numa pasta, com veredito (pending/approved/rejected). | Do processo; pasta do mesmo processo. | Membros. | Membros. | `storage_path` obrigatoriamente `{org}/{processo}/{pasta}/{arquivo}`. Recusa exige motivo com ≥ 10 caracteres. Pendente não tem `reviewed_at`. |
| `project_pages` | Página "Observações" do processo (editor Plate + Yjs): `snapshot` binário e `content` em JSON legível. | Do processo. | Membros. | Membros. | Uma página por processo e tipo (`kind` só `notes`). |
| `project_page_updates` | Pedaços de edição Yjs ainda não compactados. Só acrescenta. | Da página. | Membros. | Inserir: membros. Alterar: ninguém. Apagar: só dentro de `compactar_pagina` (0025). | Sem `updated_at` e sem lápide; o espelho lê por id crescente. Fora do manifesto. |

### 2.6 Financeiro (a receber)

A cobrança é **do cliente**, não do processo. Qualquer membro lê e grava;
cliente ganha leitura só no portal (Fase 6).

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `receivables` | Cobrança: título, valor, valor de tabela (desconto = diferença), moeda, notas. | Da pessoa; processo de origem da mesma organização (anulável). | Membros. | Membros. | Moeda só BRL ou USD, e as parcelas herdam. Valores ≥ 0; valor de tabela ≥ valor. Apagar o processo não apaga a cobrança. Nenhum saldo guardado. |
| `installments` | Parcelas: número, valor, vencimento, data de pagamento, cotação do dia, forma. | Da cobrança. | Membros. | Membros. | Número único por cobrança. Cotação só com data de pagamento. Forma ∈ pix/boleto/cartao/transferencia/cripto. Sem coluna de status: paga/vencida/pendente saem de `paid_on` e `due_on`. |

### 2.7 Sincronia

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `deleted_rows` | Lápides: o que foi apagado, para o espelho offline remover. | Da linha apagada. | Membros. | **Ninguém pela API**: só o gatilho `marcar_lapide`. | Chave `(tabela, id)`. Retenção de 90 dias: `private.limpar_lapides`, agendada no pg_cron como `limpar-lapides`, todo dia às 04:17 (0031). |

---

## 3. Funções chamáveis pelo app (RPC em `public`)

Novas funções em `public` nascem sem `execute` para `anon` (0003). Todas abaixo
rodam numa transação só.

| Função | O que faz | Quem chama | Roda como |
|---|---|---|---|
| `abrir_ficha_de_cadastro(token)` | Devolve a situação do link (aberta/enviada/cancelada/expirada), o nome da organização e — só se aberta — nome, e-mail e telefone. Token desconhecido não devolve linha. | **Só `anon`** | definer |
| `enviar_ficha_de_cadastro(token, dados, consentimento)` | Trava o link, confere prazo e consentimento, guarda o "antes", grava a ficha completa via `salvar_cadastro`, marca enviada e registra atividade. Uso único. | **Só `anon`** | definer |
| `salvar_cadastro(pessoa, dados, completo)` | Grava os campos da ficha (lista fechada), valida CPF (11 dígitos), datas, sexo, estado civil e e-mail; se vier `dependents`, substitui a lista (máx. 10). Devolve o que gravou, normalizado. | `authenticated` | invoker |
| `criar_processo(pessoa, visto, título, negócio?)` | Cria o processo e copia do visto as etapas (com o status padrão) e as pastas exigidas, ligando cada pasta ao "pai visível" e calculando o prazo. | `authenticated` | invoker |
| `reordenar_irmaos(tabela, ids[])` | Grava a ordem final de uma lista; idempotente (serve à fila offline). Recusa se alguma linha não for alcançável. Tabelas: `pipeline_stages`, `stage_statuses`, `document_types`, `visa_stages`, `visa_type_documents`, `project_stages`, `project_documents`. | `authenticated` | invoker |
| `swap_positions(tabela, a, b)` | Troca duas linhas de posição. Mesmas sete tabelas (0026). Não é idempotente — para a fila, usar `reordenar_irmaos`. | `authenticated` | invoker |
| `compactar_pagina(página, snapshot, até, conteúdo)` | Grava o snapshot novo da página e apaga os pedaços já incluídos, ligando a marca `app.compactando` só nesta transação. | `authenticated` | invoker (era definer na 0024; virou invoker na 0025) |
| `sync_manifesto()` | Para cada uma das 24 tabelas do espelho, conta linhas e o maior `updated_at` **sob a RLS de quem chama**; linha extra `deleted_rows` com a lápide mais antiga (nula se não há nenhuma, 0032). Lista atual: 0033. | `authenticated` | invoker |
| `set_default_stage_status(id)` | Troca o status de etapa padrão da organização em um passo (0010). | `authenticated` | invoker |

As duas da ficha são as **únicas** `security definer` em `public` e as únicas
executáveis por `anon` — exceção deliberada (`AGENTS.md`, "Uma porta para quem
não tem login"). O aviso do Supabase para qualquer outra é defeito.

---

## 4. Arquivos (Storage)

Os dois depósitos são privados: nada abre por link público. Em ambos, **a
primeira pasta do caminho é a organização**, e é ela que a policy confere.

| Depósito | Guarda | Caminho | Quem lê | Quem grava / apaga | Limite |
|---|---|---|---|---|---|
| `documentos` | Arquivos que o cliente envia para as pastas do processo (`document_files`). | `{organização}/{processo}/{pasta}/{arquivo}` — a mesma regra está como `check` em `document_files.storage_path`. | Membros da organização da primeira pasta; a tela usa URL assinada de curta duração. | Membros: enviar, alterar e apagar. | 20 MB; PDF, JPEG, PNG, WEBP, HEIC, DOC/DOCX, XLS/XLSX. |
| `observacoes` | Imagens e arquivos colados na página Observações. | `{organização}/{processo}/{uuid}-{nome}`. | Membros da organização da primeira pasta (servido pela rota `/api/observacoes/arquivo`). | Membros: enviar e apagar. **Sem policy de alteração.** | 20 MB; os mesmos tipos, mais GIF. |

Nenhuma policy de Storage para cliente do portal nem para `anon`. A policy
confere só a organização, não o processo nem a pasta.

---

## 5. Tempo real

Só um uso: a edição simultânea das Observações (0024).

- **Nenhuma tabela é publicada** para `postgres_changes`; não há `alter
  publication` nas migrations.
- O canal é `pagina:<id da página>`, **privado** (`private: true` no
  cliente), com mensagens `broadcast` (eventos `update` e `awareness` do Yjs) e
  `presence`.
- Acesso por policy em `realtime.messages`: receber (`select`) e enviar
  (`insert`) exigem que exista uma `project_pages` com aquele id **numa
  organização de que o usuário é membro**. Tópico malformado só não casa — não
  vira erro.
- O que fica gravado não passa pelo canal: cada pedaço vai para
  `project_page_updates`, e `compactar_pagina` o consolida.

---

## 6. Onde está escrito

| Tabela / objeto | Migrations |
|---|---|
| `organizations` | 0001, 0002 (Duli), 0003, 0015 (organização de teste), 0019 (semente), 0036, 0037\* |
| `profiles` | 0001, 0003, 0013 (`handle_new_user`) |
| `organization_members` | 0001, 0002, 0003, 0028, 0029, 0036 |
| `people` | 0001, 0003, 0006, 0007, 0013, 0016, 0029, 0036, 0037\* |
| `tags` | 0004, 0016, 0018, 0028, 0029 |
| `person_tags` | 0004, 0016, 0017, 0028, 0029b |
| `person_dependents`, `registration_forms` | 0035 |
| `notes` | 0004, 0016, 0017, 0029 |
| `activities`, `files` | 0004, 0016, 0017, 0028, 0029 |
| `pipelines` | 0004, 0005, 0016, 0018, 0019, 0029 |
| `pipeline_stages` | 0004, 0005, 0009, 0016, 0018, 0019, 0027, 0028, 0029 |
| `opportunities` | 0004, 0016, 0017, 0020, 0022, 0029, 0038\* |
| `products` | 0004, 0029 |
| `opportunity_products` | 0004, 0027, 0028, 0029 |
| `document_types` | 0008, 0011, 0016, 0018, 0029 |
| `visa_types` | 0008, 0016, 0018, 0029 |
| `visa_stages` | 0008, 0016, 0018, 0027, 0029 |
| `visa_type_documents` | 0008, 0012, 0016, 0018, 0028, 0029 |
| `stage_statuses` | 0008, 0009, 0010, 0018, 0019, 0020, 0029 |
| `projects` | 0020, 0022, 0029, 0034 |
| `project_stages` | 0020, 0023, 0029 |
| `project_documents` | 0020, 0026, 0029 |
| `document_files` | 0020, 0026, 0028, 0029 |
| `project_pages` | 0024, 0028, 0029 |
| `project_page_updates` | 0024, 0025 |
| `receivables`, `installments` | 0033 |
| `deleted_rows` | 0029, 0031 (limpeza), 0032 e 0033 (manifesto) |
| Auxiliares de RLS | 0001 → 0003 (para `private`) → 0013 (versão atual); `current_user_is_root_owner` na 0036 |
| RPCs | `swap_positions` 0014/0023/0026; `criar_processo` 0020; `compactar_pagina` 0024/0025; `sync_manifesto` 0030/0032/0033; `reordenar_irmaos` 0030; ficha 0035; `set_default_stage_status` 0010 |
| Storage | `documentos` 0020; `observacoes` 0024 |
| Tempo real | 0024 |
| Dados de teste | 0015, 0021 (organização `parceiro-teste`, `is_test` desde 0036) |

\* ainda não aplicada.

---

## 7. Pontos em aberto encontrados ao montar este mapa

Não são decisões; são lugares onde o banco não faz o que o resto da
documentação sugere. Cada um merece teste RLS vermelho antes de mexer.

1. **`opportunity_products` ficou fora da 0017.** A policy única ainda passa
   por `can_access_opportunity`, que é verdadeira para o próprio cliente — no
   portal ele poderia criar, alterar e apagar produto do próprio negócio. Não
   tem `guard_child_row`.
2. **`opportunity_products.product_id` é chave simples**, sem organização:
   produto de outra organização passa. Idem `opportunity_id` em `notes`,
   `activities` e `files` (nota pode apontar para negócio de outra pessoa).
3. **`products` ficou fora da 0018**: qualquer colaborador cria e apaga
   produto do catálogo, ao contrário de etiquetas, funil e vistos.
4. **Organização atribuída lê, mas não escreve, o histórico.** Ela edita o
   contato (`people_update_staff`), lê notas, atividades, arquivos e negócios,
   mas não grava nenhum deles (a escrita exige ser da organização dona, e a
   chave composta obriga a linha a ter a organização da pessoa). Processos,
   cobranças e fichas ela nem enxerga.
5. **Leitura ampla da raiz continua**: qualquer `staff` da Duli lê todas as
   organizações e todas as associações (0036 deixou para o achado I15).
6. ~~Spec §12.3 e §12.4 afirmavam mais do que o banco garante~~ — corrigido
   na spec em 16/nov.
