-- Prova do link com a forma (0064, 0065).
--
-- Roda no SQL Editor (ou pelo conector) como `postgres`. Não deixa nada no
-- banco: cada parte é um bloco que termina em `raise exception`, e o erro
-- desfaz a transação inteira. O resultado vem na própria mensagem do erro.
--
-- Por que não está na suíte de RLS: ela entra pela API, que não alcança
-- `private.fim_do_prazo_em_dias_uteis`, e não consegue pôr um link com a forma
-- no passado (o gatilho o congela) — que é como se prova o link vencido.

-- ------------------------------------------------- 1. os dias úteis (0064)
--
-- Esperado: seg=[ok] sex=[ok] sab=[ok] dom=[ok] seg_22h_sp=[ok]

do $$
declare
  r text := '';
  v timestamptz;
begin
  v := private.fim_do_prazo_em_dias_uteis('2026-11-23 12:00-03', 3);
  r := r || 'seg=[' || case when v = '2026-11-27 00:00-03' then 'ok' else v::text end || '] ';

  v := private.fim_do_prazo_em_dias_uteis('2026-11-27 12:00-03', 3);
  r := r || 'sex=[' || case when v = '2026-12-03 00:00-03' then 'ok' else v::text end || '] ';

  v := private.fim_do_prazo_em_dias_uteis('2026-11-28 12:00-03', 3);
  r := r || 'sab=[' || case when v = '2026-12-03 00:00-03' then 'ok' else v::text end || '] ';

  v := private.fim_do_prazo_em_dias_uteis('2026-11-29 12:00-03', 3);
  r := r || 'dom=[' || case when v = '2026-12-03 00:00-03' then 'ok' else v::text end || '] ';

  -- Segunda às 22h em São Paulo já é terça em UTC: conta segunda (foco 3).
  v := private.fim_do_prazo_em_dias_uteis('2026-11-24 01:00+00', 3);
  r := r || 'seg_22h_sp=[' || case when v = '2026-11-27 00:00-03' then 'ok' else v::text end || ']';

  raise exception '%', r;
end;
$$;

-- ------------------------------------------------- 2. o link vencido (0065)
--
-- Uma pessoa, um negócio e uma forma na organização de teste; envia, põe o
-- prazo no passado com a marca `via_ficha` (só as funções a ligam) e confere
-- a porta anônima.
--
-- Esperado: abrir=[expirada] forma=[nula] responder=[Este link não está mais disponível.] respostas=[0]

do $$
declare
  v_org uuid; v_user uuid; v_pessoa uuid; v_funil uuid; v_etapa uuid; v_visto uuid; v_neg uuid;
  v_versao timestamptz; v_token text;
  r_abrir text; r_forma text; r_responder text; r_respostas integer;
begin
  select id into v_org from public.organizations where slug = 'parceiro-teste';
  select user_id into v_user from public.organization_members
   where organization_id = v_org order by created_at limit 1;
  select id into v_funil from public.pipelines where organization_id = v_org and is_default;
  select id into v_etapa from public.pipeline_stages
   where pipeline_id = v_funil and not is_won and not is_lost order by position limit 1;
  select id into v_visto from public.visa_types where organization_id = v_org and name = 'Visto do Parceiro';

  insert into public.people (organization_id, full_name, lifecycle_stage)
  values (v_org, 'Prova do link vencido', 'opportunity') returning id into v_pessoa;
  insert into public.opportunities (organization_id, person_id, pipeline_id, stage_id, title, owner_id)
  values (v_org, v_pessoa, v_funil, v_etapa, 'Prova do link vencido', v_user) returning id into v_neg;
  insert into public.opportunity_items (organization_id, opportunity_id, visa_type_id, visa_name, amount, currency)
  values (v_org, v_neg, v_visto, 'EB-2 NIW', 6000, 'USD');

  perform public.salvar_forma_de_pagamento(v_neg, jsonb_build_object('partes', jsonb_build_array(
    jsonb_build_object('label', 'À vista', 'method', 'pix', 'currency', 'BRL', 'total', 1000,
      'installments_count', 1, 'parcelas', jsonb_build_array(jsonb_build_object(
        'number', 1, 'amount', 1000, 'due_on', to_char(current_date + 10, 'YYYY-MM-DD'))))
  )));
  select updated_at into v_versao from public.payment_plans where opportunity_id = v_neg;
  v_token := public.enviar_forma_de_pagamento(v_neg, v_versao, false);

  perform set_config('dulihub.via_ficha', 'on', true);
  update public.registration_forms set expires_at = now() - interval '1 minute' where token = v_token;
  perform set_config('dulihub.via_ficha', 'off', true);

  select situacao, coalesce(forma::text, 'nula') into r_abrir, r_forma
  from public.abrir_ficha_de_cadastro(v_token);

  begin
    perform public.responder_forma_de_pagamento(v_token, true, null);
    r_responder := 'gravou';
  exception when others then
    r_responder := sqlerrm;
  end;

  select count(*) into r_respostas
  from public.payment_plan_responses r
  join public.payment_plans pp on pp.id = r.plan_id
  where pp.opportunity_id = v_neg;

  raise exception 'abrir=[%] forma=[%] responder=[%] respostas=[%]', r_abrir, r_forma, r_responder, r_respostas;
end;
$$;
