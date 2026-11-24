-- 0069 — Fixture da suíte de RLS: a organização que faz o papel da Duli nos
-- testes de cliente de parceiro, e a conta que trabalha nela.
--
-- Por que não as contas que já existem (desenho de 24/nov, §6, e as duas
-- revisões):
-- - a `teste-parceiro` só enxerga a própria organização, e
--   `tests/rls/espelho.test.ts` exige isso;
-- - a `teste-colaborador`, com uma segunda organização, quebraria o CRM em
--   silêncio: `getBoard` e a Configuração procuram o funil padrão sem filtrar
--   pela organização atual e passariam a achar dois, com a fumaça verde.
--
-- O arranjo, sem policy nova:
-- - a "Executora de Teste" (`executora-teste`, `partner`, `is_test`) é onde
--   moram os clientes de parceiro dos testes;
-- - a `teste-executora` é `admin` dela e `staff` da `parceiro-teste` — é essa
--   associação que a deixa ler o parceiro (0003);
-- - a associação à executora é a mais antiga, com data explícita: as duas
--   nascem na mesma transação, com o mesmo `now()`, e `escolherOrganizacao`
--   desempata pela mais antiga;
-- - o parceiro dos clientes de teste é a `parceiro-teste`. Os membros dela
--   (`teste-parceiro`, `teste-staff`) não são da executora: é o que prova que
--   o vínculo não dá acesso nenhum (PAR-10).
--
-- ORDEM, como na 0039: `teste-executora@duliconsulting.com` precisa existir
-- em Authentication → Users **antes**, porque as associações se ligam por
-- e-mail (o gatilho `private.handle_new_user` cria o `profiles`). Rodar antes
-- só deixa de criar as associações, sem erro; rodar de novo depois completa.
-- Idempotente de propósito.

insert into organizations
  (slug, name, type, is_test, legal_name, address_country, email, phone_country_code, phone)
values (
  'executora-teste',
  'Executora de Teste',
  'partner',
  true,
  'Organização usada pela suíte de RLS no papel da Duli. Não é cliente real.',
  'Brasil',
  'executora-teste@duliconsulting.com',
  '+55',
  '11999990001'
)
on conflict (slug) do nothing;

insert into organization_members (organization_id, user_id, role, created_at)
select (select id from organizations where slug = 'executora-teste'), p.id, 'admin',
       now() - interval '1 minute'
from profiles p
where p.email = 'teste-executora@duliconsulting.com'
on conflict (organization_id, user_id) do update set role = 'admin';

insert into organization_members (organization_id, user_id, role, created_at)
select (select id from organizations where slug = 'parceiro-teste'), p.id, 'staff', now()
from profiles p
where p.email = 'teste-executora@duliconsulting.com'
on conflict (organization_id, user_id) do update set role = 'staff';
