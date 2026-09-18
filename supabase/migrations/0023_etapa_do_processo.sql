-- 0023 — etapa do processo editável
--
-- O Renato viu a aba Etapas e pediu o que o app antigo tinha: data prevista
-- por etapa, conclusão com data, e reordenar/criar/renomear etapa dentro do
-- processo.
--
-- 1. `due_on`: data prevista. Nasce vazia ("Definir data") — decidido em
--    18/set; o `estimated_days` do molde continua só como referência.
-- 2. `swap_positions` ganha `project_stages`, para os botões de subir e
--    descer. Criar e apagar etapa já eram permitidos pela RLS da 0020.
--
-- Testes: `tests/rls/processos.test.ts`, "etapas editadas no processo" —
-- vermelhos antes desta migration.

alter table public.project_stages add column due_on date;

comment on column public.project_stages.due_on is
  'Data prevista da etapa, definida à mão no processo.';

create or replace function public.swap_positions(
  p_tabela text,
  p_a uuid,
  p_b uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pos_a integer;
  v_pos_b integer;
begin
  if p_tabela not in (
    'pipeline_stages', 'stage_statuses', 'document_types',
    'visa_stages', 'visa_type_documents', 'project_stages'
  ) then
    raise exception 'Tabela não permitida para reordenação.'
      using errcode = 'check_violation';
  end if;

  execute format('select position from public.%I where id = $1', p_tabela)
    into v_pos_a using p_a;
  execute format('select position from public.%I where id = $1', p_tabela)
    into v_pos_b using p_b;

  -- Nulo aqui é as duas coisas ao mesmo tempo: não existe, ou a RLS escondeu.
  -- Nos dois casos a resposta é a mesma, e nenhuma delas é "deu certo".
  if v_pos_a is null or v_pos_b is null then
    raise exception 'Registro não encontrado, ou sem permissão para reordenar.'
      using errcode = 'no_data_found';
  end if;

  execute format('update public.%I set position = -1 where id = $1', p_tabela)
    using p_a;
  execute format('update public.%I set position = $2 where id = $1', p_tabela)
    using p_b, v_pos_a;
  execute format('update public.%I set position = $2 where id = $1', p_tabela)
    using p_a, v_pos_b;
end;
$$;
