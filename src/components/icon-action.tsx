"use client";

import { Button } from "@/components/ui/button";
import type { AcaoDeFormulario } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";
import { cn } from "@/lib/utils";

/**
 * Botão de ícone que dispara uma Server Action e avisa quando ela recusa.
 *
 * Existe para os formulários que viviam soltos em componente **servidor**, onde
 * não há como ler o retorno da ação — o resultado era descartado por
 * construção. Este é o menor invólucro cliente que resolve isso.
 *
 * O custo é funcionar sem JavaScript, que o formulário cru tinha. Fica pago
 * conscientemente: quase toda a interface desta base já depende de JS —
 * salvar ao sair do campo, diálogo, seletor que envia ao mudar — e um botão
 * que apaga sem dizer se apagou é pior que um botão que exige JS.
 *
 * Para ação destrutiva com consequência a contar, use `ConfirmAction`.
 */
export function IconAction({
  action,
  hidden,
  label,
  icon,
  tone = "primary",
  disabled,
  disabledReason,
}: {
  action: AcaoDeFormulario;
  hidden: Record<string, string>;
  /** Rótulo para leitor de tela. */
  label: string;
  /**
   * Elemento, não componente: `icon={<Trash2 className="h-4 w-4" />}`.
   *
   * Este componente é de cliente, e é usado por páginas de servidor. Componente
   * é função, e função não atravessa do servidor para o navegador — foi o que
   * derrubou `/contatos` em produção. Tipado como `ReactNode`, passar
   * `Trash2` sem os sinais de menor e maior vira erro de compilação.
   */
  icon: React.ReactNode;
  /** `destructive` só muda a cor ao passar o mouse — o vermelho fixo convida ao clique acidental. */
  tone?: "primary" | "destructive";
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <form action={comAviso(action)}>
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className={cn(
          "h-9 w-9",
          tone === "destructive"
            ? "text-primary/60 hover:text-destructive"
            : "text-primary",
        )}
        aria-label={label}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        {icon}
      </Button>
    </form>
  );
}
