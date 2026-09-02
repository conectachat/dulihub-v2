-- =============================================================================
-- 0009_fix_trigger_search_path — search_path fixo nas funções de gatilho
--
-- Aplicada em 02/set/2026. Corrige lacuna das migrations 0005 e 0008: as duas
-- funções abaixo ficaram sem `search_path` fixo, e o verificador do Supabase
-- apontou (lint 0011).
--
-- Sem search_path fixo, quem controla o search_path da sessão pode desviar a
-- resolução de nomes dentro da função. Nenhuma das duas referencia objeto fora
-- do próprio registro, então vazio é o mais restritivo que ainda funciona.
-- =============================================================================

alter function private.protect_system_statuses()  set search_path = '';
alter function private.protect_terminal_stages()  set search_path = '';
