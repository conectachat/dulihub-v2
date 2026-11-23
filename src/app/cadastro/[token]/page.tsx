import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { abrirFicha } from "@/features/cadastro/publico-queries";
import { declaracao } from "@/features/cadastro/regras";

import { EtapaDoPagamento } from "./etapa-do-pagamento";
import { FichaPublica, LinkIndisponivel, Recebida } from "./ficha-publica";

/**
 * A ficha de cadastro que o lead preenche — a única tela do app para quem não
 * tem login. Com a forma de pagamento (entrega 4b), depois dos dados vem o
 * pagamento, com Confirmo ou Há algo errado.
 *
 * Fora do grupo `(app)`: sem barra lateral, sem sincronia, sem nada do
 * sistema. O que autoriza é o token do endereço, conferido no banco (0035).
 *
 * `noindex` e `no-referrer` porque o endereço **é** a chave: não pode parar
 * num buscador nem vazar no cabeçalho de quem sair daqui por um link.
 */
export const metadata: Metadata = {
  title: "Ficha de cadastro",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Moldura({ organizacao, children }: {
  organizacao?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-svh bg-muted/40 px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-3 text-center">
          <Image
            src="/duli-logo.png"
            alt=""
            width={56}
            height={56}
            className="mx-auto h-14 w-14 object-contain"
            priority
          />
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-tight">
              Ficha de cadastro
            </h1>
            {organizacao ? (
              <p className="text-sm text-muted-foreground">{organizacao}</p>
            ) : null}
          </div>
        </header>

        <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-8">{children}</div>
      </div>
    </main>
  );
}

export default async function FichaDeCadastroPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { ficha, error } = await abrirFicha(token);

  // Falha de leitura não é "link não existe": o lead tentaria pedir outro
  // link por um problema que é nosso e passa sozinho.
  if (error) {
    return (
      <Moldura>
        <p className="py-6 text-center text-sm text-muted-foreground" role="alert">
          Não foi possível abrir a ficha agora. Tente de novo em alguns instantes.
        </p>
      </Moldura>
    );
  }

  if (!ficha) notFound();

  if (ficha.situacao === "enviada") {
    return (
      <Moldura organizacao={ficha.organizacao}>
        <Recebida organizacao={ficha.organizacao} />
      </Moldura>
    );
  }

  // O cliente está no pagamento (entrega 4b): os dados chegaram, ou o link é
  // só do pagamento. A forma vem montada no banco, sem a cotação.
  if (ficha.situacao === "aguardando_pagamento" && ficha.forma) {
    return (
      <Moldura organizacao={ficha.organizacao}>
        <EtapaDoPagamento
          token={token}
          forma={ficha.forma}
          organizacao={ficha.organizacao}
          soPagamento={ficha.modo === "so_pagamento"}
        />
      </Moldura>
    );
  }

  if (ficha.situacao !== "aberta") {
    return (
      <Moldura organizacao={ficha.organizacao}>
        <LinkIndisponivel
          organizacao={ficha.organizacao}
          motivo={
            ficha.situacao === "respondida"
              ? "respondido"
              : ficha.situacao === "expirada" && ficha.tem_forma
                ? "expirado"
                : "indisponivel"
          }
        />
      </Moldura>
    );
  }

  return (
    <Moldura organizacao={ficha.organizacao}>
      <FichaPublica
        token={token}
        nome={ficha.nome}
        email={ficha.email}
        ddi={ficha.ddi}
        telefone={ficha.telefone}
        declaracao={declaracao(ficha.organizacao)}
        organizacao={ficha.organizacao}
        temForma={ficha.tem_forma}
      />
    </Moldura>
  );
}
