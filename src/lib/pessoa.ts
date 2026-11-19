/**
 * Para onde vai o link de uma pessoa — puro, testado em `pessoa.test.ts`.
 *
 * Cliente mora em `/clientes/<id>`, com abas (CLI-2); quem não é cliente, no
 * perfil enxuto de `/contatos/<id>`. Toda tela que aponta para uma pessoa
 * passa por `enderecoDaPessoa`, para o endereço mudar num lugar só.
 *
 * As duas rotas decidem **só** pelo estágio, nunca pela lixeira: o cliente
 * vai à lixeira por `softDeletePerson`, que não olha o estágio, e filtrar a
 * lixeira num dos lados daria "não encontrado" ou um laço de redirecionamento.
 */

export const ABAS_DO_PERFIL = ["dados", "financeiro", "projetos", "documentos", "notas"] as const;

export type AbaDoPerfil = (typeof ABAS_DO_PERFIL)[number];

/**
 * O endereço da pessoa. No perfil enxuto não há abas: a de dados vira a
 * âncora do cartão `#dados-cadastrais`, e as outras não existem lá.
 */
export function enderecoDaPessoa(id: string, estagio: string, aba?: AbaDoPerfil): string {
  if (estagio === "client") return aba ? `/clientes/${id}?aba=${aba}` : `/clientes/${id}`;
  return aba === "dados" ? `/contatos/${id}#dados-cadastrais` : `/contatos/${id}`;
}

/**
 * O `redirect` de `/contatos/<cliente>` para o perfil de cliente, levando a
 * query junto. O atalho `novo-processo` (CRM) abre a aba Projetos, onde mora
 * o diálogo.
 *
 * A âncora (`#dados-cadastrais`) não passa: o navegador nunca a manda ao
 * servidor. Ela não se perde — o navegador a reaplica no destino, e a aba
 * padrão do perfil de cliente é justamente Dados.
 */
export function destinoDoContato(
  id: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const sp = new URLSearchParams();
  const atalho = query["novo-processo"] !== undefined;
  if (atalho) sp.set("aba", "projetos");

  for (const [chave, valor] of Object.entries(query)) {
    if (valor === undefined || (atalho && chave === "aba")) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) sp.append(chave, v);
  }

  const qs = sp.toString();
  return qs ? `/clientes/${id}?${qs}` : `/clientes/${id}`;
}

/** No perfil de cliente: nulo para ficar, ou para onde mandar quem não é cliente. */
export function destinoDoPerfil(pessoa: {
  id: string;
  lifecycle_stage: string;
  deleted_at: string | null;
}): string | null {
  return pessoa.lifecycle_stage === "client" ? null : `/contatos/${pessoa.id}`;
}
