"use client";

import { Pencil, Plus } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveParceiro } from "@/features/settings/escritas-locais";
import type { ParceiroNaLista } from "@/features/settings/montagem";
import { DDI_PADRAO } from "@/lib/contato";

/**
 * Novo parceiro e Editar parceiro (PAR-4, desenho §7). Os dados cadastrais
 * completos existem para a invoice de quem é de fora do Brasil.
 */
export function ParceiroDialog({ parceiro }: { parceiro?: ParceiroNaLista }) {
  const campo = (nome: keyof ParceiroNaLista) => (parceiro?.[nome] as string | null | undefined) ?? "";

  return (
    <FormDialog
      acao={saveParceiro}
      titulo={parceiro ? "Editar parceiro" : "Novo parceiro"}
      descricao="Nome, país, e-mail e telefone são obrigatórios. O contato do parceiro é o que aparece nos clientes dele."
      gatilho={
        parceiro ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-primary"
            aria-label={`Editar ${parceiro.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Novo parceiro
          </Button>
        )
      }
    >
      {parceiro ? <input type="hidden" name="id" value={parceiro.id} /> : null}

      <div className="space-y-2">
        <Label htmlFor="pa-nome">Nome no app *</Label>
        <Input id="pa-nome" name="name" defaultValue={campo("name")} required autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pa-razao">Razão social</Label>
        <Input id="pa-razao" name="legal_name" defaultValue={campo("legal_name")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pa-pais">País *</Label>
          <Input
            id="pa-pais"
            name="address_country"
            placeholder="Estados Unidos"
            defaultValue={campo("address_country")}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pa-documento">Documento fiscal</Label>
          <Input
            id="pa-documento"
            name="tax_id"
            placeholder="CNPJ, EIN, Tax ID"
            defaultValue={campo("tax_id")}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm leading-none font-medium">Endereço</legend>
        <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
          <Input name="address_street" aria-label="Rua" placeholder="Rua" defaultValue={campo("address_street")} />
          <Input name="address_number" aria-label="Número" placeholder="Número" defaultValue={campo("address_number")} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            name="address_complement"
            aria-label="Complemento"
            placeholder="Complemento"
            defaultValue={campo("address_complement")}
          />
          <Input
            name="address_district"
            aria-label="Bairro"
            placeholder="Bairro"
            defaultValue={campo("address_district")}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem]">
          <Input name="address_city" aria-label="Cidade" placeholder="Cidade" defaultValue={campo("address_city")} />
          <Input name="address_state" aria-label="Estado" placeholder="Estado" defaultValue={campo("address_state")} />
          <Input
            name="address_postal_code"
            aria-label="CEP ou ZIP"
            placeholder="CEP/ZIP"
            defaultValue={campo("address_postal_code")}
          />
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="pa-email">E-mail *</Label>
        <Input id="pa-email" name="email" type="email" defaultValue={campo("email")} required />
      </div>

      <div className="grid gap-4 grid-cols-[6rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="pa-ddi">DDI *</Label>
          <Input
            id="pa-ddi"
            name="phone_country_code"
            inputMode="tel"
            defaultValue={campo("phone_country_code") || DDI_PADRAO}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pa-telefone">Telefone *</Label>
          <Input id="pa-telefone" name="phone" inputMode="tel" defaultValue={campo("phone")} required />
        </div>
      </div>
    </FormDialog>
  );
}
