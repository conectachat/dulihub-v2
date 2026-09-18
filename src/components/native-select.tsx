import { cn } from "@/lib/utils";

/**
 * `<select>` nativo com a aparência dos campos da casa.
 *
 * Nativo de propósito: no celular abre o seletor do sistema, que é maior,
 * acessível e rola sozinho — o `Select` do shadcn não faz isso. A classe
 * estava copiada em quatro lugares; trocar o raio de canto num deles e
 * esquecer os outros é como uma tela começa a parecer de outro app.
 */
export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-xl border bg-transparent px-3 text-sm",
        className,
      )}
      {...props}
    />
  );
}
