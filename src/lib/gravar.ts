import { falhou, gravou, type ActionState } from "./action-state";
import { NADA_GRAVADO, traduzirErro } from "./erros";

/** O que o PostgREST devolve numa gravação com `.select()`. */
type RespostaDeGravacao = {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
};

/**
 * Converte o resultado de uma gravação no estado que a tela lê.
 *
 * Existe por causa de uma armadilha que quase todo código Supabase tem:
 * **`error` nulo não quer dizer que gravou.** O PostgREST aplica a RLS como
 * filtro, então linha que a policy esconde simplesmente não casa no
 * `update`/`delete` — vem erro nulo, zero linhas afetadas, e o resultado é
 * indistinguível de sucesso.
 *
 * Nesta base isso é grave em vez de teórico: a separação entre organizações
 * se apoia inteiramente na RLS. Uma policy com defeito ou um token velho
 * produzem exatamente o silêncio que estamos eliminando.
 *
 * Por isso toda gravação leva `.select("id")` e passa por aqui.
 */
export function resultado(resposta: RespostaDeGravacao): ActionState {
  if (resposta.error) return falhou(traduzirErro(resposta.error));
  if (!resposta.data || resposta.data.length === 0) return falhou(NADA_GRAVADO);
  return gravou();
}

/**
 * Mesma ideia para gravação sem `.select()` — insert em lote, RPC, upsert.
 *
 * Aqui não dá para contar linhas, então só o erro é verificado. Use `resultado`
 * sempre que puder; esta é a exceção, não o caminho.
 */
export function resultadoSemContagem(
  resposta: { error: { code?: string; message?: string } | null },
): ActionState {
  if (resposta.error) return falhou(traduzirErro(resposta.error));
  return gravou();
}
