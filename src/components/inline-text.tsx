"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { AcaoDeFormulario } from "@/lib/action-state";
import { cn } from "@/lib/utils";

/**
 * Campo que salva sozinho ao sair do foco, quando o valor mudou.
 *
 * Substitui sete cópias do mesmo bloco espalhadas pelas telas de configuração.
 * Sem botão de confirmar de propósito: em tela de ajuste rápido — renomear
 * etapa, mudar prazo — o botão só soma um clique a cada edição.
 *
 * `hidden` carrega os campos que a Server Action precisa além do valor: o id
 * do registro e, quando houver, os que precisam viajar junto para não serem
 * apagados por uma atualização parcial.
 *
 * **Recusa devolve o campo ao valor antigo, e diz por quê.** Sem isso havia um
 * defeito difícil de enxergar: o campo usa `defaultValue`, e React não
 * sobrescreve o DOM de um campo que a pessoa mexeu. Depois de um rename
 * recusado, a tela recarregava com o nome antigo vindo do servidor e **o campo
 * continuava exibindo o texto recusado** — um valor que não existe no banco,
 * parado ali até alguém recarregar a página. Aviso flutuante não resolveria:
 * ele some, o valor errado fica.
 */
export function InlineText({
  action,
  name,
  value,
  hidden,
  label,
  placeholder,
  inputMode,
  className,
  required = true,
}: {
  action: AcaoDeFormulario;
  name: string;
  value: string;
  hidden: Record<string, string>;
  /** Rótulo para leitor de tela; o campo não tem rótulo visível. */
  label: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal";
  className?: string;
  /** Campo obrigatório não envia valor vazio — evita apagar um nome sem querer. */
  required?: boolean;
}) {
  const campoRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(formData: FormData) {
    setErro(null);
    const resultado = await action(formData);

    // Ação ainda não convertida devolve `undefined`.
    if (resultado && resultado.error) {
      setErro(resultado.error);
      // O servidor não aceitou: o campo volta a mostrar o que está gravado.
      if (campoRef.current) campoRef.current.value = value;
    }
  }

  return (
    <form action={enviar} className={cn("min-w-0", className)}>
      {Object.entries(hidden).map(([key, val]) => (
        <input key={key} type="hidden" name={key} value={val} />
      ))}

      <Input
        ref={campoRef}
        name={name}
        defaultValue={value}
        aria-label={label}
        aria-invalid={erro ? true : undefined}
        placeholder={placeholder}
        inputMode={inputMode}
        onBlur={(event) => {
          const next = event.target.value;
          if (next === value) return;
          if (required && !next.trim()) {
            // Volta ao valor anterior: campo obrigatório vazio quase sempre é
            // apagão acidental, não intenção.
            event.target.value = value;
            return;
          }
          event.target.form?.requestSubmit();
        }}
        className="h-8 rounded-xl border-0 bg-transparent px-2 hover:bg-muted focus-visible:bg-background aria-invalid:bg-destructive/5"
      />

      {erro ? (
        <p role="alert" className="px-2 pt-0.5 text-xs text-destructive">
          {erro}
        </p>
      ) : null}
    </form>
  );
}
