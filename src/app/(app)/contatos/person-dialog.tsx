"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import { AvisoDeDuplicado } from "@/components/aviso-de-duplicado";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPerson, restorePerson, updatePerson } from "@/features/people/actions";
import { DDI_PADRAO } from "@/lib/contato";
import { CAMPO_CONFIRMAR_PARECIDO, type EstadoComConfirmacao } from "@/lib/parecidos";
import { enderecoDaPessoa } from "@/lib/pessoa";

export type PersonFormValues = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_country_code: string | null;
  // Obrigatórios de propósito: o formulário grava todos os campos, e campo
  // que não veio vira vazio por cima do que estava gravado. Opcionais, a
  // lista de /contatos deixou de mandá-los e cada edição por ali apagava
  // Empresa e Cargo (revisão de 18/nov).
  company: string | null;
  job_title: string | null;
  /** Cliente de parceiro (PAR-7): sem contato próprio, o Editar não o mostra. */
  partner_organization_id?: string | null;
};

/** O contato do cliente de parceiro é o do parceiro (PAR-7, critério 9a). */
export const DESCRICAO_SEM_CONTATO = "O contato é o do parceiro.";

/**
 * Criar ou editar contato. Nome, telefone e e-mail são obrigatórios (CON-8);
 * e-mail ou telefone que já existem param o envio com o aviso "É a mesma
 * pessoa?" (CON-4).
 */
export function PersonDialog({ person }: { person?: PersonFormValues }) {
  const router = useRouter();

  async function restaurar(id: string) {
    const dados = new FormData();
    dados.set("id", id);
    return restorePerson(dados);
  }

  return (
    <FormDialog<EstadoComConfirmacao>
      acao={person ? updatePerson : createPerson}
      titulo={person ? "Editar contato" : "Novo contato"}
      descricao={
        person?.partner_organization_id
          ? DESCRICAO_SEM_CONTATO
          : "Nome, telefone e e-mail são obrigatórios."
      }
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
      aviso={(estado, { fechar, reenviarCom }) =>
        estado.parecidos?.length ? (
          <AvisoDeDuplicado
            parecidos={estado.parecidos}
            modo={person ? "editar" : "criar"}
            aoUsarExistente={(id, estagio) => {
              fechar();
              router.push(enderecoDaPessoa(id, estagio));
            }}
            // Na edição, restaurar o outro deixaria dois contatos ativos.
            aoRestaurar={person ? undefined : restaurar}
            aoGravarMesmoAssim={() => reenviarCom({ [CAMPO_CONFIRMAR_PARECIDO]: "1" })}
          />
        ) : null
      }
    >
      {person ? <input type="hidden" name="id" value={person.id} /> : null}

      <CamposDoContato person={person} semContato={Boolean(person?.partner_organization_id)} />
    </FormDialog>
  );
}

/**
 * Os campos do contato — nome, DDI, telefone, e-mail, empresa e cargo —, os
 * mesmos no Editar do contato e no do cliente. A lista tem de bater com
 * `personFromForm`.
 */
export function CamposDoContato({
  person,
  semContato = false,
}: {
  person?: PersonFormValues;
  /** Cliente de parceiro: sem DDI, telefone e e-mail — o servidor nem os lê. */
  semContato?: boolean;
}) {
  return (
    <>
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

      {semContato ? null : (
      <>
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="phone_country_code">DDI *</Label>
          <Input
            id="phone_country_code"
            name="phone_country_code"
            placeholder={DDI_PADRAO}
            defaultValue={person?.phone_country_code ?? DDI_PADRAO}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone *</Label>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            defaultValue={person?.phone ?? ""}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail *</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={person?.email ?? ""}
          required
        />
      </div>
      </>
      )}

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
    </>
  );
}
