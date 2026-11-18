-- 0042 — o número americano colado com o "1" do país também é o mesmo telefone
--
-- Revisão de código de 18/nov (I3). A 0040 tira o DDI da frente do número só
-- quando ele tem mais de 11 dígitos — o que cobre o Brasil ("55" + 10 ou 11) e
-- quase todo o resto, mas não os EUA: "+1 (305) 555-0111", colado do WhatsApp,
-- vira 11 dígitos ("13055550111") e não batia com o "(305) 555-0111" gravado.
-- Para uma consultoria de imigração americana, é o país que mais aparece.
--
-- Código de área americano (NANP) nunca começa por 0 nem por 1: com DDI 1 e 11
-- dígitos começando por 1, o "1" é sempre o do país. A regra continua avisando
-- em mais casos, nunca em menos.
--
-- A função é usada pelo índice `people_telefone_nacional`: mudou a função, o
-- índice é refeito aqui mesmo (o comentário da 0040 já avisava).

create or replace function private.telefone_nacional(ddi text, numero text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when n.digitos = '' then null
    when length(n.digitos) > 11
         and n.ddi <> ''
         and left(n.digitos, length(n.ddi)) = n.ddi
      then substr(n.digitos, length(n.ddi) + 1)
    when n.ddi = '1' and length(n.digitos) = 11 and left(n.digitos, 1) = '1'
      then substr(n.digitos, 2)
    else n.digitos
  end
  from (
    select
      regexp_replace(coalesce(numero, ''), '[^0-9]', '', 'g') as digitos,
      regexp_replace(coalesce(ddi, ''), '[^0-9]', '', 'g') as ddi
  ) as n
$$;

-- `create or replace` mantém os privilégios da 0040; repetidos para quem lê só
-- este arquivo.
revoke execute on function private.telefone_nacional(text, text) from public, anon;
grant execute on function private.telefone_nacional(text, text) to authenticated;

reindex index public.people_telefone_nacional;
