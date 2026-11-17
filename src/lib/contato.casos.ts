import type { Contato } from "./contato";

/**
 * A mesma lista prova o TypeScript (`contato.test.ts`) e o banco
 * (`private.contato_valido`, na paridade de `tests/rls/oportunidade-nova.test.ts`):
 * se as duas regras divergirem, a tela aceita o que o banco recusa — ou o
 * contrário, e o erro chega cru.
 *
 * Cada caso tem um e-mail diferente dos outros, para a paridade no banco não
 * achar "parecido" entre dois casos da mesma rodada.
 */
export const CASOS_DE_CONTATO: { nome: string; contato: Contato; erro: string | null }[] = [
  {
    nome: "completo",
    contato: { email: "caso1@teste.dulihub", ddi: "+55", telefone: "31 99999-0001" },
    erro: null,
  },
  {
    nome: "e-mail com espaço, tab e maiúscula",
    contato: { email: "\t Caso2@Teste.Dulihub ", ddi: "+55", telefone: "31999990002" },
    erro: null,
  },
  {
    nome: "DDI sem o mais",
    contato: { email: "caso3@teste.dulihub", ddi: "55", telefone: "31999990003" },
    erro: null,
  },
  {
    nome: "sem e-mail",
    contato: { email: "", ddi: "+55", telefone: "31999990004" },
    erro: "Informe o e-mail",
  },
  {
    nome: "e-mail sem domínio",
    contato: { email: "caso5@teste", ddi: "+55", telefone: "31999990005" },
    erro: "E-mail inválido",
  },
  {
    nome: "sem DDI",
    contato: { email: "caso6@teste.dulihub", ddi: "", telefone: "31999990006" },
    erro: "Informe o DDI",
  },
  {
    nome: "DDI com letra",
    contato: { email: "caso7@teste.dulihub", ddi: "+5a", telefone: "31999990007" },
    erro: "DDI inválido (ex.: +55)",
  },
  {
    nome: "sem telefone",
    contato: { email: "caso8@teste.dulihub", ddi: "+55", telefone: "" },
    erro: "Informe o telefone",
  },
  {
    nome: "telefone curto (7 dígitos)",
    contato: { email: "caso9@teste.dulihub", ddi: "+55", telefone: "9999-000" },
    erro: "O telefone precisa ter de 8 a 15 dígitos",
  },
  {
    nome: "telefone longo (16 dígitos)",
    contato: { email: "caso10@teste.dulihub", ddi: "+1", telefone: "1234567890123456" },
    erro: "O telefone precisa ter de 8 a 15 dígitos",
  },
  {
    nome: "EUA",
    contato: { email: "caso11@teste.dulihub", ddi: "+1", telefone: "(305) 555-0111" },
    erro: null,
  },
  {
    nome: "NBSP em volta",
    contato: { email: "\u00a0caso12@teste.dulihub\u00a0", ddi: "\u00a0+55", telefone: "31999990012\u00a0" },
    erro: null,
  },
];
