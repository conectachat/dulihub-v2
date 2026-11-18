"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatar";
import type { OportunidadeExistente } from "@/lib/parecidos";

/**
 * "Este contato já tem oportunidade" (CRM-11): quais, em que situação e de
 * quando — com o link para conferir — antes de criar outra. Um cliente pode
 * ter fechado um visto e agora pedir outro; também pode ser o mesmo negócio
 * em dobro.
 */

const SITUACAO: Record<OportunidadeExistente["status"], string> = {
  open: "aberta",
  won: "ganha",
  lost: "perdida",
};

export function AvisoDeOportunidade({
  oportunidades,
  aoCriarOutra,
}: {
  oportunidades: OportunidadeExistente[];
  aoCriarOutra: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-2xl border bg-warning/15 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="h-4 w-4 shrink-0 text-brand" />
        Este contato já tem oportunidade
      </p>

      <ul className="space-y-1">
        {oportunidades.map((o) => (
          <li key={o.id}>
            <a
              href={`/crm/${o.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              {o.titulo}
            </a>{" "}
            · {SITUACAO[o.status]} · criada em {formatarData(o.criadaEm)}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto">Criar outra oportunidade para este contato?</span>
        <Button type="button" size="sm" className="rounded-xl" onClick={aoCriarOutra}>
          Criar outra
        </Button>
      </div>
    </div>
  );
}
