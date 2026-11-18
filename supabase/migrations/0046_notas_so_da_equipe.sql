-- 0046 — notas e histórico só para a equipe (CLI-9, POR-2)
--
-- Notas e atividades são anotações da equipe **sobre** o cliente — o que
-- ele disse na ligação, a impressão do consultor, o movimento no funil —, e
-- não comunicação **com** ele. Até aqui a leitura passava por
-- `can_access_person`, que inclui a própria pessoa logada no portal
-- (`people.user_id`): o cliente lia tudo o que se escrevia sobre ele.
--
-- A leitura passa a `private.equipe_alcanca_pessoa`: a mesma regra, sem o
-- ramo do cliente — membros da organização dona e da organização atribuída.
-- A escrita não muda (`*_write`, membros da organização da linha), e
-- `can_access_person` continua valendo para as outras tabelas filhas.

create function private.equipe_alcanca_pessoa(p_person_id uuid)
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
      )
  )
$$;

-- A policy a chama em nome de quem está logado.
revoke execute on function private.equipe_alcanca_pessoa(uuid) from public, anon;
grant execute on function private.equipe_alcanca_pessoa(uuid) to authenticated;

drop policy notes_select on public.notes;
create policy notes_select on public.notes
  for select to authenticated
  using ((select private.equipe_alcanca_pessoa(person_id)));

drop policy activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using ((select private.equipe_alcanca_pessoa(person_id)));
