-- 0031 — limpeza diária das lápides
--
-- Retenção de 90 dias (`private.limpar_lapides`, 0029). Sem agendamento a
-- função existiria e ninguém a chamaria, e a tabela cresceria para sempre.
--
-- Quem ficou mais tempo que a retenção sem sincronizar não pode confiar nas
-- lápides — pode ter perdido uma que já expirou. Esse aparelho relê as
-- tabelas inteiras, e quem avisa é o horizonte que o manifesto devolve.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'limpar-lapides',
  '17 4 * * *',
  $$select private.limpar_lapides()$$
);
