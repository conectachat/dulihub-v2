-- Prova do vínculo do cliente de parceiro entre o real e o teste (0070,
-- PAR-9, critério 10).
--
-- Roda no SQL Editor (ou pelo conector) como `postgres`. Não deixa nada no
-- banco: tudo acontece num bloco que termina em `raise exception`, e o erro
-- desfaz a transação inteira — o parceiro "Prova…", o cliente criado na Duli,
-- o histórico. O resultado vem na própria mensagem do erro.
--
-- Por que não está na suíte de RLS: provar "cliente real não aponta para
-- parceiro de teste" pede um cliente na Duli e um parceiro real, e as contas
-- de teste não gravam na Duli nem criam parceiro. A suíte prova o resto
-- (`tests/rls/cliente-de-parceiro.test.ts`).
--
-- Esperado depois da 0070, numa linha:
--   teste_do_real=[Parceiro não encontrado.] real=[criado]
--   real_do_teste=[Parceiro não encontrado.]

do $$
declare
  v_dono uuid; v_duli uuid; v_teste uuid; v_executora uuid; v_real uuid;
  r_teste_do_real text; r_real text; r_real_do_teste text;
begin
  perform set_config('lock_timeout', '3s', true);

  select id into v_duli from public.organizations where type = 'root';
  select id into v_teste from public.organizations where slug = 'parceiro-teste';
  select id into v_executora from public.organizations where slug = 'executora-teste';
  select m.user_id into v_dono
  from public.organization_members m
  where m.organization_id = v_duli and m.role = 'owner'
  order by m.created_at limit 1;

  -- O dono da raiz, como pela API.
  perform set_config('request.jwt.claim.sub', v_dono::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.organizations
    (name, type, address_country, email, phone_country_code, phone)
  values ('Prova Parceiro Real', 'partner', 'Brasil', 'prova-real@exemplo.com', '+55', '11999990009')
  returning id into v_real;

  -- Cliente real (da Duli) apontando para o parceiro de teste.
  begin
    perform public.criar_cliente(v_duli, null, '{"full_name": "Prova cliente da Duli"}'::jsonb, false, v_teste);
    r_teste_do_real := 'passou';
  exception when others then r_teste_do_real := sqlerrm;
  end;

  -- Cliente real apontando para o parceiro real: nasce.
  begin
    select public.criar_cliente(v_duli, null, '{"full_name": "Prova cliente real"}'::jsonb, false, v_real)->>'situacao'
      into r_real;
  exception when others then r_real := sqlerrm;
  end;

  -- Cliente de teste apontando para o parceiro real. Como `postgres`, sem
  -- usuário: a conferência do alvo vale também aí.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    insert into public.people (organization_id, full_name, partner_organization_id)
    values (v_executora, 'Prova cliente de teste', v_real);
    r_real_do_teste := 'passou';
  exception when others then r_real_do_teste := sqlerrm;
  end;

  raise exception 'PROVA teste_do_real=[%] real=[%] real_do_teste=[%]',
    r_teste_do_real, r_real, r_real_do_teste;
end $$;
