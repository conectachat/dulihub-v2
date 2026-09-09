-- Configuração exige papel de gestão. Conteúdo do dia a dia, não.
--
-- As oito tabelas de configuração têm uma policy só, `for all`, conferindo
-- apenas associação à organização. Então hoje qualquer membro — inclusive um
-- colaborador recém-convidado — apaga o funil inteiro, o catálogo de
-- documentos e todos os tipos de visto.
--
-- A diferença não é de tamanho, é de alcance. Apagar um contato tira um
-- contato. Apagar uma pasta do catálogo tira a exigência, o prazo e a
-- obrigatoriedade de todos os vistos que a usavam; apagar uma etapa mexe no
-- funil de todo mundo ao mesmo tempo.
--
-- `people` já fazia essa distinção desde a 0001: `people_delete` passa por
-- `private.current_user_manages`. Só que a exclusão de contato na tela é
-- reversível (`deleted_at`), então essa é justamente a policy que menos
-- precisava do papel — e as oito que mais precisavam não o tinham.
--
-- Ler continua livre para qualquer membro: colaborador precisa enxergar o
-- catálogo para trabalhar. O que muda é escrever.

drop policy tags_all                on tags;
drop policy pipelines_all           on pipelines;
drop policy pipeline_stages_all     on pipeline_stages;
drop policy document_types_all      on document_types;
drop policy visa_types_all          on visa_types;
drop policy visa_stages_all         on visa_stages;
drop policy visa_type_documents_all on visa_type_documents;
drop policy stage_statuses_all      on stage_statuses;

-- ------------------------------------------------- leitura: qualquer membro

create policy tags_select on tags
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy pipelines_select on pipelines
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy pipeline_stages_select on pipeline_stages
  for select to authenticated
  using (pipeline_id in (
    select id from public.pipelines
    where organization_id in (select private.current_user_organizations())
  ));

create policy document_types_select on document_types
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy visa_types_select on visa_types
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy visa_stages_select on visa_stages
  for select to authenticated
  using (visa_type_id in (
    select id from public.visa_types
    where organization_id in (select private.current_user_organizations())
  ));

-- Depois da 0016 esta tabela tem organização própria, então a policy para de
-- conferir um lado só da relação.
create policy visa_type_documents_select on visa_type_documents
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

create policy stage_statuses_select on stage_statuses
  for select to authenticated
  using (organization_id in (select private.current_user_organizations()));

-- ---------------------------------------- escrita: proprietário e admin

create policy tags_write on tags
  for all to authenticated
  using ((select private.current_user_manages(organization_id)))
  with check ((select private.current_user_manages(organization_id)));

create policy pipelines_write on pipelines
  for all to authenticated
  using ((select private.current_user_manages(organization_id)))
  with check ((select private.current_user_manages(organization_id)));

create policy pipeline_stages_write on pipeline_stages
  for all to authenticated
  using (pipeline_id in (
    select id from public.pipelines
    where (select private.current_user_manages(organization_id))
  ))
  with check (pipeline_id in (
    select id from public.pipelines
    where (select private.current_user_manages(organization_id))
  ));

create policy document_types_write on document_types
  for all to authenticated
  using ((select private.current_user_manages(organization_id)))
  with check ((select private.current_user_manages(organization_id)));

create policy visa_types_write on visa_types
  for all to authenticated
  using ((select private.current_user_manages(organization_id)))
  with check ((select private.current_user_manages(organization_id)));

create policy visa_stages_write on visa_stages
  for all to authenticated
  using (visa_type_id in (
    select id from public.visa_types
    where (select private.current_user_manages(organization_id))
  ))
  with check (visa_type_id in (
    select id from public.visa_types
    where (select private.current_user_manages(organization_id))
  ));

create policy visa_type_documents_write on visa_type_documents
  for all to authenticated
  using ((select private.current_user_manages(organization_id)))
  with check ((select private.current_user_manages(organization_id)));

create policy stage_statuses_write on stage_statuses
  for all to authenticated
  using ((select private.current_user_manages(organization_id)))
  with check ((select private.current_user_manages(organization_id)));
