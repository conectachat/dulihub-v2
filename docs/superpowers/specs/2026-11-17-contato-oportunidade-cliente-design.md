# Contato → oportunidade → cliente — especificação técnica

| | |
|---|---|
| Data | 17/nov/2026 |
| Estado | Rascunho para revisão (Code Reviewer). **Sem plano ainda** |
| Quem decidiu | Renato, no brainstorming de 17/nov |
| Requisitos com ID | Entram em `docs/spec.md` (7.2, 7.3, 7.4, 7.6, 7.7 e o módulo novo 7.16 Clientes) |
| Este documento | O **como**: banco, funções, telas, critério de aceite de cada entrega |

Nada aqui está construído. Cada requisito nasce ⬜.

---

## 1. Por que existe

Hoje contato, oportunidade e cliente parecem **uma coisa só**. No banco, isso é de
propósito: é uma pessoa, com um estágio (`contact → opportunity → client`, spec
§6.1), e isso não muda. O problema está na tela e no fluxo:

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
| Restringir quem vê o cliente pelo dono | Decidido em 17/nov: dono e participantes só **marcam** quem cuida. Todos da Duli continuam vendo tudo |
| "Linha ascendente" (Q10) | Não existe no app. Até existir, quem a substitui é a gestão da organização (`owner`/`admin`) |
| Portal do cliente (7.14) | Fase 6. O desenho não pode impedir: o que o cliente vai ver e o que nunca vai ver está marcado aqui |
| Converter moeda | O app nunca converte. O Renato converte à mão com a cotação do C6 |

**Seria fracasso, mesmo funcionando**

- Ganho que deixa a pessoa cliente **sem** os processos (ou com processo repetido).
- Formulário público que devolve CPF, RG ou endereço a quem tem o link.
- Nota interna visível para o cliente.
- Processo apagado — de qualquer jeito, por qualquer pessoa.
- A equipe inventando e-mail para conseguir salvar um contato.

## 3. Restrições que valem (do `AGENTS.md` e da spec)

- **RLS é a segurança real**; toda tabela nova nasce com RLS, `unique (id,
  organization_id)` e chaves estrangeiras compostas com a organização.
- **A organização vem do registro-pai**: item e forma de pagamento herdam do negócio;
  cobrança e processo herdam **da pessoa** (corrige o I24 neste caminho).
- **Dinheiro**: soma por moeda, nunca uma na outra; nenhum saldo guardado.
- **Uma porta para quem não tem login**: a ficha. Este desenho **alarga** essa porta
  com uma terceira função (§6.4). As mesmas travas valem, e o `AGENTS.md` muda junto.
- **Contato nunca é apagado de vez**; agora **processo também não** (§5.3).
- Migration com RLS + teste vermelho antes; `database.types.ts` no mesmo commit.
- Interface em português; componentes que já existem (`PageHeader`, `EmptyState`,
  `ConfirmAction`, `Tabs` como na tela de Projeto, tokens de cor, raios do `AGENTS.md`).

## 4. Abordagens

As escolhas de "como" foram deixadas comigo. Ficam registradas para o Renato poder
discordar.

### 4.1 Onde mora a tela de Clientes

| | Como | Troca |
|---|---|---|
| **A — escolhida** | `/clientes` e `/clientes/[id]` leem do **servidor**, como Contatos e CRM. A aba Financeiro continua lendo do aparelho, como já faz hoje | Quebra a regra "tela nova nasce migrada". A exceção fica escrita no `AGENTS.md`, com o motivo |
| B | Tela migrada, lendo o espelho | O nome do dono vem de `profiles`, que **nunca** vai ao aparelho. O perfil puxa processos, notas e ficha, que não estão no espelho. Aumentaria o I13 (CPF e endereço no disco) |
| C | Só um filtro na lista de Contatos | Não dá a separação no menu, que é o motivo do pedido |

O motivo da exceção: o perfil do cliente **é** a tela de contato que já existe hoje
(servidor), reorganizada, e o OFF-3 (Contatos e CRM offline) foi despriorizado em
25/set. Quando o OFF-3 voltar, Clientes migra junto com Contatos.

### 4.2 Como o Ganho grava

| | Como | Troca |
|---|---|---|
| **A — escolhida** | Uma função no banco, `ganhar_negocio`, numa transação: negócio, histórico, estágio, processos e cobranças | Mais SQL. Em troca, ou tudo acontece ou nada, e repetir não duplica |
| B | Sequência de chamadas na Server Action, como `mover.ts` hoje | É o I2: "ganho sem processo" quando um passo falha, e duplicado quando se tenta de novo |

### 4.3 Vistos na oportunidade

| | Como | Troca |
|---|---|---|
| **A — escolhida** | Tabela nova `opportunity_items`, ligada a `visa_types`, com o valor gravado no item. `products` e `opportunity_products` são **apagadas** (estão vazias e carregam os defeitos I10 e N1) | Some o catálogo genérico de produtos. Se um dia a Duli vender algo que não é visto, ele vira um tipo de visto ou volta com desenho próprio |
| B | Usar `products`, com cada produto ligado a um visto | Dois cadastros para manter o mesmo preço |

### 4.4 Resposta do cliente à forma de pagamento

| | Como | Troca |
|---|---|---|
| **A — escolhida** | O mesmo link da ficha, com uma terceira função anônima (`responder_forma_de_pagamento`) | Alarga a porta sem login, com as mesmas travas da 0035 |
| B | Página e token separados para o pagamento | Duas portas sem login, cada uma com suas travas para manter |

---

## 5. A jornada nova

```
Contato (nome, telefone, e-mail — aviso de duplicado)
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
```

O caminho manual continua existindo em cada passo: a ficha preenchida pela equipe, a
forma de pagamento confirmada pela equipe, a cobrança criada à mão e o Ganho sem
forma de pagamento.

---

## 6. Entregas

Cada entrega funciona sozinha e vai ao ar sozinha, na ordem abaixo.

### 6.0 Entrega 0 — arrumar a casa

| O quê | Por quê |
|---|---|
| Aplicar e fazer commit das migrations 0037 e 0038, que estão hoje fora do git, com os testes já alterados em `tests/rls/` | Mexem na mesma área: criação de negócio e atribuição |
| Cópia do banco (`pg_dump`, spec §12.7) antes de cada migration destas entregas | Não há banco de teste nem cópia automática (OPS-1) |

### 6.1 Entrega 1 — contato completo e sem duplicata

| ID | Requisito | Pri. |
|---|---|---|
| CON-8 | Nome, telefone (com DDI) e e-mail **obrigatórios** ao criar e ao editar um contato, em qualquer tela que crie ou edite | P0 |
| CON-4 | **Aviso de contato já cadastrado** ao criar e ao editar (sobe de P1 para P0) | P0 |
| CRM-11 | **Nova oportunidade** com "contato existente" ou "novo contato" no mesmo formulário, numa gravação só | P0 |
| CRM-12 | **Aviso de oportunidade já existente** para o contato escolhido | P0 |

**Regras**

- *Obrigatórios.* O telefone é DDI + número. O DDI vem com +55 já marcado (isso fecha
  o M4). O número tem de 8 a 15 dígitos depois de tirar máscara e espaço. O e-mail
  precisa ter formato válido.
- *Onde a regra mora.* No schema Zod que todas as telas usam (`personSchema`), e
  **não** como `not null` no banco. Três motivos: as 3 linhas antigas sem telefone e
  e-mail, a importação em lotes do app antigo, e a lixeira (mandar um desses 3 para a
  lixeira não pode falhar por falta de e-mail). Contato antigo incompleto só cobra os
  campos quando alguém o edita. O comentário de `people/schema.ts` que defendia "só o
  nome" é reescrito com a decisão nova.
- *Duplicado.* O app compara, entre os contatos que o usuário enxerga, **inclusive os
  da lixeira**:
  - o e-mail, sem diferenciar maiúscula e sem espaço;
  - o telefone, só pelos dígitos com o DDI. Quando o contato antigo não tem DDI, vale
    o número nacional.
- *Aviso de contato.* Diz qual campo bateu e com quem, por exemplo "Telefone já
  cadastrado em **Carlos Lima** (cliente)". Contato na lixeira aparece marcado como
  "na lixeira". Depois pergunta **"É a mesma pessoa?"**:
  - **Sim**: não cria nada. Na tela de Contatos, abre o existente. Na oportunidade,
    passa a usar o existente. Se ele estiver na lixeira, oferece restaurar.
  - **Não**: pergunta "Criar outro contato com essas informações?". Se confirmar, cria.
- *Aviso de oportunidade.* Se o contato já tem oportunidade (aberta, ganha ou
  perdida), mostra cada uma com título, situação e data de criação, e pergunta "Criar
  outra oportunidade para este contato?".
- *O servidor confere de novo.* A confirmação viaja como parâmetro
  (`confirmar_contato_parecido`, `confirmar_outra_oportunidade`). Sem ela, a gravação
  é recusada quando há parecido. A tela não é a única trava.

**Banco**

| Peça | Descrição |
|---|---|
| `private.telefone_normalizado(ddi text, numero text) returns text` | `immutable`. Só os dígitos de DDI + número. Usada nos índices e na busca |
| Índices em `people` | `(organization_id, lower(btrim(email)))` e `(organization_id, private.telefone_normalizado(phone_country_code, phone))` |
| `public.contatos_parecidos(p_email text, p_ddi text, p_telefone text, p_ignorar uuid default null)` | `security invoker`, `stable`. Devolve `id, full_name, lifecycle_stage, na_lixeira, bate_email, bate_telefone`. A RLS decide quem aparece. `p_ignorar` exclui o próprio contato quando é edição |
| `public.criar_oportunidade(p_contato uuid, p_novo_contato jsonb, p_etapa uuid, p_titulo text, p_origem text, p_confirmar_contato_parecido boolean, p_confirmar_outra_oportunidade boolean) returns uuid` | `security invoker`, uma transação. Recebe exatamente um entre `p_contato` e `p_novo_contato`. Cria o contato quando é novo, valida os obrigatórios e confere duplicado e oportunidade existente. Insere o negócio com a organização da pessoa, dono = quem chamou, e etapa aberta (regra da 0038). Promove a pessoa a `opportunity` sem rebaixar cliente. Erros em português, com `errcode` próprio para "precisa confirmar" |

`createOpportunity` passa a chamar `criar_oportunidade`. `createPerson` e
`updatePerson` chamam `contatos_parecidos` antes de gravar e recusam sem a
confirmação.

**Telas**

- **Contatos › Novo contato e Editar:** os campos obrigatórios marcados; ao salvar,
  aparece o diálogo de aviso quando há parecido.
- **CRM › Nova oportunidade:**
  - seletor "Contato existente | Novo contato". No modo novo, os campos do contato
    aparecem no mesmo formulário;
  - os avisos são diálogos em sequência: primeiro o de contato, depois o de
    oportunidade.

**Critério de aceite**

- Criar contato sem e-mail, sem telefone ou sem DDI é recusado na tela, com a frase do
  campo que falta.
- Com Carlos (+55 31 99999-0000) cadastrado, criar "Ana" com "31 99999 0000" e DDI
  +55 mostra "Telefone já cadastrado em Carlos Lima". Então:
  - "Sim" não cria ninguém;
  - "Não" seguido de "Criar outro" cria Ana com o mesmo telefone.
- O mesmo vale para o e-mail "CARLOS@x.com" contra "carlos@x.com".
- Chamar a ação sem a confirmação, com um parecido existente, não grava nada.
- Nova oportunidade com contato novo, quando o negócio falha (por exemplo, etapa
  terminal), **não deixa contato criado pela metade**.
- Contato com oportunidade de 10/mar: "Nova oportunidade" mostra "Já existe:
  *EB-2 NIW* (ganha, 10/mar)". Confirmar cria a segunda.
- Editar um dos contatos antigos sem e-mail exige preencher o e-mail antes de salvar.
  Mandá-lo para a lixeira continua funcionando.

### 6.2 Entrega 2 — Clientes

| ID | Requisito | Pri. |
|---|---|---|
| CLI-1 | Item **Clientes** no menu, logo abaixo do CRM. A lista mostra nome, e-mail, telefone, dono, cliente desde e o botão **Abrir**, com busca no topo por nome, e-mail ou telefone | P0 |
| CLI-2 | **Perfil do cliente**: cabeçalho numa linha e abas Dados cadastrais, Financeiro, Projetos, Documentos e Notas | P0 |
| CLI-3 | Botão de **copiar** ao lado do telefone e do e-mail | P0 |
| CLI-4 | Aba **Dados cadastrais**: a ficha inteira (contratante, endereço, dependentes) e a situação do link | P0 |
| CLI-5 | Aba **Financeiro**: as cobranças, os totais por moeda (contratado, pago, saldo devedor, vencido), parcelas, dar e desfazer baixa, criar cobrança à mão | P0 |
| CLI-6 | Anexar **boleto, nota fiscal ou comprovante** à parcela, ver e baixar (é o REC-5, que sobe para este módulo) | P1 |
| CLI-7 | Aba **Projetos**: os processos do cliente (título, visto, andamento %, situação). Clicar abre o processo | P0 |
| CLI-8 | Aba **Documentos**: arquivos do cliente por categoria (identidade, passaporte, comprovante de residência, contrato, outro), com enviar, ver, baixar e excluir com aviso. Os documentos do processo ficam só no processo | P0 |
| CLI-9 | Aba **Notas**: as notas e o histórico desde a fase de lead, mais criar nota. **O cliente nunca lê**; quem tem acesso ao cliente lê e escreve | P0 |
| CLI-10 | **Dono e participantes** do cliente e da oportunidade. No Ganho, o cliente herda | P1 |
| CLI-11 | **Cliente desde**: gravado no primeiro Ganho, editável à mão (para os antigos) | P0 |
| CLI-12 | **Marcar como cliente** à mão, para os clientes antigos e para os 2 contatos com processo | P0 |
| CLI-13 | **Cliente não volta a ser lead**, garantido no banco (fecha o M17) | P0 |

**Banco**

| Peça | Descrição |
|---|---|
| `people.client_since date` | Nulo para quem não é cliente e para os antigos, até alguém preencher. Um gatilho preenche com a data de hoje (fuso de São Paulo) quando o estágio vira `client` e o campo está nulo |
| `people.owner_id uuid` | Dono. FK composta `(organization_id, owner_id)` → `organization_members (organization_id, user_id)`, `on delete set null (owner_id)`. Assim, só um membro da organização da pessoa pode ser dono |
| `person_participants` | `(person_id, user_id)` como chave, mais `organization_id`, `created_at`, `created_by`, `updated_at`. FK `(person_id, organization_id)` → `people`, com cascade. FK `(organization_id, user_id)` → `organization_members`, com cascade. RLS: membros da organização leem e gravam. Fica fora do espelho |
| `opportunity_participants` | O mesmo desenho, ligado a `opportunities`. O dono do negócio continua em `opportunities.owner_id` |
| Gatilho `cliente_nao_volta` em `people` | `old.lifecycle_stage = 'client'` e `new <> 'client'` é recusado **sempre**, inclusive sem usuário. A importação deixa de mandar rebaixamento (`migration/import-people.mjs` passa a não sobrescrever o estágio de quem já é cliente) |
| `people_guard_self_update` | No portal, o cliente também não muda `owner_id` nem `client_since` |
| `notes` e `activities`, leitura | A policy de leitura passa de `can_access_person` (que inclui o cliente logado) para **membros da organização e da organização atribuída**. O cliente do portal deixa de ler (POR-2). A escrita não muda |
| `files` | Ganha `category text not null default 'outro'`, com `check` em `identidade`, `passaporte`, `comprovante_residencia`, `contrato` e `outro`. A FK de `opportunity_id` vira composta (fecha a parte de `files` do N1) |
| Depósito `pessoas` | Privado, até 20 MB, os mesmos tipos de arquivo do depósito `documentos`. Caminho `{org}/{pessoa}/{arquivo}/{nome}`. Policies de leitura, gravação e exclusão pela pasta da organização, como em `documentos` (0020) |
| `installment_files` | `id`, `organization_id`, `installment_id`, `kind` (`boleto`, `nota_fiscal`, `comprovante` ou `outro`), `filename`, `storage_path`, `mime_type`, `size_bytes`, `uploaded_by`, `created_at` e `updated_at`. FK `(installment_id, organization_id)` → `installments`, com cascade. RLS de membros. Fica fora do espelho |
| Depósito `financeiro` | Privado, como `pessoas`. Caminho `{org}/{cobrança}/{parcela}/{arquivo}/{nome}` |
| Dados | Os clientes atuais recebem como dono o `owner` da organização (o Renato). `client_since` fica nulo e aparece como "—" |

**Telas e rotas**

- **`/clientes`** (servidor):
  - lista as pessoas com `lifecycle_stage = 'client'` e fora da lixeira, em ordem de
    nome;
  - a busca acha por nome, e-mail ou dígitos do telefone;
  - mostra 50 por página, com o total ("mostrando 50 de 72"). Nada é cortado sem
    aviso (é o defeito M1 de não repetir);
  - lista vazia usa `EmptyState`;
  - no celular, cada linha vira um cartão.
- **`/clientes/[id]`** (servidor):
  - é o perfil;
  - `/contatos/[id]` de quem é cliente **redireciona** para cá;
  - quem não é cliente continua em `/contatos/[id]`, com a regra do CON-3 como hoje;
  - o componente da página é **movido**, não copiado.
- **Cabeçalho, numa linha** (quebra no celular):
  - nome e selo "Cliente";
  - telefone e e-mail, cada um com o botão copiar (ícone `text-primary`, e "Copiado"
    ao clicar);
  - Dono, Cliente desde e Editar.
- **As abas** usam o mesmo `Tabs` da tela de Projeto. A aba aberta fica na URL
  (`?aba=financeiro`), para um link poder abrir direto nela. Cada aba:
  - **Dados cadastrais**: reaproveita `DadosCadastrais`, em três blocos (Contratante,
    Endereço, Dependentes), com a situação da ficha (recebida em, conferida) e o link;
  - **Financeiro**:
    - reaproveita `cobrancas.tsx`, que já lê do aparelho;
    - os totais por moeda vêm da mesma função de hoje (`totals.ts`);
    - os anexos só funcionam com internet. Sem rede, aparece "Anexos precisam de
      internet";
  - **Projetos**: a mesma conta de andamento da lista de Projetos;
  - **Documentos**:
    - o formulário de envio fica no topo;
    - a lista é agrupada por categoria;
    - ver e baixar usam URL assinada de curta duração;
    - excluir passa por `ConfirmAction`, que remove o registro e o arquivo;
  - **Notas**:
    - "nova nota" fica no topo;
    - abaixo vem a linha do tempo de hoje (`timeline.tsx`): notas e atividades,
      inclusive da fase de lead.
- **Editar** abre o diálogo do contato e acrescenta dono, participantes e cliente
  desde.
- **Marcar como cliente** (CLI-12):
  - é um botão em `/contatos/[id]`, só para a gestão;
  - pede confirmação e a data de "cliente desde" (hoje já preenchido, editável);
  - registra no histórico.
- **Lugares que mudam de endereço:**
  - `enderecoDoCartao` (`opportunities/regras.ts`);
  - o `redirect` do Ganho;
  - o botão "Abrir perfil do cliente" na tela do lead;
  - o menu lateral (desktop e celular; conferir que sete itens cabem no celular);
  - a lista `TOPO` da fumaça (`/clientes`).

**Critério de aceite**

- O menu mostra Clientes abaixo do CRM.
- `/clientes` lista os 27 clientes de hoje, todos com dono "Renato".
- Buscar "9999" acha pelo telefone, e "@gmail" acha pelo e-mail.
- Abrir um cliente pelo endereço `/contatos/<id>` leva a `/clientes/<id>`.
- O botão copiar põe o telefone com DDI na área de transferência.
- Uma nota criada no CRM, quando a pessoa ainda era lead, aparece na aba Notas
  depois do Ganho.
- Sessão de cliente (portal, conta de teste) lendo `notes` e `activities` recebe zero
  linhas. Teste de RLS vermelho antes.
- Atualizar `lifecycle_stage` de `client` para `opportunity`, pela API ou sem
  usuário, é recusado. Teste de RLS vermelho antes.
- Documento enviado na aba Documentos fica no depósito `pessoas`, sob a pasta da
  organização. Usuário de outra organização não lê. Teste de RLS e de Storage.
- Boleto anexado à parcela 2 aparece só na parcela 2 e abre por URL assinada.
- "Marcar como cliente" num contato com processo o faz aparecer em `/clientes`, com
  a data escolhida.
- Fumaça: `/clientes` e `/clientes/<id de teste>` respondem 200.

### 6.3 Entrega 3 — vistos na oportunidade e Ganho com resumo

| ID | Requisito | Pri. |
|---|---|---|
| CRM-13 | Oportunidade com **um ou mais vistos** do catálogo, cada um com valor e moeda. O valor é sugerido pelo preço do visto e fica gravado no item. Substitui o CRM-6 | P0 |
| CRM-14 | **Ganho com resumo**: contato, vistos e valores, totais por moeda, forma de pagamento e o que vai acontecer. Só após confirmar, numa gravação só: negócio ganho, histórico, cliente, dono, um processo por visto e as cobranças | P0 |
| CRM-15 | Reabrir um ganho pede confirmação também no quadro (fecha o I3). Reabrir não rebaixa ninguém nem apaga processo. Ganhar de novo não duplica processo nem cobrança | P0 |
| CRM-10 | Ganho e reabrir: só o dono do negócio ou a gestão da organização (no lugar da "linha ascendente" até a Q10) | P0 |
| PRO-12 | **Processo nunca é apagado**, por ninguém (exceto na organização de teste). Desistência = situação **encerrado** | P0 |

**Regras**

- *Item.* O item guarda o nome do visto (`visa_name`) e o valor **no momento da
  negociação**. Mudar o preço nas Configurações não mexe em oportunidade.
  - A moeda do item vem da moeda do visto e pode ser trocada.
  - Se o visto tem preço noutra moeda, o valor vem **em branco** (nunca convertido).
- *Total da oportunidade.* Sai da soma dos itens **por moeda**, por exemplo "US$ 8.000
  + R$ 5.000". As colunas `opportunities.value` e `currency` deixam de existir.
- *Itens travados no Ganho.* Depois do Ganho, os itens não mudam. Desistir de um visto
  depois do Ganho é **encerrar o processo** dele. Antes do Ganho, o dono tira o item.
- *Ganho recusado* quando:
  - não há item;
  - um item está sem visto (porque o visto foi apagado das Configurações). A mensagem
    diz qual e pede para trocar;
  - a pessoa está na lixeira;
  - quem confirma não é o dono do negócio nem da gestão.
- *Processo do Ganho.* Um por item, pelo `criar_processo` de hoje (molde copiado,
  §6.4 da spec). O título é "‹visto› — ‹nome do cliente›". A ligação com o item fica
  gravada, e é isso que impede o processo repetido.
- *Cliente que já existe.* Ganha os processos novos.
  - O dono dele não muda. O dono do negócio entra como participante, se ainda não for.
  - O "cliente desde" não muda.
- *Cobranças no Ganho* (dependem da entrega 4; antes dela, o resumo diz "forma de
  pagamento: definir na aba Financeiro"):
  - com forma de pagamento **confirmada**, nasce uma cobrança por parte;
  - com forma enviada ou recusada, o resumo mostra a situação e oferece a caixa "criar
    as cobranças mesmo assim" (desmarcada);
  - sem forma, nenhuma cobrança nasce, e a aba Financeiro mostra "Nenhuma cobrança.
    Criar cobrança".

**Banco**

| Peça | Descrição |
|---|---|
| `opportunity_items` | `id`, `organization_id`, `opportunity_id`, `visa_type_id` (nulo), `visa_name text not null`, `amount numeric(12,2) not null check (amount >= 0)`, `currency char(3) check in ('BRL','USD')`, `position int`, `created_by`, `created_at`, `updated_at`, `unique (id, organization_id)`. FK `(opportunity_id, organization_id)` → `opportunities`, com cascade. FK `(visa_type_id, organization_id)` → `visa_types`, `on delete set null (visa_type_id)`. RLS igual à de `opportunities`. Gatilho: item de negócio ganho não é inserido, alterado nem apagado. Fica fora do espelho |
| `projects.opportunity_item_id uuid` | Índice único parcial (quando não nulo). FK `(opportunity_item_id, organization_id)` → `opportunity_items`, `on delete set null` |
| `projects`, exclusão | A policy `for all` se divide em select, insert e update, sem delete. Um gatilho recusa `delete` fora da organização de teste (o mesmo desenho de `people` na 0036) |
| `criar_processo` | Ganha `p_item uuid default null`, gravado em `opportunity_item_id` |
| `public.ganhar_negocio(p_negocio uuid, p_cobrancas_sem_confirmacao boolean default false) returns jsonb` | `security invoker`, uma transação. Passos: (1) trava a linha do negócio; (2) confere a permissão (CRM-10), o negócio aberto e as regras acima; (3) move para a etapa de ganho do funil dele, com `closed_at`; (4) registra no histórico; (5) pessoa: estágio `client`, `client_since` e dono quando nulos, participantes do negócio somados aos da pessoa; (6) para cada item sem processo, `criar_processo`; (7) cobranças (entrega 4), uma por parte ainda sem cobrança; (8) devolve os ids criados |
| `public.reabrir_negocio(p_negocio uuid)` | Confere o CRM-10, volta o negócio para a primeira etapa aberta do funil, limpa `closed_at` e registra no histórico. Não toca em pessoa, processo nem cobrança |
| `opportunities.value`, `currency` | O valor de cada negócio existente vira um item **sem visto** (`visa_name` = título do negócio). Depois disso, as colunas são apagadas. Hoje são 2 negócios |
| `products`, `opportunity_products` | Apagadas (0 linhas hoje). Fecha o I10 e a parte delas no N1 |

**Telas**

- **Tela do lead (`/crm/[id]`)**: o cartão "Negócio" ganha a lista **Vistos**:
  - adicionar visto (seletor dos vistos ativos), com o valor e a moeda preenchidos;
  - editar valor e moeda, e remover;
  - o total aparece por moeda.
- **Cartão do quadro**: mostra os totais por moeda no lugar do valor único.
- **Botão Ganho, ou soltar na coluna Ganho**: abre o **diálogo de resumo**:
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
- **Arrastar para fora do Ganho**, ou trocar o seletor: pede confirmação ("Reabrir
  este negócio?"). Recusar devolve o cartão.
- **Depois de confirmar**: vai para `/clientes/[id]?aba=projetos`.

**Critério de aceite**

- Oportunidade com EB-1A (US$ 8.000) e O-1 (US$ 6.000): o Ganho cria 2 processos com
  as etapas e pastas do molde de cada visto. A pessoa aparece em `/clientes`.
- Ganho sem visto, ou com um item sem visto, é recusado com a frase certa, e nada
  muda: nem etapa, nem pessoa, nem processo.
- Um processo que falhe no meio, por exemplo um visto sem etapa válida, desfaz tudo:
  o negócio continua aberto e a pessoa no estágio anterior. Teste no banco.
- Chamar `ganhar_negocio` duas vezes seguidas: a segunda é recusada (negócio já
  ganho), e há um processo por item.
- Reabrir e ganhar de novo, depois de acrescentar um visto: nasce **só** o processo
  do visto novo.
- Usuário `staff` que não é dono do negócio é recusado, no banco e na tela. Teste de
  RLS vermelho antes.
- `delete` em `projects` pela API é recusado na organização real. Na organização de
  teste, passa.
- Mudar o preço do EB-1A nas Configurações não muda o item de uma oportunidade aberta.
- Visto em dólar com a oportunidade em real: o valor vem em branco. Nada é convertido.

### 6.4 Entrega 4 — forma de pagamento na ficha

| ID | Requisito | Pri. |
|---|---|---|
| FIC-7 | **Enviar ficha** pela oportunidade abre a janela da **forma de pagamento**: vistos e total, as partes (cartão até 10x sem juros ou até 18x com juros, parcelas iguais, entrada com forma e moeda + parcelas, à vista), com as datas. Depois vem o resumo e a confirmação, e só então o link | P0 |
| FIC-8 | O cliente, depois dos dados pessoais, vê a forma de pagamento e responde **Confirmo** ou **Há algo errado** (motivo opcional) | P0 |
| FIC-9 | Recusada: o dono ajusta e reenvia. O link novo abre **direto no pagamento**, com "seus dados já foram recebidos ✓", sem mostrar os dados de novo | P0 |
| FIC-10 | **Confirmação pela equipe** (o cliente confirmou por fora), registrando quem confirmou | P0 |
| FIC-11 | **Cotação usada (C6)**: campo da equipe na forma de pagamento. O cliente nunca vê | P1 |
| REC-6 | As cobranças nascem no Ganho, da forma de pagamento confirmada (uma por parte). Antes, dependia do contrato (CTR-2) | P0 |

**Regras**

- *Partes.* Cada parte tem o seu valor **na sua moeda**: por exemplo, entrada de
  R$ 10.000 no cartão e 3 × US$ 3.000 por transferência. O total aparece por moeda.
  O app não converte. O Renato converte à mão com a cotação do C6 e, se quiser,
  anota a cotação no campo FIC-11.
- *Coerência com os vistos.* Quando vistos e partes estão todos na **mesma** moeda e
  os totais diferem, o resumo **avisa**, mas não bloqueia. Com moedas diferentes não
  há conta possível, e o resumo mostra os dois lados.
- *Cartão.* Até 10 parcelas sem juros ou até 18 com juros.
  - Vira **um** pagamento, numa data (a da cobrança no cartão), com a anotação "6x
    sem juros".
  - Não se acompanha parcela a parcela, porque quem cobra é a operadora.
- *Parcelas iguais.* O valor total é dividido sem perder centavo, com a mesma regra
  de hoje (`financeiro/regras.ts`).
  - As datas são geradas mês a mês a partir da primeira e podem ser editadas uma a
    uma.
  - A soma das parcelas tem de bater com o total da parte. Senão, não se envia.
- *Estados.* `rascunho → enviada → confirmada | recusada`.
  - Recusada volta a `rascunho` quando o dono edita.
  - Confirmada trava as partes. Para mudar, o dono usa "refazer forma de pagamento",
    que volta a `rascunho` e exige reenvio.
- *A prova.* A resposta do cliente guarda uma **cópia** do que ele viu (partes,
  parcelas, vistos). Editar a forma depois não muda a cópia, e ninguém da equipe
  altera nem apaga a resposta.
- *O link.* Continua de uso único, 15 dias, um aberto por pessoa.
  - Com forma de pagamento, ele **não fecha** ao enviar os dados: fecha quando o
    pagamento é respondido.
  - No reenvio, o link novo é do modo `so_pagamento`.
  - Se a pessoa já tinha ficha enviada (por exemplo, de um negócio antigo), o dono
    escolhe na janela "pedir os dados pessoais de novo" (desmarcado por padrão).
- *Sem oportunidade.* "Gerar link da ficha" no contato continua como hoje, sem forma
  de pagamento.

**Banco**

| Peça | Descrição |
|---|---|
| `payment_plans` | `id`, `organization_id`, `opportunity_id` (único: uma forma por negócio), `status` (`rascunho`, `enviada`, `confirmada` ou `recusada`), `reference_rate numeric(12,4)`, `reference_rate_note text`, `created_by`, `created_at`, `updated_at`. FK `(opportunity_id, organization_id)` → `opportunities`, com cascade. RLS: só membros (o cliente nunca lê, por causa da cotação) |
| `payment_plan_parts` | `id`, `organization_id`, `plan_id`, `position`, `label text` ("Entrada", "Parcelas"…), `method` (o mesmo `check` de `installments.method`), `currency` (BRL ou USD), `total numeric(12,2) > 0`, `installments_count int` (de 1 a 18), `card_with_interest boolean` (só com `method = 'cartao'`: sem juros até 10, com juros até 18). FK composta para o plano, com cascade |
| `payment_plan_installments` | `id`, `organization_id`, `part_id`, `number`, `amount numeric(12,2) > 0`, `due_on date`, `unique (part_id, number)`. No cartão, uma linha só |
| `payment_plan_responses` | `id`, `organization_id`, `plan_id`, `registration_form_id` (nulo quando é a equipe), `decision` (`confirmada`, `recusada` ou `confirmada_pela_equipe`), `reason text` (até 500), `snapshot jsonb not null`, `answered_at`, `answered_by` (nulo quando é o cliente). Só aceita inserção: um gatilho recusa update e delete |
| `registration_forms` | Ganha `payment_plan_id` (FK composta, nulo) e `mode` (`completa` ou `so_pagamento`, padrão `completa`). A regra "um link aberto por pessoa" passa a considerar o link fechado só depois da última etapa respondida |
| `receivables.payment_plan_part_id` | Único quando não nulo. FK composta, `on delete set null`. É o que impede cobrança repetida no Ganho |
| `public.salvar_forma_de_pagamento(p_negocio uuid, p_forma jsonb)` | `security invoker`, uma transação. Substitui partes e parcelas, valida somas, limites do cartão e moedas. A organização vem do negócio. Recusa se a forma está `confirmada` |
| `public.enviar_forma_de_pagamento(p_negocio uuid, p_pedir_dados_de_novo boolean) returns text` | `security invoker`. Exige pelo menos um item e forma completa. Cancela o link aberto, cria o link (token como na 0035) com `payment_plan_id` e o modo, põe a forma em `enviada`, registra no histórico e devolve o token |
| `public.confirmar_forma_de_pagamento_pela_equipe(p_negocio uuid, p_observacao text)` | `security invoker`. Grava a resposta `confirmada_pela_equipe`, com a cópia e quem confirmou |
| `public.refazer_forma_de_pagamento(p_negocio uuid)` | Volta para `rascunho`. Só o dono do negócio ou a gestão |
| `abrir_ficha_de_cadastro` (anônima) | Passa a devolver também `modo` e `forma_de_pagamento jsonb`: vistos (nomes) e partes (rótulo, método, moeda, total, nº de parcelas, juros, parcelas com número, valor e vencimento). **Nunca** a cotação, documento ou endereço |
| `enviar_ficha_de_cadastro` (anônima) | Não muda. Só deixa de fechar o link quando há forma de pagamento |
| `public.responder_forma_de_pagamento(p_token text, p_aceita boolean, p_motivo text)` (anônima, **nova**) | `security definer`, só `anon` executa, travas da 0035: o token é a única chave e a linha é travada antes de gravar. Exige dados já enviados (modo `completa`) ou o modo `so_pagamento`. Monta a cópia **no banco**, a partir da forma atual (nada vem do navegador além de sim, não e motivo). Grava a resposta, muda a situação da forma, registra no histórico e fecha o link |
| `ganhar_negocio` | O passo (7) cria, por parte, uma cobrança com a organização **da pessoa**: título "‹rótulo› — ‹vistos›", `amount` = total, moeda da parte e `payment_plan_part_id`. As parcelas copiam as da forma (`method` da parte). No cartão, uma parcela com a anotação "Nx com/sem juros" |

**Telas**

- **Tela do lead**: o cartão **Forma de pagamento** mostra:
  - a situação, num selo: rascunho, enviada, confirmada em ‹data› ou recusada, com o
    motivo;
  - os botões Definir/Editar, Enviar ficha, Copiar link, WhatsApp (como o FIC-4),
    Confirmar pela equipe e Refazer.
- **Janela "Enviar ficha"**, em dois passos:
  1. **Forma de pagamento**:
     - os vistos e o total por moeda;
     - os botões **+ Entrada**, **+ Parcelas**, **+ Cartão** e **+ À vista**. Cada
       parte tem rótulo, método, moeda, valor total, nº de parcelas, juros (no
       cartão), 1ª data e as datas geradas, editáveis;
     - o campo "Cotação usada (C6) — só a equipe vê";
     - a caixa "pedir os dados pessoais de novo", quando ela se aplica.
  2. **Resumo**: tudo o que o cliente vai ver, mais o aviso de coerência, e o botão
     "Confirmar e gerar link".
- **Formulário público (`/cadastro/<token>`)**:
  - depois de "Enviar dados", ou direto no modo `so_pagamento`, vem a etapa "Forma de
    pagamento", com a lista das partes e parcelas;
  - os botões são **Confirmo** e **Há algo errado**. O segundo abre o campo de motivo
    (opcional) e "Enviar";
  - a tela final diz o que acontece agora.
- **Início**: aviso de "forma de pagamento recusada" (com o motivo) e de "confirmada:
  pronto para o contrato".

**Critério de aceite**

- O dono monta: entrada R$ 10.000 no pix em 10/nov, mais 3 × US$ 3.000 por
  transferência a partir de 10/dez. O resumo mostra "R$ 10.000 + US$ 9.000" e as 4
  datas.
- Cartão sem juros com 11 parcelas é recusado. Com juros, até 18 é aceito.
- Parcelas que somam diferente do total da parte não deixam enviar.
- O cliente abre o link: a primeira etapa são os dados pessoais e, depois deles, a
  forma de pagamento.
  - **Não** aparece a cotação.
  - A resposta do servidor ao abrir **não contém** CPF, RG nem endereço. Teste da
    função anônima.
- "Confirmo": a forma vira `confirmada`, o link fecha, a Início avisa e o histórico
  registra.
- "Há algo errado" com motivo: a forma vira `recusada` e o motivo aparece no lead.
  Os dados pessoais já estão gravados no contato.
- Reenviar depois de ajustar: o link novo abre **direto** no pagamento, com "seus
  dados já foram recebidos ✓".
- Editar a forma depois da resposta não muda a cópia guardada. `update` e `delete`
  em `payment_plan_responses` pela API são recusados. Teste de RLS.
- `responder_forma_de_pagamento` com um token vencido, já respondido ou inventado
  não grava nada. Só `anon` executa. O aviso do Supabase "definer executável por
  anon" aparece para as **três** funções da ficha e para nenhuma outra.
- Ganho com a forma confirmada: nascem 2 cobranças (uma em R$ com 1 parcela, uma em
  US$ com 3), com a organização da pessoa. Ganhar de novo não duplica.
- "Confirmar pela equipe" registra quem confirmou e libera o Ganho com cobranças.
- Um usuário do portal (conta de teste de cliente) não lê `payment_plans` e nunca vê
  `reference_rate`.

### 6.5 Entrega 5 — contrato e ZapSign (não está neste desenho)

Fica para a spec 7.5, com Q1, Q2, Q4 e Q14. O que este desenho deixa pronto para ela:

- a forma de pagamento confirmada, com a cópia;
- os dados da ficha;
- o depósito `pessoas`, com a categoria `contrato`, que é onde o PDF assinado vai
  morar.

O aviso do ZapSign só registra o fato e **oferece** o Ganho (decidido em 17/nov). O
Ganho continua sendo o `ganhar_negocio` desta entrega 3.

---

## 7. Dados que já existem

| Dado | O que acontece |
|---|---|
| 27 clientes, 26 sem negócio ganho | Aparecem em Clientes. Dono = Renato. "Cliente desde" fica "—" até alguém preencher |
| 2 contatos com processo que não são clientes | Continuam em Contatos. O Renato usa "Marcar como cliente" (CLI-12) |
| 3 contatos sem telefone e e-mail | Nada muda até alguém editar, e aí os campos são cobrados |
| 49 contatos "oportunidade" sem negócio | Ficam como estão. É decisão do Renato, fora deste desenho |
| 2 negócios com valor | O valor vira um item sem visto. O negócio aberto precisa de um visto antes do Ganho |
| Clientes antigos que o Renato vai subir | Pela importação, já como `client`, sem oportunidade, com `client_since` quando se souber. O script deixa de rebaixar estágio |

## 8. Segurança e LGPD

- **Porta anônima.** Passa de duas para **três** funções, e o `AGENTS.md` muda junto.
  - O que sai pelo link: o nome, o contato e, agora, a forma de pagamento (valores,
    datas e vistos).
  - O que nunca sai: documento, endereço e cotação.
  - O que entra pelo link: só "sim", "não" e um motivo de até 500 caracteres.
- **Notas e histórico.** O cliente deixa de ler, antes de o portal existir (POR-2).
- **Arquivos novos** (`pessoas` e `financeiro`):
  - entram na cópia de segurança (OPS-1) e na anonimização (CON-7);
  - a pasta por pessoa (`{org}/{pessoa}/…`) existe para a anonimização apagar de uma
    vez.
- **A prova da forma de pagamento** (`payment_plan_responses`) não se edita. A mesma
  fraqueza do I11 (texto do aceite reescrevível) **não** se repete aqui.
- **Dono e participantes** não mudam a RLS de leitura. Todos os membros da
  organização continuam vendo todos os clientes. Quando houver níveis de acesso, a
  restrição se liga sobre `owner_id` e os participantes.

## 9. Sem internet

- **Clientes** (lista e perfil) leem do servidor: sem rede, aparece a tela de "precisa
  de internet" que as outras telas não migradas já mostram. A exceção à regra fica no
  `AGENTS.md`.
- **A aba Financeiro** continua lendo do aparelho: cobranças, parcelas e baixa
  funcionam sem rede. Os anexos precisam de internet.
- **As tabelas novas** ficam fora do espelho. `people` ganha colunas novas, que só
  chegam aos aparelhos com a correção do I23. Nenhuma tela migrada depende delas.

## 10. Celular

- **Cabeçalho do perfil**: quebra em duas ou três linhas.
- **Abas**: rolam na horizontal.
- **Lista de Clientes**: vira cartões.
- **Janela da forma de pagamento**: uma coluna, com cada parte num bloco.
- **Formulário público**: já é pensado para celular, e a etapa de pagamento segue o
  mesmo padrão.

## 11. O que fica com quem constrói

- O nome exato das migrations, a ordem dos commits e a divisão de cada entrega em
  tarefas.
- Os nomes dos componentes e onde ficam:
  - o perfil é **movido** de `contatos/[id]` para `clientes/[id]`, e o que os dois
    usam sobe para `src/components/` ou `lib/`;
  - nenhuma feature importa de outra.
- O texto exato das mensagens, dentro do tom do app.
- O ícone do item Clientes no menu.

## 12. Perguntas em aberto

| # | Pergunta | Bloqueia |
|---|---|---|
| Q10 | Quem é a "linha ascendente". Até lá, a gestão faz esse papel no CRM-10 | Nada aqui |
| Q1, Q2, Q4, Q14 | As do contrato | Só a entrega 5 |

## 13. Decisões de 17/nov (Renato)

| Decisão |
|---|
| A assinatura do contrato só **oferece** o Ganho; o dono confirma. O Ganho automático fica para quando o fluxo inteiro estiver funcionando |
| **Clientes** tem item próprio no menu. A lista mostra nome, e-mail, telefone, dono, cliente desde e Abrir, com busca por nome, e-mail ou telefone |
| Perfil do cliente: cabeçalho numa linha, com copiar no telefone e no e-mail, e as abas Dados cadastrais, Financeiro, Projetos, Documentos e Notas (forma A do esboço) |
| A aba Documentos tem só os documentos do cliente. Os do processo ficam no processo |
| Quem tem acesso ao cliente lê e escreve as notas, e o cliente nunca lê. As notas da fase de lead aparecem no perfil |
| Cliente e oportunidade têm **dono** e **participantes**. Por enquanto isso só marca quem cuida: todos da Duli veem tudo |
| Todo contato tem nome, telefone e e-mail obrigatórios. O contato pode existir sem oportunidade; a oportunidade nunca existe sem contato |
| Avisos de contato já cadastrado (telefone ou e-mail) e de oportunidade já existente, com confirmação |
| Uma oportunidade pode ter vários vistos. O Ganho cria um processo **separado** por visto. O cliente que já existe ganha os processos novos no mesmo perfil |
| O Ganho mostra um resumo de vistos e valores, e só move depois da confirmação |
| Processo **nunca** é apagado. Desistência = encerrado |
| A forma de pagamento é definida pelo dono ao enviar a ficha e confirmada ou recusada pelo cliente no formulário. Na recusa, o reenvio pede só o pagamento. A criação manual continua existindo |
| Cada parte do pagamento tem a sua moeda. O app não converte: o Renato converte com a cotação do C6, num campo que só a equipe vê |
