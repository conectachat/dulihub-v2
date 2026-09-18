import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tabela de etapas como o Renato pediu (18/set): grupo fechado ao abrir,
 * seta que abre, "Definir data", conclusão só em etapa concluída.
 *
 * As ações são de servidor e não rodam aqui: viram funções de mentira que
 * guardam o que receberam.
 */

const chamadas: { acao: string; campos: Record<string, string> }[] = [];
const falsa = (acao: string) =>
  vi.fn(async (fd: FormData) => {
    chamadas.push({ acao, campos: Object.fromEntries(fd) as Record<string, string> });
    return { error: null, ok: true, token: crypto.randomUUID() };
  });

vi.mock("@/features/projects/actions", () => ({
  atualizarEtapa: falsa("atualizarEtapa"),
  criarEtapa: vi.fn(async () => ({ error: null })),
  excluirEtapa: falsa("excluirEtapa"),
  moverEtapa: falsa("moverEtapa"),
  mudarStatusDaEtapa: falsa("mudarStatusDaEtapa"),
}));

const { EtapasDoProcesso } = await import("./etapas");

const STATUS = [
  { id: "pend", label: "A fazer", color: "#999", is_done: false },
  { id: "feito", label: "Concluída", color: "#0a0", is_done: true },
];

const etapa = (
  id: string,
  name: string,
  extra: Partial<{
    parent_id: string | null;
    position: number;
    status_id: string;
    due_on: string | null;
    completed_on: string | null;
    source_stage_id: string | null;
  }> = {},
) => ({
  id,
  name,
  parent_id: null,
  position: 0,
  status_id: "pend",
  due_on: null,
  completed_on: null,
  source_stage_id: "molde",
  ...extra,
});

const ETAPAS = [
  etapa("a", "Welcome Email", { status_id: "feito", completed_on: "2026-02-25" }),
  etapa("b", "Análise", { position: 1, due_on: "2026-09-01" }),
  etapa("b1", "Petição", { parent_id: "b", status_id: "feito", completed_on: "2026-09-10" }),
  etapa("b2", "Cartas", { parent_id: "b", position: 1, source_stage_id: null }),
];

function desenhar() {
  return render(
    <EtapasDoProcesso
      processoId="p"
      etapas={ETAPAS}
      status={STATUS}
      hoje="2026-09-18"
    />,
  );
}

beforeEach(() => {
  chamadas.length = 0;
});

describe("EtapasDoProcesso", () => {
  it("numera e começa com o grupo fechado", () => {
    desenhar();
    expect(screen.getByText("Welcome Email")).toBeTruthy();
    expect(screen.getByText("Análise")).toBeTruthy();
    // Sub-etapas escondidas; o contador da mãe mostra quantas já concluíram.
    expect(screen.queryByText("Petição")).toBeNull();
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("a seta abre e fecha o grupo", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Análise" }));
    expect(screen.getByText("Petição")).toBeTruthy();
    expect(screen.getByText("só deste processo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fechar Análise" }));
    expect(screen.queryByText("Petição")).toBeNull();
  });

  it("sem data prevista mostra Definir data; vencida aparece em destaque", () => {
    desenhar();
    expect(
      screen.getByRole("button", { name: /Data prevista de Welcome Email: sem data/ }),
    ).toBeTruthy();
    expect(screen.getByText(/01\/09\/2026 · vencida/)).toBeTruthy();
  });

  it("data de conclusão só em etapa concluída", () => {
    desenhar();
    expect(
      screen.getByRole("button", { name: /Data de conclusão de Welcome Email: 25\/02\/2026/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Data de conclusão de Análise/ })).toBeNull();
  });

  it("definir data prevista envia a etapa, o campo e a data", async () => {
    desenhar();
    fireEvent.click(
      screen.getByRole("button", { name: /Data prevista de Welcome Email/ }),
    );
    const campo = screen.getByLabelText("Data prevista de Welcome Email");
    fireEvent.change(campo, { target: { value: "2026-10-05" } });
    await act(async () => {
      fireEvent.blur(campo);
    });
    expect(chamadas).toEqual([
      {
        acao: "atualizarEtapa",
        campos: { id: "a", campo: "due_on", valor: "2026-10-05" },
      },
    ]);
  });

  it("sair do campo sem mudar não grava nada", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: /Data prevista de Análise/ }));
    await act(async () => {
      fireEvent.blur(screen.getByLabelText("Data prevista de Análise"));
    });
    expect(chamadas).toEqual([]);
  });

  it("excluir pede confirmação e nomeia as sub-etapas que vão junto", async () => {
    desenhar();
    // Radix abre o menu no pointerdown, não no click.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Ações de Análise" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Excluir/ }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/Petição e Cartas/)).toBeTruthy();
    expect(chamadas).toEqual([]);
  });
});
