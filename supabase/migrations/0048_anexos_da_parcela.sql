-- 0048 — anexos da parcela (CLI-6)
--
-- Boleto, nota fiscal e comprovante de pagamento ficam pendurados na parcela
-- a que se referem. O arquivo vai para o depósito `financeiro`; a linha de
-- `installment_files` o registra.
--
-- ## O caminho é conferido contra a parcela de verdade
--
-- `{org}/{pessoa}/{cobrança}/{parcela}/{arquivo}/{nome}`. A pessoa vem logo
-- depois da organização para a anonimização (CON-7) apagar a pasta dela de
-- uma vez. Um `check` não consulta outra tabela, e a pessoa e a cobrança não
-- estão na linha: quem confere é o gatilho `installment_files_caminho`, que
-- lê parcela → cobrança → pessoa e exige as quatro primeiras partes iguais
-- aos ids reais, a quinta igual ao id da linha, a sexta não vazia e nada
-- depois. Recusa como `23514`, o código de um `check`.
--
-- ## Nenhum arquivo órfão
--
-- O depósito não sabe do banco: apagar a linha não apaga o objeto. Por isso
-- apagar **direto** uma parcela ou uma cobrança que tem anexo é recusado
-- ("Remova os anexos antes."), também na organização de teste — a tela
-- remove os anexos um a um, linha e objeto. A cascata vinda da pessoa
-- (`pg_trigger_depth() > 1`, só possível na organização de teste) passa; o
-- teste que envia arquivo o remove do depósito no fim.
--
-- Para isso funcionar sem internet, `excluirCobranca` passa a mandar só o
-- delete da cobrança (as parcelas vão em cascata no servidor): a recusa vem
-- inteira, como um conflito só.
--
-- Fora do espelho: os anexos só funcionam com internet.

create table public.installment_files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  installment_id  uuid not null,
  kind            text not null default 'outro'
                  check (kind in ('boleto', 'nota_fiscal', 'comprovante', 'outro')),
  filename        text not null check (length(trim(filename)) > 0),
  storage_path    text not null unique,
  mime_type       text,
  size_bytes      bigint check (size_bytes >= 0),
  uploaded_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),

  constraint installment_files_installment_same_org
    foreign key (installment_id, organization_id)
    references public.installments (id, organization_id) on delete cascade
);

create index installment_files_parcela_idx on public.installment_files (installment_id);

create trigger installment_files_set_updated_at
  before update on public.installment_files
  for each row execute function private.set_updated_at();

create trigger installment_files_marcar_lapide
  after delete on public.installment_files
  for each row execute function private.marcar_lapide();

comment on table public.installment_files is
  'Boleto, nota fiscal ou comprovante de uma parcela. Arquivo no depósito financeiro.';

alter table public.installment_files enable row level security;

create policy installment_files_all on public.installment_files
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- ------------------------------------------------------- o caminho certo

create function private.installment_files_caminho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cobranca uuid;
  v_pessoa   uuid;
  v_ok       boolean;
begin
  select i.receivable_id, r.person_id
    into v_cobranca, v_pessoa
  from public.installments i
  join public.receivables r on r.id = i.receivable_id
  where i.id = new.installment_id;

  -- Parcela que não existe: a chave estrangeira recusa com a frase dela.
  if not found then
    return new;
  end if;

  v_ok := split_part(new.storage_path, '/', 1) = new.organization_id::text
      and split_part(new.storage_path, '/', 2) = v_pessoa::text
      and split_part(new.storage_path, '/', 3) = v_cobranca::text
      and split_part(new.storage_path, '/', 4) = new.installment_id::text
      and split_part(new.storage_path, '/', 5) = new.id::text
      and split_part(new.storage_path, '/', 6) <> ''
      and split_part(new.storage_path, '/', 7) = '';

  if not v_ok then
    raise exception 'O caminho do anexo não é o da parcela.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.installment_files_caminho() from public, anon, authenticated;

create trigger installment_files_caminho
  before insert or update on public.installment_files
  for each row execute function private.installment_files_caminho();

-- --------------------------------------------- sem anexo para apagar direto

create function private.sem_anexo_para_apagar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A cascata vinda da pessoa passa: o teste que a usa remove o objeto.
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_table_name = 'installments' then
    if exists (select 1 from public.installment_files f where f.installment_id = old.id) then
      raise exception 'Remova os anexos antes.' using errcode = 'P0001';
    end if;
  elsif exists (
    select 1
    from public.installment_files f
    join public.installments i on i.id = f.installment_id
    where i.receivable_id = old.id
  ) then
    raise exception 'Remova os anexos antes.' using errcode = 'P0001';
  end if;

  return old;
end;
$$;

revoke execute on function private.sem_anexo_para_apagar() from public, anon, authenticated;

create trigger installments_sem_anexo_para_apagar
  before delete on public.installments
  for each row execute function private.sem_anexo_para_apagar();

create trigger receivables_sem_anexo_para_apagar
  before delete on public.receivables
  for each row execute function private.sem_anexo_para_apagar();

-- ------------------------------------------------------------------ Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financeiro',
  'financeiro',
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

-- A primeira pasta do caminho é a organização.
create policy financeiro_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'financeiro'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy financeiro_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'financeiro'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy financeiro_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'financeiro'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  )
  with check (
    bucket_id = 'financeiro'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy financeiro_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'financeiro'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );
