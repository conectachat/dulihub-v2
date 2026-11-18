"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";

import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import type { ContatoParecido } from "@/lib/parecidos";

/**
 * "Já existe um contato com esse e-mail ou telefone" (CON-4).
 *
 * Mostra o que bateu e com quem — com o link do contato, para conferir antes
 * de responder — e pergunta "É a mesma pessoa?":
 *
 * - **Sim**: usa o existente (no criar) ou abre o existente sem gravar a
 *   edição. Ao criar, se ele está na lixeira, o botão é **Restaurar**, que
 *   restaura e então usa — e, enquanto restaura, nenhum outro botão grava.
 *   Na edição não há Restaurar: deixaria dois contatos ativos.
 * - **Não**: pergunta de novo, "Criar outro contato com essas informações?"
 *   (ou "Salvar mesmo assim"), porque duplicar contato é o erro que se quer
 *   evitar; só o segundo clique grava.
 */

const ESTAGIO: Record<ContatoParecido["estagio"], string> = {
  contact: "contato",
  opportunity: "oportunidade",
  client: "cliente",
};

function oQueBateu(p: ContatoParecido): string {
  if (p.bateEmail && p.bateTelefone) return "E-mail e telefone já cadastrados em";
  return p.bateTelefone ? "Telefone já cadastrado em" : "E-mail já cadastrado em";
}

export function AvisoDeDuplicado({
  parecidos,
  modo,
  aoUsarExistente,
  aoRestaurar,
  aoGravarMesmoAssim,
  enviando = false,
}: {
  parecidos: ContatoParecido[];
  modo: "criar" | "editar";
  /** "Sim, é a mesma pessoa". */
  aoUsarExistente: (id: string) => void;
  /**
   * Só ao criar, para quem está na lixeira. Na edição não se passa: restaurar
   * o outro deixaria dois contatos ativos para a mesma pessoa — "Sim" só abre
   * o existente (spec §6.1).
   */
  aoRestaurar?: (id: string) => Promise<ActionState>;
  /** "Não" → "Criar/Salvar mesmo assim". */
  aoGravarMesmoAssim: () => void;
  /** Um envio em curso: os botões que gravam ficam desabilitados. */
  enviando?: boolean;
}) {
  const [outraPessoa, setOutraPessoa] = useState(false);
  const [restaurando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function restaurar(id: string) {
    if (!aoRestaurar) return;
    setErro(null);
    iniciar(async () => {
      const resposta = await aoRestaurar(id);
      if (resposta.error) setErro(resposta.error);
      else aoUsarExistente(id);
    });
  }

  return (
    <div role="alert" className="space-y-3 rounded-2xl border bg-warning/15 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="h-4 w-4 shrink-0 text-brand" />
        É a mesma pessoa?
      </p>

      <ul className="space-y-2">
        {parecidos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {oQueBateu(p)}{" "}
              <a
                href={`/contatos/${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-4"
              >
                {p.nome}
              </a>{" "}
              ({ESTAGIO[p.estagio]}){p.naLixeira ? " · na lixeira" : ""}
            </span>
            {outraPessoa ? null : p.naLixeira && aoRestaurar ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={restaurando || enviando}
                onClick={() => restaurar(p.id)}
              >
                {restaurando ? "Restaurando..." : "Restaurar"}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={restaurando || enviando}
                onClick={() => aoUsarExistente(p.id)}
              >
                Sim, é a mesma pessoa
              </Button>
            )}
          </li>
        ))}
      </ul>

      <FieldError mensagem={erro} pequeno />

      {outraPessoa ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto">
            {modo === "criar"
              ? "Criar outro contato com essas informações?"
              : "Salvar mesmo assim com essas informações?"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-xl"
            onClick={() => setOutraPessoa(false)}
          >
            Voltar
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            disabled={restaurando || enviando}
            onClick={aoGravarMesmoAssim}
          >
            {modo === "criar" ? "Criar mesmo assim" : "Salvar mesmo assim"}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-xl"
            disabled={restaurando}
            onClick={() => setOutraPessoa(true)}
          >
            Não, é outra pessoa
          </Button>
        </div>
      )}
    </div>
  );
}
