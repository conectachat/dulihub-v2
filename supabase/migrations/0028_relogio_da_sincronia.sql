-- 0028 — relógio da sincronia
--
-- O aparelho vai pedir "o que mudou desde tal instante". Isso exige que toda
-- linha diga quando mudou. Nove tabelas não diziam:
--
--   activities, document_files, files, opportunity_products,
--   organization_members, person_tags, pipeline_stages, tags,
--   visa_type_documents
--
-- A mais importante é `document_files`: sem `updated_at`, **aprovar ou
-- recusar um documento é invisível** para qualquer sincronia incremental — o
-- aparelho continuaria mostrando "em análise" para sempre.
--
-- `project_page_updates` fica de fora de propósito: ela só acrescenta, e o
-- espelho a lê por id crescente (é o que o provedor das Observações já faz).
--
-- `project_pages` tem a coluna e não tinha o gatilho (a data era escrita à
-- mão em `compactar_pagina`); ganha o gatilho para não depender disso.
--
-- O índice é `(organization_id, updated_at)` porque é exatamente assim que a
-- consulta do espelho vai filtrar: minha organização, mudou depois de tal
-- instante. Onde não há `organization_id`, só `(updated_at)`.

do $$
declare
  t text;
begin
  foreach t in array array[
    'activities', 'document_files', 'files', 'opportunity_products',
    'organization_members', 'person_tags', 'pipeline_stages', 'tags',
    'visa_type_documents'
  ]
  loop
    execute format(
      'alter table public.%I add column updated_at timestamptz not null default now()', t);
    execute format(
      'create trigger %I before update on public.%I
       for each row execute function private.set_updated_at()',
      t || '_set_updated_at', t);
    execute format(
      'create index %I on public.%I (organization_id, updated_at)',
      t || '_sync_idx', t);
  end loop;
end $$;

-- Tinha a coluna, não tinha o gatilho.
create trigger project_pages_set_updated_at
  before update on public.project_pages
  for each row execute function private.set_updated_at();

-- As que já tinham `updated_at` ganham o índice da sincronia.
do $$
declare
  t text;
begin
  foreach t in array array[
    'document_types', 'notes', 'opportunities', 'people', 'pipelines',
    'products', 'project_documents', 'project_pages', 'project_stages',
    'projects', 'stage_statuses', 'visa_stages', 'visa_types'
  ]
  loop
    execute format(
      'create index if not exists %I on public.%I (organization_id, updated_at)',
      t || '_sync_idx', t);
  end loop;
end $$;
