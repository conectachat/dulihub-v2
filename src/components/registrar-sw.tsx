"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Registra o service worker e avisa quando há versão nova.
 *
 * Três decisões que vêm da cicatriz do app antigo, cujo service worker
 * prendeu arquivos velhos e virou um "desligador":
 *
 * 1. **A versão vai na URL** (`/sw.js?v=<commit>`): URL diferente é worker
 *    diferente, e é isso que faz o deploy novo substituir o antigo.
 * 2. **Nunca recarrega sozinho.** Aparece um aviso, e a troca só acontece no
 *    clique — recarregar no meio de uma edição das Observações descartaria
 *    texto.
 * 3. **Interruptor de emergência**: `/api/versao` pode responder
 *    `desligar: true` (variável de ambiente na Vercel), e então o worker é
 *    desregistrado e os caches apagados, sem publicar código.
 */
export function RegistrarSW({ versao }: { versao: string }) {
  const [emEspera, setEmEspera] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registro: ServiceWorkerRegistration | null = null;
    let cancelado = false;

    async function ligar() {
      const desligar = await fetch("/api/versao", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: { desligar?: boolean } | null) => r?.desligar === true)
        .catch(() => false);

      if (desligar) {
        await desligarTudo();
        return;
      }
      if (cancelado) return;

      registro = await navigator.serviceWorker.register(`/sw.js?v=${versao}`, {
        scope: "/",
      });

      const avisar = () => {
        if (registro?.waiting && navigator.serviceWorker.controller) {
          setEmEspera(registro.waiting);
        }
      };
      avisar();
      registro.addEventListener("updatefound", () => {
        registro?.installing?.addEventListener("statechange", avisar);
      });
    }

    void ligar();

    // Procura versão nova quando a janela volta ao foco — sem intervalo, que
    // gastaria bateria para nada.
    const aoFocar = () => void registro?.update();
    window.addEventListener("focus", aoFocar);

    return () => {
      cancelado = true;
      window.removeEventListener("focus", aoFocar);
    };
  }, [versao]);

  if (!emEspera) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg sm:left-3 sm:right-auto"
    >
      <p className="flex-1 text-sm">Nova versão do Duli Hub disponível.</p>
      <Button
        size="sm"
        onClick={() => {
          // Quando o worker novo assume, a página recarrega uma vez só.
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => window.location.reload(),
            { once: true },
          );
          emEspera.postMessage({ tipo: "trocar-agora" });
        }}
      >
        <RefreshCw className="mr-1 h-4 w-4" />
        Atualizar
      </Button>
    </div>
  );
}

/** Desliga o service worker e apaga o que ele guardou. */
export async function desligarTudo() {
  const registros = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(registros.map((r) => r.unregister()));
  const nomes = await caches.keys();
  await Promise.allSettled(
    nomes.filter((n) => n.startsWith("dulihub-")).map((n) => caches.delete(n)),
  );
}
