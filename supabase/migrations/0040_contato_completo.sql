-- 0040 — contato completo: e-mail, DDI e telefone, e a busca de parecidos
--
-- Todo contato tem nome, e-mail, DDI e telefone (CON-8), e quem cria ou edita
-- é avisado quando o e-mail ou o telefone já existem (CON-4). Spec
-- docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md,
-- §6.1.
--
-- Decisões:
--
-- - **Obrigatório na tela e na função, não `not null` na coluna.** Hoje 4
--   contatos não têm e-mail e 4 não têm telefone; eles só cobram os campos
--   quando alguém os edita, e continuam podendo ir para a lixeira. Quem grava
--   pela ficha é `salvar_cadastro`, e é nela que a regra mora.
-- - **A regra é a mesma do TypeScript** (`src/lib/contato.ts`), com as
--   mesmas mensagens, e `src/lib/contato.casos.ts` prova as duas. Por isso
--   espaço e dígito são conjuntos explícitos (`private.espaco()`, `[0-9]`):
--   `\s` e `\d` mudam com o locale do Postgres e não batem com os do JS.
-- - **O telefone se compara pelo número nacional**: os dígitos, tirando o
--   DDI da frente quando ele foi digitado junto e o número tem mais de 11
--   dígitos. Assim "+55 5531…" acha o contato antigo "31…" gravado sem DDI.
--   Isso avisa em mais casos, nunca em menos.
-- - **Correção de dado:** em 17/nov, 76 dos 80 contatos tinham o DDI gravado
--   sem o "+" ("55", "1"), vindos da importação. É inequívoco: "55" vira
--   "+55". O `update` vale para todas as organizações, inclusive a de teste,
--   e carimba o `updated_at` das linhas corrigidas — os aparelhos as baixam
--   de novo, numa página.
-- - **Busca de parecidos** é `security invoker`: a RLS decide quem aparece,
--   e contato de outra organização nunca entra no aviso. A lixeira entra,
--   marcada, para a tela oferecer restaurar em vez de duplicar.

-- ------------------------------------------------------------ correção de dado

update public.people
set phone_country_code = '+' || btrim(phone_country_code)
where btrim(phone_country_code) ~ '^[0-9]{1,4}$';

-- ------------------------------------------------------------ auxiliares
--
-- As cinco são avaliadas com o papel de quem grava: pelo índice de `people`
-- (todo `insert` e `update`) e pelas funções `security invoker`. Por isso
-- `grant execute … to authenticated`. Revogar de `authenticated` derruba
-- todo `insert` em `people`.

-- ESPACO: espaço, tab, \n, \r, \f, \v, NBSP e BOM — o mesmo conjunto de
-- `src/lib/contato.ts`. Nenhum deles é especial dentro de `[...]`.
create function private.espaco()
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select chr(32) || chr(9) || chr(10) || chr(13) || chr(12) || chr(11)
      || chr(160) || chr(65279)
$$;

-- Tira ESPACO do começo e do fim; vazio vira nulo.
create function private.aparar(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      t,
      '^[' || private.espaco() || ']+|[' || private.espaco() || ']+$',
      '',
      'g'
    ),
    ''
  )
$$;

-- "55" e "+55" → "+55"; vazio → nulo; fora do formato, aparado como veio
-- (quem recusa é `contato_valido`).
create function private.normalizar_ddi(ddi text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when a.v is null then null
    when a.v ~ '^\+?[0-9]{1,4}$' then '+' || regexp_replace(a.v, '[^0-9]', '', 'g')
    else a.v
  end
  from (select private.aparar(ddi) as v) as a
$$;

-- O número nacional: os dígitos do telefone, sem o DDI da frente quando ele
-- foi digitado junto (número com mais de 11 dígitos que começa pelo DDI).
-- Sem dígito, nulo — e nulo nunca bate com nada.
create function private.telefone_nacional(ddi text, numero text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when n.digitos = '' then null
    when length(n.digitos) > 11
         and n.ddi <> ''
         and left(n.digitos, length(n.ddi)) = n.ddi
      then substr(n.digitos, length(n.ddi) + 1)
    else n.digitos
  end
  from (
    select
      regexp_replace(coalesce(numero, ''), '[^0-9]', '', 'g') as digitos,
      regexp_replace(coalesce(ddi, ''), '[^0-9]', '', 'g') as ddi
  ) as n
$$;

-- A primeira regra que falha, na ordem e-mail → DDI → telefone, com a
-- mensagem exata da tela; nulo quando está tudo certo. Apara por dentro.
create function private.contato_valido(email text, ddi text, telefone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when c.email is null then 'Informe o e-mail'
    when c.email !~ ('^[^@' || c.e || ']+@[^@' || c.e || ']+\.[^@' || c.e || ']+$')
      then 'E-mail inválido'
    when c.ddi is null then 'Informe o DDI'
    when c.ddi !~ '^\+?[0-9]{1,4}$' then 'DDI inválido (ex.: +55)'
    when c.telefone is null then 'Informe o telefone'
    when length(regexp_replace(c.telefone, '[^0-9]', '', 'g')) not between 8 and 15
      then 'O telefone precisa ter de 8 a 15 dígitos'
    else null
  end
  from (
    select
      private.espaco() as e,
      private.aparar(email) as email,
      private.aparar(ddi) as ddi,
      private.aparar(telefone) as telefone
  ) as c
$$;

revoke execute on function private.espaco() from public, anon;
revoke execute on function private.aparar(text) from public, anon;
revoke execute on function private.normalizar_ddi(text) from public, anon;
revoke execute on function private.telefone_nacional(text, text) from public, anon;
revoke execute on function private.contato_valido(text, text, text) from public, anon;
grant execute on function private.espaco() to authenticated;
grant execute on function private.aparar(text) to authenticated;
grant execute on function private.normalizar_ddi(text) to authenticated;
grant execute on function private.telefone_nacional(text, text) to authenticated;
grant execute on function private.contato_valido(text, text, text) to authenticated;

-- ------------------------------------------------------------ índices
--
-- Mudar `aparar`, `espaco` ou `telefone_nacional` exige `reindex` destes dois:
-- o índice guarda o resultado antigo e a busca deixaria de achar.

create index people_email_normalizado
  on public.people (organization_id, lower(private.aparar(email)));

create index people_telefone_nacional
  on public.people (organization_id, private.telefone_nacional(phone_country_code, phone));

-- ------------------------------------------------------------ contatos_parecidos

-- Quem tem o mesmo e-mail ou o mesmo telefone. Entrada vazia nunca bate.
-- A lixeira entra, marcada; `p_ignorar` fica de fora (é o próprio contato,
-- na edição). No máximo 10, em ordem de nome.
create function public.contatos_parecidos(
  p_email    text,
  p_ddi      text,
  p_telefone text,
  p_ignorar  uuid default null
)
returns table (
  id              uuid,
  full_name       text,
  lifecycle_stage public.person_lifecycle_stage,
  na_lixeira      boolean,
  bate_email      boolean,
  bate_telefone   boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.lifecycle_stage,
    p.deleted_at is not null,
    coalesce(lower(private.aparar(p.email)) = e.email, false),
    coalesce(private.telefone_nacional(p.phone_country_code, p.phone) = e.telefone, false)
  from public.people as p
  cross join (
    select
      lower(private.aparar(p_email)) as email,
      private.telefone_nacional(p_ddi, p_telefone) as telefone
  ) as e
  where (p_ignorar is null or p.id <> p_ignorar)
    and (
      lower(private.aparar(p.email)) = e.email
      or private.telefone_nacional(p.phone_country_code, p.phone) = e.telefone
    )
  order by p.full_name, p.id
  limit 10
$$;

revoke execute on function public.contatos_parecidos(text, text, text, uuid) from public, anon;
grant execute on function public.contatos_parecidos(text, text, text, uuid) to authenticated;

-- ------------------------------------------------------------ salvar_cadastro
--
-- O mesmo da 0035 (e `\d`/`\D` viram `[0-9]`/`[^0-9]`, pelo motivo do topo),
-- com três mudanças:
--
-- 1. o aparo de cada campo é `private.aparar`, não `btrim`: o valor gravado
--    é o mesmo valor validado (um tab no começo do e-mail não fica gravado);
-- 2. o DDI grava normalizado ("55" → "+55");
-- 3. quando a ficha traz e-mail, DDI ou telefone — ou é a ficha completa —,
--    o contato final (o enviado, senão o da linha) passa por
--    `private.contato_valido`. A equipe não apaga o e-mail pela ficha, e a
--    ficha completa exige DDI. Substitui a conferência de e-mail da 0035.
--
-- O DDI continua fora de "Ficha incompleta": quem cobra é `contato_valido`,
-- com a mensagem certa.

create or replace function public.salvar_cadastro(
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
  v_email       text;
  v_ddi         text;
  v_telefone    text;
  v_erro        text;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Ficha inválida.' using errcode = 'P0001';
  end if;

  if octet_length(p_dados::text) > 20000 then
    raise exception 'Ficha grande demais.' using errcode = 'P0001';
  end if;

  -- Passa pela RLS de quem chama: pessoa de outra organização não aparece.
  select organization_id, email, phone_country_code, phone
  into v_org, v_email, v_ddi, v_telefone
  from public.people
  where id = p_person and deleted_at is null;

  if v_org is null then
    raise exception 'Contato não encontrado.' using errcode = 'P0001';
  end if;

  -- 1. Só os campos da lista, aparados, com teto.
  foreach v_campo in array private.campos_da_ficha() loop
    if p_dados ? v_campo then
      v_valor := private.aparar(p_dados->>v_campo);
      if length(v_valor) > 200 then
        raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
      end if;
      v := v || jsonb_build_object(v_campo, v_valor);
    elsif p_completo and v_campo not in ('address_complement', 'phone_country_code') then
      raise exception 'Ficha incompleta.' using errcode = 'P0001';
    end if;
  end loop;

  if v ? 'phone_country_code' then
    v := v || jsonb_build_object(
      'phone_country_code', private.normalizar_ddi(v->>'phone_country_code')
    );
  end if;

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
  if p_completo or v ?| array['email', 'phone_country_code', 'phone'] then
    v_erro := private.contato_valido(
      case when v ? 'email' then v->>'email' else v_email end,
      case when v ? 'phone_country_code' then v->>'phone_country_code' else v_ddi end,
      case when v ? 'phone' then v->>'phone' else v_telefone end
    );
    if v_erro is not null then
      raise exception using errcode = 'P0001', message = v_erro;
    end if;
  end if;

  if v->>'tax_id' is not null then
    v_valor := regexp_replace(v->>'tax_id', '[^0-9]', '', 'g');
    if length(v_valor) <> 11 then
      raise exception 'O CPF precisa ter 11 dígitos.' using errcode = 'P0001';
    end if;
    -- Só os dígitos: a máscara é da tela.
    v := v || jsonb_build_object('tax_id', v_valor);
  end if;

  if v->>'birth_date' is not null then
    if v->>'birth_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
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
         or v_nascimento is null or v_nascimento !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
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
