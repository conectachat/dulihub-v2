-- 0024 — Observações do processo, editadas em tempo real
--
-- O Renato pediu uma aba Observações "com as funcionalidades completas do
-- Notion", editável por duas pessoas ao mesmo tempo (18/set). O editor é o
-- Plate; a mescla de edições simultâneas é do Yjs. Aqui fica o que o banco
-- precisa guardar e proteger:
--
-- 1. `project_pages` — uma página por processo e tipo. `snapshot` é o estado
--    Yjs compactado; `content` é o mesmo texto em JSON do Plate, legível —
--    para busca, exportação e a migração do app antigo.
-- 2. `project_page_updates` — cada edição é uma linha, só acrescentada. Duas
--    pessoas gravando juntas não se sobrescrevem: o Yjs mescla os pedaços em
--    qualquer ordem. Ninguém altera nem apaga pedaço direto.
-- 3. `compactar_pagina` — junta os pedaços num snapshot novo e apaga os que
--    entraram nele, numa transação. É a única porta para apagar pedaço.
-- 4. Canal em tempo real `pagina:<id>` — privado, com policy: só quem é da
--    organização da página entra, envia e recebe.
-- 5. Bucket `observacoes` — imagens e arquivos colados na página.
--
-- Testes: `tests/rls/paginas.test.ts`, vermelhos antes desta migration.

-- ---------------------------------------------------------------- tabelas

create table public.project_pages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  kind            text not null check (kind in ('notes')),
  snapshot        bytea,
  content         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null,

  unique (project_id, kind),
  unique (id, organization_id),

  constraint project_pages_project_same_org
    foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade
);

create table public.project_page_updates (
  id              bigint generated always as identity primary key,
  page_id         uuid not null,
  organization_id uuid not null,
  update          bytea not null,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint project_page_updates_page_same_org
    foreign key (page_id, organization_id)
    references public.project_pages (id, organization_id) on delete cascade
);

create index project_page_updates_page_idx on public.project_page_updates (page_id, id);

comment on table public.project_pages is
  'Página de texto livre do processo (Observações), editada no Plate com Yjs.';
comment on table public.project_page_updates is
  'Pedaços de edição Yjs ainda não compactados. Só acrescenta; apaga-se só por compactar_pagina.';

-- -------------------------------------------------------------------- RLS

alter table public.project_pages        enable row level security;
alter table public.project_page_updates enable row level security;

create policy project_pages_all on public.project_pages
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- Pedaços: ler e acrescentar. Sem policy de update e delete — a ausência é a
-- regra: a RLS recusa o que nenhuma policy permite.
create policy project_page_updates_select on public.project_page_updates
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy project_page_updates_insert on public.project_page_updates
  for insert to authenticated
  with check (organization_id in (select private.current_user_organizations()));

-- ------------------------------------------------------------ compactação

-- `security definer` porque apaga pedaços, e nenhuma policy deixa apagar.
-- A permissão é conferida aqui dentro, contra a organização da página: sem
-- esta checagem, qualquer usuário logado compactaria a página de qualquer um.
create or replace function public.compactar_pagina(
  p_page     uuid,
  p_snapshot bytea,
  p_ate      bigint,
  p_content  jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.project_pages
    where id = p_page
      and organization_id in (select private.current_user_organizations())
  ) then
    raise exception 'Página não encontrada.' using errcode = 'P0002';
  end if;

  update public.project_pages
  set snapshot   = p_snapshot,
      content    = p_content,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = p_page;

  delete from public.project_page_updates
  where page_id = p_page and id <= p_ate;
end;
$$;

revoke execute on function public.compactar_pagina(uuid, bytea, bigint, jsonb) from public, anon;
grant execute on function public.compactar_pagina(uuid, bytea, bigint, jsonb) to authenticated;

-- ------------------------------------------------------- canal em tempo real

-- O tópico é `pagina:<id da página>`. A comparação é por texto, sem converter
-- o tópico para uuid: tópico malformado não pode virar erro de conversão.
create policy pagina_canal_receber on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.project_pages p
      where 'pagina:' || p.id::text = (select realtime.topic())
        and p.organization_id in (select private.current_user_organizations())
    )
  );

create policy pagina_canal_enviar on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.project_pages p
      where 'pagina:' || p.id::text = (select realtime.topic())
        and p.organization_id in (select private.current_user_organizations())
    )
  );

-- ---------------------------------------------------------------- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'observacoes',
  'observacoes',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Caminho `{organização}/{processo}/{uuid}-{nome}`: a primeira pasta decide.
create policy observacoes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'observacoes'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy observacoes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'observacoes'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy observacoes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'observacoes'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );
