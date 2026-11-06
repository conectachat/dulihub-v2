"use client";

import { useState } from "react";

import type { ActionState } from "./action-state";

/**
 * Diálogo que fecha sozinho quando a Server Action confirma a gravação.
 *
 * O jeito intuitivo — `useEffect(() => { if (state.ok) setOpen(false) })` — é
 * o que produzia os erros de `set-state-in-effect`. Aqui o estado é ajustado
 * **durante a renderização**, comparando a marca da ação com a última vista.
 * React trata isso como caso previsto: refaz a renderização na hora, antes de
 * pintar a tela, sem passar por efeito e sem cascata.
 *
 * Compara `token` **e** olha `ok`. A marca muda a cada resposta — a recusa
 * também tem a sua —, então só ela não basta: o diálogo fechava na recusa e
 * levava o erro junto (G4). E só `ok` também não: continua verdadeiro depois
 * do primeiro sucesso, e o segundo não seria percebido.
 */
export function useDialogOnSuccess(estado: ActionState, abertoDeInicio = false) {
  const [open, setOpen] = useState(abertoDeInicio);
  const [ultimoToken, setUltimoToken] = useState(estado.token);

  if (estado.token !== ultimoToken) {
    setUltimoToken(estado.token);
    if (estado.ok) setOpen(false);
  }

  return { open, setOpen };
}
