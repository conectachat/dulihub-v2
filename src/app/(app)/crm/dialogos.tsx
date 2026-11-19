"use client";

import { useEffect, useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ganharOportunidade,
  perderOportunidade,
  reabrirOportunidade,
  resumoDoGanho,
} from "@/features/opportunities/actions";
import { MOTIVOS_DE_PERDA, motivoDaPerda } from "@/features/opportunities/regras";
import type { ResumoDoGanho } from "@/features/opportunities/schema";
import { ESTADO_INICIAL } from "@/lib/action-state";
import { formatarMoeda, somarItensPorMoeda } from "@/lib/totals";

/**
 * As duas saídas do funil, com a pergunta que cada uma exige.
 *
 * Controlados de fora (`aberto`/`aoMudar`) porque abrem por dois caminhos: o
 * botão da tela do lead e o cartão solto na coluna do quadro. O diálogo é o
 * mesmo — arrastar não pode pular a confirmação nem o motivo.
 */

export type NegocioDoDialogo = { id: string; cliente: string };

/**
 * Ganho: o contrato foi assinado.
 *
 * Antes de gravar, o resumo (CRM-14): os vistos e o total por moeda, a forma
 * de pagamento e o que vai acontecer — quem vira cliente, os processos e as
 * cobranças. Ele vem de `ganhar_negocio` com `p_simular`, a mesma função que
 * grava: o que a tela promete é o que acontece. Recusa (sem visto, CRM-10…)
 * aparece no lugar do resumo, sem Confirmar.
 */
export function DialogoDeGanho({
  negocio,
  aberto,
  aoMudar,
}: {
  negocio: NegocioDoDialogo;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
}) {
  const [carregado, setCarregado] = useState<{
    id: string;
    resumo: ResumoDoGanho | null;
    erro: string | null;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // O resumo é pedido ao abrir; o estado só muda depois da resposta.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    resumoDoGanho(negocio.id)
      .then(({ resumo, error }) => {
        if (vivo) setCarregado({ id: negocio.id, resumo, erro: error });
      })
      .catch(() => {
        if (vivo) {
          setCarregado({
            id: negocio.id,
            resumo: null,
            erro: "Não foi possível montar o resumo. Tente de novo.",
          });
        }
      });
    return () => {
      vivo = false;
    };
  }, [aberto, negocio.id]);

  const atual = carregado?.id === negocio.id ? carregado : null;
  const resumo = atual?.resumo ?? null;

  async function confirmar(formData: FormData) {
    setErro(null);
    // No sucesso a ação redireciona para o perfil do cliente e não volta.
    const resultado = await ganharOportunidade(formData);
    if (resultado?.error) setErro(resultado.error);
  }

  // Todo fechamento passa por aqui — Cancelar inclusive. O Radix só avisa o
  // fechamento dele (X, Esc, clique fora); sem isto, o diálogo reaberto
  // mostraria o resumo velho, com Confirmar ativo, até chegar o novo.
  function fechar() {
    setErro(null);
    setCarregado(null);
    aoMudar(false);
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => (proximo ? aoMudar(true) : fechar())}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ganhar negócio — {resumo?.pessoa.nome ?? negocio.cliente}</DialogTitle>
          <DialogDescription>Use quando o contrato estiver assinado.</DialogDescription>
        </DialogHeader>

        {!atual ? (
          <p className="text-sm text-muted-foreground">Montando o resumo...</p>
        ) : resumo ? (
          <ResumoDoGanhoNaTela resumo={resumo} />
        ) : (
          <FieldError mensagem={atual.erro} />
        )}

        <FieldError mensagem={erro} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          {resumo ? (
            <form action={confirmar}>
              <input type="hidden" name="id" value={negocio.id} />
              <SubmitButton pendente="Gravando...">Confirmar Ganho</SubmitButton>
            </form>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumoDoGanhoNaTela({ resumo }: { resumo: ResumoDoGanho }) {
  const totais = Object.entries(somarItensPorMoeda(resumo.itens)).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const { processos } = resumo;

  return (
    <div className="space-y-4 text-sm">
      <section className="space-y-1">
        <h3 className="text-xs text-muted-foreground">Vistos</h3>
        <ul className="space-y-1">
          {resumo.itens.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>{item.visa_name}</span>
              <span className="tabular-nums">{formatarMoeda(item.amount, item.currency)}</span>
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Totais por moeda" className="border-t pt-1">
          {totais.map(([moeda, valor]) => (
            <p key={moeda} className="flex justify-between gap-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatarMoeda(valor, moeda)}</span>
            </p>
          ))}
        </div>
      </section>

      {/* Entrega 4: a forma de pagamento da ficha, e as cobranças dela. */}
      <p>Forma de pagamento: definir na aba Financeiro</p>

      <section className="space-y-1">
        <h3 className="text-xs text-muted-foreground">Ao confirmar</h3>
        <ul className="list-disc space-y-1 pl-5">
          {resumo.pessoa.vira_cliente ? <li>{resumo.pessoa.nome} passa a ser cliente</li> : null}
          <li>
            {processos.length === 0
              ? "Nenhum processo novo."
              : processos.length === 1
                ? `Será criado 1 processo: ${processos[0]!.titulo}`
                : `Serão criados ${processos.length} processos: ${processos
                    .map((p) => p.titulo)
                    .join("; ")}`}
          </li>
          <li>Nenhuma cobrança será criada.</li>
          {resumo.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Reabrir um negócio ganho (CRM-15): volta para a primeira etapa aberta, sem
 * tocar na pessoa nem nos processos. Pede confirmação também no quadro —
 * arrastar o cartão para fora do Ganho não reabre sozinho. Só o dono do
 * negócio ou a gestão conseguem; a recusa aparece aqui.
 */
export function DialogoDeReabrir({
  negocio,
  destino,
  aberto,
  aoMudar,
}: {
  negocio: NegocioDoDialogo;
  /** A primeira etapa aberta do funil, para onde o negócio volta (D7). */
  destino: string;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar(formData: FormData) {
    setErro(null);
    const resultado = await reabrirOportunidade(formData);
    if (resultado.error) {
      setErro(resultado.error);
      return;
    }
    fechar();
  }

  // Todo fechamento limpa a recusa: reaberto, o diálogo começa do zero.
  function fechar() {
    setErro(null);
    aoMudar(false);
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => (proximo ? aoMudar(true) : fechar())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir este negócio?</DialogTitle>
          <DialogDescription>Ele volta para {destino}.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {negocio.cliente} continua cliente, e os processos continuam onde estão.
        </p>

        <FieldError mensagem={erro} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <form action={confirmar}>
            <input type="hidden" name="id" value={negocio.id} />
            <SubmitButton pendente="Reabrindo...">Reabrir</SubmitButton>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Perdido: pede o motivo, que fica no negócio e no histórico. */
export function DialogoDePerda({
  negocio,
  aberto,
  aoMudar,
}: {
  negocio: NegocioDoDialogo;
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como perdido</DialogTitle>
          <DialogDescription>
            O negócio de {negocio.cliente} vai para a coluna de perda. Dá para
            reabrir depois.
          </DialogDescription>
        </DialogHeader>

        {/* O Radix desmonta o conteúdo ao fechar: os campos voltam limpos. */}
        <FormularioDaPerda negocioId={negocio.id} aoFechar={() => aoMudar(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormularioDaPerda({
  negocioId,
  aoFechar,
}: {
  negocioId: string;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  // `onSubmit`, e não `<form action>`: o React limpa o formulário depois que
  // a ação roda, e uma recusa do servidor apagaria o motivo escolhido — o
  // seletor voltaria a "Selecione" com o estado ainda dizendo outra coisa.
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    // A mesma regra do servidor, antes: o erro aparece sem ida e volta.
    const validado = motivoDaPerda(motivo, detalhe);
    if (!validado.ok) {
      setErro(validado.erro);
      return;
    }

    setErro(null);
    const formData = new FormData(evento.currentTarget);
    iniciar(async () => {
      const resultado = await perderOportunidade(ESTADO_INICIAL, formData);
      if (resultado.error) setErro(resultado.error);
      else aoFechar();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <input type="hidden" name="id" value={negocioId} />

      <div className="space-y-2">
        <Label htmlFor="motivo">Motivo *</Label>
        <NativeSelect
          id="motivo"
          name="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        >
          <option value="">Selecione</option>
          {Object.entries(MOTIVOS_DE_PERDA).map(([codigo, rotulo]) => (
            <option key={codigo} value={codigo}>
              {rotulo}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="detalhe">
          Detalhe{motivo === "outro" ? " *" : " (opcional)"}
        </Label>
        <Textarea
          id="detalhe"
          name="detalhe"
          rows={3}
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
          placeholder="O que aconteceu?"
        />
      </div>

      <FieldError mensagem={erro} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Gravando..." : "Marcar como perdido"}
        </Button>
      </DialogFooter>
    </form>
  );
}
