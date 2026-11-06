"use client";

import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/lib/action-state";
import { useDialogOnSuccess } from "@/lib/use-dialog-on-success";
import { useFormulario } from "@/lib/use-formulario";

/**
 * Diálogo de criar ou editar: gatilho, cabeçalho, formulário, erro e rodapé.
 *
 * Contato, oportunidade e tipo de visto repetiam tudo isto e só diferiam nos
 * campos. Aqui fica a parte que precisa ser igual em todos — e que, repetida,
 * já tinha começado a divergir no texto do botão e na largura.
 *
 * Três regras que o componente garante e que cada cópia precisava lembrar:
 *
 * - **Fecha só quando gravou.** `useDialogOnSuccess` olha `ok`; um diálogo
 *   que fecha na recusa leva o erro junto, e a pessoa não sabe por que o
 *   contato não apareceu na lista. E a recusa não apaga o que foi digitado:
 *   o envio é por `useFormulario` (G4 da revisão de novembro).
 * - **O erro fica dentro do formulário**, acima dos botões, onde o olho está.
 * - **Campos voltam limpos ao reabrir**: o Radix desmonta o conteúdo ao
 *   fechar, então nenhum valor digitado sobrevive de uma abertura para outra.
 */
export function FormDialog({
  acao,
  gatilho,
  titulo,
  descricao,
  salvar = "Salvar",
  pendente = "Salvando...",
  abertoDeInicio = false,
  children,
}: {
  acao: (anterior: ActionState, formData: FormData) => Promise<ActionState>;
  /** O botão que abre. Vai dentro de `DialogTrigger asChild`. */
  gatilho: React.ReactNode;
  titulo: string;
  descricao?: string;
  salvar?: string;
  pendente?: string;
  /**
   * Abre já na primeira pintura — para links que levam direto ao formulário,
   * como o atalho do CRM para "Novo processo".
   */
  abertoDeInicio?: boolean;
  /** Os campos. */
  children: React.ReactNode;
}) {
  const { estado, enviar, enviando } = useFormulario(acao);
  const { open, setOpen } = useDialogOnSuccess(estado, abertoDeInicio);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{gatilho}</DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          {children}

          <FieldError mensagem={estado.error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton pendente={pendente} enviando={enviando}>
              {salvar}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
