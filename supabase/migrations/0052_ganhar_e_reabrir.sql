-- 0052 — Ganhar e reabrir negócio pelo banco (entrega 3, fase 1)
--
-- O Ganho deixa de ser uma sequência de chamadas da tela (o I2: metade
-- gravada quando a rede cai no meio) e vira uma função, numa transação:
-- negócio ganho, histórico, cliente, dono, participantes e um processo por
-- visto. Tudo ou nada (CRM-14).
--
-- `p_simular` faz as mesmas conferências e devolve o mesmo formato sem
-- gravar: é o resumo que a tela mostra antes de confirmar. Assim o resumo e
-- a gravação nunca divergem (spec §4.5).
--
-- Quem pode (CRM-10): o dono do negócio ou a gestão, conferido aqui — e,
-- a partir da 0054, também por gatilho em `opportunities`, que só deixa
-- entrar e sair do ganho com a marca `dulihub.via_ganho` que estas funções
-- ligam (§3). Por ora nada recusa o Ganho antigo da tela, que continua no ar
-- até o deploy.
--
-- Decisões do plano: D1 (cobranças só na entrega 4; `cobrancas` sai vazia e
-- `p_cobrancas_sem_confirmacao` é ignorado até lá), D5 (reabrir é só do
-- ganho), D6 (perdido pode ser ganho direto), D8 (participantes do negócio
-- entram na pessoa), D9 (dono só para quem vira cliente agora, e nunca
-- derruba o Ganho), D14 (textos do histórico), D17 (só item sem processo
-- precisa de visto).

create function public.ganhar_negocio(
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
      v_avisos := array_append(v_avisos,
        'O dono do negócio não está na equipe deste contato: você fica como dono do cliente.');
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
      'cobrancas', '[]'::jsonb,
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

  -- (7) Cobranças: entrega 4 (D1).

  -- (8) Desliga a marca e devolve o mesmo formato do resumo.
  perform set_config('dulihub.via_ganho', 'off', true);

  return jsonb_build_object(
    'negocio', p_negocio,
    'pessoa', jsonb_build_object('id', v_pessoa.id, 'nome', v_pessoa.full_name,
                                 'vira_cliente', v_vira),
    'itens', v_itens,
    'processos', v_processos,
    'cobrancas', '[]'::jsonb,
    'avisos', to_jsonb(v_avisos)
  );
end;
$$;

revoke execute on function public.ganhar_negocio(uuid, boolean, boolean) from public, anon;
grant execute on function public.ganhar_negocio(uuid, boolean, boolean) to authenticated;

comment on function public.ganhar_negocio(uuid, boolean, boolean) is
  'Ganho numa transação (CRM-14): negócio, histórico, cliente, dono, participantes e um processo por visto. p_simular devolve o resumo sem gravar.';

create function public.reabrir_negocio(p_negocio uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio record;
  v_etapa   record;
begin
  select o.id, o.organization_id, o.person_id, o.pipeline_id, o.owner_id, o.status
    into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for update;

  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  if v_negocio.owner_id is distinct from (select auth.uid())
     and not private.current_user_manages(v_negocio.organization_id) then
    raise exception 'Só o dono do negócio ou a gestão reabrem o negócio.' using errcode = 'P0001';
  end if;

  -- Perdido reabre pela tela, como sempre (D5).
  if v_negocio.status <> 'won' then
    raise exception 'Este negócio não está ganho.' using errcode = 'P0001';
  end if;

  select s.id, s.name, s.probability into v_etapa
  from public.pipeline_stages s
  where s.pipeline_id = v_negocio.pipeline_id and not s.is_won and not s.is_lost
  order by s.position
  limit 1;

  if not found then
    raise exception 'O funil não tem etapa aberta para onde voltar.' using errcode = 'P0001';
  end if;

  perform set_config('dulihub.via_ganho', 'on', true);

  -- Não toca em pessoa, processo nem cobrança: cliente não volta a lead.
  update public.opportunities
  set stage_id    = v_etapa.id,
      status      = 'open',
      closed_at   = null,
      probability = v_etapa.probability,
      lost_reason = null
  where id = p_negocio;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (
    v_negocio.organization_id, v_negocio.person_id, p_negocio, 'stage_change',
    'Negócio reaberto — voltou para ' || v_etapa.name, (select auth.uid())
  );

  perform set_config('dulihub.via_ganho', 'off', true);
end;
$$;

revoke execute on function public.reabrir_negocio(uuid) from public, anon;
grant execute on function public.reabrir_negocio(uuid) to authenticated;

comment on function public.reabrir_negocio(uuid) is
  'Reabre um negócio ganho na primeira etapa aberta (CRM-15). Não toca em pessoa, processo nem cobrança.';
