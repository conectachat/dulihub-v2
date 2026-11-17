-- 0038 — negócio novo nasce aberto
--
-- Revisão de novembro, G5. "Adicionar" na coluna Ganho do quadro criava o
-- negócio já ganho: o contato virava cliente sem a confirmação do Ganho e sem
-- linha no histórico. Na coluna Perdido, perdido sem motivo.
--
-- A tela e a ação já não oferecem etapa terminal na criação. Aqui o banco
-- recusa também, para quem chamar a API direto: ganhar e perder são
-- movimentos de um negócio que existe (`mover.ts`), com confirmação, motivo
-- e histórico — nunca o jeito de nascer.
--
-- Sem usuário (`auth.uid()` nulo) passa: é o dono do banco importando
-- histórico, não uma chamada pela API.

create or replace function private.negocio_nasce_aberto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.status <> 'open' or exists (
    select 1
    from public.pipeline_stages s
    where s.id = new.stage_id
      and (s.is_won or s.is_lost)
  ) then
    raise exception 'Negócio novo começa numa etapa aberta. Para ganhar ou perder, mova o cartão.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.negocio_nasce_aberto() from public, anon, authenticated;

drop trigger if exists opportunities_nasce_aberto on public.opportunities;
create trigger opportunities_nasce_aberto
  before insert on public.opportunities
  for each row execute function private.negocio_nasce_aberto();
