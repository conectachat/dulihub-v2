-- 0058 — forma de pagamento do negócio (entrega 4a; FIC-7, FIC-10, FIC-11, FIC-12)
--
-- A equipe define no lead como o cliente vai pagar (entrada, parcelas, cartão,
-- à vista; cada parte na sua moeda) e o dono do negócio ou a gestão a
-- confirma. No Ganho (0059), a forma confirmada vira uma cobrança por parte.
--
-- As decisões de modelagem:
--
-- * A forma só muda pelas três funções (`salvar_forma_de_pagamento`,
--   `confirmar_forma_de_pagamento_pela_equipe`, `voltar_forma_para_rascunho`),
--   que ligam a marca `dulihub.via_forma`. Um gatilho recusa o resto, também na
--   organização de teste: o `update` de `status` pela API forjaria uma forma
--   confirmada. A exceção é a cotação do C6 (`reference_rate` e a anotação),
--   que a equipe grava direto, em qualquer estado.
-- * A confirmação é prova: guarda a cópia do que foi combinado (vistos, partes
--   e parcelas, sem a cotação), montada no banco. Não muda nem se apaga — só a
--   cascata da pessoa passa. Por isso negócio com confirmação registrada não se
--   exclui (a cascata do negócio apagaria a prova), e `payment_plans` não tem
--   policy de delete.
-- * Com a forma confirmada, os vistos do negócio travam (decisão do Renato,
--   21/nov) até o Ganho criar as cobranças: daí em diante a forma é registro, e
--   o negócio reaberto volta a aceitar visto (CRM-15).
-- * Leitura (P6 do plano): `payment_plans` só por membros da organização; as
--   partes, as parcelas e as respostas pela subconsulta na forma, como
--   `opportunity_items` lê por `opportunities` (0051). O cliente do portal não
--   é membro e não lê nada.
-- * `receivables.payment_plan_part_id` só se grava pelo Ganho (P13): uma
--   cobrança manual marcada como da forma derrubaria o próximo Ganho com
--   duplicata.
-- * Os quatro estados entram no `check` já agora (`enviada` e `recusada` são da
--   4b), e a tabela de respostas nasce inteira, com `registration_form_id`.

-- ------------------------------------------------------------- tabelas

create table public.payment_plans (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  opportunity_id      uuid not null,
  status              text not null default 'rascunho'
                      check (status in ('rascunho', 'enviada', 'confirmada', 'recusada')),
  reference_rate      numeric(12,4) check (reference_rate > 0),
  reference_rate_note text check (reference_rate_note is null or length(reference_rate_note) <= 200),
  charges_created_at  timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (id, organization_id),
  -- Uma forma por negócio.
  unique (opportunity_id),

  constraint payment_plans_opportunity_same_org
    foreign key (opportunity_id, organization_id)
    references public.opportunities (id, organization_id) on delete cascade
);

comment on table public.payment_plans is
  'Forma de pagamento do negócio (FIC-7). Muda só pelas funções; a cotação, direto.';

create table public.payment_plan_parts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  plan_id            uuid not null,
  position           integer not null check (position >= 0),
  label              text not null check (length(trim(label)) between 1 and 80),
  method             text not null
                     check (method in ('pix', 'boleto', 'cartao', 'transferencia', 'cripto')),
  currency           char(3) not null check (currency in ('BRL', 'USD')),
  total              numeric(12,2) not null check (total > 0),
  installments_count integer not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (id, organization_id),
  unique (plan_id, position),

  -- Cartão é um pagamento só: a Duli recebe tudo antecipado (21/nov).
  constraint payment_plan_parts_numero_de_parcelas check (
    (method = 'cartao' and installments_count = 1)
    or (method <> 'cartao' and installments_count between 1 and 36)
  ),

  constraint payment_plan_parts_plan_same_org
    foreign key (plan_id, organization_id)
    references public.payment_plans (id, organization_id) on delete cascade
);

create table public.payment_plan_installments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  part_id         uuid not null,
  number          integer not null check (number > 0),
  amount          numeric(12,2) not null check (amount > 0),
  due_on          date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),
  unique (part_id, number),

  constraint payment_plan_installments_part_same_org
    foreign key (part_id, organization_id)
    references public.payment_plan_parts (id, organization_id) on delete cascade
);

create table public.payment_plan_responses (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  plan_id              uuid not null,
  -- A resposta do cliente pelo link (4b). Ação padrão (`no action`): `set null`
  -- quebraria o `check` abaixo.
  registration_form_id uuid,
  decision             text not null
                       check (decision in ('confirmada', 'recusada', 'confirmada_pela_equipe')),
  reason               text check (reason is null or length(reason) <= 500),
  snapshot             jsonb not null,
  answered_at          timestamptz not null default now(),
  -- `set null` como o `created_by` da casa: excluir o usuário não é recusado,
  -- e o nome guardado continua dizendo quem confirmou.
  answered_by          uuid references public.profiles(id) on delete set null,
  answered_by_name     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (id, organization_id),

  constraint payment_plan_responses_quem_respondeu check (
    (decision = 'confirmada_pela_equipe' and registration_form_id is null)
    or (decision <> 'confirmada_pela_equipe' and registration_form_id is not null)
  ),

  constraint payment_plan_responses_plan_same_org
    foreign key (plan_id, organization_id)
    references public.payment_plans (id, organization_id) on delete cascade,

  constraint payment_plan_responses_form_same_org
    foreign key (registration_form_id, organization_id)
    references public.registration_forms (id, organization_id)
);

create index payment_plan_parts_plan_idx on public.payment_plan_parts (plan_id, position);
create index payment_plan_installments_part_idx on public.payment_plan_installments (part_id, number);
create index payment_plan_responses_plan_idx on public.payment_plan_responses (plan_id, answered_at);

alter table public.receivables add column payment_plan_part_id uuid;

create unique index receivables_payment_plan_part_idx
  on public.receivables (payment_plan_part_id) where payment_plan_part_id is not null;

alter table public.receivables
  add constraint receivables_payment_plan_part_same_org
  foreign key (payment_plan_part_id, organization_id)
  references public.payment_plan_parts (id, organization_id)
  on delete set null (payment_plan_part_id);

comment on column public.receivables.payment_plan_part_id is
  'A parte da forma de pagamento que gerou esta cobrança no Ganho (REC-6). Só o Ganho grava.';

-- ------------------------------------------- updated_at e lápide nas quatro

do $$
declare
  t text;
begin
  foreach t in array array['payment_plans', 'payment_plan_parts', 'payment_plan_installments', 'payment_plan_responses']
  loop
    execute format(
      'create trigger %I before update on public.%I
       for each row execute function private.set_updated_at()',
      t || '_set_updated_at', t);
    execute format(
      'create trigger %I after delete on public.%I
       for each row execute function private.marcar_lapide()',
      t || '_marcar_lapide', t);
  end loop;
end $$;

-- ------------------------------------------------------------------- RLS

alter table public.payment_plans enable row level security;
alter table public.payment_plan_parts enable row level security;
alter table public.payment_plan_installments enable row level security;
alter table public.payment_plan_responses enable row level security;

-- Só membros: o cliente do portal nunca lê a forma nem a cotação.
create policy payment_plans_select on public.payment_plans
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy payment_plans_insert on public.payment_plans
  for insert to authenticated
  with check (organization_id in (select private.current_user_organizations()));

create policy payment_plans_update on public.payment_plans
  for update to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- Sem delete: pela API apaga 0 linhas. O gatilho abaixo é a segunda camada.

create policy payment_plan_parts_select on public.payment_plan_parts
  for select to authenticated
  using (exists (select 1 from public.payment_plans pp where pp.id = payment_plan_parts.plan_id));

create policy payment_plan_parts_write on public.payment_plan_parts
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- A parcela não tem `plan_id`: passa pela parte, que passa pela forma.
create policy payment_plan_installments_select on public.payment_plan_installments
  for select to authenticated
  using (exists (
    select 1 from public.payment_plan_parts pt where pt.id = payment_plan_installments.part_id
  ));

create policy payment_plan_installments_write on public.payment_plan_installments
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy payment_plan_responses_select on public.payment_plan_responses
  for select to authenticated
  using (exists (select 1 from public.payment_plans pp where pp.id = payment_plan_responses.plan_id));

-- Sem update e sem delete: a resposta é prova.
create policy payment_plan_responses_insert on public.payment_plan_responses
  for insert to authenticated
  with check (organization_id in (select private.current_user_organizations()));

-- ---------------------------------------------------------------- travas

create function private.payment_plans_so_pelas_funcoes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('dulihub.via_forma', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Mude a forma de pagamento pela tela do negócio.' using errcode = 'P0001';
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

create function private.payment_plans_nao_se_apaga()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A cascata do negócio e da pessoa passa (§3 do desenho de origem).
  if pg_trigger_depth() < 2 then
    raise exception 'A forma de pagamento não se apaga.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create function private.forma_so_pelas_funcoes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1
     or coalesce(current_setting('dulihub.via_forma', true), '') = 'on' then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  raise exception 'Mude a forma de pagamento pela tela do negócio.' using errcode = 'P0001';
end;
$$;

create function private.payment_plan_responses_na_entrada()
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

  -- A resposta do cliente pelo link (sem usuário) é da 4b.
  if v_eu is null then
    raise exception 'A confirmação da forma de pagamento só nasce pela tela do negócio.'
      using errcode = 'P0001';
  end if;

  select pp.status into v_status from public.payment_plans pp where pp.id = new.plan_id;
  if v_status is distinct from 'rascunho' then
    raise exception 'A forma está confirmada. Use Refazer para mudar.' using errcode = 'P0001';
  end if;

  -- Defesa a mais: com usuário logado, é sempre a confirmação da equipe, por
  -- quem está logado, agora.
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

create function private.payment_plan_responses_nao_mudam()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A cascata da pessoa e o `set null` de `answered_by` passam.
  if pg_trigger_depth() > 1 then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  raise exception 'A confirmação da forma de pagamento não muda.' using errcode = 'P0001';
end;
$$;

create function private.receivables_parte_so_pelo_ganho()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1
     or coalesce(current_setting('dulihub.via_forma', true), '') = 'on' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.payment_plan_part_id is not null)
     or (tg_op = 'UPDATE' and new.payment_plan_part_id is distinct from old.payment_plan_part_id) then
    raise exception 'A cobrança da forma de pagamento só nasce no Ganho.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.payment_plans_so_pelas_funcoes() from public, anon, authenticated;
revoke execute on function private.payment_plans_nao_se_apaga() from public, anon, authenticated;
revoke execute on function private.forma_so_pelas_funcoes() from public, anon, authenticated;
revoke execute on function private.payment_plan_responses_na_entrada() from public, anon, authenticated;
revoke execute on function private.payment_plan_responses_nao_mudam() from public, anon, authenticated;
revoke execute on function private.receivables_parte_so_pelo_ganho() from public, anon, authenticated;

create trigger payment_plans_so_pelas_funcoes
  before insert or update on public.payment_plans
  for each row execute function private.payment_plans_so_pelas_funcoes();

create trigger payment_plans_nao_se_apaga
  before delete on public.payment_plans
  for each row execute function private.payment_plans_nao_se_apaga();

create trigger payment_plan_parts_so_pelas_funcoes
  before insert or update or delete on public.payment_plan_parts
  for each row execute function private.forma_so_pelas_funcoes();

create trigger payment_plan_installments_so_pelas_funcoes
  before insert or update or delete on public.payment_plan_installments
  for each row execute function private.forma_so_pelas_funcoes();

create trigger payment_plan_responses_na_entrada
  before insert on public.payment_plan_responses
  for each row execute function private.payment_plan_responses_na_entrada();

create trigger payment_plan_responses_nao_mudam
  before update or delete on public.payment_plan_responses
  for each row execute function private.payment_plan_responses_nao_mudam();

create trigger receivables_parte_so_pelo_ganho
  before insert or update of payment_plan_part_id on public.receivables
  for each row execute function private.receivables_parte_so_pelo_ganho();

-- ------------------------------ os vistos travam com a forma confirmada

create or replace function private.opportunity_items_trava_do_ganho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_negocio   uuid := case tg_op when 'DELETE' then old.opportunity_id else new.opportunity_id end;
  v_status    text;
  v_forma     text;
  v_cobrancas timestamptz;
begin
  -- A cascata (pessoa ou negócio apagados) e o `set null` do tipo de visto.
  if pg_trigger_depth() > 1 then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.opportunity_id is distinct from old.opportunity_id then
    raise exception 'O visto não muda de negócio.' using errcode = 'P0001';
  end if;

  -- `for share`: não corre junto com o Ganho, que trava o negócio `for update`.
  select o.status into v_status
  from public.opportunities o
  where o.id = v_negocio
  for share;

  if v_status = 'won' then
    raise exception 'Negócio ganho: os vistos não mudam. Para desistir de um visto, encerre o processo dele.'
      using errcode = 'P0001';
  end if;

  -- A forma confirmada prende os vistos até virar cobrança (FIC-12). Negócio
  -- antes, forma depois: a mesma ordem das funções da forma.
  select pp.status, pp.charges_created_at into v_forma, v_cobrancas
  from public.payment_plans pp
  where pp.opportunity_id = v_negocio
  for share;

  if v_forma = 'confirmada' and v_cobrancas is null then
    raise exception 'A forma de pagamento está confirmada. Use Refazer para mudar os vistos.'
      using errcode = 'P0001';
  end if;

  -- Negócio reaberto: o item que já virou processo fica. Removê-lo e
  -- acrescentar de novo criaria um segundo processo no próximo Ganho.
  if tg_op = 'DELETE'
     and exists (select 1 from public.projects p where p.opportunity_item_id = old.id) then
    raise exception 'Este visto já tem processo: para desistir, encerre o processo.'
      using errcode = 'P0001';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- ------------------------ negócio com confirmação registrada não se exclui

create or replace function private.opportunities_ganho_nao_se_apaga()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A cascata da pessoa e da organização passa (§3).
  if pg_trigger_depth() < 2 and old.status = 'won' then
    raise exception 'Reabra ou encerre os processos; o negócio ganho fica como registro.'
      using errcode = 'P0001';
  end if;

  -- A cascata do negócio apagaria a prova (§5.5 do desenho da 4a).
  if pg_trigger_depth() < 2 and exists (
    select 1
    from public.payment_plan_responses r
    join public.payment_plans pp on pp.id = r.plan_id
    where pp.opportunity_id = old.id
  ) then
    raise exception 'A forma de pagamento já foi confirmada; o negócio fica como registro.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

-- -------------------------------------------------- conferência da forma

-- A mesma regra da tela (`erroDaParte`, `forma-regras.ts`), na mesma ordem,
-- parando na primeira falha. A frase da soma não leva os valores (P11): só
-- quem chama a API direto a vê, e formatar dinheiro aqui seria uma segunda
-- cópia de `formatarMoeda`.
create function private.erro_da_forma(p_forma jsonb)
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
  v_qtd     numeric;
  v_valor   numeric;
  v_dia     text;
  v_soma    numeric;
begin
  -- Formato: tudo antes de qualquer conta, para nunca cair num erro cru de
  -- conversão (22P02, 22003).
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

      -- A forma antes da conversão: o Postgres aceitaria "today", "infinity"
      -- e "2026-2-3".
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

revoke execute on function private.erro_da_forma(jsonb) from public, anon;
grant execute on function private.erro_da_forma(jsonb) to authenticated;

-- ------------------------------------------------------------- as funções

create function public.salvar_forma_de_pagamento(p_negocio uuid, p_forma jsonb)
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
  -- A RLS de quem chama vale: negócio de outra organização não aparece.
  select o.id, o.organization_id, o.status into v_negocio
  from public.opportunities o
  where o.id = p_negocio
  for share;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'P0001';
  end if;

  perform set_config('dulihub.via_forma', 'on', true);

  -- A forma nasce no primeiro salvar. `on conflict`: dois primeiros salvar ao
  -- mesmo tempo não dão erro cru de duplicata.
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
  if v_forma.status <> 'rascunho' then
    raise exception 'A forma está confirmada. Use Refazer para mudar.' using errcode = 'P0001';
  end if;

  v_erro := private.erro_da_forma(p_forma);
  if v_erro is not null then
    raise exception '%', v_erro using errcode = 'P0001';
  end if;

  -- As partes por posição: a que continua mantém o id (P8).
  delete from public.payment_plan_parts
  where plan_id = v_forma.id
    and position >= jsonb_array_length(p_forma -> 'partes');

  for v_parte, v_posicao in
    select e.valor, e.ordem - 1
    from jsonb_array_elements(p_forma -> 'partes') with ordinality as e(valor, ordem)
    order by e.ordem
  loop
    insert into public.payment_plan_parts
      (organization_id, plan_id, position, label, method, currency, total, installments_count)
    values (
      v_negocio.organization_id, v_forma.id, v_posicao,
      trim(v_parte ->> 'label'), v_parte ->> 'method', v_parte ->> 'currency',
      (v_parte ->> 'total')::numeric, (v_parte ->> 'installments_count')::numeric::integer
    )
    on conflict (plan_id, position) do update
      set label              = excluded.label,
          method             = excluded.method,
          currency           = excluded.currency,
          total              = excluded.total,
          installments_count = excluded.installments_count
    returning id into v_parte_id;

    delete from public.payment_plan_installments where part_id = v_parte_id;

    insert into public.payment_plan_installments (organization_id, part_id, number, amount, due_on)
    select v_negocio.organization_id, v_parte_id,
           (p ->> 'number')::numeric::integer, (p ->> 'amount')::numeric, (p ->> 'due_on')::date
    from jsonb_array_elements(v_parte -> 'parcelas') as p;
  end loop;

  perform set_config('dulihub.via_forma', 'off', true);
  return v_forma.id;
end;
$$;

create function public.confirmar_forma_de_pagamento_pela_equipe(
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

  -- CRM-10: o dono do negócio ou a gestão.
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
  if v_forma.id is not null and v_forma.status <> 'rascunho' then
    raise exception 'A forma está confirmada. Use Refazer para mudar.' using errcode = 'P0001';
  end if;
  if v_forma.id is null
     or not exists (select 1 from public.payment_plan_parts pt where pt.plan_id = v_forma.id)
     or not exists (select 1 from public.opportunity_items i where i.opportunity_id = p_negocio) then
    raise exception 'Acrescente pelo menos um visto e uma parte antes de confirmar.'
      using errcode = 'P0001';
  end if;

  -- A cópia do combinado, montada aqui, depois de travar, e sem a cotação.
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
               'parcelas', coalesce((
                 select jsonb_agg(jsonb_build_object('number', pi.number, 'amount', pi.amount, 'due_on', pi.due_on)
                                  order by pi.number)
                 from public.payment_plan_installments pi
                 where pi.part_id = pt.id
               ), '[]'::jsonb)
             ) order by pt.position)
      from public.payment_plan_parts pt
      where pt.plan_id = v_forma.id
    ), '[]'::jsonb)
  ) into v_copia;

  perform set_config('dulihub.via_forma', 'on', true);

  insert into public.payment_plan_responses (organization_id, plan_id, decision, reason, snapshot)
  values (v_negocio.organization_id, v_forma.id, 'confirmada_pela_equipe', v_obs, v_copia);

  update public.payment_plans set status = 'confirmada' where id = v_forma.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (v_negocio.organization_id, v_negocio.person_id, p_negocio,
          'forma_de_pagamento', 'Forma de pagamento confirmada pela equipe', v_eu);

  perform set_config('dulihub.via_forma', 'off', true);
end;
$$;

create function public.voltar_forma_para_rascunho(p_negocio uuid)
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
  if v_forma.id is null or v_forma.status <> 'confirmada' then
    raise exception 'A forma não está confirmada.' using errcode = 'P0001';
  end if;

  perform set_config('dulihub.via_forma', 'on', true);

  update public.payment_plans set status = 'rascunho' where id = v_forma.id;

  insert into public.activities (organization_id, person_id, opportunity_id, type, description, created_by)
  values (v_negocio.organization_id, v_negocio.person_id, p_negocio,
          'forma_de_pagamento', 'Forma de pagamento refeita', v_eu);

  perform set_config('dulihub.via_forma', 'off', true);
end;
$$;

revoke execute on function public.salvar_forma_de_pagamento(uuid, jsonb) from public, anon;
revoke execute on function public.confirmar_forma_de_pagamento_pela_equipe(uuid, text) from public, anon;
revoke execute on function public.voltar_forma_para_rascunho(uuid) from public, anon;
grant execute on function public.salvar_forma_de_pagamento(uuid, jsonb) to authenticated;
grant execute on function public.confirmar_forma_de_pagamento_pela_equipe(uuid, text) to authenticated;
grant execute on function public.voltar_forma_para_rascunho(uuid) to authenticated;
