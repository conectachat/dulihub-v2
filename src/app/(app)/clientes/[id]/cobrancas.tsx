"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, Download, Paperclip, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { FormDialog } from "@/components/form-dialog";
import { InlineText } from "@/components/inline-text";
import { NativeSelect } from "@/components/native-select";
import { SeloPendente } from "@/components/selo-pendente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  anexar,
  anexosDasParcelas,
  enderecoDoAnexo,
  removerAnexo,
  TIPOS_DE_ANEXO,
  type Anexo,
} from "@/features/financeiro/anexos";
import {
  cobrancasDoContato,
  type Cobranca,
} from "@/features/financeiro/consultas-locais";
import {
  criarCobranca,
  darBaixa,
  desfazerBaixa,
  excluirCobranca,
  mudarVencimento,
  renomearCobranca,
} from "@/features/financeiro/escritas-locais";
import { METODOS, ROTULO_DO_METODO } from "@/lib/parcelas";
import { situacaoDaParcela, totaisPorMoeda } from "@/features/financeiro/regras";
import { falhou, type ActionState } from "@/lib/action-state";
import { abrirEmNovaAba, baixar } from "@/lib/abrir";
import { ACEITOS } from "@/lib/arquivos";
import { comPrazo } from "@/lib/com-prazo";
import { formatarDia, hojeEmSaoPaulo } from "@/lib/formatar";
import { useSincronia } from "@/lib/local/estado";
import { bancoDoUsuario, filaDoUsuario, sincronizarAgora } from "@/lib/local/sincronizador";
import { createClient } from "@/lib/supabase/client";
import { useUsuarioLocal } from "@/lib/local/usuario";
import { formatarMoeda } from "@/lib/totals";
import { cn } from "@/lib/utils";

/**
 * O que o cliente deve, dentro da ficha dele.
 *
 * Lê do aparelho, como a Configuração: com ou sem internet é o mesmo
 * caminho, e o que foi gravado aqui aparece na hora, marcado até o servidor
 * confirmar.
 *
 * Nenhum total vem do banco — todos saem das parcelas, pela mesma função que
 * o teste cobre. No app antigo os saldos eram colunas mantidas por gatilho, e
 * divergiam do que as parcelas diziam.
 */

const PARCELAS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24];

/** Quanto a aba espera a sincronia antes de mostrar o que está no aparelho. */
const PRAZO_DA_SINCRONIA = 5000;

/**
 * Contratado, pago, saldo devedor e vencido, um bloco por moeda (CLI-5).
 * Real e dólar nunca se somam: não há cotação que valha para o contrato
 * inteiro.
 */
function Totais({ cobrancas, hoje }: { cobrancas: Cobranca[]; hoje: string }) {
  const totais = Object.entries(totaisPorMoeda(cobrancas, hoje));
  if (totais.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {totais.map(([moeda, t]) => (
        <div
          key={moeda}
          role="group"
          aria-label={`Totais em ${moeda}`}
          className="rounded-2xl border p-3"
        >
          <p className="text-xs font-medium text-muted-foreground">{moeda}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Contratado</dt>
              <dd className="font-medium">{formatarMoeda(t.contratado, moeda)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pago</dt>
              <dd className="font-medium text-success">{formatarMoeda(t.pago, moeda)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Saldo devedor</dt>
              <dd className="font-medium">{formatarMoeda(t.saldo, moeda)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vencido</dt>
              <dd className={cn("font-medium", t.vencido > 0 && "text-destructive")}>
                {formatarMoeda(t.vencido, moeda)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

/**
 * Dar baixa numa parcela.
 *
 * Pede a data — quase nunca é hoje, e a data certa é o que faz o fechamento
 * do mês bater — e, em dólar, a cotação, opcional: o dinheiro pode ficar em
 * dólar e ser convertido depois (24/nov). Digitada, e não buscada: a baixa
 * pode acontecer sem internet, e é esse o ponto.
 */
function Baixa({
  parcela,
  moeda,
}: {
  parcela: Cobranca["parcelas"][number];
  moeda: string;
}) {
  return (
    <FormDialog
      acao={darBaixa}
      titulo={`Dar baixa na parcela ${parcela.number}`}
      descricao="A data é a do dinheiro na conta, não a de hoje."
      gatilho={
        <Button variant="outline" size="sm" className="rounded-xl">
          Dar baixa
        </Button>
      }
      salvar="Confirmar recebimento"
      pendente="Gravando..."
    >
      <input type="hidden" name="id" value={parcela.id} />
      <input type="hidden" name="moeda" value={moeda} />

      <div className="space-y-1">
        <Label htmlFor={`baixa-data-${parcela.id}`}>Data do pagamento</Label>
        <Input
          id={`baixa-data-${parcela.id}`}
          name="paid_on"
          type="date"
          defaultValue={hojeEmSaoPaulo()}
          required
          className="rounded-xl"
        />
      </div>

      {moeda === "BRL" ? null : (
        <div className="space-y-1">
          <Label htmlFor={`baixa-cotacao-${parcela.id}`}>
            Cotação do dólar (opcional)
          </Label>
          {/* Sempre vazio (Renato, 24/nov): uma cotação sugerida seria
              gravada sem ninguém confirmar. */}
          <Input
            id={`baixa-cotacao-${parcela.id}`}
            name="paid_rate"
            inputMode="decimal"
            placeholder="Ex.: 5,42"
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Deixe em branco se o dinheiro ficou em dólar. Com a cotação, a parcela entra no
            recebido em reais.
          </p>
        </div>
      )}
    </FormDialog>
  );
}

/**
 * O cliente combinou pagar depois (24/nov): a parcela em aberto muda de
 * vencimento, e o histórico guarda a data de antes.
 */
function MudarVencimento({ parcela }: { parcela: Cobranca["parcelas"][number] }) {
  return (
    <FormDialog
      acao={mudarVencimento}
      titulo={`Mudar o vencimento da parcela ${parcela.number}`}
      descricao="Para o pagamento combinado com o cliente. O histórico guarda a data de antes."
      gatilho={
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          aria-label={`Mudar vencimento da parcela ${parcela.number}`}
        >
          <CalendarClock className="mr-1 h-4 w-4 text-primary" />
          Mudar vencimento
        </Button>
      }
    >
      <input type="hidden" name="id" value={parcela.id} />
      <div className="space-y-1">
        <Label htmlFor={`vencimento-${parcela.id}`}>Novo vencimento</Label>
        <Input
          id={`vencimento-${parcela.id}`}
          name="due_on"
          type="date"
          defaultValue={parcela.due_on}
          required
          className="rounded-xl"
        />
      </div>
    </FormDialog>
  );
}

function Situacao({ parcela, hoje }: { parcela: Cobranca["parcelas"][number]; hoje: string }) {
  const situacao = situacaoDaParcela(parcela, hoje);

  if (situacao === "paga") {
    return (
      <span className="text-xs font-medium text-success">
        Pago {parcela.paid_on ? `em ${formatarDia(parcela.paid_on)}` : ""}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "text-xs font-medium",
        situacao === "vencida" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {situacao === "vencida" ? "Vencida" : "Vence"} {formatarDia(parcela.due_on)}
    </span>
  );
}

function Cabecalho({ cobranca }: { cobranca: Cobranca }) {
  const { resumo, currency } = cobranca;
  const desconto = cobranca.list_amount ? cobranca.list_amount - cobranca.amount : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
      <span>
        Total <strong className="text-foreground">{formatarMoeda(resumo.total, currency)}</strong>
      </span>
      <span>
        Pago <strong className="text-success">{formatarMoeda(resumo.pago, currency)}</strong>
      </span>
      <span>
        Em aberto <strong className="text-foreground">{formatarMoeda(resumo.aberto, currency)}</strong>
      </span>
      {resumo.vencido > 0 ? (
        <span className="text-destructive">
          Vencido <strong>{formatarMoeda(resumo.vencido, currency)}</strong>
        </span>
      ) : null}
      {desconto > 0 ? <span>Desconto de {formatarMoeda(desconto, currency)}</span> : null}
    </div>
  );
}

function NovaCobranca({ personId }: { personId: string }) {
  return (
    <FormDialog
      acao={criarCobranca}
      titulo="Nova cobrança"
      descricao="O valor combinado com o cliente e em quantas vezes ele paga. As parcelas são geradas na hora."
      gatilho={
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Nova cobrança
        </Button>
      }
      salvar="Criar cobrança"
      pendente="Criando..."
    >
      <input type="hidden" name="person_id" value={personId} />

      <div className="space-y-1">
        <Label htmlFor="cobranca-title">O que está sendo cobrado</Label>
        <Input
          id="cobranca-title"
          name="title"
          placeholder="Ex.: EB-1A — honorários"
          required
          className="rounded-xl"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-1">
          <Label htmlFor="cobranca-amount">Valor cobrado</Label>
          <Input
            id="cobranca-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cobranca-currency">Moeda</Label>
          <NativeSelect id="cobranca-currency" name="currency" defaultValue="BRL">
            <option value="BRL">R$</option>
            <option value="USD">US$</option>
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="cobranca-list">Valor de tabela (opcional)</Label>
        <Input
          id="cobranca-list"
          name="list_amount"
          inputMode="decimal"
          placeholder="Só se houve desconto"
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          O desconto é a diferença entre este e o valor cobrado.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
        <div className="space-y-1">
          <Label htmlFor="cobranca-qtd">Parcelas</Label>
          <NativeSelect id="cobranca-qtd" name="quantidade" defaultValue="1">
            {PARCELAS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "À vista" : `${n}x`}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cobranca-venc">Primeiro vencimento</Label>
          <Input
            id="cobranca-venc"
            name="primeiro_vencimento"
            type="date"
            defaultValue={hojeEmSaoPaulo()}
            required
            className="rounded-xl"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cobranca-entrada">Entrada (opcional)</Label>
          <Input
            id="cobranca-entrada"
            name="entrada"
            inputMode="decimal"
            placeholder="Valor da primeira parcela"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cobranca-metodo">Forma de pagamento</Label>
          <NativeSelect id="cobranca-metodo" name="method" defaultValue="pix">
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {ROTULO_DO_METODO[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ anexos
//
// Boleto, nota fiscal e comprovante da parcela (CLI-6). Fora do espelho: vão
// direto do navegador ao servidor, só com internet (exceção registrada no
// AGENTS.md). A lista vem numa consulta só, para todas as parcelas da aba.

/** Os anexos das parcelas, lidos do servidor quando há rede. */
function useAnexos(parcelas: string[], ligado: boolean) {
  const chave = parcelas.join(",");
  const [lido, setLido] = useState<{ chave: string; anexos: Anexo[] } | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!ligado) return;
    let vivo = true;
    void anexosDasParcelas(createClient(), chave ? chave.split(",") : []).then(
      ({ anexos, error }) => {
        if (!vivo) return;
        if (error) toast.error(error);
        setLido({ chave, anexos });
      },
    );
    return () => {
      vivo = false;
    };
  }, [chave, ligado, versao]);

  return {
    anexos: lido && lido.chave === chave ? lido.anexos : null,
    recarregar: () => setVersao((v) => v + 1),
  };
}

function LinhaDoAnexo({ anexo, aoMudar }: { anexo: Anexo; aoMudar: () => void }) {
  const tipo = TIPOS_DE_ANEXO.find((t) => t.valor === anexo.kind)?.rotulo ?? "Anexo";

  async function abrir(paraBaixar: boolean) {
    const obter = () => enderecoDoAnexo(createClient(), anexo, paraBaixar);
    const ok = paraBaixar ? await baixar(obter) : await abrirEmNovaAba(obter);
    if (!ok) toast.error("Não foi possível abrir o anexo.");
  }

  async function remover(): Promise<ActionState> {
    const r = await removerAnexo(createClient(), anexo.id);
    if (!r.error) aoMudar();
    return r;
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-xs">
      <Paperclip className="h-3 w-3 shrink-0 text-primary" />
      <span className="text-muted-foreground">{tipo}:</span>
      <button type="button" onClick={() => void abrir(false)} className="truncate hover:underline">
        {anexo.filename}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-full text-primary"
        aria-label={`Baixar ${anexo.filename}`}
        onClick={() => void abrir(true)}
      >
        <Download className="h-3 w-3" />
      </Button>
      <ConfirmAction
        action={remover}
        hidden={{ id: anexo.id }}
        title={`Remover “${anexo.filename}”?`}
        consequence="O arquivo sai do depósito. Não dá para desfazer."
        confirmLabel="Remover o anexo"
        triggerLabel={`Remover ${anexo.filename}`}
      />
    </span>
  );
}

function Anexar({
  cobranca,
  parcela,
  aoMudar,
}: {
  cobranca: Cobranca;
  parcela: Cobranca["parcelas"][number];
  aoMudar: () => void;
}) {
  async function enviar(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return falhou("Escolha o arquivo.");

    const r = await anexar(createClient(), {
      // A organização da cobrança é a da parcela (chave composta).
      organizacao: cobranca.organization_id,
      pessoa: cobranca.person_id,
      cobranca: cobranca.id,
      parcela: parcela.id,
      tipo: String(formData.get("kind") ?? "outro"),
      arquivo,
    });
    if (!r.error) aoMudar();
    return r;
  }

  return (
    <FormDialog
      acao={enviar}
      titulo={`Anexar à parcela ${parcela.number}`}
      descricao="Boleto, nota fiscal / invoice ou comprovante. PDF, imagem, Word ou Excel, até 20 MB."
      gatilho={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-xl px-2 text-xs text-primary"
          aria-label={`Anexar à parcela ${parcela.number}`}
        >
          <Paperclip className="mr-1 h-3 w-3" />
          Anexar
        </Button>
      }
      salvar="Anexar"
      pendente="Enviando..."
    >
      <div className="space-y-1">
        <Label htmlFor={`anexo-tipo-${parcela.id}`}>Tipo</Label>
        <NativeSelect
          id={`anexo-tipo-${parcela.id}`}
          name="kind"
          defaultValue={parcela.paid_on ? "comprovante" : "boleto"}
        >
          {TIPOS_DE_ANEXO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`anexo-arquivo-${parcela.id}`}>Arquivo</Label>
        <Input
          id={`anexo-arquivo-${parcela.id}`}
          name="arquivo"
          type="file"
          accept={ACEITOS}
          required
          className="rounded-xl"
        />
      </div>
    </FormDialog>
  );
}

export function Cobrancas({ personId }: { personId: string }) {
  const { userId, carregado } = useUsuarioLocal();
  const hoje = hojeEmSaoPaulo();
  const [pronto, setPronto] = useState(false);
  const { online } = useSincronia();

  // Com rede, sincroniza antes de mostrar (D5): logo depois do Ganho as
  // cobranças ainda não desceram, e "Nenhuma cobrança" levaria alguém a
  // criar de novo (I26). Com prazo: Wi-Fi sem saída não pode esconder o que
  // já está no aparelho. Sem rede, mostra direto.
  useEffect(() => {
    if (!carregado) return;
    let vivo = true;
    const espera =
      userId && navigator.onLine
        ? comPrazo(sincronizarAgora(userId), PRAZO_DA_SINCRONIA)
        : Promise.resolve();
    void espera.then(() => {
      if (vivo) setPronto(true);
    });
    return () => {
      vivo = false;
    };
  }, [carregado, userId]);

  const cobrancas = useLiveQuery(
    () =>
      userId
        ? cobrancasDoContato(bancoDoUsuario(userId), filaDoUsuario(userId), personId, hoje)
        : Promise.resolve([]),
    [userId, personId, hoje],
  );

  const { anexos, recarregar } = useAnexos(
    (cobrancas ?? []).flatMap((c) => c.parcelas.map((p) => p.id)),
    pronto && online,
  );

  if (!pronto) return <p className="text-sm text-muted-foreground">Sincronizando…</p>;
  if (!cobrancas) return null;

  const anexosDa = (parcela: string) => (anexos ?? []).filter((a) => a.installment_id === parcela);
  const temAnexo = (c: Cobranca) => c.parcelas.some((p) => anexosDa(p.id).length > 0);


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">
          {cobrancas.length === 0
            ? "Nenhuma cobrança ainda"
            : `${cobrancas.length} ${cobrancas.length === 1 ? "cobrança" : "cobranças"}`}
        </p>
        <NovaCobranca personId={personId} />
      </div>

      <Totais cobrancas={cobrancas} hoje={hoje} />

      {!online && cobrancas.length > 0 ? (
        <p className="text-xs text-muted-foreground">Anexos precisam de internet.</p>
      ) : null}

      {cobrancas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 shrink-0" />
          Registre o que foi combinado e em quantas vezes. As parcelas aparecem
          aqui, com vencimento e baixa.
        </p>
      ) : (
        <ul className="space-y-4">
          {cobrancas.map((c) => (
            <li key={c.id} className="rounded-2xl border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <InlineText
                  action={renomearCobranca}
                  name="title"
                  value={c.title}
                  hidden={{ id: c.id }}
                  label={`Nome da cobrança ${c.title}`}
                  className="min-w-40 flex-1"
                />
                <SeloPendente pendente={c.pendente} conflito={c.conflito} />
                <ConfirmAction
                  action={excluirCobranca}
                  hidden={{ id: c.id, person_id: personId }}
                  title={`Excluir a cobrança “${c.title}”?`}
                  consequence={`As ${c.resumo.parcelas} parcelas vão junto, inclusive as ${c.resumo.pagas} já pagas. Não dá para desfazer.`}
                  confirmLabel="Excluir a cobrança"
                  triggerLabel={`Excluir ${c.title}`}
                  // O banco recusaria (0048), e a recusa viraria um conflito
                  // escondendo a cobrança até alguém descartá-lo.
                  disabled={online && temAnexo(c)}
                  disabledReason="Remova os anexos antes."
                />
                {online && temAnexo(c) ? (
                  // O `title` do botão desabilitado não aparece no toque.
                  <span className="basis-full text-xs text-muted-foreground">
                    Remova os anexos antes de excluir.
                  </span>
                ) : null}
              </div>

              <div className="mt-2">
                <Cabecalho cobranca={c} />
              </div>

              <ul className="mt-3 divide-y border-t pt-1">
                {c.parcelas.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                  >
                    <span className="text-sm">
                      {p.number}/{c.resumo.parcelas} ·{" "}
                      <span className="text-muted-foreground">
                        {ROTULO_DO_METODO[p.method as keyof typeof ROTULO_DO_METODO] ?? p.method}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      <Situacao parcela={p} hoje={hoje} />
                      <strong className="text-sm">{formatarMoeda(p.amount, c.currency)}</strong>
                      <SeloPendente pendente={p.pendente} conflito={p.conflito} />
                      {p.paid_on ? (
                        <ConfirmAction
                          action={desfazerBaixa}
                          hidden={{ id: p.id }}
                          title={`Desfazer a baixa da parcela ${p.number}?`}
                          consequence="Ela volta a aparecer em aberto, e sai do recebido do mês."
                          confirmLabel="Desfazer a baixa"
                          triggerLabel={`Desfazer a baixa da parcela ${p.number}`}
                          needsConfirmation
                        />
                      ) : (
                        <>
                          <MudarVencimento parcela={p} />
                          <Baixa parcela={p} moeda={c.currency} />
                        </>
                      )}
                    </span>
                    {online ? (
                      <div className="flex basis-full flex-wrap items-center gap-2">
                        {anexosDa(p.id).map((a) => (
                          <LinhaDoAnexo key={a.id} anexo={a} aoMudar={recarregar} />
                        ))}
                        {c.pendente || p.pendente ? (
                          // Ainda não existe no servidor: o anexo cairia na
                          // chave estrangeira com uma frase sem sentido.
                          <span className="text-xs text-muted-foreground">
                            Anexos depois de sincronizar.
                          </span>
                        ) : (
                          <Anexar cobranca={c} parcela={p} aoMudar={recarregar} />
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
