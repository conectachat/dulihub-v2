# Migrations

Ordem numérica. Cada arquivo traz, no topo, a decisão de modelagem que motivou
a mudança — não a tradução do SQL para português.

## Regra

**Toda alteração de schema vira arquivo aqui, no mesmo commit em que é aplicada
no banco.** Sem exceção, mesmo quando aplicada por ferramenta que não gera
arquivo sozinha.

O motivo: se os arquivos não recriam o banco do zero, não existe ambiente de
teste, nem restauração depois de acidente, nem forma de outra pessoa começar a
trabalhar no projeto. É dívida que só aparece no pior momento possível.

## Nota sobre a 0001 e a 0002

Foram aplicadas pelo SQL editor do Supabase, antes do conector estar
disponível, e por isso **não constam no histórico interno de migrations do
banco** (`supabase_migrations.schema_migrations`), que começa na 0003.

Os arquivos estão corretos e completos: aplicá-los em ordem num banco vazio
reproduz o schema. A ausência é só no registro interno, e não afeta nada
enquanto as migrations forem aplicadas em sequência a partir de um banco vazio.

## Conferência

A lista de arquivos deve bater com o que o banco tem registrado. Para conferir,
comparar `ls` desta pasta com a lista de migrations do projeto Supabase,
lembrando do desencontro conhecido da 0001 e 0002 acima.

## Tipos gerados

`src/lib/supabase/database.types.ts` é gerado a partir do banco e **não se
edita à mão**. Toda migration que muda tabela, coluna, enum ou função
regenera o arquivo **no mesmo commit** — pelo conector do Supabase
(`generate_typescript_types`).

É ele que transforma coluna renomeada em erro de compilação em vez de tela
vazia. Em 18/set, na primeira geração, apontou um teste de RLS que passava
por falta de coluna sem nunca chegar na policy.
