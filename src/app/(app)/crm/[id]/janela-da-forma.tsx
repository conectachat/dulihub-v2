"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { FieldError } from "@/components/field-error";
import { FormDialog } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarFormaDePagamento } from "@/features/opportunities/forma-actions";
import {
  avisoDeCoerencia,
  comParcelasGeradas,
  diaValido,
  erroDaParte,
  LIMITES,
  moedaSugerida,
  parteSugerida,
  totalDaForma,
  type Moeda,
  type ParteDaForma,
  type TipoDeParte,
} from "@/features/opportunities/forma-regras";
import { formaSchema } from "@/features/opportunities/forma-schema";
import { falhou, type ActionState } from "@/lib/action-state";
import { hojeEmSaoPaulo } from "@/lib/formatar";
import { novoId } from "@/lib/id";
import { parseMoney } from "@/lib/numbers";
import { METODOS, ROTULO_DO_METODO, type Metodo } from "@/lib/parcelas";
import { formatarMoeda, formatarPorMoeda, somarItensPorMoeda } from "@/lib/totals";

const FORMATO = "A forma de pagamento veio num formato inválido.";

const MOEDAS: Moeda[] = ["BRL", "USD"];

const BOTOES: { tipo: TipoDeParte; rotulo: string }[] = [
  { tipo: "entrada", rotulo: "Entrada" },
  { tipo: "parcelas", rotulo: "Parcelas" },
  { tipo: "cartao", rotulo: "Cartão" },
  { tipo: "a_vista", rotulo: "À vista" },
];

type Item = { visa_name: string; amount: number; currency: string };

/**
 * A parte como está na tela: o que se digitou, mesmo vazio ou inválido. Os
 * números só se leem na hora de conferir (`paraParte`) — guardar número
 * derrubaria a janela no meio da digitação, e apagar o "3" para digitar "12"
 * é o caso comum (foco 2).
 */
type Rascunho = {
  chave: string;
  label: string;
  method: Metodo;
  currency: Moeda;
  total: string;
  /** "Convertido de US$" (FIC-13), só na parte em reais. Vazio: sem conversão. */
  dolares: string;
  quantidade: string;
  primeiraData: string;
  parcelas: { number: number; amount: string; due_on: string }[];
};

/** Como a pessoa digita: vírgula decimal, e zero em branco. */
const comoDigitado = (valor: number) => (valor === 0 ? "" : String(valor).replace(".", ","));

/** Vazio e lixo valem zero: o zero é recusado com a mesma frase do banco. */
const valorDe = (texto: string) => parseMoney(texto) ?? 0;
const quantidadeDe = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : 0);

function paraParte(r: Rascunho): ParteDaForma {
  return {
    label: r.label,
    method: r.method,
    currency: r.currency,
    total: valorDe(r.total),
    installments_count: r.method === "cartao" ? 1 : quantidadeDe(r.quantidade),
    // Lixo vale zero, e o zero é recusado com a frase do banco ("Informe de
    // quantos dólares…"); vazio, ou a parte em dólar, é sem conversão.
    usd_equivalent: r.currency === "BRL" && r.dolares.trim() !== "" ? valorDe(r.dolares) : null,
    parcelas: r.parcelas.map((p) => ({ number: p.number, amount: valorDe(p.amount), due_on: p.due_on })),
  };
}

/**
 * As parcelas de novo, do total, do número e da 1ª data. Sem 1ª data válida,
 * as parcelas saem com a data que está no campo: somem da tela, e a frase é a
 * da data — a mesma que o servidor daria —, não a da lista.
 */
function regerado(r: Rascunho): Rascunho {
  const dataValida = diaValido(r.primeiraData);
  const gerada = comParcelasGeradas(paraParte(r), dataValida ? r.primeiraData : hojeEmSaoPaulo());
  return {
    ...r,
    quantidade: r.method === "cartao" ? "1" : r.quantidade,
    parcelas: gerada.parcelas.map((p) => ({
      number: p.number,
      amount: comoDigitado(p.amount),
      due_on: dataValida ? p.due_on : r.primeiraData,
    })),
  };
}

function rascunhoDe(parte: ParteDaForma): Rascunho {
  return {
    chave: novoId(),
    label: parte.label,
    method: parte.method,
    currency: parte.currency,
    total: comoDigitado(parte.total),
    dolares: parte.usd_equivalent === null ? "" : comoDigitado(parte.usd_equivalent),
    quantidade: String(parte.installments_count),
    primeiraData: parte.parcelas[0]?.due_on ?? hojeEmSaoPaulo(),
    parcelas: parte.parcelas.map((p) => ({
      number: p.number,
      amount: comoDigitado(p.amount),
      due_on: p.due_on,
    })),
  };
}

/**
 * A forma inválida nem sai da janela (P12): o `FormDialog` não deixa o filho
 * travar Salvar, então a ação é embrulhada, como `exigeValor` nos vistos. A
 * conferência é a do servidor (`formaSchema`, que chama `erroDaParte`), e a
 * frase sai igual à que aparece junto da parte.
 */
export function exigeFormaValida(
  acao: (anterior: ActionState, formData: FormData) => Promise<ActionState>,
) {
  return async (anterior: ActionState, formData: FormData) => {
    let bruto: unknown;
    try {
      bruto = JSON.parse(String(formData.get("forma") ?? ""));
    } catch {
      return falhou(FORMATO);
    }
    const forma = formaSchema.safeParse(bruto);
    if (!forma.success) return falhou(forma.error.issues[0]?.message ?? FORMATO);
    return acao(anterior, formData);
  };
}

/**
 * A janela de definir ou editar a forma de pagamento (entrega 4a; FIC-7).
 *
 * As partes ficam no navegador até Salvar, e vão inteiras num campo escondido:
 * o servidor troca a forma toda de uma vez (`salvar_forma_de_pagamento`).
 */
export function JanelaDaForma({
  negocioId,
  nomeDaPessoa,
  itens,
  partes,
  gatilho,
}: {
  negocioId: string;
  nomeDaPessoa: string;
  itens: Item[];
  partes: ParteDaForma[];
  gatilho: React.ReactNode;
}) {
  return (
    <FormDialog
      acao={exigeFormaValida(salvarFormaDePagamento)}
      titulo={`Forma de pagamento — ${nomeDaPessoa}`}
      gatilho={gatilho}
    >
      <input type="hidden" name="negocio" value={negocioId} />
      <CamposDaForma itens={itens} partes={partes} />
    </FormDialog>
  );
}

/** Vive dentro do formulário: a cada abertura volta ao que está gravado. */
function CamposDaForma({ itens, partes: gravadas }: { itens: Item[]; partes: ParteDaForma[] }) {
  const [rascunhos, setRascunhos] = useState<Rascunho[]>(() => gravadas.map(rascunhoDe));
  const partes = rascunhos.map(paraParte);
  const cheia = rascunhos.length >= LIMITES.partes;
  const coerencia = avisoDeCoerencia(itens, partes);

  function acrescentar(tipo: TipoDeParte) {
    const nova = parteSugerida(tipo, moedaSugerida(itens), hojeEmSaoPaulo());
    setRascunhos((atuais) => [...atuais, rascunhoDe(nova)]);
  }

  function mudar(chave: string, mudanca: Partial<Rascunho>, gerarDeNovo: boolean) {
    setRascunhos((atuais) =>
      atuais.map((r) => {
        if (r.chave !== chave) return r;
        const mudado = { ...r, ...mudanca };
        return gerarDeNovo ? regerado(mudado) : mudado;
      }),
    );
  }

  function mudarParcela(chave: string, numero: number, mudanca: { amount?: string; due_on?: string }) {
    setRascunhos((atuais) =>
      atuais.map((r) => {
        if (r.chave !== chave) return r;
        const parcelas = r.parcelas.map((p) => (p.number === numero ? { ...p, ...mudanca } : p));
        // A data da parcela 1 é a 1ª data: o campo de cima acompanha, sem gerar
        // as outras de novo — mas só um dia válido. Vazia no meio da edição, a
        // 1ª data fica, a lista continua na tela e a frase da data aparece.
        const primeiraData =
          numero === 1 && mudanca.due_on !== undefined && diaValido(mudanca.due_on)
            ? mudanca.due_on
            : r.primeiraData;
        return { ...r, parcelas, primeiraData };
      }),
    );
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="forma" value={JSON.stringify({ partes })} />

      <p className="text-sm text-muted-foreground">
        {itens.length === 0
          ? "Nenhum visto no negócio ainda."
          : `Vistos: ${itens.map((i) => `${i.visa_name} ${formatarMoeda(i.amount, i.currency)}`).join(" · ")}` +
            ` · Total ${formatarPorMoeda(somarItensPorMoeda(itens))}`}
      </p>

      <div className="flex flex-wrap gap-2">
        {BOTOES.map((b) => (
          <Button
            key={b.tipo}
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={cheia}
            onClick={() => acrescentar(b.tipo)}
          >
            <Plus className="mr-1 h-4 w-4 text-primary" />
            {b.rotulo}
          </Button>
        ))}
      </div>

      {rascunhos.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Acrescente uma parte: entrada, parcelas, cartão ou à vista.
        </p>
      ) : (
        <ol className="space-y-3">
          {rascunhos.map((r, i) => (
            <CamposDaParte
              key={r.chave}
              indice={i + 1}
              rascunho={r}
              erro={erroDaParte(partes[i]!)}
              aoMudar={(mudanca, gerarDeNovo) => mudar(r.chave, mudanca, gerarDeNovo)}
              aoMudarParcela={(numero, mudanca) => mudarParcela(r.chave, numero, mudanca)}
              aoRemover={() => setRascunhos((atuais) => atuais.filter((x) => x.chave !== r.chave))}
            />
          ))}
        </ol>
      )}

      {rascunhos.length > 0 ? (
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Total da forma: {totalDaForma(partes)}</p>
          {coerencia ? <p className="text-warning">{coerencia}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function CamposDaParte({
  indice,
  rascunho: r,
  erro,
  aoMudar,
  aoMudarParcela,
  aoRemover,
}: {
  indice: number;
  rascunho: Rascunho;
  erro: string | null;
  aoMudar: (mudanca: Partial<Rascunho>, gerarDeNovo: boolean) => void;
  aoMudarParcela: (numero: number, mudanca: { amount?: string; due_on?: string }) => void;
  aoRemover: () => void;
}) {
  const daParte = `da parte ${indice}`;
  const cartao = r.method === "cartao";
  // Cartão e parte de 1 parcela: só o valor e uma data. Sem 1ª data válida, a
  // lista some até o campo ficar válido.
  const comLista = !cartao && r.parcelas.length > 1 && diaValido(r.primeiraData);

  return (
    <li className="space-y-3 rounded-2xl border p-3">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-xs text-muted-foreground">Nome</span>
          <Input
            aria-label={`Nome ${daParte}`}
            value={r.label}
            maxLength={LIMITES.rotulo}
            onChange={(e) => aoMudar({ label: e.target.value }, false)}
          />
        </label>
        <label className="w-32 space-y-1">
          <span className="text-xs text-muted-foreground">Método</span>
          <NativeSelect
            aria-label={`Método ${daParte}`}
            value={r.method}
            onChange={(e) => {
              const metodo = METODOS.find((m) => m === e.target.value);
              if (metodo) aoMudar({ method: metodo }, true);
            }}
          >
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {ROTULO_DO_METODO[m]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl text-primary/60 hover:text-destructive"
          aria-label={`Remover a parte ${indice}`}
          onClick={aoRemover}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Duas colunas também no computador: a janela tem no máximo 32rem, e a
          data precisa de largura. No celular, nada passa da tela. */}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Moeda</span>
          <NativeSelect
            aria-label={`Moeda ${daParte}`}
            value={r.currency}
            onChange={(e) => {
              const moeda = MOEDAS.find((m) => m === e.target.value);
              // Em dólar a conversão some, e o valor junto: escondida, ela
              // recusaria o salvar com uma frase sobre um campo que não se vê.
              if (moeda) aoMudar(moeda === "BRL" ? { currency: moeda } : { currency: moeda, dolares: "" }, false);
            }}
          >
            {MOEDAS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Total</span>
          <Input
            aria-label={`Total ${daParte}`}
            inputMode="decimal"
            placeholder="0,00"
            value={r.total}
            onChange={(e) => aoMudar({ total: e.target.value }, true)}
          />
        </label>
        {r.currency === "BRL" ? (
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Convertido de US$</span>
            <Input
              aria-label={`Convertido de US$ ${daParte}`}
              inputMode="decimal"
              placeholder="opcional"
              value={r.dolares}
              onChange={(e) => aoMudar({ dolares: e.target.value }, false)}
            />
          </label>
        ) : null}
        {cartao ? null : (
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Parcelas</span>
            <Input
              aria-label={`Parcelas ${daParte}`}
              inputMode="numeric"
              value={r.quantidade}
              onChange={(e) => aoMudar({ quantidade: e.target.value }, true)}
            />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{comLista ? "1ª data" : "Data"}</span>
          <Input
            aria-label={`1ª data ${daParte}`}
            type="date"
            value={r.primeiraData}
            onChange={(e) => aoMudar({ primeiraData: e.target.value }, true)}
          />
        </label>
      </div>

      {comLista ? (
        <ul className="space-y-2">
          {r.parcelas.map((p) => (
            <li key={p.number} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
              <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">
                {p.number}
              </span>
              <Input
                aria-label={`Data da parcela ${p.number} ${daParte}`}
                type="date"
                value={p.due_on}
                onChange={(e) => aoMudarParcela(p.number, { due_on: e.target.value })}
              />
              <Input
                aria-label={`Valor da parcela ${p.number} ${daParte}`}
                inputMode="decimal"
                value={p.amount}
                onChange={(e) => aoMudarParcela(p.number, { amount: e.target.value })}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <FieldError mensagem={erro} pequeno />
    </li>
  );
}
