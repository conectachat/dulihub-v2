import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Projetos — Duli Hub" };

export default function ProjetosPage() {
  return (
    <ComingSoon
      title="Projetos"
      description="Processos de visto: etapas, documentos e acompanhamento."
      phase="Fase 2"
      items={[
        "Tipos de visto com modelo de etapas e documentos exigidos",
        "Projeto criado a partir do modelo, com as etapas já montadas",
        "Upload de documento pelo cliente, com status em análise",
        "Prévia, aprovação e recusa com justificativa",
        "Notificação para a Duli a cada documento enviado",
      ]}
    />
  );
}
