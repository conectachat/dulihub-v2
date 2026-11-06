-- 0036 — o papel decide, e a organização de um contato não muda
--
-- Revisão de novembro, G1 e G2.
--
-- ## G1: ser da raiz não é ser dono da raiz
--
-- `private.current_user_is_root()` responde "esta pessoa é membro da Duli",
-- sem olhar o papel. Quatro policies a usavam como se fosse "dono da Duli":
-- criar e alterar organização, escrever em `organization_members`, apagar
-- contato. Resultado: qualquer `staff` da Duli podia se promover a `owner`,
-- entrar na organização de um parceiro (e ler CPF e documentos de lá) e
-- apagar contato de vez.
--
-- Agora essas escritas exigem `private.current_user_is_root_owner()` — dono da
-- raiz. A **leitura** continua com `current_user_is_root()`; quem é da Duli vê
-- a lista de organizações e associações. Fechar a leitura é outro achado
-- (I15), com outro teste.
--
-- E mesmo quem pode escrever em `organization_members` não mexe na própria
-- linha, nem cria, altera ou remove um `owner` sem ser dono — daquela
-- organização ou da raiz. Antes, o `admin` de uma organização podia se fazer
-- `owner` dela (M15).
--
-- ## Contato nunca é apagado de vez (decisão de 6/nov, spec §6.8)
--
-- A lixeira (`deleted_at`) continua; o `delete` da linha deixa de existir para
-- todo mundo — inclusive o dono. A **única** exceção é a organização marcada
-- `is_test`: os testes rodam no banco de produção (decisão de 6/nov: sem banco
-- separado) e não há chave de serviço fora do painel, então quem limpa o que
-- o teste criou é a própria conta de teste. Ninguém pela API liga ou desliga
-- `is_test`.
--
-- ## G2: a organização de um contato não muda
--
-- `people_update_staff` aceita membro da organização dona **ou** da atribuída,
-- e a `with check` confere só a linha nova. Então:
--
--   - um membro da dona atribuía o contato a qualquer organização;
--   - um membro da atribuída trocava a dona pela sua — tomava o contato.
--
-- As chaves compostas da 0016 barravam a troca só quando o contato já tinha
-- filhos. O gatilho abaixo é incondicional: `organization_id` não muda, e a
-- atribuída só muda por quem administra a dona (ou o dono da raiz).
--
-- Os gatilhos deixam passar quando não há usuário (`auth.uid()` nulo): é o
-- dono do banco, numa migration ou no painel, e não uma chamada pela API.

-- ---- quem é dono da raiz ------------------------------------------------------

create or replace function private.current_user_is_root_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = (select auth.uid())
      and o.type = 'root'
      and m.role = 'owner'
  )
$$;

revoke execute on function private.current_user_is_root_owner() from public, anon;
grant execute on function private.current_user_is_root_owner() to authenticated;

-- ---- organizations ------------------------------------------------------------

alter table public.organizations
  add column if not exists is_test boolean not null default false;

update public.organizations set is_test = true where slug = 'parceiro-teste';

drop policy if exists organizations_insert on public.organizations;
drop policy if exists organizations_update on public.organizations;

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check ((select private.current_user_is_root_owner()));

create policy organizations_update on public.organizations
  for update to authenticated
  using ((select private.current_user_manages(id)) or (select private.current_user_is_root_owner()))
  with check ((select private.current_user_manages(id)) or (select private.current_user_is_root_owner()));

-- O tipo (raiz ou parceira) e a marca de teste não mudam pela API: o tipo
-- decide quem é "da raiz", e a marca decide onde se pode apagar contato.
create or replace function private.organizations_campos_fixos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.type is distinct from old.type or new.is_test is distinct from old.is_test then
    raise exception 'O tipo da organização e a marca de teste não mudam por aqui.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.organizations_campos_fixos() from public, anon, authenticated;

drop trigger if exists organizations_campos_fixos on public.organizations;
create trigger organizations_campos_fixos
  before update on public.organizations
  for each row execute function private.organizations_campos_fixos();

-- ---- organization_members -----------------------------------------------------

drop policy if exists organization_members_write on public.organization_members;

create policy organization_members_write on public.organization_members
  for all to authenticated
  using ((select private.current_user_manages(organization_id)) or (select private.current_user_is_root_owner()))
  with check ((select private.current_user_manages(organization_id)) or (select private.current_user_is_root_owner()));

create or replace function private.organization_members_guarda()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := (select auth.uid());
  linha public.organization_members := case when tg_op = 'DELETE' then old else new end;
  dono_da_raiz boolean := private.current_user_is_root_owner();
begin
  if eu is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- A própria linha: ninguém se promove, se rebaixa ou se remove. O dono da
  -- raiz pode se pôr numa parceira (para ajudar), e é só.
  if tg_op = 'INSERT' then
    if new.user_id = eu and not dono_da_raiz then
      raise exception 'Ninguém se associa a uma organização sozinho.' using errcode = '42501';
    end if;
  elsif old.user_id = eu then
    raise exception 'Ninguém altera a própria associação.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and (new.organization_id is distinct from old.organization_id
          or new.user_id is distinct from old.user_id) then
    raise exception 'A associação não muda de pessoa nem de organização.' using errcode = '42501';
  end if;

  -- Dono só é feito, mudado ou tirado por dono.
  if (tg_op <> 'DELETE' and new.role = 'owner')
     or (tg_op <> 'INSERT' and old.role = 'owner') then
    if not dono_da_raiz and not exists (
      select 1
      from public.organization_members m
      where m.user_id = eu
        and m.organization_id = linha.organization_id
        and m.role = 'owner'
    ) then
      raise exception 'Só um dono cria, altera ou remove outro dono.' using errcode = '42501';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function private.organization_members_guarda() from public, anon, authenticated;

drop trigger if exists organization_members_guarda on public.organization_members;
create trigger organization_members_guarda
  before insert or update or delete on public.organization_members
  for each row execute function private.organization_members_guarda();

-- ---- people: nunca apagado de vez ---------------------------------------------

drop policy if exists people_delete on public.people;

create policy people_delete on public.people
  for delete to authenticated
  using (
    (select private.current_user_manages(organization_id))
    and exists (
      select 1 from public.organizations o
      where o.id = people.organization_id and o.is_test
    )
  );

-- ---- people: a organização não muda -------------------------------------------

-- Nome depois de `people_guard_self_update` de propósito: gatilhos do mesmo
-- momento rodam em ordem alfabética, e aquele devolve em silêncio o que o
-- cliente do portal não pode mudar. Este recusa alto o que sobrar.
create or replace function private.people_organizacao_fixa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'Um contato não muda de organização.' using errcode = '42501';
  end if;

  if new.assigned_organization_id is distinct from old.assigned_organization_id
     and not private.current_user_manages(old.organization_id)
     and not private.current_user_is_root_owner() then
    raise exception 'Só quem administra a organização do contato o atribui a outra.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.people_organizacao_fixa() from public, anon, authenticated;

drop trigger if exists people_organizacao_fixa on public.people;
create trigger people_organizacao_fixa
  before update on public.people
  for each row execute function private.people_organizacao_fixa();
