-- 0045 — estágio do cliente, garantido no banco (CLI-11 a CLI-14)
--
-- Até aqui o estágio de uma pessoa era só o que a tela mandava gravar. Três
-- regras passam a ser do banco:
--
-- 1. **Cliente não volta a ser lead** (M17). O update que tira alguém de
--    `client` é recusado sempre: com ou sem usuário, em qualquer
--    profundidade de gatilho. É a única trava absoluta do desenho (spec §3):
--    nem a importação, nem uma migration, nem uma cascata rebaixam. Corrigir
--    um engano é trabalho do dono do banco, desligando o gatilho à mão.
--
-- 2. **Quem tem processo ou cobrança é cliente** (CLI-14, substitui o CON-3).
--    Criar um processo ou uma cobrança para quem ainda não é cliente — ou
--    trocar o contato de um para quem não é — o promove, e só a gestão faz
--    isso fora do Ganho. Quem não é da gestão recebe "Só a gestão torna
--    alguém cliente; use o Ganho." A promoção fica no histórico como
--    `virou_cliente`.
--
-- 3. **Marcar como cliente à mão** é da gestão (`marcar_como_cliente`).
--
-- ## Cliente desde
--
-- `client_since` se preenche quando a pessoa **passa a ser** cliente, com a
-- data de hoje em São Paulo, e só se ainda estiver nula — é o que preserva a
-- data escolhida em `marcar_como_cliente`. O insert não a inventa: quem a
-- importação traz já como cliente fica sem data, a menos que ela venha junto.
--
-- ## O que ainda não está aqui (entrega 3)
--
-- A regra (2) da spec para o **estágio** — "só a gestão, ou o Ganho, tornam
-- cliente por update direto" — espera a marca `via_ganho` da entrega 3. O
-- Ganho de hoje promove por `update people` direto (`mover.ts`), e com a
-- regra ativa um colaborador que não é da gestão deixaria de ganhar negócio.
-- Até lá, `people_update_staff` deixa qualquer membro promover pela API; por
-- isso CLI-12 e CLI-14 ficam 🟡 na spec.
--
-- ## Ordem
--
-- A conversão dos dados (§7) roda **antes** dos gatilhos: com eles criados,
-- os 2 contatos convertidos ganhariam a data de hoje em vez da do primeiro
-- processo.

-- ------------------------------------------------------------- client_since

alter table public.people
  add column client_since date;

comment on column public.people.client_since is
  'Cliente desde: preenchido ao passar a cliente (hoje, São Paulo) ou à mão.';

-- ------------------------------------------------------- conversão (spec §7)

-- Quem tem processo ou cobrança e não está na lixeira passa a cliente.
update public.people p
set lifecycle_stage = 'client'
where p.lifecycle_stage <> 'client'
  and p.deleted_at is null
  and (
    exists (select 1 from public.projects pr where pr.person_id = p.id)
    or exists (select 1 from public.receivables r where r.person_id = p.id)
  );

-- A data é a do primeiro processo ou da primeira cobrança, a que vier antes.
-- `least` ignora nulo; sem nenhum dos dois, fica nula ("—").
update public.people p
set client_since = least(
  (select min(pr.started_on) from public.projects pr where pr.person_id = p.id),
  (select min((r.created_at at time zone 'America/Sao_Paulo')::date)
     from public.receivables r where r.person_id = p.id)
)
where p.lifecycle_stage = 'client'
  and p.client_since is null;

-- Todo cliente ganha o dono mais antigo da organização (D7). Daqui em diante
-- promover nunca mexe no dono: ele é escolhido no Editar.
update public.people p
set owner_id = (
  select m.user_id
  from public.organization_members m
  where m.organization_id = p.organization_id
    and m.role = 'owner'
  order by m.created_at
  limit 1
)
where p.lifecycle_stage = 'client'
  and p.owner_id is null;

-- ------------------------------------------------------- a trava do estágio

-- Nome depois de `people_guard_self_update` de propósito (gatilhos do mesmo
-- momento rodam em ordem alfabética): aquele desfaz em silêncio o que o
-- cliente do portal tentou mudar, e só o que sobra chega aqui — o portal não
-- recebe erro novo.
create function private.people_trava_do_estagio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.lifecycle_stage = 'client' and new.lifecycle_stage <> 'client' then
    raise exception 'Cliente não volta a ser lead.' using errcode = 'P0001';
  end if;

  if old.lifecycle_stage <> 'client' and new.lifecycle_stage = 'client'
     and new.client_since is null then
    new.client_since := (now() at time zone 'America/Sao_Paulo')::date;
  end if;

  return new;
end;
$$;

revoke execute on function private.people_trava_do_estagio() from public, anon, authenticated;

create trigger people_trava_do_estagio
  before update on public.people
  for each row execute function private.people_trava_do_estagio();

-- ---------------------------------------- quem tem processo ou cobrança é cliente

-- `security invoker`: lê a pessoa, promove e grava o histórico com as
-- permissões de quem cria o processo ou a cobrança — a RLS continua valendo.
-- Pessoa que não casa com a organização da linha: devolve sem fazer nada, e a
-- chave composta recusa com a frase dela.
create function private.quem_tem_processo_e_cliente()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_estagio public.person_lifecycle_stage;
  v_o_que   text := case tg_table_name when 'projects' then 'processo' else 'cobrança' end;
begin
  if tg_op = 'UPDATE' and new.person_id is not distinct from old.person_id then
    return new;
  end if;

  select p.lifecycle_stage into v_estagio
  from public.people p
  where p.id = new.person_id and p.organization_id = new.organization_id;

  if not found or v_estagio = 'client' then
    return new;
  end if;

  if (select auth.uid()) is null then
    update public.people set lifecycle_stage = 'client' where id = new.person_id;
    return new;
  end if;

  if not private.current_user_manages(new.organization_id) then
    raise exception 'Só a gestão torna alguém cliente; use o Ganho.' using errcode = 'P0001';
  end if;

  update public.people set lifecycle_stage = 'client' where id = new.person_id;

  insert into public.activities (organization_id, person_id, type, description, created_by)
  values (
    new.organization_id,
    new.person_id,
    'virou_cliente',
    'Virou cliente (' || v_o_que || ' ' || new.title || ')',
    (select auth.uid())
  );

  return new;
end;
$$;

-- Gatilho não checa privilégio de execução: ninguém precisa poder chamar.
revoke execute on function private.quem_tem_processo_e_cliente() from public, anon, authenticated;

-- Os nomes rodam depois de `projects_processo_do_mesmo_contato`, que recusa
-- com a frase dele o processo ligado a negócio de outro contato.
create trigger projects_quem_tem_processo_e_cliente
  before insert or update of person_id on public.projects
  for each row execute function private.quem_tem_processo_e_cliente();

create trigger receivables_quem_tem_processo_e_cliente
  before insert or update of person_id on public.receivables
  for each row execute function private.quem_tem_processo_e_cliente();

-- ------------------------------------------------------- marcar como cliente

create function public.marcar_como_cliente(p_pessoa uuid, p_desde date default null)
returns void
language plpgsql
security invoker
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

  update public.people
  set lifecycle_stage = 'client',
      client_since    = coalesce(p_desde, v_hoje)
  where id = p_pessoa;

  insert into public.activities (organization_id, person_id, type, description, created_by)
  values (v_org, p_pessoa, 'virou_cliente', 'Marcado como cliente', (select auth.uid()));
end;
$$;

revoke execute on function public.marcar_como_cliente(uuid, date) from public, anon;
grant execute on function public.marcar_como_cliente(uuid, date) to authenticated;

-- ------------------------------------- portal: a data também é da equipe

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
  end if;
  return new;
end;
$$;

revoke execute on function private.people_guard_self_update() from public, anon, authenticated;
