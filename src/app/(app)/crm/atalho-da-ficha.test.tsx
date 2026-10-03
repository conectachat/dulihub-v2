import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AtalhoDaFicha } from "./atalho-da-ficha";

/**
 * O atalho do cartão do CRM para a ficha de cadastro. É por ele que o Renato
 * chega ao link quando o lead diz que fecha — e é nele que o quadro mostra,
 * sem abrir o contato, se a ficha já voltou.
 */
describe("AtalhoDaFicha", () => {
  it.each([
    ["sem-link", "Enviar ficha de cadastro"],
    ["aguardando", "Ficha enviada · aguardando o cliente"],
    ["expirada", "Link da ficha expirou · gerar outro"],
    ["recebida", "Ficha recebida · conferir"],
    ["conferida", "Ficha conferida"],
  ] as const)("%s: diz o estado e leva aos dados cadastrais", (situacao, texto) => {
    render(<AtalhoDaFicha href="/crm/n1#dados-cadastrais" situacao={situacao} />);

    const atalho = screen.getByRole("link", { name: new RegExp(texto) });
    expect(atalho.getAttribute("href")).toBe("/crm/n1#dados-cadastrais");
  });
});
