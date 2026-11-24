/**
 * "via ‹parceiro›": o contato ao lado é o do parceiro, não o do cliente
 * (PAR-6). Junto do contato nas listas (Clientes, Contatos) e do nome do
 * cliente no Financeiro.
 */
export function ViaDoParceiro({ nome }: { nome: string }) {
  return <span className="text-xs text-muted-foreground">via {nome}</span>;
}
