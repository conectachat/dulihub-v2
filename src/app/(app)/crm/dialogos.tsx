"use client";

import { useState, useTransition } from "react";

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
} from "@/features/opportunities/actions";
import { MOTIVOS_DE_PERDA, motivoDaPerda } from "@/features/opportunities/regras";
import { ESTADO_INICIAL } from "@/lib/action-state";

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
 * A consequência é dita por extenso porque não tem volta: o contato vira
 * cliente, e reabrir o negócio depois não o faz voltar a ser lead.
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
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar(formData: FormData) {
    setErro(null);
    // No sucesso a ação redireciona para o perfil do cliente e não volta.
    const resultado = await ganharOportunidade(formData);
    if (resultado?.error) setErro(resultado.error);
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        aoMudar(proximo);
        if (!proximo) setErro(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como ganho?</DialogTitle>
          <DialogDescription>
            Use quando o contrato estiver assinado. {negocio.cliente} passa a ser
            cliente — com processos e financeiro — e não volta a ser lead, mesmo
            que o negócio seja reaberto depois.
          </DialogDescription>
        </DialogHeader>

        <FieldError mensagem={erro} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <form action={confirmar}>
            <input type="hidden" name="id" value={negocio.id} />
            <SubmitButton pendente="Gravando...">Marcar como ganho</SubmitButton>
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
