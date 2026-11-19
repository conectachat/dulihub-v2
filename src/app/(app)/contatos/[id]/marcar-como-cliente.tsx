"use client";

import { BadgeCheck } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { marcarComoCliente } from "@/features/people/actions";

/**
 * "Marcar como cliente" (CLI-11), para quem fechou fora do funil. Só a
 * gestão vê o botão — a página consulta o papel; o banco recusa os outros
 * de qualquer jeito. Pergunta a data, hoje por padrão e nunca no futuro, e
 * avisa que não tem volta. Gravado, a ação leva ao perfil de cliente.
 */
export function MarcarComoCliente({
  personId,
  nome,
  hoje,
}: {
  personId: string;
  nome: string;
  hoje: string;
}) {
  return (
    <FormDialog
      acao={marcarComoCliente}
      titulo={`Marcar ${nome} como cliente`}
      descricao="Não tem volta: cliente não volta a ser lead. Para quem fechou fora do funil; no funil, use o Ganho."
      gatilho={
        <Button variant="outline" size="sm" className="rounded-xl">
          <BadgeCheck className="mr-1 h-4 w-4 text-primary" />
          Marcar como cliente
        </Button>
      }
      salvar="Marcar como cliente"
      pendente="Marcando..."
    >
      <input type="hidden" name="id" value={personId} />
      <div className="space-y-2">
        <Label htmlFor="cliente-desde">Cliente desde</Label>
        <Input
          id="cliente-desde"
          name="desde"
          type="date"
          max={hoje}
          defaultValue={hoje}
          required
          className="rounded-xl"
        />
      </div>
    </FormDialog>
  );
}
