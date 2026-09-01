import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Financeiro — Duli Hub" };

export default function FinanceiroPage() {
  return (
    <ComingSoon
      title="Financeiro"
      description="Receita por processo e gestão financeira da empresa."
      phase="Fase 3"
      items={[
        "Contas a pagar, despesas, fornecedores e fluxo de caixa — sem depender de banco",
        "Link de proposta que gera cadastro, contrato no ZapSign e acesso do cliente",
        "Cobrança por link C6 e boleto Itaú, com baixa automática",
        "Emissão de nota fiscal ou invoice após o pagamento",
        "Projeção de recebimentos e pagamentos",
      ]}
    />
  );
}
