-- 0043 — telefone antigo sem DDI, e a chave de serviço volta a gravar contato
--
-- Revisão de código de 18/nov (4ª rodada), dois achados nas auxiliares da 0040.
--
-- 1. Telefone sem DDI com o "55" colado. Contato antigo sem DDI gravado e com
--    o número "5531999990000" nunca batia com "+55 / 31999990000": sem DDI,
--    nada era tirado da frente. Sem DDI, o país é o Brasil — o mesmo padrão
--    que a tela usa (`DDI_PADRAO`, "+55"). Com mais de 11 dígitos e começando
--    por 55, o 55 sai. O número nacional brasileiro tem 10 ou 11 dígitos,
--    então nenhum número sem DDI que já batia deixa de bater: a regra continua
--    avisando em mais casos, nunca em menos.
--
-- 2. `service_role`. Os índices `people_email_normalizado` e
--    `people_telefone_nacional` avaliam as auxiliares com o papel de quem
--    grava, e a 0040 só deu `execute` a `authenticated`. Resultado: todo
--    `insert` em `people` com a chave de serviço caía com "permission denied
--    for function aparar" — e todo `update` que mexesse em coluna indexada.
--    Nada no app usa essa chave hoje; um script de correção ou de restauração
--    com ela quebraria no meio do lote. `anon` continua sem: a ficha pública
--    grava por funções `security definer`, que rodam como o dono.
--
-- Mudou `telefone_nacional`: o índice é refeito aqui mesmo (aviso da 0040).

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
         and left(n.digitos, length(n.ddi)) = n.ddi
      then substr(n.digitos, length(n.ddi) + 1)
    when n.ddi = '1' and length(n.digitos) = 11 and left(n.digitos, 1) = '1'
      then substr(n.digitos, 2)
    else n.digitos
  end
  from (
    select
      regexp_replace(coalesce(numero, ''), '[^0-9]', '', 'g') as digitos,
      -- Sem DDI, o país é o Brasil (0043).
      coalesce(nullif(regexp_replace(coalesce(ddi, ''), '[^0-9]', '', 'g'), ''), '55') as ddi
  ) as n
$$;

-- `create or replace` mantém os privilégios; repetidos para quem lê só este
-- arquivo.
revoke execute on function private.telefone_nacional(text, text) from public, anon;
grant execute on function private.telefone_nacional(text, text) to authenticated;

grant execute on function private.espaco() to service_role;
grant execute on function private.aparar(text) to service_role;
grant execute on function private.normalizar_ddi(text) to service_role;
grant execute on function private.telefone_nacional(text, text) to service_role;
grant execute on function private.contato_valido(text, text, text) to service_role;

reindex index public.people_telefone_nacional;

-- A migration se confere: sem o `grant`, para aqui em vez de deixar o defeito
-- calado até o dia do script.
do $$
begin
  assert has_function_privilege('service_role', 'private.aparar(text)', 'execute')
     and has_function_privilege('service_role', 'private.espaco()', 'execute')
     and has_function_privilege('service_role', 'private.normalizar_ddi(text)', 'execute')
     and has_function_privilege('service_role', 'private.telefone_nacional(text, text)', 'execute')
     and has_function_privilege('service_role', 'private.contato_valido(text, text, text)', 'execute'),
    'service_role sem execute nas auxiliares do contato';
  assert private.telefone_nacional(null, '55 31 99999-0000') = '31999990000',
    'sem DDI, o 55 colado não saiu';
  assert private.telefone_nacional(null, '(31) 99999-0000') = '31999990000',
    'sem DDI, o número nacional mudou';
  assert private.telefone_nacional('+1', '1 (305) 555-0111') = '3055550111',
    'o número americano da 0042 mudou';
end;
$$;
