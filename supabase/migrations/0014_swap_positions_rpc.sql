-- =============================================================================
-- 0014 — Reordenar vira uma operação só, atômica
--
-- A troca de posição existia em CINCO cópias na aplicação, em duas versões
-- incompatíveis: três passavam por uma posição sentinela `-1` para evitar
-- colisão, duas trocavam direto. Nenhuma das cinco tinha transação.
--
-- Sem transação, falhar no passo do meio deixa a linha **presa em `-1` para
-- sempre**: ela pula para o topo da lista, e o botão de subir fica desabilitado
-- justamente porque ela é a primeira — não há caminho de volta pela tela.
--
-- Isso ficaria pior, não melhor, com a Etapa 2: passar a mostrar "não foi
-- possível salvar" seria meia-verdade, porque metade da gravação valeu.
--
-- Aqui os três passos rodam dentro de uma função, logo numa transação só: ou
-- valem todos, ou nenhum. Precedente na própria base: `set_default_stage_status`
-- virou RPC na 0010 exatamente por isto.
--
-- `security invoker` de propósito — a RLS continua valendo, ninguém reordena o
-- que não pode ver. A lista fixa de tabelas fecha a porta que o `format(%I)`
-- abriria: sem ela, o nome da tabela vem do cliente.
-- =============================================================================
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
    'visa_stages', 'visa_type_documents'
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

revoke execute on function public.swap_positions(text, uuid, uuid) from public, anon;
grant execute on function public.swap_positions(text, uuid, uuid) to authenticated;
