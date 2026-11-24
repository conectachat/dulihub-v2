-- 0068 — Parceiros (PAR-4, desenho de 24/nov §5.1)
--
-- O parceiro é uma organização `partner` (abordagem A do desenho): a Thais
-- Fabrini, nos EUA, que vende e contrata a Duli para montar o processo. Ela
-- precisa de dados cadastrais completos, porque a invoice para quem é de
-- fora do Brasil sai deles.
--
-- D1 — **A semente das organizações novas estava quebrada.** A 0027 tornou
-- `pipeline_stages.organization_id` obrigatório, e `seed_organization`
-- (0019) continuou gravando as etapas sem ela. Desde então nenhuma
-- organização nova nascia: provado em 24/nov, num bloco desfeito, com
-- `null value in column "organization_id" of relation "pipeline_stages"`.
-- Ninguém viu porque só existiam a Duli e a `parceiro-teste`, mais antigas.
--
-- D2 — `organizations` entra no manifesto. Até aqui ela só dava o `type` do
-- desempate (`organizacao-local.ts`); agora é gravada pela fila e lida pelo
-- Financeiro. Tabela fora do manifesto é puxada e nunca conferida (0033).
-- Organização não se apaga (0036 não tem policy de delete), então não
-- precisa de lápide.
--
-- D3 — O `slug` nasce no banco, do nome. Gerado no aparelho, um choque de
-- `slug` voltaria da fila como um conflito enganoso. A coluna ganha um
-- padrão provisório, que o gatilho troca: assim o tipo gerado deixa de
-- exigir `slug` no `insert`.
--
-- A regra do parceiro roda antes da RLS. A **primeira** conferência do
-- `insert` é quem grava, com o mesmo `42501` da policy (0036): quem não é
-- dono da Duli e manda dado inválido lê a recusa de verdade, e não
-- "Informe o país.". A conferência dos dados vale sempre, com ou sem
-- usuário, porque é integridade; a do dono, só com usuário (migration
-- passa).

-- ------------------------------------------------- D1: a semente consertada

create or replace function private.seed_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline
  from public.pipelines
  where organization_id = p_org and is_default
  limit 1;

  -- O funil só nasce se não houver nenhum padrão. Recriar aqui duplicaria a
  -- estrutura de quem já organizou o próprio funil.
  if v_pipeline is null then
    insert into public.pipelines (organization_id, name, is_default, position)
    values (p_org, 'Funil de vendas', true, 0)
    returning id into v_pipeline;

    -- Só as três de fábrica. Com a organização na linha desde a 0027.
    insert into public.pipeline_stages
      (organization_id, pipeline_id, name, position, probability, is_won, is_lost)
    values
      (p_org, v_pipeline, 'Novo Lead',  0, 10,  false, false),
      (p_org, v_pipeline, 'Ganho',     98, 100, true,  false),
      (p_org, v_pipeline, 'Perdido',   99, 0,   false, true);
  end if;

  insert into public.stage_statuses
    (organization_id, code, label, color, position, is_default, is_done, is_system)
  select p_org, v.code, v.label, v.color, v.position, v.is_default, v.is_done, true
  from (values
    ('pending',     'Pendente',     '#8a97aa', 0, true,  false),
    ('in_progress', 'Em andamento', '#1f5aa8', 1, false, false),
    ('done',        'Concluído',    '#0e7c6b', 2, false, true )
  ) as v(code, label, color, position, is_default, is_done)
  on conflict (organization_id, code) do nothing;
end;
$$;

-- ------------------------------------------------- colunas do parceiro

alter table public.organizations
  add column address_country text,
  add column address_street text,
  add column address_number text,
  add column address_complement text,
  add column address_district text,
  add column address_city text,
  add column address_state text,
  add column address_postal_code text,
  add column phone_country_code text;

-- D3: provisório. `organizations_slug_pelo_nome` troca pelo do nome.
alter table public.organizations
  alter column slug set default ('provisorio-' || gen_random_uuid()::text);

-- ------------------------------------------------- o slug pelo nome

-- "Thaís Fabrini" → "thais-fabrini"; "!!!" → "parceiro". Sem extensão nova.
create function private.slug_do_nome(p_nome text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          translate(
            lower(coalesce(p_nome, '')),
            'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
            'aaaaaaeeeeiiiiooooouuuucnyy'
          ),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-'
      ),
      ''
    ),
    'parceiro'
  )
$$;

revoke execute on function private.slug_do_nome(text) from public, anon;

create function private.organizations_slug_pelo_nome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  v_n int := 1;
begin
  if new.slug is not null and new.slug not like 'provisorio-%' then
    return new;
  end if;

  v_base := private.slug_do_nome(new.name);
  v_slug := v_base;
  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

revoke execute on function private.organizations_slug_pelo_nome() from public, anon, authenticated;

-- Depois de `organizations_regra_do_parceiro` pela ordem alfabética: o nome
-- já chega aparado.
create trigger organizations_slug_pelo_nome
  before insert on public.organizations
  for each row execute function private.organizations_slug_pelo_nome();

-- ------------------------------------------------- a regra do parceiro

create function private.organizations_regra_do_parceiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erro text;
begin
  if new.type <> 'partner' then
    return new;
  end if;

  -- Primeiro quem grava: este gatilho roda antes da RLS.
  if tg_op = 'INSERT'
     and (select auth.uid()) is not null
     and not private.current_user_is_root_owner() then
    raise exception 'Só o dono da Duli cadastra parceiro.' using errcode = '42501';
  end if;

  new.name                := private.aparar(new.name);
  new.legal_name          := private.aparar(new.legal_name);
  new.tax_id              := private.aparar(new.tax_id);
  new.address_country     := private.aparar(new.address_country);
  new.address_street      := private.aparar(new.address_street);
  new.address_number      := private.aparar(new.address_number);
  new.address_complement  := private.aparar(new.address_complement);
  new.address_district    := private.aparar(new.address_district);
  new.address_city        := private.aparar(new.address_city);
  new.address_state       := private.aparar(new.address_state);
  new.address_postal_code := private.aparar(new.address_postal_code);
  new.email               := private.aparar(new.email);
  new.phone_country_code  := private.normalizar_ddi(new.phone_country_code);
  new.phone               := private.aparar(new.phone);

  if new.name is null then
    raise exception 'Informe o nome do parceiro.' using errcode = 'P0001';
  end if;

  if length(new.name) > 200
     or length(new.legal_name) > 200
     or length(new.tax_id) > 50
     or greatest(
          length(new.address_country), length(new.address_street),
          length(new.address_number), length(new.address_complement),
          length(new.address_district), length(new.address_city),
          length(new.address_state), length(new.address_postal_code)
        ) > 200 then
    raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
  end if;

  if new.address_country is null then
    raise exception 'Informe o país.' using errcode = 'P0001';
  end if;

  v_erro := private.contato_valido(new.email, new.phone_country_code, new.phone);
  if v_erro is not null then
    raise exception using errcode = 'P0001', message = v_erro;
  end if;

  -- A frase; o índice abaixo segura a corrida.
  if exists (
    select 1 from public.organizations o
    where o.type = 'partner'
      and lower(o.name) = lower(new.name)
      and o.id <> new.id
  ) then
    raise exception 'Já existe um parceiro com esse nome.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.organizations_regra_do_parceiro() from public, anon, authenticated;

create trigger organizations_regra_do_parceiro
  before insert or update on public.organizations
  for each row execute function private.organizations_regra_do_parceiro();

create unique index organizations_nome_do_parceiro
  on public.organizations (lower(name))
  where type = 'partner';

-- A parceira de teste ganha país e contato válidos: a regra vale para ela
-- também, e qualquer edição dela passaria a ser recusada.
update public.organizations
set address_country    = 'Brasil',
    email              = 'parceiro-teste@duliconsulting.com',
    phone_country_code = '+55',
    phone              = '11999990000'
where slug = 'parceiro-teste';

-- ------------------------------------------------- D2: o manifesto

-- A lista mora dentro da função, que monta o SQL na hora (0054).
create or replace function public.sync_manifesto()
returns table (tabela text, linhas bigint, maximo_updated_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  t text;
begin
  foreach t in array array[
    'activities', 'document_files', 'document_types', 'files', 'installments',
    'notes', 'opportunities', 'organizations', 'organization_members',
    'people', 'person_tags', 'pipeline_stages', 'pipelines',
    'project_documents', 'project_pages', 'project_stages', 'projects',
    'receivables', 'stage_statuses', 'tags', 'visa_stages',
    'visa_type_documents', 'visa_types'
  ]
  loop
    return query execute format(
      'select %L::text, count(*)::bigint, max(updated_at) from public.%I', t, t);
  end loop;

  return query
    select 'deleted_rows'::text, count(*)::bigint, min(deleted_at)
    from public.deleted_rows;
end;
$$;
