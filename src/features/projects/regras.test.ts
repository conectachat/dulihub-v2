import { describe, expect, it } from "vitest";

import {
  caminhoDoArquivo,
  caminhoPertence,
  arquivoAceito,
  motivoDeRecusa,
  podeResolver,
  prazoDaPasta,
  progresso,
  resumoDosArquivos,
  tipoDeVisualizacao,
} from "./regras";

/**
 * Regras do processo que não dependem do banco.
 *
 * Cada uma decide algo que o Renato vê e em que confia: a barra de progresso,
 * o prazo de uma pasta, onde o arquivo do cliente mora, e se uma recusa diz ao
 * cliente o que ele precisa trocar.
 */

describe("progresso", () => {
  const pasta = (is_required: boolean, resolvida: boolean) => ({
    is_required,
    resolved_at: resolvida ? "2026-09-18T12:00:00Z" : null,
  });

  it("conta só as pastas obrigatórias", () => {
    // Opcional resolvida não empurra a barra: ela mede o que falta para o
    // processo poder seguir, e opcional nunca impede de seguir.
    expect(
      progresso([pasta(true, true), pasta(true, false), pasta(false, true)]),
    ).toEqual({ resolvidas: 1, total: 2, percentual: 50 });
  });

  it("arredonda para baixo — 99% não pode virar 100% com pasta faltando", () => {
    const pastas = [
      ...Array.from({ length: 199 }, () => pasta(true, true)),
      pasta(true, false),
    ];
    expect(progresso(pastas).percentual).toBe(99);
  });

  it("sem pasta obrigatória, não há o que medir", () => {
    // Nulo e não 100%: um processo sem exigência nenhuma não está "completo",
    // está sem configuração. A tela mostra isso em vez de uma barra cheia.
    expect(progresso([pasta(false, false)])).toEqual({
      resolvidas: 0,
      total: 0,
      percentual: null,
    });
    expect(progresso([]).percentual).toBeNull();
  });
});

describe("prazoDaPasta", () => {
  it("soma os dias corridos à data de início do processo", () => {
    expect(prazoDaPasta("2026-09-18", 15)).toBe("2026-10-03");
  });

  it("atravessa virada de mês e de ano", () => {
    expect(prazoDaPasta("2026-12-20", 15)).toBe("2027-01-04");
  });

  it("não sofre com fuso: meia-noite continua sendo o mesmo dia", () => {
    // Data sem hora, tratada como data. Com `new Date("2026-09-18")` o fuso de
    // São Paulo devolveria dia 17 à noite e o prazo andaria um dia para trás.
    expect(prazoDaPasta("2026-09-18", 0)).toBe("2026-09-18");
  });

  it("sem prazo configurado, não inventa um", () => {
    expect(prazoDaPasta("2026-09-18", null)).toBeNull();
  });
});

describe("caminhoDoArquivo", () => {
  const ids = {
    organizacao: "11111111-1111-1111-1111-111111111111",
    processo: "22222222-2222-2222-2222-222222222222",
    pasta: "33333333-3333-3333-3333-333333333333",
    arquivo: "44444444-4444-4444-4444-444444444444",
  };

  it("começa pela organização — é por ela que o Storage separa quem vê o quê", () => {
    const caminho = caminhoDoArquivo({ ...ids, nome: "passaporte.pdf" });
    expect(caminho.split("/")[0]).toBe(ids.organizacao);
    expect(caminho).toBe(
      `${ids.organizacao}/${ids.processo}/${ids.pasta}/${ids.arquivo}-passaporte.pdf`,
    );
  });

  it("limpa o nome: acento, espaço e barra não entram no caminho", () => {
    const caminho = caminhoDoArquivo({
      ...ids,
      nome: "Holerite de Março/2026 (1).PDF",
    });
    expect(caminho.endsWith(`${ids.arquivo}-holerite-de-marco-2026-1.pdf`)).toBe(
      true,
    );
    // Uma barra no nome criaria uma pasta a mais e tiraria o arquivo da pasta
    // do processo, fora do alcance da policy.
    expect(caminho.split("/")).toHaveLength(4);
  });

  it("nome sem nada aproveitável ainda gera caminho válido", () => {
    const caminho = caminhoDoArquivo({ ...ids, nome: "///.pdf" });
    expect(caminho.endsWith(`${ids.arquivo}-arquivo.pdf`)).toBe(true);
  });
});

describe("caminhoPertence", () => {
  it("aceita só caminho do processo e da pasta informados", () => {
    // O navegador sobe o arquivo e o servidor registra. O servidor não pode
    // registrar, numa pasta, um caminho que aponta para outra.
    const base = "org/proc/pasta/arq-x.pdf";
    expect(caminhoPertence(base, { organizacao: "org", processo: "proc", pasta: "pasta" })).toBe(true);
    expect(caminhoPertence(base, { organizacao: "org", processo: "proc", pasta: "outra" })).toBe(false);
    expect(caminhoPertence("org/proc/pasta/../../x", { organizacao: "org", processo: "proc", pasta: "pasta" })).toBe(false);
    expect(caminhoPertence("org/proc/pasta/sub/x.pdf", { organizacao: "org", processo: "proc", pasta: "pasta" })).toBe(false);
  });
});

describe("motivoDeRecusa", () => {
  it("exige texto — é o que o cliente lê para saber o que trocar", () => {
    expect(motivoDeRecusa("")).toEqual({ ok: false, erro: expect.any(String) });
    expect(motivoDeRecusa("   ")).toEqual({ ok: false, erro: expect.any(String) });
  });

  it("recusa motivo curto demais para orientar alguém", () => {
    expect(motivoDeRecusa("ruim").ok).toBe(false);
  });

  it("aceita e limpa espaços das pontas", () => {
    expect(motivoDeRecusa("  Documento ilegível, envie foto com mais luz  ")).toEqual({
      ok: true,
      motivo: "Documento ilegível, envie foto com mais luz",
    });
  });
});

describe("resumoDosArquivos", () => {
  it("conta por estado — o selo da linha da pasta", () => {
    expect(
      resumoDosArquivos([
        { review_status: "pending" },
        { review_status: "pending" },
        { review_status: "approved" },
        { review_status: "rejected" },
      ]),
    ).toEqual({ pendentes: 2, aprovados: 1, recusados: 1, total: 4 });
  });
});

describe("podeResolver", () => {
  const a = (review_status: string) => ({ review_status });

  it("pasta vazia ou toda aprovada resolve", () => {
    expect(podeResolver([])).toEqual({ ok: true });
    expect(podeResolver([a("approved"), a("approved")])).toEqual({ ok: true });
  });

  it("bloqueia e diz quantos faltam, em português de gente", () => {
    // Mesma regra do gatilho da 0026; aqui é para a tela explicar antes do
    // clique, em vez de mostrar o erro do banco depois.
    expect(podeResolver([a("pending"), a("pending"), a("rejected")])).toEqual({
      ok: false,
      motivo: "Falta revisar: 2 em análise e 1 recusado.",
    });
    expect(podeResolver([a("pending")])).toEqual({
      ok: false,
      motivo: "Falta revisar: 1 em análise.",
    });
    expect(podeResolver([a("rejected"), a("rejected")])).toEqual({
      ok: false,
      motivo: "Falta revisar: 2 recusados.",
    });
  });
});

describe("tipoDeVisualizacao", () => {
  it("PDF e imagem abrem no app; o resto baixa", () => {
    expect(tipoDeVisualizacao("application/pdf", "a.pdf")).toBe("pdf");
    expect(tipoDeVisualizacao("image/png", "a.png")).toBe("imagem");
    expect(tipoDeVisualizacao("image/jpeg", "a.jpg")).toBe("imagem");
    expect(
      tipoDeVisualizacao(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx",
      ),
    ).toBe("baixar");
  });

  it("HEIC do iPhone baixa — o navegador não desenha", () => {
    expect(tipoDeVisualizacao("image/heic", "foto.heic")).toBe("baixar");
  });

  it("sem tipo, decide pela extensão", () => {
    expect(tipoDeVisualizacao(null, "Passaporte.PDF")).toBe("pdf");
    expect(tipoDeVisualizacao("", "rg.jpeg")).toBe("imagem");
  });
});

describe("arquivoAceito", () => {
  const mb = 1024 * 1024;

  it("aceita PDF, imagem e Office até 20 MB", () => {
    expect(arquivoAceito({ name: "a.pdf", type: "application/pdf", size: 5 * mb })).toEqual({ ok: true });
    expect(arquivoAceito({ name: "a.xlsx", type: "", size: mb })).toEqual({ ok: true });
  });

  it("recusa acima de 20 MB, dizendo o tamanho", () => {
    expect(arquivoAceito({ name: "scan.pdf", type: "application/pdf", size: 25 * mb })).toEqual({
      ok: false,
      erro: "scan.pdf tem 25 MB — o limite é 20 MB.",
    });
  });

  it("recusa tipo fora da lista", () => {
    expect(arquivoAceito({ name: "video.mp4", type: "video/mp4", size: mb })).toEqual({
      ok: false,
      erro: "video.mp4: tipo não aceito. Use PDF, imagem, Word ou Excel.",
    });
  });
});
