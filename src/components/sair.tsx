"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { signOut } from "@/features/auth/actions";
import { armazemDaFila } from "@/lib/local/banco-da-fila";
import { apagarDadosDoUsuario } from "@/lib/local/limpeza";
import { filaDoUsuario } from "@/lib/local/sincronizador";
import { useUsuarioLocal } from "@/lib/local/usuario";
import { cn } from "@/lib/utils";

/**
 * Sair — segurando quando há gravação que ainda não subiu.
 *
 * Sair apaga o que este aparelho guarda. Com a fila cheia, isso é perder
 * trabalho que a pessoa fez e que ninguém mais tem: o servidor não recebeu.
 * Escolha do Renato em 21/set — **avisar e segurar**, com a saída ainda
 * possível, mas dita por extenso.
 *
 * Sem nada pendente, é o botão de antes: um clique e pronto.
 *
 * Sair **apaga mesmo**: o espelho e a fila deste usuário saem do aparelho
 * antes de a sessão acabar. `signOut` é Server Action e redireciona, então
 * nada de navegador roda depois dela — a limpeza tem de vir antes.
 */
export function Sair({ collapsed }: { collapsed: boolean }) {
  const { userId } = useUsuarioLocal();
  const [avisando, setAvisando] = useState(false);

  async function sairEApagar() {
    if (userId) await apagarDadosDoUsuario(userId);
    await signOut();
  }

  const pendentes = useLiveQuery(
    async () =>
      userId ? (await armazemDaFila(filaDoUsuario(userId)).listar()).length : 0,
    [userId],
    0,
  );

  const classe = cn("rounded-2xl", collapsed ? "mx-auto" : "w-full");
  const rotulo = collapsed ? "⏻" : "Sair";

  if (!pendentes) {
    return (
      <form action={sairEApagar}>
        <Button type="submit" variant="ghost" size={collapsed ? "icon" : "sm"} className={classe}>
          {rotulo}
        </Button>
      </form>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        className={classe}
        onClick={() => setAvisando(true)}
      >
        {rotulo}
      </Button>

      <Dialog open={avisando} onOpenChange={setAvisando}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {pendentes === 1
                ? "1 alteração ainda não subiu"
                : `${pendentes} alterações ainda não subiram`}
            </DialogTitle>
            <DialogDescription>
              O servidor não recebeu o que você gravou aqui. Conecte-se à
              internet e espere o carimbo de sincronização atualizar. Sair agora
              apaga estas alterações deste aparelho, e não dá para recuperar.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setAvisando(false)}
            >
              Continuar conectado
            </Button>
            <form action={sairEApagar}>
              <Button type="submit" variant="destructive" className="rounded-xl">
                Sair e perder as alterações
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
