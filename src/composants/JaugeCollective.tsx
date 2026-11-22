import type { Jauge } from '../lib/session'

// Jauge que toute la salle remplit ensemble. Jamais de comparaison entre personnes.
//  - variante « fine »   : mini-barre en haut du téléphone (fond blanc)
//  - variante « grande » : écran projeté (fond bleu violet). Les célébrations ne dépendent plus de la jauge (moments choisis par le formateur).

export default function JaugeCollective({ jauge, variante }: { jauge: Jauge; variante: 'fine' | 'grande' }) {
  const part = jauge.maximum > 0 ? Math.min(1, Math.max(0, jauge.points / jauge.maximum)) : 0
  const pourcentage = `${Math.round(part * 100)}%`

  if (variante === 'fine') {
    return (
      <div
        role="progressbar"
        aria-label="Jauge de la salle"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(part * 100)}
        className="h-2 w-full overflow-hidden rounded-pilule border border-vert bg-blanc"
      >
        <div className="h-full rounded-pilule bg-vert transition-[width] duration-700" style={{ width: pourcentage }} />
      </div>
    )
  }

  return <JaugeGrande pourcentage={pourcentage} />
}

function JaugeGrande({ pourcentage }: { pourcentage: string }) {
  return (
    <div className="text-[max(1.1rem,2.6vh)]">
      <div className="mb-[1vh] flex items-center justify-between">
        <span className="font-semibold">Jauge de la salle</span>
      </div>
      <div role="progressbar" aria-label="Jauge de la salle" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parseInt(pourcentage)} className="h-[2.4vh] w-full overflow-hidden rounded-pilule border-2 border-blanc">
        <div className="h-full rounded-pilule bg-vertClair transition-[width] duration-1000" style={{ width: pourcentage }} />
      </div>
    </div>
  )
}
