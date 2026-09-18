"use client";

import { Pencil, Plus } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPerson, updatePerson } from "@/features/people/actions";

export type PersonFormValues = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_country_code: string | null;
  company?: string | null;
  job_title?: string | null;
};

export function PersonDialog({ person }: { person?: PersonFormValues }) {
  return (
    <FormDialog
      acao={person ? updatePerson : createPerson}
      titulo={person ? "Editar contato" : "Novo contato"}
      descricao="Só o nome é obrigatório. O resto pode ser completado depois."
      gatilho={
        person ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-primary"
            aria-label={`Editar ${person.full_name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Novo Contato
          </Button>
        )
      }
    >
      {person ? <input type="hidden" name="id" value={person.id} /> : null}

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
          <Input id="company" name="company" defaultValue={person?.company ?? ""} />
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
    </FormDialog>
  );
}
