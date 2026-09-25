-- 0033 — a receber: cobrança do cliente e suas parcelas
--
-- Primeiro corte da Fase 3. O portão da fase é fechar um mês inteiro no app,
-- sem planilha, e isto é a metade que o Renato toca todo dia: quanto cada
-- cliente deve, em quantas vezes, quando vence e o que já entrou.
--
-- **A cobrança é do cliente, não do processo** (decisão do Renato, 25/set).
-- O app antigo começou por processo e depois migrou tudo para o cliente. O
-- `project_id` fica aqui, anulável, só para dizer de onde a cobrança veio —
-- apagar o processo não apaga o que foi combinado.
--
-- Quatro decisões, todas vindas de um defeito observado no app antigo:
--
-- 1. **A moeda mora na cobrança, e a parcela herda.** Lá a parcela guardava
--    só um número, e toda a tela formatava R$ fixo: um caso em dólar aparecia
--    rotulado como real.
-- 2. **A cotação fica na parcela paga, não no cabeçalho.** O que entrou no
--    caixa depende do dia em que entrou. Guardar a cotação no cabeçalho faz
--    todo o histórico mudar quando o dólar muda.
-- 3. **Nenhum saldo guardado.** Lá `valor_pago` e `valor_pendente` são
--    colunas mantidas por gatilho, e divergem. Aqui se soma das parcelas,
--    como `opportunity_count` já é somado das oportunidades.
-- 4. **Nenhuma coluna de status.** `paga`, `vencida` e `pendente` saem de
--    `paid_on` e `due_on`. Estado guardado é estado que envelhece: o app
--    antigo tem `atrasado` no enum e nada nunca escreve lá.
--
-- Isolamento no mesmo desenho da 0016 e da 0020: `organization_id` em tudo e
-- chaves compostas. O caso que a chave barra não é invasão — é a cobrança
-- nascer carimbada com a organização de quem clicou em vez da do cliente.
-- Essa linha sai válida, e a RLS não recusa nada.
--
-- Quem lê e grava: qualquer membro da organização, como nos processos. O
-- cliente ganha leitura na Fase 6, com o portal.

-- ---------------------------------------------------------------- receivables

create table receivables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id       uuid not null,

  -- De onde veio. Anulável e sem cascade: apagar o processo não apaga o que
  -- foi combinado com o cliente.
  project_id      uuid,

  title           text not null check (length(trim(title)) > 0),

  -- O que o cliente paga. `list_amount` é o valor antes do desconto, e o
  -- desconto é a diferença entre os dois — sem enum de "percentual ou valor",
  -- que no app antigo virou duas colunas para guardar uma conta já feita.
  amount          numeric(14,2) not null check (amount >= 0),
  list_amount     numeric(14,2) check (list_amount >= 0),
  currency        char(3) not null default 'BRL' check (currency in ('BRL', 'USD')),

  notes           text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),

  constraint receivables_person_same_org
    foreign key (person_id, organization_id)
    references people (id, organization_id) on delete cascade,

  constraint receivables_project_same_org
    foreign key (project_id, organization_id)
    references projects (id, organization_id) on delete set null (project_id),

  -- Desconto é abater, não aumentar.
  constraint receivables_desconto_coerente
    check (list_amount is null or list_amount >= amount)
);

create index receivables_org_idx    on receivables (organization_id);
create index receivables_person_idx on receivables (person_id);

create trigger receivables_set_updated_at
  before update on receivables
  for each row execute function private.set_updated_at();

comment on table receivables is
  'Cobrança do cliente. A moeda mora aqui; as parcelas herdam.';
comment on column receivables.list_amount is
  'Valor antes do desconto. O desconto é a diferença para amount.';

-- --------------------------------------------------------------- installments

create table installments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  receivable_id   uuid not null,

  number          integer not null check (number > 0),
  amount          numeric(14,2) not null check (amount >= 0),
  due_on          date not null,

  -- A baixa: quando entrou e, em dólar, por quanto estava o câmbio naquele
  -- dia. Sem `paid_on`, `paid_rate` não faz sentido — e em real ele é nulo.
  paid_on         date,
  paid_rate       numeric(14,6) check (paid_rate > 0),

  method          text not null default 'pix'
                  check (method in ('pix', 'boleto', 'cartao', 'transferencia', 'cripto')),

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, organization_id),
  -- Duas parcelas 3 na mesma cobrança seriam duas cobranças contadas como uma.
  unique (receivable_id, number),

  constraint installments_receivable_same_org
    foreign key (receivable_id, organization_id)
    references receivables (id, organization_id) on delete cascade,

  constraint installments_cotacao_exige_pagamento
    check (paid_rate is null or paid_on is not null)
);

create index installments_cobranca_idx on installments (receivable_id, number);
-- A consulta do dia a dia: o que vence, e o que venceu.
create index installments_vencimento_idx on installments (organization_id, due_on)
  where paid_on is null;

create trigger installments_set_updated_at
  before update on installments
  for each row execute function private.set_updated_at();

comment on table installments is
  'Parcelas da cobrança. Sem coluna de status: paga, vencida e pendente saem de paid_on e due_on.';
comment on column installments.paid_rate is
  'Cotação do dia do pagamento, em reais por 1 da moeda da cobrança. Nula quando já é real.';

-- ------------------------------------------------------------------------ RLS

alter table receivables  enable row level security;
alter table installments enable row level security;

create policy receivables_all on receivables
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

create policy installments_all on installments
  for all to authenticated
  using (organization_id in (select private.current_user_organizations()))
  with check (organization_id in (select private.current_user_organizations()));

-- ------------------------------------------------------ o espelho precisa ver

-- Lápides (0029): sem elas, cobrança apagada no escritório continua na tela
-- de quem está viajando. É fácil esquecer, e não faz barulho nenhum.
create trigger receivables_marcar_lapide
  after delete on receivables
  for each row execute function private.marcar_lapide();

create trigger installments_marcar_lapide
  after delete on installments
  for each row execute function private.marcar_lapide();

-- Manifesto (0030, corrigido na 0032): a lista de tabelas é codificada dentro
-- da função. Tabela de fora dela é puxada e **nunca conferida** — um furo de
-- marca d'água vira dado errado permanente no aparelho.
create or replace function public.sync_manifesto()
returns table (tabela text, linhas bigint, maximo_updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t text;
begin
  foreach t in array array[
    'activities', 'document_files', 'document_types', 'files', 'installments',
    'notes', 'opportunities', 'opportunity_products', 'organization_members',
    'people', 'person_tags', 'pipeline_stages', 'pipelines', 'products',
    'project_documents', 'project_pages', 'project_stages', 'projects',
    'receivables', 'stage_statuses', 'tags', 'visa_stages',
    'visa_type_documents', 'visa_types'
  ]
  loop
    return query execute format(
      'select %L::text, count(*)::bigint, max(updated_at) from public.%I', t, t);
  end loop;

  return query
    select 'deleted_rows'::text, count(*)::bigint, min(deleted_at)
    from public.deleted_rows;
end;
$$;
