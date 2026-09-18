-- Fixture da Fase 2: o "Visto do Parceiro" ganha molde de verdade.
--
-- Dado de teste, na organização de teste (ver 0015). Existe para
-- `tests/rls/processos.test.ts` conferir a cópia do molde contra o banco:
--
--   etapas     Etapa A › Sub-etapa A1, e Etapa B
--   catálogo   Pasta do Parceiro › Meio do Parceiro › Folha do Parceiro,
--              e Opcional do Parceiro na raiz
--   exigidas   Pasta (obrigatória, 10 dias), Folha (obrigatória, sem prazo),
--              Opcional (opcional) — o Meio NÃO é exigido
--
-- O Meio de fora é o ponto do teste: no processo, a Folha tem de subir até a
-- Pasta (o "pai visível"), em vez de sumir ou virar raiz.
--
-- Idempotente.

do $$
declare
  v_org    uuid := (select id from organizations where slug = 'parceiro-teste');
  v_visto  uuid;
  v_pasta  uuid;
  v_meio   uuid;
  v_folha  uuid;
  v_opc    uuid;
  v_etapa  uuid;
begin
  if v_org is null then
    raise notice 'Organização de teste ausente; aplique a 0015 antes.';
    return;
  end if;

  select id into v_visto from visa_types
  where organization_id = v_org and name = 'Visto do Parceiro';

  -- Etapas ----------------------------------------------------------------
  if not exists (select 1 from visa_stages where visa_type_id = v_visto) then
    insert into visa_stages (visa_type_id, name, position)
    values (v_visto, 'Etapa A', 0) returning id into v_etapa;

    insert into visa_stages (visa_type_id, parent_id, name, position)
    values (v_visto, v_etapa, 'Sub-etapa A1', 0);

    insert into visa_stages (visa_type_id, name, position, is_required)
    values (v_visto, 'Etapa B', 1, false);
  end if;

  -- Catálogo --------------------------------------------------------------
  select id into v_pasta from document_types
  where organization_id = v_org and name = 'Pasta do Parceiro';

  select id into v_meio from document_types
  where organization_id = v_org and name = 'Meio do Parceiro';
  if v_meio is null then
    insert into document_types (organization_id, parent_id, name, position)
    values (v_org, v_pasta, 'Meio do Parceiro', 0) returning id into v_meio;
  end if;

  select id into v_folha from document_types
  where organization_id = v_org and name = 'Folha do Parceiro';
  if v_folha is null then
    insert into document_types (organization_id, parent_id, name, position)
    values (v_org, v_meio, 'Folha do Parceiro', 0) returning id into v_folha;
  end if;

  select id into v_opc from document_types
  where organization_id = v_org and name = 'Opcional do Parceiro';
  if v_opc is null then
    insert into document_types (organization_id, name, position)
    values (v_org, 'Opcional do Parceiro', 1) returning id into v_opc;
  end if;

  -- Exigências do visto — sem o Meio, de propósito ------------------------
  insert into visa_type_documents
    (organization_id, visa_type_id, document_type_id, is_required, deadline_days, position)
  values
    (v_org, v_visto, v_pasta, true,  10,   0),
    (v_org, v_visto, v_folha, true,  null, 1),
    (v_org, v_visto, v_opc,   false, null, 2)
  on conflict (visa_type_id, document_type_id) do nothing;
end;
$$;
