/**
 * Paleta fixa para o que a equipe colore à mão: tag, status de etapa, e o que
 * vier depois.
 *
 * Lista fechada em vez de seletor livre de cor por dois motivos: mantém a
 * leitura consistente entre telas, e evita tons que somem no fundo claro ou no
 * escuro. Todas saem do manual da marca ou são vizinhas diretas dele.
 *
 * Mora fora de `features/` de propósito — um módulo `"use server"` só pode
 * exportar funções assíncronas, e exportar a paleta de um arquivo de ações
 * quebra o carregamento de TODAS as Server Actions do mesmo grupo de rotas.
 */
export const PALETTE = [
  "#8a97aa", // azul-cinza da marca
  "#c4341f", // vermelho da marca
  "#ff6600", // laranja oficial
  "#ffc24d", // âmbar
  "#0e7c6b", // verde da marca
  "#00a6a6", // teal
  "#1f5aa8", // azul médio
  "#022b64", // navy oficial
  "#8fa3c0", // azul claro
] as const;

export const DEFAULT_COLOR = PALETTE[0];
