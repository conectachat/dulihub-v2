# DuliHub 2 — especificação do produto

**O que o sistema precisa fazer, para quem, e como se sabe que está pronto.**

| Documento | Responde |
|---|---|
| `docs/spec.md` (este) | **O quê** e **para quem**: a jornada, os módulos, as regras, o critério de pronto |
| `docs/plano.md` | **Onde estamos** e **em que ordem**: estado atual, fases, decisões já tomadas |
| `AGENTS.md` | **Como** se constrói: segurança, testes, organização do código |

Toda funcionalidade nova começa aqui: entra (ou muda) a seção do módulo, com
critério de aceite, **antes** do plano de implementação. Decisão tomada no meio
de uma entrega volta para cá.

Escrita em 6/nov/2026, a partir do app novo como está, do `plano.md` e de um
inventário do app antigo (Lovable). Estado de cada requisito:
**✅ feito** · **🟡 parcial** · **⬜ falta**.

---

## 1. Problema

A Duli Consulting conduz processos de visto americano (EB-1A, EB-2 NIW, O-1 e
outros) do primeiro contato do lead até a decisão do USCIS. Hoje isso roda num
app feito no Lovable que:

- **guarda a mesma pessoa três vezes** (contato, lead, cliente), com tags,
  notas e arquivos duplicados e um serviço só para copiar entre eles;
- **tem funções pela metade** que a equipe acha que existem: contrato pelo
  ZapSign sem botão, conversão de lead em cliente sem tela, aviso de tarefa
  vencida que nunca roda, configurações que só mostram um aviso;
- **erra dinheiro**: parcela em dólar exibida como real, saldos guardados que
  divergem das parcelas, real somado com dólar;
- **depende de uma conta da Lovable** para banco e e-mail, que não é da Duli;
- **deixa qualquer usuário que não seja cliente ou parceiro ver tudo**, sem
  controle de papel na área administrativa.

O custo é retrabalho (redigitar a ficha no contrato, planilha paralela para
fechar o mês), risco (prazo de RFE perdido, dado de cliente exposto) e
dependência de um fornecedor que a Duli não controla.

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
| O1 | **Desligar o app antigo** | A equipe trabalha um dia inteiro só no novo; o antigo fica 30 dias intacto e ninguém precisa abri-lo | Não |
| O2 | **Fechar o mês sem planilha** | Um mês inteiro de entradas e saídas lançado e conferido no app | Não — falta a pagar e fluxo de caixa |
| O3 | **Dado digitado uma vez** | Do lead ao contrato assinado, nenhum dado do cliente é redigitado pela equipe | Em parte — a ficha já chega preenchida; o contrato ainda é montado à mão |
| O4 | **Nenhum prazo perdido sem aviso** | Todo prazo de RFE, parcela, pasta e etapa vencidos aparecem na Início antes de vencer ou no dia | Sim |
| O5 | **Nenhum dado fora da organização** | Suíte de RLS passando a cada mudança; zero acesso cruzado | Sim |

Metas numéricas (tempo do lead ao contrato, % de fichas preenchidas pelo
cliente) estão nas perguntas em aberto (§10): o app ainda não mede nada disso.

## 4. Fora do escopo

| Não faz | Por quê |
|---|---|
| Conversa de WhatsApp dentro do app | O antigo tentou e removeu. O app abre a conversa (`wa.me`); a conversa fica no WhatsApp |
| Contabilidade ou ERP | O financeiro é de caixa: o que entra, o que sai, o que vence. Balanço e impostos são do contador |
| Migrar o financeiro antigo | Decisão de 25/set: o que foi lançado no antigo termina lá |
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
| 3 | Proposta (visto, valor, condições) | Renato | Tela do lead: negócio | 🟡 valor e origem; sem visto de interesse nem condição de pagamento |
| 4 | O lead aceita → **ficha de cadastro** por link | Lead | `/cadastro/<token>` | ✅ |
| 5 | **Contrato** gerado com os dados da ficha e a forma de pagamento | Renato | Tela do lead | ⬜ |
| 6 | **Assinatura** (ZapSign) | Lead | Fora do app, volta por webhook | ⬜ |
| 7 | **Ganho**: o lead vira cliente | Automático na assinatura, ou Renato | Tela do lead | 🟡 manual |
| 8 | **Processo** criado a partir do tipo de visto | Renato | Perfil do cliente | ✅ |
| 9 | **Cobrança** e parcelas | Renato | Perfil do cliente › Financeiro | ✅ |
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
   faz cliente, e cliente não volta a ser lead.
3. **Negócio não é pessoa.** A mesma pessoa pode ter vários negócios ao longo do
   tempo.
4. **Molde e cópia.** O tipo de visto é o molde de etapas e pastas; o processo
   recebe uma cópia. Mudar o molde não mexe em processo em andamento.
5. **Cada registro pertence a uma organização**, herdada do registro-pai, e o
   banco recusa qualquer ligação entre organizações diferentes.
6. **Dinheiro em real e dólar, somado por moeda.** Conversão só com a cotação e
   a data em que o dinheiro entrou. Nenhum saldo guardado: tudo se soma das
   parcelas.
7. **Nada some sem aviso.** Exclusão diz o que vai junto; o que tem lixeira
   (contatos) pode ser restaurado.
8. **Falha não vira vazio.** Se uma leitura falha, a tela diz que falhou — não
   mostra "nenhum item" nem "tudo em dia".
9. **Funciona sem internet**, igual a com internet, nas telas já migradas;
   as outras dizem que precisam de rede.
10. **Em português**, no celular e no computador, com o mesmo recurso nos dois.

---

## 7. Módulos

Cada módulo: para que serve, requisitos por prioridade (**P0** não vai para a
virada sem; **P1** logo depois; **P2** não agora, mas o desenho não pode
impedir) e o estado. Critério de aceite detalhado só para o que falta — o que
está feito tem teste.

### 7.1 Início

Dizer o que precisa de atenção hoje.

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| INI-1 | Prazo de RFE: 30 dias antes, vermelho nos últimos 7; some quando a resposta é enviada | P0 | ✅ |
| INI-2 | Parcelas vencidas, total por moeda e por cliente | P0 | ✅ |
| INI-3 | Pastas e etapas com prazo vencido | P0 | ✅ |
| INI-4 | Fichas de cadastro recebidas e não conferidas | P0 | ✅ |
| INI-5 | Tarefas minhas, de hoje e atrasadas | P0 | ⬜ (depende de 7.9) |
| INI-6 | Contas a pagar da semana | P1 | ⬜ (depende de 7.8) |
| INI-7 | Números do mês: negócios ganhos, entradas, saídas | P2 | ⬜ |

### 7.2 Contatos

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CON-1 | Lista, busca, filtro por tag, criar, editar | P0 | ✅ |
| CON-2 | Excluir com lixeira e restaurar | P0 | ✅ |
| CON-3 | Ficha enxuta para quem não é cliente; completa para cliente (ou para quem já tem processo/cobrança) | P0 | ✅ |
| CON-4 | Aviso de contato duplicado (mesmo e-mail ou telefone) ao criar | P1 | ⬜ (o antigo tem) |
| CON-5 | Histórico: notas, ligações, reuniões, movimentos do funil, ficha recebida | P0 | ✅ |

### 7.3 CRM — funil e tela do lead

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CRM-1 | Quadro do funil, cartões arrastáveis, seletor de etapa no celular | P0 | ✅ |
| CRM-2 | Tela do lead: trilha das etapas, contato, negócio, ficha, histórico | P0 | ✅ |
| CRM-3 | Ganho com confirmação; Perdido com motivo; reabrir | P0 | ✅ |
| CRM-4 | Etapas do funil configuráveis | P0 | ✅ |
| CRM-5 | **Etapas automáticas**: ficha enviada, ficha recebida, contrato enviado — o negócio anda sozinho quando o fato acontece | P1 | ⬜ |
| CRM-6 | Visto de interesse no negócio (escolhido dos tipos de visto) | P1 | ⬜ |
| CRM-7 | Mais de um funil | P2 | ⬜ (o banco já suporta) |
| CRM-8 | Dias na etapa e previsão de fechamento | P2 | ⬜ (oferecido em 3/out, não escolhido) |
| CRM-9 | Entrada automática de lead (agendamento, Calendly, formulário do site) | P1 | ⬜ — ver 7.12 |

### 7.4 Ficha de cadastro (lead, sem login)

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| FIC-1 | Link de uso único, 15 dias, um aberto por contato | P0 | ✅ |
| FIC-2 | Campos do PDF: dados pessoais, documentos, endereço, dependentes; CPF conferido | P0 | ✅ |
| FIC-3 | Ao enviar, atualiza o contato, guarda o declarado e o anterior, avisa na Início | P0 | ✅ |
| FIC-4 | Enviar pelo WhatsApp com a mensagem pronta | P0 | ✅ |
| FIC-5 | Rascunho: o lead pode parar e voltar sem perder o que digitou | P1 | ⬜ (o antigo tem) |
| FIC-6 | Endereço preenchido pelo CEP | P2 | ⬜ |

### 7.5 Contrato e assinatura — **próximo**

Gerar o contrato a partir da ficha e da forma de pagamento, mandar para
assinatura e trazer o resultado de volta.

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CTR-1 | Na tela do lead, **Gerar contrato**: o modelo da Duli preenchido com os dados da ficha (nome, CPF, RG, estado civil, nacionalidade, endereço) | P0 | ⬜ |
| CTR-2 | Forma de pagamento escolhida na hora (valor, moeda, entrada, nº de parcelas, vencimentos), e a mesma condição vira a cobrança depois do Ganho — sem redigitar | P0 | ⬜ |
| CTR-3 | Enviar ao ZapSign; o negócio passa a "contrato enviado" | P0 | ⬜ |
| CTR-4 | Assinado → o PDF assinado fica no lead/cliente, o histórico registra, e o Ganho é **oferecido** | P0 | ⬜ |
| CTR-5 | Recusado ou expirado → avisa na Início, o negócio continua no funil | P1 | ⬜ |
| CTR-6 | Mais de um modelo de contrato (por tipo de visto) | P2 | ⬜ |

Critério de aceite (CTR-1 a CTR-4):

- Dado um lead com a ficha **conferida**, quando o Renato clica Gerar contrato
  e escolhe a forma de pagamento, então vê a prévia com os dados certos antes
  de enviar.
- Sem ficha conferida, o botão explica o que falta e não gera nada.
- Assinado pelo cliente, em até alguns minutos o lead mostra "contrato
  assinado", com o PDF, sem ninguém atualizar nada à mão.
- Nenhum dado de cliente é digitado pela equipe entre a ficha e o contrato.

Dúvidas que bloqueiam este módulo estão em §10 (Q1–Q4).

### 7.6 Processos

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| PRO-1 | Criar processo do tipo de visto: etapas e pastas copiadas | P0 | ✅ |
| PRO-2 | Etapas com status, data prevista e de conclusão, sub-etapas; progresso em % | P0 | ✅ |
| PRO-3 | Documentos: pastas, envio, ver, aprovar, recusar com motivo, resolver | P0 | ✅ |
| PRO-4 | Observações em editor colaborativo | P0 | ✅ |
| PRO-5 | Campos do USCIS: recibo, priority date, RFE recebida, prazo, resposta enviada, decisão | P0 | ✅ |
| PRO-6 | Busca e filtro na lista de processos | P1 | ⬜ |
| PRO-7 | Responsável por etapa | P1 | ⬜ |
| PRO-8 | Lista de evidências (documento do caso) | P1 | ⬜ (o antigo tem; também recebe do n8n) |
| PRO-9 | Fila única de documentos esperando revisão, de todos os processos | P1 | ⬜ (vira P0 com o portal) |
| PRO-10 | Etapa-mãe concluída sozinha quando todas as filhas concluem | P2 | ⬜ (o antigo faz) |
| PRO-11 | Link do Google Drive do caso | P2 | ⬜ |

### 7.7 Financeiro — a receber

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| REC-1 | Cobrança por cliente, em real ou dólar, com desconto | P0 | ✅ |
| REC-2 | Parcelas geradas sem perder centavo; baixa com data e cotação | P0 | ✅ |
| REC-3 | Lista com filtros (vencidas, a vencer, pagas) e números do mês | P0 | ✅ |
| REC-4 | Funciona sem internet | P0 | ✅ |
| REC-5 | Anexar boleto e nota fiscal à parcela | P1 | ⬜ (o antigo anexa arquivo) |
| REC-6 | Cobrança criada a partir do contrato assinado (CTR-2) | P0 | ⬜ |
| REC-7 | Boleto do Itaú e link do C6 emitidos pelo app | P2 | ⬜ — depende das credenciais |
| REC-8 | Nota fiscal emitida pelo app | P2 | ⬜ — depende do provedor |
| REC-9 | Cotação do dólar sugerida automaticamente | P2 | ⬜ (o antigo busca no Banco Central) |

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
| TAR-4 | Aviso de tarefa vencendo (no app; e-mail opcional) | P1 | ⬜ — no antigo existe e nunca roda |
| TAR-5 | Visão em calendário | P2 | ⬜ |

### 7.10 Usuários, permissões e notificações

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| USU-1 | Convidar membro da equipe, escolher papel (`admin`, `staff`), desativar | P0 | ⬜ |
| USU-2 | Configuração só para `owner`/`admin`; `staff` lê | P0 | ✅ |
| USU-3 | Trocar e redefinir a própria senha ("esqueci minha senha") | P0 | ⬜ (hoje só entrar e sair; a virada exige redefinir 25 senhas) |
| USU-4 | Central de notificações: ficha recebida, contrato assinado, documento enviado pelo cliente, tarefa vencendo | P1 | ⬜ |
| USU-5 | Registro de quem mudou papel de quem | P2 | ⬜ |

### 7.11 Configurações

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| CFG-1 | Etapas do funil, tags, catálogo de pastas, tipos de visto, status de etapa | P0 | ✅ (offline) |
| CFG-2 | Tipos e prioridades de tarefa | P0 | ⬜ (com 7.9) |
| CFG-3 | Métodos de pagamento | P1 | ⬜ |
| CFG-4 | Dados da empresa (razão social, CNPJ, endereço — vão para o contrato) | P0 | ⬜ (com 7.5) |
| CFG-5 | Integrações (ZapSign, Calendly, e-mail) | P1 | ⬜ |

### 7.12 Integrações e automações

Decidir, uma por uma, o que vem do antigo (§10, Q5).

| Do antigo | O que faz lá | Proposta | Pri. |
|---|---|---|---|
| ZapSign | Backend pronto, sem botão | Entra em 7.5 | P0 |
| Calendly | Cria lead e tarefa quando alguém agenda | Trazer | P1 |
| Agendamento próprio + Google Meet | Página pública de horários | Decidir: Calendly **ou** próprio, não os dois | P1 |
| Caixa de e-mail compartilhada (Gmail) | Ler e responder dentro do app, pelo gateway da Lovable | Decidir se vale; se sim, sem a Lovable | P2 |
| n8n (saída) | Avisa eventos (lead criado, documento aprovado…) | Trazer os eventos que algum fluxo de fato usa | P1 |
| API para o n8n (entrada) | Atualiza etapa e lista de evidências | Trazer com PRO-8 | P1 |

### 7.13 Funcionar sem internet

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| OFF-1 | Instalável no celular e no computador | P0 | ✅ |
| OFF-2 | Configuração e Financeiro abrem e gravam sem internet e sincronizam sozinhos | P0 | ✅ |
| OFF-3 | Contatos, CRM e Processos sem internet | P2 | ⬜ (despriorizado em 25/set) |
| OFF-4 | Arquivos de um processo disponíveis offline, por escolha | P2 | ⬜ |

### 7.14 Portal do cliente — Fase 6

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| POR-1 | O cliente recebe acesso no Ganho (convite, troca de senha no primeiro acesso) | P0 da fase | ⬜ |
| POR-2 | Vê seus processos: etapas e progresso, sem as observações internas | P0 da fase | ⬜ |
| POR-3 | Envia documentos para as pastas; vê aprovado/recusado com o motivo | P0 da fase | ⬜ |
| POR-4 | Vê suas parcelas | P1 da fase | ⬜ |
| POR-5 | A equipe pode "ver como o cliente" | P1 da fase | ⬜ |
| POR-6 | Checklist de onboarding (o antigo tem) | ? | ⬜ — §10, Q7 |

Já preparado: o banco deixa o cliente ler o que é dele e congela o que ele não
pode mudar (CPF, RG, vínculo).

### 7.15 Portal do parceiro — Fase 7

| ID | Requisito | Pri. | Estado |
|---|---|---|---|
| PAR-1 | Parceiro vê só os clientes dele e o andamento | P0 da fase | 🟡 (isolamento pronto no banco; sem tela) |
| PAR-2 | Cliente do parceiro vê a marca do parceiro | P0 da fase | ⬜ |
| PAR-3 | Financeiro em dois lados: o que o parceiro cobra do cliente (dele) e o que a Duli cobra do parceiro (da Duli) | P0 da fase | ⬜ |

---

## 8. Requisitos não funcionais

| Tema | Requisito |
|---|---|
| Segurança | Isolamento por organização garantido no banco e provado por teste a cada mudança. Uma única porta sem login (a ficha), por token de uso único |
| Dados pessoais (LGPD) | CPF, RG, passaporte e documentos só para quem precisa; aceite do lead guardado com o texto aceito; arquivos em armazenamento privado com link temporário |
| Disponibilidade | Falha de leitura aparece como falha; nunca como lista vazia ou "tudo em dia" |
| Celular | Toda tela funciona no celular, inclusive o que no computador se faz arrastando |
| Desempenho | Telas abrem em até ~2 s com os dados atuais (76 contatos, dezenas de processos) |
| Custo | Plano gratuito do Supabase e da Vercel enquanto couber; arquivos de cliente não são copiados para todo aparelho |
| Dono dos dados | Banco, domínio e contas em nome da Duli — nada que dependa de conta de terceiro |

## 9. Virada — o que precisa existir para desligar o app antigo

O app antigo só é desligado quando a equipe não precisa dele para nada que faz
hoje (O1).

| Precisa estar pronto | Módulo |
|---|---|
| Tudo marcado ✅ acima | — |
| Contrato e assinatura | 7.5 |
| A pagar, despesas e fluxo de caixa | 7.8 |
| Tarefas | 7.9 |
| Convidar e gerenciar usuários | 7.10 |
| As integrações que a equipe usa no dia a dia (§10, Q5) | 7.12 |
| Dados finais migrados; domínio `login.duliconsulting.com` apontando para o novo; senhas redefinidas | Fase 5 |

Do antigo que **não** volta, salvo decisão em contrário: módulo de contratos
vazio (`/contracts`), página estática de documentação de processos, telas de
configuração que não gravavam nada, os três cadastros duplicados de pessoa.

## 10. Perguntas em aberto

| # | Pergunta | Quem responde | Bloqueia |
|---|---|---|---|
| Q1 | O modelo do contrato: quais campos variam além dos dados do cliente e da forma de pagamento? (visto, valor por extenso, foro, testemunhas…) | Renato | 7.5 |
| Q2 | O contrato é um modelo dentro do ZapSign ou um documento nosso que o app gera em PDF? | Renato + engenharia | 7.5 |
| Q3 | Assinado o contrato, o Ganho deve ser **automático** ou só **oferecido**? | Renato | 7.5 |
| Q4 | Quem mais assina além do cliente (Duli, testemunhas, cônjuge)? | Renato | 7.5 |
| Q5 | Das integrações do antigo (Calendly, agendamento próprio, e-mail, n8n, API), quais a equipe usa de verdade hoje? | Renato | 7.12, virada |
| Q6 | A ficha do antigo tem uma etapa "financeiro". O que ela pede, e precisa voltar? | Renato | 7.4 |
| Q7 | O onboarding em etapas do portal antigo é usado pelos clientes, ou as pastas do processo bastam? | Renato | 7.14 |
| Q8 | Quantas pessoas da equipe usam o app, e com que papel? | Renato | 7.10 |
| Q9 | Metas: em quanto tempo, do "sim" do lead ao contrato assinado, queremos chegar? Hoje leva quanto? | Renato | §3 |
| Q10 | Provedor de nota fiscal; como faturar em dólar (NFS-e ou invoice) | Renato + contador | REC-8 |
| Q11 | Credenciais do Itaú e do C6 | Renato | REC-7 |

## 11. Ordem proposta

A ordem fina mora no `plano.md`; esta é a sugestão que sai da spec, pelo
caminho até a virada:

1. **Contrato e assinatura (7.5)**: fecha a jornada do lead e alimenta a
   cobrança. Depende de Q1–Q4.
2. **A pagar e fluxo de caixa (7.8)**: portão O2.
3. **Tarefas (7.9)** com tipos e prioridades.
4. **Usuários (7.10)** e as integrações escolhidas em Q5.
5. **Virada (§9).**
6. Portal do cliente, depois portal do parceiro.
