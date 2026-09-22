"use client";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { novoId } from "@/lib/id";
import type { BancoLocal } from "@/lib/local/banco";
import type { BancoDaFila } from "@/lib/local/banco-da-fila";
import { armazemDaFila } from "@/lib/local/banco-da-fila";
import { dependeDe, enfileirar, type ItemDaFila, type Operacao } from "@/lib/local/fila";
import { alvoDaOrdem, coalescerOrdem, novaOrdem, RPC_ORDEM } from "@/lib/local/ordem";
import { organizacaoLocal } from "@/lib/local/organizacao-local";
import { bancoDoUsuario, filaDoUsuario, sincronizarAgora } from "@/lib/local/sincronizador";
import { usuarioLocal } from "@/lib/local/usuario";

import { statusDeEtapaLocal, tagsLocais } from "./consultas-locais";
import {
  stageStatusColorSchema,
  stageStatusLabelSchema,
  tagSchema,
  toCode,
} from "./schema";

/**
 * As gravações da Configuração, feitas **no aparelho**.
 *
 * Mesmas assinaturas das Server Actions que elas substituem, de propósito:
 * `InlineText`, `ConfirmAction`, `comAviso` e `useActionState` continuam
 * funcionando sem uma linha de mudança, e a tela não fica sabendo se há
 * internet. É o que "offline funciona igual online" quer dizer aqui.
 *
 * O caminho é sempre o mesmo, com ou sem rede: valida, grava na fila, pede
 * uma sincronia. Com rede ela sobe em seguida; sem rede, fica. A tela não
 * espera nem uma coisa nem outra — `sobreposicao.ts` já a faz enxergar o que
 * está na fila.
 *
 * A conferência de nome repetido acontece aqui, contra o espelho, e não só no
 * servidor: recusar na hora de subir poria o erro horas depois do dedo que o
 * cometeu, quando ninguém mais lembra o que estava fazendo.
 */

const SEM_ESPELHO =
  "Este aparelho ainda não baixou seus dados. Conecte-se uma vez antes de gravar.";

const SEM_SESSAO = "Sua sessão terminou neste aparelho. Entre de novo.";

type Contexto = {
  userId: string;
  organizationId: string;
  banco: BancoLocal;
  fila: BancoDaFila;
};

async function contexto(): Promise<Contexto | { erro: string }> {
  const { userId } = await usuarioLocal();
  if (!userId) return { erro: SEM_SESSAO };

  const banco = bancoDoUsuario(userId);
  const fila = filaDoUsuario(userId);
  const organizationId = await organizacaoLocal(banco, userId);
  if (!organizationId) return { erro: SEM_ESPELHO };

  return { userId, organizationId, banco, fila };
}

/** Grava na fila e pede a sincronia. Não espera por ela: pode não haver rede. */
async function gravarLocal(
  ctx: Contexto,
  nova: {
    alvo: string;
    passos: Operacao[];
    rotulo: string;
    depende?: string[];
    id?: string;
  },
): Promise<ActionState> {
  try {
    await enfileirar(armazemDaFila(ctx.fila), nova);
  } catch (erro) {
    // Cota estourada, aba anônima do Safari, banco em outra versão. Falhar
    // calado aqui seria perder a gravação sem ninguém notar.
    return falhou(
      `Não foi possível guardar a alteração neste aparelho. ${
        erro instanceof Error ? erro.message : ""
      }`.trim(),
    );
  }

  void sincronizarAgora(ctx.userId);
  return gravou();
}

/** A fila deste aparelho, para conferir dependência e coalescer ordem. */
async function naFila(ctx: Contexto): Promise<ItemDaFila[]> {
  return armazemDaFila(ctx.fila).listar();
}

/**
 * Reordenar entre irmãos, pela lista absoluta.
 *
 * `irmaos` já vem na ordem que a tela mostra — do espelho **com a fila por
 * cima**, senão a segunda reordenação seguida offline mandaria a ordem antiga.
 */
async function reordenar(
  ctx: Contexto,
  {
    tabela,
    pai,
    irmaos,
    id,
    direcao,
    rotulo,
  }: {
    tabela: string;
    pai: string | null;
    irmaos: { id: string }[];
    id: string;
    direcao: "up" | "down";
    rotulo: string;
  },
): Promise<ActionState> {
  const ordem = novaOrdem(irmaos, id, direcao);
  // Já está na ponta, ou o id sumiu: a tela desabilita as setas, e gravar
  // "mesma ordem" só encheria a fila.
  if (ordem.join() === irmaos.map((i) => i.id).join()) return gravou();

  const itens = await naFila(ctx);
  return gravarLocal(ctx, {
    id: coalescerOrdem(itens, tabela, pai) ?? undefined,
    alvo: alvoDaOrdem(tabela, pai),
    rotulo,
    passos: [
      { tipo: "rpc", nome: RPC_ORDEM, args: { p_tabela: tabela, p_ids: ordem } },
    ],
  });
}

// ------------------------------------------------------------------- tags

export async function createTag(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = tagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const existentes = await tagsLocais(ctx.banco, ctx.fila);
  if (existentes.some((t) => t.name.localeCompare(parsed.data.name, "pt-BR", {
    sensitivity: "base",
  }) === 0)) {
    return falhou("Já existe uma tag com esse nome.");
  }

  const id = novoId();
  return gravarLocal(ctx, {
    alvo: id,
    rotulo: `Criar a tag ${parsed.data.name}`,
    passos: [
      {
        tipo: "insert",
        tabela: "tags",
        linha: { id, organization_id: ctx.organizationId, ...parsed.data },
      },
    ],
  });
}

export async function updateTag(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Tag não informada.");

  const parsed = tagSchema.partial().safeParse({
    name: formData.get("name") ?? undefined,
    color: formData.get("color") ?? undefined,
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const patch: Record<string, unknown> = {};
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.color) patch.color = parsed.data.color;
  // Nada a mudar não é falha; a tela só não precisa fazer nada.
  if (Object.keys(patch).length === 0) return gravou();

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const existentes = await tagsLocais(ctx.banco, ctx.fila);
  const atual = existentes.find((t) => t.id === id);
  if (parsed.data.name) {
    const repetida = existentes.some(
      (t) =>
        t.id !== id &&
        t.name.localeCompare(parsed.data.name!, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (repetida) return falhou("Já existe uma tag com esse nome.");
  }

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Alterar a tag ${atual?.name ?? ""}`.trim(),
    passos: [{ tipo: "update", tabela: "tags", id, patch }],
  });
}

export async function deleteTag(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Tag não informada.");

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const atual = (await tagsLocais(ctx.banco, ctx.fila)).find((t) => t.id === id);

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Excluir a tag ${atual?.name ?? ""}`.trim(),
    // `person_tags` some por cascade no servidor. No aparelho a tela lê a
    // contagem do espelho, que a próxima sincronia corrige — e ninguém
    // decide nada por esse número enquanto isso.
    passos: [{ tipo: "delete", tabela: "tags", id }],
  });
}

// -------------------------------------------------------- status de etapa

export async function createStageStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const label = stageStatusLabelSchema.safeParse(formData.get("label"));
  if (!label.success) return falhou(label.error.issues[0].message);

  const color = stageStatusColorSchema.safeParse(formData.get("color"));
  if (!color.success) return falhou(color.error.issues[0].message);

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const existentes = await statusDeEtapaLocal(ctx.banco, ctx.fila);
  const code = toCode(label.data);
  // Dois nomes diferentes podem normalizar para o mesmo `code`. O índice
  // único recusaria — mas só na hora de subir, longe de quem digitou.
  if (existentes.some((s) => s.code === code)) {
    return falhou("Já existe um status com esse nome.");
  }

  const id = novoId();
  return gravarLocal(ctx, {
    alvo: id,
    rotulo: `Criar o status ${label.data}`,
    passos: [
      {
        tipo: "insert",
        tabela: "stage_statuses",
        linha: {
          id,
          organization_id: ctx.organizationId,
          code,
          label: label.data,
          color: color.data,
          position: (existentes.at(-1)?.position ?? -1) + 1,
        },
      },
    ],
  });
}

/** Nome e cor salvam separado, cada um ao seu gatilho. */
export async function updateStageStatus(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Status não informado.");

  const patch: Record<string, unknown> = {};

  const rawLabel = formData.get("label");
  if (typeof rawLabel === "string") {
    const label = stageStatusLabelSchema.safeParse(rawLabel);
    if (label.success) patch.label = label.data;
  }

  const rawColor = formData.get("color");
  if (typeof rawColor === "string") {
    const color = stageStatusColorSchema.safeParse(rawColor);
    if (color.success) patch.color = color.data;
  }

  if (Object.keys(patch).length === 0) return gravou();

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const atual = (await statusDeEtapaLocal(ctx.banco, ctx.fila)).find((s) => s.id === id);
  // O `code` não acompanha o nome: é o que o resto do sistema referencia, e
  // renomear não pode apontar relatório para o vazio (ver `schema.ts`).
  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Alterar o status ${atual?.label ?? ""}`.trim(),
    passos: [{ tipo: "update", tabela: "stage_statuses", id, patch }],
  });
}

export async function toggleStageStatusDone(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const next = formData.get("is_done");
  if (typeof id !== "string" || typeof next !== "string") {
    return falhou("Status não informado.");
  }

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const atual = (await statusDeEtapaLocal(ctx.banco, ctx.fila)).find((s) => s.id === id);

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `${next === "true" ? "Marcar" : "Desmarcar"} “${atual?.label ?? ""}” como concluída`,
    passos: [
      {
        tipo: "update",
        tabela: "stage_statuses",
        id,
        patch: { is_done: next === "true" },
      },
    ],
  });
}

/**
 * Define o status de toda etapa recém-criada.
 *
 * Continua indo por RPC, e não por dois updates: são dois passos — limpar o
 * padrão antigo e marcar o novo — e o índice único não admite os dois
 * marcados ao mesmo tempo. Dois updates enfileirados, falhando no meio,
 * deixariam a organização **sem padrão nenhum**.
 *
 * Como a RPC não conta à tela o que mudou, `sobreposicao.ts` tem o gêmeo
 * local dela.
 */
export async function setDefaultStageStatus(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Status não informado.");

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const atual = (await statusDeEtapaLocal(ctx.banco, ctx.fila)).find((s) => s.id === id);

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Tornar “${atual?.label ?? ""}” o status padrão`,
    passos: [{ tipo: "rpc", nome: "set_default_stage_status", args: { p_id: id } }],
  });
}

export async function moveStageStatus(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) {
    return falhou("Movimento não informado.");
  }

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const irmaos = await statusDeEtapaLocal(ctx.banco, ctx.fila);
  return reordenar(ctx, {
    tabela: "stage_statuses",
    pai: null,
    irmaos,
    id,
    direcao: direction,
    rotulo: "Reordenar os status de etapa",
  });
}

/**
 * Exclui um status criado pela equipe.
 *
 * Os três de fábrica são barrados pelo gatilho `stage_statuses_protect_system`
 * — a garantia é do banco. A conferência aqui é para o clique não prometer o
 * que não pode, e para o erro não chegar horas depois.
 */
export async function deleteStageStatus(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Status não informado.");

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const atual = (await statusDeEtapaLocal(ctx.banco, ctx.fila)).find((s) => s.id === id);
  if (atual?.is_system) {
    return falhou("Os status de fábrica não podem ser excluídos.");
  }

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Excluir o status ${atual?.label ?? ""}`.trim(),
    passos: [{ tipo: "delete", tabela: "stage_statuses", id }],
  });
}
