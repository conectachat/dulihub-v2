-- 0060 — a trava da forma deixa excluir o usuário (entrega 4a, revisão final)
--
-- `payment_plans.created_by` é `on delete set null` (0058): excluir o usuário
-- que salvou uma forma faz a chave estrangeira anular a coluna, por um
-- `update` dentro de gatilho. A trava `payment_plans_so_pelas_funcoes` não
-- tinha liberação de profundidade e recusava esse `update` — a exclusão do
-- usuário inteira caía com "Mude a forma de pagamento pela tela do negócio.".
-- Era o defeito que a decisão 12 do desenho quis evitar em `answered_by`.
--
-- A liberação é estreita de propósito: dentro de gatilho (`pg_trigger_depth()
-- > 1`), passa só o `update` que **anula `created_by`** e não mexe em mais
-- nada. Um gatilho futuro que tentasse mudar a situação ou as cobranças da
-- forma continua recusado; a forma segue mudando só pelas funções da 0058.
--
-- A assinatura não muda: `create or replace` mantém o gatilho e os grants.

create or replace function private.payment_plans_so_pelas_funcoes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('dulihub.via_forma', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Mude a forma de pagamento pela tela do negócio.' using errcode = 'P0001';
  end if;

  -- A ação da chave estrangeira do usuário excluído: anula `created_by`, e só.
  if pg_trigger_depth() > 1
     and new.created_by is null
     and old.created_by is not null
     and (new.id, new.organization_id, new.opportunity_id, new.status, new.charges_created_at,
          new.created_at, new.reference_rate, new.reference_rate_note)
         is not distinct from
         (old.id, old.organization_id, old.opportunity_id, old.status, old.charges_created_at,
          old.created_at, old.reference_rate, old.reference_rate_note) then
    return new;
  end if;

  -- Fora das funções, só a cotação (e o `updated_at` que vem junto).
  if (new.id, new.organization_id, new.opportunity_id, new.status, new.charges_created_at,
      new.created_by, new.created_at)
     is distinct from
     (old.id, old.organization_id, old.opportunity_id, old.status, old.charges_created_at,
      old.created_by, old.created_at) then
    raise exception 'Mude a forma de pagamento pela tela do negócio.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.payment_plans_so_pelas_funcoes() from public, anon, authenticated;
