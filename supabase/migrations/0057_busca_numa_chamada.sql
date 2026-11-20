-- 0057 — A busca de pessoas numa chamada só (revisão final do Novo cliente)
--
-- A 0055 tirou a regra de busca de `buscar_clientes` para
-- `private.casa_com_a_busca(...)`, um predicado chamado **uma vez por linha**.
-- Com `set search_path` e corpo com CTE, o Postgres não o embute no plano: cada
-- linha pagava uma execução inteira. Medido em 20/nov, com 82 pessoas:
-- `buscar_contatos_para_cliente(org, '')` levava 70 ms, contra 0,28 ms com a
-- mesma regra escrita direto na consulta — e cresce com o cadastro.
--
-- A regra continua num lugar só, mas agora é uma função que devolve as pessoas
-- que casam com a busca (`private.pessoas_da_busca`), chamada **uma vez** por
-- consulta: o termo é calculado uma vez e o filtro roda dentro dela. As duas
-- RPCs filtram o resto (estágio, lixeira, organização, funil) por fora. Sob a
-- RLS de quem chama, como antes. Mesmas assinaturas: os `grant` continuam.

create function private.pessoas_da_busca(p_busca text)
returns setof public.people
language sql
stable
set search_path = ''
as $$
  with termo as (
    select
      t.texto,
      replace(replace(replace(t.texto, '\', '\\'), '%', '\%'), '_', '\_') as escapado,
      case
        when t.texto ~ '[[:alpha:]@]' then ''
        else regexp_replace(t.texto, '[^0-9]', '', 'g')
      end as digitos
    from (select coalesce(private.aparar(p_busca), '') as texto) as t
  )
  select p.*
  from public.people as p
  cross join termo
  where termo.texto = ''
     or p.full_name ilike '%' || termo.escapado || '%' escape '\'
     or p.email ilike '%' || termo.escapado || '%' escape '\'
     or (
       termo.digitos <> ''
       -- Sem número, nada a comparar: o DDI sozinho ("55") casaria com
       -- qualquer busca por "55" (0050).
       and private.telefone_nacional(p.phone_country_code, p.phone) is not null
       and (
         coalesce(
           nullif(regexp_replace(coalesce(p.phone_country_code, ''), '[^0-9]', '', 'g'), ''),
           '55'
         ) || private.telefone_nacional(p.phone_country_code, p.phone)
       ) like '%' || termo.digitos || '%'
     )
$$;

revoke execute on function private.pessoas_da_busca(text) from public, anon;
grant execute on function private.pessoas_da_busca(text) to authenticated;

create or replace function public.buscar_clientes(
  p_busca        text default '',
  p_limite       int  default 50,
  p_deslocamento int  default 0
)
returns table (
  id                 uuid,
  full_name          text,
  email              text,
  phone_country_code text,
  phone              text,
  owner_id           uuid,
  client_since       date,
  total              bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.phone_country_code,
    p.phone,
    p.owner_id,
    p.client_since,
    count(*) over () as total
  from private.pessoas_da_busca(p_busca) as p
  where p.lifecycle_stage = 'client'
    and p.deleted_at is null
  order by p.full_name, p.id
  limit greatest(coalesce(p_limite, 50), 0)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

create or replace function public.buscar_contatos_para_cliente(
  p_organizacao uuid,
  p_busca       text default '',
  p_limite      int  default 20
)
returns table (
  id                 uuid,
  full_name          text,
  email              text,
  phone_country_code text,
  phone              text,
  total              bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.phone_country_code,
    p.phone,
    count(*) over () as total
  from private.pessoas_da_busca(p_busca) as p
  where p.organization_id = p_organizacao
    and p.lifecycle_stage <> 'client'
    and p.deleted_at is null
    -- Quem está no funil é ganho pelo Ganho (CLI-15).
    and not exists (
      select 1 from public.opportunities as o
      where o.person_id = p.id and o.status = 'open'
    )
  order by p.full_name, p.id
  limit greatest(coalesce(p_limite, 20), 0)
$$;

drop function private.casa_com_a_busca(text, text, text, text, text);
