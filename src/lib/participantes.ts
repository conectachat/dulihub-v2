/**
 * Participantes — de quem cuida do cliente (`person_participants`) e do
 * negócio (`opportunity_participants`), 0044. Testado em
 * `participantes.test.ts`.
 *
 * Grava-se só a diferença: entra quem é novo, sai quem foi desmarcado, e
 * quem continua não é regravado (nem perde a data de quando entrou).
 */
export function diferencaDeParticipantes(
  eram: Iterable<string>,
  serao: Iterable<string>,
): { entram: string[]; saem: string[] } {
  const antes = new Set(eram);
  const depois = new Set(serao);
  return {
    entram: [...depois].filter((u) => !antes.has(u)),
    saem: [...antes].filter((u) => !depois.has(u)),
  };
}
