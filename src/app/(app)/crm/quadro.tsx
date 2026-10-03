"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import type { SituacaoDaFicha } from "@/features/cadastro/regras";
import { deleteOpportunity, moveOpportunity } from "@/features/opportunities/actions";
import type { Stage } from "@/features/opportunities/queries";
import { aoSoltar, enderecoDoCartao } from "@/features/opportunities/regras";
import { formatarMoeda, formatarPorMoeda, somarPorMoeda } from "@/lib/totals";
import { cn } from "@/lib/utils";

import { AtalhoDaFicha } from "./atalho-da-ficha";
import { DialogoDeGanho, DialogoDePerda, type NegocioDoDialogo } from "./dialogos";
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
 * Os dois passam por `levar`, e é ali que mora a regra: Ganho pede a
 * confirmação, Perdido pede o motivo, e nenhum dos dois move direto
 * (`aoSoltar`).
 */

export type CartaoDoQuadro = {
  id: string;
  title: string;
  value: number | null;
  currency: string;
  stage_id: string;
  person: { id: string; full_name: string } | null;
  /** Processo nascido deste negócio — decide o atalho na coluna de Ganho. */
  processoId: string | null;
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
    { tipo: "ganho" | "perda"; negocio: NegocioDoDialogo } | null
  >(null);

  const opcoes = etapas.map((e) => ({ id: e.id, name: e.name }));

  /** Leva o cartão para a etapa — por arrastar ou pelo seletor. */
  function levar(cartao: CartaoDoQuadro, etapaId: string) {
    const etapa = etapas.find((e) => e.id === etapaId);
    if (!etapa) return;

    const acao = aoSoltar(cartao, etapa);
    if (acao === "nada") return;

    if (acao === "ganhar" || acao === "perder") {
      setDialogo({
        tipo: acao === "ganhar" ? "ganho" : "perda",
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
          const soma = formatarPorMoeda(somarPorMoeda(daEtapa));

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
                          <ConfirmAction
                            action={deleteOpportunity}
                            hidden={{ id: cartao.id }}
                            title={`Excluir "${cartao.title}"?`}
                            consequence="Oportunidade não tem lixeira: some de vez, com valor, etapa e histórico de movimentação. O contato permanece."
                            triggerLabel={`Excluir ${cartao.title}`}
                          />
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
                            href={`${endereco}#dados-cadastrais`}
                            situacao={cartao.ficha}
                          />
                        ) : null}

                        {/*
                          Ganho oferece o processo, não cria: o Renato escolhe
                          o visto e o título na ficha, onde o processo nasce.
                        */}
                        {etapa.is_won && cartao.person ? (
                          cartao.processoId ? (
                            <Link
                              href={`/projetos/${cartao.processoId}`}
                              draggable={false}
                              className="block text-xs text-primary hover:underline"
                            >
                              Ver processo
                            </Link>
                          ) : (
                            <Link
                              href={`/contatos/${cartao.person.id}?novo-processo=${cartao.id}`}
                              draggable={false}
                              className="block text-xs font-medium text-primary hover:underline"
                            >
                              Criar processo →
                            </Link>
                          )
                        ) : null}

                        {cartao.value != null ? (
                          <p className="text-sm font-semibold tabular-nums">
                            {formatarMoeda(cartao.value, cartao.currency)}
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

              <div className="pt-2">
                <OpportunityDialog
                  people={pessoas}
                  stages={opcoes}
                  defaultStageId={etapa.id}
                  label="Adicionar"
                  variant="ghost"
                />
              </div>
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
        </>
      ) : null}
    </>
  );
}
