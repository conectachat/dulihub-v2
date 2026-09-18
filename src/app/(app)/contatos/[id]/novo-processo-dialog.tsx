"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarProcesso } from "@/features/projects/actions";
import { tituloSugerido } from "@/features/projects/schema";

/**
 * Novo processo, a partir da ficha do contato.
 *
 * Os `name` dos campos são os que `processoFromForm` lê — o teste de
 * `schema.test.ts` monta o formulário com eles.
 *
 * O título acompanha o visto escolhido até a pessoa mexer nele; depois disso,
 * trocar o visto não apaga o que ela escreveu.
 */
export function NovoProcessoDialog({
  personId,
  personName,
  vistos,
  negocios,
  negocioInicial,
}: {
  personId: string;
  personName: string;
  vistos: { id: string; name: string }[];
  negocios: { id: string; title: string }[];
  /** Vindo do atalho do CRM: abre já aberto e com o negócio escolhido. */
  negocioInicial?: string;
}) {
  return (
    <FormDialog
      acao={criarProcesso}
      titulo="Novo processo"
      descricao="As etapas e as pastas exigidas vêm do tipo de visto. Mudar o tipo de visto depois não altera este processo."
      salvar="Criar processo"
      pendente="Criando..."
      abertoDeInicio={Boolean(negocioInicial)}
      gatilho={
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-4 w-4" />
          Novo processo
        </Button>
      }
    >
      <Campos
        personId={personId}
        personName={personName}
        vistos={vistos}
        negocios={negocios}
        negocioInicial={negocioInicial}
      />
    </FormDialog>
  );
}

/**
 * Os campos ficam num componente próprio para o estado do título morar
 * **dentro** do diálogo: o Radix desmonta o conteúdo ao fechar, e reabrir
 * começa do zero — sem um título velho ao lado de um visto em branco.
 */
function Campos({
  personId,
  personName,
  vistos,
  negocios,
  negocioInicial,
}: {
  personId: string;
  personName: string;
  vistos: { id: string; name: string }[];
  negocios: { id: string; title: string }[];
  negocioInicial?: string;
}) {
  const [titulo, setTitulo] = useState(tituloSugerido(null, personName));
  const [editado, setEditado] = useState(false);

  const semVisto = vistos.length === 0;

  return (
    <>
      <input type="hidden" name="person_id" value={personId} />

      <div className="space-y-2">
        <Label htmlFor="visa_type_id">Tipo de visto *</Label>
        <NativeSelect
          id="visa_type_id"
          name="visa_type_id"
          required
          defaultValue=""
          disabled={semVisto}
          onChange={(e) => {
            if (editado) return;
            const nome = vistos.find((v) => v.id === e.target.value)?.name ?? null;
            setTitulo(tituloSugerido(nome, personName));
          }}
        >
          <option value="" disabled>
            {semVisto ? "Nenhum tipo de visto ativo" : "Escolha o tipo de visto"}
          </option>
          {vistos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </NativeSelect>
        {semVisto ? (
          <p className="text-xs text-muted-foreground">
            Cadastre um em Configuração › Tipos de visto.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input
          id="title"
          name="title"
          required
          value={titulo}
          onChange={(e) => {
            setEditado(true);
            setTitulo(e.target.value);
          }}
        />
      </div>

      {negocios.length > 0 ? (
        <div className="space-y-2">
          <Label htmlFor="opportunity_id">Negócio</Label>
          <NativeSelect
            id="opportunity_id"
            name="opportunity_id"
            defaultValue={negocioInicial ?? ""}
          >
            <option value="">Nenhum</option>
            {negocios.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
    </>
  );
}
