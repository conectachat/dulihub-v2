# Contato → oportunidade → cliente — especificação técnica

| | |
|---|---|
| Data | 17/nov/2026 |
| Estado | Rodada 4 da revisão (Code Reviewer). **Ainda sem plano** |
| Quem decidiu | Renato, no brainstorming de 17/nov |
| Requisitos com ID | Em `docs/spec.md`: 7.2, 7.3, 7.4, 7.6, 7.7, 7.1 e o módulo novo 7.16 Clientes |
| Este documento | O **como**: banco, funções, telas, testes e o critério de aceite de cada entrega |

Nada aqui está construído. Cada requisito nasce ⬜.

**O que mudou da rodada 1 para a 2:**
- **Revisor:**
  - sincronia offline (C1);
  - Ganho e forma de pagamento travados no banco (C2, C3);
  - cobrança duplicada (C4);
  - estado do link (I3);
  - publicação em duas fases (I5);
  - testes (I10);
  - os menores.
- **Renato:**
  - contato com processo vira cliente (§6.2);
  - sem lista de oportunidades no perfil, com as encerradas achadas no CRM (CRM-16);
  - Notas em ordem cronológica;
  - "+ Novo processo";
  - o aviso de duplicado mostra o link do contato.

**O que mudou da rodada 2 para a 3:**
- **Travas e organização de teste:** a liberação vale só para exclusão em cascata,
  para as travas poderem ser provadas na organização de teste (I1).
- **Marcas de transação:** uma por recurso, desligadas no fim da função (I2).
- **Publicação em duas fases:** fechados os três buracos (I3).
- **Quem torna alguém cliente:** só a gestão ou o Ganho (I4).
- **Prova da forma de pagamento:** a inserção direta de resposta é recusada (I5).
- **Os menores M1–M9.**

**O que mudou da rodada 3 para a 4:**
- **Liberação das travas:** cobre também o `set null` das chaves estrangeiras.
- **Estágio "cliente":** só a gestão ou o Ganho, inclusive pelo `update` direto em
  `people`.
- **Ficha anônima de hoje:** continua fechando, com a marca `via_ficha`.
- **Testes:** usam uma pessoa descartável; o processo-sentinela saiu.
- **Os menores M1–M6.**

---

## 1. Por que existe

Hoje contato, oportunidade e cliente parecem **uma coisa só**. No banco isso é de
propósito: é uma pessoa, com um estágio (`contact → opportunity → client`, spec §6.1),
e isso não muda. O problema está na tela e no fluxo:

- não há **Clientes** no menu: o cliente fica misturado com quem nunca fechou;
- o contato entra sem telefone nem e-mail, e nada avisa quando ele já existe;
- a oportunidade não sabe **qual visto** está sendo vendido: o valor é digitado à mão;
- o Ganho é um clique que não cria nada: o processo e a cobrança são feitos depois,
  à mão, redigitando o que já foi negociado;
- a forma de pagamento combinada com o cliente não fica registrada em lugar nenhum
  antes do contrato.

**Sucesso**: o Renato abre **Clientes**, vê quem é cliente e, no perfil, tudo dele
(ficha, financeiro, processos, documentos e notas). Da primeira conversa ao Ganho,
nenhum dado é digitado duas vezes.

## 2. Objetivos, fora do escopo e o que seria fracasso

**Objetivos**

1. Contato completo desde a entrada (nome, telefone, e-mail), sem duplicar pessoa.
2. Oportunidade com um ou mais **vistos** do catálogo, cada um com seu valor.
3. Forma de pagamento definida pelo dono **antes** da ficha e confirmada pelo cliente
   no próprio formulário.
4. **Ganho com resumo**: ao confirmar, a pessoa vira cliente, nasce um processo por
   visto e as cobranças da forma de pagamento — tudo ou nada.
5. Item **Clientes** no menu, com lista e perfil próprio em abas.

**Fora do escopo** (entra depois, com desenho próprio)

| Não faz agora | Por quê |
|---|---|
| Contrato e ZapSign (spec 7.5) | Depende de Q1, Q2, Q4 e Q14. A forma de pagamento confirmada já fica pronta para ele |
| Ganho automático na assinatura | Decidido em 17/nov: a assinatura só **oferece** o Ganho; o dono confirma |
| Restringir quem vê o cliente pelo dono | Decidido em 17/nov: dono e participantes só **marcam** quem cuida |
| "Linha ascendente" (Q10) | Não existe no app. Até existir, a gestão da organização (`owner`/`admin`) faz esse papel |
| Juntar dois contatos (CON-6) | Continua P1. O aviso de duplicado só impede criar a segunda pessoa |
| Portal do cliente (7.14) | Fase 6. O desenho não pode impedir, e o que o cliente nunca vê já fica fechado aqui |
| Converter moeda | O app nunca converte. O Renato converte à mão com a cotação do C6 |

**Seria fracasso, mesmo funcionando**

- Pessoa que vira cliente pelo Ganho **sem** os processos, ou com processo repetido.
- Cobrança criada duas vezes para a mesma negociação.
- Ganho feito por quem não pode, por qualquer caminho, inclusive a API direta.
- "O cliente confirmou" registrado sem o cliente ter confirmado aquilo.
- Formulário público que devolve CPF, RG ou endereço a quem tem o link.
- Nota interna visível para o cliente.
- Processo apagado.
- A equipe inventando e-mail para conseguir salvar um contato.
- O modo offline parar de sincronizar por causa de uma migration.

## 3. Restrições que valem (do `AGENTS.md` e da spec)

- **RLS é a segurança real.**
  - Toda tabela nova nasce com RLS, `unique (id, organization_id)` e chaves
    estrangeiras compostas com a organização.
  - `on delete set null` em chave composta **sempre** leva a coluna entre parênteses,
    por exemplo `on delete set null (opportunity_item_id)`. Sem ela, o Postgres
    tentaria anular `organization_id`, que é `not null` (0020:68-70).
  - Toda tabela nova ganha `id`, lápide (com o gatilho `marcar_lapide`, que grava
    `old.id`) e `updated_at` com gatilho.
- **A organização vem do registro-pai.** Item e forma de pagamento herdam do negócio.
  Cobrança e processo herdam **da pessoa**, o que corrige o I24 neste caminho.
- **Dinheiro:** soma por moeda, nunca uma na outra; nenhum saldo guardado; contas em
  centavos.
- **Uma porta para quem não tem login: a ficha.** Este desenho a **alarga** com uma
  terceira função (§6.4), com as mesmas travas, e o `AGENTS.md` muda junto.
- **Contato nunca é apagado de vez; agora processo também não.**
- **Travas e a limpeza dos testes.**
  - Toda trava nova de "não apagar" ou "não mudar" vale **também na organização de
    teste**, para update e para delete direto. Só assim a suíte prova cada trava sem
    gravar lixo permanente na Duli.
  - A única liberação é a **ação da chave estrangeira**: a trava deixa passar
    qualquer escrita com `pg_trigger_depth() > 1`. Isso cobre o `delete` da cascata
    e também o `update` do `on delete set null (col)`. Por exemplo, apagar um tipo
    de visto nas Configurações anula `visa_type_id` no item de um negócio ganho, e
    apagar um negócio anula `payment_plan_id` no link.
  - Nenhum gatilho deste desenho escreve em tabela travada. Se um dia algum
    escrever, herda essa liberação, e isso tem de ser pensado na hora.
  - A RLS não se aplica às ações da chave estrangeira (o Postgres as executa como
    dono da tabela; `paginas.test.ts:88` já depende disso).
  - Como pessoa só se apaga na organização de teste (0036), a limpeza dos testes
    (apagar a pessoa) continua levando tudo junto.
  - Teste que hoje apaga negócio, processo ou cobrança **diretamente** passa a limpar
    apagando uma **pessoa descartável**, criada pelo próprio teste. A pessoa fixa da
    suíte ("Cliente de Teste", `fixture()`, ligada à conta do portal e à nota da
    0015) **nunca** é apagada: `processos`, `documentos`, `paginas` e a fumaça
    (`rotas.test.ts:248`) passam a criar processo numa pessoa descartável, criada e
    promovida pela conta de gestão de teste.
- **Marcas de transação.** Uma função que precisa abrir uma trava liga uma marca
  própria do recurso, com `set_config('dulihub.via_ganho', 'on', true)`, e a
  **desliga no fim**, inclusive no caminho de erro, como a 0025:51-56 faz.
  - As marcas são `dulihub.via_ganho` (negócio e pessoa no Ganho, reabrir, marcar
    cliente), `dulihub.via_forma` (forma de pagamento e respostas) e
    `dulihub.via_ficha` (colunas novas de `registration_forms`). Uma não abre a trava
    da outra.
  - Só funções com essa disciplina ligam marca. `set_config` não é chamável pelo
    PostgREST.
  - O `pg_graphql`, que executaria várias mutações numa transação só, **não está
    instalado** no projeto (conferido em 17/nov) e deve continuar assim. Se um dia
    for ligado, este desenho precisa ser revisto.
- **Coluna ou tabela que o código lê sai em duas fases (spec §12.7):** primeiro o
  código para de ler, e só depois do deploy a migration a retira.
- **Função que muda de assinatura** é apagada e recriada (`drop function` +
  `create`), nunca `create or replace`. Depois se refaz o `revoke`/`grant`: no
  Supabase, função nova em `public` nasce executável por `anon` e `authenticated`.
- **Migration com teste vermelho antes;** `database.types.ts` no mesmo commit.
- **Interface em português,** com os componentes que já existem (`PageHeader`,
  `EmptyState`, `ConfirmAction`, `Tabs` como na tela de Projeto), tokens de cor e os
  raios do `AGENTS.md`.

## 4. Abordagens

As escolhas de "como" foram deixadas comigo e ficam registradas para o Renato poder
discordar.

### 4.1 Onde mora a tela de Clientes

| | Como | Troca |
|---|---|---|
| **A — escolhida** | `/clientes` e `/clientes/[id]` leem do **servidor**, como Contatos e CRM. A aba Financeiro reaproveita o componente que lê do aparelho | Quebra a regra "tela nova nasce migrada". A exceção fica escrita no `AGENTS.md`, com o motivo |
| B | Tela migrada, lendo o espelho | O dono vem de `profiles`, que **nunca** vai ao aparelho. Notas, histórico, ficha, processos e arquivos também não estão no espelho e teriam de ir — só `people` já vai inteira (o I13) |
| C | Só um filtro na lista de Contatos | Não dá a separação no menu, que é o motivo do pedido |

O motivo da exceção: o perfil do cliente **é** a tela de contato que já existe
(servidor), reorganizada, e o OFF-3 (Contatos e CRM offline) foi despriorizado em
25/set. Sem internet, o perfil não abre (vai para `/offline`); cobrança sem internet
continua sendo pela tela **Financeiro**. Quando o OFF-3 voltar, Clientes migra junto.

### 4.2 Como o Ganho grava e quem pode

| | Como | Troca |
|---|---|---|
| **A — escolhida** | Uma função no banco, `ganhar_negocio`, numa transação. Um gatilho em `opportunities` recusa entrar ou sair do Ganho por qualquer outro caminho | Mais SQL. Em troca: tudo ou nada, sem duplicar, e a regra de quem pode vale também pela API |
| B | Sequência de chamadas na Server Action, como `mover.ts` hoje | É o I2, e a regra de quem pode ficaria só na tela |

### 4.3 Vistos na oportunidade

| | Como | Troca |
|---|---|---|
| **A — escolhida** | Tabela nova `opportunity_items`, ligada a `visa_types`, com o valor gravado no item. `products` e `opportunity_products` são **apagadas** (vazias, com os defeitos I10 e N1), na segunda fase | Some o catálogo genérico de produtos. Se um dia a Duli vender algo que não é visto, isso volta com desenho próprio |
| B | Usar `products`, com cada produto ligado a um visto | Dois cadastros para manter o mesmo preço |

### 4.4 Resposta do cliente à forma de pagamento

| | Como | Troca |
|---|---|---|
| **A — escolhida** | O mesmo link da ficha, com uma terceira função anônima (`responder_forma_de_pagamento`) | Alarga a porta sem login, com as mesmas travas da 0035 |
| B | Página e token separados para o pagamento | Duas portas sem login, cada uma com suas travas para manter |

### 4.5 Como a função diz "precisa confirmar"

Os avisos de duplicado precisam levar a **lista** do que já existe, e um erro do banco
não leva lista. Por isso `criar_oportunidade` devolve `jsonb`, e não lança erro, no
caso "precisa confirmar":

```json
{ "situacao": "precisa_confirmar",
  "parecidos": [ { "id": "…", "nome": "…", "estagio": "client", "na_lixeira": false,
                   "bate_email": false, "bate_telefone": true } ],
  "oportunidades": [ { "id": "…", "titulo": "…", "status": "won", "criada_em": "2026-03-10" } ] }
```

Quando grava, devolve `{ "situacao": "criada", "negocio": "…", "pessoa": "…" }`.

O resumo do Ganho segue a mesma ideia: `ganhar_negocio(..., p_simular => true)`
devolve o que **faria**, sem gravar. Assim o resumo e a gravação nunca divergem.

---

## 5. A jornada nova

```
Contato (nome, telefone, e-mail — aviso de duplicado com link)
  └─ Oportunidade (contato existente ou novo, no mesmo formulário)
       ├─ Vistos: 1 ou mais, do catálogo; valor sugerido do preço do visto
       ├─ [Enviar ficha] → janela da forma de pagamento → resumo → link
       │     Cliente: dados pessoais → forma de pagamento → Confirmo | Há algo errado
       │       └─ recusou: dono ajusta e reenvia; o link novo abre só no pagamento
       ├─ (contrato e assinatura — 7.5, depois)
       └─ [Ganho] → resumo → confirma
             → pessoa vira cliente (dono, "cliente desde")
             → 1 processo por visto (molde copiado)
             → cobranças da forma de pagamento confirmada
Cliente (menu Clientes) → perfil: Dados cadastrais | Financeiro | Projetos | Documentos | Notas
Oportunidade ganha ou perdida → sai do quadro e é achada em CRM › Encerradas
```

O caminho manual continua existindo em cada passo:

- a ficha preenchida pela equipe;
- a forma de pagamento confirmada pela equipe;
- a cobrança criada à mão;
- o Ganho sem forma de pagamento;
- "+ Novo processo" no perfil do cliente.

**Regra nova: quem tem processo ou cobrança é cliente.** Criar processo ou cobrança
para uma pessoa a promove a cliente, por um gatilho no banco. Isso substitui a regra
do CON-3, que mostrava o perfil completo para quem "tinha processo sem ser cliente":
essa situação deixa de existir. Os contatos que estão assim hoje são convertidos na
migration (§7).

---

## 6. Entregas

Cada entrega funciona sozinha e vai ao ar sozinha, na ordem abaixo. A entrega 3 vai
ao ar em duas fases (§6.3).

### 6.0 Entrega 0 — arrumar a casa

| O quê | Por quê |
|---|---|
| Aplicar e fazer commit das migrations 0037 e 0038, que estão hoje fora do git, com os testes já alterados em `tests/rls/` | Mexem na mesma área (criação de negócio, atribuição) |
| Cópia do banco (`pg_dump`, spec §12.7) antes de cada migration destas entregas | Não há banco de teste nem cópia automática (OPS-1) |
| **Quarta conta de teste:** `staff` da organização de teste (`teste-staff`). A associação nasce numa fixture idempotente, como a 0015. A conta entra no `tests/rls/README.md`, no `.env.local` e nos segredos do GitHub, para o CI | Hoje o único `staff` é da Duli. Sem esta conta, provar "staff que não é dono é recusado" exigiria ganhar um negócio **real**, e o M17 e o PRO-12 tornam esse estrago permanente |

### 6.1 Entrega 1 — contato completo e sem duplicata

| ID | Requisito | Pri. |
|---|---|---|
| CON-8 | Nome, telefone (com DDI) e e-mail **obrigatórios** em todo caminho em que a equipe cria ou edita um contato | P0 |
| CON-4 | **Aviso de contato já cadastrado** ao criar e ao editar, com o link do contato existente (sobe de P1 para P0) | P0 |
| CRM-11 | **Nova oportunidade** com "contato existente" ou "novo contato" no mesmo formulário, numa gravação só | P0 |
| CRM-12 | **Aviso de oportunidade já existente** para o contato escolhido | P0 |

**Obrigatórios: onde a regra vale**

| Caminho | O que exige |
|---|---|
| Diálogo do contato (criar e editar), `personSchema` | Os três, com DDI. O DDI vem com +55 marcado (fecha o M4). O número tem de 8 a 15 dígitos |
| Dados cadastrais (equipe), `salvar_cadastro` parcial | Não deixa **apagar** e-mail, telefone ou DDI: chave presente e vazia é recusada com frase |
| Ficha pública, `salvar_cadastro` completo | Já exige e-mail e telefone. Passa a exigir o DDI também (hoje opcional em `cadastro/schema.ts:44`) |
| `criar_oportunidade`, quando o contato é novo | Os três |
| Importação (`migration/import-people.mjs`) | Não exige: o dado antigo entra como está. Contato incompleto só cobra os campos quando alguém o edita |

O formato mora em **uma** função SQL, `private.contato_valido(email, ddi, telefone)
returns text`, que devolve a frase do erro ou nulo. Ela é usada por `salvar_cadastro`
e por `criar_oportunidade`, e substitui a expressão de e-mail própria da 0035. O Zod
repete a mesma regra, e um teste roda a **mesma lista de casos** contra os dois, para
eles não divergirem. O lado do banco é provado chamando `criar_oportunidade` com
contato novo, na organização de teste, sem criar outra função exposta só para o
teste.

**Não** vira `not null` no banco: há as 3 linhas antigas, a importação em lotes e a
lixeira — mandar um desses 3 para a lixeira não pode falhar por falta de e-mail. O
comentário de `people/schema.ts` ("só o nome é obrigatório") é reescrito com a
decisão nova.

**Aviso de contato já cadastrado**

- **O que se compara**, entre os contatos que o usuário enxerga, **inclusive os da
  lixeira**:
  - o e-mail, sem diferenciar maiúscula e sem espaço;
  - o telefone, pelos dígitos com o DDI. Quando o contato antigo não tem DDI, vale o
    número nacional.
- **Onde vale:** diálogo do contato, Dados cadastrais (equipe) e `criar_oportunidade`.
  **Não** vale na ficha pública: o anônimo não pode saber quem mais está cadastrado.
- **O aviso** diz qual campo bateu e com quem, por exemplo "Telefone já cadastrado em
  **Carlos Lima** (cliente)", com o **link do contato** para o dono conferir (abre em
  nova aba). Quem está na lixeira aparece marcado como tal.
- Depois vem a pergunta **"É a mesma pessoa?"**:
  - **Sim, ao criar:** não cria nada. Na tela de Contatos, abre o existente. Na
    oportunidade, passa a usar o existente. Se ele estiver na lixeira, oferece
    restaurar.
  - **Sim, ao editar:** a edição **não é salva**, e o app abre o contato existente.
    Juntar os dois é o CON-6, que fica para depois.
  - **Não:** pergunta "Criar (ou salvar) mesmo assim?". Se confirmar, grava.
- **O servidor confere de novo:** a confirmação viaja como parâmetro e, sem ela, nada
  é gravado quando há parecido.

**Aviso de oportunidade já existente**

Se o contato já tem oportunidade (aberta, ganha ou perdida), o app mostra cada uma,
com título, situação, data de criação e link, e pergunta "Criar outra oportunidade
para este contato?".

**Banco**

| Peça | Descrição |
|---|---|
| `private.telefone_normalizado(ddi text, numero text) returns text` | `immutable`. Só os dígitos de DDI + número |
| `private.contato_valido(email text, ddi text, telefone text) returns text` | `immutable`. A frase do erro, ou nulo |
| Índices em `people` | `(organization_id, lower(btrim(email)))` e `(organization_id, private.telefone_normalizado(phone_country_code, phone))` |
| `public.contatos_parecidos(p_email text, p_ddi text, p_telefone text, p_ignorar uuid default null)` | `security invoker`, `stable`. Devolve `id, full_name, lifecycle_stage, na_lixeira, bate_email, bate_telefone`. A RLS decide quem aparece. `p_ignorar` exclui o próprio contato na edição |
| `public.criar_oportunidade(p_contato uuid, p_novo_contato jsonb, p_etapa uuid, p_titulo text, p_origem text, p_confirmar_contato_parecido boolean, p_confirmar_outra_oportunidade boolean, p_valor numeric default null, p_moeda text default null) returns jsonb` | `security invoker`, numa transação. `p_valor` e `p_moeda` existem só até a fase 2 da entrega 3, quando a função é recriada sem eles (`drop` + `create`); o código da fase 1 já não os manda. Exatamente um entre `p_contato` e `p_novo_contato`. A **organização do contato novo é a do funil de `p_etapa`**, e o pedido é recusado se quem chama não é membro dela (nunca "a primeira associação"). Valida com `contato_valido`, confere parecidos e oportunidades, e devolve `precisa_confirmar` (§4.5) quando falta confirmação. Insere o negócio com a organização da pessoa, dono = quem chamou e etapa aberta (0038). Promove a pessoa a `opportunity` sem rebaixar cliente |
| `salvar_cadastro` | Recusa apagar e-mail, telefone ou DDI e usa `contato_valido`. Muda o corpo, não a assinatura |

`createOpportunity` passa a chamar `criar_oportunidade`. `createPerson`,
`updatePerson` e a ação de Dados cadastrais chamam `contatos_parecidos` e recusam
gravar sem a confirmação.

**Entre a entrega 1 e a 3:** o formulário de nova oportunidade **mantém** o campo de
valor e moeda, gravado por `criar_oportunidade` (`p_valor`, `p_moeda`). Ele só sai
quando os vistos entram.

**Telas**

- **Contatos › Novo contato e Editar:** os obrigatórios aparecem marcados, e o
  diálogo de aviso abre ao salvar, quando há parecido. A lista de Contatos continua
  mostrando **todo mundo**, inclusive os clientes, com o selo do estágio.
- **CRM › Nova oportunidade:** o seletor "Contato existente | Novo contato". No modo
  novo, os campos do contato aparecem no próprio formulário. Os avisos vêm em
  sequência: primeiro o de contato, depois o de oportunidade.

**Critério de aceite**

- Criar contato sem e-mail, sem telefone ou sem DDI é recusado, com a frase do campo
  que falta. Apagar o e-mail na aba Dados cadastrais também é recusado.
- Com Carlos (+55 31 99999-0000) cadastrado, criar "Ana" com "31 99999 0000" e +55
  mostra "Telefone já cadastrado em Carlos Lima", com o link para ele.
  - "Sim" não cria ninguém.
  - "Não" + "Criar mesmo assim" cria Ana.
  - O mesmo vale para o e-mail "CARLOS@x.com" contra "carlos@x.com".
- Editar Ana para o e-mail do Carlos mostra o aviso. "Sim" não salva e abre o Carlos.
- Chamar a ação ou a RPC sem a confirmação, com parecido existente, não grava nada.
- Nova oportunidade com contato novo, quando o negócio falha (por exemplo, etapa
  terminal), não deixa contato criado pela metade.
- Contato com oportunidade de 10/mar: "Nova oportunidade" mostra "Já existe: *EB-2
  NIW* (ganha, 10/mar)". Confirmar cria a segunda.
- Editar um contato antigo sem e-mail exige preencher o e-mail. Mandá-lo para a
  lixeira continua funcionando.
- A mesma lista de casos (e-mail com espaço, maiúscula, sem DDI, número curto) dá o
  mesmo resultado no Zod e em `contato_valido`.

### 6.2 Entrega 2 — Clientes

| ID | Requisito | Pri. |
|---|---|---|
| CLI-1 | Item **Clientes** no menu, abaixo do CRM. A lista mostra nome, e-mail, telefone, dono, cliente desde e **Abrir**, com busca por nome, e-mail ou telefone | P0 |
| CLI-2 | **Perfil do cliente**: cabeçalho numa linha (com as Tags) e as abas Dados cadastrais, Financeiro, Projetos, Documentos e Notas | P0 |
| CLI-3 | Botão de **copiar** ao lado do telefone e do e-mail | P0 |
| CLI-4 | Aba **Dados cadastrais**: a ficha inteira (contratante, endereço, dependentes) e a situação do link | P0 |
| CLI-5 | Aba **Financeiro**: as cobranças, os totais por moeda (contratado, pago, saldo devedor, vencido), parcelas, dar e desfazer baixa, cobrança à mão | P0 |
| CLI-6 | Anexar **boleto, nota fiscal ou comprovante** à parcela, ver e baixar (era o REC-5) | P1 |
| CLI-7 | Aba **Projetos**: os processos do cliente (título, visto, andamento %, situação), clicar para abrir e o botão **+ Novo processo** | P0 |
| CLI-8 | Aba **Documentos**: arquivos do cliente por categoria (identidade, passaporte, comprovante de residência, contrato, outro), com enviar, ver, baixar e excluir com aviso. Os documentos do processo ficam no processo | P0 |
| CLI-9 | Aba **Notas**: campo de nova nota no topo e, abaixo, as notas e o histórico **do mais recente para o mais antigo**, desde a fase de lead, inclusive "Oportunidade ganha — virou cliente". **O cliente nunca lê** | P0 |
| CLI-10 | **Dono e participantes** do cliente e da oportunidade. No Ganho, o cliente herda | P1 |
| CLI-11 | **Cliente desde**: gravado quando a pessoa vira cliente e editável à mão | P0 |
| CLI-12 | **Marcar como cliente** à mão, só para a gestão | P0 |
| CLI-13 | **Cliente não volta a ser lead**, garantido no banco (fecha o M17) | P0 |
| CLI-14 | **Quem tem processo ou cobrança é cliente**: criar um ou outro para quem ainda não é cliente o promove, com registro no histórico. Fora do Ganho, isso é só da gestão, a mesma regra do CLI-12. Substitui o CON-3 | P0 |

**Cliente desde: as regras**

- Só se preenche quando a pessoa **passa a ser** cliente: `update` com
  `old.lifecycle_stage <> 'client'` e `new = 'client'`, e `client_since` nulo. Fica a
  data de hoje no fuso de São Paulo.
- **Inserção não preenche:** quem a importação traz já como cliente fica sem data,
  a menos que a importação a mande.
- Quem **já é** cliente nunca tem a data trocada por gatilho, Ganho ou atualização de
  dono.
- **Na migration:** os clientes atuais e os convertidos (§7) recebem a data do
  primeiro processo (`started_on`) ou da primeira cobrança (`created_at`), a que vier
  antes. Sem nenhum dos dois, fica nula ("—").

**Banco**

| Peça | Descrição |
|---|---|
| `people.client_since date` | Preenchido com as regras acima. Editável pela equipe no diálogo do cliente |
| `people.owner_id uuid` | Dono. FK composta `(organization_id, owner_id)` → `organization_members (organization_id, user_id)`, `on delete set null (owner_id)`: só membro da organização da pessoa pode ser dono. Um consultor de organização **atribuída** nunca é dono (efeito do desenho, registrado) |
| `person_participants` | `id` (chave, para a lápide funcionar), `unique (person_id, user_id)`, mais `organization_id`, `created_at`, `created_by`, `updated_at`. FK `(person_id, organization_id)` → `people`, com cascade. FK `(organization_id, user_id)` → `organization_members`, com cascade. RLS: membros da organização leem e gravam. Lápide e `updated_at`. Fica fora do espelho |
| `opportunity_participants` | O mesmo desenho (com `id`), ligado a `opportunities` |
| `opportunities.owner_id` | Um gatilho só deixa trocar o dono do negócio quem é o dono atual ou a gestão (C2) |
| Gatilho `estagio_do_cliente` em `people` | Duas regras. (1) **Não volta:** recusa sempre, inclusive sem usuário, o update com `old.lifecycle_stage = 'client'` e `new.lifecycle_stage <> 'client'`. A importação deixa de mandar rebaixamento. (2) **Quem torna cliente:** passar a `client` (no update, ou no insert já como `client`) só com a marca `via_ganho` ou por alguém da **gestão**. Sem usuário passa, para a importação e as migrations. Fecha o caminho do `update people set lifecycle_stage = 'client'` direto pela API, que a policy `people_update_staff` (0001) deixaria a qualquer membro |
| Gatilho `quem_tem_processo_e_cliente` | `before insert` em `projects` e em `receivables`, quando a pessoa ainda não é cliente: com a marca `via_ganho` (o Ganho já promoveu antes), passa; sem a marca, só passa se quem cria é da **gestão**, e então promove a pessoa a `client` (o `client_since` segue as regras acima) e registra no histórico "Virou cliente (processo ‹título›)" ou "(cobrança ‹título›)". Quem não é da gestão recebe "Só a gestão torna alguém cliente; use o Ganho". Na tela isso não aparece, porque "+ Novo processo" e "Criar cobrança" só existem no perfil de quem já é cliente; a trava cobre a API e a fila |
| `public.marcar_como_cliente(p_pessoa uuid, p_desde date)` | `security invoker`. Confere a gestão **no banco**, grava o estágio, o `client_since` e o histórico numa transação. **Não tem volta** pelo app: a tela avisa antes, e corrigir um engano só se faz pelo dono do banco, no SQL Editor |
| `people_guard_self_update` | No portal, o cliente também não muda `owner_id` nem `client_since` |
| Leitura de `notes` e `activities` | A policy passa de `can_access_person` (que inclui o cliente logado) para **membros da organização e da organização atribuída**. O cliente do portal deixa de ler (POR-2). A escrita não muda. `can_access_person` continua valendo para as outras tabelas |
| `files` | Ganha `category text not null default 'outro'`, com `check` em `identidade`, `passaporte`, `comprovante_residencia`, `contrato` e `outro`. A FK de `opportunity_id` vira composta, com `on delete set null (opportunity_id)` (fecha a parte de `files` do N1). Ganha um `check` de caminho `{org}/{pessoa}/{arquivo}/{nome}`, como o `document_files_path_matches` (0020:201-207) |
| Depósito `pessoas` | Privado, até 20 MB, os mesmos tipos de arquivo do depósito `documentos`. Policies de leitura, gravação e exclusão pela pasta da organização, como na 0020 |
| `installment_files` | `id`, `organization_id`, `installment_id`, `kind` (`boleto`, `nota_fiscal`, `comprovante` ou `outro`), `filename`, `storage_path` (com `check` de caminho), `mime_type`, `size_bytes`, `uploaded_by`, `created_at` e `updated_at`. FK `(installment_id, organization_id)` → `installments`, `on delete cascade` (para a pessoa de teste levar tudo; o delete direto de parcela com anexo é recusado antes, pelo gatilho abaixo). O teste que envia arquivo o remove do depósito no fim. Lápide. RLS de membros. Fica fora do espelho |
| Depósito `financeiro` | Privado, como `pessoas`. Caminho `{org}/{pessoa}/{cobrança}/{parcela}/{arquivo}/{nome}`: a pasta da pessoa vem primeiro, para a anonimização (CON-7) apagar de uma vez |
| Parcela ou cobrança com anexo | Gatilhos em `receivables` e `installments` recusam o delete **direto** (`pg_trigger_depth() = 1`) quando há anexo ("Remova os anexos antes"), para nenhum arquivo ficar órfão no depósito. A cascata vinda da pessoa (só possível na organização de teste) passa. Para isso funcionar sem internet, `excluirCobranca` (`escritas-locais.ts:200-211`) passa a mandar **só** o delete da cobrança, e as parcelas vão em cascata no servidor: a recusa vem inteira, como um conflito só, em vez de deixar a cobrança pela metade |

**Telas e rotas**

- **`/clientes`** (servidor):
  - lista as pessoas com `lifecycle_stage = 'client'` e fora da lixeira, em ordem de
    nome;
  - a busca acha por nome, e-mail ou dígitos do telefone, usando
    `telefone_normalizado` e o índice;
  - mostra 50 por página, com o total ("mostrando 50 de 72"), sem corte silencioso
    (o M1);
  - lista vazia usa `EmptyState`. No celular, cada linha vira um cartão;
  - o nome do dono vem de `profiles`, numa segunda consulta pelos ids, porque a chave
    do dono aponta para `organization_members`.
- **`/clientes/[id]`** (servidor):
  - é o perfil;
  - `/contatos/[id]` de quem é cliente **redireciona** para cá, preservando a query e
    trocando a âncora `#dados-cadastrais` por `?aba=dados`;
  - `/contatos/[id]` passa a ser só o perfil enxuto de quem não é cliente;
  - o componente é **movido**: o que as duas rotas usam sobe para `src/components/`
    ou `lib/`.
- **Cabeçalho, numa linha** (quebra no celular):
  - nome e selo "Cliente";
  - telefone e e-mail, cada um com o botão copiar (ícone `text-primary`, e "Copiado"
    ao clicar);
  - Dono, Cliente desde, as Tags e Editar.
- **As abas** usam o mesmo `Tabs` da tela de Projeto. A aba aberta fica na URL
  (`?aba=dados|financeiro|projetos|documentos|notas`). Cada aba:
  - **Dados cadastrais**: reaproveita `DadosCadastrais`, em três blocos (Contratante,
    Endereço, Dependentes), com a situação da ficha e o link.
  - **Financeiro**:
    - reaproveita `cobrancas.tsx`, que lê do aparelho;
    - os totais (contratado, pago, saldo devedor e vencido, **por moeda**) saem de uma
      função nova em `financeiro/regras.ts`, em centavos, com teste antes. A
      `somarPorMoeda` de `totals.ts` soma em ponto flutuante e pula zero, por isso
      não serve;
    - os anexos (CLI-6) vão do navegador direto ao depósito, só com internet: a tela
      Financeiro está migrada e não tem `actions.ts`. Essa é uma exceção registrada.
      Sem rede, aparece "Anexos precisam de internet";
    - logo depois do Ganho, a aba chama `sincronizarAgora` antes de mostrar a lista e
      mostra "sincronizando…" até terminar. Assim não aparece "Nenhuma cobrança" (I26)
      e ninguém duplica criando à mão.
  - **Projetos**:
    - mostra o andamento com a mesma conta da lista de Projetos;
    - o botão **+ Novo processo** reaproveita o diálogo de hoje e é o caminho dos
      clientes antigos, sem oportunidade;
    - o atalho `?novo-processo=` do quadro passa a ir para
      `/clientes/[id]?aba=projetos&novo-processo=…`.
  - **Documentos**:
    - o formulário de envio fica no topo;
    - a lista é agrupada por categoria;
    - ver e baixar usam URL assinada de curta duração;
    - excluir passa por `ConfirmAction`, que remove o registro e o arquivo.
  - **Notas**:
    - o campo **Nova nota** fica no topo, e a nota nova entra **acima** da anterior;
    - abaixo vem a linha do tempo de hoje (`timeline.tsx`, já em ordem decrescente):
      notas e atividades, inclusive da fase de lead e "Oportunidade ganha — virou
      cliente";
    - as "Observações do cadastro antigo" (`people.notes`), que não têm data,
      aparecem no **fim**, como o fato mais antigo.
- **Editar** (diálogo do cliente) inclui também dono, participantes e cliente desde.
- **Marcar como cliente** (CLI-12):
  - fica em `/contatos/[id]`, visível só para a gestão (a trava real é a função);
  - pede confirmação, com o aviso "não tem volta", e a data;
  - depois de marcar, vai para `/clientes/[id]`.
- **Lugares que mudam de endereço:**
  - `enderecoDoCartao` (`opportunities/regras.ts`);
  - o `redirect` do Ganho;
  - o botão "Abrir perfil do cliente" na tela do lead;
  - `alertas.tsx:117`;
  - `projetos/page.tsx:63`;
  - `projetos/[id]/page.tsx:94`;
  - `financeiro/lista.tsx:212`;
  - os `revalidatePath('/contatos/…')` das ações;
  - o atalho do quadro;
  - o menu lateral (desktop e celular; conferir que sete itens cabem no celular);
  - a lista `TOPO` da fumaça.

**Testes e textos que mudam:**
- `portal-do-cliente.test.ts:77-87` ("lê a nota que o consultor escreveu sobre ele")
  é **invertido**: o cliente deixa de ler.
- A dica de `projetos/page.tsx:41` ("nasce na ficha do contato") passa a apontar
  para o Ganho e para Clientes › Projetos.

**Critério de aceite**

- O menu mostra Clientes abaixo do CRM.
- `/clientes` lista os clientes de hoje mais os convertidos (§7), todos com dono
  "Renato".
- Buscar "9999" acha pelo telefone, e "@gmail" acha pelo e-mail.
- `/contatos/<id de cliente>?x=1` leva a `/clientes/<id>?x=1`.
- O botão copiar põe o telefone com DDI na área de transferência.
- Uma nota criada no CRM, quando a pessoa ainda era lead, aparece na aba Notas
  depois do Ganho, abaixo de "Oportunidade ganha — virou cliente". A nota nova entra
  no topo.
- Sessão de cliente (conta de teste do portal) lendo `notes` e `activities` recebe
  zero linhas. Teste de RLS vermelho antes.
- Update de `lifecycle_stage` de `client` para `opportunity` pela API é recusado
  (teste de RLS vermelho antes). Sem usuário, a recusa é conferida à mão no SQL
  Editor, porque a suíte só entra com login.
- Teste de RLS, na organização de teste:
  - `teste-staff` chamando `criar_processo` ou inserindo em `receivables` para um
    lead é recusado;
  - a gestão fazendo o mesmo torna o lead cliente, com `client_since` de hoje e
    "Virou cliente (…)" no histórico.
- O depósito `pessoas`:
  - documento enviado na aba Documentos vai para a pasta da organização;
  - usuário de outra organização não lê;
  - teste de RLS e de Storage.
- O boleto anexado à parcela 2 aparece só nela e abre por URL assinada. Apagar a
  parcela 2, ou a cobrança inteira, é recusado enquanto houver anexo, inclusive na
  organização de teste. Apagar a pessoa de teste leva tudo.
- `marcar_como_cliente` chamado por `staff` é recusado no banco.
- Fumaça: `/clientes` e `/clientes/<id>` respondem 200. O cliente usado é criado e
  limpo pelo próprio teste, numa organização que a conta da fumaça enxerga.

### 6.3 Entrega 3 — vistos na oportunidade e Ganho com resumo

| ID | Requisito | Pri. |
|---|---|---|
| CRM-13 | Oportunidade com **um ou mais vistos** do catálogo, cada um com valor e moeda. O valor é sugerido pelo preço do visto e fica gravado no item. Substitui o CRM-6 | P0 |
| CRM-14 | **Ganho com resumo**: contato, vistos e valores, totais por moeda, forma de pagamento e o que vai acontecer. Só após confirmar, numa gravação só: negócio ganho, histórico, cliente, dono, um processo por visto e as cobranças | P0 |
| CRM-15 | Reabrir um ganho pede confirmação também no quadro (I3). Reabrir não rebaixa ninguém nem apaga processo. Ganhar de novo não duplica processo nem cobrança | P0 |
| CRM-10 | Ganho, reabrir e trocar o dono do negócio: só o dono do negócio ou a gestão (no lugar da "linha ascendente" até a Q10), **garantido no banco**, por qualquer caminho | P0 |
| CRM-16 | **Oportunidades encerradas**: ganhas e perdidas saem do quadro e são achadas em CRM › Encerradas, com busca e filtro ganha/perdida | P0 |
| PRO-12 | **Processo nunca é apagado** (só na organização de teste). Desistência = situação **encerrado** | P0 |

**Regras**

- **Item.** Guarda o nome do visto (`visa_name`) e o valor **no momento da
  negociação**. Mudar o preço nas Configurações não mexe em oportunidade.
  - A moeda do item vem da do visto e pode ser trocada.
  - Se o dono troca a moeda para uma diferente da do preço do visto, o **campo** de
    valor fica em branco, nunca convertido, e precisa ser preenchido para salvar.
- **Quem mexe nos itens.** Antes do Ganho, qualquer membro da equipe (dono e
  participantes só marcam quem cuida).
- **Item travado no Ganho.** Depois do Ganho, os itens não mudam. Desistir de um visto
  é **encerrar o processo** dele. Antes do Ganho, o item é retirado.
- **Total da oportunidade.** É a soma dos itens **por moeda**. As colunas
  `opportunities.value` e `currency` deixam de ser lidas na fase 1 e são apagadas na
  fase 2.
- **Quem ganha, reabre e troca o dono.** O dono do negócio ou a gestão, conferido
  **no banco** (abaixo).
- **Ganho recusado quando:**
  - não há item;
  - um item está sem visto (porque o visto foi apagado das Configurações). A frase
    diz qual e pede para trocar;
  - a pessoa está na lixeira;
  - quem confirma não pode.
- **Processo do Ganho.** Um por item, pelo `criar_processo`. O título é "‹visto› —
  ‹nome do cliente›". A ligação com o item fica gravada, e é ela que impede o
  processo repetido.
- **Dono do cliente no Ganho:**
  - se a pessoa ainda não tem dono, recebe o dono do negócio, **desde que ele seja
    membro atual** da organização da pessoa. Se não for, o dono vira quem confirmou;
  - os participantes do negócio que são membros atuais entram como participantes da
    pessoa. Os outros são ignorados, sem falhar o Ganho;
  - o "cliente desde" só é gravado se a pessoa não era cliente.
- **Cliente que já existe.** Ganha os processos novos. O dono e o "cliente desde" não
  mudam.
- **Cobranças no Ganho** (dependem da entrega 4; antes dela, o resumo diz "forma de
  pagamento: definir na aba Financeiro"):

  | Situação da forma | O que acontece |
  |---|---|
  | `confirmada` | Nasce uma cobrança por parte |
  | `enviada` ou `recusada` | O resumo mostra a situação e oferece a caixa "criar as cobranças mesmo assim" (desmarcada) |
  | `rascunho` ou sem forma | Nenhuma cobrança nasce. A aba Financeiro mostra "Nenhuma cobrança. Criar cobrança" |

  Uma forma que **já gerou cobrança** nunca gera de novo (§6.4).
- **Vencimento já passado.** Parcela com vencimento antes do dia do Ganho: o resumo
  avisa ("2 parcelas já vencidas") antes de confirmar.
- **Reabrir.** Volta para a **primeira etapa aberta** do funil e não toca em pessoa,
  processo nem cobrança.
- **Ganho → Perdido** direto não pode: é preciso reabrir antes.
- **Excluir negócio.**
  - Negócio **ganho**, ou com forma de pagamento já respondida, não se exclui. A
    frase diz "Reabra ou encerre os processos; o negócio ganho fica como registro".
  - O botão "Excluir" do quadro (`quadro.tsx:197-203`) segue a mesma regra.
  - Vale também na organização de teste. Só a cascata da pessoa passa (§3).
  - Negócio **aberto** com link de pagamento aberto também não se exclui ("Cancele o
    link de pagamento antes"), para nenhum link ficar apontando para nada. A tela
    oferece o cancelamento, que passa por `voltar_forma_para_rascunho`.
- **Encerradas (CRM-16).**
  - O quadro mostra as etapas abertas. As colunas Ganho e Perdido mostram só os
    encerrados **nos últimos 30 dias**.
  - `getBoard` (`opportunities/queries.ts:83-92`) passa a trazer "aberto, ou
    encerrado há até 30 dias". O título das colunas Ganho e Perdido diz "últimos 30
    dias".
  - A tela **CRM › Encerradas** (`/crm/encerradas`):
    - lista todos os ganhos e perdidos: título, contato, situação, data de
      encerramento e totais;
    - busca por título ou contato e filtra ganha/perdida;
    - mostra 50 por página, com o total, sem corte silencioso;
    - clicar abre a tela do negócio (`/crm/[id]`), que continua existindo.

**Banco**

| Peça | Descrição |
|---|---|
| `opportunity_items` | `id`, `organization_id`, `opportunity_id`, `visa_type_id` (nulo), `visa_name text not null`, `amount numeric(12,2) not null check (amount >= 0)`, `currency char(3) check in ('BRL','USD')`, `position int`, `created_by`, `created_at`, `updated_at`, `unique (id, organization_id)`. FK `(opportunity_id, organization_id)` → `opportunities`, com cascade. FK `(visa_type_id, organization_id)` → `visa_types`, `on delete set null (visa_type_id)`. RLS com leitura e escrita separadas, como `opportunities` (0017), mais o `guard_child_row`. Lápide e `updated_at`. Gatilho de trava: item de negócio ganho não é inserido, alterado nem apagado (só a cascata passa, §3). O gatilho lê o negócio com `select … for share`, para não correr junto com o Ganho. Fica fora do espelho |
| `projects.opportunity_item_id uuid` | Índice único parcial (quando não nulo). FK `(opportunity_item_id, organization_id)` → `opportunity_items`, `on delete set null (opportunity_item_id)` |
| `projects`, exclusão | A policy `for all` se divide em select, insert e update, **sem** delete. Um gatilho recusa o `delete` direto, com frase, e deixa passar só a cascata (§3). Os testes que apagam processo direto (fumaça `rotas.test.ts:258` e os de processo) passam a limpar apagando a pessoa de teste. O plano confere, no primeiro teste, que a cascata de `people` atravessa a RLS de `projects` |
| `criar_processo` | Ganha `p_item uuid default null` (gravado em `opportunity_item_id`), com `drop` + `create` na migration A. O padrão nulo mantém funcionando o "Novo processo" do código antigo entre a migration e o deploy. Todos os chamadores são atualizados para a assinatura nova: `projects/actions.ts:35`, quatro testes de RLS e `rotas.test.ts:248` |
| Marca de transação | `ganhar_negocio`, `reabrir_negocio` e `marcar_como_cliente` ligam `dulihub.via_ganho` e a desligam no fim (§3) |
| Gatilho `ganho_so_pela_funcao` em `opportunities` | `before update`: mudar `status` para ou de `won`, ou o `stage_id` para ou de uma etapa de ganho, sem a marca `via_ganho`, é recusado, também na organização de teste: os testes usam as funções. Entra só na **migration B** (abaixo), depois que o código que usa as funções estiver no ar |
| Gatilho do dono do negócio | `before update of owner_id`: só passa se quem chama é o dono atual ou a gestão |
| `public.ganhar_negocio(p_negocio uuid, p_cobrancas_sem_confirmacao boolean default false, p_simular boolean default false) returns jsonb` | `security invoker`, numa transação, com estes passos: (1) trava o negócio (`for update`); (2) confere o CRM-10 e as regras acima; (3) põe a marca e move para a etapa de ganho do funil, com `closed_at`; (4) registra no histórico "Oportunidade ganha — virou cliente" ou "Oportunidade ganha", conforme a pessoa já fosse cliente; (5) pessoa: estágio, `client_since`, dono e participantes (regras acima); (6) para cada item sem processo, `criar_processo`; (7) as cobranças (§6.4); (8) devolve `{ processos: [...], cobrancas: [...], avisos: [...] }`. Com `p_simular`, faz as conferências e devolve o mesmo formato **sem gravar** — é o que o resumo mostra |
| `public.reabrir_negocio(p_negocio uuid)` | Confere o CRM-10, põe a marca, volta para a primeira etapa aberta, limpa `closed_at` e registra no histórico. Não toca em pessoa, processo nem cobrança |
| `aplicarEtapa` (`mover.ts`) | Passa a recusar a etapa de ganho e sair do ganho. `ganharOportunidade` e a reabertura chamam as funções do banco |
| **Fase 1, migration A** (antes do deploy) | Cria `opportunity_items`, `ganhar_negocio`, `reabrir_negocio` e as colunas e gatilhos que **não** recusam nada do código antigo. Copia o valor de cada negócio existente para um item **sem visto** (`visa_name` = título do negócio). O código antigo continua funcionando |
| **Deploy da fase 1** | O código novo usa itens e as funções do Ganho, e deixa de ler e gravar `value`, `currency`, `products` e `opportunity_products` |
| **Fase 2, migration B** (só depois que o código da fase 1 estiver no ar) | (1) **Recopia**, antes de apagar, todo negócio com `value` e sem item, porque o código antigo pode ter gravado valor na janela entre a migration A e o deploy; (2) cria o gatilho `ganho_so_pela_funcao` e a trava do dono do negócio; (3) apaga `opportunities.value` e `currency`, `products` e `opportunity_products`; (4) **na mesma migration**, recria `public.sync_manifesto()` sem as duas tabelas. A lista de tabelas mora dentro da função, que monta o SQL na hora: o Postgres não sabe que ela depende delas, e sem isso a sincronia de todos os aparelhos quebra (C1); (5) recria `criar_oportunidade` sem `p_valor` e `p_moeda`. Também atualiza os tipos e o esquema do Dexie, se algo deles citar as colunas |

**Telas**

- **Tela do lead (`/crm/[id]`):** o cartão "Negócio" ganha a lista **Vistos**:
  - adicionar visto (seletor dos vistos ativos), com o valor e a moeda preenchidos;
  - editar valor e moeda, e remover;
  - o total aparece por moeda.
- **Cartão do quadro:** mostra os totais por moeda no lugar do valor único.
- **Botão Ganho, ou soltar na coluna Ganho:** abre o **diálogo de resumo**, montado
  por `ganhar_negocio(..., p_simular => true)`:
  ```
  Ganhar negócio — Maria Souza
  Vistos
    EB-1A ........................ US$ 8.000
    O-1 .......................... US$ 6.000
    Total ........................ US$ 14.000
  Forma de pagamento: confirmada pelo cliente em 05/nov
    Entrada (pix) ......... R$ 10.000 — 10/nov
    3 parcelas (transferência) US$ 3.000 — 10/dez, 10/jan, 10/fev
  Ao confirmar:
    • Maria passa a ser cliente
    • Serão criados 2 processos: EB-1A — Maria Souza; O-1 — Maria Souza
    • Serão criadas 2 cobranças (R$ 10.000; US$ 9.000)
  [Cancelar]                                [Confirmar Ganho]
  ```
- **Arrastar para fora do Ganho, ou trocar o seletor:** pede confirmação ("Reabrir
  este negócio?"). Recusar devolve o cartão. Arrastar de Ganho para Perdido mostra
  "Reabra o negócio antes".
- **Depois de confirmar:** vai para `/clientes/[id]?aba=projetos`.
- **CRM › Encerradas:** um link "Encerradas" no topo do quadro.

**Critério de aceite**

- Oportunidade com EB-1A (US$ 8.000) e O-1 (US$ 6.000): o Ganho cria 2 processos com
  as etapas e pastas do molde de cada visto, e a pessoa aparece em `/clientes`.
- O resumo e o resultado da gravação listam os mesmos processos e cobranças.
- Ganho sem visto, ou com um item sem visto, é recusado com a frase certa, e nada
  muda.
- Ganho que falha no meio desfaz tudo: o negócio continua aberto, e a pessoa e os
  processos, como estavam. Reprodução no banco, na organização de teste: tirar o
  `is_default` do status de etapa padrão, o que faz o `criar_processo` falhar.
- Chamar `ganhar_negocio` duas vezes: a segunda é recusada (negócio já ganho), e há
  um processo por item.
- Reabrir e ganhar de novo, depois de acrescentar um visto, cria **só** o processo do
  visto novo e nenhuma cobrança repetida.
- Conta `teste-staff`, que não é dona do negócio, na organização de teste. Todas estas
  tentativas são recusadas no banco (teste de RLS vermelho antes):
  - `ganhar_negocio` e `reabrir_negocio`;
  - `update opportunities set status = 'won', stage_id = <ganho>` direto pela API;
  - `update opportunities set owner_id = auth.uid()`.
- `delete` em `projects` pela API, na organização de teste, apaga **0 linhas** (a RLS
  não tem policy de delete; o gatilho é a segunda camada). Apagar a pessoa
  descartável leva o processo junto. Teste vermelho antes.
- Mudar o preço do EB-1A nas Configurações não muda o item de uma oportunidade aberta.
- Item em real de um visto com preço em dólar: o campo de valor vem em branco, e nada
  é convertido.
- Negócio ganho há 40 dias não aparece na coluna Ganho do quadro. Aparece em
  Encerradas, e a busca pelo nome do contato o acha.
- Excluir negócio ganho é recusado com frase, também na organização de teste.
- Excluir negócio aberto com link de pagamento aberto é recusado ("Cancele o link de
  pagamento antes"). Depois de cancelar, a exclusão passa.
- Apagar nas Configurações um tipo de visto usado num negócio ganho funciona: o item
  fica sem visto e guarda o nome (`visa_name`).
- `teste-staff` fazendo `update people set lifecycle_stage = 'client'` num lead é
  recusado. A gestão consegue, e "Marcar como cliente" registra no histórico.
- Depois da migration da fase 2, `sync_manifesto()` responde sem erro, e
  `tests/rls/sincronia.test.ts` passa.
- Entre a migration A e o deploy, ganhar e reabrir pelo código antigo continuam
  funcionando (não há gatilho ainda).
- Um negócio criado com valor nessa janela vira item na migration B.

**Testes que mudam:**
- `funil.test.ts:166-186` ganha e reabre por `aplicarEtapa`; passa a usar
  `ganhar_negocio` e `reabrir_negocio`.
- O `TOPO` da fumaça ganha `/crm/encerradas`.
- Os testes que apagam negócio ou processo direto passam a apagar a pessoa de
  teste.

### 6.4 Entrega 4 — forma de pagamento na ficha

| ID | Requisito | Pri. |
|---|---|---|
| FIC-7 | **Enviar ficha** pela oportunidade abre a janela da **forma de pagamento**: vistos e total, as partes (cartão até 10x sem juros ou até 18x com juros, parcelas iguais até 36, entrada com forma e moeda + parcelas, à vista), com as datas. Depois vem o resumo e a confirmação, e só então o link | P0 |
| FIC-8 | O cliente, depois dos dados pessoais, vê a forma de pagamento e responde **Confirmo** ou **Há algo errado** (motivo opcional) | P0 |
| FIC-9 | Recusada: o dono ajusta e reenvia. O link novo abre **direto no pagamento**, com "seus dados já foram recebidos ✓", e não aceita dados pessoais | P0 |
| FIC-10 | **Confirmação pela equipe** (o cliente confirmou por fora, até sem link): dono do negócio ou gestão, a partir de `rascunho` ou `enviada`, registrando quem confirmou | P0 |
| FIC-11 | **Cotação usada (C6)**: campo da equipe na forma de pagamento, editável em qualquer estado (a cotação muitas vezes só se sabe depois). O cliente nunca vê, e ela não entra na cópia | P1 |
| REC-6 | As cobranças nascem no Ganho, da forma de pagamento confirmada, uma por parte, uma vez só | P0 |
| INI-8 | Início: aviso de forma de pagamento **recusada** (some quando o dono reenvia) e de **confirmada — pronto para o contrato** (some no Ganho) | P0 |

**Regras**

- **Partes.** Cada parte tem o seu valor **na sua moeda**: por exemplo, entrada de
  R$ 10.000 no pix e 3 × US$ 3.000 por transferência. O total aparece por moeda. O
  app não converte; o Renato converte com a cotação do C6 e, se quiser, a anota no
  FIC-11.
- **Coerência.** Quando vistos e partes estão todos na **mesma** moeda e os totais
  diferem, o resumo avisa, mas não bloqueia. Com moedas diferentes, mostra os dois
  lados.
- **Cartão.** Até 10x sem juros ou até 18x com juros.
  - Vira **um** pagamento, numa data (a da cobrança no cartão), com a anotação "6x
    sem juros".
  - Não se acompanha parcela a parcela, porque quem cobra é a operadora.
- **Parcelas iguais.** De 1 a 36, como a cobrança manual (`financeiro/schema.ts:53`).
  - O total é dividido sem perder centavo (`financeiro/regras.ts`).
  - As datas são geradas mês a mês a partir da primeira e podem ser editadas uma a
    uma.
  - A soma das parcelas tem de bater com o total da parte.
- **Estados e o que se pode fazer em cada um:**

  | Estado | Editar partes | O que muda o estado |
  |---|---|---|
  | `rascunho` | Sim | Enviar → `enviada`; confirmação pela equipe → `confirmada` |
  | `enviada` | **Não.** "Editar" cancela o link aberto e volta a `rascunho`, com aviso: "o link enviado deixa de valer" | Resposta do cliente → `confirmada` ou `recusada`; confirmação pela equipe → `confirmada` (cancela o link); editar → `rascunho` |
  | `recusada` | Não. "Ajustar" volta a `rascunho` | Ajustar → `rascunho` |
  | `confirmada` | Não. "Refazer" volta a `rascunho` | Refazer → `rascunho`; Ganho → gera as cobranças |

  - **Forma que já gerou cobrança fica congelada.** O Ganho grava
    `payment_plans.charges_created_at`. Com ele preenchido, **nenhuma** volta a
    `rascunho` é aceita, de qualquer estado (Editar, Ajustar ou Refazer), e o Ganho
    não gera cobrança de novo. A tela diz "Ajuste na aba Financeiro do cliente".
    Isso fecha a duplicata do C4, inclusive depois de "criar as cobranças mesmo
    assim": as cobranças existentes são a verdade a partir daí.
  - **Mudança de estado e escrita** em partes e parcelas só pelas funções abaixo,
    com a marca `via_forma` (§3). Um gatilho recusa o resto, inclusive o `update`
    direto de `payment_plans.status` pela API, também na organização de teste.
  - **A cotação** (`reference_rate`, `reference_rate_note`) é a exceção: membros a
    editam direto, em qualquer estado.
- **A prova.**
  - A resposta guarda a **cópia** do que o cliente viu (vistos, partes e parcelas,
    **sem** a cotação), montada no banco a partir da forma **no estado `enviada`**
    (ou `rascunho`, na confirmação pela equipe).
    Como uma forma enviada não se edita, o cliente confirma exatamente o que viu.
  - Respostas não se alteram nem se apagam (só a cascata da pessoa de teste passa).
  - Resposta só nasce pelas funções: a do cliente por `responder_forma_de_pagamento`
    e a da equipe por `confirmar_forma_de_pagamento_pela_equipe`, que confere o
    CRM-10. Inserção direta pela API é recusada.
- **O link.**
  - Continua de uso único, com 15 dias e um aberto por pessoa.
  - Com forma de pagamento, ele não fecha ao enviar os dados: fecha quando o
    pagamento é respondido.
  - **Reenvio:** o link é do modo `so_pagamento`, que recusa dados pessoais.
  - **Pessoa que já tinha ficha enviada:** o dono escolhe "pedir os dados pessoais de
    novo" (desmarcado por padrão).
  - **Link vencido:** a tela do lead mostra o selo "link vencido", e a forma volta a
    `rascunho` quando o dono reenvia.
  - **Gerar link novo com um link de pagamento aberto** (de outra oportunidade, ou
    pelo "Gerar link da ficha" do contato): é **recusado**, e a frase diz qual link
    está aberto e oferece cancelá-lo.
  - **Enviar a forma com uma ficha comum aberta** (sem forma, ainda não
    respondida): a ficha comum é cancelada e substituída. A janela avisa antes: "o
    link da ficha enviado em ‹data› deixa de valer".
  - **Cancelar um link de pagamento** ("Cancelar link" de hoje) passa por
    `voltar_forma_para_rascunho`, para a forma não ficar `enviada` sem link.
- **Sem oportunidade.** "Gerar link da ficha" no contato continua como hoje, sem forma
  de pagamento.

**Banco**

| Peça | Descrição |
|---|---|
| `payment_plans` | `id`, `organization_id`, `opportunity_id` (único: uma forma por negócio), `status` (`rascunho`, `enviada`, `confirmada` ou `recusada`), `reference_rate numeric(12,4)`, `reference_rate_note text`, `charges_created_at timestamptz`, `created_by`, `created_at`, `updated_at`. FK `(opportunity_id, organization_id)` → `opportunities`, com cascade. RLS de leitura: só membros (o cliente nunca lê). Escrita só pelas funções, com a marca `via_forma`; o gatilho deixa membros mudarem direto só `reference_rate` e `reference_rate_note`. Lápide |
| `payment_plan_parts` | `id`, `organization_id`, `plan_id`, `position`, `label text`, `method` (o mesmo `check` de `installments.method`), `currency` (BRL ou USD), `total numeric(12,2) > 0`, `installments_count int` (de 1 a 36), `card_with_interest boolean`. `check`: com `method = 'cartao'`, sem juros vai até 10 e com juros até 18; nos outros métodos, `card_with_interest` é nulo. FK composta para o plano, com cascade. `updated_at`, lápide e gatilho de trava (lê o plano com `for share`) |
| `payment_plan_installments` | `id`, `organization_id`, `part_id`, `number`, `amount numeric(12,2) > 0`, `due_on date`, `unique (part_id, number)`. No cartão, uma linha só. `updated_at`, lápide e a mesma trava |
| `payment_plan_responses` | `id`, `organization_id`, `plan_id`, `registration_form_id`, `decision` (`confirmada`, `recusada` ou `confirmada_pela_equipe`), `reason text` (até 500), `snapshot jsonb not null`, `answered_at`, `answered_by`. A FK de `registration_form_id` fica com a ação padrão (`no action`): `set null` quebraria o `check` abaixo, e `restrict` poderia travar a limpeza da pessoa de teste. `check`: quando a decisão é `confirmada_pela_equipe`, `answered_by` é obrigatório e `registration_form_id` é nulo; nas outras duas, o contrário. Gatilho `before insert`: sem a marca `via_forma`, recusa. Com a marca, confere o estado da forma (`enviada` para o cliente; `rascunho` ou `enviada` para a equipe) e, com usuário logado, força `decision = 'confirmada_pela_equipe'`, `answered_by = auth.uid()`, `registration_form_id = null` e `answered_at = now()` (defesa a mais). A cópia é sempre montada no banco, pela função. Update e delete são recusados; só a cascata passa (§3) |
| `registration_forms` | Ganha `payment_plan_id` (FK composta, `on delete set null (payment_plan_id)`), `mode` (`completa` ou `so_pagamento`, padrão `completa`) e `closed_at`. A migration copia `closed_at = submitted_at` nas linhas que existem **antes** de criar o gatilho de congelamento. O índice "um link aberto por pessoa" passa a valer onde `closed_at` e `cancelled_at` são nulos. `gerarLink` e `cancelarLink` (`cadastro/actions.ts:86`, `:119`) passam a olhar `closed_at`. Um gatilho congela `mode`, `closed_at` e `payment_plan_id` fora das funções (marca `via_ficha`; a policy de hoje deixa membros gravarem a linha inteira, 0035:150-153) e confere que a pessoa do link é a pessoa do negócio da forma. Na **inserção**, aceita sem a marca os valores padrão (`mode = 'completa'`, `closed_at` e `payment_plan_id` nulos), que é o que `gerarLink` e a fumaça (`rotas.test.ts:283`) gravam |
| `receivables.payment_plan_part_id` | Único quando não nulo. FK composta, `on delete set null (payment_plan_part_id)` |
| Token | Gerado no banco em **base64url** (`+` vira `-`, `/` vira `_`, sem `=`) a partir de 32 bytes aleatórios. É o formato que `publico-queries.ts:21` aceita |
| `public.salvar_forma_de_pagamento(p_negocio uuid, p_forma jsonb)` | `security invoker`, numa transação, com a marca `via_forma`. Só em `rascunho`. **Mantém os ids** das partes que continuam, por `position`. Valida somas, limites e moedas. A organização vem do negócio |
| `public.enviar_forma_de_pagamento(p_negocio uuid, p_pedir_dados_de_novo boolean) returns text` | `security invoker`, com as marcas `via_forma` e `via_ficha`. Exige pelo menos um item e a forma completa. Recusa se a pessoa tem outro link de pagamento aberto; cancela a ficha comum aberta, se houver. Cria o link com `payment_plan_id` e o modo, põe a forma em `enviada`, registra no histórico e devolve o token |
| `public.voltar_forma_para_rascunho(p_negocio uuid)` | `security invoker`, com as marcas. Cobre o "Editar" de uma forma enviada (cancela o link), o "Ajustar" de uma recusada, o "Refazer" de uma confirmada e o "Cancelar link". Recusa sempre que `charges_created_at` está preenchido |
| `public.confirmar_forma_de_pagamento_pela_equipe(p_negocio uuid, p_observacao text)` | `security invoker`, com as marcas. Confere o CRM-10 e a forma completa. Vale a partir de `rascunho` ou de `enviada` (cancela o link aberto). Grava a resposta, com a cópia montada no banco, e põe a forma em `confirmada` |
| `abrir_ficha_de_cadastro` (anônima) | `drop` + `create`, e depois `revoke … from public, anon, authenticated` e `grant … to anon`, como na 0035:432-433. Novas situações: `aberta`, `aguardando_pagamento` (dados enviados, pagamento pendente, ou modo `so_pagamento`), `respondida` e as de hoje. Devolve `modo` e `forma_de_pagamento jsonb` (vistos e partes com parcelas) **só** na situação `aguardando_pagamento`. **Nunca** devolve cotação, documento ou endereço. Pessoa na lixeira dá a situação de hoje (0035:411) |
| `enviar_ficha_de_cadastro` (anônima) | Liga e desliga a marca `via_ficha`. Recusa o modo `so_pagamento`. No modo `completa` com forma, grava os dados e deixa o link aberto. Sem forma, fecha como hoje (`closed_at`) |
| `public.responder_forma_de_pagamento(p_token text, p_aceita boolean, p_motivo text)` (anônima, **nova**) | `security definer`, só `anon` executa, com as travas da 0035: o token é a única chave e a linha é travada antes de gravar. Liga as marcas `via_forma` e `via_ficha` e as desliga no fim. Exige `aguardando_pagamento`, a forma em `enviada` e a pessoa fora da lixeira. Monta a cópia **no banco**. Do navegador chegam só sim, não e o motivo (até 500 caracteres). Grava a resposta, muda a forma, registra no histórico e fecha o link |
| `ganhar_negocio`, passo (7) | Com a marca `via_forma`. Só cria cobranças se `charges_created_at` é nulo, e o grava ao criar. Cria uma cobrança por parte, com a organização **da pessoa**: título "‹rótulo› — ‹vistos›", `amount` = total, a moeda da parte e `payment_plan_part_id`. As parcelas copiam as da forma, com o `method` da parte. No cartão, uma parcela com a anotação "Nx com/sem juros" |

**Telas**

- **Tela do lead:** o cartão **Forma de pagamento** mostra:
  - a situação, num selo: rascunho, enviada (com "link vencido" quando for o caso),
    confirmada em ‹data›, ou recusada, com o motivo;
  - os botões que valem no estado: Definir/Editar, Enviar ficha, Copiar link,
    WhatsApp (como o FIC-4), Confirmar pela equipe, Ajustar e Refazer.
- **Janela "Enviar ficha"**, em dois passos:
  1. **Forma de pagamento:**
     - os vistos e o total por moeda;
     - os botões **+ Entrada**, **+ Parcelas**, **+ Cartão** e **+ À vista**. Cada
       parte tem rótulo, método, moeda, valor total, nº de parcelas, juros (no
       cartão), 1ª data e as datas geradas, editáveis;
     - o campo "Cotação usada (C6) — só a equipe vê";
     - a caixa "pedir os dados pessoais de novo", quando ela se aplica.
  2. **Resumo:** o que o cliente vai ver, os avisos (coerência, vencimento no passado)
     e o botão "Confirmar e gerar link".
- **Formulário público (`/cadastro/<token>`):**
  - **Modo `completa`:** primeiro os dados pessoais, como hoje; depois, "Forma de
    pagamento".
  - **Modo `so_pagamento`:** abre em "Seus dados já foram recebidos ✓" e vai direto à
    forma de pagamento.
  - **A etapa de pagamento:**
    - lista as partes e as parcelas;
    - os botões são **Confirmo** e **Há algo errado**. O segundo abre o motivo
      (opcional) e "Enviar";
    - a tela final diz o que acontece agora.
- **Início:** os avisos do INI-8. Uma ficha `so_pagamento` **não** gera o aviso de
  "ficha recebida".

**Critério de aceite**

- O dono monta: entrada de R$ 10.000 no pix em 10/nov, mais 3 × US$ 3.000 por
  transferência a partir de 10/dez. O resumo mostra "R$ 10.000 + US$ 9.000" e as 4
  datas.
- As validações da forma:
  - cartão sem juros com 11 parcelas é recusado, e com juros até 18 é aceito;
  - parcelas iguais com 37 são recusadas;
  - parcelas que somam diferente do total não deixam enviar.
- O cliente abre o link: primeiro os dados pessoais, depois a forma. A resposta do
  servidor **não contém** cotação, CPF, RG nem endereço. Teste da função anônima.
- **Confirmo:** a forma vira `confirmada`, o link fecha, a Início avisa e o histórico
  registra.
- **Há algo errado**, com motivo: a forma vira `recusada`, o motivo aparece no lead, e
  os dados pessoais já estão gravados no contato.
- **Reenviar depois de ajustar:** o link novo abre direto no pagamento. Chamar
  `enviar_ficha_de_cadastro` com esse token é recusado.
- **Forma enviada não se edita:** `salvar_forma_de_pagamento` em `enviada` é recusado.
  "Editar" cancela o link: abrir o link antigo mostra "cancelado", e
  `responder_forma_de_pagamento` com ele não grava.
- **A prova não se forja** (teste de RLS vermelho antes, na organização de teste):
  - inserção direta em `payment_plan_responses` pela API, com qualquer `decision`,
    é recusada;
  - `update payment_plans set status = 'confirmada'` pela API é recusado;
  - `update` e `delete` em `payment_plan_responses` são recusados;
  - `update registration_forms set mode = 'completa'` (ou `closed_at`, ou
    `payment_plan_id`) pela API é recusado.
- **Sem cobrança duplicada:**
  - Ganho com forma confirmada → reabrir → "Refazer" é recusado ("Ajuste na aba
    Financeiro"), e ganhar de novo não cria cobrança;
  - depois de "criar as cobranças mesmo assim" com a forma `enviada`, "Editar" é
    recusado do mesmo jeito.
- **Cotação:** com a forma `confirmada`, a equipe anota a cotação do C6, e a cópia
  guardada não muda.
- **Confirmação sem link:** "Confirmar pela equipe" numa forma em `rascunho` a deixa
  `confirmada`, sem nenhum link ter sido enviado.
- **Cancelar o link** de uma forma `enviada` a deixa em `rascunho`.
- **Token inválido:** `responder_forma_de_pagamento` com token vencido, já respondido,
  cancelado ou inventado não grava nada.
- **Quem executa as funções anônimas:**
  - `responder_forma_de_pagamento` e `abrir_ficha_de_cadastro` chamados por
    `authenticated` são recusados;
  - o aviso do Supabase "definer executável por anon" aparece para as **três**
    funções da ficha, e para nenhuma outra.
- **Ganho com a forma confirmada:** nascem 2 cobranças (uma em R$ com 1 parcela, uma
  em US$ com 3), com a organização da pessoa.
- **"Confirmar pela equipe":** registra quem confirmou e libera o Ganho com cobranças.
  `teste-staff`, que não é dono, é recusado.
- **Usuário do portal** (conta de teste de cliente): não lê `payment_plans` e nunca vê
  `reference_rate`.

### 6.5 Entrega 5 — contrato e ZapSign (não está neste desenho)

Fica para a spec 7.5, com Q1, Q2, Q4 e Q14. O que este desenho deixa pronto para ela:

- a forma de pagamento confirmada, com a cópia;
- os dados da ficha;
- o depósito `pessoas`, com a categoria `contrato`, onde o PDF assinado vai morar.

O aviso do ZapSign só registra o fato e **oferece** o Ganho, que continua sendo o
`ganhar_negocio`. A linha do CTR-2 no `docs/spec.md` passa a dizer que a forma de
pagamento já chega pronta da ficha.

---

## 7. Dados que já existem

| Dado | O que acontece |
|---|---|
| 27 clientes, 26 sem negócio ganho | Aparecem em Clientes. Dono = o `owner` da organização (Renato). "Cliente desde" = a data do primeiro processo ou da primeira cobrança; sem nenhum dos dois, "—" |
| 2 contatos com processo que não são clientes | **Viram clientes na migration**, com os processos já ligados. Mesmo dono e mesma regra de data. Quem tiver cobrança sem ser cliente entra junto. Depois, o Renato completa os dados cadastrais e o financeiro à mão |
| 3 contatos sem telefone e e-mail | Nada muda até alguém editar, e aí os campos são cobrados |
| 49 contatos "oportunidade" sem negócio | Ficam como estão. É decisão do Renato, fora deste desenho |
| 2 negócios com valor | O valor vira um item sem visto (fase 1). O negócio aberto precisa de um visto antes do Ganho |
| Clientes antigos que o Renato vai subir | Pela importação, já como `client`, sem oportunidade, com `client_since` quando se souber. O script deixa de rebaixar estágio (`import-people.mjs:205-279` e `merge-duplicates`, `:367-375`) |

## 8. Segurança e LGPD

- **Porta anônima: de duas para três funções.** O `AGENTS.md` muda junto.
  - **O que sai pelo link:** nome e contato (como hoje) e, só na etapa de pagamento,
    os vistos e a forma de pagamento.
  - **O que nunca sai:** documento, endereço e cotação.
  - **O que entra, no modo `so_pagamento`:** só sim, não e um motivo de até 500
    caracteres.
- **Ganho, reabrir, dono do negócio e estado da forma:** garantidos no banco, não só
  na tela (§6.3, §6.4).
- **Notas e histórico:** o cliente deixa de ler, antes de o portal existir (POR-2).
- **Arquivos novos** (`pessoas`, `financeiro`): entram na cópia de segurança (OPS-1,
  §12 da spec) e na anonimização (CON-7), e a pasta da pessoa vem primeiro no caminho.
- **A prova da forma de pagamento** não se edita, não se apaga e não se forja (§6.4).
  A fraqueza do I11 não se repete aqui; o I11 da ficha continua aberto.
- **Dono e participantes** não mudam a RLS de leitura. Quando houver níveis de acesso,
  a restrição se liga sobre `owner_id` e os participantes.

## 9. Sem internet

- **Clientes** (lista e perfil) leem do servidor. Sem rede, abrir o perfil leva a
  `/offline`, porque o service worker só guarda as cascas de `/configuracoes` e
  `/financeiro` (`estrategia.ts:34`). **Cobrança sem internet continua sendo pela tela
  Financeiro.** A exceção fica no `AGENTS.md` com este texto.
- **A aba Financeiro** do perfil reaproveita o componente que lê do aparelho. Logo
  depois do Ganho, chama `sincronizarAgora` antes de mostrar (§6.2).
- **As tabelas novas ficam fora do espelho.** `people` ganha colunas, que só chegam
  aos aparelhos com a correção do I23; nenhuma tela migrada depende delas.
- **A fase 2 da entrega 3** recria o `sync_manifesto` (C1).

## 10. Celular

- **Cabeçalho do perfil:** quebra em duas ou três linhas.
- **Abas:** rolam na horizontal.
- **Lista de Clientes e Encerradas:** viram cartões.
- **Janela da forma de pagamento:** uma coluna, com cada parte num bloco.
- **Formulário público:** já é pensado para celular; a etapa de pagamento segue o
  mesmo padrão.

## 11. O que fica com quem constrói

- O nome exato das migrations, a ordem dos commits e a divisão de cada entrega em
  tarefas.
- Os nomes dos componentes e onde ficam:
  - o perfil é movido de `contatos/[id]` para `clientes/[id]`;
  - o compartilhado sobe para `src/components/` ou `lib/`;
  - nenhuma feature importa de outra.
- O texto exato das mensagens, dentro do tom do app.
- O ícone do item Clientes.
- Como a fumaça cria o cliente que ela abre, desde que limpe depois.

## 12. Perguntas em aberto

| # | Pergunta | Bloqueia |
|---|---|---|
| Q10 | Quem é a "linha ascendente". Até lá, a gestão faz esse papel | Nada aqui |
| Q1, Q2, Q4, Q14 | As do contrato | Só a entrega 5 |

## 13. Decisões

**Do Renato, em 17/nov**

| Decisão |
|---|
| A assinatura do contrato só **oferece** o Ganho; o dono confirma. O Ganho automático fica para quando o fluxo inteiro estiver funcionando |
| **Clientes** tem item próprio no menu. A lista mostra nome, e-mail, telefone, dono, cliente desde e Abrir, com busca por nome, e-mail ou telefone |
| A lista de Contatos continua mostrando todo mundo, inclusive os clientes |
| Perfil do cliente: cabeçalho numa linha, com copiar no telefone e no e-mail, e as abas Dados cadastrais, Financeiro, Projetos (com "+ Novo processo"), Documentos e Notas |
| O perfil não lista oportunidades. Ganhas e perdidas saem do funil e são achadas em CRM › Encerradas |
| Notas em ordem cronológica, da mais recente para a mais antiga, com o campo de nota nova no topo e "Oportunidade ganha — virou cliente" no histórico |
| A aba Documentos tem só os documentos do cliente. Os do processo ficam no processo |
| Quem tem acesso ao cliente lê e escreve as notas, e o cliente nunca lê |
| Cliente e oportunidade têm dono e participantes, e por enquanto isso só marca quem cuida |
| Todo contato tem nome, telefone e e-mail obrigatórios. O contato pode existir sem oportunidade; a oportunidade nunca existe sem contato |
| Avisos de contato já cadastrado, com o link do contato, e de oportunidade já existente. Na edição, "é a mesma pessoa" não salva e abre o existente |
| Contato com processo vira cliente, com os processos ligados; o Renato completa os dados depois |
| Uma oportunidade pode ter vários vistos. O Ganho cria um processo **separado** por visto, e o cliente que já existe ganha os processos novos no mesmo perfil |
| O Ganho mostra um resumo de vistos e valores, e só move depois da confirmação |
| Processo **nunca** é apagado. Desistência = encerrado |
| A forma de pagamento é definida pelo dono ao enviar a ficha e confirmada ou recusada pelo cliente no formulário. Na recusa, o reenvio pede só o pagamento. A criação manual continua |
| Cada parte do pagamento tem a sua moeda, e o app não converte. A cotação do C6 fica num campo que só a equipe vê |

**Minhas, aceitas pelo Renato sem objeção em 17/nov**

| Decisão |
|---|
| Confirmar pela equipe segue a regra do Ganho. Os itens, antes do Ganho, qualquer membro edita |
| Reabrir volta para a primeira etapa aberta. Ganho → Perdido direto não pode |
| Link de pagamento aberto impede gerar outro, com a frase dizendo qual |
| Forma em rascunho no Ganho conta como "sem forma". Parcelas iguais vão até 36 |
| Avisos da Início: o de recusada some no reenvio, o de confirmada some no Ganho. Vencimento no passado é avisado no resumo |

**Minhas, sem consulta, por serem técnicas**

| Decisão |
|---|
| As quatro abordagens do §4 |
| Quem tem processo ou cobrança é cliente, garantido por gatilho (substitui o CON-3) |
| "Cliente desde" dos atuais vem do primeiro processo ou da primeira cobrança |
| As travas valem também na organização de teste; só a exclusão em cascata passa |
| Uma marca de transação por recurso, desligada no fim da função |

**Minhas, de produto, levadas ao Renato junto com a rodada 3**

| Decisão |
|---|
| O quadro mostra Ganho e Perdido só dos últimos 30 dias, e o resto fica em Encerradas |
| Fora do Ganho, só a gestão torna alguém cliente (processo, cobrança ou "marcar como cliente"), sempre com registro no histórico |
| A cotação do C6 é editável em qualquer estado da forma |
| "Confirmar pela equipe" vale também sem link enviado (forma em rascunho) |
