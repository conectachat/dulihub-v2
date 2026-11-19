"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { AvisoDeDuplicado } from "@/components/aviso-de-duplicado";
import { FormDialog } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarCliente } from "@/features/people/actions";
import { CAMPO_CONFIRMAR_PARECIDO, type EstadoComConfirmacao } from "@/lib/parecidos";
import { enderecoDaPessoa } from "@/lib/pessoa";

import { CamposDoContato, type PersonFormValues } from "../../contatos/person-dialog";

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
  const participa = new Set(participantes);

  // Quem não enxerga a equipe da dona (consultor de organização atribuída)
  // receberia a lista sem o dono, o navegador escolheria "Sem dono", e salvar
  // um telefone apagaria o dono em silêncio. O dono atual está sempre na lista.
  const donos =
    cliente.owner_id && !equipe.some((m) => m.id === cliente.owner_id)
      ? [...equipe, { id: cliente.owner_id, nome: nomeDoDono ?? "Dono atual" }]
      : equipe;

  return (
    <FormDialog<EstadoComConfirmacao>
      acao={atualizarCliente}
      titulo="Editar cliente"
      descricao="Nome, telefone e e-mail são obrigatórios."
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

      <CamposDoContato person={cliente} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="owner_id">Dono</Label>
          <NativeSelect id="owner_id" name="owner_id" defaultValue={cliente.owner_id ?? ""}>
            <option value="">Sem dono</option>
            {donos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </NativeSelect>
        </div>
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Participantes</legend>
        {equipe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém na equipe desta organização.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {equipe.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="participantes"
                  value={m.id}
                  defaultChecked={participa.has(m.id)}
                  className="h-4 w-4 accent-primary"
                />
                {m.nome}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </FormDialog>
  );
}
