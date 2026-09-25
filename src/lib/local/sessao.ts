/**
 * Até quando o que está no aparelho vale.
 *
 * Decisão do Renato em 21/set: recusa **gravar** depois de 7 dias sem
 * sincronizar com sucesso, e recusa **mostrar** depois de 14.
 *
 * O prazo existe por causa do modo de falha desta arquitetura, que não é
 * perder dado — é mostrar dado velho como se fosse atual. Um notebook
 * esquecido numa gaveta abre com a configuração de um mês atrás, sem nada na
 * tela que permita desconfiar. E gravar em cima de uma cópia velha é pior
 * ainda: a linha sobe com valores que já não valem.
 *
 * Conta-se da última vez em que o **servidor respondeu**, não da última
 * tentativa — o mesmo critério do carimbo na barra lateral, e pela mesma
 * razão: tentar não é sincronizar.
 *
 * A fila não vence junto. O que já foi gravado continua lá e sobe quando
 * houver rede; descartar trabalho por causa do relógio seria a perda
 * silenciosa que esta fase inteira combate.
 */

export const DIAS_PARA_GRAVAR = 7;
export const DIAS_PARA_LER = 14;

/** Marca da última sincronia em que o servidor respondeu. */
export const MARCA_DA_SINCRONIA = "__sincronizado_em";

const UM_DIA = 24 * 60 * 60 * 1000;

export type Validade = {
  /** Dias inteiros desde a última resposta do servidor. Nulo: nunca houve. */
  diasParado: number | null;
  podeGravar: boolean;
  podeLer: boolean;
};

const NOVO: Validade = { diasParado: null, podeGravar: true, podeLer: true };

export function validadeDoEspelho(
  marca: string | null | undefined,
  agora: Date = new Date(),
): Validade {
  if (!marca) return NOVO;

  const quando = new Date(marca).getTime();
  // Data ilegível: bloquear o app por causa de uma marca corrompida seria
  // trocar um problema pequeno por um grande. O espelho vazio já tem tela.
  if (Number.isNaN(quando)) return NOVO;

  // Negativo é relógio do aparelho atrasado, não espelho do futuro.
  const diasParado = Math.max(0, Math.floor((agora.getTime() - quando) / UM_DIA));

  return {
    diasParado,
    podeGravar: diasParado < DIAS_PARA_GRAVAR,
    podeLer: diasParado < DIAS_PARA_LER,
  };
}

/** A frase que a tela mostra quando o aparelho passou do prazo. */
export function motivoDoPrazo(v: Validade, acao: "gravar" | "ler"): string {
  const dias = v.diasParado ?? 0;
  const tempo = dias === 1 ? "1 dia" : `${dias} dias`;

  return acao === "gravar"
    ? `Este aparelho está há ${tempo} sem sincronizar. Conecte-se à internet antes de alterar — gravar sobre uma cópia velha é o caminho para sobrescrever o trabalho de outra pessoa.`
    : `Este aparelho está há ${tempo} sem sincronizar, e o que está guardado aqui pode não valer mais. Conecte-se à internet para ver a configuração atual.`;
}
