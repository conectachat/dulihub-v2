/**
 * O texto que aparece antes de uma exclusão sem volta.
 *
 * Fica aqui, fora do componente, por dois motivos. Primeiro, é regra e não
 * marcação: plural, corte de lista, e o que exatamente se perde. Segundo,
 * assim dá para testar — e este é o texto que separa um clique da perda de
 * configuração que levou tempo para montar.
 */

/** Quantos nomes cabem antes de o diálogo virar parede de texto. */
const MAX_NOMES = 3;

/**
 * Junta nomes em português: vírgula entre todos, "e" antes do último.
 *
 * Acima de `MAX_NOMES` a lista é cortada e o resto vira contagem. Diálogo com
 * vinte nomes não é lido — o número já diz o tamanho do estrago.
 */
export function listarNomes(nomes: string[]): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];

  if (nomes.length > MAX_NOMES) {
    const restantes = nomes.length - MAX_NOMES;
    return `${nomes.slice(0, MAX_NOMES).join(", ")} e mais ${restantes}`;
  }

  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Aviso de exclusão de pasta do catálogo.
 *
 * Duas perdas, e a segunda é a invisível: `visa_type_documents` tem cascade,
 * então apagar a pasta tira a exigência, o prazo e a obrigatoriedade de todo
 * tipo de visto que a usava — inclusive os que foram ajustados um a um. Sem
 * dizer isso, a pessoa só descobre quando abre o visto.
 *
 * `vistos` conta a subárvore inteira, não só o nó: a cascata desce junto.
 */
export function avisoDeExclusaoDePasta({
  pastas,
  vistos,
}: {
  /** Quantas pastas descem junto, sem contar a que está sendo apagada. */
  pastas: number;
  /** Nomes dos tipos de visto que perdem a exigência, sem repetição. */
  vistos: string[];
}): string {
  const frases: string[] = [];

  if (pastas === 1) {
    frases.push("Isso apaga também a pasta que está dentro dela.");
  } else if (pastas > 1) {
    frases.push(`Isso apaga também as ${pastas} pastas que estão dentro dela.`);
  }

  if (vistos.length === 1) {
    frases.push(
      `O visto ${vistos[0]} deixa de exigi-la, com o prazo e a obrigatoriedade que você ajustou.`,
    );
  } else if (vistos.length > 1) {
    frases.push(
      `${vistos.length} tipos de visto deixam de exigi-la, com o prazo e a obrigatoriedade que você ajustou: ${listarNomes(vistos)}.`,
    );
  }

  frases.push("Não dá para desfazer.");
  return frases.join(" ");
}
