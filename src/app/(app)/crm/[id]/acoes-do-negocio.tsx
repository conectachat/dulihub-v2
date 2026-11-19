"use client";

import { useState } from "react";
import { Pencil, RotateCcw, Trophy, XCircle } from "lucide-react";

import {
  CampoDoDono,
  CampoDosParticipantes,
  type MembroDaEquipe,
} from "@/components/dono-e-participantes";
import { FormDialog } from "@/components/form-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moveOpportunity, updateOpportunity } from "@/features/opportunities/actions";
import { comAviso } from "@/lib/avisar";

import {
  DialogoDeGanho,
  DialogoDePerda,
  DialogoDeReabrir,
  type NegocioDoDialogo,
} from "../dialogos";

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

/**
 * Negócio ganho reabre pelo diálogo (CRM-15): volta para a primeira etapa
 * aberta, sem tocar na pessoa nem nos processos, e só o dono do negócio ou a
 * gestão conseguem — a recusa aparece no diálogo.
 */
export function ReabrirGanho({
  negocio,
  destino,
}: {
  negocio: NegocioDoDialogo;
  destino: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button size="sm" className="rounded-xl" onClick={() => setAberto(true)}>
        <RotateCcw className="mr-1 h-4 w-4" />
        Reabrir
      </Button>
      <DialogoDeReabrir negocio={negocio} destino={destino} aberto={aberto} aoMudar={setAberto} />
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

/**
 * Título, origem, dono e participantes. O valor mora nos vistos do negócio
 * (CRM-13). Trocar o dono: só o dono atual ou a gestão — o banco confere
 * (0044) e a frase aparece aqui. No Ganho, dono e participantes passam ao
 * cliente.
 */
export function EditarNegocio({
  negocio,
  equipe,
  participantes,
  nomeDoDono = null,
}: {
  negocio: {
    id: string;
    title: string;
    source: string | null;
    owner_id: string | null;
  };
  equipe: MembroDaEquipe[];
  participantes: string[];
  nomeDoDono?: string | null;
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

      <div className="space-y-2">
        <Label htmlFor="source">Origem</Label>
        <Input
          id="source"
          name="source"
          placeholder="Indicação, site..."
          defaultValue={negocio.source ?? ""}
        />
      </div>

      <CampoDoDono equipe={equipe} ownerId={negocio.owner_id} nomeDoDono={nomeDoDono} />
      <CampoDosParticipantes equipe={equipe} participantes={participantes} />
    </FormDialog>
  );
}
