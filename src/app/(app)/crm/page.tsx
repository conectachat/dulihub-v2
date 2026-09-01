import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "CRM — Duli Hub" };

export default function CrmPage() {
  return (
    <ComingSoon
      title="CRM"
      description="Funil de oportunidades: do primeiro contato ao contrato fechado."
      phase="Fase 1"
      items={[
        "Quadro do funil, arrastando a oportunidade entre etapas",
        "Etapas configuráveis — hoje só Novo Lead, Ganho e Perdido; as do meio você cria",
        "Valor e moeda por oportunidade, em real ou dólar",
        "Produtos vinculados, com o preço congelado no momento da negociação",
        "Histórico de atividades e notas, presos à pessoa e não ao estágio",
      ]}
    />
  );
}
