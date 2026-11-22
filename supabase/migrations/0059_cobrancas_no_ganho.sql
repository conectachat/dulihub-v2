-- 0059 — cobranças no Ganho (entrega 4a; REC-6, CRM-14)
--
-- O passo (7) de `ganhar_negocio`, que a 0052 deixou para a entrega 4: com a
-- forma de pagamento confirmada (0058), o Ganho cria uma cobrança por parte,
-- com as parcelas da forma e o método da parte, e grava
-- `payment_plans.charges_created_at` — a forma não gera de novo, nem reabrindo
-- e ganhando outra vez. Rascunho ou sem forma: nenhuma cobrança.
--
-- As decisões:
--
-- * O resumo (`p_simular`) e a gravação leem a forma pela mesma função,
--   `private.forma_do_ganho`, e a gravação anda sobre o mesmo jsonb que ela
--   devolve: o resumo não promete cobranças diferentes das que nascem.
-- * A cobrança herda a organização **da pessoa** (corrige o I24 neste
--   caminho) e não tem processo: uma forma paga todos os vistos juntos.
-- * Título "‹rótulo› — ‹vistos›", com os vistos por `position, created_at`.
-- * A assinatura não muda (`create or replace` mantém os grants), e a resposta
--   ganha a chave `forma`. Compatível com o código no ar: sem forma confirmada,
--   `cobrancas` continua vazia, e o esquema antigo ignora a chave nova.

create function private.forma_do_ganho(p_negocio uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_forma     record;
  v_resposta  record;
  v_situacao  text;
  v_partes    jsonb;
  v_vistos    text;
  v_cobrancas jsonb := '[]'::jsonb;
begin
  select pp.id, pp.status, pp.charges_created_at into v_forma
  from public.payment_plans pp
  where pp.opportunity_id = p_negocio;

  if v_forma.id is null then
    return jsonb_build_object(
      'forma', jsonb_build_object(
        'situacao', 'sem_forma',
        'confirmada_em', null,
        'confirmada_por', null,
        'cobrancas_criadas_em', null,
        'partes', '[]'::jsonb
      ),
      'cobrancas', '[]'::jsonb
    );
  end if;

  v_situacao := case when v_forma.charges_created_at is not null then 'cobrancas_criadas' else v_forma.status end;

  -- Depois de Refazer e confirmar de novo, vale a última confirmação.
  select r.answered_at, r.answered_by_name into v_resposta
  from public.payment_plan_responses r
  where r.plan_id = v_forma.id
  order by r.answered_at desc, r.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pt.id,
           'label', pt.label,
           'method', pt.method,
           'currency', pt.currency,
           'total', pt.total,
           'installments_count', pt.installments_count,
           'parcelas', coalesce((
             select jsonb_agg(jsonb_build_object('number', pi.number, 'amount', pi.amount, 'due_on', pi.due_on)
                              order by pi.number)
             from public.payment_plan_installments pi
             where pi.part_id = pt.id
           ), '[]'::jsonb)
         ) order by pt.position), '[]'::jsonb)
    into v_partes
  from public.payment_plan_parts pt
  where pt.plan_id = v_forma.id;

  if v_situacao = 'confirmada' then
    select string_agg(i.visa_name, ', ' order by i.position, i.created_at) into v_vistos
    from public.opportunity_items i
    where i.opportunity_id = p_negocio;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', null,
             'parte', e.p ->> 'id',
             'titulo', (e.p ->> 'label') || coalesce(' — ' || v_vistos, ''),
             'moeda', e.p ->> 'currency',
             'total', e.p -> 'total',
             'parcelas', jsonb_array_length(e.p -> 'parcelas')
           ) order by e.ordem), '[]'::jsonb)
      into v_cobrancas
    from jsonb_array_elements(v_partes) with ordinality as e(p, ordem);
  end if;

  return jsonb_build_object(
    'forma', jsonb_build_object(
      'situacao', v_situacao,
      'confirmada_em', v_resposta.answered_at,
      'confirmada_por', v_resposta.answered_by_name,
      'cobrancas_criadas_em', v_forma.charges_created_at,
      'partes', v_partes
    ),
    'cobrancas', v_cobrancas
  );
end;
$$;

revoke execute on function private.forma_do_ganho(uuid) from public, anon;
grant execute on function private.forma_do_ganho(uuid) to authenticated;

create or replace function public.ganhar_negocio(
  p_negocio                   uuid,
  p_cobrancas_sem_confirmacao boolean default false,
  p_simular                   boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio   record;
  v_pessoa    record;
  v_etapa     record;
  v_item      record;
  v_vira      boolean;
  v_dono      uuid;
  v_eu        uuid := (select auth.uid());
  v_avisos    text[] := '{}';
  v_itens     jsonb;
  v_processos jsonb := '[]'::jsonb;
  v_sem_visto text;
  v_id        uuid;
  v_forma     jsonb;
  v_cobranca  jsonb;
  v_parte     jsonb;
  v_cobrancas jsonb := '[]'::jsonb;
begin
  -- (1) A RLS de quem chama vale: negócio de outra organização não aparece.
  -- `for update` serializa dois Ganhos do mesmo negócio.
  select o.id, o.organization_id, o.person_id, o.pipeline_id, o.owner_id, o.status
    into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for update;

  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  -- (2) As conferências.
  if v_negocio.status = 'won' then
    raise exception 'Este negócio já foi ganho.' using errcode = 'P0001';
  end if;

  if v_negocio.owner_id is distinct from v_eu
     and not private.current_user_manages(v_negocio.organization_id) then
    raise exception 'Só o dono do negócio ou a gestão ganham o negócio.' using errcode = 'P0001';
  end if;

  select p.id, p.organization_id, p.full_name, p.lifecycle_stage, p.owner_id, p.deleted_at
    into v_pessoa
  from public.people p
  where p.id = v_negocio.person_id;

  if not found then
    raise exception 'Contato não encontrado.' using errcode = 'P0001';
  end if;

  if v_pessoa.deleted_at is not null then
    raise exception 'Este contato está na lixeira. Restaure antes.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.opportunity_items i where i.opportunity_id = p_negocio) then
    raise exception 'Acrescente pelo menos um visto antes do Ganho.' using errcode = 'P0001';
  end if;

  -- Só o item que ainda vai virar processo precisa de visto (D17).
  select i.visa_name into v_sem_visto
  from public.opportunity_items i
  where i.opportunity_id = p_negocio
    and i.visa_type_id is null
    and not exists (select 1 from public.projects pr where pr.opportunity_item_id = i.id)
  order by i.position, i.created_at
  limit 1;

  if found then
    raise exception 'O item % está sem visto. Remova o item e acrescente um visto do catálogo.', v_sem_visto
      using errcode = 'P0001';
  end if;

  select s.id, s.name, s.probability into v_etapa
  from public.pipeline_stages s
  where s.pipeline_id = v_negocio.pipeline_id and s.is_won
  order by s.position
  limit 1;

  if not found then
    raise exception 'O funil não tem etapa de ganho. Crie em Configurações › Etapas do funil.'
      using errcode = 'P0001';
  end if;

  v_vira := v_pessoa.lifecycle_stage <> 'client';

  -- Dono (D9): só para quem vira cliente agora e ainda não tem dono. O dono
  -- do negócio, se for da equipe da pessoa; senão quem confirma; senão
  -- ninguém — a chave composta de `people.owner_id` derrubaria o Ganho.
  -- Desde a 0054 o dono do negócio é sempre da equipe (chave composta); a
  -- conferência fica como rede.
  if v_vira and v_pessoa.owner_id is null then
    if exists (
      select 1 from public.organization_members m
      where m.organization_id = v_pessoa.organization_id and m.user_id = v_negocio.owner_id
    ) then
      v_dono := v_negocio.owner_id;
    elsif exists (
      select 1 from public.organization_members m
      where m.organization_id = v_pessoa.organization_id and m.user_id = v_eu
    ) then
      v_dono := v_eu;
      v_avisos := array_append(v_avisos, case
        when v_negocio.owner_id is null
          then 'O negócio está sem dono: você fica como dono do cliente.'
        else 'O dono do negócio não está na equipe deste contato: você fica como dono do cliente.'
      end);
    else
      v_avisos := array_append(v_avisos, 'O cliente fica sem dono; escolha em Editar.');
    end if;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', i.id, 'visa_name', i.visa_name,
                              'amount', i.amount, 'currency', i.currency)
           order by i.position, i.created_at), '[]'::jsonb)
    into v_itens
  from public.opportunity_items i
  where i.opportunity_id = p_negocio;

  if p_simular then
    -- A forma e as cobranças que nasceriam, pela mesma leitura da gravação.
    v_forma := private.forma_do_ganho(p_negocio);

    select coalesce(jsonb_agg(
             jsonb_build_object('item', i.id,
                                'titulo', i.visa_name || ' — ' || v_pessoa.full_name,
                                'id', null)
             order by i.position, i.created_at), '[]'::jsonb)
      into v_processos
    from public.opportunity_items i
    where i.opportunity_id = p_negocio
      and not exists (select 1 from public.projects pr where pr.opportunity_item_id = i.id);

    return jsonb_build_object(
      'negocio', p_negocio,
      'pessoa', jsonb_build_object('id', v_pessoa.id, 'nome', v_pessoa.full_name,
                                   'vira_cliente', v_vira),
      'itens', v_itens,
      'processos', v_processos,
      'forma', v_forma -> 'forma',
      'cobrancas', v_forma -> 'cobrancas',
      'avisos', to_jsonb(v_avisos)
    );
  end if;

  -- (3) A marca e o negócio.
  perform set_config('dulihub.via_ganho', 'on', true);

  update public.opportunities
  set stage_id    = v_etapa.id,
      status      = 'won',
      closed_at   = now(),
      probability = v_etapa.probability,
      lost_reason = null
  where id = p_negocio;

  -- (4) Histórico (D14).
  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (
    v_pessoa.organization_id, v_pessoa.id, p_negocio,
    case when v_vira then 'virou_cliente' else 'stage_change' end,
    case when v_vira then 'Oportunidade ganha — virou cliente' else 'Oportunidade ganha' end,
    v_eu
  );

  -- (5) A pessoa. O "cliente desde" vem do gatilho da 0045.
  if v_vira then
    update public.people
    set lifecycle_stage = 'client',
        owner_id        = coalesce(owner_id, v_dono)
    where id = v_pessoa.id;
  end if;

  insert into public.person_participants (organization_id, person_id, user_id)
  select v_pessoa.organization_id, v_pessoa.id, op.user_id
  from public.opportunity_participants op
  where op.opportunity_id = p_negocio
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = v_pessoa.organization_id and m.user_id = op.user_id
    )
  on conflict (person_id, user_id) do nothing;

  -- (6) Um processo por item que ainda não tem. A ligação item → processo
  -- (único, 0051) é o que impede o repetido.
  for v_item in
    select i.id, i.visa_type_id, i.visa_name
    from public.opportunity_items i
    where i.opportunity_id = p_negocio
      and not exists (select 1 from public.projects pr where pr.opportunity_item_id = i.id)
    order by i.position, i.created_at
  loop
    v_id := public.criar_processo(
      v_pessoa.id, v_item.visa_type_id, v_item.visa_name || ' — ' || v_pessoa.full_name,
      p_negocio, v_item.id
    );
    v_processos := v_processos || jsonb_build_array(jsonb_build_object(
      'item', v_item.id,
      'titulo', v_item.visa_name || ' — ' || v_pessoa.full_name,
      'id', v_id
    ));
  end loop;

  -- (7) As cobranças da forma confirmada (REC-6), uma por parte, com a
  -- organização da pessoa. A forma trava depois do negócio, como nas funções
  -- da forma. O laço anda sobre o mesmo jsonb que o resumo mostrou — não há
  -- segunda leitura das tabelas para divergir dele.
  perform 1 from public.payment_plans pp where pp.opportunity_id = p_negocio for update;
  v_forma := private.forma_do_ganho(p_negocio);

  if v_forma -> 'forma' ->> 'situacao' = 'confirmada' then
    perform set_config('dulihub.via_forma', 'on', true);

    for v_cobranca in select value from jsonb_array_elements(v_forma -> 'cobrancas') loop
      select value into v_parte
      from jsonb_array_elements(v_forma -> 'forma' -> 'partes')
      where value ->> 'id' = v_cobranca ->> 'parte';

      insert into public.receivables
        (organization_id, person_id, project_id, title, amount, currency, created_by, payment_plan_part_id)
      values (
        v_pessoa.organization_id, v_pessoa.id, null,
        v_cobranca ->> 'titulo', (v_cobranca ->> 'total')::numeric, v_cobranca ->> 'moeda',
        v_eu, (v_cobranca ->> 'parte')::uuid
      )
      returning id into v_id;

      insert into public.installments (organization_id, receivable_id, number, amount, due_on, method)
      select v_pessoa.organization_id, v_id,
             (pi ->> 'number')::integer, (pi ->> 'amount')::numeric, (pi ->> 'due_on')::date,
             v_parte ->> 'method'
      from jsonb_array_elements(v_parte -> 'parcelas') as pi;

      v_cobrancas := v_cobrancas || jsonb_build_array(v_cobranca || jsonb_build_object('id', v_id));
    end loop;

    -- A forma não gera de novo: nem reabrindo e ganhando outra vez.
    update public.payment_plans set charges_created_at = now() where opportunity_id = p_negocio;

    perform set_config('dulihub.via_forma', 'off', true);
    v_forma := private.forma_do_ganho(p_negocio);
  end if;

  -- (8) Desliga a marca e devolve o mesmo formato do resumo.
  perform set_config('dulihub.via_ganho', 'off', true);

  return jsonb_build_object(
    'negocio', p_negocio,
    'pessoa', jsonb_build_object('id', v_pessoa.id, 'nome', v_pessoa.full_name,
                                 'vira_cliente', v_vira),
    'itens', v_itens,
    'processos', v_processos,
    'forma', v_forma -> 'forma',
    'cobrancas', v_cobrancas,
    'avisos', to_jsonb(v_avisos)
  );
end;
$$;
