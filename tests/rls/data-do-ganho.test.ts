// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { filtroDoQuadro } from "@/features/opportunities/regras";
import { hojeEmSaoPaulo } from "@/lib/formatar";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Ajustar a data do Ganho (0056; CRM-17).
 *
 * Só a gestão, só pelo `ajustar_data_do_ganho`, que grava a data e o histórico
 * juntos. O dia não escorrega: grava-se o início do dia em São Paulo, e o
 * histórico também fala em dias de São Paulo. Vale de 01/01/2000 até hoje; o
 * mesmo dia não grava nada. `update` direto de `closed_at` de negócio ganho é
 * recusado, até para a gestão.
 *
 * Cada negócio é ganho pelo `ganhar_negocio`, numa pessoa descartável da
 * organização de teste, apagada no fim (a cascata leva tudo).
 */

const s = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

const MSG = {
  gestao: "Só a gestão ajusta a data do ganho.",
  direto: "Use o Ajustar data.",
  naoGanho: "Só o negócio ganho tem a data ajustada.",
  futuro: "A data do ganho não pode ser no futuro.",
  antesDe2000: "A data do ganho não pode ser antes de 2000.",
  naoEncontrado: "Negócio não encontrado.",
  semData: "Informe a data.",
};

const DIA = 86_400_000;
/** O dia de São Paulo `n` dias atrás, em AAAA-MM-DD. */
const diasAtras = (n: number) => hojeEmSaoPaulo(new Date(Date.now() - n * DIA));
/** AAAA-MM-DD → DD/MM/AAAA, como o histórico escreve. */
const emBr = (dia: string) => dia.split("-").reverse().join("/");

describe("ajustar a data do Ganho (0056)", () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let duli: Cliente;
  let org: string;
  let funilId: string;
  let abertaId: string;
  let vistoId: string;
  const criadas: string[] = [];
  let contador = 0;

  async function negocioGanho(): Promise<{ negocio: string; pessoa: string }> {
    const negocio = await negocioAberto();
    const { error } = await parceiro.rpc("ganhar_negocio", { p_negocio: negocio.negocio });
    if (error) throw new Error(`Ganho falhou: ${error.message}`);
    return negocio;
  }

  async function negocioAberto(): Promise<{ negocio: string; pessoa: string }> {
    contador += 1;
    const { data: pessoa, error: erroPessoa } = await parceiro
      .from("people")
      .insert({ organization_id: org, full_name: `Data ${s} ${contador}`, lifecycle_stage: "opportunity" })
      .select("id")
      .single();
    if (erroPessoa) throw new Error(`Pessoa não criada: ${erroPessoa.message}`);
    criadas.push(pessoa.id);

    const { data: negocio, error: erroNegocio } = await parceiro
      .from("opportunities")
      .insert({
        organization_id: org,
        person_id: pessoa.id,
        pipeline_id: funilId,
        stage_id: abertaId,
        title: `Negócio ${s} ${contador}`,
      })
      .select("id")
      .single();
    if (erroNegocio) throw new Error(`Negócio não criado: ${erroNegocio.message}`);

    const { error: erroItem } = await parceiro.from("opportunity_items").insert({
      organization_id: org,
      opportunity_id: negocio.id,
      visa_type_id: vistoId,
      visa_name: "EB-1A",
      amount: 1000,
      currency: "USD",
    });
    if (erroItem) throw new Error(`Item não criado: ${erroItem.message}`);
    return { negocio: negocio.id, pessoa: pessoa.id };
  }

  const ajustar = (quem: Cliente, negocio: string, dia: string) =>
    quem.rpc("ajustar_data_do_ganho", { p_negocio: negocio, p_data: dia });

  async function fechadoEm(negocio: string): Promise<string | null> {
    const { data, error } = await parceiro
      .from("opportunities")
      .select("closed_at")
      .eq("id", negocio)
      .single();
    if (error) throw new Error(`Negócio ilegível: ${error.message}`);
    return data.closed_at;
  }

  async function ajustes(pessoa: string): Promise<(string | null)[]> {
    const { data, error } = await parceiro
      .from("activities")
      .select("description, created_at")
      .eq("person_id", pessoa)
      .like("description", "Data do ganho ajustada%")
      .order("created_at");
    if (error) throw new Error(`Histórico ilegível: ${error.message}`);
    return data.map((a) => a.description);
  }

  beforeAll(async () => {
    [parceiro, staff, duli] = await Promise.all([
      entrarComo("parceiro"),
      entrarComo("staff"),
      entrarComo("colaborador"),
    ]);
    org = (await fixture(parceiro)).organization_id;

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
    abertaId = etapas
      .filter((e) => !e.is_won && !e.is_lost)
      .sort((a, b) => a.position - b.position)[0]!.id;

    const { data: visto, error: erroVisto } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .maybeSingle();
    if (erroVisto) throw new Error(`Visto da fixture ilegível: ${erroVisto.message}`);
    if (!visto) throw new Error("Visto da fixture não existe. Aplique a 0021.");
    vistoId = visto.id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("people").delete().in("id", criadas);
  });

  it("a gestão ajusta: o início do dia em São Paulo, e o histórico com os dois dias", async () => {
    const { negocio, pessoa } = await negocioGanho();
    const ganhoEm = hojeEmSaoPaulo(new Date((await fechadoEm(negocio))!));
    const d = diasAtras(10);

    const primeiro = await ajustar(parceiro, negocio, d);
    expect(primeiro.error).toBeNull();
    expect(primeiro.data).toBe(pessoa);
    expect(new Date((await fechadoEm(negocio))!).getTime()).toBe(new Date(`${d}T00:00:00-03:00`).getTime());

    const e = diasAtras(20);
    expect((await ajustar(parceiro, negocio, e)).error).toBeNull();

    expect(await ajustes(pessoa)).toEqual([
      `Data do ganho ajustada de ${emBr(ganhoEm)} para ${emBr(d)}`,
      `Data do ganho ajustada de ${emBr(d)} para ${emBr(e)}`,
    ]);
  });

  it("o mesmo dia não grava nada; hoje passa", async () => {
    const { negocio, pessoa } = await negocioGanho();
    const antes = await fechadoEm(negocio);

    expect((await ajustar(parceiro, negocio, hojeEmSaoPaulo())).error).toBeNull();
    expect(await fechadoEm(negocio)).toBe(antes);
    expect(await ajustes(pessoa)).toEqual([]);

    const d = diasAtras(5);
    expect((await ajustar(parceiro, negocio, d)).error).toBeNull();
    const deVolta = await ajustar(parceiro, negocio, hojeEmSaoPaulo());
    expect(deVolta.error).toBeNull();
    expect(new Date((await fechadoEm(negocio))!).getTime()).toBe(
      new Date(`${hojeEmSaoPaulo()}T00:00:00-03:00`).getTime(),
    );
  });

  it("de 01/01/2000 até hoje: antes de 2000 e o futuro são recusados", async () => {
    const { negocio } = await negocioGanho();

    const antigo = await ajustar(parceiro, negocio, "1999-12-31");
    expect(antigo.error?.message).toBe(MSG.antesDe2000);

    const amanha = await ajustar(parceiro, negocio, hojeEmSaoPaulo(new Date(Date.now() + DIA)));
    expect(amanha.error?.message).toBe(MSG.futuro);

    // Em 01/01/2000 São Paulo estava no horário de verão (-02:00): confere-se o
    // dia, não o instante.
    expect((await ajustar(parceiro, negocio, "2000-01-01")).error).toBeNull();
    expect(hojeEmSaoPaulo(new Date((await fechadoEm(negocio))!))).toBe("2000-01-01");
  });

  it("recusas: quem não é da gestão, quem não enxerga, negócio aberto e dia vazio", async () => {
    const { negocio } = await negocioGanho();
    const antes = await fechadoEm(negocio);

    expect((await ajustar(staff, negocio, diasAtras(3))).error?.message).toBe(MSG.gestao);
    expect((await ajustar(duli, negocio, diasAtras(3))).error?.message).toBe(MSG.naoEncontrado);

    const aberto = await negocioAberto();
    expect((await ajustar(parceiro, aberto.negocio, diasAtras(3))).error?.message).toBe(MSG.naoGanho);

    // O tipo gerado exige `p_data`; o banco recusa o nulo com frase própria.
    const vazio = await parceiro.rpc("ajustar_data_do_ganho", {
      p_negocio: negocio,
      p_data: null as unknown as string,
    });
    expect(vazio.error?.message).toBe(MSG.semData);

    expect(await fechadoEm(negocio)).toBe(antes);
  });

  it("update direto da data de negócio ganho é recusado, até para a gestão", async () => {
    const { negocio } = await negocioGanho();
    const antes = await fechadoEm(negocio);

    const direto = await parceiro
      .from("opportunities")
      .update({ closed_at: new Date(Date.now() - 40 * DIA).toISOString() })
      .eq("id", negocio);
    expect(direto.error?.message).toBe(MSG.direto);
    expect(await fechadoEm(negocio)).toBe(antes);
  });

  it("o \"cliente desde\" não muda com o ajuste", async () => {
    const { negocio, pessoa } = await negocioGanho();
    const { data: antes } = await parceiro.from("people").select("client_since").eq("id", pessoa).single();

    expect((await ajustar(parceiro, negocio, diasAtras(15))).error).toBeNull();
    const { data: depois } = await parceiro.from("people").select("client_since").eq("id", pessoa).single();
    expect(depois!.client_since).toBe(antes!.client_since);
  });

  it("o quadro: 31 dias atrás sai, 29 fica", async () => {
    const velho = await negocioGanho();
    const recente = await negocioGanho();
    expect((await ajustar(parceiro, velho.negocio, diasAtras(31))).error).toBeNull();
    expect((await ajustar(parceiro, recente.negocio, diasAtras(29))).error).toBeNull();

    const { data, error } = await parceiro
      .from("opportunities")
      .select("id")
      .in("id", [velho.negocio, recente.negocio])
      .or(filtroDoQuadro(new Date()));
    expect(error).toBeNull();
    expect(data!.map((n) => n.id)).toEqual([recente.negocio]);
  });

  it("reabrir e ganhar de novo continuam gravando a data", async () => {
    const { negocio } = await negocioGanho();
    expect((await ajustar(parceiro, negocio, diasAtras(12))).error).toBeNull();

    expect((await parceiro.rpc("reabrir_negocio", { p_negocio: negocio })).error).toBeNull();
    expect(await fechadoEm(negocio)).toBeNull();

    expect((await parceiro.rpc("ganhar_negocio", { p_negocio: negocio })).error).toBeNull();
    expect(hojeEmSaoPaulo(new Date((await fechadoEm(negocio))!))).toBe(hojeEmSaoPaulo());
  });
});
