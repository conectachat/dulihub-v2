"use client";

import { Send } from "lucide-react";

import { FormaDePagamentoDoCliente } from "@/components/forma-de-pagamento-do-cliente";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { enviarFormaDePagamento } from "@/features/opportunities/forma-actions";
import { avisoDeVencidas } from "@/features/opportunities/forma-regras";
import type { FormaParaOCliente } from "@/lib/forma-do-cliente";
import { formatarData, hojeEmSaoPaulo } from "@/lib/formatar";

/**
 * "Enviar ficha" com a forma de pagamento (entrega 4b, FIC-7): a prévia e, só
 * depois de "Confirmar e gerar link", o link.
 *
 * A prévia desenha com `FormaDePagamentoDoCliente`, o mesmo componente da
 * ficha pública: a equipe aprova exatamente o que o cliente vai ler. A
 * `versao` é o `updated_at` da forma como veio do banco — se alguém salvou
 * depois de a prévia abrir, o banco recusa e o link não sai (P17: a versão
 * cobre a forma; os vistos travam a partir do envio).
 *
 * Depois do envio o diálogo fecha, e o cartão mostra o link com Copiar e
 * WhatsApp (P5).
 */
export function EnviarFicha({
  negocioId,
  pessoaId,
  versao,
  forma,
  jaMandouFicha,
  fichaComumAbertaEm,
}: {
  negocioId: string;
  pessoaId: string;
  versao: string;
  forma: FormaParaOCliente;
  /** Já mandou alguma ficha: o link sai só com o pagamento, salvo a caixa (P12). */
  jaMandouFicha: boolean;
  /** A ficha comum aberta, que o envio cancela: o `created_at` dela. */
  fichaComumAbertaEm: string | null;
}) {
  const vencidas = avisoDeVencidas(forma.partes, hojeEmSaoPaulo());

  return (
    <FormDialog
      acao={enviarFormaDePagamento}
      titulo="Enviar a ficha com a forma de pagamento"
      descricao="É isto que o cliente vai ver. O link vale 3 dias úteis."
      salvar="Confirmar e gerar link"
      pendente="Gerando..."
      gatilho={
        <Button size="sm" className="rounded-xl">
          <Send className="mr-1 h-4 w-4" />
          Enviar ficha
        </Button>
      }
    >
      <input type="hidden" name="negocio" value={negocioId} />
      <input type="hidden" name="pessoa" value={pessoaId} />
      <input type="hidden" name="versao" value={versao} />

      <FormaDePagamentoDoCliente forma={forma} />

      {vencidas ? <p className="text-sm text-warning">{vencidas}</p> : null}
      {fichaComumAbertaEm ? (
        <p className="text-sm text-warning">
          {`O link da ficha enviado em ${formatarData(fichaComumAbertaEm)} deixa de valer.`}
        </p>
      ) : null}

      {jaMandouFicha ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="pedir_dados_de_novo" className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            Pedir os dados pessoais de novo
            <span className="block text-xs text-muted-foreground">
              O cliente já mandou a ficha. Sem marcar, o link vai direto ao pagamento.
            </span>
          </span>
        </label>
      ) : null}
    </FormDialog>
  );
}
