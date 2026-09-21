-- 0030 — manifesto e ordem absoluta
--
-- **Manifesto.** A sincronia por "o que mudou desde tal instante" tem furos
-- possíveis: duas transações que gravam fora de ordem de relógio, uma lápide
-- que expirou, um acesso revogado. Todos produzem o mesmo estrago silencioso
-- — dado velho no aparelho, exibido como atual. O manifesto é a rede: o
-- servidor diz quantas linhas cada tabela tem para quem está perguntando; se
-- a conta local não bate, o aparelho recarrega aquela tabela inteira.
--
-- Vem junto o `tombstone_horizon`: a lápide mais antiga ainda guardada.
-- Aparelho parado por mais tempo que isso não pode confiar nas lápides (pode
-- ter perdido uma), então recarrega tudo.
--
-- **Ordem absoluta.** `swap_positions` (0014) troca duas linhas de lugar.
-- Isso não é idempotente: repetir a mesma troca desfaz, e duas trocas
-- reproduzidas fora de ordem deixam a lista errada **sem erro nenhum** —
-- inaceitável para uma fila de gravações que sobe depois de horas offline.
-- `reordenar_irmaos` recebe a lista inteira na ordem final: repetir não muda
-- nada.

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
  return query
    select 'deleted_rows'::text, count(*)::bigint,
           coalesce(min(deleted_at), now())
    from public.deleted_rows;
end;
$$;

revoke execute on function public.sync_manifesto() from public, anon;
grant execute on function public.sync_manifesto() to authenticated;

comment on function public.sync_manifesto() is
  'Contagem por tabela sob a RLS de quem chama, para o espelho offline se conferir. A linha deleted_rows traz em maximo_updated_at o horizonte das lápides.';

create or replace function public.reordenar_irmaos(
  p_tabela text,
  p_ids    uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tocadas integer;
begin
  if p_tabela not in (
    'pipeline_stages', 'stage_statuses', 'document_types',
    'visa_stages', 'visa_type_documents', 'project_stages', 'project_documents'
  ) then
    raise exception 'Tabela não permitida para reordenação.'
      using errcode = 'check_violation';
  end if;

  -- A posição é o índice na lista recebida. A RLS decide o que é alcançável:
  -- id de outra organização simplesmente não casa, e a contagem abaixo
  -- denuncia.
  execute format(
    'update public.%I d set position = nova.ordem - 1
       from (select unnest($1) as id, generate_subscripts($1, 1) as ordem) nova
      where d.id = nova.id', p_tabela)
  using p_ids;

  get diagnostics v_tocadas = row_count;

  if v_tocadas <> cardinality(p_ids) then
    raise exception 'Reordenação recusada: % de % linhas alcançáveis.',
      v_tocadas, cardinality(p_ids)
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke execute on function public.reordenar_irmaos(text, uuid[]) from public, anon;
grant execute on function public.reordenar_irmaos(text, uuid[]) to authenticated;

comment on function public.reordenar_irmaos(text, uuid[]) is
  'Grava a ordem final de uma lista de irmãos. Idempotente, ao contrário de swap_positions.';
