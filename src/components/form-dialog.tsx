"use client";

import { startTransition, useState } from "react";

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
import { useFormulario } from "@/lib/use-formulario";

/** O que o aviso pode fazer: fechar o diálogo, ou reenviar com confirmação. */
export type AcoesDoAviso = {
  fechar: () => void;
  reenviarCom: (extra: Record<string, string>) => void;
};

type Acao<E extends ActionState> = (anterior: E, formData: FormData) => Promise<E>;

/**
 * Diálogo de criar ou editar: gatilho, cabeçalho, formulário, erro e rodapé.
 *
 * Contato, oportunidade e tipo de visto repetiam tudo isto e só diferiam nos
 * campos. Aqui fica a parte que precisa ser igual em todos — e que, repetida,
 * já tinha começado a divergir no texto do botão e na largura.
 *
 * Quatro regras que o componente garante e que cada cópia precisava lembrar:
 *
 * - **Fecha só quando gravou.** A ação é embrulhada e, quando a resposta tem
 *   `ok`, fecha o diálogo dentro da transição — nem `setState` do pai
 *   durante a renderização do filho, nem `useEffect`. Um diálogo que fecha
 *   na recusa leva o erro junto, e a pessoa não sabe por que o contato não
 *   apareceu na lista. E a recusa não apaga o que foi digitado: o envio é
 *   por `useFormulario` (G4 da revisão de novembro).
 * - **O erro fica dentro do formulário**, acima dos botões, onde o olho está.
 *   O `aviso`, quando há, fica logo acima do erro: é a pergunta que a ação
 *   devolveu sem gravar (CON-4), com a confirmação por `reenviarCom`.
 * - **Reabrir começa do zero.** O estado do formulário vive num componente
 *   interno com `key` nova a cada abertura: nenhum valor digitado nem aviso
 *   velho sobrevive de uma abertura para outra.
 * - Efeito colateral disso: fechar o diálogo no meio de uma gravação descarta
 *   a resposta — inclusive um erro. A gravação em si continua no servidor.
 */
export function FormDialog<E extends ActionState = ActionState>({
  acao,
  gatilho,
  titulo,
  descricao,
  salvar = "Salvar",
  pendente = "Salvando...",
  abertoDeInicio = false,
  aviso,
  aoAbrir,
  children,
}: {
  acao: Acao<E>;
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
  /** A pergunta que a ação devolveu sem gravar, desenhada acima do erro. */
  aviso?: (estado: E, acoes: AcoesDoAviso) => React.ReactNode;
  /**
   * A cada abertura — para quem guarda estado fora do formulário (o contato
   * escolhido num aviso) voltar ao começo junto com ele.
   */
  aoAbrir?: () => void;
  /** Os campos. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(abertoDeInicio);
  const [abertura, setAbertura] = useState(0);

  function mudarAbertura(aberto: boolean) {
    if (aberto) {
      setAbertura((n) => n + 1);
      aoAbrir?.();
    }
    setOpen(aberto);
  }

  return (
    <Dialog open={open} onOpenChange={mudarAbertura}>
      <DialogTrigger asChild>{gatilho}</DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        </DialogHeader>

        <CorpoDoFormulario
          key={abertura}
          acao={acao}
          fechar={() => setOpen(false)}
          aviso={aviso}
          salvar={salvar}
          pendente={pendente}
        >
          {children}
        </CorpoDoFormulario>
      </DialogContent>
    </Dialog>
  );
}

function CorpoDoFormulario<E extends ActionState>({
  acao,
  fechar,
  aviso,
  salvar,
  pendente,
  children,
}: {
  acao: Acao<E>;
  fechar: () => void;
  aviso?: (estado: E, acoes: AcoesDoAviso) => React.ReactNode;
  salvar: string;
  pendente: string;
  children: React.ReactNode;
}) {
  // Estado, não `ref`: o aviso é desenhado com `reenviarCom`, e ler `ref`
  // durante o desenho é o que o compilador do React proíbe.
  const [formulario, setFormulario] = useState<HTMLFormElement | null>(null);

  async function acaoQueFecha(anterior: E, dados: FormData): Promise<E> {
    const resposta = await acao(anterior, dados);
    if (resposta.ok) startTransition(() => fechar());
    return resposta;
  }

  const { estado, enviar, reenviarCom, enviando } = useFormulario<E>(acaoQueFecha);

  const acoes: AcoesDoAviso = {
    fechar,
    reenviarCom: (extra) => {
      if (formulario) reenviarCom(formulario, extra);
    },
  };

  return (
    <form ref={setFormulario} onSubmit={enviar} className="space-y-4">
      {children}

      {aviso ? aviso(estado, acoes) : null}

      <FieldError mensagem={estado.error} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={fechar}>
          Cancelar
        </Button>
        <SubmitButton pendente={pendente} enviando={enviando}>
          {salvar}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
