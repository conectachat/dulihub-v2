-- 0027 — organização na própria linha, nas três que faltavam
--
-- `pipeline_stages`, `visa_stages` e `opportunity_products` nunca tiveram
-- `organization_id`: o escopo delas vinha do pai (funil, tipo de visto,
-- oportunidade). Isso contraria a regra do `AGENTS.md` — "todo dado de
-- negócio carrega `organization_id`" — e agora cobra o preço.
--
-- O preço é a lápide (0029). Numa exclusão em cascata, a linha-mãe **já não
-- existe** quando o gatilho da filha roda, então resolver a organização pelo
-- pai devolveria nulo. Lápide sem organização é invisível para a RLS: o
-- aparelho nunca saberia que aquela linha foi apagada, e mostraria offline
-- uma etapa que já não existe.
--
-- Mesmo desenho da 0016: coluna, preenchimento a partir do pai, `not null`,
-- chave composta com o pai (filha de A não entra sob mãe de B) e
-- `unique (id, organization_id)` para quem vier depois referenciar.

-- ------------------------------------------------------- pipeline_stages

alter table public.pipeline_stages add column organization_id uuid;

update public.pipeline_stages s
set organization_id = p.organization_id
from public.pipelines p
where p.id = s.pipeline_id;

alter table public.pipeline_stages alter column organization_id set not null;

-- As chaves `unique (id, organization_id)` das mães (pipelines, visa_types,
-- opportunities) já vieram na 0016; aqui só as filhas ganham as suas.
alter table public.pipeline_stages
  add constraint pipeline_stages_pipeline_same_org
    foreign key (pipeline_id, organization_id)
    references public.pipelines (id, organization_id) on delete cascade,
  add constraint pipeline_stages_id_org_unique unique (id, organization_id);

create index pipeline_stages_org_idx on public.pipeline_stages (organization_id);

-- ---------------------------------------------------------- visa_stages

alter table public.visa_stages add column organization_id uuid;

update public.visa_stages s
set organization_id = v.organization_id
from public.visa_types v
where v.id = s.visa_type_id;

alter table public.visa_stages alter column organization_id set not null;

alter table public.visa_stages
  add constraint visa_stages_visa_same_org
    foreign key (visa_type_id, organization_id)
    references public.visa_types (id, organization_id) on delete cascade,
  add constraint visa_stages_id_org_unique unique (id, organization_id);

create index visa_stages_org_idx on public.visa_stages (organization_id);

-- -------------------------------------------------- opportunity_products

alter table public.opportunity_products add column organization_id uuid;

update public.opportunity_products op
set organization_id = o.organization_id
from public.opportunities o
where o.id = op.opportunity_id;

alter table public.opportunity_products alter column organization_id set not null;

alter table public.opportunity_products
  add constraint opportunity_products_opportunity_same_org
    foreign key (opportunity_id, organization_id)
    references public.opportunities (id, organization_id) on delete cascade,
  add constraint opportunity_products_id_org_unique unique (id, organization_id);

create index opportunity_products_org_idx on public.opportunity_products (organization_id);
