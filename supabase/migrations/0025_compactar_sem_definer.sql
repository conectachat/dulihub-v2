-- 0025 — compactar_pagina sem `security definer`
--
-- A 0024 fez a compactação com `security definer` porque nenhuma policy deixa
-- apagar pedaço de edição. O verificador de segurança do Supabase acusou: toda
-- função definer exposta é uma porta que ignora a RLS, e a checagem de
-- organização feita à mão dentro dela é a única coisa entre um usuário e a
-- página de outro.
--
-- Agora a função roda como quem chama (`security invoker`), e a RLS vale
-- inteira. Para apagar pedaço existe uma policy que exige, além da
-- organização, a marca `app.compactando` ligada **nesta transação** — e só a
-- função a liga (`set_config(..., true)`, local à transação). O PostgREST não
-- deixa o cliente rodar `set_config`, então apagar solto continua recusado.
--
-- Testes: os de `tests/rls/paginas.test.ts` continuam valendo sem mudança —
-- "não se apaga direto", "compactar apaga só os incluídos", "a Duli não
-- compacta a página do parceiro".

create policy project_page_updates_delete_compactando on public.project_page_updates
  for delete to authenticated
  using (
    organization_id in (select private.current_user_organizations())
    and current_setting('app.compactando', true) = 'on'
  );

create or replace function public.compactar_pagina(
  p_page     uuid,
  p_snapshot bytea,
  p_ate      bigint,
  p_content  jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A RLS de `project_pages` esconde a página alheia: zero linhas aqui é
  -- "não existe ou não é sua", e as duas respostas são a mesma.
  update public.project_pages
  set snapshot   = p_snapshot,
      content    = p_content,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = p_page;

  if not found then
    raise exception 'Página não encontrada.' using errcode = 'P0002';
  end if;

  perform set_config('app.compactando', 'on', true);

  delete from public.project_page_updates
  where page_id = p_page and id <= p_ate;

  perform set_config('app.compactando', 'off', true);
end;
$$;
