"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { armazemDaFila } from "@/lib/local/banco-da-fila";
import type { ItemDaFila } from "@/lib/local/fila";
import { filaDoUsuario, sincronizarAgora } from "@/lib/local/sincronizador";
import { useUsuarioLocal } from "@/lib/local/usuario";
import { formatarDataHora } from "@/lib/formatar";

/**
 * O que este aparelho gravou e o servidor ainda não tem.
 *
 * É a outra metade de "guardar e perguntar", a escolha do Renato em 21/set:
 * recusa não desfaz nada sozinha, e por isso precisa existir um lugar onde
 * decidir. Sem esta tela, um item recusado ficaria para sempre segurando
 * quem depende dele, sem ninguém saber por quê.
 *
 * **Descartar é a única forma de o trabalho da pessoa sumir da tela**, e é
 * explícita. Como o pendente nunca entrou no espelho, descartar é só tirar o
 * item da fila: a linha volta sozinha ao que o servidor diz.
 */

function Linha({ item, userId }: { item: ItemDaFila; userId: string }) {
  const emConflito = item.estado === "conflito";
  const fila = armazemDaFila(filaDoUsuario(userId));

  async function tentarDeNovo() {
    await fila.gravar({ ...item, estado: "pendente", motivo: null });
    void sincronizarAgora(userId);
  }

  async function descartar() {
    await fila.apagar(item.id);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
      {emConflito ? (
        <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <CloudOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.rotulo}</p>
        <p className="text-xs text-muted-foreground">
          {formatarDataHora(item.criada_em)}
          {emConflito && item.motivo ? (
            <>
              {" · "}
              <span className="text-destructive">{item.motivo}</span>
            </>
          ) : null}
        </p>
      </div>

      {emConflito ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={tentarDeNovo}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Tentar de novo
          </Button>

          <ConfirmAction
            action={descartar}
            hidden={{}}
            title={`Descartar “${item.rotulo}”?`}
            consequence="Esta alteração nunca chegou ao servidor. Descartar é perdê-la: a tela volta ao que está no servidor, e não dá para desfazer."
            confirmLabel="Descartar a alteração"
            triggerLabel="Descartar"
          />
        </>
      ) : null}
    </li>
  );
}

export function Bandeja({ userId }: { userId?: string }) {
  const { userId: doAparelho } = useUsuarioLocal();
  const dono = userId ?? doAparelho;

  const itens = useLiveQuery(
    () => (dono ? armazemDaFila(filaDoUsuario(dono)).listar() : Promise.resolve([])),
    [dono],
  );

  if (!dono || !itens) return null;

  if (itens.length === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-success" />
        Tudo salvo no servidor. Nada esperando neste aparelho.
      </p>
    );
  }

  const conflitos = itens.filter((i) => i.estado === "conflito");
  const esperando = itens.filter((i) => i.estado === "pendente");

  return (
    <div className="space-y-6">
      {conflitos.length > 0 ? (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-destructive">
              O servidor não aceitou
            </h3>
            <p className="text-xs text-muted-foreground">
              Continuam aqui até você decidir. Nada foi desfeito sozinho.
            </p>
          </div>
          <ul className="space-y-2">
            {conflitos.map((item) => (
              <Linha key={item.id} item={item} userId={dono} />
            ))}
          </ul>
        </section>
      ) : null}

      {esperando.length > 0 ? (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Esperando conexão</h3>
            <p className="text-xs text-muted-foreground">
              Sobem sozinhas assim que houver internet, na ordem em que você fez.
            </p>
          </div>
          <ul className="space-y-2">
            {esperando.map((item) => (
              <Linha key={item.id} item={item} userId={dono} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
