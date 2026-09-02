-- =============================================================================
-- 0007_people_legacy_id_full_index — Índice completo no lugar do parcial
--
-- Aplicada no banco em 01/set/2026 como `people_legacy_id_full_index`.
--
-- Corrige a 0006. O índice parcial criado lá impedia o upsert do importador:
-- índice parcial só serve como alvo de ON CONFLICT quando o comando repete o
-- predicado, e o PostgREST não tem como fazer isso. O erro aparecia só na hora
-- de gravar, depois de toda a leitura e fusão terem rodado.
--
-- Índice completo resolve sem custo: no Postgres nulos são distintos entre si
-- num índice único, então pessoas sem legacy_id — as criadas à mão pelo app —
-- continuam podendo ser várias.
-- =============================================================================

drop index if exists people_legacy_id_unique;

create unique index people_legacy_id_unique
  on people (organization_id, legacy_id);
