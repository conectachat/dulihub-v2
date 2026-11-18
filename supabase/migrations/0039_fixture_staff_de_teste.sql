-- Fixture da suíte de RLS: um `staff` da organização de teste.
--
-- Até aqui o único `staff` das contas de teste era o colaborador da Duli
-- (0015). As entregas 3 e 4 do fluxo contato → oportunidade → cliente
-- (spec técnica de 17/nov, §6.0) precisam provar que um membro comum de
-- parceiro, que não é dono, é recusado ao ganhar um negócio, criar processo
-- ou lançar parcela. Sem esta conta, a prova exigiria ganhar um negócio
-- **real** na Duli — e ganhar cria processo e parcelas que não se desfazem.
--
-- ORDEM, como na 0015: `teste-staff@duliconsulting.com` precisa existir em
-- Authentication → Users **antes**, porque a associação é ligada por e-mail
-- (o gatilho `private.handle_new_user` cria o `profiles`). Rodar antes só
-- deixa de criar a associação, sem erro; rodar de novo depois completa.
-- Idempotente de propósito.

insert into organization_members (organization_id, user_id, role)
select (select id from organizations where slug = 'parceiro-teste'), p.id, 'staff'
from profiles p
where p.email = 'teste-staff@duliconsulting.com'
on conflict (organization_id, user_id) do update set role = 'staff';
