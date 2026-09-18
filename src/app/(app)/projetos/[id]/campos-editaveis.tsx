"use client";

import { useRef, useState } from "react";

import { FieldError } from "@/components/field-error";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { atualizarProcesso, mudarStatusDaEtapa } from "@/features/projects/actions";
import { STATUS_DO_PROCESSO } from "@/features/projects/schema";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

/**
 * Campos da tela do processo que salvam sozinhos.
 *
 * Mesma regra do `InlineText`: recusa devolve o campo ao valor gravado e diz
 * por quê, embaixo do campo. Aviso flutuante some; o valor errado ficaria.
 */

function useEnvio(acao: (fd: FormData) => Promise<ActionState>, voltar: () => void) {
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(formData: FormData) {
    setErro(null);
    const r = await acao(formData);
    if (r.error) {
      setErro(r.error);
      voltar();
    }
  }
  return { erro, enviar };
}

/** Recibo do USCIS e datas. Salva ao sair do campo, se mudou. */
export function CampoDoProcesso({
  processoId,
  campo,
  valor,
  tipo,
  rotulo,
  placeholder,
}: {
  processoId: string;
  campo: string;
  valor: string | null;
  tipo: "texto" | "data";
  rotulo: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const atual = valor ?? "";
  const { erro, enviar } = useEnvio(atualizarProcesso, () => {
    if (ref.current) ref.current.value = atual;
  });

  return (
    <form action={enviar} className="space-y-1">
      <input type="hidden" name="id" value={processoId} />
      <input type="hidden" name="campo" value={campo} />
      <label className="block text-xs text-muted-foreground" htmlFor={`campo-${campo}`}>
        {rotulo}
      </label>
      <Input
        // Remonta quando o servidor devolve outro valor — o recibo volta
        // normalizado (sem espaço, maiúsculo), e é esse que fica na tela.
        key={atual}
        ref={ref}
        id={`campo-${campo}`}
        name="valor"
        type={tipo === "data" ? "date" : "text"}
        defaultValue={atual}
        placeholder={placeholder}
        aria-invalid={erro ? true : undefined}
        onBlur={(e) => {
          if (e.target.value !== atual) e.target.form?.requestSubmit();
        }}
        className={cn(
          "h-9 rounded-xl",
          tipo === "texto" && "font-mono uppercase tracking-wide",
        )}
      />
      <FieldError mensagem={erro} pequeno />
    </form>
  );
}

/** Status do processo, no cabeçalho. Salva ao escolher. */
export function StatusDoProcesso({
  processoId,
  status,
}: {
  processoId: string;
  status: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const { erro, enviar } = useEnvio(atualizarProcesso, () => {
    if (ref.current) ref.current.value = status;
  });

  return (
    <form action={enviar}>
      <input type="hidden" name="id" value={processoId} />
      <input type="hidden" name="campo" value="status" />
      <NativeSelect
        ref={ref}
        name="valor"
        defaultValue={status}
        aria-label="Status do processo"
        onChange={(e) => e.target.form?.requestSubmit()}
        className="h-8 w-auto rounded-full text-sm"
      >
        {Object.entries(STATUS_DO_PROCESSO).map(([codigo, nome]) => (
          <option key={codigo} value={codigo}>
            {nome}
          </option>
        ))}
      </NativeSelect>
      <FieldError mensagem={erro} pequeno />
    </form>
  );
}

/** Status de uma etapa. As datas de início e conclusão acompanham no servidor. */
export function StatusDaEtapa({
  etapaId,
  statusId,
  opcoes,
  nomeDaEtapa,
}: {
  etapaId: string;
  statusId: string;
  opcoes: { id: string; label: string; color: string | null }[];
  nomeDaEtapa: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const { erro, enviar } = useEnvio(mudarStatusDaEtapa, () => {
    if (ref.current) ref.current.value = statusId;
  });
  const cor = opcoes.find((o) => o.id === statusId)?.color;

  return (
    <form action={enviar} className="flex items-center gap-2">
      <input type="hidden" name="id" value={etapaId} />
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40"
        style={cor ? { backgroundColor: cor } : undefined}
        aria-hidden
      />
      <NativeSelect
        ref={ref}
        name="status_id"
        defaultValue={statusId}
        aria-label={`Status de ${nomeDaEtapa}`}
        onChange={(e) => e.target.form?.requestSubmit()}
        className="h-8 w-40 rounded-xl text-sm"
      >
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      <FieldError mensagem={erro} pequeno />
    </form>
  );
}
