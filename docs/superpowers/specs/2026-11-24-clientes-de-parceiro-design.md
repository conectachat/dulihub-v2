# Clientes de parceiro — o cadastro do parceiro e o cliente que vem dele

**Data:** 24/nov/2026.
**Spec:** `docs/spec.md` §7.17 (requisitos PAR-4 a PAR-11).
**Desenhos de origem:** o Novo cliente (CLI-15,
`2026-11-17-contato-oportunidade-cliente-design.md` e o plano de 20/nov) e o
modelo de organizações da `0001` e da `0036`.

As decisões marcadas **(Renato)** são dele, de 24/nov. As marcadas
**(proposta)** foram propostas na conversa e ele aceitou. As marcadas **(nossa)**
foram decididas aqui, depois da conversa. Ele confere essas ao ler.

## 1. Por que

A maioria dos clientes o Renato fecha ele mesmo, e eles entram como **cliente
direto**. Mas há uma parceira, a Thais Fabrini, que mora nos EUA. Ela vende o
serviço e contrata a Duli para montar o processo. **Toda a comunicação do Renato é
com o parceiro, nunca com o cliente.** Por isso tanto faz o cliente ter ou não o
próprio e-mail e telefone no sistema: o contato que importa é o do parceiro
(Renato).

O cliente de parceiro não passa pelo CRM. Não há negociação com ele, link da
ficha, forma de pagamento nem contrato. Tudo é lançado à mão no perfil (Renato).
A Duli cobra o **parceiro**, uma cobrança por cliente, cada uma com as suas datas.
O que o app já faz na aba Financeiro do cliente basta. As invoices, que o Renato
monta fora do app, sobem anexadas no perfil de cada cliente (Renato).

**Por que agora:** o Renato está subindo todos os clientes dele no app. Ainda
não há nenhum cliente da Thais cadastrado, por isso esta etapa veio antes da Fase 7
(Renato).

**O que vem depois, como ideia e não como pedido** (Renato): um portal do
parceiro, para ele acompanhar os clientes, os pagamentos e o estágio dos
processos. Mais longe, o DuliHub como produto com a marca do parceiro, em que ele
gere os próprios processos e aloca os parceiros dele (a Duli, por exemplo). Essa
segunda ideia é **exatamente o desenho original da `0001`**: a pessoa na
organização do parceiro (`organization_id`), com a Duli alocada
(`assigned_organization_id`). O caso de hoje é o inverso. O cliente é **da Duli**,
porque a Duli executa e cobra, e fica só **marcado** como vindo do parceiro. Os
dois modelos convivem. **Nada desta entrega pode fechar essa porta**, e por isso
`assigned_organization_id` não é usado aqui (§2).

## 2. Abordagens

| | Como | Troca |
|---|---|---|
| **A — a escolhida (Renato)** | O parceiro é uma **organização** do tipo `partner`, com os dados cadastrais e o endereço. O cliente continua na Duli e ganha `people.partner_organization_id`, que aponta para o parceiro | É o desenho da spec (§2, §12.4) e da `0001`. No dia do portal, a mesma organização ganha logins, sem remarcar ninguém. Custa guardas no banco: o vínculo só aponta para parceiro de verdade, e a organização de teste nunca aparece na tela real |
| B | Uma tabela `partners` dentro da Duli, como `tags` e `visa_types` | É mais rápida, mas cria uma segunda ideia de "parceiro" que diverge da spec. No portal, cada parceiro teria de virar organização e cada cliente teria de ser remarcado |
| C — descartada | Usar `people.assigned_organization_id` com a organização do parceiro | O campo quer dizer o contrário (o parceiro é dono e a Duli é alocada), que é justamente a ideia futura. E ele já concede direitos: a organização atribuída edita o contato e lê notas e histórico (`can_access_person`, `equipe_alcanca_pessoa`). No dia em que o parceiro tivesse login, ele herdaria esse acesso sem ninguém ter decidido |

**Na A, o vínculo não concede nada** (nossa). Nenhuma policy lê
`partner_organization_id`. O que o parceiro vai enxergar se decide no portal (Q16,
N3), de propósito, e com o teste de RLS vermelho antes.

## 3. Objetivos, fora e fracasso

**Objetivos**

- **Configuração › Parceiros:** listar, criar e editar parceiros, com os dados
  que a invoice pede, inclusive de parceiro fora do Brasil.
- **Novo cliente › Parceiro:** um terceiro modo ao lado de "Contato existente" e
  "Novo contato". Escolhe o parceiro e digita só o nome do cliente (Renato).
- **O contato é o do parceiro:** onde o app mostra o e-mail e o telefone do
  cliente, o cliente de parceiro mostra os do parceiro, com "via ‹parceiro›", e o
  copiar copia os do parceiro (proposta). Nada é copiado para a linha do cliente:
  quando o parceiro muda o telefone, todos os clientes dele acompanham.
- **Dados cadastrais à mão:** a equipe lança a ficha sem que o app cobre o e-mail
  e o telefone do cliente. O link da ficha não existe para esse cliente
  (proposta).
- **Fora do funil:** o cliente de parceiro não ganha oportunidade (Renato: "não
  passam pelo CRM").
- **Financeiro como hoje:** cobrança à mão, por cliente, em reais ou em dólares.
  O anexo da parcela aparece como "Nota fiscal / invoice" (proposta).
- **Achar pelo parceiro:** a busca de Clientes por "Thais" acha os clientes dela
  (proposta).

**Fora desta entrega**

- Login do parceiro, portal e marca (PAR-1 a PAR-3, Fase 7).
- O que o parceiro cobra do cliente dele (o lado do parceiro no PAR-3).
- Gerar a invoice pelo app (REC-8). O app guarda os dados, e o Renato monta o
  documento.
- **Marcar como de parceiro um cliente que já existe**, desmarcar, ou trocar o
  parceiro (Renato: ainda não há cliente da Thais). Se for engano, o cliente vai
  para a lixeira e é criado de novo.
- O cliente de parceiro que depois passa a fechar direto com a Duli. Fica sem
  caminho por ora (§10).
- Apagar ou arquivar parceiro. Organização não se apaga pela API (0036).
- Logo e cores do parceiro, e qualquer coisa do produto com a marca dele.
- Totais do Financeiro por parceiro (Renato: "o que já temos por cliente é o
  suficiente").

**Fracasso — mesmo funcionando, seria errado se**

- algum login (de parceiro, hoje ou no portal) passasse a enxergar algo da Duli
  por causa desta entrega;
- a organização de teste aparecesse como parceiro na tela real, ou um cliente
  real apontasse para ela;
- o aviso de "contato já cadastrado" disparasse entre clientes do mesmo parceiro,
  ou o contato do parceiro fosse copiado para o cliente e ficasse velho;
- um cliente de parceiro aparecesse em alguma lista sem contato nenhum e sem o
  "via ‹parceiro›";
- a Configuração › Parceiros se comportasse diferente sem internet e com
  internet.

## 4. Restrições

- As regras do `AGENTS.md` valem inteiras. Toda tabela com RLS e policy. A
  organização vem do pai. Migration, `database.types.ts` e `docs/banco.md` no
  mesmo commit. Teste de RLS vermelho antes. Os componentes da tabela "UI: use o
  que já existe" (`FormDialog`, `ModosDoContato`, `CopiarTexto`, `EmptyState`,
  `erroDeContato`).
- **Organizações (0036):** criar só o dono da raiz; alterar a gestão dela ou o
  dono da raiz; apagar ninguém. `type` e `is_test` não mudam pela API. Toda
  organização nova é semeada com funil e status de etapa (0019, `security
  definer`), o que é inofensivo e é o que o portal vai querer. Qualquer membro da
  Duli lê todas as organizações.
- **Configuração é tela migrada:** Parceiros lê do espelho e grava pela fila,
  como as outras seções. `organizations` já é espelhada e fica fora do manifesto
  (0030), de propósito.
- **Clientes lê do servidor** (exceção registrada): o Novo cliente, o perfil e a
  lista continuam assim. A aba Financeiro do perfil e a tela Financeiro leem do
  aparelho, e `people` e `organizations` estão no espelho.
- **I23 aberto** (mudar a versão do espelho não recarrega). Aqui ele não morde:
  as colunas novas nascem nulas nas linhas que já existem, e as linhas novas
  (parceiro e cliente de parceiro) chegam inteiras ao aparelho. Editar o parceiro
  toca `updated_at` (`set_updated_at`).
- **Testes em produção, só com as contas e a organização de teste** (§12.6). Uma
  conta de teste não é dona da raiz, então não cria organização pela API. O
  parceiro dos clientes de teste vem de uma migration de fixture (§6).
- **O vínculo atravessa organizações de propósito.** É a primeira chave
  estrangeira que aponta para outra organização por desenho. A regra "referência
  cruzada é barrada pelo banco" ganha uma exceção registrada no `AGENTS.md`, com
  as guardas do §6 no lugar da chave composta.

## 5. Regras

### 5.1 O parceiro

| Campo | Coluna | Regra |
|---|---|---|
| Nome no app | `name` (existe) | Obrigatório, aparado, até 200. Único entre parceiros, sem diferenciar maiúscula: "Já existe um parceiro com esse nome." |
| Razão social | `legal_name` (existe) | Opcional, até 200 |
| País | `address_country` (nova) | Obrigatório, texto livre como na ficha ("Estados Unidos") |
| Documento fiscal | `tax_id` (existe) | Opcional, texto livre (CNPJ, EIN, Tax ID), até 50 |
| Endereço | `address_street`, `address_number`, `address_complement`, `address_district`, `address_city`, `address_state`, `address_postal_code` (novas, os nomes de `people`) | Opcionais, texto livre. O CEP aceita ZIP |
| E-mail | `email` (existe) | Obrigatório |
| Telefone | `phone_country_code` (nova) e `phone` (existe) | Obrigatórios |

- E-mail, DDI e telefone passam por `private.contato_valido`, com as mesmas
  frases do contato. O DDI é gravado com `normalizar_ddi` ("+1").
- **O banco confere**, no `insert` e no `update` de organização `partner`:
  nome, país e contato. A regra não vale para a raiz (nossa). A organização
  `parceiro-teste`, que já existe, é preenchida pela migration para passar.
- O `slug` é gerado a partir do nome, único, e não aparece na tela (nossa). O
  construtor escolhe se isso acontece no banco ou no app.
- **Quem:** todo membro da Duli lê, porque precisa ver o contato. Só o dono da
  Duli cria e edita (proposta, e o banco já exige na criação). Na tela, os
  botões aparecem só para ele.
- Parceiro não se apaga (fora).

### 5.2 O cliente de parceiro

- **Nasce só pelo Novo cliente › Parceiro**, que é `criar_cliente` com o ramo
  novo. Exige a gestão da organização atual, como no CLI-15. Grava numa
  transação: a pessoa na organização atual, com `full_name`, o vínculo
  e o contato **vazio** (e-mail, DDI e telefone nulos), e depois
  `marcar_como_cliente`. Isso dá o estágio, o "cliente desde" de hoje, o dono
  para quem criou e o histórico, que vira "Marcado como cliente — parceiro
  ‹nome›" (nossa).
- **Nome:** obrigatório, aparado, até 200 ("Informe o nome do cliente.").
  **Nome repetido no mesmo parceiro**, sem diferenciar maiúscula e fora da
  lixeira, não grava de primeira: o diálogo pergunta "Já existe um cliente com
  esse nome vindo de ‹parceiro›.", com o link para o perfil e o botão "Criar mesmo
  assim" (nossa). Isso cobre o caso de subir o mesmo cliente duas vezes numa
  carga grande. O aviso de contato parecido (CON-4) não roda: não há contato para
  comparar.
- **O vínculo é fixo.** Só se preenche no `insert`, e só pelo `criar_cliente`,
  com uma marca de sessão como a do Ganho. Depois não muda nem se apaga. Pela
  API, recusa com "O parceiro do cliente só se define no Novo cliente." (nossa).
  Engano se resolve na lixeira (fora).
- **Para onde o vínculo aponta:** uma organização `partner`, diferente da do
  cliente, e com a mesma marca de teste. Teste aponta só para teste, e real só
  para real. A organização do cliente é a raiz, ou, nos testes, uma organização
  `is_test` (nossa).
- O cliente do portal (Fase 6) não muda o vínculo, que entra na lista de colunas
  travadas de `people_guard_self_update` (nossa).

### 5.3 O contato que aparece

Uma função pura em `src/lib/` decide o contato que se mostra: o da pessoa, ou, no
cliente de parceiro, o do parceiro, com o nome dele para o "via". **No cliente de
parceiro, o do parceiro vence sempre**, mesmo que a linha da pessoa tenha e-mail
(nossa). Ela vale em todo lugar onde o contato aparece hoje:

- **Perfil do cliente:** no cabeçalho, o telefone e o e-mail do parceiro, com o
  copiar e o `mailto`, mais um selo "Cliente de parceiro · ‹nome›".
- **Clientes:** na tabela e nos cartões do celular, o contato do parceiro com
  "via ‹nome›".
- **Contatos:** a lista mostra clientes também, e mostra do mesmo jeito.
- **Financeiro (tela):** "via ‹nome›" ao lado do nome do cliente, para o Renato
  ver quais cobranças são do parceiro. Os dados vêm do espelho, `people` e
  `organizations` (nossa).

A busca de Clientes (`buscar_clientes`) também acha pelo nome do parceiro, além
de nome, e-mail e telefone da pessoa (proposta).

### 5.4 Dados cadastrais

- **Editar** abre a ficha **sem** os campos de e-mail, DDI e telefone. A ação não
  envia essas chaves, então `salvar_cadastro` não roda `contato_valido`, e
  nenhum aviso de parecido roda.
- **Sem link da ficha.** No lugar do bloco do link, a frase "Cliente de
  ‹parceiro›: os dados cadastrais são lançados aqui, em Editar." O banco recusa
  link da ficha para cliente de parceiro: "Cliente de parceiro não recebe o link
  da ficha." (nossa). A guarda fica no banco porque a verificação na tela é só
  conveniência.

### 5.5 Fora do funil

Negócio para cliente de parceiro é recusado no banco, por `criar_oportunidade` e
por `insert` direto em `opportunities`: "Cliente de parceiro não entra no funil:
use + Novo processo no perfil." Os processos nascem por "+ Novo processo", como
hoje (CLI-7). A busca de contato existente da Nova oportunidade não o oferece
(nossa).

### 5.6 Financeiro

- A cobrança à mão de hoje (CLI-5), na aba Financeiro do perfil, em R$ ou US$.
  **Nada muda no modelo:** a cobrança é da Duli, na organização da pessoa, e
  quem paga é o parceiro.
- O anexo da parcela de tipo `nota_fiscal` passa a se chamar **"Nota fiscal /
  invoice"** em todo o app. O valor gravado não muda (proposta).

### 5.7 Configuração › Parceiros

A seção já existe no menu como "Fase 7", com a lista do que vai ter
(`settings/sections.ts`). Ela ganha conteúdo e perde o `phase` e o `planned`.

- **Migrada:** lê do espelho e grava pela fila. Sem internet, o parceiro criado
  fica na fila e sobe depois. O Novo cliente, que só funciona com internet, só o
  oferece depois de subir.
- "Novo parceiro" no topo (criar vem antes da lista), num `FormDialog`. Editar
  é o mesmo diálogo, preenchido.
- Lista: nome, país, e-mail e telefone (com copiar) e o número de clientes. Sem
  excluir.
- Sem parceiro: `EmptyState` com "Nenhum parceiro ainda. Cadastre aqui quem vende
  e contrata a Duli para montar o processo."
- A organização de teste **não aparece** para quem não está numa organização de
  teste. Isso vale aqui e no seletor do Novo cliente.

### 5.8 Frases fixas novas

| Onde | Frase |
|---|---|
| Novo cliente, sem parceiro | "Escolha o parceiro." |
| Novo cliente, sem nome | "Informe o nome do cliente." |
| Novo cliente, parceiro inválido | "Parceiro não encontrado." |
| Novo cliente, nome repetido | "Já existe um cliente com esse nome vindo de ‹parceiro›." e "Criar mesmo assim" |
| Novo cliente, sem parceiro cadastrado | "Nenhum parceiro cadastrado. Cadastre em Configuração › Parceiros." (com link, só para quem pode cadastrar) |
| Vínculo pela API | "O parceiro do cliente só se define no Novo cliente." |
| Funil | "Cliente de parceiro não entra no funil: use + Novo processo no perfil." |
| Link da ficha | "Cliente de parceiro não recebe o link da ficha." |
| Parceiro sem nome / país | "Informe o nome do parceiro." / "Informe o país." |
| Parceiro com nome repetido | "Já existe um parceiro com esse nome." |
| Parceiro criado por quem não é dono da Duli | "Só o dono da Duli cadastra parceiro." |

## 6. Banco

Uma migration nova, `0068`, e a de fixture, se o construtor preferir separar.

| O quê | Como |
|---|---|
| `organizations` | As colunas de endereço e `phone_country_code` (§5.1). Gatilho da regra do parceiro no `insert`/`update` de `type = 'partner'`. Índice único de nome entre parceiros (`lower(aparar(name)) where type = 'partner'`). Preenche a `parceiro-teste` |
| `people.partner_organization_id` | `uuid` nulo, `references organizations(id)`. Índice parcial. Gatilho: só no `insert` e só com a marca; nunca muda; aponta para `partner`, diferente da organização da pessoa, com a mesma `is_test`; a pessoa é da raiz ou de organização `is_test`. Entra em `people_guard_self_update` |
| `criar_cliente` | Ganha o ramo do parceiro, com a assinatura que o construtor escolher. Ele pode ser um `p_parceiro` com `p_novo_contato` trazendo só `full_name`, ou um parâmetro próprio. A ordem das recusas segue a do CLI-15 (gestão antes de tudo), depois o parceiro e o nome. Devolve `precisa_confirmar` com os homônimos, como devolve os parecidos |
| `buscar_clientes` | Devolve o nome e o contato do parceiro e acha pelo nome dele |
| Funil | Recusa de negócio para cliente de parceiro, em `criar_oportunidade` e num gatilho `before insert` em `opportunities` |
| Link da ficha | Gatilho `before insert` em `registration_forms`, que recusa para cliente de parceiro |
| Fixture | Uma segunda organização de teste, `partner` e `is_test`, com contato válido ("Indicador de Teste"), para ser o parceiro dos clientes que a `teste-parceiro` cria na `parceiro-teste`. E, para o critério 11, **um cliente na Indicador de Teste que aponta para a `parceiro-teste`**, gravado pela própria migration (sem usuário, as guardas deixam passar). Assim `teste-parceiro` e `teste-staff` fazem o papel de "membro do parceiro" e provam que não enxergam nada. Hoje nenhuma conta de teste é membro só de uma organização-parceira sem ser a dona do cliente |
| RLS | **Nenhuma policy nova nem alterada** além do necessário para as colunas. Nenhuma policy lê o vínculo |

O espelho: `people` ganha uma coluna e `organizations` ganha várias. Os índices do
Dexie não mudam, então `VERSAO_DO_ESPELHO` não precisa subir (§4, I23).

## 7. Telas

**Configuração › Parceiros**

```
Parceiros                                        [+ Novo parceiro]
Empresas que vendem e contratam a Duli para executar o processo.

┌──────────────────────────────────────────────────────────────────┐
│ Thais Fabrini        Estados Unidos   thais@…  ⧉   +1 305… ⧉   3 │ [✎]
└──────────────────────────────────────────────────────────────────┘
```

**Novo parceiro / Editar parceiro**

```
Nome no app        [ Thais Fabrini                 ]  *
Razão social       [ Thais Fabrini Consulting LLC  ]
País               [ Estados Unidos                ]  *
Documento fiscal   [ EIN 12-3456789                ]
Endereço           [ rua ] [ número ] [ complemento ]
                   [ bairro ] [ cidade ] [ estado ] [ CEP/ZIP ]
E-mail             [ thais@…                       ]  *
Telefone           [ +1 ] [ (305) 555-0100         ]  *
                                            [Salvar]
```

**Novo cliente**

```
Novo cliente
[Contato existente] [Novo contato] [Parceiro]

Parceiro         [ Thais Fabrini            ▾ ]
Nome do cliente  [ Fulano de Tal              ]

Não tem volta: cliente não volta a ser lead.
                                [Criar cliente]
```

Depois de gravar, abre o perfil na aba Projetos com o "+ Novo processo" aberto,
como o CLI-15.

**Perfil do cliente, cabeçalho**

```
Fulano de Tal   [Cliente de parceiro · Thais Fabrini]  [tags…]
+1 (305) 555-0100 ⧉   thais@… ⧉   via Thais Fabrini     Dono: Renato
```

**Clientes (lista)**

```
Nome            E-mail                         Telefone                Dono
Fulano de Tal   thais@… (via Thais Fabrini)    +1 (305) 555-0100       Renato
```

## 8. Critério de aceite

1. **Cadastro do parceiro.** O dono da Duli cria "Thais Fabrini", com país
   "Estados Unidos", e-mail e telefone "+1 (305) 555-0100". Ela aparece na lista
   com o país e o contato. Sem país, nada grava e aparece "Informe o país.".
   E-mail inválido dá a frase do contato. Nome repetido ("thais fabrini") dá "Já
   existe um parceiro com esse nome.". No banco, `insert` direto sem contato
   válido é recusado.
2. **Quem cadastra.** Pela API, um `admin` ou `staff` da Duli que não é dono não
   cria parceiro (RLS da 0036). Na tela, ele lê a lista sem os botões.
3. **Editar o parceiro muda o contato de todos os clientes dele.** Com o telefone
   trocado, o perfil e a lista de Clientes de cada cliente da Thais mostram o
   telefone novo, e a linha da pessoa continua com o contato nulo.
4. **Novo cliente › Parceiro.** A gestão escolhe "Thais Fabrini" e digita
   "Fulano de Tal". Nasce numa gravação só: cliente na Duli, contato nulo,
   vínculo com a Thais, "cliente desde" de hoje, quem criou como dono, e o
   histórico "Marcado como cliente — parceiro Thais Fabrini". Abre o perfil na
   aba Projetos com o "+ Novo processo". O `staff` recebe "Só a gestão marca
   alguém como cliente.".
5. **Nome repetido.** Um segundo "fulano de tal" da Thais pergunta antes. "Criar
   mesmo assim" cria. O mesmo nome de outro parceiro, ou de um cliente direto,
   não pergunta.
6. **O contato aparece.** No perfil, na lista de Clientes (tabela e celular), em
   Contatos e no Financeiro, o cliente da Thais mostra o contato dela com "via
   Thais Fabrini". O copiar copia o telefone dela. Buscar "Thais" em Clientes acha
   o Fulano.
7. **Sem aviso de duplicado.** Criar dez clientes da Thais não mostra nenhum
   aviso de contato parecido. Criar um contato novo com o e-mail da Thais também
   não acusa os clientes dela.
8. **Dados cadastrais.** Editar a ficha do Fulano sem e-mail e telefone grava. O
   bloco do link não aparece, e aparece a frase do §5.4. Pela API, gerar link da
   ficha para ele é recusado com a frase.
9. **Fora do funil.** `criar_oportunidade` com o Fulano, e `insert` direto em
   `opportunities`, são recusados com a frase do §5.5. A Nova oportunidade não o
   lista. "+ Novo processo" no perfil funciona.
10. **O vínculo é fixo.** Pela API, nenhum membro (nem a gestão) preenche, troca
    ou apaga `partner_organization_id`. Inserir pessoa já com o vínculo, fora do
    `criar_cliente`, é recusado. O vínculo para a raiz, para a própria
    organização, para organização de teste a partir de cliente real, ou o
    contrário, é recusado.
11. **Nada de acesso novo.** Depois desta entrega, os testes de isolamento de hoje
    passam iguais. Um membro da organização de teste do parceiro não enxerga o
    cliente que aponta para ela: nem a pessoa, nem as notas, os processos ou as
    cobranças.
12. **Financeiro.** A cobrança à mão do Fulano em US$, com 2 parcelas, nasce e
    soma como qualquer outra. O anexo aparece como "Nota fiscal / invoice".
13. **Teste fora da tela real.** Para a conta do Renato, a organização de teste
    não aparece em Parceiros nem no seletor do Novo cliente.
14. **Offline.** Sem internet, Configuração › Parceiros abre a lista do espelho.
    Criar parceiro offline entra na fila e sobe quando a rede volta. Pelo
    "Sincronização", a recusa (por exemplo, de quem não é dono) aparece com o
    motivo.
15. **Celular.** Os diálogos rolam por inteiro, e a lista de Parceiros vira
    cartões (conferência à mão).

## 9. Requisitos

| ID | Requisito | Pri. |
|---|---|---|
| PAR-4 | Cadastro do parceiro em Configuração › Parceiros: nome, razão social, país, documento fiscal, endereço, e-mail e telefone; só o dono da Duli cria e edita (critérios 1, 2, 13, 14, 15) | P0 |
| PAR-5 | Novo cliente › Parceiro: parceiro e nome, numa gravação só, com aviso de nome repetido (4, 5) | P0 |
| PAR-6 | O contato do cliente de parceiro é o do parceiro, em todo lugar onde o contato aparece, com "via"; a busca de Clientes acha pelo parceiro (3, 6, 7) | P0 |
| PAR-7 | Dados cadastrais sem e-mail e telefone, e sem link da ficha (8) | P0 |
| PAR-8 | Cliente de parceiro fora do funil (9) | P0 |
| PAR-9 | Vínculo fixo, só para parceiro de verdade, teste com teste (10) | P0 |
| PAR-10 | O vínculo não concede acesso nenhum até o portal (11) | P0 |
| PAR-11 | "Nota fiscal / invoice" no anexo; "via ‹parceiro›" no Financeiro (12, 6) | P1 |

## 10. Decisões e o que fica em aberto

| Decisão | De quem |
|---|---|
| Parceiro é organização, e o cliente é da Duli com o vínculo (abordagem A) | Renato |
| Terceiro modo "Parceiro" no Novo cliente, só com o nome | Renato |
| Sem CRM, sem link, sem forma e sem contrato para o cliente de parceiro; tudo à mão no perfil | Renato |
| Cobrança por cliente, como hoje; sem totais por parceiro | Renato |
| Dados cadastrais completos do parceiro, para a invoice de fora do Brasil | Renato |
| Sem conversão de cliente existente; engano vai para a lixeira | Renato |
| O contato do parceiro aparece no lugar, sem cópia; o do parceiro vence | proposta / nossa |
| Só o dono da Duli cadastra parceiro | proposta |
| Busca pelo nome do parceiro; "Nota fiscal / invoice" | proposta |
| Aviso de nome repetido no mesmo parceiro | nossa |
| O banco recusa funil e link da ficha para cliente de parceiro | nossa |
| Vínculo fixo, travado também para o cliente do portal | nossa |
| "via ‹parceiro›" no Financeiro | nossa |

**Em aberto (vai para §10 da spec):**

- **Q18.** O cliente de parceiro que depois quer fechar direto com a Duli: ele
  vira cliente direto (o vínculo sai) ou nasce outro cadastro? Hoje o vínculo é
  fixo, e não há caminho.
- **Q16** continua aberta e ganha um caso: o que o parceiro enxerga dos clientes
  marcados com ele (processos? cobranças? notas, nunca?). Decide-se antes do
  portal.

## 11. Fica com quem constrói

- A assinatura de `criar_cliente` e o nome da marca de sessão.
- Onde o `slug` é gerado, e o formato.
- Se a regra do parceiro é um gatilho só ou vários, e em que migration fica a
  fixture.
- O nome e o lugar da função pura do contato (§5.3), e como Clientes e Contatos
  trazem o parceiro (junção do PostgREST ou colunas a mais na RPC).
- Como a fila grava `organizations`. Ela é espelhada mas ainda não é gravada pela
  fila: confira o caminho de `insert`/`update` e a sobreposição.
- O texto exato do histórico, desde que diga o parceiro.
- Os testes, dentro do desenho da fixture (§6). As contas são `teste-parceiro`
  (dona da `parceiro-teste`), `teste-staff` (staff de lá), `teste-colaborador`
  (staff da Duli: só lê, nunca grava na Duli) e `teste-cliente`
  (`tests/rls/README.md`). Nenhum teste cria organização pela API: só o dono da
  raiz cria, e o teste do PAR-4 prova a recusa para quem não é.
