// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACEITE, anonimoDeTeste, fichaCompleta } from "../ficha-de-teste";
import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * A forma de pagamento vai pelo link da ficha (0064; FIC-7 a FIC-10, FIC-12,
 * FIC-13) — o lado da equipe.
 *
 * - A parte em reais diz de quantos dólares veio, e a cópia guarda isso.
 * - `enviar_forma_de_pagamento` gera o link com a forma: 3 dias úteis, modo
 *   `completa` ou `so_pagamento`, e só a partir da versão que a prévia viu.
 * - Editar e Cancelar link (`voltar_forma_para_rascunho` com `p_de`), e
 *   confirmar pela equipe, cancelam o link; quem clica diz de onde parte.
 * - O link com a forma não se mexe pela API, e um só fica aberto por pessoa.
 * - Negócio que fecha cancela o link aberto.
 *
 * Tudo em pessoas descartáveis da organização de teste, apagadas no fim. O que
 * se cria no "Cliente de Teste" (portal) é desfeito em `finally` (P11).
 */

const s = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

const MSG = {
  naoEncontrado: "Negócio não encontrado.",
  semPoder: "Só o dono do negócio ou a gestão confirmam a forma de pagamento.",
  enviada: "A forma foi enviada ao cliente. Use Editar para mudar.",
  semParteOuVisto: "Acrescente pelo menos um visto e uma parte antes de enviar.",
  outroLink: (titulo: string) =>
    `Há um link da ficha aberto no negócio ${titulo}. Cancele-o antes de enviar outro.`,
  linkComum: (titulo: string) =>
    `Há um link da ficha aberto no negócio ${titulo}. Cancele-o no negócio antes.`,
  excluir: "Cancele o link da ficha antes.",
  soReais: "Só a parte em reais é convertida de dólar.",
  semConversao: "Informe de quantos dólares Cartão foi convertida.",
  casas: "Use no máximo 2 casas decimais em Cartão.",
  formato: "A forma de pagamento veio num formato inválido.",
  mudou: "A forma de pagamento mudou enquanto você olhava. Atualize a página.",
  link: "Mude o link da ficha pela tela do negócio.",
  vistos: "A forma de pagamento foi enviada ao cliente. Use Editar para mudar os vistos.",
};

const HISTORICO = {
  enviada: "Forma de pagamento enviada ao cliente",
  editada: "Forma de pagamento editada; o link enviado foi cancelado",
  encerrado: "Link da ficha cancelado: o negócio foi encerrado",
};

/** O dia de hoje em São Paulo, mais `dias`, como `AAAA-MM-DD`. */
function hojeMais(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * O oráculo do prazo (P13): o dia de `de` em São Paulo, mais 3 dias de segunda
 * a sexta, e o instante 00h00 de São Paulo do dia seguinte. São Paulo não tem
 * horário de verão desde 2019: 00h00 é 03h00 UTC.
 */
function fimDoPrazo(de: Date): number {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(de);
  const d = new Date(`${dia}T12:00:00Z`);
  let uteis = 0;
  while (uteis < 3) {
    d.setUTCDate(d.getUTCDate() + 1);
    const semana = d.getUTCDay();
    if (semana !== 0 && semana !== 6) uteis += 1;
  }
  d.setUTCDate(d.getUTCDate() + 1);
  return Date.parse(`${d.toISOString().slice(0, 10)}T03:00:00Z`);
}

const ENTRADA = () => ({
  label: "Entrada",
  method: "transferencia",
  currency: "USD",
  total: 2100,
  installments_count: 1,
  usd_equivalent: null as number | null,
  parcelas: [{ number: 1, amount: 2100, due_on: hojeMais(10) }],
});

const CARTAO = (usd: unknown = 3900) => ({
  label: "Cartão",
  method: "cartao",
  currency: "BRL",
  total: 21527.76,
  installments_count: 1,
  usd_equivalent: usd,
  parcelas: [{ number: 1, amount: 21527.76, due_on: hojeMais(15) }],
});

/** A forma do critério da 4b: US$ 2.100 de entrada + cartão de US$ 3.900 em reais. */
const CRITERIO = () => ({ partes: [ENTRADA(), CARTAO()] });

describe("a forma vai pelo link (0064)", { timeout: 60_000 }, () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let duli: Cliente;
  let cliente: Cliente;
  let parceiroId: string;
  let org: string;
  let fixturePessoa: string;
  let funilId: string;
  let primeiraAberta: string;
  let perdaId: string;
  let vistoId: string;
  const criadas: string[] = [];
  let contador = 0;

  async function novaPessoa(): Promise<string> {
    contador += 1;
    const { data, error } = await parceiro
      .from("people")
      .insert({ organization_id: org, full_name: `Enviada ${s} ${contador}`, lifecycle_stage: "opportunity" })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    criadas.push(data.id);
    return data.id;
  }

  async function novoNegocio(pessoaId: string, titulo = `Negócio ${s}`): Promise<string> {
    const { data, error } = await parceiro
      .from("opportunities")
      .insert({
        organization_id: org,
        person_id: pessoaId,
        pipeline_id: funilId,
        stage_id: primeiraAberta,
        title: titulo,
        owner_id: parceiroId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Negócio não criado: ${error.message}`);
    return data.id;
  }

  const novoItem = (negocioId: string, visaName: string) =>
    parceiro
      .from("opportunity_items")
      .insert({
        organization_id: org,
        opportunity_id: negocioId,
        visa_type_id: vistoId,
        visa_name: visaName,
        amount: 6000,
        currency: "USD",
      })
      .select("id")
      .single();

  const salvar = (quem: Cliente, negocioId: string, forma: unknown) =>
    quem.rpc("salvar_forma_de_pagamento", { p_negocio: negocioId, p_forma: forma as never });

  const confirmar = (quem: Cliente, negocioId: string) =>
    quem.rpc("confirmar_forma_de_pagamento_pela_equipe", { p_negocio: negocioId });

  const enviar = (quem: Cliente, negocioId: string, versao: string, pedirDeNovo?: boolean) =>
    quem.rpc("enviar_forma_de_pagamento", {
      p_negocio: negocioId,
      p_versao: versao,
      ...(pedirDeNovo === undefined ? {} : { p_pedir_dados_de_novo: pedirDeNovo }),
    });

  const voltar = (quem: Cliente, negocioId: string, de: string) =>
    quem.rpc("voltar_forma_para_rascunho", { p_negocio: negocioId, p_de: de });

  async function formaDo(negocioId: string, quem: Cliente = parceiro) {
    const { data, error } = await quem
      .from("payment_plans")
      .select("id, status, updated_at")
      .eq("opportunity_id", negocioId)
      .maybeSingle();
    if (error) throw new Error(`Forma ilegível: ${error.message}`);
    return data;
  }

  /** A versão como a tela a lê: o texto do PostgREST, com os microssegundos. */
  async function versaoDa(negocioId: string): Promise<string> {
    const forma = await formaDo(negocioId);
    if (!forma) throw new Error("Sem forma para ler a versão.");
    return forma.updated_at;
  }

  async function linksDa(pessoaId: string, quem: Cliente = parceiro) {
    const { data, error } = await quem
      .from("registration_forms")
      .select("id, token, mode, payment_plan_id, expires_at, cancelled_at, closed_at, submitted_at")
      .eq("person_id", pessoaId)
      .order("created_at");
    if (error) throw new Error(`Links ilegíveis: ${error.message}`);
    return data;
  }

  async function respostasDa(planoId: string, quem: Cliente = parceiro) {
    const { data, error } = await quem
      .from("payment_plan_responses")
      .select("decision, snapshot")
      .eq("plan_id", planoId);
    if (error) throw new Error(`Respostas ilegíveis: ${error.message}`);
    return data;
  }

  async function historico(pessoaId: string) {
    const { data, error } = await parceiro.from("activities").select("description").eq("person_id", pessoaId);
    if (error) throw new Error(`Histórico ilegível: ${error.message}`);
    return data.map((a) => a.description);
  }

  /** Pessoa, negócio com um visto e a forma do critério salva, em rascunho. */
  async function comForma(titulo?: string, pessoa?: string) {
    const p = pessoa ?? (await novaPessoa());
    const negocio = await novoNegocio(p, titulo);
    const item = await novoItem(negocio, "EB-2 NIW");
    if (item.error) throw new Error(`Visto não criado: ${item.error.message}`);
    const { error } = await salvar(parceiro, negocio, CRITERIO());
    if (error) throw new Error(`Forma não salva: ${error.message}`);
    return { pessoa: p, negocio };
  }

  /** O mesmo, e enviada pelo parceiro. Devolve o token. */
  async function enviada(titulo?: string, pessoa?: string, pedirDeNovo?: boolean) {
    const base = await comForma(titulo, pessoa);
    const { data, error } = await enviar(parceiro, base.negocio, await versaoDa(base.negocio), pedirDeNovo);
    if (error) throw new Error(`Forma não enviada: ${error.message}`);
    return { ...base, token: data as string };
  }

  /** Um link comum aberto, como o `gerarLink` de hoje grava. */
  const linkComum = (pessoaId: string) =>
    parceiro
      .from("registration_forms")
      .insert({
        organization_id: org,
        person_id: pessoaId,
        token: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""),
        expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id, token")
      .single();

  beforeAll(async () => {
    [parceiro, staff, duli, cliente] = await Promise.all([
      entrarComo("parceiro"),
      entrarComo("staff"),
      entrarComo("colaborador"),
      entrarComo("cliente"),
    ]);
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;
    const fx = await fixture(parceiro);
    org = fx.organization_id;
    fixturePessoa = fx.id;

    const { data: funil, error: erroFunil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    if (erroFunil) throw new Error(`Funil ilegível: ${erroFunil.message}`);
    funilId = funil.id;

    const { data: etapas, error: erroEtapas } = await parceiro
      .from("pipeline_stages")
      .select("id, is_won, is_lost, position")
      .eq("pipeline_id", funilId);
    if (erroEtapas) throw new Error(`Etapas ilegíveis: ${erroEtapas.message}`);
    primeiraAberta = etapas
      .filter((e) => !e.is_won && !e.is_lost)
      .sort((a, b) => a.position - b.position)[0]!.id;
    perdaId = etapas.find((e) => e.is_lost)!.id;

    const { data: visto, error: erroVisto } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .maybeSingle();
    if (erroVisto || !visto) throw new Error("Visto da fixture não existe. Aplique a 0021.");
    vistoId = visto.id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("people").delete().in("id", criadas);
  });

  it("a parte em reais diz de quantos dólares veio, e a cópia guarda (FIC-13)", async () => {
    const { negocio } = await comForma();
    const forma = (await formaDo(negocio))!;
    const { data: partes } = await parceiro
      .from("payment_plan_parts")
      .select("label, usd_equivalent")
      .eq("plan_id", forma.id)
      .order("position");
    expect(partes).toEqual([
      { label: "Entrada", usd_equivalent: null },
      { label: "Cartão", usd_equivalent: 3900 },
    ]);

    const recusas: [unknown, string][] = [
      [{ partes: [{ ...ENTRADA(), usd_equivalent: 2100 }] }, MSG.soReais],
      [{ partes: [CARTAO(0)] }, MSG.semConversao],
      [{ partes: [CARTAO(3900.005)] }, MSG.casas],
      [{ partes: [CARTAO("abc")] }, MSG.formato],
    ];
    for (const [entrada, frase] of recusas) {
      const { error } = await salvar(parceiro, negocio, entrada);
      expect(error?.message).toBe(frase);
      expect(error?.code).not.toBe("22P02");
    }

    expect((await confirmar(parceiro, negocio)).error).toBeNull();
    const [resposta] = await respostasDa(forma.id);
    const copia = resposta!.snapshot as { partes: { label: string; usd_equivalent: number | null }[] };
    expect(copia.partes.map((p) => [p.label, p.usd_equivalent])).toEqual([
      ["Entrada", null],
      ["Cartão", 3900],
    ]);
  });

  it("qualquer membro envia: o link com a forma, 3 dias úteis, e o histórico", async () => {
    const { pessoa, negocio } = await comForma();
    const antes = new Date();
    const { data: token, error } = await enviar(staff, negocio, await versaoDa(negocio));
    const depois = new Date();
    expect(error).toBeNull();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const forma = (await formaDo(negocio))!;
    expect(forma.status).toBe("enviada");

    const [link] = await linksDa(pessoa);
    expect(link).toMatchObject({ token, payment_plan_id: forma.id, mode: "completa", closed_at: null });
    // O dia pode virar entre `antes` e `depois`: vale um dos dois.
    expect([fimDoPrazo(antes), fimDoPrazo(depois)]).toContain(new Date(link!.expires_at).getTime());

    expect(await historico(pessoa)).toContain(HISTORICO.enviada);
  });

  it("sem visto ou sem parte, não envia", async () => {
    const pessoa = await novaPessoa();
    const semVisto = await novoNegocio(pessoa);
    expect((await salvar(parceiro, semVisto, CRITERIO())).error).toBeNull();
    expect((await enviar(parceiro, semVisto, await versaoDa(semVisto))).error?.message).toBe(
      MSG.semParteOuVisto,
    );

    const outra = await novaPessoa();
    const semParte = await novoNegocio(outra);
    await novoItem(semParte, "EB-2 NIW");
    expect((await salvar(parceiro, semParte, { partes: [] })).error).toBeNull();
    expect((await enviar(parceiro, semParte, await versaoDa(semParte))).error?.message).toBe(
      MSG.semParteOuVisto,
    );
  });

  it("a versão: a lida como texto passa; uma anterior a outro salvar, não (foco 1)", async () => {
    const { negocio } = await comForma();
    const antiga = await versaoDa(negocio);
    expect((await salvar(parceiro, negocio, CRITERIO())).error).toBeNull();

    expect((await enviar(parceiro, negocio, antiga)).error?.message).toBe(MSG.mudou);
    expect((await formaDo(negocio))!.status).toBe("rascunho");

    expect((await enviar(parceiro, negocio, await versaoDa(negocio))).error).toBeNull();
  });

  it("quem já mandou a ficha recebe só o pagamento, salvo se a equipe pedir os dados de novo", async () => {
    const pessoa = await novaPessoa();
    const comum = await linkComum(pessoa);
    expect(comum.error).toBeNull();
    const ficha = await anonimoDeTeste().rpc("enviar_ficha_de_cadastro", {
      p_token: comum.data!.token,
      p_dados: fichaCompleta(`Enviada ${s} ficha`),
      p_consentimento: ACEITE,
    });
    expect(ficha.error).toBeNull();

    const { negocio } = await enviada(undefined, pessoa);
    let links = await linksDa(pessoa);
    expect(links.at(-1)!.mode).toBe("so_pagamento");

    expect((await voltar(parceiro, negocio, "enviada")).error).toBeNull();
    expect((await enviar(parceiro, negocio, await versaoDa(negocio), true)).error).toBeNull();
    links = await linksDa(pessoa);
    expect(links.at(-1)!.mode).toBe("completa");
  });

  it("forma enviada: salvar e os vistos recusam; Editar cancela o link e solta tudo", async () => {
    const { pessoa, negocio } = await enviada();
    const [item] = (await parceiro.from("opportunity_items").select("id").eq("opportunity_id", negocio)).data!;

    expect((await salvar(parceiro, negocio, CRITERIO())).error?.message).toBe(MSG.enviada);
    expect((await novoItem(negocio, "O-1")).error?.message).toBe(MSG.vistos);
    expect(
      (await parceiro.from("opportunity_items").update({ amount: 7000 }).eq("id", item!.id)).error?.message,
    ).toBe(MSG.vistos);
    expect((await parceiro.from("opportunity_items").delete().eq("id", item!.id)).error?.message).toBe(
      MSG.vistos,
    );

    // Editar e Cancelar link: qualquer membro (decisão 8).
    expect((await voltar(staff, negocio, "enviada")).error).toBeNull();
    expect((await formaDo(negocio))!.status).toBe("rascunho");
    expect((await linksDa(pessoa))[0]!.cancelled_at).not.toBeNull();
    expect(await historico(pessoa)).toContain(HISTORICO.editada);

    expect((await novoItem(negocio, "O-1")).error).toBeNull();
  });

  it("confirmar a partir de enviada: só o dono ou a gestão, e o link morre (FIC-10)", async () => {
    const { pessoa, negocio } = await enviada();
    expect((await confirmar(staff, negocio)).error?.message).toBe(MSG.semPoder);

    expect((await confirmar(parceiro, negocio)).error).toBeNull();
    const forma = (await formaDo(negocio))!;
    expect(forma.status).toBe("confirmada");
    expect((await linksDa(pessoa))[0]!.cancelled_at).not.toBeNull();
    const respostas = await respostasDa(forma.id);
    expect(respostas.map((r) => r.decision)).toEqual(["confirmada_pela_equipe"]);

    // Quem clica diz de onde parte: Cancelar link depois da confirmação não a desfaz.
    expect((await voltar(parceiro, negocio, "enviada")).error?.message).toBe(MSG.mudou);
    expect((await formaDo(negocio))!.status).toBe("confirmada");

    const semForma = await novoNegocio(pessoa);
    expect((await voltar(parceiro, semForma, "recusada")).error?.message).toBe(MSG.mudou);
  });

  it("um link aberto por pessoa", async () => {
    const pessoa = await novaPessoa();
    const tituloA = `Contrato A ${s}`;
    await enviada(tituloA, pessoa);
    const b = await comForma(`Contrato B ${s}`, pessoa);
    expect((await enviar(parceiro, b.negocio, await versaoDa(b.negocio))).error?.message).toBe(
      MSG.outroLink(tituloA),
    );

    // Link comum novo com o link com a forma aberto (P7).
    expect((await linkComum(pessoa)).error?.message).toBe(MSG.linkComum(tituloA));

    // A ficha comum aberta é cancelada pelo envio.
    const outra = await novaPessoa();
    const comum = await linkComum(outra);
    expect(comum.error).toBeNull();
    await enviada(undefined, outra);
    const links = await linksDa(outra);
    expect(links.find((l) => l.id === comum.data!.id)!.cancelled_at).not.toBeNull();
  });

  it("o link com a forma não se mexe pela API; o comum continua como hoje", async () => {
    const { pessoa } = await enviada();
    const [link] = await linksDa(pessoa);
    const mexer = (campos: Record<string, unknown>) =>
      parceiro.from("registration_forms").update(campos as never).eq("id", link!.id);

    const futuro = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    for (const campos of [
      { expires_at: futuro },
      { token: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "") },
      { answers: {} },
      { mode: "so_pagamento" },
      { closed_at: new Date().toISOString() },
      { payment_plan_id: null },
      { cancelled_at: new Date().toISOString() },
    ]) {
      expect((await mexer(campos)).error?.message, JSON.stringify(campos)).toBe(MSG.link);
    }
    expect((await parceiro.from("registration_forms").delete().eq("id", link!.id)).error?.message).toBe(
      MSG.link,
    );

    const comumDe = await novaPessoa();
    const comum = await linkComum(comumDe);
    const mexerComum = (campos: Record<string, unknown>) =>
      parceiro.from("registration_forms").update(campos as never).eq("id", comum.data!.id).select("id");
    expect((await mexerComum({ expires_at: futuro })).data).toHaveLength(1);
    for (const campos of [
      { mode: "so_pagamento" },
      { closed_at: new Date().toISOString() },
      { payment_plan_id: (await formaDo((await comForma()).negocio))!.id },
    ]) {
      expect((await mexerComum(campos)).error?.message, JSON.stringify(campos)).toBe(MSG.link);
    }

    const semLink = await novaPessoa();
    const { negocio: outroNegocio } = await comForma(undefined, semLink);
    const plano = (await formaDo(outroNegocio))!.id;
    const inserir = (campos: Record<string, unknown>) =>
      parceiro.from("registration_forms").insert({
        organization_id: org,
        person_id: semLink,
        token: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""),
        expires_at: futuro,
        ...campos,
      } as never);
    expect((await inserir({ payment_plan_id: plano })).error?.message).toBe(MSG.link);
    expect((await inserir({ mode: "so_pagamento" })).error?.message).toBe(MSG.link);
  });

  it("o negócio perdido cancela o link aberto, e a pessoa pode receber outro", async () => {
    const { pessoa, negocio } = await enviada();
    const perdido = await parceiro
      .from("opportunities")
      .update({ status: "lost", stage_id: perdaId, closed_at: new Date().toISOString() })
      .eq("id", negocio);
    expect(perdido.error).toBeNull();

    expect((await formaDo(negocio))!.status).toBe("rascunho");
    expect((await linksDa(pessoa))[0]!.cancelled_at).not.toBeNull();
    expect(await historico(pessoa)).toContain(HISTORICO.encerrado);

    await enviada(undefined, pessoa);
    expect((await linksDa(pessoa)).filter((l) => !l.cancelled_at)).toHaveLength(1);
  });

  it("Ganho com a forma enviada: nenhuma cobrança, e o link é cancelado", async () => {
    const { pessoa, negocio } = await enviada();

    const simulado = await parceiro.rpc("ganhar_negocio", { p_negocio: negocio, p_simular: true });
    expect(simulado.error).toBeNull();
    const resumo = simulado.data as { forma: { situacao: string; enviada_em: string | null }; cobrancas: unknown[] };
    expect(resumo.forma.situacao).toBe("enviada");
    expect(resumo.forma.enviada_em).not.toBeNull();
    expect(resumo.cobrancas).toEqual([]);

    expect((await parceiro.rpc("ganhar_negocio", { p_negocio: negocio, p_simular: false })).error).toBeNull();
    const { data: cobrancas } = await parceiro.from("receivables").select("id").eq("person_id", pessoa);
    expect(cobrancas).toHaveLength(0);
    expect((await linksDa(pessoa))[0]!.cancelled_at).not.toBeNull();
    expect((await formaDo(negocio))!.status).toBe("rascunho");
  });

  it("excluir: com o link aberto, não; depois de Cancelar link, sim", async () => {
    const { negocio } = await enviada();
    expect((await parceiro.from("opportunities").delete().eq("id", negocio)).error?.message).toBe(MSG.excluir);

    expect((await voltar(parceiro, negocio, "enviada")).error).toBeNull();
    const apagou = await parceiro.from("opportunities").delete().eq("id", negocio).select("id");
    expect(apagou.error).toBeNull();
    expect(apagou.data).toHaveLength(1);
  });

  it("o cliente do portal não lê a forma enviada nem o link (P11)", async () => {
    const negocio = await novoNegocio(fixturePessoa, `Portal ${s}`);
    let linkId: string | null = null;
    try {
      await novoItem(negocio, "EB-2 NIW");
      expect((await salvar(parceiro, negocio, CRITERIO())).error).toBeNull();
      const enviou = await enviar(parceiro, negocio, await versaoDa(negocio), true);
      expect(enviou.error).toBeNull();
      const forma = (await formaDo(negocio))!;
      const link = (await linksDa(fixturePessoa)).find((l) => l.token === enviou.data);
      linkId = link?.id ?? null;
      expect(link?.mode).toBe("completa");

      expect(await formaDo(negocio, cliente)).toBeNull();
      expect((await cliente.from("payment_plan_parts").select("id").eq("plan_id", forma.id)).data).toHaveLength(0);
      expect((await respostasDa(forma.id, cliente))).toHaveLength(0);
      expect(await linksDa(fixturePessoa, cliente)).toHaveLength(0);
    } finally {
      await voltar(parceiro, negocio, "enviada");
      const negocioApagado = await parceiro.from("opportunities").delete().eq("id", negocio).select("id");
      if (negocioApagado.error || negocioApagado.data?.length !== 1) {
        throw new Error(
          `O negócio de teste no Cliente de Teste não foi apagado: ${negocioApagado.error?.message ?? negocioApagado.data?.length}`,
        );
      }
      if (linkId) {
        const linkApagado = await parceiro.from("registration_forms").delete().eq("id", linkId).select("id");
        if (linkApagado.error || linkApagado.data?.length !== 1) {
          throw new Error(
            `O link de teste no Cliente de Teste não foi apagado: ${linkApagado.error?.message ?? linkApagado.data?.length}`,
          );
        }
      }
    }
  });

  it("colaborador da Duli não envia nem cancela a forma da parceira", async () => {
    const { pessoa, negocio } = await enviada();
    expect((await enviar(duli, negocio, new Date().toISOString())).error?.message).toBe(MSG.naoEncontrado);
    expect((await voltar(duli, negocio, "enviada")).error?.message).toBe(MSG.naoEncontrado);
    expect(await linksDa(pessoa, duli)).toHaveLength(0);
  });
});
