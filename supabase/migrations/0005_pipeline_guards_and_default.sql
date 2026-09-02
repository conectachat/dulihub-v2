-- =============================================================================
-- 0005_pipeline_guards_and_default — Travas do funil e funil padrão
--
-- Aplicada no banco em 01/set/2026 como `pipeline_guards_and_default`.
-- =============================================================================

-- No máximo uma etapa de ganho e uma de perda por funil. Sem isso o cálculo
-- de conversão fica ambíguo: com duas etapas de ganho não dá para dizer
-- quantos negócios fecharam.
create unique index pipeline_stages_one_won  on pipeline_stages (pipeline_id) where is_won;
create unique index pipeline_stages_one_lost on pipeline_stages (pipeline_id) where is_lost;

-- Etapas terminais podem ser renomeadas, nunca excluídas: o funil depende
-- delas para saber onde a oportunidade encerra. A trava fica no banco e não
-- só na tela, para valer mesmo que algo passe por fora da interface.
create or replace function private.protect_terminal_stages()
returns trigger language plpgsql as $$
begin
  if old.is_won or old.is_lost then
    raise exception 'Etapa de ganho ou perda não pode ser excluída. Renomeie se precisar.'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger pipeline_stages_protect_terminal
  before delete on pipeline_stages
  for each row execute function private.protect_terminal_stages();

-- Funil padrão da Duli: só o começo e os dois fins.
--
-- Ganho e perdido ficam em 98 e 99 de propósito — assim qualquer etapa nova
-- cabe antes delas sem precisar reordenar o funil inteiro.
insert into pipelines (organization_id, name, is_default, position)
select id, 'Funil de vendas', true, 0 from organizations where slug = 'duli'
on conflict do nothing;

insert into pipeline_stages (pipeline_id, name, position, probability, is_won, is_lost)
select p.id, v.name, v.position, v.probability, v.is_won, v.is_lost
from pipelines p
cross join (values
  ('Novo Lead', 0, 10,  false, false),
  ('Ganho',    98, 100, true,  false),
  ('Perdido',  99, 0,   false, true )
) as v(name, position, probability, is_won, is_lost)
where p.is_default
  and p.organization_id = (select id from organizations where slug = 'duli');
