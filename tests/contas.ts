/**
 * Contas de teste e a regra de credencial, comuns às suítes que falam com o
 * Supabase de verdade (`tests/rls`, `tests/fumaca`).
 *
 * Nenhuma senha mora no repositório. Elas vêm do `.env.local`, que o `git`
 * ignora, ou dos segredos do GitHub no CI, e são digitadas por quem tem as
 * contas.
 */

export const EMAILS = {
  parceiro: "teste-parceiro@duliconsulting.com",
  colaborador: "teste-colaborador@duliconsulting.com",
  cliente: "teste-cliente@duliconsulting.com",
} as const;

export type Papel = keyof typeof EMAILS;

export const SENHAS: Record<Papel, string> = {
  parceiro: "RLS_SENHA_PARCEIRO",
  colaborador: "RLS_SENHA_COLABORADOR",
  cliente: "RLS_SENHA_CLIENTE",
};

/**
 * Faltando credencial, a suíte **falha**. Não pula.
 *
 * Suíte que se cala por falta de segredo reporta verde sem verificar nada — foi
 * exatamente assim que o portão ficou verde por nove dias sem executar um teste
 * sequer.
 */
export function obrigatorio(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      [
        `Falta ${nome}.`,
        "",
        "Esta suíte precisa das contas de teste. Sem elas ela não roda — e não",
        "pode passar calada, porque foi assim que o portão ficou verde por nove",
        "dias sem executar um teste sequer.",
        "",
        "Ver tests/rls/README.md.",
      ].join("\n"),
    );
  }
  return valor;
}
