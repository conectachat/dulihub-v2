import Link from "next/link";

import type { SituacaoDaFicha } from "@/features/cadastro/regras";
import { cn } from "@/lib/utils";

/**
 * O atalho do cartão para a ficha de cadastro do contato.
 *
 * Um link, e não um botão que gera: o link gerado precisa ser copiado ou
 * mandado pelo WhatsApp, e isso mora na ficha do contato. Aqui o cartão diz
 * em que pé a ficha está e leva até lá.
 */
const TEXTO: Record<SituacaoDaFicha, string> = {
  "sem-link": "Enviar ficha de cadastro →",
  aguardando: "Ficha enviada · aguardando o cliente",
  expirada: "Link da ficha expirou · gerar outro",
  recebida: "Ficha recebida · conferir →",
  conferida: "Ficha conferida",
};

export function AtalhoDaFicha({
  personId,
  situacao,
}: {
  personId: string;
  situacao: SituacaoDaFicha;
}) {
  return (
    <Link
      href={`/contatos/${personId}#dados-cadastrais`}
      className={cn(
        "block text-xs hover:underline",
        // Só o que pede ação se destaca: ficha que chegou, ou link que morreu.
        situacao === "recebida" && "font-medium text-primary",
        situacao === "expirada" && "text-destructive",
        situacao === "sem-link" && "text-primary",
        (situacao === "aguardando" || situacao === "conferida") && "text-muted-foreground",
      )}
    >
      {TEXTO[situacao]}
    </Link>
  );
}
