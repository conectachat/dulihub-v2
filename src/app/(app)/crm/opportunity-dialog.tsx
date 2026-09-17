"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

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
import {
  createOpportunity,
} from "@/features/opportunities/actions";

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

  const [state, formAction] = useActionState(createOpportunity, ESTADO_INICIAL);

  // Fecha só quando a Server Action confirmou que gravou.
  const { open, setOpen } = useDialogOnSuccess(state.token);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={variant === "ghost" ? "sm" : "default"}>
          <Plus className="mr-1 h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova oportunidade</DialogTitle>
          <DialogDescription>
            Um negócio pertence a uma pessoa. A mesma pessoa pode ter várias ao
            longo do tempo.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="person_id">Contato *</Label>
            <select
              id="person_id"
              name="person_id"
              required
              defaultValue=""
              className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm"
            >
              <option value="" disabled>
                Escolha um contato
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              name="title"
              placeholder="Ex.: Processo EB-2 NIW"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-2">
              <Label htmlFor="value">Valor</Label>
              <Input id="value" name="value" inputMode="decimal" placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Moeda</Label>
              <select
                id="currency"
                name="currency"
                defaultValue="BRL"
                className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm"
              >
                <option value="BRL">BRL</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stage_id">Etapa *</Label>
              <select
                id="stage_id"
                name="stage_id"
                required
                defaultValue={defaultStageId ?? stages[0]?.id ?? ""}
                className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Origem</Label>
              <Input id="source" name="source" placeholder="Indicação, site..." />
            </div>
          </div>

          <FieldError mensagem={state.error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton pendente="Criando...">Criar oportunidade</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
