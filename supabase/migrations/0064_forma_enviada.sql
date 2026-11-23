-- 0064 — a forma de pagamento vai pelo link da ficha (entrega 4b, o lado da
-- equipe; FIC-7 a FIC-10, FIC-12, FIC-13)
--
-- A equipe envia a forma de pagamento no link da ficha de sempre
-- (`/cadastro/<token>`); o cliente lê e responde (a porta anônima é a 0065).
-- O app não cobra nem gera link de pagamento: o do cartão no C6, o Renato gera
-- à mão. Aqui o link que leva a forma se chama "link com a forma", e na tela,
-- "link da ficha".
--
-- As decisões:
--
-- * A conversão sem cotação (FIC-13). A parte em reais diz de quantos dólares
--   veio (`usd_equivalent`): o Renato digita os dois valores, e o app não
--   calcula nada. O que o cliente vê é o que vai no contrato, e a cópia da
--   resposta guarda os dois.
-- * Uma cópia só (`private.copia_da_forma`): a confirmação da equipe, a
--   resposta do cliente e o que a ficha pública mostra saem da mesma função —
--   o cliente não tem como confirmar uma coisa e a prova guardar outra.
-- * O link com a forma é `registration_forms` com `payment_plan_id` (ou o modo
--   `so_pagamento`), e fica congelado inteiro fora das funções, menos o
--   "Conferi" — a linha inteira comparada, como a 0061 fez na forma, para
--   coluna nova nascer protegida. Ninguém estica o prazo nem troca o token pela
--   API. Quem muda liga a marca `dulihub.via_ficha`.
-- * "Aberto" passa a ser `closed_at` e `cancelled_at` nulos: o link com a
--   forma recebe os dados e continua aberto até a resposta do pagamento. A
--   ficha comum fecha junto com o envio, como sempre — `enviar_ficha_de_cadastro`
--   passa a gravar `closed_at` já aqui, para o índice de "um aberto por pessoa"
--   não ver como aberta uma ficha enviada entre esta migration e a 0065.
-- * A versão: `enviar_forma_de_pagamento` recebe o `updated_at` que a prévia
--   mostrou, e todo salvar o toca. Quem clica Editar, Cancelar link, Ajustar ou
--   Refazer diz de que estado parte (`p_de`): o Cancelar link que chega depois
--   do Confirmo do cliente não desfaz a confirmação.
-- * O prazo: 3 dias úteis (segunda a sexta, sem feriados), contados do dia do
--   envio em São Paulo, até 23h59 do último.
-- * Negócio que sai de `open` (Ganho por função, Perdido por `update`) cancela
--   o link aberto e põe a forma enviada em rascunho, num gatilho: um link
--   esquecido num negócio encerrado barraria para sempre qualquer link novo
--   para a pessoa. O gatilho guarda e devolve as marcas, porque roda dentro do
--   `ganhar_negocio`.
-- * Compatível com o código no ar: até o deploy não existe link com a forma; a
--   chamada de hoje de `voltar_forma_para_rascunho` vale pelo padrão de `p_de`;
--   o `gerarLink` de hoje grava os valores padrão; e as chaves novas de
--   `forma_do_ganho` passam pelo esquema antigo, que não é estrito.

-- ------------------------------------------------------------- a conversão

alter table public.payment_plan_parts
  add column usd_equivalent numeric(12,2)
  constraint payment_plan_parts_conversao check (
    usd_equivalent is null
    or (currency = 'BRL' and usd_equivalent > 0 and usd_equivalent <> 'NaN')
  );

comment on column public.payment_plan_parts.usd_equivalent is
  'De quantos dólares a parte em reais veio (FIC-13). O app não converte: a equipe digita os dois valores.';

-- ------------------------------------------------- o link com a forma

alter table public.registration_forms
  add column payment_plan_id uuid,
  add column mode text not null default 'completa'
    constraint registration_forms_modo check (mode in ('completa', 'so_pagamento')),
  add column closed_at timestamptz;

alter table public.registration_forms
  add constraint registration_forms_plan_same_org
  foreign key (payment_plan_id, organization_id)
  references public.payment_plans (id, organization_id)
  on delete set null (payment_plan_id);

comment on column public.registration_forms.payment_plan_id is
  'O link com a forma de pagamento (4b). Nulo: a ficha comum.';
comment on column public.registration_forms.mode is
  'completa: dados pessoais e depois o pagamento; so_pagamento: só o pagamento, sem aceitar dados.';
comment on column public.registration_forms.closed_at is
  'Fechado: a ficha comum ao receber os dados; o link com a forma ao receber a resposta do pagamento.';

-- Antes do gatilho: o que já foi enviado está fechado.
update public.registration_forms set closed_at = submitted_at where submitted_at is not null;

drop index public.registration_forms_um_em_aberto;
create unique index registration_forms_um_em_aberto
  on public.registration_forms (person_id)
  where closed_at is null and cancelled_at is null;

create index registration_forms_plan_idx
  on public.registration_forms (payment_plan_id)
  where payment_plan_id is not null;

create function private.registration_forms_link_com_a_forma()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c_frase   constant text := 'Mude o link da ficha pela tela do negócio.';
  v_marca   boolean := coalesce(current_setting('dulihub.via_ficha', true), '') = 'on';
  v_pessoa  uuid;
  v_titulo  text;
begin
  if tg_op = 'DELETE' then
    -- A cascata da pessoa passa.
    if pg_trigger_depth() > 1 or v_marca then
      return old;
    end if;
    if old.payment_plan_id is not null or old.mode = 'so_pagamento' then
      raise exception '%', c_frase using errcode = 'P0001';
    end if;
    return old;
  end if;

  if v_marca then
    -- As funções da forma: o link é da pessoa do negócio da forma.
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
    -- Pela API (o `gerarLink`), só a ficha comum, com os valores padrão.
    if new.mode <> 'completa' or new.closed_at is not null or new.payment_plan_id is not null then
      raise exception '%', c_frase using errcode = 'P0001';
    end if;

    select o.title into v_titulo
    from public.registration_forms f
    join public.payment_plans pp on pp.id = f.payment_plan_id
    join public.opportunities o on o.id = pp.opportunity_id
    where f.person_id = new.person_id
      and f.closed_at is null
      and f.cancelled_at is null
    limit 1;
    if v_titulo is not null then
      raise exception 'Há um link da ficha aberto no negócio %. Cancele-o no negócio antes.', v_titulo
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.payment_plan_id is not null or old.mode = 'so_pagamento' then
    -- As ações das chaves estrangeiras: a forma apagada com o negócio, e o
    -- usuário excluído (a lição da 0060). Só anulam, e não mexem em mais nada.
    if pg_trigger_depth() > 1
       and (new.payment_plan_id is null or new.payment_plan_id = old.payment_plan_id)
       and (new.created_by is null or new.created_by is not distinct from old.created_by)
       and (to_jsonb(new) - 'payment_plan_id' - 'created_by' - 'reviewed_by' - 'reviewed_at' - 'updated_at')
           = (to_jsonb(old) - 'payment_plan_id' - 'created_by' - 'reviewed_by' - 'reviewed_at' - 'updated_at') then
      return new;
    end if;

    -- Fora das funções, só o "Conferi".
    if (to_jsonb(new) - 'reviewed_at' - 'reviewed_by' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'reviewed_at' - 'reviewed_by' - 'updated_at') then
      raise exception '%', c_frase using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- O link comum segue como antes, menos as três colunas da 4b.
  if new.mode is distinct from old.mode
     or new.closed_at is distinct from old.closed_at
     or new.payment_plan_id is distinct from old.payment_plan_id then
    raise exception '%', c_frase using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.registration_forms_link_com_a_forma() from public, anon, authenticated;

create trigger registration_forms_link_com_a_forma
  before insert or update or delete on public.registration_forms
  for each row execute function private.registration_forms_link_com_a_forma();

-- --------------------------------------------------------------- o prazo

-- 3 dias úteis a partir do dia de `p_de` em São Paulo (o dia do envio não
-- conta), de segunda a sexta, sem feriados. Devolve o início do dia seguinte
-- ao último, em São Paulo: o link vale até 23h59 do último dia.
create function private.fim_do_prazo_em_dias_uteis(p_de timestamptz, p_dias integer)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_dia   date := (p_de at time zone 'America/Sao_Paulo')::date;
  v_uteis integer := 0;
begin
  while v_uteis < p_dias loop
    v_dia := v_dia + 1;
    if extract(isodow from v_dia) < 6 then
      v_uteis := v_uteis + 1;
    end if;
  end loop;
  return (v_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
end;
$$;

revoke execute on function private.fim_do_prazo_em_dias_uteis(timestamptz, integer) from public, anon;
grant execute on function private.fim_do_prazo_em_dias_uteis(timestamptz, integer) to authenticated;

-- ------------------------------------------------------------- a cópia

-- O combinado, como o cliente vê e como a prova guarda: os vistos e as partes
-- com as parcelas e a conversão, nunca a cotação. `security invoker`: a equipe
-- lê sob a própria RLS; a porta anônima (0065) a chama como dona.
create function private.copia_da_forma(p_negocio uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'vistos', coalesce((
      select jsonb_agg(jsonb_build_object('visa_name', i.visa_name, 'amount', i.amount, 'currency', i.currency)
                       order by i.position, i.created_at)
      from public.opportunity_items i
      where i.opportunity_id = p_negocio
    ), '[]'::jsonb),
    'partes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', pt.label,
               'method', pt.method,
               'currency', pt.currency,
               'total', pt.total,
               'installments_count', pt.installments_count,
               'usd_equivalent', pt.usd_equivalent,
               'parcelas', coalesce((
                 select jsonb_agg(jsonb_build_object('number', pi.number, 'amount', pi.amount, 'due_on', pi.due_on)
                                  order by pi.number)
                 from public.payment_plan_installments pi
                 where pi.part_id = pt.id
               ), '[]'::jsonb)
             ) order by pt.position)
      from public.payment_plans pp
      join public.payment_plan_parts pt on pt.plan_id = pp.id
      where pp.opportunity_id = p_negocio
    ), '[]'::jsonb)
  )
$$;

revoke execute on function private.copia_da_forma(uuid) from public, anon;
grant execute on function private.copia_da_forma(uuid) to authenticated;

-- -------------------------------------------------- conferência da forma

-- A de 0058, mais a conversão logo depois do total (P10 do plano da 4b), na
-- mesma ordem de `erroDaParte`: só em reais, maior que zero, no limite, até 2
-- casas. Sem a chave, ou nula, é sem conversão.
create or replace function private.erro_da_forma(p_forma jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c_formato constant text := 'A forma de pagamento veio num formato inválido.';
  v_parte   jsonb;
  v_parcela jsonb;
  v_ordem   bigint;
  v_rotulo  text;
  v_total   numeric;
  v_dolares numeric;
  v_qtd     numeric;
  v_valor   numeric;
  v_dia     text;
  v_soma    numeric;
begin
  if jsonb_typeof(p_forma) is distinct from 'object'
     or jsonb_typeof(p_forma -> 'partes') is distinct from 'array' then
    return c_formato;
  end if;

  for v_parte in select value from jsonb_array_elements(p_forma -> 'partes') loop
    if jsonb_typeof(v_parte) is distinct from 'object'
       or jsonb_typeof(v_parte -> 'label') is distinct from 'string'
       or jsonb_typeof(v_parte -> 'method') is distinct from 'string'
       or jsonb_typeof(v_parte -> 'currency') is distinct from 'string'
       or jsonb_typeof(v_parte -> 'total') is distinct from 'number'
       or jsonb_typeof(v_parte -> 'installments_count') is distinct from 'number'
       or jsonb_typeof(v_parte -> 'parcelas') is distinct from 'array'
       or coalesce(jsonb_typeof(v_parte -> 'usd_equivalent'), 'null') not in ('number', 'null')
       or (v_parte ->> 'method') not in ('pix', 'boleto', 'cartao', 'transferencia', 'cripto')
       or (v_parte ->> 'currency') not in ('BRL', 'USD') then
      return c_formato;
    end if;

    for v_parcela in select value from jsonb_array_elements(v_parte -> 'parcelas') loop
      if jsonb_typeof(v_parcela) is distinct from 'object'
         or jsonb_typeof(v_parcela -> 'number') is distinct from 'number'
         or jsonb_typeof(v_parcela -> 'amount') is distinct from 'number'
         or jsonb_typeof(v_parcela -> 'due_on') is distinct from 'string' then
        return c_formato;
      end if;
    end loop;
  end loop;

  if jsonb_array_length(p_forma -> 'partes') > 10 then
    return 'A forma vai até 10 partes.';
  end if;

  for v_parte in select value from jsonb_array_elements(p_forma -> 'partes') loop
    v_rotulo := trim(v_parte ->> 'label');
    if length(v_rotulo) < 1 or length(v_rotulo) > 80 then
      return 'Dê um nome à parte, com até 80 caracteres.';
    end if;

    v_total := (v_parte ->> 'total')::numeric;
    if v_total <= 0 then
      return format('Informe o valor de %s.', v_rotulo);
    end if;
    if v_total > 9999999999.99 then
      return format('O valor de %s passa do limite.', v_rotulo);
    end if;
    if v_total <> round(v_total, 2) then
      return format('Use no máximo 2 casas decimais em %s.', v_rotulo);
    end if;

    if jsonb_typeof(v_parte -> 'usd_equivalent') = 'number' then
      if v_parte ->> 'currency' <> 'BRL' then
        return 'Só a parte em reais é convertida de dólar.';
      end if;
      v_dolares := (v_parte ->> 'usd_equivalent')::numeric;
      if v_dolares <= 0 then
        return format('Informe de quantos dólares %s foi convertida.', v_rotulo);
      end if;
      if v_dolares > 9999999999.99 then
        return format('O valor de %s passa do limite.', v_rotulo);
      end if;
      if v_dolares <> round(v_dolares, 2) then
        return format('Use no máximo 2 casas decimais em %s.', v_rotulo);
      end if;
    end if;

    v_qtd := (v_parte ->> 'installments_count')::numeric;
    if v_parte ->> 'method' = 'cartao' then
      if v_qtd <> 1 then
        return 'Cartão é um pagamento só, numa data.';
      end if;
    elsif v_qtd <> trunc(v_qtd) or v_qtd < 1 or v_qtd > 36 then
      return 'Parcelas vão de 1 a 36.';
    end if;

    if jsonb_array_length(v_parte -> 'parcelas') <> v_qtd
       or exists (
         select 1
         from jsonb_array_elements(v_parte -> 'parcelas') with ordinality as e(valor, ordem)
         where (e.valor ->> 'number')::numeric <> e.ordem
       ) then
      return format('O número de parcelas de %s não bate com a lista.', v_rotulo);
    end if;

    v_soma := 0;
    for v_parcela, v_ordem in
      select e.valor, e.ordem
      from jsonb_array_elements(v_parte -> 'parcelas') with ordinality as e(valor, ordem)
      order by e.ordem
    loop
      v_valor := (v_parcela ->> 'amount')::numeric;
      if v_valor <= 0 then
        return format('Cada parcela de %s precisa de valor.', v_rotulo);
      end if;
      if v_valor <> round(v_valor, 2) then
        return format('Use no máximo 2 casas decimais em %s.', v_rotulo);
      end if;

      v_dia := v_parcela ->> 'due_on';
      if v_dia !~ '^\d{4}-\d{2}-\d{2}$' then
        return format('A data da parcela %s de %s não é válida.', v_ordem, v_rotulo);
      end if;
      begin
        perform v_dia::date;
      exception when others then
        return format('A data da parcela %s de %s não é válida.', v_ordem, v_rotulo);
      end;

      v_soma := v_soma + v_valor;
    end loop;

    if v_soma <> v_total then
      return format('As parcelas de %s não somam o total.', v_rotulo);
    end if;
  end loop;

  return null;
end;
$$;

-- --------------------------------------------------------------- salvar

-- A de 0058, mais: grava a conversão, recusa a forma enviada e a recusada com
-- a frase de cada uma, e toca `updated_at` — a versão que a prévia leva.
create or replace function public.salvar_forma_de_pagamento(p_negocio uuid, p_forma jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio  record;
  v_forma    record;
  v_erro     text;
  v_parte    jsonb;
  v_posicao  bigint;
  v_parte_id uuid;
begin
  select o.id, o.organization_id, o.status into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for share;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  perform set_config('dulihub.via_forma', 'on', true);

  insert into public.payment_plans (organization_id, opportunity_id, created_by)
  values (v_negocio.organization_id, p_negocio, (select auth.uid()))
  on conflict (opportunity_id) do nothing;

  select pp.id, pp.status, pp.charges_created_at into v_forma
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
  if v_forma.status = 'enviada' then
    raise exception 'A forma foi enviada ao cliente. Use Editar para mudar.' using errcode = 'P0001';
  end if;
  if v_forma.status = 'recusada' then
    raise exception 'O cliente recusou a forma. Use Ajustar para mudar.' using errcode = 'P0001';
  end if;
  if v_forma.status <> 'rascunho' then
    raise exception 'A forma está confirmada. Use Refazer para mudar.' using errcode = 'P0001';
  end if;

  v_erro := private.erro_da_forma(p_forma);
  if v_erro is not null then
    raise exception '%', v_erro using errcode = 'P0001';
  end if;

  delete from public.payment_plan_parts
  where plan_id = v_forma.id
    and position >= jsonb_array_length(p_forma -> 'partes');

  for v_parte, v_posicao in
    select e.valor, e.ordem - 1
    from jsonb_array_elements(p_forma -> 'partes') with ordinality as e(valor, ordem)
    order by e.ordem
  loop
    insert into public.payment_plan_parts
      (organization_id, plan_id, position, label, method, currency, total, installments_count, usd_equivalent)
    values (
      v_negocio.organization_id, v_forma.id, v_posicao,
      trim(v_parte ->> 'label'), v_parte ->> 'method', v_parte ->> 'currency',
      (v_parte ->> 'total')::numeric, (v_parte ->> 'installments_count')::numeric::integer,
      case when jsonb_typeof(v_parte -> 'usd_equivalent') = 'number'
           then (v_parte ->> 'usd_equivalent')::numeric end
    )
    on conflict (plan_id, position) do update
      set label              = excluded.label,
          method             = excluded.method,
          currency           = excluded.currency,
          total              = excluded.total,
          installments_count = excluded.installments_count,
          usd_equivalent     = excluded.usd_equivalent
    returning id into v_parte_id;

    delete from public.payment_plan_installments where part_id = v_parte_id;

    insert into public.payment_plan_installments (organization_id, part_id, number, amount, due_on)
    select v_negocio.organization_id, v_parte_id,
           (p ->> 'number')::numeric::integer, (p ->> 'amount')::numeric, (p ->> 'due_on')::date
    from jsonb_array_elements(v_parte -> 'parcelas') as p;
  end loop;

  -- A versão: a prévia do envio leva este instante (§5.1 do desenho).
  update public.payment_plans set updated_at = now() where id = v_forma.id;

  perform set_config('dulihub.via_forma', 'off', true);
  return v_forma.id;
end;
$$;

-- --------------------------------------------------------------- enviar

create function public.enviar_forma_de_pagamento(
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

  -- O link nunca sai com valores que ninguém viu na prévia.
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

  -- Um link aberto por pessoa: o de outro negócio se cancela lá.
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

  -- Quem já mandou a ficha alguma vez recebe só o pagamento, salvo pedido.
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

  -- A ficha comum aberta é substituída (a prévia avisou).
  update public.registration_forms
  set cancelled_at = now()
  where person_id = v_negocio.person_id
    and payment_plan_id is null
    and closed_at is null
    and cancelled_at is null;

  -- 256 bits, em base64url: o formato que `publico-queries.ts` aceita.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  insert into public.registration_forms
    (organization_id, person_id, token, expires_at, created_by, payment_plan_id, mode)
  values (
    v_negocio.organization_id, v_negocio.person_id, v_token,
    private.fim_do_prazo_em_dias_uteis(now(), 3), (select auth.uid()), v_forma.id, v_modo
  );

  update public.payment_plans set status = 'enviada' where id = v_forma.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (v_negocio.organization_id, v_negocio.person_id, p_negocio,
          'forma_de_pagamento', 'Forma de pagamento enviada ao cliente', (select auth.uid()));

  perform set_config('dulihub.via_ficha', 'off', true);
  perform set_config('dulihub.via_forma', 'off', true);
  return v_token;
end;
$$;

revoke execute on function public.enviar_forma_de_pagamento(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.enviar_forma_de_pagamento(uuid, timestamptz, boolean) to authenticated;

-- ------------------------------------- Editar, Cancelar link, Ajustar, Refazer

-- `p_de` diz de que estado quem clicou partiu. Diferente do atual (o cliente
-- respondeu no meio), nada se grava. O padrão `confirmada` é o Refazer da 4a,
-- que o código no ar chama sem o parâmetro.
drop function public.voltar_forma_para_rascunho(uuid);

create function public.voltar_forma_para_rascunho(p_negocio uuid, p_de text default 'confirmada')
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio record;
  v_forma   record;
  v_eu      uuid := (select auth.uid());
begin
  if p_de is null or p_de not in ('enviada', 'recusada', 'confirmada') then
    raise exception 'A forma de pagamento veio num formato inválido.' using errcode = 'P0001';
  end if;

  select o.id, o.organization_id, o.status, o.owner_id, o.person_id into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for share;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  -- Refazer desfaz um acordo: CRM-10. Editar, Cancelar link e Ajustar, não.
  if p_de = 'confirmada'
     and v_negocio.owner_id is distinct from v_eu
     and not private.current_user_manages(v_negocio.organization_id) then
    raise exception 'Só o dono do negócio ou a gestão confirmam a forma de pagamento.'
      using errcode = 'P0001';
  end if;

  select pp.id, pp.status, pp.charges_created_at into v_forma
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
  if v_forma.id is null or v_forma.status <> p_de then
    raise exception 'A forma de pagamento mudou enquanto você olhava. Atualize a página.'
      using errcode = 'P0001';
  end if;

  perform set_config('dulihub.via_forma', 'on', true);
  perform set_config('dulihub.via_ficha', 'on', true);

  if p_de = 'enviada' then
    update public.registration_forms
    set cancelled_at = now()
    where payment_plan_id = v_forma.id
      and closed_at is null
      and cancelled_at is null;
  end if;

  update public.payment_plans set status = 'rascunho' where id = v_forma.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (v_negocio.organization_id, v_negocio.person_id, p_negocio, 'forma_de_pagamento',
          case p_de
            when 'enviada' then 'Forma de pagamento editada; o link enviado foi cancelado'
            when 'recusada' then 'Forma de pagamento ajustada'
            else 'Forma de pagamento refeita'
          end,
          v_eu);

  perform set_config('dulihub.via_ficha', 'off', true);
  perform set_config('dulihub.via_forma', 'off', true);
end;
$$;

revoke execute on function public.voltar_forma_para_rascunho(uuid, text) from public, anon;
grant execute on function public.voltar_forma_para_rascunho(uuid, text) to authenticated;

-- ------------------------------------------------ confirmar pela equipe

-- A de 0058, mais o ramo de `enviada` (o cliente respondeu pelo WhatsApp): o
-- link aberto, vencido ou não, é cancelado na mesma gravação. A recusada passa
-- antes por Ajustar. A cópia sai de `copia_da_forma`.
create or replace function public.confirmar_forma_de_pagamento_pela_equipe(
  p_negocio    uuid,
  p_observacao text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio  record;
  v_forma    record;
  v_eu       uuid := (select auth.uid());
  v_obs      text := nullif(trim(p_observacao), '');
  v_copia    jsonb;
begin
  select o.id, o.organization_id, o.status, o.owner_id, o.person_id into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for share;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  if v_negocio.owner_id is distinct from v_eu
     and not private.current_user_manages(v_negocio.organization_id) then
    raise exception 'Só o dono do negócio ou a gestão confirmam a forma de pagamento.'
      using errcode = 'P0001';
  end if;

  if length(v_obs) > 500 then
    raise exception 'A observação vai até 500 caracteres.' using errcode = 'P0001';
  end if;

  select pp.id, pp.status, pp.charges_created_at into v_forma
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
  if v_forma.status = 'recusada' then
    raise exception 'O cliente recusou a forma. Use Ajustar para mudar.' using errcode = 'P0001';
  end if;
  if v_forma.id is not null and v_forma.status not in ('rascunho', 'enviada') then
    raise exception 'A forma está confirmada. Use Refazer para mudar.' using errcode = 'P0001';
  end if;
  if v_forma.id is null
     or not exists (select 1 from public.payment_plan_parts pt where pt.plan_id = v_forma.id)
     or not exists (select 1 from public.opportunity_items i where i.opportunity_id = p_negocio) then
    raise exception 'Acrescente pelo menos um visto e uma parte antes de confirmar.'
      using errcode = 'P0001';
  end if;

  v_copia := private.copia_da_forma(p_negocio);

  perform set_config('dulihub.via_forma', 'on', true);
  perform set_config('dulihub.via_ficha', 'on', true);

  insert into public.payment_plan_responses (organization_id, plan_id, decision, reason, snapshot)
  values (v_negocio.organization_id, v_forma.id, 'confirmada_pela_equipe', v_obs, v_copia);

  if v_forma.status = 'enviada' then
    update public.registration_forms
    set cancelled_at = now()
    where payment_plan_id = v_forma.id
      and closed_at is null
      and cancelled_at is null;
  end if;

  update public.payment_plans set status = 'confirmada' where id = v_forma.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (v_negocio.organization_id, v_negocio.person_id, p_negocio,
          'forma_de_pagamento', 'Forma de pagamento confirmada pela equipe', v_eu);

  perform set_config('dulihub.via_ficha', 'off', true);
  perform set_config('dulihub.via_forma', 'off', true);
end;
$$;

-- ------------------------------------------------------ a resposta entra

-- A de 0058, mais o ramo do cliente: sem usuário (a porta anônima, 0065), a
-- forma enviada, o link desta forma, e só `confirmada` ou `recusada`; quem
-- respondeu é o nome da pessoa do link. Com usuário, a equipe confirma a
-- partir de `rascunho` ou de `enviada`.
create or replace function private.payment_plan_responses_na_entrada()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_eu     uuid := (select auth.uid());
  v_status text;
  v_nome   text;
begin
  if coalesce(current_setting('dulihub.via_forma', true), '') <> 'on' then
    raise exception 'A confirmação da forma de pagamento só nasce pela tela do negócio.'
      using errcode = 'P0001';
  end if;

  select pp.status into v_status from public.payment_plans pp where pp.id = new.plan_id;

  if v_eu is null then
    if new.decision not in ('confirmada', 'recusada') or new.registration_form_id is null then
      raise exception 'A confirmação da forma de pagamento só nasce pela tela do negócio.'
        using errcode = 'P0001';
    end if;
    if v_status is distinct from 'enviada' then
      raise exception 'Este link não está mais disponível.' using errcode = 'P0001';
    end if;

    select p.full_name into v_nome
    from public.registration_forms f
    join public.people p on p.id = f.person_id
    where f.id = new.registration_form_id
      and f.payment_plan_id = new.plan_id;
    if not found then
      raise exception 'Este link não está mais disponível.' using errcode = 'P0001';
    end if;

    new.answered_by      := null;
    new.answered_by_name := v_nome;
    new.answered_at      := now();
    return new;
  end if;

  if v_status is null or v_status not in ('rascunho', 'enviada') then
    raise exception 'A forma está confirmada. Use Refazer para mudar.' using errcode = 'P0001';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email) into v_nome
  from public.profiles p where p.id = v_eu;

  new.decision             := 'confirmada_pela_equipe';
  new.answered_by          := v_eu;
  new.answered_by_name     := v_nome;
  new.registration_form_id := null;
  new.answered_at          := now();
  return new;
end;
$$;

-- ----------------------------------------------------- a trava dos vistos

-- A de 0058, mais: a forma enviada também prende os vistos — a forma que o
-- cliente está lendo não muda por baixo dele (decisão 10).
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

-- A de 0058, mais: negócio com o link com a forma aberto não se exclui (§5.9).
create or replace function private.opportunities_ganho_nao_se_apaga()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 2 and old.status = 'won' then
    raise exception 'Reabra ou encerre os processos; o negócio ganho fica como registro.'
      using errcode = 'P0001';
  end if;

  if pg_trigger_depth() < 2 and exists (
    select 1
    from public.payment_plan_responses r
    join public.payment_plans pp on pp.id = r.plan_id
    where pp.opportunity_id = old.id
  ) then
    raise exception 'A forma de pagamento já foi confirmada; o negócio fica como registro.'
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

-- --------------------------------------------- o negócio que fecha

create function private.opportunities_fecha_o_link_da_ficha()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_forma       record;
  v_marca_forma text := coalesce(current_setting('dulihub.via_forma', true), '');
  v_marca_ficha text := coalesce(current_setting('dulihub.via_ficha', true), '');
begin
  -- O negócio já está travado pelo próprio `update`; a forma depois, e o link.
  select pp.id, pp.status into v_forma
  from public.payment_plans pp
  where pp.opportunity_id = new.id
  for update;

  if v_forma.id is null or v_forma.status <> 'enviada' then
    return null;
  end if;

  perform set_config('dulihub.via_forma', 'on', true);
  perform set_config('dulihub.via_ficha', 'on', true);

  update public.registration_forms
  set cancelled_at = now()
  where payment_plan_id = v_forma.id
    and closed_at is null
    and cancelled_at is null;

  update public.payment_plans set status = 'rascunho' where id = v_forma.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (new.organization_id, new.person_id, new.id, 'forma_de_pagamento',
          'Link da ficha cancelado: o negócio foi encerrado', (select auth.uid()));

  -- Devolve as marcas como estavam: dentro do `ganhar_negocio`, quem chamou
  -- ainda vai usá-las.
  perform set_config('dulihub.via_forma', v_marca_forma, true);
  perform set_config('dulihub.via_ficha', v_marca_ficha, true);
  return null;
end;
$$;

revoke execute on function private.opportunities_fecha_o_link_da_ficha() from public, anon, authenticated;

create trigger opportunities_fecha_o_link_da_ficha
  after update of status on public.opportunities
  for each row
  when (old.status = 'open' and new.status <> 'open')
  execute function private.opportunities_fecha_o_link_da_ficha();

-- ------------------------------------------------- a ficha comum fecha

-- A de 0035, mais: grava `closed_at` junto com `submitted_at` (o "aberto" da
-- 0064), e recusa o link com a forma — a porta dele é a 0065, que substitui
-- esta função inteira. Liga a marca `via_ficha`, que o gatilho novo pede.
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
  v_link     public.registration_forms;
  v_antes    jsonb;
  v_gravado  jsonb;
begin
  select * into v_link
  from public.registration_forms
  where token = p_token
  for update;

  if not found then
    raise exception 'Link não encontrado.' using errcode = 'P0001';
  end if;

  if v_link.submitted_at is not null
     or v_link.closed_at is not null
     or v_link.cancelled_at is not null
     or v_link.expires_at <= now()
     or v_link.payment_plan_id is not null
     or v_link.mode <> 'completa'
  then
    raise exception 'Este link não está mais disponível.' using errcode = 'P0001';
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

  update public.registration_forms
  set submitted_at = now(),
      closed_at    = now(),
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

-- ------------------------------------------------------------ o Ganho

-- A de 0059, mais: as partes com a conversão, a decisão da última resposta
-- (`ultima_decisao`: o resumo diz "confirmada pelo cliente" ou "pela
-- equipe", e "recusada") e `enviada_em`, a data do link aberto. Com a forma
-- enviada ou recusada, nenhuma cobrança nasce. `confirmada_em` e
-- `confirmada_por` continuam sendo a data e o nome da última resposta (P3).
create or replace function private.forma_do_ganho(p_negocio uuid)
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
  v_enviada   timestamptz;
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
        'ultima_decisao', null,
        'enviada_em', null,
        'cobrancas_criadas_em', null,
        'partes', '[]'::jsonb
      ),
      'cobrancas', '[]'::jsonb
    );
  end if;

  v_situacao := case when v_forma.charges_created_at is not null then 'cobrancas_criadas' else v_forma.status end;

  select r.answered_at, r.answered_by_name, r.decision into v_resposta
  from public.payment_plan_responses r
  where r.plan_id = v_forma.id
  order by r.answered_at desc, r.created_at desc
  limit 1;

  select f.created_at into v_enviada
  from public.registration_forms f
  where f.payment_plan_id = v_forma.id
    and f.closed_at is null
    and f.cancelled_at is null
  order by f.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pt.id,
           'label', pt.label,
           'method', pt.method,
           'currency', pt.currency,
           'total', pt.total,
           'installments_count', pt.installments_count,
           'usd_equivalent', pt.usd_equivalent,
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
      'ultima_decisao', v_resposta.decision,
      'enviada_em', v_enviada,
      'cobrancas_criadas_em', v_forma.charges_created_at,
      'partes', v_partes
    ),
    'cobrancas', v_cobrancas
  );
end;
$$;
