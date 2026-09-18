"use client";

import { Pencil, Plus } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveVisaType } from "@/features/settings/visa-type-actions";

export type VisaTypeForm = {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  estimated_days: number | null;
  is_active: boolean;
};

export function VisaTypeDialog({ visaType }: { visaType?: VisaTypeForm }) {
  return (
    <FormDialog
      acao={saveVisaType}
      titulo={visaType ? "Editar tipo de visto" : "Novo tipo de visto"}
      descricao="As etapas e os documentos exigidos são configurados depois, dentro do tipo."
      gatilho={
        visaType ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-primary"
            aria-label={`Editar ${visaType.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Novo tipo de visto
          </Button>
        )
      }
    >
      {visaType ? <input type="hidden" name="id" value={visaType.id} /> : null}

      <div className="space-y-2">
        <Label htmlFor="vt-name">Nome *</Label>
        <Input
          id="vt-name"
          name="name"
          placeholder="EB-1A, EB-2 NIW, O-1..."
          defaultValue={visaType?.name ?? ""}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vt-desc">Descrição</Label>
        <Input
          id="vt-desc"
          name="description"
          defaultValue={visaType?.description ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_6rem_8rem]">
        <div className="space-y-2">
          <Label htmlFor="vt-price">Preço base</Label>
          <Input
            id="vt-price"
            name="base_price"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={visaType?.base_price?.toString() ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vt-currency">Moeda</Label>
          <NativeSelect
            id="vt-currency"
            name="currency"
            defaultValue={visaType?.currency ?? "BRL"}
          >
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vt-days">Prazo (dias)</Label>
          <Input
            id="vt-days"
            name="estimated_days"
            inputMode="numeric"
            defaultValue={visaType?.estimated_days?.toString() ?? ""}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={visaType?.is_active ?? true}
          className="h-4 w-4"
        />
        Ativo — aparece ao criar um processo novo
      </label>
    </FormDialog>
  );
}
