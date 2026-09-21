-- 0029b — tirar a lápide de `person_tags`
--
-- A 0029 pôs o gatilho de lápide em `person_tags` junto com as outras. A
-- tabela não tem coluna `id` — a chave dela é o par (person_id, tag_id) —,
-- e o gatilho lê `old.id`. Ou seja: **remover uma etiqueta de um contato
-- passaria a dar erro**. Pego pela conferência das chaves primárias antes de
-- rodar os testes; a 0029 no repositório já não a inclui, e este arquivo
-- desfaz o gatilho nos bancos onde ela chegou a entrar.
--
-- Como o espelho offline vai saber que uma etiqueta saiu de um contato: ele
-- relê `person_tags` inteira a cada sincronia. São poucas linhas por pessoa,
-- e o custo é menor que o de inventar um id para uma tabela de ligação.

drop trigger if exists person_tags_marcar_lapide on public.person_tags;

comment on table public.person_tags is
  'Etiquetas de uma pessoa. Sem lápide: a chave é o par (person_id, tag_id), não um id. O espelho offline relê a tabela inteira, que é pequena.';
