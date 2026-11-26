# Contrato e assinatura pelo ZapSign (spec 7.5)

**Data:** 26/nov/2026.
**Requisitos de origem:** `docs/spec.md` 7.5 (CTR-1 a CTR-6), Q1, Q2, Q4 e Q14.
**Base:** a forma de pagamento confirmada pelo cliente no link da ficha
(entregas 4a e 4b: `2026-11-21-entrega-4a-forma-de-pagamento-design.md`,
`2026-11-23-entrega-4b-link-da-forma-design.md`).

As decisões do Renato são de 26/nov, salvo outra data. O que é decisão minha
está marcado *(minha decisão)*, para o Renato conferir.

## 1. Por que

Hoje o Renato abre o Word do último contrato, troca à mão o quadro do cliente,
a cláusula do serviço e a de pagamento, sobe no ZapSign e acompanha a
assinatura por lá. Os dados já existem no app: a ficha que o cliente preencheu e
a forma de pagamento que ele confirmou no link. Redigitar é onde o erro entra
— e o contrato é o documento que vale.

O que se quer: **o app gera o contrato padrão com esses dados, a equipe confere
na tela, envia ao ZapSign pela conta da Duli, e a assinatura volta sozinha** —
com o PDF assinado guardado no cliente e o Ganho oferecido ao dono.

Contratos de referência (Renato, 26/nov): Ricardo Lopes Wiest e Guilherme José
de Oliveira (assinados via ZapSign); o da 4b cita também João Batista Neto.
Eles ficam fora do repositório (dados pessoais).

## 2. Abordagens

| | Como | Por que não / por que sim |
|---|---|---|
| A. Modelo dentro do ZapSign | Modelo DOCX no painel do ZapSign com `{{campos}}`; o app manda só os valores (`POST /api/v1/models/create-doc/`) | A API troca palavra por palavra; não monta a cláusula 1.1 com 1 ou 2 vistos nem a cláusula 3 com partes que mudam de forma. Sem prévia no app e sem editar um contrato específico. **Descartada** |
| **B. Contrato montado e editado no app** — **escolhida pelo Renato** | O texto do modelo mora no app, com campos e blocos. O app monta o contrato, mostra a prévia, deixa editar **aquele** contrato no editor do app, gera o Word e envia ao ZapSign (`POST /api/v1/docs/`, `base64_docx`), que gera o PDF — o mesmo caminho de hoje, sem a mão | Atende prévia, simulação da cláusula 3 na tela e edição de um contrato específico |
| C. Word como modelo mestre | O Renato mantém o `.docx` com campos; o app preenche | Prévia e edição só fora do app (baixar, editar, subir). Descartada |

## 3. Objetivos, fora do escopo e fracasso

**Objetivos**

1. Nenhum dado do cliente digitado entre a ficha e o contrato (O3).
2. O contrato que sai é o que a equipe viu na tela, e o que o cliente assinou
   fica guardado.
3. Ajuste pedido pelo cliente se faz no app, na versão daquele contrato, sem
   tocar no modelo.
4. Assinado → o app sabe sozinho, guarda o PDF e oferece o Ganho.

**Fora do escopo**

- Mais de um modelo de contrato (CTR-6, P2). O modelo é um só; o que muda por
  visto é a cláusula 1.1.
- Cobrar ou gerar link de pagamento (como na 4b: o link do cartão o Renato gera
  por fora).
- Ganho automático na assinatura: o Ganho é **oferecido** (Q3, 17/nov).
- Contrato para cliente de parceiro (ele não passa pelo funil).
- Assinatura por WhatsApp automático do ZapSign (custo à parte).

**Fracasso, mesmo funcionando**

- Sair um contrato que ninguém viu na tela, ou com valores diferentes dos que o
  cliente confirmou.
- O cliente assinar com uma cotação vencida sem a equipe ter decidido mantê-la.
- O app dizer "assinado" sem o ZapSign ter dito, ou deixar de dizer quando disse.
- Uma porta sem login que grave algo além do estado de um contrato.

## 4. Restrições

- **Sem chave mestra do Supabase no app** (spec §12.2). O servidor fala com o
  banco com a sessão de quem clicou; o aviso do ZapSign entra por uma rota
  conferida por segredo, que age como o usuário robô do contrato (§7).
- **O token da API do ZapSign é segredo do servidor**: variável de ambiente no
  Easypanel, nunca `NEXT_PUBLIC_`, nunca no banco nem no repositório. Ele
  apareceu num print em 26/nov: **renovar no ZapSign antes de ligar a
  integração** e pôr o novo direto no Easypanel.
- O link do PDF assinado que o ZapSign manda **vale 60 minutos**.
- O ZapSign reenvia o aviso se não receber 200, e pode mandar o mesmo aviso mais
  de uma vez (documentação de webhooks): tudo idempotente.
- O ZapSign tem **ambiente de testes** separado (conta e token próprios, sem
  validade jurídica); o app usa os dois, fixos (§6). A produção exige o plano API (a conta da Duli tem o token
  liberado; conferir no primeiro envio).
- Horários da API do ZapSign em UTC.
- Prazo em dias úteis: reaproveitar `private.fim_do_prazo_em_dias_uteis` (0064).
- Os arquivos do cliente moram no depósito `pessoas`, categoria `contrato`
  (0047), e entram na cópia de segurança (OPS-1).

## 5. Regras

### 5.1 O modelo

- **Um modelo só**, editado em **Configurações → Contrato**, só pela gestão.
- O texto é escrito no editor do app (o mesmo das Observações), com:
  - **campos** que viram texto. O quadro do cliente nos contratos de hoje tem
    exatamente: nome, CPF, RG, órgão expedidor, e-mail, telefone e endereço
    (rua, número, complemento, bairro, cidade, UF, CEP) — todos da ficha. Mais a
    data do contrato por extenso e o assinante da Duli. Estado civil,
    nacionalidade, profissão e dependentes **não** aparecem nos contratos de
    hoje: ficam disponíveis como campos, mas o modelo não os usa. *(Corrige o
    CTR-1 da spec, que listava estado civil e nacionalidade.)*;
  - **blocos** que viram parágrafos inteiros: `serviços` (cláusula 1.1) e
    `pagamento` (cláusula 3).
- Na mesma tela: **quem assina pela Duli** (nome, cargo, e-mail — hoje Renato
  Drumond Santos, CEO) e as **frases de pagamento por método** (§5.3).
- **Ver exemplo** *(minha decisão)*: a tela mostra o modelo montado com formas
  de pagamento de exemplo — só PIX parcelado de dólar convertido; dólar à vista
  por transferência mais reais no cartão; só reais em boletos —, sem dado real.
  É onde o Renato acerta o texto da cláusula 3 (etapa A).
- Mudar o modelo **não** muda contrato já gerado: cada contrato guarda a cópia
  do texto do momento em que foi gerado.
- **Os dados da Duli** (razão social, CNPJ, endereço, representante) ficam
  escritos no próprio texto do modelo, como hoje. *(Minha decisão: mudam quase
  nunca; a tela de dados da empresa, CFG-4, fica para quando outra coisa
  precisar deles.)*

### 5.2 Cláusula 1.1 — o serviço, por visto

- Cada **tipo de visto** ganha o campo **Texto do contrato** (Configurações →
  Tipos de visto), só a gestão edita.
- O bloco `serviços` lista os textos dos vistos do negócio, **um depois do
  outro, na ordem do negócio** (Renato, 26/nov).
- Visto do negócio sem texto: o app não gera o contrato e diz qual falta —
  "O visto ‹nome› não tem texto do contrato. Configure em Tipos de visto."
- Hoje há texto para EB-2 NIW (dos contratos assinados) e EB-1A (o Renato
  envia).

### 5.3 Cláusula 3 — o pagamento

- Montada da **cópia confirmada** da forma (a mesma que o cliente viu e
  aceitou, `payment_plan_responses`), nunca da forma em edição. Sem forma
  confirmada, não há contrato.
- Valor total, cada parte (rótulo, método, moeda, total, "US$ X convertidos para
  R$ Y"), as parcelas com data e valor, **valores também por extenso**
  ("seis mil dólares", "trinta e cinco mil, oitocentos e cinquenta e sete reais
  e noventa e um centavos").
- **Frases por método**, editáveis no modelo: PIX (com a chave CNPJ), boleto,
  cartão (link enviado depois da assinatura), transferência (dados da conta C6
  Global), cripto.
- **"Válido até ‹data›"**: 3 dias úteis a partir do envio do contrato (§5.5).
- O texto exato da cláusula 3 **fica para os testes da etapa A** (Renato,
  26/nov): primeiro se simulam as formas no "Ver exemplo" e na prévia, depois se
  fecha a integração.

### 5.4 Gerar, conferir e enviar

- **Quem:** o dono do negócio e a gestão *(minha decisão, aceita pelo Renato)*.
  Vale para gerar, editar o rascunho, enviar, ajustar e cancelar.
- **Quando o botão aparece:** negócio aberto, ficha **conferida**, sem ficha
  recebida ainda por conferir, e forma **confirmada**. Senão, o botão diz o que
  falta (critério da spec 7.5).
- Visto do negócio **sem tipo de visto** (itens antigos da 0051, ou tipo
  apagado): "O visto ‹nome› não está ligado a um tipo de visto." Com tipo e sem
  texto: a frase da §5.2.
- **Gerar contrato** cria a versão 1 em **rascunho**: o modelo com os campos e
  blocos preenchidos, já como texto editável.
- **As peças calculadas continuam marcadas** na versão: o quadro do cliente, o
  bloco de serviços, o bloco de pagamento, o "válido até" e a data do contrato.
  O resto é texto livre. Assim:
  - **Gerar de novo** (ficha ou forma mudou) e o **Ajustar o valor** da §5.6
    trocam **só** as peças marcadas e **mantêm os ajustes** que o cliente pediu
    nas outras cláusulas;
  - **as peças marcadas também podem ser editadas à mão** neste contrato
    (Renato, 26/nov: hoje só ele usa; repensar se entrarem colaboradores). O
    Ganho continua cobrando pela **forma confirmada**, não pelo texto — quem
    edita valor à mão sabe que o Financeiro não acompanha;
  - peça marcada editada à mão ganha o aviso "editado à mão" na prévia, e
    **Gerar de novo** / **Ajustar o valor** avisam antes que vão substituir
    essas edições *(minha decisão: a edição não some sem ninguém ver)*.
  - a prévia mostra "válido até" como a data que valerá se o envio for hoje; a
    janela de Enviar mostra a data que vai de fato no texto.
- **Prévia na tela**, igual ao que vai sair; **Baixar Word** para quem quiser
  ver no Word.
- **Editar** muda **só este contrato** (Renato, 26/nov): para o pedido do cliente
  sobre outra cláusula. O modelo não muda.
- **"Mudou enquanto você olhava"** (a mesma guarda da 4b): a versão grava a
  resposta da forma que usou (`payment_plan_responses.id`) e o `updated_at` da
  pessoa quando foi gerada. Editar e Enviar levam o `updated_at` da versão que a
  tela mostrou. A função recusa se a versão, a ficha ou a forma mudaram, ou se
  chegou ficha nova ainda por conferir: "O contrato mudou enquanto você olhava.
  Atualize a página." / "A ficha ou a forma mudaram: use Gerar de novo."

**Enviar contrato** (etapa B), em dois passos, para nunca existir documento no
ZapSign que o app não conheça:

1. Uma função do banco trava a versão (`for update`), confere a guarda acima,
   congela o corpo e a validade e passa a versão a **enviando**. Versão
   `enviando` não se edita. Um índice único parcial garante no máximo **uma**
   versão `enviando` ou `enviada` por contrato — dois cliques, ou duas pessoas,
   não geram dois documentos.
2. Só então o servidor gera o Word e chama o ZapSign com `external_id` = id da
   versão.
   - Deu certo: outra função grava o token do documento e o link do cliente e
     passa a versão a **enviada**, com o histórico "Contrato enviado" (data e
     link — CTR-3).
   - O ZapSign recusou com erro claro: a versão volta a **rascunho**, com o
     motivo na tela.
   - Sem resposta (tempo esgotado): a versão fica `enviando`, e o botão
     **Conferir no ZapSign** resolve pelo `external_id`.

### 5.5 Validade e prazo de assinatura

- No envio, o app calcula o fim do prazo: **3 dias úteis** a partir do envio
  (Renato, 26/nov), com a mesma regra do link da forma (dia do envio não conta,
  até 23h59 do 3º dia útil em São Paulo), por
  `private.fim_do_prazo_em_dias_uteis` (0064).
- A data entra no texto ("válido até ‹data›") e vai ao ZapSign como
  `date_limit_to_sign`, **convertida para UTC** (23h59 de São Paulo = 02h59Z do
  dia seguinte). O formato exato se confere no ZapSign de testes, com teste de
  data fixa.
- **"Expirada" não se grava**: é uma versão `enviada` com a validade no passado,
  calculada na leitura (regra "estado não guardado"). É assim que a Início a
  lista. Não há tarefa agendada nova.
- **Assinado, o valor fica congelado** (Renato).
- **Assinado depois da validade** (se o ZapSign deixar): a versão vai a
  `assinada` (é fato) e a Início avisa "Contrato assinado depois da validade".

### 5.6 Ajuste pedido pelo cliente e reenvio

- **Ajustar contrato** numa versão enviada: o servidor **primeiro cancela o
  documento no ZapSign**; só com o cancelamento confirmado a versão vai a
  `cancelada` e nasce a versão seguinte em rascunho, com o texto da anterior.
  Se o ZapSign disser que o documento já foi assinado, a versão vai a
  `assinada` e o Ajustar é recusado: "O cliente acabou de assinar."
- No **Enviar** de uma versão nova, se o prazo da anterior **já venceu**, o app
  pergunta, **toda vez** (Renato, 26/nov):
  - **Manter o valor e renovar o prazo** — a cotação fica, e o prazo recomeça
    (3 dias úteis);
  - **Ajustar o valor** — a forma volta a rascunho (o "Refazer" da 4a) e vai de
    novo ao cliente pelo link para confirmar; o contrato espera a forma
    confirmada, e as peças calculadas são geradas de novo, mantendo os ajustes
    das outras cláusulas. *(Minha leitura de "ajustar valor": o contrato só usa
    forma confirmada pelo cliente.)*
- Se o prazo da anterior **não venceu**, a versão nova mantém a mesma data
  *(minha decisão: o prazo protege a cotação, e a cotação não mudou)*. Faltando
  menos de 1 dia útil, a janela mostra quanto falta e oferece renovar.
- **No primeiro envio também** (Renato, 26/nov): se a forma foi confirmada pelo
  cliente há mais de 3 dias úteis, a janela faz a mesma pergunta (manter o valor
  ou ajustar), para uma cotação antiga não entrar no contrato sem ninguém
  decidir.
- Três ajustes com o prazo vencido são três perguntas.
- Cada versão enviada fica guardada: o texto, o Word, o PDF que o ZapSign gerou
  do Word (`original_file`), quando, por quem, e o documento do ZapSign.

### 5.7 Assinatura

- Signatários, nesta ordem *(minha decisão, aceita)*: **1. o cliente**, **2. o
  assinante da Duli** (`signature_order_active`, `order_group`).
- O ZapSign manda o pedido por **e-mail**; o app mostra o link de assinatura **do
  cliente** para **Copiar** e **WhatsApp**, como o link da ficha. O link do
  assinante da Duli **não** se guarda nem aparece no app.
- Confirmação de quem assina: **código por e-mail** (é o que o Renato usa hoje).
- Idioma `pt-br`.

### 5.8 A volta do ZapSign

O aviso do ZapSign é só a **campainha**: ele diz "algo mudou no documento X". Quem
decide o que mudou é a **consulta à API do ZapSign** pelo documento
(`GET /api/v1/docs/{token}/`), não o corpo do aviso. Motivos: o aviso de
"assinado" chega **uma vez por signatário** — o do cliente chega com o documento
ainda pendente —, e o corpo pode chegar repetido ou fora de ordem.

| O que a API diz do documento | O que o app faz |
|---|---|
| Assinado por todos | Versão **assinada**; histórico "Contrato assinado"; o lead mostra **Contrato assinado** e oferece o **Ganho**; a Início mostra ao dono "Contrato assinado — confirmar o Ganho"; o PDF assinado vai para os Documentos do cliente (§7.3) |
| Só o cliente assinou | A versão fica `enviada`; histórico "O cliente assinou; falta a Duli" |
| Recusado | Versão **recusada**; aviso na Início; caminho: Ajustar contrato |
| Excluído no painel do ZapSign | Versão **cancelada**; histórico "Cancelado no painel do ZapSign" |
| E-mail do cliente voltou (`email_bounce`) | Aviso no lead: "O e-mail do contrato não chegou ao cliente" |
| Documento que o app não criou (sem `external_id`, ou sem versão que bata, no mesmo ambiente) | Responde 200, **não grava nada** nem guarda o corpo (tem nome, e-mail e IP) |
| Versão já `cancelada` e a API diz assinado | Grava o evento, não muda o estado, avisa na Início |
| Repetido | Nada muda |

- O Ganho continua pelo caminho de hoje (`ganhar_negocio`), oferecido ao dono
  (Q3, 17/nov). O contrato não marca Ganho sozinho.
- Contrato assinado não se edita nem se reenvia.

### 5.9 Contrato enviado ou assinado e o resto do negócio

*(Mesma lógica do link da forma na 4b: o que o cliente está lendo não muda por
baixo dele. As travas ficam caladas para quem não é da organização, como na
0067.)*

| Com o contrato… | Ação | O que acontece |
|---|---|---|
| `enviando` ou `enviada` | Refazer ou editar a forma, mudar os vistos | Recusado: "Há um contrato enviado ao cliente. Use Ajustar contrato." |
| `enviando` ou `enviada` | **Perdido**, por qualquer caminho (tela do lead ou arrastar no quadro) | O **banco recusa** tirar o negócio de aberto: "Há um contrato enviado ao cliente. Cancele o contrato antes." O Perdido da tela do lead oferece **Cancelar contrato e marcar Perdido**: cancela no ZapSign e, só com a confirmação da API, grava `cancelada` e o Perdido |
| `enviada` | **Ganho** | Permitido (a equipe pode ter o contrato assinado por fora); o contrato continua |
| pessoa vai para a lixeira | — | Recusado com versão `enviando` ou `enviada`: "Há um contrato enviado ao cliente." |
| `assinada`, sem cobranças criadas | Refazer a forma, mudar os vistos | Recusado: "O contrato foi assinado; os valores estão congelados." |
| `assinada`, depois de o Ganho criar as cobranças, negócio reaberto | Acrescentar visto | Vale o FIC-12 (4a): passa. A tela diz "‹visto› não está no contrato assinado" |
| `assinada` | **Ganho** | O Ganho cria as cobranças da forma confirmada, que é a do contrato |
| `assinada` | **Reabrir** o negócio | O contrato continua assinado e guardado; reabrir não o desfaz |

As travas entram onde as da forma já moram: `voltar_forma_para_rascunho`, a trava
dos vistos (`opportunity_items_trava_do_ganho`) e a saída de `open` do negócio.

### 5.10 Estados de uma versão

| De | Para | Como | Quem |
|---|---|---|---|
| — | `rascunho` | Gerar contrato (a primeira, ou a seguinte depois de `recusada`, `cancelada` ou de um Ajustar) | Dono do negócio ou gestão |
| `rascunho` | `rascunho` | Editar, Gerar de novo | Dono ou gestão |
| `rascunho` | `enviando` | Enviar, passo 1 | Dono ou gestão |
| `enviando` | `enviada` / `rascunho` | Enviar, passo 2 (deu certo / recusado pelo ZapSign) | O servidor, na mesma ação |
| `enviando` / `enviada` | `assinada`, `recusada`, `cancelada` | A volta (§5.8) | O robô (§7.3) |
| `enviada` | `cancelada` | Ajustar contrato, Cancelar contrato, Perdido pela tela do lead | Dono ou gestão, depois da confirmação do ZapSign |

Sempre:

- no máximo **uma** versão não terminal (`rascunho`, `enviando`, `enviada`) por
  contrato;
- `assinada` é terminal e impede versão nova;
- Gerar de novo só em `rascunho`;
- negócio Perdido e depois Reaberto: a versão `cancelada` fica, e se gera uma
  nova.

## 6. Etapas

| Etapa | Entrega | Sai do app? |
|---|---|---|
| **A — o texto** | Configurações → Contrato (modelo, assinante, frases por método, Ver exemplo); Texto do contrato no tipo de visto; no lead: Gerar contrato, prévia, Editar este contrato, Baixar Word, versões | Não |
| **B — o ZapSign** | Enviar contrato, link de assinatura, a volta, PDF assinado guardado sozinho, Ajustar e Cancelar contrato, reenvio com a pergunta do prazo, travas da §5.9, avisos na Início, leads de teste | Sim — leads de teste no ZapSign de testes |

**Ninguém real recebe contrato antes do fim dos testes** (Renato, 26/nov). O
Renato testa o fluxo inteiro com **leads de teste**: cria o lead, define a forma,
envia o link da ficha, preenche como se fosse o cliente, gera o contrato,
revisa, envia, assina como cliente e como Duli, e vê o PDF chegar.

**Dois ZapSign fixos, escolhidos pelo servidor** *(minha decisão, cumpre a do
Renato sem "trocar o token" na virada)*: lead de teste vai **sempre** ao ZapSign
de testes (`sandbox.api.zapsign.com.br`, conta e token próprios, sem validade
jurídica); pessoa real vai **sempre** à produção. A tela não escolhe. A versão
grava o ambiente, e a volta e o PDF usam o ambiente gravado. Cada ambiente tem o
seu token e o seu segredo de aviso. Assim os testes continuam possíveis depois
que os clientes reais começarem.

### 6.1 Leads de teste

- **A marca só nasce na criação** *(minha decisão)*: `people.is_test` se define
  no `insert`, por `criar_oportunidade`, com contato novo, pela gestão, e o nome
  começando por "TESTE —". Depois **não muda**, nem para ligar nem para
  desligar — um gatilho recusa: "A marca de teste só se define ao criar o
  contato." Assim ninguém marca um cliente real para apagá-lo. A tela mostra o
  selo "Teste".
- **Pessoa de teste nunca vira cliente**, por caminho nenhum (Ganho,
  `marcar_como_cliente`, `criar_cliente`, processo, cobrança): a recusa fica na
  trava do estágio (`people_trava_do_estagio`, 0045/0054), que pega todos os
  caminhos. Consequência: nos testes, o "oferece o Ganho" (CTR-4) aparece, mas
  não se completa.
- **Apagados de vez depois dos testes** (Renato, 26/nov): exceção à regra
  "contato nunca é apagado" (spec §6.8), **só para pessoa com a marca**. Só o
  dono da raiz.
  1. O servidor apaga primeiro os arquivos da pessoa pela API do Storage, com a
     sessão do dono da raiz (`pessoas/{org}/{pessoa}/` e, se houver, os de
     `observacoes`). O banco não apaga arquivo.
  2. Depois a função, travando a linha, confere: `is_test`; estágio diferente de
     cliente; nenhum processo nem cobrança; nenhuma versão `assinada` em
     produção; nenhum arquivo sobrando. Apaga a pessoa com o que dela depende
     (negócio, forma, links, contratos). Se sobrou arquivo, recusa e diz qual.
  3. Os documentos no ZapSign de testes ficam lá.
- **Qual ZapSign:** `private.pessoa_de_teste(p)` = `people.is_test` **ou** a
  organização da pessoa é de teste (`organizations.is_test`, 0036). A recusa do
  Ganho vale só para `people.is_test`, para não quebrar os testes automáticos da
  organização de teste.
- A spec §6.8 e §12.6 ganham esta segunda exceção.

## 7. A porta do ZapSign (responde a Q14)

### 7.1 Envio (servidor → ZapSign)

- Ação no servidor, com a sessão de quem clicou, depois do passo 1 da §5.4:
  gera o Word **no servidor** (o servidor não confia em arquivo vindo da tela),
  chama `POST /api/v1/docs/` com `Authorization: Bearer <token do ambiente>`,
  `external_id` = id da versão, `date_limit_to_sign`, signatários, `lang`.
- O Word enviado fica guardado num lugar próprio da versão, **fora** de `files`
  (rascunho não aparece em Documentos).

### 7.2 Aviso (ZapSign → app)

- Rota pública `/api/zapsign/aviso`, liberada no `proxy.ts` pelo **caminho
  exato** (`pathname === "/api/zapsign/aviso"`, não `startsWith`) e listada na
  spec §12.2.
- O webhook é cadastrado em cada ambiente com um **cabeçalho secreto**
  (`/api/v1/user/company/webhook/header/`); o ZapSign não assina o corpo, então o
  cabeçalho é a única prova. Antes de cadastrar, conferir no painel se a conta já
  tem webhook.
- A rota: limita o tamanho do corpo; compara o segredo **em tempo constante**;
  sem o segredo certo, recusa e não toca no banco. Com ele, lê só o
  `external_id` e o token do documento, e segue a §5.8 consultando a API do
  ZapSign. **Não baixa URL que veio no corpo** (o `signed_file`).
- Age no banco como o **usuário robô** (§7.3).
- Responde 200 depois de gravar. Enquanto o PDF de um contrato assinado estiver
  pendente, responde erro, para o ZapSign tentar de novo. Tudo idempotente.

### 7.3 O usuário robô do contrato (Renato, 26/nov: opção A)

O PDF assinado vai para os Documentos do cliente **assim que todos assinarem**,
sem ninguém abrir o app (Renato, 26/nov). Para gravar sem a sessão de ninguém, o
servidor usa uma credencial própria — e **não** é a chave mestra.

- Um usuário do Supabase Auth só para isto. Não é membro de organização nenhuma,
  não abre tela nenhuma. Identificado pelo `user_id` numa tabela `private`,
  nunca pelo e-mail. Senha com **64 caracteres aleatórios** (o login dele está
  exposto pela chave pública), só no Easypanel.
- **O robô não tem policy em tabela nenhuma.** Tem só:
  - funções em `public` (`security definer`, `search_path = ''`, executáveis por
    `authenticated`, que recusam quem não é o robô): mudar o estado de uma versão
    `enviando`/`enviada` pela volta do ZapSign, registrando o evento e o
    histórico; reservar o caminho do PDF; registrar o PDF;
  - uma policy de `insert` em `storage.objects`, no depósito `pessoas`, que
    confere, por helper `definer`, o **caminho reservado** de uma versão
    `assinada` com PDF pendente. Nenhum `update` nem `delete`.
- **O PDF, em ordem:**
  1. a versão vai a `assinada` (o fato vem do ZapSign);
  2. a função reserva o id do arquivo e devolve o caminho fixo
     `{org}/{pessoa}/{file_id}/contrato-assinado-v{n}.pdf`;
  3. a rota pede o PDF ao ZapSign (detalhar documento) e o sobe com
     `upsert: false`; um 409 conta como já enviado;
  4. `registrar_pdf_assinado` confere que o objeto existe e insere a linha em
     `files`, categoria `contrato`.
  Enquanto faltar algum passo, o PDF fica **pendente**: a rota responde erro (o
  ZapSign reenvia), e o botão **Buscar PDF assinado** faz o mesmo com a sessão
  de quem clicou. Os Documentos mostram "ZapSign" como quem enviou.
- **Sessão do robô:** guardada no processo do servidor, renovada, com login de
  novo só se falhar — login a cada aviso esbarra no limite de logins do Supabase.
- **Testes:** uma conta `teste-robo`, cujo poder vale só para versões de
  organização de teste. A senha do robô de produção existe **só** no Easypanel,
  nunca no CI nem no `.env.local`.
- Se alguém invadir o servidor, leva só isto: marcar contrato e guardar PDF de
  contrato.

## 8. Banco (para quem constrói desenhar)

Proposta, não definitiva:

- `contract_templates` (o modelo: corpo, assinante da Duli, frases por método),
  um por organização.
- `visa_types.contract_text`. Tipos de visto é tela offline: a coluna desce ao
  espelho e muda a versão do banco local.
- `contracts` (um por negócio) e `contract_versions` (número, estado
  `rascunho | enviando | enviada | assinada | recusada | cancelada`, corpo, a
  resposta da forma usada, o `updated_at` da pessoa, Word enviado, validade,
  ambiente do ZapSign, quem gerou e enviou, documento e link do cliente, o
  `original_file`, PDF assinado e se está pendente, quando assinou).
- `contract_events` (avisos recebidos: chave de idempotência = documento + tipo
  + signatário).
- **Acesso:** as mesmas regras de `payment_plans` — lê quem é membro da
  organização (`current_user_organizations`); o cliente do portal e a
  organização atribuída **não**. Gravar só pelas funções, pelo dono do negócio
  ou pela gestão; o robô só pelas dele.
- Lápide e `updated_at` nas tabelas novas (`docs/banco.md` §1), mesmo fora do
  manifesto offline.
- O robô: tabela `private` com o `user_id`, o helper, as funções e a policy de
  Storage (§7.3). A conta `teste-robo` para a suíte de RLS.
- `people.is_test`, o gatilho que o congela, o `private.pessoa_de_teste` e a
  função de apagar teste (§6.1).
- **Configurações → Contrato só com internet** (Renato, 26/nov): grava pelo
  cliente do navegador com RLS, como os anexos — não por `actions.ts` dentro de
  um domínio migrado —, e a exceção fica registrada no `AGENTS.md`.

### 8.1 Variáveis do servidor (Easypanel)

Lidas quando o servidor roda, nunca na montagem; nunca `NEXT_PUBLIC_`; o código
num módulo `server-only`.

| Variável | Para quê |
|---|---|
| Token da API do ZapSign — produção e testes | Criar, consultar, cancelar documento |
| URL da API — produção e testes | `api.zapsign.com.br` / `sandbox.api.zapsign.com.br` |
| Segredo do aviso — produção e testes | Conferir que o aviso veio do ZapSign. Troca planejada: aceitar dois por um tempo |
| E-mail e senha do robô | §7.3 |

O cliente do robô é o quinto cliente do Supabase no app (`<Database>`, sem
cookie, `persistSession: false`) e entra na lista do `AGENTS.md`.

## 9. Telas

- **Lead (`/crm/[id]`)**, cartão **Contrato**, abaixo da forma de pagamento:
  estado da versão atual, Gerar contrato / Ver / Editar / Gerar de novo / Baixar
  Word / Enviar / Conferir no ZapSign / Ajustar contrato / Cancelar contrato /
  Copiar link / WhatsApp / Buscar PDF assinado, e as versões anteriores.
- **Configurações → Contrato** (gestão, só com internet).
- **Configurações → Tipos de visto**: campo Texto do contrato.
- **Início:** contrato recusado; contrato enviado e vencido sem assinatura;
  contrato assinado — confirmar o Ganho (para o dono); assinado depois da
  validade; aviso de assinado numa versão cancelada. O aviso "forma pronta para
  o contrato" (4b) some quando houver versão enviada.
- **Histórico da pessoa:** contrato gerado, enviado (data e link), ajustado,
  cancelado, recusado, o cliente assinou, assinado.
- **Cliente → Documentos:** o PDF assinado, categoria contrato, enviado por
  "ZapSign".

## 10. Critério de aceite

Etapa A:

- Dado um lead com ficha conferida e forma confirmada, Gerar contrato mostra o
  contrato com o quadro do cliente igual à ficha, a cláusula 1.1 com os textos
  dos vistos do negócio na ordem, e a cláusula 3 igual à cópia confirmada, com
  valores por extenso.
- Sem ficha conferida, com ficha recebida por conferir, sem forma confirmada,
  com visto sem tipo ou tipo sem texto: o botão explica o que falta e não gera
  nada.
- Editar este contrato não muda o modelo; mudar o modelo não muda contrato já
  gerado.
- Gerar de novo troca só as peças calculadas e mantém o texto das outras
  cláusulas.
- Duas pessoas no mesmo rascunho: a segunda gravação é recusada com "mudou
  enquanto você olhava".
- Ver exemplo mostra as três formas de exemplo sem dado real.
- O Word baixado tem o mesmo texto da prévia.

Etapa B:

- Enviar contrato cria **um** documento no ZapSign — mesmo com dois cliques —
  com o cliente e o assinante da Duli, na ordem, prazo de 3 dias úteis
  (conferido em UTC) e a data "válido até" igual no texto.
- ZapSign fora do ar no envio: a versão volta a rascunho com o motivo; tempo
  esgotado: fica `enviando` e Conferir no ZapSign resolve.
- Assinado só pelo cliente: o app **não** marca assinado; mostra "falta a Duli".
- Assinado pelos dois: em até 5 minutos o lead mostra "contrato assinado",
  oferece o Ganho, a Início avisa o dono, e o PDF assinado já está nos Documentos
  do cliente, sem ninguém abrir nada.
- PDF que falhou fica pendente e entra na próxima tentativa ou no Buscar PDF
  assinado, sem duplicar.
- O mesmo aviso recebido duas vezes não duplica nada.
- Aviso sem o segredo certo: recusado, nada muda (teste de rota). Aviso com o
  segredo e documento desconhecido: 200, nada gravado.
- O robô não lê cliente, financeiro nem processo; não grava fora do caminho
  reservado; não muda versão que não esteja `enviando`/`enviada` (teste RLS com
  a conta `teste-robo`).
- Com contrato enviado: Refazer a forma, mudar os vistos, Perdido pelo quadro e
  lixeira da pessoa são recusados; Perdido pela tela do lead cancela no ZapSign
  antes.
- Ajustar contrato cancela no ZapSign; se o cliente acabou de assinar, recusa e
  a versão fica assinada. Reenviar com o prazo vencido pergunta "Manter o valor
  e renovar o prazo" ou "Ajustar o valor", toda vez.
- Lead de teste vai ao ZapSign de testes; pessoa real, à produção.
- `is_test` não muda depois de criado; apagar de vez só pelo dono da raiz e só
  com a marca; Ganho de lead de teste recusado (teste RLS).
- Os testes da rota usam corpos de aviso gravados do ZapSign de testes (o
  computador de desenvolvimento não recebe aviso).

## 11. Decisões

| Quem | Decisão |
|---|---|
| Renato | Caminho B: contrato montado e editado no app |
| Renato | Cláusula 1.1 por visto; com dois vistos, os dois, um depois do outro |
| Renato | Texto do contrato no tipo de visto e no modelo em Configurações (proposta aceita) |
| Renato | Validade: 3 dias úteis do envio; o mesmo prazo no ZapSign; assinado, congela |
| Renato | Revisão obrigatória: Gerar → ver → Enviar |
| Renato | Editar um contrato específico quando o cliente pede ajuste |
| Renato | Reenvio com prazo vencido: perguntar toda vez — manter e renovar, ou ajustar valor |
| Renato | Duas etapas: texto primeiro (simulações), ZapSign depois |
| Renato | O PDF assinado vai sozinho para os Documentos assim que todos assinam, pelo usuário robô (opção A), sem chave mestra |
| Renato | Testes com leads de teste no fluxo inteiro, no ZapSign de testes, antes de qualquer cliente real |
| Renato | Leads de teste apagados de vez depois dos testes — exceção só para eles |
| Renato | Word com o texto bem formatado, sem papel timbrado |
| Renato | Configurações → Contrato só com internet (exceção registrada no AGENTS) |
| Minha, aceita | Dono do negócio e gestão geram e enviam; cliente assina primeiro; e-mail do ZapSign + link no app; código por e-mail; versões guardadas |
| Minha | "Ajustar o valor" leva a forma de volta ao cliente pelo link |
| Minha | Prazo não vencido: a versão nova mantém a data |
| Minha | Campos do quadro = os dos contratos de hoje; dados da Duli no texto do modelo |
| Minha | Peças calculadas marcadas; Gerar de novo mantém os ajustes das outras cláusulas |
| Minha (revisão de 26/nov) | Envio em dois passos; a API do ZapSign decide o estado; robô só com funções e uma policy de Storage; dois ZapSign fixos; `is_test` só na criação; travas da §5.9; "expirada" calculada |
| Renato | Peças calculadas também editáveis à mão neste contrato (só ele usa hoje; repensar com colaboradores) |
| Minha | Peça editada à mão mostra "editado à mão"; Gerar de novo e Ajustar o valor avisam antes de substituir |
| Renato | Primeiro envio com forma confirmada há mais de 3 dias úteis: mesma pergunta manter/ajustar |

## 12. Fica com quem constrói

- Formato dos campos e blocos no editor (nós próprios do Plate ou marcadores
  `{{…}}`), desde que as peças calculadas fiquem identificáveis na versão, e a
  conversão Plate → Word no **servidor** — conferir se o `exportToDocx` do
  `@platejs/docx-io` roda no Node, sem DOM; se não, gerar o Word com outra
  biblioteca a partir do mesmo conteúdo.
- O quadro do cliente no topo: tabela ou linhas, igual aos contratos atuais.
- Números e datas por extenso em português (função própria, com testes).
- Cancelar documento no ZapSign: confirmar o endpoint ("Cancel document"), o
  `auth_mode` exato para código por e-mail e o formato de `date_limit_to_sign`
  no ZapSign de testes.
- Onde guardar o Word enviado e o `original_file` da versão.
- Atualizar a spec: 7.5 (requisitos e critério), Q1, Q2, Q4 e Q14 respondidas,
  §6.8 e §12.6 (a exceção dos leads de teste), §12.1 (ZapSign, robô, variáveis),
  §12.2 (a segunda porta e o robô), `docs/banco.md`, o OPS-1 com o depósito
  `pessoas`. No `AGENTS.md`: "Uma porta para quem não tem login" reescrita para
  a segunda porta e o robô; o quinto cliente do Supabase; a exceção offline de
  Configurações → Contrato.
