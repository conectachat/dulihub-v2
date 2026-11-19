-- 0049 — a busca da lista de Clientes (CLI-1)
--
-- `/clientes` lista quem é cliente e está fora da lixeira, em ordem de nome,
-- 50 por página, e acha por nome, e-mail ou telefone. Uma função, e não um
-- `select` do PostgREST, por dois motivos:
--
-- - o telefone se compara pelos **dígitos** (`telefone_nacional`, 0040), com
--   o DDI na frente: "+55 (31) 99999-0000", "31 99999-0000" e "99999" acham o
--   mesmo contato. O PostgREST filtra coluna, não expressão;
-- - a tela precisa do total do filtro ("mostrando 50 de 72", sem corte
--   silencioso — o M1). `count(*) over ()` vem em cada linha, calculado antes
--   do `limit`.
--
-- `security invoker`: quem decide o que aparece é a RLS de `people`, como em
-- qualquer outra leitura da equipe.
--
-- ## A busca
--
-- - Nome e e-mail por `ilike`, com `\`, `%` e `_` escapados: o que se digita
--   é texto, nunca curinga.
-- - O telefone só entra quando a busca não tem letra nem "@": "João 31" é um
--   nome, e não pode trazer todo telefone com "31".
-- - Com `%` na frente nenhum índice serve. Para o volume de hoje (dezenas de
--   clientes por organização) não importa; se crescer, `pg_trgm`.

create function public.buscar_clientes(
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
        and (
          coalesce(
            nullif(regexp_replace(coalesce(p.phone_country_code, ''), '[^0-9]', '', 'g'), ''),
            '55'
          ) || coalesce(private.telefone_nacional(p.phone_country_code, p.phone), '')
        ) like '%' || termo.digitos || '%'
      )
    )
  order by p.full_name, p.id
  limit greatest(coalesce(p_limite, 50), 0)
  offset greatest(coalesce(p_deslocamento, 0), 0)
$$;

comment on function public.buscar_clientes(text, int, int) is
  'Clientes fora da lixeira, por nome, e-mail ou dígitos do telefone, com o total do filtro em cada linha.';

revoke execute on function public.buscar_clientes(text, int, int) from public, anon;
grant execute on function public.buscar_clientes(text, int, int) to authenticated;
