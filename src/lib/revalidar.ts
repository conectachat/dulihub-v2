import { revalidatePath } from "next/cache";

/**
 * Tudo o que mostra a pessoa: as duas listas e os dois perfis.
 *
 * A mesma pessoa aparece em `/contatos/<id>` enquanto não é cliente e em
 * `/clientes/<id>` depois (CLI-2) — e uma gravação pode ser justamente a
 * que a faz mudar de lado. Revalidar os dois é barato; esquecer um deixa a
 * tela mostrando o que já mudou.
 *
 * Fora de `@/lib/pessoa` porque aquele módulo é puro e vai ao navegador;
 * este só roda no servidor.
 */
export function revalidarPessoa(id?: string | null) {
  revalidatePath("/contatos");
  revalidatePath("/clientes");
  if (id) {
    revalidatePath(`/contatos/${id}`);
    revalidatePath(`/clientes/${id}`);
  }
}
