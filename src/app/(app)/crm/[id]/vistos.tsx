"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { FormDialog } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adicionarItem, editarItem, removerItem } from "@/features/opportunities/itens-actions";
import { valorSugerido } from "@/features/opportunities/regras";
import { falhou, type ActionState } from "@/lib/action-state";
import { formatarMoeda, somarItensPorMoeda } from "@/lib/totals";

export type ItemDoNegocio = {
  id: string;
  visa_type_id: string | null;
  visa_name: string;
  amount: number;
  currency: string;
  /** Já virou processo num Ganho: não sai do negócio (desistir é encerrar). */
  temProcesso: boolean;
};

export type VistoDoCatalogo = {
  id: string;
  name: string;
  base_price: number | null;
  currency: string;
  is_active: boolean;
};

const MOEDAS = ["BRL", "USD"] as const;

/** Como a pessoa digita: vírgula decimal. `parseMoney` lê de volta. */
const comoDigitado = (valor: number | null) =>
  valor === null ? "" : String(valor).replace(".", ",");

/**
 * Sem valor nem vai ao servidor: em outra moeda que não a do preço o campo
 * vem vazio de propósito, e precisa ser preenchido (CRM-13).
 */
function exigeValor(acao: (anterior: ActionState, formData: FormData) => Promise<ActionState>) {
  return async (anterior: ActionState, formData: FormData) =>
    String(formData.get("amount") ?? "").trim()
      ? acao(anterior, formData)
      : falhou("Informe o valor.");
}

/**
 * Os vistos do negócio, na tela do lead (CRM-13).
 *
 * O valor e a moeda vêm do preço do visto e ficam gravados no item: mudar o
 * preço nas Configurações não mexe aqui. Trocar para outra moeda esvazia o
 * valor — nunca converte. Depois do Ganho, os vistos não mudam: desistir de
 * um é encerrar o processo dele.
 *
 * Com a forma de pagamento confirmada e sem cobranças, os vistos também ficam
 * só para leitura (entrega 4a): a forma foi feita deles. O banco recusa do
 * mesmo jeito (0058).
 */
export function Vistos({
  negocioId,
  itens,
  catalogo,
  ganho,
  travadaPelaForma = null,
  negocioAberto = true,
}: {
  negocioId: string;
  itens: ItemDoNegocio[];
  catalogo: VistoDoCatalogo[];
  ganho: boolean;
  /**
   * A forma confirmada (4a) ou enviada ao cliente (4b) prende os vistos até o
   * Ganho criar as cobranças: o cliente lê os vistos na ficha.
   */
  travadaPelaForma?: "confirmada" | "enviada" | null;
  /** Encerrado, o Refazer só vem depois de reabrir: a frase diz isso. */
  negocioAberto?: boolean;
}) {
  const soLeitura = ganho || travadaPelaForma !== null;
  const totais = Object.entries(somarItensPorMoeda(itens)).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs text-muted-foreground">Vistos</h3>
        {soLeitura ? null : <AcrescentarVisto negocioId={negocioId} catalogo={catalogo} />}
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {ganho ? "Nenhum visto registrado." : "Nenhum visto ainda. O Ganho precisa de pelo menos um."}
        </p>
      ) : (
        <ul className="space-y-2">
          {itens.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-2xl border p-3 text-sm"
            >
              <span className="min-w-0 truncate">{item.visa_name}</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="font-semibold tabular-nums">
                  {formatarMoeda(item.amount, item.currency)}
                </span>
                {soLeitura ? null : (
                  <>
                    <EditarVisto
                      item={item}
                      visto={catalogo.find((v) => v.id === item.visa_type_id) ?? null}
                    />
                    {item.temProcesso ? null : (
                      <ConfirmAction
                        action={removerItem}
                        hidden={{ id: item.id }}
                        title={`Remover ${item.visa_name}?`}
                        consequence="O visto sai do negócio."
                        confirmLabel="Remover"
                        triggerLabel={`Remover ${item.visa_name}`}
                        icon={<Trash2 className="h-4 w-4" />}
                      />
                    )}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {totais.length > 0 ? (
        <div role="group" aria-label="Totais por moeda" className="space-y-1 border-t pt-2 text-sm">
          {totais.map(([moeda, valor]) => (
            <p key={moeda} className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">{formatarMoeda(valor, moeda)}</span>
            </p>
          ))}
        </div>
      ) : null}

      {ganho ? (
        <p className="text-xs text-muted-foreground">
          Negócio ganho: para desistir de um visto, encerre o processo dele.
        </p>
      ) : travadaPelaForma === "enviada" ? (
        <p className="text-xs text-muted-foreground">
          A forma de pagamento foi enviada ao cliente. Use Editar para mudar os vistos.
        </p>
      ) : travadaPelaForma === "confirmada" ? (
        <p className="text-xs text-muted-foreground">
          {negocioAberto
            ? "A forma de pagamento está confirmada. Use Refazer para mudar os vistos."
            : "A forma de pagamento está confirmada. Reabra o negócio e use Refazer para mudar os vistos."}
        </p>
      ) : itens.some((item) => item.temProcesso) ? (
        <p className="text-xs text-muted-foreground">
          Tem processo: para desistir, encerre o processo.
        </p>
      ) : null}
    </section>
  );
}

function AcrescentarVisto({
  negocioId,
  catalogo,
}: {
  negocioId: string;
  catalogo: VistoDoCatalogo[];
}) {
  return (
    <FormDialog
      acao={exigeValor(adicionarItem)}
      titulo="Acrescentar visto"
      salvar="Acrescentar"
      pendente="Acrescentando..."
      gatilho={
        <Button variant="outline" size="sm" className="rounded-xl">
          <Plus className="mr-1 h-4 w-4 text-primary" />
          Acrescentar visto
        </Button>
      }
    >
      <input type="hidden" name="opportunity_id" value={negocioId} />
      <CamposDoNovoVisto catalogo={catalogo} />
    </FormDialog>
  );
}

/** Vive dentro do formulário: a cada abertura volta limpo (`FormDialog`). */
function CamposDoNovoVisto({ catalogo }: { catalogo: VistoDoCatalogo[] }) {
  const ativos = catalogo.filter((v) => v.is_active);
  const [vistoId, setVistoId] = useState("");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [valor, setValor] = useState("");
  const visto = ativos.find((v) => v.id === vistoId) ?? null;

  function escolher(id: string) {
    setVistoId(id);
    const escolhido = ativos.find((v) => v.id === id);
    if (!escolhido) return;
    setMoeda(escolhido.currency);
    setValor(comoDigitado(valorSugerido(escolhido, escolhido.currency)));
  }

  function trocarMoeda(nova: string) {
    setMoeda(nova);
    setValor(visto ? comoDigitado(valorSugerido(visto, nova)) : "");
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="item-visto">Visto</Label>
        <NativeSelect
          id="item-visto"
          name="visa_type_id"
          value={vistoId}
          onChange={(e) => escolher(e.target.value)}
          required
        >
          <option value="" disabled>
            Escolha um visto
          </option>
          {ativos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <CamposDeValor
        sufixo="novo"
        valor={valor}
        moeda={moeda}
        aoMudarValor={setValor}
        aoMudarMoeda={trocarMoeda}
      />
    </>
  );
}

function EditarVisto({ item, visto }: { item: ItemDoNegocio; visto: VistoDoCatalogo | null }) {
  return (
    <FormDialog
      acao={exigeValor(editarItem)}
      titulo={`Editar ${item.visa_name}`}
      gatilho={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl text-primary"
          aria-label={`Editar ${item.visa_name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      }
    >
      <input type="hidden" name="id" value={item.id} />
      <CamposDaEdicao item={item} visto={visto} />
    </FormDialog>
  );
}

function CamposDaEdicao({ item, visto }: { item: ItemDoNegocio; visto: VistoDoCatalogo | null }) {
  const [moeda, setMoeda] = useState(item.currency);
  const [valor, setValor] = useState(comoDigitado(item.amount));

  function trocarMoeda(nova: string) {
    setMoeda(nova);
    // Nunca converte: a sugestão só vale na moeda do preço do visto.
    setValor(visto ? comoDigitado(valorSugerido(visto, nova)) : "");
  }

  return (
    <CamposDeValor
      sufixo={item.id}
      valor={valor}
      moeda={moeda}
      aoMudarValor={setValor}
      aoMudarMoeda={trocarMoeda}
    />
  );
}

function CamposDeValor({
  sufixo,
  valor,
  moeda,
  aoMudarValor,
  aoMudarMoeda,
}: {
  sufixo: string;
  valor: string;
  moeda: string;
  aoMudarValor: (valor: string) => void;
  aoMudarMoeda: (moeda: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
      <div className="space-y-2">
        <Label htmlFor={`item-valor-${sufixo}`}>Valor</Label>
        <Input
          id={`item-valor-${sufixo}`}
          name="amount"
          inputMode="decimal"
          placeholder="0,00"
          value={valor}
          onChange={(e) => aoMudarValor(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`item-moeda-${sufixo}`}>Moeda</Label>
        <NativeSelect
          id={`item-moeda-${sufixo}`}
          name="currency"
          value={moeda}
          onChange={(e) => aoMudarMoeda(e.target.value)}
        >
          {MOEDAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
