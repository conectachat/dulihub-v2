-- 0061 — a trava da forma compara a linha inteira (entrega 4a, revisão final)
--
-- `payment_plans_so_pelas_funcoes` (0058, 0060) listava à mão as colunas que
-- protegia. Uma coluna que a forma ganhe depois — a 4b vai precisar de
-- algumas — ficaria livre pela API sem ninguém perceber, e passaria também
-- pela liberação do usuário excluído. Agora a regra é a do lado de fora:
--
-- * fora das funções, a linha nova é igual à antiga **menos** a cotação
--   (`reference_rate`, `reference_rate_note`) e o `updated_at`;
-- * dentro de gatilho, passa só o `update` que anula `created_by` e não mexe
--   em mais nada (o usuário excluído, 0060).
--
-- Coluna nova nasce protegida; para liberá-la, ela entra aqui por nome. A
-- prova roda em `supabase/provas/trava-da-forma.sql`. A assinatura não muda.

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
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at') then
    return new;
  end if;

  -- Fora das funções, só a cotação (e o `updated_at` que vem junto).
  if (to_jsonb(new) - 'reference_rate' - 'reference_rate_note' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'reference_rate' - 'reference_rate_note' - 'updated_at') then
    raise exception 'Mude a forma de pagamento pela tela do negócio.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.payment_plans_so_pelas_funcoes() from public, anon, authenticated;
