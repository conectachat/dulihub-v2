"use client";

import type { BancoLocal } from "@/lib/local/banco";
import type { BancoDaFila } from "@/lib/local/banco-da-fila";
import { lerTabela, pendentesDaFila } from "@/lib/local/leitura";
import type { Pendencia } from "@/lib/local/sobreposicao";
import type { Tables } from "@/lib/supabase/database.types";

import { resumoDoRecebivel, type ResumoDoRecebivel } from "./regras";

/**
 * O a receber, lido do aparelho — com o que ainda não subiu por cima.
 *
 * Mesmo caminho da Configuração: o espelho é cópia do servidor, a fila é o
 * que este aparelho fez, e `sobrepor` junta os dois na hora de ler. Não
 * existe "a versão offline desta tela".
 *
 * Nenhum total vem do banco. `resumoDoRecebivel` soma das parcelas, e é a
 * mesma função que o teste cobre — no app antigo os saldos eram colunas
 * mantidas por gatilho, e divergiam.
 */

export type Parcela = Pick<
  Tables<"installments">,
  "id" | "receivable_id" | "number" | "amount" | "due_on" | "paid_on" | "paid_rate" | "method" | "notes"
> &
  Pendencia;

export type Cobranca = Pick<
  Tables<"receivables">,
  "id" | "person_id" | "project_id" | "title" | "amount" | "list_amount" | "currency" | "notes"
> &
  Pendencia & {
    parcelas: Parcela[];
    resumo: ResumoDoRecebivel;
  };

/** Uma parcela com o que a lista geral precisa mostrar ao lado dela. */
export type ParcelaNaLista = Parcela & {
  cobranca: string;
  currency: string;
  cliente: string;
  person_id: string;
};

const porNumero = (a: Parcela, b: Parcela) => a.number - b.number;

function montarCobrancas(
  cobrancas: (Tables<"receivables"> & Pendencia)[],
  parcelas: (Tables<"installments"> & Pendencia)[],
  hoje: string,
): Cobranca[] {
  const porCobranca = new Map<string, Parcela[]>();
  for (const p of parcelas) {
    const lista = porCobranca.get(p.receivable_id) ?? [];
    lista.push({
      id: p.id,
      receivable_id: p.receivable_id,
      number: p.number,
      amount: Number(p.amount),
      due_on: p.due_on,
      paid_on: p.paid_on,
      paid_rate: p.paid_rate === null ? null : Number(p.paid_rate),
      method: p.method,
      notes: p.notes,
      pendente: p.pendente,
      conflito: p.conflito,
    });
    porCobranca.set(p.receivable_id, lista);
  }

  return cobrancas.map((c) => {
    const suas = (porCobranca.get(c.id) ?? []).sort(porNumero);
    return {
      id: c.id,
      person_id: c.person_id,
      project_id: c.project_id,
      title: c.title,
      amount: Number(c.amount),
      list_amount: c.list_amount === null ? null : Number(c.list_amount),
      currency: c.currency,
      notes: c.notes,
      pendente: c.pendente,
      conflito: c.conflito,
      parcelas: suas,
      resumo: resumoDoRecebivel(suas, hoje),
    };
  });
}

/** As cobranças de um cliente, com as parcelas dentro. */
export async function cobrancasDoContato(
  banco: BancoLocal,
  fila: BancoDaFila,
  personId: string,
  hoje: string,
): Promise<Cobranca[]> {
  const itens = await pendentesDaFila(fila);
  const [cobrancas, parcelas] = await Promise.all([
    lerTabela(banco, "receivables", itens),
    lerTabela(banco, "installments", itens),
  ]);

  const dele = (cobrancas as (Tables<"receivables"> & Pendencia)[]).filter(
    (c) => c.person_id === personId,
  );
  const ids = new Set(dele.map((c) => c.id));

  return montarCobrancas(
    dele,
    (parcelas as (Tables<"installments"> & Pendencia)[]).filter((p) =>
      ids.has(p.receivable_id),
    ),
    hoje,
  ).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

/**
 * Todas as parcelas do aparelho, com cliente e cobrança ao lado.
 *
 * É o que a tela `/financeiro` lista. O nome do cliente vem do espelho de
 * `people`; sem ele a lista mostraria um id, que não diz nada a ninguém.
 */
export async function parcelasDoAparelho(
  banco: BancoLocal,
  fila: BancoDaFila,
): Promise<ParcelaNaLista[]> {
  const itens = await pendentesDaFila(fila);
  const [cobrancas, parcelas, pessoas] = await Promise.all([
    lerTabela(banco, "receivables", itens),
    lerTabela(banco, "installments", itens),
    lerTabela(banco, "people", itens),
  ]);

  const nome = new Map(
    (pessoas as Tables<"people">[]).map((p) => [p.id, p.full_name]),
  );
  const cabecalho = new Map(
    (cobrancas as Tables<"receivables">[]).map((c) => [c.id, c]),
  );

  return (parcelas as (Tables<"installments"> & Pendencia)[])
    .flatMap((p) => {
      const c = cabecalho.get(p.receivable_id);
      // Parcela sem a cobrança no aparelho: o espelho ainda não trouxe o
      // cabeçalho. Mostrar sem moeda nem cliente seria pior que não mostrar.
      if (!c) return [];

      return [
        {
          id: p.id,
          receivable_id: p.receivable_id,
          number: p.number,
          amount: Number(p.amount),
          due_on: p.due_on,
          paid_on: p.paid_on,
          paid_rate: p.paid_rate === null ? null : Number(p.paid_rate),
          method: p.method,
          notes: p.notes,
          pendente: p.pendente,
          conflito: p.conflito,
          cobranca: c.title,
          currency: c.currency,
          cliente: nome.get(c.person_id) ?? "Cliente removido",
          person_id: c.person_id,
        },
      ];
    })
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.number - b.number);
}
