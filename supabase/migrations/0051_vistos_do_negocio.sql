-- 0051 — Vistos do negócio e processo que não se apaga (entrega 3, fase 1)
--
-- O negócio deixa de ter um valor só: passa a ter itens, um por visto do
-- catálogo, cada um com o valor e a moeda **do momento da negociação**.
-- Mudar o preço nas Configurações não mexe em item (CRM-13). O nome do visto
-- fica gravado (`visa_name`), para o item sobreviver ao tipo apagado.
--
-- Negócio ganho trava os itens: desistir de um visto depois do Ganho é
-- encerrar o processo dele. Só a cascata passa (§3: `pg_trigger_depth() > 1`).
--
-- O processo guarda de qual item nasceu (`opportunity_item_id`). É essa
-- ligação que impede o Ganho de criar o mesmo processo duas vezes. Duas
-- chaves estrangeiras a seguram (D18 do plano):
--   - `(item, organização)`: confere sempre e anula a ligação quando o item
--     some, seja qual for a ordem das ações ao apagar o negócio;
--   - `(item, negócio)`: o item é do negócio do processo — não se liga
--     processo a visto de outro negócio.
-- A ligação não muda depois de gravada, e processo com item precisa de
-- negócio. Sem usuário (esta migration, o SQL Editor) passa, como a 0044.
--
-- Processo nunca é apagado (PRO-12): a policy deixa de ter delete — pela API,
-- o delete apaga 0 linhas — e um gatilho recusa o delete direto. Só a
-- cascata da pessoa passa, e pessoa só se apaga na organização de teste.
--
-- Compatível com o código no ar: nada aqui recusa o Ganho antigo nem o
-- "Novo processo" (o `p_item` novo tem padrão nulo). As travas que recusam
-- o código antigo ficam para a 0054, depois do deploy.

-- ------------------------------------------------------- opportunity_items

create table public.opportunity_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id  uuid not null,
  visa_type_id    uuid,
  visa_name       text not null,
  amount          numeric(12, 2) not null check (amount >= 0),
  currency        char(3) not null check (currency in ('BRL', 'USD')),
  position        int not null default 0,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),
  -- Alvo da chave `(item, negócio)` de `projects` (D18).
  unique (id, opportunity_id),

  constraint opportunity_items_opportunity_same_org
    foreign key (opportunity_id, organization_id)
    references public.opportunities (id, organization_id) on delete cascade,

  constraint opportunity_items_visa_type_same_org
    foreign key (visa_type_id, organization_id)
    references public.visa_types (id, organization_id) on delete set null (visa_type_id)
);

create index opportunity_items_opportunity_idx
  on public.opportunity_items (opportunity_id, position);

create index opportunity_items_visa_type_idx
  on public.opportunity_items (visa_type_id) where visa_type_id is not null;

comment on table public.opportunity_items is
  'Vistos do negócio, com valor e moeda do momento da negociação (CRM-13). Travados no Ganho.';

alter table public.opportunity_items enable row level security;

-- Quem vê o negócio vê o item: a subconsulta passa pela RLS de
-- `opportunities`, sem reescrever `can_access_person` (D10).
create policy opportunity_items_select on public.opportunity_items
  for select to authenticated
  using (exists (
    select 1 from public.opportunities o where o.id = opportunity_items.opportunity_id
  ));

create policy opportunity_items_write on public.opportunity_items
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create trigger opportunity_items_guard_child_row
  before update on public.opportunity_items
  for each row execute function private.guard_child_row();

create trigger opportunity_items_set_updated_at
  before update on public.opportunity_items
  for each row execute function private.set_updated_at();

create trigger opportunity_items_marcar_lapide
  after delete on public.opportunity_items
  for each row execute function private.marcar_lapide();

-- ------------------------------------------------- o valor de hoje vira item
-- Antes da trava: o negócio com valor de hoje está ganho, e ela recusaria.

insert into public.opportunity_items
  (organization_id, opportunity_id, visa_type_id, visa_name, amount, currency, position, created_by)
select o.organization_id, o.id, null, o.title, o.value, o.currency, 0, null
from public.opportunities o
where o.value is not null
  and not exists (
    select 1 from public.opportunity_items i where i.opportunity_id = o.id
  );

-- ------------------------------------------------ trava do item no Ganho

create function private.opportunity_items_trava_do_ganho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_negocio uuid := case tg_op when 'DELETE' then old.opportunity_id else new.opportunity_id end;
  v_status  text;
begin
  -- A cascata (pessoa ou negócio apagados) e o `set null` do tipo de visto.
  if pg_trigger_depth() > 1 then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.opportunity_id is distinct from old.opportunity_id then
    raise exception 'O visto não muda de negócio.' using errcode = 'P0001';
  end if;

  -- `for share`: não corre junto com o Ganho, que trava o negócio `for update`.
  select o.status into v_status
  from public.opportunities o
  where o.id = v_negocio
  for share;

  if v_status = 'won' then
    raise exception 'Negócio ganho: os vistos não mudam. Para desistir de um visto, encerre o processo dele.'
      using errcode = 'P0001';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

revoke execute on function private.opportunity_items_trava_do_ganho() from public, anon, authenticated;

create trigger opportunity_items_trava_do_ganho
  before insert or update or delete on public.opportunity_items
  for each row execute function private.opportunity_items_trava_do_ganho();

-- -------------------------------------------- o processo e o item de origem

alter table public.projects
  add column opportunity_item_id uuid,
  add constraint projects_item_same_org
    foreign key (opportunity_item_id, organization_id)
    references public.opportunity_items (id, organization_id)
    on delete set null (opportunity_item_id),
  add constraint projects_item_do_mesmo_negocio
    foreign key (opportunity_item_id, opportunity_id)
    references public.opportunity_items (id, opportunity_id)
    on delete set null (opportunity_item_id);

create unique index projects_opportunity_item_unico
  on public.projects (opportunity_item_id)
  where opportunity_item_id is not null;

comment on column public.projects.opportunity_item_id is
  'O visto do negócio de onde o processo nasceu (Ganho). Impede o processo repetido; não muda depois de gravado.';

-- O negócio ganho de hoje tem um processo e, agora, um item: ligar os dois,
-- senão reabrir e ganhar de novo duplicaria o processo (D13).
update public.projects p
set opportunity_item_id = i.id
from public.opportunity_items i
where i.opportunity_id = p.opportunity_id
  and p.opportunity_item_id is null
  and (select count(*) from public.projects p2 where p2.opportunity_id = p.opportunity_id) = 1
  and (select count(*) from public.opportunity_items i2 where i2.opportunity_id = p.opportunity_id) = 1;

create function private.projects_item_do_negocio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- O `set null (opportunity_id)` de quando o negócio é apagado.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.opportunity_item_id is not null and new.opportunity_id is null then
    raise exception 'Processo ligado a visto do negócio precisa estar ligado ao negócio.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.projects_item_do_negocio() from public, anon, authenticated;

create trigger projects_item_do_negocio
  before insert or update of opportunity_id on public.projects
  for each row execute function private.projects_item_do_negocio();

create function private.projects_item_imutavel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.opportunity_item_id is not distinct from old.opportunity_item_id
     or (select auth.uid()) is null   -- migration e SQL Editor, como a 0044
     or pg_trigger_depth() > 1        -- o `set null` da chave estrangeira
  then
    return new;
  end if;

  raise exception 'O processo não muda de visto do negócio.' using errcode = 'P0001';
end;
$$;

revoke execute on function private.projects_item_imutavel() from public, anon, authenticated;

create trigger projects_item_imutavel
  before update of opportunity_item_id on public.projects
  for each row execute function private.projects_item_imutavel();

-- --------------------------------------------------- processo não se apaga

drop policy projects_all on public.projects;

create policy projects_select on public.projects
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (organization_id in (select private.current_user_organizations()));

create policy projects_update on public.projects
  for update to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- Segunda camada: sem policy de delete a API nunca chega aqui; o SQL Editor
-- e as funções `security definer`, sim.
create function private.projects_nunca_apagado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'Processo não se apaga: encerre-o.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke execute on function private.projects_nunca_apagado() from public, anon, authenticated;

create trigger projects_nunca_apagado
  before delete on public.projects
  for each row execute function private.projects_nunca_apagado();

-- --------------------------------------------- criar_processo com o item

drop function public.criar_processo(uuid, uuid, text, uuid);

create function public.criar_processo(
  p_person      uuid,
  p_visa_type   uuid,
  p_title       text,
  p_opportunity uuid default null,
  p_item        uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org     uuid;
  v_status  uuid;
  v_inicio  date := current_date;
  v_projeto uuid;
begin
  if p_item is not null and p_opportunity is null then
    raise exception 'Processo ligado a visto do negócio precisa estar ligado ao negócio.'
      using errcode = 'P0001';
  end if;

  select organization_id into v_org
  from public.people
  where id = p_person and deleted_at is null;

  if v_org is null then
    raise exception 'Contato não encontrado.' using errcode = 'P0002';
  end if;

  select id into v_status
  from public.stage_statuses
  where organization_id = v_org and is_default;

  if v_status is null then
    raise exception 'A organização não tem status de etapa padrão.';
  end if;

  insert into public.projects
    (organization_id, person_id, visa_type_id, opportunity_id, opportunity_item_id,
     title, started_on, created_by)
  values
    (v_org, p_person, p_visa_type, p_opportunity, p_item,
     p_title, v_inicio, (select auth.uid()))
  returning id into v_projeto;

  with molde as materialized (
    select id as antigo, gen_random_uuid() as novo, parent_id as pai_antigo,
           name, position, is_required, estimated_days
    from public.visa_stages
    where visa_type_id = p_visa_type
  )
  insert into public.project_stages
    (id, organization_id, project_id, parent_id, source_stage_id,
     name, position, is_required, estimated_days, status_id)
  select m.novo, v_org, v_projeto, pai.novo, m.antigo,
         m.name, m.position, m.is_required, m.estimated_days, v_status
  from molde m
  left join molde pai on pai.antigo = m.pai_antigo;

  with recursive exigidas as (
    select vtd.document_type_id as pasta, vtd.position, vtd.is_required,
           vtd.deadline_days, d.name, d.parent_id
    from public.visa_type_documents vtd
    join public.document_types d on d.id = vtd.document_type_id
    where vtd.visa_type_id = p_visa_type
  ),
  subida as (
    select e.pasta as origem, e.parent_id as atual, 1 as nivel
    from exigidas e
    union all
    select s.origem, d.parent_id, s.nivel + 1
    from subida s
    join public.document_types d on d.id = s.atual
    where s.atual not in (select pasta from exigidas)
      and s.nivel < 64  -- ciclo no catálogo não trava a criação
  ),
  pai_visivel as (
    select distinct on (origem) origem, atual as pai
    from subida
    where atual is null or atual in (select pasta from exigidas)
    order by origem, nivel
  ),
  novas as materialized (
    select e.*, gen_random_uuid() as novo from exigidas e
  )
  insert into public.project_documents
    (id, organization_id, project_id, parent_id, source_document_type_id,
     name, position, is_required, deadline_on)
  select n.novo, v_org, v_projeto, np.novo, n.pasta,
         n.name, n.position, n.is_required,
         case when n.deadline_days is null then null
              else v_inicio + n.deadline_days end
  from novas n
  left join pai_visivel pv on pv.origem = n.pasta
  left join novas np on np.pasta = pv.pai;

  return v_projeto;
end;
$$;

revoke execute on function public.criar_processo(uuid, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.criar_processo(uuid, uuid, text, uuid, uuid) to authenticated;

comment on function public.criar_processo(uuid, uuid, text, uuid, uuid) is
  'Cria o processo copiando o molde do visto. `p_item` liga ao visto do negócio (Ganho) e exige `p_opportunity`.';
