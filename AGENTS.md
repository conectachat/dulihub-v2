<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# DuliHub — convenções do projeto

App interno da Duli Consulting (consultoria de imigração). Substitui o app
anterior feito no Lovable. Contexto e fases no plano da reconstrução.

## Regras que não se negociam

**Gerenciador de pacote: `bun`.** Nunca `npm`.

**Leitura de dado acontece no servidor.** Server Components e Server Actions
usam `@/lib/supabase/server`. O cliente de navegador (`@/lib/supabase/client`)
só entra onde a interatividade exige — realtime, upload com progresso. Este app
carrega passaporte, comprovante de renda e contrato: dado sensível não passa
pelo navegador sem motivo.

**`getUser()`, nunca `getSession()`** para decidir permissão. `getSession()`
apenas lê o cookie, que o cliente pode forjar. `getUser()` revalida no servidor.

**RLS é a segurança real.** Verificação na interface é conveniência, não
proteção. Toda tabela nova nasce com RLS ligada e policy escrita na mesma
migration.

**Todo dado de negócio carrega `organization_id`.** A Duli é a organização
raiz; cada parceiro é uma organização com marca própria. Nenhuma query
confia no `organization_id` vindo do cliente — quem filtra é a RLS.

## Estrutura

```
src/
  app/                    rotas e layouts, nada de lógica de negócio
  features/<dominio>/
    actions.ts            Server Actions ("use server")
    queries.ts            leitura no servidor
    schema.ts             validação Zod
    components/           componentes do domínio
  components/ui/          shadcn/ui, não editar à mão
  lib/supabase/           os três clientes
```

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

Falta um? Extraia para `src/components/` na segunda cópia, não na terceira.

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

### Estado de ação: um tipo só

Toda Server Action devolve `ActionState` de `@/lib/action-state`, e todo
sucesso passa por `gravou()`, que carimba um `token` novo.

O `token` é o que permite fechar diálogo e limpar formulário **sem**
`useEffect`: a tela usa como `key`, ou compara com o último visto durante a
renderização. Comparar `ok` não serve — ele continua verdadeiro depois do
primeiro sucesso, e a segunda gravação não seria percebida.

`useDialogOnSuccess` (`@/lib/use-dialog-on-success`) faz isso para diálogo.

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

## Antes de dar algo por pronto

`bun run build`, `bun x tsc --noEmit` e `bun test` passando. Para mudança de
schema, o teste de RLS: usuário da organização A não enxerga dado da
organização B.

Um comando só faz os três: `bun run verify`.

Lint em **zero**, sem exceção herdada. Era 7, todos de `setState` dentro de
`useEffect`; foram pagos, não administrados. Se voltar a subir, o commit não
acontece — a trava local recusa antes.

## Migrations: arquivo sempre, no mesmo commit

Toda alteração de schema vira arquivo em `supabase/migrations/`, no mesmo commit
em que é aplicada no banco — inclusive quando aplicada por ferramenta que não
gera o arquivo sozinha.

Sem isso os arquivos deixam de recriar o banco do zero, e some a possibilidade
de ambiente de teste, de restauração após acidente, e de outra pessoa começar a
trabalhar no projeto. É dívida que só aparece no pior momento.

Ver `supabase/migrations/README.md` para o estado atual e o desencontro
conhecido da 0001/0002.
