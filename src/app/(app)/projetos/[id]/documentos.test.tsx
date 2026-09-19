import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A aba Documentos como o Renato decidiu (19/set): árvore que abre no lugar,
 * resolver só com tudo aprovado, visualizar dentro do app, excluir aprovado
 * com confirmação que diz que estava aprovado.
 *
 * Ações de servidor viram funções de mentira que guardam o que receberam.
 */

const chamadas: { acao: string; campos: Record<string, string> }[] = [];
const falsa = (acao: string) =>
  vi.fn(async (fd: FormData) => {
    chamadas.push({ acao, campos: Object.fromEntries(fd) as Record<string, string> });
    return { error: null, ok: true, token: crypto.randomUUID() };
  });

vi.mock("@/features/projects/documentos-actions", () => ({
  atualizarPasta: falsa("atualizarPasta"),
  criarPasta: vi.fn(async () => ({ error: null })),
  excluirPasta: falsa("excluirPasta"),
  moverPasta: falsa("moverPasta"),
  resolverPasta: falsa("resolverPasta"),
  registrarArquivo: vi.fn(async () => ({ error: null })),
  aprovarArquivo: falsa("aprovarArquivo"),
  recusarArquivo: vi.fn(async () => ({ error: null })),
  excluirArquivo: falsa("excluirArquivo"),
  enderecoDoArquivo: vi.fn(async () => ({ url: "https://exemplo/arquivo.pdf", error: null })),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const { DocumentosDoProcesso } = await import("./documentos");

const arquivo = (id: string, review_status: string, extra = {}) => ({
  id,
  file_name: `${id}.pdf`,
  mime_type: "application/pdf",
  size_bytes: 2048,
  review_status,
  rejection_reason: review_status === "rejected" ? "Documento ilegível." : null,
  uploaded_at: "2026-09-19T12:00:00Z",
  reviewed_at: null,
  enviadoPor: "Renato",
  ...extra,
});

const pasta = (id: string, name: string, extra = {}) => ({
  id,
  name,
  parent_id: null as string | null,
  position: 0,
  is_required: true,
  deadline_on: null as string | null,
  resolved_at: null as string | null,
  source_document_type_id: "catalogo" as string | null,
  arquivos: [] as ReturnType<typeof arquivo>[],
  ...extra,
});

const PASTAS = [
  pasta("p1", "Passaporte", {
    arquivos: [arquivo("a1", "pending"), arquivo("a2", "approved")],
    deadline_on: "2026-09-01",
  }),
  pasta("p2", "Diplomas", { position: 1, arquivos: [arquivo("a3", "approved")] }),
  pasta("p3", "Extra", { position: 2, source_document_type_id: null, is_required: false }),
];

function desenhar() {
  return render(
    <DocumentosDoProcesso processoId="proc" organizationId="org" pastas={PASTAS} hoje="2026-09-19" />,
  );
}

beforeEach(() => {
  chamadas.length = 0;
});

describe("DocumentosDoProcesso", () => {
  it("mostra as pastas fechadas, com o selo de cada uma", () => {
    desenhar();
    expect(screen.getByText("Passaporte")).toBeTruthy();
    expect(screen.getByText("1 em análise · 1 aprovado")).toBeTruthy();
    expect(screen.getByText("Nenhum arquivo")).toBeTruthy();
    // Fechada: o arquivo não aparece.
    expect(screen.queryByText("a1.pdf")).toBeNull();
    expect(screen.getByText("só deste processo")).toBeTruthy();
    expect(screen.getByText(/01\/09\/2026 · vencido/)).toBeTruthy();
  });

  it("abre a pasta no lugar e mostra os arquivos", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Passaporte" }));
    expect(screen.getByText("a1.pdf")).toBeTruthy();
    expect(screen.getByText("Em análise")).toBeTruthy();
  });

  it("não deixa resolver com arquivo em análise, e diz por quê", () => {
    desenhar();
    const [resolverPassaporte, resolverDiplomas] = screen.getAllByRole("button", { name: /Resolver/ });
    expect((resolverPassaporte as HTMLButtonElement).disabled).toBe(true);
    expect(resolverPassaporte.getAttribute("title")).toBe("Falta revisar: 1 em análise.");
    expect((resolverDiplomas as HTMLButtonElement).disabled).toBe(false);
  });

  it("resolver envia a pasta", async () => {
    desenhar();
    const resolverDiplomas = screen.getAllByRole("button", { name: /Resolver/ })[1];
    await act(async () => {
      fireEvent.click(resolverDiplomas);
    });
    expect(chamadas).toEqual([{ acao: "resolverPasta", campos: { id: "p2", resolver: "true" } }]);
  });

  it("abre o arquivo no visualizador, com aprovar e recusar", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Passaporte" }));
    await act(async () => {
      fireEvent.click(screen.getByText("a1.pdf"));
    });

    const janela = await screen.findByRole("dialog");
    expect(within(janela).getByText("Passaporte · 1 de 2")).toBeTruthy();
    expect(within(janela).getByRole("button", { name: /Aprovar/ })).toBeTruthy();
    expect(within(janela).getByRole("button", { name: /Recusar/ })).toBeTruthy();
    expect(janela.querySelector("iframe")?.getAttribute("src")).toBe("https://exemplo/arquivo.pdf");

    await act(async () => {
      fireEvent.click(within(janela).getByRole("button", { name: /Aprovar/ }));
    });
    expect(chamadas).toEqual([{ acao: "aprovarArquivo", campos: { id: "a1" } }]);
  });

  it("excluir aprovado avisa que ele estava aprovado", async () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Passaporte" }));
    await act(async () => {
      fireEvent.click(screen.getByText("a2.pdf"));
    });
    const janela = await screen.findByRole("dialog");
    fireEvent.click(within(janela).getByRole("button", { name: /Excluir arquivo/ }));
    expect(within(janela).getByText(/já foi aprovado/)).toBeTruthy();
    expect(chamadas).toEqual([]);
  });
});
