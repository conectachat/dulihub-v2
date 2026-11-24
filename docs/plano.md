# DuliHub 2 — plano

App interno da Duli Consulting, reconstruído do zero para substituir o app feito
no Lovable. O antigo segue em produção até a Fase 5.

Este documento diz **onde estamos, o que vem, e por que as coisas são como são**.
O histórico de como se chegou aqui está no `git log`, que guarda isso melhor.
Convenções de código ficam no `AGENTS.md`. **O que o produto deve fazer** — a
jornada, os módulos, os critérios de aceite e as perguntas em aberto — fica
no `docs/spec.md`, que vem antes de qualquer funcionalidade nova.

---

## 1. Estado atual (3/out/2026; hospedagem em 16/nov; Clientes em 19/nov; Ganho com resumo em 20/nov; forma de pagamento pelo link em 23/nov; parceiros e clientes de parceiro em 24/nov)

### No ar

`https://app.duliconsulting.com` — numa VPS da Hostinger, pelo Easypanel, desde
16/nov (antes, Vercel). Publica sozinho a cada push no `main`. Como as partes
se encaixam: `docs/spec.md` §12.

| Tela | O que faz |
|---|---|
| Início | **O que precisa de atenção hoje**: prazo de RFE (30 dias antes, vermelho nos últimos 7), fichas de cadastro recebidas e ainda não conferidas, parcelas vencidas, pastas e etapas atrasadas, forma de pagamento recusada pelo cliente, pronta para o contrato ou com o link da ficha vencido sem resposta — cada um leva ao lugar certo. Depois, as contagens |
| Contatos | Lista, busca, filtro por tag, criar, editar, excluir e restaurar (lixeira) |
| Ficha do contato | Perfil enxuto de quem ainda não é cliente: dados, tags, oportunidades, linha do tempo; **Dados cadastrais** (o que vai para o contrato: CPF, RG, estado civil, endereço, dependentes) e o **link da ficha** para o cliente preencher. "Marcar como cliente" para a gestão. Cliente abre em `/clientes/<id>` (o endereço antigo redireciona) |
| Clientes | **Lista** com busca por nome, e-mail ou telefone, 50 por página com o total. **Perfil em abas**: Dados cadastrais, Financeiro (totais por moeda, cobranças, baixa, anexos da parcela), Projetos, Documentos (passaporte, identidade, comprovante, contrato) e Notas; cabeçalho com copiar telefone e e-mail, dono, cliente desde, tags e Editar (dono e participantes). **Novo cliente**, para a gestão: o cliente antigo que não passou pelo funil, escolhido entre os contatos ou criado ali mesmo, abre já em Projetos para criar o processo. **Novo cliente › Parceiro**: escolhe o parceiro e digita só o nome; o cliente de parceiro mostra o contato do parceiro com "via ‹parceiro›" (no perfil, na lista, em Contatos e no Financeiro), não tem link da ficha nem entra no funil, e é cobrado à mão no perfil |
| Ficha de cadastro (pública) | `/cadastro/<token>`: o cliente preenche no celular, **sem login**; ao enviar, a ficha do contato se atualiza e o link morre. **Com a forma de pagamento** (4b): depois dos dados, o cliente vê a forma — os vistos, cada parte com o método, o valor (com o dólar de onde veio a parte em reais) e as datas, nunca a cotação — e responde **Confirmo** ou **Há algo errado**; o link vale 3 dias úteis |
| CRM | Quadro do funil, com **cartões que se arrastam** entre as colunas (o seletor de etapa continua, para o celular) e o total de cada coluna por moeda; soltar em Ganho abre o **resumo**, e o cartão ganho leva aos processos; ganhos e perdidos ficam no quadro 30 dias e depois em **CRM › Encerradas** (busca por título ou contato); cada cartão mostra em que pé está a ficha de cadastro |
| Lead (`/crm/[id]`) | O negócio enquanto está no funil: trilha das etapas, **Ganho com resumo** (numa gravação só: cliente, dono, participantes e um processo por visto), **Reabrir** um ganho e **Perdido** (com motivo); contato, **Vistos** (valor e moeda de cada um, total por moeda), origem, dono e participantes, dados cadastrais com o link da ficha, histórico. Sem processos e sem financeiro. No negócio ganho, a gestão **ajusta a data do ganho** (o cliente antigo ganho agora conta no mês certo). **Forma de pagamento**: definir, **Enviar ficha** com a prévia do que o cliente vai ver, o link da ficha com Copiar e WhatsApp, Editar e Cancelar link, Ajustar depois da recusa, Confirmar pela equipe e Refazer |
| Projetos | Lista de processos: cliente, visto, status, progresso (etapas concluídas, em %), próximo prazo |
| Processo | Status e campos do USCIS, inclusive quando a resposta da RFE foi enviada; abas **Etapas** (tabela com status, data prevista e de conclusão, sub-etapas em grupo), **Documentos** (pastas, envio, visualizar, aprovar, recusar com motivo, resolver) e **Observações** (editor estilo Notion, várias pessoas ao mesmo tempo) |
| Configurações | Etapas do funil, tags, catálogo de pastas, tipos de visto, status de etapa e **Parceiros** (nome, país, documento fiscal, endereço, e-mail e telefone — os dados da invoice; só o dono da Duli cadastra) — **abre e grava sem internet**, e sincroniza sozinha |
| Sincronização | O que este aparelho gravou e o servidor ainda não recebeu; o que ele recusou, com o motivo |
| Financeiro | **A receber**: cobrança por cliente, parcelas com vencimento, baixa (em dólar, a cotação é opcional: o dinheiro pode ficar em dólar e ser convertido depois), mudar o vencimento combinado com o cliente (fica no histórico), e o que venceu. Abre e grava sem internet |

### Dados

| | |
|---|---|
| Contatos | 76, importados do app antigo sem duplicata |
| Organizações | Duli (raiz) e "Parceiro de Teste" (só para a suíte de testes) |
| Banco | Supabase `xigmtofpmfqeehhcdasf`, migrations `0001` a `0066` em `supabase/migrations/` |
| Arquivos | Buckets privados `documentos` (pastas do processo) e `observacoes` (colados no editor), 20 MB |
| No aparelho | Cópia das tabelas de configuração e do que ela usa, por usuário (IndexedDB), mais a fila do que ainda não subiu |

### Rede de proteção

Tudo roda sozinho em cada push.

| Camada | O que pega |
|---|---|
| Trava de commit (`.githooks/pre-commit`) | Erro de tipo e de lint — o commit nem acontece |
| 1043 testes de unidade e componente | Regras, formatação, telas de etapas e documentos, sincronização em tempo real, editor montado sobre Supabase falso, fila de gravações offline, as contas do a receber — arredondamento de parcela, vencimento que não pula de mês, conversão que exige cotação — e a ficha de cadastro: CPF conferido pelos dígitos, erro apontado no campo, recusa que não apaga o que foi digitado |
| 353 testes de RLS | Uma organização não enxerga nem altera dado da outra — tabelas, arquivos e o canal em tempo real; regras de negócio no banco (pasta só resolve com tudo aprovado, processo só se liga a negócio do mesmo contato); e que a fila, ao subir, passa pela mesma RLS; cobrança e parcela isoladas por organização; e a porta do anônimo: sem token não lê nada, com token altera só uma pessoa, só os campos da ficha, uma vez |
| 56 testes de fumaça | Cada tela abre com login de verdade, inclusive com um processo real; a Início e o quadro do CRM carregam sem falhar — o 200 sozinho não provaria, porque a falha aparece como aviso dentro da página; e a ficha de cadastro abre **sem** login pelo link, e dá 404 sem ele |

---

## 2. Fase 2, Processos — pronta para uso

Entregue entre 18 e 19/set: criar processo a partir do tipo de visto (etapas e
pastas copiadas numa transação), acompanhar etapas, revisar documentos e
anotar em conjunto.

Decisões da fase:

| Pergunta | Resposta |
|---|---|
| Documentos são do processo ou da etapa? | Do processo inteiro |
| Mudar o molde afeta processo em andamento? | Não — nada muda sozinho |
| Quem sobe arquivo agora? | Só a equipe. O cliente ganha a porta na Fase 6 |
| Arquivo enviado entra como? | Em análise. Aprovado ou recusado com motivo (mín. 10 letras), que o cliente vai ler |
| Quando a pasta conta como resolvida? | Quando o Renato marca — e **só com todos os arquivos aprovados**. Arquivo novo ou recusado depois reabre a pasta |
| Barra de progresso mede o quê? | **Etapas concluídas ÷ todas as etapas** (principal e sub-etapa valem 1 cada, como no app antigo), arredondando para baixo. Mudou em 3/out: antes media pastas obrigatórias resolvidas, sem rótulo, e quem concluía etapa via a barra parada. As pastas resolvidas seguem contadas na aba Documentos |
| Etapa: data prevista | Nasce vazia; conclusão automática ao concluir, e corrigível |
| Observações | Plate (grátis, a cara do app) + sincronização própria pelo Supabase — o texto não sai do banco da Duli |

Falta, se o Renato pedir: aba **Lista de Evidências** (mesmo editor das
Observações, rápido) e **Tarefas** (prevista para a Fase 4). Na Observações,
ficaram de fora IA, comentários em trechos e sub-páginas.

---

## 2b. Fase 2.5, app instalável e offline — Configuração pronta

Pedido do Renato em 21/set, com a frase que rege a fase: *"o app deve
funcionar 100% quando estiver offline, e ao conectar fazer a sincronização.
Offline funciona 100% igual online."* Não é um subconjunto — é paridade.

### O que já funciona sem internet

| | |
|---|---|
| Instalar | O app entra na tela de início do celular e no menu do computador, com ícone e janela próprios. No iPhone, instalar é o que impede o sistema de apagar os dados guardados depois de 7 dias sem uso |
| Abrir | A Configuração abre sem rede, com os dados do aparelho, e navega entre as seções |
| Gravar | As cinco seções da Configuração gravam offline: criar, renomear, reordenar, excluir, marcar |
| Subir | Ao voltar a internet, o que foi gravado sobe sozinho, na ordem em que foi feito |
| Ver o estado | "Sincronizado às 14:32" na barra lateral, que envelhece à vista; quantas alterações estão para subir; e a linha marcada "Só neste aparelho" até o servidor confirmar |
| Recusa | O que o servidor não aceitar fica visível, com o motivo, em Configuração › Sincronização. Nada é desfeito sozinho |
| Sair | Apaga a cópia e a fila deste aparelho, depois de avisar o que ainda não subiu. Entrar com outra conta apaga o que ficou da anterior |
| Aparelho parado | Recusa gravar após 7 dias sem sincronizar, e recusa mostrar após 14 — cópia velha exibida como atual é o defeito que esta fase persegue |

Sem Electron: a PWA dá janela e ícone próprios sem um segundo pacote para
manter. O app antigo tinha os dois.

### Decisões da fase

| Pergunta | Resposta |
|---|---|
| Quem guarda o dado no aparelho | Dexie (IndexedDB) e sincronização escrita por nós. PowerSync e ElectricSQL foram descartados: põem a regra de quem-vê-o-quê fora do Postgres, e a RLS é a segurança real |
| O que o aparelho guarda | Cópia do que o servidor **devolveu àquele login** — nada além. Se a policy esconde, o espelho não recebe |
| Onde fica o que ainda não subiu | Numa fila separada, **fora** do espelho. Espelho é só cópia do servidor; misturar faria a conferência de contagens apagar o que a pessoa acabou de criar |
| Servidor recusa algo feito offline | **Guardar e perguntar.** Continua visível e marcado, com motivo, e quem decide é o Renato |
| Sair com gravação pendente | Avisa e segura. Sair mesmo assim exige confirmar a perda |
| Arquivos offline | Por processo, quando o Renato pedir. Tráfego do plano gratuito, e passaporte não fica em todo celular |
| Aparelho parado | Recusa gravar depois de 7 dias sem sincronizar, e mostrar depois de 14 |

### O que ainda não funciona offline

Primeiro login num aparelho novo; renovar sessão depois de muito tempo; abrir
arquivo que ainda não foi baixado; ver quem está junto nas Observações; e as
telas que ainda não migraram — Contatos, CRM e Processos, que offline não
abrem. A tela "Sem conexão" lista o que já funciona e leva até lá.

### O que vem

Contatos e CRM, depois Processos e arquivos por processo; a fila de
notificações ao cliente, que hoje não existe; e o Financeiro, que já nasce
assim.

---

## 2c. Fase 3, Financeiro — a receber está pronto

Renato parou a expansão do offline em 25/set: o que desliga o app do Lovable é
Financeiro → Tarefas → virada, e offline é qualidade do app novo, não etapa
da substituição. O Financeiro nasceu já lendo e gravando do aparelho, porque
com o motor pronto isso custa quase o mesmo.

### Decisões da fase

| Pergunta | Resposta |
|---|---|
| A cobrança mora onde | **No cliente**, não no processo. O `project_id` fica anulável, só para dizer de onde veio |
| Fechamento do mês | **Um número em real**, com a cotação **da data do pagamento** guardada na parcela |
| Primeiro corte | A receber: valor, parcelas, vencimento, baixa e atraso |
| Dados do app antigo | Não migrar. O que está lançado termina lá |

### O que o app antigo ensinou a não repetir

Seis defeitos observados no código dele, cada um virou uma decisão:

1. Parcela sem moeda, e a tela formatando R$ fixo — um caso em dólar aparecia
   rotulado como real. Aqui a moeda é da cobrança, e a tela nunca escolhe
   símbolo sozinha.
2. Cotação no cabeçalho: o histórico inteiro mudava quando o dólar mudava.
   Agora ela fica na parcela paga.
3. Saldos mantidos por gatilho (`valor_pago`, `valor_pendente`), que divergiam
   das parcelas. Aqui não há saldo guardado: soma-se das parcelas.
4. Duas contas de receita que nunca batiam. Uma só, por regime de caixa.
5. "Vencido" calculado em dois lugares, de dois jeitos. Uma função pura.
6. Soma de real com dólar sem converter no resumo do cliente.

### O que falta para fechar a fase

Contas a pagar, despesas, fornecedores e fluxo de caixa. Depois: contrato no
ZapSign e nota fiscal (esta depende do provedor).

Boleto do Itaú e link do C6 **saíram do roadmap** em 23/nov: as credenciais
não vêm tão cedo. O boleto sobe à mão na parcela e a baixa é à mão. O Renato
retoma o tema se um dia conseguir as credenciais.

### Ficha de cadastro por link (3/out) — o primeiro passo do contrato

O Renato mandava a ficha em PDF pelo WhatsApp e redigitava a resposta para
montar o contrato. Agora: no contato (ou pelo cartão do CRM), **Gerar link da
ficha**; o cliente preenche no celular, sem login; a ficha do contato se
atualiza, a Início avisa, e o Renato clica "Conferi".

| Pergunta | Resposta |
|---|---|
| Campos | Os do PDF, campo por campo. As colunas já existiam em `people` desde a 0001; só os dependentes ganharam tabela |
| CPF e RG | Obrigatórios para o cliente; CPF conferido pelos dígitos |
| O link | Uso único, 15 dias, um em aberto por contato — gerar outro cancela o anterior |
| O que a resposta faz | Atualiza o contato direto. O declarado e o que havia antes ficam guardados no link |
| Correção depois | A equipe edita na ficha, ou gera outro link |

É a primeira porta do app para quem não tem login; o desenho e a exceção à
regra do `security definer` estão na migration 0035 e no `AGENTS.md`.

### Lead não é cliente (3/out)

O cartão do CRM abria a ficha do contato, com processos e financeiro, "como se
já fosse cliente". Agora o lead tem tela própria, e o perfil completo chega
com o Ganho.

| Pergunta | Resposta |
|---|---|
| O que é o Ganho | O contrato assinado. O contato vira cliente, e **cliente não volta a ser lead** — reabrir o negócio não rebaixa ninguém |
| Depois de clicar Ganho | Vai para a aba Projetos do perfil de cliente, sem abrir nada; o histórico ganha "Oportunidade ganha — virou cliente" |
| Perdido | Pede o motivo (lista curta + detalhe); fica no negócio e no histórico. Reabrir apaga |
| Quem vê Processos e Financeiro | Só o perfil de cliente (`/clientes/<id>`, entrega 2). Quem tinha processo ou cobrança sem ser cliente virou cliente na 0045 (2 contatos), e daí em diante criar um ou outro promove a pessoa |
| Arrastar | Só no quadro do CRM, com o HTML nativo. O seletor de etapa fica, porque arrastar não funciona no toque nem no teclado. Soltar em Ganho ou Perdido abre a mesma pergunta do botão |

Fica com o Renato, e não é código:

- **O funil da Duli só tem Novo Lead, Ganho e Perdido.** As etapas do meio
  (reunião, proposta, ficha enviada, contrato enviado) se criam em
  Configurações › Etapas do funil; a trilha da tela do lead as mostra sozinha.
- **50 contatos estão marcados "oportunidade" sem cartão no quadro** — vieram
  assim da importação. Criar negócio para eles é decisão dele.

Não entraram, e foram oferecidos: dias na etapa, previsão de fechamento, e as
abas Tarefas, Produtos e Arquivos dos prints de referência.

**Próximo passo, fora deste corte:** gerar o contrato com esses dados e mandar
ao ZapSign. Os dados estão em `people`, `person_dependents` e em
`registration_forms.answers`. Também de fora: preencher endereço pelo CEP e
avisar por e-mail quando a ficha chega.

### Fluxo contato → oportunidade → cliente: entregas 0 e 1 (18/nov)

Spec: `docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md`;
plano: `docs/superpowers/plans/2026-11-17-entregas-0-e-1-contato.md`.

| Entrega | O que ficou pronto |
|---|---|
| 0 — casa em ordem | 0037 (contato não nasce atribuído a outra organização) e 0038 (negócio nasce aberto) aplicadas, depois da cópia do banco de 17/nov; 0039 (18/nov) liga a conta `teste-staff` como staff da organização de teste, para as entregas 3 e 4 provarem o que um membro comum de parceiro não pode |
| 1 — contato completo e sem duplicata | Nome, telefone (com DDI) e e-mail obrigatórios em todo caminho da equipe (CON-8); aviso de contato já cadastrado, com link e "É a mesma pessoa?" (CON-4); nova oportunidade com contato existente ou novo numa gravação só (CRM-11, 0041) e aviso de oportunidade anterior (CRM-12). A 0040 corrigiu os 76 DDIs gravados sem "+" |

Os 4 contatos antigos sem e-mail e os 4 sem telefone só cobram os campos
quando alguém os edita. Próximas: entrega 2 (Clientes) e 3 (vistos e Ganho),
cada uma com o seu plano.

Revisão de código independente das entregas 0 e 1 (18/nov, 4ª rodada): nada
crítico. Corrigidos o diálogo sem rolagem no celular, a edição pela lista de
`/contatos` que apagava Empresa e Cargo (defeito de setembro), a chave de
serviço sem permissão nas auxiliares do contato e o telefone antigo sem DDI
com o 55 colado (0043), mais testes que faltavam e dois detalhes do aviso.
A importação (`migration/import-people.mjs`) grava o DDI como "+NN" desde a
entrega 2.

### Entrega 2 — Clientes (19/nov)

Plano: `docs/superpowers/plans/2026-11-18-entrega-2-clientes.md` (CLI-1 a
CLI-14). Banco no push 1 (0044–0048, CI verde em 19/nov); telas no push 2,
junto com a 0049.

| Parte | O que ficou pronto |
|---|---|
| Banco | Dono e participantes (0044); cliente não volta a lead, "cliente desde", quem tem processo ou cobrança é cliente — fora do Ganho só a gestão — e `marcar_como_cliente` (0045); notas e histórico só para a equipe (0046); documentos do cliente no depósito `pessoas` (0047); anexos da parcela no depósito `financeiro`, sem arquivo órfão (0048); `buscar_clientes` (0049; 0050 tira da busca por dígitos quem não tem telefone) |
| Dados | 2 contatos com processo viraram clientes (30 no total, 29 na Duli); todo cliente com dono (o `owner` mais antigo da organização); 6 com "cliente desde" (os outros 24 não têm processo nem cobrança) |
| Telas | Item Clientes no menu; lista com busca e total; perfil em abas; Editar com dono, cliente desde e participantes; "Marcar como cliente" no perfil enxuto, só para a gestão; links do app inteiro levam ao perfil certo (`enderecoDaPessoa`) |
| Importação | Não rebaixa cliente e grava o DDI como "+NN" |

Decisões que valeram até a entrega 3 (detalhe no plano), já fechadas:

- ~~Promover por `update` direto pela API aberto a qualquer membro (D1)~~ — a
  0054 trouxe a regra: só o Ganho (marca `via_ganho`) ou a gestão.
- ~~Dono e participantes da oportunidade sem tela~~ — a tela e a herança no
  Ganho vieram na entrega 3.
- **Clientes lê do servidor** e **anexos vão direto do navegador**: as duas
  exceções estão no `AGENTS.md`.

Os pushes 1 e 2 não chegaram ao ar no mesmo dia: a montagem da VPS quebrava num
teste de `src/` que importava `migration/`, pasta que o Docker não recebe (o CI,
com o repositório inteiro, passava). Corrigido em 19/nov, com um teste que barra
a repetição; a regra está no `AGENTS.md` ("A VPS não monta o repositório inteiro").

### Entrega 3 — vistos na oportunidade e Ganho com resumo (19 e 20/nov)

Plano: `docs/superpowers/plans/2026-11-19-entrega-3-vistos-e-ganho.md` (CRM-10,
CRM-13 a CRM-16, PRO-12). Duas fases: a 1 (0051–0053 e as telas) vai no push 1;
a 2 (0054) só depois que `/api/versao` mostrar o push 1 no ar. A cópia do banco
por migration foi dispensada pelo Renato em 19/nov.

| Parte | O que ficou pronto |
|---|---|
| Banco | Vistos do negócio (`opportunity_items`), processo ligado ao visto de onde nasceu e que não se apaga (0051); `ganhar_negocio` e `reabrir_negocio`, numa transação, com o CRM-10 conferido (0052); `buscar_encerradas` (0053) |
| Banco, fase 2 (0054, 20/nov) | Ganho e reabrir **só pelas funções** (o `update` direto é recusado, também para a gestão); negócio ganho não se apaga; só o Ganho ou a gestão tornam cliente, no update e no insert; item com processo não se apaga; dono do negócio preso à equipe; saíram `value`, `currency`, `products` e `opportunity_products` (o valor ficou em `private.backup_opportunities_value`) |
| Dados | O valor do negócio ganho de hoje virou um item sem visto, ligado ao processo dele |
| Telas | Cartão Vistos na tela do lead (o valor sai da criação e da edição); Ganho com resumo; Reabrir com confirmação no quadro e na tela do lead; quadro com os encerrados só dos últimos 30 dias; CRM › Encerradas; Dono e Participantes no Editar negócio |

Na aplicação da 0054, a recópia e a correção de item antigo (D19) foram
conferidas à mão: dois negócios plantados numa pessoa da organização de teste
saíram certos, e a pessoa foi apagada depois, junto com as duas linhas dela
em `private.backup_opportunities_value` (que guarda só o valor real). Nos dados
de verdade não havia nada para recopiar nem dono a zerar.

### Novo cliente e data do Ganho (20/nov, antes da entrega 4)

Plano: `docs/superpowers/plans/2026-11-20-novo-cliente-e-data-do-ganho.md`
(CLI-15, CRM-17 e a mudança no CLI-12). Pedido do Renato: cadastrar os
clientes antigos sem criar oportunidade.

| Parte | O que ficou pronto |
|---|---|
| Banco | `criar_cliente` e `buscar_contatos_para_cliente` (0055): só a gestão, só a organização atual, quem está no funil fica de fora; `marcar_como_cliente` põe quem marca como dono. `ajustar_data_do_ganho` (0056): de 01/01/2000 até hoje, com histórico, e o `update` direto da data do negócio ganho recusado |
| Telas | "Novo cliente" em Clientes (busca de contato ou contato novo, aviso de parecido, abre em Projetos com o "+ Novo processo"); "Ajustar data" no lead ganho |

Quem está no funil vira cliente pelo Ganho; a data se ajusta depois. O
"cliente desde" continua se corrigindo em Editar, no perfil do cliente.

### Entrega 4a — forma de pagamento pela equipe e cobranças no Ganho (22/nov)

Plano: `docs/superpowers/plans/2026-11-21-entrega-4a-forma-de-pagamento.md`
(FIC-7, FIC-10 a FIC-12, REC-6, CRM-14). Desenho:
`docs/superpowers/specs/2026-11-21-entrega-4a-forma-de-pagamento-design.md`. Um
push só, no fim: as duas migrations são compatíveis com o código no ar.

| Parte | O que ficou pronto |
|---|---|
| Banco | A forma do negócio, as partes, as parcelas e as confirmações (0058), mudadas só pelas três funções — salvar, confirmar pela equipe e refazer —, com a cotação do C6 gravada direto; vistos travados com a forma confirmada; negócio com confirmação não se apaga. O Ganho cria uma cobrança por parte da forma confirmada, uma vez só (0059) |
| Telas | Cartão "Forma de pagamento" no lead, abaixo do Negócio, com a janela de definir e editar; "Confirmar pela equipe" e "Refazer" para o dono do negócio e a gestão; resumo do Ganho com a forma, as cobranças que vão nascer e os avisos (parcela vencida, coerência, visto fora da forma) |

Cartão é um pagamento só, numa data: a Duli recebe tudo antecipado (Renato,
21/nov). Entrada e parcelas viram parcelas no Financeiro, pela programação da
forma.

Fica para a **4b**: o link para o cliente ver a forma e dar o OK, a resposta
dele (aceita ou recusada), reenviar só o pagamento e os alertas do Início.

### Entrega 4b — o link da forma e a resposta do cliente (23/nov)

Desenho: `docs/superpowers/specs/2026-11-23-entrega-4b-link-da-forma-design.md`,
aprovado pelo Renato em 23/nov, com as decisões 8 a 16. O que mudou em relação
ao combinado na 4a:

- A parte em reais diz de quantos dólares veio (FIC-13, novo): o que o cliente
  vê na ficha é o que vai no contrato.
- O link com forma vale 3 dias úteis; o da ficha comum continua com 15 dias.
- "Criar as cobranças mesmo assim" saiu: quem confirmou por fora passa por
  "Confirmar pela equipe".
- Q11 decidida: um link novo não apaga a ficha recebida, e o aviso fica até o
  "Conferi" (fecha o I4).

Plano: `docs/superpowers/plans/2026-11-23-entrega-4b-link-da-forma.md`. Um push
só, no fim: as três migrations são compatíveis com o código no ar.

| Parte | O que ficou pronto |
|---|---|
| Banco | A conversão (`usd_equivalent`), o link com a forma em `registration_forms` (congelado fora das funções, um aberto por pessoa), `enviar_forma_de_pagamento` com a versão, `voltar_forma_para_rascunho` com `p_de`, o prazo de 3 dias úteis e o negócio que fecha cancelando o link (0064); a porta do pagamento, `responder_forma_de_pagamento`, a terceira função sem login, e a correção do gatilho que dizia o título de outra organização (0065); a resposta do cliente cai com o link quando a pessoa é apagada (0066) |
| Telas | O cartão da forma por estado, a prévia do envio (o mesmo componente da ficha pública), "Convertido de US$" na janela, a ficha pública com o pagamento, o resumo do Ganho com a forma enviada e a recusada, os três avisos da Início, e os dados cadastrais com a ficha recebida separada do link atual |
| Provas | A suíte de RLS de cada migration, e `supabase/provas/link-com-a-forma.sql` (os dias úteis com datas fixas e o link vencido, que a API não alcança) |

Na tela é sempre "link da ficha": o app não gera link de pagamento — o do
cartão no C6, o Renato gera à mão.

### Parceiros e clientes de parceiro (24/nov, antes da Fase 7)

A Thais Fabrini (EUA) vende e contrata a Duli para montar o processo. O
Renato fala só com ela, nunca com o cliente, e cobra dela por cliente, em datas
diferentes. Antecipado porque ele está subindo todos os clientes agora.

Desenho: `docs/superpowers/specs/2026-11-24-clientes-de-parceiro-design.md`
(abordagem A: o parceiro é uma organização `partner`; o cliente é da Duli, com
o vínculo `people.partner_organization_id`), revisto em duas rodadas. Plano:
`docs/superpowers/plans/2026-11-24-clientes-de-parceiro.md`. Spec §7.17
(PAR-4 a PAR-11). Um push só, no fim: as quatro migrations são compatíveis com
o código no ar.

| Parte | O que ficou pronto |
|---|---|
| Banco | A regra do parceiro (só o dono da Duli cria; nome, país e contato válidos; nome único; `slug` do nome), `organizations` no manifesto e **a semente das organizações novas consertada** (0068); a fixture da `executora-teste` (0069); o vínculo fixo, `criar_cliente` com o parceiro, o histórico e `buscar_clientes` com o contato do parceiro (0070); cliente de parceiro fora do funil e do link da ficha (0071) |
| Telas | Configuração › Parceiros (migrada), Novo cliente › Parceiro, o contato do parceiro com "via" no perfil, em Clientes, em Contatos e no Financeiro, Editar cliente, Editar de Contatos e Dados cadastrais sem contato próprio, e "Nota fiscal / invoice" no anexo |
| Provas | A suíte de RLS (`parceiros`, `cliente-de-parceiro`, `parceiro-fora-do-funil`), e `supabase/provas/parceiro-pelo-dono.sql` e `vinculo-do-parceiro.sql` (o que nenhuma conta de teste alcança: o `insert` pelo dono e o vínculo real ↔ teste) |

- **A semente estava quebrada desde a 0027**: ela gravava as etapas do funil
  sem `organization_id`, e nenhuma organização nova nascia. Ninguém viu porque
  só existiam a Duli e a `parceiro-teste`. Achado ao desenhar o cadastro de
  parceiro, provado num bloco desfeito e consertado na 0068.
- **Conta de teste nova**, a `teste-executora` (`admin` da `executora-teste`,
  `staff` da `parceiro-teste`): é quem faz o papel da Duli nos testes de
  cliente de parceiro. O CRM dela não serve para conferir nada (ver a pendência
  abaixo).
- **Pendência da Fase 7** (segunda revisão do desenho, N1): `getBoard`
  (`features/opportunities/queries.ts`) e `etapasDoFunilLocal`
  (`features/settings/consultas-locais.ts`) procuram o funil padrão **sem
  filtrar pela organização atual**. Hoje não morde em produção, porque
  ninguém de verdade é membro de duas organizações; morde no dia em que
  alguém da Duli entrar num parceiro (o portal). A `teste-executora`, membro
  de duas organizações de teste, já vê o problema.

### Baixa em dólar sem cotação e vencimento renegociado (24/nov)

Pedido do Renato ao dar baixa na primeira parcela da Thais: o dinheiro em
dólar (ou USDT/USDC) fica na Nomad, no C6 Global ou na Binance e é convertido
depois, juntando vários — não há cotação do dia. Desenho:
`docs/superpowers/specs/2026-11-24-baixa-em-dolar-sem-cotacao-design.md`.
Plano: `docs/superpowers/plans/2026-11-24-baixa-em-dolar-e-vencimento.md`. Sem
migration: o banco já aceitava as duas coisas.

- A cotação da baixa em dólar ficou opcional e abre sempre vazia; sem ela, a
  parcela fica paga em US$ e o "recebido em reais" a mostra à parte.
- "Mudar vencimento" na parcela em aberto, com o histórico da data de antes
  (`vencimento_alterado`, do sistema).
- Fica para depois, se precisar: registrar as conversões (dólar → real) para
  saber o valor real em reais.

---

## 3. Pendências do Renato

Coisas que dependem dele, fora do código.

| O quê | Por quê |
|---|---|
| **Provedor de nota fiscal** — e confirmar com o contador como fatura em dólar | NFS-e ou invoice muda o desenho da Fase 3 |
| **Tamanho dos arquivos no app antigo** (soma dos 4 buckets) | Decide se os documentos cabem no plano gratuito |

Decisões abertas, sem pressa:

- A **descrição** da pasta aparecer ao lado do nome ("Certidões, passaporte…").
  A coluna já existe; é só mostrar.
- Pasta **ativa/inativa**, para aposentar sem apagar.
- Deixar o repositório do GitHub **privado**.

---

## 4. Decisões e o porquê

**Uma pessoa, com estágios.** Contato, lead e cliente são a mesma linha em
`people`, com `lifecycle_stage`. No app antigo eram três tabelas com universos
paralelos de tags, notas e arquivos, e um serviço de 358 linhas só para copiar
dados entre elas.

**Oportunidade é negócio, não pessoa.** A mesma pessoa pode ter várias ao longo
do tempo. Cliente não regride de estágio quando um negócio é apagado.

**Molde e instância.** O tipo de visto é um molde; o processo recebe uma cópia.
Reorganizar o molde não mexe em processo em andamento.

**Catálogo único de pastas, em árvore.** Cada tipo de visto escolhe dali o que
exige, com obrigatoriedade, prazo e ordem próprios. Corrigir o nome de uma pasta
corrige em todo lugar.

**Pastas livres.** Não existe "documento nomeado" nem "grupo que só organiza":
toda pasta recebe arquivo e pode ter subpasta. Quem confere o conteúdo é gente.

**Multi-organização desde o primeiro dia.** Duli é a organização raiz; cada
parceiro é uma organização. A separação está inteira no banco (RLS e chaves
estrangeiras que não deixam uma linha apontar para outra organização) — nenhuma
query da aplicação filtra por organização. Por isso a suíte de RLS existe e não
pode pular.

**A organização de um registro vem do registro-pai.** Nota, atividade e
negócio herdam a organização da pessoa, não de quem clicou.

**Configuração exige proprietário ou admin.** Colaborador lê o catálogo e o
funil, e não altera. Apagar uma pasta tira a exigência de todos os vistos que
a usavam.

**Nenhuma exclusão definitiva sem dizer o que se perde.** O aviso nomeia o que
vai junto — subpastas, vistos afetados, negócios.

**Reordenar por setas, não por arrastar.** Funciona no celular, no teclado e no
leitor de tela; numa árvore, soltar entre dois níveis é ambíguo.

**Dinheiro em BRL e USD desde o início**, somado sempre por moeda.

---

## 5. Fases seguintes

| Fase | Objetivo | Portão |
|---|---|---|
| 3 — Financeiro | **A receber: feito.** Falta contas a pagar, despesas, fornecedores e fluxo de caixa; depois contrato no ZapSign e nota fiscal | Fechar um mês inteiro no app, sem planilha |
| 4 — Tarefas e integrações | Tarefas da equipe, usuários e permissões, notificações; porta Calendly, Gmail e n8n do app antigo | Equipe trabalha sem abrir o app antigo para essas coisas |
| 5 — Virada | Dados finais migrados, domínio `login.duliconsulting.com` aponta para a VPS, 25 usuários redefinem senha. App antigo intacto por 30 dias | Equipe trabalha um dia inteiro no app novo |
| 6 — Portal do cliente | Acompanhar etapas, subir documentos, ver financeiro, contratar tradução | — |
| 7 — Portal do parceiro | Marca própria, carteira e financeiro do parceiro separados da Duli | — |
