/**
 * Regras do funil que não dependem do banco — testadas em `regras.test.ts`.
 */

export type EtapaDoFunil = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

// ---------------------------------------------------------------------- trilha

export type DegrauDaTrilha = {
  id: string;
  name: string;
  estado: "feita" | "atual" | "futura";
};

/**
 * A trilha do topo da tela do lead: as etapas do meio do funil, em ordem.
 *
 * Ganho e Perdido ficam de fora — são saídas, com botão próprio e
 * consequência própria, e não um degrau a mais para clicar.
 *
 * Negócio ganho passou por tudo. Perdido apaga a trilha: o banco guarda a
 * etapa atual, não a anterior, e marcar "até onde chegou" seria inventar.
 */
export function trilhaDoFunil(etapas: EtapaDoFunil[], atualId: string): DegrauDaTrilha[] {
  const atual = etapas.find((e) => e.id === atualId);
  const meio = etapas
    .filter((e) => !e.is_won && !e.is_lost)
    .sort((a, b) => a.position - b.position);

  return meio.map((e) => {
    let estado: DegrauDaTrilha["estado"];
    if (atual?.is_won) estado = "feita";
    else if (!atual || atual.is_lost) estado = "futura";
    else if (e.id === atual.id) estado = "atual";
    else estado = e.position < atual.position ? "feita" : "futura";

    return { id: e.id, name: e.name, estado };
  });
}

// ---------------------------------------------------------------------- perda

/**
 * Por que o negócio não fechou. Lista curta de propósito: com dez opções
 * ninguém escolhe direito, e o que não couber vai em "Outro", com o detalhe.
 */
export const MOTIVOS_DE_PERDA = {
  preco: "Preço",
  sem_perfil: "Sem perfil para o visto",
  desistiu: "Desistiu ou adiou",
  concorrente: "Fechou com outro",
  sem_resposta: "Sem resposta",
  outro: "Outro",
} as const;

const DETALHE_MAXIMO = 300;

/**
 * O texto que fica em `opportunities.lost_reason` e no histórico.
 *
 * Motivo é obrigatório — é a informação que o botão Perdido existe para
 * colher. "Outro" sozinho não diz nada, então exige o detalhe.
 */
export function motivoDaPerda(
  motivo: unknown,
  detalhe: unknown,
): { ok: true; texto: string } | { ok: false; erro: string } {
  if (typeof motivo !== "string" || !(motivo in MOTIVOS_DE_PERDA)) {
    return { ok: false, erro: "Escolha o motivo." };
  }

  const rotulo = MOTIVOS_DE_PERDA[motivo as keyof typeof MOTIVOS_DE_PERDA];
  const texto = typeof detalhe === "string" ? detalhe.trim() : "";

  if (motivo === "outro" && texto === "") {
    return { ok: false, erro: "Escreva o que aconteceu." };
  }
  if (texto.length > DETALHE_MAXIMO) {
    return { ok: false, erro: `Detalhe longo demais (máximo ${DETALHE_MAXIMO} letras).` };
  }

  return { ok: true, texto: texto ? `${rotulo} — ${texto}` : rotulo };
}

// --------------------------------------------------------------------- quadro

/**
 * O que acontece ao soltar um cartão numa coluna.
 *
 * Ganho e Perdido não movem direto: um vira o contato em cliente, que não
 * volta a ser lead, e o outro pede o motivo. Arrastar não pode pular nenhum
 * dos dois.
 */
export function aoSoltar(
  cartao: { stage_id: string },
  etapa: Pick<EtapaDoFunil, "id" | "is_won" | "is_lost">,
): "nada" | "mover" | "ganhar" | "perder" {
  if (cartao.stage_id === etapa.id) return "nada";
  if (etapa.is_won) return "ganhar";
  if (etapa.is_lost) return "perder";
  return "mover";
}

/**
 * Para onde o cartão leva. Enquanto é lead, a tela do lead; ganho, o perfil
 * completo do cliente — que é onde o processo nasce.
 */
export function enderecoDoCartao(
  cartao: { id: string; person: { id: string } | null },
  etapa: Pick<EtapaDoFunil, "is_won">,
): string {
  if (etapa.is_won && cartao.person) return `/contatos/${cartao.person.id}`;
  return `/crm/${cartao.id}`;
}
