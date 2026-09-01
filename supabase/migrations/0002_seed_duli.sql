-- =============================================================================
-- 0002_seed_duli — Organização raiz e primeiro administrador
--
-- Rodar DEPOIS de:
--   1. aplicar 0001_core.sql
--   2. criar o usuário no painel: Authentication > Users > Add user
--      (o gatilho on_auth_user_created cria o profile sozinho)
--
-- ANTES DE RODAR: troque o email abaixo pelo seu.
-- =============================================================================

-- Organização raiz. Só pode existir uma — o índice parcial
-- organizations_single_root garante isso.
insert into organizations (slug, name, type, legal_name, primary_color, secondary_color)
values (
  'duli',
  'Duli Consulting',
  'root',
  'Duli Consulting',
  '#022b64',   -- azul oficial
  '#FF6600'    -- laranja oficial
)
on conflict (slug) do nothing;

-- Vincula o usuário criado no painel como owner da Duli.
-- >>> TROQUE O EMAIL ABAIXO <<<
insert into organization_members (organization_id, user_id, role)
select
  (select id from organizations where slug = 'duli'),
  p.id,
  'owner'
from profiles p
where p.email = 'TROQUE_PELO_SEU_EMAIL@duliconsulting.com'
on conflict (organization_id, user_id) do update set role = 'owner';

-- Conferência: deve devolver uma linha com a Duli e o papel owner.
select
  o.name        as organizacao,
  o.type        as tipo,
  p.email       as usuario,
  m.role        as papel
from organization_members m
join organizations o on o.id = m.organization_id
join profiles p      on p.id = m.user_id;
