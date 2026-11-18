-- 0047 — documentos do cliente (CLI-8)
--
-- Passaporte, identidade, comprovante de residência, contrato: os papéis da
-- pessoa, que não são de um processo. `files` existia desde a 0004 sem
-- depósito nem tela — nenhuma linha (medido em 18/nov). Ela passa a ser a
-- lista dos documentos do cliente, e ganha o depósito `pessoas`.
--
-- ## O caminho é conferido contra a própria linha
--
-- `{org}/{pessoa}/{arquivo}/{nome}`: a organização na frente, porque é por
-- ela que o depósito decide quem lê (como `documentos`, 0020); a pessoa em
-- seguida, para a anonimização (CON-7) apagar a pasta dela de uma vez; o id
-- da linha — que nasce no navegador e vai no caminho — para dois arquivos de
-- mesmo nome não se sobreporem. O `check` vale para a tabela inteira (sem
-- linha antiga, a trava pode ser inteira), e `bucket` fica restrito a
-- `pessoas`: um uso novo de `files` com outro depósito revê o `check`.
--
-- ## O negócio, da mesma organização
--
-- A FK de `opportunity_id` era simples: um arquivo podia apontar para negócio
-- de outra organização (N1). Passa a composta, e apagar o negócio só zera a
-- coluna (`on delete set null (opportunity_id)`).
--
-- ## Limitação conhecida (D13)
--
-- A leitura de `files` continua por `can_access_person`: a organização
-- atribuída e o próprio cliente do portal veem a **lista**, mas não abrem
-- nem enviam — o depósito decide pela organização dona. É o mesmo que já
-- acontece com processos e financeiro.

alter table public.files
  add column category text not null default 'outro'
    constraint files_category_valida check (
      category in ('identidade', 'passaporte', 'comprovante_residencia', 'contrato', 'outro')
    );

alter table public.files
  add constraint files_caminho_da_pessoa check (
    bucket = 'pessoas'
    and split_part(path, '/', 1) = organization_id::text
    and split_part(path, '/', 2) = person_id::text
    and split_part(path, '/', 3) = id::text
    and split_part(path, '/', 4) <> ''
    and split_part(path, '/', 5) = ''
  );

alter table public.files
  drop constraint files_opportunity_id_fkey;

alter table public.files
  add constraint files_opportunity_same_org
    foreign key (opportunity_id, organization_id)
    references public.opportunities (id, organization_id)
    on delete set null (opportunity_id);

create index files_opportunity_idx on public.files (opportunity_id)
  where opportunity_id is not null;

comment on column public.files.category is
  'identidade, passaporte, comprovante_residencia, contrato ou outro.';

-- ------------------------------------------------------------------ Storage

-- Privado, como `documentos`: a tela pede uma URL assinada de curta duração.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pessoas',
  'pessoas',
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
create policy pessoas_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pessoas'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy pessoas_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pessoas'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy pessoas_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pessoas'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  )
  with check (
    bucket_id = 'pessoas'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );

create policy pessoas_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pessoas'
    and (storage.foldername(name))[1] in (
      select o::text from private.current_user_organizations() o
    )
  );
