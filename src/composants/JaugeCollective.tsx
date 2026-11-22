import { useEffect, useRef } from 'react'
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

// L'événement « revolia:jauge » (envoyé par les célébrations de l'écran projeté) fait pulser la jauge,
// la remplit de nouveau et fait passer un reflet. Rien si l'ordinateur demande de réduire les animations.
function JaugeGrande({ pourcentage }: { pourcentage: string }) {
  const barre = useRef<HTMLDivElement>(null)
  const remplissage = useRef<HTMLDivElement>(null)
  const reflet = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const animations: Animation[] = []
    const reagir = () => {
      const b = barre.current
      const f = remplissage.current
      const r = reflet.current
      if (!b || !f || !r) return
      try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      } catch {
        /* on continue */
      }
      animations.forEach((a) => a.cancel())
      animations.length = 0
      const rien = '0 0 0 0 color-mix(in srgb, var(--couleur-vert-clair) 0%, transparent)'
      const lueur = '0 0 2.6vh 0.5vh color-mix(in srgb, var(--couleur-vert-clair) 60%, transparent)'
      animations.push(
        b.animate(
          [
            { transform: 'scale(1)', boxShadow: rien, offset: 0, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
            { transform: 'scale(1.02, 1.55)', boxShadow: lueur, offset: 0.3, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
            { transform: 'scale(1)', boxShadow: rien, offset: 1 },
          ],
          { duration: 1600 },
        ),
        f.animate([{ clipPath: 'inset(0 100% 0 0 round 9999px)' }, { clipPath: 'inset(0 0% 0 0 round 9999px)' }], {
          duration: 1100,
          easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)',
        }),
        r.animate(
          [{ transform: 'translateX(-120%) skewX(-20deg)', opacity: 1 }, { transform: 'translateX(700%) skewX(-20deg)', opacity: 1 }],
          { duration: 1000, delay: 700, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'backwards' },
        ),
      )
    }
    window.addEventListener('revolia:jauge', reagir)
    return () => {
      window.removeEventListener('revolia:jauge', reagir)
      animations.forEach((a) => a.cancel())
    }
  }, [])

  return (
    <div className="text-[max(1.1rem,2.6vh)]">
      <div className="mb-[1vh] flex items-center justify-between">
        <span className="font-semibold">Jauge de la salle</span>
      </div>
      <div ref={barre} role="progressbar" aria-label="Jauge de la salle" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parseInt(pourcentage)} className="h-[2.4vh] w-full overflow-hidden rounded-pilule border-2 border-blanc">
        <div className="relative h-full rounded-pilule transition-[width] duration-1000" style={{ width: pourcentage }}>
          <div ref={remplissage} className="h-full w-full rounded-pilule bg-vertClair" />
          <span ref={reflet} aria-hidden className="absolute inset-y-0 left-0 w-[16%] opacity-0" style={{ background: 'linear-gradient(90deg, transparent, var(--couleur-blanc), transparent)' }} />
        </div>
      </div>
    </div>
  )
}
