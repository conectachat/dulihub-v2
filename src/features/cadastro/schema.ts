import { cpfValido, soDigitos } from "@/lib/documentos";
import { hojeEmSaoPaulo } from "@/lib/formatar";

/**
 * A ficha de cadastro: os campos, as listas e a tradução do formulário.
 *
 * É o "FORMULÁRIO DE CADASTRO" em PDF que o Renato mandava pelo WhatsApp,
 * campo por campo. As mesmas regras estão no banco (`salvar_cadastro`, 0035),
 * que é quem garante; aqui elas existem para o erro aparecer **no campo**,
 * antes do envio.
 *
 * Sem Zod de propósito: a ficha tem dois modos (o lead preenche tudo, a equipe
 * completa aos poucos) e devolve erro por campo — um laço sobre a lista diz
 * isso em menos linhas do que dois esquemas e um tradutor de erro.
 */

/** A lista fechada da 0035 (`private.campos_da_ficha`). Tem de bater. */
export const CAMPOS_DA_FICHA = [
  "full_name",
  "birth_date",
  "gender",
  "marital_status",
  "birthplace",
  "nationality",
  "tax_id",
  "national_id",
  "national_id_issuer",
  "email",
  "phone_country_code",
  "phone",
  "address_street",
  "address_number",
  "address_complement",
  "address_district",
  "address_city",
  "address_state",
  "address_country",
  "address_postal_code",
] as const;

export type CampoDaFicha = (typeof CAMPOS_DA_FICHA)[number];

/** O que pode ficar em branco mesmo na ficha do lead. */
const OPCIONAIS: readonly CampoDaFicha[] = ["address_complement", "phone_country_code"];

// Valores em português porque é o que o cadastro antigo já guardava nestas
// colunas (`masculino`, `solteiro`). Trocar agora seria migrar dado à toa.
export const SEXOS = {
  masculino: "Masculino",
  feminino: "Feminino",
} as const;

export const ESTADOS_CIVIS = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  uniao_estavel: "União estável",
  divorciado: "Divorciado(a)",
  separado: "Separado(a)",
  viuvo: "Viúvo(a)",
} as const;

export const RELACIONAMENTOS = {
  spouse: "Cônjuge",
  child: "Filho(a)",
  other: "Outro",
} as const;

export const MAXIMO_DE_DEPENDENTES = 10;

export type Dependente = {
  full_name: string;
  relationship: keyof typeof RELACIONAMENTOS;
  birth_date: string;
  birth_country: string;
};

export type DadosDaFicha = Record<CampoDaFicha, string | null> & {
  dependents: Dependente[];
};

export type FichaTraduzida =
  | { ok: true; dados: DadosDaFicha }
  | { ok: false; erro: string; campos: Record<string, string> };

/** Vazio vira nulo: é o que apaga a coluna em vez de gravar `""`. */
function texto(valor: FormDataEntryValue | null | undefined): string | null {
  const aparado = typeof valor === "string" ? valor.trim() : "";
  return aparado === "" ? null : aparado;
}

/** `AAAA-MM-DD` que existe no calendário, entre 1900 e hoje. */
function nascimentoValido(data: string, hoje: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split("-").map(Number);
  const real = new Date(Date.UTC(ano, mes - 1, dia));
  // 31 de fevereiro vira março: se não voltou igual, a data não existe.
  if (real.toISOString().slice(0, 10) !== data) return false;
  return data >= "1900-01-01" && data <= hoje;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ehBrasil = (pais: string | null) =>
  pais !== null && ["brasil", "brazil"].includes(pais.toLowerCase());

/**
 * Do formulário para o objeto que `salvar_cadastro` recebe.
 *
 * `completa` é a porta do lead: tudo obrigatório, menos complemento e DDI.
 * `parcial` é a da equipe: só o nome — mas o que for preenchido ainda precisa
 * estar certo.
 *
 * Os dependentes vêm em quatro campos repetidos (`dep_full_name`, …), uma
 * posição por linha da tela. Linha toda em branco é ignorada; linha começada
 * exige os quatro.
 */
export function fichaDoFormulario(
  formData: FormData,
  modo: "completa" | "parcial",
  hoje: string = hojeEmSaoPaulo(),
): FichaTraduzida {
  const dados = {} as Record<CampoDaFicha, string | null>;
  const campos: Record<string, string> = {};

  for (const campo of CAMPOS_DA_FICHA) {
    const valor = texto(formData.get(campo));
    dados[campo] = valor;

    if (valor === null) {
      const obrigatorio =
        campo === "full_name" || (modo === "completa" && !OPCIONAIS.includes(campo));
      if (obrigatorio) campos[campo] = "Preencha este campo";
    } else if (valor.length > 200) {
      campos[campo] = "Texto longo demais";
    }
  }

  const conferir = (campo: CampoDaFicha, certo: (valor: string) => boolean, erro: string) => {
    const valor = dados[campo];
    if (valor !== null && !campos[campo] && !certo(valor)) campos[campo] = erro;
  };

  conferir("tax_id", cpfValido, "CPF inválido — confira os números");
  conferir("birth_date", (d) => nascimentoValido(d, hoje), "Data de nascimento inválida");
  conferir("gender", (v) => v in SEXOS, "Escolha uma opção");
  conferir("marital_status", (v) => v in ESTADOS_CIVIS, "Escolha uma opção");
  conferir("email", (v) => EMAIL.test(v), "E-mail inválido");
  conferir(
    "address_postal_code",
    (v) => !ehBrasil(dados.address_country) || soDigitos(v).length === 8,
    "CEP precisa ter 8 dígitos",
  );

  // Só os dígitos: a máscara é da tela.
  if (dados.tax_id !== null && !campos.tax_id) dados.tax_id = soDigitos(dados.tax_id);

  // ---------------------------------------------------------------- dependentes
  const nomes = formData.getAll("dep_full_name");
  const relacoes = formData.getAll("dep_relationship");
  const nascimentos = formData.getAll("dep_birth_date");
  const paises = formData.getAll("dep_birth_country");
  const linhas = Math.max(nomes.length, relacoes.length, nascimentos.length, paises.length);

  const dependents: Dependente[] = [];
  for (let i = 0; i < linhas; i += 1) {
    const nome = texto(nomes[i]);
    const relacao = texto(relacoes[i]);
    const nascimento = texto(nascimentos[i]);
    const pais = texto(paises[i]);

    if (!nome && !relacao && !nascimento && !pais) continue;

    if (
      !nome ||
      !pais ||
      !relacao ||
      !nascimento ||
      nome.length > 200 ||
      pais.length > 100 ||
      !(relacao in RELACIONAMENTOS) ||
      !nascimentoValido(nascimento, hoje)
    ) {
      campos[`dependents.${i}`] =
        "Preencha nome, relacionamento, data de nascimento e país";
      continue;
    }

    dependents.push({
      full_name: nome,
      relationship: relacao as Dependente["relationship"],
      birth_date: nascimento,
      birth_country: pais,
    });
  }

  if (dependents.length > MAXIMO_DE_DEPENDENTES) {
    campos.dependents = `No máximo ${MAXIMO_DE_DEPENDENTES} dependentes`;
  }

  if (Object.keys(campos).length > 0) {
    return { ok: false, erro: "Confira os campos destacados.", campos };
  }

  return { ok: true, dados: { ...dados, dependents } };
}
