"use client";

import { useRef } from "react";

import { Input } from "@/components/ui/input";
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
  action: (formData: FormData) => void | Promise<void>;
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
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className={cn("min-w-0", className)}>
      {Object.entries(hidden).map(([key, val]) => (
        <input key={key} type="hidden" name={key} value={val} />
      ))}

      <Input
        name={name}
        defaultValue={value}
        aria-label={label}
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
          formRef.current?.requestSubmit();
        }}
        className="h-8 rounded-xl border-0 bg-transparent px-2 hover:bg-muted focus-visible:bg-background"
      />
    </form>
  );
}
