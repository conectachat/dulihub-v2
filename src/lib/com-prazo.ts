/**
 * Espera uma promessa, mas não para sempre — testado em `com-prazo.test.ts`.
 *
 * Nunca lança: quem chama quer saber só se pode seguir. Wi-Fi sem saída
 * deixa um pedido pendurado sem erro nenhum, e uma tela que esperasse por ele
 * esconderia para sempre o que já está no aparelho.
 */
export function comPrazo(promessa: Promise<unknown>, ms: number): Promise<"ok" | "prazo" | "falhou"> {
  return new Promise((resolver) => {
    const timer = setTimeout(() => resolver("prazo"), ms);
    promessa.then(
      () => {
        clearTimeout(timer);
        resolver("ok");
      },
      () => {
        clearTimeout(timer);
        resolver("falhou");
      },
    );
  });
}
