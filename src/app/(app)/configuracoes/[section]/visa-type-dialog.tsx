"use client";

import { useActionState } from "react";
import { Pencil, Plus } from "lucide-react";

import { ESTADO_INICIAL } from "@/lib/action-state";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { useDialogOnSuccess } from "@/lib/use-dialog-on-success";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const isEdit = Boolean(visaType);

  const [state, formAction] = useActionState(saveVisaType, ESTADO_INICIAL);

  // Fecha só quando a Server Action confirmou que gravou.
  const { open, setOpen } = useDialogOnSuccess(state.token);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-primary"
            aria-label={`Editar ${visaType!.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Novo tipo de visto
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar tipo de visto" : "Novo tipo de visto"}
          </DialogTitle>
          <DialogDescription>
            As etapas e os documentos exigidos são configurados depois, dentro
            do tipo.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit ? <input type="hidden" name="id" value={visaType!.id} /> : null}

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
              <select
                id="vt-currency"
                name="currency"
                defaultValue={visaType?.currency ?? "BRL"}
                className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm"
              >
                <option value="BRL">BRL</option>
                <option value="USD">USD</option>
              </select>
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

          <FieldError mensagem={state.error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton pendente="Salvando...">Salvar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
