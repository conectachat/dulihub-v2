import {
  Building2,
  CircleDollarSign,
  FileStack,
  Flag,
  GitBranch,
  Handshake,
  ListChecks,
  Plug,
  Stamp,
  Tag,
  User,
  Users,
} from "lucide-react";

export type SettingsSection = {
  slug: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Descrição curta mostrada no topo da seção. */
  description: string;
  /** Fase do plano em que a seção ganha conteúdo real. */
  phase?: string;
  /** O que a seção vai permitir. Usado enquanto não está construída. */
  planned?: string[];
};

export type SettingsGroup = { label: string; items: SettingsSection[] };

/**
 * Registro único das seções de configuração.
 *
 * A barra lateral, o roteamento e a validação de slug saem todos daqui — uma
 * seção nova é uma entrada nesta lista, não uma edição em três arquivos.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Conta",
    items: [
      {
        slug: "geral",
        label: "Geral",
        icon: User,
        description: "Seu perfil e a organização em que você trabalha.",
      },
    ],
  },
  {
    label: "Empresa",
    items: [
      {
        slug: "usuarios",
        label: "Usuários",
        icon: Users,
        description: "Quem tem acesso ao sistema e com qual permissão.",
        phase: "Fase 4",
        planned: [
          "Convidar usuário por email",
          "Papéis: proprietário, administrador e colaborador",
          "Remover acesso sem apagar o histórico do que a pessoa fez",
        ],
      },
      {
        slug: "parceiros",
        label: "Parceiros",
        icon: Handshake,
        description:
          "Empresas que vendem e contratam a Duli para executar o processo.",
        phase: "Fase 7",
        planned: [
          "Cadastro do parceiro como organização própria",
          "Marca do parceiro — logo e cores que o cliente dele enxerga",
          "Alocação: parceiro marca a Duli para trabalhar num cliente",
          "Financeiro de dois lados: o que ele cobra do cliente é privado dele",
        ],
      },
    ],
  },
  {
    label: "CRM",
    items: [
      {
        slug: "etapas-do-funil",
        label: "Etapas do funil",
        icon: GitBranch,
        description:
          "As colunas do quadro de oportunidades, na ordem em que você trabalha.",
      },
      {
        slug: "tags",
        label: "Tags",
        icon: Tag,
        description: "Marcadores livres para classificar contatos.",
        phase: "Fase 1",
        planned: [
          "Criar, renomear e escolher cor",
          "Aplicar em contatos e filtrar a lista por elas",
          "Mesclar duas tags que viraram a mesma coisa",
        ],
      },
    ],
  },
  {
    label: "Processos",
    items: [
      {
        slug: "tipos-de-visto",
        label: "Tipos de visto",
        icon: Stamp,
        description:
          "Cada tipo de visto define as etapas e os documentos que o processo exige.",
        phase: "Fase 2",
        planned: [
          "Cadastro do tipo de visto (EB-1A, EB-2 NIW, O-1...)",
          "Modelo de etapas que o processo percorre",
          "Documentos exigidos por etapa, com prazo",
          "Ao criar um processo, o modelo é copiado — mudar o modelo depois não altera processos em andamento",
        ],
      },
      {
        slug: "categorias-de-documento",
        label: "Categorias de documento",
        icon: FileStack,
        description: "Como os documentos do cliente são agrupados e cobrados.",
        phase: "Fase 2",
        planned: [
          "Categorias e subcategorias, com hierarquia",
          "Marcar quais são obrigatórias",
          "Prazo limite por categoria",
        ],
      },
      {
        slug: "status-de-etapas",
        label: "Status de etapas",
        icon: ListChecks,
        description:
          "Os estados que uma etapa do processo pode assumir, e a cor de cada um.",
        phase: "Fase 2",
        planned: [
          "Criar estados próprios além de pendente, em andamento e concluído",
          "Cor por estado, para leitura rápida no acompanhamento",
          "Marcar quais estados contam como etapa concluída",
        ],
      },
    ],
  },
  {
    label: "Tarefas",
    items: [
      {
        slug: "tipos-de-tarefa",
        label: "Tipos de tarefa",
        icon: ListChecks,
        description: "Categorias das tarefas da equipe.",
        phase: "Fase 4",
        planned: [
          "Criar tipos próprios (ligação, revisão, envio, follow-up)",
          "Cor e ícone por tipo",
        ],
      },
      {
        slug: "prioridades",
        label: "Prioridades",
        icon: Flag,
        description: "Níveis de urgência das tarefas.",
        phase: "Fase 4",
        planned: [
          "Criar e ordenar níveis próprios",
          "Cor por nível",
          "Definir qual é a prioridade padrão de tarefa nova",
        ],
      },
    ],
  },
  {
    label: "Financeiro",
    items: [
      {
        slug: "metodos-de-pagamento",
        label: "Métodos de pagamento",
        icon: CircleDollarSign,
        description: "Como o cliente pode pagar, e em qual moeda.",
        phase: "Fase 3",
        planned: [
          "Boleto, cartão parcelado, Pix e transferência",
          "Moeda aceita por método — real e dólar",
          "Número de parcelas permitido em cada um",
          "Qual conta bancária recebe",
        ],
      },
    ],
  },
  {
    label: "Integrações",
    items: [
      {
        slug: "integracoes",
        label: "Integrações",
        icon: Plug,
        description: "Serviços externos que o sistema conversa.",
        phase: "Fases 3 e 4",
        planned: [
          "ZapSign — geração e assinatura de contrato",
          "Itaú e C6 — boleto e link de pagamento",
          "Provedor de nota fiscal",
          "Google — agenda e email",
          "Calendly — agendamento",
        ],
      },
      {
        slug: "empresa",
        label: "Dados da empresa",
        icon: Building2,
        description: "Razão social, CNPJ e dados que entram no contrato.",
        phase: "Fase 3",
        planned: [
          "Razão social, CNPJ, endereço e contato",
          "Logo e cores usadas em documentos",
          "Dados fiscais para emissão de nota",
        ],
      },
    ],
  },
];

export const ALL_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap(
  (g) => g.items,
);

export function findSection(slug: string) {
  return ALL_SECTIONS.find((s) => s.slug === slug) ?? null;
}
