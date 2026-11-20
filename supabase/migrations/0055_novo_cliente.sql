-- 0055 — Novo cliente (CLI-15) e o dono no "Marcar como cliente" (CLI-12)
--
-- O cliente antigo, que nunca passou pelo funil, entra pela tela Clientes:
-- a gestão escolhe um contato da organização atual ou cria o contato ali
-- mesmo, numa gravação só (spec §7.16, critério do CLI-15; plano de 20/nov).
--
-- Decisões (plano `2026-11-20-novo-cliente-e-data-do-ganho.md`):
-- - D1: `criar_cliente` recebe a organização atual da tela. O contato novo não
--   tem registro-pai — é o que `createPerson` já faz —, e a função confere a
--   gestão dela antes de tudo. O contato existente tem de ser dessa organização.
-- - D2: quem torna cliente é `marcar_como_cliente`, chamada por dentro: os dois
--   caminhos à mão gravam igual — estágio, "cliente desde", histórico, a marca
--   `via_ganho` e, agora, o dono.
-- - D3: o contato novo nasce `contact` e vira cliente na mesma transação. Inserir
--   já como `client` não preencheria "cliente desde" nem o histórico (0045).
-- - D4: o teste de busca de `buscar_clientes` (0050) vira
--   `private.casa_com_a_busca`, usada por ela e pela busca do Novo cliente. É a
--   segunda cópia de uma regra de telefone que já teve dois defeitos.
--
-- Decisão do Renato (20/nov): quem marca ou cria fica como dono, se a pessoa
-- não tiver. Dono que já existe não muda. Quem é da gestão é membro, então a
-- chave composta de `people.owner_id` (0044) aceita.

-- ------------------------------------------------- busca, numa função só

create function private.casa_com_a_busca(
  p_busca    text,
  p_nome     text,
  p_email    text,
  p_ddi      text,
  p_telefone text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  with termo as (
    select
      t.texto,
      replace(replace(replace(t.texto, '\', '\\'), '%', '\%'), '_', '\_') as escapado,
      case
        when t.texto ~ '[[:alpha:]@]' then ''
        else regexp_replace(t.texto, '[^0-9]', '', 'g')
      end as digitos
    from (select coalesce(private.aparar(p_busca), '') as texto) as t
  )
  select coalesce(
    termo.texto = ''
    or p_nome ilike '%' || termo.escapado || '%' escape '\'
    or p_email ilike '%' || termo.escapado || '%' escape '\'
    or (
      termo.digitos <> ''
      -- Sem número, nada a comparar: o DDI sozinho ("55") casaria com
      -- qualquer busca por "55" (0050).
      and private.telefone_nacional(p_ddi, p_telefone) is not null
      and (
        coalesce(
          nullif(regexp_replace(coalesce(p_ddi, ''), '[^0-9]', '', 'g'), ''),
          '55'
        ) || private.telefone_nacional(p_ddi, p_telefone)
      ) like '%' || termo.digitos || '%'
    ),
    false
  )
  from termo
$$;

revoke execute on function private.casa_com_a_busca(text, text, text, text, text) from public, anon;
grant execute on function private.casa_com_a_busca(text, text, text, text, text) to authenticated;

create or replace function public.buscar_clientes(
  p_busca        text default '',
  p_limite       int  default 50,
  p_deslocamento int  default 0
)
returns table (
  id                 uuid,
  full_name          text,
  email              text,
  phone_country_code text,
  phone              text,
  owner_id           uuid,
  client_since       date,
  total              bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.phone_country_code,
    p.phone,
    p.owner_id,
    p.client_since,
    count(*) over () as total
  from public.people as p
  where p.lifecycle_stage = 'client'
    and p.deleted_at is null
    and private.casa_com_a_busca(p_busca, p.full_name, p.email, p.phone_country_code, p.phone)
  order by p.full_name, p.id
  limit greatest(coalesce(p_limite, 50), 0)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

-- --------------------------------------- quem pode virar cliente à mão

create function public.buscar_contatos_para_cliente(
  p_organizacao uuid,
  p_busca       text default '',
  p_limite      int  default 20
)
returns table (
  id                 uuid,
  full_name          text,
  email              text,
  phone_country_code text,
  phone              text,
  total              bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.phone_country_code,
    p.phone,
    count(*) over () as total
  from public.people as p
  where p.organization_id = p_organizacao
    and p.lifecycle_stage <> 'client'
    and p.deleted_at is null
    -- Quem está no funil é ganho pelo Ganho (CLI-15).
    and not exists (
      select 1 from public.opportunities as o
      where o.person_id = p.id and o.status = 'open'
    )
    and private.casa_com_a_busca(p_busca, p.full_name, p.email, p.phone_country_code, p.phone)
  order by p.full_name, p.id
  limit greatest(coalesce(p_limite, 20), 0)
$$;

revoke execute on function public.buscar_contatos_para_cliente(uuid, text, int) from public, anon;
grant execute on function public.buscar_contatos_para_cliente(uuid, text, int) to authenticated;

comment on function public.buscar_contatos_para_cliente(uuid, text, int) is
  'Novo cliente (CLI-15): quem da organização ainda pode virar cliente à mão — não é cliente, fora da lixeira, sem negócio aberto. Com o total do filtro.';

-- ------------------------------------- o dono no "Marcar como cliente"

create or replace function public.marcar_como_cliente(p_pessoa uuid, p_desde date default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_org     uuid;
  v_estagio public.person_lifecycle_stage;
  v_lixeira timestamptz;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- Passa pela RLS de quem chama: pessoa de outra organização não aparece.
  select organization_id, lifecycle_stage, deleted_at
    into v_org, v_estagio, v_lixeira
  from public.people
  where id = p_pessoa
  for update;

  if not found then
    raise exception 'Contato não encontrado.' using errcode = 'P0001';
  end if;

  if not private.current_user_manages(v_org) then
    raise exception 'Só a gestão marca alguém como cliente.' using errcode = 'P0001';
  end if;

  if v_lixeira is not null then
    raise exception 'Este contato está na lixeira. Restaure antes.' using errcode = 'P0001';
  end if;

  if v_estagio = 'client' then
    raise exception 'Já é cliente.' using errcode = 'P0001';
  end if;

  if p_desde > v_hoje then
    raise exception 'A data de cliente não pode ser no futuro.' using errcode = 'P0001';
  end if;

  perform set_config('dulihub.via_ganho', 'on', true);

  -- Quem marca fica como dono, se não houver (CLI-15, 20/nov).
  update public.people
  set lifecycle_stage = 'client',
      client_since    = coalesce(p_desde, v_hoje),
      owner_id        = coalesce(owner_id, (select auth.uid()))
  where id = p_pessoa;

  perform set_config('dulihub.via_ganho', 'off', true);

  insert into public.activities (organization_id, person_id, type, description, created_by)
  values (v_org, p_pessoa, 'virou_cliente', 'Marcado como cliente', (select auth.uid()));
end;
$$;

-- --------------------------------------------------------- criar_cliente

create function public.criar_cliente(
  p_organizacao                uuid,
  p_contato                    uuid    default null,
  p_novo_contato               jsonb   default null,
  p_confirmar_contato_parecido boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_novo      jsonb := nullif(p_novo_contato, 'null'::jsonb);
  v_pessoa    uuid;
  v_org       uuid;
  v_estagio   public.person_lifecycle_stage;
  v_lixeira   timestamptz;
  v_nome      text;
  v_email     text;
  v_ddi       text;
  v_telefone  text;
  v_erro      text;
  v_parecidos jsonb;
begin
  -- 1. Exatamente um contato.
  if (p_contato is null) = (v_novo is null) then
    raise exception 'Escolha um contato ou preencha um novo' using errcode = 'P0001';
  end if;

  if p_contato is not null then
    -- 2. Contato existente: achado sob a RLS e travado (dois cliques: o
    --    segundo espera e encontra cliente).
    select organization_id, lifecycle_stage, deleted_at
      into v_org, v_estagio, v_lixeira
    from public.people
    where id = p_contato
    for update;

    if not found then
      raise exception 'Contato não encontrado.' using errcode = 'P0001';
    end if;
    if not private.current_user_manages(v_org) then
      raise exception 'Só a gestão marca alguém como cliente.' using errcode = 'P0001';
    end if;
    if v_org is distinct from p_organizacao then
      raise exception 'Este contato é de outra organização; quem o torna cliente é a gestão de lá.'
        using errcode = 'P0001';
    end if;
    if v_lixeira is not null then
      raise exception 'Este contato está na lixeira. Restaure antes.' using errcode = 'P0001';
    end if;
    if v_estagio = 'client' then
      raise exception 'Já é cliente.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.opportunities as o
      where o.person_id = p_contato and o.status = 'open'
    ) then
      raise exception 'Este contato está no funil: use o Ganho.' using errcode = 'P0001';
    end if;

    v_pessoa := p_contato;
  else
    -- 3. Contato novo: a gestão da organização atual antes de tudo.
    if not private.current_user_manages(p_organizacao) then
      raise exception 'Só a gestão marca alguém como cliente.' using errcode = 'P0001';
    end if;

    if jsonb_typeof(v_novo) <> 'object' then
      raise exception 'Contato novo inválido.' using errcode = 'P0001';
    end if;

    -- As mesmas regras e frases do contato novo da `criar_oportunidade` (0041).
    v_nome     := private.aparar(v_novo->>'full_name');
    v_email    := private.aparar(v_novo->>'email');
    v_ddi      := private.aparar(v_novo->>'phone_country_code');
    v_telefone := private.aparar(v_novo->>'phone');

    if v_nome is null then
      raise exception 'Informe o nome' using errcode = 'P0001';
    end if;
    if length(v_nome) > 200 or length(v_email) > 200 or length(v_ddi) > 200
       or length(v_telefone) > 200
    then
      raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
    end if;

    v_erro := private.contato_valido(v_email, v_ddi, v_telefone);
    if v_erro is not null then
      raise exception using errcode = 'P0001', message = v_erro;
    end if;

    v_ddi := private.normalizar_ddi(v_ddi);

    -- Parecidos perguntam antes de gravar. O de outra organização vem marcado:
    -- a tela não o deixa usar (só abrir o perfil).
    if not coalesce(p_confirmar_contato_parecido, false) then
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'nome', c.full_name,
               'estagio', c.lifecycle_stage,
               'na_lixeira', c.na_lixeira,
               'bate_email', c.bate_email,
               'bate_telefone', c.bate_telefone,
               'outra_organizacao',
                 (select pp.organization_id from public.people as pp where pp.id = c.id)
                   is distinct from p_organizacao
             ) order by c.full_name, c.id)
      into v_parecidos
      from public.contatos_parecidos(v_email, v_ddi, v_telefone) as c;

      if v_parecidos is not null then
        return jsonb_build_object('situacao', 'precisa_confirmar', 'parecidos', v_parecidos);
      end if;
    end if;

    insert into public.people
      (organization_id, full_name, email, phone_country_code, phone, lifecycle_stage, created_by)
    values
      (p_organizacao, v_nome, v_email, v_ddi, v_telefone, 'contact', v_uid)
    returning id into v_pessoa;
  end if;

  -- 4. Torna cliente pelo mesmo caminho do botão (D2).
  perform public.marcar_como_cliente(v_pessoa);

  return jsonb_build_object('situacao', 'criado', 'pessoa', v_pessoa);
end;
$$;

revoke execute on function public.criar_cliente(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.criar_cliente(uuid, uuid, jsonb, boolean) to authenticated;

comment on function public.criar_cliente(uuid, uuid, jsonb, boolean) is
  'Novo cliente (CLI-15): contato existente da organização (fora do funil) ou novo, numa gravação só, só pela gestão. Devolve {situacao: criado, pessoa} ou {situacao: precisa_confirmar, parecidos}.';
