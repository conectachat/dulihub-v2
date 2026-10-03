"use client";

import { useState } from "react";
import { Pencil, RotateCcw, Trophy, XCircle } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moveOpportunity, updateOpportunity } from "@/features/opportunities/actions";
import { comAviso } from "@/lib/avisar";

import { DialogoDeGanho, DialogoDePerda, type NegocioDoDialogo } from "../dialogos";

/**
 * Os botões da tela do lead que precisam do navegador: Ganho, Perdido,
 * Reabrir e Editar negócio.
 */

/** As duas saídas do funil. Cada uma abre a sua pergunta (`../dialogos`). */
export function GanhoEPerdido({ negocio }: { negocio: NegocioDoDialogo }) {
  const [aberto, setAberto] = useState<"ganho" | "perda" | null>(null);

  return (
    <>
      <Button
        type="button"
        className="rounded-xl bg-success text-white hover:bg-success/90"
        onClick={() => setAberto("ganho")}
      >
        <Trophy className="mr-1 h-4 w-4" />
        Ganho
      </Button>
      <Button
        type="button"
        variant="outline"
        className="rounded-xl border-destructive/40 text-destructive hover:text-destructive"
        onClick={() => setAberto("perda")}
      >
        <XCircle className="mr-1 h-4 w-4" />
        Perdido
      </Button>

      <DialogoDeGanho
        negocio={negocio}
        aberto={aberto === "ganho"}
        aoMudar={(a) => setAberto(a ? "ganho" : null)}
      />
      <DialogoDePerda
        negocio={negocio}
        aberto={aberto === "perda"}
        aoMudar={(a) => setAberto(a ? "perda" : null)}
      />
    </>
  );
}

/** Negócio perdido volta para a primeira etapa do funil; o motivo é apagado. */
export function Reabrir({ negocioId, etapaId }: { negocioId: string; etapaId: string }) {
  return (
    <form action={comAviso(moveOpportunity)}>
      <input type="hidden" name="id" value={negocioId} />
      <input type="hidden" name="stage_id" value={etapaId} />
      <SubmitButton
        pendente="Reabrindo..."
        size="sm"
        className="rounded-xl"
        icone={<RotateCcw className="h-4 w-4" />}
      >
        Reabrir
      </SubmitButton>
    </form>
  );
}

/** Título, valor, moeda e origem — o que se ajusta ao longo da negociação. */
export function EditarNegocio({
  negocio,
}: {
  negocio: {
    id: string;
    title: string;
    value: number | null;
    currency: string;
    source: string | null;
  };
}) {
  return (
    <FormDialog
      acao={updateOpportunity}
      titulo="Editar negócio"
      gatilho={
        <Button variant="outline" size="sm" className="rounded-xl">
          <Pencil className="mr-1 h-4 w-4" />
          Editar
        </Button>
      }
    >
      <input type="hidden" name="id" value={negocio.id} />

      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={negocio.title} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-2">
          <Label htmlFor="value">Valor</Label>
          <Input
            id="value"
            name="value"
            inputMode="decimal"
            placeholder="0,00"
            // Como a pessoa digita: vírgula decimal. `parseMoney` lê de volta.
            defaultValue={
              negocio.value === null ? "" : String(negocio.value).replace(".", ",")
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Moeda</Label>
          <NativeSelect id="currency" name="currency" defaultValue={negocio.currency}>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="source">Origem</Label>
        <Input
          id="source"
          name="source"
          placeholder="Indicação, site..."
          defaultValue={negocio.source ?? ""}
        />
      </div>
    </FormDialog>
  );
}
