-- 0029 — lápides: o registro do que foi apagado
--
-- O aparelho guarda uma cópia das linhas para funcionar sem internet. Pedir
-- "o que mudou" traz o que foi criado e alterado — **nunca o que foi
-- apagado**. Sem este registro, uma pasta excluída no escritório continuaria
-- na tela de quem está viajando, para sempre, sem erro nenhum. É a pior
-- falha da arquitetura offline, porque não faz barulho.
--
-- A tabela só sabe do que for apagado **depois** que ela existe. Por isso
-- entra agora, antes de qualquer tela offline.
--
-- Escrita só pelo gatilho: nenhuma policy de insert, update ou delete — a
-- ausência é a regra, como em `project_page_updates` (0024).

create table public.deleted_rows (
  tabela          text not null,
  id              uuid not null,
  organization_id uuid not null,
  deleted_at      timestamptz not null default now(),

  primary key (tabela, id)
);

create index deleted_rows_sync_idx on public.deleted_rows (organization_id, deleted_at);

comment on table public.deleted_rows is
  'Lápides: o que foi apagado, para o espelho offline saber. Escrita só por gatilho.';

alter table public.deleted_rows enable row level security;

create policy deleted_rows_select on public.deleted_rows
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create or replace function private.marcar_lapide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `security definer` porque nenhuma policy deixa escrever aqui, e este é o
  -- único caminho. Não recebe nada de fora: tabela e linha vêm do próprio
  -- gatilho.
  insert into public.deleted_rows (tabela, id, organization_id)
  values (tg_table_name, old.id, old.organization_id)
  on conflict (tabela, id) do update set deleted_at = now();
  return old;
end;
$$;

-- Em cascata o gatilho dispara linha a linha, então filha e neta também
-- deixam rastro — que é o caso que mais importa (apagar um processo leva
-- etapas, pastas e arquivos junto).
do $$
declare
  t text;
begin
  foreach t in array array[
    'activities', 'document_files', 'document_types', 'files', 'notes',
    'opportunities', 'opportunity_products', 'organization_members',
    'people', 'pipeline_stages', 'pipelines', 'products',
    'project_documents', 'project_pages', 'project_stages', 'projects',
    'stage_statuses', 'tags', 'visa_stages', 'visa_type_documents',
    'visa_types'
  ]
  loop
    execute format(
      'create trigger %I after delete on public.%I
       for each row execute function private.marcar_lapide()',
      t || '_marcar_lapide', t);
  end loop;
end $$;

-- `person_tags` fica de fora: a chave dela é o par (person_id, tag_id), não
-- um `id`, e o gatilho acima quebraria ao apagar — remover a etiqueta de um
-- contato passaria a dar erro. É uma tabela pequena: o espelho relê inteira.

-- Retenção: 90 dias. Aparelho parado mais tempo que isso não pode confiar
-- nas lápides (pode ter perdido uma que já expirou) — relê a tabela inteira.
-- Quem avisa é o horizonte devolvido pelo manifesto (0030).
create or replace function private.limpar_lapides()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.deleted_rows where deleted_at < now() - interval '90 days';
$$;
