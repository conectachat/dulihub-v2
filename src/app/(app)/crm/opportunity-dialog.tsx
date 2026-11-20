"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { AvisoDeDuplicado } from "@/components/aviso-de-duplicado";
import { AvisoDeOportunidade } from "@/components/aviso-de-oportunidade";
import { CamposDoContatoNovo } from "@/components/campos-do-contato-novo";
import { FormDialog } from "@/components/form-dialog";
import { ContatoEscolhido, ModosDoContato, type ModoDoContato } from "@/components/modos-do-contato";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOpportunity } from "@/features/opportunities/actions";
import { restorePerson } from "@/features/people/actions";
import {
  CAMPO_CONFIRMAR_OPORTUNIDADE,
  CAMPO_CONFIRMAR_PARECIDO,
  type ContatoParecido,
  type EstadoComConfirmacao,
} from "@/lib/parecidos";

/**
 * Nova oportunidade: com um contato que já existe ou com um contato novo,
 * que nasce junto (CRM-11, CRM-12). Dois avisos podem parar o envio:
 *
 * - **contato parecido** (CON-4) — "Sim, é a mesma pessoa" troca para o
 *   existente e reenvia. O escolhido vai num campo oculto e o nome aparece no
 *   lugar do seletor, porque o seletor só traz os 500 primeiros e não traz a
 *   lixeira; enquanto ele está lá, o seletor sai do formulário, para não
 *   haver dois `person_id` (o `formData.get` pega o primeiro). Na lixeira, o
 *   aviso restaura antes;
 * - **oportunidade anterior do contato** — "Criar outra" reenvia com a
 *   confirmação.
 */
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
  const [modo, setModo] = useState<ModoDoContato>("existente");
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null);

  function recomecar() {
    setModo("existente");
    setEscolhido(null);
  }

  async function restaurar(id: string) {
    const dados = new FormData();
    dados.set("id", id);
    return restorePerson(dados);
  }

  function usarExistente(
    id: string,
    parecidos: ContatoParecido[],
    reenviarCom: (extra: Record<string, string>) => void,
  ) {
    setModo("existente");
    setEscolhido({ id, nome: parecidos.find((p) => p.id === id)?.nome ?? "" });
    // O formulário ainda é o do contato novo: o extra troca o modo e o contato.
    reenviarCom({ modo_contato: "existente", person_id: id });
  }

  return (
    <FormDialog<EstadoComConfirmacao>
      acao={createOpportunity}
      titulo="Nova oportunidade"
      descricao="Um negócio pertence a uma pessoa. A mesma pessoa pode ter várias ao longo do tempo."
      salvar="Criar oportunidade"
      pendente="Criando..."
      aoAbrir={recomecar}
      gatilho={
        <Button variant={variant} size={variant === "ghost" ? "sm" : "default"}>
          <Plus className="mr-1 h-4 w-4" />
          {label}
        </Button>
      }
      aviso={(estado, { reenviarCom }) => {
        if (estado.parecidos?.length) {
          const parecidos = estado.parecidos;
          return (
            <AvisoDeDuplicado
              parecidos={parecidos}
              modo="criar"
              aoUsarExistente={(id) => usarExistente(id, parecidos, reenviarCom)}
              aoRestaurar={restaurar}
              aoGravarMesmoAssim={() => reenviarCom({ [CAMPO_CONFIRMAR_PARECIDO]: "1" })}
            />
          );
        }
        if (estado.oportunidades?.length) {
          return (
            <AvisoDeOportunidade
              oportunidades={estado.oportunidades}
              aoCriarOutra={() => reenviarCom({ [CAMPO_CONFIRMAR_OPORTUNIDADE]: "1" })}
            />
          );
        }
        return null;
      }}
    >
      <ModosDoContato modo={modo} aoTrocar={setModo} rotulo="Contato da oportunidade" />

      {modo === "existente" ? (
        escolhido ? (
          <ContatoEscolhido id={escolhido.id} nome={escolhido.nome} aoTrocar={() => setEscolhido(null)} />
        ) : (
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
        )
      ) : (
        <CamposDoContatoNovo />
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" placeholder="Ex.: Processo EB-2 NIW" required />
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
