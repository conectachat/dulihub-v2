-- 0026 — pasta resolvida só com tudo aprovado
--
-- Decisão do Renato (19/set): marcar a pasta como resolvida **bloqueia**
-- enquanto houver arquivo em análise ou recusado. A regra mora no banco para
-- valer mesmo se a tela falhar, e para o portal do cliente (Fase 6) herdar.
--
-- 1. Resolver com pendência → erro com mensagem em português.
-- 2. Arquivo novo, ou arquivo que volta a pendente ou é recusado, numa pasta
--    resolvida → a pasta reabre. Sem isso ela seguiria "resolvida" com
--    arquivo que ninguém revisou, e a barra de progresso mentiria.
-- 3. `swap_positions` aceita `project_documents` (subir e descer pasta).
--
-- Testes: `tests/rls/documentos.test.ts`, vermelhos antes desta migration.

create or replace function private.pasta_so_resolve_aprovada()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.resolved_at is not null
     and (tg_op = 'INSERT' or old.resolved_at is null)
     and exists (
       select 1 from public.document_files f
       where f.project_document_id = new.id
         and f.review_status in ('pending', 'rejected')
     )
  then
    raise exception 'Ainda há arquivos em análise ou recusados nesta pasta.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger project_documents_so_resolve_aprovada
  before insert or update of resolved_at on public.project_documents
  for each row execute function private.pasta_so_resolve_aprovada();

create or replace function private.arquivo_pendente_reabre_pasta()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.review_status in ('pending', 'rejected') then
    update public.project_documents
    set resolved_at = null, resolved_by = null
    where id = new.project_document_id and resolved_at is not null;
  end if;
  return null;
end;
$$;

create trigger document_files_reabre_pasta
  after insert or update of review_status on public.document_files
  for each row execute function private.arquivo_pendente_reabre_pasta();

create or replace function public.swap_positions(
  p_tabela text,
  p_a uuid,
  p_b uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pos_a integer;
  v_pos_b integer;
begin
  if p_tabela not in (
    'pipeline_stages', 'stage_statuses', 'document_types',
    'visa_stages', 'visa_type_documents', 'project_stages', 'project_documents'
  ) then
    raise exception 'Tabela não permitida para reordenação.'
      using errcode = 'check_violation';
  end if;

  execute format('select position from public.%I where id = $1', p_tabela)
    into v_pos_a using p_a;
  execute format('select position from public.%I where id = $1', p_tabela)
    into v_pos_b using p_b;

  -- Nulo aqui é as duas coisas ao mesmo tempo: não existe, ou a RLS escondeu.
  if v_pos_a is null or v_pos_b is null then
    raise exception 'Registro não encontrado, ou sem permissão para reordenar.'
      using errcode = 'no_data_found';
  end if;

  execute format('update public.%I set position = -1 where id = $1', p_tabela)
    using p_a;
  execute format('update public.%I set position = $2 where id = $1', p_tabela)
    using p_b, v_pos_a;
  execute format('update public.%I set position = $2 where id = $1', p_tabela)
    using p_a, v_pos_b;
end;
$$;
