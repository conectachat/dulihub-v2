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

### Limpar formulário depois do sucesso: `key`, não `useEffect`

O jeito intuitivo — `useEffect(() => { if (state.ok) form.reset() })` — é o que
produz os erros de `set-state-in-effect` que o projeto ainda carrega. O jeito
sem efeito: a Server Action devolve um `token` que muda a cada sucesso, e a
tela usa esse token como `key` do bloco de criação. React remonta o bloco e ele
volta limpo, campo e estado local junto. Ver
`stage-status-actions.ts` e `stage-statuses-editor.tsx`.

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

`bun x eslint src` acusa 7 erros herdados, todos de `setState` dentro de
`useEffect` (fechar diálogo e limpar formulário depois do sucesso, e a leitura
da preferência da sidebar). Não cresça esse número — o padrão do `key` acima
resolve o caso do formulário, e é como a tela de status de etapas foi feita.

## Migrations: arquivo sempre, no mesmo commit

Toda alteração de schema vira arquivo em `supabase/migrations/`, no mesmo commit
em que é aplicada no banco — inclusive quando aplicada por ferramenta que não
gera o arquivo sozinha.

Sem isso os arquivos deixam de recriar o banco do zero, e some a possibilidade
de ambiente de teste, de restauração após acidente, e de outra pessoa começar a
trabalhar no projeto. É dívida que só aparece no pior momento.

Ver `supabase/migrations/README.md` para o estado atual e o desencontro
conhecido da 0001/0002.
