"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

/**
 * Avisos flutuantes.
 *
 * Duas correções sobre o arquivo gerado pelo shadcn, feitas antes de montá-lo
 * pela primeira vez:
 *
 * **Tema fixo em claro.** Vinha `theme="system"`, lido do `next-themes` — que
 * nunca teve provedor montado, então o hook devolvia o padrão. O sonner então
 * decidia claro no servidor e consultava `prefers-color-scheme` no navegador:
 * divergência de hidratação para quem usa o sistema em modo escuro, e aviso
 * escuro sobre um app que é só claro. O app não tem modo escuro; o aviso
 * também não.
 *
 * **Cor de erro.** Só `--normal-*` estava definido, e sem `richColors` o aviso
 * de erro ficava visualmente idêntico ao de sucesso — mesmo fundo, mesma borda,
 * diferindo apenas pelo ícone. Para quem olha de canto de olho, isso é quase
 * nenhum sinal. Agora erro puxa os tokens de `destructive` e sucesso os de
 * `success`, que são os da marca.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",

          "--error-bg": "var(--destructive)",
          "--error-text": "var(--primary-foreground)",
          "--error-border": "var(--destructive)",

          "--success-bg": "var(--success)",
          "--success-text": "var(--primary-foreground)",
          "--success-border": "var(--success)",

          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
