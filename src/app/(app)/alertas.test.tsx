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
const vazio = { processos: [], pastas: [], etapas: [], parcelas: [], fichas: [] };

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
    // Quem tem cobrança é cliente (0045): o nome leva à aba Financeiro dele.
    expect(screen.getByRole("link", { name: "Ana" }).getAttribute("href")).toBe(
      "/clientes/a1?aba=financeiro",
    );
  });

  it.each([
    ["lead", "opportunity", "/contatos/c1#dados-cadastrais"],
    ["cliente", "client", "/clientes/c1?aba=dados"],
  ])("ficha recebida de %s leva aos dados cadastrais dele", (_, estagio, destino) => {
    render(
      <AlertasDoDia
        alertas={alertasDoDia(
          {
            ...vazio,
            fichas: [
              {
                person_id: "c1",
                cliente: "Ana de Teste",
                estagio,
                submitted_at: "2026-10-14T15:00:00Z",
                reviewed_at: null,
              },
            ],
          },
          HOJE,
        )}
      />,
    );

    expect(screen.getByText("Fichas de cadastro recebidas")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ana de Teste/ }).getAttribute("href")).toBe(destino);
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

  it("a forma de pagamento: recusada (com o motivo), pronta para o contrato e link vencido, cada uma levando ao negócio", () => {
    const agora = new Date("2026-11-26T15:00:00Z");
    render(
      <AlertasDoDia
        alertas={alertasDoDia(
          {
            ...vazio,
            formas: [
              {
                negocio_id: "n1",
                nome: "Ana Recusou",
                status: "recusada",
                charges_created_at: null,
                respostas: [
                  { decision: "recusada", reason: "Datas erradas", answered_at: "2026-11-24T13:00:00Z", created_at: "2026-11-24T13:00:00Z" },
                ],
                links: [],
              },
              {
                negocio_id: "n2",
                nome: "Bia Confirmou",
                status: "confirmada",
                charges_created_at: null,
                respostas: [],
                links: [],
              },
              {
                negocio_id: "n3",
                nome: "Caio Sumiu",
                status: "enviada",
                charges_created_at: null,
                respostas: [],
                links: [{ expires_at: "2026-11-26T03:00:00Z", closed_at: null, cancelled_at: null, created_at: "2026-11-20T12:00:00Z" }],
              },
            ],
          },
          HOJE,
          agora,
        )}
      />,
    );

    expect(screen.getByText("Forma de pagamento recusada — Ana Recusou")).toBeTruthy();
    expect(screen.getByText("Datas erradas")).toBeTruthy();
    expect(screen.getByText("Pronto para o contrato — Bia Confirmou")).toBeTruthy();
    expect(screen.getByText("Forma de pagamento sem resposta, link vencido — Caio Sumiu")).toBeTruthy();
    expect(screen.getByText("Forma de pagamento recusada — Ana Recusou").closest("a")!.getAttribute("href")).toBe("/crm/n1");
    expect(screen.getByText("Pronto para o contrato — Bia Confirmou").closest("a")!.getAttribute("href")).toBe("/crm/n2");
    expect(
      screen.getByText("Forma de pagamento sem resposta, link vencido — Caio Sumiu").closest("a")!.getAttribute("href"),
    ).toBe("/crm/n3");
  });

  it("a ficha só do pagamento não vira 'ficha recebida': ela não traz dados pessoais", () => {
    render(
      <AlertasDoDia
        alertas={alertasDoDia(
          {
            ...vazio,
            fichas: [
              { person_id: "p9", cliente: "Só Pagamento", estagio: "opportunity", submitted_at: null, reviewed_at: null },
            ],
          },
          HOJE,
        )}
      />,
    );
    expect(screen.queryByText("Só Pagamento")).toBeNull();
  });
});
