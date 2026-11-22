import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Jauge } from '../../lib/session'
import { Etincelle, TexteCinetique } from './elementsCelebration'
import { MoteurParticules } from './moteurParticules'

// Finale du bilan : plus ample que le moment de célébration (~5,6 s puis état calme).
//
//     0  le bilan recule doucement, voile sombre sur les bords
//   200  salves de gerbes depuis les coins inférieurs, de plus en plus larges (200, 500, 900, 1400, 2000)
//   600  l'étincelle, puis « Bravo à toute la salle » en typographie cinétique ; soulignement à 1 600
//  1000  pluie lente de fines particules (jusqu'à 6 s)
//  2000  la jauge finale se remplit, un reflet la traverse, puis elle reste illuminée
//  4800  le grand texte se dissout, le bilan revient net : état calme
// Aucune couche ne capte la souris : « Suite », « Terminer » et le reste restent cliquables.

const DUREE_MS = 5600
const SORTIE_MS = 4800

interface Props {
  jauge: Jauge
  cibleRef: RefObject<HTMLElement | null>
}

export default function FinaleBilan({ jauge, cibleRef }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const barre = useRef<HTMLDivElement>(null)
  const remplissage = useRef<HTMLDivElement>(null)
  const reflet = useRef<HTMLSpanElement>(null)
  const [sceneVisible, setSceneVisible] = useState(true)
  const part = jauge.maximum > 0 ? Math.min(1, Math.max(0, jauge.points / jauge.maximum)) : 0

  useEffect(() => {
    const zone = scene.current
    const toile = canvas.current
    if (!zone || !toile) return
    const minuteurs: number[] = []
    const apres = (ms: number, f: () => void) => minuteurs.push(window.setTimeout(f, ms))
    const animations: Animation[] = []
    let moteur: MoteurParticules | null = null
    try {
      moteur = new MoteurParticules(toile)
    } catch {
      moteur = null
    }
    const { largeur: L, hauteur: H } = moteur?.taille ?? { largeur: window.innerWidth, hauteur: window.innerHeight }

    // Le bilan recule doucement.
    const repos = { transform: 'scale(1)', filter: 'blur(0px) brightness(1)' }
    const recul = { transform: 'scale(0.97)', filter: 'blur(3px) brightness(0.4)' }
    const a = cibleRef.current?.animate(
      [
        { ...repos, offset: 0, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        { ...recul, offset: 0.14 },
        { ...recul, offset: 0.84, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
        { ...repos, offset: 1 },
      ],
      { duration: DUREE_MS },
    )
    if (a) animations.push(a)

    // Salves : de plus en plus larges, depuis les deux coins du bas, puis du bas au centre.
    const gerbe = (g: number, n: number, v: number, ouverture = 0.26) => {
      moteur?.emettre({ x: L * 0.05, y: H + 10, n, angle: -1.15 + g * 0.1, ouverture, vitesse: v, duree: 2.6, disques: 0.3, gravite: 950, epaisseur: 2.6 })
      moteur?.emettre({ x: L * 0.95, y: H + 10, n, angle: -Math.PI + 1.15 - g * 0.1, ouverture, vitesse: v, duree: 2.6, disques: 0.3, gravite: 950, epaisseur: 2.6 })
    }
    moteur?.planifier(200, () => gerbe(0, 60, 1500))
    moteur?.planifier(500, () => gerbe(1, 80, 1650))
    moteur?.planifier(900, () => {
      gerbe(2, 90, 1750, 0.32)
      moteur?.emettre({ x: L / 2, y: H + 10, n: 90, angle: -Math.PI / 2, ouverture: 0.4, vitesse: 1550, duree: 2.6, disques: 0.35, gravite: 950 })
    })
    moteur?.planifier(1400, () => gerbe(3, 100, 1850, 0.4))
    moteur?.planifier(2000, () => {
      gerbe(4, 120, 1950, 0.5)
      moteur?.emettre({ x: L / 2, y: H + 10, n: 140, angle: -Math.PI / 2, ouverture: 0.7, vitesse: 1700, duree: 3, disques: 0.4, gravite: 950, palette: [0.2, 0.45, 0.35] })
    })
    // Pluie lente.
    for (let i = 0; i < 28; i++) {
      moteur?.planifier(1000 + i * 190, () => {
        moteur?.emettre({ x: L / 2, y: -20, etalement: L, n: 7, angle: Math.PI / 2, ouverture: 0.12, vitesse: 80, duree: 6.5, disques: 0.6, rubans: 0.4, persistance: false, gravite: 110, frottement: 0.6, alpha: 0.42, palette: [0.15, 0.5, 0.35], epaisseur: 1.6 })
      })
    }

    // Jauge finale : remplissage, reflet, puis lueur qui reste.
    const b = barre.current
    const f = remplissage.current
    const r = reflet.current
    if (b && f && r) {
      const lueur = '0 0 3vh 0.5vh color-mix(in srgb, var(--couleur-vert-clair) 55%, transparent)'
      const rien = '0 0 0 0 color-mix(in srgb, var(--couleur-vert-clair) 0%, transparent)'
      const fond = f.animate([{ clipPath: 'inset(0 100% 0 0 round 9999px)' }, { clipPath: 'inset(0 0% 0 0 round 9999px)' }], {
        duration: 1500, delay: 2000, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'both',
      })
      const lumiere = b.animate([{ boxShadow: rien }, { boxShadow: lueur }], { duration: 1500, delay: 2200, easing: 'ease-out', fill: 'both' })
      const reflets = r.animate(
        [{ transform: 'translateX(-120%) skewX(-20deg)', opacity: 1 }, { transform: 'translateX(620%) skewX(-20deg)', opacity: 1 }],
        { duration: 1100, delay: 3300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      )
      animations.push(fond, lumiere, reflets)
    }
    apres(DUREE_MS + 100, () => setSceneVisible(false))

    return () => {
      minuteurs.forEach((m) => window.clearTimeout(m))
      animations.forEach((x) => x.cancel())
      moteur?.detruire()
    }
  }, [cibleRef])

  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-10 h-full w-full" />
      {sceneVisible && (
        <div ref={scene} aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="celeb-voile absolute inset-[-3vw]" style={{ animation: `celeb-voile 0.9s ease-out both, celeb-sortie 0.6s ease-in ${SORTIE_MS}ms forwards` }} />
          <div
            className="relative flex w-[88%] flex-col items-center gap-[2.6vh] text-center"
            style={{ animation: `celeb-sortie 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${SORTIE_MS}ms forwards` }}
          >
            <Etincelle className="celeb-etoile h-[8vh] w-[8vh]" style={{ animationDelay: '600ms' }} />
            <div style={{ fontSize: 'min(14vh, 8.6vw)' }}>
              <TexteCinetique texte="Bravo à toute la salle" delaiMs={800} pasMs={170} />
            </div>
            <div className="celeb-trait h-[0.5vh] min-h-[3px] w-[52%]" style={{ animationDelay: '1700ms' }} />
            <div className="mt-[2vh] w-[min(70vw,1200px)] text-left text-[max(1.1rem,2.6vh)]">
              <p className="mb-[1vh] font-semibold text-vertClair">Ce que la salle a construit ensemble</p>
              <div ref={barre} className="h-[2.6vh] w-full overflow-hidden rounded-pilule border-2 border-blanc">
                <div className="relative h-full rounded-pilule" style={{ width: `${Math.round(part * 100)}%` }}>
                  <div ref={remplissage} className="h-full w-full rounded-pilule bg-vertClair" style={{ clipPath: 'inset(0 100% 0 0 round 9999px)' }} />
                  <span
                    ref={reflet}
                    className="absolute inset-y-0 left-0 w-[16%] opacity-0"
                    style={{ background: 'linear-gradient(90deg, transparent, var(--couleur-blanc), transparent)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
