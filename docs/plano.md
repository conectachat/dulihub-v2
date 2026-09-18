# DuliHub 2 — plano

App interno da Duli Consulting, reconstruído do zero para substituir o app feito
no Lovable. O antigo segue em produção até a Fase 5.

Este documento diz **onde estamos, o que vem, e por que as coisas são como são**.
O histórico de como se chegou aqui está no `git log`, que guarda isso melhor.
Convenções de código ficam no `AGENTS.md`.

---

## 1. Estado atual (18/set/2026)

### No ar

`https://dulihub-v2.vercel.app` — publica sozinho a cada push no `main`. Protegido
pela Vercel (login da Vercel antes do login do app), porque aponta para o banco
real.

| Tela | O que faz |
|---|---|
| Início | Resumo da organização |
| Contatos | Lista, busca, filtro por tag, criar, editar, excluir e restaurar (lixeira) |
| Ficha do contato | Dados, tags, oportunidades e linha do tempo (notas e atividades) |
| CRM | Quadro do funil por etapa; criar, mover e excluir oportunidade; totais por moeda |
| Configurações | Etapas do funil, tags, catálogo de documentos (árvore de pastas livres), tipos de visto (etapas e documentos exigidos, ordem por visto), status de etapa |
| Projetos, Financeiro | "Em construção", com o que cada uma vai ter |

### Dados

| | |
|---|---|
| Contatos | 76, importados do app antigo sem duplicata (eram 157 linhas em três tabelas) |
| Organizações | Duli (raiz) e "Parceiro de Teste" (só para a suíte de testes) |
| Banco | Supabase `xigmtofpmfqeehhcdasf`, migrations `0001` a `0019` em `supabase/migrations/` |

### Rede de proteção

Tudo roda sozinho em cada push; o CI está verde desde 18/set.

| Camada | O que pega |
|---|---|
| Trava de commit (`.githooks/pre-commit`) | Erro de tipo e de lint — o commit nem acontece |
| 87 testes de unidade | Regras e funções puras: árvore, dinheiro, avisos, formatação, componentes |
| 23 testes de RLS | Uma organização não enxerga nem altera dado da outra; colaborador não mexe em configuração; cliente do portal lê o que é dele e não reescreve o que o consultor escreveu |
| 22 testes de fumaça | Cada tela principal abre com login de verdade |

### Endurecimento — concluído

Entre 03 e 18/set o código foi revisado inteiro antes de qualquer
funcionalidade nova. Mais de 40 defeitos, entre eles: criar contato nunca tinha
funcionado pela tela; `2000.00` virava `200000`; o CRM somava real com dólar;
26 ações desistiam sem avisar; leitura que falhava aparecia como lista vazia;
qualquer membro apagava a configuração inteira; o cliente do futuro portal
poderia reescrever as notas do consultor; e `/contatos` esteve fora do ar em
produção sem ninguém ver.

**Um item aberto:** gerar os tipos TypeScript a partir do banco, para eliminar
os 10 `as unknown as` que ainda existem. Depende do conector do Supabase no
claude.ai (ver pendências).

---

## 2. Próximo — Fase 2, Processos

A planejar. É para ela que a configuração existe: criar o processo de um
cliente a partir do tipo de visto, com etapas e pastas copiadas do molde; o
cliente sobe arquivos; o Renato aprova ou recusa cada um, e a recusa exige
motivo.

Já decidido para ela:

| Pergunta | Resposta |
|---|---|
| Documentos são do processo ou da etapa? | Do processo inteiro |
| Sub-etapas existem? | Sim, hierarquia mantida |
| Mudar o molde afeta processo em andamento? | Não — nada muda sozinho |
| Pasta do catálogo nomeia o documento ("IRPF")? | Não. É pasta, e o cliente sobe o que tiver |
| Quando a pasta conta como resolvida? | Quando o Renato marca. Não é automático |
| Arquivo enviado entra como? | Em análise. Aprovado ou recusado com motivo, que o cliente lê |
| Dá para criar pasta só naquele processo? | Sim, além das que vêm do molde |
| Barra de progresso mede o quê? | Pastas obrigatórias resolvidas ÷ pastas obrigatórias |

---

## 3. Pendências do Renato

Coisas que dependem dele, fora do código.

| O quê | Por quê |
|---|---|
| **Reconectar o Supabase** em claude.ai → Configurações → Conectores | Destrava os tipos do banco, último item do endurecimento |
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
| 3 — Financeiro | Receita por processo, contas a pagar, fluxo de caixa; depois contrato no ZapSign, cobrança C6/Itaú e nota fiscal | Fechar um mês inteiro no app, sem planilha |
| 4 — Tarefas e integrações | Tarefas da equipe, usuários e permissões, notificações; porta Calendly, Gmail e n8n do app antigo | Equipe trabalha sem abrir o app antigo para essas coisas |
| 5 — Virada | Dados finais migrados, domínio `login.duliconsulting.com` aponta para a Vercel, 25 usuários redefinem senha. App antigo intacto por 30 dias | Equipe trabalha um dia inteiro no app novo |
| 6 — Portal do cliente | Acompanhar etapas, subir documentos, ver financeiro, contratar tradução | — |
| 7 — Portal do parceiro | Marca própria, carteira e financeiro do parceiro separados da Duli | — |
