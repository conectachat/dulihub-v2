-- =============================================================================
-- 0013 — Funções privilegiadas com nome qualificado e search_path vazio
--
-- O defeito, encontrado em 03/set/2026 e confirmado no banco:
--
--     ERROR 42883: function current_user_organizations() does not exist
--     CONTEXT: private.people_guard_self_update() line 3 at IF
--
-- A 0003 moveu as funções auxiliares de `public` para `private`, mas
-- `people_guard_self_update` continuou com `search_path = public` e chamando
-- `current_user_organizations()` sem qualificar. A função não está mais em
-- `public`, então **todo UPDATE em `people` erguia exceção** — e como as três
-- ações que atualizam pessoa descartam o erro, nada aparecia na tela:
--
--   - excluir contato (lixeira) não excluía
--   - restaurar contato não restaurava
--   - ganhar uma oportunidade não promovia a pessoa a cliente
--
-- Três funcionalidades mortas, em silêncio, desde a 0003.
--
-- A correção não é qualificar aquela linha. É tirar a classe do problema:
-- todas as sete funções `security definer` passam a ter `search_path = ''` e
-- referência qualificada. Com o caminho vazio, nome não qualificado nem
-- resolve — o erro aparece na hora de criar a função, não meses depois em
-- produção. É o que a 0009 já tinha feito para as funções de gatilho, e que
-- não foi estendido às demais na época.
--
-- De quebra, `auth.uid()` passa a ser chamada uma vez por consulta em vez de
-- uma vez por linha, envolvendo em subconsulta — recomendação da própria
-- Supabase para RLS.
-- =============================================================================

create or replace function private.current_user_organizations()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select organization_id
  from public.organization_members
  where user_id = (select auth.uid())
$$;

create or replace function private.current_user_is_root()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = (select auth.uid())
      and o.type = 'root'
  )
$$;

create or replace function private.current_user_manages(org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members
    where user_id = (select auth.uid())
      and organization_id = org_id
      and role in ('owner', 'admin')
  )
$$;

create or replace function private.can_access_person(p_person_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people p
    where p.id = p_person_id
      and (
        p.organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or p.assigned_organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or p.user_id = (select auth.uid())
      )
  )
$$;

create or replace function private.can_access_opportunity(p_opportunity_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.opportunities o
    where o.id = p_opportunity_id and private.can_access_person(o.person_id)
  )
$$;

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
  end if;
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
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

-- Gatilho não checa privilégio de execução: ninguém precisa poder chamar.
revoke execute on function private.people_guard_self_update() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- As auxiliares de RLS, sim: a policy as chama em nome de quem está logado.
revoke execute on function private.current_user_organizations() from public, anon;
revoke execute on function private.current_user_is_root() from public, anon;
revoke execute on function private.current_user_manages(uuid) from public, anon;
revoke execute on function private.can_access_person(uuid) from public, anon;
revoke execute on function private.can_access_opportunity(uuid) from public, anon;

grant execute on function private.current_user_organizations() to authenticated;
grant execute on function private.current_user_is_root() to authenticated;
grant execute on function private.current_user_manages(uuid) to authenticated;
grant execute on function private.can_access_person(uuid) to authenticated;
grant execute on function private.can_access_opportunity(uuid) to authenticated;
