-- 0065 — a porta do pagamento (entrega 4b; FIC-8, FIC-9)
--
-- O cliente, sem login, abre o link da ficha com a forma de pagamento, manda
-- os dados pessoais (no modo `completa`), lê a forma e responde Confirmo ou Há
-- algo errado. O app não cobra nem gera link de pagamento: o do C6, o Renato
-- gera à mão; o que o cliente faz aqui é dar o OK no combinado.
--
-- ## A terceira função da porta sem login
--
-- A 0035 abriu duas funções ao `anon` (abrir e enviar a ficha) e explicou por
-- que a porta tem a largura de uma pessoa por token. Esta abre a terceira,
-- `responder_forma_de_pagamento`, com as mesmas travas:
--
-- 1. O token de 256 bits é a única chave. Sem ele, nenhuma linha.
-- 2. Do navegador chegam só sim, não e o motivo (até 500 caracteres). A cópia
--    do combinado é montada **aqui**, por `private.copia_da_forma` — a mesma
--    que mostra a forma ao cliente em `abrir_ficha_de_cadastro`: ele não tem
--    como confirmar uma coisa e a prova guardar outra.
-- 3. Uso único, com prazo. As travas seguem a ordem do resto da forma —
--    negócio, forma, link —, e tudo é conferido de novo depois de travar: dois
--    Confirmo ao mesmo tempo gravam uma resposta só.
-- 4. A leitura não devolve dado: nome e contato só antes dos dados (como na
--    0035), e a forma só quando o cliente está no pagamento. Nunca a cotação,
--    documento ou endereço.
-- 5. Só `anon` executa. O aviso do Supabase "definer executável por anon"
--    passa a valer para três funções: estas duas da 0035 e a nova.
--
-- ## O modo e o fechamento
--
-- `abrir_ficha_de_cadastro` ganha a situação `aguardando_pagamento` (dados
-- recebidos, ou modo `so_pagamento`) e `respondida`; negócio fora de `open`
-- aparece como cancelado. `enviar_ficha_de_cadastro` aceita o link com a forma
-- no modo `completa` e o deixa aberto (`closed_at` nulo) até a resposta do
-- pagamento; o `so_pagamento` não aceita dados pessoais.
--
-- ## A correção da 0064 (revisão de segurança)
--
-- O gatilho `registration_forms_link_com_a_forma` roda como dono e antes da
-- RLS. No insert, ele procurava o link com a forma aberto da pessoa em
-- qualquer organização e punha o título do negócio na frase: quem soubesse o
-- id de uma pessoa de outra organização lia o título do negócio dela no erro.
-- Agora só procura quando quem insere é membro da organização da linha, e só
-- nos links dessa organização; nos outros casos a RLS e a chave estrangeira
-- recusam logo depois, sem dizer nada.

-- ------------------------------------- o gatilho do link, sem vazar título

create or replace function private.registration_forms_link_com_a_forma()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c_frase   constant text := 'Mude o link da ficha pela tela do negócio.';
  v_marca   boolean := coalesce(current_setting('dulihub.via_ficha', true), '') = 'on';
  v_pessoa  uuid;
  v_titulo  text;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 or v_marca then
      return old;
    end if;
    if old.payment_plan_id is not null or old.mode = 'so_pagamento' then
      raise exception '%', c_frase using errcode = 'P0001';
    end if;
    return old;
  end if;

  if v_marca then
    if new.payment_plan_id is not null then
      select o.person_id into v_pessoa
      from public.payment_plans pp
      join public.opportunities o on o.id = pp.opportunity_id
      where pp.id = new.payment_plan_id;
      if v_pessoa is distinct from new.person_id then
        raise exception '%', c_frase using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.mode <> 'completa' or new.closed_at is not null or new.payment_plan_id is not null then
      raise exception '%', c_frase using errcode = 'P0001';
    end if;

    -- Só para quem é da organização da linha, e só nos links dela: este
    -- gatilho roda antes da RLS, e a frase leva o título do negócio.
    if new.organization_id in (select private.current_user_organizations()) then
      select o.title into v_titulo
      from public.registration_forms f
      join public.payment_plans pp on pp.id = f.payment_plan_id
      join public.opportunities o on o.id = pp.opportunity_id
      where f.person_id = new.person_id
        and f.organization_id = new.organization_id
        and f.closed_at is null
        and f.cancelled_at is null
      limit 1;
      if v_titulo is not null then
        raise exception 'Há um link da ficha aberto no negócio %. Cancele-o no negócio antes.', v_titulo
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if old.payment_plan_id is not null or old.mode = 'so_pagamento' then
    if pg_trigger_depth() > 1
       and (new.payment_plan_id is null or new.payment_plan_id = old.payment_plan_id)
       and (new.created_by is null or new.created_by is not distinct from old.created_by)
       and (to_jsonb(new) - 'payment_plan_id' - 'created_by' - 'reviewed_by' - 'reviewed_at' - 'updated_at')
           = (to_jsonb(old) - 'payment_plan_id' - 'created_by' - 'reviewed_by' - 'reviewed_at' - 'updated_at') then
      return new;
    end if;

    if (to_jsonb(new) - 'reviewed_at' - 'reviewed_by' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'reviewed_at' - 'reviewed_by' - 'updated_at') then
      raise exception '%', c_frase using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.mode is distinct from old.mode
     or new.closed_at is distinct from old.closed_at
     or new.payment_plan_id is distinct from old.payment_plan_id then
    raise exception '%', c_frase using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------- abrir_ficha_de_cadastro

-- O retorno muda: `drop` e `create`, e os grants de novo.
drop function public.abrir_ficha_de_cadastro(text);

create function public.abrir_ficha_de_cadastro(p_token text)
returns table (
  situacao    text,
  nome        text,
  email       text,
  ddi         text,
  telefone    text,
  organizacao text,
  modo        text,
  tem_forma   boolean,
  forma       jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with link as (
    select
      f.submitted_at, f.closed_at, f.cancelled_at, f.expires_at, f.mode,
      (f.payment_plan_id is not null or f.mode = 'so_pagamento') as com_forma,
      p.full_name, p.email, p.phone_country_code, p.phone, p.deleted_at,
      o.name as organizacao,
      pp.opportunity_id as negocio,
      op.status as negocio_status
    from public.registration_forms f
    join public.people p on p.id = f.person_id
    join public.organizations o on o.id = f.organization_id
    left join public.payment_plans pp on pp.id = f.payment_plan_id
    left join public.opportunities op on op.id = pp.opportunity_id
    where f.token = p_token
  ),
  estado as (
    select
      l.*,
      case
        when l.cancelled_at is not null or l.deleted_at is not null
          or (l.com_forma and l.negocio_status is distinct from 'open') then 'cancelada'
        when l.closed_at is not null then case when l.com_forma then 'respondida' else 'enviada' end
        when l.submitted_at is not null and not l.com_forma then 'enviada'
        when l.expires_at <= now() then 'expirada'
        when l.com_forma and (l.submitted_at is not null or l.mode = 'so_pagamento') then 'aguardando_pagamento'
        else 'aberta'
      end as situacao
    from link l
  )
  select
    e.situacao,
    case when e.situacao = 'aberta' then e.full_name end,
    case when e.situacao = 'aberta' then e.email end,
    case when e.situacao = 'aberta' then e.phone_country_code end,
    case when e.situacao = 'aberta' then e.phone end,
    e.organizacao,
    e.mode,
    e.com_forma,
    case when e.situacao = 'aguardando_pagamento' then private.copia_da_forma(e.negocio) end
  from estado e
$$;

revoke execute on function public.abrir_ficha_de_cadastro(text) from public, anon, authenticated;
grant execute on function public.abrir_ficha_de_cadastro(text) to anon;

-- --------------------------------------------------- enviar_ficha_de_cadastro

-- A da 0064, mais o link com a forma no modo `completa`: grava os dados e
-- deixa o link aberto até a resposta do pagamento. O `so_pagamento` não
-- aceita dados pessoais; negócio fora de `open`, também não.
create or replace function public.enviar_ficha_de_cadastro(
  p_token         text,
  p_dados         jsonb,
  p_consentimento text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link      public.registration_forms;
  v_com_forma boolean;
  v_negocio   text;
  v_antes     jsonb;
  v_gravado   jsonb;
begin
  select * into v_link
  from public.registration_forms
  where token = p_token
  for update;

  if not found then
    raise exception 'Link não encontrado.' using errcode = 'P0001';
  end if;

  v_com_forma := v_link.payment_plan_id is not null or v_link.mode = 'so_pagamento';

  if v_link.submitted_at is not null
     or v_link.closed_at is not null
     or v_link.cancelled_at is not null
     or v_link.expires_at <= now()
     or v_link.mode <> 'completa'
  then
    raise exception 'Este link não está mais disponível.' using errcode = 'P0001';
  end if;

  if v_com_forma then
    select op.status into v_negocio
    from public.payment_plans pp
    join public.opportunities op on op.id = pp.opportunity_id
    where pp.id = v_link.payment_plan_id;
    if v_negocio is distinct from 'open' then
      raise exception 'Este link não está mais disponível.' using errcode = 'P0001';
    end if;
  end if;

  if nullif(btrim(p_consentimento), '') is null then
    raise exception 'É preciso aceitar a declaração.' using errcode = 'P0001';
  end if;

  select
    jsonb_object_agg(c, to_jsonb(p)->c)
    || jsonb_build_object('dependents', coalesce((
         select jsonb_agg(jsonb_build_object(
                  'full_name', d.full_name,
                  'relationship', d.relationship,
                  'birth_date', d.birth_date,
                  'birth_country', d.birth_country
                ) order by d.position)
         from public.person_dependents d
         where d.person_id = p.id
       ), '[]'::jsonb))
  into v_antes
  from public.people p, unnest(private.campos_da_ficha()) as c
  where p.id = v_link.person_id and p.deleted_at is null
  group by p.id;

  if v_antes is null then
    raise exception 'Este link não está mais disponível.' using errcode = 'P0001';
  end if;

  v_gravado := public.salvar_cadastro(
    v_link.person_id,
    p_dados || jsonb_build_object('dependents', coalesce(p_dados->'dependents', '[]'::jsonb)),
    true
  );

  perform set_config('dulihub.via_ficha', 'on', true);

  -- Com a forma, o link continua aberto: falta a resposta do pagamento.
  update public.registration_forms
  set submitted_at = now(),
      closed_at    = case when v_com_forma then null else now() end,
      answers      = v_gravado,
      previous     = v_antes,
      consent_text = left(btrim(p_consentimento), 2000)
  where id = v_link.id;

  perform set_config('dulihub.via_ficha', 'off', true);

  insert into public.activities (organization_id, person_id, type, description)
  values (
    v_link.organization_id,
    v_link.person_id,
    'registration_submitted',
    'Ficha de cadastro preenchida pelo cliente'
  );
end;
$$;

-- -------------------------------------------- responder_forma_de_pagamento

create function public.responder_forma_de_pagamento(
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
  v_motivo   text := nullif(btrim(p_motivo), '');
  v_copia    jsonb;
begin
  -- Pelo token, só para achar o negócio — sem travar ainda.
  select f.id, f.payment_plan_id, pp.opportunity_id into v_achado
  from public.registration_forms f
  join public.payment_plans pp on pp.id = f.payment_plan_id
  where f.token = p_token;
  if not found or p_aceita is null then
    raise exception '%', c_indisponivel using errcode = 'P0001';
  end if;

  -- As travas na ordem da forma: negócio, forma, link.
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

  -- Tudo de novo, depois de travar.
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

  -- O motivo é da recusa; com Confirmo, não se guarda (P16 do plano).
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

revoke execute on function public.responder_forma_de_pagamento(text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.responder_forma_de_pagamento(text, boolean, text) to anon;
