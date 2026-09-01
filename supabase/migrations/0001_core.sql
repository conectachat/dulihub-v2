-- =============================================================================
-- 0001_core — Organizações, usuários e pessoas
--
-- Este é o alicerce do modelo novo. Duas decisões estruturais moram aqui:
--
-- 1. TENANCY: toda tabela de negócio carrega organization_id. A Duli é a
--    organização raiz; cada parceiro é uma organização com marca própria.
--    Isso viabiliza o white-label (o cliente da parceira vê a marca dela)
--    sem retrofit posterior — retrofitar tenancy é a refatoração mais cara
--    que existe, porque mexe em toda tabela, toda query e toda policy.
--
-- 2. PESSOA ÚNICA: contato, oportunidade e cliente deixam de ser três
--    cadastros. Viram estágios da MESMA pessoa. Tags, notas, arquivos e
--    produtos penduram na pessoa, não no estágio — então nada se perde na
--    conversão, e o serviço de conversão de 358 linhas do app antigo deixa
--    de ser necessário.
-- =============================================================================

-- Necessário para gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Gatilho compartilhado de updated_at
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- ORGANIZATIONS
-- =============================================================================

create type organization_type as enum ('root', 'partner');

create table organizations (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name                text not null,
  type                organization_type not null default 'partner',

  -- Marca que o cliente final enxerga. Para um parceiro, é a marca DELE:
  -- o cliente da Thais vê a Thais, e a Duli aparece como colaboradora.
  logo_url            text,
  primary_color       text,
  secondary_color     text,

  -- Dados cadastrais/fiscais da organização
  legal_name          text,
  tax_id              text,          -- CNPJ
  email               text,
  phone               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Só pode existir uma organização raiz (a Duli).
create unique index organizations_single_root
  on organizations (type)
  where type = 'root';

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- =============================================================================
-- PROFILES — espelho de auth.users
-- =============================================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Cria o profile automaticamente quando um usuário se registra.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- ORGANIZATION_MEMBERS — quem trabalha em qual organização
--
-- Importante: CLIENTES NÃO ENTRAM AQUI. O acesso do cliente deriva da linha
-- dele em `people` (people.user_id). Isso mantém as policies simples e evita
-- que um cliente ganhe visão de organização por engano.
-- =============================================================================

create type member_role as enum ('owner', 'admin', 'staff');

create table organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  role             member_role not null default 'staff',
  created_at       timestamptz not null default now(),

  unique (organization_id, user_id)
);

create index organization_members_user_idx on organization_members (user_id);

-- =============================================================================
-- Funções auxiliares de RLS
--
-- `security definer` é obrigatório: estas funções leem organization_members,
-- que tem RLS ligada. Sem isso a policy chamaria a si mesma em recursão.
-- =============================================================================

-- Organizações às quais o usuário atual pertence.
create or replace function current_user_organizations()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select organization_id
  from organization_members
  where user_id = auth.uid()
$$;

-- O usuário atual pertence à organização raiz (é da equipe Duli)?
create or replace function current_user_is_root()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from organization_members m
    join organizations o on o.id = m.organization_id
    where m.user_id = auth.uid()
      and o.type = 'root'
  )
$$;

-- O usuário atual é admin ou owner da organização informada?
create or replace function current_user_manages(org_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from organization_members
    where user_id = auth.uid()
      and organization_id = org_id
      and role in ('owner', 'admin')
  )
$$;

-- =============================================================================
-- PEOPLE — o cadastro único de pessoa
-- =============================================================================

create type person_lifecycle_stage as enum ('contact', 'opportunity', 'client');

create table people (
  id                       uuid primary key default gen_random_uuid(),

  -- Organização dona do cadastro (Duli, ou o parceiro que trouxe a pessoa).
  organization_id          uuid not null references organizations(id) on delete cascade,

  -- Alocação: o parceiro marca a Duli para trabalhar neste cliente.
  -- Nulo = só o parceiro enxerga. Preenchido = a organização alocada
  -- também enxerga e atua, "em nome do parceiro".
  assigned_organization_id uuid references organizations(id) on delete set null,

  -- Estágio no ciclo de vida. Substitui contacts/leads/client_profiles.
  lifecycle_stage          person_lifecycle_stage not null default 'contact',

  -- Login da pessoa no portal do cliente. Nulo até ela receber acesso.
  user_id                  uuid references profiles(id) on delete set null,

  -- Identidade e contato
  full_name                text not null,
  email                    text,
  phone                    text,
  phone_country_code       text,
  extra_phones             jsonb not null default '[]'::jsonb,

  -- Dados pessoais (preenchidos no onboarding, usados no contrato)
  birth_date               date,
  gender                   text,
  marital_status           text,
  nationality              text,
  birthplace               text,

  -- Documentos
  tax_id                   text,   -- CPF
  national_id              text,   -- RG
  national_id_issuer       text,   -- órgão expedidor

  -- Vínculo profissional
  company                  text,
  job_title                text,

  -- Endereço
  address_street           text,
  address_number           text,
  address_complement       text,
  address_district         text,
  address_city             text,
  address_state            text,
  address_country          text,
  address_postal_code      text,

  notes                    text,

  created_by               uuid references profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index people_organization_idx  on people (organization_id) where deleted_at is null;
create index people_assigned_idx      on people (assigned_organization_id) where assigned_organization_id is not null;
create index people_stage_idx         on people (organization_id, lifecycle_stage) where deleted_at is null;
create index people_user_idx          on people (user_id) where user_id is not null;
create index people_email_idx         on people (lower(email)) where email is not null;

-- Uma conta de login pertence a no máximo uma pessoa.
create unique index people_user_unique on people (user_id) where user_id is not null;

create trigger people_set_updated_at
  before update on people
  for each row execute function set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

alter table organizations         enable row level security;
alter table profiles              enable row level security;
alter table organization_members  enable row level security;
alter table people                enable row level security;

-- ---- organizations ----------------------------------------------------------
-- Membro enxerga a própria organização. Equipe Duli (raiz) enxerga todas,
-- porque precisa administrar os parceiros.
create policy organizations_select on organizations
  for select to authenticated
  using (
    id in (select current_user_organizations())
    or current_user_is_root()
  );

create policy organizations_insert on organizations
  for insert to authenticated
  with check (current_user_is_root());

create policy organizations_update on organizations
  for update to authenticated
  using (current_user_manages(id) or current_user_is_root())
  with check (current_user_manages(id) or current_user_is_root());

-- ---- profiles ---------------------------------------------------------------
-- Cada um lê e edita o próprio. Colegas de organização se enxergam
-- (necessário para atribuir tarefas e responsáveis).
create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_colleagues on profiles
  for select to authenticated
  using (
    exists (
      select 1
      from organization_members m
      where m.user_id = profiles.id
        and m.organization_id in (select current_user_organizations())
    )
  );

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- organization_members ---------------------------------------------------
create policy organization_members_select on organization_members
  for select to authenticated
  using (
    organization_id in (select current_user_organizations())
    or current_user_is_root()
  );

create policy organization_members_write on organization_members
  for all to authenticated
  using (current_user_manages(organization_id) or current_user_is_root())
  with check (current_user_manages(organization_id) or current_user_is_root());

-- ---- people -----------------------------------------------------------------
-- Três caminhos de visibilidade, e só três:
--   1. a pessoa é da sua organização
--   2. a pessoa foi alocada à sua organização (caso parceiro → Duli)
--   3. você É a pessoa (portal do cliente)
create policy people_select on people
  for select to authenticated
  using (
    organization_id in (select current_user_organizations())
    or assigned_organization_id in (select current_user_organizations())
    or user_id = auth.uid()
  );

create policy people_insert on people
  for insert to authenticated
  with check (organization_id in (select current_user_organizations()));

-- Equipe edita quem enxerga. O cliente edita o próprio cadastro.
--
-- Atenção: RLS sozinha NÃO limita quais colunas podem mudar — `with check`
-- só valida a linha resultante. Sem o gatilho `people_guard_self_update`
-- abaixo, um cliente poderia se promover a outro estágio ou se mover de
-- organização editando o próprio registro.
create policy people_update_staff on people
  for update to authenticated
  using (
    organization_id in (select current_user_organizations())
    or assigned_organization_id in (select current_user_organizations())
  )
  with check (
    organization_id in (select current_user_organizations())
    or assigned_organization_id in (select current_user_organizations())
  );

create policy people_update_self on people
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy people_delete on people
  for delete to authenticated
  using (current_user_manages(organization_id) or current_user_is_root());

-- -----------------------------------------------------------------------------
-- Trava de colunas na auto-edição
--
-- Quando quem edita é a própria pessoa E não pertence a nenhuma organização
-- que enxergue o registro, trata-se de um cliente usando o portal. Nesse caso
-- os campos abaixo são congelados: o cliente muda endereço e telefone, não
-- muda estágio, organização, nem documento que já foi para o contrato.
--
-- Um membro da equipe que por acaso também seja uma `people` da própria
-- organização não é afetado — a condição de organização o exclui.
-- -----------------------------------------------------------------------------
create or replace function people_guard_self_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.user_id is not null and new.user_id = auth.uid()
     and not (
       old.organization_id in (select current_user_organizations())
       or old.assigned_organization_id in (select current_user_organizations())
     )
  then
    new.organization_id          := old.organization_id;
    new.assigned_organization_id := old.assigned_organization_id;
    new.lifecycle_stage          := old.lifecycle_stage;
    new.user_id                  := old.user_id;
    new.tax_id                   := old.tax_id;
    new.national_id              := old.national_id;
    new.national_id_issuer       := old.national_id_issuer;
    new.created_by               := old.created_by;
    new.deleted_at               := old.deleted_at;
  end if;
  return new;
end;
$$;

create trigger people_guard_self_update
  before update on people
  for each row execute function people_guard_self_update();
