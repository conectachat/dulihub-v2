"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, Upload } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  enderecoDoDocumento,
  excluirDocumento,
  registrarDocumento,
} from "@/features/clientes/documentos-actions";
import {
  CATEGORIAS,
  caminhoDoDocumento,
  documentosPorCategoria,
  type Categoria,
} from "@/features/clientes/regras";
import { ACEITOS, arquivoAceito, enviarERegistrar } from "@/lib/arquivos";
import { formatarData } from "@/lib/formatar";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";

export type DocumentoDoCliente = Pick<
  Tables<"files">,
  "id" | "category" | "filename" | "mime_type" | "size_bytes" | "created_at"
>;

/**
 * A aba Documentos do cliente (CLI-8): passaporte, identidade, comprovante
 * de residência, contrato — os papéis da pessoa, fora de qualquer processo.
 *
 * O envio fica em cima (criar vem antes da lista), com a categoria escolhida
 * antes do arquivo. O navegador sobe direto ao depósito `pessoas` e pede o
 * registro ao servidor; recusado, o objeto é removido. Só com internet: os
 * arquivos de cliente não vão ao aparelho (AGENTS.md).
 */
export function DocumentosDoCliente({
  pessoaId,
  organizationId,
  documentos,
}: {
  pessoaId: string;
  /** A organização **da pessoa**: é a primeira pasta do caminho. */
  organizationId: string;
  documentos: DocumentoDoCliente[];
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState<Categoria>("passaporte");
  const [enviando, setEnviando] = useState<string | null>(null);

  async function subir(lista: FileList) {
    const supabase = createClient();
    for (const arquivo of Array.from(lista)) {
      const aceito = arquivoAceito(arquivo);
      if (!aceito.ok) {
        toast.error(aceito.erro);
        continue;
      }
      setEnviando(arquivo.name);
      const id = crypto.randomUUID();
      const caminho = caminhoDoDocumento(organizationId, pessoaId, id, arquivo.name);
      const { error } = await enviarERegistrar(supabase.storage, "pessoas", caminho, arquivo, () =>
        registrarDocumento({
          pessoaId,
          id,
          caminho,
          nome: arquivo.name,
          tipo: arquivo.type || null,
          tamanho: arquivo.size,
          categoria,
        }),
      );
      if (error) toast.error(error);
    }
    setEnviando(null);
    router.refresh();
  }

  async function abrir(id: string, baixar: boolean) {
    const { url, error } = await enderecoDoDocumento(id, baixar);
    if (!url) {
      toast.error(error ?? "Não foi possível abrir o documento.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const grupos = documentosPorCategoria(documentos);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-dashed p-4">
        <div className="space-y-1">
          <Label htmlFor="documento-categoria">Categoria</Label>
          <NativeSelect
            id="documento-categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as Categoria)}
          >
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </NativeSelect>
        </div>
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          accept={ACEITOS}
          onChange={(e) => {
            if (e.target.files?.length) void subir(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          className="rounded-xl"
          disabled={enviando !== null}
          onClick={() => entrada.current?.click()}
        >
          <Upload className="mr-1 h-4 w-4" />
          {enviando ? `Enviando ${enviando}...` : "Enviar documento"}
        </Button>
        <span className="text-xs text-muted-foreground">PDF, imagem, Word ou Excel · até 20 MB</span>
      </div>

      {grupos.length === 0 ? (
        <EmptyState
          icon={FileText}
          size="compact"
          title="Nenhum documento ainda."
          hint="Passaporte, identidade, comprovante de residência e contrato ficam aqui."
        />
      ) : (
        grupos.map((g) => (
          <section key={g.categoria} className="space-y-2">
            <h3 className="text-sm font-medium">{g.rotulo}</h3>
            <ul className="space-y-1">
              {g.documentos.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-sm">{d.filename}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatarData(d.created_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-primary"
                      aria-label={`Abrir ${d.filename}`}
                      onClick={() => void abrir(d.id, false)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-primary"
                      aria-label={`Baixar ${d.filename}`}
                      onClick={() => void abrir(d.id, true)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <ConfirmAction
                      action={excluirDocumento}
                      hidden={{ id: d.id }}
                      title={`Excluir “${d.filename}”?`}
                      consequence="O arquivo sai do depósito. Não dá para desfazer."
                      confirmLabel="Excluir o documento"
                      triggerLabel={`Excluir ${d.filename}`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
