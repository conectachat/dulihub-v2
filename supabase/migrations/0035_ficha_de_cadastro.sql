-- 0035 — ficha de cadastro por link
--
-- Quando o lead diz que vai fechar, o Renato mandava um PDF pelo WhatsApp,
-- recebia de volta e redigitava tudo para montar o contrato. Agora ele gera um
-- link, o lead preenche no celular, e a ficha do contato se atualiza sozinha.
--
-- As colunas da ficha já existem em `people` desde a 0001 ("preenchidos no
-- onboarding, usados no contrato") — nenhuma tela as gravava. O que falta é:
-- os dependentes, o link, e **um caminho de escrita para quem não tem login**.
--
-- ## A primeira porta para o anônimo
--
-- Até aqui nada no banco era alcançável sem sessão: toda policy é
-- `to authenticated`, nenhuma função era chamável por `anon`, e o app não usa
-- a `service_role`. Esta migration abre duas funções ao `anon`, e o desenho
-- inteiro existe para que a porta tenha a largura de **uma pessoa por token**:
--
--   abrir_ficha_de_cadastro(token)          devolve estado, nome e contato
--   enviar_ficha_de_cadastro(token, dados)  grava a ficha, uma vez
--
-- As duas são `security definer` **em `public`** — exatamente o que a 0003
-- proibiu. A proibição existe porque função `definer` em `public` é chamável
-- pela API; aqui é isso que se quer. Embrulhá-las em `private` exigiria dar
-- `usage` do schema inteiro ao `anon`, que é abrir mais para parecer mais
-- fechado. O aviso do Supabase ("definer executável por anon") é esperado
-- para estas duas, e só para elas.
--
-- O que mantém a porta estreita:
--
-- 1. O token tem 256 bits e é a única chave. Sem ele, nenhuma linha.
-- 2. Lista fechada de campos. `organization_id`, `lifecycle_stage`, `user_id`
--    e qualquer outra chave do `jsonb` são ignoradas — não há como citá-las.
-- 3. Uso único, com prazo. Enviou, o link morre; a linha é travada
--    (`for update`) para dois envios simultâneos não passarem os dois.
-- 4. A leitura não devolve dado. Só nome, e-mail e telefone — o que o lead já
--    tinha dado — e só enquanto o link está aberto.
-- 5. **Só `anon`.** Quem está logado não entra por esta porta: com sessão, o
--    gatilho que congela CPF e RG na auto-edição do cliente (0013) descartaria
--    o documento em silêncio. O app chama sempre sem sessão; a API recusa alto.
--
-- ## Um caminho de escrita, duas portas
--
-- `salvar_cadastro` é quem grava, e é `security invoker`: chamada pela equipe,
-- a RLS decide; chamada de dentro de `enviar_ficha_de_cadastro`, roda com o
-- dono. As regras da ficha (lista de campos, tetos, CPF, dependentes) moram
-- num lugar só, e as duas portas não têm como divergir.

-- --------------------------------------------------------- registration_forms

create table registration_forms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id       uuid not null,

  -- Em texto, e não o hash: quem lê esta linha já pode editar a pessoa, e é o
  -- que deixa o link reaparecer na ficha em vez de ser mostrado uma vez só.
  token           text not null unique check (length(token) >= 40),

  expires_at      timestamptz not null,
  cancelled_at    timestamptz,
  submitted_at    timestamptz,

  -- O que o lead declarou, como declarou, e o que a ficha tinha antes. A
  -- pessoa pode ser editada depois; isto aqui não muda.
  answers         jsonb,
  previous        jsonb,
  consent_text    text,

  -- "Conferi": tira o aviso da tela Início.
  reviewed_at     timestamptz,
  reviewed_by     uuid references profiles(id) on delete set null,

  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),

  constraint registration_forms_person_same_org
    foreign key (person_id, organization_id)
    references people (id, organization_id) on delete cascade,

  constraint registration_forms_enviada_tem_resposta
    check (submitted_at is null or answers is not null),

  constraint registration_forms_conferida_foi_enviada
    check (reviewed_at is null or submitted_at is not null)
);

-- Um link em aberto por pessoa: gerar outro cancela o anterior. O vencido
-- conta como aberto aqui (índice não enxerga `now()`), e a tela o cancela ao
-- gerar o novo.
create unique index registration_forms_um_em_aberto
  on registration_forms (person_id)
  where submitted_at is null and cancelled_at is null;

create index registration_forms_person_idx on registration_forms (person_id, created_at desc);

-- A consulta da tela Início: ficha recebida que ninguém conferiu.
create index registration_forms_a_conferir_idx
  on registration_forms (organization_id, submitted_at)
  where submitted_at is not null and reviewed_at is null;

create trigger registration_forms_set_updated_at
  before update on registration_forms
  for each row execute function private.set_updated_at();

comment on table registration_forms is
  'Link da ficha de cadastro e a resposta do lead. Uso único, com prazo.';

-- ---------------------------------------------------------- person_dependents

create table person_dependents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id       uuid not null,

  full_name       text not null check (length(trim(full_name)) > 0),
  relationship    text not null check (relationship in ('spouse', 'child', 'other')),
  birth_date      date not null,
  birth_country   text not null check (length(trim(birth_country)) > 0),
  position        integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),

  constraint person_dependents_person_same_org
    foreign key (person_id, organization_id)
    references people (id, organization_id) on delete cascade
);

create index person_dependents_person_idx on person_dependents (person_id, position);

create trigger person_dependents_set_updated_at
  before update on person_dependents
  for each row execute function private.set_updated_at();

comment on table person_dependents is
  'Cônjuge e filhos do contratante — usados nos formulários do governo americano.';

-- ------------------------------------------------------------------------ RLS

alter table registration_forms enable row level security;
alter table person_dependents  enable row level security;

-- O link é da equipe da organização dona da pessoa. Nenhuma policy para
-- `anon`: o anônimo só chega pelas duas funções lá embaixo.
create policy registration_forms_all on registration_forms
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- Dependente segue a 0017: quem alcança a pessoa lê; só a equipe escreve.
create policy person_dependents_select on person_dependents
  for select to authenticated
  using ((select private.can_access_person(person_id)));

create policy person_dependents_write on person_dependents
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- Lápides (0029) desde já: a tabela de lápides só sabe do que foi apagado
-- depois que o gatilho existe. As duas ficam fora do espelho por ora.
create trigger registration_forms_marcar_lapide
  after delete on registration_forms
  for each row execute function private.marcar_lapide();

create trigger person_dependents_marcar_lapide
  after delete on person_dependents
  for each row execute function private.marcar_lapide();

-- ------------------------------------------------------------ campos da ficha

-- A lista fechada, num lugar só. É ela que impede o `jsonb` de alcançar
-- `organization_id`, `lifecycle_stage`, `user_id` ou `notes`.
create function private.campos_da_ficha()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'full_name', 'birth_date', 'gender', 'marital_status', 'birthplace',
    'nationality', 'tax_id', 'national_id', 'national_id_issuer',
    'email', 'phone_country_code', 'phone',
    'address_street', 'address_number', 'address_complement',
    'address_district', 'address_city', 'address_state', 'address_country',
    'address_postal_code'
  ]
$$;

revoke execute on function private.campos_da_ficha() from public, anon;
grant execute on function private.campos_da_ficha() to authenticated;

-- ------------------------------------------------------------ salvar_cadastro

-- Grava a ficha de uma pessoa. Só as chaves presentes em `p_dados` são
-- aplicadas: edição parcial da equipe não apaga o que não foi enviado.
-- `p_completo` exige a ficha inteira — é como a porta do lead chama.
--
-- Devolve o que gravou, já normalizado (CPF só com dígitos, texto aparado).
create function public.salvar_cadastro(
  p_person   uuid,
  p_dados    jsonb,
  p_completo boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org         uuid;
  v             jsonb := '{}'::jsonb;
  v_campo       text;
  v_valor       text;
  v_dependentes jsonb := '[]'::jsonb;
  v_dependente  jsonb;
  v_nome        text;
  v_relacao     text;
  v_nascimento  text;
  v_pais        text;
  v_posicao     integer := 0;
  v_linhas      integer;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Ficha inválida.' using errcode = 'P0001';
  end if;

  if octet_length(p_dados::text) > 20000 then
    raise exception 'Ficha grande demais.' using errcode = 'P0001';
  end if;

  -- Passa pela RLS de quem chama: pessoa de outra organização não aparece.
  select organization_id into v_org
  from public.people
  where id = p_person and deleted_at is null;

  if v_org is null then
    raise exception 'Contato não encontrado.' using errcode = 'P0001';
  end if;

  -- 1. Só os campos da lista, aparados, com teto.
  foreach v_campo in array private.campos_da_ficha() loop
    if p_dados ? v_campo then
      v_valor := nullif(btrim(p_dados->>v_campo), '');
      if length(v_valor) > 200 then
        raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
      end if;
      v := v || jsonb_build_object(v_campo, v_valor);
    elsif p_completo and v_campo not in ('address_complement', 'phone_country_code') then
      raise exception 'Ficha incompleta.' using errcode = 'P0001';
    end if;
  end loop;

  -- 2. O que não pode ficar em branco.
  if v ? 'full_name' and v->>'full_name' is null then
    raise exception 'O nome é obrigatório.' using errcode = 'P0001';
  end if;

  if p_completo then
    foreach v_campo in array private.campos_da_ficha() loop
      if v_campo not in ('address_complement', 'phone_country_code')
         and v->>v_campo is null
      then
        raise exception 'Ficha incompleta.' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  -- 3. Formato do que tem formato.
  if v->>'tax_id' is not null then
    v_valor := regexp_replace(v->>'tax_id', '\D', '', 'g');
    if length(v_valor) <> 11 then
      raise exception 'O CPF precisa ter 11 dígitos.' using errcode = 'P0001';
    end if;
    -- Só os dígitos: a máscara é da tela.
    v := v || jsonb_build_object('tax_id', v_valor);
  end if;

  if v->>'birth_date' is not null then
    if v->>'birth_date' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Data de nascimento inválida.' using errcode = 'P0001';
    end if;
    if (v->>'birth_date')::date > current_date
       or (v->>'birth_date')::date < date '1900-01-01'
    then
      raise exception 'Data de nascimento inválida.' using errcode = 'P0001';
    end if;
  end if;

  -- Em português porque é o que o cadastro antigo já guardava nestas colunas.
  if v->>'gender' is not null and v->>'gender' not in ('masculino', 'feminino') then
    raise exception 'Sexo inválido.' using errcode = 'P0001';
  end if;

  if v->>'marital_status' is not null and v->>'marital_status' not in (
    'solteiro', 'casado', 'uniao_estavel', 'divorciado', 'separado', 'viuvo'
  ) then
    raise exception 'Estado civil inválido.' using errcode = 'P0001';
  end if;

  if v->>'email' is not null and v->>'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = 'P0001';
  end if;

  -- 4. A pessoa. `jsonb_populate_record` troca só as chaves presentes em `v`,
  --    e a lista de colunas do `set` é fixa: nada fora da ficha é alcançável.
  update public.people as p
  set (
    full_name, birth_date, gender, marital_status, birthplace, nationality,
    tax_id, national_id, national_id_issuer, email, phone_country_code, phone,
    address_street, address_number, address_complement, address_district,
    address_city, address_state, address_country, address_postal_code
  ) = (
    select
      r.full_name, r.birth_date, r.gender, r.marital_status, r.birthplace,
      r.nationality, r.tax_id, r.national_id, r.national_id_issuer, r.email,
      r.phone_country_code, r.phone, r.address_street, r.address_number,
      r.address_complement, r.address_district, r.address_city,
      r.address_state, r.address_country, r.address_postal_code
    from jsonb_populate_record(p, v) as r
  )
  where p.id = p_person;

  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    -- Leu mas não pôde gravar: a policy filtrou em vez de recusar.
    raise exception 'Contato não encontrado.' using errcode = 'P0001';
  end if;

  -- 5. Dependentes: a lista enviada substitui a que havia. Sem a chave, não
  --    se mexe neles.
  if p_dados ? 'dependents' then
    if jsonb_typeof(p_dados->'dependents') <> 'array' then
      raise exception 'Lista de dependentes inválida.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_dados->'dependents') > 10 then
      raise exception 'No máximo 10 dependentes.' using errcode = 'P0001';
    end if;

    delete from public.person_dependents where person_id = p_person;

    for v_dependente in select * from jsonb_array_elements(p_dados->'dependents') loop
      v_nome       := nullif(btrim(v_dependente->>'full_name'), '');
      v_relacao    := v_dependente->>'relationship';
      v_nascimento := v_dependente->>'birth_date';
      v_pais       := nullif(btrim(v_dependente->>'birth_country'), '');

      if v_nome is null or v_pais is null
         or length(v_nome) > 200 or length(v_pais) > 100
         or v_relacao is null or v_relacao not in ('spouse', 'child', 'other')
         or v_nascimento is null or v_nascimento !~ '^\d{4}-\d{2}-\d{2}$'
      then
        raise exception 'Dependente com dado faltando ou inválido.' using errcode = 'P0001';
      end if;

      if v_nascimento::date > current_date or v_nascimento::date < date '1900-01-01' then
        raise exception 'Dependente com data de nascimento inválida.' using errcode = 'P0001';
      end if;

      insert into public.person_dependents
        (organization_id, person_id, full_name, relationship, birth_date, birth_country, position)
      values
        (v_org, p_person, v_nome, v_relacao, v_nascimento::date, v_pais, v_posicao);

      v_dependentes := v_dependentes || jsonb_build_array(jsonb_build_object(
        'full_name', v_nome,
        'relationship', v_relacao,
        'birth_date', v_nascimento,
        'birth_country', v_pais
      ));
      v_posicao := v_posicao + 1;
    end loop;

    v := v || jsonb_build_object('dependents', v_dependentes);
  end if;

  return v;
end;
$$;

revoke execute on function public.salvar_cadastro(uuid, jsonb, boolean) from public, anon;
grant execute on function public.salvar_cadastro(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------- abrir_ficha_de_cadastro

-- O que a página pública pode saber. Token desconhecido não devolve linha;
-- link que não está mais aberto devolve só o estado.
create function public.abrir_ficha_de_cadastro(p_token text)
returns table (
  situacao    text,
  nome        text,
  email       text,
  ddi         text,
  telefone    text,
  organizacao text
)
language sql
stable
security definer
set search_path = ''
as $$
  with link as (
    select
      case
        when f.submitted_at is not null then 'enviada'
        when f.cancelled_at is not null or p.deleted_at is not null then 'cancelada'
        when f.expires_at <= now() then 'expirada'
        else 'aberta'
      end as situacao,
      p.full_name, p.email, p.phone_country_code, p.phone,
      o.name as organizacao
    from public.registration_forms f
    join public.people p on p.id = f.person_id
    join public.organizations o on o.id = f.organization_id
    where f.token = p_token
  )
  select
    l.situacao,
    case when l.situacao = 'aberta' then l.full_name end,
    case when l.situacao = 'aberta' then l.email end,
    case when l.situacao = 'aberta' then l.phone_country_code end,
    case when l.situacao = 'aberta' then l.phone end,
    l.organizacao
  from link l
$$;

revoke execute on function public.abrir_ficha_de_cadastro(text) from public, anon, authenticated;
grant execute on function public.abrir_ficha_de_cadastro(text) to anon;

-- --------------------------------------------------- enviar_ficha_de_cadastro

create function public.enviar_ficha_de_cadastro(
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
  -- Travada: dois envios do mesmo link ao mesmo tempo não passam os dois.
  select * into v_link
  from public.registration_forms
  where token = p_token
  for update;

  if not found then
    raise exception 'Link não encontrado.' using errcode = 'P0001';
  end if;

  if v_link.submitted_at is not null
     or v_link.cancelled_at is not null
     or v_link.expires_at <= now()
  then
    raise exception 'Este link não está mais disponível.' using errcode = 'P0001';
  end if;

  if nullif(btrim(p_consentimento), '') is null then
    raise exception 'É preciso aceitar a declaração.' using errcode = 'P0001';
  end if;

  -- O que havia antes, para nada ser sobrescrito sem rastro.
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

  -- Ficha do lead sempre traz a lista de dependentes, mesmo vazia.
  v_gravado := public.salvar_cadastro(
    v_link.person_id,
    p_dados || jsonb_build_object('dependents', coalesce(p_dados->'dependents', '[]'::jsonb)),
    true
  );

  update public.registration_forms
  set submitted_at = now(),
      answers      = v_gravado,
      previous     = v_antes,
      consent_text = left(btrim(p_consentimento), 2000)
  where id = v_link.id;

  insert into public.activities (organization_id, person_id, type, description)
  values (
    v_link.organization_id,
    v_link.person_id,
    'registration_submitted',
    'Ficha de cadastro preenchida pelo cliente'
  );
end;
$$;

revoke execute on function public.enviar_ficha_de_cadastro(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.enviar_ficha_de_cadastro(text, jsonb, text) to anon;
