# DuliHub 2 — especificação do produto

**O que o sistema precisa fazer, para quem, e como se sabe que está pronto.**

| Documento | Responde |
|---|---|
| `docs/spec.md` (este) | **O quê** e **para quem**: a jornada, os módulos, as regras, o critério de pronto |
| `docs/plano.md` | **Onde estamos** e **em que ordem**: estado atual, fases, decisões já tomadas |
| `AGENTS.md` | **Como** se constrói: segurança, testes, organização do código |
| §12 deste documento | **Como o sistema é montado**: as partes, onde moram, quem fala com quem |
| `docs/banco.md` | **Onde mora cada dado** e quem lê e grava cada tabela |

Escrita em 6/nov/2026, a partir do app como está e do `plano.md`; arquitetura,
hospedagem e operação revistas em 16/nov. Estado de
cada requisito: **✅ feito** · **🟡 parcial** · **⬜ falta**.

## Como uma funcionalidade nasce

Cada funcionalidade é tratada como nova — desenhada a partir do que a Duli
precisa, e não copiada de outro sistema (decisão do Renato, 6/nov).

| Passo | O que sai |
|---|---|
| 1. Desenho com o Renato | O problema, para quem, e as escolhas que são dele |
| 2. Spec | A seção do módulo aqui, com requisitos, prioridade e **critério de aceite** — antes de qualquer código |
| 3. Plano | Como construir: banco, telas, ordem dos commits, como provar |
| 4. Código | Teste antes do código; `bun run verify`, build e fumaça verdes |
| 5. Revisão de código | Revisão do superpowers sobre o intervalo de commits, contra a seção da spec. Crítico e Importante são corrigidos antes de dar por pronto |

Decisão tomada no meio de uma entrega volta para cá. O roteiro passo a passo,
que também atualiza a documentação no fim, é a skill do projeto
`criar-funcionalidade` (`.claude/skills/`).

---

## 1. Problema

A Duli Consulting conduz processos de visto americano (EB-1A, EB-2 NIW, O-1 e
outros) do primeiro contato do lead até a decisão do USCIS. Cada caso passa por
muitas mãos e muitos prazos: o lead que decide fechar, a ficha e o contrato, as
parcelas em real ou em dólar, dezenas de documentos para conferir, etapas, e
prazos do USCIS que não perdoam atraso.

Sem um sistema que junte isso, o trabalho vira:

- **retrabalho** — o mesmo dado digitado várias vezes (a ficha no contrato, o
  contrato na cobrança) e planilha paralela para fechar o mês;
- **risco** — prazo de RFE ou parcela vencida que ninguém viu, dado pessoal de
  cliente acessível a quem não devia;
- **dependência** — dados e contas em nome de terceiros, que a Duli não
  controla.

O DuliHub é o lugar único do caso: do primeiro contato ao encerramento, com o
dinheiro e os prazos à vista, e cada pessoa vendo só o que é dela.

## 2. Quem usa

| Pessoa | Papel no sistema | O que precisa | Entra em |
|---|---|---|---|
| **Renato** (dono) | `owner` da organização raiz | Fechar contrato rápido, ver o que está atrasado, saber quanto entrou e quanto sai, configurar tudo | Hoje |
| **Equipe da Duli** | `admin` ou `staff` | Tocar os processos: etapas, documentos, prazos, tarefas, conversa com o cliente | Hoje |
| **Lead** | Sem login | Preencher a ficha e assinar o contrato pelo celular, sem criar conta | Hoje (ficha) |
| **Cliente** | Login próprio, ligado à sua ficha (`people.user_id`) | Ver em que pé está o processo, enviar documentos, ver as parcelas | Fase 6 |
| **Parceiro** (ex.: Thais Fabrini) | Organização própria, com seus `owner`/`staff` | Vender com a marca dela; a Duli executa. O que ela cobra do cliente é dela; o que a Duli cobra dela é da Duli | Fase 7 |

Regra de visibilidade, válida para todos: **cada um vê só o que é da sua
organização**, e o cliente vê só o que é dele. Isso é garantido no banco, não
na tela (ver §6).

## 3. Objetivos

| # | Objetivo | Como se mede | Hoje |
|---|---|---|---|
| O1 | **A equipe trabalha o dia inteiro no DuliHub** | Um dia normal de trabalho — leads, processos, cobrança, tarefas — sem precisar de outra ferramenta para isso | Não — falta contrato, a pagar, tarefas e usuários (§9) |
| O2 | **Fechar o mês sem planilha** | Um mês inteiro de entradas e saídas lançado e conferido no app | Não — falta a pagar e fluxo de caixa |
| O3 | **Dado digitado uma vez** | Do lead ao contrato assinado, nenhum dado do cliente é redigitado pela equipe | Em parte — a ficha já chega preenchida; o contrato ainda é montado à mão |
| O4 | **Nenhum prazo perdido sem aviso** | RFE aparece 30 dias antes (vermelho nos últimos 7); parcela, pasta obrigatória e etapa aparecem no dia seguinte ao vencimento; processo encerrado e contato na lixeira não geram alerta | Em parte — processo encerrado (I5) e contato na lixeira (I8) ainda alertam |
| O5 | **Nenhum dado fora da organização** | Suíte de RLS passando a cada mudança; zero acesso cruzado | Em parte — ligações sem organização (N1); testes que podem passar sem provar (I15) |

Metas numéricas (tempo do lead ao contrato, % de fichas preenchidas pelo
cliente) estão nas perguntas em aberto (§10): o app ainda não mede nada disso.

## 4. Fora do escopo

| Não faz | Por quê |
|---|---|
| Conversa de WhatsApp dentro do app | O app abre a conversa (`wa.me`) com a mensagem pronta; a conversa fica no WhatsApp, onde o cliente já está |
| Contabilidade ou ERP | O financeiro é de caixa: o que entra, o que sai, o que vence. Balanço e impostos são do contador |
| App nativo de loja | O app é instalável (PWA) no celular e no computador; não precisa de loja |
| Converter moeda sem cotação | Regra de dinheiro (§6). Valor em dólar só vira real com a cotação do dia em que entrou |
| Montar a peça jurídica do caso | Petição e cartas são feitas fora; o app guarda, organiza e acompanha |

---

## 5. A jornada de ponta a ponta

```
Lead entra → conversa → proposta → ficha → contrato → assinatura → GANHO
   → processo criado do visto → cobrança → documentos e etapas
   → envio ao USCIS → RFE? → decisão → encerramento
```

| # | Passo | Quem | Onde no app | Estado |
|---|---|---|---|---|
| 1 | O lead entra (manual, agendamento, Calendly) | Equipe / automático | CRM | 🟡 só manual |
| 2 | Conversa e reunião | Equipe | Tela do lead: histórico, WhatsApp | 🟡 sem agenda |
| 3 | Proposta (visto, valor, condições) | Renato | Tela do lead: negócio | 🟡 vistos do catálogo com valor e moeda (CRM-13); sem condição de pagamento (entrega 4) |
| 4 | O lead aceita → **ficha de cadastro** por link | Lead | `/cadastro/<token>` | ✅ |
| 5 | **Contrato** gerado com os dados da ficha e a forma de pagamento | Renato | Tela do lead | ⬜ |
| 6 | **Assinatura** (ZapSign) | Lead | Fora do app, volta por webhook | ⬜ |
| 7 | **Ganho** com resumo: o lead vira cliente (a assinatura só oferece; o dono confirma — 17/nov) | Dono do negócio | Tela do lead | 🟡 com resumo e numa gravação só (CRM-14); a oferta pela assinatura vem com o contrato (CTR-4) |
| 8 | **Processo** criado no Ganho, um por visto do negócio | Automático no Ganho | Clientes › Projetos | ✅ |
| 9 | **Cobrança** e parcelas, da forma de pagamento confirmada na ficha | Automático no Ganho, ou à mão | Clientes › Financeiro | 🟡 hoje só à mão |
| 10 | Cliente recebe acesso e envia documentos | Cliente | Portal | ⬜ Fase 6 |
| 11 | Equipe revisa documentos, toca etapas, registra observações | Equipe | Processo | ✅ |
| 12 | Tarefas do dia a dia | Equipe | Tarefas | ⬜ |
| 13 | Envio ao USCIS, recibo, RFE e resposta, decisão | Equipe | Processo › USCIS | ✅ |
| 14 | Encerramento (aprovado, negado, encerrado) | Renato | Processo | ✅ |
| — | Contas a pagar, despesas, fluxo de caixa | Renato | Financeiro | ⬜ |

---

## 6. Regras que valem para o sistema inteiro

1. **Uma pessoa, uma linha.** Contato, lead e cliente são a mesma pessoa, com
   um estágio (`contato → oportunidade → cliente`). Nada se copia entre
   estágios.
2. **Lead não é cliente.** Enquanto o negócio está no funil, a pessoa não tem
   processo nem financeiro à vista. O **Ganho** — contrato assinado — é o que a
   faz cliente; fora dele, só a gestão, marcando à mão, pelo Novo cliente ou
   criando processo ou cobrança (CLI-12, CLI-14, CLI-15). Cliente não volta a ser lead, garantido no
   banco desde a 0045 (CLI-13, fecha o M17).
3. **Negócio não é pessoa.** A mesma pessoa pode ter vários negócios ao longo do
   tempo.
4. **Molde e cópia.** O tipo de visto é o molde de etapas e pastas; o processo
   recebe uma cópia. Mudar o molde não mexe em processo em andamento.
5. **Cada registro pertence a uma organização**, herdada do registro-pai, e o
   banco recusa qualquer ligação entre organizações diferentes. Exceções
   conhecidas, a fechar: N1 (`docs/revisao-2026-11.md`).
6. **Dinheiro em real e dólar, somado por moeda.** Conversão só com a cotação e
   a data em que o dinheiro entrou. Nenhum saldo guardado: tudo se soma das
   parcelas.
7. **Nada some sem aviso.** Exclusão diz o que vai junto; o que tem lixeira
   (contatos) pode ser restaurado. (Hoje mandar contato para a lixeira é um
   clique, sem confirmação — I8.)
8. **Contato nunca é apagado de vez** (decisão de 6/nov). **Processo também
   não** (17/nov): desistência é encerrar, nunca apagar (PRO-12). Pode ser editado,
   ir para a lixeira e voltar, ou ser mesclado com um duplicado — mas o banco
   não aceita apagar a linha, de ninguém. A única exceção é a organização de
   teste, para os testes limparem o que criam.
9. **Falha não vira vazio.** Se uma leitura falha, a tela diz que falhou — não
   mostra "nenhum item" nem "tudo em dia".
10. **Funciona sem internet**, igual a com internet, nas telas já migradas;
    as outras dizem que precisam de rede.
11. **Em português**, no celular e no computador, com o mesmo recurso nos dois.

---

## 7. Módulos

Cada módulo: para que serve, requisitos por prioridade (**P0**: sem ele não há
uso diário (§9); **P1** logo depois; **P2** não agora, mas o desenho não pode
impedir) e o estado. Critério de aceite detalhado só para o que falta — o que
está feito tem teste.

### 7.1 Início

Dizer o que precisa de atenção hoje.

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| INI-1 | Prazo de RFE: 30 dias antes, vermelho nos últimos 7; some quando a resposta é enviada | P0 | ✅ |
| INI-2 | Parcelas vencidas, total por moeda e por cliente | P0 | ✅ |
| INI-3 | Pastas e etapas com prazo vencido | P0 | 🟡 — processo encerrado ainda alerta (I5) |
| INI-4 | Fichas de cadastro recebidas e não conferidas | P0 | 🟡 — o aviso pode ficar preso (I4, depende de Q11) |
| INI-5 | Tarefas minhas, de hoje e atrasadas | P0 | ⬜ (depende de 7.9) |
| INI-6 | Contas a pagar da semana | P1 | ⬜ (depende de 7.8) |
| INI-7 | Números do mês: negócios ganhos, entradas, saídas | P2 | ⬜ |
| INI-8 | Forma de pagamento recusada (some no reenvio) e confirmada — pronto para o contrato (some no Ganho). *Entrega 4b* | P0 | ⬜ |

### 7.2 Contatos

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CON-1 | Lista, busca, filtro por tag, criar, editar | P0 | 🟡 — editar diz que salvou sem gravar (I7) |
| CON-2 | Excluir com lixeira e restaurar; nunca apagar de vez (§6.8) | P0 | 🟡 — lixeira sem confirmação, e o caso do contato continua aparecendo (I8) |
| CON-3 | Ficha enxuta para quem não é cliente; completa para cliente (ou para quem já tem processo/cobrança). **Substituído pelo CLI-14** (entrega 2, 19/nov): quem tem processo ou cobrança é cliente, e o cliente tem perfil próprio (CLI-2); `/contatos/<id>` é só o perfil enxuto | P0 | ✅ |
| CON-4 | Aviso de contato já cadastrado (mesmo e-mail ou telefone, inclusive na lixeira) ao criar e ao editar: mostra quem, qual dado e o link do contato; pergunta "É a mesma pessoa?" (ao editar, "sim" não salva e abre o existente) e, no "não", "Criar/salvar mesmo assim?" (17/nov: sobe para P0) | P0 | ✅ |
| CON-8 | Nome, telefone (com DDI) e e-mail obrigatórios ao criar e editar contato; o contato pode existir sem oportunidade (17/nov) | P0 | ✅ |
| CON-5 | Histórico: notas, ligações, reuniões, movimentos do funil, ficha recebida | P0 | 🟡 — hora da atividade grava 3 h antes (I6) |
| CON-6 | Mesclar dois contatos da mesma pessoa, levando negócios, processos, cobranças e histórico | P1 | ⬜ |
| CON-7 | Pedido do titular (LGPD): exportar os dados da pessoa; e, a pedido, **anonimizar** — a linha fica (§6.8) e as cobranças também, mas nome vira "Titular removido" e saem e-mail, telefone, CPF, RG, passaporte, endereço, nascimento, dependentes, respostas da ficha e os arquivos dos depósitos | P1 | ⬜ — depende de Q17 |

### 7.3 CRM — funil e tela do lead

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CRM-1 | Quadro do funil, cartões arrastáveis, seletor de etapa no celular | P0 | 🟡 — mover não é tudo-ou-nada (I2) |
| CRM-2 | Tela do lead: trilha das etapas, contato, negócio, ficha, histórico | P0 | ✅ |
| CRM-3 | Ganho com confirmação; Perdido com motivo; reabrir | P0 | ✅ — o reabrir pergunta também no quadro desde a entrega 3 (I3, CRM-15) |
| CRM-4 | Etapas do funil configuráveis | P0 | ✅ |
| CRM-5 | **Etapas automáticas**: ficha enviada, ficha recebida, contrato enviado — o negócio anda sozinho quando o fato acontece | P1 | ⬜ |
| CRM-6 | Visto de interesse no negócio — substituído pelo CRM-13 (17/nov) | — | — |
| CRM-7 | Mais de um funil | P2 | ⬜ (o banco já suporta) |
| CRM-8 | Dias na etapa e previsão de fechamento | P2 | ⬜ (oferecido em 3/out, não escolhido) |
| CRM-9 | Entrada automática de lead (agendamento, Calendly, formulário do site) | P1 | ⬜ — ver 7.12 |
| CRM-10 | **Ganho e reabrir um ganho** (critério de aceite deste e de CRM-11 a CRM-15, CON-4, CON-8, PRO-12: `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`): só o dono do negócio e a linha ascendente dele (decisão de 6/nov). Até a Q10, a gestão (`owner`/`admin`) faz o papel da linha ascendente. Vale também para trocar o dono do negócio, e é garantido no banco, por qualquer caminho. *Entrega 3 (19–20/nov): ganhar e reabrir só pelas funções `ganhar_negocio`/`reabrir_negocio` (0052), que conferem; a 0054 recusa entrar e sair do ganho por `update` direto — também para a gestão — e apagar negócio ganho; trocar o dono, pela 0044, e o dono é sempre da equipe da organização (0054)* | P0 | ✅ |
| CRM-11 | Nova oportunidade com "contato existente" ou "novo contato" no mesmo formulário, numa gravação só | P0 | ✅ |
| CRM-12 | Aviso de oportunidade já existente para o contato (título, situação, data de criação), com confirmação para criar outra | P0 | ✅ |
| CRM-13 | Um ou mais **vistos** do catálogo na oportunidade, cada um com valor e moeda sugeridos do visto e gravados no item; total por moeda. *Entrega 3 (19/nov): `opportunity_items` (0051), cartão Vistos na tela do lead; o valor único sai da criação e da edição. Com a forma de pagamento confirmada, os vistos travam (FIC-12, entrega 4a)* | P0 | ✅ |
| CRM-14 | **Ganho com resumo** (vistos, valores, forma de pagamento, o que vai acontecer) e, só após confirmar, numa gravação só: ganho, histórico, cliente, dono, **um processo por visto** e as cobranças. *Entrega 3 (19/nov): `ganhar_negocio` (0052) e o resumo pela mesma função com `p_simular`; as cobranças e a forma de pagamento vêm na entrega 4. Entrega 4a (21/nov): o resumo mostra a forma e as cobranças que vão nascer, avisa das parcelas já vencidas, e a gravação cria uma cobrança por parte da forma confirmada; as formas `enviada` e `recusada`, na 4b* | P0 | 🟡 |
| CRM-15 | Reabrir um ganho pede confirmação também no quadro (I3); ganhar de novo não duplica processo nem cobrança. *Entrega 3 (19/nov): `reabrir_negocio` (0052), diálogo no quadro e na tela do lead; a ligação processo → visto (0051) impede o repetido; a cobrança repetida, `payment_plans.charges_created_at` (REC-6, entrega 4a)* | P0 | ✅ |
| CRM-16 | Oportunidades encerradas: ganhas e perdidas saem do quadro (as colunas Ganho e Perdido mostram só os últimos 30 dias) e são achadas em CRM › Encerradas, com busca e filtro. *Entrega 3 (19/nov): `buscar_encerradas` (0053) e `/crm/encerradas`* | P0 | ✅ |
| CRM-17 | **Ajustar a data do Ganho**, só a gestão: para o cliente antigo que estava no funil e foi ganho agora, a data passa a ser a real, e o ganho não conta no mês errado. Critério de aceite abaixo. *20/nov: `ajustar_data_do_ganho` e a trava de `closed_at` (0056); "Ajustar data" no lead ganho* | P0 | ✅ |

**Critério de aceite do CRM-17** (desenhado com o Renato em 20/nov):

- No lead de um negócio **ganho**, ao lado de "Negócio ganho em ‹data›.", o
  botão "Ajustar data" aparece só para `owner` e `admin` da organização do
  negócio.
- O diálogo pede o dia. Vale de 01/01/2000 até hoje em São Paulo, inclusive
  antes de o negócio ter sido criado; dia no futuro é recusado ("A data do
  ganho não pode ser no futuro."), e antes de 2000 também ("A data do ganho
  não pode ser antes de 2000.", para pegar erro de digitação no ano).
- Confirmar o mesmo dia que já está gravado não grava nada nem escreve no
  histórico.
- **O dia não escorrega:** grava-se o início do dia escolhido em São Paulo, e o
  lead, Encerradas e a linha do histórico ("de ‹antes› para ‹depois›") mostram
  exatamente esse dia, a qualquer hora em que se ajuste. Prova: ajustar para o
  dia 1 às 22h de São Paulo mostra o dia 1 (e não o último dia do mês
  anterior), e um ganho feito às 22h aparece no histórico com o dia dele.
- **Um caminho só:** a data de um negócio ganho muda só pela função do ajuste,
  que confere a gestão da organização do negócio ("Só a gestão ajusta a data
  do ganho.") e grava a data e o histórico numa gravação só. Por `update`
  direto ninguém muda, nem a gestão ("Use o Ajustar data."). Negócio que não
  está ganho é recusado ("Só o negócio ganho tem a data ajustada."), e o que
  não se enxerga também ("Negócio não encontrado."). O Ganho e o Reabrir
  continuam gravando a data deles.
- O histórico do contato registra "Data do ganho ajustada de ‹antes› para
  ‹depois›".
- O "cliente desde" não muda: ele se corrige em Editar, no perfil do cliente
  (CLI-11).
- O quadro mostra o ganho dos últimos 30 dias: ajustado para 31 dias atrás ou
  mais, o cartão sai do quadro; para 29, fica. Em Encerradas, fica na posição da
  data nova (CRM-16).
- Reabrir e ganhar de novo grava o dia do novo Ganho; a gestão ajusta de novo
  se precisar.

### 7.4 Ficha de cadastro (lead, sem login)

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| FIC-1 | Link de uso único, 15 dias, um aberto por contato | P0 | ✅ |
| FIC-2 | Campos do PDF: dados pessoais, documentos, endereço, dependentes; CPF conferido | P0 | ✅ |
| FIC-3 | Ao enviar, atualiza o contato, guarda o declarado e o anterior, avisa na Início | P0 | ✅ |
| FIC-4 | Enviar pelo WhatsApp com a mensagem pronta | P0 | ✅ |
| FIC-5 | Rascunho: o lead pode parar e voltar sem perder o que digitou | P1 | ⬜ |
| FIC-6 | Endereço preenchido pelo CEP | P2 | ⬜ |
| FIC-7 | **Forma de pagamento** na oportunidade: os vistos e o total, e as partes — entrada, parcelas iguais até 36, cartão num pagamento só, à vista —, cada parte na sua moeda, com as datas. **Enviar ficha** leva a forma no link, com resumo e confirmação antes. *21/nov: o cartão é um pagamento só, sem número de vezes nem juros, porque a Duli recebe tudo antecipado (era até 10x sem juros ou 18x com juros). Entrega 4a: a janela da forma, por "Definir" e "Editar" no lead; o envio pelo link, na 4b* | P0 | ⬜ |
| FIC-8 | O cliente, depois dos dados pessoais, **confirma** a forma de pagamento ou diz **o que está errado**. *Entrega 4b* | P0 | ⬜ |
| FIC-9 | Recusada: o dono ajusta e reenvia; o link novo abre direto no pagamento, sem mostrar de novo os dados pessoais, e não aceita dados pessoais. *Entrega 4b* | P0 | ⬜ |
| FIC-10 | Confirmação da forma de pagamento pela equipe (dono do negócio ou gestão), também sem link enviado, registrando quem, quando e, se houver, uma observação; desfazer ("Refazer") também é do dono ou da gestão, e é recusado depois que o Ganho criou as cobranças. *Entrega 4a: a partir de `rascunho`; a partir de `enviada`, na 4b* | P0 | ⬜ |
| FIC-11 | Cotação usada (C6) anotada na forma de pagamento, em qualquer estado; só a equipe vê | P1 | ⬜ |
| FIC-12 | **Vistos travados com a forma confirmada**: não se acrescenta, muda nem retira visto do negócio enquanto a forma estiver confirmada e o Ganho ainda não tiver criado as cobranças ("A forma de pagamento está confirmada. Use Refazer para mudar os vistos."), garantido no banco; a forma só muda com o negócio aberto, e a cotação, sempre. Depois que o Ganho cria as cobranças, a forma vira registro: nada nela muda, só a cotação, e os vistos do negócio reaberto voltam a mudar (CRM-15). *21/nov; na 4b vale também para a forma `enviada`* | P0 | ⬜ |

Critério de aceite de FIC-7 a FIC-12: `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md` §6.4, com o recorte e as mudanças da entrega 4a em `docs/superpowers/specs/2026-11-21-entrega-4a-forma-de-pagamento-design.md` §8. Os da entrega 4a, resumidos:

- Entrada de R$ 10.000 no pix daqui a 10 dias e 3 × US$ 3.000 por
  transferência a partir de daqui a 1 mês: o lead mostra "R$ 10.000 +
  US$ 9.000" e as 4 datas. (As datas dos critérios contam do dia do teste.)
- Vistos em US$ 14.000 e partes em US$ 13.000: "A forma soma US$ 13.000 e os
  vistos, US$ 14.000." na janela, na confirmação e no resumo do Ganho, sem
  bloquear; com R$ e US$ misturados, os dois totais lado a lado, sem aviso.
- Cartão com mais de 1 parcela, parcelas iguais com 37, e parcelas que não
  somam o total da parte são recusados, no banco e na tela.
- "Confirmar pela equipe" numa forma em rascunho a deixa confirmada e
  registra quem, quando e a observação, com uma cópia do combinado sem a
  cotação; `teste-staff`, que não é dono do negócio, é recusado ao confirmar
  e ao refazer.
- Pela API, na organização de teste, são recusados: inserir resposta;
  inserir forma; mudar o estado da forma ou anular `charges_created_at`;
  inserir, mudar ou apagar partes e parcelas; mudar ou apagar resposta. O
  `delete` direto da forma apaga 0 linhas, e a resposta continua lá. A
  cotação muda direto.
- Com a forma confirmada, mudar os vistos pela API é recusado (FIC-12);
  depois de "Refazer", passa. No negócio reaberto depois de o Ganho criar
  as cobranças, acrescentar um visto passa, pela tela e pela API, e ganhar de
  novo cria só o processo dele, sem cobrança, com o aviso "‹visto› não está
  na forma de pagamento: crie a cobrança à mão na aba Financeiro."
- Negócio cuja forma já teve uma confirmação, mesmo depois de "Refazer",
  não se exclui: "A forma de pagamento já foi confirmada; o negócio fica
  como registro."
- O usuário do portal, num negócio da própria pessoa dele, não lê a forma,
  as partes, as parcelas nem as respostas.

Os do Ganho estão no REC-6.

### 7.5 Contrato e assinatura — **próximo**

Gerar o contrato a partir da ficha e da forma de pagamento, mandar para
assinatura e trazer o resultado de volta.

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CTR-1 | Na tela do lead, **Gerar contrato**: o modelo da Duli preenchido com os dados da ficha (nome, CPF, RG, estado civil, nacionalidade, endereço) | P0 | ⬜ |
| CTR-2 | O contrato usa a forma de pagamento já confirmada pelo cliente na ficha (FIC-7 a FIC-10, 17/nov); a mesma condição vira a cobrança no Ganho (REC-6) — sem redigitar | P0 | ⬜ |
| CTR-3 | Enviar ao ZapSign; o negócio registra "contrato enviado" (data e link), exista ou não uma etapa com esse nome no funil | P0 | ⬜ |
| CTR-4 | Assinado → o PDF assinado fica no lead/cliente, o histórico registra, e o Ganho é **oferecido** ao dono, que confirma pelo resumo do CRM-14 (Q3, decidida em 17/nov) | P0 | ⬜ |
| CTR-5 | Recusado ou expirado → avisa na Início, o negócio continua no funil | P1 | ⬜ |
| CTR-6 | Mais de um modelo de contrato (por tipo de visto) | P2 | ⬜ |

Critério de aceite (CTR-1 a CTR-4):

- Dado um lead com a ficha **conferida** e a forma de pagamento **confirmada**,
  quando o Renato clica Gerar contrato, então vê a prévia com os dados certos
  antes de enviar.
- Sem ficha conferida, o botão explica o que falta e não gera nada.
- Assinado pelo cliente, em até 5 minutos o lead mostra "contrato
  assinado", com o PDF, sem ninguém atualizar nada à mão.
- O mesmo aviso do ZapSign recebido duas vezes não duplica nada.
- Antes de planejar: o aviso do ZapSign é uma segunda porta sem login (Q14),
  e o PDF precisa de um depósito de arquivos do contato, que ainda não
  existe — entra em §12.1, em `docs/banco.md` §4 e na cópia do OPS-1. A
  tabela `files` já existe (com RLS), mas sem depósito nem policy de Storage.
- O Ganho oferecido (CTR-4) passa pelo `ganhar_negocio` (0052), numa
  gravação só, e a cobrança do contrato nasce nele (REC-6, entrega 4a), com
  a organização da pessoa: esse caminho não tem o I2, o I20 nem o I24. A
  cobrança manual do Financeiro continua com o I20 e o I24 (REC-1, REC-2).
- Nenhum dado de cliente é digitado pela equipe entre a ficha e o contrato.

Dúvidas que bloqueiam este módulo estão em §10 (Q1, Q2, Q4 e Q14; a Q3 foi decidida em 17/nov).

### 7.6 Processos

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| PRO-1 | Criar processo do tipo de visto: etapas e pastas copiadas | P0 | ✅ |
| PRO-2 | Etapas com status, data prevista e de conclusão, sub-etapas; progresso em % | P0 | ✅ |
| PRO-3 | Documentos: pastas, envio, ver, aprovar, recusar com motivo, resolver | P0 | 🟡 — excluir pasta apaga os arquivos antes (I9) |
| PRO-4 | Observações em editor colaborativo | P0 | 🟡 — a compactação pode perder texto em edição simultânea (I22) |
| PRO-5 | Campos do USCIS: recibo, priority date, RFE recebida, prazo, resposta enviada, decisão | P0 | ✅ |
| PRO-6 | Busca e filtro na lista de processos | P1 | ⬜ |
| PRO-7 | Responsável por etapa | P1 | ⬜ |
| PRO-8 | Lista de evidências (documento do caso, no mesmo editor das Observações) | P1 | ⬜ |
| PRO-9 | Fila única de documentos esperando revisão, de todos os processos | P1 | ⬜ (vira P0 com o portal) |
| PRO-10 | Etapa-mãe concluída sozinha quando todas as filhas concluem | P2 | ⬜ |
| PRO-11 | Link do Google Drive do caso | P2 | ⬜ |
| PRO-12 | **Processo nunca é apagado**, por ninguém (o banco recusa; exceção só na organização de teste). Desistência = encerrado (17/nov). *Entrega 3 (19/nov): a policy de `projects` perde o delete e um gatilho recusa o delete direto; só a cascata da pessoa passa (0051)* | P0 | ✅ |

### 7.7 Financeiro — a receber

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| REC-1 | Cobrança por cliente, em real ou dólar, com desconto | P0 | 🟡 — cobrança não é tudo-ou-nada; carimbada com a organização de quem clicou (I20, I24) |
| REC-2 | Parcelas geradas sem perder centavo; baixa com data e cotação | P0 | 🟡 — entrada negativa gera parcela negativa (I20) |
| REC-3 | Lista com filtros (vencidas, a vencer, pagas) e números do mês | P0 | ✅ |
| REC-4 | Funciona sem internet | P0 | 🟡 — sem o prazo de 14 dias (I19), "Nenhuma cobrança" antes de baixar (I26), e os defeitos da fila (I17, I21, I23) |
| REC-5 | Anexar boleto e nota fiscal à parcela — virou o CLI-6 (entregue em 19/nov) | P1 | ✅ |
| REC-6 | Cobranças criadas no Ganho a partir da forma de pagamento confirmada, uma por parte, sem duplicar (17/nov; antes dependia do contrato, CTR-2). Nascem no banco, na mesma gravação do Ganho, com a organização **da pessoa** — esse caminho não passa pelos defeitos I20 e I24 da cobrança manual. *Entrega 4a; "criar as cobranças mesmo assim" com a forma enviada ou recusada, na 4b* | P0 | ⬜ |
| REC-7 | Boleto do Itaú e link do C6 emitidos pelo app | P2 | ⬜ — depende das credenciais |
| REC-8 | Nota fiscal emitida pelo app | P2 | ⬜ — depende do provedor |
| REC-9 | Cotação do dólar sugerida automaticamente (Banco Central), sempre corrigível | P2 | ⬜ |

Critério de aceite do REC-6 (entrega 4a; o resto em `docs/superpowers/specs/2026-11-21-entrega-4a-forma-de-pagamento-design.md` §8):

- Ganho com a forma do critério do FIC-7 confirmada: nascem 2 cobranças — uma em R$ com
  1 parcela e uma em US$ com 3 —, com a organização da pessoa, sem processo,
  com o título "‹rótulo› — ‹vistos›" ("Entrada — EB-1A, O-1"). O resumo
  listou as mesmas 2.
- Forma em rascunho, ou sem forma: nenhuma cobrança, e o resumo diz por quê.
- Uma parcela com vencimento de ontem: o resumo avisa "1 parcela já
  vencida", e o Ganho passa.
- Ganho, reabrir, ganhar de novo: nenhuma cobrança nova, e o resumo diz que
  já foram criadas; "Refazer" é recusado ("As cobranças já foram criadas.
  Para mudar, exclua a cobrança e crie outra na aba Financeiro do
  cliente.").

### 7.8 Financeiro — a pagar e caixa

Sem isto o mês não fecha no app (O2).

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| PAG-1 | Contas a pagar: valor, moeda, vencimento, categoria, fornecedor, pago em | P0 | ⬜ |
| PAG-2 | Conta recorrente (mensal) sem lançar uma a uma | P0 | ⬜ |
| PAG-3 | Despesas avulsas e categorias | P0 | ⬜ |
| PAG-4 | Fornecedores | P1 | ⬜ |
| PAG-5 | Fluxo de caixa do mês: entrou, saiu, saldo, em real com a cotação de cada pagamento | P0 | ⬜ |
| PAG-6 | Visão de 12 meses | P1 | ⬜ |

Critério de aceite (portão O2): o Renato lança as contas de um mês real,
dá baixa no que pagou, e o fluxo de caixa bate com o extrato do banco sem
planilha ao lado.

### 7.9 Tarefas

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| TAR-1 | Tarefa com responsável, prazo, prioridade, tipo; ligada a contato, negócio ou processo | P0 | ⬜ |
| TAR-2 | Minhas tarefas e as da equipe; concluir | P0 | ⬜ |
| TAR-3 | Aparecem na Início (atrasadas e de hoje) e na tela de onde nasceram | P0 | ⬜ |
| TAR-4 | Aviso de tarefa vencendo (no app; e-mail opcional), que roda sozinho todo dia | P1 | ⬜ |
| TAR-5 | Visão em calendário | P2 | ⬜ |

### 7.10 Usuários, permissões e notificações

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| USU-1 | Convidar membro da equipe, escolher papel (`admin`, `staff`), desativar | P0 | ⬜ |
| USU-2 | Configuração só para `owner`/`admin`; `staff` lê | P0 | ✅ |
| USU-3 | Trocar e redefinir a própria senha ("esqueci minha senha") | P0 | ⬜ (hoje só entrar e sair) |
| USU-4 | Central de notificações: ficha recebida, contrato assinado, documento enviado pelo cliente, tarefa vencendo | P1 | ⬜ |
| USU-5 | Registro de quem mudou papel de quem | P2 | ⬜ |

### 7.11 Configurações

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CFG-1 | Etapas do funil, tags, catálogo de pastas, tipos de visto, status de etapa | P0 | 🟡 (offline) — defeitos da fila (I17, I21, I23) |
| CFG-2 | Tipos e prioridades de tarefa | P0 | ⬜ (com 7.9) |
| CFG-3 | Métodos de pagamento | P1 | ⬜ |
| CFG-4 | Dados da empresa (razão social, CNPJ, endereço — vão para o contrato) | P0 | ⬜ (com 7.5) |
| CFG-5 | Integrações (ZapSign, Calendly, e-mail) | P1 | ⬜ |

### 7.12 Integrações e automações

Cada integração é uma funcionalidade nova: entra com desenho e spec próprios
quando houver um problema da Duli que ela resolva (§10, Q5).

| Integração | O que faria pela Duli | Pri. |
|---|---|---|
| ZapSign | Assinatura do contrato, com o resultado voltando sozinho | P0 — em 7.5 |
| Agenda (Calendly ou página própria) | Reunião marcada pelo lead já cria o lead e a tarefa | P1 |
| n8n | Automações da equipe: avisar eventos, receber a lista de evidências | P1 |
| E-mail | Avisos ao cliente e à equipe (ficha recebida, documento recusado, parcela vencendo) | P1 |

### 7.13 Funcionar sem internet

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| OFF-1 | Instalável no celular e no computador | P0 | ✅ |
| OFF-2 | Configuração e Financeiro abrem e gravam sem internet e sincronizam sozinhos | P0 | 🟡 — Financeiro sem o prazo de 14 dias (I19); defeitos da fila (I17, I21, I23) |
| OFF-3 | Contatos, CRM e Processos sem internet | P2 | ⬜ (despriorizado em 25/set) |
| OFF-4 | Arquivos de um processo disponíveis offline, por escolha | P2 | ⬜ |

### 7.14 Portal do cliente — Fase 6

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| POR-1 | O cliente recebe acesso no Ganho (convite, troca de senha no primeiro acesso) | P0 da fase | ⬜ |
| POR-2 | Vê seus processos: etapas e progresso, **sem as notas internas** nem as observações (decisão de 6/nov). A parte do banco está pronta: desde a 0046 o cliente do portal não lê notas nem histórico (CLI-9); falta a tela do portal | P0 da fase | ⬜ |
| POR-3 | Envia documentos para as pastas; vê aprovado/recusado com o motivo | P0 da fase | ⬜ |
| POR-4 | Vê suas parcelas | P1 da fase | ⬜ |
| POR-5 | A equipe pode "ver como o cliente" | P1 da fase | ⬜ |

Já preparado: o banco deixa o cliente ler o que é dele e congela o que ele não
pode mudar (CPF, RG, vínculo).

### 7.15 Portal do parceiro — Fase 7

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| PAR-1 | Parceiro vê só os clientes dele e o andamento | P0 da fase | 🟡 (isolamento pronto no banco; sem tela) |
| PAR-2 | Cliente do parceiro vê a marca do parceiro | P0 da fase | ⬜ |
| PAR-3 | Financeiro em dois lados: o que o parceiro cobra do cliente (dele) e o que a Duli cobra do parceiro (da Duli) | P0 da fase | ⬜ |

### 7.16 Clientes (desenhado em 17/nov)

Ver os clientes separados de quem nunca fechou, com tudo de cada um num lugar
só. Cliente é a mesma linha de `people` (§6.1), com estágio `client`; a tela é
que é própria. Desenho técnico e critério de aceite de cada requisito:
`docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`
(§6.2; entregas 1, 3 e 4 nos §6.1, §6.3 e §6.4). O critério do CLI-15 está
aqui mesmo, abaixo da tabela.

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CLI-1 | Item **Clientes** no menu, abaixo do CRM: lista com nome, e-mail, telefone, dono, cliente desde e **Abrir**; busca por nome, e-mail ou telefone; sem corte silencioso | P0 | ✅ |
| CLI-2 | Perfil do cliente: cabeçalho numa linha (com as Tags) e abas Dados cadastrais, Financeiro, Projetos, Documentos, Notas. Não lista oportunidades (CRM-16) | P0 | ✅ |
| CLI-3 | Copiar telefone e e-mail com um clique | P0 | ✅ |
| CLI-4 | Dados cadastrais: a ficha inteira (contratante, endereço, dependentes) e a situação do link | P0 | ✅ |
| CLI-5 | Financeiro: cobranças, totais por moeda (contratado, pago, saldo devedor, vencido), parcelas, baixa, cobrança manual | P0 | ✅ |
| CLI-6 | Anexar boleto, nota fiscal e comprovante à parcela (era o REC-5) | P1 | ✅ |
| CLI-7 | Projetos: os processos do cliente, com andamento; clicar abre o processo; **+ Novo processo** à mão | P0 | ✅ |
| CLI-8 | Documentos do cliente por categoria (identidade, passaporte, comprovante de residência, contrato, outro); os do processo ficam no processo | P0 | ✅ |
| CLI-9 | Notas e histórico desde a fase de lead, do mais recente para o mais antigo, com a nota nova no topo e "Oportunidade ganha — virou cliente"; quem tem acesso ao cliente lê e escreve, **o cliente nunca lê** | P0 | ✅ |
| CLI-10 | Dono e participantes do cliente e da oportunidade; o cliente herda no Ganho. Por ora só marcam quem cuida — não restringem quem vê. **Entrega 2:** dono e participantes do cliente no Editar; as tabelas da oportunidade (0044). **Entrega 3:** dono e participantes do negócio no Editar negócio, e o Ganho os passa ao cliente (0052) | P1 | ✅ |
| CLI-11 | Cliente desde: gravado quando a pessoa passa a ser cliente, editável à mão; os atuais recebem a data do primeiro processo ou cobrança | P0 | ✅ |
| CLI-12 | Marcar como cliente à mão, só a gestão (conferido no banco). **Entrega 2:** o botão e a função `marcar_como_cliente`, só da gestão; promover por `update` direto pela API, ou inserir já como cliente, também é só da gestão desde a 0054 (entrega 3). **CLI-15 (20/nov):** quem marca fica como dono, se a pessoa não tiver | P0 | ✅ |
| CLI-13 | Cliente não volta a ser lead, garantido no banco (fecha o M17) | P0 | ✅ |
| CLI-14 | Quem tem processo ou cobrança é cliente: criar um ou outro promove a pessoa, com registro no histórico — fora do Ganho, só a gestão; os contatos assim hoje viram clientes na migration. Substitui o CON-3. **Entrega 2:** no banco (0045), também pela fila do Financeiro; **Entrega 3:** o ramo do Ganho (marca `via_ganho`, 0054) | P0 | ✅ |
| CLI-15 | **Novo cliente** à mão, para o cliente que não passou pelo funil (o cliente antigo): botão na tela Clientes, só para a gestão; escolhe um contato que ainda não é cliente nem está no funil, ou cria o contato ali mesmo, e abre o perfil na aba Projetos com o "+ Novo processo" aberto. Critério de aceite abaixo. *20/nov: `criar_cliente` e `buscar_contatos_para_cliente` (0055); botão na tela Clientes* | P0 | ✅ |

**Critério de aceite do CLI-15** (desenhado com o Renato em 20/nov):

- **Quem:** o botão "Novo cliente" fica no topo de Clientes e aparece só para
  quem é `owner` ou `admin` da organização atual. O banco confere a gestão da
  organização **da pessoa** logo depois de achá-la (no contato novo, antes de
  tudo) e antes de qualquer gravação: pela função do Novo cliente, o `staff`
  recebe "Só a gestão marca alguém como cliente."; por `insert` ou `update`
  direto, a frase de sempre (0054). Nada se grava.
- **Só a organização atual:** a lista e o "contato existente" são só as pessoas
  cuja organização é a atual (não as atribuídas a ela por outra). Contato de
  outra organização que aparecer como parecido não se usa: no aviso, ele vem
  com "Este contato é de outra organização; quem o torna cliente é a gestão de
  lá." e, no lugar de "Sim, é a mesma pessoa", um link "Abrir perfil".
- **Quem está no funil fica de fora:** a lista não traz quem tem negócio aberto,
  e o banco recusa com "Este contato está no funil: use o Ganho." — também
  quando ele chega pelo aviso de parecido. O Novo cliente é para quem nunca
  passou pelo funil; o cliente antigo que está no funil é ganho pelo Ganho, e a
  data do ganho se ajusta depois (CRM-17). Negócio perdido não impede.
- **Contato existente:** a escolha é por busca (nome, e-mail ou telefone), e
  cada linha mostra nome, e-mail e telefone. A lista traz quem ainda não é
  cliente, está fora da lixeira e não tem negócio aberto. Mostra até 20; acima
  disso, "Mostrando 20 de N; refine a busca." — nunca corta em silêncio.
- **Contato novo:** nome, DDI, telefone e e-mail obrigatórios, com as mesmas
  regras e frases do Novo contato. Nasce na organização atual, já cliente.
- **Parecido:** se já existe alguém com o mesmo e-mail ou telefone, nada se
  grava e aparece o aviso de contato parecido (`AvisoDeDuplicado`, CON-4).
  "Sim, é a mesma pessoa" usa a existente: se ela ainda não é cliente, vira
  cliente; se já é, abre o perfil dela sem gravar; se está na lixeira,
  "Restaurar" restaura e depois usa (são dois passos, como na Nova
  oportunidade: se o segundo falha, ela fica restaurada e a frase aparece).
  "Não, é outra pessoa" leva ao "Criar mesmo assim", que cria o novo.
- **Antes de gravar**, o diálogo avisa: "Não tem volta: cliente não volta a ser
  lead.".
- **O que grava:** estágio cliente, "cliente desde" = hoje em São Paulo, a
  linha "Marcado como cliente" no histórico e, se a pessoa ainda não tem dono,
  **quem criou fica como dono** (decisão do Renato, 20/nov). Dono que já
  existe não muda; os outros dados também não. **Vale também para o "Marcar
  como cliente"** (CLI-12): quem marca fica como dono, se a pessoa não tiver
  — os dois caminhos à mão gravam igual.
- **Uma gravação só:** contato novo e cliente nascem juntos. Se algo falha,
  não sobra contato solto nem cliente pela metade.
- **Recusas com frase:** pessoa que já é cliente ("Já é cliente."), na lixeira
  ("Este contato está na lixeira. Restaure antes.") ou que não existe para
  quem chama ("Contato não encontrado.").
- **Depois de gravar**, e também quando o parecido já é cliente: abre
  `/clientes/<id>?aba=projetos`, com o "+ Novo processo" aberto e sem negócio.
- **Cliente desde** não está no formulário: fica hoje e se corrige depois em
  Editar (CLI-11).
- **Clientes vazia:** para a gestão, o aviso diz "Um contato vira cliente
  quando o negócio dele é ganho, ou pelo Novo cliente."; para os outros, a
  frase de hoje.
- No celular, o botão fica no topo e o diálogo rola por inteiro (conferência à
  mão). Sem internet não abre, como o resto de Clientes.

---

## 8. Requisitos não funcionais

| Tema | Requisito |
|---|---|
| Segurança | Isolamento por organização garantido no banco e provado por teste a cada mudança. Toda porta sem login que lê ou grava dados de cliente está listada em §12.2 e em `src/proxy.ts`, faz uma coisa só e é conferida por segredo: hoje só a ficha, por token de uso único; o aviso do ZapSign entra como a segunda (7.5, Q14) |
| Dados pessoais (LGPD) | CPF, RG, passaporte e documentos só para quem precisa — **hoje a cópia offline leva a ficha inteira de todo contato para cada aparelho da equipe (I13)**; aceite do lead guardado com o texto aceito, sem a equipe poder reescrever (hoje pode — I11); arquivos em depósito privado com link temporário; pedido do titular atendido por anonimização (CON-7) |
| Disponibilidade | Falha de leitura aparece como falha; nunca como lista vazia ou "tudo em dia" |
| Celular | Toda tela funciona no celular, inclusive o que no computador se faz arrastando |
| Desempenho | Telas abrem em até ~2 s com os dados atuais (76 contatos, dezenas de processos) |
| Custo | Plano gratuito do Supabase enquanto couber e uma VPS de custo fixo (Hostinger); arquivos de cliente não são copiados para todo aparelho |
| Dono dos dados | Banco, domínio e contas em nome da Duli — nada que dependa de conta de terceiro |
| Cópia de segurança | **OPS-1** (P0, ⬜): cópia diária do banco **e de todos os depósitos de arquivos** (hoje `documentos` e `observacoes`; `pessoas` e `financeiro` quando o 7.16 os criar — o PDF do contrato mora em `pessoas`), cifrada, guardada fora do Supabase e fora da VPS; aviso ao Renato se a cópia de um dia falhar; restauração testada uma vez por mês num Supabase vazio — local, pela linha de comando, enquanto não houver vaga de projeto (Q13) —, com data e tempo anotados. A cópia é a única tarefa automática que usa a senha do banco e a chave mestra. Onde a cópia roda, onde moram a senha do banco e a chave mestra que ela usa, e onde fica a chave da cifra (nunca junto da cópia, e recuperável se a VPS ou o Supabase se perderem) ainda não está decidido: entra em §12.5 (linha da tarefa) e em §12.1 (Variáveis e segredos) quando o OPS-1 for desenhado; inventário na Q15. Aceite: dado o banco de ontem, quando a restauração roda num Supabase vazio (local ou projeto), então os contatos, as cobranças e um passaporte escolhido ao acaso abrem iguais aos de produção. **Hoje não existe cópia automática** (plano gratuito): só a manual de 17/nov, feita pelo Renato antes da 0037 (`pg_dump`, cifrada com 7-Zip) |
| Operação | **OPS-2** (P0, ⬜): um monitor de fora confere `app.duliconsulting.com/api/versao` a cada 5 minutos e avisa o Renato se cair (vê o app, não o banco); o roteiro "o app caiu" está em §12.8 |
| Registro de quem fez o quê | **AUD-1** (P1, ⬜): quem criou, alterou ou apagou cobrança e parcela, e quem aprovou ou recusou documento, guardado num registro que ninguém edita |

## 9. Pronto para a equipe usar no dia a dia

O critério do objetivo O1: o que precisa existir para a equipe trabalhar o dia
inteiro no DuliHub.

| Precisa estar pronto | Módulo |
|---|---|
| Tudo marcado ✅ acima, **sem defeito Grave ou Importante aberto** em `docs/revisao-2026-11.md` | — |
| Cópia de segurança diária com restauração testada (OPS-1) e monitor de queda (OPS-2) | §8 |
| Contrato e assinatura | 7.5 |
| A pagar, despesas e fluxo de caixa | 7.8 |
| Tarefas | 7.9 |
| Convidar usuários, trocar e redefinir senha | 7.10 |
| As integrações escolhidas em Q5 (enquanto Q5 não for respondida, este item fica sem fim definido) | 7.12 |
| Dados finais do app antigo migrados (contatos, processos e arquivos), conferidos por contagem; app antigo intacto por 30 dias. O financeiro do antigo não migra — "o que está lançado termina lá" (plano) —, e por isso o app antigo precisa continuar acessível até a última parcela lançada nele ser paga, por um endereço próprio depois que `login.duliconsulting.com` passar ao DuliHub 2 | Fase 5 do plano |

Passo operacional, não de código: o domínio `login.duliconsulting.com` (hoje o
app antigo) passa a levar ao DuliHub 2, que já está em `app.duliconsulting.com`,
e cada pessoa da equipe define a sua senha.

## 10. Perguntas em aberto

| # | Pergunta | Quem responde | Bloqueia |
|---|---|---|---|
| Q1 | O modelo do contrato: quais campos variam além dos dados do cliente e da forma de pagamento? (visto, valor por extenso, foro, testemunhas…) | Renato | 7.5 |
| Q2 | O contrato é um modelo dentro do ZapSign ou um documento nosso que o app gera em PDF? | Renato + engenharia | 7.5 |
| Q4 | Quem mais assina além do cliente (Duli, testemunhas, cônjuge)? | Renato | 7.5 |
| Q5 | Quais integrações resolvem um problema real da equipe hoje — agenda, e-mail, n8n? | Renato | 7.12, §9 |
| Q6 | Quantas pessoas da equipe usam o app, e com que papel? | Renato | 7.10 |
| Q7 | Metas: em quanto tempo, do "sim" do lead ao contrato assinado, queremos chegar? Hoje leva quanto? | Renato | §3 |
| Q8 | Provedor de nota fiscal; como faturar em dólar (NFS-e ou invoice) | Renato + contador | REC-8 |
| Q9 | Credenciais do Itaú e do C6 | Renato | REC-7 |
| Q10 | "Linha ascendente" do dono do negócio: quem é? O app só conhece os papéis `owner`, `admin` e `staff` por organização — não há "chefe de" | Renato | CRM-10 |
| Q11 | Link novo de ficha com uma ficha recebida ainda não conferida: substitui a antiga ou ela continua valendo? | Renato | I4 (aviso preso do INI-4) |
| Q12 | Outra pessoa entra no mesmo aparelho com alterações da anterior ainda por subir: apagar, segurar até ela voltar, ou avisar? | Renato | 7.13 |
| Q13 | Banco de teste e cópia: liberar uma das vagas gratuitas do Supabase, ou passar ao plano pago? O pago traz cópia diária **só do banco**, guardada 7 dias; os arquivos continuam precisando do OPS-1 | Renato | §12.6, OPS-1 |
| Q14 | Como o aviso do ZapSign entra no banco sem login: função estreita conferida por segredo (como a ficha) ou chave de servidor? Onde fica o token da API do ZapSign? | Engenharia, com o Renato | 7.5, §12 |
| Q15 | Inventário de contas: quem é dono e quem tem acesso (e se com verificação em duas etapas) a Supabase, Hostinger, Easypanel, GitHub `conectachat`, HostGator, os segredos do CI e o Supabase do app antigo (conta da Lovable)? O repositório deve ser privado? | Renato | §8 "Dono dos dados" |
| Q16 | O que a organização **atribuída** a um contato pode fazer: hoje edita o contato, lê o histórico mas não escreve nele, e não vê processos, cobranças nem fichas (N3) | Renato | PAR-1 |
| Q17 | LGPD: por quanto tempo guardar lead perdido antes de anonimizar; o que fazer com notas e Observações em texto livre, com a cópia offline e com as cópias de segurança | Renato, com advogado | CON-7 |

### Decididas

| Data | Decisão |
|---|---|
| 6/nov | Contato nunca é apagado de vez (§6.8) |
| 6/nov | Ganho e reabrir: só o dono do negócio e a linha ascendente (CRM-10) |
| 6/nov | O cliente do portal não vê notas internas (POR-2) |
| 6/nov | Sem banco separado para testes: eles rodam no banco de produção, só com as contas de teste e na organização de teste (revista em 16/nov — Q13) |
| 16/nov | A hospedagem sai da Vercel e vai para uma VPS da Hostinger (Easypanel); o banco continua no Supabase (§12) |
| 16/nov | O banco de teste foi querido, mas adiado: as duas vagas gratuitas do Supabase estão ocupadas (§12.6, Q13) |
| 17/nov | Q3: assinado o contrato, o Ganho é só **oferecido**; o dono confirma. Automático, só quando o fluxo inteiro estiver funcionando |
| 17/nov | Clientes com item próprio no menu e perfil em abas (7.16). Documentos do processo ficam no processo |
| 17/nov | Nome, telefone e e-mail obrigatórios em todo contato; aviso de contato e de oportunidade já existentes (CON-4, CON-8, CRM-12) |
| 17/nov | Oportunidade com vários vistos; o Ganho cria um processo por visto, com resumo antes (CRM-13, CRM-14) |
| 17/nov | Processo nunca é apagado (§6.8, PRO-12) |
| 17/nov | Forma de pagamento definida ao enviar a ficha, confirmada pelo cliente no formulário; cada parte na sua moeda, sem conversão pelo app (FIC-7 a FIC-11) |
| 17/nov | Dono e participantes só marcam quem cuida; não restringem quem vê (CLI-10) |
| 17/nov | Notas: o cliente nunca lê; quem tem acesso ao cliente lê e escreve (CLI-9) |
| 18/nov | Clientes lê do servidor, como Contatos e CRM — exceção à "tela nova nasce migrada", registrada no `AGENTS.md`; a aba Financeiro continua lendo do aparelho |
| 18/nov | Anexos da parcela vão direto do navegador ao servidor, só com internet: a tela Financeiro é migrada e não tem Server Action (CLI-6) |
| 18/nov | "Só a gestão ou o Ganho tornam cliente" pela API fica para a entrega 3, junto com o Ganho no banco; na entrega 2, a gestão e o Ganho de hoje (D1 do plano) |
| 20/nov | Novo cliente à mão na tela Clientes, só para a gestão, para o cliente que não passou pelo funil; escolhe o contato ou cria ali mesmo, sem "cliente desde" no formulário (fica hoje, corrige-se em Editar); quem está no funil fica de fora (use o Ganho); quem cria fica como dono se a pessoa não tiver — e o "Marcar como cliente" passa a fazer o mesmo (CLI-15, CLI-12) |
| 20/nov | A data do Ganho se ajusta depois, só pela gestão e só pelo "Ajustar data", com histórico, para o ganho do cliente antigo não contar no mês errado; de 01/01/2000 até hoje, e o mesmo dia não grava nada (CRM-17) |
| 20/nov | A entrega 4 vai em duas metades: 4a — a equipe define e confirma a forma de pagamento, e o Ganho cria as cobranças; 4b — o link com a forma, a resposta do cliente e os avisos da Início |
| 21/nov | Cartão é um pagamento só, sem número de vezes nem juros: a Duli recebe tudo antecipado. Entrada e parcelas viram parcelas no Financeiro, pela programação da forma (FIC-7) |
| 21/nov | Com a forma de pagamento confirmada, os vistos do negócio não mudam; para mudar, "Refazer" a forma antes (FIC-12). Depois que o Ganho cria as cobranças, a forma vira registro e a trava acaba, para o negócio reaberto aceitar visto novo (CRM-15); a cobrança dele se cria à mão |

## 11. Ordem proposta

A ordem fina mora no `plano.md`; esta é a sugestão que sai da spec, pelo
caminho até o uso diário (§9):

0. **Cópia de segurança e monitor (OPS-1, OPS-2)**: hoje não existe cópia, e
   tudo — testes, desenvolvimento, migrations — bate no banco de produção.
1. **Contato → oportunidade → cliente (17/nov)**: contato completo, Clientes,
   vistos e Ganho com resumo, forma de pagamento na ficha — entregas 0 a 4 (a 4
   em duas metades, 4a e 4b) de
   `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`.
   Prepara o contrato.
2. **Contrato e assinatura (7.5)**: fecha a jornada do lead. Depende de Q1,
   Q2, Q4 e Q14.
3. **A pagar e fluxo de caixa (7.8)**: portão O2.
4. **Tarefas (7.9)** com tipos e prioridades.
5. **Usuários (7.10)** e as integrações escolhidas em Q5.
6. **Uso diário (§9)**: troca do domínio e senhas da equipe.
7. Portal do cliente, depois portal do parceiro.

---

## 12. Arquitetura — como o sistema é montado

A spec diz o que o sistema faz; esta seção diz **onde mora cada parte e
quem fala com quem**. Toda funcionalidade nova se encaixa aqui antes de
virar código; se não couber, a arquitetura muda primeiro, aqui.

### 12.1 As partes e onde moram

| Parte | Onde | O que faz |
|---|---|---|
| **Aparelho** (navegador, celular ou computador) | Na mão de quem usa | Desenha as telas. Guarda a **casca** das telas para abrir sem internet (service worker), a **cópia** do servidor (espelho, IndexedDB, uma por usuário) e a **fila** do que foi gravado e ainda não subiu (banco separado da cópia) |
| **App** (Next.js 16, num container Docker) | **VPS Hostinger**, painel Easypanel — projeto `dulihub`, serviço `app` | Monta as páginas, roda as ações de gravar (Server Actions) com a sessão de quem clicou, e manda para o login quem não está logado |
| **Banco, login, arquivos e tempo real** | **Supabase** na nuvem, projeto `xigmtofpmfqeehhcdasf` | Postgres com as regras de acesso (RLS) e gatilhos; login por e-mail e senha; arquivos em depósitos privados (`documentos`, `observacoes`); canal em tempo real das Observações |
| **Código** | GitHub, `conectachat/dulihub-v2` | Guarda as versões. A cada envio, roda os testes (unidade, RLS, fumaça) |
| **Endereço** | DNS na HostGator | `app.duliconsulting.com` → VPS. `login.duliconsulting.com` → app antigo, até a virada (§9) |
| **Variáveis e segredos** | Easypanel (Ambiente do `app`) e GitHub (Secrets) | No Easypanel, só as duas chaves públicas do Supabase, que entram no build. No GitHub, as mesmas mais as senhas das contas de teste, para o CI. Nenhuma chave mestra no app; a da cópia (OPS-1) mora só onde a cópia roda. O interruptor de emergência `SW_DESLIGAR=1`, no Ambiente do Easypanel, faz os navegadores apagarem a casca guardada (§12.8) |

O banco **não** mora na VPS de propósito: cópia, atualização e segurança do
banco ficam com o Supabase, e um problema no servidor não leva os dados
junto.

### 12.2 Quem fala com quem

```
aparelho ──páginas e ações──▶ app (VPS) ──sessão de quem clicou──▶ Supabase
aparelho ──fila, cópia, tempo real, arquivos──────────────────────▶ Supabase
cliente sem login ──ficha (/cadastro/<token>)──▶ app ──porta anônima──▶ Supabase
GitHub ──envio no main──▶ Easypanel monta o Dockerfile ──▶ app novo no ar
```

- **Ninguém usa a chave mestra do Supabase** (service role): nem o app nem o
  aparelho. Toda leitura e gravação passa pela RLS com a sessão de quem está
  usando. A chave mestra só existe para scripts rodados à mão e para a cópia
  de segurança (OPS-1), que não roda dentro do app.
- A única porta sem login para **gravar** é a ficha de cadastro: duas funções
  do banco, por token de uso único (migration 0035). Rotas que o app abre sem
  login: `/login`, `/cadastro/`, `/offline`, `/sw.js`, o manifesto e
  `/api/versao`. `/proposta`, `/agendar` e `/auth` estão liberadas sem existir
  e devem sair (M13; o `/auth` volta quando o USU-3 criar a rota de
  confirmação do e-mail). O cadastro público do login do Supabase deve estar desligado
  (S13, a conferir no painel).

### 12.3 Onde ficam as regras do negócio

| Camada | O que garante | Exemplo |
|---|---|---|
| **Banco** (RLS, chaves compostas, gatilhos) | O que **não pode** acontecer, venha o pedido de onde vier | Uma organização não lê a outra; contato não muda de organização; contato não é apagado de vez; negócio não nasce ganho (migration 0038) |
| **Regras puras** (`src/features/<domínio>/regras.ts`) | As contas e decisões do negócio, testadas sem banco | Parcelas que fecham no centavo; para onde o cartão vai ao ser solto |
| **Telas** | Só desenham e pedem | — |

Regra que só está na tela é conveniência, não regra (`AGENTS.md`). "Cliente
não volta a lead" (§6.2, M17) saiu da tela e foi ao banco na 0045. Ainda só na
tela, até a entrega 3: quem pode promover a cliente por `update` direto.

### 12.4 Uma empresa ou várias

Várias, desde a primeira migration. Toda linha tem `organization_id`,
herdado do registro-pai — exceto `profiles` e a própria `organizations`. A **Duli** é a organização raiz; cada **parceiro** é
uma organização; o cliente do portal entra pelo vínculo com a própria ficha.
Papéis por organização: `owner`, `admin`, `staff`. Criar organização exige ser
dono da raiz; mexer nas associações, ser `owner` ou `admin` da organização (ou
dono da raiz); e só um dono cria, altera ou tira outro dono. O detalhe de cada
tabela — quem lê, quem grava — está em `docs/banco.md`.

### 12.5 Fila, tarefas agendadas e sistemas de fora

| Tema | Hoje | Depois |
|---|---|---|
| **Fila** | A fila do aparelho: gravação offline sobe em ordem quando a rede volta; queda de rede espera, recusa vira conflito visível (`src/lib/local/fila.ts`). No servidor não há fila | — |
| **Tarefas agendadas** | Uma, no banco: `limpar-lapides` (pg_cron, todo dia às 04:17 UTC, migration 0031) apaga lápides com mais de 90 dias. No aparelho, a sincronia tenta subir a fila a cada minuto enquanto o app está aberto (não é tarefa do servidor). Na VPS, nenhuma | Cópia de segurança diária (OPS-1) e monitor de queda (OPS-2). Toda tarefa nova entra aqui com: onde roda, horário em UTC e quem fica sabendo se falhar |
| **Sistemas de fora** | Só o Supabase | ZapSign (7.5, Q14), Itaú e C6 (REC-7), nota fiscal (REC-8), agenda, n8n e e-mail (7.12); **um servidor de e-mail próprio (SMTP)**, com SPF/DKIM no DNS da HostGator, para convite e "esqueci a senha" (USU-1, USU-3) — o e-mail padrão do Supabase não serve para isso. Cada um entra aqui quando for desenhado |

### 12.6 Ambientes

| Ambiente | Onde | Banco |
|---|---|---|
| Produção | `app.duliconsulting.com` (VPS) | O de verdade |
| Desenvolvimento | O computador do Renato | **O de verdade** — por isso, ao desenvolver, entra-se só com as contas de teste |
| Testes automáticos | Computador e GitHub | **O de verdade**, só nas contas e na organização de teste (`is_test`) |

**Não há banco de teste** (decisão de 16/nov: o plano gratuito do Supabase
permite dois projetos, e os dois estão ocupados). Consequências que ficam
abertas: a conta de teste existe no banco real; a exceção de apagar contato
existe só para a organização de teste; e migration vai direto para a
produção — por isso toda migration entra com teste RLS vermelho antes. Ter
um banco de teste resolve as três (Q13).

### 12.7 Como uma mudança chega ao ar

1. Código e teste no computador; `bun run verify`, build e fumaça verdes;
   commit.
2. Envio (`push`) para o `main` no GitHub: o CI roda unidade, RLS e fumaça.
3. O Easypanel vê o envio e monta o `Dockerfile` **sem esperar o CI**: teste
   vermelho não impede a publicação, só build quebrado impede. Por isso o
   `push` só sai com tudo verde na máquina. O Next é montado com o Node (o
   bun quebra no build dentro do Docker); a imagem final só roda o servidor.
4. Mudança no banco vai **antes** do código que depende dela, e precisa
   funcionar com o código antigo ainda no ar (primeiro só acrescentar;
   retirar coluna, depois). Antes de aplicar, a cópia do dia (OPS-1);
   enquanto o OPS-1 não existe, um `pg_dump` à mão, cifrado e guardado fora
   do Supabase. A
   migration é aplicada pelo conector do Supabase, com o arquivo e os tipos
   no mesmo commit.
5. Voltar atrás: `git revert` e `push` republicam a versão anterior.
   Migration não volta: corrige-se com outra.

### 12.8 Operação — quem cuida do servidor e o que fazer se cair

| Tema | Como é |
|---|---|
| Saber que caiu | Monitor de fora em `/api/versao`, a cada 5 minutos, avisando o Renato (OPS-2, ⬜). Hoje a equipe descobre ao tentar usar |
| Onde ver o que aconteceu | Easypanel → `app`: **Implantações** (montagem) e **Logs** (o app rodando) |
| O app caiu | 1. Easypanel → `app` → reiniciar. 2. Se não voltar, `git revert` do último commit e `push`. 3. Se a VPS inteira caiu, o painel da Hostinger. 4. Se o problema for a casca guardada nos navegadores, `SW_DESLIGAR=1` no Ambiente do Easypanel e implantar de novo |
| Certificado (HTTPS) | Let's Encrypt pelo Easypanel, renovado sozinho. Domínio novo: primeiro o DNS apontando para a VPS, depois o domínio no Easypanel com o resolvedor **escrito** `letsencrypt` (o cinza é só sugestão). Se o certificado não sair (o navegador avisa "conexão não particular"), Configurações → Geral → Traefik → Reiniciar — foi o que destravou o `app.duliconsulting.com` em 17/nov, depois de uma tentativa que falhou enquanto o DNS ainda apontava para a Vercel |
| Manutenção | Atualizar o Easypanel e o sistema da VPS, e limpar imagens antigas do Docker, uma vez por mês — Renato, com roteiro. Cópia da própria VPS (snapshot da Hostinger): a decidir |
| Acesso | Quem entra na Hostinger, no Easypanel, no Supabase e no GitHub, e com verificação em duas etapas (Q15) |
