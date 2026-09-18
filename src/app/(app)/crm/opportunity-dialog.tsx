"use client";

import { Plus } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOpportunity } from "@/features/opportunities/actions";

export function OpportunityDialog({
  people,
  stages,
  defaultStageId,
  label = "Nova oportunidade",
  variant = "default",
}: {
  people: { id: string; full_name: string }[];
  stages: { id: string; name: string }[];
  defaultStageId?: string;
  label?: string;
  variant?: "default" | "ghost";
}) {
  return (
    <FormDialog
      acao={createOpportunity}
      titulo="Nova oportunidade"
      descricao="Um negócio pertence a uma pessoa. A mesma pessoa pode ter várias ao longo do tempo."
      salvar="Criar oportunidade"
      pendente="Criando..."
      gatilho={
        <Button variant={variant} size={variant === "ghost" ? "sm" : "default"}>
          <Plus className="mr-1 h-4 w-4" />
          {label}
        </Button>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="person_id">Contato *</Label>
        <NativeSelect id="person_id" name="person_id" required defaultValue="">
          <option value="" disabled>
            Escolha um contato
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" placeholder="Ex.: Processo EB-2 NIW" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-2">
          <Label htmlFor="value">Valor</Label>
          <Input id="value" name="value" inputMode="decimal" placeholder="0,00" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Moeda</Label>
          <NativeSelect id="currency" name="currency" defaultValue="BRL">
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stage_id">Etapa *</Label>
          <NativeSelect
            id="stage_id"
            name="stage_id"
            required
            defaultValue={defaultStageId ?? stages[0]?.id ?? ""}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Origem</Label>
          <Input id="source" name="source" placeholder="Indicação, site..." />
        </div>
      </div>
    </FormDialog>
  );
}
