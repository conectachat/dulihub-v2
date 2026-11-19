"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import type { SituacaoDaFicha } from "@/features/cadastro/regras";
import { deleteOpportunity, moveOpportunity } from "@/features/opportunities/actions";
import type { Stage } from "@/features/opportunities/queries";
import {
  aoSoltar,
  enderecoDoCartao,
  etapasDeEntrada,
  REABRA_ANTES,
} from "@/features/opportunities/regras";
import { formatarPorMoeda, somarItensPorMoeda } from "@/lib/totals";
import { cn } from "@/lib/utils";
import { enderecoDaPessoa } from "@/lib/pessoa";

import { AtalhoDaFicha } from "./atalho-da-ficha";
import {
  DialogoDeGanho,
  DialogoDePerda,
  DialogoDeReabrir,
  type NegocioDoDialogo,
} from "./dialogos";
import { MoveCard } from "./move-card";
import { OpportunityDialog } from "./opportunity-dialog";

/**
 * O quadro do funil: colunas, cartões e o arrastar.
 *
 * **Arrastar com o HTML nativo**, sem biblioteca. É a única tela da base em
 * que se arrasta (`MoveButtons` explica por que o resto não): mover um cartão
 * entre colunas é o gesto que todo quadro ensinou, e aqui o destino é uma
 * coluna inteira — não há o "soltar entre dois níveis" que torna o arrastar
 * ruim numa árvore.
 *
 * **O seletor do cartão continua.** Arrastar nativo não funciona no toque nem
 * no teclado; o seletor é o caminho do celular e do leitor de tela.
 *
 * Os dois passam por `levar`, e é ali que mora a regra: Ganho mostra o
 * resumo, Perdido pede o motivo, sair do Ganho pede para reabrir, e nenhum
 * dos três move direto (`aoSoltar`).
 *
 * Ganho e Perdido mostram só os encerrados dos últimos 30 dias; o resto fica
 * em CRM › Encerradas (CRM-16).
 */

export type CartaoDoQuadro = {
  id: string;
  title: string;
  /** Os vistos do negócio: o cartão mostra o total por moeda (CRM-13). */
  itens: { amount: number; currency: string }[];
  stage_id: string;
  person: { id: string; full_name: string } | null;
  /** Processos nascidos deste negócio — decidem o atalho na coluna de Ganho. */
  processos: string[];
  /** Em que pé está a ficha de cadastro do contato. */
  ficha: SituacaoDaFicha;
};

export function Quadro({
  etapas,
  cartoes,
  pessoas,
}: {
  etapas: Stage[];
  cartoes: CartaoDoQuadro[];
  pessoas: { id: string; full_name: string }[];
}) {
  // O cartão muda de coluna na hora; quando o servidor responde, a página
  // revalidada traz a verdade — e uma recusa devolve o cartão ao lugar.
  const [visiveis, moverNaTela] = useOptimistic(
    cartoes,
    (atual, movimento: { id: string; stage_id: string }) =>
      atual.map((c) => (c.id === movimento.id ? { ...c, stage_id: movimento.stage_id } : c)),
  );
  const [, iniciar] = useTransition();

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<
    { tipo: "ganho" | "perda" | "reabrir"; negocio: NegocioDoDialogo } | null
  >(null);

  const opcoes = etapas.map((e) => ({ id: e.id, name: e.name }));
  const entrada = etapasDeEntrada(etapas).map((e) => ({ id: e.id, name: e.name }));
  // Reabrir volta para a primeira etapa aberta, onde quer que o cartão caia (D7).
  const primeiraAberta = entrada[0]?.name ?? "a primeira etapa";

  /** Leva o cartão para a etapa — por arrastar ou pelo seletor. */
  function levar(cartao: CartaoDoQuadro, etapaId: string) {
    const etapa = etapas.find((e) => e.id === etapaId);
    const origem = etapas.find((e) => e.id === cartao.stage_id);
    if (!etapa || !origem) return;

    const acao = aoSoltar(origem, etapa);
    if (acao === "nada") return;

    if (acao === "reabra-antes") {
      toast.error(REABRA_ANTES);
      return;
    }
    if (acao === "ganhar" || acao === "perder" || acao === "reabrir") {
      // Nada se move na tela: o diálogo decide, e a página revalidada traz
      // a verdade. Recusa deixa o cartão onde estava.
      setDialogo({
        tipo: acao === "ganhar" ? "ganho" : acao === "perder" ? "perda" : "reabrir",
        negocio: { id: cartao.id, cliente: cartao.person?.full_name ?? cartao.title },
      });
      return;
    }

    iniciar(async () => {
      moverNaTela({ id: cartao.id, stage_id: etapa.id });

      const formData = new FormData();
      formData.set("id", cartao.id);
      formData.set("stage_id", etapa.id);
      const resultado = await moveOpportunity(formData);
      if (resultado.error) toast.error(resultado.error);
    });
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {etapas.map((etapa) => {
          const daEtapa = visiveis.filter((c) => c.stage_id === etapa.id);
          // Por moeda, e nunca somando uma na outra.
          const soma = formatarPorMoeda(somarItensPorMoeda(daEtapa.flatMap((c) => c.itens)));

          return (
            <section
              key={etapa.id}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-3xl bg-muted/50 p-3 transition-shadow",
                sobre === etapa.id && "ring-2 ring-primary/50",
              )}
              aria-label={`Etapa ${etapa.name}`}
              onDragOver={(evento) => {
                if (!arrastando) return;
                // Sem isto o navegador não deixa soltar aqui.
                evento.preventDefault();
                evento.dataTransfer.dropEffect = "move";
                if (sobre !== etapa.id) setSobre(etapa.id);
              }}
              onDragLeave={(evento) => {
                // Só ao sair da coluna de verdade, não ao passar por um filho.
                if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
                  setSobre(null);
                }
              }}
              onDrop={(evento) => {
                evento.preventDefault();
                const id = evento.dataTransfer.getData("text/plain") || arrastando;
                const cartao = visiveis.find((c) => c.id === id);
                setArrastando(null);
                setSobre(null);
                if (cartao) levar(cartao, etapa.id);
              }}
            >
              <div className="mb-3 px-1">
                <h2 className="flex items-center gap-2 truncate text-sm font-semibold">
                  {etapa.is_won ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                  ) : etapa.is_lost ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
                  ) : null}
                  {etapa.name}
                  {etapa.is_won || etapa.is_lost ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      últimos 30 dias
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {daEtapa.length}
                  {soma ? ` · ${soma}` : ""}
                </p>
              </div>

              <div className="flex-1 space-y-2">
                {daEtapa.length === 0 ? (
                  <EmptyState title="Vazia" size="compact" />
                ) : (
                  daEtapa.map((cartao) => {
                    const endereco = enderecoDoCartao(cartao, etapa);

                    return (
                      <article
                        key={cartao.id}
                        aria-label={cartao.title}
                        draggable
                        onDragStart={(evento) => {
                          evento.dataTransfer.setData("text/plain", cartao.id);
                          evento.dataTransfer.effectAllowed = "move";
                          setArrastando(cartao.id);
                        }}
                        onDragEnd={() => {
                          setArrastando(null);
                          setSobre(null);
                        }}
                        className={cn(
                          "cursor-grab space-y-2 rounded-2xl border bg-card p-3 shadow-sm active:cursor-grabbing",
                          arrastando === cartao.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          {/*
                            Lead abre a tela do lead; ganho, o perfil do
                            cliente. `draggable={false}`: sem isso o navegador
                            arrasta o endereço do link, e não o cartão.
                          */}
                          <Link
                            href={endereco}
                            draggable={false}
                            className="min-w-0 flex-1 text-sm font-medium leading-snug hover:underline"
                          >
                            {cartao.title}
                          </Link>
                          {/* Negócio ganho fica como registro (D12). */}
                          {etapa.is_won ? null : (
                            <ConfirmAction
                              action={deleteOpportunity}
                              hidden={{ id: cartao.id }}
                              title={`Excluir "${cartao.title}"?`}
                              consequence="Oportunidade não tem lixeira: some de vez, com os vistos, a etapa e o histórico de movimentação. O contato permanece."
                              triggerLabel={`Excluir ${cartao.title}`}
                            />
                          )}
                        </div>

                        {cartao.person ? (
                          <Link
                            href={endereco}
                            draggable={false}
                            className="block truncate text-xs text-muted-foreground hover:underline"
                          >
                            {cartao.person.full_name}
                          </Link>
                        ) : null}

                        {/*
                          O cliente disse que fecha: daqui se chega ao link da
                          ficha de cadastro. Em negócio perdido não há o que
                          cadastrar, e o atalho só faria barulho.
                        */}
                        {cartao.person && !etapa.is_lost ? (
                          <AtalhoDaFicha
                            href={
                              // Ganho abre o perfil de cliente, que tem abas:
                              // a âncora vira a aba Dados (D6).
                              etapa.is_won
                                ? enderecoDaPessoa(cartao.person.id, "client", "dados")
                                : `${endereco}#dados-cadastrais`
                            }
                            situacao={cartao.ficha}
                          />
                        ) : null}

                        {/*
                          O Ganho cria um processo por visto. Um só abre
                          direto; vários, a aba Projetos do cliente. Negócio
                          ganho antes disso (sem processo) ainda oferece criar.
                        */}
                        {etapa.is_won && cartao.person ? (
                          cartao.processos.length === 1 ? (
                            <Link
                              href={`/projetos/${cartao.processos[0]}`}
                              draggable={false}
                              className="block text-xs text-primary hover:underline"
                            >
                              Ver processo
                            </Link>
                          ) : cartao.processos.length > 1 ? (
                            <Link
                              href={enderecoDaPessoa(cartao.person.id, "client", "projetos")}
                              draggable={false}
                              className="block text-xs text-primary hover:underline"
                            >
                              Ver processos
                            </Link>
                          ) : (
                            <Link
                              href={`${enderecoDaPessoa(cartao.person.id, "client", "projetos")}&novo-processo=${cartao.id}`}
                              draggable={false}
                              className="block text-xs font-medium text-primary hover:underline"
                            >
                              Criar processo →
                            </Link>
                          )
                        ) : null}

                        {cartao.itens.length > 0 ? (
                          <p className="text-sm font-semibold tabular-nums">
                            {formatarPorMoeda(somarItensPorMoeda(cartao.itens))}
                          </p>
                        ) : null}

                        <MoveCard
                          etapaAtual={cartao.stage_id}
                          etapas={opcoes}
                          aoMover={(etapaId) => levar(cartao, etapaId)}
                        />
                      </article>
                    );
                  })
                )}
              </div>

              {/* Ganho e Perdido não recebem negócio novo: têm porta própria
                  (confirmação, motivo), e criar direto nelas a pulava (G5). */}
              {!etapa.is_won && !etapa.is_lost ? (
                <div className="pt-2">
                  <OpportunityDialog
                    people={pessoas}
                    stages={entrada}
                    defaultStageId={etapa.id}
                    label="Adicionar"
                    variant="ghost"
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {dialogo ? (
        <>
          <DialogoDeGanho
            negocio={dialogo.negocio}
            aberto={dialogo.tipo === "ganho"}
            aoMudar={(aberto) => {
              if (!aberto) setDialogo(null);
            }}
          />
          <DialogoDePerda
            negocio={dialogo.negocio}
            aberto={dialogo.tipo === "perda"}
            aoMudar={(aberto) => {
              if (!aberto) setDialogo(null);
            }}
          />
          <DialogoDeReabrir
            negocio={dialogo.negocio}
            destino={primeiraAberta}
            aberto={dialogo.tipo === "reabrir"}
            aoMudar={(aberto) => {
              if (!aberto) setDialogo(null);
            }}
          />
        </>
      ) : null}
    </>
  );
}
