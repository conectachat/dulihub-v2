"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";

import { useSincronia } from "@/lib/local/estado";
import { ligarSincronia } from "@/lib/local/sincronizador";
import { useUsuarioLocal } from "@/lib/local/usuario";
import { formatarDataHora } from "@/lib/formatar";
import { cn } from "@/lib/utils";

/**
 * "Sincronizado às 14:32" — e a verdade quando não está.
 *
 * O carimbo é o da **última resposta do servidor**, não o da última
 * tentativa: um "Sincronizado" depois de uma falha seria a tela mentindo, que
 * é justamente o risco desta arquitetura. Por isso ele envelhece à vista, e
 * distingue **sem internet** (espera) de **sessão expirada** (entre de novo)
 * — as ações são diferentes.
 */
export function EstadoDaSincronia() {
  const { em, sincronizando, error, online } = useSincronia();
  const { userId } = useUsuarioLocal();
  const [agora, setAgora] = useState(() => Date.now());

  // De quem é o aparelho vem da sessão guardada aqui, não do HTML: offline a
  // casca pode ser a que ficou em cache de outra pessoa.
  useEffect(() => {
    if (!userId) return;
    return ligarSincronia(userId);
  }, [userId]);

  // Relógio próprio: sem ele o carimbo envelhece só quando algo mais
  // redesenha a tela, e "há 2 minutos" fica parado por meia hora.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const idadeMin = em ? (agora - new Date(em).getTime()) / 60_000 : null;
  const sessaoExpirada = Boolean(error && /JWT|session|sess|401/i.test(error));

  const { Icone, texto, classe } = !online
    ? { Icone: CloudOff, texto: "Sem internet", classe: "text-destructive" }
    : sessaoExpirada
      ? { Icone: TriangleAlert, texto: "Sessão expirada — entre de novo", classe: "text-destructive" }
      : sincronizando && !em
        ? { Icone: RefreshCw, texto: "Sincronizando...", classe: "text-muted-foreground" }
        : em === null
          ? { Icone: CloudOff, texto: "Ainda não sincronizou", classe: "text-muted-foreground" }
          : {
              Icone: RefreshCw,
              texto: `Sincronizado ${formatarDataHora(em)}`,
              classe:
                idadeMin! < 5
                  ? "text-success"
                  : idadeMin! < 60
                    ? "text-foreground"
                    : "text-destructive",
            };

  return (
    <p
      className={cn("flex items-center gap-1.5 px-2 text-xs", classe)}
      title={error ?? undefined}
      role="status"
    >
      <Icone className={cn("h-3 w-3 shrink-0", sincronizando && "animate-spin")} />
      <span className="truncate">{texto}</span>
    </p>
  );
}
