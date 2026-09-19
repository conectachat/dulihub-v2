"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileText,
  Folder,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

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
  atualizarPasta,
  criarPasta,
  excluirPasta,
  moverPasta,
  registrarArquivo,
  resolverPasta,
} from "@/features/projects/documentos-actions";
import type { PastaDoProcesso } from "@/features/projects/queries";
import {
  arquivoAceito,
  caminhoDoArquivo,
  podeResolver,
  resumoDosArquivos,
  tipoDeVisualizacao,
} from "@/features/projects/regras";
import { ESTADO_INICIAL, type ActionState } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";
import { listarNomes } from "@/lib/avisos";
import { formatarDataHora, formatarDia } from "@/lib/formatar";
import { createClient } from "@/lib/supabase/client";
import { flattenTree, indentStyle } from "@/lib/tree";
import { cn } from "@/lib/utils";

import { Visualizador, type ArquivoAberto } from "./visualizador";

type Arquivo = PastaDoProcesso["arquivos"][number];

const ESTADO: Record<string, { rotulo: string; classe: string }> = {
  pending: { rotulo: "Em análise", classe: "bg-warning/25 text-foreground" },
  approved: { rotulo: "Aprovado", classe: "bg-success/15 text-success" },
  rejected: { rotulo: "Recusado", classe: "bg-destructive/10 text-destructive" },
};

function enviar(acao: (fd: FormData) => Promise<ActionState>, campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return comAviso(acao)(fd);
}

export function tamanho(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Aba Documentos: as pastas exigidas pelo visto (e as criadas só aqui), com
 * os arquivos dentro. Decisões do Renato (19/set): árvore que abre no lugar,
 * resolver só com tudo aprovado, visualizar dentro do app, aprovado pode ser
 * excluído com confirmação.
 */
export function DocumentosDoProcesso({
  processoId,
  organizationId,
  pastas,
  hoje,
}: {
  processoId: string;
  organizationId: string;
  pastas: PastaDoProcesso[];
  hoje: string;
}) {
  const arvore = flattenTree(pastas);
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  const [painel, setPainel] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<(typeof arvore)[number] | null>(null);
  const [aberto, setAberto] = useState<ArquivoAberto | null>(null);

  // Pasta fechada esconde as subpastas; os arquivos só aparecem na aberta.
  const escondidas = new Set(
    arvore.filter((p) => !abertas.has(p.id)).flatMap((p) => p.descendantIds),
  );
  const alternar = (id: string) =>
    setAbertas((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const pastaAberta = aberto ? pastas.find((p) => p.id === aberto.pastaId) : null;

  return (
    <div className="space-y-3">
      {arvore.length > 0 ? (
        <ul className="divide-y rounded-3xl border bg-card">
          {arvore.map((pasta) => {
            if (escondidas.has(pasta.id)) return null;
            const estaAberta = abertas.has(pasta.id);
            const resumo = resumoDosArquivos(pasta.arquivos);
            const resolvida = pasta.resolved_at !== null;
            const vencida =
              !resolvida && pasta.deadline_on !== null && pasta.deadline_on < hoje;

            return (
              <li key={pasta.id} className="px-4 py-2">
                <div
                  className="flex flex-wrap items-center gap-2"
                  style={indentStyle(pasta.depth)}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => alternar(pasta.id)}
                    aria-expanded={estaAberta}
                    aria-label={`${estaAberta ? "Fechar" : "Abrir"} ${pasta.name}`}
                  >
                    {estaAberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>

                  <Folder
                    className={cn("h-4 w-4 shrink-0", resolvida ? "text-success" : "text-muted-foreground")}
                  />

                  <div className="min-w-0 flex-1">
                    {editando === pasta.id ? (
                      <div className="flex items-center gap-1">
                        <InlineText
                          action={atualizarPasta}
                          name="valor"
                          value={pasta.name}
                          hidden={{ id: pasta.id, campo: "name" }}
                          label={`Nome de ${pasta.name}`}
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
                      <button
                        type="button"
                        onClick={() => alternar(pasta.id)}
                        className="flex flex-wrap items-center gap-2 text-left text-sm font-medium"
                      >
                        <span className={cn(resolvida && "text-muted-foreground line-through decoration-1")}>
                          {pasta.name}
                        </span>
                        {!pasta.is_required ? (
                          <Badge variant="outline" className="font-normal">opcional</Badge>
                        ) : null}
                        {pasta.source_document_type_id === null ? (
                          <Badge variant="outline" className="font-normal">só deste processo</Badge>
                        ) : null}
                      </button>
                    )}
                    <SeloDosArquivos resumo={resumo} />
                  </div>

                  <PrazoDaPasta
                    key={`prazo-${pasta.deadline_on}`}
                    pastaId={pasta.id}
                    valor={pasta.deadline_on}
                    vencido={vencida}
                    nome={pasta.name}
                  />

                  <BotaoResolver pasta={pasta} />

                  <MenuDaPasta
                    pasta={pasta}
                    onSubpasta={() => {
                      setPainel(pasta.id);
                      setAbertas((a) => new Set(a).add(pasta.id));
                    }}
                    onRenomear={() => setEditando(pasta.id)}
                    onExcluir={() => setExcluindo(pasta)}
                  />
                </div>

                {estaAberta ? (
                  <div className="mt-2 space-y-2" style={indentStyle(pasta.depth + 1)}>
                    <ArquivosDaPasta
                      pasta={pasta}
                      processoId={processoId}
                      organizationId={organizationId}
                      onAbrir={(indice) => setAberto({ pastaId: pasta.id, indice })}
                    />
                  </div>
                ) : null}

                {painel === pasta.id ? (
                  <div
                    className="mt-2 rounded-2xl border border-dashed p-2"
                    style={indentStyle(pasta.depth + 1)}
                  >
                    <NovaPasta processoId={processoId} parentId={pasta.id} onFechar={() => setPainel(null)} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma pasta ainda. O tipo de visto não exigia documentos quando o
          processo foi criado.
        </p>
      )}

      <div className="rounded-2xl border border-dashed p-2">
        <NovaPasta processoId={processoId} parentId={null} />
      </div>

      <ConfirmarExclusaoDaPasta
        pasta={excluindo}
        subpastas={
          excluindo
            ? arvore.filter((p) => excluindo.descendantIds.includes(p.id)).map((p) => p.name)
            : []
        }
        arquivos={
          excluindo
            ? pastas
                .filter((p) => p.id === excluindo.id || excluindo.descendantIds.includes(p.id))
                .reduce((n, p) => n + p.arquivos.length, 0)
            : 0
        }
        onFechar={() => setExcluindo(null)}
      />

      {aberto && pastaAberta ? (
        <Visualizador
          pasta={pastaAberta}
          indice={aberto.indice}
          onTrocar={(indice) => setAberto({ pastaId: pastaAberta.id, indice })}
          onFechar={() => setAberto(null)}
        />
      ) : null}
    </div>
  );
}

function SeloDosArquivos({ resumo }: { resumo: ReturnType<typeof resumoDosArquivos> }) {
  if (resumo.total === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum arquivo</p>;
  }
  const partes = [
    resumo.pendentes ? `${resumo.pendentes} em análise` : null,
    resumo.aprovados ? `${resumo.aprovados} ${resumo.aprovados === 1 ? "aprovado" : "aprovados"}` : null,
    resumo.recusados ? `${resumo.recusados} ${resumo.recusados === 1 ? "recusado" : "recusados"}` : null,
  ].filter(Boolean);
  return (
    <p className={cn("text-xs text-muted-foreground", resumo.pendentes > 0 && "font-medium text-foreground")}>
      {partes.join(" · ")}
    </p>
  );
}

/**
 * ✓ Resolvida. Bloqueado com o motivo quando há arquivo em análise ou
 * recusado — a regra do Renato, a mesma do gatilho da 0026.
 */
function BotaoResolver({ pasta }: { pasta: PastaDoProcesso }) {
  const [pendente, iniciar] = useTransition();
  const resolvida = pasta.resolved_at !== null;
  const pode = podeResolver(pasta.arquivos);
  const bloqueado = !resolvida && !pode.ok;

  return (
    <Button
      type="button"
      variant={resolvida ? "default" : "outline"}
      size="sm"
      disabled={pendente || bloqueado}
      title={bloqueado && !pode.ok ? pode.motivo : undefined}
      aria-pressed={resolvida}
      className={cn("h-8 rounded-xl", resolvida && "bg-success text-white hover:bg-success/90")}
      onClick={() =>
        iniciar(async () => {
          await enviar(resolverPasta, { id: pasta.id, resolver: resolvida ? "false" : "true" });
        })
      }
    >
      <CircleCheck className="mr-1 h-4 w-4" />
      {resolvida ? "Resolvida" : "Resolver"}
    </Button>
  );
}

function PrazoDaPasta({
  pastaId,
  valor,
  vencido,
  nome,
}: {
  pastaId: string;
  valor: string | null;
  vencido: boolean;
  nome: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  if (aberto) {
    return (
      <Input
        type="date"
        autoFocus
        defaultValue={valor ?? ""}
        aria-label={`Prazo de ${nome}`}
        disabled={pendente}
        className="h-8 w-36 rounded-xl text-sm"
        onBlur={(e) => {
          const novo = e.target.value;
          setAberto(false);
          if (novo === (valor ?? "")) return;
          iniciar(async () => {
            await enviar(atualizarPasta, { id: pastaId, campo: "deadline_on", valor: novo });
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
      aria-label={`Prazo de ${nome}: ${valor ? formatarDia(valor) : "sem prazo"}. Alterar`}
      className={cn(
        "h-8 rounded-xl px-2 text-sm hover:bg-muted",
        valor ? "tabular-nums" : "text-muted-foreground",
        vencido && "font-medium text-destructive",
      )}
    >
      {valor ? `Prazo ${formatarDia(valor)}` : "Definir prazo"}
      {vencido ? " · vencido" : ""}
    </button>
  );
}

function MenuDaPasta({
  pasta,
  onSubpasta,
  onRenomear,
  onExcluir,
}: {
  pasta: { id: string; name: string; is_required: boolean; isFirst: boolean; isLast: boolean };
  onSubpasta: () => void;
  onRenomear: () => void;
  onExcluir: () => void;
}) {
  const [, iniciar] = useTransition();
  const mover = (direction: "up" | "down") =>
    iniciar(async () => {
      await enviar(moverPasta, { id: pasta.id, direction });
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${pasta.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onSubpasta}>
          <Plus className="h-4 w-4" /> Nova subpasta
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRenomear}>
          <Pencil className="h-4 w-4" /> Renomear
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            iniciar(async () => {
              await enviar(atualizarPasta, {
                id: pasta.id,
                campo: "is_required",
                valor: pasta.is_required ? "false" : "true",
              });
            })
          }
        >
          <Star className="h-4 w-4" />
          {pasta.is_required ? "Tornar opcional" : "Tornar obrigatória"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pasta.isFirst} onSelect={() => mover("up")}>
          <ArrowUp className="h-4 w-4" /> Subir
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pasta.isLast} onSelect={() => mover("down")}>
          <ArrowDown className="h-4 w-4" /> Descer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onExcluir} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Arquivos da pasta aberta e o envio.
 *
 * O navegador sobe direto no Storage (o servidor da Vercel não recebe 20 MB) e
 * depois pede ao servidor para registrar. Registro recusado → o objeto que
 * subiu é apagado, para não ficar arquivo órfão no bucket.
 */
function ArquivosDaPasta({
  pasta,
  processoId,
  organizationId,
  onAbrir,
}: {
  pasta: PastaDoProcesso;
  processoId: string;
  organizationId: string;
  onAbrir: (indice: number) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  async function subir(lista: FileList | File[]) {
    const supabase = createClient();
    for (const arquivo of Array.from(lista)) {
      const aceito = arquivoAceito(arquivo);
      if (!aceito.ok) {
        toast.error(aceito.erro);
        continue;
      }
      setEnviando(arquivo.name);
      const caminho = caminhoDoArquivo({
        organizacao: organizationId,
        processo: processoId,
        pasta: pasta.id,
        arquivo: crypto.randomUUID(),
        nome: arquivo.name,
      });
      const { error } = await supabase.storage
        .from("documentos")
        .upload(caminho, arquivo, { contentType: arquivo.type || undefined });
      if (error) {
        toast.error(`${arquivo.name}: não foi possível enviar. Tente de novo.`);
        continue;
      }
      const registro = await registrarArquivo({
        pastaId: pasta.id,
        caminho,
        nome: arquivo.name,
        tipo: arquivo.type || null,
        tamanho: arquivo.size,
      });
      if (registro.error) {
        await supabase.storage.from("documentos").remove([caminho]);
        toast.error(`${arquivo.name}: ${registro.error}`);
      }
    }
    setEnviando(null);
  }

  return (
    <div
      className={cn(
        "space-y-1 rounded-2xl border border-dashed p-2 transition-colors",
        arrastando && "border-primary bg-primary/5",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (e.dataTransfer.files.length) void subir(e.dataTransfer.files);
      }}
    >
      {pasta.arquivos.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          Nenhum arquivo. Arraste para cá ou use o botão.
        </p>
      ) : (
        <ul className="space-y-1">
          {pasta.arquivos.map((arquivo, indice) => (
            <LinhaDoArquivo key={arquivo.id} arquivo={arquivo} onAbrir={() => onAbrir(indice)} />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 px-1 pt-1">
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
          onChange={(e) => {
            if (e.target.files?.length) void subir(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-xl"
          disabled={enviando !== null}
          onClick={() => entrada.current?.click()}
        >
          <Upload className="mr-1 h-4 w-4" />
          {enviando ? `Enviando ${enviando}...` : "Enviar arquivos"}
        </Button>
        <span className="text-xs text-muted-foreground">PDF, imagem, Word ou Excel · até 20 MB</span>
      </div>
    </div>
  );
}

function LinhaDoArquivo({ arquivo, onAbrir }: { arquivo: Arquivo; onAbrir: () => void }) {
  const estado = ESTADO[arquivo.review_status] ?? ESTADO.pending;
  const tipo = tipoDeVisualizacao(arquivo.mime_type, arquivo.file_name);

  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted"
      >
        {tipo === "imagem" ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{arquivo.file_name}</span>
          <span className="block text-xs text-muted-foreground">
            {[tamanho(arquivo.size_bytes), arquivo.enviadoPor, formatarDataHora(arquivo.uploaded_at)]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {arquivo.review_status === "rejected" && arquivo.rejection_reason ? (
            <span className="block text-xs text-destructive">Motivo: {arquivo.rejection_reason}</span>
          ) : null}
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", estado.classe)}>
          {estado.rotulo}
        </span>
      </button>
    </li>
  );
}

function NovaPasta({
  processoId,
  parentId,
  onFechar,
}: {
  processoId: string;
  parentId: string | null;
  onFechar?: () => void;
}) {
  const [state, formAction] = useActionState(criarPasta, ESTADO_INICIAL);

  return (
    <form key={state.token ?? "nova"} action={formAction} className="space-y-1">
      <input type="hidden" name="project_id" value={processoId} />
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <div className="flex items-center gap-2">
        <Input
          name="name"
          required
          autoFocus={parentId !== null}
          placeholder={parentId ? "Nome da subpasta" : "Pasta só deste processo"}
          className="h-8 flex-1 rounded-xl"
        />
        <SubmitButton pendente="Criando..." size="sm" icone={<Plus className="h-4 w-4" />}>
          {parentId ? "Adicionar" : "Pasta"}
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

function ConfirmarExclusaoDaPasta({
  pasta,
  subpastas,
  arquivos,
  onFechar,
}: {
  pasta: { id: string; name: string } | null;
  subpastas: string[];
  arquivos: number;
  onFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar(formData: FormData) {
    setErro(null);
    const r = await excluirPasta(formData);
    if (r.error) setErro(r.error);
    else onFechar();
  }

  const perdas = [
    subpastas.length
      ? `${subpastas.length === 1 ? "a subpasta" : `as ${subpastas.length} subpastas`} ${listarNomes(subpastas)}`
      : null,
    arquivos ? `${arquivos === 1 ? "1 arquivo" : `${arquivos} arquivos`}, apagados de vez` : null,
  ].filter(Boolean);

  return (
    <Dialog
      open={pasta !== null}
      onOpenChange={(a) => {
        if (!a) {
          setErro(null);
          onFechar();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir &quot;{pasta?.name}&quot;?</DialogTitle>
          <DialogDescription>
            {perdas.length ? `Leva junto ${perdas.join(" e ")}. ` : ""}
            Só deste processo — o tipo de visto não muda.
          </DialogDescription>
        </DialogHeader>
        <form action={confirmar} className="space-y-3">
          <input type="hidden" name="id" value={pasta?.id ?? ""} />
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
