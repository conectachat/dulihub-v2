<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# DuliHub — convenções do projeto

App interno da Duli Consulting (consultoria de imigração). Substitui o app
anterior feito no Lovable. Estado atual, próximos passos, pendências e o porquê
das decisões de modelagem: **`docs/plano.md`**. Atualize-o no mesmo commit em
que uma fase fecha ou uma decisão muda.

## Regras que não se negociam

**Gerenciador de pacote: `bun`.** Nunca `npm`.

**Leitura e escrita: depende da tela.**

*Tela que ainda não migrou* lê e grava no servidor. Server Components e Server
Actions usam `@/lib/supabase/server`; o cliente de navegador
(`@/lib/supabase/client`) só entra onde a interatividade exige.

*Tela migrada para o espelho* — hoje a Configuração inteira — lê do banco
dentro do aparelho e grava na fila dele (`src/lib/local/`), com o cliente de
navegador. **Um caminho só, com e sem internet**: é o que faz offline ser
igual a online em vez de uma segunda implementação que diverge em silêncio.
A RLS continua sendo a segurança real — todo pull é `select` com policy, todo
push é `insert`/`update` com policy, e nenhum caminho novo de leitura ou de
escrita foi criado.

O que **não** vai ao aparelho: arquivo de cliente (passaporte, comprovante de
renda, contrato) só desce por escolha explícita, processo a processo; e
`profiles` e o conteúdo de outras organizações nunca. O espelho é texto claro
no disco — a proteção é a cifra do aparelho mais o prazo de validade do
espelho, e isso está dito em `docs/plano.md`.

Tela nova nasce migrada, e o Financeiro é a primeira.

**Exceção registrada: Clientes lê do servidor** (`/clientes` e
`/clientes/[id]`, entrega 2). O perfil do cliente é a tela de contato que já
existia, reorganizada em abas; o dono vem de `profiles`, que nunca vai ao
aparelho; notas, ficha, processos e documentos não estão no espelho. Sem
internet o perfil não abre — cobrança sem internet continua sendo pela tela
Financeiro. A aba Financeiro do perfil é a exceção da exceção: lê do aparelho,
como a tela Financeiro. Quando Contatos e CRM migrarem (OFF-3), Clientes vai
junto.

**Exceção registrada: anexos da parcela vão direto do navegador**
(`features/financeiro/anexos.ts`, CLI-6). A tela Financeiro é migrada e não
tem Server Action; o anexo é arquivo de cliente, que não vai ao aparelho. Então
o objeto sobe ao depósito `financeiro` e a linha vai a `installment_files` pelo
cliente de navegador, com a sessão de quem clica e a RLS decidindo, só com
internet ("Anexos precisam de internet."). O banco confere o caminho contra a
parcela real e recusa apagar parcela ou cobrança que ainda tem anexo (0048).

**`getUser()`, nunca `getSession()`** para decidir permissão. `getSession()`
apenas lê o cookie, que o cliente pode forjar. `getUser()` revalida no servidor.
A exceção é `src/lib/local/usuario.ts`, que usa `getSession` para saber **qual
banco local abrir** — offline não há a quem perguntar, e ali não se decide
permissão nenhuma: quem decide continua sendo a RLS, a cada linha que sobe.
Sem rede (ou com a sessão sem renovar por falha de rede), ele usa o **dono do
aparelho** guardado no último login, para o espelho continuar abrindo depois
de o token vencer; sair e sessão encerrada o esquecem. Subir e baixar exigem
sessão válida da mesma pessoa — o sincronizador confere antes (G8).

**RLS é a segurança real.** Verificação na interface é conveniência, não
proteção. Toda tabela nova nasce com RLS ligada e policy escrita na mesma
migration.

**Uma porta para quem não tem login, e só uma.** A ficha de cadastro
(`/cadastro/<token>`, migration 0035) é o único caminho do app para o
anônimo. Ela existe em três funções — `abrir_ficha_de_cadastro`,
`enviar_ficha_de_cadastro` e, desde a entrega 4b (0065),
`responder_forma_de_pagamento`, o OK do cliente na forma de pagamento —
que são `security definer` em `public`, executáveis por `anon`:
exatamente o que a 0003 proibiu, e a única exceção.
O que a mantém estreita, e que qualquer porta nova teria de repetir:

- o token de 256 bits é a única chave, gerado no servidor, de uso único e
  com prazo; a função trava a linha antes de gravar;
- lista fechada de campos (`private.campos_da_ficha`) — o `jsonb` não
  alcança `organization_id`, `lifecycle_stage` nem `user_id`;
- a leitura devolve só nome e contato, nunca documento ou endereço; e,
  quando o cliente está no pagamento, a forma montada no banco
  (`private.copia_da_forma`), nunca a cotação;
- na resposta do pagamento, do navegador chegam só sim, não e o motivo: a
  cópia que fica como prova é a mesma `copia_da_forma` que o cliente leu;
- só `anon` executa: o app chama por `lib/supabase/anonimo.ts`, sem cookie,
  para que ninguém entre por ela com sessão (o gatilho da 0013 congelaria o
  CPF em silêncio);
- quem grava é `salvar_cadastro`, `security invoker` — a mesma função que a
  equipe usa, onde a RLS decide.

O aviso do Supabase "definer executável por anon" é esperado para essas três
funções. Aparecendo para qualquer outra, é defeito. Nenhuma policy é
`to anon`, e não é para passar a ser.

**Dinheiro não se converte sem cotação e sem data.** `totals.ts` soma por
moeda e nunca uma na outra; a única conversão do sistema é `emReais`
(`features/financeiro/regras.ts`), e ela exige a cotação junto — devolve nulo
quando falta, em vez de somar mil dólares como se fossem mil reais. A cotação
usada fica gravada na parcela paga, porque o que entrou no caixa depende do
dia em que entrou.

**Todo dado de negócio carrega `organization_id`.** A Duli é a organização
raiz; cada parceiro é uma organização com marca própria. Nenhuma query
confia no `organization_id` vindo do cliente — quem filtra é a RLS.

**A organização vem do registro-pai, nunca da associação de quem clicou.**
Nota, atividade, negócio e etiqueta herdam a organização **da pessoa**; a
exigência de documento herda a **do tipo de visto**. São coisas diferentes no
dia em que um consultor da Duli atender cliente alocado por um parceiro — e a
RLS não pega o erro, porque a linha resultante é válida. Quem resolve a
organização atual é `contextoAtual()` de `@/lib/organizacao`, e ela serve para
decidir permissão, não para carimbar linha.

**Referência cruzada é barrada pelo banco.** Cada tabela tem
`unique (id, organization_id)` e as estrangeiras são compostas, então pasta de
A não vira filha de pasta de B. Tabela nova segue o mesmo desenho: `with check`
valida só a linha gravada, nunca o que ela referencia.

**Exceção registrada: o vínculo do cliente de parceiro** (`people.partner_organization_id`,
0070). É a única chave que aponta para **outra** organização de propósito: o
cliente é da Duli, e o vínculo diz qual parceiro o trouxe. No lugar da chave
composta, guardas no banco: só nasce pelo `criar_cliente` (marca
`dulihub.via_parceiro`), não muda nem se apaga, aponta só para `partner`
diferente da organização do cliente e com a mesma marca de teste. **Nenhuma
policy lê o vínculo** — ele não dá acesso nenhum ao parceiro; o que o parceiro
enxerga se decide no portal (Fase 7). Coluna nova que aponte para outra
organização não entra sem registro aqui.

## Estrutura

```
src/
  app/                    rotas e layouts, nada de lógica de negócio
  features/<dominio>/
    actions.ts            Server Actions ("use server") — tela não migrada
    queries.ts            leitura no servidor — tela não migrada
    consultas-locais.ts   leitura do espelho — tela migrada
    escritas-locais.ts    gravação pela fila — tela migrada
    montagem.ts           contagens e junções puras, usadas pelos dois lados
    regras.ts             regras do negócio, puras e testadas sem banco
    schema.ts             validação Zod, pura e compartilhada
    components/           componentes do domínio
  components/ui/          shadcn/ui, não editar à mão
  lib/local/              espelho, fila, sobreposição e sincronia
  lib/supabase/           os quatro clientes
```

Tela migrada não tem `actions.ts` nem `queries.ts`: quando a última tela de um
domínio migra, os dois são **apagados**. Código morto diverge do que roda, e
divergir em silêncio é o defeito que esta base persegue.

Uma feature não importa de outra feature. Se precisar, o compartilhado sobe
para `lib/`.

## Migrations

`supabase/migrations/NNNN_nome.sql`, numeradas em sequência. Cada migration
inclui as policies de RLS das tabelas que cria. Comentário no topo explicando
a decisão de modelagem, não o óbvio da sintaxe.

## Idioma

Interface, comentários e mensagens de erro em português. Nomes de tabela,
coluna e código em inglês.

## Marca

Azul `#022b64` é `--primary`. Laranja `#FF6600` é `--brand`. Use os tokens,
nunca o hex direto.

## UI: use o que já existe

Tela nova não reimplementa o que outra já resolveu. Foi assim que o app antigo
virou o que virou: cada tela refazendo o campo que salva sozinho, a árvore com
recuo, o aviso de lista vazia — cada uma com pequenas diferenças. Em cinco
telas incomoda; em trinta, ninguém consegue mais mudar nada.

| Precisa de | Use |
|---|---|
| Título de página, com descrição e ações | `PageHeader` / `SectionHeader` |
| Lista vazia, sem resultado, nada configurado | `EmptyState` |
| Campo que salva ao sair do foco | `InlineText` |
| Reordenar entre irmãos | `MoveButtons` |
| Excluir, com aviso do que se perde | `ConfirmAction` |
| Árvore em lista com recuo | `flattenTree` + `indentStyle` de `@/lib/tree` |
| Escolher cor da paleta | `ColorPicker` |
| Diálogo de criar/editar, inclusive com pergunta antes de gravar | `FormDialog` com a prop `aviso` (e `reenviarCom` para a confirmação) |
| "Já existe contato com esse e-mail ou telefone" | `AvisoDeDuplicado` + `buscarParecidos` (`@/lib/parecidos`) |
| "Este contato já tem oportunidade" | `AvisoDeOportunidade` |
| Regra de e-mail, DDI e telefone | `erroDeContato` / `errosDeContato` (`@/lib/contato`) — a mesma de `private.contato_valido` |
| Link para uma pessoa (contato ou cliente) | `enderecoDaPessoa` (`@/lib/pessoa`) — nunca `/contatos/${id}` escrito à mão; cliente mora em `/clientes/<id>` |
| Revalidar depois de gravar algo da pessoa | `revalidarPessoa` (`@/lib/revalidar`) — as duas listas e os dois perfis |
| Copiar telefone, e-mail ou link, com "Copiado" | `CopiarTexto` |
| Abas com a aberta na URL (`?aba=`) | `AbasNaUrl` — troca por `history.replaceState`, sem refazer a página |
| Busca de lista guardada na URL (`?q=`) | `BuscaNaUrl` — buscar de novo volta para a primeira página |
| Lista paginada com o total ("Mostrando 51–72 de 72") | `POR_PAGINA`, `paginaPedida`, `contagemDaLista` (`@/lib/paginacao`) — nunca cortar em silêncio |
| Dono e participantes (cliente, negócio) | `CampoDoDono` / `CampoDosParticipantes` (`@/components/dono-e-participantes`) e `diferencaDeParticipantes` (`@/lib/participantes`) — o dono atual fica na lista mesmo fora da equipe visível |
| Contato existente ou novo num diálogo (Nova oportunidade, Novo cliente) | `ModosDoContato` / `BotaoQueDispensa` (`@/components/modos-do-contato`) e `CamposDoContatoNovo`; no servidor, `contatoNovoDoFormulario` (`@/lib/contato`). O modo "Parceiro" só com `comParceiro` (Novo cliente) |
| O contato que aparece de uma pessoa (o do parceiro no cliente de parceiro) | `contatoExibido` (`@/lib/parceiros`) e `ViaDoParceiro` (`@/components/via-do-parceiro`) — nunca `person.email` direto onde o cliente pode ser de parceiro |
| Quais parceiros oferecer ou listar; quem cadastra parceiro | `parceirosVisiveis` e `ehDonoDaRaiz` (`@/lib/parceiros`); offline, o papel e o tipo vêm de `vinculoLocal` (`@/lib/local/organizacao-local`) |
| "É da gestão?" (owner ou admin) | `ehDaGestao(papel)` e, para a organização de um registro, `daGestaoDe(supabase, organizationId, userId)` (`@/lib/organizacao`) — na tela decide só o que aparece; quem decide é o banco |
| Abrir o perfil do cliente com o processo a criar | `enderecoDoNovoCliente` (`@/lib/pessoa`) — `?aba=projetos&novo-processo=novo` |
| Parcelas mês a mês sem perder centavo; métodos de pagamento | `gerarParcelas`, `somarMeses`, `METODOS`, `ROTULO_DO_METODO` (`@/lib/parcelas`) — o Financeiro e a forma de pagamento do negócio usam as mesmas |
| Somar vistos por moeda | `somarItensPorMoeda`, `emCentavos`, `emMoeda` (`@/lib/totals`) — em centavos, e nunca uma moeda na outra. As parcelas do Financeiro somam em `totaisPorMoeda` (`features/financeiro/regras.ts`) |
| A forma de pagamento como o cliente vê (a prévia do envio e a ficha pública) | `FormaDePagamentoDoCliente` (`@/components/forma-de-pagamento-do-cliente`), com `formaParaOCliente` e `valorComConversao` (`@/lib/forma-do-cliente`) — o mesmo formato de `private.copia_da_forma`; a prévia e a ficha não podem divergir |
| Enviar arquivo do navegador ao depósito e registrar | `enviarERegistrar`, `arquivoAceito`, `limparNome` (`@/lib/arquivos`) — registro recusado remove o objeto |
| Abrir ou baixar por URL assinada | `abrirEmNovaAba` / `baixar` (`@/lib/abrir`) — a aba abre no clique; `window.open` depois de um `await` o Safari do iPhone bloqueia |

Falta um? Extraia para `src/components/` na segunda cópia, não na terceira.

### Ícone atravessa para o cliente como elemento, nunca como componente

`icon={<Trash2 className="h-4 w-4" />}`, não `icon={Trash2}`.

Página em `app/` é componente de servidor; `IconAction`, `ConfirmAction` e
`SubmitButton` são de cliente. Componente é função, e função não atravessa do
servidor para o navegador — o React recusa na hora de renderizar. `tsc`, lint e
`next build` passam; o erro só aparece em produção, na tela. Foi assim que
`/contatos` ficou fora do ar desde a Etapa 2 sem ninguém ver.

Por isso a prop de ícone desses componentes é `React.ReactNode`: passar o
componente cru vira erro de compilação. Componente de cliente novo que receba
ícone segue o mesmo tipo. A regra vale para qualquer função — `onClick`,
formatador, callback: de servidor para cliente só passa dado e Server Action.

### O portão roda sozinho

`.githooks/pre-commit` roda tipos e lint antes de cada commit; a suíte fica no
CI (`.github/workflows/ci.yml`), porque levantar o jsdom custa segundos demais
para cobrar a cada commit — portão que atrapalha é portão que alguém pula com
`--no-verify`.

Numa máquina nova, uma vez: `git config core.hooksPath .githooks`.

### Teste antes do código

Regra de negócio e função pura entram com o teste que falha primeiro. Não é
cerimônia: `bun test` reportou verde por nove dias rodando **zero** testes, e
nesse período cinco defeitos chegaram à produção — inclusive um que impedia
criar contato pela tela.

Não precisa de dependência nova: `vitest`, `jsdom` e `@testing-library/react`
já estão instalados. Componente React renderiza em teste hoje.

Cada defeito corrigido entra com o teste que o reproduz. Ver
`src/lib/tree.test.ts`, que cobre os dois casos que ninguém tinha coberto —
ciclo e nó órfão — e que faziam a linha sumir da tela sem aviso.

### Fumaça: cada tela abre com sessão

`tests/fumaca/` entra com a conta `teste-colaborador` e pede cada rota principal
ao servidor, exigindo `200` — as seções de configuração vêm de `ALL_SECTIONS`,
então seção nova entra sozinha. Existe porque em 18/set `/contatos` ficou fora do
ar em produção com tipos, lint, build e todos os testes verdes: o erro só existe
quando a página é desenhada.

Precisa de servidor rodando, por isso fica fora do `verify`:
`bun run dev` num terminal, `bun run test:fumaca` no outro. No CI roda sempre,
depois do build. Tela nova de nível superior entra na lista `TOPO` do teste.

### RLS tem suíte própria, e ela não pula

`tests/rls/` entra no Supabase de verdade, com login de verdade, porque
nenhuma query da aplicação filtra por organização: a separação está inteira na
policy. Policy que afrouxa não quebra nada — só passa a mostrar a carteira
alheia.

`bun run test` roda a unidade. `bun run test:rls` roda essa, e **falha** se
faltar credencial no `.env.local`, em vez de pular. Ver `tests/rls/README.md`.

Toda migration que mexe em policy entra com o teste correspondente, vermelho
antes.

Os arquivos rodam **um de cada vez** (`--no-file-parallelism`, também na
fumaça): todos gravam e leem o mesmo banco. Em paralelo, o contato
temporário de um arquivo aparecia na contagem exata de outro — o CI de
`b653195` caiu assim. Teste que grava limpa o que criou, em `finally`.

### Estado de ação: um tipo só

Toda Server Action devolve `ActionState` de `@/lib/action-state`, e todo
sucesso passa por `gravou()`, que carimba um `token` novo.

O `token` é o que permite fechar diálogo e limpar formulário **sem**
`useEffect`: a tela usa como `key`, ou compara com o último visto durante a
renderização. Comparar `ok` não serve — ele continua verdadeiro depois do
primeiro sucesso, e a segunda gravação não seria percebida.

Para diálogo, use `FormDialog` (`@/components/form-dialog`): ele embrulha a
ação e fecha quando a resposta tem `ok`, dentro da transição; o formulário
vive num componente interno com `key` nova a cada abertura. Ação que para
para perguntar (contato parecido, CON-4) devolve o aviso sem `ok`, e a prop
`aviso` o desenha, com `reenviarCom` para a confirmação.

### Limpar formulário depois do sucesso: `key`, não `useEffect`

O jeito intuitivo — `useEffect(() => { if (state.ok) form.reset() })` — é o que
produzia os sete erros de `set-state-in-effect`. O jeito sem efeito: o bloco de
criação vive em componente próprio e a tela o remonta com
`key={state.token ?? "novo"}`. Volta limpo, campo e estado local junto.

Preferência guardada no navegador tem solução própria: `usePersistedFlag`
(`@/lib/use-persisted-flag`), sobre `useSyncExternalStore`. Ler `localStorage`
em efeito de montagem é a versão errada do mesmo problema.

### Criar vem antes da lista

Formulário de criação no topo, sempre. No fim da lista ele obriga a rolar até
embaixo a cada item novo, e a lista é justamente o que cresce. A mensagem de
erro fica grudada no formulário: aviso no pé de uma lista longa não é lido por
quem acabou de digitar lá em cima.

Vale para as quatro telas de configuração e para qualquer tela nova.

### Raio de canto — quatro papéis, e só

| Uso | Raio |
|---|---|
| Controle pequeno: campo, botão, chip de seleção | `rounded-xl` |
| Linha de lista, item de árvore, cartão de quadro | `rounded-2xl` |
| Superfície: cartão, painel, área de criação, tabela | `rounded-3xl` |
| Avatar, etiqueta, pílula, indicador | `rounded-full` |

`rounded-md`, `rounded-lg` e `rounded-4xl` ficam de fora — os dois primeiros
ainda aparecem dentro de `src/components/ui/`, que é código gerado pelo
shadcn e não se edita à mão.

### Cor de botão e ícone

Nada de ícone de ação em cinza — foi o que fez a tela inteira parecer desligada.

| Elemento | Cor |
|---|---|
| Ação primária, selo de estado | `bg-primary` cheio |
| Ícone de navegação e edição — subir, descer, `+`, lápis, restaurar | `text-primary` |
| Ícone de pasta, contador, indicador de atenção | `text-brand` / `bg-brand` |
| Excluir | `text-primary/60`, virando `hover:text-destructive` |

Excluir fica discreto até o mouse chegar de propósito: botão vermelho
permanente convida ao clique acidental. O laranja é reservado ao que chama
atenção — não vira cor de moldura nem de fundo de bloco.

### Cor vem de token, sempre

Nada de `bg-emerald-500`, `text-slate-600` e afins: a paleta do Tailwind não é
a da Duli. Use `primary`, `brand`, `success`, `warning`, `destructive`,
`muted`, `accent` — definidos em `src/app/globals.css`. Um token trocado lá
muda o app inteiro, inclusive o modo escuro; um hex espalhado pelas telas não.

### Borda tracejada quer dizer uma coisa só

Tracejado marca **espaço que ainda vai ser preenchido**: estado vazio e área de
criação. Não é decoração de cartão comum.

### Editor das Observações: Plate vendorizado, sincronia nossa

Os componentes do Plate vieram do registro shadcn e moram em
`src/components/ui/*-node.tsx`, `*-toolbar*.tsx` e
`src/components/editor/plugins/`. São código nosso a partir daí: traduzidos,
sem IA, comentários e sugestões. Reinstalar pelo registro **nunca** com
`--overwrite` — sobrescreveria `button`, `dropdown-menu` e outros
componentes base do app, e desfaria a tradução. Arquivo que veio do Plate e
não passa no lint leva no topo o `eslint-disable` da regra, com o motivo.

Tempo real: `src/features/pages/sincronia.ts` tem a lógica (testada sem
rede); `provedor-supabase.ts` só traduz para tabelas e canal. O banco é a
fonte da verdade — o canal só adianta. Mudou a sincronia, o teste de
convergência vem antes. Arquivo colado na página vai para o bucket
`observacoes` e o nó guarda `/api/observacoes/arquivo?c=…`, nunca URL
assinada (expira).

## Antes de dar algo por pronto

`bun run build`, `bun x tsc --noEmit` e `bun test` passando. Para mudança de
schema, o teste de RLS: usuário da organização A não enxerga dado da
organização B.

`bun run verify` faz tipos, lint, testes de unidade e de RLS; o build e a
fumaça (`bun run test:fumaca`, com o servidor local no ar) rodam à parte.

**A VPS não monta o repositório inteiro.** O `.dockerignore` tira `tests/`,
`migration/`, `supabase/`, `docs/` e outras, e o `next build` confere os tipos
de todo `.ts` que recebe — inclusive teste dentro de `src/`. O CI tem tudo, então
passa onde a VPS quebra: em 19/nov, um teste em `src/` importando `migration/`
segurou os dois pushes da entrega 2 por horas. Nada que entra na montagem importa
dessas pastas (`src/lib/contexto-do-docker.test.ts` confere), e o teste de um
script de `migration/` mora em `migration/`. Depois do push, `/api/versao` diz
qual commit está no ar.

Lint em **zero**, sem exceção herdada. Era 7, todos de `setState` dentro de
`useEffect`; foram pagos, não administrados. Se voltar a subir, o commit não
acontece — a trava local recusa antes.

**Revisão de código antes de dar por pronto.** Toda funcionalidade nasce na
spec (`docs/spec.md`, "Como uma funcionalidade nasce") com critério de aceite,
e termina com a revisão de código do superpowers (`requesting-code-review`)
sobre o intervalo de commits dela, tendo a seção da spec como requisito.
Crítico e Importante se corrigem antes de dizer que está pronto; achado
recusado fica registrado com o motivo. O roteiro inteiro, inclusive atualizar
spec, `docs/banco.md` e este arquivo no fim, está na skill
`criar-funcionalidade` (`.claude/skills/criar-funcionalidade`).

## Migrations: arquivo sempre, no mesmo commit

Toda alteração de schema vira arquivo em `supabase/migrations/`, no mesmo commit
em que é aplicada no banco — inclusive quando aplicada por ferramenta que não
gera o arquivo sozinha.

Sem isso os arquivos deixam de recriar o banco do zero, e some a possibilidade
de ambiente de teste, de restauração após acidente, e de outra pessoa começar a
trabalhar no projeto. É dívida que só aparece no pior momento.

Ver `supabase/migrations/README.md` para o estado atual e o desencontro
conhecido da 0001/0002.

**E os tipos junto.** `src/lib/supabase/database.types.ts` é regenerado no mesmo
commit de toda migration. Os quatro clientes (`server.ts`, `client.ts`,
`proxy.ts` e `anonimo.ts`, o da ficha pública) são `<Database>`: tipo de linha se deriva de `Tables<"…">` e
`Enums<"…">`, nunca se reescreve à mão, e `as unknown as` sobre dado do banco
não entra — se o compilador reclama, o formato mudou e a tela quebraria.
