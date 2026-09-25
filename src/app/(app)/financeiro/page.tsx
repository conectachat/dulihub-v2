import { SectionHeader } from "@/components/page-header";

import { ListaDoFinanceiro } from "./lista";

export const metadata = { title: "Financeiro — Duli Hub" };

/**
 * Casca sem dado nenhum: o conteúdo é montado no navegador, a partir do
 * aparelho.
 *
 * É o que permite ao service worker guardar esta rota e abri-la sem
 * internet — e é o oposto do que derrubou o app antigo, que guardava página
 * **com** conteúdo e servia versão velha como atual.
 */
export default function FinanceiroPage() {
  return (
    <div className="space-y-6 p-6">
      <SectionHeader
        title="Financeiro"
        description="O que os clientes devem, o que venceu e o que entrou no mês."
      />
      <ListaDoFinanceiro />
    </div>
  );
}
