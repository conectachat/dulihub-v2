import Image from "next/image";

export const metadata = { title: "Sem conexão — Duli Hub" };

/**
 * A tela que o service worker entrega quando a rede não responde.
 *
 * Fica de fora do login de propósito: offline não há como conferir sessão, e
 * cair no login com os dados no aparelho seria pior que a tela de erro do
 * navegador. Não mostra dado nenhum — por enquanto. A partir do Estágio 2
 * ela passa a montar o app com o que estiver guardado no aparelho.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      {/*
        `unoptimized`: a rota de otimização de imagem do Next não existe sem
        servidor, e é justamente sem servidor que esta tela aparece. Assim o
        navegador pede o arquivo que o service worker guardou.
      */}
      <Image src="/icon-192.png" alt="" width={72} height={72} priority unoptimized />

      <div className="space-y-2">
        <h1 className="font-serif text-2xl font-medium tracking-tight">
          Sem conexão
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          O Duli Hub precisa de internet para esta tela. Assim que a conexão
          voltar, é só recarregar.
        </p>
      </div>

      <p className="max-w-sm text-xs text-muted-foreground">
        Em breve as telas que você já abriu vão funcionar sem internet. Para
        isso valer no celular, instale o app na tela de início.
      </p>
    </main>
  );
}
