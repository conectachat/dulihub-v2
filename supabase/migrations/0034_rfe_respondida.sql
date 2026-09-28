-- 0034 — quando a RFE foi respondida
--
-- O processo guardava quando a RFE chegou (`rfe_received_on`) e o prazo dela
-- (`rfe_due_on`), mas não quando a resposta foi enviada. Faltava pouco até a
-- tela Início passar a avisar de prazo de RFE: sem esta data, o alerta
-- continuaria gritando depois da resposta enviada, até alguém preencher a
-- decisão — e alerta que grita à toa é alerta que se aprende a ignorar, o que
-- é pior do que não ter alerta nenhum.
--
-- Não mexe em policy: a coluna herda a RLS da tabela.

alter table public.projects
  add column rfe_answered_on date;

-- Responder antes de receber é erro de digitação, e esconderia o prazo.
alter table public.projects
  add constraint projects_rfe_respondida_depois
  check (
    rfe_answered_on is null
    or rfe_received_on is null
    or rfe_answered_on >= rfe_received_on
  );

comment on column public.projects.rfe_answered_on is
  'Quando a resposta à RFE foi enviada. Com ela preenchida, o prazo da RFE sai dos alertas.';
