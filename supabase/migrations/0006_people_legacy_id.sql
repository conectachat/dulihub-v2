-- =============================================================================
-- 0006_people_legacy_id — Rastreio da origem na importação
--
-- Aplicada no banco em 01/set/2026 como `people_legacy_id`.
-- =============================================================================

-- Guarda o id que a pessoa tinha no app antigo.
--
-- Serve para dois fins: a importação pode rodar quantas vezes for preciso sem
-- duplicar (faz upsert por esta chave), e depois da virada dá para rastrear
-- qualquer registro até a origem quando algo parecer errado.
alter table people add column legacy_id text;

create unique index people_legacy_id_unique
  on people (organization_id, legacy_id)
  where legacy_id is not null;

comment on column people.legacy_id is
  'ID de origem no DuliHub antigo, prefixado pela tabela: contact:<uuid>, lead:<uuid> ou client:<uuid>.';
