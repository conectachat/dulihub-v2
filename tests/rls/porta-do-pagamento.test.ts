// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACEITE, anonimoDeTeste, fichaCompleta } from "../ficha-de-teste";
import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * A porta do pagamento (0065; FIC-8, FIC-9): o cliente, sem login, abre o link
 * da ficha com a forma de pagamento, manda os dados (no modo `completa`), vê
 * a forma e responde Confirmo ou Há algo errado.
 *
 * É a terceira função anônima do app (`responder_forma_de_pagamento`), com as
 * travas da 0035: o token é a única chave, tem prazo, a linha é travada, e do
 * navegador chegam só sim, não e o motivo. A cópia da resposta é montada no
 * banco, pela mesma função que mostra a forma ao cliente.
 *
 * Tudo em pessoas descartáveis da organização de teste, apagadas no fim.
 */

const s = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

const INDISPONIVEL = "Este link não está mais disponível.";
const NOTA = `C6 nota ${s}`;

const HISTORICO = {
  confirmada: "Forma de pagamento confirmada pelo cliente",
  recusada: "Forma de pagamento recusada pelo cliente",
  ajustada: "Forma de pagamento ajustada",
};

function hojeMais(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** A forma do critério da 4b: US$ 2.100 de entrada + cartão de US$ 3.900 em reais. */
const CRITERIO = () => ({
  partes: [
    {
      label: "Entrada",
      method: "transferencia",
      currency: "USD",
      total: 2100,
      installments_count: 1,
      usd_equivalent: null,
      parcelas: [{ number: 1, amount: 2100, due_on: hojeMais(10) }],
    },
    {
      label: "Cartão",
      method: "cartao",
      currency: "BRL",
      total: 21527.76,
      installments_count: 1,
      usd_equivalent: 3900,
      parcelas: [{ number: 1, amount: 21527.76, due_on: hojeMais(15) }],
    },
  ],
});

type Abertura = {
  situacao: string;
  nome: string | null;
  organizacao: string;
  modo: string;
  tem_forma: boolean;
  forma: { vistos: unknown[]; partes: { label: string; usd_equivalent: number | null }[] } | null;
};

describe("a porta do pagamento (0065)", { timeout: 60_000 }, () => {
  let parceiro: Cliente;
  let staff: Cliente;
  const anon = anonimoDeTeste();
  let parceiroId: string;
  let org: string;
  let nomeDaOrganizacao: string;
  let funilId: string;
  let primeiraAberta: string;
  let perdaId: string;
  let vistoId: string;
  const criadas: string[] = [];
  let contador = 0;

  async function novaPessoa(): Promise<{ id: string; nome: string }> {
    contador += 1;
    const nome = `Porta ${s} ${contador}`;
    const { data, error } = await parceiro
      .from("people")
      .insert({ organization_id: org, full_name: nome, lifecycle_stage: "opportunity" })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    criadas.push(data.id);
    return { id: data.id, nome };
  }

  async function formaDo(negocioId: string) {
    const { data, error } = await parceiro
      .from("payment_plans")
      .select("id, status, updated_at")
      .eq("opportunity_id", negocioId)
      .maybeSingle();
    if (error) throw new Error(`Forma ilegível: ${error.message}`);
    return data;
  }

  const salvar = (negocioId: string) =>
    parceiro.rpc("salvar_forma_de_pagamento", { p_negocio: negocioId, p_forma: CRITERIO() as never });

  async function enviar(negocioId: string) {
    const versao = (await formaDo(negocioId))!.updated_at;
    const { data, error } = await parceiro.rpc("enviar_forma_de_pagamento", {
      p_negocio: negocioId,
      p_versao: versao,
    });
    if (error) throw new Error(`Forma não enviada: ${error.message}`);
    return data as string;
  }

  /** Pessoa, negócio com um visto, a forma do critério (com a cotação anotada) e o envio. */
  async function enviada(pessoa?: { id: string; nome: string }) {
    const p = pessoa ?? (await novaPessoa());
    const { data: negocio, error } = await parceiro
      .from("opportunities")
      .insert({
        organization_id: org,
        person_id: p.id,
        pipeline_id: funilId,
        stage_id: primeiraAberta,
        title: `Porta ${s}`,
        owner_id: parceiroId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Negócio não criado: ${error.message}`);
    const item = await parceiro.from("opportunity_items").insert({
      organization_id: org,
      opportunity_id: negocio.id,
      visa_type_id: vistoId,
      visa_name: "EB-2 NIW",
      amount: 6000,
      currency: "USD",
    });
    if (item.error) throw new Error(`Visto não criado: ${item.error.message}`);
    expect((await salvar(negocio.id)).error).toBeNull();
    const forma = (await formaDo(negocio.id))!;
    // A cotação anotada pela equipe: o cliente nunca a vê.
    await parceiro.from("payment_plans").update({ reference_rate: 5.52, reference_rate_note: NOTA }).eq("id", forma.id);
    const token = await enviar(negocio.id);
    return { pessoa: p, negocio: negocio.id, plano: forma.id, token };
  }

  /** O mesmo, com os dados pessoais já enviados: o cliente está no pagamento. */
  async function noPagamento() {
    const base = await enviada();
    const nomeDaFicha = `${base.pessoa.nome} ficha`;
    const { error } = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: base.token,
      p_dados: fichaCompleta(nomeDaFicha),
      p_consentimento: ACEITE,
    });
    if (error) throw new Error(`Dados não enviados: ${error.message}`);
    return { ...base, nomeDaFicha };
  }

  async function abrir(token: string): Promise<Abertura | null> {
    const { data, error } = await anon.rpc("abrir_ficha_de_cadastro", { p_token: token });
    if (error) throw new Error(`Link ilegível: ${error.message}`);
    return (data?.[0] as Abertura | undefined) ?? null;
  }

  const responder = (token: string, aceita: boolean, motivo?: string) =>
    anon.rpc("responder_forma_de_pagamento", {
      p_token: token,
      p_aceita: aceita,
      ...(motivo === undefined ? {} : { p_motivo: motivo }),
    });

  async function respostasDa(planoId: string) {
    const { data, error } = await parceiro
      .from("payment_plan_responses")
      .select("decision, reason, answered_by, answered_by_name, registration_form_id, snapshot")
      .eq("plan_id", planoId);
    if (error) throw new Error(`Respostas ilegíveis: ${error.message}`);
    return data;
  }

  async function linkDo(token: string) {
    const { data, error } = await parceiro
      .from("registration_forms")
      .select("id, submitted_at, closed_at, reviewed_at, mode")
      .eq("token", token)
      .single();
    if (error) throw new Error(`Link ilegível: ${error.message}`);
    return data;
  }

  async function historico(pessoaId: string) {
    const { data, error } = await parceiro.from("activities").select("description").eq("person_id", pessoaId);
    if (error) throw new Error(`Histórico ilegível: ${error.message}`);
    return data.map((a) => a.description);
  }

  /** A busca da Início: ficha recebida e não conferida. */
  async function aConferir(pessoaId: string) {
    const { data, error } = await parceiro
      .from("registration_forms")
      .select("id")
      .eq("person_id", pessoaId)
      .not("submitted_at", "is", null)
      .is("reviewed_at", null);
    if (error) throw new Error(`Fichas ilegíveis: ${error.message}`);
    return data;
  }

  beforeAll(async () => {
    [parceiro, staff] = await Promise.all([entrarComo("parceiro"), entrarComo("staff")]);
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;
    org = (await fixture(parceiro)).organization_id;

    const { data: organizacao } = await parceiro.from("organizations").select("name").eq("id", org).single();
    nomeDaOrganizacao = organizacao!.name;

    const { data: funil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    funilId = funil!.id;
    const { data: etapas } = await parceiro
      .from("pipeline_stages")
      .select("id, is_won, is_lost, position")
      .eq("pipeline_id", funilId);
    primeiraAberta = etapas!
      .filter((e) => !e.is_won && !e.is_lost)
      .sort((a, b) => a.position - b.position)[0]!.id;
    perdaId = etapas!.find((e) => e.is_lost)!.id;

    const { data: visto } = await parceiro.from("visa_types").select("id").eq("name", "Visto do Parceiro").maybeSingle();
    if (!visto) throw new Error("Visto da fixture não existe. Aplique a 0021.");
    vistoId = visto.id;
  }, 60_000);

  afterAll(async () => {
    // A limpeza não falha calada: foi assim que a pessoa com resposta do
    // cliente, que não se apagava, passou despercebida.
    if (!criadas.length) return;
    const { error } = await parceiro.from("people").delete().in("id", criadas);
    if (error) throw new Error(`Pessoas descartáveis não apagadas: ${error.message}`);
  });

  it("antes dos dados: aberta, com a forma a seguir, e só nome e contato", async () => {
    const { pessoa, token } = await enviada();
    const aberta = await abrir(token);
    expect(aberta).toMatchObject({
      situacao: "aberta",
      nome: pessoa.nome,
      modo: "completa",
      tem_forma: true,
      forma: null,
    });
  });

  it("os dados entram, o link continua aberto, e a próxima abertura é o pagamento", async () => {
    const { pessoa, token } = await noPagamento();

    const link = await linkDo(token);
    expect(link.submitted_at).not.toBeNull();
    expect(link.closed_at).toBeNull();
    // O aviso "ficha recebida" da Início.
    expect(await aConferir(pessoa.id)).toHaveLength(1);

    const pagamento = await abrir(token);
    expect(pagamento!.situacao).toBe("aguardando_pagamento");
    expect(pagamento!.forma!.vistos).toEqual([{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }]);
    expect(pagamento!.forma!.partes.map((p) => [p.label, p.usd_equivalent])).toEqual([
      ["Entrada", null],
      ["Cartão", 3900],
    ]);
  });

  it("a resposta da porta nunca traz cotação, documento ou endereço", async () => {
    const proibido = [
      "reference_rate",
      NOTA,
      "5.52",
      "529.982.247-25",
      "52998224725",
      "1234567",
      "Rua da Filosofia",
    ];
    const conferir = (abertura: Abertura | null) => {
      const texto = JSON.stringify(abertura);
      for (const p of proibido) expect(texto, p).not.toContain(p);
    };

    const aberta = await enviada();
    conferir(await abrir(aberta.token));

    const pagando = await noPagamento();
    conferir(await abrir(pagando.token));
    expect((await responder(pagando.token, true)).error).toBeNull();
    conferir(await abrir(pagando.token));

    const cancelada = await noPagamento();
    await parceiro.rpc("voltar_forma_para_rascunho", { p_negocio: cancelada.negocio, p_de: "enviada" });
    const situacao = await abrir(cancelada.token);
    expect(situacao!.situacao).toBe("cancelada");
    conferir(situacao);
  });

  it("Confirmo: a forma confirma, a prova guarda o que o cliente viu, o link fecha", async () => {
    const { pessoa, plano, token, nomeDaFicha } = await noPagamento();
    const viu = (await abrir(token))!.forma;

    expect((await responder(token, true, "ignorado")).error).toBeNull();

    expect((await formaDo((await parceiro.from("payment_plans").select("opportunity_id").eq("id", plano).single()).data!.opportunity_id))!.status).toBe("confirmada");
    const [resposta] = await respostasDa(plano);
    const link = await linkDo(token);
    expect(resposta).toMatchObject({
      decision: "confirmada",
      reason: null,
      answered_by: null,
      answered_by_name: nomeDaFicha,
      registration_form_id: link.id,
    });
    expect(resposta!.snapshot).toEqual(viu);
    expect(link.closed_at).not.toBeNull();
    expect(await historico(pessoa.id)).toContain(HISTORICO.confirmada);

    expect((await abrir(token))!.situacao).toBe("respondida");
    expect((await responder(token, true)).error?.message).toBe(INDISPONIVEL);
  });

  it("Há algo errado: o motivo aparado fica, e os dados pessoais também", async () => {
    const { pessoa, negocio, plano, token } = await noPagamento();
    expect((await responder(token, false, "  O valor da entrada está errado  ")).error).toBeNull();

    expect((await formaDo(negocio))!.status).toBe("recusada");
    const [resposta] = await respostasDa(plano);
    expect(resposta).toMatchObject({ decision: "recusada", reason: "O valor da entrada está errado" });
    expect(await historico(pessoa.id)).toContain(`${HISTORICO.recusada}: O valor da entrada está errado`);

    const { data: dados } = await parceiro.from("people").select("tax_id").eq("id", pessoa.id).single();
    expect(dados!.tax_id).not.toBeNull();
  });

  it("motivo só com espaços vira nulo; com 501 caracteres, é recusado (foco 5)", async () => {
    const vazio = await noPagamento();
    expect((await responder(vazio.token, false, "   ")).error).toBeNull();
    expect((await respostasDa(vazio.plano))[0]!.reason).toBeNull();
    expect(await historico(vazio.pessoa.id)).toContain(HISTORICO.recusada);

    const longo = await noPagamento();
    expect((await responder(longo.token, false, "x".repeat(501))).error?.message).toBe(
      "O motivo vai até 500 caracteres.",
    );
    expect(await respostasDa(longo.plano)).toHaveLength(0);
    expect((await formaDo(longo.negocio))!.status).toBe("enviada");
  });

  it("reenviar depois da recusa: só o pagamento, sem aceitar dados; a ficha recebida fica (I4)", async () => {
    const { pessoa, negocio, token } = await noPagamento();
    expect((await responder(token, false, "Datas erradas")).error).toBeNull();

    expect(
      (await staff.rpc("voltar_forma_para_rascunho", { p_negocio: negocio, p_de: "recusada" })).error,
    ).toBeNull();
    expect((await formaDo(negocio))!.status).toBe("rascunho");
    expect(await historico(pessoa.id)).toContain(HISTORICO.ajustada);

    expect((await salvar(negocio)).error).toBeNull();
    const novo = await enviar(negocio);
    expect((await linkDo(novo)).mode).toBe("so_pagamento");
    expect(await abrir(novo)).toMatchObject({ situacao: "aguardando_pagamento", modo: "so_pagamento" });

    const { data: antes } = await parceiro.from("people").select("full_name").eq("id", pessoa.id).single();
    const dados = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: novo,
      p_dados: fichaCompleta("Outro nome"),
      p_consentimento: ACEITE,
    });
    expect(dados.error?.message).toBe(INDISPONIVEL);
    const { data: depois } = await parceiro.from("people").select("full_name").eq("id", pessoa.id).single();
    expect(depois!.full_name).toBe(antes!.full_name);

    // A ficha do primeiro link continua esperando o Conferi, que passa pela API.
    const recebidas = await aConferir(pessoa.id);
    expect(recebidas).toHaveLength(1);
    const conferi = await staff
      .from("registration_forms")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("id", recebidas[0]!.id)
      .select("id");
    expect(conferi.data).toHaveLength(1);
    expect(await aConferir(pessoa.id)).toHaveLength(0);
  });

  it("Confirmo em duas abas: uma grava, a outra é recusada, e fica uma resposta (foco 4)", async () => {
    const { plano, token } = await noPagamento();
    const [a, b] = await Promise.all([responder(token, true), responder(token, true)]);
    const erros = [a.error?.message ?? null, b.error?.message ?? null];
    expect(erros).toContain(null);
    expect(erros).toContain(INDISPONIVEL);
    expect(await respostasDa(plano)).toHaveLength(1);
  });

  it("tokens que não gravam: inventado, cancelado, de negócio perdido, de pessoa na lixeira", async () => {
    const inventado = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "").slice(0, 43);
    expect((await responder(inventado, true)).error?.message).toBe(INDISPONIVEL);

    const cancelado = await noPagamento();
    await parceiro.rpc("voltar_forma_para_rascunho", { p_negocio: cancelado.negocio, p_de: "enviada" });
    expect((await responder(cancelado.token, true)).error?.message).toBe(INDISPONIVEL);
    expect(await respostasDa(cancelado.plano)).toHaveLength(0);

    const perdido = await noPagamento();
    await parceiro
      .from("opportunities")
      .update({ status: "lost", stage_id: perdaId, closed_at: new Date().toISOString() })
      .eq("id", perdido.negocio);
    expect((await abrir(perdido.token))!.situacao).toBe("cancelada");
    expect((await responder(perdido.token, true)).error?.message).toBe(INDISPONIVEL);
    expect(await respostasDa(perdido.plano)).toHaveLength(0);

    const lixeira = await noPagamento();
    await parceiro.from("people").update({ deleted_at: new Date().toISOString() }).eq("id", lixeira.pessoa.id);
    expect((await abrir(lixeira.token))!.situacao).toBe("cancelada");
    expect((await responder(lixeira.token, true)).error?.message).toBe(INDISPONIVEL);
    expect(await respostasDa(lixeira.plano)).toHaveLength(0);
  });

  it("a porta continua estreita: quem está logado não entra, e a prova não se forja", async () => {
    const { plano, token } = await noPagamento();
    expect((await parceiro.rpc("responder_forma_de_pagamento", { p_token: token, p_aceita: true })).error).not.toBeNull();
    expect((await parceiro.rpc("abrir_ficha_de_cadastro", { p_token: token })).error).not.toBeNull();

    const link = await linkDo(token);
    for (const decision of ["confirmada", "recusada"]) {
      const forjada = await parceiro.from("payment_plan_responses").insert({
        organization_id: org,
        plan_id: plano,
        registration_form_id: link.id,
        decision,
        snapshot: {},
      });
      expect(forjada.error, decision).not.toBeNull();
    }
    expect(await respostasDa(plano)).toHaveLength(0);
  });

  it("Ganho: recusada não cria cobrança; confirmada pelo cliente cria, como na 4a", async () => {
    const recusada = await noPagamento();
    await responder(recusada.token, false, "Não");
    const simulado = await parceiro.rpc("ganhar_negocio", { p_negocio: recusada.negocio, p_simular: true });
    const resumo = simulado.data as { forma: { situacao: string; ultima_decisao: string | null }; cobrancas: unknown[] };
    expect(resumo.forma).toMatchObject({ situacao: "recusada", ultima_decisao: "recusada" });
    expect(resumo.cobrancas).toEqual([]);

    const confirmada = await noPagamento();
    await responder(confirmada.token, true);
    const ganho = await parceiro.rpc("ganhar_negocio", { p_negocio: confirmada.negocio, p_simular: false });
    expect(ganho.error).toBeNull();
    expect((ganho.data as { forma: { ultima_decisao: string } }).forma.ultima_decisao).toBe("confirmada");
    const { data: cobrancas } = await parceiro.from("receivables").select("id").eq("person_id", confirmada.pessoa.id);
    expect(cobrancas).toHaveLength(2);
  });

  it("apagar a pessoa leva o link, a forma e a resposta do cliente", async () => {
    const { pessoa, negocio, token } = await noPagamento();
    expect((await responder(token, false, "Datas erradas")).error).toBeNull();

    const apagou = await parceiro.from("people").delete().eq("id", pessoa.id).select("id");
    expect(apagou.error).toBeNull();
    expect(apagou.data).toHaveLength(1);
    expect(await formaDo(negocio)).toBeNull();
  });

  it("o cliente do parceiro vê o nome do parceiro, e não Duli", async () => {
    const { token } = await enviada();
    expect((await abrir(token))!.organizacao).toBe(nomeDaOrganizacao);
  });
});
