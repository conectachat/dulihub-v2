/**
 * Formatação de texto para a tela, num lugar só.
 *
 * Cada uma destas existia em duas ou três cópias. Isoladas são triviais; o
 * problema é a divergência, que já aconteceu uma vez com moeda (hoje em
 * `totals.ts`): o quadro mostrava `R$ 12.500` e a ficha `R$ 12.500,00`.
 */

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Fuso fixo de propósito. Sem ele, o servidor da Vercel formata em UTC e o
 * navegador no horário local: uma nota escrita às 22h aparece com a data do
 * dia seguinte no HTML e muda na hidratação.
 */
export function formatarData(valor: string | Date): string {
  return DATA.format(new Date(valor));
}

export function formatarDataHora(valor: string | Date): string {
  return DATA_HORA.format(new Date(valor));
}

/** Até duas iniciais, em maiúscula. Para avatar. */
export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

/** DDI e número juntos. Sem número, nulo — "+55" sozinho parece telefone e não é. */
export function telefoneCompleto(
  ddi: string | null | undefined,
  numero: string | null | undefined,
): string | null {
  if (!numero) return null;
  return ddi ? `${ddi} ${numero}` : numero;
}
