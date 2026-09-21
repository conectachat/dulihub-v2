"use client";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { novoId } from "@/lib/id";
import type { BancoLocal } from "@/lib/local/banco";
import type { BancoDaFila } from "@/lib/local/banco-da-fila";
import { armazemDaFila } from "@/lib/local/banco-da-fila";
import { dependeDe, enfileirar, type Operacao } from "@/lib/local/fila";
import { organizacaoLocal } from "@/lib/local/organizacao-local";
import { bancoDoUsuario, filaDoUsuario, sincronizarAgora } from "@/lib/local/sincronizador";
import { usuarioLocal } from "@/lib/local/usuario";

import { tagsLocais } from "./consultas-locais";
import { tagSchema } from "./schema";

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
  nova: { alvo: string; passos: Operacao[]; rotulo: string; depende?: string[] },
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

  const naFila = await armazemDaFila(ctx.fila).listar();
  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(naFila, id),
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
  const naFila = await armazemDaFila(ctx.fila).listar();

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(naFila, id),
    rotulo: `Excluir a tag ${atual?.name ?? ""}`.trim(),
    // `person_tags` some por cascade no servidor. No aparelho a tela lê a
    // contagem do espelho, que a próxima sincronia corrige — e ninguém
    // decide nada por esse número enquanto isso.
    passos: [{ tipo: "delete", tabela: "tags", id }],
  });
}
