"use client";

import { useState } from "react";
import { Check, Copy, Link2, MessageCircle, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { FormularioDoCadastro } from "@/components/formulario-do-cadastro";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  cancelarLink,
  gerarLink,
  marcarConferida,
  salvarCadastro,
} from "@/features/cadastro/actions";
import type { CadastroDoContato } from "@/features/cadastro/queries";
import { comAviso } from "@/lib/avisar";

/**
 * Os botões do cartão "Dados cadastrais" — a parte que precisa do navegador:
 * abrir o diálogo, copiar o link, chamar as ações.
 */

/** Editar a ficha pela equipe. Só o nome é obrigatório. */
export function EditarCadastro({
  personId,
  ficha,
  dependentes,
}: {
  personId: string;
  ficha: CadastroDoContato["ficha"];
  dependentes: CadastroDoContato["dependentes"];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl">
          <Pencil className="mr-1 h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dados cadastrais</DialogTitle>
          <DialogDescription>
            Só o nome é obrigatório aqui. O cliente, pelo link, preenche tudo.
          </DialogDescription>
        </DialogHeader>

        <FormularioDoCadastro
          modo="parcial"
          inicial={ficha}
          dependentes={dependentes}
          enviar={(formData) => salvarCadastro(personId, formData)}
          aoGravar={() => setAberto(false)}
          rotuloDoEnvio="Salvar"
          rotuloEnviando="Salvando..."
          rodape={
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

/** Gera o link — o primeiro, ou um novo que mata o anterior. */
export function GerarLink({ personId, novo }: { personId: string; novo: boolean }) {
  return (
    <form action={comAviso(gerarLink)}>
      <input type="hidden" name="person_id" value={personId} />
      <SubmitButton
        pendente="Gerando..."
        size="sm"
        className="rounded-xl"
        icone={<Link2 className="h-4 w-4" />}
      >
        {novo ? "Gerar novo link" : "Gerar link da ficha"}
      </SubmitButton>
    </form>
  );
}

/** O link em aberto: o endereço, copiar, WhatsApp e cancelar. */
export function LinkAberto({
  id,
  url,
  whatsapp,
}: {
  id: string;
  url: string;
  /** Conversa do contato com a mensagem pronta. Nulo quando não há telefone. */
  whatsapp: string | null;
}) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      // Sem permissão de área de transferência: o campo está ali para copiar à mão.
      toast.error("Não foi possível copiar. Selecione o link e copie.");
    }
  }

  return (
    <div className="space-y-2">
      <Input
        readOnly
        value={url}
        aria-label="Link da ficha de cadastro"
        className="rounded-xl font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="rounded-xl" onClick={copiar}>
          <Copy className="mr-1 h-4 w-4" />
          Copiar
        </Button>
        {whatsapp ? (
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            {/* Abre a conversa com o texto pronto; quem envia é a equipe. */}
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1 h-4 w-4" />
              Abrir no WhatsApp
            </a>
          </Button>
        ) : null}
        <form action={comAviso(cancelarLink)}>
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="rounded-xl text-muted-foreground"
          >
            <X className="mr-1 h-4 w-4" />
            Cancelar link
          </Button>
        </form>
      </div>
    </div>
  );
}

/** "Conferi": tira a ficha recebida dos avisos da tela Início. */
export function Conferir({ id }: { id: string }) {
  return (
    <form action={comAviso(marcarConferida)}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        pendente="Marcando..."
        size="sm"
        className="rounded-xl"
        icone={<Check className="h-4 w-4" />}
      >
        Conferi
      </SubmitButton>
    </form>
  );
}
