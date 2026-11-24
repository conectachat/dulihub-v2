-- Prova do cadastro de parceiro pelo dono da Duli (0068, PAR-4, critério 1).
--
-- Roda no SQL Editor (ou pelo conector) como `postgres`. Não deixa nada no
-- banco: tudo acontece num bloco que termina em `raise exception`, e o erro
-- desfaz a transação inteira — os parceiros "Prova…", o funil e os status que
-- a semente criou para eles. O resultado vem na própria mensagem do erro.
--
-- Por que não está na suíte de RLS: nenhuma conta de teste é dona da raiz, e
-- só o dono da raiz cria organização (0036). Aqui o dono é simulado: o bloco
-- assume o papel `authenticated` com o `sub` dele, e a RLS e os gatilhos
-- decidem como decidiriam pela API. A suíte prova o outro lado: quem não é
-- dono é recusado (`tests/rls/parceiros.test.ts`).
--
-- Esperado depois da 0068, numa linha:
--   ok=[passou] slug=[prova-thais] slug2=[prova-thais-2] simbolos=[parceiro…]
--   ddi=[+1] semente=[1/3/3] sem_pais=[Informe o país.]
--   email=[E-mail inválido] repetido=[Já existe um parceiro com esse nome.]

do $$
declare
  v_dono uuid; v_org uuid;
  r_ok text; r_slug text; r_slug2 text; r_simbolos text; r_ddi text; r_semente text;
  r_sem_pais text; r_email text; r_repetido text;
begin
  perform set_config('lock_timeout', '3s', true);

  select m.user_id into v_dono
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where o.type = 'root' and m.role = 'owner'
  order by m.created_at limit 1;

  -- O dono da raiz, como pela API.
  perform set_config('request.jwt.claim.sub', v_dono::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    insert into public.organizations
      (name, type, address_country, email, phone_country_code, phone)
    values ('Prova Thaís', 'partner', 'Estados Unidos', 'prova@exemplo.com', '1', '3055550100')
    returning id, slug, phone_country_code into v_org, r_slug, r_ddi;
    r_ok := 'passou';
  exception when others then r_ok := sqlerrm;
  end;

  begin
    insert into public.organizations
      (name, type, address_country, email, phone_country_code, phone)
    values ('Prova Thaís!', 'partner', 'Estados Unidos', 'prova2@exemplo.com', '+1', '3055550101')
    returning slug into r_slug2;
  exception when others then r_slug2 := sqlerrm;
  end;

  begin
    insert into public.organizations
      (name, type, address_country, email, phone_country_code, phone)
    values ('!!!', 'partner', 'Brasil', 'prova3@exemplo.com', '+55', '11999990002')
    returning slug into r_simbolos;
  exception when others then r_simbolos := sqlerrm;
  end;

  begin
    insert into public.organizations
      (name, type, email, phone_country_code, phone)
    values ('Prova sem país', 'partner', 'prova4@exemplo.com', '+1', '3055550102');
    r_sem_pais := 'passou';
  exception when others then r_sem_pais := sqlerrm;
  end;

  begin
    insert into public.organizations
      (name, type, address_country, email, phone_country_code, phone)
    values ('Prova e-mail', 'partner', 'Brasil', 'x', '+55', '11999990003');
    r_email := 'passou';
  exception when others then r_email := sqlerrm;
  end;

  begin
    insert into public.organizations
      (name, type, address_country, email, phone_country_code, phone)
    values ('prova thaís', 'partner', 'Brasil', 'prova5@exemplo.com', '+55', '11999990004');
    r_repetido := 'passou';
  exception when others then r_repetido := sqlerrm;
  end;

  -- A semente se confere como `postgres`: o dono da raiz não é membro da
  -- organização nova, e o funil só se lê por associação (0018).
  execute 'reset role';
  select
    (select count(*) from public.pipelines where organization_id = v_org and is_default)
    || '/' ||
    (select count(*) from public.pipeline_stages where organization_id = v_org)
    || '/' ||
    (select count(*) from public.stage_statuses where organization_id = v_org)
  into r_semente;

  raise exception 'PROVA ok=[%] slug=[%] slug2=[%] simbolos=[%] ddi=[%] semente=[%] sem_pais=[%] email=[%] repetido=[%]',
    r_ok, r_slug, r_slug2, r_simbolos, r_ddi, r_semente, r_sem_pais, r_email, r_repetido;
end $$;
