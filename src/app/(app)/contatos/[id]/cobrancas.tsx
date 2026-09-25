"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Wallet } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { FormDialog } from "@/components/form-dialog";
import { InlineText } from "@/components/inline-text";
import { NativeSelect } from "@/components/native-select";
import { SeloPendente } from "@/components/selo-pendente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cobrancasDoContato,
  type Cobranca,
} from "@/features/financeiro/consultas-locais";
import {
  criarCobranca,
  excluirCobranca,
  renomearCobranca,
} from "@/features/financeiro/escritas-locais";
import { METODOS, ROTULO_DO_METODO } from "@/features/financeiro/schema";
import { situacaoDaParcela } from "@/features/financeiro/regras";
import { formatarDia, hojeEmSaoPaulo } from "@/lib/formatar";
import { bancoDoUsuario, filaDoUsuario } from "@/lib/local/sincronizador";
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

export function Cobrancas({ personId }: { personId: string }) {
  const { userId } = useUsuarioLocal();
  const hoje = hojeEmSaoPaulo();

  const cobrancas = useLiveQuery(
    () =>
      userId
        ? cobrancasDoContato(bancoDoUsuario(userId), filaDoUsuario(userId), personId, hoje)
        : Promise.resolve([]),
    [userId, personId, hoje],
  );

  if (!cobrancas) return null;

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
                />
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
                    <span className="flex items-center gap-3">
                      <Situacao parcela={p} hoje={hoje} />
                      <strong className="text-sm">{formatarMoeda(p.amount, c.currency)}</strong>
                      <SeloPendente pendente={p.pendente} conflito={p.conflito} />
                    </span>
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
