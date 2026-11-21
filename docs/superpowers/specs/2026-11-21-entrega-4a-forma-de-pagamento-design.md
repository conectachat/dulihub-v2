# Entrega 4a — forma de pagamento pela equipe e cobranças no Ganho

**Data:** 21/nov/2026.
**Desenho de origem:** `2026-11-17-contato-oportunidade-cliente-design.md`, §6.4 e o
trecho de cobranças da §6.3 (linhas 614–638).

Este documento recorta a primeira metade da entrega 4. **O que ele não diz vale
como está na §6.4.** O que ele muda ou decide está marcado.

## 1. Por que

Hoje o Ganho cria cliente e processos, mas nenhuma cobrança. Depois do Ganho, o
Renato abre a aba Financeiro do cliente e digita a mesma combinação que já tinha
fechado na conversa: entrada, parcelas, datas.

**O fluxo, nas palavras do Renato (21/nov):**

1. O cliente diz "vamos fechar".
2. A equipe põe a forma de pagamento que o cliente escolheu.
3. A equipe envia o link da ficha. O cliente preenche os dados cadastrais, vê a
   forma de pagamento que escolheu e dá um OK.
4. Esses dados vão para o contrato.
5. Depois que o cliente assina, a oportunidade é marcada como ganha.
6. O Ganho cria o perfil do cliente com o processo de cada visto contratado e a
   forma de pagamento no Financeiro.

A forma serve a duas coisas: dizer no contrato como o cliente vai pagar, e deixar
no Financeiro as parcelas em que a equipe dá baixa e anexa a nota fiscal quando o
dinheiro entra. A baixa e o anexo da nota fiscal (CLI-6) já existem.

A entrega 4 inteira faz a forma de pagamento nascer no negócio e virar cobrança no
Ganho. A parte mais arriscada é o cliente confirmar pelo link, porque alarga a
única porta sem login. Por isso a entrega vem em duas metades:

- **4a, este documento:** a equipe define a forma e a confirma ("o cliente
  confirmou por WhatsApp"), e o Ganho cria as cobranças;
- **4b, depois:** a forma vai pelo link da ficha e o cliente responde.

A 4a é útil sozinha. A confirmação pela equipe (FIC-10) cobre o caso de hoje, em
que o acerto é feito por conversa.

## 2. Abordagens

| | Como | Troca |
|---|---|---|
| **A, escolhida pelo Renato em 20/nov** | Duas metades: 4a (forma, confirmação pela equipe, cobranças no Ganho) e 4b (link, resposta do cliente, avisos na Início) | A 4a já cria todas as tabelas da §6.4, menos as mudanças em `registration_forms`, para a 4b não precisar migrar dado. Até a 4b, a cobrança só nasce com a confirmação pela equipe: um clique a mais |
| B | A entrega 4 inteira de uma vez | Mais tempo sem nada no ar. Junta numa revisão só a porta anônima e o dinheiro, as duas partes que mais pedem cuidado |

## 3. Objetivos, fora e fracasso

**Objetivos**

- No lead, a equipe define a forma de pagamento a partir dos vistos: entrada,
  parcelas, cartão e à vista, cada parte na sua moeda, com as datas.
- O dono do negócio ou a gestão confirma a forma, registrando quem confirmou e
  quando. A confirmação guarda uma cópia do que foi combinado.
- No Ganho com a forma confirmada, nasce uma cobrança por parte, com as parcelas,
  uma vez só. O resumo do Ganho mostra antes o que vai nascer e avisa das parcelas
  já vencidas.
- A cotação do C6 fica anotada na forma, só para a equipe.

**Fora da 4a (vai para a 4b):**

- o link da ficha com a forma (FIC-7, a parte do envio), a resposta do cliente
  (FIC-8) e o reenvio só do pagamento (FIC-9);
- os estados `enviada` e `recusada` alcançáveis, e a caixa "criar as cobranças
  mesmo assim" (`p_cobrancas_sem_confirmacao`);
- as mudanças em `registration_forms`, o token gerado no banco, a função anônima
  `responder_forma_de_pagamento` e as mudanças em `abrir_ficha_de_cadastro` e
  `enviar_ficha_de_cadastro`;
- os avisos da Início (INI-8);
- a regra "negócio aberto com link de pagamento aberto não se exclui".

**O que seria fracasso, mesmo funcionando:**

- cobrança duplicada: o mesmo acerto vira cobrança duas vezes, por reabrir e
  ganhar de novo, ou por "Refazer" depois do Ganho;
- cobrança com a organização de quem clicou, e não com a da pessoa (o I24);
- uma moeda somada na outra em qualquer total;
- o resumo do Ganho prometer cobranças diferentes das que a gravação cria;
- confirmação forjada pela API: forma `confirmada` sem resposta registrada, ou
  resposta sem a função;
- o cliente do portal lendo a forma ou a cotação.

## 4. Restrições

Valem as da §3 do desenho de origem e as do `AGENTS.md`. As que mais pesam aqui:

- **A organização vem do registro-pai.** A forma e as partes herdam do negócio. A
  cobrança criada no Ganho herda **da pessoa**.
- **Dinheiro:** soma por moeda, em centavos, nunca uma moeda na outra.
- **Marca `dulihub.via_forma`:** ligada e desligada pelas funções. Um gatilho
  recusa o resto, também na organização de teste, e a cascata passa
  (`pg_trigger_depth() > 1`).
- **Hoje:** `(now() at time zone 'America/Sao_Paulo')::date`.
- **Gestão:** `private.current_user_manages(org)`. **CRM-10:** dono do negócio ou
  gestão.
- **Compatível com o código no ar.** `ganhar_negocio` mantém a assinatura e o
  formato. Até o deploy, nenhuma forma fica `confirmada`, então `cobrancas` sai
  vazia e a tela antiga, que lê `cobrancas` como `z.array(z.unknown())`, não
  quebra.

## 5. Regras da 4a

### 5.1 Estados

Os quatro estados da §6.4 entram no `check` já agora, para a 4b não mexer nele.
Na 4a só dois se alcançam:

| Estado | Editar partes | O que muda o estado | Quem |
|---|---|---|---|
| `rascunho` | Sim | "Confirmar pela equipe" → `confirmada` | Editar: qualquer membro da organização do negócio, como nos vistos. Confirmar: CRM-10 |
| `confirmada` | Não | "Refazer" → `rascunho`, recusado se o Ganho já criou as cobranças | CRM-10 *(minha decisão: desfazer a confirmação pesa o mesmo que fazê-la)* |

**A forma só se mexe com o negócio aberto** *(minha decisão)*. Com o negócio
ganho ou perdido, salvar, confirmar e refazer são recusados. Reabrir libera de
novo, salvo se `charges_created_at` estiver preenchido.

**Depois que o Ganho cria as cobranças, a forma vira registro.** Com
`charges_created_at` preenchido:

- nada na forma muda, só a cotação;
- Refazer é recusado e não aparece no cartão;
- a trava dos vistos (abaixo) deixa de valer. No negócio reaberto, os vistos mudam
  como antes (CRM-15), e a cobrança de um visto novo se cria à mão no Financeiro.

O motivo: a cobrança nasce no Ganho. Uma forma confirmada depois do Ganho não
geraria nada e pareceria pronta. É a mesma regra dos vistos, que travam no Ganho.
Para criar as cobranças de um negócio já ganho, o caminho é reabrir, confirmar e
ganhar de novo, ou criá-las à mão no Financeiro.

**A cotação** (`reference_rate`, `reference_rate_note`) é a exceção. Qualquer
membro a edita, em qualquer estado, inclusive com o negócio ganho (FIC-11).

**Os vistos travam com a forma confirmada** *(decisão do Renato, 21/nov)*.
Enquanto a forma estiver `confirmada` e o Ganho ainda não tiver criado as
cobranças (`charges_created_at` nulo), não se acrescenta, muda nem retira visto do
negócio. A frase é "A forma de pagamento está confirmada. Use Refazer para mudar
os vistos."

- Assim o acerto e os vistos nunca se desencontram. A cópia guardada e o título da
  cobrança no Ganho falam dos mesmos vistos.
- A trava fica no banco, num gatilho em `opportunity_items`, e vale também na
  organização de teste.
- A ação da chave estrangeira passa (`pg_trigger_depth() > 1`). Apagar um tipo de
  visto nas Configurações continua anulando o `visa_type_id` do item.
- Na 4b, a mesma trava vale para a forma `enviada`.
- *Por que ela para quando as cobranças nascem (minha decisão, a partir da do
  Renato):* depois disso Refazer não existe mais, e a trava prenderia para sempre
  os vistos do negócio reaberto, contra o CRM-15. A trava protege o acerto até ele
  virar cobrança. Dali em diante, as cobranças são a verdade (§6.4).

### 5.2 A forma

- **Partes.** De 0 a 10 *(o limite é minha decisão)*. Salvar sem nenhuma parte é
  permitido, e a forma fica vazia, em `rascunho`. Cada parte tem:
  - rótulo, de 1 a 80 caracteres;
  - método, um dos de `installments.method`: pix, boleto, cartão, transferência
    ou cripto;
  - moeda, BRL ou USD;
  - total maior que zero;
  - número de parcelas.
- **Os botões só preenchem a parte.** "+ Entrada", "+ Parcelas", "+ Cartão" e
  "+ À vista" não são tipos de parte. O que se grava é o rótulo, o método e o
  número de parcelas que o botão sugere, e a pessoa pode mudar tudo.
  - **Entrada:** rótulo "Entrada", 1 parcela.
  - **À vista:** rótulo "À vista", 1 parcela.
  - **Parcelas:** rótulo "Parcelas", N parcelas.
  - **Cartão:** rótulo "Cartão", método cartão, 1 parcela.
  - Os outros padrões ficam com quem constrói.
- **Parcelas iguais** (todo método menos cartão):
  - de 1 a 36;
  - o total é dividido sem perder centavo, e as datas saem mês a mês a partir da
    primeira, pela mesma regra da cobrança manual (`gerarParcelas` e
    `somarMeses`);
  - valor e data de cada parcela podem ser editados;
  - a soma tem de bater com o total da parte, ou a forma não salva;
  - data no passado é aceita, e o Ganho avisa.
- **Cartão:** **uma** parcela, com o total, numa data *(decisão do Renato,
  21/nov)*. Não se registra em quantas vezes o cliente parcela nem se há juros: a
  Duli recebe tudo de uma vez, antecipado pela operadora. Quando o dinheiro entra,
  a equipe dá baixa nessa parcela e anexa a nota fiscal, como em qualquer outra. Na
  §6.4, o cartão tinha de 1 a 10x sem juros ou até 18x com juros, e isso sai.
- **Coerência.** Quando os vistos e as partes estão todos na **mesma** moeda e os
  totais diferem, aparece um aviso, mas nada é bloqueado: "A forma soma US$ 13.000
  e os vistos, US$ 14.000." O aviso aparece na janela da forma, na confirmação e no
  resumo do Ganho. Com moedas diferentes, os dois totais aparecem lado a lado, sem
  aviso.
- **A mesma validação nos dois lados.** O banco (`salvar_forma_de_pagamento`)
  confere tudo o que a tela confere. A tela só adianta a frase.

### 5.3 Confirmar pela equipe

- **Exige:** o negócio aberto, a forma em `rascunho`, pelo menos um visto e pelo
  menos uma parte.
- **Observação:** opcional, de até 500 caracteres, por exemplo "acertado por
  WhatsApp em 05/nov". Vai para `payment_plan_responses.reason`.
- **A cópia:** montada no banco, com os vistos (nome, valor e moeda) e as partes
  com as parcelas, **sem** a cotação. Vai para `snapshot`.
- **Histórico da pessoa:** "Forma de pagamento confirmada pela equipe".
- **Refazer:** volta a `rascunho` e registra "Forma de pagamento refeita". A
  resposta de antes **não** se apaga: ela é a prova de que houve uma confirmação.
  Depois de Refazer e confirmar de novo, a tela e o resumo mostram a **última**
  resposta.
- **Tipo do histórico** *(minha decisão)*: um tipo de sistema novo,
  `forma_de_pagamento`, que entra em `TIPOS_DO_SISTEMA` e, portanto, sem botão de
  apagar.

### 5.4 No Ganho

O resumo (`ganhar_negocio(..., p_simular => true)`) e a gravação devolvem a mesma
lista de cobranças, porque a mesma função monta as duas.

*(Minha decisão: a corrida entre abrir o resumo e confirmar o Ganho fica aceita,
como na entrega 3 para os processos. Se o dono ou a gestão fizer "Refazer" nesses
segundos, o Ganho grava o que vale na hora da gravação. Barrar exigiria mudar a
assinatura de `ganhar_negocio`, e a janela é de segundos, aberta só por quem pode
ganhar o negócio.)*

**O trecho "Forma de pagamento" do resumo** deixa de ser o fixo "definir na aba
Financeiro":

| Situação | O resumo mostra | Cobranças |
|---|---|---|
| `confirmada`, sem cobranças criadas | "Confirmada pela equipe em 05/nov, por ‹nome›", as partes e as parcelas, e "Serão criadas 2 cobranças (R$ 10.000; US$ 9.000)" | Uma por parte |
| `rascunho` | "Em rascunho: nenhuma cobrança será criada. Para criá-las, confirme a forma antes do Ganho." | Nenhuma |
| Sem forma | "Não definida: nenhuma cobrança será criada." | Nenhuma |
| Cobranças já criadas (reaberto e ganho de novo) | "As cobranças desta forma já foram criadas em ‹data›." | Nenhuma |

**Avisos**, em `avisos`, sem bloquear:

- parcelas que vão nascer com vencimento antes de hoje: "2 parcelas já vencidas"
  ou "1 parcela já vencida";
- a coerência (§5.2).

**A gravação, passo (7)**, como a §6.4, linha 855, com o que fica decidido aqui:

- só com a forma `confirmada` e `charges_created_at` nulo. O passo grava
  `charges_created_at = now()`;
- roda depois do passo (5), quando a pessoa já é cliente, então o gatilho
  `quem_tem_processo_e_cliente` passa;
- **uma cobrança por parte**, com a organização e a pessoa do negócio:
  - `project_id` nulo *(minha decisão: uma forma paga todos os vistos juntos, e
    `receivables.project_id` já é anulável)*;
  - `created_by` é quem confirma o Ganho;
  - `list_amount` nulo;
  - `payment_plan_part_id` é a parte;
  - `amount` é o total da parte, na moeda da parte;
- **título:** "‹rótulo› — ‹vistos›", com os `visa_name` dos itens na ordem de
  `position`, separados por vírgula. Por exemplo, "Entrada — EB-1A, O-1" ou
  "Cartão — EB-1A, O-1";
- **parcelas:** cópia das parcelas da forma (número, valor e vencimento), com o
  método da parte;
- **o retorno:** cada item de `cobrancas` traz `id` (nulo na simulação), `titulo`,
  `moeda`, `total` e `parcelas` (a quantidade). Uma chave nova, `forma`, traz o que
  o resumo mostra: a situação (`confirmada`, `rascunho`, `sem_forma` ou
  `cobrancas_criadas`), quando e por quem foi confirmada (da última resposta), a
  data das cobranças já criadas, e as partes com as parcelas e as datas. A tela
  não lê a forma por outra consulta: o resumo e a gravação saem da mesma função. A
  chave nova não quebra a tela antiga, cujo esquema não é estrito.

Depois do Ganho, as cobranças são cobranças comuns: renomear, dar baixa, desfazer
a baixa e excluir no Financeiro funcionam como hoje. Valor e data de parcela não se
editam lá hoje; para corrigir, exclui-se a cobrança e cria-se outra. Excluir uma cobrança não faz a forma gerar de
novo, porque `charges_created_at` continua preenchido.

### 5.5 Excluir negócio

- **Negócio cuja forma já teve uma confirmação registrada** (há uma linha em
  `payment_plan_responses`, mesmo depois de "Refazer"): não se exclui. A frase é
  "A forma de pagamento já foi confirmada; o negócio fica como registro." *(A
  frase é minha decisão. A regra é a "forma já respondida" da §6.3: excluir o
  negócio apagaria a prova pela cascata.)*
- Negócio ganho que também tem confirmação: vale a frase do ganho, que a 0054 já
  dá ("Reabra ou encerre os processos; o negócio ganho fica como registro.").
- A trava fica no gatilho `opportunities_ganho_nao_se_apaga` da 0054, que é
  ampliado. Ela vale também na organização de teste, e a cascata da pessoa passa.
- `deleteOpportunity` e o "Excluir" do quadro mostram a mesma frase.
- Negócio com forma em `rascunho`, nunca confirmada, se exclui normalmente, e a
  forma vai junto pela cascata.

### 5.6 Frases fixas

| Situação | Frase |
|---|---|
| Salvar ou confirmar com a forma já confirmada | "A forma está confirmada. Use Refazer para mudar." |
| Salvar, confirmar ou refazer com o negócio encerrado | "O negócio está encerrado; reabra para mexer na forma de pagamento." |
| Salvar ou refazer depois de o Ganho criar as cobranças (vale antes das outras frases) | "As cobranças já foram criadas. Para mudar, exclua a cobrança e crie outra na aba Financeiro do cliente." |
| Confirmar sem parte ou sem visto | "Acrescente pelo menos um visto e uma parte antes de confirmar." |
| Confirmar ou refazer sem ser dono do negócio nem da gestão | "Só o dono do negócio ou a gestão confirmam a forma de pagamento." |
| Parcelas que não somam o total | "As parcelas de ‹rótulo› somam ‹valor›; o total é ‹valor›." |
| Parcelas fora de 1 a 36 | "Parcelas vão de 1 a 36." |

## 6. Banco

Uma migration, compatível com o código no ar (§4).

| Peça | O que entra na 4a |
|---|---|
| `payment_plans` | Como na §6.4. O `check` de `status` tem os quatro estados. RLS: leitura, insert e update só para membros da organização do negócio, pela organização (não por `can_access_person`, que deixaria o cliente do portal ler a própria forma); **sem policy de delete**, como `projects` na 0051. Um gatilho recusa, sem a marca, qualquer `insert` e qualquer mudança que não seja em `reference_rate` (`> 0`, ou nulo), `reference_rate_note` (até 200 caracteres) e no `updated_at` que o `set_updated_at` grava junto; isso inclui `status` e `charges_created_at`, que só o passo (7) do Ganho grava. Outro gatilho recusa o `delete` direto, também na organização de teste; só a cascata do negócio e da pessoa passa. A cotação na tela usa a mesma leitura da cotação da baixa ("5,425" é cinco e 425 milésimos, `financeiro/schema.ts:74-75`) |
| `payment_plan_parts` e `payment_plan_installments` | Como na §6.4, com os limites da §5.2, **sem** `card_with_interest`. O `check` passa a ser: cartão tem `installments_count = 1`; os outros métodos, de 1 a 36. Insert, update e delete só com a marca, e a cascata passa. `numeric(12,2)` cabe em `receivables` e `installments`, que são `numeric(14,2)` |
| `payment_plan_responses` | Como na §6.4, inteira, inclusive `registration_form_id`, nulo na 4a, com uma mudança: `answered_by` referencia `profiles` com `on delete set null`, como o `created_by` da casa, e a resposta guarda também `answered_by_name`, o nome de quem confirmou na hora. A obrigação de `answered_by` na confirmação da equipe é conferida no gatilho de insert, e não num `check`. Assim, excluir o usuário não é recusado com um erro obscuro, e a prova continua dizendo quem foi *(minha decisão: o `check` da §6.4 recusaria a exclusão de qualquer usuário que já confirmou uma forma)*. O gatilho `before insert` aceita na 4a só `confirmada_pela_equipe`, vindo de `rascunho`. O ramo do cliente (`enviada`) entra na 4b. Update e delete recusados; só a cascata e a ação da chave estrangeira passam |
| `receivables.payment_plan_part_id` | Como na §6.4: único quando não nulo; FK composta, `on delete set null (payment_plan_part_id)` |
| `salvar_forma_de_pagamento(p_negocio, p_forma jsonb)` | Como na §6.4, com as regras da §5.1 e da §5.2. A forma nasce no primeiro salvar |
| `confirmar_forma_de_pagamento_pela_equipe(p_negocio, p_observacao)` | Na 4a, só a partir de `rascunho`. O ramo de `enviada`, que cancela o link, entra na 4b |
| `voltar_forma_para_rascunho(p_negocio)` | Na 4a, só o "Refazer" de `confirmada`, com o CRM-10. "Editar", "Ajustar" e "Cancelar link" entram na 4b, e lá se decide quem pode cada um |
| `ganhar_negocio`, passo (7) | Como na §5.4, no caminho de simulação e no de gravação. `p_cobrancas_sem_confirmacao` continua sem efeito |
| `opportunities_ganho_nao_se_apaga` | Ampliada como na §5.5 |
| Trava dos vistos | `opportunity_items`: insert, update e delete recusados enquanto a forma do negócio estiver `confirmada` com `charges_created_at` nulo (§5.1). O gatilho lê a forma com `for share`, como a trava do Ganho lê o negócio. A cascata e a ação da chave estrangeira passam |
| Concorrência | Salvar, confirmar e refazer leem o negócio com `for share` e depois a forma com `for update`; o passo (7) do Ganho, que já trava o negócio com `for update`, lê a forma com `for update`; a trava dos vistos lê o negócio e depois a forma com `for share`. A ordem é sempre negócio, depois forma, para não haver impasse. A confirmação monta a cópia depois de travar |
| Espelho | `payment_plans` e as tabelas filhas **não** vão ao aparelho. `receivables` já vai; quem constrói confere se a coluna nova desce sem mudar `sync_manifesto` e o esquema local |

## 7. Telas

**O cartão "Forma de pagamento"** fica no lead (`/crm/[id]`), logo abaixo do cartão
Negócio *(minha decisão: a forma é feita dos vistos que estão ali)*.

```
Forma de pagamento                       [confirmada]
Entrada · pix · R$ 10.000 · 10/nov
Parcelas · transferência · 3 × US$ 3.000 · 10/dez, 10/jan, 10/fev
Total: R$ 10.000 + US$ 9.000
Confirmada pela equipe em 05/nov, por Ana Lima — "acertado por WhatsApp"
Cotação usada (C6), só a equipe vê: [ 5,4321 ]  [ C6, 05/nov ]
                                                     [Refazer]
```

- **Sem forma:** um `EmptyState` com "Definir forma de pagamento".
- **`rascunho`:** o selo "rascunho" e os botões "Editar" e "Confirmar pela equipe".
  "Confirmar" só aparece para o dono do negócio e para a gestão.
- **`confirmada`:** o selo "confirmada" e o botão "Refazer", só para o dono e a
  gestão.
- **Negócio encerrado, ou reaberto depois de o Ganho criar as cobranças:** o
  cartão fica só para leitura, menos a cotação. Se o Ganho criou as cobranças,
  aparece "Cobranças criadas no Ganho em ‹data›" com o link para
  `/clientes/<id>?aba=financeiro`, e Refazer não aparece.
- **A cotação:** dois campos que salvam ao sair do campo (`InlineText`), em
  qualquer estado.

**A janela da forma** é um `FormDialog`, aberto por "Definir" ou "Editar":

```
Forma de pagamento — Maria Souza
Vistos: EB-1A US$ 8.000 · O-1 US$ 6.000 · Total US$ 14.000
[+ Entrada] [+ Parcelas] [+ Cartão] [+ À vista]
┌ Entrada · [pix ▾] · [R$ ▾] [10.000] · 1ª data [10/nov]          [remover]
└ Parcelas · [transferência ▾] · [US$ ▾] [9.000] · [3]x · 1ª data [10/dez]
    1  [10/dez] [3.000]   2  [10/jan] [3.000]   3  [10/fev] [3.000]
Total da forma: R$ 10.000 + US$ 9.000
                                         [Cancelar] [Salvar]
```

- Mudar o total, o número de parcelas ou a 1ª data gera de novo as parcelas
  daquela parte. Editar uma parcela à mão vale até a próxima geração.
- A soma errada aparece junto da parte e impede salvar.
- No cartão, e em toda parte de 1 parcela, aparecem só o valor e uma data.
- **No celular de 375 px:** as partes empilham, e cada parcela é uma linha com
  data e valor, sem rolagem horizontal.

**"Confirmar pela equipe"** abre uma confirmação com o resumo das partes, o aviso de
coerência, quando houver, e o campo de observação.

**A lista Vistos do cartão Negócio**, com a forma confirmada: some o "adicionar", e
os itens ficam só para leitura, com a frase da §5.1.

**O resumo do Ganho** (`ResumoDoGanhoNaTela`) troca o fixo "Forma de pagamento:
definir na aba Financeiro" e o "Nenhuma cobrança será criada." pelo que a §5.4
manda.

**Sem internet:** o lead já não abre sem internet, e nada muda.

## 8. Critério de aceite da 4a

Os da §6.4 que valem na 4a, mais os desta metade:

As datas dos exemplos são contadas a partir do dia do teste, para nenhum caso
cair no aviso de vencida sem querer: "daqui a 10 dias", "daqui a 1 mês".

- O dono monta a entrada de R$ 10.000 no pix daqui a 10 dias e 3 × US$ 3.000 por
  transferência a partir de daqui a 1 mês. O cartão mostra "R$ 10.000 + US$ 9.000"
  e as 4 datas.
- As validações, no banco e na tela:
  - cartão com mais de 1 parcela é recusado;
  - parcelas com 37 são recusadas;
  - parcelas que somam diferente do total não salvam;
  - a 11ª parte, o rótulo com 81 caracteres e a observação com 501 são
    recusados.
- **Coerência:** vistos em US$ 14.000 e partes em US$ 13.000 mostram "A forma soma
  US$ 13.000 e os vistos, US$ 14.000." na janela, na confirmação e no resumo do
  Ganho, e nada é bloqueado. Com o exemplo acima (R$ e US$), os dois totais
  aparecem lado a lado, sem aviso.
- **Confirmar pela equipe** numa forma em `rascunho`: ela vira `confirmada`, a
  resposta registra quem confirmou e a observação, e o histórico da pessoa mostra a
  linha. A conta `teste-staff`, que não é dona do negócio, é recusada ao confirmar
  e ao refazer.
- Confirmar e refazer com o negócio ganho ou perdido são recusados com a frase da
  §5.6.
- **A prova não se forja** (teste de RLS vermelho antes, na organização de teste):
  - inserção direta em `payment_plan_responses` pela API, com qualquer `decision`,
    é recusada;
  - `update payment_plans set status = 'confirmada'` pela API é recusado;
  - `update payment_plans set charges_created_at = null` pela API é recusado;
  - `insert` direto em `payment_plans`, já `confirmada` ou não, é recusado;
  - `delete` direto em `payment_plans` apaga 0 linhas, e a resposta continua lá;
  - inserir, mudar ou apagar partes e parcelas direto pela API é recusado;
  - `update` e `delete` em `payment_plan_responses` são recusados;
  - mudar `reference_rate` direto pela API funciona.
- **Ganho com a forma confirmada:** nascem 2 cobranças, uma em R$ com 1 parcela e
  uma em US$ com 3, com a organização da pessoa e os títulos da §5.4. O resumo
  listou as mesmas 2.
- **Ganho com a forma em rascunho ou sem forma:** nenhuma cobrança, e o resumo diz
  por quê.
- **Vencida:** com uma parcela de ontem, o resumo avisa "1 parcela já vencida", e o
  Ganho passa.
- **Sem cobrança duplicada:** Ganho com a forma confirmada, depois reabrir. Refazer
  é recusado com a frase da §5.6. Ganhar de novo não cria cobrança, e o resumo diz
  que já foram criadas.
- **Negócio reaberto depois das cobranças:** acrescentar um visto passa, e ganhar
  de novo cria só o processo do visto novo, sem cobrança. O cartão mostra
  "Cobranças criadas no Ganho em ‹data›" e não mostra Refazer.
- **Negócio encerrado:** salvar a forma de um negócio ganho é recusado. A cotação
  continua editável.
- **Vistos travados:** com a forma `confirmada`, acrescentar, mudar ou retirar um
  visto pela API é recusado com a frase da §5.1, também na organização de teste.
  Depois de Refazer, passa. Apagar nas Configurações o tipo de visto de um item
  desse negócio funciona, e o item fica sem visto.
- **Excluir:** um negócio com confirmação registrada, mesmo depois de Refazer, é
  recusado com a frase da §5.5, também na organização de teste. Um negócio com forma
  só em rascunho se exclui. Apagar a pessoa descartável leva tudo.
- **Cotação:** com a forma `confirmada`, a equipe anota a cotação, e a cópia
  guardada não muda.
- **Usuário do portal** (conta de teste de cliente): num negócio **da própria
  pessoa dele** (a pessoa ligada à conta, da 0015), com forma confirmada, não lê
  `payment_plans`, as partes, as parcelas nem as respostas. O teste usa a pessoa
  dele de propósito: ela lê os próprios negócios e vistos, e uma policy copiada
  desse padrão passaria num teste feito com o negócio de outra pessoa.

## 9. Requisitos

O que a 4a entrega de cada requisito. A spec é atualizada no passo seguinte.

| ID | Na 4a | Fica para a 4b |
|---|---|---|
| FIC-7 | A janela da forma (o passo 1), aberta por "Definir" ou "Editar". O texto do requisito muda: o cartão é um pagamento só, sem as 10x e 18x | "Enviar ficha", o resumo (passo 2) e o link |
| FIC-10 | A confirmação a partir de `rascunho` | A partir de `enviada`, cancelando o link |
| FIC-11 | Inteiro | — |
| REC-6 | Inteiro para a forma confirmada | "Criar as cobranças mesmo assim" (§6.3) |
| CRM-14 | A forma de pagamento e as cobranças no resumo e na gravação | O trecho das formas `enviada` e `recusada` |
| FIC-8, FIC-9, INI-8 | — | Inteiros |

## 10. Minhas decisões, para o Renato conferir

| # | Decisão | Por quê |
|---|---|---|
| 1 | O cartão fica abaixo do Negócio, no lead | A forma é feita dos vistos que estão ali |
| 2 | A cobrança do Ganho não tem processo | Uma forma paga todos os vistos juntos |
| 3 | Na 4a, a cobrança só nasce com "Confirmar pela equipe" antes do Ganho | Sem o link, é o único jeito de a forma chegar a `confirmada` |
| 4 | A forma só se mexe com o negócio aberto; a cotação, sempre | A cobrança nasce no Ganho. Uma forma confirmada depois dele não geraria nada |
| 5 | Refazer pede o dono do negócio ou a gestão | Desfazer a confirmação pesa o mesmo que fazê-la |
| 6 | Negócio com confirmação registrada não se exclui, mesmo depois de Refazer; a saída é marcar como perdido | Excluir apagaria a prova pela cascata |
| 7 | Até 10 partes por forma | Limite contra erro de digitação; nenhum acerto real chega perto |
| 8 | Histórico com um tipo de sistema novo, `forma_de_pagamento` | Fica separado da troca de etapa e não se apaga |
| 9 | O `check` de estado já leva `enviada` e `recusada`, e `payment_plan_responses` nasce inteira | A 4b não precisa migrar dado nem mudar `check` |
| 10 | A corrida entre abrir o resumo do Ganho e confirmar fica aceita, como na entrega 3 | Barrar exigiria mudar a assinatura de `ganhar_negocio`, e a janela é de segundos |
| 11 | Depois que o Ganho cria as cobranças, a forma vira registro e a trava dos vistos para | Sem isso, os vistos do negócio reaberto ficariam presos para sempre, contra o CRM-15 |
| 12 | A resposta guarda o nome de quem confirmou, e `answered_by` se anula se o usuário for excluído | O `check` da §6.4 recusaria excluir esse usuário, e a prova perderia o nome |

**Decidido pelo Renato em 21/nov:**

- os vistos travam enquanto a forma estiver confirmada (§5.1);
- o cartão é uma parcela só, sem número de vezes nem juros, porque a Duli recebe
  tudo antecipado (§5.2).

## 11. Fica com quem constrói

- Os padrões de cada botão, além do rótulo e do método (moeda, número de parcelas,
  1ª data).
- O formato exato do `jsonb` de `salvar_forma_de_pagamento` e da cópia.
- A ordem de crescimento das partes na tela e o desenho fino do cartão e da janela,
  com os componentes e os tokens do `AGENTS.md`.
- Onde mora o código. Uma feature não importa de outra (`AGENTS.md`): se a forma
  usar `gerarParcelas` e `somarMeses` fora do Financeiro, os dois sobem para
  `src/lib/`.
- Os nomes dos arquivos de teste e a divisão em commits.
