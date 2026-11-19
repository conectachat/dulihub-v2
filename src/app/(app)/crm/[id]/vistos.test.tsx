import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * O cartão Vistos da tela do lead (CRM-13): acrescentar visto com o valor e a
 * moeda do preço, editar, remover, e o total por moeda. Em outra moeda o
 * valor vem em branco — nunca convertido. Negócio ganho só mostra.
 */

vi.mock("@/features/opportunities/itens-actions", () => ({
  adicionarItem: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
  editarItem: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
  removerItem: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
}));

const { adicionarItem } = await import("@/features/opportunities/itens-actions");
const { Vistos } = await import("./vistos");

const CATALOGO = [
  { id: "v-eb1", name: "EB-1A", base_price: 8000, currency: "USD", is_active: true },
  { id: "v-o1", name: "O-1", base_price: null, currency: "USD", is_active: true },
  { id: "v-velho", name: "Visto aposentado", base_price: 100, currency: "BRL", is_active: false },
];

const ITENS = [
  { id: "i1", visa_type_id: "v-eb1", visa_name: "EB-1A", amount: 8000, currency: "USD" },
  { id: "i2", visa_type_id: "v-o1", visa_name: "O-1", amount: 6000, currency: "USD" },
  { id: "i3", visa_type_id: null, visa_name: "Consultoria", amount: 1000, currency: "BRL" },
];

function abrirAcrescentar() {
  fireEvent.click(screen.getByRole("button", { name: "Acrescentar visto" }));
}

describe("Vistos", () => {
  it("acrescentar com o visto em USD preenche 8000 e USD", () => {
    render(<Vistos negocioId="n1" itens={[]} catalogo={CATALOGO} ganho={false} />);
    abrirAcrescentar();

    fireEvent.change(screen.getByLabelText("Visto"), { target: { value: "v-eb1" } });

    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("8000");
    expect((screen.getByLabelText("Moeda") as HTMLSelectElement).value).toBe("USD");
  });

  it("trocar a moeda para BRL esvazia o valor, e salvar sem valor mostra o erro", async () => {
    render(<Vistos negocioId="n1" itens={[]} catalogo={CATALOGO} ganho={false} />);
    abrirAcrescentar();
    fireEvent.change(screen.getByLabelText("Visto"), { target: { value: "v-eb1" } });

    fireEvent.change(screen.getByLabelText("Moeda"), { target: { value: "BRL" } });
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Acrescentar" }));
    expect(await screen.findByText("Informe o valor.")).toBeTruthy();
    expect(adicionarItem).not.toHaveBeenCalled();
  });

  it("o seletor só lista vistos ativos", () => {
    render(<Vistos negocioId="n1" itens={[]} catalogo={CATALOGO} ganho={false} />);
    abrirAcrescentar();

    const opcoes = [...(screen.getByLabelText("Visto") as HTMLSelectElement).options].map(
      (o) => o.text,
    );
    expect(opcoes).toContain("EB-1A");
    expect(opcoes).not.toContain("Visto aposentado");
  });

  it("negócio ganho mostra a lista sem acrescentar, editar nem remover", () => {
    render(<Vistos negocioId="n1" itens={ITENS} catalogo={CATALOGO} ganho />);

    expect(screen.getByText("EB-1A")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Acrescentar visto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar EB-1A" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remover EB-1A" })).toBeNull();
    expect(
      screen.getByText("Negócio ganho: para desistir de um visto, encerre o processo dele."),
    ).toBeTruthy();
  });

  it("negócio aberto oferece editar e remover cada visto", () => {
    render(<Vistos negocioId="n1" itens={ITENS} catalogo={CATALOGO} ganho={false} />);
    expect(screen.getByRole("button", { name: "Editar EB-1A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remover EB-1A" })).toBeTruthy();
  });

  it("o total aparece por moeda, sem somar uma na outra", () => {
    render(<Vistos negocioId="n1" itens={ITENS} catalogo={CATALOGO} ganho={false} />);
    const totais = within(screen.getByRole("group", { name: "Totais por moeda" }));
    expect(totais.getByText(/US\$\s14\.000/)).toBeTruthy();
    expect(totais.getByText(/R\$\s1\.000/)).toBeTruthy();
  });

  it("a moeda com total zero aparece", () => {
    render(
      <Vistos
        negocioId="n1"
        itens={[{ id: "i9", visa_type_id: "v-o1", visa_name: "O-1", amount: 0, currency: "USD" }]}
        catalogo={CATALOGO}
        ganho={false}
      />,
    );
    const totais = within(screen.getByRole("group", { name: "Totais por moeda" }));
    expect(totais.getByText(/US\$\s0/)).toBeTruthy();
  });
});
