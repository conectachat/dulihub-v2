"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { AvisoDeDuplicado } from "@/components/aviso-de-duplicado";
import { AvisoDeOportunidade } from "@/components/aviso-de-oportunidade";
import { FormDialog, useDispensarAviso } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOpportunity } from "@/features/opportunities/actions";
import { restorePerson } from "@/features/people/actions";
import { DDI_PADRAO } from "@/lib/contato";
import {
  CAMPO_CONFIRMAR_OPORTUNIDADE,
  CAMPO_CONFIRMAR_PARECIDO,
  type ContatoParecido,
  type EstadoComConfirmacao,
} from "@/lib/parecidos";

type ModoDoContato = "existente" | "novo";

/**
 * Botão que muda o contato que vai ser enviado sem ser campo de formulário
 * (o modo, o "Trocar"): tira o aviso da tela como uma edição faria — senão
 * ele ofereceria "Criar mesmo assim" para um contato que já não está na tela.
 */
function BotaoQueDispensa({
  dispensa = true,
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & {
  /** Falso quando o clique não muda nada (o modo que já está ativo). */
  dispensa?: boolean;
}) {
  const dispensar = useDispensarAviso();
  return (
    <Button
      {...props}
      onClick={(evento) => {
        if (dispensa) dispensar();
        onClick?.(evento);
      }}
    />
  );
}

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
      <input type="hidden" name="modo_contato" value={modo} />

      <div className="flex gap-2" role="group" aria-label="Contato da oportunidade">
        {(
          [
            ["existente", "Contato existente"],
            ["novo", "Novo contato"],
          ] as const
        ).map(([valor, rotulo]) => (
          <BotaoQueDispensa
            key={valor}
            type="button"
            size="sm"
            variant={modo === valor ? "default" : "outline"}
            className="rounded-xl"
            aria-pressed={modo === valor}
            dispensa={modo !== valor}
            onClick={() => setModo(valor)}
          >
            {rotulo}
          </BotaoQueDispensa>
        ))}
      </div>

      {modo === "existente" ? (
        escolhido ? (
          <div className="space-y-2">
            <Label>Contato *</Label>
            <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-sm">
              <span className="font-medium">{escolhido.nome}</span>
              <BotaoQueDispensa
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary"
                onClick={() => setEscolhido(null)}
              >
                Trocar
              </BotaoQueDispensa>
            </div>
            <input type="hidden" name="person_id" value={escolhido.id} />
          </div>
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="novo_full_name">Nome *</Label>
            <Input id="novo_full_name" name="novo_full_name" required autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="novo_phone_country_code">DDI *</Label>
              <Input
                id="novo_phone_country_code"
                name="novo_phone_country_code"
                placeholder={DDI_PADRAO}
                defaultValue={DDI_PADRAO}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo_phone">Telefone *</Label>
              <Input id="novo_phone" name="novo_phone" inputMode="tel" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="novo_email">E-mail *</Label>
            <Input id="novo_email" name="novo_email" type="email" required />
          </div>
        </div>
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
