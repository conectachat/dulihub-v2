-- Uma linha não pode apontar para outra organização.
--
-- Toda tabela de negócio carrega `organization_id`, e a RLS confere esse campo
-- na linha que está sendo gravada. Só que `with check` valida **a linha
-- resultante** — nunca as linhas que ela referencia. Então hoje isto passa,
-- sem erro nenhum:
--
--   uma pasta da organização A com `parent_id` apontando para pasta de B;
--   um tipo de visto de A exigindo pasta de B;
--   uma pessoa de A etiquetada com tag de B;
--   uma oportunidade de A numa etapa do funil de B.
--
-- Nada na aplicação impede: `document-type-actions` e `visa-type-actions`
-- pegam `parent_id` e `document_type_id` direto do formulário e confiam na
-- RLS, que não olha para o outro lado da referência.
--
-- A correção é estrutural e não custa código: cada tabela ganha
-- `unique (id, organization_id)` — hoje nenhuma tem, e por isso nenhuma chave
-- estrangeira composta era possível —, e as referências passam a levar a
-- organização junto. O Postgres passa a recusar o que a policy não via.
--
-- Só restrição. Nenhuma coluna sai, nenhum dado muda de significado. Com uma
-- organização e vinte exigências, nada no banco de hoje viola.
--
-- Sobre `parent_id` nulo: `match simple` é o padrão, e com ele uma chave
-- composta em que qualquer coluna é nula não é verificada. É exatamente o
-- comportamento desejado para nó de raiz.

-- ------------------------------------------------------- alvos das referências

alter table people          add constraint people_id_org_unique          unique (id, organization_id);
alter table tags            add constraint tags_id_org_unique            unique (id, organization_id);
alter table pipelines       add constraint pipelines_id_org_unique       unique (id, organization_id);
alter table pipeline_stages add constraint pipeline_stages_id_pipe_unique unique (id, pipeline_id);
alter table document_types  add constraint document_types_id_org_unique  unique (id, organization_id);
alter table visa_types      add constraint visa_types_id_org_unique      unique (id, organization_id);
alter table visa_stages     add constraint visa_stages_id_type_unique    unique (id, visa_type_id);

-- ------------------------------------------------ árvore do catálogo, por org

alter table document_types drop constraint document_types_parent_id_fkey;

alter table document_types
  add constraint document_types_parent_same_org
  foreign key (parent_id, organization_id)
  references document_types (id, organization_id)
  on delete cascade;

-- ------------------------------------ árvore de etapas, dentro do mesmo visto

-- Aqui a chave composta conserta um defeito que nem é de multi-organização: a
-- sub-etapa podia ter como pai uma etapa de **outro tipo de visto**, e a
-- árvore aparecia quebrada na tela sem nada explicar.
alter table visa_stages drop constraint visa_stages_parent_id_fkey;

alter table visa_stages
  add constraint visa_stages_parent_same_type
  foreign key (parent_id, visa_type_id)
  references visa_stages (id, visa_type_id)
  on delete cascade;

-- --------------------------------------------- exigência de documento por visto

-- A tabela não tinha organização própria: era deduzida pelo visto, e a policy
-- conferia só o lado do visto. Com a coluna, os dois lados ficam amarrados.
alter table visa_type_documents add column organization_id uuid;

update visa_type_documents d
set organization_id = v.organization_id
from visa_types v
where v.id = d.visa_type_id;

alter table visa_type_documents alter column organization_id set not null;

alter table visa_type_documents drop constraint visa_type_documents_visa_type_id_fkey;
alter table visa_type_documents drop constraint visa_type_documents_document_type_id_fkey;

alter table visa_type_documents
  add constraint visa_type_documents_visa_same_org
  foreign key (visa_type_id, organization_id)
  references visa_types (id, organization_id)
  on delete cascade;

alter table visa_type_documents
  add constraint visa_type_documents_doc_same_org
  foreign key (document_type_id, organization_id)
  references document_types (id, organization_id)
  on delete cascade;

-- ------------------------------------------------------- etiqueta na pessoa

-- `person_tags` não tinha organização e a policy passava só por
-- `can_access_person`: o `tag_id` não era verificado por nada.
alter table person_tags add column organization_id uuid;

update person_tags pt
set organization_id = p.organization_id
from people p
where p.id = pt.person_id;

alter table person_tags alter column organization_id set not null;

alter table person_tags drop constraint person_tags_person_id_fkey;
alter table person_tags drop constraint person_tags_tag_id_fkey;

alter table person_tags
  add constraint person_tags_person_same_org
  foreign key (person_id, organization_id)
  references people (id, organization_id)
  on delete cascade;

alter table person_tags
  add constraint person_tags_tag_same_org
  foreign key (tag_id, organization_id)
  references tags (id, organization_id)
  on delete cascade;

-- ---------------------------------------------------------------- negócio

-- Quatro vetores independentes, nenhum cruzado com os outros: a policy confere
-- só `can_access_person(person_id)`, e `organization_id`, `pipeline_id` e
-- `stage_id` entravam sem verificação nenhuma.
alter table opportunities drop constraint opportunities_person_id_fkey;
alter table opportunities drop constraint opportunities_pipeline_id_fkey;
alter table opportunities drop constraint opportunities_stage_id_fkey;

alter table opportunities
  add constraint opportunities_person_same_org
  foreign key (person_id, organization_id)
  references people (id, organization_id)
  on delete cascade;

alter table opportunities
  add constraint opportunities_pipeline_same_org
  foreign key (pipeline_id, organization_id)
  references pipelines (id, organization_id);

-- E a etapa tem de ser deste funil. Sem isto, o cartão some do quadro: ele é
-- montado por etapa do funil da organização, e a etapa de outro funil não
-- aparece em coluna nenhuma.
alter table opportunities
  add constraint opportunities_stage_same_pipeline
  foreign key (stage_id, pipeline_id)
  references pipeline_stages (id, pipeline_id);

-- ------------------------------------------- histórico preso à mesma pessoa

alter table notes drop constraint notes_person_id_fkey;
alter table notes
  add constraint notes_person_same_org
  foreign key (person_id, organization_id)
  references people (id, organization_id)
  on delete cascade;

alter table activities drop constraint activities_person_id_fkey;
alter table activities
  add constraint activities_person_same_org
  foreign key (person_id, organization_id)
  references people (id, organization_id)
  on delete cascade;

alter table files drop constraint files_person_id_fkey;
alter table files
  add constraint files_person_same_org
  foreign key (person_id, organization_id)
  references people (id, organization_id)
  on delete cascade;

-- ------------------------------------------------------------------- índices

-- A chave estrangeira composta usa a coluna da esquerda; os índices antigos de
-- coluna única continuam servindo à leitura, mas o par ajuda o cascade.
create index if not exists visa_type_documents_org_idx on visa_type_documents (organization_id);
create index if not exists person_tags_org_idx         on person_tags (organization_id);

comment on column visa_type_documents.organization_id is
  'Redundante com o visto de propósito: existe para a chave composta amarrar visto e pasta à mesma organização.';
comment on column person_tags.organization_id is
  'Redundante com a pessoa de propósito: existe para a chave composta amarrar pessoa e tag à mesma organização.';
