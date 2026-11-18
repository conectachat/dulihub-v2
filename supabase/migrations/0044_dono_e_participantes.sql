-- 0044 — dono e participantes do cliente e da oportunidade (CLI-10)
--
-- O cliente passa a ter um **dono** (quem responde por ele) e
-- **participantes** (quem mais acompanha). A oportunidade ganha a mesma
-- lista de participantes; o dono dela já existia (`opportunities.owner_id`).
--
-- ## Dono só pode ser membro da organização da pessoa
--
-- `people.owner_id` tem chave estrangeira **composta** com
-- `organization_members (organization_id, user_id)`: o banco recusa, como
-- `23503`, um dono que não seja membro da organização dona da pessoa. Por
-- efeito do desenho, um consultor de organização **atribuída** nunca é dono.
-- Saindo o membro, o dono vira nulo (`on delete set null (owner_id)`, só a
-- coluna do dono: a organização da pessoa não se apaga junto).
--
-- Os participantes seguem o mesmo princípio, com cascade: membro que sai
-- deixa de ser participante.
--
-- ## Trocar o dono do negócio
--
-- Hoje o app só grava `opportunities.owner_id` ao criar o negócio
-- (`criar_oportunidade`, 0041). A trava nova vale para o update: só o dono
-- atual ou a gestão (`current_user_manages`) trocam. Repetir o mesmo valor
-- passa — o `before update of owner_id` dispara sempre que a coluna está no
-- `SET`, e recusar o que não muda quebraria um update de formulário inteiro.
-- Sem usuário (migration, SQL Editor) e em cascata (`pg_trigger_depth() > 1`:
-- o `set null` de um perfil apagado), passa.
--
-- ## Fora do espelho
--
-- As duas tabelas não vão ao aparelho e não entram no `sync_manifesto`: a
-- tela que as usa (o perfil do cliente) lê do servidor. A lápide existe desde
-- já, para o dia em que entrarem.
--
-- ## Portal
--
-- `people_guard_self_update` (0013) passa a devolver também o `owner_id`: o
-- cliente do portal não escolhe o próprio dono. A 0045 acrescenta o
-- `client_since`.

-- ---------------------------------------------------------- people.owner_id

alter table public.people
  add column owner_id uuid;

alter table public.people
  add constraint people_owner_membro
    foreign key (organization_id, owner_id)
    references public.organization_members (organization_id, user_id)
    on delete set null (owner_id);

create index people_owner_idx on public.people (organization_id, owner_id)
  where owner_id is not null;

comment on column public.people.owner_id is
  'Dono do cliente: membro da organização da pessoa (FK composta).';

-- ------------------------------------------------------- person_participants

create table public.person_participants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id       uuid not null,
  user_id         uuid not null,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),
  unique (person_id, user_id),

  constraint person_participants_person_same_org
    foreign key (person_id, organization_id)
    references public.people (id, organization_id) on delete cascade,

  constraint person_participants_membro
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade
);

create index person_participants_membro_idx
  on public.person_participants (organization_id, user_id);

create trigger person_participants_set_updated_at
  before update on public.person_participants
  for each row execute function private.set_updated_at();

create trigger person_participants_marcar_lapide
  after delete on public.person_participants
  for each row execute function private.marcar_lapide();

comment on table public.person_participants is
  'Quem acompanha o cliente, além do dono. Membros da organização da pessoa.';

-- -------------------------------------------------- opportunity_participants

create table public.opportunity_participants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id  uuid not null,
  user_id         uuid not null,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),
  unique (opportunity_id, user_id),

  constraint opportunity_participants_opportunity_same_org
    foreign key (opportunity_id, organization_id)
    references public.opportunities (id, organization_id) on delete cascade,

  constraint opportunity_participants_membro
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade
);

create index opportunity_participants_membro_idx
  on public.opportunity_participants (organization_id, user_id);

create trigger opportunity_participants_set_updated_at
  before update on public.opportunity_participants
  for each row execute function private.set_updated_at();

create trigger opportunity_participants_marcar_lapide
  after delete on public.opportunity_participants
  for each row execute function private.marcar_lapide();

comment on table public.opportunity_participants is
  'Quem acompanha o negócio, além do dono. Membros da organização do negócio.';

-- ------------------------------------------------------------------------ RLS

alter table public.person_participants      enable row level security;
alter table public.opportunity_participants enable row level security;

-- Membros da organização leem e gravam. A organização atribuída não entra:
-- quem participa é sempre membro da organização dona (a FK garante), e é a
-- equipe dela quem decide.
create policy person_participants_all on public.person_participants
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy opportunity_participants_all on public.opportunity_participants
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- ---------------------------------------------- dono do negócio, protegido

create function private.opportunities_dono_protegido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     and old.owner_id is distinct from (select auth.uid())
     and not private.current_user_manages(old.organization_id) then
    raise exception 'Só o dono do negócio ou a gestão trocam o dono.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.opportunities_dono_protegido() from public, anon, authenticated;

create trigger opportunities_dono_protegido
  before update of owner_id on public.opportunities
  for each row execute function private.opportunities_dono_protegido();

-- ------------------------------------------- portal: o dono também é da equipe

create or replace function private.people_guard_self_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and new.user_id = (select auth.uid())
     and not (
       old.organization_id in (select private.current_user_organizations())
       or old.assigned_organization_id in (select private.current_user_organizations())
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
    new.owner_id                 := old.owner_id;
  end if;
  return new;
end;
$$;

revoke execute on function private.people_guard_self_update() from public, anon, authenticated;
