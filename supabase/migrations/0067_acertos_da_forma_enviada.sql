-- 0067 — acertos da entrega 4b, depois da revisão final (Renato, 23/nov)
--
-- Quatro acertos pequenos, cada um com o teste de RLS vermelho antes:
--
-- * O gatilho dos vistos (`opportunity_items_trava_do_ganho`) roda como dono
--   e antes da RLS. Quem soubesse o id de um negócio de outra organização e
--   tentasse pôr um visto nele lia, na frase de recusa, se o negócio estava
--   ganho e se a forma estava confirmada ou enviada — a mesma classe de
--   vazamento que a 0065 fechou no gatilho do link. Agora, para quem está
--   logado e não é da organização do negócio, o gatilho sai calado e a RLS ou
--   a chave estrangeira recusam, sem dizer nada. Sem usuário (manutenção pelo
--   SQL), as travas continuam valendo.
-- * Excluir negócio cuja forma o cliente recusou dizia "A forma de pagamento
--   já foi confirmada". A frase agora depende do que houve: com confirmação
--   (da equipe ou do cliente), a de antes; só com recusa, "O cliente já
--   respondeu a forma de pagamento".
-- * O motivo da recusa era aparado só de espaços: um motivo só com quebras de
--   linha, mandado direto pela API, ficava gravado. Agora qualquer espaço em
--   branco nas pontas sai.
-- * Dois envios ao mesmo tempo, em dois negócios da mesma pessoa: o segundo
--   batia no índice de "um link aberto por pessoa" e recebia a frase genérica
--   de duplicata. Agora recebe a frase com o título do negócio.
--
-- As assinaturas não mudam (`create or replace`, os grants ficam).

-- ----------------------------------------------------- a trava dos vistos

create or replace function private.opportunity_items_trava_do_ganho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_negocio   uuid := case tg_op when 'DELETE' then old.opportunity_id else new.opportunity_id end;
  v_status    text;
  v_forma     text;
  v_cobrancas timestamptz;
begin
  if pg_trigger_depth() > 1 then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.opportunity_id is distinct from old.opportunity_id then
    raise exception 'O visto não muda de negócio.' using errcode = 'P0001';
  end if;

  -- Quem está logado e não é da organização do negócio não aprende nada aqui:
  -- este gatilho roda antes da RLS, e as frases abaixo contam o estado.
  if (select auth.uid()) is not null and not exists (
    select 1 from public.opportunities o
    where o.id = v_negocio
      and o.organization_id in (select private.current_user_organizations())
  ) then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  select o.status into v_status
  from public.opportunities o
  where o.id = v_negocio
  for share;

  if v_status = 'won' then
    raise exception 'Negócio ganho: os vistos não mudam. Para desistir de um visto, encerre o processo dele.'
      using errcode = 'P0001';
  end if;

  select pp.status, pp.charges_created_at into v_forma, v_cobrancas
  from public.payment_plans pp
  where pp.opportunity_id = v_negocio
  for share;

  if v_forma = 'confirmada' and v_cobrancas is null then
    raise exception 'A forma de pagamento está confirmada. Use Refazer para mudar os vistos.'
      using errcode = 'P0001';
  end if;
  if v_forma = 'enviada' and v_cobrancas is null then
    raise exception 'A forma de pagamento foi enviada ao cliente. Use Editar para mudar os vistos.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE'
     and exists (select 1 from public.projects p where p.opportunity_item_id = old.id) then
    raise exception 'Este visto já tem processo: para desistir, encerre o processo.'
      using errcode = 'P0001';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- --------------------------------------------- negócio que não se exclui

create or replace function private.opportunities_ganho_nao_se_apaga()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 2 and old.status = 'won' then
    raise exception 'Reabra ou encerre os processos; o negócio ganho fica como registro.'
      using errcode = 'P0001';
  end if;

  -- A cascata do negócio apagaria a prova. A frase diz o que houve.
  if pg_trigger_depth() < 2 and exists (
    select 1
    from public.payment_plan_responses r
    join public.payment_plans pp on pp.id = r.plan_id
    where pp.opportunity_id = old.id
      and r.decision in ('confirmada', 'confirmada_pela_equipe')
  ) then
    raise exception 'A forma de pagamento já foi confirmada; o negócio fica como registro.'
      using errcode = 'P0001';
  end if;

  if pg_trigger_depth() < 2 and exists (
    select 1
    from public.payment_plan_responses r
    join public.payment_plans pp on pp.id = r.plan_id
    where pp.opportunity_id = old.id
  ) then
    raise exception 'O cliente já respondeu a forma de pagamento; o negócio fica como registro.'
      using errcode = 'P0001';
  end if;

  if pg_trigger_depth() < 2 and exists (
    select 1
    from public.registration_forms f
    join public.payment_plans pp on pp.id = f.payment_plan_id
    where pp.opportunity_id = old.id
      and f.closed_at is null
      and f.cancelled_at is null
  ) then
    raise exception 'Cancele o link da ficha antes.' using errcode = 'P0001';
  end if;

  return old;
end;
$$;

-- --------------------------------------------------------------- enviar

create or replace function public.enviar_forma_de_pagamento(
  p_negocio             uuid,
  p_versao              timestamptz,
  p_pedir_dados_de_novo boolean default false
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio record;
  v_forma   record;
  v_copia   jsonb;
  v_erro    text;
  v_outro   text;
  v_modo    text;
  v_token   text;
begin
  select o.id, o.organization_id, o.status, o.person_id into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for share;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  select pp.id, pp.status, pp.charges_created_at, pp.updated_at into v_forma
  from public.payment_plans pp
  where pp.opportunity_id = p_negocio
  for update;

  if v_forma.charges_created_at is not null then
    raise exception 'As cobranças já foram criadas. Para mudar, exclua a cobrança e crie outra na aba Financeiro do cliente.'
      using errcode = 'P0001';
  end if;
  if v_negocio.status <> 'open' then
    raise exception 'O negócio está encerrado; reabra para mexer na forma de pagamento.'
      using errcode = 'P0001';
  end if;
  if v_forma.id is null then
    raise exception 'Acrescente pelo menos um visto e uma parte antes de enviar.' using errcode = 'P0001';
  end if;
  if v_forma.status = 'confirmada' then
    raise exception 'A forma está confirmada. Use Refazer para mudar.' using errcode = 'P0001';
  end if;
  if v_forma.status = 'enviada' then
    raise exception 'A forma foi enviada ao cliente. Use Editar para mudar.' using errcode = 'P0001';
  end if;
  if v_forma.status = 'recusada' then
    raise exception 'O cliente recusou a forma. Use Ajustar para mudar.' using errcode = 'P0001';
  end if;

  if v_forma.updated_at is distinct from p_versao then
    raise exception 'A forma de pagamento mudou enquanto você olhava. Atualize a página.'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.payment_plan_parts pt where pt.plan_id = v_forma.id)
     or not exists (select 1 from public.opportunity_items i where i.opportunity_id = p_negocio) then
    raise exception 'Acrescente pelo menos um visto e uma parte antes de enviar.' using errcode = 'P0001';
  end if;

  v_copia := private.copia_da_forma(p_negocio);
  v_erro := private.erro_da_forma(jsonb_build_object('partes', v_copia -> 'partes'));
  if v_erro is not null then
    raise exception '%', v_erro using errcode = 'P0001';
  end if;

  select o.title into v_outro
  from public.registration_forms f
  join public.payment_plans pp on pp.id = f.payment_plan_id
  join public.opportunities o on o.id = pp.opportunity_id
  where f.person_id = v_negocio.person_id
    and f.closed_at is null
    and f.cancelled_at is null
  limit 1;
  if v_outro is not null then
    raise exception 'Há um link da ficha aberto no negócio %. Cancele-o antes de enviar outro.', v_outro
      using errcode = 'P0001';
  end if;

  v_modo := case
    when not coalesce(p_pedir_dados_de_novo, false)
         and exists (
           select 1 from public.registration_forms f
           where f.person_id = v_negocio.person_id and f.submitted_at is not null
         )
    then 'so_pagamento'
    else 'completa'
  end;

  perform set_config('dulihub.via_forma', 'on', true);
  perform set_config('dulihub.via_ficha', 'on', true);

  update public.registration_forms
  set cancelled_at = now()
  where person_id = v_negocio.person_id
    and payment_plan_id is null
    and closed_at is null
    and cancelled_at is null;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  -- Dois envios ao mesmo tempo, em dois negócios da mesma pessoa, passam os
  -- dois pela conferência de cima; o segundo para no índice de "um link
  -- aberto por pessoa" e recebe a mesma frase, com o título do outro.
  begin
    insert into public.registration_forms
      (organization_id, person_id, token, expires_at, created_by, payment_plan_id, mode)
    values (
      v_negocio.organization_id, v_negocio.person_id, v_token,
      private.fim_do_prazo_em_dias_uteis(now(), 3), (select auth.uid()), v_forma.id, v_modo
    );
  exception when unique_violation then
    select o.title into v_outro
    from public.registration_forms f
    join public.payment_plans pp on pp.id = f.payment_plan_id
    join public.opportunities o on o.id = pp.opportunity_id
    where f.person_id = v_negocio.person_id
      and f.closed_at is null
      and f.cancelled_at is null
    limit 1;
    raise exception 'Há um link da ficha aberto no negócio %. Cancele-o antes de enviar outro.',
      coalesce(v_outro, 'desta pessoa')
      using errcode = 'P0001';
  end;

  update public.payment_plans set status = 'enviada' where id = v_forma.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (v_negocio.organization_id, v_negocio.person_id, p_negocio,
          'forma_de_pagamento', 'Forma de pagamento enviada ao cliente', (select auth.uid()));

  perform set_config('dulihub.via_ficha', 'off', true);
  perform set_config('dulihub.via_forma', 'off', true);
  return v_token;
end;
$$;

-- -------------------------------------------- responder_forma_de_pagamento

create or replace function public.responder_forma_de_pagamento(
  p_token  text,
  p_aceita boolean,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_indisponivel constant text := 'Este link não está mais disponível.';
  v_achado   record;
  v_negocio  record;
  v_forma    record;
  v_link     public.registration_forms;
  -- Qualquer espaço em branco nas pontas sai: quebra de linha e tabulação também.
  v_motivo   text := nullif(regexp_replace(coalesce(p_motivo, ''), '^\s+|\s+$', '', 'g'), '');
  v_copia    jsonb;
begin
  select f.id, f.payment_plan_id, pp.opportunity_id into v_achado
  from public.registration_forms f
  join public.payment_plans pp on pp.id = f.payment_plan_id
  where f.token = p_token;
  if not found or p_aceita is null then
    raise exception '%', c_indisponivel using errcode = 'P0001';
  end if;

  select o.id, o.organization_id, o.status, o.person_id into v_negocio
  from public.opportunities o
  where o.id = v_achado.opportunity_id
  for share;

  select pp.id, pp.status into v_forma
  from public.payment_plans pp
  where pp.id = v_achado.payment_plan_id
  for update;

  select * into v_link
  from public.registration_forms
  where id = v_achado.id
  for update;

  if v_negocio.status is distinct from 'open'
     or v_forma.status is distinct from 'enviada'
     or v_link.payment_plan_id is distinct from v_forma.id
     or v_link.cancelled_at is not null
     or v_link.closed_at is not null
     or v_link.expires_at <= now()
     or not (v_link.submitted_at is not null or v_link.mode = 'so_pagamento')
     or exists (
       select 1 from public.people p
       where p.id = v_link.person_id and p.deleted_at is not null
     )
  then
    raise exception '%', c_indisponivel using errcode = 'P0001';
  end if;

  if p_aceita then
    v_motivo := null;
  elsif length(v_motivo) > 500 then
    raise exception 'O motivo vai até 500 caracteres.' using errcode = 'P0001';
  end if;

  v_copia := private.copia_da_forma(v_negocio.id);

  perform set_config('dulihub.via_forma', 'on', true);
  perform set_config('dulihub.via_ficha', 'on', true);

  insert into public.payment_plan_responses
    (organization_id, plan_id, registration_form_id, decision, reason, snapshot)
  values (
    v_negocio.organization_id, v_forma.id, v_link.id,
    case when p_aceita then 'confirmada' else 'recusada' end,
    v_motivo, v_copia
  );

  update public.payment_plans
  set status = case when p_aceita then 'confirmada' else 'recusada' end
  where id = v_forma.id;

  update public.registration_forms set closed_at = now() where id = v_link.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description)
  values (
    v_negocio.organization_id, v_negocio.person_id, v_negocio.id, 'forma_de_pagamento',
    case
      when p_aceita then 'Forma de pagamento confirmada pelo cliente'
      else 'Forma de pagamento recusada pelo cliente' || coalesce(': ' || v_motivo, '')
    end
  );

  perform set_config('dulihub.via_ficha', 'off', true);
  perform set_config('dulihub.via_forma', 'off', true);
end;
$$;
