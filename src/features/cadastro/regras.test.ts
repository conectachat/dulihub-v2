import { describe, expect, it } from "vitest";

import {
  declaracao,
  linkDoWhatsApp,
  linkVigente,
  mensagemDoWhatsApp,
  situacaoDaFicha,
  urlDaFicha,
  validadeDoLink,
} from "./regras";

/**
 * O que a equipe vê sobre a ficha de cadastro de um contato, e o texto que
 * sai pelo WhatsApp. Nada aqui toca o banco.
 */

const AGORA = new Date("2026-10-03T12:00:00Z");

const link = (campos: Partial<Parameters<typeof situacaoDaFicha>[0] & object> = {}) => ({
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
    expect(situacaoDaFicha(link(), AGORA)).toBe("aguardando");
  });

  it("passou do prazo sem resposta: expirada", () => {
    expect(situacaoDaFicha(link({ expires_at: "2026-10-03T11:59:00Z" }), AGORA)).toBe(
      "expirada",
    );
  });

  it("cancelado volta a ser sem link — é o que deixa gerar outro", () => {
    expect(
      situacaoDaFicha(link({ cancelled_at: "2026-10-02T12:00:00Z" }), AGORA),
    ).toBe("sem-link");
  });

  it("enviada e ainda não conferida: recebida", () => {
    expect(
      situacaoDaFicha(link({ submitted_at: "2026-10-02T12:00:00Z" }), AGORA),
    ).toBe("recebida");
  });

  it("enviada vale mesmo com o prazo vencido depois", () => {
    expect(
      situacaoDaFicha(
        link({ submitted_at: "2026-10-02T12:00:00Z", expires_at: "2026-10-03T00:00:00Z" }),
        AGORA,
      ),
    ).toBe("recebida");
  });

  it("conferida para de avisar", () => {
    expect(
      situacaoDaFicha(
        link({
          submitted_at: "2026-10-02T12:00:00Z",
          reviewed_at: "2026-10-03T09:00:00Z",
        }),
        AGORA,
      ),
    ).toBe("conferida");
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
