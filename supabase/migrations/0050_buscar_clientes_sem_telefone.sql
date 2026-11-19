-- 0050 — buscar_clientes: cliente sem telefone fora da busca por dígitos
--
-- Na 0049, o cliente sem telefone virava só o DDI ("55") na comparação, e a
-- busca "55" o trazia — junto com todo brasileiro, o que é esperado, mas ele
-- não tem número nenhum. Agora a comparação por dígitos só olha quem tem
-- telefone. O resto da função é o da 0049; `create or replace` mantém a
-- assinatura e os `grant`.

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
  select
    p.id,
    p.full_name,
    p.email,
    p.phone_country_code,
    p.phone,
    p.owner_id,
    p.client_since,
    count(*) over () as total
  from public.people as p
  cross join termo
  where p.lifecycle_stage = 'client'
    and p.deleted_at is null
    and (
      termo.texto = ''
      or p.full_name ilike '%' || termo.escapado || '%' escape '\'
      or p.email ilike '%' || termo.escapado || '%' escape '\'
      or (
        termo.digitos <> ''
        -- Sem número, nada a comparar: o DDI sozinho ("55") casaria com
        -- qualquer busca por "55".
        and private.telefone_nacional(p.phone_country_code, p.phone) is not null
        and (
          coalesce(
            nullif(regexp_replace(coalesce(p.phone_country_code, ''), '[^0-9]', '', 'g'), ''),
            '55'
          ) || private.telefone_nacional(p.phone_country_code, p.phone)
        ) like '%' || termo.digitos || '%'
      )
    )
  order by p.full_name, p.id
  limit greatest(coalesce(p_limite, 50), 0)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;
