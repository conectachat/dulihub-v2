/**
 * CPF e CEP — conferência e máscara, sem banco e sem rede.
 *
 * Mora em `lib/` porque a ficha pública (o lead) e a ficha do contato (a
 * equipe) usam as mesmas funções, e uma feature não importa de outra.
 *
 * O banco guarda o CPF **só com os dígitos**; a máscara é da tela. O cadastro
 * antigo guardou com máscara, então as funções daqui aceitam os dois.
 */

/** Só os algarismos. Nulo e indefinido viram texto vazio. */
export function soDigitos(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

/**
 * O CPF existe como número? Confere os dois dígitos verificadores.
 *
 * Sequência repetida (`111.111.111-11`) passa na conta e não é CPF de
 * ninguém — recusada à parte.
 */
export function cpfValido(texto: string | null | undefined): boolean {
  const cpf = soDigitos(texto);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (tamanho: number) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/**
 * `529.982.247-25`. O que não tem 11 dígitos volta como está: melhor ver o
 * dado torto do cadastro antigo do que escondê-lo atrás de uma máscara.
 */
export function formatarCpf(texto: string | null | undefined): string {
  const cpf = soDigitos(texto);
  if (cpf.length !== 11) return texto ?? "";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** `65000-000`. Código postal de outro país volta como está. */
export function formatarCep(texto: string | null | undefined): string {
  const original = (texto ?? "").trim();
  // Letra no meio é código de outro país — tirar os dígitos dele inventaria um CEP.
  if (/[a-z]/i.test(original)) return original;
  const cep = soDigitos(original);
  if (cep.length !== 8) return original;
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}
