-- O cliente lê o próprio histórico. Não o reescreve.
--
-- `notes`, `activities`, `files`, `opportunities` e `person_tags` têm uma
-- policy só, `for all`, e ela passa inteira por `can_access_person`. Essa
-- função é verdadeira em três casos: a organização dona, a organização
-- alocada, e — o terceiro — `people.user_id = auth.uid()`, que é o próprio
-- cliente.
--
-- Ou seja, hoje o cliente pode reescrever e apagar a nota que o consultor
-- escreveu sobre ele, abrir oportunidade em nome próprio, se etiquetar, e
-- mudar a organização dona de qualquer uma dessas linhas. Nada na aplicação
-- impede porque a aplicação nem sabe que esse caminho existe: não há tela de
-- cliente ainda.
--
-- É por isso que se conserta agora. O portal da Fase 6 é o reflexo deste
-- schema; entrar no ar com estas policies seria entregar ao cliente a caneta
-- do consultor.
--
-- Duas camadas, de propósito:
--
--   1. A policy separa leitura de escrita. Ler continua sendo por
--      `can_access_person` — é para isso que o portal existe. Escrever passa a
--      exigir associação à organização dona da linha.
--   2. Um gatilho congela as colunas de vínculo. Ele não é redundante: no dia
--      em que a Fase 6 permitir ao cliente anexar documento, a policy de
--      escrita vai afrouxar de novo, e é o gatilho que continua impedindo a
--      linha de mudar de dono. `people` já tem esse gatilho desde a 0001,
--      pelo mesmo motivo escrito lá: "RLS sozinha NÃO limita quais colunas
--      podem mudar — `with check` só valida a linha resultante".

-- ------------------------------------------------------ 1. leitura × escrita

drop policy notes_all         on notes;
drop policy activities_all    on activities;
drop policy files_all         on files;
drop policy opportunities_all on opportunities;
drop policy person_tags_all   on person_tags;

-- Leitura: quem alcança a pessoa alcança o histórico dela. Inclui o cliente.
create policy notes_select on notes
  for select to authenticated
  using ((select private.can_access_person(person_id)));

create policy activities_select on activities
  for select to authenticated
  using ((select private.can_access_person(person_id)));

create policy files_select on files
  for select to authenticated
  using ((select private.can_access_person(person_id)));

create policy opportunities_select on opportunities
  for select to authenticated
  using ((select private.can_access_person(person_id)));

create policy person_tags_select on person_tags
  for select to authenticated
  using ((select private.can_access_person(person_id)));

-- Escrita: só quem é da organização dona da linha. O cliente não é membro de
-- organização nenhuma — ele chega pelo `people.user_id`, e esse caminho para
-- aqui.
create policy notes_write on notes
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy activities_write on activities
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy files_write on files
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy opportunities_write on opportunities
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy person_tags_write on person_tags
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- ---------------------------------------------------- 2. congelar o vínculo

-- Genérica por `jsonb` em vez de uma função por tabela: as cinco tabelas não
-- têm o mesmo conjunto de colunas — `files` guarda `uploaded_by` onde as
-- outras guardam `created_by`, e `person_tags` não tem nenhuma das duas. Uma
-- função que citasse coluna inexistente quebraria em tempo de execução, na
-- gravação, que é o pior lugar para descobrir.
create or replace function private.guard_child_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antigo jsonb := to_jsonb(old);
  novo   jsonb := to_jsonb(new);
  coluna text;
begin
  -- Equipe da organização dona mexe à vontade: é o trabalho dela.
  if (antigo->>'organization_id')::uuid
     in (select private.current_user_organizations())
  then
    return new;
  end if;

  -- Chegou por outro caminho — hoje só o `people.user_id`, isto é, o cliente.
  -- O conteúdo até pode mudar no dia em que a policy permitir; o vínculo, não.
  foreach coluna in array array[
    'organization_id', 'person_id', 'opportunity_id',
    'created_by', 'uploaded_by', 'tag_id'
  ] loop
    if pg_catalog.jsonb_exists(antigo, coluna) then
      novo := pg_catalog.jsonb_set(novo, array[coluna], antigo->coluna);
    end if;
  end loop;

  return pg_catalog.jsonb_populate_record(new, novo);
end;
$$;

create trigger notes_guard_child_row
  before update on notes
  for each row execute function private.guard_child_row();

create trigger activities_guard_child_row
  before update on activities
  for each row execute function private.guard_child_row();

create trigger files_guard_child_row
  before update on files
  for each row execute function private.guard_child_row();

create trigger opportunities_guard_child_row
  before update on opportunities
  for each row execute function private.guard_child_row();

create trigger person_tags_guard_child_row
  before update on person_tags
  for each row execute function private.guard_child_row();
