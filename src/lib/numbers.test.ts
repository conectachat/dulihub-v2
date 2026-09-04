import { describe, expect, it } from "vitest";

import { parseMoney, parseWholeNumber } from "./numbers";

/**
 * Havia duas cópias deste parser — valor de oportunidade e preço-base do tipo
 * de visto — e as duas tinham o mesmo defeito, com o mesmo comentário por cima
 * prometendo o contrário:
 *
 *     // Aceita "12.500,00" e "12500.00": o usuário digita como fala.
 *     Number(v.replace(/\./g, "").replace(",", "."))
 *
 * Tirar todos os pontos transforma `2000.00` em `200000`. Cem vezes o valor,
 * gravado calado, num campo que vira contrato e cobrança.
 *
 * A regra agora é a que gente usa de verdade: **manda o último separador.**
 * Se o último for vírgula, os pontos são de milhar; se for ponto, as vírgulas
 * é que são. Com um separador só, três casas depois dele indicam milhar —
 * `1.500` é mil e quinhentos, `1.50` é um e cinquenta.
 */

describe("parseMoney", () => {
  it("lê o jeito brasileiro", () => {
    expect(parseMoney("12.500,00")).toBe(12500);
    expect(parseMoney("1.234.567,89")).toBe(1234567.89);
    expect(parseMoney("12500,00")).toBe(12500);
    expect(parseMoney("0,50")).toBe(0.5);
  });

  it("lê o jeito americano — era aqui que multiplicava por cem", () => {
    expect(parseMoney("12500.00")).toBe(12500);
    expect(parseMoney("2000.00")).toBe(2000);
    expect(parseMoney("6000.50")).toBe(6000.5);
    expect(parseMoney("1,234.56")).toBe(1234.56);
  });

  it("lê número sem separador nenhum", () => {
    expect(parseMoney("12500")).toBe(12500);
    expect(parseMoney("0")).toBe(0);
  });

  it("com um separador só, três casas depois dele são milhar", () => {
    expect(parseMoney("1.500")).toBe(1500);
    expect(parseMoney("1,500")).toBe(1500);
    expect(parseMoney("1.50")).toBe(1.5);
    expect(parseMoney("1,50")).toBe(1.5);
  });

  it("ignora símbolo de moeda e espaço", () => {
    expect(parseMoney("R$ 1.200,50")).toBe(1200.5);
    expect(parseMoney("US$ 6,000.00")).toBe(6000);
    expect(parseMoney("  12500  ")).toBe(12500);
  });

  it("devolve null para vazio e para o que não é número", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("R$")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("aceita negativo, que estorno vai precisar", () => {
    expect(parseMoney("-1.200,50")).toBe(-1200.5);
  });

  it("zero é zero, e não nulo", () => {
    // `Number(v) || null` — o padrão que está em quatro lugares no projeto —
    // transforma zero em nulo. Consultoria de cortesia tem preço zero, e
    // prazo de zero dia é "no mesmo dia", não "sem prazo".
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("0,00")).toBe(0);
    expect(parseMoney("0.00")).toBe(0);
  });
});

describe("parseWholeNumber", () => {
  it("lê o inteiro", () => {
    expect(parseWholeNumber("30")).toBe(30);
    expect(parseWholeNumber("  120  ")).toBe(120);
  });

  it("zero é zero, não nulo", () => {
    // `Number(v) || null` devolvia null aqui, e prazo de zero dia quer dizer
    // "no mesmo dia" — informação diferente de "sem prazo".
    expect(parseWholeNumber("0")).toBe(0);
  });

  it("devolve null para vazio, texto e valor quebrado", () => {
    expect(parseWholeNumber("")).toBeNull();
    expect(parseWholeNumber("abc")).toBeNull();
    expect(parseWholeNumber("30 dias")).toBeNull();
    expect(parseWholeNumber("1.5")).toBeNull();
    expect(parseWholeNumber("-5")).toBeNull();
    expect(parseWholeNumber(null)).toBeNull();
  });
});
