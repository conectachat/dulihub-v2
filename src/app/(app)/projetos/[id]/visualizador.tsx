"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";

import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  aprovarArquivo,
  enderecoDoArquivo,
  excluirArquivo,
  recusarArquivo,
} from "@/features/projects/documentos-actions";
import type { PastaDoProcesso } from "@/features/projects/queries";
import { tipoDeVisualizacao } from "@/features/projects/regras";
import { ESTADO_INICIAL } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";
import { formatarDataHora } from "@/lib/formatar";
import { cn } from "@/lib/utils";

export type ArquivoAberto = { pastaId: string; indice: number };

const ROTULO: Record<string, string> = {
  pending: "Em análise",
  approved: "Aprovado",
  rejected: "Recusado",
};

/**
 * Revisar sem sair da tela: o arquivo à esquerda, a decisão à direita, setas
 * para o próximo da pasta. PDF e imagem desenham aqui; Word, Excel e HEIC
 * baixam (o navegador não mostra).
 *
 * O endereço é assinado por 5 minutos, pedido ao servidor a cada arquivo —
 * com a RLS de quem está vendo.
 */
export function Visualizador({
  pasta,
  indice,
  onTrocar,
  onFechar,
}: {
  pasta: PastaDoProcesso;
  indice: number;
  onTrocar: (indice: number) => void;
  onFechar: () => void;
}) {
  const arquivo = pasta.arquivos[indice];
  const total = pasta.arquivos.length;

  // Excluído o último da lista, não há o que mostrar.
  useEffect(() => {
    if (!arquivo) onFechar();
  }, [arquivo, onFechar]);

  if (!arquivo) return null;

  return (
    <Dialog open onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="flex h-[90vh] max-w-[95vw] flex-col gap-3 p-4 sm:max-w-6xl">
        <div className="flex items-center gap-2 pr-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={indice === 0}
            onClick={() => onTrocar(indice - 1)}
            aria-label="Arquivo anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{arquivo.file_name}</DialogTitle>
            <DialogDescription className="text-xs">
              {pasta.name} · {indice + 1} de {total}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={indice >= total - 1}
            onClick={() => onTrocar(indice + 1)}
            aria-label="Próximo arquivo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[1fr_18rem]">
          <Previa key={arquivo.id} id={arquivo.id} nome={arquivo.file_name} mime={arquivo.mime_type} />
          <Decisao key={`${arquivo.id}-${arquivo.review_status}`} arquivo={arquivo} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Previa({ id, nome, mime }: { id: string; nome: string; mime: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tipo = tipoDeVisualizacao(mime, nome);

  useEffect(() => {
    let vivo = true;
    enderecoDoArquivo(id).then((r) => {
      if (!vivo) return;
      if (r.error) setErro(r.error);
      else setUrl(r.url);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  const moldura = "flex min-h-[40vh] items-center justify-center overflow-auto rounded-2xl border bg-muted/40";

  if (erro) return <div className={moldura}><p className="text-sm text-destructive">{erro}</p></div>;
  if (!url) {
    return (
      <div className={moldura}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (tipo === "pdf") {
    return <iframe src={url} title={nome} className="h-full min-h-[40vh] w-full rounded-2xl border" />;
  }
  if (tipo === "imagem") {
    return (
      <div className={moldura}>
        {/* URL assinada e temporária: o otimizador do Next não ajuda aqui. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={nome} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  return (
    <div className={cn(moldura, "flex-col gap-2 text-center")}>
      <p className="text-sm text-muted-foreground">Este tipo de arquivo não abre no navegador.</p>
      <BaixarBotao id={id} />
    </div>
  );
}

function BaixarBotao({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await enderecoDoArquivo(id, true);
          if (r.url) window.location.assign(r.url);
        })
      }
    >
      <Download className="mr-1 h-4 w-4" /> Baixar
    </Button>
  );
}

function Decisao({ arquivo }: { arquivo: PastaDoProcesso["arquivos"][number] }) {
  const [aprovando, iniciar] = useTransition();
  const [recusando, setRecusando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [estado, recusar] = useActionState(recusarArquivo, ESTADO_INICIAL);

  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  return (
    <aside className="flex flex-col gap-3 overflow-y-auto">
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">Estado: </span>
          <span className="font-medium">{ROTULO[arquivo.review_status] ?? arquivo.review_status}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Enviado {formatarDataHora(arquivo.uploaded_at)}
          {arquivo.enviadoPor ? ` por ${arquivo.enviadoPor}` : ""}
        </p>
        {arquivo.review_status === "rejected" && arquivo.rejection_reason ? (
          <p className="rounded-xl bg-destructive/10 p-2 text-xs text-destructive">
            Motivo: {arquivo.rejection_reason}
          </p>
        ) : null}
      </div>

      {arquivo.review_status !== "approved" ? (
        <Button
          type="button"
          disabled={aprovando}
          className="bg-success text-white hover:bg-success/90"
          onClick={() => iniciar(async () => void (await comAviso(aprovarArquivo)(fd({ id: arquivo.id }))))}
        >
          <ThumbsUp className="mr-1 h-4 w-4" /> Aprovar
        </Button>
      ) : null}

      {recusando ? (
        <form action={recusar} className="space-y-2">
          <input type="hidden" name="id" value={arquivo.id} />
          <label htmlFor="motivo" className="text-xs font-medium">
            Motivo da recusa — é o que o cliente vai ler
          </label>
          <textarea
            id="motivo"
            name="motivo"
            required
            autoFocus
            rows={4}
            placeholder="Ex.: passaporte vencido, envie a página com a data de validade."
            className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm"
          />
          <FieldError mensagem={estado.error} pequeno />
          <div className="flex gap-2">
            <SubmitButton pendente="Recusando..." size="sm" className="bg-destructive text-white hover:bg-destructive/90">
              Recusar
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRecusando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : arquivo.review_status !== "rejected" ? (
        <Button type="button" variant="outline" onClick={() => setRecusando(true)}>
          <ThumbsDown className="mr-1 h-4 w-4" /> Recusar
        </Button>
      ) : null}

      <BaixarBotao id={arquivo.id} />

      <div className="mt-auto border-t pt-3">
        {confirmandoExclusao ? (
          <div className="space-y-2">
            <p className="text-xs">
              {arquivo.review_status === "approved"
                ? "Este arquivo já foi aprovado. Excluir apaga de vez, sem lixeira."
                : "Excluir apaga o arquivo de vez, sem lixeira."}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => void comAviso(excluirArquivo)(fd({ id: arquivo.id }))}
              >
                Excluir de vez
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmandoExclusao(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmandoExclusao(true)}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Excluir arquivo
          </Button>
        )}
      </div>
    </aside>
  );
}
