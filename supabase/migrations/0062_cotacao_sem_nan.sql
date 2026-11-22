-- 0062 — a cotação da forma não aceita NaN (entrega 4a, revisão final)
--
-- `payment_plans.reference_rate` tinha `check (reference_rate > 0)` (0058).
-- Em `numeric`, o Postgres ordena NaN acima de todo número, então o `check`
-- passava, e um membro gravava NaN pela API (`{"reference_rate":"NaN"}`) —
-- a cotação é a coluna que a trava deixa mudar direto. O PostgREST devolve
-- isso como o texto "NaN", a leitura do lead (`formaDoNegocio`) o recusa por
-- esquema, e a tela daquele negócio ficava no aviso de erro até alguém
-- limpar a cotação pela API. A tela nunca produz NaN (`cotacaoSchema`).
--
-- Nenhuma forma existe ainda no banco (a 4a não está no ar), então a troca do
-- `check` não tem linha para conferir.

alter table public.payment_plans
  drop constraint payment_plans_reference_rate_check,
  add constraint payment_plans_reference_rate_check
    check (reference_rate > 0 and reference_rate <> 'NaN'::numeric);
