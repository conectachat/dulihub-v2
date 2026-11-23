-- 0066 — a resposta do cliente cai junto com o link (entrega 4b)
--
-- A 0058 ligou `payment_plan_responses.registration_form_id` ao link da ficha
-- com a ação padrão (`no action`), pensando na resposta da equipe, que não tem
-- link. Com a resposta do cliente (0065), apagar a pessoa passou a falhar: a
-- cascata apaga o link pela pessoa e a resposta pelo negócio, e o Postgres
-- confere a chave do link antes de a outra cascata chegar à resposta —
-- "violates foreign key constraint payment_plan_responses_form_same_org".
-- A suíte da 4b achou isso quando a limpeza das pessoas de teste falhou.
--
-- `on delete cascade`: o link com a forma só se apaga pela cascata da pessoa
-- (o gatilho `registration_forms_link_com_a_forma` recusa o resto, 0064), e
-- nessa hora a forma e as respostas vão junto de qualquer jeito. A resposta
-- continua sem mudar e sem se apagar fora da cascata
-- (`payment_plan_responses_nao_mudam`, que deixa passar a profundidade > 1).

alter table public.payment_plan_responses
  drop constraint payment_plan_responses_form_same_org,
  add constraint payment_plan_responses_form_same_org
    foreign key (registration_form_id, organization_id)
    references public.registration_forms (id, organization_id)
    on delete cascade;
