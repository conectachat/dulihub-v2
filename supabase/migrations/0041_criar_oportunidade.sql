-- 0041 — criar oportunidade, com contato existente ou novo, numa gravação só
--
-- Oportunidade não existe sem contato (CRM-11), e o contato pode nascer junto
-- dela (CRM-12). Spec
-- docs/superpowers/specs/2026-11-17-contato-oportunidade-cliente-design.md,
-- §4.5 e §6.1.
--
-- Decisões:
--
-- - **Uma função, uma transação.** Criar o contato e depois o negócio por
--   duas chamadas deixava um contato órfão quando a segunda falhava (etapa
--   terminal, título vazio). Aqui todas as conferências vêm antes de qualquer
--   gravação, e o que grava, grava junto.
-- - **Devolve `jsonb` e não erro quando precisa perguntar** (spec §4.5):
--   contato parecido (CON-8) e oportunidade anterior do mesmo contato não são
--   falhas, são perguntas. A resposta é `{"situacao":"precisa_confirmar", …}`
--   com a lista, e a tela reenvia com a confirmação. Erro (`P0001`, `42501`)
--   fica para o que não se confirma.
-- - **`security invoker`:** quem decide se a pessoa pode criar contato e
--   negócio naquela organização é a RLS, como em qualquer gravação. A etapa é
--   lida com a RLS de quem chama, e a organização dela tem de ser uma das
--   suas.
-- - **A organização vem do registro-pai:** o contato novo nasce na
--   organização da etapa; o negócio, na da pessoa — que tem de ser a mesma,
--   ou a chave composta recusaria.
-- - Os parâmetros opcionais (contato, contato novo, origem, valor, moeda) vão
--   no fim com `default null`, para os tipos gerados os marcarem como
--   opcionais. A chamada é sempre por nome.
--
-- A ordem das conferências é a do plano de 17/nov:
--   1. exatamente um contato; 2. a etapa (visível, da organização, aberta);
--   3. o título e a moeda; 4. o contato existente (da organização, fora da
--   lixeira); 5. o contato novo (nome, `contato_valido`, parecidos);
--   6. oportunidades anteriores do contato existente.

create function public.criar_oportunidade(
  p_etapa                         uuid,
  p_titulo                        text,
  p_confirmar_contato_parecido    boolean,
  p_confirmar_outra_oportunidade  boolean,
  p_contato                       uuid    default null,
  p_novo_contato                  jsonb   default null,
  p_origem                        text    default null,
  p_valor                         numeric default null,
  p_moeda                         text    default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_novo          jsonb := nullif(p_novo_contato, 'null'::jsonb);
  v_etapa_org     uuid;
  v_funil         uuid;
  v_probabilidade integer;
  v_terminal      boolean;
  v_titulo        text;
  v_origem        text;
  v_moeda         text;
  v_pessoa        uuid;
  v_pessoa_org    uuid;
  v_na_lixeira    boolean;
  v_nome          text;
  v_email         text;
  v_ddi           text;
  v_telefone      text;
  v_erro          text;
  v_parecidos     jsonb;
  v_oportunidades jsonb;
  v_negocio       uuid;
begin
  -- 1. Exatamente um contato.
  if (p_contato is null) = (v_novo is null) then
    raise exception 'Escolha um contato ou preencha um novo' using errcode = 'P0001';
  end if;

  -- 2. A etapa: lida com a RLS de quem chama, de uma organização sua, aberta.
  select s.organization_id, s.pipeline_id, s.probability, (s.is_won or s.is_lost)
  into v_etapa_org, v_funil, v_probabilidade, v_terminal
  from public.pipeline_stages as s
  where s.id = p_etapa;

  if v_etapa_org is null
     or v_etapa_org not in (select private.current_user_organizations())
  then
    raise exception 'Você não tem permissão para isto.' using errcode = '42501';
  end if;

  -- Antes do gatilho da 0038, para a frase chegar inteira à tela.
  if v_terminal then
    raise exception 'Negócio novo começa numa etapa aberta. Para ganhar ou perder, mova o cartão.'
      using errcode = 'P0001';
  end if;

  -- 3. O título, a origem e a moeda.
  v_titulo := private.aparar(p_titulo);
  if v_titulo is null then
    raise exception 'Informe um título' using errcode = 'P0001';
  end if;

  v_origem := private.aparar(p_origem);
  if length(v_titulo) > 200 or length(v_origem) > 200 then
    raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
  end if;

  v_moeda := coalesce(upper(private.aparar(p_moeda)), 'BRL');
  if v_moeda not in ('BRL', 'USD') then
    if p_valor is not null then
      raise exception 'Moeda inválida.' using errcode = 'P0001';
    end if;
    v_moeda := 'BRL';
  end if;

  -- 4. Contato existente: da organização da etapa, fora da lixeira.
  if p_contato is not null then
    select p.organization_id, p.deleted_at is not null
    into v_pessoa_org, v_na_lixeira
    from public.people as p
    where p.id = p_contato;

    if v_pessoa_org is null then
      raise exception 'Contato não encontrado.' using errcode = 'P0001';
    end if;
    if v_pessoa_org <> v_etapa_org then
      raise exception 'O contato não é da organização deste funil.' using errcode = 'P0001';
    end if;
    if v_na_lixeira then
      raise exception 'Este contato está na lixeira. Restaure antes.' using errcode = 'P0001';
    end if;

    v_pessoa := p_contato;
  end if;

  -- 5. Contato novo: nome, e-mail, DDI e telefone válidos; parecidos perguntam.
  if v_novo is not null then
    if jsonb_typeof(v_novo) <> 'object' then
      raise exception 'Contato novo inválido.' using errcode = 'P0001';
    end if;

    v_nome     := private.aparar(v_novo->>'full_name');
    v_email    := private.aparar(v_novo->>'email');
    v_ddi      := private.aparar(v_novo->>'phone_country_code');
    v_telefone := private.aparar(v_novo->>'phone');

    if v_nome is null then
      raise exception 'Informe o nome' using errcode = 'P0001';
    end if;
    if length(v_nome) > 200 or length(v_email) > 200 or length(v_ddi) > 200
       or length(v_telefone) > 200
    then
      raise exception 'Texto longo demais em um dos campos.' using errcode = 'P0001';
    end if;

    v_erro := private.contato_valido(v_email, v_ddi, v_telefone);
    if v_erro is not null then
      raise exception using errcode = 'P0001', message = v_erro;
    end if;

    v_ddi := private.normalizar_ddi(v_ddi);

    if not coalesce(p_confirmar_contato_parecido, false) then
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'nome', c.full_name,
               'estagio', c.lifecycle_stage,
               'na_lixeira', c.na_lixeira,
               'bate_email', c.bate_email,
               'bate_telefone', c.bate_telefone
             ) order by c.full_name, c.id)
      into v_parecidos
      from public.contatos_parecidos(v_email, v_ddi, v_telefone) as c;

      if v_parecidos is not null then
        return jsonb_build_object('situacao', 'precisa_confirmar', 'parecidos', v_parecidos);
      end if;
    end if;
  end if;

  -- 6. Oportunidades anteriores do contato existente: um cliente pode fechar
  --    um visto e depois pedir outro, mas é bom saber antes.
  if v_pessoa is not null and not coalesce(p_confirmar_outra_oportunidade, false) then
    select jsonb_agg(jsonb_build_object(
             'id', o.id,
             'titulo', o.title,
             'status', o.status,
             'criada_em', o.created_at
           ) order by o.created_at desc)
    into v_oportunidades
    from (
      select id, title, status, created_at
      from public.opportunities
      where person_id = v_pessoa
      order by created_at desc
      limit 10
    ) as o;

    if v_oportunidades is not null then
      return jsonb_build_object('situacao', 'precisa_confirmar', 'oportunidades', v_oportunidades);
    end if;
  end if;

  -- Grava: o contato novo, o negócio e a promoção a oportunidade.
  if v_novo is not null then
    insert into public.people
      (organization_id, full_name, email, phone_country_code, phone, lifecycle_stage, created_by)
    values
      (v_etapa_org, v_nome, v_email, v_ddi, v_telefone, 'contact', v_uid)
    returning id into v_pessoa;
  end if;

  insert into public.opportunities
    (organization_id, person_id, pipeline_id, stage_id, title, value, currency, source,
     probability, status, owner_id, created_by)
  values
    (v_etapa_org, v_pessoa, v_funil, p_etapa, v_titulo, p_valor, v_moeda, v_origem,
     v_probabilidade, 'open', v_uid, v_uid)
  returning id into v_negocio;

  -- Quem tem oportunidade deixa de ser simples contato. Cliente não regride.
  update public.people
  set lifecycle_stage = 'opportunity'
  where id = v_pessoa and lifecycle_stage = 'contact';

  return jsonb_build_object('situacao', 'criada', 'negocio', v_negocio, 'pessoa', v_pessoa);
end;
$$;

revoke execute on function public.criar_oportunidade(
  uuid, text, boolean, boolean, uuid, jsonb, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.criar_oportunidade(
  uuid, text, boolean, boolean, uuid, jsonb, text, numeric, text
) to authenticated;
