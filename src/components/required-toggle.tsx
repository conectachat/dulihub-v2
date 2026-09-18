"use client";

import { Button } from "@/components/ui/button";
import type { AcaoDeFormulario } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";
import { cn } from "@/lib/utils";

/**
 * Alterna entre obrigatório e opcional, num clique.
 *
 * O estado atual é o próprio rótulo — o botão diz o que a coisa **é**, não o
 * que o clique fará. Caixa de marcar seria mais óbvia para o clique e menos
 * para a leitura, e esta lista é lida muito mais do que editada.
 *
 * `genero` existe porque etapa e pasta não concordam em português:
 * "Obrigatória" e "Obrigatório". Era a única diferença entre as duas cópias.
 */
export function RequiredToggle({
  action,
  hidden,
  obrigatorio,
  genero,
  titulo,
}: {
  action: AcaoDeFormulario;
  hidden: Record<string, string>;
  obrigatorio: boolean;
  genero: "feminino" | "masculino";
  /** Explica o que o clique faz, ao passar o mouse. */
  titulo: string;
}) {
  const rotulo = obrigatorio
    ? genero === "feminino"
      ? "Obrigatória"
      : "Obrigatório"
    : "Opcional";

  return (
    <form action={comAviso(action)}>
      {Object.entries(hidden).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <input type="hidden" name="is_required" value={String(!obrigatorio)} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 shrink-0 rounded-xl text-xs",
          obrigatorio ? "text-primary" : "text-muted-foreground",
        )}
        title={titulo}
      >
        {rotulo}
      </Button>
    </form>
  );
}
