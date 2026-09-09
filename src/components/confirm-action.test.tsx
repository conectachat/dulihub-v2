import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmAction } from "./confirm-action";

/**
 * Este componente é a última coisa entre um clique e a perda definitiva de um
 * registro. Quatro comportamentos importam, e nenhum deles era verificado:
 * o diálogo abre, nada acontece antes do "Excluir", a consequência é lida, e a
 * recusa fica visível dentro do diálogo em vez de sumir num aviso flutuante.
 *
 * Usa `fireEvent` e não `user-event` para não acrescentar dependência: aqui
 * basta o clique, e o pacote de eventos só valeria para gesto composto.
 */

const props = {
  hidden: { id: "abc" },
  title: "Excluir “Rendimentos”?",
  consequence: "Isso apaga também as 3 pastas que estão dentro dela.",
  triggerLabel: "Excluir Rendimentos",
};

const gatilho = () => screen.getByRole("button", { name: props.triggerLabel });

/** Ação de mentira que guarda o que recebeu, para o teste conferir depois. */
function acaoFalsa(resposta: { error: string | null }) {
  const enviados: FormData[] = [];
  const fn = vi.fn(async (formData: FormData) => {
    enviados.push(formData);
    return resposta;
  });
  return { fn, enviados };
}

describe("ConfirmAction", () => {
  it("não dispara a ação só por clicar no gatilho", async () => {
    const acao = acaoFalsa({ error: null });
    render(<ConfirmAction {...props} action={acao.fn} />);

    fireEvent.click(gatilho());

    expect(acao.fn).not.toHaveBeenCalled();
    expect(await screen.findByText(props.consequence)).toBeInTheDocument();
  });

  it("dispara a ação depois da confirmação, com os campos escondidos", async () => {
    const acao = acaoFalsa({ error: null });
    render(<ConfirmAction {...props} action={acao.fn} />);

    fireEvent.click(gatilho());
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));

    await vi.waitFor(() => expect(acao.fn).toHaveBeenCalledTimes(1));
    expect(acao.enviados[0].get("id")).toBe("abc");
  });

  it("mostra a recusa dentro do diálogo, que continua aberto", async () => {
    // O caminho que o toast estragaria: aviso flutuante some sozinho e deixa
    // o diálogo aberto sem explicação nenhuma.
    const acao = acaoFalsa({ error: "Há 2 negócios nesta etapa." });
    render(<ConfirmAction {...props} action={acao.fn} />);

    fireEvent.click(gatilho());
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Há 2 negócios nesta etapa.",
    );
    expect(screen.getByText(props.title)).toBeInTheDocument();
  });

  it("não deixa clicar quando está bloqueado, e diz por quê", () => {
    const acao = acaoFalsa({ error: null });
    render(
      <ConfirmAction
        {...props}
        action={acao.fn}
        disabled
        disabledReason="Mova os negócios desta etapa antes de excluí-la"
      />,
    );

    expect(gatilho()).toBeDisabled();
    expect(gatilho()).toHaveAttribute(
      "title",
      "Mova os negócios desta etapa antes de excluí-la",
    );
  });
});
