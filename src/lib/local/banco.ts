"use client";

import Dexie, { type Table } from "dexie";

import type { Armazem, Linha } from "./espelho";

/**
 * O banco dentro do aparelho (IndexedDB, via Dexie).
 *
 * Guarda uma cópia das linhas que o servidor **devolveu àquele login** — todo
 * pull é um `select` comum, com a RLS aplicada. O espelho nunca é largo
 * demais; ele só pode ficar velho, e é para isso que serve a conferência
 * pelo manifesto.
 *
 * Três decisões que ficam aqui:
 *
 * - **Um banco por usuário** (`dulihub-<user_id>`): trocar de conta no mesmo
 *   aparelho não mistura carteira de ninguém, e sair apaga o banco inteiro em
 *   vez de tentar limpar linha a linha.
 * - **`VERSAO_DO_ESPELHO` é manual.** Mudou o que se guarda, incremente: o
 *   Dexie recria as tabelas e a próxima sincronia recarrega tudo (segundos,
 *   com este volume). Não é a versão do build — recarregar o espelho a cada
 *   deploy seria desperdício diário.
 * - **Sem cifra.** IndexedDB é texto claro no disco. Não há como cifrar e
 *   continuar abrindo offline sem pedir senha a cada vez. O app carrega
 *   passaporte e comprovante de renda: a proteção é a cifra de disco do
 *   aparelho e o prazo de validade do espelho (`sessao.ts`), e isso está
 *   dito em `docs/plano.md`.
 */

export const VERSAO_DO_ESPELHO = 1;

/** As tabelas espelhadas neste estágio: a Configuração e o que ela usa. */
export const TABELAS_ESPELHADAS = [
  "tags",
  "person_tags",
  "document_types",
  "visa_types",
  "visa_stages",
  "visa_type_documents",
  "stage_statuses",
  "pipelines",
  "pipeline_stages",
  "opportunities",
] as const;

export type TabelaEspelhada = (typeof TABELAS_ESPELHADAS)[number];

type Marca = { tabela: string; valor: string };

export class BancoLocal extends Dexie {
  marcas!: Table<Marca, string>;

  constructor(userId: string) {
    super(`dulihub-${userId}`);
    this.version(VERSAO_DO_ESPELHO).stores({
      marcas: "tabela",
      // `organization_id` indexado: a limpeza por organização removida
      // (acesso revogado) precisa varrer por ele.
      ...Object.fromEntries(
        TABELAS_ESPELHADAS.map((t) => [t, "id, organization_id, updated_at"]),
      ),
      // `person_tags` não tem `id` — a chave é o par, como no Postgres.
      person_tags: "[person_id+tag_id], person_id, tag_id, organization_id, updated_at",
    });
  }

  tabela(nome: string): Table<Linha, string> {
    return this.table(nome) as unknown as Table<Linha, string>;
  }
}

/** O `Armazem` que o motor do espelho usa, sobre o Dexie. */
export function armazemDo(banco: BancoLocal): Armazem {
  return {
    async gravar(tabela, linhas) {
      await banco.tabela(tabela).bulkPut(linhas);
    },
    async apagar(tabela, ids) {
      await banco.tabela(tabela).bulkDelete(ids);
    },
    async substituir(tabela, linhas) {
      await banco.transaction("rw", banco.tabela(tabela), async () => {
        await banco.tabela(tabela).clear();
        await banco.tabela(tabela).bulkPut(linhas);
      });
    },
    async contar(tabela) {
      return banco.tabela(tabela).count();
    },
    async marca(tabela) {
      return (await banco.marcas.get(tabela))?.valor ?? null;
    },
    async definirMarca(tabela, valor) {
      if (valor) await banco.marcas.put({ tabela, valor });
    },
  };
}

/** Apaga o espelho deste aparelho — sair da conta, trocar de usuário. */
export async function apagarEspelho(userId: string) {
  await Dexie.delete(`dulihub-${userId}`);
}
