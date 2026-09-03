-- =============================================================================
-- 0012 — Conserta a ordem das exigências de cada tipo de visto
--
-- `visa_type_documents.position` era gravada e nunca lida. Pior: o valor vinha
-- do índice dentro da subárvore recém-marcada, então cada clique recomeçava do
-- zero — as seis pastas raiz do EB-2 NIW ficaram todas em 0, e a ordem passou
-- a depender do que o Postgres devolvesse. Parecia alfabética.
--
-- O código agora lê a coluna e acrescenta no fim da lista do visto. Falta
-- consertar o que já estava gravado, e o critério é o único que não embaralha
-- nada aos olhos de quem já montou a lista: a própria ordem do catálogo, em
-- ordem de leitura da árvore. A partir daí o Renato reordena como quiser, e a
-- ordem é do visto — o mesmo "Rendimentos" pode vir primeiro num e por último
-- noutro.
-- =============================================================================
with recursive ordem as (
  select id, parent_id, position, name,
         array[position, 0]::int[] as caminho
  from document_types
  where parent_id is null
  union all
  select c.id, c.parent_id, c.position, c.name,
         o.caminho || array[c.position, 0]::int[]
  from document_types c
  join ordem o on c.parent_id = o.id
),
numerada as (
  select d.id,
         row_number() over (
           partition by d.visa_type_id
           order by o.caminho, o.name
         ) - 1 as nova_posicao
  from visa_type_documents d
  join ordem o on o.id = d.document_type_id
)
update visa_type_documents d
   set position = n.nova_posicao
  from numerada n
 where n.id = d.id;
