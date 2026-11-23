"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";

import { FormularioDoCadastro } from "@/components/formulario-do-cadastro";
import { enviarFicha } from "@/features/cadastro/publico-actions";

/**
 * A ficha na mão do lead. Depois de enviada, o formulário some e fica o
 * recibo — sem botão de voltar, porque o link já não vale mais.
 *
 * Com a forma de pagamento (entrega 4b), é o passo 1 de 2: os dados entram, o
 * link continua aberto, e a página se refaz no servidor já no pagamento.
 */
export function FichaPublica({
  token,
  nome,
  email,
  ddi,
  telefone,
  declaracao,
  organizacao,
  temForma,
}: {
  token: string;
  nome: string | null;
  email: string | null;
  ddi: string | null;
  telefone: string | null;
  declaracao: string;
  organizacao: string;
  /** O link leva a forma de pagamento: depois dos dados vem o pagamento. */
  temForma: boolean;
}) {
  const [enviada, setEnviada] = useState(false);
  const router = useRouter();

  if (enviada) return <Recebida organizacao={organizacao} />;

  return (
    <div className="space-y-6">
      {temForma ? (
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Passo 1 de 2</p>
      ) : null}
      {/* Aqui dentro, e não na página: depois de enviada, a instrução some
          junto com o formulário em vez de ficar em cima do recibo. */}
      <p className="text-sm text-muted-foreground">
        {temForma
          ? "Preencha os dados abaixo para prepararmos o seu contrato. Os campos com * são obrigatórios. Depois de enviar, você confere a forma de pagamento."
          : "Preencha os dados abaixo para prepararmos o seu contrato. Os campos com * são obrigatórios. Depois de enviar, este link deixa de funcionar."}
      </p>
      <FormularioDoCadastro
        modo="completa"
        inicial={{
          full_name: nome,
          email,
          phone_country_code: ddi,
          phone: telefone,
        }}
        enviar={(formData) => enviarFicha(token, formData)}
        aoGravar={() => {
          window.scrollTo({ top: 0 });
          // Com a forma, a mesma página passa ao pagamento: o servidor a desenha
          // de novo, agora com a forma que o banco devolve.
          if (temForma) router.refresh();
          else setEnviada(true);
        }}
        declaracao={declaracao}
        rotuloDoEnvio="Enviar ficha"
      />
    </div>
  );
}

export function Recebida({ organizacao }: { organizacao: string }) {
  return (
    <div className="space-y-3 py-6 text-center" role="status">
      <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
      <h2 className="font-serif text-xl font-medium">Recebemos a sua ficha</h2>
      <p className="text-sm text-muted-foreground">
        Obrigado! A equipe da {organizacao} vai conferir os dados e seguir com o
        seu contrato. Você já pode fechar esta página.
      </p>
    </div>
  );
}

/**
 * O link que não vale mais, com a frase de cada caso:
 * - `expirado`: o link com a forma passou dos 3 dias úteis (P14);
 * - `respondido`: o cliente já respondeu a forma — ele precisa saber que a
 *   resposta valeu, e não pedir outro link (Renato, 23/nov);
 * - `indisponivel`: o resto (cancelado, substituído, ficha comum vencida).
 */
export function LinkIndisponivel({
  organizacao,
  motivo,
}: {
  organizacao: string;
  motivo: "expirado" | "respondido" | "indisponivel";
}) {
  if (motivo === "respondido") {
    return (
      <div className="space-y-3 py-6 text-center" role="status">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
        <h2 className="font-serif text-xl font-medium">Você já respondeu</h2>
        <p className="text-sm text-muted-foreground">
          {`A ${organizacao} recebeu a sua resposta sobre a forma de pagamento e vai seguir com os próximos passos. Você já pode fechar esta página.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-6 text-center">
      <Clock className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden />
      {motivo === "expirado" ? (
        <h2 className="font-serif text-xl font-medium">
          {`Este link expirou. Peça um novo à ${organizacao}.`}
        </h2>
      ) : (
        <>
          <h2 className="font-serif text-xl font-medium">Este link não está mais disponível</h2>
          <p className="text-sm text-muted-foreground">
            Ele venceu ou foi substituído. Peça um novo link à equipe da {organizacao}.
          </p>
        </>
      )}
    </div>
  );
}
