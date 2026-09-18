"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AlertCircle, Check, FileText, Loader2 } from "lucide-react";

import type { PresencaNaPagina } from "@/components/editor/observacoes-editor";
import type { Estado } from "@/features/pages/sincronia";
import { formatarDataHora, iniciais } from "@/lib/formatar";

/**
 * Aba Observações do processo: cabeçalho e o editor.
 *
 * O editor vem por `next/dynamic` sem SSR — é pesado, só existe no navegador
 * (Yjs, canal em tempo real) e nenhuma outra tela precisa dele.
 */
const ObservacoesEditor = dynamic(
  () => import("@/components/editor/observacoes-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center rounded-3xl bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function Observacoes({
  paginaId,
  organizationId,
  projectId,
  usuario,
  equipe,
  editadoEm,
  editadoPor,
}: {
  paginaId: string;
  organizationId: string;
  projectId: string;
  usuario: { id: string; nome: string };
  equipe: { id: string; nome: string }[];
  editadoEm: string | null;
  editadoPor: string | null;
}) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [presentes, setPresentes] = useState<PresencaNaPagina[]>([]);
  const outros = presentes.filter((p) => p.id !== usuario.id);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span className="font-medium">Observações do processo</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {outros.length > 0 ? (
            <div className="flex -space-x-1.5" aria-label="Quem está na página">
              {outros.map((p) => (
                <span
                  key={p.id}
                  title={`${p.nome} está editando`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background"
                  style={{ backgroundColor: p.cor }}
                >
                  {iniciais(p.nome)}
                </span>
              ))}
            </div>
          ) : null}

          {editadoEm ? (
            <span className="hidden sm:inline">
              Editado {formatarDataHora(editadoEm)}
              {editadoPor ? ` por ${editadoPor}` : ""}
            </span>
          ) : null}

          <IndicadorDeEstado estado={estado} />
        </div>
      </div>

      <ObservacoesEditor
        paginaId={paginaId}
        organizationId={organizationId}
        projectId={projectId}
        usuario={usuario}
        equipe={equipe}
        aoMudarEstado={setEstado}
        aoMudarPresenca={setPresentes}
      />
    </div>
  );
}

function IndicadorDeEstado({ estado }: { estado: Estado }) {
  if (estado === "carregando") {
    return (
      <span className="flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Abrindo...
      </span>
    );
  }
  if (estado === "salvando") {
    return (
      <span className="flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
      </span>
    );
  }
  if (estado === "erro") {
    return (
      <span className="flex items-center gap-1 text-destructive" role="status">
        <AlertCircle className="h-3 w-3" /> Não salvou — tentando de novo
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Check className="h-3 w-3" /> Salvo automaticamente
    </span>
  );
}
