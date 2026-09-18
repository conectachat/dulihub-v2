'use client';

/**
 * Upload de imagem e arquivo colados nas Observações.
 *
 * Veio do registro do Plate usando UploadThing (serviço externo, conta à
 * parte). Trocado pelo bucket `observacoes` do Supabase (0024): o arquivo do
 * cliente não sai da casa, e a policy da primeira pasta — a organização —
 * decide quem vê.
 *
 * O nó guarda o endereço da rota `/api/observacoes/arquivo`, não uma URL
 * assinada: URL assinada expira, e a imagem sumiria da página semanas depois.
 * A rota confere a sessão e gera uma assinatura nova a cada abertura.
 *
 * Mantém a forma do hook original (`uploadFile`, `progress`, `uploadedFile`…)
 * porque os componentes de mídia do Plate o usam assim.
 */

import * as React from 'react';

import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';

export type UploadedFile = {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

/** Onde os arquivos desta página vão morar. Dado por quem monta o editor. */
export const DestinoDoUpload = React.createContext<{
  organizationId: string;
  projectId: string;
} | null>(null);

/** Mesmas regras de nome de `caminhoDoArquivo`: sem acento, espaço ou barra. */
function nomeSeguro(nome: string) {
  const ponto = nome.lastIndexOf('.');
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const ext = ponto > 0 ? nome.slice(ponto + 1) : '';
  const limpo = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const b = limpo(base) || 'arquivo';
  return ext ? `${b}.${limpo(ext)}` : b;
}

/** Endereço estável do arquivo, servido pela rota que assina na hora. */
export function enderecoDoArquivo(caminho: string) {
  return `/api/observacoes/arquivo?c=${encodeURIComponent(caminho)}`;
}

export function useUploadFile({
  onUploadComplete,
  onUploadError,
}: {
  onUploadComplete?: (file: UploadedFile) => void;
  onUploadError?: (error: unknown) => void;
} = {}) {
  const destino = React.useContext(DestinoDoUpload);
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
  const [uploadingFile, setUploadingFile] = React.useState<File>();
  const [progress, setProgress] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);

  async function uploadFile(file: File) {
    if (!destino) {
      toast.error('Não foi possível enviar: página sem processo.');
      return;
    }

    setIsUploading(true);
    setUploadingFile(file);
    // O Supabase não informa progresso do envio: a barra mostra que começou
    // e completa quando o banco confirma.
    setProgress(10);

    const caminho = `${destino.organizationId}/${destino.projectId}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;

    try {
      const { error } = await createClient()
        .storage.from('observacoes')
        .upload(caminho, file, { contentType: file.type || undefined });
      if (error) throw error;

      const enviado: UploadedFile = {
        key: caminho,
        name: file.name,
        size: file.size,
        type: file.type,
        url: enderecoDoArquivo(caminho),
      };
      setProgress(100);
      setUploadedFile(enviado);
      onUploadComplete?.(enviado);
      return enviado;
    } catch (error) {
      const mensagem =
        error instanceof Error && /size|exceeded|too large/i.test(error.message)
          ? 'Arquivo acima de 20 MB.'
          : error instanceof Error && /mime|type/i.test(error.message)
            ? 'Tipo de arquivo não aceito. Use PDF, imagem, Word ou Excel.'
            : 'Não foi possível enviar o arquivo. Tente de novo.';
      toast.error(mensagem);
      onUploadError?.(error);
    } finally {
      setProgress(0);
      setIsUploading(false);
      setUploadingFile(undefined);
    }
  }

  return { isUploading, progress, uploadedFile, uploadFile, uploadingFile };
}
