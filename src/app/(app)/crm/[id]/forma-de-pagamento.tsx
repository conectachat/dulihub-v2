"use client";

import Link from "next/link";
import { Pencil, RotateCcw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FormDialog } from "@/components/form-dialog";
import { InlineText } from "@/components/inline-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmarFormaPelaEquipe,
  refazerFormaDePagamento,
  salvarCotacao,
} from "@/features/opportunities/forma-actions";
import {
  avisoDeCoerencia,
  LIMITES,
  linhaDaParte,
  totalDaForma,
  type ParteDaForma,
} from "@/features/opportunities/forma-regras";
import type { FormaDoNegocio } from "@/features/opportunities/montagem";
import { formatarData } from "@/lib/formatar";
import { enderecoDaPessoa } from "@/lib/pessoa";

import { JanelaDaForma } from "./janela-da-forma";

type Item = { visa_name: string; amount: number; currency: string };

/** Como a pessoa digita: vírgula decimal. */
const comoDigitado = (valor: number | null) => (valor === null ? "" : String(valor).replace(".", ","));

/**
 * O cartão "Forma de pagamento" do lead (entrega 4a; FIC-7, FIC-10, FIC-11,
 * FIC-12): como o cliente vai pagar, para o contrato e para as cobranças que
 * o Ganho cria.
 *
 * Rascunho se edita; confirmar e refazer são do dono do negócio e da gestão.
 * Negócio encerrado, ou com as cobranças já criadas, fica só para leitura —
 * menos a cotação, que é anotação da equipe. Quem decide é o banco (0058):
 * aqui se decide só o que aparece.
 */
export function CartaoDaFormaDePagamento({
  negocioId,
  pessoaId,
  nomeDaPessoa,
  itens,
  forma,
  aberto,
  podeConfirmar,
}: {
  negocioId: string;
  pessoaId: string;
  nomeDaPessoa: string;
  itens: Item[];
  forma: FormaDoNegocio | null;
  aberto: boolean;
  podeConfirmar: boolean;
}) {
  // Enviada e recusada são da 4b; até lá, valem como rascunho (P9).
  const confirmada = forma?.status === "confirmada";
  const editavel = aberto && forma !== null && !forma.charges_created_at;
  const resposta = confirmada ? (forma?.ultimaResposta ?? null) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Forma de pagamento</CardTitle>
        {forma ? (
          <Badge variant={confirmada ? "default" : "secondary"}>
            {confirmada ? "confirmada" : "rascunho"}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {!forma ? (
          aberto ? (
            <EmptyState
              size="compact"
              title="Nenhuma forma de pagamento ainda."
              hint="Ela vai no contrato e vira as cobranças no Ganho."
              action={
                <JanelaDaForma
                  negocioId={negocioId}
                  nomeDaPessoa={nomeDaPessoa}
                  itens={itens}
                  partes={[]}
                  gatilho={
                    <Button size="sm" className="mt-3 rounded-xl">
                      Definir forma de pagamento
                    </Button>
                  }
                />
              }
            />
          ) : (
            <EmptyState size="compact" title="Sem forma de pagamento." />
          )
        ) : (
          <>
            <ResumoDasPartes partes={forma.partes} />

            {resposta ? (
              <p className="text-muted-foreground">
                {`Confirmada pela equipe em ${formatarData(resposta.answered_at)}`}
                {resposta.answered_by_name ? `, por ${resposta.answered_by_name}` : ""}
                {resposta.reason ? ` — "${resposta.reason}"` : ""}
              </p>
            ) : null}

            {forma.charges_created_at ? (
              <Link
                href={enderecoDaPessoa(pessoaId, "client", "financeiro")}
                className="block text-primary hover:underline"
              >
                Cobranças criadas no Ganho em {formatarData(forma.charges_created_at)}
              </Link>
            ) : null}

            <div className="space-y-1 border-t pt-3">
              <p className="text-xs text-muted-foreground">Cotação usada (C6), só a equipe vê</p>
              <div className="grid grid-cols-2 gap-2">
                <InlineText
                  action={salvarCotacao}
                  name="reference_rate"
                  value={comoDigitado(forma.reference_rate)}
                  hidden={{ plano: forma.id, negocio: negocioId }}
                  label="Cotação usada (C6)"
                  placeholder="5,4321"
                  inputMode="decimal"
                  required={false}
                />
                <InlineText
                  action={salvarCotacao}
                  name="reference_rate_note"
                  value={forma.reference_rate_note ?? ""}
                  hidden={{ plano: forma.id, negocio: negocioId }}
                  label="Anotação da cotação"
                  placeholder="C6, 21/nov"
                  required={false}
                />
              </div>
            </div>

            {editavel ? (
              <div className="flex flex-wrap justify-end gap-2">
                {confirmada ? (
                  podeConfirmar ? (
                    <Refazer
                      negocioId={negocioId}
                      pessoaId={pessoaId}
                      confirmadaEm={forma.ultimaResposta?.answered_at ?? null}
                    />
                  ) : null
                ) : (
                  <>
                    <JanelaDaForma
                      negocioId={negocioId}
                      nomeDaPessoa={nomeDaPessoa}
                      itens={itens}
                      partes={forma.partes}
                      gatilho={
                        <Button variant="outline" size="sm" className="rounded-xl">
                          <Pencil className="mr-1 h-4 w-4 text-primary" />
                          Editar
                        </Button>
                      }
                    />
                    {podeConfirmar ? (
                      <ConfirmarPelaEquipe
                        negocioId={negocioId}
                        pessoaId={pessoaId}
                        itens={itens}
                        partes={forma.partes}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ResumoDasPartes({ partes }: { partes: ParteDaForma[] }) {
  if (partes.length === 0) {
    return <p className="text-muted-foreground">Nenhuma parte ainda.</p>;
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {partes.map((parte, i) => (
          <li key={i}>{linhaDaParte(parte)}</li>
        ))}
      </ul>
      <p className="font-medium">{`Total: ${totalDaForma(partes)}`}</p>
    </div>
  );
}

function ConfirmarPelaEquipe({
  negocioId,
  pessoaId,
  itens,
  partes,
}: {
  negocioId: string;
  pessoaId: string;
  itens: Item[];
  partes: ParteDaForma[];
}) {
  const coerencia = avisoDeCoerencia(itens, partes);

  return (
    <FormDialog
      acao={confirmarFormaPelaEquipe}
      titulo="Confirmar a forma de pagamento"
      descricao="Confirmada, a forma e os vistos ficam travados até alguém usar Refazer."
      salvar="Confirmar"
      pendente="Confirmando..."
      gatilho={
        <Button size="sm" className="rounded-xl">
          Confirmar pela equipe
        </Button>
      }
    >
      <input type="hidden" name="negocio" value={negocioId} />
      <input type="hidden" name="pessoa" value={pessoaId} />
      <ResumoDasPartes partes={partes} />
      {coerencia ? <p className="text-sm text-warning">{coerencia}</p> : null}
      <div className="space-y-2">
        <Label htmlFor="forma-observacao">Observação (opcional)</Label>
        <Textarea
          id="forma-observacao"
          name="observacao"
          maxLength={LIMITES.observacao}
          placeholder="Como foi acertado com o cliente"
        />
      </div>
    </FormDialog>
  );
}

function Refazer({
  negocioId,
  pessoaId,
  confirmadaEm,
}: {
  negocioId: string;
  pessoaId: string;
  confirmadaEm: string | null;
}) {
  return (
    <FormDialog
      acao={refazerFormaDePagamento}
      titulo="Refazer a forma de pagamento"
      salvar="Refazer"
      pendente="Refazendo..."
      gatilho={
        <Button variant="outline" size="sm" className="rounded-xl">
          <RotateCcw className="mr-1 h-4 w-4 text-primary" />
          Refazer
        </Button>
      }
    >
      <input type="hidden" name="negocio" value={negocioId} />
      <input type="hidden" name="pessoa" value={pessoaId} />
      <p className="text-sm">
        {confirmadaEm
          ? `A forma volta para rascunho. A confirmação de ${formatarData(confirmadaEm)} continua registrada.`
          : "A forma volta para rascunho."}
      </p>
    </FormDialog>
  );
}
