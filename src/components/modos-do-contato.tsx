"use client";

import { useId } from "react";

import { useDispensarAviso } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";

export type ModoDoContato = "existente" | "novo";

/**
 * Botão que muda o contato que vai ser enviado sem ser campo de formulário
 * (o modo, o "Trocar"): tira o aviso da tela como uma edição faria — senão
 * ele ofereceria "Criar mesmo assim" para um contato que já não está na tela.
 * Só funciona dentro de um `FormDialog`.
 */
export function BotaoQueDispensa({
  dispensa = true,
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & {
  /** Falso quando o clique não muda nada (o modo que já está ativo). */
  dispensa?: boolean;
}) {
  const dispensar = useDispensarAviso();
  return (
    <Button
      {...props}
      onClick={(evento) => {
        if (dispensa) dispensar();
        onClick?.(evento);
      }}
    />
  );
}

/**
 * O contato já escolhido (Nova oportunidade, Novo cliente): o nome, o
 * "Trocar" e o `person_id` oculto que a ação do servidor lê. Enquanto ele
 * está na tela, o seletor sai do formulário — senão haveria dois `person_id`.
 */
export function ContatoEscolhido({
  id,
  nome,
  aoTrocar,
}: {
  id: string;
  nome: string;
  aoTrocar: () => void;
}) {
  const rotulo = useId();
  return (
    <div className="space-y-2" role="group" aria-labelledby={rotulo}>
      <p id={rotulo} className="text-sm leading-none font-medium">
        Contato *
      </p>
      <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-sm">
        <span className="font-medium">{nome}</span>
        <BotaoQueDispensa type="button" variant="ghost" size="sm" className="text-primary" onClick={aoTrocar}>
          Trocar
        </BotaoQueDispensa>
      </div>
      <input type="hidden" name="person_id" value={id} />
    </div>
  );
}

/**
 * "Contato existente" ou "Novo contato" (Nova oportunidade, Novo cliente), com
 * o campo oculto `modo_contato` que a ação do servidor lê.
 */
export function ModosDoContato({
  modo,
  aoTrocar,
  rotulo,
}: {
  modo: ModoDoContato;
  aoTrocar: (modo: ModoDoContato) => void;
  /** O nome do grupo para o leitor de tela ("Contato da oportunidade"). */
  rotulo: string;
}) {
  return (
    <>
      <input type="hidden" name="modo_contato" value={modo} />
      <div className="flex gap-2" role="group" aria-label={rotulo}>
        {(
          [
            ["existente", "Contato existente"],
            ["novo", "Novo contato"],
          ] as const
        ).map(([valor, nome]) => (
          <BotaoQueDispensa
            key={valor}
            type="button"
            size="sm"
            variant={modo === valor ? "default" : "outline"}
            className="rounded-xl"
            aria-pressed={modo === valor}
            dispensa={modo !== valor}
            onClick={() => aoTrocar(valor)}
          >
            {nome}
          </BotaoQueDispensa>
        ))}
      </div>
    </>
  );
}
