"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { desligarTudo } from "@/components/registrar-sw";
import { Button } from "@/components/ui/button";

/**
 * Versão publicada e a saída de emergência.
 *
 * O app antigo precisou de um deploy para se livrar de um service worker que
 * prendia arquivos velhos. Este botão faz o mesmo em um clique, no aparelho
 * de quem estiver com problema: desregistra o worker, apaga o que ele
 * guardou e recarrega.
 */
export function VersaoDoApp({ versao }: { versao: string }) {
  const [limpando, setLimpando] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Versão instalada</p>
        <p className="font-mono text-xs text-muted-foreground">{versao}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={limpando}
        onClick={async () => {
          setLimpando(true);
          await desligarTudo();
          window.location.reload();
        }}
      >
        <RefreshCw className="mr-1 h-4 w-4" />
        {limpando ? "Atualizando..." : "Forçar atualização"}
      </Button>
    </div>
  );
}
