/**
 * O que toda Server Action devolve para a tela.
 *
 * Existia em nove declarações idênticas, com sete nomes diferentes. Uma só,
 * porque o formato é o mesmo e porque o `token` abaixo precisa estar em todas
 * para o padrão de remontagem funcionar em qualquer tela.
 *
 * Mora em `lib/` e não em `features/` de propósito: um módulo `"use server"`
 * só pode exportar funções assíncronas, então tipo e helper exportados de um
 * arquivo de ações quebram o carregamento de TODAS as Server Actions do mesmo
 * grupo de rotas.
 */
export type ActionState = {
  /** Mensagem em português para quem está usando. `null` quando deu certo. */
  error: string | null;
  ok?: boolean;
  /**
   * Muda a cada gravação bem-sucedida.
   *
   * É o que a tela usa como `key` para remontar o formulário ou fechar o
   * diálogo — sem `useEffect` chamando `setState` depois do fato, que é o
   * padrão que o compilador do React acusa como cascata de renderização.
   *
   * Precisa mudar a cada sucesso, não apenas virar verdadeiro: gravar duas
   * vezes seguidas tem de fechar o diálogo nas duas. Um booleano que já está
   * `true` não sinaliza a segunda.
   */
  token?: string;
};

export const ESTADO_INICIAL: ActionState = { error: null };

/**
 * Falha, com a mensagem que aparece na tela.
 *
 * Carrega `token` como o sucesso: duas falhas iguais em seguida precisam ser
 * distinguíveis, senão a segunda não dispara aviso nenhum e a pessoa acha que
 * o clique não chegou a acontecer.
 */
export function falhou(error: string): ActionState {
  return { error, token: crypto.randomUUID() };
}

/** Sucesso, com marca nova. */
export function gravou(): ActionState {
  return { error: null, ok: true, token: crypto.randomUUID() };
}

/**
 * Assinatura de Server Action ligada a um `<form action={...}>`.
 *
 * A união existe porque a conversão das ações acontece em pedaços: durante
 * ela, os componentes compartilhados recebem tanto as já convertidas quanto as
 * que ainda devolvem `void`. Some quando a última for convertida.
 *
 * React ignora o valor de retorno de uma ação de formulário — é por isso que
 * converter `void` para `ActionState` não muda nenhum call site. Quem quiser a
 * mensagem chama a ação dentro de uma closure e lê o retorno ali.
 */
export type AcaoDeFormulario = (
  formData: FormData,
) => void | Promise<void> | Promise<ActionState>;
