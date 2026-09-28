import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { alertasDoDia } from "@/features/painel/regras";

import { AlertasDoDia } from "./alertas";

/**
 * O topo da tela Início, desenhado.
 *
 * As regras têm teste próprio (`features/painel/regras.test.ts`). Aqui o que
 * se prova é o que a pessoa lê: que o vencido aparece com as palavras certas,
 * que o atalho leva ao lugar certo, e que "nada vencendo" é dito por extenso.
 */

const HOJE = "2026-10-15";
const vazio = { processos: [], pastas: [], etapas: [], parcelas: [] };

describe("AlertasDoDia", () => {
  it("sem nada vencendo, diz isso — e não deixa um espaço em branco", () => {
    render(<AlertasDoDia alertas={alertasDoDia(vazio, HOJE)} />);

    expect(screen.getByText(/Nada vencendo/)).toBeTruthy();
  });

  it("prazo de RFE vencido aparece com quanto tempo faz, e leva ao processo", () => {
    render(
      <AlertasDoDia
        alertas={alertasDoDia(
          {
            ...vazio,
            processos: [
              {
                id: "p1",
                title: "EB-1A",
                cliente: "Erick de Teste",
                rfe_due_on: "2026-10-12",
                rfe_answered_on: null,
                decided_on: null,
              },
            ],
          },
          HOJE,
        )}
      />,
    );

    expect(screen.getByText("Prazo de RFE")).toBeTruthy();
    expect(screen.getByText(/venceu há 3 dias/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Erick de Teste/ }).getAttribute("href")).toBe(
      "/projetos/p1",
    );
  });

  it("parcelas vencidas: total por moeda e atalho para o Financeiro já filtrado", () => {
    render(
      <AlertasDoDia
        alertas={alertasDoDia(
          {
            ...vazio,
            parcelas: [
              {
                amount: 1000,
                currency: "USD",
                due_on: "2026-10-01",
                paid_on: null,
                cliente: "Ana",
                person_id: "a1",
              },
            ],
          },
          HOJE,
        )}
      />,
    );

    expect(screen.getByText("Parcelas vencidas")).toBeTruthy();
    expect(screen.getByText(/US\$/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ver todas no Financeiro/ }).getAttribute("href"),
    ).toBe("/financeiro?filtro=vencidas");
  });

  it("pasta atrasada leva direto à aba de documentos do processo", () => {
    render(
      <AlertasDoDia
        alertas={alertasDoDia(
          {
            ...vazio,
            processos: [
              {
                id: "p1",
                title: "EB-1A",
                cliente: "Erick",
                rfe_due_on: null,
                rfe_answered_on: null,
                decided_on: null,
              },
            ],
            pastas: [
              { project_id: "p1", is_required: true, resolved_at: null, deadline_on: "2026-10-01" },
            ],
          },
          HOJE,
        )}
      />,
    );

    expect(screen.getByRole("link", { name: /Erick/ }).getAttribute("href")).toBe(
      "/projetos/p1?aba=documentos",
    );
  });
});
