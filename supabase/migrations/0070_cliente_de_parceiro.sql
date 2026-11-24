-- 0070 — O cliente de parceiro (PAR-5, PAR-6, PAR-9, PAR-10; desenho de
-- 24/nov, §5.2 e §5.3)
--
-- O cliente que a Thais vende e a Duli executa é da Duli, com um vínculo
-- para o parceiro: `people.partner_organization_id`. O Renato só fala com a
-- Thais, então o cliente não tem contato próprio — a tela mostra o do
-- parceiro, lido na hora (`contatoExibido`), nunca copiado.
--
-- **Exceção registrada (AGENTS.md):** é a primeira chave estrangeira que
-- aponta para outra organização de propósito. A regra "referência cruzada é
-- barrada pelo banco" aqui é cumprida por guardas, no lugar da chave
-- composta:
-- - o vínculo só nasce no `insert`, só pelo `criar_cliente`, com a marca
--   `dulihub.via_parceiro` (D5); depois não muda nem se apaga;
-- - o alvo é uma organização `partner`, diferente da do cliente, com a mesma
--   marca de teste (teste aponta só para teste); e o cliente é da raiz ou de
--   uma organização de teste. Qualquer alvo inválido dá a mesma frase, para
--   não contar o tipo de uma organização pelo id;
-- - **o vínculo não dá acesso nenhum**: nenhuma policy o lê (PAR-10). O que o
--   parceiro enxerga se decide no portal (Fase 7, Q16).
--
-- D4 — `criar_cliente` ganha `p_parceiro` (5º parâmetro, com padrão: o código
-- no ar continua chamando igual). No ramo do parceiro, `p_novo_contato` traz
-- só `full_name`; o resto é ignorado. "Criar mesmo assim" reaproveita
-- `p_confirmar_contato_parecido` — a tela já confirma por ele.
--
-- `buscar_clientes` passa a trazer o parceiro (nome e contato) e a achar pelo
-- nome dele. Só ganha colunas: a tela no ar ignora as novas.

-- ------------------------------------------------- o vínculo

alter table public.people
  add column partner_organization_id uuid
    constraint people_parceiro_fk references public.organizations (id);

create index people_parceiro_idx
  on public.people (partner_organization_id)
  where partner_organization_id is not null;

-- Lê as duas organizações sem RLS: quem chama nem sempre enxerga o alvo, e a
-- resposta é só sim ou não.
create function private.alvo_do_parceiro_valido(p_org_da_pessoa uuid, p_parceiro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations as alvo
    join public.organizations as dona on dona.id = p_org_da_pessoa
    where alvo.id = p_parceiro
      and alvo.type = 'partner'
      and alvo.id <> dona.id
      and alvo.is_test = dona.is_test
      and (dona.type = 'root' or dona.is_test)
  )
$$;

revoke execute on function private.alvo_do_parceiro_valido(uuid, uuid) from public, anon, authenticated;

create function private.people_vinculo_do_parceiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.partner_organization_id is null then
      return new;
    end if;

    if (select auth.uid()) is not null
       and coalesce(current_setting('dulihub.via_parceiro', true), '') <> 'on' then
      raise exception 'O parceiro do cliente só se define no Novo cliente.' using errcode = 'P0001';
    end if;

    -- Integridade: vale também sem usuário (migration).
    if not private.alvo_do_parceiro_valido(new.organization_id, new.partner_organization_id) then
      raise exception 'Parceiro não encontrado.' using errcode = 'P0001';
    end if;

    return new;
  end if;

  if new.partner_organization_id is distinct from old.partner_organization_id then
    if (select auth.uid()) is not null then
      raise exception 'O parceiro do cliente só se define no Novo cliente.' using errcode = 'P0001';
    end if;

    if new.partner_organization_id is not null
       and not private.alvo_do_parceiro_valido(new.organization_id, new.partner_organization_id) then
      raise exception 'Parceiro não encontrado.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.people_vinculo_do_parceiro() from public, anon, authenticated;

-- Depois de `people_guard_self_update` pela ordem alfabética: o cliente do
-- portal que tenta mexer no vínculo tem o valor devolvido antes de chegar
-- aqui.
create trigger people_vinculo_do_parceiro
  before insert or update on public.people
  for each row execute function private.people_vinculo_do_parceiro();

-- O cliente do portal (Fase 6) também não muda o vínculo: o corpo da 0045,
-- com a coluna nova na lista do que volta ao antigo.
create or replace function private.people_guard_self_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and new.user_id = (select auth.uid())
     and not (
       old.organization_id in (select private.current_user_organizations())
       or old.assigned_organization_id in (select private.current_user_organizations())
     )
  then
    new.organization_id          := old.organization_id;
    new.assigned_organization_id := old.assigned_organization_id;
    new.lifecycle_stage          := old.lifecycle_stage;
    new.user_id                  := old.user_id;
    new.tax_id                   := old.tax_id;
    new.national_id              := old.national_id;
    new.national_id_issuer       := old.national_id_issuer;
    new.created_by               := old.created_by;
    new.deleted_at               := old.deleted_at;
    new.owner_id                 := old.owner_id;
    new.client_since             := old.client_since;
    new.partner_organization_id  := old.partner_organization_id;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------- o histórico com o parceiro

-- O corpo da 0055, com o parceiro no histórico. Sem cláusula de segurança,
-- como estava (invoker).
create or replace function public.marcar_como_cliente(p_pessoa uuid, p_desde date default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_org      uuid;
  v_estagio  public.person_lifecycle_stage;
  v_lixeira  timestamptz;
  v_parceiro text;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
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

  -- O cliente de parceiro diz de quem veio (desenho §5.2, M5).
  select o.name into v_parceiro
  from public.people as p
  join public.organizations as o on o.id = p.partner_organization_id
  where p.id = p_pessoa;

  insert into public.activities (organization_id, person_id, type, description, created_by)
  values (
    v_org, p_pessoa, 'virou_cliente',
    coalesce('Marcado como cliente — parceiro ' || v_parceiro, 'Marcado como cliente'),
    (select auth.uid())
  );
end;
$$;

-- ------------------------------------------------- criar_cliente

drop function public.criar_cliente(uuid, uuid, jsonb, boolean);

create function public.criar_cliente(
  p_organizacao                uuid,
  p_contato                    uuid    default null,
  p_novo_contato               jsonb   default null,
  p_confirmar_contato_parecido boolean default false,
  p_parceiro                   uuid    default null
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
  v_parceiro  text;
  v_homonimos jsonb;
begin
  -- 0. Novo cliente › Parceiro (PAR-5): só o nome; o contato é o do parceiro.
  if p_parceiro is not null then
    if p_contato is not null then
      raise exception 'Escolha um contato ou preencha um novo' using errcode = 'P0001';
    end if;

    if not private.current_user_manages(p_organizacao) then
      raise exception 'Só a gestão marca alguém como cliente.' using errcode = 'P0001';
    end if;

    -- Sob a RLS de quem chama: parceiro que ele não enxerga não existe.
    select o.name into v_parceiro
    from public.organizations as o
    where o.id = p_parceiro and o.type = 'partner';

    if not found then
      raise exception 'Parceiro não encontrado.' using errcode = 'P0001';
    end if;

    v_nome := private.aparar(
      case when jsonb_typeof(v_novo) = 'object' then v_novo->>'full_name' end
    );

    if v_nome is null then
      raise exception 'Informe o nome do cliente.' using errcode = 'P0001';
    end if;
    if length(v_nome) > 200 then
      raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
    end if;

    -- O mesmo cliente subido duas vezes numa carga grande: pergunta antes.
    if not coalesce(p_confirmar_contato_parecido, false) then
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.full_name)
                       order by p.created_at, p.id)
        into v_homonimos
      from public.people as p
      where p.organization_id = p_organizacao
        and p.partner_organization_id = p_parceiro
        and p.deleted_at is null
        and lower(p.full_name) = lower(v_nome);

      if v_homonimos is not null then
        return jsonb_build_object(
          'situacao', 'precisa_confirmar',
          'homonimos', v_homonimos,
          'parceiro', v_parceiro
        );
      end if;
    end if;

    perform set_config('dulihub.via_parceiro', 'on', true);

    insert into public.people
      (organization_id, full_name, lifecycle_stage, created_by, partner_organization_id)
    values
      (p_organizacao, v_nome, 'contact', v_uid, p_parceiro)
    returning id into v_pessoa;

    perform set_config('dulihub.via_parceiro', 'off', true);

    perform public.marcar_como_cliente(v_pessoa);

    return jsonb_build_object('situacao', 'criado', 'pessoa', v_pessoa);
  end if;

  -- Daqui em diante, o corpo da 0055 sem mudança.

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

  -- 4. Torna cliente pelo mesmo caminho do botão (D2 da 0055).
  perform public.marcar_como_cliente(v_pessoa);

  return jsonb_build_object('situacao', 'criado', 'pessoa', v_pessoa);
end;
$$;

revoke execute on function public.criar_cliente(uuid, uuid, jsonb, boolean, uuid) from public, anon;
grant execute on function public.criar_cliente(uuid, uuid, jsonb, boolean, uuid) to authenticated;

comment on function public.criar_cliente(uuid, uuid, jsonb, boolean, uuid) is
  'Novo cliente (CLI-15, PAR-5): contato existente da organização (fora do funil), novo, ou de parceiro (só o nome, com p_parceiro), numa gravação só, só pela gestão. Devolve {situacao: criado, pessoa} ou {situacao: precisa_confirmar, parecidos | homonimos + parceiro}.';

-- ------------------------------------------------- buscar_clientes

-- Ganha o parceiro e acha pelo nome dele (desenho §5.3). Retorno novo:
-- `drop` e `create`.
drop function public.buscar_clientes(text, int, int);

create function public.buscar_clientes(
  p_busca        text default '',
  p_limite       int  default 50,
  p_deslocamento int  default 0
)
returns table (
  id                      uuid,
  full_name               text,
  email                   text,
  phone_country_code      text,
  phone                   text,
  owner_id                uuid,
  client_since            date,
  partner_organization_id uuid,
  parceiro_nome           text,
  parceiro_email          text,
  parceiro_ddi            text,
  parceiro_telefone       text,
  total                   bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with termo as (
    -- O mesmo escape de `private.pessoas_da_busca` (0057).
    select
      t.texto,
      replace(replace(replace(t.texto, '\', '\\'), '%', '\%'), '_', '\_') as escapado
    from (select coalesce(private.aparar(p_busca), '') as texto) as t
  ),
  achados as (
    select p.id from private.pessoas_da_busca(p_busca) as p
    union
    select p.id
    from public.people as p
    join public.organizations as o on o.id = p.partner_organization_id
    cross join termo
    where termo.texto <> ''
      and o.name ilike '%' || termo.escapado || '%' escape '\'
  )
  select
    p.id,
    p.full_name,
    p.email,
    p.phone_country_code,
    p.phone,
    p.owner_id,
    p.client_since,
    p.partner_organization_id,
    o.name,
    o.email,
    o.phone_country_code,
    o.phone,
    count(*) over () as total
  from public.people as p
  left join public.organizations as o on o.id = p.partner_organization_id
  where p.id in (select a.id from achados as a)
    and p.lifecycle_stage = 'client'
    and p.deleted_at is null
  order by p.full_name, p.id
  limit greatest(coalesce(p_limite, 50), 0)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

revoke execute on function public.buscar_clientes(text, int, int) from public, anon;
grant execute on function public.buscar_clientes(text, int, int) to authenticated;
