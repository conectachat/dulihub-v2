import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BancoLocal } from "./banco";
import { organizacaoLocal, vinculoLocal } from "./organizacao-local";

/**
 * De qual organização é a gravação feita **offline**.
 *
 * No servidor quem responde é `contextoAtual()`, e a regra tem motivo escrito
 * no `AGENTS.md`: a raiz manda. Quem trabalha na Duli e também foi convidado
 * por um parceiro opera pela Duli — o contrário gravaria a operação da casa
 * dentro do parceiro.
 *
 * Sem internet não há `contextoAtual()`, e é aqui que a regra passa a valer
 * também. Errar isto não dá erro nenhum: a linha nasce válida, com a
 * organização errada, e **a RLS não pega** — ela só recusaria o que a pessoa
 * não pode ver, e ela pode ver as duas.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";
const DULI = "22222222-2222-4222-8222-222222222222";
const PARCEIRO = "44444444-4444-4444-8444-444444444444";

let banco: BancoLocal;

beforeEach(async () => {
  banco = new BancoLocal(USUARIO);
  await banco.open();
});

afterEach(async () => {
  banco.close();
  await BancoLocal.delete(`dulihub-${USUARIO}`);
});

async function semear(
  orgs: { id: string; type: string }[],
  vinculos: { organization_id: string; created_at: string; role?: string }[],
) {
  await banco.tabela("organizations").bulkPut(
    orgs.map((o) => ({ ...o, name: o.id, slug: o.id, updated_at: "2026-09-21T10:00:00Z" })),
  );
  await banco.tabela("organization_members").bulkPut(
    vinculos.map((v, i) => ({
      id: `m${i}`,
      user_id: USUARIO,
      organization_id: v.organization_id,
      role: v.role ?? "collaborator",
      created_at: v.created_at,
      updated_at: "2026-09-21T10:00:00Z",
    })),
  );
}

describe("organizacaoLocal", () => {
  it("a raiz manda, mesmo sendo o vínculo mais novo", async () => {
    await semear(
      [
        { id: PARCEIRO, type: "partner" },
        { id: DULI, type: "root" },
      ],
      [
        { organization_id: PARCEIRO, created_at: "2024-01-01T00:00:00Z" },
        { organization_id: DULI, created_at: "2026-01-01T00:00:00Z" },
      ],
    );

    expect(await organizacaoLocal(banco, USUARIO)).toBe(DULI);
  });

  it("sem raiz, o vínculo mais antigo", async () => {
    await semear(
      [
        { id: PARCEIRO, type: "partner" },
        { id: DULI, type: "partner" },
      ],
      [
        { organization_id: DULI, created_at: "2026-01-01T00:00:00Z" },
        { organization_id: PARCEIRO, created_at: "2024-01-01T00:00:00Z" },
      ],
    );

    expect(await organizacaoLocal(banco, USUARIO)).toBe(PARCEIRO);
  });

  it("vínculo de outra pessoa no mesmo aparelho não conta", async () => {
    await semear([{ id: DULI, type: "root" }], [{ organization_id: DULI, created_at: "2026-01-01T00:00:00Z" }]);
    await banco.tabela("organization_members").put({
      id: "outro",
      user_id: "99999999-9999-4999-8999-999999999999",
      organization_id: PARCEIRO,
      role: "collaborator",
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2026-09-21T10:00:00Z",
    });

    expect(await organizacaoLocal(banco, USUARIO)).toBe(DULI);
  });

  it("espelho ainda vazio devolve nulo — ninguém grava no escuro", async () => {
    expect(await organizacaoLocal(banco, USUARIO)).toBeNull();
  });
});

describe("vinculoLocal", () => {
  // Offline também é preciso saber o papel: só o dono da raiz vê os botões de
  // Configuração › Parceiros. A escolha é a mesma de `organizacaoLocal`.
  it("devolve a associação escolhida com o papel e o tipo", async () => {
    await semear(
      [
        { id: PARCEIRO, type: "partner" },
        { id: DULI, type: "root" },
      ],
      [
        { organization_id: PARCEIRO, created_at: "2024-01-01T00:00:00Z", role: "admin" },
        { organization_id: DULI, created_at: "2026-01-01T00:00:00Z", role: "owner" },
      ],
    );

    expect(await vinculoLocal(banco, USUARIO)).toEqual({
      organizationId: DULI,
      papel: "owner",
      tipo: "root",
    });
  });

  it("sem raiz, a mais antiga, com o papel dela", async () => {
    await semear(
      [
        { id: PARCEIRO, type: "partner" },
        { id: DULI, type: "partner" },
      ],
      [
        { organization_id: DULI, created_at: "2026-01-01T00:00:00Z", role: "owner" },
        { organization_id: PARCEIRO, created_at: "2024-01-01T00:00:00Z", role: "staff" },
      ],
    );

    expect(await vinculoLocal(banco, USUARIO)).toEqual({
      organizationId: PARCEIRO,
      papel: "staff",
      tipo: "partner",
    });
  });

  it("espelho vazio devolve nulo", async () => {
    expect(await vinculoLocal(banco, USUARIO)).toBeNull();
  });
});
