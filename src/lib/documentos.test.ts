import { describe, expect, it } from "vitest";

import { cpfValido, formatarCep, formatarCpf, soDigitos } from "./documentos";

/**
 * CPF e CEP: o que o lead digita na ficha de cadastro e o que vai para o
 * contrato. CPF errado num contrato é contrato refeito — a conferência dos
 * dígitos pega o erro de digitação na hora, e não na assinatura.
 */

describe("soDigitos", () => {
  it("tira máscara, espaço e letra", () => {
    expect(soDigitos("529.982.247-25")).toBe("52998224725");
    expect(soDigitos(" 65000-000 ")).toBe("65000000");
    expect(soDigitos(null)).toBe("");
  });
});

describe("cpfValido", () => {
  it("aceita CPF certo, com ou sem máscara", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado — o erro de digitação", () => {
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("529.982.247-35")).toBe(false);
  });

  it("recusa sequência repetida, que passa na conta e não é CPF", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
  });

  it("recusa tamanho errado e vazio", () => {
    expect(cpfValido("5299822472")).toBe(false);
    expect(cpfValido("")).toBe(false);
    expect(cpfValido(null)).toBe(false);
  });
});

describe("formatarCpf", () => {
  it("põe a máscara em 11 dígitos, venham como vierem", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    // O cadastro antigo guardou com máscara; o novo guarda só dígitos.
    expect(formatarCpf("529.982.247-25")).toBe("529.982.247-25");
  });

  it("o que não tem 11 dígitos volta como está — melhor ver o dado torto que escondê-lo", () => {
    expect(formatarCpf("1234")).toBe("1234");
    expect(formatarCpf(null)).toBe("");
  });
});

describe("formatarCep", () => {
  it("põe o hífen em 8 dígitos", () => {
    expect(formatarCep("65000000")).toBe("65000-000");
    expect(formatarCep("65000-000")).toBe("65000-000");
  });

  it("código postal de outro país volta como está", () => {
    expect(formatarCep("SW1A 1AA")).toBe("SW1A 1AA");
    expect(formatarCep("32801")).toBe("32801");
  });
});
