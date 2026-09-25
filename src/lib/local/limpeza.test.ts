import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BancoLocal } from "./banco";
import { BancoDaFila } from "./banco-da-fila";
import { apagarDadosDoUsuario, limparOutrosUsuarios } from "./limpeza";
import { bancoDoUsuario, filaDoUsuario } from "./sincronizador";

/**
 * O aparelho não guarda a carteira de quem já saiu.
 *
 * O espelho é cópia de contatos, negócios e configuração; a fila é o que a
 * pessoa gravou e o servidor ainda não tem. Os dois são texto claro no disco,
 * e num computador compartilhado ficavam lá para sempre: `apagarEspelho`
 * existia desde o primeiro dia e **nunca era chamada**.
 *
 * Duas frentes, porque uma não cobre a outra: sair apaga o próprio, e abrir
 * apaga o que ficou de quem não chegou a sair — sessão expirada, computador
 * emprestado, a pessoa que só fecha a tampa.
 */

const ANA = "11111111-1111-4111-8111-111111111111";
const BRUNO = "33333333-3333-4333-8333-333333333333";

async function criarBancos(userId: string) {
  const banco = new BancoLocal(userId);
  await banco.open();
  await banco.tabela("tags").put({ id: "t1", organization_id: "o1", name: "EB-1A" });
  banco.close();

  const fila = new BancoDaFila(userId);
  await fila.open();
  await fila.fila.put({
    id: "f1",
    alvo: "t1",
    depende: [],
    passos: [{ tipo: "delete", tabela: "tags", id: "t1" }],
    rotulo: "Excluir a tag EB-1A",
    criada_em: "2026-09-24T10:00:00Z",
    estado: "pendente",
    enviada_em: null,
    motivo: null,
  });
  fila.close();
}

async function nomes() {
  const lista = await indexedDB.databases();
  return lista.map((d) => d.name).filter(Boolean).sort();
}

beforeEach(async () => {
  await criarBancos(ANA);
  await criarBancos(BRUNO);
});

afterEach(async () => {
  for (const nome of await nomes()) await indexedDB.deleteDatabase(nome!);
});

describe("apagarDadosDoUsuario", () => {
  it("leva o espelho e a fila, os dois", async () => {
    await apagarDadosDoUsuario(ANA);

    expect(await nomes()).toEqual([`dulihub-${BRUNO}`, `dulihub-fila-${BRUNO}`]);
  });

  it("não trava com o banco aberto — fecha antes de apagar", async () => {
    // `Dexie.delete` fica esperando para sempre enquanto houver conexão
    // aberta com aquele nome, e o app mantém uma no singleton.
    bancoDoUsuario(ANA);
    filaDoUsuario(ANA);

    await apagarDadosDoUsuario(ANA);

    expect(await nomes()).not.toContain(`dulihub-${ANA}`);
  });
});

describe("limparOutrosUsuarios", () => {
  it("quem entra apaga o que a anterior deixou", async () => {
    // O caso que sair nunca alcança: a sessão da Ana expirou, ela foi
    // embora, e o Bruno entra no mesmo computador.
    await limparOutrosUsuarios(BRUNO);

    expect(await nomes()).toEqual([`dulihub-${BRUNO}`, `dulihub-fila-${BRUNO}`]);
  });

  it("não encosta em banco que não é do app", async () => {
    const outro = indexedDB.open("outro-app");
    await new Promise((pronto) => {
      outro.onsuccess = () => {
        outro.result.close();
        pronto(null);
      };
    });

    await limparOutrosUsuarios(BRUNO);

    expect(await nomes()).toContain("outro-app");
  });

  it("aparelho com um usuário só não perde nada", async () => {
    await apagarDadosDoUsuario(ANA);

    await limparOutrosUsuarios(BRUNO);

    expect(await nomes()).toEqual([`dulihub-${BRUNO}`, `dulihub-fila-${BRUNO}`]);
  });
});
