import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A aba Documentos do cliente (CLI-8): o envio fica em cima, com a categoria
 * escolhida antes; a lista vem agrupada por categoria.
 */

const upload = vi.fn(async () => ({ error: null }));
const remove = vi.fn(async () => ({ error: null }));
const registrarDocumento = vi.fn(async () => ({ error: null }));
const refresh = vi.fn();
const erroNaTela = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: (m: string) => erroNaTela(m) } }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload, remove }) } }),
}));
vi.mock("@/features/clientes/documentos-actions", () => ({
  registrarDocumento: (...a: unknown[]) => registrarDocumento(...(a as [])),
  enderecoDoDocumento: vi.fn(),
  excluirDocumento: vi.fn(),
}));

const { DocumentosDoCliente } = await import("./documentos");

const doc = (id: string, category: string, filename: string) => ({
  id,
  category,
  filename,
  mime_type: "application/pdf",
  size_bytes: 1000,
  created_at: "2026-11-10T12:00:00Z",
});

beforeEach(() => vi.clearAllMocks());

describe("aba Documentos", () => {
  it("sem documento, diz o que guardar aqui", () => {
    render(<DocumentosDoCliente pessoaId="p1" organizationId="o1" documentos={[]} />);

    expect(screen.getByText("Nenhum documento ainda.")).toBeTruthy();
  });

  it("agrupa por categoria, na ordem combinada", () => {
    render(
      <DocumentosDoCliente
        pessoaId="p1"
        organizationId="o1"
        documentos={[doc("1", "contrato", "contrato.pdf"), doc("2", "identidade", "rg.pdf")]}
      />,
    );

    const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Identidade", "Contrato"]);
  });

  it("envia na categoria escolhida, no caminho da pessoa, e atualiza a lista", async () => {
    const { container } = render(
      <DocumentosDoCliente pessoaId="p1" organizationId="o1" documentos={[]} />,
    );

    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "contrato" } });
    const arquivo = new File(["%PDF"], "Contrato assinado.pdf", { type: "application/pdf" });
    const entrada = container.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(entrada, { target: { files: [arquivo] } });
    });

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^o1\/p1\/[0-9a-f-]{36}\/contrato-assinado\.pdf$/),
      arquivo,
      { contentType: "application/pdf" },
    );
    expect(registrarDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ pessoaId: "p1", categoria: "contrato", nome: "Contrato assinado.pdf" }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("registro que lança: o botão volta, o erro aparece e o objeto é removido", async () => {
    registrarDocumento.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { container } = render(
      <DocumentosDoCliente pessoaId="p1" organizationId="o1" documentos={[]} />,
    );
    const arquivo = new File(["%PDF"], "rg.pdf", { type: "application/pdf" });
    const entrada = container.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(entrada, { target: { files: [arquivo] } });
    });

    expect(remove).toHaveBeenCalled();
    expect(erroNaTela).toHaveBeenCalledWith("rg.pdf: não foi possível registrar. Tente de novo.");
    const botao = screen.getByRole("button", { name: /Enviar documento/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
  });
});
