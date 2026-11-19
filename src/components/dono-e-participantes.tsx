import { NativeSelect } from "@/components/native-select";
import { Label } from "@/components/ui/label";

/**
 * Dono e participantes — de quem cuida do cliente e do negócio (0044). Por
 * enquanto só marcam quem cuida (decisão de 17/nov). Os dois saem da equipe
 * da organização **do registro**, nunca da de quem clicou.
 *
 * Moram aqui porque o Editar do cliente e o "Editar negócio" os desenham
 * igual (AGENTS: extrair na segunda cópia).
 */

export type MembroDaEquipe = { id: string; nome: string };

/**
 * O dono, com "Sem dono". Quem não enxerga a equipe da dona (consultor de
 * organização atribuída) receberia a lista sem o dono, o navegador escolheria
 * "Sem dono", e salvar outro campo apagaria o dono em silêncio: o dono atual
 * está sempre na lista.
 */
export function CampoDoDono({
  equipe,
  ownerId,
  nomeDoDono = null,
}: {
  equipe: MembroDaEquipe[];
  ownerId: string | null;
  nomeDoDono?: string | null;
}) {
  const donos =
    ownerId && !equipe.some((m) => m.id === ownerId)
      ? [...equipe, { id: ownerId, nome: nomeDoDono ?? "Dono atual" }]
      : equipe;

  return (
    <div className="space-y-2">
      <Label htmlFor="owner_id">Dono</Label>
      <NativeSelect id="owner_id" name="owner_id" defaultValue={ownerId ?? ""}>
        <option value="">Sem dono</option>
        {donos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function CampoDosParticipantes({
  equipe,
  participantes,
}: {
  equipe: MembroDaEquipe[];
  participantes: string[];
}) {
  const participa = new Set(participantes);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Participantes</legend>
      {equipe.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém na equipe desta organização.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {equipe.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="participantes"
                value={m.id}
                defaultChecked={participa.has(m.id)}
                className="h-4 w-4 accent-primary"
              />
              {m.nome}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
