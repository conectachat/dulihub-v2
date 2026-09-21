-- 0032 — horizonte nulo quando não há lápide
--
-- A 0030 devolve `coalesce(min(deleted_at), now())` como horizonte das
-- lápides. Parecia uma defesa ("na dúvida, desconfie"), mas diz a coisa
-- errada: com a tabela de lápides vazia, o horizonte é o instante atual, que
-- é maior que qualquer marca d'água — todo aparelho se declara cego e
-- recarrega **todas as tabelas a cada sincronia**.
--
-- Não é hipótese: acontece em organização nova e volta a acontecer sempre que
-- a limpeza de 90 dias (0031) esvazia a tabela. E o estrago cresce com a fila
-- de gravações offline, onde recarregar é destrutivo.
--
-- Sem exclusão nenhuma não há o que se ter perdido. O valor honesto é nulo, e
-- o aparelho já trata nulo como "não estou cego".

create or replace function public.sync_manifesto()
returns table (tabela text, linhas bigint, maximo_updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t text;
begin
  -- `security invoker`: cada contagem vale a RLS de quem chamou. É por isso
  -- que o manifesto pode ser usado como prova — ele enxerga exatamente o que
  -- o aparelho enxerga.
  foreach t in array array[
    'activities', 'document_files', 'document_types', 'files', 'notes',
    'opportunities', 'opportunity_products', 'organization_members',
    'people', 'person_tags', 'pipeline_stages', 'pipelines', 'products',
    'project_documents', 'project_pages', 'project_stages', 'projects',
    'stage_statuses', 'tags', 'visa_stages', 'visa_type_documents',
    'visa_types'
  ]
  loop
    return query execute format(
      'select %L::text, count(*)::bigint, max(updated_at) from public.%I', t, t);
  end loop;

  -- O horizonte das lápides vem como uma linha a mais, no mesmo formato.
  -- Nulo quando não há nenhuma: ver o cabeçalho.
  return query
    select 'deleted_rows'::text, count(*)::bigint, min(deleted_at)
    from public.deleted_rows;
end;
$$;

comment on function public.sync_manifesto() is
  'Contagem por tabela sob a RLS de quem chama, para o espelho offline se conferir. A linha deleted_rows traz em maximo_updated_at o horizonte das lápides, nulo quando não há nenhuma.';
