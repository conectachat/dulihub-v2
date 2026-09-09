-- Organização nova nasce utilizável.
--
-- O funil padrão e os três status de fábrica foram semeados uma vez, com
-- `where slug = 'duli'` escrito na migration (0005 e 0008). Vale para a Duli e
-- para mais ninguém: uma organização parceira criada hoje nasce sem funil, sem
-- etapa e sem status de etapa.
--
-- Não é falha cosmética. `createOpportunity` exige um `stage_id` existente, e
-- a tela do funil monta as colunas a partir das etapas — então o parceiro
-- entra num quadro sem coluna nenhuma e não consegue criar negócio. O primeiro
-- parceiro descobriria isso sozinho, no primeiro dia.
--
-- A semente vira função, e um gatilho a chama no `insert`. As três etapas e os
-- três status de fábrica são os mesmos de sempre; o que muda é quem os recebe.
--
-- Idempotente: não toca em organização que já tem funil, e os status entram
-- com `on conflict do nothing`. A Duli, que renomeou "Pendente" para "A Fazer"
-- e criou dois status próprios, fica exatamente como está.

create or replace function private.seed_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline
  from public.pipelines
  where organization_id = p_org and is_default
  limit 1;

  -- O funil só nasce se não houver nenhum padrão. Recriar aqui duplicaria a
  -- estrutura de quem já organizou o próprio funil.
  if v_pipeline is null then
    insert into public.pipelines (organization_id, name, is_default, position)
    values (p_org, 'Funil de vendas', true, 0)
    returning id into v_pipeline;

    -- Só as três de fábrica. As do meio quem cria é quem conhece o processo —
    -- decisão registrada quando o funil foi desenhado.
    insert into public.pipeline_stages
      (pipeline_id, name, position, probability, is_won, is_lost)
    values
      (v_pipeline, 'Novo Lead',  0, 10,  false, false),
      (v_pipeline, 'Ganho',     98, 100, true,  false),
      (v_pipeline, 'Perdido',   99, 0,   false, true);
  end if;

  insert into public.stage_statuses
    (organization_id, code, label, color, position, is_default, is_done, is_system)
  select p_org, v.code, v.label, v.color, v.position, v.is_default, v.is_done, true
  from (values
    ('pending',     'Pendente',     '#8a97aa', 0, true,  false),
    ('in_progress', 'Em andamento', '#1f5aa8', 1, false, false),
    ('done',        'Concluído',    '#0e7c6b', 2, false, true )
  ) as v(code, label, color, position, is_default, is_done)
  on conflict (organization_id, code) do nothing;
end;
$$;

comment on function private.seed_organization(uuid) is
  'Estrutura mínima de uma organização: funil padrão, três etapas e três status de etapa. Idempotente.';

create or replace function private.seed_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_organization(new.id);
  return new;
end;
$$;

create trigger organizations_seed
  after insert on organizations
  for each row execute function private.seed_new_organization();

-- Alcança quem já existe. Hoje só a Duli, e nela não muda nada — é a prova de
-- que a função é idempotente, rodando contra dado real antes de rodar contra
-- organização nova.
select private.seed_organization(id) from organizations;
