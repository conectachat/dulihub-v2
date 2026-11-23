-- 0063 — valor e cotação não aceitam NaN (depois da entrega 4a)
--
-- A 0062 fechou o NaN na cotação da forma; a mesma falha estava em todo valor
-- que se grava direto pela API. Em `numeric`, o Postgres ordena NaN acima de
-- todo número, então `>= 0` e `> 0` passavam, e o PostgREST aceita o texto
-- "NaN". Na tela, a soma por moeda e o `emReais` virariam NaN, e o espelho do
-- aparelho receberia a linha assim. A tela nunca produz NaN (os esquemas
-- recusam), e nenhuma linha tinha NaN quando esta migration entrou.
--
-- Infinito não precisa de regra: coluna com precisão declarada não o guarda.
--
-- Ficam de fora `payment_plan_parts.total` e `payment_plan_installments.amount`:
-- só a função grava nelas (gatilhos `*_so_pelas_funcoes`), e ela exige número
-- de JSON, que não representa NaN.
--
-- O preço do tipo de visto não tinha `check` nenhum; ganha só o do NaN — a
-- regra de não ser negativo seria decisão nova, não correção.

alter table public.installments
  drop constraint installments_amount_check,
  add constraint installments_amount_check
    check (amount >= 0 and amount <> 'NaN'::numeric),
  drop constraint installments_paid_rate_check,
  add constraint installments_paid_rate_check
    check (paid_rate > 0 and paid_rate <> 'NaN'::numeric);

alter table public.receivables
  drop constraint receivables_amount_check,
  add constraint receivables_amount_check
    check (amount >= 0 and amount <> 'NaN'::numeric),
  drop constraint receivables_list_amount_check,
  add constraint receivables_list_amount_check
    check (list_amount >= 0 and list_amount <> 'NaN'::numeric);

alter table public.opportunity_items
  drop constraint opportunity_items_amount_check,
  add constraint opportunity_items_amount_check
    check (amount >= 0 and amount <> 'NaN'::numeric);

alter table public.visa_types
  add constraint visa_types_base_price_check
    check (base_price <> 'NaN'::numeric);
