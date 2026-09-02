/**
 * Paleta fixa das tags.
 *
 * Mora em arquivo separado das ações porque um módulo `"use server"` só pode
 * exportar funções assíncronas — exportar uma constante dali quebra o
 * carregamento de TODAS as Server Actions do mesmo grupo de rotas, não só de
 * quem usa a constante.
 *
 * Escolher de uma lista, em vez de seletor livre de cor, mantém a leitura
 * consistente e evita tons que somem no tema claro ou no escuro.
 */
export const TAG_COLORS = [
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
