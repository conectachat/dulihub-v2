"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import { ESTADO_INICIAL, type ActionState } from "./action-state";

/**
 * Formulário ligado a uma ação que **não perde o que foi digitado na recusa**
 * (G4 da revisão de novembro).
 *
 * Dois defeitos juntos faziam a recusa apagar tudo:
 *
 * 1. `<form action={...}>` — o React limpa o formulário sozinho depois que a
 *    ação termina, **com ou sem erro**. Aqui o envio é por `onSubmit`, que
 *    chama a ação dentro de uma transição: o React não limpa nada.
 * 2. `key={state.token}` — a recusa também carrega marca nova (para dois erros
 *    iguais seguidos serem percebidos), então o formulário era remontado na
 *    recusa como no sucesso. Aqui `chave` muda **só no sucesso**.
 *
 * Uso: `<form key={chave} onSubmit={enviar}>`, e o botão recebe `enviando`
 * (o `useFormStatus` não enxerga envio por `onSubmit`).
 *
 * `reenviarCom` manda o mesmo formulário de novo com campos a mais — é a
 * confirmação de um aviso ("é outra pessoa, grave mesmo assim", CON-4). O
 * campo extra só existe nesse envio: nunca fica no formulário, então trocar
 * o e-mail e salvar de novo pergunta outra vez.
 */
export function useFormulario<E extends ActionState = ActionState>(
  acao: (anterior: E, dados: FormData) => Promise<E>,
) {
  // O React tipa o estado como `Awaited<E>`, que o TypeScript não reduz a `E`
  // enquanto `E` é genérico; para um objeto, os dois são o mesmo tipo. O
  // estado inicial é o da casa: os campos a mais de `E` são todos opcionais.
  const [estado, despachar, enviando] = useActionState<E, FormData>(
    acao as (anterior: Awaited<E>, dados: FormData) => Promise<E>,
    ESTADO_INICIAL as Awaited<E>,
  );
  const chave = useChaveDoSucesso(estado);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  }

  function reenviarCom(formulario: HTMLFormElement, extra: Record<string, string>) {
    const dados = new FormData(formulario);
    for (const [campo, valor] of Object.entries(extra)) dados.set(campo, valor);
    startTransition(() => despachar(dados));
  }

  return { estado, enviar, reenviarCom, enviando, chave };
}

/**
 * A marca do último **sucesso** — para `key` de formulário que deve voltar
 * limpo depois de gravar, e só então.
 *
 * Ajustada durante a renderização, sem efeito.
 */
export function useChaveDoSucesso(estado: ActionState): string {
  const [chave, setChave] = useState("inicial");
  const [visto, setVisto] = useState(estado.token);

  if (estado.token !== visto) {
    setVisto(estado.token);
    if (estado.ok && estado.token) setChave(estado.token);
  }

  return chave;
}
