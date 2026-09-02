-- =============================================================================
-- 0010 — Status de etapa: cores da marca e troca atômica do padrão
--
-- Duas correções na tabela semeada pela 0008.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cores
--
-- Os três de fábrica nasceram com cores padrão do Tailwind (slate, blue,
-- green), que não são as da Duli. Trocadas pelos valores do manual: o
-- azul-cinza neutro, o azul médio e o verde da marca.
--
-- Só onde a cor ainda é a original — se alguém já ajustou, a escolha fica.
-- -----------------------------------------------------------------------------
update stage_statuses set color = '#8a97aa' where code = 'pending'     and color = '#64748b';
update stage_statuses set color = '#1f5aa8' where code = 'in_progress' and color = '#3b82f6';
update stage_statuses set color = '#0e7c6b' where code = 'done'        and color = '#22c55e';

-- -----------------------------------------------------------------------------
-- 2. Troca do status padrão
--
-- `stage_statuses_one_default` garante no máximo um padrão por organização, o
-- que obriga a limpar o antigo antes de marcar o novo. Feito em duas chamadas
-- pela aplicação, um erro no meio deixaria a organização sem padrão nenhum — e
-- toda etapa nova sem status.
--
-- Aqui é uma chamada só, e PostgREST executa RPC dentro de uma transação:
-- ou os dois passos valem, ou nenhum. SECURITY INVOKER de propósito — a RLS
-- continua valendo, ninguém mexe no padrão de outra organização.
-- -----------------------------------------------------------------------------
create or replace function public.set_default_stage_status(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.stage_statuses
  where id = p_id;

  if v_org is null then
    raise exception 'Status não encontrado.' using errcode = 'no_data_found';
  end if;

  update public.stage_statuses
     set is_default = false
   where organization_id = v_org
     and is_default
     and id <> p_id;

  update public.stage_statuses
     set is_default = true
   where id = p_id;
end;
$$;

revoke execute on function public.set_default_stage_status(uuid) from public, anon;
grant execute on function public.set_default_stage_status(uuid) to authenticated;
