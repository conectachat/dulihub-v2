"use client";

import { useState } from "react";

/**
 * Diálogo que fecha sozinho quando a Server Action confirma a gravação.
 *
 * O jeito intuitivo — `useEffect(() => { if (state.ok) setOpen(false) })` — é
 * o que produzia os erros de `set-state-in-effect`. Aqui o estado é ajustado
 * **durante a renderização**, comparando a marca da ação com a última vista.
 * React trata isso como caso previsto: refaz a renderização na hora, antes de
 * pintar a tela, sem passar por efeito e sem cascata.
 *
 * Compara `token`, não `ok`: `ok` continua verdadeiro depois do primeiro
 * sucesso, então o segundo não seria percebido e o diálogo ficaria aberto.
 */
export function useDialogOnSuccess(token: string | undefined) {
  const [open, setOpen] = useState(false);
  const [ultimoToken, setUltimoToken] = useState(token);

  if (token !== ultimoToken) {
    setUltimoToken(token);
    if (token) setOpen(false);
  }

  return { open, setOpen };
}
