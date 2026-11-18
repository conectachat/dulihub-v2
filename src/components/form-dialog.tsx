"use client";

import { createContext, Fragment, startTransition, useContext, useState } from "react";

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

/**
 * O que o aviso pode fazer: fechar o diálogo, ou reenviar com confirmação —
 * uma vez por resposta. Durante um envio o aviso nem está na tela.
 */
export type AcoesDoAviso = {
  fechar: () => void;
  reenviarCom: (extra: Record<string, string>) => void;
};

type Acao<E extends ActionState> = (anterior: E, formData: FormData) => Promise<E>;

const DispensarAviso = createContext<(() => void) | null>(null);

/**
 * Para campo que muda o que vai ser enviado sem disparar `change` — um par de
 * botões que troca o modo, um "Trocar" que limpa a escolha. Chamado no clique,
 * tira o aviso da tela como uma edição faria.
 */
export function useDispensarAviso(): () => void {
  const dispensar = useContext(DispensarAviso);
  // Fora de um FormDialog não há aviso a tirar — e não fazer nada calado
  // desligaria a proteção sem ninguém perceber.
  if (!dispensar) throw new Error("useDispensarAviso só funciona dentro de um FormDialog.");
  return dispensar;
}

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

      {/* Altura máxima e rolagem própria: o Radix trava a rolagem da página,
          e no celular a oportunidade com contato novo passa da tela. */}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
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

  // O `useActionState` enfileira e roda todo envio — dois cliques em "Criar
  // mesmo assim" criavam dois contatos (revisão de 18/nov, I1). A proteção
  // principal é o aviso sair da tela durante o envio (`!enviando` abaixo);
  // esta marca é a segunda linha: a mesma resposta não se confirma duas vezes.
  // Guarda a própria resposta, não o `token`: cada envio devolve um objeto
  // novo, e uma resposta sem `token` não vira botão morto (revisão de 18/nov).
  const [confirmado, setConfirmado] = useState<E | null>(null);
  // Mexeu no formulário depois do último envio — inclusive com o envio ainda
  // em curso? Então o aviso na tela, ou o que ainda vai chegar, fala de um
  // valor que não é mais o da tela: some, e o próximo Salvar confere de novo.
  // Senão a confirmação levaria um valor que ninguém conferiu (I2).
  const [alterado, setAlterado] = useState(false);
  const dispensar = () => setAlterado(true);

  const acoes: AcoesDoAviso = {
    fechar,
    reenviarCom: (extra) => {
      if (!formulario || enviando || confirmado === estado) return;
      setConfirmado(estado);
      setAlterado(false);
      reenviarCom(formulario, extra);
    },
  };

  // Durante um envio, o aviso na tela é o da resposta anterior — vencido.
  const avisoNaTela = aviso && !alterado && !enviando ? aviso(estado, acoes) : null;

  return (
    <form
      ref={setFormulario}
      onSubmit={(evento) => {
        setAlterado(false);
        enviar(evento);
      }}
      onChange={dispensar}
      className="space-y-4"
    >
      <DispensarAviso.Provider value={dispensar}>{children}</DispensarAviso.Provider>

      {avisoNaTela ? <Fragment key={estado.token}>{avisoNaTela}</Fragment> : null}

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
