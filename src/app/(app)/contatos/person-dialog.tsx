"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  createPerson,
  updatePerson,
  type ActionState,
} from "@/features/people/actions";

const initialState: ActionState = { error: null };

export type PersonFormValues = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_country_code: string | null;
  company?: string | null;
  job_title?: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Salvar"}
    </Button>
  );
}

export function PersonDialog({ person }: { person?: PersonFormValues }) {
  const isEdit = Boolean(person);
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    isEdit ? updatePerson : createPerson,
    initialState,
  );

  // Fecha só quando a Server Action confirmou que gravou.
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-primary"
            aria-label={`Editar ${person!.full_name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Novo Contato
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar contato" : "Novo contato"}</DialogTitle>
          <DialogDescription>
            Só o nome é obrigatório. O resto pode ser completado depois.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit ? <input type="hidden" name="id" value={person!.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="full_name">Nome *</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={person?.full_name ?? ""}
              required
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="phone_country_code">DDI</Label>
              <Input
                id="phone_country_code"
                name="phone_country_code"
                placeholder="+55"
                defaultValue={person?.phone_country_code ?? "+55"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                name="phone"
                inputMode="tel"
                defaultValue={person?.phone ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={person?.email ?? ""}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Input
                id="company"
                name="company"
                defaultValue={person?.company ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_title">Cargo</Label>
              <Input
                id="job_title"
                name="job_title"
                defaultValue={person?.job_title ?? ""}
              />
            </div>
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
