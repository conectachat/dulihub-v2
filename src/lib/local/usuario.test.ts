import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sem internet, o aparelho continua sabendo de quem é (G8 da revisão de
 * novembro).
 *
 * O login guardado dura cerca de uma hora. Passado isso, sem rede para
 * renová-lo, o `getSession()` tentava por ~25 s e devolvia nulo — e o app
 * respondia "Sua sessão terminou neste aparelho" justamente quando o espelho
 * era a única fonte: em voo, na visita ao cliente. Nada gravava.
 *
 * Aqui só se decide **qual banco local abrir**. Quem decide permissão
 * continua sendo a RLS, a cada gravação que sobe.
 */

type Resposta = {
  data: { session: { user: { id: string; email?: string } } | null };
  error: { name: string; message: string } | null;
};

let resposta: Resposta;
const getSession = vi.fn(async () => resposta);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession } }),
}));

const { usuarioLocal, esquecerUsuarioLocal, esquecerDonoDoAparelho } = await import("./usuario");

const ANA = { id: "11111111-1111-4111-8111-111111111111", email: "ana@duli.com" };
const QUEDA = { name: "AuthRetryableFetchError", message: "Failed to fetch" };

function online(valor: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(valor);
}

beforeEach(() => {
  localStorage.clear();
  esquecerUsuarioLocal();
  getSession.mockClear();
  online(true);
});

afterEach(() => vi.restoreAllMocks());

async function entrouUmaVez() {
  resposta = { data: { session: { user: ANA } }, error: null };
  await usuarioLocal();
  esquecerUsuarioLocal();
}

describe("usuarioLocal", () => {
  it("com sessão, é o dono da sessão", async () => {
    resposta = { data: { session: { user: ANA } }, error: null };
    expect(await usuarioLocal()).toMatchObject({ userId: ANA.id, email: ANA.email });
  });

  it("sem rede, abre o banco de quem usou por último — sem esperar a sessão", async () => {
    await entrouUmaVez();
    online(false);

    expect(await usuarioLocal()).toMatchObject({ userId: ANA.id, email: ANA.email });
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("com rede ruim, a sessão que não renovou não apaga o dono", async () => {
    await entrouUmaVez();
    resposta = { data: { session: null }, error: QUEDA };

    expect(await usuarioLocal()).toMatchObject({ userId: ANA.id });
  });

  it("sessão encerrada de verdade esquece o dono", async () => {
    await entrouUmaVez();
    resposta = { data: { session: null }, error: null };

    expect((await usuarioLocal()).userId).toBeNull();

    esquecerUsuarioLocal();
    online(false);
    expect((await usuarioLocal()).userId).toBeNull();
  });

  it("sair esquece o dono: offline, ninguém abre o banco de quem saiu", async () => {
    await entrouUmaVez();
    esquecerDonoDoAparelho();
    online(false);
    resposta = { data: { session: null }, error: QUEDA };

    expect((await usuarioLocal()).userId).toBeNull();
  });
});
