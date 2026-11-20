-- 0054 — Ganho só pela função, e o que sai (entrega 3, fase 2)
--
-- Aplicada depois do push 1 (291fe22, conferido em `/api/versao` em 20/nov):
-- o código no ar já ganha e reabre por `ganhar_negocio`/`reabrir_negocio`,
-- não lê `opportunities.value`/`currency` e não manda `p_valor`/`p_moeda`.
-- Tudo o que esta migration recusa recusaria o código antigo — por isso ela
-- é a fase 2 (spec §6.3, "migration B"; plano da entrega 3, T10).
--
-- O que entra:
-- - **Ganho só pelas funções (CRM-10).** Entrar no ganho ou sair dele por
--   `update` direto — o `status` para ou de `won`, ou o `stage_id` para ou
--   de etapa de ganho — só com a marca `dulihub.via_ganho`, que
--   `ganhar_negocio` e `reabrir_negocio` (0052) ligam. Vale para a gestão
--   também: a regra é o caminho, não o papel. O resto do negócio ganho
--   (título, origem) continua editável; o dono já é guardado pela 0044.
-- - **Negócio ganho não se apaga** (texto da spec). A cascata da pessoa passa.
-- - **Regra (2) do estágio:** passar a cliente, no update ou no insert já
--   como `client`, só com a marca ou pela gestão. Sem usuário passa
--   (migrations, SQL Editor; a importação entra com login da gestão). Sem
--   liberação por profundidade (§3): quem
--   promove por gatilho (`quem_tem_processo_e_cliente`) já é a gestão ou
--   está sob a marca.
-- - **A marca em `marcar_como_cliente`**, e o ramo dela em
--   `quem_tem_processo_e_cliente` (o Ganho promove antes de criar os
--   processos; o ramo é a rede).
-- - **Item com processo não se apaga** (revisão final da fase 1): remover e
--   acrescentar de novo criaria um segundo processo no próximo Ganho.
-- - **Aviso próprio para negócio sem dono** no Ganho.
-- - **Dono do negócio preso à equipe:** chave composta com
--   `organization_members`, como `people.owner_id` (0044). A chave antiga só
--   ia a `profiles`, e quem saía da organização continuava dono.
--
-- O que sai: `opportunities.value` e `currency`, `products` e
-- `opportunity_products` (vazias em 20/nov), e `p_valor`/`p_moeda` de
-- `criar_oportunidade`. Sem cópia do banco à mão (dispensada pelo Renato em
-- 19/nov): o valor fica em `private.backup_opportunities_value` antes de sair.
--
-- Contagem de 20/nov, antes de aplicar: 2 negócios, 1 com valor (já com
-- item e ligado ao processo pela 0051); nada para a recópia, para a D19 nem
-- para a D13; nenhum dono fora da equipe.

-- ---------------------------------------------- 1. cópia dentro do banco

create table private.backup_opportunities_value as
  select id, value, currency
  from public.opportunities
  where value is not null;

revoke all on table private.backup_opportunities_value from public, anon, authenticated;

comment on table private.backup_opportunities_value is
  'Valor e moeda dos negócios antes da 0054 apagar as colunas. Só leitura de quem administra o banco.';

-- ------------------------------------------------------- 2. recópia (D19)
--
-- O código antigo ficou no ar entre a 0051 e o push 1: pode ter gravado
-- valor em negócio novo, ou mudado o valor do negócio que já tinha item.
-- Item editado é do código novo e vale mais que a coluna velha; item nunca
-- editado (`updated_at = created_at`) e sem visto é a cópia da 0051. O
-- negócio pode ter sido ganho na janela: a trava do item fica desligada só
-- durante a recópia.

alter table public.opportunity_items disable trigger opportunity_items_trava_do_ganho;

insert into public.opportunity_items
  (organization_id, opportunity_id, visa_type_id, visa_name, amount, currency, position, created_by)
select o.organization_id, o.id, null, o.title, o.value, o.currency, 0, null
from public.opportunities o
where o.value is not null
  and not exists (
    select 1 from public.opportunity_items i where i.opportunity_id = o.id
  );

update public.opportunity_items i
set amount   = o.value,
    currency = o.currency
from public.opportunities o
where o.id = i.opportunity_id
  and o.value is not null
  and i.visa_type_id is null
  and i.updated_at = i.created_at
  and (i.amount <> o.value or i.currency <> o.currency)
  and (select count(*) from public.opportunity_items x where x.opportunity_id = o.id) = 1;

alter table public.opportunity_items enable trigger opportunity_items_trava_do_ganho;

-- ------------------------------------------- 3. ligação da D13, de novo
--
-- O negócio ganho pelo código antigo na janela teve o processo criado à
-- mão ("Criar processo →"), sem item. Um processo sem item e um item sem
-- processo no mesmo negócio são o mesmo visto: ligar evita que reabrir e
-- ganhar de novo duplique o processo. Item com visto só liga a processo do
-- mesmo visto. `projects_item_imutavel` deixa passar sem usuário.

update public.projects p
set opportunity_item_id = i.id
from public.opportunity_items i
where i.opportunity_id = p.opportunity_id
  and p.opportunity_item_id is null
  and (i.visa_type_id is null or i.visa_type_id = p.visa_type_id)
  and not exists (select 1 from public.projects x where x.opportunity_item_id = i.id)
  and (select count(*) from public.projects x
       where x.opportunity_id = p.opportunity_id and x.opportunity_item_id is null) = 1
  and (select count(*) from public.opportunity_items x
       where x.opportunity_id = p.opportunity_id
         and not exists (select 1 from public.projects y where y.opportunity_item_id = x.id)) = 1;

-- --------------------------------- 4. item com processo não se apaga

create or replace function private.opportunity_items_trava_do_ganho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_negocio uuid := case tg_op when 'DELETE' then old.opportunity_id else new.opportunity_id end;
  v_status  text;
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

-- ---------------------------------------- 5. ganho só pelas funções

create function private.opportunities_ganho_so_pela_funcao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- `ganhar_negocio`/`reabrir_negocio`. A profundidade segue a §3; hoje
  -- nenhuma ação de chave estrangeira grava `status` nem `stage_id`.
  if pg_trigger_depth() > 1
     or coalesce(current_setting('dulihub.via_ganho', true), '') = 'on' then
    return new;
  end if;

  if new.status is distinct from old.status
     and (old.status = 'won' or new.status = 'won') then
    raise exception 'Use o Ganho ou o Reabrir do negócio.' using errcode = 'P0001';
  end if;

  if new.stage_id is distinct from old.stage_id
     and exists (
       select 1 from public.pipeline_stages s
       where s.id in (old.stage_id, new.stage_id) and s.is_won
     ) then
    raise exception 'Use o Ganho ou o Reabrir do negócio.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.opportunities_ganho_so_pela_funcao() from public, anon, authenticated;

create trigger opportunities_ganho_so_pela_funcao
  before update of status, stage_id on public.opportunities
  for each row execute function private.opportunities_ganho_so_pela_funcao();

create function private.opportunities_ganho_nao_se_apaga()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A cascata da pessoa e da organização passa (§3).
  if pg_trigger_depth() < 2 and old.status = 'won' then
    raise exception 'Reabra ou encerre os processos; o negócio ganho fica como registro.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

revoke execute on function private.opportunities_ganho_nao_se_apaga() from public, anon, authenticated;

create trigger opportunities_ganho_nao_se_apaga
  before delete on public.opportunities
  for each row execute function private.opportunities_ganho_nao_se_apaga();

-- ------------------------------------------ 6. regra (2) do estágio

create or replace function private.people_trava_do_estagio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- (1) Não volta, por caminho nenhum (0045).
  if old.lifecycle_stage = 'client' and new.lifecycle_stage <> 'client' then
    raise exception 'Cliente não volta a ser lead.' using errcode = 'P0001';
  end if;

  if old.lifecycle_stage <> 'client' and new.lifecycle_stage = 'client' then
    -- (2) Quem torna cliente: o Ganho (marca) ou a gestão. Sem usuário passa.
    if (select auth.uid()) is not null
       and coalesce(current_setting('dulihub.via_ganho', true), '') <> 'on'
       and not private.current_user_manages(new.organization_id) then
      raise exception 'Só a gestão torna alguém cliente; use o Ganho.' using errcode = 'P0001';
    end if;

    if new.client_since is null then
      new.client_since := (now() at time zone 'America/Sao_Paulo')::date;
    end if;
  end if;

  return new;
end;
$$;

-- No insert, a mesma regra (2). O "cliente desde" não se inventa: quem
-- insere já como cliente informa a data, ou ela fica vazia (0045).
create function private.people_trava_do_estagio_no_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lifecycle_stage = 'client'
     and (select auth.uid()) is not null
     and coalesce(current_setting('dulihub.via_ganho', true), '') <> 'on'
     and not private.current_user_manages(new.organization_id) then
    raise exception 'Só a gestão torna alguém cliente; use o Ganho.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.people_trava_do_estagio_no_insert() from public, anon, authenticated;

-- A organização conferida é a da linha gravada: ninguém a escolhe por outra
-- (a RLS de insert exige ser membro dela).
create trigger people_trava_do_estagio_no_insert
  before insert on public.people
  for each row execute function private.people_trava_do_estagio_no_insert();

-- ------------------------------- 7. a marca em `marcar_como_cliente`

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

  update public.people
  set lifecycle_stage = 'client',
      client_since    = coalesce(p_desde, v_hoje)
  where id = p_pessoa;

  perform set_config('dulihub.via_ganho', 'off', true);

  insert into public.activities (organization_id, person_id, type, description, created_by)
  values (v_org, p_pessoa, 'virou_cliente', 'Marcado como cliente', (select auth.uid()));
end;
$$;

-- ---------------------- 8. o ramo da marca em `quem_tem_processo_e_cliente`

create or replace function private.quem_tem_processo_e_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
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

  -- O Ganho promove antes de criar os processos e registra o próprio
  -- histórico; sob a marca, só promove.
  if coalesce(current_setting('dulihub.via_ganho', true), '') = 'on' then
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

-- --------------------------- 9. `ganhar_negocio`: aviso do negócio sem dono

create or replace function public.ganhar_negocio(
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
  -- Desde a 0054 o dono do negócio é sempre da equipe (chave composta); a
  -- conferência fica como rede.
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
      v_avisos := array_append(v_avisos, case
        when v_negocio.owner_id is null
          then 'O negócio está sem dono: você fica como dono do cliente.'
        else 'O dono do negócio não está na equipe deste contato: você fica como dono do cliente.'
      end);
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

-- ------------------------------------- 10. dono do negócio na equipe
--
-- Antes da chave, o dono que saiu da organização vira nulo (contagem de
-- 20/nov: nenhum). `opportunities_dono_protegido` deixa passar sem usuário.

update public.opportunities o
set owner_id = null
where o.owner_id is not null
  and not exists (
    select 1 from public.organization_members m
    where m.organization_id = o.organization_id and m.user_id = o.owner_id
  );

alter table public.opportunities drop constraint opportunities_owner_id_fkey;

alter table public.opportunities
  add constraint opportunities_owner_membro
    foreign key (organization_id, owner_id)
    references public.organization_members (organization_id, user_id)
    on delete set null (owner_id);

create index opportunities_owner_idx on public.opportunities (organization_id, owner_id)
  where owner_id is not null;

comment on column public.opportunities.owner_id is
  'Dono do negócio: membro da organização do negócio (FK composta, 0054).';

-- ---------------------------------------------------------- 11. o que sai

alter table public.opportunities
  drop column value,
  drop column currency;

drop table public.opportunity_products;
drop table public.products;

-- -------------------- 12. `sync_manifesto` sem as duas tabelas (C1)
--
-- A lista mora dentro da função, que monta o SQL na hora: o Postgres não
-- sabe que ela depende das tabelas. Sem recriá-la aqui, a sincronia de todos
-- os aparelhos quebraria.

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
    'notes', 'opportunities', 'organization_members',
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

-- ------------------------- 13. `criar_oportunidade` sem valor nem moeda
--
-- O valor mora nos vistos do negócio (CRM-13), acrescentados na tela do
-- lead (D11). Assinatura nova: `drop` + `create`, com `revoke`/`grant`.

drop function public.criar_oportunidade(uuid, text, boolean, boolean, uuid, jsonb, text, numeric, text);

create function public.criar_oportunidade(
  p_etapa                        uuid,
  p_titulo                       text,
  p_confirmar_contato_parecido   boolean,
  p_confirmar_outra_oportunidade boolean,
  p_contato                      uuid  default null,
  p_novo_contato                 jsonb default null,
  p_origem                       text  default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_novo          jsonb := nullif(p_novo_contato, 'null'::jsonb);
  v_etapa_org     uuid;
  v_funil         uuid;
  v_probabilidade integer;
  v_terminal      boolean;
  v_titulo        text;
  v_origem        text;
  v_pessoa        uuid;
  v_pessoa_org    uuid;
  v_na_lixeira    boolean;
  v_nome          text;
  v_email         text;
  v_ddi           text;
  v_telefone      text;
  v_erro          text;
  v_parecidos     jsonb;
  v_oportunidades jsonb;
  v_negocio       uuid;
begin
  -- 1. Exatamente um contato.
  if (p_contato is null) = (v_novo is null) then
    raise exception 'Escolha um contato ou preencha um novo' using errcode = 'P0001';
  end if;

  -- 2. A etapa: lida com a RLS de quem chama, de uma organização sua, aberta.
  select s.organization_id, s.pipeline_id, s.probability, (s.is_won or s.is_lost)
  into v_etapa_org, v_funil, v_probabilidade, v_terminal
  from public.pipeline_stages as s
  where s.id = p_etapa;

  if v_etapa_org is null
     or v_etapa_org not in (select private.current_user_organizations())
  then
    raise exception 'Você não tem permissão para isto.' using errcode = '42501';
  end if;

  -- Antes do gatilho da 0038, para a frase chegar inteira à tela.
  if v_terminal then
    raise exception 'Negócio novo começa numa etapa aberta. Para ganhar ou perder, mova o cartão.'
      using errcode = 'P0001';
  end if;

  -- 3. O título e a origem.
  v_titulo := private.aparar(p_titulo);
  if v_titulo is null then
    raise exception 'Informe um título' using errcode = 'P0001';
  end if;

  v_origem := private.aparar(p_origem);
  if length(v_titulo) > 200 or length(v_origem) > 200 then
    raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
  end if;

  -- 4. Contato existente: da organização da etapa, fora da lixeira.
  if p_contato is not null then
    select p.organization_id, p.deleted_at is not null
    into v_pessoa_org, v_na_lixeira
    from public.people as p
    where p.id = p_contato;

    if v_pessoa_org is null then
      raise exception 'Contato não encontrado.' using errcode = 'P0001';
    end if;
    if v_pessoa_org <> v_etapa_org then
      raise exception 'O contato não é da organização deste funil.' using errcode = 'P0001';
    end if;
    if v_na_lixeira then
      raise exception 'Este contato está na lixeira. Restaure antes.' using errcode = 'P0001';
    end if;

    v_pessoa := p_contato;
  end if;

  -- 5. Contato novo: nome, e-mail, DDI e telefone válidos; parecidos perguntam.
  if v_novo is not null then
    if jsonb_typeof(v_novo) <> 'object' then
      raise exception 'Contato novo inválido.' using errcode = 'P0001';
    end if;

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

    if not coalesce(p_confirmar_contato_parecido, false) then
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'nome', c.full_name,
               'estagio', c.lifecycle_stage,
               'na_lixeira', c.na_lixeira,
               'bate_email', c.bate_email,
               'bate_telefone', c.bate_telefone
             ) order by c.full_name, c.id)
      into v_parecidos
      from public.contatos_parecidos(v_email, v_ddi, v_telefone) as c;

      if v_parecidos is not null then
        return jsonb_build_object('situacao', 'precisa_confirmar', 'parecidos', v_parecidos);
      end if;
    end if;
  end if;

  -- 6. Oportunidades anteriores do contato existente: um cliente pode fechar
  --    um visto e depois pedir outro, mas é bom saber antes.
  if v_pessoa is not null and not coalesce(p_confirmar_outra_oportunidade, false) then
    select jsonb_agg(jsonb_build_object(
             'id', o.id,
             'titulo', o.title,
             'status', o.status,
             'criada_em', o.created_at
           ) order by o.created_at desc)
    into v_oportunidades
    from (
      select id, title, status, created_at
      from public.opportunities
      where person_id = v_pessoa
      order by created_at desc
      limit 10
    ) as o;

    if v_oportunidades is not null then
      return jsonb_build_object('situacao', 'precisa_confirmar', 'oportunidades', v_oportunidades);
    end if;
  end if;

  -- Grava: o contato novo, o negócio e a promoção a oportunidade.
  if v_novo is not null then
    insert into public.people
      (organization_id, full_name, email, phone_country_code, phone, lifecycle_stage, created_by)
    values
      (v_etapa_org, v_nome, v_email, v_ddi, v_telefone, 'contact', v_uid)
    returning id into v_pessoa;
  end if;

  insert into public.opportunities
    (organization_id, person_id, pipeline_id, stage_id, title, source,
     probability, status, owner_id, created_by)
  values
    (v_etapa_org, v_pessoa, v_funil, p_etapa, v_titulo, v_origem,
     v_probabilidade, 'open', v_uid, v_uid)
  returning id into v_negocio;

  -- Quem tem oportunidade deixa de ser simples contato. Cliente não regride.
  update public.people
  set lifecycle_stage = 'opportunity'
  where id = v_pessoa and lifecycle_stage = 'contact';

  return jsonb_build_object('situacao', 'criada', 'negocio', v_negocio, 'pessoa', v_pessoa);
end;
$$;

revoke execute on function public.criar_oportunidade(
  uuid, text, boolean, boolean, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.criar_oportunidade(
  uuid, text, boolean, boolean, uuid, jsonb, text
) to authenticated;
