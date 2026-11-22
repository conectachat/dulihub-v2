# Banco de dados — onde mora cada coisa e quem mexe nela

Mapa do banco do DuliHub 2 para consulta rápida: que tabela guarda o quê, de
onde vem a organização de cada linha, quem lê, quem grava e que regra o banco
impõe sozinho. Serve ao Renato e às próximas sessões de IA, para ninguém
precisar ler 38 migrations para responder "onde está X e quem pode tocar".

**Quem manda são as migrations** (`supabase/migrations/`). Este documento é um
resumo delas; se divergir, a migration vence e este arquivo está errado.
**Toda migration atualiza este arquivo no mesmo commit.**

Situação: 0001 a 0060 aplicadas (a 0039 depois da 0042, quando a conta
`teste-staff` passou a existir). Colunas atuais:
`src/lib/supabase/database.types.ts` (gerado, não se edita à mão).

---

## 1. Regras que valem para toda tabela

| Regra | Como funciona |
|---|---|
| **`organization_id` em toda linha** | Herdado do registro-pai (nota herda da pessoa, pasta herda do processo, exigência herda do tipo de visto), nunca da associação de quem clicou. As três que não tinham (`pipeline_stages`, `visa_stages`, `opportunity_products` — esta apagada na 0054) ganharam na 0027. Exceções: `profiles` (é o usuário) e `organizations` (é a própria). |
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
| `equipe_alcanca_pessoa(pessoa)` | `can_access_person` **sem** o ramo do cliente: membro da organização dona ou da atribuída. Lê notas e atividades (POR-2). | 0046 |
| `can_access_opportunity(negócio)` | `can_access_person` da pessoa dona do negócio. | 0013 |
| `campos_da_ficha()` | Lista fechada dos 20 campos de `people` que a ficha de cadastro pode gravar. | 0035 |

Auxiliares de formato do contato (0040). Não são de RLS: são `immutable`,
**sem** `security definer`, e executáveis por `authenticated` e `service_role`
(0043) porque o índice de `people` e as funções `invoker` as avaliam com o
papel de quem grava — revogar derruba todo `insert` em `people` daquele papel.
`anon` fica sem: a ficha pública grava por `security definer`. A mesma regra está em
`src/lib/contato.ts`, e `src/lib/contato.casos.ts` prova as duas.

| Função | O que faz |
|---|---|
| `espaco()` | O conjunto ESPACO: espaço, tab, `\n`, `\r`, `\f`, `\v`, NBSP e BOM. Nunca `\s`, que muda com o locale. |
| `aparar(t)` | Tira ESPACO das pontas; vazio vira nulo. |
| `normalizar_ddi(ddi)` | "55" e "+55" → "+55"; fora do formato, devolve aparado. |
| `telefone_nacional(ddi, número)` | Os dígitos do número, sem o DDI da frente quando ele veio junto (mais de 11 dígitos e começando por ele; com DDI 1, também 11 dígitos começando por 1 — 0042). Sem DDI, o país é o Brasil: "5531…" vira "31…" (0043). Ainda não cobre o país cujo DDI mais o número somam 11 dígitos ou menos (+7, +33, +34…) colado com o código. É por ele que dois telefones se comparam. |
| `contato_valido(e-mail, ddi, telefone)` | A primeira regra que falha (e-mail → DDI → telefone), com a mensagem exata da tela; nulo se está tudo certo. |
| `dia_em_sao_paulo(momento)` | O dia de São Paulo em "DD/MM/AAAA" (0056): o histórico escrito pelo banco não escorrega de dia (o fuso da sessão é UTC). `authenticated` executa. |
| `forma_do_ganho(negocio) → jsonb` | O que a forma do negócio faz no Ganho (0059), a mesma leitura para o resumo e para a gravação de `ganhar_negocio`: `{forma, cobrancas}`. A situação é `cobrancas_criadas` (com `charges_created_at`), `sem_forma` (sem linha) ou o `status`; quem e quando confirmou vêm da **última** resposta; as partes levam o id e as parcelas; as cobranças (uma por parte, título "‹rótulo› — ‹vistos›" com os vistos por `position, created_at`) só com a forma `confirmada`. Sob a RLS de quem chama; `authenticated` executa. |
| `erro_da_forma(forma jsonb) → text` | A conferência da forma de pagamento (0058), a mesma de `erroDaParte` (`forma-regras.ts`) e na mesma ordem: formato (`jsonb_typeof`, sem erro cru de conversão) → 10 partes → rótulo → total (`> 0`, limite, 2 casas) → número de parcelas (cartão 1; os outros 1–36) → lista (tamanho e numeração 1..N) → cada parcela (valor, 2 casas, `AAAA-MM-DD` válido) → soma. Devolve a primeira frase, ou nulo. A da soma não leva os valores (P11 do plano). Usada por `salvar_forma_de_pagamento`; `authenticated` executa. |
| `pessoas_da_busca(busca) → setof people` | A regra de busca de pessoa (0057, saída de `buscar_clientes` da 0050), sob a RLS de quem chama: nome ou e-mail por `ilike` com `\`, `%` e `_` escapados; sem letra nem "@", os dígitos contra o DDI (vazio vale 55) mais o telefone nacional, só para quem tem número. Chamada **uma vez** por consulta, com o termo calculado uma vez — a 0055 a tinha como predicado por linha (`casa_com_a_busca`), que o Postgres não embute: 70 ms contra 0,28 ms com 82 pessoas. Usada por `buscar_clientes` e `buscar_contatos_para_cliente`; `authenticated` executa. |

Funções de gatilho (ninguém chama direto): `set_updated_at`, `handle_new_user`
(cria `profiles` quando nasce usuário), `people_guard_self_update`,
`people_organizacao_fixa`, `organizations_campos_fixos`,
`organization_members_guarda`, `guard_child_row`, `prevent_tree_cycle`,
`protect_terminal_stages`, `protect_system_statuses`, `seed_organization` /
`seed_new_organization`, `processo_do_mesmo_contato`,
`pasta_so_resolve_aprovada`, `arquivo_pendente_reabre_pasta`, `marcar_lapide`,
`negocio_nasce_aberto` (0038), `opportunities_dono_protegido` (0044),
`people_trava_do_estagio` e `quem_tem_processo_e_cliente` (0045),
`sem_anexo_para_apagar` e `installment_files_caminho` (0048),
`opportunity_items_trava_do_ganho`, `projects_item_do_negocio`,
`projects_item_imutavel` e `projects_nunca_apagado` (0051),
`opportunities_ganho_so_pela_funcao`, `opportunities_ganho_nao_se_apaga` e
`people_trava_do_estagio_no_insert` (0054), `opportunities_data_do_ganho`
(0056), `payment_plans_so_pelas_funcoes`, `payment_plans_nao_se_apaga`,
`forma_so_pelas_funcoes` (partes e parcelas), `payment_plan_responses_na_entrada`,
`payment_plan_responses_nao_mudam` e `receivables_parte_so_pelo_ganho` (0058; estas
não abrem sem usuário: só com a marca `via_forma` ou na cascata — em
`payment_plans_so_pelas_funcoes`, a cascata só anula `created_by`, para o usuário
excluído não ser recusado, 0060). O que cada uma recusa está na
linha da tabela, em §2. Agendada:
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
| `organizations` | A Duli (raiz) e cada parceiro, com marca e dados fiscais. `is_test` marca a organização dos testes. | É a própria. | Membros dela; **qualquer membro da Duli** lê todas. | Criar: dono da raiz. Alterar: gestão dela ou dono da raiz. Apagar: ninguém (sem policy). | Uma raiz só (índice). Ao nascer, gatilho semeia funil padrão (Novo Lead / Ganho / Perdido) e os três status de etapa (0019). `type` e `is_test` não mudam pela API (0036); nascer já `is_test` pela API é recusado (0037). |
| `profiles` | Espelho de `auth.users`: nome, e-mail, foto, telefone. | Usuário (`id` = `auth.users.id`). | O próprio e colegas de alguma organização em comum. | Criar: gatilho `handle_new_user`. Alterar: só o próprio. Apagar: ninguém pela API (cascade de `auth.users`). | Não vai ao espelho offline (`AGENTS.md`). |
| `organization_members` | Quem trabalha em qual organização, e com que papel. Cliente não entra aqui. | `organization_id`. | Membros da mesma organização; qualquer membro da Duli lê todas. | Gestão da organização ou dono da raiz. | Gatilho `organization_members_guarda` (0036): ninguém altera nem remove a própria linha, nem se associa sozinho (exceto dono da raiz); linha não muda de pessoa nem de organização; só dono (daquela organização ou da raiz) cria, altera ou remove um `owner`. Único `(organization_id, user_id)`. |

### 2.2 Contatos

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `people` | Cadastro único da pessoa: contato, lead e cliente são a mesma linha com `lifecycle_stage`. Dados da ficha, endereço, documentos. `deleted_at` = lixeira. | `organization_id` próprio (quem trouxe a pessoa); `assigned_organization_id` = organização atribuída. | Membros; atribuída; cliente. | Criar: membros. Alterar: membros e atribuída; o cliente altera o próprio, com colunas travadas. Apagar de vez: só gestão **e** só em organização `is_test` (0036). | `people_guard_self_update`: no portal, o cliente não muda organização, atribuída, estágio, `user_id`, CPF, RG, órgão, `created_by`, `deleted_at`, `owner_id` (0044), `client_since` (0045). **Estágio** (0045): `people_trava_do_estagio` (roda depois do `guard`, por ordem alfabética: o portal continua com a mudança desfeita em silêncio) recusa sempre — com ou sem usuário, em qualquer profundidade — tirar alguém de `client` ("Cliente não volta a ser lead.", P0001); é a única trava absoluta, e corrigir um engano é desligar o gatilho à mão. **Cliente desde** (`client_since`, 0045): ao passar a `client` por update, se ainda nulo, vira hoje em São Paulo; o insert não preenche; quem já é cliente não perde a data. A 0045 converteu quem tinha processo ou cobrança (2) e deu data do primeiro processo/cobrança e o `owner` mais antigo da organização a todos os clientes. **Quem torna cliente** (0054): passar a `client` — no update (`people_trava_do_estagio`) ou no insert já como cliente (`people_trava_do_estagio_no_insert`) — só com a marca `dulihub.via_ganho` (`ganhar_negocio`, `marcar_como_cliente`) ou pela gestão; o resto recebe "Só a gestão torna alguém cliente; use o Ganho." (P0001). Sem usuário passa (migrations e SQL Editor); não há liberação por profundidade. A importação (`migration/import-people.mjs`) entra com login, então roda com uma conta da **gestão**: o upsert dispara a regra no insert também para quem já é cliente. **Dono** (`owner_id`, 0044): FK composta `(organization_id, owner_id)` → `organization_members (organization_id, user_id)`, `on delete set null (owner_id)` — só membro da organização da pessoa é dono (consultor de organização atribuída nunca é), e o membro que sai deixa o dono nulo (conferido no catálogo: `confdeltype = 'n'`, `confdelsetcols = {owner_id}`). `marcar_como_cliente` e o Novo cliente põem quem marca como dono, se não houver (0055). `people_organizacao_fixa`: `organization_id` nunca muda; `assigned_organization_id` só muda por gestão da dona ou dono da raiz (0036); a mesma regra vale ao **criar** já atribuído (0037). Um login por pessoa; `legacy_id` único por organização. E-mail, DDI e telefone são obrigatórios na tela e em `salvar_cadastro`, não `not null` na coluna (0040): contato antigo sem eles continua existindo e só os cobra ao ser editado. DDI gravado sempre como "+NN" (0040 corrigiu 76 linhas). Índices `people_email_normalizado` e `people_telefone_nacional` servem a `contatos_parecidos`; mudar `aparar` ou `telefone_nacional` exige `reindex` deles. |
| `tags` | Etiquetas da organização. | `organization_id` próprio. | Membros. | Gestão (0018). | Nome único por organização, sem diferenciar maiúscula. |
| `person_tags` | Etiqueta aplicada a uma pessoa. | Da pessoa; chave composta amarra pessoa **e** tag à mesma organização. | Quem alcança a pessoa (`can_access_person`: membros, atribuída, cliente). | Membros. | Chave é o par `(person_id, tag_id)`, sem `id`: **sem lápide** (0029b) — o espelho relê inteira. `guard_child_row` congela vínculo se quem edita não é da organização. |
| `person_participants` | Quem acompanha o cliente, além do dono (CLI-10). | Da pessoa; FK composta com `people` (cascade) e com `organization_members` (cascade: membro que sai deixa de participar). | Membros (não a atribuída). | Membros. | Único `(person_id, user_id)`. Lápide e `updated_at`. Fora do manifesto (0044). |
| `person_dependents` | Cônjuge e filhos do contratante, para os formulários americanos. | Da pessoa. | Quem alcança a pessoa. | Membros (na prática, via `salvar_cadastro`). | `relationship` ∈ spouse/child/other; nome e país obrigatórios; no máximo 10 por ficha (regra da função). Fora do manifesto por ora. |
| `registration_forms` | Link da ficha de cadastro (token) e a resposta do lead: `answers`, `previous` (o que havia antes), texto do consentimento, conferência. | Da pessoa. | Membros. Anônimo: só pelas funções da ficha. | Membros; o envio do lead grava via `enviar_ficha_de_cadastro`. | Token ≥ 40 caracteres, único. Um link em aberto por pessoa (vencido conta como aberto). Enviada exige resposta; conferida exige enviada. Fora do manifesto por ora. |
| `notes` | Notas sobre a pessoa (opcionalmente ligadas a um negócio). | Da pessoa. | A equipe: membros e atribuída (`equipe_alcanca_pessoa`, 0046). O cliente do portal **não** lê. | Membros da organização dona (0017). | `guard_child_row` congela `organization_id`, `person_id`, `opportunity_id`, `created_by` para quem não é membro. |
| `activities` | Histórico (ligação, mudança de etapa, ficha recebida…). `type` é texto livre. | Da pessoa. | A equipe: membros e atribuída (0046). O cliente do portal **não** lê. | Membros. | Mesmo `guard_child_row`. A ficha enviada grava aqui `registration_submitted`. Virar cliente grava `virou_cliente` (0045: "Virou cliente (processo ‹título›)", "Virou cliente (cobrança ‹título›)", "Marcado como cliente"); a tela trata como registro do sistema, sem apagar. |
| `files` | Documentos do cliente (CLI-8): passaporte, identidade, comprovante, contrato — os papéis da pessoa, fora do processo. | Da pessoa; negócio da mesma organização (FK composta, `on delete set null (opportunity_id)`, 0047). | Quem alcança a pessoa (`can_access_person`) — **limitação conhecida (D13):** a atribuída e o cliente do portal veem a lista, mas não abrem nem enviam (o depósito decide pela organização dona). | Membros. | Único `(bucket, path)`. `guard_child_row`. `category` ∈ identidade/passaporte/comprovante_residencia/contrato/outro (padrão `outro`). `check` de caminho (0047, a tabela inteira): `bucket = 'pessoas'` e `path` = `{org}/{pessoa}/{id da linha}/{nome}`, sem pasta a mais. Fora do manifesto. |

### 2.3 CRM

| Tabela | Para que serve | Pai / organização vem de | Quem lê | Quem grava | Regras especiais |
|---|---|---|---|---|---|
| `pipelines` | Funis de venda. | `organization_id` próprio. | Membros. | Gestão (0018). | Um funil padrão por organização. Semeado ao criar a organização. |
| `pipeline_stages` | Colunas do funil. | Do funil (coluna desde 0027). | Membros. | Gestão. | Uma etapa de ganho e uma de perda por funil, nunca as duas na mesma; ganho/perda **não se apagam**, só se renomeiam (0005). `probability` 0–100. |
| `opportunities` | Negócio de uma pessoa (a pessoa pode ter vários). Etapa e status open/won/lost; o valor são os vistos (`opportunity_items`, 0051). `value` e `currency` saíram na 0054; o que havia ficou em `private.backup_opportunities_value`. | Da pessoa; funil da mesma organização; etapa do mesmo funil. | Quem alcança a pessoa — inclui cliente e atribuída. | Membros (0017). | Encerrado ⇔ tem `closed_at`. `guard_child_row`. Nasce sempre aberto e em etapa não terminal (0038); perder é mover. **Ganho só pelas funções** (0054): ganhar e reabrir um ganho são `ganhar_negocio`/`reabrir_negocio` (0052), e `opportunities_ganho_so_pela_funcao` recusa mudar o `status` para ou de `won`, ou o `stage_id` para ou de etapa de ganho, sem a marca `dulihub.via_ganho` ("Use o Ganho ou o Reabrir do negócio.", P0001) — também para a gestão; título e origem do ganho continuam editáveis; a cascata passa. **Data do ganho** (0056, CRM-17): de negócio que continua ganho, `closed_at` só muda por `ajustar_data_do_ganho`; `opportunities_data_do_ganho` (`before update of closed_at`) recusa o `update` direto, até da gestão ("Use o Ajustar data."), e deixa passar a marca `via_ganho` e a cascata. Quem tenta sair do ganho continua recebendo a frase da 0054. **Ganho não se apaga** (`opportunities_ganho_nao_se_apaga`, 0054): "Reabra ou encerre os processos; o negócio ganho fica como registro." (P0001); a cascata da pessoa passa. **Nem o que tem confirmação da forma de pagamento** (0058): com alguma linha em `payment_plan_responses`, mesmo depois de Refazer, "A forma de pagamento já foi confirmada; o negócio fica como registro." — a cascata do negócio apagaria a prova; o ganho vence quando valem as duas. **Dono** (`owner_id`): FK composta `(organization_id, owner_id)` → `organization_members (organization_id, user_id)`, `on delete set null (owner_id)` (0054; antes ia a `profiles`, e quem saía da organização continuava dono; conferido no catálogo: `confdeltype = 'n'`, `confdelsetcols = {owner_id}`). `opportunities_dono_protegido` (0044): trocar `owner_id` só o dono atual ou a gestão ("Só o dono do negócio ou a gestão trocam o dono.", P0001); repetir o mesmo valor passa; sem usuário e em cascata, passa. |
| `opportunity_participants` | Quem acompanha o negócio, além do dono (CLI-10). A tela é o Editar negócio, e o Ganho os passa à pessoa (entrega 3). | Do negócio; FK composta com `opportunities` (cascade) e com `organization_members` (cascade). | Membros. | Membros. | Único `(opportunity_id, user_id)`. Lápide e `updated_at`. Fora do manifesto (0044). |
| `opportunity_items` | Os vistos do negócio (CRM-13): nome do visto, valor e moeda **do momento da negociação**. Mudar o preço nas Configurações não mexe em item. | Do negócio (FK composta, cascade); visto da mesma organização (`on delete set null (visa_type_id)` — o item guarda o nome). | Quem vê o negócio (`exists` em `opportunities`). | Membros. | `amount >= 0`; `currency` ∈ BRL/USD; únicos `(id, organization_id)` e `(id, opportunity_id)`. `guard_child_row`, lápide e `updated_at`. **Trava do Ganho** (`opportunity_items_trava_do_ganho`, definer): item de negócio ganho não é inserido, alterado nem apagado ("Negócio ganho: os vistos não mudam…"), e item não muda de negócio ("O visto não muda de negócio."); item que já tem processo não se apaga, nem com o negócio reaberto ("Este visto já tem processo: para desistir, encerre o processo.", 0054); com a forma de pagamento `confirmada` e sem cobranças criadas, nada se insere, altera nem apaga ("A forma de pagamento está confirmada. Use Refazer para mudar os vistos.", 0058, FIC-12) — a trava lê o negócio e depois a forma com `for share`; só a cascata e a ação da chave passam. Fora do espelho e do manifesto (0051). |
| `payment_plans` | A forma de pagamento do negócio (FIC-7), uma por negócio (único `opportunity_id`). `status` ∈ rascunho/enviada/confirmada/recusada (na 4a só rascunho e confirmada se alcançam); `reference_rate` (`> 0`) e `reference_rate_note` (até 200), a cotação do C6 (FIC-11); `charges_created_at`, quando o Ganho criou as cobranças. | Do negócio (FK composta, cascade). | Membros da organização (`current_user_organizations`) — o cliente do portal não. | Só pelas funções da forma, com a marca `dulihub.via_forma`; membros mudam direto só a cotação. | `payment_plans_so_pelas_funcoes`: sem a marca, recusa o insert e qualquer mudança fora da cotação e do `updated_at` ("Mude a forma de pagamento pela tela do negócio.") — inclusive `status` e `charges_created_at`. Dentro de gatilho passa só o `update` que anula `created_by` e nada mais — a ação da chave estrangeira quando o usuário é excluído (0060). **Não se apaga**: sem policy de delete (0 linhas pela API) e `payment_plans_nao_se_apaga` recusa o delete direto; a cascata do negócio e da pessoa passa. Lápide e `updated_at`. Fora do espelho e do manifesto (0058). |
| `payment_plan_parts` | As partes da forma: rótulo (1–80), método (o de `installments`), moeda (BRL/USD), total (`numeric(12,2)`, `> 0`), número de parcelas, posição. | Da forma (FK composta, cascade). | Quem lê a forma (`exists` em `payment_plans`). | Só pelas funções (`forma_so_pelas_funcoes`: marca ou cascata), inclusive o delete. | Cartão tem 1 parcela; os outros métodos, de 1 a 36 (`check`). Único `(plan_id, position)`: salvar mantém o id da parte pela posição. Lápide e `updated_at` (0058). |
| `payment_plan_installments` | As parcelas de cada parte: número, valor (`> 0`), vencimento (`date`). | Da parte (FK composta, cascade). | Quem lê a parte (que passa pela forma). | Só pelas funções, como as partes. | Único `(part_id, number)`. Salvar troca as parcelas da parte inteiras. Lápide e `updated_at` (0058). |
| `payment_plan_responses` | A prova da confirmação: `decision` (na 4a, só `confirmada_pela_equipe`), observação (`reason`, até 500), a cópia (`snapshot`: vistos, partes e parcelas, **sem** a cotação), quando, quem (`answered_by`, `on delete set null`) e o nome dele na hora (`answered_by_name`). `registration_form_id` é da resposta do cliente (4b). | Da forma (FK composta, cascade). | Quem lê a forma. | Só por `confirmar_forma_de_pagamento_pela_equipe` (insert com a marca). | `payment_plan_responses_na_entrada`: sem a marca recusa; com ela exige a forma em rascunho e força a decisão da equipe, `answered_by = auth.uid()`, o nome (de `profiles`, ou o e-mail), `registration_form_id` nulo e `answered_at = now()`. **Não muda nem se apaga**: sem policy de update e delete, e `payment_plan_responses_nao_mudam` recusa; só a cascata e o `set null` de `answered_by` passam. `check`: decisão da equipe sem ficha, a do cliente com. Lápide e `updated_at` (0058). |

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
| `projects` | O processo: título, status, datas, recibo USCIS, priority date, RFE (recebida, prazo, respondida), decisão. | Da pessoa; visto e negócio da mesma organização. | Membros. | Membros, sem delete (0051). | `status` ∈ active/filed/approved/denied/closed. O negócio tem de ser **do mesmo contato** (gatilho + FK, 0022). RFE respondida não antes de recebida (0034). Apagar visto ou negócio só zera a origem. Nasce por `criar_processo`. **Nunca se apaga** (0051, PRO-12): a policy não tem delete (pela API apaga 0 linhas) e `projects_nunca_apagado` recusa o delete direto ("Processo não se apaga: encerre-o."); só a cascata da pessoa passa. Desistência = `closed`. `opportunity_item_id` (0051): o visto do negócio de onde nasceu, único quando preenchido; duas FKs, `(item, organização)` e `(item, negócio)`, ambas `set null (opportunity_item_id)`; não muda depois de gravado (`projects_item_imutavel`, sem usuário e em cascata passa); item exige negócio (`projects_item_do_negocio`, insert e update de `opportunity_id`). **Quem tem processo é cliente** (0045, `projects_quem_tem_processo_e_cliente`, `before insert or update of person_id`, invoker): para quem ainda não é cliente, a gestão promove (com `virou_cliente`), sem usuário ou sob a marca `via_ganho` promove sem histórico (o Ganho grava o seu; 0054), e o resto recebe "Só a gestão torna alguém cliente; use o Ganho." (P0001). Roda depois de `projects_processo_do_mesmo_contato`. |
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
| `receivables` | Cobrança: título, valor, valor de tabela (desconto = diferença), moeda, notas. | Da pessoa; processo de origem da mesma organização (anulável). | Membros. | Membros. | Moeda só BRL ou USD, e as parcelas herdam. Valores ≥ 0; valor de tabela ≥ valor. Apagar o processo não apaga a cobrança. Nenhum saldo guardado. **Quem tem cobrança é cliente**: a mesma regra dos processos (0045, `receivables_quem_tem_processo_e_cliente`), também pela fila — a recusa vira conflito. Apagar **direto** cobrança com anexo em alguma parcela é recusado ("Remova os anexos antes.", P0001, 0048); a cascata vinda da pessoa passa. `payment_plan_part_id` (0058): a parte da forma que gerou a cobrança no Ganho; única quando preenchida, FK composta `on delete set null (payment_plan_part_id)`; **só o Ganho grava** (`receivables_parte_so_pelo_ganho`: preencher no insert ou mudar no update sem a marca `via_forma` → "A cobrança da forma de pagamento só nasce no Ganho."; a ação da chave passa). |
| `installments` | Parcelas: número, valor, vencimento, data de pagamento, cotação do dia, forma. | Da cobrança. | Membros. | Membros. | Número único por cobrança. Cotação só com data de pagamento. Forma ∈ pix/boleto/cartao/transferencia/cripto. Sem coluna de status: paga/vencida/pendente saem de `paid_on` e `due_on`. Apagar **direto** parcela com anexo é recusado ("Remova os anexos antes.", 0048); a cascata da cobrança ou da pessoa passa (`pg_trigger_depth() > 1`). |
| `installment_files` | Anexo da parcela: boleto, nota fiscal, comprovante (CLI-6). | Da parcela (FK composta, cascade). | Membros. | Membros. | `kind` ∈ boleto/nota_fiscal/comprovante/outro. `storage_path` único, conferido pelo gatilho `installment_files_caminho` contra a parcela real: `{org}/{pessoa}/{cobrança}/{parcela}/{id da linha}/{nome}` (senão `23514`). Lápide e `updated_at`. Fora do manifesto: anexo só com internet (0048). |

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
| `salvar_cadastro(pessoa, dados, completo)` | Grava os campos da ficha (lista fechada, aparados por `private.aparar`), valida CPF (11 dígitos), datas, sexo e estado civil; normaliza o DDI; quando a ficha traz e-mail, DDI ou telefone — ou é completa —, o contato final passa por `private.contato_valido` (0040): a equipe não apaga o e-mail pela ficha. Se vier `dependents`, substitui a lista (máx. 10). Devolve o que gravou, normalizado. | `authenticated` | invoker |
| `criar_oportunidade(etapa, título, confirmar_parecido, confirmar_outra, contato?, novo_contato?, origem?)` | Cria o negócio com contato existente **ou** novo, numa transação (0041; sem valor nem moeda desde a 0054 — o valor são os vistos). Confere antes de gravar: um contato só; a etapa visível, de uma organização sua (senão `42501`) e aberta; título; contato existente da organização da etapa e fora da lixeira; contato novo com nome e `contato_valido`. Contato parecido ou oportunidade anterior do contato, sem confirmação, **não é erro**: devolve `{"situacao":"precisa_confirmar"}` com a lista. Criado: o contato novo nasce na organização da etapa, o negócio com dono e autor = quem chama, e a pessoa vira `opportunity` (cliente não regride). | `authenticated` | invoker |
| `contatos_parecidos(e-mail, ddi, telefone, ignorar?)` | Quem tem o mesmo e-mail (aparado, sem maiúscula) ou o mesmo telefone nacional, com `na_lixeira`, `bate_email` e `bate_telefone`. Entrada vazia nunca bate; `ignorar` tira o próprio contato; no máximo 10, por nome (0040). Sob a RLS de quem chama: só aparece quem ele já enxerga — da organização dele ou atribuído a ela; contato de organização alheia, nunca. | `authenticated` | invoker |
| `criar_processo(pessoa, visto, título, negócio?, item?)` | Cria o processo e copia do visto as etapas (com o status padrão) e as pastas exigidas, ligando cada pasta ao "pai visível" e calculando o prazo. Para quem não é cliente, só a gestão (0045). `item` liga ao visto do negócio e exige `negócio` (0051). | `authenticated` | invoker |
| `ganhar_negocio(negócio, cobranças_sem_confirmação?, simular?) → jsonb` | O Ganho numa transação (0052, CRM-14): trava o negócio (`for update`), confere o CRM-10 (dono do negócio ou gestão), lixeira, item, item sem processo e sem visto (D17) e a etapa de ganho; liga a marca `dulihub.via_ganho`; move para o ganho; histórico ("Oportunidade ganha — virou cliente" ou "Oportunidade ganha"); pessoa vira cliente (dono só para quem vira agora e não tem, D9) e herda os participantes do negócio; um `criar_processo` por item sem processo; **as cobranças da forma confirmada** (0059, REC-6): trava a forma `for update` depois do negócio, lê `private.forma_do_ganho` e, com a situação `confirmada`, liga `via_forma` e cria uma cobrança por parte — organização e pessoa do negócio, sem processo, título "‹rótulo› — ‹vistos›", `payment_plan_part_id` — com as parcelas da forma e o método da parte, andando sobre o mesmo jsonb que o resumo mostra; grava `charges_created_at`, e a forma não gera de novo. Devolve `{negocio, pessoa{id,nome,vira_cliente}, itens, processos[{item,titulo,id}], forma{situacao,confirmada_em,confirmada_por,cobrancas_criadas_em,partes}, cobrancas[{id,parte,titulo,moeda,total,parcelas}], avisos}`. Com `simular`, o mesmo formato sem gravar (o resumo da tela), com o `id` da cobrança nulo. Negócio sem dono avisa "O negócio está sem dono: você fica como dono do cliente." (0054). `cobranças_sem_confirmação` continua sem efeito (4b). | `authenticated` | invoker |
| `reabrir_negocio(negócio)` | Reabre um negócio **ganho** na primeira etapa aberta (0052, CRM-15), com a marca e o histórico "Negócio reaberto — voltou para ‹etapa›". CRM-10. Não toca em pessoa, processo nem cobrança. Perdido reabre pela tela. | `authenticated` | invoker |
| `ajustar_data_do_ganho(negócio, dia) → uuid` | Ajusta a data de um negócio ganho (0056, CRM-17), numa transação: trava o negócio; recusa nesta ordem quem não o enxerga ("Negócio não encontrado."), quem não é da gestão da organização dele ("Só a gestão ajusta a data do ganho."), negócio não ganho ("Só o negócio ganho tem a data ajustada."), dia vazio ("Informe a data."), futuro e antes de 01/01/2000 (dias de São Paulo). O mesmo dia já gravado não grava nada. Senão grava o início do dia em São Paulo, sob a marca, e a atividade `stage_change` "Data do ganho ajustada de DD/MM/AAAA para DD/MM/AAAA". Devolve o `person_id`, para a tela revalidar a pessoa. O "cliente desde" não muda. | `authenticated` | invoker |
| `buscar_encerradas(busca?, situação?, limite?, deslocamento?)` | CRM › Encerradas (0053, CRM-16): negócios `won`/`lost`, busca por título **ou** nome do contato (`%` e `_` literais), filtro `won`/`lost` (outro valor → 22023), ordem `closed_at desc`. Devolve `id, title, status, closed_at, person_id, full_name, totais` (jsonb `[{currency, amount}]`, soma dos itens por moeda) e `total` do filtro. | `authenticated` | invoker |
| `marcar_como_cliente(pessoa, desde?)` | Torna cliente à mão (0045): só a gestão da organização da pessoa; recusa quem não existe ou não se enxerga ("Contato não encontrado."), quem está na lixeira, quem já é cliente e data no futuro (todas P0001). Grava o estágio (sob a marca `via_ganho`, 0054), `client_since` (`desde`, ou hoje em São Paulo), o dono — quem marca, se a pessoa não tem (0055) — e a atividade `virou_cliente` "Marcado como cliente". Sem volta pelo app. | `authenticated` | invoker |
| `criar_cliente(organização, contato?, novo_contato?, confirmar_parecido?) → jsonb` | O Novo cliente (0055, CLI-15), numa transação. Exatamente um contato ("Escolha um contato ou preencha um novo"). **Existente:** achado sob a RLS e travado (`for update`: dois cliques, o segundo recebe "Já é cliente."); recusa nesta ordem quem não se enxerga, quem não é da gestão da organização da pessoa ("Só a gestão marca alguém como cliente."), contato de outra organização que não a passada ("Este contato é de outra organização; quem o torna cliente é a gestão de lá."), lixeira, já cliente e quem tem negócio aberto ("Este contato está no funil: use o Ganho."). **Novo:** a gestão da organização passada antes de tudo; nome, tamanho e `contato_valido` com as frases da `criar_oportunidade`; parecidos sem confirmação devolvem `{situacao: precisa_confirmar, parecidos}`, cada um com `outra_organizacao`; senão nasce `contact` na organização passada. Por fim, `marcar_como_cliente` — o mesmo caminho do botão. Devolve `{situacao: criado, pessoa}`. | `authenticated` | invoker |
| `buscar_contatos_para_cliente(organização, busca?, limite?)` | A busca do Novo cliente (0055): pessoas **da organização passada** (não as atribuídas a ela) que não são cliente, fora da lixeira e sem negócio aberto, por `pessoas_da_busca`, por nome e `id`, até 20 por padrão, com o total do filtro. Os tipos gerados dão `email`, `phone_country_code` e `phone` como não nulos; podem vir nulos. | `authenticated` | invoker |
| `salvar_forma_de_pagamento(negocio, forma jsonb) → uuid` | A forma do negócio (0058, FIC-7): cria na primeira vez (`on conflict do nothing`), confere com `erro_da_forma` e grava as partes por posição (o id da parte que continua fica) e as parcelas. A organização vem do negócio. Recusa, nesta ordem: "Negócio não encontrado."; as cobranças já criadas; negócio encerrado ("O negócio está encerrado; reabra para mexer na forma de pagamento."); forma confirmada ("A forma está confirmada. Use Refazer para mudar."). Trava o negócio `for share` e depois a forma `for update`. Qualquer membro. | `authenticated` | invoker |
| `confirmar_forma_de_pagamento_pela_equipe(negocio, observacao?)` | A confirmação da equipe (0058, FIC-10): o dono do negócio ou a gestão, com a forma em rascunho, pelo menos um visto e uma parte; monta a cópia depois de travar, grava a resposta, põe `confirmada` e registra "Forma de pagamento confirmada pela equipe" (`forma_de_pagamento`). Observação até 500. A mesma ordem de recusas do salvar, com o CRM-10 logo depois do "não encontrado". | `authenticated` | invoker |
| `voltar_forma_para_rascunho(negocio)` | O "Refazer" (0058): o dono do negócio ou a gestão; recusa depois das cobranças, com o negócio encerrado, ou sem forma confirmada ("A forma não está confirmada."); a resposta de antes fica; registra "Forma de pagamento refeita". | `authenticated` | invoker |
| `buscar_clientes(busca?, limite?, deslocamento?)` | A lista de Clientes (0049): `client` fora da lixeira, por nome e `id`, 50 por padrão, com o **total do filtro** em cada linha (`count(*) over ()`), para a tela não cortar em silêncio. Acha por parte do nome ou do e-mail (`ilike`, com `\`, `%` e `_` escapados: o digitado é texto) ou — só quando a busca não tem letra nem "@" — pelos dígitos do telefone com o DDI na frente (`telefone_nacional`; DDI vazio vale 55): "+55 (31) 99999-0000", "31 99999-0000" e "99999" acham o mesmo. Cliente sem telefone fica fora da busca por dígitos (0050: antes o DDI sozinho, "55", casava). A regra mora em `private.pessoas_da_busca` desde a 0057. Sem índice (o `%` da frente impede); para o volume de hoje basta, e se crescer o caminho é `pg_trgm`. Os tipos gerados dão `owner_id` e `client_since` como não nulos; podem vir nulos. | `authenticated` | invoker |
| `reordenar_irmaos(tabela, ids[])` | Grava a ordem final de uma lista; idempotente (serve à fila offline). Recusa se alguma linha não for alcançável. Tabelas: `pipeline_stages`, `stage_statuses`, `document_types`, `visa_stages`, `visa_type_documents`, `project_stages`, `project_documents`. | `authenticated` | invoker |
| `swap_positions(tabela, a, b)` | Troca duas linhas de posição. Mesmas sete tabelas (0026). Não é idempotente — para a fila, usar `reordenar_irmaos`. | `authenticated` | invoker |
| `compactar_pagina(página, snapshot, até, conteúdo)` | Grava o snapshot novo da página e apaga os pedaços já incluídos, ligando a marca `app.compactando` só nesta transação. | `authenticated` | invoker (era definer na 0024; virou invoker na 0025) |
| `sync_manifesto()` | Para cada uma das 22 tabelas do espelho, conta linhas e o maior `updated_at` **sob a RLS de quem chama**; linha extra `deleted_rows` com a lápide mais antiga (nula se não há nenhuma, 0032). Lista atual: 0054 (sem `products` e `opportunity_products`). | `authenticated` | invoker |
| `set_default_stage_status(id)` | Troca o status de etapa padrão da organização em um passo (0010). | `authenticated` | invoker |

As duas da ficha são as **únicas** `security definer` em `public` e as únicas
executáveis por `anon` — exceção deliberada (`AGENTS.md`, "Uma porta para quem
não tem login"). O aviso do Supabase para qualquer outra é defeito.

---

## 4. Arquivos (Storage)

Os depósitos são privados: nada abre por link público. Em todos, **a
primeira pasta do caminho é a organização**, e é ela que a policy confere.

| Depósito | Guarda | Caminho | Quem lê | Quem grava / apaga | Limite |
|---|---|---|---|---|---|
| `documentos` | Arquivos que o cliente envia para as pastas do processo (`document_files`). | `{organização}/{processo}/{pasta}/{arquivo}` — a mesma regra está como `check` em `document_files.storage_path`. | Membros da organização da primeira pasta; a tela usa URL assinada de curta duração. | Membros: enviar, alterar e apagar. | 20 MB; PDF, JPEG, PNG, WEBP, HEIC, DOC/DOCX, XLS/XLSX. |
| `financeiro` | Anexos da parcela (`installment_files`, 0048). | `{organização}/{pessoa}/{cobrança}/{parcela}/{arquivo}/{nome}` — conferido pelo gatilho de `installment_files`. | Membros da organização da primeira pasta; URL assinada de curta duração. | Membros: enviar, alterar e apagar. | 20 MB; os tipos de `documentos`. |
| `pessoas` | Documentos do cliente (`files`, 0047). | `{organização}/{pessoa}/{arquivo}/{nome}` — conferido pelo `check` de `files`. A pessoa vem em segundo para a anonimização apagar a pasta de uma vez. | Membros da organização da primeira pasta; URL assinada de curta duração. | Membros: enviar, alterar e apagar. | 20 MB; os tipos de `documentos`. |
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
| `organizations` | 0001, 0002 (Duli), 0003, 0015 (organização de teste), 0019 (semente), 0036, 0037 |
| `profiles` | 0001, 0003, 0013 (`handle_new_user`) |
| `organization_members` | 0001, 0002, 0003, 0028, 0029, 0036, 0039 (staff de teste) |
| `people` | 0001, 0003, 0006, 0007, 0013, 0016, 0029, 0036, 0037, 0040 (DDI corrigido, índices), 0044 (`owner_id`), 0045 (`client_since`, trava do estágio, conversão), 0054 (quem torna cliente, no update e no insert) |
| `person_participants`, `opportunity_participants` | 0044 |
| `opportunity_items` | 0051, 0054 (item com processo não se apaga), 0058 (trava com a forma confirmada) |
| `payment_plans`, `payment_plan_parts`, `payment_plan_installments`, `payment_plan_responses` | 0058 |
| `tags` | 0004, 0016, 0018, 0028, 0029 |
| `person_tags` | 0004, 0016, 0017, 0028, 0029b |
| `person_dependents`, `registration_forms` | 0035 |
| `notes` | 0004, 0016, 0017, 0029, 0046 (só a equipe lê) |
| `activities`, `files` | 0004, 0016, 0017, 0028, 0029; `activities` 0046 (só a equipe lê); `files` 0047 (categoria, caminho, negócio composto) |
| `pipelines` | 0004, 0005, 0016, 0018, 0019, 0029 |
| `pipeline_stages` | 0004, 0005, 0009, 0016, 0018, 0019, 0027, 0028, 0029 |
| `opportunities` | 0004, 0016, 0017, 0020, 0022, 0029, 0038, 0044 (trava do dono), 0054 (ganho só pelas funções, ganho não se apaga, dono na equipe, sem `value`/`currency`), 0056 (data do ganho só pelo ajuste) |
| `products`, `opportunity_products` | 0004, 0027, 0028, 0029; apagadas na 0054 |
| `document_types` | 0008, 0011, 0016, 0018, 0029 |
| `visa_types` | 0008, 0016, 0018, 0029 |
| `visa_stages` | 0008, 0016, 0018, 0027, 0029 |
| `visa_type_documents` | 0008, 0012, 0016, 0018, 0028, 0029 |
| `stage_statuses` | 0008, 0009, 0010, 0018, 0019, 0020, 0029 |
| `projects` | 0020, 0022, 0029, 0034, 0045 (quem tem processo é cliente), 0051 (não se apaga; item do negócio), 0054 (ramo da marca) |
| `project_stages` | 0020, 0023, 0029 |
| `project_documents` | 0020, 0026, 0029 |
| `document_files` | 0020, 0026, 0028, 0029 |
| `project_pages` | 0024, 0028, 0029 |
| `project_page_updates` | 0024, 0025 |
| `receivables`, `installments` | 0033, 0045 (quem tem cobrança é cliente), 0048 (sem anexo para apagar direto), 0058 (`payment_plan_part_id`, só pelo Ganho) |
| `installment_files` | 0048 |
| `deleted_rows` | 0029, 0031 (limpeza), 0032 e 0033 (manifesto) |
| Auxiliares de RLS | 0001 → 0003 (para `private`) → 0013 (versão atual); `current_user_is_root_owner` na 0036 |
| Auxiliares de formato do contato | 0040; `telefone_nacional` 0042 (número americano com o 1 na frente) e 0043 (sem DDI, o 55 colado sai); `service_role` executa desde a 0043 |
| RPCs | `swap_positions` 0014/0023/0026; `criar_processo` 0020/0051; `ganhar_negocio` 0052/0054/0059 e `reabrir_negocio` 0052; `buscar_encerradas` 0053; `compactar_pagina` 0024/0025; `sync_manifesto` 0030/0032/0033/0054; `reordenar_irmaos` 0030; ficha 0035 (`salvar_cadastro` refeita na 0040); `contatos_parecidos` 0040; `criar_oportunidade` 0041/0054; `marcar_como_cliente` 0045/0054/0055; `criar_cliente` 0055 e `buscar_contatos_para_cliente` 0055/0057; `ajustar_data_do_ganho` 0056; `salvar_forma_de_pagamento`, `confirmar_forma_de_pagamento_pela_equipe` e `voltar_forma_para_rascunho` 0058; `buscar_clientes` 0049/0050/0055/0057; `set_default_stage_status` 0010 |
| Storage | `documentos` 0020; `observacoes` 0024; `pessoas` 0047; `financeiro` 0048 |
| Tempo real | 0024 |
| Dados de teste | 0015, 0021 (organização `parceiro-teste`, `is_test` desde 0036), 0039 (`teste-staff`, staff da `parceiro-teste`) |

---

## 7. Pontos em aberto encontrados ao montar este mapa

Não são decisões; são lugares onde o banco não faz o que o resto da
documentação sugere. Cada um merece teste RLS vermelho antes de mexer.

1. ~~`opportunity_products` fora da 0017~~ — a tabela saiu na 0054.
2. **`opportunity_id` em `notes` e `activities` é chave simples**, sem
   organização: nota pode apontar para negócio de outra pessoa. Em `files` a
   chave virou composta na 0047 (`opportunity_products.product_id` tinha o
   mesmo defeito; a tabela saiu na 0054).
3. ~~`products` fora da 0018~~ — a tabela saiu na 0054.
4. **Organização atribuída lê, mas não escreve, o histórico.** Ela edita o
   contato (`people_update_staff`), lê notas, atividades, arquivos e negócios,
   mas não grava nenhum deles (a escrita exige ser da organização dona, e a
   chave composta obriga a linha a ter a organização da pessoa). Processos,
   cobranças e fichas ela nem enxerga.
5. **Leitura ampla da raiz continua**: qualquer `staff` da Duli lê todas as
   organizações e todas as associações (0036 deixou para o achado I15).
6. ~~Spec §12.3 e §12.4 afirmavam mais do que o banco garante~~ — corrigido
   na spec em 16/nov.
