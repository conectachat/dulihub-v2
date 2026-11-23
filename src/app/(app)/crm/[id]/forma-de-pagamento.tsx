"use client";

import Link from "next/link";
import { MessageCircle, Pencil, RotateCcw, X } from "lucide-react";

import { CopiarTexto } from "@/components/copiar-texto";
import { EmptyState } from "@/components/empty-state";
import { FormDialog } from "@/components/form-dialog";
import { InlineText } from "@/components/inline-text";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  linkDoWhatsApp,
  mensagemDaFormaNoWhatsApp,
  ultimoDiaDoLink,
  urlDaFicha,
} from "@/features/cadastro/regras";
import {
  confirmarFormaPelaEquipe,
  salvarCotacao,
  voltarFormaParaRascunho,
} from "@/features/opportunities/forma-actions";
import {
  avisoDeCoerencia,
  estadoDaForma,
  LIMITES,
  linhaDaParte,
  totalDaForma,
  type EstadoDoCartao,
  type ParteDaForma,
} from "@/features/opportunities/forma-regras";
import type { FormaDoNegocio } from "@/features/opportunities/montagem";
import { ESTADO_INICIAL } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";
import { formaParaOCliente } from "@/lib/forma-do-cliente";
import { formatarData, formatarDiaDaSemana } from "@/lib/formatar";
import { enderecoDaPessoa } from "@/lib/pessoa";

import { EnviarFicha } from "./enviar-ficha";
import { JanelaDaForma } from "./janela-da-forma";

type Item = { visa_name: string; amount: number; currency: string };

/** Como a pessoa digita: vírgula decimal. */
const comoDigitado = (valor: number | null) => (valor === null ? "" : String(valor).replace(".", ","));

/**
 * O cartão "Forma de pagamento" do lead (entregas 4a e 4b; FIC-7 a FIC-13):
 * como o cliente vai pagar, o link da ficha que leva a forma até ele, a
 * resposta dele, e as cobranças que o Ganho cria.
 *
 * Por estado (`estadoDaForma`):
 * - rascunho: Editar, Enviar ficha (qualquer membro) e Confirmar pela equipe;
 * - enviada: o link, com Copiar e WhatsApp, Editar e Cancelar link (os dois
 *   cancelam o link e voltam a forma para rascunho, P4), e Confirmar;
 * - vencida (o link passou do prazo sem resposta): Editar e Confirmar;
 * - recusada: o motivo, e Ajustar;
 * - confirmada: quem confirmou, e Refazer (dono ou gestão).
 *
 * Negócio encerrado, ou com as cobranças já criadas, fica só para leitura —
 * menos a cotação, que é anotação da equipe. Quem decide é o banco (0058,
 * 0064): aqui se decide só o que aparece. O app não gera link de pagamento:
 * o link é o da ficha.
 */
export function CartaoDaFormaDePagamento({
  negocioId,
  pessoaId,
  nomeDaPessoa,
  itens,
  forma,
  aberto,
  podeConfirmar,
  origem,
  ddi,
  telefone,
  jaMandouFicha,
  fichaComumAbertaEm,
  agora = new Date(),
}: {
  negocioId: string;
  pessoaId: string;
  nomeDaPessoa: string;
  itens: Item[];
  forma: FormaDoNegocio | null;
  aberto: boolean;
  podeConfirmar: boolean;
  /** `https://…`, para montar o endereço público do link da ficha. */
  origem: string;
  ddi: string | null;
  telefone: string | null;
  jaMandouFicha: boolean;
  fichaComumAbertaEm: string | null;
  agora?: Date;
}) {
  const estado = forma ? estadoDaForma(forma, agora) : null;
  const editavel = aberto && forma !== null && !forma.charges_created_at;
  const resposta = forma?.ultimaResposta ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Forma de pagamento</CardTitle>
        {forma && estado ? <Selo estado={estado} forma={forma} /> : null}
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {!forma || !estado ? (
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

            {estado === "confirmada" && resposta ? (
              <p className="text-muted-foreground">
                {resposta.decision === "confirmada"
                  ? `Confirmada pelo cliente em ${formatarData(resposta.answered_at)}`
                  : `Confirmada pela equipe em ${formatarData(resposta.answered_at)}` +
                    (resposta.answered_by_name ? `, por ${resposta.answered_by_name}` : "")}
                {resposta.reason ? ` — "${resposta.reason}"` : ""}
              </p>
            ) : null}

            {estado === "recusada" ? (
              <p className="text-muted-foreground">
                {resposta?.reason ? `Motivo: ${resposta.reason}` : "Sem motivo informado."}
              </p>
            ) : null}

            {/* Depois de Ajustar, a recusa continua à vista até o reenvio. */}
            {estado === "rascunho" && resposta?.decision === "recusada" ? (
              <p className="text-muted-foreground">
                {`Recusada pelo cliente em ${formatarData(resposta.answered_at)}`}
                {resposta.reason ? `: ${resposta.reason}` : "."}
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

            {estado === "enviada" && forma.linkAberto && editavel ? (
              <LinkDaFichaAberto
                url={urlDaFicha(origem, forma.linkAberto.token)}
                whatsapp={linkDoWhatsApp(
                  ddi,
                  telefone,
                  mensagemDaFormaNoWhatsApp(
                    nomeDaPessoa,
                    urlDaFicha(origem, forma.linkAberto.token),
                    ultimoDiaDoLink(forma.linkAberto.expires_at),
                  ),
                )}
              />
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
                {estado === "rascunho" ? (
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
                    <EnviarFicha
                      negocioId={negocioId}
                      pessoaId={pessoaId}
                      versao={forma.updated_at}
                      forma={formaParaOCliente(itens, forma.partes)}
                      jaMandouFicha={jaMandouFicha}
                      fichaComumAbertaEm={fichaComumAbertaEm}
                    />
                  </>
                ) : null}

                {estado === "enviada" || estado === "vencida" ? (
                  <>
                    <VoltarParaRascunho
                      negocioId={negocioId}
                      pessoaId={pessoaId}
                      enviadaEm={forma.linkAberto?.created_at ?? null}
                      modo="editar"
                    />
                    {estado === "enviada" ? (
                      <VoltarParaRascunho
                        negocioId={negocioId}
                        pessoaId={pessoaId}
                        enviadaEm={forma.linkAberto?.created_at ?? null}
                        modo="cancelar"
                      />
                    ) : null}
                  </>
                ) : null}

                {estado === "recusada" ? <Ajustar negocioId={negocioId} pessoaId={pessoaId} /> : null}

                {(estado === "rascunho" || estado === "enviada" || estado === "vencida") && podeConfirmar ? (
                  <ConfirmarPelaEquipe
                    negocioId={negocioId}
                    pessoaId={pessoaId}
                    itens={itens}
                    partes={forma.partes}
                    cancelaLink={estado !== "rascunho"}
                  />
                ) : null}

                {estado === "confirmada" && podeConfirmar ? (
                  <Refazer
                    negocioId={negocioId}
                    pessoaId={pessoaId}
                    confirmadaEm={resposta?.answered_at ?? null}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** O selo do cabeçalho: curto, para caber no celular (P6). */
function Selo({ estado, forma }: { estado: EstadoDoCartao; forma: FormaDoNegocio }) {
  const texto =
    estado === "enviada" && forma.linkAberto
      ? `enviada · vale até ${formatarDiaDaSemana(ultimoDiaDoLink(forma.linkAberto.expires_at), "curto")}`
      : estado === "vencida"
        ? "link vencido"
        : estado;
  // O que pede ação (recusa, link vencido) vai no laranja de atenção.
  if (estado === "recusada" || estado === "vencida") {
    return <Badge className="bg-brand text-brand-foreground">{texto}</Badge>;
  }
  return <Badge variant={estado === "confirmada" ? "default" : "secondary"}>{texto}</Badge>;
}

function LinkDaFichaAberto({ url, whatsapp }: { url: string; whatsapp: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      <CopiarTexto texto={url} rotulo="link da ficha">
        Copiar link
      </CopiarTexto>
      {whatsapp ? (
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          {/* Abre a conversa com o texto pronto; quem envia é a equipe. */}
          <a href={whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-1 h-4 w-4 text-primary" />
            WhatsApp
          </a>
        </Button>
      ) : null}
    </div>
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
  cancelaLink,
}: {
  negocioId: string;
  pessoaId: string;
  itens: Item[];
  partes: ParteDaForma[];
  /** Com a forma enviada: o cliente respondeu por fora, e o link deixa de valer. */
  cancelaLink: boolean;
}) {
  const coerencia = avisoDeCoerencia(itens, partes);

  return (
    <FormDialog
      acao={confirmarFormaPelaEquipe}
      titulo="Confirmar a forma de pagamento"
      descricao={
        cancelaLink
          ? "O link enviado ao cliente deixa de valer. Confirmada, a forma e os vistos ficam travados até alguém usar Refazer."
          : "Confirmada, a forma e os vistos ficam travados até alguém usar Refazer."
      }
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

/**
 * Editar e Cancelar link com a forma enviada: os dois cancelam o link e voltam
 * a forma para rascunho (P4). Pergunta antes, porque o cliente pode estar com
 * o link aberto. `FormDialog`, e não `ConfirmAction`, que é o botão de excluir.
 */
function VoltarParaRascunho({
  negocioId,
  pessoaId,
  enviadaEm,
  modo,
}: {
  negocioId: string;
  pessoaId: string;
  enviadaEm: string | null;
  modo: "editar" | "cancelar";
}) {
  const editar = modo === "editar";
  return (
    <FormDialog
      acao={voltarFormaParaRascunho}
      titulo={editar ? "Editar a forma enviada" : "Cancelar o link da ficha"}
      salvar={editar ? "Editar" : "Cancelar link"}
      pendente={editar ? "Abrindo..." : "Cancelando..."}
      gatilho={
        <Button variant="outline" size="sm" className="rounded-xl">
          {editar ? (
            <Pencil className="mr-1 h-4 w-4 text-primary" />
          ) : (
            <X className="mr-1 h-4 w-4 text-primary/60" />
          )}
          {editar ? "Editar" : "Cancelar link"}
        </Button>
      }
    >
      <input type="hidden" name="de" value="enviada" />
      <input type="hidden" name="negocio" value={negocioId} />
      <input type="hidden" name="pessoa" value={pessoaId} />
      <p className="text-sm">
        {enviadaEm
          ? `O link enviado em ${formatarData(enviadaEm)} deixa de valer.`
          : "O link enviado deixa de valer."}
        {editar ? " A forma volta para rascunho, para você mudar e enviar de novo." : " A forma volta para rascunho."}
      </p>
    </FormDialog>
  );
}

/** Ajustar a forma recusada pelo cliente: volta para rascunho, sem perguntar. */
function Ajustar({ negocioId, pessoaId }: { negocioId: string; pessoaId: string }) {
  return (
    <form action={comAviso((formData) => voltarFormaParaRascunho(ESTADO_INICIAL, formData))}>
      <input type="hidden" name="de" value="recusada" />
      <input type="hidden" name="negocio" value={negocioId} />
      <input type="hidden" name="pessoa" value={pessoaId} />
      <SubmitButton
        pendente="Ajustando..."
        size="sm"
        className="rounded-xl"
        icone={<Pencil className="h-4 w-4" />}
      >
        Ajustar
      </SubmitButton>
    </form>
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
      acao={voltarFormaParaRascunho}
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
      <input type="hidden" name="de" value="confirmada" />
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
