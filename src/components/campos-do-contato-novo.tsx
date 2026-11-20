import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DDI_PADRAO } from "@/lib/contato";

/**
 * O contato que nasce junto (Nova oportunidade, Novo cliente): nome, DDI,
 * telefone e e-mail, todos obrigatórios (CON-8). Os `name` são os que
 * `contatoNovoDoFormulario` (`@/lib/contato`) lê no servidor.
 */
export function CamposDoContatoNovo() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="novo_full_name">Nome *</Label>
        <Input id="novo_full_name" name="novo_full_name" required autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="novo_phone_country_code">DDI *</Label>
          <Input
            id="novo_phone_country_code"
            name="novo_phone_country_code"
            placeholder={DDI_PADRAO}
            defaultValue={DDI_PADRAO}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="novo_phone">Telefone *</Label>
          <Input id="novo_phone" name="novo_phone" inputMode="tel" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="novo_email">E-mail *</Label>
        <Input id="novo_email" name="novo_email" type="email" required />
      </div>
    </div>
  );
}
