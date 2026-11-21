import { useEffect, useRef, useState } from 'react'
import type { Jauge } from '../lib/session'

// Jauge que toute la salle remplit ensemble. Jamais de comparaison entre personnes.
//  - variante « fine »   : mini-barre en haut du téléphone (fond blanc)
//  - variante « grande » : écran projeté (fond bleu violet), avec paliers et célébration

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

  return <JaugeGrande jauge={jauge} pourcentage={pourcentage} />
}

function JaugeGrande({ jauge, pourcentage }: { jauge: Jauge; pourcentage: string }) {
  // Célébration quand le nombre de paliers atteints augmente (pas au premier chargement).
  const precedent = useRef<number | null>(null)
  const [celebre, setCelebre] = useState<number | null>(null)
  const [message, setMessage] = useState(false) // grand message central, 2,5 s

  useEffect(() => {
    const avant = precedent.current
    precedent.current = jauge.paliers_atteints
    if (avant !== null && jauge.paliers_atteints > avant) {
      setCelebre(jauge.paliers_atteints)
      setMessage(true)
      const court = window.setTimeout(() => setMessage(false), 2500)
      const minuteur = window.setTimeout(() => setCelebre(null), 6000)
      return () => {
        window.clearTimeout(court)
        window.clearTimeout(minuteur)
      }
    }
  }, [jauge.paliers_atteints])

  return (
    <div className="text-[max(1.1rem,2.6vh)]">
      {celebre !== null && message && (
        <div role="status" className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
          <p className="animate-bounce rounded-carte border-4 border-vert bg-blanc px-[3vw] py-[4vh] text-center font-titre text-[min(6vw,10vh)] leading-tight text-bleuViolet shadow-2xl">
            La salle débloque le palier {celebre} !
          </p>
        </div>
      )}
      <div className="mb-[1vh] flex items-center justify-between">
        <span className="font-semibold">Jauge de la salle</span>
        {celebre !== null && <span className="font-bold text-vertClair">Palier {celebre} atteint !</span>}
      </div>
      <div role="progressbar" aria-label="Jauge de la salle" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parseInt(pourcentage)} className={`h-[2.4vh] w-full overflow-hidden rounded-pilule border-2 border-blanc ${celebre !== null ? 'animate-pulse' : ''}`}>
        <div className="h-full rounded-pilule bg-vertClair transition-[width] duration-1000" style={{ width: pourcentage }} />
      </div>
      <div className="relative mt-[0.5vh] h-[5vh]">
        {jauge.paliers.map((palier, i) => {
          const atteint = i < jauge.paliers_atteints
          return (
            <span
              key={i}
              className={`absolute top-0 flex h-[4.6vh] w-[4.6vh] -translate-x-1/2 items-center justify-center rounded-pilule border-2 border-vertClair text-[1em] font-bold transition-colors duration-700 ${
                atteint ? 'bg-vertClair text-bleuViolet' : 'bg-bleuViolet text-vertClair'
              }`}
              style={{ left: `${palier * 100}%` }}
              title={`Palier ${i + 1}`}
            >
              {i + 1}
            </span>
          )
        })}
      </div>
    </div>
  )
}
