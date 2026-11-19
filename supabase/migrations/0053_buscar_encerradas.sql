-- 0053 — buscar_encerradas (entrega 3, fase 1; CRM-16)
--
-- Ganhas e perdidas saem do quadro depois de 30 dias e são achadas em
-- CRM › Encerradas. A busca é por título **ou** pelo nome do contato, o que o
-- PostgREST não faz numa consulta só (o `or` não atravessa a tabela
-- embutida); e a lista precisa do total do filtro ("mostrando 50 de 72") e
-- dos totais por moeda dos itens. Daí a função, como a `buscar_clientes`
-- (0049).
--
-- `security invoker`: a RLS de quem chama decide o que aparece. `%` e `_`
-- são literais. A soma é por moeda, nunca uma na outra.

create function public.buscar_encerradas(
  p_busca        text default '',
  p_situacao     text default null,
  p_limite       int  default 50,
  p_deslocamento int  default 0
)
returns table (
  id        uuid,
  title     text,
  status    text,
  closed_at timestamptz,
  person_id uuid,
  full_name text,
  totais    jsonb,
  total     bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_texto    text := coalesce(private.aparar(p_busca), '');
  v_escapado text;
begin
  if p_situacao is not null and p_situacao not in ('won', 'lost') then
    raise exception 'Situação inválida: use won ou lost.' using errcode = '22023';
  end if;

  v_escapado := replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select
    o.id,
    o.title,
    o.status::text,
    o.closed_at,
    o.person_id,
    p.full_name,
    coalesce((
      select jsonb_agg(jsonb_build_object('currency', x.moeda, 'amount', x.soma) order by x.moeda)
      from (
        select i.currency::text as moeda, sum(i.amount) as soma
        from public.opportunity_items i
        where i.opportunity_id = o.id
        group by i.currency
      ) as x
    ), '[]'::jsonb),
    count(*) over ()
  from public.opportunities as o
  join public.people as p on p.id = o.person_id
  where o.status in ('won', 'lost')
    and (p_situacao is null or o.status::text = p_situacao)
    and (
      v_texto = ''
      or o.title ilike '%' || v_escapado || '%' escape '\'
      or p.full_name ilike '%' || v_escapado || '%' escape '\'
    )
  order by o.closed_at desc nulls last, o.id
  limit greatest(coalesce(p_limite, 50), 0)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end;
$$;

revoke execute on function public.buscar_encerradas(text, text, int, int) from public, anon;
grant execute on function public.buscar_encerradas(text, text, int, int) to authenticated;

comment on function public.buscar_encerradas(text, text, int, int) is
  'CRM › Encerradas (CRM-16): ganhas e perdidas, busca por título ou contato, filtro won/lost, total do filtro e totais por moeda.';
