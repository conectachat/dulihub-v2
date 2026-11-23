// @vitest-environment node

import { describe, expect, it } from "vitest";

import { formatarMoeda } from "@/lib/totals";

import {
  anotacaoDaCotacaoSchema,
  cotacaoSchema,
  formaSchema,
  observacaoSchema,
} from "./forma-schema";

/**
 * O que a tela e a ação aceitam como forma de pagamento. A primeira mensagem
 * é a que a pessoa lê, e ela é sempre em português.
 */

const parte = (extra: Record<string, unknown> = {}) => ({
  label: "Parcelas",
  method: "transferencia",
  currency: "USD",
  total: 9000,
  installments_count: 3,
  parcelas: [
    { number: 1, amount: 3000, due_on: "2026-12-10" },
    { number: 2, amount: 3000, due_on: "2027-01-10" },
    { number: 3, amount: 3000, due_on: "2027-02-10" },
  ],
  ...extra,
});

function primeiraFrase(entrada: unknown): string | undefined {
  const lido = formaSchema.safeParse(entrada);
  return lido.success ? undefined : lido.error.issues[0]?.message;
}

describe("formaSchema", () => {
  it("aceita a forma válida", () => {
    expect(formaSchema.safeParse({ partes: [parte()] }).success).toBe(true);
    expect(formaSchema.safeParse({ partes: [] }).success).toBe(true);
  });

  it("data inválida e valor acima do limite, com as frases das regras", () => {
    const p = parte();
    p.parcelas[0] = { ...p.parcelas[0]!, due_on: "2026-02-31" };
    expect(primeiraFrase({ partes: [p] })).toBe("A data da parcela 1 de Parcelas não é válida.");
    expect(primeiraFrase({ partes: [parte({ total: 10_000_000_000 })] })).toBe(
      "O valor de Parcelas passa do limite.",
    );
  });

  it("tipo errado dá a frase de formato, em português", () => {
    const formato = "A forma de pagamento veio num formato inválido.";
    expect(primeiraFrase({ partes: [parte({ method: "dinheiro" })] })).toBe(formato);
    expect(primeiraFrase({ partes: [parte({ total: "abc" })] })).toBe(formato);
    expect(primeiraFrase({ partes: "nada" })).toBe(formato);
    expect(primeiraFrase(null)).toBe(formato);
  });

  it("a soma errada dá a mesma frase das regras", () => {
    const p = parte();
    p.parcelas[2] = { ...p.parcelas[2]!, amount: 2999.99 };
    expect(primeiraFrase({ partes: [p] })).toBe(
      "As parcelas de Parcelas somam " +
        formatarMoeda(8999.99, "USD") +
        "; o total é " +
        formatarMoeda(9000, "USD") +
        ".",
    );
  });

  it("o rótulo vai aparado, também do espaço rígido que o trim do banco não tira", () => {
    const lido = formaSchema.parse({ partes: [parte({ label: " Entrada\u00a0" })] });
    expect(lido.partes[0]!.label).toBe("Entrada");
  });

  it("a 11ª parte é recusada", () => {
    expect(primeiraFrase({ partes: Array.from({ length: 11 }, () => parte()) })).toBe(
      "A forma vai até 10 partes.",
    );
  });
});

describe("formaSchema — a conversão (FIC-13)", () => {
  it("o tipo errado dá a frase de formato", () => {
    expect(primeiraFrase({ partes: [parte({ usd_equivalent: "abc" })] })).toBe(
      "A forma de pagamento veio num formato inválido.",
    );
  });

  it("sem a chave, é sem conversão", () => {
    const lido = formaSchema.parse({ partes: [parte()] });
    expect(lido.partes[0]!.usd_equivalent).toBeNull();
  });

  it("conversão em parte de dólar é recusada com a frase de erroDaParte", () => {
    expect(primeiraFrase({ partes: [parte({ usd_equivalent: 9000 })] })).toBe(
      "Só a parte em reais é convertida de dólar.",
    );
  });
});

describe("observacaoSchema", () => {
  it("vazia vira nulo; até 500 caracteres", () => {
    expect(observacaoSchema.parse("  ")).toBeNull();
    expect(observacaoSchema.parse(null)).toBeNull();
    expect(observacaoSchema.parse(" acertado por WhatsApp ")).toBe("acertado por WhatsApp");
    const longa = observacaoSchema.safeParse("x".repeat(501));
    expect(longa.success).toBe(false);
    expect(longa.error?.issues[0]?.message).toBe("A observação vai até 500 caracteres.");
  });
});

describe("cotacaoSchema", () => {
  it("lê como a cotação da baixa (foco 2 do plano anterior, G3)", () => {
    expect(cotacaoSchema.parse("5,425")).toBe(5.425);
    expect(cotacaoSchema.parse("")).toBeNull();
    expect(cotacaoSchema.parse(null)).toBeNull();
  });

  it("zero, negativa ou lixo são recusados com a frase", () => {
    for (const ruim of ["0", "-5", "abc"]) {
      const lido = cotacaoSchema.safeParse(ruim);
      expect(lido.success).toBe(false);
      expect(lido.error?.issues[0]?.message).toBe("Informe uma cotação maior que zero.");
    }
  });

  it("até 4 casas decimais, que é o que a coluna guarda — sem arredondar calado", () => {
    expect(cotacaoSchema.parse("5,4321")).toBe(5.4321);
    const longa = cotacaoSchema.safeParse("5,43215");
    expect(longa.success).toBe(false);
    expect(longa.error?.issues[0]?.message).toBe("Use no máximo 4 casas decimais na cotação.");
  });

  it("acima do que numeric(12,4) guarda: a frase, não o código do banco", () => {
    expect(cotacaoSchema.parse("99999999,9999")).toBe(99999999.9999);
    const grande = cotacaoSchema.safeParse("100000000");
    expect(grande.success).toBe(false);
    expect(grande.error?.issues[0]?.message).toBe("A cotação passa do limite.");
  });
});

describe("anotacaoDaCotacaoSchema", () => {
  it("vazia vira nulo; até 200 caracteres", () => {
    expect(anotacaoDaCotacaoSchema.parse("")).toBeNull();
    expect(anotacaoDaCotacaoSchema.parse(" C6, hoje ")).toBe("C6, hoje");
    const longa = anotacaoDaCotacaoSchema.safeParse("x".repeat(201));
    expect(longa.success).toBe(false);
    expect(longa.error?.issues[0]?.message).toBe("A anotação da cotação vai até 200 caracteres.");
  });
});
