"use client";

import { useActionState, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { FieldError } from "@/components/field-error";
import { InlineText } from "@/components/inline-text";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  atualizarEtapa,
  criarEtapa,
  excluirEtapa,
  moverEtapa,
  mudarStatusDaEtapa,
} from "@/features/projects/actions";
import { numeracao, resumoDasFilhas } from "@/features/projects/campos";
import { ESTADO_INICIAL, type ActionState } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";
import { listarNomes } from "@/lib/avisos";
import { formatarDia } from "@/lib/formatar";
import { flattenTree, indentStyle } from "@/lib/tree";
import { cn } from "@/lib/utils";

export type Etapa = {
  id: string;
  parent_id: string | null;
  position: number;
  name: string;
  status_id: string;
  due_on: string | null;
  completed_on: string | null;
  source_stage_id: string | null;
};

export type OpcaoDeStatus = {
  id: string;
  label: string;
  color: string | null;
  is_done: boolean;
};

/** Colunas da tabela — iguais no cabeçalho e em cada linha. */
const GRADE =
  "md:grid md:grid-cols-[3rem_minmax(0,1fr)_11rem_9rem_9rem_2.5rem] md:items-center md:gap-3";

function enviar(acao: (fd: FormData) => Promise<ActionState>, campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return comAviso(acao)(fd);
}

/**
 * Aba Etapas do processo: tabela com número, status, data prevista e data de
 * conclusão, e o menu ⋯ de cada etapa. Desenho pedido pelo Renato a partir do
 * app antigo (18/set).
 *
 * Etapa com sub-etapas vira grupo com seta, **fechado ao abrir a tela** —
 * decisão dele. Sem arrastar: sobe e desce pelo menu, como no resto da base
 * (`MoveButtons` explica por quê).
 */
export function EtapasDoProcesso({
  processoId,
  etapas,
  status,
  hoje,
}: {
  processoId: string;
  etapas: Etapa[];
  status: OpcaoDeStatus[];
  hoje: string;
}) {
  const arvore = flattenTree(etapas);
  const numeros = numeracao(arvore);
  const concluidos = new Set(status.filter((s) => s.is_done).map((s) => s.id));
  const filhas = resumoDasFilhas(etapas, concluidos);

  const [fechados, setFechados] = useState<Set<string>>(
    () => new Set(filhas.keys()),
  );
  const [painel, setPainel] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<(typeof arvore)[number] | null>(null);

  const escondidos = new Set(
    arvore.filter((e) => fechados.has(e.id)).flatMap((e) => e.descendantIds),
  );

  const alternar = (id: string) =>
    setFechados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="space-y-3">
      {arvore.length > 0 ? (
        <div className="rounded-3xl border bg-card">
          <div
            className={cn(
              GRADE,
              "hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground md:grid",
            )}
          >
            <span>Nº</span>
            <span>Etapa</span>
            <span>Status</span>
            <span>Data prevista</span>
            <span>Data conclusão</span>
            <span className="sr-only">Ações</span>
          </div>

          <ul className="divide-y">
            {arvore.map((etapa) => {
              if (escondidos.has(etapa.id)) return null;
              const resumo = filhas.get(etapa.id);
              const concluida = concluidos.has(etapa.status_id);
              const vencida =
                !concluida && etapa.due_on !== null && etapa.due_on < hoje;

              return (
                <li key={etapa.id} className="px-4 py-2">
                  <div className={cn(GRADE, "space-y-2 md:space-y-0")}>
                    <span className="hidden text-sm tabular-nums text-muted-foreground md:block">
                      {numeros.get(etapa.id)}
                    </span>

                    <div
                      className="flex min-w-0 items-center gap-1"
                      style={indentStyle(etapa.depth)}
                    >
                      {resumo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => alternar(etapa.id)}
                          aria-expanded={!fechados.has(etapa.id)}
                          aria-label={`${fechados.has(etapa.id) ? "Abrir" : "Fechar"} ${etapa.name}`}
                        >
                          {fechados.has(etapa.id) ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        <span className="w-7 shrink-0" aria-hidden />
                      )}

                      <span className="mr-1 text-sm tabular-nums text-muted-foreground md:hidden">
                        {numeros.get(etapa.id)}
                      </span>

                      {editando === etapa.id ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <InlineText
                            action={atualizarEtapa}
                            name="valor"
                            value={etapa.name}
                            hidden={{ id: etapa.id, campo: "name" }}
                            label={`Nome de ${etapa.name}`}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditando(null)}
                            aria-label="Terminar edição"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                          <span className="truncate">{etapa.name}</span>
                          {resumo ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              {resumo.concluidas}/{resumo.total}
                            </span>
                          ) : null}
                          {etapa.source_stage_id === null ? (
                            <Badge variant="outline" className="font-normal">
                              só deste processo
                            </Badge>
                          ) : null}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:contents">
                      <SeletorDeStatus
                        etapaId={etapa.id}
                        nome={etapa.name}
                        statusId={etapa.status_id}
                        opcoes={status}
                      />

                      <DataDaEtapa
                        key={`prevista-${etapa.due_on}`}
                        etapaId={etapa.id}
                        campo="due_on"
                        valor={etapa.due_on}
                        vazio="Definir data"
                        rotulo={`Data prevista de ${etapa.name}`}
                        destaque={vencida}
                      />

                      {concluida ? (
                        <DataDaEtapa
                          key={`conclusao-${etapa.completed_on}`}
                          etapaId={etapa.id}
                          campo="completed_on"
                          valor={etapa.completed_on}
                          vazio="—"
                          rotulo={`Data de conclusão de ${etapa.name}`}
                        />
                      ) : (
                        <span className="hidden px-2 text-sm text-muted-foreground md:block">
                          —
                        </span>
                      )}

                      <MenuDaEtapa
                        etapa={etapa}
                        onSubEtapa={() => {
                          setPainel(etapa.id);
                          // Abrir o grupo: a nova sub-etapa aparece no lugar.
                          setFechados((a) => {
                            const n = new Set(a);
                            n.delete(etapa.id);
                            return n;
                          });
                        }}
                        onEditar={() => setEditando(etapa.id)}
                        onExcluir={() => setExcluindo(etapa)}
                      />
                    </div>
                  </div>

                  {painel === etapa.id ? (
                    <div
                      className="mt-2 rounded-2xl border border-dashed p-2"
                      style={indentStyle(etapa.depth + 1)}
                    >
                      <NovaEtapa
                        processoId={processoId}
                        parentId={etapa.id}
                        onFechar={() => setPainel(null)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma etapa ainda. O tipo de visto não tinha etapas quando o processo
          foi criado.
        </p>
      )}

      <div className="rounded-2xl border border-dashed p-2">
        <NovaEtapa processoId={processoId} parentId={null} />
      </div>

      <ConfirmarExclusao
        etapa={excluindo}
        subEtapas={
          excluindo
            ? arvore
                .filter((e) => excluindo.descendantIds.includes(e.id))
                .map((e) => e.name)
            : []
        }
        onFechar={() => setExcluindo(null)}
      />
    </div>
  );
}

/** Seletor com a bolinha na cor do status, como no app antigo. */
function SeletorDeStatus({
  etapaId,
  nome,
  statusId,
  opcoes,
}: {
  etapaId: string;
  nome: string;
  statusId: string;
  opcoes: OpcaoDeStatus[];
}) {
  const [pendente, iniciar] = useTransition();
  const atual = opcoes.find((o) => o.id === statusId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendente}
          className="h-8 w-44 justify-between rounded-xl font-normal"
          aria-label={`Status de ${nome}: ${atual?.label ?? "sem status"}`}
        >
          <span className="flex items-center gap-2 truncate">
            <Bolinha cor={atual?.color ?? null} />
            {atual?.label ?? "—"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {opcoes.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() =>
              o.id !== statusId &&
              iniciar(async () => {
                await enviar(mudarStatusDaEtapa, { id: etapaId, status_id: o.id });
              })
            }
            className="gap-2"
          >
            <Check
              className={cn("h-4 w-4", o.id === statusId ? "opacity-100" : "opacity-0")}
            />
            <Bolinha cor={o.color} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Bolinha({ cor }: { cor: string | null }) {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40"
      style={cor ? { backgroundColor: cor } : undefined}
      aria-hidden
    />
  );
}

/**
 * Data que vira campo ao clicar e salva ao sair.
 *
 * A recusa vem como aviso flutuante (`comAviso`) e a data volta sozinha: o
 * `key` do pai muda só quando o servidor grava outro valor.
 */
function DataDaEtapa({
  etapaId,
  campo,
  valor,
  vazio,
  rotulo,
  destaque = false,
}: {
  etapaId: string;
  campo: "due_on" | "completed_on";
  valor: string | null;
  vazio: string;
  rotulo: string;
  destaque?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  if (aberto) {
    return (
      <Input
        type="date"
        autoFocus
        defaultValue={valor ?? ""}
        aria-label={rotulo}
        disabled={pendente}
        className="h-8 w-36 rounded-xl text-sm"
        onBlur={(e) => {
          const novo = e.target.value;
          setAberto(false);
          if (novo === (valor ?? "")) return;
          iniciar(async () => {
            await enviar(atualizarEtapa, { id: etapaId, campo, valor: novo });
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setAberto(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAberto(true)}
      aria-label={`${rotulo}: ${valor ? formatarDia(valor) : "sem data"}. Alterar`}
      className={cn(
        "h-8 rounded-xl px-2 text-left text-sm hover:bg-muted",
        valor ? "tabular-nums" : "text-muted-foreground",
        destaque && "font-medium text-destructive",
        pendente && "opacity-50",
      )}
    >
      {valor ? formatarDia(valor) : vazio}
      {destaque ? " · vencida" : ""}
    </button>
  );
}

function MenuDaEtapa({
  etapa,
  onSubEtapa,
  onEditar,
  onExcluir,
}: {
  etapa: { id: string; name: string; isFirst: boolean; isLast: boolean };
  onSubEtapa: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const [, iniciar] = useTransition();
  const mover = (direction: "up" | "down") =>
    iniciar(async () => {
      await enviar(moverEtapa, { id: etapa.id, direction });
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:justify-self-end"
          aria-label={`Ações de ${etapa.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onSubEtapa}>
          <Plus className="h-4 w-4" />
          Adicionar sub-etapa
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEditar}>
          <Pencil className="h-4 w-4" />
          Editar etapa
        </DropdownMenuItem>
        <DropdownMenuItem disabled={etapa.isFirst} onSelect={() => mover("up")}>
          <ArrowUp className="h-4 w-4" />
          Subir
        </DropdownMenuItem>
        <DropdownMenuItem disabled={etapa.isLast} onSelect={() => mover("down")}>
          <ArrowDown className="h-4 w-4" />
          Descer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onExcluir}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Criar etapa ou sub-etapa. O `key` pelo `token` limpa o campo a cada
 * gravação e deixa o painel aberto — quem cria uma costuma criar três.
 */
function NovaEtapa({
  processoId,
  parentId,
  onFechar,
}: {
  processoId: string;
  parentId: string | null;
  onFechar?: () => void;
}) {
  const [state, formAction] = useActionState(criarEtapa, ESTADO_INICIAL);

  return (
    <form key={state.token ?? "nova"} action={formAction} className="space-y-1">
      <input type="hidden" name="project_id" value={processoId} />
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <div className="flex items-center gap-2">
        <Input
          name="name"
          required
          autoFocus={parentId !== null}
          placeholder={parentId ? "Nome da sub-etapa" : "Etapa só deste processo"}
          className="h-8 flex-1 rounded-xl"
        />
        <SubmitButton pendente="Criando..." size="sm" icone={<Plus className="h-4 w-4" />}>
          {parentId ? "Adicionar" : "Etapa"}
        </SubmitButton>
        {onFechar ? (
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Fechar
          </Button>
        ) : null}
      </div>
      <FieldError mensagem={state.error} pequeno />
    </form>
  );
}

function ConfirmarExclusao({
  etapa,
  subEtapas,
  onFechar,
}: {
  etapa: { id: string; name: string } | null;
  subEtapas: string[];
  onFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar(formData: FormData) {
    setErro(null);
    const r = await excluirEtapa(formData);
    if (r.error) setErro(r.error);
    else onFechar();
  }

  return (
    <Dialog
      open={etapa !== null}
      onOpenChange={(aberto) => {
        if (!aberto) {
          setErro(null);
          onFechar();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir &quot;{etapa?.name}&quot;?</DialogTitle>
          <DialogDescription>
            {subEtapas.length > 0
              ? `Leva junto ${subEtapas.length === 1 ? "a sub-etapa" : `as ${subEtapas.length} sub-etapas`}: ${listarNomes(subEtapas)}. `
              : ""}
            Só deste processo — o tipo de visto não muda.
          </DialogDescription>
        </DialogHeader>
        <form action={confirmar} className="space-y-3">
          <input type="hidden" name="id" value={etapa?.id ?? ""} />
          <FieldError mensagem={erro} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <SubmitButton pendente="Excluindo..." className="bg-destructive text-white hover:bg-destructive/90">
              Excluir
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
