# Entrega 4b — a forma de pagamento vai pelo link e o cliente responde

**Data:** 23/nov/2026.
**Desenho de origem:** `2026-11-17-contato-oportunidade-cliente-design.md` §6.4,
com o recorte da `2026-11-21-entrega-4a-forma-de-pagamento-design.md`.

Este documento fecha a segunda metade da entrega 4. **O que ele não diz vale
como está na §6.4 e no desenho da 4a.** O que ele muda está marcado. As decisões
do Renato são de 23/nov, salvo outra data.

## 1. Por que

O fluxo do Renato (21/nov) tem seis passos. A 4a fez o 2 e o 6: a equipe define a
forma, e o Ganho cria as cobranças. Falta o 3:

1. O cliente diz "vamos fechar".
2. A equipe põe a forma de pagamento que o cliente escolheu.
3. **A equipe envia o link da ficha. O cliente preenche os dados cadastrais, vê
   a forma de pagamento e dá o OK.**
4. Esses dados vão para o contrato.
5. Depois que o cliente assina, a oportunidade é marcada como ganha.
6. O Ganho cria o perfil do cliente, os processos e as cobranças.

Hoje o passo 3 é por WhatsApp, e a equipe confirma por ele ("Confirmar pela
equipe", FIC-10). Com a 4b, o próprio cliente confirma, e fica a prova do que ele
viu.

**O que o cliente vê na ficha é o que vai no contrato** (Renato, 23/nov). Os três
contratos que ele mandou (Ricardo Wiest, Guilherme de Oliveira, João Batista
Neto) mostram a cláusula 3 assim:

| Contrato | Como o pagamento aparece |
|---|---|
| Ricardo | "USD 6.000,00 convertido para reais totalizando R$ 35.857,91", 4 parcelas em reais com as datas, pix |
| Guilherme | USD 6.000,00, sendo US$ 2.100,00 à vista por transferência para a conta C6 Global, e US$ 3.900,00 convertidos para R$ 21.527,76 no cartão |
| João | R$ 27.128,51, direto em reais, 4 boletos com as datas |

Daí a única mudança de modelo desta entrega: a parte em reais pode dizer **de
quantos dólares ela veio**. A cotação e a validade da conversão **não** vão para
a ficha. O Renato manda ao cliente o print da tela do C6. A validade (3 dias úteis
a partir do envio do contrato) é assunto do contrato, na entrega seguinte.

**O nome, para não confundir** (Renato, 23/nov). O app não cobra nem gera link de
pagamento: o link do cartão do C6, o Renato gera à mão e envia por fora. O que a
4b envia é **o link da ficha** de sempre (`/cadastro/<token>`), que passa a levar
a forma de pagamento para o cliente ler e dar o OK. Nas frases da tela ele é "o
link da ficha"; neste documento, "o link com a forma", quando é preciso
distingui-lo do link da ficha comum. "Link de pagamento" não aparece em lugar
nenhum.

## 2. Abordagens

| | Como | Troca |
|---|---|---|
| **A, a escolhida** | A porta sem login ganha uma terceira função, `responder_forma_de_pagamento`, com as travas da ficha (0035): o token é a única chave, tem prazo, a linha é travada, e do navegador chegam só sim, não e o motivo. `abrir_ficha_de_cadastro` passa a devolver a forma, e `enviar_ficha_de_cadastro` deixa o link aberto quando há forma | Mais uma função `security definer` executável por `anon`, que o `AGENTS.md` passa a listar. É o desenho da §6.4 |
| B | Juntar a resposta do pagamento em `enviar_ficha_de_cadastro`, com um parâmetro de modo | Mistura dois atos numa função só. O reenvio "só do pagamento" (FIC-9) teria de passar pela função que grava dado pessoal, e a regra "não aceita dados pessoais" viraria um `if` dentro dela |
| C | Gravar a resposta por uma rota do servidor com a chave de serviço | Abre um caminho de escrita que a RLS não vê. O `AGENTS.md` proíbe |

A conversão:

| | Como | Troca |
|---|---|---|
| **A, a escolhida pelo Renato** | A parte em reais ganha o campo opcional "convertido de US$". O Renato digita os dois valores, e o app não calcula nada | Dois números para digitar. O valor em reais é exatamente o que ele combinou |
| B | O Renato digita o dólar e a cotação, e o app calcula os reais | O valor do contrato dependeria do arredondamento do app. O R$ 35.857,91 do Ricardo não sai de uma cotação de 4 casas |

## 3. Objetivos, fora e fracasso

**Objetivos**

- No lead, **Enviar ficha** com a forma de pagamento: uma prévia do que o cliente
  vai ver e, só depois de confirmar, o link.
- No link, o cliente preenche os dados pessoais e depois vê a forma de pagamento,
  com todas as datas, inclusive a do cartão. Responde **Confirmo** ou **Há algo
  errado**, com o motivo opcional.
- Recusada: a equipe ajusta e envia de novo. O link novo abre direto no pagamento
  e não aceita dados pessoais.
- O link com forma vale **3 dias úteis**. Vencido, o cliente lê "Este link
  expirou. Peça um novo à Duli.", e o lead mostra "link vencido".
- A parte em reais diz de quantos dólares veio, e o cliente vê os dois valores.
- A Início avisa da forma recusada, da confirmada (pronta para o contrato) e do
  link com a forma vencido sem resposta.
- A equipe confirma também a forma enviada (o cliente respondeu pelo WhatsApp), e
  o link aberto é cancelado.
- O aviso de "ficha recebida" não fica mais preso quando um link novo é gerado
  antes do "Conferi" (I4).

**Fora**

- O contrato e o ZapSign (spec 7.5). A validade da conversão, os dados bancários de
  cada método e o texto da cláusula 3 são de lá.
- A cotação e a validade da conversão na ficha (Renato, 23/nov).
- Uma conferência nova entre a forma e os vistos (Renato, 23/nov). O aviso da 4a,
  quando tudo está na mesma moeda, continua como está.
- **"Criar as cobranças mesmo assim"** com a forma enviada ou recusada *(minha
  decisão, aceita pelo Renato em 23/nov)*. Se o cliente confirmou por fora, o
  caminho é "Confirmar pela equipe". Cobrança de forma recusada não faz sentido. O
  parâmetro `p_cobrancas_sem_confirmacao` de `ganhar_negocio` continua sem efeito,
  para a assinatura não mudar.
- Feriados na conta dos dias úteis.
- Boleto, link de cartão e nota fiscal automáticos (Itaú, C6, provedor). As
  cobranças continuam nascendo no Ganho. O Renato sobe boleto e nota fiscal à mão
  na parcela (CLI-6) e dá baixa à mão (Renato, 23/nov).
- Rascunho da ficha (FIC-5) e endereço pelo CEP (FIC-6).
- A forma de pagamento no cartão do quadro do CRM.

**O que seria fracasso, mesmo funcionando:**

- o cliente confirmar uma coisa e a prova guardar outra;
- o cliente ver a cotação, ou, pelo link, CPF, RG ou endereço;
- uma forma enviada mudar com o link ainda valendo;
- a porta sem login ficar mais larga que uma pessoa por token, ou aceitar quem
  está logado;
- a recusa apagar os dados pessoais que o cliente já mandou;
- um aviso da Início que não some, ou que some antes de o problema acabar;
- cobrança duplicada, ou cobrança de uma forma que o cliente não confirmou.

## 4. Restrições

Valem as da §3 do desenho de origem, as da §4 da 4a e as do `AGENTS.md`. As que
mais pesam aqui:

- **A porta sem login** (`AGENTS.md`, "Uma porta para quem não tem login"): token
  de 256 bits gerado no servidor, uso único e prazo, a linha travada antes de
  gravar, lista fechada do que entra, só `anon` executa, e o app chama pelo
  `lib/supabase/anonimo.ts`, sem cookie. Nenhuma policy `to anon`.
- **Marcas** `dulihub.via_forma` e `dulihub.via_ficha`, ligadas e desligadas pelas
  funções. Os gatilhos recusam o resto, também na organização de teste, e a cascata
  passa (`pg_trigger_depth() > 1`).
- **A ordem das travas** continua: negócio, depois forma, depois link.
- **Hoje** é `(now() at time zone 'America/Sao_Paulo')::date`.
- **Compatível com o código no ar.** Até o deploy não existe link com a forma, e
  o `gerarLink` de hoje grava os valores padrão. A migration vai antes do código,
  num push só.

## 5. Regras

### 5.1 Estados da forma

Os quatro estados já existem no `check` (0058). A 4b alcança `enviada` e
`recusada`:

| Estado | O que se pode fazer | Quem |
|---|---|---|
| `rascunho` | Editar; **Enviar ficha** → `enviada`; Confirmar pela equipe → `confirmada` | Editar e enviar: qualquer membro da organização do negócio. Confirmar: CRM-10 |
| `enviada` | **Editar** → `rascunho`, cancelando o link (aviso: "O link enviado em ‹data› deixa de valer."); **Cancelar link** → `rascunho`; Confirmar pela equipe → `confirmada`, cancelando o link; a resposta do cliente → `confirmada` ou `recusada` | Editar e cancelar: qualquer membro. Confirmar: CRM-10 |
| `recusada` | **Ajustar** → `rascunho` | Qualquer membro |
| `confirmada` | Refazer → `rascunho` | CRM-10 (como na 4a) |

*Quem pode cada coisa é minha decisão.* Enviar, editar, cancelar e ajustar não
fecham nem desfazem acordo, e salvar a forma já é de qualquer membro. Confirmar e
refazer, sim, e continuam com o dono do negócio ou a gestão.

- Tudo isso só com o negócio aberto e `charges_created_at` nulo, com as frases da
  §5.6 da 4a.
- **A trava dos vistos** (FIC-12) passa a valer também com a forma `enviada`: a
  forma que o cliente está lendo não muda por baixo dele. A frase muda para
  "A forma de pagamento foi enviada ao cliente. Use Editar para mudar os vistos."
- **Link vencido** não muda o estado: a forma continua `enviada`, e o cartão mostra
  "link vencido". Para enviar de novo, o caminho é Editar (o link morto é
  cancelado) e Enviar ficha. *(Minha decisão: o prazo curto existe porque o valor
  envelhece, e passar pela janela da forma obriga a olhar os valores antes de
  reenviar.)*
- **Quem clica diz o que viu** *(minha decisão, depois da revisão do desenho)*.
  - Editar, Cancelar link, Ajustar e Refazer dizem de que estado partem. Se a
    forma mudou nesse meio-tempo — o cliente confirmou enquanto o dono clicava em
    Cancelar link, por exemplo —, nada é gravado: "A forma de pagamento mudou
    enquanto você olhava. Atualize a página." Sem isso, o Cancelar link chegaria
    numa forma já confirmada e desfaria a confirmação do cliente.
  - Enviar ficha leva a versão da forma que a prévia mostrou. Se alguém salvou a
    forma depois da prévia, o envio é recusado com a mesma frase, e o link nunca
    sai com valores que ninguém viu.

### 5.2 A parte em reais e o dólar de onde ela veio

- `payment_plan_parts.usd_equivalent`, `numeric(12,2)`, opcional: "convertido de
  US$". Só a parte em BRL o tem. Maior que zero, no máximo 2 casas decimais, não
  NaN.
- A janela da forma mostra o campo só quando a moeda da parte é R$.
- A mesma conferência nos dois lados: `erroDaParte` na tela e
  `private.erro_da_forma` no banco. As frases: "Só a parte em reais é convertida
  de dólar." e "Informe de quantos dólares ‹rótulo› foi convertida."
- O valor vai para a cópia guardada (a prova), nas duas confirmações, a do
  cliente e a da equipe. Cópia antiga, sem a chave, se lê como "sem conversão".
- O cartão do lead, a janela, a prévia do envio, a ficha do cliente e o resumo
  do Ganho mostram "US$ 3.900,00 convertidos para R$ 21.527,76".
- A conferência da 4a com os vistos não muda: com moedas diferentes, os dois
  totais aparecem lado a lado, sem aviso.
- A cobrança que o Ganho cria continua na moeda da parte (R$), com o valor em
  reais. O dólar de origem não vai para o Financeiro.

### 5.3 O link com forma

- **Prazo: 3 dias úteis**, de segunda a sexta, sem feriados. O dia do envio não
  conta. O link vale até 23h59 do 3º dia útil, em São Paulo: enviado na segunda,
  vale até quinta; na sexta, no sábado ou no domingo, até quarta. `expires_at`
  grava o início do dia seguinte em São Paulo, e a tela mostra o 3º dia útil.
- O link da ficha **sem** forma ("Gerar link da ficha" no contato) continua com 15
  dias.
- **Modos.** `completa`: os dados pessoais, depois o pagamento. `so_pagamento`:
  abre em "Seus dados já foram recebidos ✓" e vai direto ao pagamento.
  - Quem já mandou a ficha alguma vez recebe `so_pagamento`, salvo se a equipe
    marcar "pedir os dados pessoais de novo" (desmarcado por padrão).
  - Os outros recebem `completa`.
- **No modo `completa`**, enviar os dados grava a ficha como hoje (`submitted_at`,
  a resposta, o anterior, o histórico, o aviso "ficha recebida") e **não** fecha o
  link. O link fecha (`closed_at`) quando o pagamento é respondido.
- **Um link aberto por pessoa.** Aberto quer dizer `closed_at` e `cancelled_at`
  nulos. A migration copia `closed_at = submitted_at` nas linhas que já existem.
- **Enviar com uma ficha comum aberta** (sem forma, ainda não preenchida): ela é
  cancelada e substituída. A prévia avisa antes: "O link da ficha enviado em
  ‹data› deixa de valer."
- **Enviar com outro link com a forma aberto** (outro negócio da mesma pessoa):
  recusado. "Há um link da ficha aberto no negócio ‹título›. Cancele-o antes
  de enviar outro."
- **"Gerar link da ficha" com um link com a forma aberto:** recusado. "Há um
  link da ficha aberto no negócio ‹título›. Cancele-o no negócio antes."
- **Cancelar um link com a forma** só passa pela função da forma, para ela não
  ficar `enviada` sem link. O `update` direto de `cancelled_at` num link com a
  forma é recusado pelo gatilho.
- **O negócio deixa de estar aberto** (Ganho, Perdido, ou qualquer caminho que
  mude `opportunities.status` de `open`): um gatilho no negócio cancela o link com a
  forma aberto e põe a forma `enviada` de volta em `rascunho`, com o
  histórico "Link da ficha cancelado: o negócio foi encerrado". A forma
  `recusada` ou `confirmada` não muda. *(Minha decisão, depois da revisão do
  desenho: um link deixado aberto num negócio encerrado contaria como "o link
  aberto da pessoa" para sempre e impediria qualquer link novo para ela, inclusive
  em outro negócio. Um gatilho só cobre o Ganho, que grava por função, e o
  Perdido, que grava por `update`.)* As funções anônimas conferem de novo: negócio
  fora de `open` aparece como cancelado, e a resposta é recusada.
- **Pessoa na lixeira:** cancelado, como hoje.

### 5.4 O que o cliente vê

No modo `completa`, os dados pessoais vêm primeiro, como hoje, com "Passo 1 de 2".
Depois do envio, a mesma página passa ao pagamento:

```
Forma de pagamento

Serviços
  EB-2 NIW ......................... US$ 6.000,00

Entrada · Transferência
  US$ 2.100,00 em 10/12/2026
Cartão · Cartão de crédito
  US$ 3.900,00 convertidos para R$ 21.527,76 em 15/12/2026

            [ Confirmo ]    [ Há algo errado ]
```

- Os vistos, com nome, valor e moeda, e o total por moeda.
- Cada parte com o rótulo, o método, o valor (com a conversão, quando houver) e
  todas as parcelas, com data e valor. **No cartão também aparece a data**
  (Renato, 23/nov: o cliente pode ver as datas; se for o caso de ajustar, isso se
  faz antes de enviar o contrato).
- **Nunca** a cotação, a anotação da cotação, CPF, RG nem endereço.
- **Há algo errado** abre o campo do motivo (opcional, até 500 caracteres) e
  "Enviar".
- As telas finais. ‹organização› é o nome da organização dona do link, que
  `abrir_ficha_de_cadastro` já devolve: o cliente de um parceiro vê a marca do
  parceiro, não a Duli. Para o cliente da Duli, sai "Duli Consulting" (ou o nome
  que estiver em `organizations.name`).
  - depois de Confirmo: "Obrigado! A ‹organização› vai preparar o seu contrato e
    enviar para assinatura.";
  - depois de Há algo errado: "Recebemos. A ‹organização› vai rever a forma de
    pagamento e enviar um novo link.";
  - link vencido: "Este link expirou. Peça um novo à ‹organização›.";
  - já respondido: "Você já respondeu" e "A ‹organização› recebeu a sua resposta
    sobre a forma de pagamento e vai seguir com os próximos passos." *(Renato,
    23/nov, depois da entrega: com a frase de antes, quem confirmou podia achar
    que a confirmação não valeu e pedir outro link.)*
  - cancelado: a frase de hoje ("Ele venceu ou foi substituído. Peça um novo
    link…").
- **No celular de 375 px:** uma coluna, sem rolagem horizontal; cada parcela é uma
  linha com data e valor.

**A prévia do envio e a ficha usam o mesmo componente** para desenhar a forma.
Prévia e ficha divergindo seria o cliente confirmar uma coisa diferente da que a
equipe aprovou.

### 5.5 Confirmar pela equipe a partir de `enviada`

- Como na 4a, mais o ramo de `enviada`: cancela o link aberto (vencido ou não), na
  mesma gravação, e grava a resposta `confirmada_pela_equipe` com a cópia.
- A partir de `recusada`, não: antes, Ajustar.

### 5.6 Os avisos da Início (INI-8)

Só de negócios abertos, da organização de quem olha, como os outros avisos. Cada um
leva ao lead.

| Aviso | Aparece quando | Some quando |
|---|---|---|
| "Forma de pagamento recusada — ‹pessoa›", com o motivo | A última resposta da forma é `recusada` e a forma está em `recusada` ou em `rascunho` | A forma é enviada de novo, é confirmada, ou o negócio é encerrado |
| "Pronto para o contrato — ‹pessoa›" | A forma está `confirmada` e sem cobranças criadas | Ganho, Refazer ou negócio encerrado |
| "Forma de pagamento sem resposta, link vencido — ‹pessoa›" | A forma está `enviada` e o link dela venceu | Editar, Cancelar link, Confirmar pela equipe ou negócio encerrado |

- O aviso de recusada sobrevive ao Ajustar de propósito: quem só clicou em Ajustar
  ainda não reenviou nada.
- A ficha `so_pagamento` não gera o aviso de "ficha recebida": ela não recebe dado
  pessoal.

### 5.7 "Ficha recebida" e o link atual são coisas separadas (I4, Q11)

Hoje o contato mostra só o link mais recente não cancelado. Gerar outro antes do
"Conferi" esconde o botão, e o aviso da Início fica preso. Com a 4b isso
aconteceria a cada recusa reenviada.

- **A ficha** (os dados): o estado sai do link mais recente **com dados
  recebidos** (`submitted_at`). "Recebida" enquanto `reviewed_at` for nulo, com o
  "Conferi"; depois, "conferida".
- **O link atual**: o mais recente aberto (`closed_at` e `cancelled_at` nulos),
  "aguardando" ou "vencido".
- Um link novo não invalida a ficha recebida. O aviso da Início fica até o
  "Conferi" (Q11, decidida assim em 23/nov).
- O quadro do CRM (o selo de ficha no cartão) segue a mesma regra.

### 5.8 No Ganho

O trecho "Forma de pagamento" do resumo ganha duas situações. As outras ficam como
na §5.4 da 4a:

| Situação | O resumo mostra | Cobranças |
|---|---|---|
| `enviada` | "Enviada ao cliente em ‹data›, sem resposta: nenhuma cobrança será criada, e o link será cancelado. Para criá-las, confirme pela equipe antes do Ganho." | Nenhuma |
| `recusada` | "Recusada pelo cliente em ‹data›: nenhuma cobrança será criada. Ajuste a forma e envie de novo, ou confirme pela equipe." | Nenhuma |

- A confirmada mostra quem confirmou: "Confirmada pelo cliente em ‹data›" ou
  "Confirmada pela equipe em ‹data›, por ‹nome›".

### 5.9 Excluir negócio

- Negócio **aberto com link com a forma aberto** não se exclui: "Cancele o link da
  ficha antes." Fica no gatilho `opportunities_ganho_nao_se_apaga`, que é
  ampliado, e no `deleteOpportunity`.
- A regra da 4a continua: negócio com qualquer resposta registrada não se exclui. A
  recusa do cliente também é resposta.

### 5.10 Histórico da pessoa

Tipo `forma_de_pagamento`, como na 4a:

- "Forma de pagamento enviada ao cliente"
- "Forma de pagamento confirmada pelo cliente"
- "Forma de pagamento recusada pelo cliente: ‹motivo›" (sem o motivo, quando
  vazio)
- "Forma de pagamento editada; o link enviado foi cancelado" (Editar e Cancelar
  link)
- "Forma de pagamento ajustada" (Ajustar)

### 5.11 Frases fixas novas

| Situação | Frase |
|---|---|
| Vistos com a forma enviada | "A forma de pagamento foi enviada ao cliente. Use Editar para mudar os vistos." |
| Salvar ou enviar com a forma enviada | "A forma foi enviada ao cliente. Use Editar para mudar." |
| Salvar ou enviar com a forma recusada | "O cliente recusou a forma. Use Ajustar para mudar." |
| Enviar sem visto ou sem parte | "Acrescente pelo menos um visto e uma parte antes de enviar." |
| Outro link com a forma aberto | "Há um link da ficha aberto no negócio ‹título›. Cancele-o antes de enviar outro." |
| Gerar link da ficha com link com a forma aberto | "Há um link da ficha aberto no negócio ‹título›. Cancele-o no negócio antes." |
| Excluir negócio com link com a forma aberto | "Cancele o link da ficha antes." |
| Parte em outra moeda com conversão | "Só a parte em reais é convertida de dólar." |
| Conversão sem valor | "Informe de quantos dólares ‹rótulo› foi convertida." |
| Link vencido, para o cliente | "Este link expirou. Peça um novo à ‹organização›." |
| A forma mudou entre a tela e o clique | "A forma de pagamento mudou enquanto você olhava. Atualize a página." |
| Mexer direto num link com a forma pela API | "Mude o link da ficha pela tela do negócio." |

## 6. Banco

Uma migration, `0064`, compatível com o código no ar (§4).

| Peça | O que muda |
|---|---|
| `payment_plan_parts.usd_equivalent` | Nova, como na §5.2: `check (usd_equivalent is null or (currency = 'BRL' and usd_equivalent > 0 and usd_equivalent <> 'NaN'))` |
| `private.erro_da_forma` | Confere `usd_equivalent` (formato, moeda, valor, 2 casas), na mesma ordem de `erroDaParte` |
| `salvar_forma_de_pagamento` | Grava `usd_equivalent`. Recusa `enviada` e `recusada` com as frases da §5.11. Passa a tocar `payment_plans.updated_at` a cada gravação: é a versão que a prévia do envio leva (§5.1). Mudar a cotação também a toca; o pior caso é pedir "Atualize a página" sem necessidade |
| `registration_forms` | Ganha `payment_plan_id` (FK composta com `payment_plans`, `on delete set null (payment_plan_id)`), `mode` (`completa` ou `so_pagamento`, padrão `completa`) e `closed_at`. Backfill `closed_at = submitted_at` **antes** do gatilho. O índice `registration_forms_um_em_aberto` passa a valer onde `closed_at` e `cancelled_at` são nulos |
| Gatilho de `registration_forms` | Sem a marca `via_ficha`: **no insert**, só os valores padrão (`mode = 'completa'`, `closed_at` e `payment_plan_id` nulos), que é o que `gerarLink` e a fumaça gravam. **No update de um link com a forma** (`payment_plan_id` preenchido ou `mode = 'so_pagamento'`), a linha inteira fica congelada, menos `reviewed_at`, `reviewed_by` e o `updated_at` que vem junto — comparação da linha inteira, como a 0061 fez em `payment_plans`, para coluna nova nascer protegida; assim ninguém estica `expires_at`, troca o token nem reescreve `answers` pela API. **No update de um link comum**, recusa mudar `mode`, `closed_at` e `payment_plan_id`, e o resto segue como hoje. **No delete de um link com a forma**, recusa, menos a cascata (`pg_trigger_depth() > 1`). Com a marca, confere que a pessoa do link é a do negócio da forma. Frase: "Mude o link da ficha pela tela do negócio." |
| Gatilho novo em `opportunities` (`after update of status`) | Quando o status sai de `open`: com a marca `via_forma` e `via_ficha`, cancela o link com a forma aberto do negócio e põe a forma `enviada` em `rascunho`, com o histórico (§5.3). Roda dentro da trava do negócio, e a ordem segue negócio, forma, link |
| `private.fim_do_prazo_em_dias_uteis(p_de timestamptz, p_dias int) returns timestamptz` | Pura, sem tabela, como na §5.3. Provada com datas fixas (segunda, sexta, sábado, domingo) |
| `public.enviar_forma_de_pagamento(p_negocio uuid, p_versao timestamptz, p_pedir_dados_de_novo boolean default false) returns text` | `security invoker`, marcas `via_forma` e `via_ficha`. Negócio aberto, forma em `rascunho` com `updated_at = p_versao` (senão, a frase "mudou enquanto você olhava"), pelo menos um visto e uma parte, a forma sem erro. Recusa outro link com a forma aberto da pessoa; cancela a ficha comum aberta. Escolhe o modo (§5.3), gera o token no banco (32 bytes aleatórios em base64url, o formato que `publico-queries.ts` aceita), grava o link com `payment_plan_id`, o modo e o prazo, põe a forma em `enviada`, registra no histórico e devolve o token |
| `voltar_forma_para_rascunho(p_negocio uuid, p_de text default 'confirmada')` | `drop` e `create`, com o parâmetro novo. Cobre Editar e Cancelar link (`p_de = 'enviada'`: cancela o link aberto, qualquer membro), Ajustar (`'recusada'`, qualquer membro) e Refazer (`'confirmada'`, CRM-10). Recusa quando o estado atual não é `p_de`, com a frase "mudou enquanto você olhava". O padrão `'confirmada'` mantém a chamada do código no ar (o Refazer da 4a) funcionando entre a migration e o deploy. O histórico conforme a §5.10 |
| `confirmar_forma_de_pagamento_pela_equipe` | Ganha o ramo de `enviada` (§5.5). A cópia leva `usd_equivalent` |
| `payment_plan_responses_na_entrada` | Ganha o ramo do cliente: sem usuário (`auth.uid()` nulo), com a marca, a forma em `enviada`, `registration_form_id` preenchido, `decision` em `confirmada` ou `recusada`; grava `answered_by` nulo e `answered_by_name` com o nome da pessoa. Com usuário, continua como na 4a, aceitando `rascunho` ou `enviada` |
| `abrir_ficha_de_cadastro` (anônima) | `drop` e `create` (o retorno muda), depois `revoke … from public, anon, authenticated` e `grant … to anon`. Situações: `aberta`, `aguardando_pagamento` (dados enviados com pagamento pendente, ou modo `so_pagamento`), `respondida`, e as de hoje (`enviada`, `expirada`, `cancelada`). `cancelada` também com o negócio fora de `open`. Devolve `modo`, `tem_forma` (para o "Passo 1 de 2") e, **só** em `aguardando_pagamento`, `forma jsonb` com os vistos e as partes com as parcelas e o `usd_equivalent`. **Nunca** a cotação, documento ou endereço |
| `enviar_ficha_de_cadastro` (anônima) | Liga e desliga `via_ficha`. Recusa o modo `so_pagamento`. Com forma, grava os dados e deixa o link aberto; sem forma, fecha como hoje (`submitted_at` e `closed_at`) |
| `public.responder_forma_de_pagamento(p_token text, p_aceita boolean, p_motivo text)` (anônima, **nova**) | `security definer`, só `anon` executa, com as travas da 0035: trava o link `for update`; exige `aguardando_pagamento`, a forma em `enviada`, o negócio aberto e a pessoa fora da lixeira. Monta a cópia **no banco**. Do navegador chegam só sim, não e o motivo (até 500 caracteres, aparado; vazio vira nulo). Grava a resposta, muda a forma, registra no histórico e fecha o link. A ordem das travas: negócio, forma, link. Qualquer recusa diz "Este link não está mais disponível." |
| Trava dos vistos | `opportunity_items_trava_do_ganho` passa a recusar também com a forma `enviada` (§5.1) |
| `opportunities_ganho_nao_se_apaga` | Ampliada como na §5.9 |
| `ganhar_negocio` | O retorno de `forma` já carrega a situação; confere que `enviada` e `recusada` chegam com a data da última mudança e que nenhuma cobrança nasce. Sem mudança de assinatura |

O aviso do Supabase "definer executável por anon" passa a valer para **três**
funções: `abrir_ficha_de_cadastro`, `enviar_ficha_de_cadastro` e
`responder_forma_de_pagamento`. O `AGENTS.md` muda junto.

`registration_forms` e as tabelas da forma continuam fora do espelho do aparelho.

## 7. Telas

**O cartão "Forma de pagamento"** (lead), por estado:

```
Forma de pagamento                      [enviada · vale até qui, 26/11]
Entrada · transferência · US$ 2.100 · 10/dez
Cartão · cartão · US$ 3.900 → R$ 21.527,76 · 15/dez
Total: US$ 2.100 + R$ 21.527,76
[Copiar link] [WhatsApp] [Editar] [Cancelar link] [Confirmar pela equipe]
```

| Estado | Selo | Botões |
|---|---|---|
| `rascunho` | rascunho | Editar, **Enviar ficha**, Confirmar pela equipe (CRM-10) |
| `enviada`, link aberto | enviada · vale até ‹dia› | Copiar link, WhatsApp, Editar, Cancelar link, Confirmar pela equipe (CRM-10) |
| `enviada`, link vencido | link vencido | Editar, Confirmar pela equipe (CRM-10) |
| `recusada` | recusada, com o motivo | Ajustar |
| `confirmada` | confirmada pelo cliente em ‹data› (ou pela equipe, por ‹nome›) | Refazer (CRM-10) |

Editar uma forma `enviada` pergunta antes ("O link enviado em ‹data› deixa de
valer."), com `ConfirmAction`.

**A janela da forma** ganha, na parte em R$, o campo "Convertido de US$".

**Enviar ficha** abre uma confirmação (`FormDialog`):

- a prévia, com o mesmo componente da ficha (§5.4);
- os avisos: parcela com data no passado (avisa, não bloqueia), ficha comum aberta
  que será cancelada;
- a caixa "Pedir os dados pessoais de novo", quando a pessoa já mandou a ficha;
- "Confirmar e gerar link". Depois: o link, "Copiar" (`CopiarTexto`) e "WhatsApp".

**A mensagem do WhatsApp** com forma diz até quando o link vale. Enviado na
segunda, 23/11: "O link vale até quinta-feira, 26/11." A da ficha comum fica como
está.

**Dados cadastrais** (contato e lead) seguem a §5.7: a ficha recebida com o
"Conferi", e o link atual à parte. "Gerar link da ficha" com link com a forma
aberto mostra a frase da §5.11.

**A ficha pública** (`/cadastro/<token>`) segue a §5.4. A resposta chama a ação
sem login, que chama `responder_forma_de_pagamento` pelo `clienteAnonimo`.

**Início:** os três avisos da §5.6, no bloco de "o que precisa de atenção hoje".

**Resumo do Ganho:** as duas situações da §5.8.

**Sem internet:** o lead e a ficha pública já precisam de internet, e nada muda.

## 8. Critério de aceite

Os da §6.4 que valem na 4b, com as mudanças da 4a e desta. As datas contam do dia
do teste.

- **Enviar:** com a forma em `rascunho`, "Enviar ficha" mostra a prévia, e
  "Confirmar e gerar link" deixa a forma `enviada`, com o link de prazo em 3 dias
  úteis e o histórico registrado. Sem visto ou sem parte, recusado com a frase.
- **Prazo:** `fim_do_prazo_em_dias_uteis` dá quinta para segunda e quarta para
  sexta, sábado e domingo, sempre às 00h00 de São Paulo do dia seguinte. A ficha
  comum continua com 15 dias.
- **Modo:** pessoa que nunca mandou ficha recebe `completa`; quem já mandou recebe
  `so_pagamento`, ou `completa` com a caixa marcada.
- **O cliente abre o link `completa`:** primeiro os dados pessoais; ao enviar, a
  ficha se grava (aviso "ficha recebida" na Início), o link continua aberto e a
  página passa ao pagamento. Abrir de novo cai direto no pagamento.
- **A resposta da função anônima não contém** cotação, anotação da cotação, CPF,
  RG nem endereço, em nenhuma situação; a forma só vem em `aguardando_pagamento`.
- **Conversão:** a parte "US$ 3.900 convertidos para R$ 21.527,76" aparece assim
  no cartão, na prévia, na ficha e no resumo do Ganho, e a cópia guardada tem o
  `usd_equivalent`. Conversão em parte de US$ é recusada, no banco e na tela.
- **Confirmo:** a forma vira `confirmada`, a resposta guarda a cópia com
  `registration_form_id` e o nome do cliente, o link fecha, o histórico registra
  e a Início mostra "Pronto para o contrato".
- **Há algo errado, com motivo:** a forma vira `recusada`, o motivo aparece no
  lead e na Início, e os dados pessoais continuam gravados no contato.
- **Reenviar depois de recusar:** Ajustar, editar e Enviar ficha geram um link
  `so_pagamento`, que abre em "Seus dados já foram recebidos ✓". Chamar
  `enviar_ficha_de_cadastro` com esse token é recusado. O aviso de recusada fica
  depois do Ajustar e some no envio.
- **Forma enviada não se edita:** `salvar_forma_de_pagamento` em `enviada` é
  recusado. Editar cancela o link: o link antigo mostra "cancelado", e
  `responder_forma_de_pagamento` com ele não grava.
- **Vistos com a forma enviada:** mudar pela API é recusado com a frase da §5.11;
  depois de Editar, passa.
- **Link vencido:** abrir mostra "Este link expirou. Peça um novo à Duli.";
  responder não grava; o lead mostra "link vencido"; a Início avisa; Editar tira o
  aviso.
- **Confirmar pela equipe a partir de `enviada`:** a forma vira `confirmada` e o
  link aberto é cancelado; a resposta é da equipe. `teste-staff`, que não é dono,
  é recusado.
- **Token inválido:** responder com token vencido, já respondido, cancelado,
  inventado, de negócio ganho ou perdido, ou de pessoa na lixeira, não grava nada.
- **A porta continua estreita** (teste de RLS vermelho antes, na organização de
  teste):
  - `responder_forma_de_pagamento` e `abrir_ficha_de_cadastro` chamados por
    `authenticated` são recusados;
  - inserção direta em `payment_plan_responses` pela API, com qualquer `decision`,
    é recusada;
  - `update registration_forms set mode = …`, `closed_at = …` ou
    `payment_plan_id = …` pela API é recusado; `cancelled_at` num link com a
    forma também;
  - insert direto em `registration_forms` com `payment_plan_id` ou modo
    `so_pagamento` é recusado;
  - o aviso do Supabase "definer executável por anon" aparece para as três
    funções, e para nenhuma outra.
- **Um link aberto por pessoa:** enviar a forma com outro link com a forma aberto
  é recusado com a frase; com uma ficha comum aberta, ela é cancelada; "Gerar link
  da ficha" com link com a forma aberto é recusado.
- **I4:** com uma ficha recebida e não conferida, gerar um link novo mantém o
  "Conferi" no contato e o aviso na Início; "Conferi" o tira.
- **Ganho:** com a forma `enviada` ou `recusada`, nenhuma cobrança, e o resumo diz
  por quê. Com a forma confirmada pelo cliente, nascem as cobranças como na 4a.
- **Negócio encerrado com link aberto:** ganhar ou perder um negócio com a forma
  `enviada` cancela o link e deixa a forma em `rascunho`, com o histórico; abrir o
  link mostra "cancelado"; e a pessoa pode receber um link novo, inclusive em
  outro negócio.
- **Quem clica diz o que viu:** com a forma já `confirmada` pelo cliente, chamar
  `voltar_forma_para_rascunho(p_de => 'enviada')` não grava nada e devolve a frase
  "mudou enquanto você olhava"; `enviar_forma_de_pagamento` com uma versão
  anterior a um salvar recusa do mesmo jeito.
- **O link com a forma não se mexe pela API:** mudar `expires_at`, `token` ou
  `answers` de um link com a forma é recusado, e apagá-lo também; marcar
  `reviewed_at` passa. Num link comum, `expires_at` continua mudando como hoje.
- **A marca do parceiro:** um link da organização de teste mostra o nome dela nas
  frases finais, e não "Duli".
- **Excluir:** negócio aberto com link com a forma aberto é recusado com a frase;
  depois de cancelar o link, se a forma nunca teve resposta, exclui.
- **Usuário do portal:** continua sem ler a forma, as partes, as parcelas e as
  respostas, também com a forma `enviada`.
- **Celular de 375 px:** a ficha com a forma não rola na horizontal.

## 9. Requisitos

| ID | Na 4b |
|---|---|
| FIC-1 | O link com forma vale 3 dias úteis; o sem forma, 15 dias |
| FIC-7 | "Enviar ficha", a prévia e o link |
| FIC-8, FIC-9 | Inteiros |
| FIC-10 | A partir de `enviada`, cancelando o link |
| FIC-11 | O texto muda: o cliente vê os valores convertidos (FIC-13), nunca a cotação |
| FIC-12 | Vale também para a forma `enviada` |
| **FIC-13 (novo)** | A parte em reais diz de quantos dólares veio, e o cliente vê os dois valores |
| INI-4 | O I4 se fecha (§5.7) |
| INI-8 | Os três avisos da §5.6 |
| CRM-14 | As situações `enviada` e `recusada` do resumo |
| REC-6 | "Criar as cobranças mesmo assim" sai do requisito |

## 10. Decisões

**Do Renato, 23/nov:**

- O que o cliente vê na ficha é o que vai no contrato.
- A conversão pela opção A: o valor em dólar e o valor já convertido em reais, sem
  a cotação.
- A validade da conversão (3 dias úteis a partir do envio do contrato) vai só no
  contrato.
- O cliente vê todas as datas na ficha, inclusive a do cartão.
- Sem conferência nova da forma com os vistos.
- O link com forma vale 3 dias úteis; vencido, "link expirado, peça um novo".
- A cobrança automática (Itaú, C6) e a nota fiscal ficam fora: as cobranças nascem
  no app, e boleto, nota fiscal e baixa são à mão.
- A cópia de segurança e o monitor (OPS-1, OPS-2) ficam para quando os clientes
  tiverem acesso ao app; o plano pago do Supabase ainda não compensa (Q13).

**Minhas, aceitas pelo Renato em 23/nov:**

| # | Decisão | Por quê |
|---|---|---|
| 1 | Dias úteis de segunda a sexta, sem feriados | Feriado exigiria manter um calendário |
| 2 | O link sem forma continua com 15 dias | Não tem valor que envelheça |
| 3 | Aviso de link com a forma vencido na Início | Com 3 dias, vai acontecer com frequência |
| 4 | "Criar as cobranças mesmo assim" sai | "Confirmar pela equipe" cobre o cliente que confirmou por fora |
| 5 | A ficha recebida continua valendo com um link novo, e o aviso fica até o "Conferi" (Q11) | Sem isso, toda recusa reenviada prenderia o aviso (I4) |
| 6 | A cotação que já existe no lead continua opcional e só da equipe | Ninguém é obrigado a preenchê-la |
| 7 | As frases finais da ficha e a validade na mensagem do WhatsApp | — |

**Minhas, aprovadas pelo Renato ao ler o desenho, em 23/nov:**

| # | Decisão | Por quê |
|---|---|---|
| 8 | Enviar, Editar, Cancelar link e Ajustar: qualquer membro; Confirmar e Refazer: dono do negócio ou gestão | Os primeiros não fecham nem desfazem acordo |
| 9 | Link vencido: para reenviar, passa por Editar | O prazo curto existe porque o valor envelhece |
| 10 | Os vistos travam também com a forma enviada | A forma que o cliente lê não muda por baixo dele |
| 11 | Ganhar ou perder o negócio cancela o link com a forma aberto e põe a forma enviada em rascunho | Um link aberto num negócio encerrado impediria qualquer link novo para a pessoa, inclusive em outro negócio (achado da revisão do desenho) |
| 12 | A recusa do cliente também impede excluir o negócio | É resposta registrada, como a confirmação |
| 13 | O nome do cliente vai em `answered_by_name` na resposta dele | O lead diz "confirmada pelo cliente" sem outra consulta |
| 14 | Editar, Cancelar link, Ajustar e Refazer dizem de que estado partem, e Enviar ficha leva a versão da prévia; se a forma mudou no meio, nada se grava | Sem isso, Cancelar link chegando junto com o Confirmo do cliente desfaria a confirmação, e um salvar depois da prévia mandaria ao cliente valores que ninguém viu (achado da revisão) |
| 15 | O link com a forma fica congelado inteiro fora das funções, menos o "Conferi" | Com a lista de colunas à mão, qualquer membro esticaria o prazo ou apagaria o link pela API (a lição da 0061, achado da revisão) |
| 16 | As frases ao cliente usam o nome da organização, não "Duli" | O cliente de um parceiro veria a marca errada (achado da revisão) |

## 11. Fica com quem constrói

- O formato exato do `jsonb` de `forma` em `abrir_ficha_de_cadastro` e da cópia,
  desde que leve `usd_equivalent`.
- O desenho fino do cartão, da prévia e da etapa de pagamento, com os componentes
  e os tokens do `AGENTS.md`.
- Onde mora o componente que desenha a forma para o cliente. Ele é usado pela
  ficha (`app/cadastro`) e pela prévia (`app/(app)/crm`); se ficar numa feature e
  a outra precisar, sobe para `src/components/`.
- Os nomes dos arquivos de teste e a divisão em commits.
- Se a ação de cancelar link do contato (`cancelarLink`) passa a chamar a função da
  forma quando o link é de pagamento, ou se o botão some ali e fica só no lead.
