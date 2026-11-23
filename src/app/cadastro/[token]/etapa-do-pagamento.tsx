"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

import { FormaDePagamentoDoCliente } from "@/components/forma-de-pagamento-do-cliente";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { responderForma } from "@/features/cadastro/publico-actions";
import type { FormaParaOCliente } from "@/lib/forma-do-cliente";

/**
 * O pagamento na mão do cliente (entrega 4b; FIC-8, FIC-9): a forma — a mesma
 * que a equipe aprovou na prévia — e a resposta, Confirmo ou Há algo errado.
 *
 * O cliente vê os vistos, cada parte com o método, o valor (com o dólar de
 * onde veio, quando houver) e todas as datas. Nunca a cotação. Depois da
 * resposta, a frase final leva o nome da organização dona do link: o cliente
 * de um parceiro vê a marca do parceiro.
 *
 * Uma coluna, os botões empilhados no celular de 375 px.
 */
export function EtapaDoPagamento({
  token,
  forma,
  organizacao,
  soPagamento,
}: {
  token: string;
  forma: FormaParaOCliente;
  organizacao: string;
  /** O link só do pagamento: os dados pessoais já chegaram antes. */
  soPagamento: boolean;
}) {
  const [escolha, setEscolha] = useState<"pergunta" | "motivo">("pergunta");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [respondida, setRespondida] = useState<"confirmada" | "recusada" | null>(null);
  const [enviando, iniciar] = useTransition();

  function responder(aceita: boolean) {
    setErro(null);
    iniciar(async () => {
      const { error } = await responderForma(token, aceita, aceita ? "" : motivo);
      if (error) setErro(error);
      else setRespondida(aceita ? "confirmada" : "recusada");
    });
  }

  if (respondida) {
    return (
      <div className="space-y-3 py-6 text-center" role="status">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
        <p className="font-serif text-xl font-medium">
          {respondida === "confirmada"
            ? `Obrigado! A ${organizacao} vai preparar o seu contrato e enviar para assinatura.`
            : `Recebemos. A ${organizacao} vai rever a forma de pagamento e enviar um novo link.`}
        </p>
        <p className="text-sm text-muted-foreground">Você já pode fechar esta página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {soPagamento ? (
        <p className="text-sm font-medium text-success">Seus dados já foram recebidos ✓</p>
      ) : (
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Passo 2 de 2</p>
      )}

      <div className="space-y-1">
        <h2 className="font-serif text-xl font-medium">Forma de pagamento</h2>
        <p className="text-sm text-muted-foreground">
          Confira como vai ser o pagamento. É isto que vai no seu contrato.
        </p>
      </div>

      <FormaDePagamentoDoCliente forma={forma} />

      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      {escolha === "pergunta" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={enviando}
            onClick={() => setEscolha("motivo")}
          >
            Há algo errado
          </Button>
          <Button type="button" className="rounded-xl" disabled={enviando} onClick={() => responder(true)}>
            {enviando ? "Enviando..." : "Confirmo"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="motivo-da-forma">O que está errado? (opcional)</Label>
            <Textarea
              id="motivo-da-forma"
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Conte o que precisa mudar"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={enviando}
              onClick={() => setEscolha("pergunta")}
            >
              Voltar
            </Button>
            <Button type="button" className="rounded-xl" disabled={enviando} onClick={() => responder(false)}>
              {enviando ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
