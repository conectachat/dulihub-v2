-- 0071 — O cliente de parceiro fica fora do funil e do link da ficha
-- (PAR-7, PAR-8; desenho de 24/nov, §5.4 e §5.5)
--
-- O cliente que vem de parceiro não passa pelo CRM: não tem negócio, forma
-- de pagamento nem contrato, e o Renato não fala com ele — fala com o
-- parceiro. Os processos nascem por "+ Novo processo" no perfil, como hoje.
--
-- As guardas ficam no banco, porque a tela esconder é só conveniência. E
-- valem no `insert` **e** no `update of person_id`: nada congela hoje o
-- `person_id` de `opportunities` nem de `registration_forms`, e um `update`
-- direto levaria para o cliente de parceiro um negócio aberto, ou um link da
-- ficha aberto, de outra pessoa.
--
-- D6 — `criar_oportunidade` não muda: o gatilho de `opportunities` dispara
-- dentro dela. O cliente de parceiro não tem contato nem negócio, então ela
-- não para antes para perguntar.
--
-- D7 — `security invoker`, como `private.quem_tem_processo_e_cliente`
-- (0045): o gatilho roda antes da RLS e lê `people` com a permissão de quem
-- grava. Pessoa que ele não enxerga passa calada, e a RLS ou a chave composta
-- recusam com a frase delas — a frase daqui não conta a um estranho que um id
-- alheio é cliente de parceiro.

create function private.opportunities_fora_do_parceiro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.person_id is not distinct from old.person_id then
    return new;
  end if;

  if exists (
    select 1 from public.people as p
    where p.id = new.person_id
      and p.organization_id = new.organization_id
      and p.partner_organization_id is not null
  ) then
    raise exception 'Cliente de parceiro não entra no funil: use + Novo processo no perfil.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Gatilho não checa privilégio de execução: ninguém precisa poder chamar.
revoke execute on function private.opportunities_fora_do_parceiro() from public, anon, authenticated;

create trigger opportunities_cliente_de_parceiro
  before insert or update of person_id on public.opportunities
  for each row execute function private.opportunities_fora_do_parceiro();

create function private.registration_forms_fora_do_parceiro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.person_id is not distinct from old.person_id then
    return new;
  end if;

  if exists (
    select 1 from public.people as p
    where p.id = new.person_id
      and p.organization_id = new.organization_id
      and p.partner_organization_id is not null
  ) then
    raise exception 'Cliente de parceiro não recebe o link da ficha.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.registration_forms_fora_do_parceiro() from public, anon, authenticated;

create trigger registration_forms_cliente_de_parceiro
  before insert or update of person_id on public.registration_forms
  for each row execute function private.registration_forms_fora_do_parceiro();
