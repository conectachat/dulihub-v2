"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { AvisoDeDuplicado } from "@/components/aviso-de-duplicado";
import { CampoDoDono, CampoDosParticipantes } from "@/components/dono-e-participantes";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarCliente } from "@/features/people/actions";
import { CAMPO_CONFIRMAR_PARECIDO, type EstadoComConfirmacao } from "@/lib/parecidos";
import { enderecoDaPessoa } from "@/lib/pessoa";

import {
  CamposDoContato,
  DESCRICAO_SEM_CONTATO,
  type PersonFormValues,
} from "../../contatos/person-dialog";

type Membro = { id: string; nome: string };

/**
 * O Editar do cliente (CLI-10, CLI-12): os campos do contato, mais dono,
 * cliente desde e participantes. Dono e participantes saem da equipe da
 * organização **da pessoa** — o banco recusa qualquer outro pela chave
 * composta. O e-mail ou telefone de outro contato para com o aviso "É a mesma
 * pessoa?", como no Editar do contato.
 */
export function ClienteDialog({
  cliente,
  equipe,
  participantes,
  hoje,
  nomeDoDono = null,
}: {
  cliente: PersonFormValues & { owner_id: string | null; client_since: string | null };
  equipe: Membro[];
  /** Os `user_id` que hoje participam. */
  participantes: string[];
  hoje: string;
  /** Para o dono que não está na equipe visível (organização atribuída). */
  nomeDoDono?: string | null;
}) {
  const router = useRouter();

  return (
    <FormDialog<EstadoComConfirmacao>
      acao={atualizarCliente}
      titulo="Editar cliente"
      descricao={
        cliente.partner_organization_id
          ? DESCRICAO_SEM_CONTATO
          : "Nome, telefone e e-mail são obrigatórios."
      }
      gatilho={
        <Button
          variant="ghost"
          size="icon"
          className="text-primary"
          aria-label={`Editar ${cliente.full_name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      }
      aviso={(estado, { fechar, reenviarCom }) =>
        estado.parecidos?.length ? (
          <AvisoDeDuplicado
            parecidos={estado.parecidos}
            modo="editar"
            aoUsarExistente={(id, estagio) => {
              fechar();
              router.push(enderecoDaPessoa(id, estagio));
            }}
            aoGravarMesmoAssim={() => reenviarCom({ [CAMPO_CONFIRMAR_PARECIDO]: "1" })}
          />
        ) : null
      }
    >
      <input type="hidden" name="id" value={cliente.id} />

      <CamposDoContato person={cliente} semContato={Boolean(cliente.partner_organization_id)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoDoDono equipe={equipe} ownerId={cliente.owner_id} nomeDoDono={nomeDoDono} />
        <div className="space-y-2">
          <Label htmlFor="client_since">Cliente desde</Label>
          <Input
            id="client_since"
            name="client_since"
            type="date"
            max={hoje}
            defaultValue={cliente.client_since ?? ""}
          />
        </div>
      </div>

      <CampoDosParticipantes equipe={equipe} participantes={participantes} />
    </FormDialog>
  );
}
