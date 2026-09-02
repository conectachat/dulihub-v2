-- =============================================================================
-- 0008_visa_templates — Catálogo de documentos, tipos de visto e status
--
-- Base da Fase 2. Só a configuração: os moldes que depois serão copiados para
-- dentro de cada processo. O processo em si vem na migration seguinte.
--
-- TRÊS DECISÕES QUE SE AFASTAM DO APP ANTIGO
--
-- 1. Catálogo global de documentos. O app antigo tinha `document_categories`
--    (árvore global) E `visa_document_categories` + `visa_document_subcategories`
--    (por tipo de visto) — três tabelas para o mesmo conceito. Aqui é um
--    catálogo só, e cada tipo de visto seleciona o que exige. Corrigir o nome
--    de "Passaporte" corrige em todo lugar.
--
-- 2. Uma árvore, não dois níveis. A tabela de subcategoria antiga já tinha
--    `parent_id` apontando para si mesma: eram duas tabelas fingindo ser dois
--    níveis quando já eram N.
--
-- 3. Status de etapa vira tabela de verdade, com chave estrangeira do outro
--    lado. Antes era texto livre, e a tabela de status existia solta — dava
--    para gravar qualquer coisa, inclusive erro de digitação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Proteção de ciclo, compartilhada pelas duas árvores
--
-- Sem isto, mover um nó para baixo de um descendente próprio fecha um ciclo, e
-- toda consulta recursiva sobre a árvore entra em laço infinito. O limite de
-- 100 passos é rede de segurança: hierarquia real não passa de meia dúzia.
-- -----------------------------------------------------------------------------
create or replace function private.prevent_tree_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cursor_id uuid := new.parent_id;
  steps int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Um item não pode ser pai de si mesmo.'
      using errcode = 'check_violation';
  end if;

  while cursor_id is not null and steps < 100 loop
    if cursor_id = new.id then
      raise exception 'Essa mudança criaria um ciclo na hierarquia.'
        using errcode = 'check_violation';
    end if;
    execute format('select parent_id from %I.%I where id = $1',
                   tg_table_schema, tg_table_name)
      into cursor_id using cursor_id;
    steps := steps + 1;
  end loop;

  return new;
end;
$$;

revoke execute on function private.prevent_tree_cycle() from public, anon, authenticated;

-- =============================================================================
-- CATÁLOGO DE DOCUMENTOS — árvore de grupos, subgrupos e documentos
-- =============================================================================

create table document_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_id       uuid references document_types(id) on delete cascade,

  name            text not null,
  description     text,
  position        integer not null default 0,

  -- Grupo organiza; documento é o que o cliente efetivamente envia. A
  -- distinção existe porque a tela precisa saber onde cabe um upload.
  is_group        boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index document_types_org_idx    on document_types (organization_id, position);
create index document_types_parent_idx on document_types (parent_id);

create trigger document_types_no_cycle
  before insert or update of parent_id on document_types
  for each row execute function private.prevent_tree_cycle();

create trigger document_types_set_updated_at
  before update on document_types
  for each row execute function private.set_updated_at();

-- =============================================================================
-- TIPOS DE VISTO
-- =============================================================================

create table visa_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  name            text not null,
  description     text,

  -- Preço de referência. O valor real de cada negócio vive na oportunidade;
  -- aqui é só o ponto de partida da proposta.
  base_price      numeric(14,2),
  currency        char(3) not null default 'BRL',

  estimated_days  integer,
  is_active       boolean not null default true,
  position        integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index visa_types_org_name_unique
  on visa_types (organization_id, lower(name));

create trigger visa_types_set_updated_at
  before update on visa_types
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Molde de etapas, com sub-etapas
-- -----------------------------------------------------------------------------
create table visa_stages (
  id             uuid primary key default gen_random_uuid(),
  visa_type_id   uuid not null references visa_types(id) on delete cascade,
  parent_id      uuid references visa_stages(id) on delete cascade,

  name           text not null,
  description    text,
  position       integer not null default 0,
  is_required    boolean not null default true,
  estimated_days integer,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index visa_stages_type_idx   on visa_stages (visa_type_id, position);
create index visa_stages_parent_idx on visa_stages (parent_id);

create trigger visa_stages_no_cycle
  before insert or update of parent_id on visa_stages
  for each row execute function private.prevent_tree_cycle();

create trigger visa_stages_set_updated_at
  before update on visa_stages
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Quais documentos do catálogo este visto exige
--
-- A seleção é gravada nó a nó, mesmo quando o usuário marca um grupo inteiro.
-- Guardar só o grupo faria com que acrescentar um documento ao catálogo
-- mudasse, calado, o que um visto já exigia — e o Renato pediu explicitamente
-- que nada mude sozinho.
--
-- Obrigatoriedade e prazo são do VISTO, não do catálogo: o mesmo passaporte
-- pode ser obrigatório no EB-1A e opcional no O-1.
-- -----------------------------------------------------------------------------
create table visa_type_documents (
  id               uuid primary key default gen_random_uuid(),
  visa_type_id     uuid not null references visa_types(id) on delete cascade,
  document_type_id uuid not null references document_types(id) on delete cascade,

  is_required      boolean not null default true,
  deadline_days    integer,
  position         integer not null default 0,

  created_at       timestamptz not null default now(),

  unique (visa_type_id, document_type_id)
);

create index visa_type_documents_type_idx on visa_type_documents (visa_type_id, position);

-- =============================================================================
-- STATUS DE ETAPA — configurável, por organização
-- =============================================================================

create table stage_statuses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  code            text not null,
  label           text not null,
  color           text,
  position        integer not null default 0,

  -- Status de etapa recém-criada.
  is_default      boolean not null default false,
  -- Conta como concluída no cálculo de progresso do processo.
  is_done         boolean not null default false,
  -- Os três de fábrica: renomeiam, não se apagam.
  is_system       boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index stage_statuses_org_code_unique on stage_statuses (organization_id, code);
create unique index stage_statuses_one_default on stage_statuses (organization_id) where is_default;

create trigger stage_statuses_set_updated_at
  before update on stage_statuses
  for each row execute function private.set_updated_at();

-- Status de fábrica não se apaga: uma etapa sem status possível trava o
-- processo, e o padrão precisa existir para toda etapa nova.
create or replace function private.protect_system_statuses()
returns trigger language plpgsql as $$
begin
  if old.is_system then
    raise exception 'Status de fábrica não pode ser excluído. Renomeie se precisar.'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

revoke execute on function private.protect_system_statuses() from public, anon, authenticated;

create trigger stage_statuses_protect_system
  before delete on stage_statuses
  for each row execute function private.protect_system_statuses();

insert into stage_statuses (organization_id, code, label, color, position, is_default, is_done, is_system)
select o.id, v.code, v.label, v.color, v.position, v.is_default, v.is_done, true
from organizations o
cross join (values
  ('pending',     'Pendente',     '#64748b', 0, true,  false),
  ('in_progress', 'Em andamento', '#3b82f6', 1, false, false),
  ('done',        'Concluído',    '#22c55e', 2, false, true )
) as v(code, label, color, position, is_default, is_done)
where o.slug = 'duli';

-- =============================================================================
-- RLS
--
-- Estas tabelas são escopadas por ORGANIZAÇÃO, não por pessoa — então o padrão
-- `can_access_person` usado no CRM não serve aqui. `visa_stages` e
-- `visa_type_documents` herdam o escopo do tipo de visto a que pertencem.
-- =============================================================================

alter table document_types      enable row level security;
alter table visa_types          enable row level security;
alter table visa_stages         enable row level security;
alter table visa_type_documents enable row level security;
alter table stage_statuses      enable row level security;

create policy document_types_all on document_types
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy visa_types_all on visa_types
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy stage_statuses_all on stage_statuses
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy visa_stages_all on visa_stages
  for all to authenticated
  using (
    visa_type_id in (
      select id from visa_types
      where organization_id in (select private.current_user_organizations())
    )
  )
  with check (
    visa_type_id in (
      select id from visa_types
      where organization_id in (select private.current_user_organizations())
    )
  );

create policy visa_type_documents_all on visa_type_documents
  for all to authenticated
  using (
    visa_type_id in (
      select id from visa_types
      where organization_id in (select private.current_user_organizations())
    )
  )
  with check (
    visa_type_id in (
      select id from visa_types
      where organization_id in (select private.current_user_organizations())
    )
  );
