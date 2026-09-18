-- Fase 2 — o processo do cliente.
--
-- Um processo nasce de um tipo de visto e recebe uma CÓPIA do molde: as etapas
-- e as pastas de documento exigidas. Mudar o molde depois não mexe em processo
-- que já está correndo — nenhum cliente vê etapa aparecer ou sumir, e o
-- histórico do que foi feito continua valendo.
--
-- Quatro tabelas:
--
--   projects           o processo, com os campos de imigração (recibo USCIS,
--                      priority date, RFE, envio, decisão)
--   project_stages     etapas copiadas, com status de etapa
--   project_documents  pastas copiadas, mais as criadas só neste processo
--   document_files     cada arquivo enviado, com o veredito: em análise,
--                      aprovado, ou recusado com motivo
--
-- A pasta não é o arquivo. "Rendimentos" é uma exigência que acumula quantos
-- arquivos vierem, cada um com o próprio veredito; e a pasta só conta como
-- resolvida quando o Renato marca — com três holerites aprovados, só quem
-- conhece o caso sabe se ainda falta o IRPF.
--
-- Mesmo desenho de isolamento da 0016: `organization_id` em tudo, chaves
-- compostas, e nenhuma linha consegue apontar para outra organização ou outro
-- processo.
--
-- Processo é trabalho do dia a dia, não configuração: qualquer membro da
-- organização lê e escreve (diferente da 0018). O cliente não enxerga nada por
-- enquanto — ganha leitura na Fase 6, junto com o gatilho que congela vínculo.

-- ------------------------------------------------ alvos das chaves compostas

alter table opportunities  add constraint opportunities_id_org_unique  unique (id, organization_id);
alter table stage_statuses add constraint stage_statuses_id_org_unique unique (id, organization_id);

-- ------------------------------------------------------------------ projects

create table projects (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  person_id            uuid not null,
  visa_type_id         uuid,
  opportunity_id       uuid,

  title                text not null check (length(trim(title)) > 0),
  status               text not null default 'active'
                       check (status in ('active', 'filed', 'approved', 'denied', 'closed')),

  started_on           date not null default current_date,
  expected_on          date,
  filed_on             date,
  decided_on           date,

  uscis_receipt_number text,
  priority_date        date,
  rfe_received_on      date,
  rfe_due_on           date,

  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (id, organization_id),

  constraint projects_person_same_org
    foreign key (person_id, organization_id)
    references people (id, organization_id) on delete cascade,

  -- Apagar o molde ou o negócio não apaga o processo: só esquece de onde veio.
  -- A lista de colunas no `set null` é o que impede o Postgres de anular
  -- também o `organization_id`, que faz parte da chave.
  constraint projects_visa_same_org
    foreign key (visa_type_id, organization_id)
    references visa_types (id, organization_id) on delete set null (visa_type_id),

  constraint projects_opportunity_same_org
    foreign key (opportunity_id, organization_id)
    references opportunities (id, organization_id) on delete set null (opportunity_id)
);

create index projects_org_idx    on projects (organization_id, status);
create index projects_person_idx on projects (person_id);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------ project_stages

create table project_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  parent_id       uuid,
  source_stage_id uuid references visa_stages(id) on delete set null,

  name            text not null,
  position        integer not null default 0,
  is_required     boolean not null default true,
  estimated_days  integer,
  status_id       uuid not null,
  started_on      date,
  completed_on    date,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, project_id),

  constraint project_stages_project_same_org
    foreign key (project_id, organization_id)
    references projects (id, organization_id) on delete cascade,

  -- A sub-etapa só pode ter mãe dentro do mesmo processo.
  constraint project_stages_parent_same_project
    foreign key (parent_id, project_id)
    references project_stages (id, project_id) on delete cascade,

  -- Status em uso não some: apagar um status que alguma etapa usa é recusado.
  constraint project_stages_status_same_org
    foreign key (status_id, organization_id)
    references stage_statuses (id, organization_id)
);

create index project_stages_project_idx on project_stages (project_id, position);

create trigger project_stages_set_updated_at
  before update on project_stages
  for each row execute function private.set_updated_at();

-- --------------------------------------------------------- project_documents

create table project_documents (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null,
  project_id              uuid not null,
  parent_id               uuid,
  -- Nulo quando a pasta foi criada só neste processo. A tela mostra a
  -- diferença entre "veio do visto" e "só deste processo".
  source_document_type_id uuid references document_types(id) on delete set null,

  name                    text not null check (length(trim(name)) > 0),
  position                integer not null default 0,
  is_required             boolean not null default true,
  deadline_on             date,

  resolved_at             timestamptz,
  resolved_by             uuid references profiles(id) on delete set null,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (id, project_id),

  constraint project_documents_project_same_org
    foreign key (project_id, organization_id)
    references projects (id, organization_id) on delete cascade,

  constraint project_documents_parent_same_project
    foreign key (parent_id, project_id)
    references project_documents (id, project_id) on delete cascade
);

create index project_documents_project_idx on project_documents (project_id, position);

create trigger project_documents_set_updated_at
  before update on project_documents
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------ document_files

create table document_files (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  project_id          uuid not null,
  project_document_id uuid not null,

  storage_path        text not null unique,
  file_name           text not null,
  mime_type           text,
  size_bytes          bigint,
  uploaded_by         uuid references profiles(id) on delete set null default auth.uid(),
  uploaded_at         timestamptz not null default now(),

  review_status       text not null default 'pending'
                      check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by         uuid references profiles(id) on delete set null,
  reviewed_at         timestamptz,
  rejection_reason    text,

  constraint document_files_project_same_org
    foreign key (project_id, organization_id)
    references projects (id, organization_id) on delete cascade,

  constraint document_files_folder_same_project
    foreign key (project_document_id, project_id)
    references project_documents (id, project_id) on delete cascade,

  -- O caminho no Storage tem de ser desta organização, deste processo e desta
  -- pasta. É a mesma regra de `caminhoPertence` na aplicação; aqui ela não
  -- depende de ninguém lembrar de chamá-la.
  constraint document_files_path_matches check (
    split_part(storage_path, '/', 1) = organization_id::text
    and split_part(storage_path, '/', 2) = project_id::text
    and split_part(storage_path, '/', 3) = project_document_id::text
    and split_part(storage_path, '/', 4) <> ''
    and split_part(storage_path, '/', 5) = ''
  ),

  -- Recusa sem motivo não diz ao cliente o que trocar.
  constraint document_files_rejection_has_reason check (
    review_status <> 'rejected'
    or length(trim(coalesce(rejection_reason, ''))) >= 10
  ),

  -- Em análise quer dizer que ninguém analisou ainda.
  constraint document_files_pending_unreviewed check (
    review_status <> 'pending' or reviewed_at is null
  )
);

create index document_files_folder_idx on document_files (project_document_id);

-- ----------------------------------------------------------------------- RLS

alter table projects          enable row level security;
alter table project_stages    enable row level security;
alter table project_documents enable row level security;
alter table document_files    enable row level security;

create policy projects_all on projects
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy project_stages_all on project_stages
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy project_documents_all on project_documents
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy document_files_all on document_files
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- ------------------------------------------------------------------ Storage

-- Privado: nada se abre por link público. A tela pede ao servidor uma URL
-- assinada de curta duração.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- A primeira pasta do caminho é a organização. É por ela que se decide quem
-- vê o quê — por isso `caminhoDoArquivo` a põe na frente.
create policy documentos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy documentos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy documentos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  )
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy documentos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

-- ------------------------------------------------ criar processo do molde

-- Numa transação só: falhar no meio não deixa processo pela metade.
--
-- `security invoker`: a RLS vale para quem chama. Um membro de outra
-- organização não enxerga a pessoa, e a função para em "Contato não
-- encontrado" antes de gravar qualquer coisa.
create or replace function public.criar_processo(
  p_person      uuid,
  p_visa_type   uuid,
  p_title       text,
  p_opportunity uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org     uuid;
  v_status  uuid;
  v_inicio  date := current_date;
  v_projeto uuid;
begin
  select organization_id into v_org
  from public.people
  where id = p_person and deleted_at is null;

  if v_org is null then
    raise exception 'Contato não encontrado.' using errcode = 'P0002';
  end if;

  select id into v_status
  from public.stage_statuses
  where organization_id = v_org and is_default;

  if v_status is null then
    raise exception 'A organização não tem status de etapa padrão.';
  end if;

  insert into public.projects
    (organization_id, person_id, visa_type_id, opportunity_id, title, started_on, created_by)
  values
    (v_org, p_person, p_visa_type, p_opportunity, p_title, v_inicio, (select auth.uid()))
  returning id into v_projeto;

  -- Etapas: um id novo para cada etapa do molde, e o pai traduzido pelo mesmo
  -- mapa. Mãe e filha entram no mesmo comando — a chave estrangeira é
  -- conferida no fim dele, então a ordem das linhas não importa.
  with molde as materialized (
    select id as antigo, gen_random_uuid() as novo, parent_id as pai_antigo,
           name, position, is_required, estimated_days
    from public.visa_stages
    where visa_type_id = p_visa_type
  )
  insert into public.project_stages
    (id, organization_id, project_id, parent_id, source_stage_id,
     name, position, is_required, estimated_days, status_id)
  select m.novo, v_org, v_projeto, pai.novo, m.antigo,
         m.name, m.position, m.is_required, m.estimated_days, v_status
  from molde m
  left join molde pai on pai.antigo = m.pai_antigo;

  -- Pastas: só as que o visto exige, com ordem, obrigatoriedade e prazo DO
  -- VISTO. O pai é o "pai visível" — o primeiro ancestral no catálogo que
  -- também é exigido —, a mesma regra de `paiVisivel` em `src/lib/tree.ts`.
  -- Sem isso, exigir a neta sem a mãe deixaria a neta sem lugar na árvore.
  with recursive exigidas as (
    select vtd.document_type_id as pasta, vtd.position, vtd.is_required,
           vtd.deadline_days, d.name, d.parent_id
    from public.visa_type_documents vtd
    join public.document_types d on d.id = vtd.document_type_id
    where vtd.visa_type_id = p_visa_type
  ),
  subida as (
    select e.pasta as origem, e.parent_id as atual, 1 as nivel
    from exigidas e
    union all
    select s.origem, d.parent_id, s.nivel + 1
    from subida s
    join public.document_types d on d.id = s.atual
    where s.atual not in (select pasta from exigidas)
      and s.nivel < 64  -- ciclo no catálogo não trava a criação
  ),
  pai_visivel as (
    select distinct on (origem) origem, atual as pai
    from subida
    where atual is null or atual in (select pasta from exigidas)
    order by origem, nivel
  ),
  novas as materialized (
    select e.*, gen_random_uuid() as novo from exigidas e
  )
  insert into public.project_documents
    (id, organization_id, project_id, parent_id, source_document_type_id,
     name, position, is_required, deadline_on)
  select n.novo, v_org, v_projeto, np.novo, n.pasta,
         n.name, n.position, n.is_required,
         case when n.deadline_days is null then null
              else v_inicio + n.deadline_days end
  from novas n
  left join pai_visivel pv on pv.origem = n.pasta
  left join novas np on np.pasta = pv.pai;

  return v_projeto;
end;
$$;

revoke execute on function public.criar_processo(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.criar_processo(uuid, uuid, text, uuid) to authenticated;

comment on function public.criar_processo(uuid, uuid, text, uuid) is
  'Cria o processo e copia do tipo de visto as etapas e as pastas exigidas, numa transação só.';
