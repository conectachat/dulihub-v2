import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Configuração — Duli Hub" };

export default function ConfiguracoesPage() {
  return (
    <ComingSoon
      title="Configuração"
      description="Funil, tipos de visto, produtos, equipe e parceiros."
      phase="Fases 1 a 4"
      items={[
        "Etapas do funil: criar, renomear e reordenar",
        "Tipos de visto, com etapas e documentos exigidos por tipo",
        "Catálogo de produtos e preços",
        "Usuários da equipe e permissões",
        "Parceiros, com marca própria que o cliente deles enxerga",
      ]}
    />
  );
}
