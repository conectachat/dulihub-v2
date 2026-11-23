-- Prova do link com a forma (0064, 0065).
--
-- Roda no SQL Editor (ou pelo conector) como `postgres`. Não deixa nada no
-- banco: cada parte é um bloco que termina em `raise exception`, e o erro
-- desfaz a transação inteira. O resultado vem na própria mensagem do erro.
--
-- Por que não está na suíte de RLS: ela entra pela API, que não alcança
-- `private.fim_do_prazo_em_dias_uteis`, e não consegue pôr um link com a forma
-- no passado (o gatilho o congela) — que é como se prova o link vencido.

-- ------------------------------------------------- 1. os dias úteis (0064)
--
-- Esperado: seg=[ok] sex=[ok] sab=[ok] dom=[ok] seg_22h_sp=[ok]

do $$
declare
  r text := '';
  v timestamptz;
begin
  v := private.fim_do_prazo_em_dias_uteis('2026-11-23 12:00-03', 3);
  r := r || 'seg=[' || case when v = '2026-11-27 00:00-03' then 'ok' else v::text end || '] ';

  v := private.fim_do_prazo_em_dias_uteis('2026-11-27 12:00-03', 3);
  r := r || 'sex=[' || case when v = '2026-12-03 00:00-03' then 'ok' else v::text end || '] ';

  v := private.fim_do_prazo_em_dias_uteis('2026-11-28 12:00-03', 3);
  r := r || 'sab=[' || case when v = '2026-12-03 00:00-03' then 'ok' else v::text end || '] ';

  v := private.fim_do_prazo_em_dias_uteis('2026-11-29 12:00-03', 3);
  r := r || 'dom=[' || case when v = '2026-12-03 00:00-03' then 'ok' else v::text end || '] ';

  -- Segunda às 22h em São Paulo já é terça em UTC: conta segunda (foco 3).
  v := private.fim_do_prazo_em_dias_uteis('2026-11-24 01:00+00', 3);
  r := r || 'seg_22h_sp=[' || case when v = '2026-11-27 00:00-03' then 'ok' else v::text end || ']';

  raise exception '%', r;
end;
$$;
