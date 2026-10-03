"use client";

/**
 * Seletor de etapa dentro do cartão.
 *
 * O quadro também deixa arrastar (`quadro.tsx`), mas o seletor fica: arrastar
 * nativo não funciona no toque nem no teclado, e este funciona no celular e
 * no leitor de tela sem biblioteca nenhuma.
 *
 * Controlado, e sem gravar por conta própria: quem decide o que fazer com a
 * etapa escolhida é o quadro — Ganho abre a confirmação e Perdido pede o
 * motivo, em vez de mover direto. Enquanto o diálogo está aberto o seletor
 * continua mostrando a etapa em que o negócio de fato está.
 */
export function MoveCard({
  etapaAtual,
  etapas,
  aoMover,
}: {
  etapaAtual: string;
  etapas: { id: string; name: string }[];
  aoMover: (etapaId: string) => void;
}) {
  return (
    <select
      value={etapaAtual}
      onChange={(evento) => aoMover(evento.target.value)}
      aria-label="Mover para outra etapa"
      className="w-full rounded-xl border-0 bg-muted px-2 py-1 text-xs text-muted-foreground"
    >
      {etapas.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}
