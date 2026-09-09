-- Fixture da suíte de RLS: uma segunda organização, de verdade.
--
-- A promessa de "usuário da organização A não enxerga dado da organização B"
-- está escrita no plano desde o primeiro dia e nunca foi verificada por nada
-- além de inspeção manual em 4 das 14 tabelas, uma vez. O motivo é banal: com
-- uma organização só no banco, não existe isolamento a testar.
--
-- Esta migration cria a segunda. Ela fica permanente e é dado de teste, não de
-- negócio — daí o nome explícito. O Renato é membro root e enxerga a
-- organização na lista, mas não é membro dela: nenhum contato, tag ou visto
-- daqui aparece nas telas dele.
--
-- ORDEM: os três usuários precisam existir em Authentication → Users **antes**
-- desta migration, porque as associações são ligadas por email — o gatilho
-- `private.handle_new_user` cria o `profiles` correspondente. Rodar antes só
-- deixa de criar as associações, sem erro; rodar de novo depois completa.
-- Tudo aqui é idempotente de propósito.
--
--   teste-parceiro@duliconsulting.com     dono da organização parceira
--   teste-colaborador@duliconsulting.com  colaborador da Duli, sem papel de gestão
--   teste-cliente@duliconsulting.com      cliente do portal, sem associação nenhuma

-- ---------------------------------------------------------------- organização

insert into organizations (slug, name, type, legal_name)
values (
  'parceiro-teste',
  'Parceiro de Teste',
  'partner',
  'Organização usada pela suíte de RLS. Não é cliente real.'
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- associações

-- Dono da parceira. É o contraponto do Renato: mesma capacidade dentro da
-- organização dele, nenhuma fora.
insert into organization_members (organization_id, user_id, role)
select (select id from organizations where slug = 'parceiro-teste'), p.id, 'owner'
from profiles p
where p.email = 'teste-parceiro@duliconsulting.com'
on conflict (organization_id, user_id) do update set role = 'owner';

-- Colaborador da Duli. Papel `staff` de propósito: é ele quem prova que a
-- configuração passou a exigir papel de gestão.
insert into organization_members (organization_id, user_id, role)
select (select id from organizations where slug = 'duli'), p.id, 'staff'
from profiles p
where p.email = 'teste-colaborador@duliconsulting.com'
on conflict (organization_id, user_id) do update set role = 'staff';

-- O cliente **não** recebe associação nenhuma. Ele alcança dado pelo
-- `people.user_id`, que é o caminho do portal da Fase 6 — e é justamente esse
-- caminho que precisa ser estreito.

-- ------------------------------------------------------------- dado da parceira

insert into people (organization_id, full_name, email, lifecycle_stage, user_id)
select
  (select id from organizations where slug = 'parceiro-teste'),
  'Cliente de Teste',
  'teste-cliente@duliconsulting.com',
  'client',
  (select id from profiles where email = 'teste-cliente@duliconsulting.com')
where not exists (
  select 1 from people
  where organization_id = (select id from organizations where slug = 'parceiro-teste')
    and full_name = 'Cliente de Teste'
);

-- Mantém o vínculo em dia se a pessoa já existia de uma execução anterior,
-- feita antes de o usuário ser criado.
update people
set user_id = (select id from profiles where email = 'teste-cliente@duliconsulting.com')
where organization_id = (select id from organizations where slug = 'parceiro-teste')
  and full_name = 'Cliente de Teste'
  and user_id is null;

insert into tags (organization_id, name, color)
select (select id from organizations where slug = 'parceiro-teste'), 'Tag do Parceiro', '#022b64'
on conflict (organization_id, lower(name)) do nothing;

insert into visa_types (organization_id, name, description)
select
  (select id from organizations where slug = 'parceiro-teste'),
  'Visto do Parceiro',
  'Existe para a suíte conferir que a Duli não enxerga o catálogo alheio.'
on conflict (organization_id, lower(name)) do nothing;

insert into document_types (organization_id, name, position)
select (select id from organizations where slug = 'parceiro-teste'), 'Pasta do Parceiro', 0
where not exists (
  select 1 from document_types
  where organization_id = (select id from organizations where slug = 'parceiro-teste')
    and name = 'Pasta do Parceiro'
);

-- A nota que o consultor escreve sobre o cliente. É a linha do teste que mais
-- importa: hoje a policy de `notes` passa só por `can_access_person`, que é
-- verdadeira para o próprio cliente — então ele pode reescrever e apagar o que
-- foi escrito sobre ele, e mudar a organização dona da linha.
insert into notes (organization_id, person_id, body, created_by)
select
  (select id from organizations where slug = 'parceiro-teste'),
  pe.id,
  'Nota escrita pelo consultor. O cliente não pode reescrever nem apagar.',
  (select id from profiles where email = 'teste-parceiro@duliconsulting.com')
from people pe
where pe.organization_id = (select id from organizations where slug = 'parceiro-teste')
  and pe.full_name = 'Cliente de Teste'
  and not exists (
    select 1 from notes n where n.person_id = pe.id
  );
