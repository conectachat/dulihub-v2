-- 0037 — atribuir na criação segue a mesma regra de atribuir depois
--
-- A 0036 fez `assigned_organization_id` mudar só por quem administra a
-- organização dona do contato. Mas o gatilho olhava só `update`: um `staff`
-- criava o contato **já atribuído** a qualquer organização, e o contato
-- aparecia na carteira dela — o mesmo plantio que a 0036 fechou, pela porta
-- do lado (apontado pela revisão automática de segurança da 0036).
--
-- Agora o mesmo gatilho vale para `insert`: contato novo só nasce atribuído
-- se quem cria administra a organização dona, ou é dono da raiz.

create or replace function private.people_organizacao_fixa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.assigned_organization_id is not null
       and not private.current_user_manages(new.organization_id)
       and not private.current_user_is_root_owner() then
      raise exception 'Só quem administra a organização do contato o atribui a outra.'
        using errcode = '42501';
    end if;
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
  before insert or update on public.people
  for each row execute function private.people_organizacao_fixa();

-- ---- a marca de teste também não nasce pela API -------------------------------
--
-- A 0036 diz que ninguém liga ou desliga `is_test` pela API, mas o gatilho
-- olhava só `update`: o dono da raiz podia criar uma organização já marcada
-- como teste e, nela, apagar contato de vez (apontado pela revisão de
-- confirmação). Organização de teste se cria pelo painel, como a fixture.

create or replace function private.organizations_campos_fixos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_test then
      raise exception 'Organização de teste não se cria por aqui.' using errcode = '42501';
    end if;
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
  before insert or update on public.organizations
  for each row execute function private.organizations_campos_fixos();
