"use client";

import { toast } from "sonner";

import type { AcaoDeFormulario } from "./action-state";

/**
 * Executa a Server Action e avisa na tela quando ela recusa.
 *
 * Este é o ponto onde a falha deixa de ser invisível. Antes, 26 ações
 * devolviam `void` e desistiam em silêncio: falha e sucesso ficavam idênticos,
 * e a pessoa clicava de novo achando que o primeiro clique não tinha pegado.
 *
 * **Por que uma closure e não `useActionState`:** o hook exige assinatura de
 * dois argumentos, o que quebraria as três ações que vivem em componente
 * servidor, onde hook não existe. Além disso, estado de `useActionState`
 * sobrevive até o próximo envio — um campo que falhou e depois deu certo
 * continuaria mostrando o erro antigo. Aqui a mensagem nasce e morre no
 * `await`.
 *
 * **Por que o aviso sai daqui e não da renderização:** `toast()` avisa o
 * assinante de forma síncrona, ou seja, chama `setState` noutro componente. Se
 * fosse durante a renderização, React reclamaria e uma renderização descartada
 * poderia emitir aviso fantasma. Dentro do `await`, dispara uma vez, no momento
 * em que a promessa resolve.
 */
export function comAviso(action: AcaoDeFormulario) {
  return async (formData: FormData) => {
    const resultado = await action(formData);

    // Ação ainda não convertida devolve `undefined`. Enquanto a conversão não
    // termina, as duas formas convivem sem quebrar nada.
    if (resultado && resultado.error) {
      toast.error(resultado.error);
    }
  };
}
