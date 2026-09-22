import { NADA_GRAVADO, traduzirErro } from "@/lib/erros";
import { novoId } from "@/lib/id";

import type { Linha } from "./espelho";

/**
 * A fila de gravações feitas neste aparelho.
 *
 * Offline, a gravação não tem para onde ir na hora: ela é aplicada no
 * aparelho, entra aqui, e sobe quando houver rede. O perigo desta parte não é
 * falhar — é **parecer que deu certo**. Três regras existem só por causa
 * disso, e cada uma tem um teste:
 *
 * 1. **O id da linha vem do cliente.** Se a resposta do servidor se perder no
 *    caminho, repetir o insert bate na chave primária em vez de criar uma
 *    segunda linha. Erro de chave primária, aqui, quer dizer "já subiu".
 * 2. **Zero linhas tem sentido diferente em cada verbo.** Num `update`, é
 *    recusa da RLS (PostgREST aplica policy como filtro: erro nulo, nada
 *    alterado). Num `delete`, é ambíguo — pode ser que já tenha ido —, então
 *    a fila pergunta se a linha ainda está lá antes de decidir.
 * 3. **Item recusado envenena o alvo.** Quem dependia dele não é enviado. Sem
 *    isso, "criar pasta (recusada) → apagar pasta" terminaria com o delete
 *    achando zero linhas, declarando sucesso e limpando a fila: a pasta some
 *    da tela e ninguém fica sabendo que ela nunca existiu.
 *
 * Recusa nunca desfaz nada sozinha. O item fica em conflito, com a frase de
 * `traduzirErro`, e quem decide é quem gravou — foi a escolha do Renato em
 * 21/set: "guardar e perguntar".
 */

export type Operacao =
  | { tipo: "insert"; tabela: string; linha: Linha }
  | { tipo: "update"; tabela: string; id: string; patch: Linha }
  | { tipo: "delete"; tabela: string; id: string }
  | { tipo: "rpc"; nome: string; args: Record<string, unknown> };

export type ItemDaFila = {
  id: string;
  /**
   * A linha que este item toca. É por ele que o bloqueio funciona: alvo em
   * conflito segura quem depende dele, e só quem depende dele.
   */
  alvo: string;
  /** Alvos que precisam ter subido antes deste fazer sentido. */
  depende: string[];
  /** Aplicados em sequência. Vários quando o banco faria em cascata. */
  passos: Operacao[];
  /** "Renomear a tag EB-1A" — o que a bandeja mostra. */
  rotulo: string;
  criada_em: string;
  estado: "pendente" | "conflito";
  enviada_em: string | null;
  /** A frase de `traduzirErro`, quando em conflito. */
  motivo: string | null;
};

export type Falha = { code?: string; message?: string } | null;

export interface TransporteDaFila {
  inserir(tabela: string, linha: Linha): Promise<{ error: Falha }>;
  atualizar(
    tabela: string,
    id: string,
    patch: Linha,
  ): Promise<{ error: Falha; linhas: number }>;
  apagar(tabela: string, id: string): Promise<{ error: Falha; linhas: number }>;
  /** Só é chamado quando um `delete` não tocou linha nenhuma. */
  existe(tabela: string, id: string): Promise<boolean>;
  rpc(nome: string, args: Record<string, unknown>): Promise<{ error: Falha }>;
}

export interface ArmazemDaFila {
  listar(): Promise<ItemDaFila[]>;
  gravar(item: ItemDaFila): Promise<void>;
  apagar(id: string): Promise<void>;
}

/**
 * Põe uma gravação na fila.
 *
 * `depende` vem de `dependeDe`: alterar algo que ainda não subiu amarra um
 * item ao outro, e é isso que impede o segundo de ser enviado sozinho se o
 * primeiro for recusado.
 */
export async function enfileirar(
  armazem: ArmazemDaFila,
  nova: {
    alvo: string;
    passos: Operacao[];
    rotulo: string;
    depende?: string[];
    /**
     * Substitui um item que já está na fila, em vez de acrescentar.
     *
     * Só a reordenação usa: dez cliques no mesmo grupo de irmãos viram uma
     * chamada com a ordem final. Ver `ordem.ts`.
     */
    id?: string;
  },
): Promise<ItemDaFila> {
  const item: ItemDaFila = {
    id: nova.id ?? novoId(),
    alvo: nova.alvo,
    depende: nova.depende ?? [],
    passos: nova.passos,
    rotulo: nova.rotulo,
    criada_em: new Date().toISOString(),
    estado: "pendente",
    enviada_em: null,
    motivo: null,
  };
  await armazem.gravar(item);
  return item;
}

/** O alvo ainda está na fila? Então quem o altera depende dele. */
export function dependeDe(itens: ItemDaFila[], alvo: string): string[] {
  return itens.some((i) => i.alvo === alvo) ? [alvo] : [];
}

export type ResultadoDaDrenagem = {
  subiram: number;
  conflitos: number;
  /** Por que a drenagem parou antes do fim — rede ou sessão. Nulo: foi até o fim. */
  parou: string | null;
};

/**
 * Códigos que **não** são recusa: a gravação é válida, a hora é que está
 * errada. Viram espera, não conflito — marcar conflito aqui poria a pessoa
 * decidindo sobre algo que vai funcionar sozinho no próximo minuto.
 */
const ESPERAR = new Set(["PGRST301", "503", "08006", "57P01"]);

const DEPENDE_DE_RECUSADA =
  "Esta alteração depende de outra que não foi aceita. Resolva a primeira.";

/** Erro de chave primária: o replay achou a linha que ele mesmo criou. */
function ehChavePrimaria(falha: Falha): boolean {
  return falha?.code === "23505" && /"[a-z_]+_pkey"/.test(falha.message ?? "");
}

/** Falha de rede chega como exceção; recusa do banco chega como resposta. */
function ehQuedaDeRede(erro: unknown): boolean {
  return erro instanceof Error;
}

async function aplicar(
  transporte: TransporteDaFila,
  passo: Operacao,
): Promise<{ ok: true } | { ok: false; motivo: string; espera?: boolean }> {
  const recusa = (falha: Falha) =>
    ESPERAR.has(falha?.code ?? "")
      ? { ok: false as const, motivo: traduzirErro(falha), espera: true }
      : { ok: false as const, motivo: traduzirErro(falha) };

  if (passo.tipo === "insert") {
    const { error } = await transporte.inserir(passo.tabela, passo.linha);
    if (!error) return { ok: true };
    // A linha já está lá, e foi este item que a pôs: a resposta é que se
    // perdeu.
    if (ehChavePrimaria(error)) return { ok: true };
    return recusa(error);
  }

  if (passo.tipo === "update") {
    const { error, linhas } = await transporte.atualizar(passo.tabela, passo.id, passo.patch);
    if (error) return recusa(error);
    // Erro nulo e nada alterado: a policy escondeu a linha. Indistinguível de
    // sucesso, e é por isso que a contagem é conferida.
    if (linhas === 0) return { ok: false, motivo: NADA_GRAVADO };
    return { ok: true };
  }

  if (passo.tipo === "delete") {
    const { error, linhas } = await transporte.apagar(passo.tabela, passo.id);
    if (error) return recusa(error);
    if (linhas > 0) return { ok: true };
    // Zero linhas num delete é ambíguo: pode ter sido apagada por outra
    // pessoa (e aí deu certo) ou recusada pela policy. Um round-trip a mais,
    // só no caminho ruim, separa os dois — mas não perfeitamente: esta
    // pergunta também passa pela RLS, e linha escondida responde "não
    // existe". Provado contra o banco em `tests/rls/fila.test.ts`.
    //
    // Fica assim de propósito. O caso que importa — apagar algo cuja criação
    // foi recusada — é barrado antes, pelo bloqueio por alvo; e chegar aqui
    // exigiria um espelho com linha que aquele login nunca poderia ter
    // recebido.
    return (await transporte.existe(passo.tabela, passo.id))
      ? { ok: false, motivo: NADA_GRAVADO }
      : { ok: true };
  }

  const { error } = await transporte.rpc(passo.nome, passo.args);
  return error ? recusa(error) : { ok: true };
}

export async function drenar(
  transporte: TransporteDaFila,
  armazem: ArmazemDaFila,
): Promise<ResultadoDaDrenagem> {
  const itens = await armazem.listar();
  // Conflito de drenagens anteriores continua segurando os dependentes: o
  // veneno não expira porque a aba foi fechada.
  const envenenados = new Set(
    itens.filter((i) => i.estado === "conflito").map((i) => i.alvo),
  );

  let subiram = 0;
  let conflitos = 0;

  for (const item of itens) {
    if (item.estado === "conflito") continue;

    if (item.depende.some((d) => envenenados.has(d))) {
      envenenados.add(item.alvo);
      conflitos += 1;
      await armazem.gravar({ ...item, estado: "conflito", motivo: DEPENDE_DE_RECUSADA });
      continue;
    }

    let recusa: { motivo: string; espera?: boolean } | null = null;

    try {
      for (const passo of item.passos) {
        const r = await aplicar(transporte, passo);
        if (!r.ok) {
          recusa = { motivo: r.motivo, espera: r.espera };
          break;
        }
      }
    } catch (erro) {
      if (!ehQuedaDeRede(erro)) throw erro;
      // Sem rede a fila para inteira, na ordem: mandar o próximo item antes
      // deste trocaria a ordem das gravações da pessoa.
      return { subiram, conflitos, parou: "Sem conexão com o servidor." };
    }

    if (recusa?.espera) return { subiram, conflitos, parou: recusa.motivo };

    if (recusa) {
      envenenados.add(item.alvo);
      conflitos += 1;
      await armazem.gravar({
        ...item,
        estado: "conflito",
        motivo: recusa.motivo,
        enviada_em: new Date().toISOString(),
      });
      continue;
    }

    subiram += 1;
    await armazem.apagar(item.id);
  }

  return { subiram, conflitos, parou: null };
}
