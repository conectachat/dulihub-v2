import { describe, expect, it } from "vitest";

import { diferencaDeParticipantes } from "./participantes";

/**
 * Participantes do cliente e do negócio gravam só a diferença: entra quem é
 * novo, sai quem foi desmarcado, e quem continua não é regravado.
 */

describe("diferencaDeParticipantes", () => {
  it("entra quem é novo e sai quem foi desmarcado", () => {
    expect(diferencaDeParticipantes(["u1", "u2"], ["u2", "u3"])).toEqual({
      entram: ["u3"],
      saem: ["u1"],
    });
  });

  it("sem mudança, ninguém entra nem sai", () => {
    expect(diferencaDeParticipantes(["u1"], ["u1"])).toEqual({ entram: [], saem: [] });
  });

  it("repetido no formulário conta uma vez", () => {
    expect(diferencaDeParticipantes([], ["u1", "u1"])).toEqual({ entram: ["u1"], saem: [] });
  });
});
