import { Compass } from "lucide-react";

/**
 * Link de ficha que não existe.
 *
 * Tela própria porque a de "não encontrado" do app oferece "Voltar ao
 * início" — que, para o lead, é uma tela de login de um sistema que ele não
 * usa. Aqui a saída é pedir outro link.
 */
export default function LinkNaoEncontrado() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md space-y-4 rounded-3xl border bg-card p-6 text-center shadow-sm">
        <Compass className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
        <h1 className="font-serif text-xl font-medium">Link não encontrado</h1>
        <p className="text-sm text-muted-foreground">
          Confira se o endereço foi copiado inteiro. Se o problema continuar,
          peça um novo link a quem te enviou.
        </p>
      </div>
    </main>
  );
}
