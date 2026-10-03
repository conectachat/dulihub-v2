"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { FormularioDoCadastro } from "@/components/formulario-do-cadastro";
import { enviarFicha } from "@/features/cadastro/publico-actions";

/**
 * A ficha na mão do lead. Depois de enviada, o formulário some e fica o
 * recibo — sem botão de voltar, porque o link já não vale mais.
 */
export function FichaPublica({
  token,
  nome,
  email,
  ddi,
  telefone,
  declaracao,
  organizacao,
}: {
  token: string;
  nome: string | null;
  email: string | null;
  ddi: string | null;
  telefone: string | null;
  declaracao: string;
  organizacao: string;
}) {
  const [enviada, setEnviada] = useState(false);

  if (enviada) return <Recebida organizacao={organizacao} />;

  return (
    <div className="space-y-6">
      {/* Aqui dentro, e não na página: depois de enviada, a instrução some
          junto com o formulário em vez de ficar em cima do recibo. */}
      <p className="text-sm text-muted-foreground">
        Preencha os dados abaixo para prepararmos o seu contrato. Os campos com *
        são obrigatórios. Depois de enviar, este link deixa de funcionar.
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
          setEnviada(true);
          window.scrollTo({ top: 0 });
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
