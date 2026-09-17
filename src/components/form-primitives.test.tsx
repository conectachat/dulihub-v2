import { render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";

import { FieldError } from "./field-error";
import { SubmitButton } from "./submit-button";

/**
 * Os dois existiam em dez cópias cada. A cópia não era o problema; o problema
 * é que qualquer ajuste — cor do erro, texto de espera, leitor de tela —
 * precisaria acontecer dez vezes, e nunca acontece.
 */

describe("SubmitButton", () => {
  it("envia o formulário e mostra o rótulo parado", () => {
    render(
      <form>
        <SubmitButton pendente="Criando...">Criar pasta</SubmitButton>
      </form>,
    );

    const botao = screen.getByRole("button", { name: "Criar pasta" });
    expect(botao).toHaveAttribute("type", "submit");
    expect(botao).not.toBeDisabled();
  });

  it("aceita ícone sem mudar o nome acessível", () => {
    render(
      <form>
        <SubmitButton pendente="Criando..." icone={Plus}>
          Criar
        </SubmitButton>
      </form>,
    );

    expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
  });
});

describe("FieldError", () => {
  it("não renderiza nada sem mensagem", () => {
    // Um `role="alert"` vazio no DOM é anunciado por leitor de tela como
    // alerta sem conteúdo.
    const { container } = render(<FieldError mensagem={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("anuncia a mensagem como alerta", () => {
    render(<FieldError mensagem="Já existe uma tag com esse nome" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Já existe uma tag com esse nome",
    );
  });
});
