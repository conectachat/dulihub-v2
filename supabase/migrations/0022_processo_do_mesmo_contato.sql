-- 0022 — o negócio do processo é do mesmo contato
--
-- A 0020 ligou processo a negócio com chave composta pela organização: garante
-- que os dois são da mesma casa, não que são da mesma pessoa. O processo da
-- Maria podia apontar para o negócio do João, e o atalho do CRM ("este negócio
-- já tem processo") levaria ao processo errado.
--
-- Duas camadas:
--
-- 1. Gatilho antes de gravar, com mensagem em português — é ela que aparece na
--    tela (`traduzirErro` repassa o texto de P0001).
-- 2. Chave estrangeira composta (negócio, pessoa), que continua valendo depois:
--    se alguém trocar a pessoa do negócio, o banco recusa em vez de deixar o
--    processo órfão de sentido.
--
-- Teste: `tests/rls/processos.test.ts`, "não liga o processo a um negócio de
-- outro contato" — vermelho antes desta migration.

alter table public.opportunities
  add constraint opportunities_id_person_unique unique (id, person_id);

create or replace function private.processo_do_mesmo_contato()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.opportunity_id is not null and not exists (
    select 1 from public.opportunities o
    where o.id = new.opportunity_id and o.person_id = new.person_id
  ) then
    raise exception 'O negócio escolhido é de outro contato.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger projects_processo_do_mesmo_contato
  before insert or update of opportunity_id, person_id on public.projects
  for each row execute function private.processo_do_mesmo_contato();

alter table public.projects
  add constraint projects_opportunity_same_person
    foreign key (opportunity_id, person_id)
    references public.opportunities (id, person_id)
    on delete set null (opportunity_id);
