import { redirect } from "next/navigation";

/** Configurações sempre abrem numa seção. Geral é a porta de entrada. */
export default function ConfiguracoesPage() {
  redirect("/configuracoes/geral");
}
