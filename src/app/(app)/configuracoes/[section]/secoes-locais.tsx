"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronRight,
  CloudOff,
  FileStack,
  Loader2,
  TriangleAlert,
} from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { SeloPendente } from "@/components/selo-pendente";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteVisaType } from "@/features/settings/escritas-locais";

import {
  catalogoLocal,
  etapasDoFunilLocal,
  statusDeEtapaLocal,
  tagsLocais,
  tiposDeVistoLocais,
  tipoDeVistoLocal,
} from "@/features/settings/consultas-locais";
import { useSincronia } from "@/lib/local/estado";
import { bancoDoUsuario, filaDoUsuario } from "@/lib/local/sincronizador";
import { motivoDoPrazo, validadeDoEspelho } from "@/lib/local/sessao";
import { useUsuarioLocal } from "@/lib/local/usuario";

import { DocumentTypesEditor } from "./document-types-editor";
import { StageStatusesEditor } from "./stage-statuses-editor";
import { StagesEditor } from "./stages-editor";
import { TagsEditor } from "./tags-editor";
import { VisaTypeDialog } from "./visa-type-dialog";
import { VisaDocumentsEditor } from "./visa-documents-editor";
import { VisaStagesEditor } from "./visa-stages-editor";

/**
 * As seções da Configuração, lidas do espelho no aparelho.
 *
 * Por que não mais do servidor: enquanto o HTML vinha com os dados dentro,
 * **navegar para esta tela offline era impossível**, e guardar HTML com dado
 * é o erro que derrubou o app antigo. Agora a rota é uma casca igual para
 * todos; o conteúdo é montado aqui, do espelho, com ou sem internet — um
 * caminho só, que é o que faz offline e online serem iguais.
 *
 * `useLiveQuery` observa o Dexie: quando a sincronia traz novidade, a tela se
 * redesenha sozinha, sem recarregar.
 */

/**
 * A seção pedida, para o dono **deste** aparelho.
 *
 * Quem responde de quem é o aparelho é a sessão guardada no navegador, não a
 * casca: o service worker guarda essa rota para abrir offline, e casca com
 * `userId` dentro abriria o banco local de outra pessoa num computador
 * compartilhado.
 */
export function SecoesDoAparelho({ slug, visa }: { slug: string; visa?: string }) {
  const { userId, carregado } = useUsuarioLocal();
  const { em } = useSincronia();

  if (!carregado) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Abrindo...
      </p>
    );
  }

  if (!userId) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-destructive">
        <TriangleAlert className="h-4 w-4" />
        Sua sessão terminou neste aparelho. Entre de novo para ver a
        configuração.
      </p>
    );
  }

  // Espelho velho demais não é mostrado. O modo de falha desta arquitetura
  // não é perder dado — é mostrar dado de duas semanas atrás como se fosse o
  // de hoje, sem nada na tela que permita desconfiar.
  const validade = validadeDoEspelho(em);
  if (!validade.podeLer) {
    return (
      <p className="flex items-start gap-2 py-6 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {motivoDoPrazo(validade, "ler")}
      </p>
    );
  }

  if (slug === "etapas-do-funil") return <SecaoEtapasDoFunil userId={userId} />;
  if (slug === "tags") return <SecaoTags userId={userId} />;
  if (slug === "categorias-de-documento") return <SecaoCatalogo userId={userId} />;
  if (slug === "status-de-etapas") return <SecaoStatusDeEtapa userId={userId} />;
  if (slug === "tipos-de-visto") {
    return visa ? (
      <SecaoTipoDeVisto userId={userId} visaId={visa} />
    ) : (
      <SecaoTiposDeVisto userId={userId} />
    );
  }
  return null;
}

/** Enquanto o espelho não tem nada, diz por quê — e nunca "não existe". */
function Esperando() {
  const { em, online, error } = useSincronia();

  // Espelho vazio **e** já sincronizou = a organização realmente não tem
  // nada. Quem mostra isso é o editor, que tem o texto certo de cada tela.
  if (em) return null;

  return (
    <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      {online && !error ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Sincronizando com o servidor...
        </>
      ) : (
        <>
          <CloudOff className="h-4 w-4" />
          Este aparelho ainda não baixou a configuração. Conecte-se uma vez
          para poder usá-la sem internet.
        </>
      )}
    </p>
  );
}

/**
 * O espelho deste usuário **mais a fila**, observados. `undefined` enquanto o
 * Dexie responde.
 *
 * `useLiveQuery` acompanha os dois bancos: gravar na fila redesenha a tela na
 * hora, e a sincronia redesenha de novo quando o item sai da fila confirmado.
 */
function useEspelho<T>(
  userId: string,
  consulta: (
    banco: ReturnType<typeof bancoDoUsuario>,
    fila: ReturnType<typeof filaDoUsuario>,
  ) => Promise<T>,
) {
  return useLiveQuery(
    () => consulta(bancoDoUsuario(userId), filaDoUsuario(userId)),
    [userId],
  );
}

export function SecaoEtapasDoFunil({ userId }: { userId: string }) {
  const dados = useEspelho(userId, etapasDoFunilLocal);

  if (!dados) return <Esperando />;
  if (!dados.funil) {
    return (
      <>
        <Esperando />
        <p className="text-sm text-muted-foreground">
          Nenhum funil configurado nesta organização.
        </p>
      </>
    );
  }

  return <StagesEditor pipelineId={dados.funil.id} stages={dados.etapas} />;
}

export function SecaoTags({ userId }: { userId: string }) {
  const tags = useEspelho(userId, tagsLocais);

  if (!tags) return <Esperando />;
  if (tags.length === 0) {
    return (
      <>
        <Esperando />
        <TagsEditor tags={tags} />
      </>
    );
  }

  return <TagsEditor tags={tags} />;
}

export function SecaoCatalogo({ userId }: { userId: string }) {
  const dados = useEspelho(userId, catalogoLocal);

  if (!dados) return <Esperando />;
  if (dados.pastas.length === 0) {
    return (
      <>
        <Esperando />
        <DocumentTypesEditor nodes={dados.pastas} usos={dados.usos} />
      </>
    );
  }

  return <DocumentTypesEditor nodes={dados.pastas} usos={dados.usos} />;
}

export function SecaoStatusDeEtapa({ userId }: { userId: string }) {
  const status = useEspelho(userId, statusDeEtapaLocal);

  if (!status) return <Esperando />;
  return (
    <>
      {status.length === 0 ? <Esperando /> : null}
      <StageStatusesEditor statuses={status} />
    </>
  );
}

/** Lista de tipos de visto — a mesma marcação de antes, lendo o espelho. */
export function SecaoTiposDeVisto({ userId }: { userId: string }) {
  const dados = useEspelho(userId, tiposDeVistoLocais);

  if (!dados) return <Esperando />;
  const { tipos, etapasPorTipo, documentosPorTipo } = dados;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <VisaTypeDialog />
      </div>

      {tipos.length === 0 ? (
        <>
          <Esperando />
          <EmptyState
            icon={FileStack}
            title="Nenhum tipo de visto ainda"
            hint="Crie o primeiro — EB-1A, EB-2 NIW, O-1."
          />
        </>
      ) : (
        <ul className="space-y-2">
          {tipos.map((type) => (
            <li
              key={type.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{type.name}</p>
                <p className="text-xs text-muted-foreground">
                  {etapasPorTipo[type.id] ?? 0} etapas ·{" "}
                  {documentosPorTipo[type.id] ?? 0} documentos
                  {type.estimated_days ? ` · ${type.estimated_days} dias` : ""}
                </p>
              </div>

              {!type.is_active ? <Badge variant="secondary">Inativo</Badge> : null}

              <SeloPendente pendente={type.pendente} conflito={type.conflito} />

              {/*
                Botão com rótulo, não o nome virando link: o molde de etapas e
                documentos é o principal desta tela, e nome sublinhado no hover
                não anuncia que existe uma tela inteira atrás dele.
              */}
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link href={`/configuracoes/tipos-de-visto?visa=${type.id}`}>
                  Etapas e documentos
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>

              <VisaTypeDialog visaType={type} />

              <ConfirmAction
                action={deleteVisaType}
                hidden={{ id: type.id }}
                title={`Excluir o tipo de visto “${type.name}”?`}
                consequence={`O molde inteiro vai junto: ${
                  etapasPorTipo[type.id] ?? 0
                } etapas e ${
                  documentosPorTipo[type.id] ?? 0
                } pastas exigidas. Processos já criados a partir dele não são afetados — a cópia dentro do processo é independente. Não dá para desfazer.`}
                confirmLabel="Excluir o molde"
                triggerLabel={`Excluir ${type.name}`}
                needsConfirmation={
                  (etapasPorTipo[type.id] ?? 0) + (documentosPorTipo[type.id] ?? 0) > 0
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Um tipo de visto: etapas e documentos exigidos. */
export function SecaoTipoDeVisto({ userId, visaId }: { userId: string; visaId: string }) {
  const dados = useEspelho(userId, (banco, fila) => tipoDeVistoLocal(banco, fila, visaId));

  if (!dados) return <Esperando />;
  const { visto, etapas, catalogo, exigencias } = dados;

  if (!visto) {
    return (
      <>
        <Esperando />
        <p className="text-sm text-muted-foreground">
          Tipo de visto não encontrado.{" "}
          <Link href="/configuracoes/tipos-de-visto" className="underline">
            Voltar à lista
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/configuracoes/tipos-de-visto"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Todos os tipos
        </Link>
        <VisaTypeDialog visaType={visto} />
      </div>

      <div>
        <h3 className="text-lg font-semibold">{visto.name}</h3>
        {visto.description ? (
          <p className="text-sm text-muted-foreground">{visto.description}</p>
        ) : null}
      </div>

      <Tabs defaultValue="etapas">
        <TabsList className="rounded-2xl">
          <TabsTrigger value="etapas" className="rounded-xl">
            Etapas ({etapas.length})
          </TabsTrigger>
          <TabsTrigger value="documentos" className="rounded-xl">
            Documentos ({exigencias.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="etapas" className="pt-4">
          <VisaStagesEditor visaTypeId={visaId} stages={etapas} />
        </TabsContent>

        <TabsContent value="documentos" className="pt-4">
          <VisaDocumentsEditor
            visaTypeId={visaId}
            catalog={catalogo}
            selections={exigencias}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
