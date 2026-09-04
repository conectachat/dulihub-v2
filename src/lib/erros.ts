/**
 * Traduz falha do banco para uma frase que quem usa o app entende.
 *
 * Existia em três cópias, cada uma cobrindo um punhado diferente de casos, e
 * dez lugares não traduziam nada — mostravam o nome cru da constraint do
 * Postgres numa tela em português.
 *
 * **Chaveia por código, não por pedaço da mensagem.** As cópias antigas
 * comparavam substring, uma delas com a palavra `"fábrica"`: reescrever o texto
 * de um gatilho quebrava a tradução em silêncio, e nenhuma migration avisaria.
 * Código é contrato; texto é redação.
 *
 * **Nunca ecoa a mensagem crua como último recurso.** Um `23505` do Postgres
 * pode conter o valor em conflito — ou seja, o email de outro contato apareceria
 * na tela de quem não deveria vê-lo. O texto cru fica no log do servidor; a
 * pessoa recebe uma frase e um código curto.
 */

type FalhaDoBanco = {
  code?: string;
  message?: string;
  details?: string | null;
};

/**
 * Índices únicos do schema, com o que dizer quando cada um recusa.
 *
 * A lista precisa acompanhar as migrations. Os dois primeiros faltavam nas três
 * cópias antigas — ninguém tinha reparado que existiam.
 */
const POR_CONSTRAINT: Record<string, string> = {
  tags_org_name_unique: "Já existe uma tag com esse nome.",
  visa_types_org_name_unique: "Já existe um tipo de visto com esse nome.",
  stage_statuses_org_code_unique: "Já existe um status com esse nome.",
  stage_statuses_one_default:
    "Só pode haver um status padrão. Troque o atual antes de marcar outro.",
  pipeline_stages_one_won: "O funil já tem uma etapa de ganho.",
  pipeline_stages_one_lost: "O funil já tem uma etapa de perda.",
  pipelines_one_default: "A organização já tem um funil padrão.",
  people_user_unique: "Este acesso já está vinculado a outro contato.",
  people_legacy_id_unique: "Este registro já foi importado antes.",
  files_bucket_path_unique: "Já existe um arquivo com esse caminho.",
  organizations_single_root: "Já existe uma organização raiz.",
};

const POR_CODIGO: Record<string, string> = {
  // Gatilho nosso: a mensagem já vem em português e já é escrita para quem usa.
  "23001": "",
  "23503": "Existe registro dependendo deste. Remova o que depende primeiro.",
  "23514": "Os valores não são válidos juntos.",
  "42501": "Você não tem permissão para isto.",
  "P0002": "Registro não encontrado.",
  // Coluna que a aplicação pede e o banco não tem: é o cenário da 0011,
  // aplicação e banco fora de passo.
  "42703": "O sistema está fora de sincronia com o banco. Avise o suporte.",
  PGRST204: "O sistema está fora de sincronia com o banco. Avise o suporte.",
  PGRST301: "Sua sessão expirou. Entre de novo.",
};

/** Extrai o nome da constraint de uma mensagem de violação de unicidade. */
function nomeDaConstraint(mensagem: string): string | null {
  for (const nome of Object.keys(POR_CONSTRAINT)) {
    if (mensagem.includes(nome)) return nome;
  }
  return null;
}

export function traduzirErro(falha: FalhaDoBanco | null | undefined): string {
  if (!falha) return "Não foi possível concluir. Tente de novo.";

  const codigo = falha.code ?? "";
  const mensagem = falha.message ?? "";

  // Exceção levantada pelos nossos gatilhos: texto já pronto para o usuário.
  if (codigo === "23001" || codigo === "P0001") {
    return mensagem || "A operação não é permitida.";
  }

  if (codigo === "23505") {
    const nome = nomeDaConstraint(mensagem);
    if (nome) return POR_CONSTRAINT[nome];
    return "Já existe um registro com esses dados.";
  }

  const porCodigo = POR_CODIGO[codigo];
  if (porCodigo) return porCodigo;

  // Desconhecido: frase curta mais o código, que é opaco e não vaza dado de
  // ninguém. O texto cru fica no log do servidor.
  return codigo
    ? `Não foi possível concluir (${codigo}). Tente de novo.`
    : "Não foi possível concluir. Tente de novo.";
}

/**
 * Gravação que não tocou linha nenhuma.
 *
 * PostgREST aplica a RLS como filtro: linha que a policy esconde simplesmente
 * não casa no `update`/`delete`. Vem `error` nulo, zero linhas afetadas, e isso
 * é indistinguível de sucesso — que é justamente o que esta base não pode ter,
 * já que a separação entre organizações se apoia inteiramente na RLS.
 */
export const NADA_GRAVADO =
  "Nada foi alterado. O registro pode ter sido removido, ou você não tem permissão para alterá-lo.";
