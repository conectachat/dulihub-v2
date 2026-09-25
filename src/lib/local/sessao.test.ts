// @vitest-environment node

import { describe, expect, it } from "vitest";

import { DIAS_PARA_GRAVAR, DIAS_PARA_LER, validadeDoEspelho } from "./sessao";

/**
 * O espelho tem prazo de validade.
 *
 * Decisão do Renato em 21/set: o aparelho recusa **gravar** depois de 7 dias
 * sem sincronizar com sucesso, e recusa **mostrar** depois de 14. O motivo é
 * o modo de falha desta arquitetura: um notebook esquecido numa gaveta abre
 * mostrando a configuração de um mês atrás como se fosse a de hoje, e
 * ninguém tem como desconfiar.
 *
 * Conta-se da última vez em que o **servidor respondeu**, não da última
 * tentativa — o mesmo critério do carimbo na barra lateral.
 */

const AGORA = new Date("2026-09-25T12:00:00Z");
const diasAtras = (n: number) =>
  new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("validadeDoEspelho", () => {
  it("recém-sincronizado faz tudo", () => {
    const v = validadeDoEspelho(diasAtras(0), AGORA);

    expect(v.diasParado).toBe(0);
    expect(v.podeGravar).toBe(true);
    expect(v.podeLer).toBe(true);
  });

  it("parado seis dias ainda grava", () => {
    expect(validadeDoEspelho(diasAtras(6), AGORA).podeGravar).toBe(true);
  });

  it("no sétimo dia para de gravar, e ainda mostra", () => {
    const v = validadeDoEspelho(diasAtras(DIAS_PARA_GRAVAR), AGORA);

    expect(v.podeGravar).toBe(false);
    expect(v.podeLer).toBe(true);
    expect(v.diasParado).toBe(7);
  });

  it("no décimo quarto dia para de mostrar", () => {
    const v = validadeDoEspelho(diasAtras(DIAS_PARA_LER), AGORA);

    expect(v.podeLer).toBe(false);
    expect(v.podeGravar).toBe(false);
  });

  it("nunca sincronizou não é vencido — é aparelho novo", () => {
    // Quem nunca sincronizou não tem o que mostrar de errado: o espelho está
    // vazio, e a tela já diz isso com as palavras certas. Recusar aqui
    // também daria duas mensagens diferentes para o mesmo estado.
    const v = validadeDoEspelho(null, AGORA);

    expect(v.diasParado).toBeNull();
    expect(v.podeGravar).toBe(true);
    expect(v.podeLer).toBe(true);
  });

  it("marca ilegível é tratada como aparelho novo, não como vencido", () => {
    // Bloquear o app por causa de uma data corrompida seria trocar um
    // problema pequeno por um grande.
    const v = validadeDoEspelho("não é data", AGORA);

    expect(v.diasParado).toBeNull();
    expect(v.podeLer).toBe(true);
  });

  it("relógio do aparelho atrasado não vence nada", () => {
    // Data no futuro = relógio errado, não espelho velho.
    const v = validadeDoEspelho("2027-01-01T00:00:00Z", AGORA);

    expect(v.diasParado).toBe(0);
    expect(v.podeGravar).toBe(true);
  });
});
