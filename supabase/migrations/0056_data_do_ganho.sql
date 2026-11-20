-- 0056 — Ajustar a data do Ganho (CRM-17)
--
-- O cliente antigo que estava no funil é ganho pelo Ganho, que grava a data
-- de hoje; a gestão ajusta depois para a data real, e o ganho não conta no mês
-- errado (spec §7.3, critério do CRM-17; decisões do Renato em 20/nov).
--
-- - Um caminho só: a data de um negócio ganho muda só por
--   `ajustar_data_do_ganho`, que confere a gestão e grava a data e o histórico
--   juntos. O `update` direto é recusado, até para a gestão — "a regra é o
--   caminho, não o papel", como na 0054.
-- - A marca é a `dulihub.via_ganho` (plano, D5): o recurso é o mesmo, o ganho do
--   negócio. `ganhar_negocio` e `reabrir_negocio` já gravam `closed_at` sob ela.
-- - A trava só recusa quando o negócio **continua** ganho. Quem tenta sair do
--   ganho por `update` (o status muda) recebe a frase da 0054: sem essa
--   condição, esta trava, que vem antes pela ordem alfabética, tomaria a frase.
-- - O dia não escorrega: grava-se o início do dia escolhido em São Paulo, e o
--   histórico escreve os dias em São Paulo — o fuso da sessão é UTC, e um ganho
--   às 22h30 de 31/10 viraria "01/11" (plano, D9).
-- - De 01/01/2000 até hoje: antes disso é erro de digitação no ano. O mesmo dia
--   que já está gravado não grava nada (plano, D11).

create function private.dia_em_sao_paulo(p_momento timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_momento at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
$$;

revoke execute on function private.dia_em_sao_paulo(timestamptz) from public, anon;
grant execute on function private.dia_em_sao_paulo(timestamptz) to authenticated;

create function public.ajustar_data_do_ganho(p_negocio uuid, p_data date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio record;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_depois  timestamptz;
begin
  -- A RLS de quem chama vale: negócio de outra organização não aparece.
  select o.id, o.organization_id, o.person_id, o.status, o.closed_at
    into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for update;

  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  if not private.current_user_manages(v_negocio.organization_id) then
    raise exception 'Só a gestão ajusta a data do ganho.' using errcode = 'P0001';
  end if;

  if v_negocio.status <> 'won' then
    raise exception 'Só o negócio ganho tem a data ajustada.' using errcode = 'P0001';
  end if;

  if p_data is null then
    raise exception 'Informe a data.' using errcode = 'P0001';
  end if;

  if p_data > v_hoje then
    raise exception 'A data do ganho não pode ser no futuro.' using errcode = 'P0001';
  end if;

  if p_data < date '2000-01-01' then
    raise exception 'A data do ganho não pode ser antes de 2000.' using errcode = 'P0001';
  end if;

  -- O mesmo dia, em São Paulo: nada a gravar.
  if (v_negocio.closed_at at time zone 'America/Sao_Paulo')::date = p_data then
    return v_negocio.person_id;
  end if;

  v_depois := p_data::timestamp at time zone 'America/Sao_Paulo';

  perform set_config('dulihub.via_ganho', 'on', true);

  update public.opportunities
  set closed_at = v_depois
  where id = p_negocio;

  perform set_config('dulihub.via_ganho', 'off', true);

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (
    v_negocio.organization_id, v_negocio.person_id, p_negocio, 'stage_change',
    'Data do ganho ajustada de ' || private.dia_em_sao_paulo(v_negocio.closed_at)
      || ' para ' || private.dia_em_sao_paulo(v_depois),
    (select auth.uid())
  );

  return v_negocio.person_id;
end;
$$;

revoke execute on function public.ajustar_data_do_ganho(uuid, date) from public, anon;
grant execute on function public.ajustar_data_do_ganho(uuid, date) to authenticated;

comment on function public.ajustar_data_do_ganho(uuid, date) is
  'Ajusta a data de um negócio ganho (CRM-17): só a gestão, de 01/01/2000 até hoje em São Paulo, com histórico. O mesmo dia não grava nada. Devolve o person_id.';

-- ------------------------------------------ a data do ganho, protegida

create function private.opportunities_data_do_ganho()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Ação de chave estrangeira (§3), ou as funções do Ganho, do Reabrir e do
  -- ajuste, sob a marca.
  if pg_trigger_depth() > 1
     or coalesce(current_setting('dulihub.via_ganho', true), '') = 'on' then
    return new;
  end if;

  -- Só quem continua ganho: sair do ganho fica com a trava da 0054.
  if old.status = 'won' and new.status = 'won'
     and new.closed_at is distinct from old.closed_at then
    raise exception 'Use o Ajustar data.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.opportunities_data_do_ganho() from public, anon, authenticated;

create trigger opportunities_data_do_ganho
  before update of closed_at on public.opportunities
  for each row execute function private.opportunities_data_do_ganho();
