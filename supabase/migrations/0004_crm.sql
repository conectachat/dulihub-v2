-- =============================================================================
-- 0004_crm — Funil, tags, notas, atividades, arquivos e produtos
--
-- Aqui o problema central do app antigo deixa de existir.
--
-- No schema antigo, tag existia duas vezes (contact_tags e lead_tags), produto
-- existia duas vezes (lead_products e client_products), nota existia duas
-- vezes, arquivo existia duas vezes. Quando um lead virava cliente, um serviço
-- de 358 linhas copiava tudo de um universo para o outro — e o que ele não
-- copiava, se perdia.
--
-- Aqui cada conceito existe UMA vez e pendura na pessoa. Virar cliente é
-- trocar `lifecycle_stage`. Nada é copiado, porque nada estava separado.
--
-- REGRA DE ACESSO
--
-- Todas as tabelas filhas herdam a visibilidade da pessoa, através de
-- `private.can_access_person`. A regra mora num lugar só: mudou lá, mudou em
-- todas. Isso importa por causa da alocação — quando a parceira marca a Duli
-- num cliente dela, a Duli precisa enxergar as notas e arquivos daquele
-- cliente, não só o cadastro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Regra de acesso compartilhada
-- -----------------------------------------------------------------------------
create or replace function private.can_access_person(p_person_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from people p
    where p.id = p_person_id
      and (
        p.organization_id          in (select organization_id from organization_members where user_id = auth.uid())
        or p.assigned_organization_id in (select organization_id from organization_members where user_id = auth.uid())
        or p.user_id = auth.uid()
      )
  )
$$;

revoke execute on function private.can_access_person(uuid) from public, anon;
grant  execute on function private.can_access_person(uuid) to authenticated;

-- =============================================================================
-- TAGS — uma só, usada em qualquer estágio da pessoa
-- =============================================================================

create table tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  color           text,
  created_at      timestamptz not null default now()
);

create unique index tags_org_name_unique on tags (organization_id, lower(name));

create table person_tags (
  person_id  uuid not null references people(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_id, tag_id)
);

create index person_tags_tag_idx on person_tags (tag_id);

-- =============================================================================
-- FUNIL
-- =============================================================================

create table pipelines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  is_default      boolean not null default false,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Um funil padrão por organização.
create unique index pipelines_one_default
  on pipelines (organization_id)
  where is_default;

create trigger pipelines_set_updated_at
  before update on pipelines
  for each row execute function private.set_updated_at();

create table pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  -- Probabilidade sugerida ao chegar nesta etapa (0 a 100).
  probability integer check (probability between 0 and 100),
  -- Etapas terminais. Servem para o funil saber onde a oportunidade encerra.
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint pipeline_stages_not_both_terminal check (not (is_won and is_lost))
);

create index pipeline_stages_pipeline_idx on pipeline_stages (pipeline_id, position);

-- =============================================================================
-- OPORTUNIDADES
--
-- Substitui a tabela `leads` do app antigo. A diferença é que aqui a
-- oportunidade NÃO é a pessoa: é um negócio que pertence a uma pessoa. Uma
-- pessoa pode ter mais de uma ao longo do tempo sem duplicar cadastro.
-- =============================================================================

create type opportunity_status as enum ('open', 'won', 'lost');

create table opportunities (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  person_id           uuid not null references people(id) on delete cascade,
  pipeline_id         uuid not null references pipelines(id),
  stage_id            uuid not null references pipeline_stages(id),

  title               text not null,
  status              opportunity_status not null default 'open',

  -- Multi-moeda desde o início: a Duli cobra em real e em dólar.
  value               numeric(14,2),
  currency            char(3) not null default 'BRL',

  probability         integer check (probability between 0 and 100),
  source              text,
  owner_id            uuid references profiles(id) on delete set null,

  expected_close_date date,
  closed_at           timestamptz,
  lost_reason         text,

  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Oportunidade encerrada precisa de data de encerramento, e vice-versa.
  constraint opportunities_closed_consistency check (
    (status = 'open' and closed_at is null)
    or (status <> 'open' and closed_at is not null)
  )
);

create index opportunities_person_idx   on opportunities (person_id);
create index opportunities_stage_idx    on opportunities (stage_id) where status = 'open';
create index opportunities_org_idx      on opportunities (organization_id, status);

create trigger opportunities_set_updated_at
  before update on opportunities
  for each row execute function private.set_updated_at();

create or replace function private.can_access_opportunity(p_opportunity_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from opportunities o
    where o.id = p_opportunity_id
      and private.can_access_person(o.person_id)
  )
$$;

revoke execute on function private.can_access_opportunity(uuid) from public, anon;
grant  execute on function private.can_access_opportunity(uuid) to authenticated;

-- =============================================================================
-- PRODUTOS — catálogo por organização, um só
-- =============================================================================

create table products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  description     text,
  default_price   numeric(14,2),
  currency        char(3) not null default 'BRL',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_org_idx on products (organization_id) where is_active;

create trigger products_set_updated_at
  before update on products
  for each row execute function private.set_updated_at();

create table opportunity_products (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  product_id     uuid not null references products(id),
  quantity       numeric(10,2) not null default 1,
  -- Preço registrado no momento da negociação: mudar o catálogo depois não
  -- pode alterar o que já foi acordado.
  unit_price     numeric(14,2) not null,
  currency       char(3) not null default 'BRL',
  created_at     timestamptz not null default now()
);

create index opportunity_products_opp_idx on opportunity_products (opportunity_id);

-- =============================================================================
-- NOTAS, ATIVIDADES E ARQUIVOS
--
-- Pendem da pessoa e, opcionalmente, de uma oportunidade dela. No app antigo
-- eram tabelas separadas por estágio (lead_notes, project_notes, lead_files,
-- client_documents) e não sobreviviam à conversão.
-- =============================================================================

create table notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id       uuid not null references people(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete set null,
  body            text not null,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index notes_person_idx on notes (person_id, created_at desc);

create trigger notes_set_updated_at
  before update on notes
  for each row execute function private.set_updated_at();

create table activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id       uuid not null references people(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete set null,
  -- Livre de propósito: ligação, reunião, email, mudança de etapa, etc.
  -- Enum aqui engessaria sem ganho.
  type            text not null,
  description     text,
  occurred_at     timestamptz not null default now(),
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index activities_person_idx on activities (person_id, occurred_at desc);

create table files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id       uuid not null references people(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete set null,
  bucket          text not null,
  -- Caminho no storage. O banco guarda o caminho, não o arquivo.
  path            text not null,
  filename        text not null,
  size_bytes      bigint,
  mime_type       text,
  uploaded_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create unique index files_bucket_path_unique on files (bucket, path);
create index files_person_idx on files (person_id, created_at desc);

-- =============================================================================
-- RLS
-- =============================================================================

alter table tags                 enable row level security;
alter table person_tags          enable row level security;
alter table pipelines            enable row level security;
alter table pipeline_stages      enable row level security;
alter table opportunities        enable row level security;
alter table products             enable row level security;
alter table opportunity_products enable row level security;
alter table notes                enable row level security;
alter table activities           enable row level security;
alter table files                enable row level security;

-- Tabelas escopadas direto pela organização.
create policy tags_all on tags
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy pipelines_all on pipelines
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy products_all on products
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- Etapas seguem o funil.
create policy pipeline_stages_all on pipeline_stages
  for all to authenticated
  using (
    pipeline_id in (
      select id from pipelines
      where organization_id in (select private.current_user_organizations())
    )
  )
  with check (
    pipeline_id in (
      select id from pipelines
      where organization_id in (select private.current_user_organizations())
    )
  );

-- Tabelas que herdam o acesso da pessoa. Inclui o caso da alocação: cliente
-- da parceira alocado à Duli é visível para as duas organizações.
create policy person_tags_all on person_tags
  for all to authenticated
  using ((select private.can_access_person(person_id)))
  with check ((select private.can_access_person(person_id)));

create policy opportunities_all on opportunities
  for all to authenticated
  using ((select private.can_access_person(person_id)))
  with check ((select private.can_access_person(person_id)));

create policy notes_all on notes
  for all to authenticated
  using ((select private.can_access_person(person_id)))
  with check ((select private.can_access_person(person_id)));

create policy activities_all on activities
  for all to authenticated
  using ((select private.can_access_person(person_id)))
  with check ((select private.can_access_person(person_id)));

create policy files_all on files
  for all to authenticated
  using ((select private.can_access_person(person_id)))
  with check ((select private.can_access_person(person_id)));

create policy opportunity_products_all on opportunity_products
  for all to authenticated
  using ((select private.can_access_opportunity(opportunity_id)))
  with check ((select private.can_access_opportunity(opportunity_id)));
