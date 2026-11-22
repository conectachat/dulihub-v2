-- Prova da trava `payment_plans_so_pelas_funcoes` (0058, 0060, 0061).
--
-- Roda no SQL Editor (ou pelo conector) como `postgres`. Não deixa nada no
-- banco: tudo acontece num bloco que termina em `raise exception`, e o erro
-- desfaz a transação inteira — a pessoa, o negócio, a forma, a tabela e os
-- gatilhos temporários, e até a coluna de teste. O resultado vem na própria
-- mensagem do erro. Usa a organização de teste (`parceiro-teste`).
--
-- Por que não está na suíte de RLS: ela entra como usuário autenticado, que
-- não cria gatilho, não acrescenta coluna nem exclui usuário — e a liberação
-- da 0060 só existe dentro de gatilho (a ação da chave estrangeira quando o
-- usuário é excluído). A suíte prova o outro lado: pela API, a trava recusa.
--
-- Esperado depois da 0061, numa linha:
--   api_created_by=[Mude…] api_cotacao=[passou] api_status=[Mude…]
--   fk=[passou] fk_valor=[nulo] gatilho_forjado=[Mude…] coluna_nova=[Mude…]

do $$
declare
  v_org uuid; v_user uuid; v_pessoa uuid; v_funil uuid; v_etapa uuid; v_neg uuid; v_plano uuid;
  r_api_dono text; r_api_cotacao text; r_api_status text; r_fk text; r_fk_valor text;
  r_forjado text; r_coluna text;
begin
  -- O `alter table` lá embaixo pede trava exclusiva: ao lado de uma transação
  -- longa, a prova desiste em 3 s em vez de enfileirar as leituras do lead.
  perform set_config('lock_timeout', '3s', true);

  select id into v_org from public.organizations where slug = 'parceiro-teste';
  select user_id into v_user from public.organization_members
   where organization_id = v_org order by created_at limit 1;
  insert into public.people (organization_id, full_name, lifecycle_stage)
    values (v_org, 'Prova da trava da forma (desfeita)', 'opportunity') returning id into v_pessoa;
  select s.pipeline_id, s.id into v_funil, v_etapa
    from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id
   where p.organization_id = v_org and not s.is_won and not s.is_lost
   order by s.position limit 1;
  insert into public.opportunities (organization_id, person_id, pipeline_id, stage_id, title)
    values (v_org, v_pessoa, v_funil, v_etapa, 'Prova da trava da forma') returning id into v_neg;
  perform set_config('dulihub.via_forma', 'on', true);
  insert into public.payment_plans (organization_id, opportunity_id, created_by)
    values (v_org, v_neg, v_user) returning id into v_plano;
  perform set_config('dulihub.via_forma', 'off', true);

  -- Fora de gatilho, como pela API: só a cotação muda.
  begin
    update public.payment_plans set created_by = null where id = v_plano;
    r_api_dono := 'passou';
  exception when others then r_api_dono := sqlerrm; end;
  begin
    update public.payment_plans set reference_rate = 5.4321, reference_rate_note = 'C6' where id = v_plano;
    r_api_cotacao := 'passou';
  exception when others then r_api_cotacao := sqlerrm; end;
  begin
    update public.payment_plans set status = 'confirmada' where id = v_plano;
    r_api_status := 'passou';
  exception when others then r_api_status := sqlerrm; end;

  -- Dentro de gatilho, como a ação da chave estrangeira do usuário excluído.
  create temp table prova_fk (id uuid);
  create function pg_temp.anular() returns trigger language plpgsql as $f$
  begin update public.payment_plans set created_by = null where id = new.id; return new; end $f$;
  create trigger anular after insert on prova_fk for each row execute function pg_temp.anular();
  begin
    insert into prova_fk values (v_plano);
    r_fk := 'passou';
  exception when others then r_fk := sqlerrm; end;
  select coalesce(created_by::text, 'nulo') into r_fk_valor from public.payment_plans where id = v_plano;

  -- Dentro de gatilho, mexendo em mais que `created_by`: recusado.
  perform set_config('dulihub.via_forma', 'on', true);
  update public.payment_plans set created_by = v_user where id = v_plano;
  perform set_config('dulihub.via_forma', 'off', true);
  create temp table prova_forjada (id uuid);
  create function pg_temp.forjar() returns trigger language plpgsql as $f$
  begin
    update public.payment_plans set status = 'confirmada', created_by = null where id = new.id;
    return new;
  end $f$;
  create trigger forjar after insert on prova_forjada for each row execute function pg_temp.forjar();
  begin
    insert into prova_forjada values (v_plano);
    r_forjado := 'passou';
  exception when others then r_forjado := sqlerrm; end;

  -- Uma coluna que a forma ganhe depois (a 4b, por exemplo) nasce protegida.
  alter table public.payment_plans add column prova_coluna_nova text;
  begin
    execute 'update public.payment_plans set prova_coluna_nova = ''x'' where id = $1' using v_plano;
    r_coluna := 'passou';
  exception when others then r_coluna := sqlerrm; end;

  raise exception 'PROVA api_created_by=[%] api_cotacao=[%] api_status=[%] fk=[%] fk_valor=[%] gatilho_forjado=[%] coluna_nova=[%]',
    r_api_dono, r_api_cotacao, r_api_status, r_fk, r_fk_valor, r_forjado, r_coluna;
end $$;
