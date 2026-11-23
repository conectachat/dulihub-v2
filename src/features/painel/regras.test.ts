// @vitest-environment node

import { describe, expect, it } from "vitest";

import { alertasDoDia, diasAte, type FormaDoPainel } from "./regras";

/**
 * O que a tela Início avisa.
 *
 * Cada caso aqui é um jeito de o alerta mentir — gritar por algo resolvido,
 * ou calar sobre algo vencido. O primeiro ensina a ignorar a tela; o
 * segundo é pior.
 */

const HOJE = "2026-10-15";

const processo = {
  id: "p1",
  title: "EB-1A",
  cliente: "Erick",
  rfe_due_on: null as string | null,
  rfe_answered_on: null as string | null,
  decided_on: null as string | null,
};

const vazio = { processos: [], pastas: [], etapas: [], parcelas: [], fichas: [] };

describe("diasAte", () => {
  it("conta dias corridos, e negativo quando já passou", () => {
    expect(diasAte("2026-10-20", HOJE)).toBe(5);
    expect(diasAte(HOJE, HOJE)).toBe(0);
    expect(diasAte("2026-10-10", HOJE)).toBe(-5);
  });

  it("atravessa mês e ano sem errar", () => {
    expect(diasAte("2026-11-01", "2026-10-31")).toBe(1);
    expect(diasAte("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("alertasDoDia — RFE", () => {
  it("prazo nos próximos 30 dias aparece", () => {
    const a = alertasDoDia(
      { ...vazio, processos: [{ ...processo, rfe_due_on: "2026-11-10" }] },
      HOJE,
    );

    expect(a.rfe).toEqual([
      { id: "p1", title: "EB-1A", cliente: "Erick", prazo: "2026-11-10", dias: 26, urgente: false },
    ]);
  });

  it("com sete dias ou menos, é urgente", () => {
    const a = alertasDoDia(
      { ...vazio, processos: [{ ...processo, rfe_due_on: "2026-10-22" }] },
      HOJE,
    );

    expect(a.rfe[0].urgente).toBe(true);
  });

  it("vencido continua aparecendo — é o caso mais grave", () => {
    const a = alertasDoDia(
      { ...vazio, processos: [{ ...processo, rfe_due_on: "2026-10-01" }] },
      HOJE,
    );

    expect(a.rfe[0]).toMatchObject({ dias: -14, urgente: true });
  });

  it("prazo distante ainda não aparece", () => {
    const a = alertasDoDia(
      { ...vazio, processos: [{ ...processo, rfe_due_on: "2027-01-10" }] },
      HOJE,
    );

    expect(a.rfe).toEqual([]);
  });

  it("RFE respondida sai do alerta", () => {
    // Sem isto, a tela continuaria gritando depois da resposta enviada.
    const a = alertasDoDia(
      {
        ...vazio,
        processos: [{ ...processo, rfe_due_on: "2026-10-20", rfe_answered_on: "2026-10-12" }],
      },
      HOJE,
    );

    expect(a.rfe).toEqual([]);
  });

  it("processo decidido sai do alerta", () => {
    const a = alertasDoDia(
      {
        ...vazio,
        processos: [{ ...processo, rfe_due_on: "2026-10-20", decided_on: "2026-10-14" }],
      },
      HOJE,
    );

    expect(a.rfe).toEqual([]);
  });

  it("o mais urgente vem primeiro", () => {
    const a = alertasDoDia(
      {
        ...vazio,
        processos: [
          { ...processo, id: "longe", rfe_due_on: "2026-11-10" },
          { ...processo, id: "vencido", rfe_due_on: "2026-10-01" },
          { ...processo, id: "perto", rfe_due_on: "2026-10-18" },
        ],
      },
      HOJE,
    );

    expect(a.rfe.map((r) => r.id)).toEqual(["vencido", "perto", "longe"]);
  });
});

describe("alertasDoDia — parcelas", () => {
  const parcela = {
    amount: 1000,
    currency: "BRL",
    due_on: "2026-10-10",
    paid_on: null as string | null,
    cliente: "Erick",
    person_id: "e1",
  };

  it("vencida aparece, somada por moeda", () => {
    const a = alertasDoDia(
      {
        ...vazio,
        parcelas: [
          parcela,
          { ...parcela, amount: 500 },
          { ...parcela, amount: 2000, currency: "USD", cliente: "Ana", person_id: "a1" },
        ],
      },
      HOJE,
    );

    expect(a.parcelas.quantidade).toBe(3);
    expect(a.parcelas.total).toEqual({ BRL: 1500, USD: 2000 });
    expect(a.parcelas.clientes).toEqual([
      { person_id: "e1", nome: "Erick", quantidade: 2 },
      { person_id: "a1", nome: "Ana", quantidade: 1 },
    ]);
  });

  it("paga não aparece, mesmo com vencimento passado", () => {
    const a = alertasDoDia(
      { ...vazio, parcelas: [{ ...parcela, paid_on: "2026-10-11" }] },
      HOJE,
    );

    expect(a.parcelas.quantidade).toBe(0);
  });

  it("vence hoje ainda não é vencida", () => {
    // Mesma regra de `situacaoDaParcela`: o dia do vencimento é do cliente.
    const a = alertasDoDia({ ...vazio, parcelas: [{ ...parcela, due_on: HOJE }] }, HOJE);

    expect(a.parcelas.quantidade).toBe(0);
  });
});

describe("alertasDoDia — pastas e etapas", () => {
  const pasta = {
    project_id: "p1",
    is_required: true,
    resolved_at: null as string | null,
    deadline_on: "2026-10-10" as string | null,
  };

  it("pasta obrigatória com prazo vencido aparece, contada por processo", () => {
    const a = alertasDoDia(
      { ...vazio, processos: [processo], pastas: [pasta, { ...pasta }] },
      HOJE,
    );

    expect(a.pastas).toEqual([
      { processo: { id: "p1", title: "EB-1A", cliente: "Erick" }, quantidade: 2 },
    ]);
  });

  it("pasta opcional, resolvida ou sem prazo não alerta", () => {
    const a = alertasDoDia(
      {
        ...vazio,
        processos: [processo],
        pastas: [
          { ...pasta, is_required: false },
          { ...pasta, resolved_at: "2026-10-12T10:00:00Z" },
          { ...pasta, deadline_on: null },
        ],
      },
      HOJE,
    );

    expect(a.pastas).toEqual([]);
  });

  it("etapa não concluída com data prevista vencida aparece", () => {
    const a = alertasDoDia(
      {
        ...vazio,
        processos: [processo],
        etapas: [
          { project_id: "p1", due_on: "2026-10-01", concluida: false },
          { project_id: "p1", due_on: "2026-10-01", concluida: true },
          { project_id: "p1", due_on: "2026-12-01", concluida: false },
        ],
      },
      HOJE,
    );

    expect(a.etapas).toEqual([
      { processo: { id: "p1", title: "EB-1A", cliente: "Erick" }, quantidade: 1 },
    ]);
  });
});

describe("alertasDoDia — nada a avisar", () => {
  it("diz que está vazio, em vez de devolver blocos em branco", () => {
    expect(alertasDoDia(vazio, HOJE).vazio).toBe(true);
  });

  it("qualquer ocorrência tira do vazio", () => {
    const a = alertasDoDia(
      { ...vazio, processos: [{ ...processo, rfe_due_on: "2026-10-20" }] },
      HOJE,
    );

    expect(a.vazio).toBe(false);
  });
});

describe("alertasDoDia — fichas de cadastro", () => {
  const ficha = {
    person_id: "c1",
    cliente: "Ana",
    estagio: "opportunity",
    submitted_at: "2026-10-14T15:00:00Z" as string | null,
    reviewed_at: null as string | null,
  };

  it("ficha recebida e não conferida aparece", () => {
    const a = alertasDoDia({ ...vazio, fichas: [ficha] }, HOJE);

    expect(a.fichas).toEqual([
      { person_id: "c1", nome: "Ana", estagio: "opportunity", recebidaEm: "2026-10-14T15:00:00Z" },
    ]);
    expect(a.vazio).toBe(false);
  });

  it("conferida para de avisar — alerta que grita à toa se aprende a ignorar", () => {
    const a = alertasDoDia(
      { ...vazio, fichas: [{ ...ficha, reviewed_at: "2026-10-15T09:00:00Z" }] },
      HOJE,
    );

    expect(a.fichas).toEqual([]);
    expect(a.vazio).toBe(true);
  });

  it("duas fichas da mesma pessoa sem conferir: um aviso só, o da mais recente (revisão final)", () => {
    const a = alertasDoDia(
      {
        ...vazio,
        fichas: [ficha, { ...ficha, submitted_at: "2026-10-15T10:00:00Z" }],
      },
      HOJE,
    );

    expect(a.fichas).toEqual([
      { person_id: "c1", nome: "Ana", estagio: "opportunity", recebidaEm: "2026-10-15T10:00:00Z" },
    ]);
  });

  it("link ainda não preenchido não é ficha recebida", () => {
    const a = alertasDoDia({ ...vazio, fichas: [{ ...ficha, submitted_at: null }] }, HOJE);

    expect(a.fichas).toEqual([]);
  });

  it("a mais antiga vem primeiro: é a que está esperando há mais tempo", () => {
    const a = alertasDoDia(
      {
        ...vazio,
        fichas: [
          ficha,
          { ...ficha, person_id: "c2", cliente: "Bruno", submitted_at: "2026-10-10T10:00:00Z" },
        ],
      },
      HOJE,
    );

    expect(a.fichas.map((f) => f.nome)).toEqual(["Bruno", "Ana"]);
  });
});

describe("alertasDoDia — a forma de pagamento (INI-8)", () => {
  const AGORA = new Date("2026-11-26T15:00:00Z");

  /** Uma forma de negócio aberto, como a Início lê. */
  const forma = (extra: Partial<FormaDoPainel> = {}): FormaDoPainel => ({
    negocio_id: "n1",
    nome: "Maria Souza",
    status: "rascunho",
    charges_created_at: null,
    respostas: [],
    links: [],
    ...extra,
  });

  const recusa = (reason: string | null, answered_at = "2026-11-24T13:00:00Z") => ({
    decision: "recusada" as const,
    reason,
    answered_at,
    created_at: answered_at,
  });

  const link = (expires_at: string) => ({
    expires_at,
    closed_at: null,
    cancelled_at: null,
    created_at: "2026-11-23T15:00:00Z",
  });

  const formas = (lista: FormaDoPainel[]) => alertasDoDia({ ...vazio, formas: lista }, HOJE, AGORA).formas;

  it("recusada entra, com o motivo; depois de Ajustar continua", () => {
    expect(formas([forma({ status: "recusada", respostas: [recusa("Datas erradas")] })]).recusadas).toEqual([
      { negocio_id: "n1", nome: "Maria Souza", motivo: "Datas erradas" },
    ]);
    expect(formas([forma({ status: "rascunho", respostas: [recusa(null)] })]).recusadas).toHaveLength(1);
  });

  it("enviada de novo, a recusa sai", () => {
    expect(
      formas([forma({ status: "enviada", respostas: [recusa("x")], links: [link("2026-11-27T03:00:00Z")] })])
        .recusadas,
    ).toEqual([]);
  });

  it("confirmada pela equipe depois da recusa: sai da recusa e entra em pronto para o contrato", () => {
    const a = formas([
      forma({
        status: "confirmada",
        respostas: [
          recusa("x"),
          {
            decision: "confirmada_pela_equipe",
            reason: null,
            answered_at: "2026-11-25T10:00:00Z",
            created_at: "2026-11-25T10:00:00Z",
          },
        ],
      }),
    ]);
    expect(a.recusadas).toEqual([]);
    expect(a.prontas).toEqual([{ negocio_id: "n1", nome: "Maria Souza" }]);
  });

  it("confirmada com as cobranças já criadas não está mais pronta", () => {
    expect(formas([forma({ status: "confirmada", charges_created_at: "2026-11-25T10:00:00Z" })]).prontas).toEqual([]);
  });

  it("link vencido um minuto antes de agora avisa; um minuto depois, não", () => {
    expect(formas([forma({ status: "enviada", links: [link("2026-11-26T14:59:00Z")] })]).vencidas).toEqual([
      { negocio_id: "n1", nome: "Maria Souza" },
    ]);
    expect(formas([forma({ status: "enviada", links: [link("2026-11-26T15:01:00Z")] })]).vencidas).toEqual([]);
  });

  it("rascunho que nunca foi respondido não avisa", () => {
    const a = formas([forma()]);
    expect([...a.recusadas, ...a.prontas, ...a.vencidas]).toEqual([]);
  });

  it("só um aviso de forma já tira o 'nada vencendo'", () => {
    const a = alertasDoDia({ ...vazio, formas: [forma({ status: "confirmada" })] }, HOJE, AGORA);
    expect(a.vazio).toBe(false);
  });
});
