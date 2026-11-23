import { describe, expect, it } from "vitest";

import {
  declaracao,
  fichaRecebida,
  linkAtual,
  linkDoWhatsApp,
  linkVigente,
  mensagemDaFormaNoWhatsApp,
  mensagemDoWhatsApp,
  situacaoDaFicha,
  situacaoDoCadastro,
  ultimoDiaDoLink,
  urlDaFicha,
  validadeDoLink,
  type LinkLido,
} from "./regras";

/**
 * O que a equipe vê sobre a ficha de cadastro de um contato, e o texto que
 * sai pelo WhatsApp. Nada aqui toca o banco.
 */

const AGORA = new Date("2026-10-03T12:00:00Z");

/** Um link lido do banco. Sem `created_at` informado, o de 02/10. */
const link = (campos: Partial<LinkLido> = {}): LinkLido => ({
  created_at: "2026-10-02T10:00:00Z",
  expires_at: "2026-10-18T12:00:00Z",
  cancelled_at: null,
  submitted_at: null,
  reviewed_at: null,
  closed_at: null,
  ...campos,
});

/** Ficha comum enviada: a 0065 grava `submitted_at` e `closed_at` juntos. */
const enviada = (em: string, campos: Partial<LinkLido> = {}) =>
  link({ submitted_at: em, closed_at: em, ...campos });

describe("situacaoDoCadastro — um link só", () => {
  it("sem link nenhum", () => {
    expect(situacaoDoCadastro([], AGORA)).toBe("sem-link");
  });

  it("link aberto e dentro do prazo: aguardando o lead", () => {
    expect(situacaoDoCadastro([link()], AGORA)).toBe("aguardando");
  });

  it("passou do prazo sem resposta: expirada", () => {
    expect(situacaoDoCadastro([link({ expires_at: "2026-10-03T11:59:00Z" })], AGORA)).toBe(
      "expirada",
    );
  });

  it("cancelado volta a ser sem link — é o que deixa gerar outro", () => {
    expect(situacaoDoCadastro([link({ cancelled_at: "2026-10-02T12:00:00Z" })], AGORA)).toBe(
      "sem-link",
    );
  });

  it("enviada e ainda não conferida: recebida", () => {
    expect(situacaoDoCadastro([enviada("2026-10-02T12:00:00Z")], AGORA)).toBe("recebida");
  });

  it("enviada vale mesmo com o prazo vencido depois", () => {
    expect(
      situacaoDoCadastro(
        [enviada("2026-10-02T12:00:00Z", { expires_at: "2026-10-03T00:00:00Z" })],
        AGORA,
      ),
    ).toBe("recebida");
  });

  it("conferida para de avisar", () => {
    expect(
      situacaoDoCadastro(
        [enviada("2026-10-02T12:00:00Z", { reviewed_at: "2026-10-03T09:00:00Z" })],
        AGORA,
      ),
    ).toBe("conferida");
  });
});

describe("a ficha recebida e o link atual são coisas separadas (I4)", () => {
  const recebida = enviada("2026-09-20T12:00:00Z", { created_at: "2026-09-19T10:00:00Z" });
  const novo = link({ created_at: "2026-10-01T10:00:00Z" });

  it("um link novo não esconde a ficha recebida e não conferida", () => {
    expect(fichaRecebida([recebida, novo])).toBe(recebida);
    expect(linkAtual([recebida, novo])).toBe(novo);
    expect(situacaoDoCadastro([recebida, novo], AGORA)).toBe("recebida");
  });

  it("depois do Conferi, vale o link novo", () => {
    const conferida = { ...recebida, reviewed_at: "2026-10-02T09:00:00Z" };
    expect(situacaoDoCadastro([conferida, novo], AGORA)).toBe("aguardando");
  });

  it("ficha cancelada depois dos dados (Editar a forma enviada) continua recebida", () => {
    const editada = link({
      submitted_at: "2026-10-02T11:00:00Z",
      cancelled_at: "2026-10-02T12:00:00Z",
    });
    expect(fichaRecebida([editada])).toBe(editada);
    expect(linkAtual([editada])).toBeNull();
  });

  it("link com a forma, dados enviados e pagamento pendente: é a ficha e o link atual", () => {
    const pendente = link({ submitted_at: "2026-10-02T11:00:00Z" });
    expect(fichaRecebida([pendente])).toBe(pendente);
    expect(linkAtual([pendente])).toBe(pendente);
  });

  it("a mais recente de cada uma, na ordem que vier", () => {
    const outra = enviada("2026-10-01T12:00:00Z", { created_at: "2026-10-01T09:00:00Z" });
    expect(fichaRecebida([outra, recebida])).toBe(outra);
    expect(fichaRecebida([recebida, outra])).toBe(outra);
  });

  it("só cancelados, sem dados, é o mesmo que nenhum", () => {
    const cancelado = link({ cancelled_at: "2026-10-02T10:00:00Z" });
    expect(fichaRecebida([cancelado])).toBeNull();
    expect(linkAtual([cancelado])).toBeNull();
  });
});

describe("ultimoDiaDoLink", () => {
  it("o dia antes do instante gravado, em São Paulo (foco 3)", () => {
    // 3 dias úteis a partir de segunda, 23/11: vale até quinta, 26/11; o banco
    // grava o início de sexta em São Paulo.
    expect(ultimoDiaDoLink("2026-11-27T03:00:00+00:00")).toBe("2026-11-26");
  });
});

describe("mensagemDaFormaNoWhatsApp", () => {
  it("chama pelo primeiro nome, leva o link e diz até quando vale", () => {
    const texto = mensagemDaFormaNoWhatsApp("Ricardo Wiest", "https://x/cadastro/abc", "2026-11-26");

    expect(texto).toContain("Olá, Ricardo!");
    expect(texto).toContain("forma de pagamento");
    expect(texto).toContain("https://x/cadastro/abc");
    expect(texto.endsWith("O link é só seu e vale até quinta-feira, 26/11.")).toBe(true);
  });
});

describe("validadeDoLink", () => {
  it("15 dias a partir de agora", () => {
    expect(validadeDoLink(AGORA).toISOString()).toBe("2026-10-18T12:00:00.000Z");
  });
});

describe("urlDaFicha", () => {
  it("monta o endereço público, sem barra dobrada", () => {
    expect(urlDaFicha("https://dulihub-v2.vercel.app/", "abc")).toBe(
      "https://dulihub-v2.vercel.app/cadastro/abc",
    );
  });
});

describe("mensagemDoWhatsApp", () => {
  it("chama pelo primeiro nome e leva o link", () => {
    const texto = mensagemDoWhatsApp("Ana de Teste", "https://x/cadastro/abc");

    expect(texto).toContain("Olá, Ana!");
    expect(texto).toContain("https://x/cadastro/abc");
    expect(texto).not.toContain("de Teste");
  });
});

describe("linkDoWhatsApp", () => {
  it("abre a conversa do contato com a mensagem pronta", () => {
    const url = linkDoWhatsApp("+55", "(98) 99999-0000", "Olá, Ana!");

    expect(url).toBe("https://wa.me/5598999990000?text=Ol%C3%A1%2C%20Ana!");
  });

  it("sem DDI, assume o Brasil", () => {
    expect(linkDoWhatsApp(null, "98999990000", "oi")).toBe(
      "https://wa.me/5598999990000?text=oi",
    );
  });

  it("sem telefone não há conversa para abrir", () => {
    expect(linkDoWhatsApp("+55", null, "oi")).toBeNull();
    expect(linkDoWhatsApp("+55", " ", "oi")).toBeNull();
  });
});

describe("declaracao", () => {
  it("nomeia a organização que vai usar os dados", () => {
    expect(declaracao("Duli Consulting")).toContain("junto à Duli Consulting.");
  });
});

/* As de antes da 4b: saem junto com o último uso (contato e quadro). */

const linkAntigo = (campos: Partial<Parameters<typeof situacaoDaFicha>[0] & object> = {}) => ({
  expires_at: "2026-10-18T12:00:00Z",
  cancelled_at: null,
  submitted_at: null,
  reviewed_at: null,
  ...campos,
});

describe("situacaoDaFicha", () => {
  it("sem link nenhum", () => {
    expect(situacaoDaFicha(null, AGORA)).toBe("sem-link");
  });

  it("link aberto e dentro do prazo: aguardando o lead", () => {
    expect(situacaoDaFicha(linkAntigo(), AGORA)).toBe("aguardando");
  });

  it("passou do prazo sem resposta: expirada", () => {
    expect(situacaoDaFicha(linkAntigo({ expires_at: "2026-10-03T11:59:00Z" }), AGORA)).toBe(
      "expirada",
    );
  });

  it("cancelado volta a ser sem link — é o que deixa gerar outro", () => {
    expect(
      situacaoDaFicha(linkAntigo({ cancelled_at: "2026-10-02T12:00:00Z" }), AGORA),
    ).toBe("sem-link");
  });

  it("enviada e ainda não conferida: recebida", () => {
    expect(
      situacaoDaFicha(linkAntigo({ submitted_at: "2026-10-02T12:00:00Z" }), AGORA),
    ).toBe("recebida");
  });

  it("enviada vale mesmo com o prazo vencido depois", () => {
    expect(
      situacaoDaFicha(
        linkAntigo({ submitted_at: "2026-10-02T12:00:00Z", expires_at: "2026-10-03T00:00:00Z" }),
        AGORA,
      ),
    ).toBe("recebida");
  });

  it("conferida para de avisar", () => {
    expect(
      situacaoDaFicha(
        linkAntigo({
          submitted_at: "2026-10-02T12:00:00Z",
          reviewed_at: "2026-10-03T09:00:00Z",
        }),
        AGORA,
      ),
    ).toBe("conferida");
  });
});

describe("linkVigente", () => {
  const de = (created_at: string, campos: Record<string, string | null> = {}) => ({
    created_at,
    expires_at: "2026-10-18T12:00:00Z",
    cancelled_at: null,
    submitted_at: null,
    reviewed_at: null,
    ...campos,
  });

  it("sem link, nulo", () => {
    expect(linkVigente([])).toBeNull();
  });

  it("o mais recente que não foi cancelado", () => {
    const antigo = de("2026-09-01T10:00:00Z", { submitted_at: "2026-09-02T10:00:00Z" });
    const novo = de("2026-10-01T10:00:00Z");

    expect(linkVigente([antigo, novo])).toBe(novo);
    expect(linkVigente([novo, antigo])).toBe(novo);
  });

  it("cancelado não conta: vale a ficha recebida antes dele", () => {
    const recebida = de("2026-09-01T10:00:00Z", { submitted_at: "2026-09-02T10:00:00Z" });
    const cancelado = de("2026-10-01T10:00:00Z", { cancelled_at: "2026-10-02T10:00:00Z" });

    expect(linkVigente([recebida, cancelado])).toBe(recebida);
  });

  it("só cancelados é o mesmo que nenhum", () => {
    expect(
      linkVigente([de("2026-10-01T10:00:00Z", { cancelled_at: "2026-10-02T10:00:00Z" })]),
    ).toBeNull();
  });
});
