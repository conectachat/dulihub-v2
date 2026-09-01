-- =============================================================================
-- 0003_private_schema — Tira as funções auxiliares da API pública
--
-- PROBLEMA CORRIGIDO AQUI
--
-- A 0001 criou seis funções `security definer` no schema `public`. O PostgREST
-- expõe automaticamente tudo que está em `public`, então as seis ficaram
-- chamáveis por qualquer um em `/rest/v1/rpc/<nome>` — inclusive pelo papel
-- `anon`, sem login.
--
-- `security definer` roda com os privilégios do DONO da função, não de quem
-- chama. Ou seja: são funções que ignoram RLS, publicadas como endpoint aberto.
-- O verificador do Supabase apontou seis vezes (lints 0028 e 0029).
--
-- A orientação oficial é direta: "Security-definer functions should never be
-- created in a schema in the Exposed schemas". A correção é mover para um
-- schema não exposto. As policies continuam funcionando porque referenciam a
-- função pelo identificador interno, não pelo caminho da API.
--
-- Também corrige `set_updated_at`, que estava sem `search_path` fixo (lint
-- 0011) — sem isso, quem controlar o search_path da sessão pode desviar a
-- resolução de nomes dentro da função.
-- =============================================================================

create schema if not exists private;

-- `usage` permite chamar funções do schema, não listar o conteúdo dele.
-- O PostgREST só publica `public`, então nada aqui vira endpoint.
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Mover as seis funções. Triggers e policies seguem apontando para elas
-- automaticamente: a referência é por identificador interno, não por nome.
-- -----------------------------------------------------------------------------
alter function public.set_updated_at()             set schema private;
alter function public.handle_new_user()            set schema private;
alter function public.people_guard_self_update()   set schema private;
alter function public.current_user_organizations() set schema private;
alter function public.current_user_is_root()       set schema private;
alter function public.current_user_manages(uuid)   set schema private;

-- search_path fixo. `set_updated_at` só usa now(), que vive em pg_catalog e
-- está sempre no caminho — então vazio basta e é o mais restritivo.
alter function private.set_updated_at() set search_path = '';

-- -----------------------------------------------------------------------------
-- Permissões
--
-- Funções de gatilho não precisam de `execute` para ninguém: o Postgres não
-- checa esse privilégio quando um trigger dispara.
--
-- As três auxiliares de RLS precisam ser executáveis por `authenticated`,
-- porque a expressão da policy roda com o papel de quem consulta. `anon` não
-- precisa: todas as policies são `to authenticated`.
-- -----------------------------------------------------------------------------
revoke execute on function private.set_updated_at()           from public, anon, authenticated;
revoke execute on function private.handle_new_user()          from public, anon, authenticated;
revoke execute on function private.people_guard_self_update() from public, anon, authenticated;

revoke execute on function private.current_user_organizations() from public, anon;
revoke execute on function private.current_user_is_root()       from public, anon;
revoke execute on function private.current_user_manages(uuid)   from public, anon;

grant execute on function private.current_user_organizations() to authenticated;
grant execute on function private.current_user_is_root()       to authenticated;
grant execute on function private.current_user_manages(uuid)   to authenticated;

-- Impede que funções futuras em `public` ganhem execute automático.
alter default privileges in schema public revoke execute on functions from anon, public;

-- -----------------------------------------------------------------------------
-- Recriar as policies com o schema explícito e com a chamada envolvida em
-- `(select ...)`.
--
-- O `(select ...)` não é estética: faz o Postgres avaliar a função uma vez por
-- comando em vez de uma vez por linha. A própria documentação de performance
-- do Supabase mede reduções de 178.000 ms para 12 ms nesse padrão.
-- -----------------------------------------------------------------------------

-- ---- organizations ----------------------------------------------------------
drop policy if exists organizations_select on organizations;
drop policy if exists organizations_insert on organizations;
drop policy if exists organizations_update on organizations;

create policy organizations_select on organizations
  for select to authenticated
  using (
    id in (select private.current_user_organizations())
    or (select private.current_user_is_root())
  );

create policy organizations_insert on organizations
  for insert to authenticated
  with check ((select private.current_user_is_root()));

create policy organizations_update on organizations
  for update to authenticated
  using ((select private.current_user_manages(id)) or (select private.current_user_is_root()))
  with check ((select private.current_user_manages(id)) or (select private.current_user_is_root()));

-- ---- profiles ---------------------------------------------------------------
drop policy if exists profiles_select_colleagues on profiles;

create policy profiles_select_colleagues on profiles
  for select to authenticated
  using (
    exists (
      select 1
      from organization_members m
      where m.user_id = profiles.id
        and m.organization_id in (select private.current_user_organizations())
    )
  );

-- ---- organization_members ---------------------------------------------------
drop policy if exists organization_members_select on organization_members;
drop policy if exists organization_members_write on organization_members;

create policy organization_members_select on organization_members
  for select to authenticated
  using (
    organization_id in (select private.current_user_organizations())
    or (select private.current_user_is_root())
  );

create policy organization_members_write on organization_members
  for all to authenticated
  using ((select private.current_user_manages(organization_id)) or (select private.current_user_is_root()))
  with check ((select private.current_user_manages(organization_id)) or (select private.current_user_is_root()));

-- ---- people -----------------------------------------------------------------
drop policy if exists people_select on people;
drop policy if exists people_insert on people;
drop policy if exists people_update_staff on people;
drop policy if exists people_delete on people;

create policy people_select on people
  for select to authenticated
  using (
    organization_id in (select private.current_user_organizations())
    or assigned_organization_id in (select private.current_user_organizations())
    or user_id = (select auth.uid())
  );

create policy people_insert on people
  for insert to authenticated
  with check (organization_id in (select private.current_user_organizations()));

create policy people_update_staff on people
  for update to authenticated
  using (
    organization_id in (select private.current_user_organizations())
    or assigned_organization_id in (select private.current_user_organizations())
  )
  with check (
    organization_id in (select private.current_user_organizations())
    or assigned_organization_id in (select private.current_user_organizations())
  );

create policy people_delete on people
  for delete to authenticated
  using (
    (select private.current_user_manages(organization_id))
    or (select private.current_user_is_root())
  );
