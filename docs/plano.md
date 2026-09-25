# DuliHub 2 — plano

App interno da Duli Consulting, reconstruído do zero para substituir o app feito
no Lovable. O antigo segue em produção até a Fase 5.

Este documento diz **onde estamos, o que vem, e por que as coisas são como são**.
O histórico de como se chegou aqui está no `git log`, que guarda isso melhor.
Convenções de código ficam no `AGENTS.md`.

---

## 1. Estado atual (22/set/2026)

### No ar

`https://dulihub-v2.vercel.app` — publica sozinho a cada push no `main`. Protegido
pela Vercel (login da Vercel antes do login do app), porque aponta para o banco
real.

| Tela | O que faz |
|---|---|
| Início | Resumo da organização |
| Contatos | Lista, busca, filtro por tag, criar, editar, excluir e restaurar (lixeira) |
| Ficha do contato | Dados, tags, oportunidades, processos, linha do tempo; "Novo processo" |
| CRM | Quadro do funil; negócio em Ganho oferece "Criar processo" |
| Projetos | Lista de processos: cliente, visto, status, pastas resolvidas, próximo prazo |
| Processo | Status e campos do USCIS; abas **Etapas** (tabela com status, data prevista e de conclusão, sub-etapas em grupo), **Documentos** (pastas, envio, visualizar, aprovar, recusar com motivo, resolver) e **Observações** (editor estilo Notion, várias pessoas ao mesmo tempo) |
| Configurações | Etapas do funil, tags, catálogo de pastas, tipos de visto, status de etapa — **abre e grava sem internet**, e sincroniza sozinha |
| Sincronização | O que este aparelho gravou e o servidor ainda não recebeu; o que ele recusou, com o motivo |
| Financeiro | **A receber**: cobrança por cliente, parcelas com vencimento, baixa com a cotação do dia, e o que venceu. Abre e grava sem internet |

### Dados

| | |
|---|---|
| Contatos | 76, importados do app antigo sem duplicata |
| Organizações | Duli (raiz) e "Parceiro de Teste" (só para a suíte de testes) |
| Banco | Supabase `xigmtofpmfqeehhcdasf`, migrations `0001` a `0033` em `supabase/migrations/` |
| Arquivos | Buckets privados `documentos` (pastas do processo) e `observacoes` (colados no editor), 20 MB |
| No aparelho | Cópia das tabelas de configuração e do que ela usa, por usuário (IndexedDB), mais a fila do que ainda não subiu |

### Rede de proteção

Tudo roda sozinho em cada push.

| Camada | O que pega |
|---|---|
| Trava de commit (`.githooks/pre-commit`) | Erro de tipo e de lint — o commit nem acontece |
| 355 testes de unidade e componente | Regras, formatação, telas de etapas e documentos, sincronização em tempo real, editor montado sobre Supabase falso, fila de gravações offline, e as contas do a receber — arredondamento de parcela, vencimento que não pula de mês, conversão que exige cotação |
| 95 testes de RLS | Uma organização não enxerga nem altera dado da outra — tabelas, arquivos e o canal em tempo real; regras de negócio no banco (pasta só resolve com tudo aprovado, processo só se liga a negócio do mesmo contato); e que a fila, ao subir, passa pela mesma RLS; cobrança e parcela isoladas por organização |
| 33 testes de fumaça | Cada tela abre com login de verdade, inclusive com um processo real |

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
| Barra de progresso mede o quê? | Pastas obrigatórias resolvidas ÷ pastas obrigatórias |
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
ZapSign, boleto do Itaú, link do C6 e nota fiscal — estas quatro dependem das
credenciais que ainda estão com o Renato.

---

## 3. Pendências do Renato

Coisas que dependem dele, fora do código.

| O quê | Por quê |
|---|---|
| **Itaú** — credenciais via gerente de conta | Processo de semanas; vira gargalo da Fase 3 se começar tarde |
| **C6** — cadastro no portal do desenvolvedor | Idem |
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
| 3 — Financeiro | **A receber: feito.** Falta contas a pagar, despesas, fornecedores e fluxo de caixa; depois contrato no ZapSign, cobrança C6/Itaú e nota fiscal | Fechar um mês inteiro no app, sem planilha |
| 4 — Tarefas e integrações | Tarefas da equipe, usuários e permissões, notificações; porta Calendly, Gmail e n8n do app antigo | Equipe trabalha sem abrir o app antigo para essas coisas |
| 5 — Virada | Dados finais migrados, domínio `login.duliconsulting.com` aponta para a Vercel, 25 usuários redefinem senha. App antigo intacto por 30 dias | Equipe trabalha um dia inteiro no app novo |
| 6 — Portal do cliente | Acompanhar etapas, subir documentos, ver financeiro, contratar tradução | — |
| 7 — Portal do parceiro | Marca própria, carteira e financeiro do parceiro separados da Duli | — |
