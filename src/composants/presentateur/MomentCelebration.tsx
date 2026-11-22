import { useEffect, useRef, useState, type RefObject } from 'react'
import { Etincelle, TexteCinetique, tailleGrandTexte } from './elementsCelebration'
import { MoteurParticules } from './moteurParticules'

// Moment de célébration choisi par le formateur, sur l'écran projeté (~3,6 s puis état stable).
//
// Chorégraphie (en ms) :
//     0  les résultats reculent (échelle, flou, assombrissement) et un voile sombre se referme sur les bords
//   450  onde lumineuse + éclat central + explosion de particules en gerbes
//   700  l'étincelle apparaît, les mots du message montent un à un (à partir de 900)
//  1500  le soulignement se trace
//  1300  gerbes depuis les deux coins du bas
//  1700  la jauge de la salle pulse, se remplit, un reflet la traverse (événement « revolia:jauge »)
//  3000  le grand texte se dissout, les résultats reviennent nets, le message reste en bandeau (voir EcranResultats)
// Rien ici ne capte la souris : le bouton de pilotage reste cliquable à tout moment.

export const DUREE_MOMENT_MS = 3600
export const DELAI_BANDEAU_MS = 3000

interface Props {
  texte: string
  /** Zone des résultats à faire reculer. */
  cibleRef: RefObject<HTMLElement | null>
}

export default function MomentCelebration({ texte, cibleRef }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const anneaux = useRef<HTMLDivElement>(null)
  const [sceneVisible, setSceneVisible] = useState(true)

  useEffect(() => {
    const zone = scene.current
    const toile = canvas.current
    if (!zone || !toile) return
    const cible = cibleRef.current
    const minuteurs: number[] = []
    const apres = (ms: number, f: () => void) => minuteurs.push(window.setTimeout(f, ms))
    let moteur: MoteurParticules | null = null
    try {
      moteur = new MoteurParticules(toile)
    } catch {
      moteur = null // pas de canvas : le reste de la chorégraphie fonctionne sans particules
    }

    // Centre de la scène : c'est de là que part l'onde.
    const r = zone.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    if (anneaux.current) {
      for (const el of Array.from(anneaux.current.children) as HTMLElement[]) {
        el.style.left = `${cx}px`
        el.style.top = `${cy}px`
      }
    }

    // 1) Les résultats reculent puis reviennent (une seule animation, rendue par le processeur graphique).
    const repos = { transform: 'scale(1)', filter: 'blur(0px) brightness(1)' }
    const recul = { transform: 'scale(0.96)', filter: 'blur(4px) brightness(0.42)' }
    const animCible = cible?.animate(
      [
        { ...repos, offset: 0, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        { transform: 'scale(1.012)', filter: 'blur(0px) brightness(1.05)', offset: 0.04, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        { ...recul, offset: 0.2 },
        { ...recul, offset: 0.8, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
        { ...repos, offset: 1 },
      ],
      { duration: DUREE_MOMENT_MS },
    )

    // 2) Onde, explosion, gerbes, pluie fine.
    const { largeur: L, hauteur: H } = moteur?.taille ?? { largeur: window.innerWidth, hauteur: window.innerHeight }
    moteur?.planifier(450, () => {
      moteur?.emettre({ x: cx, y: cy, n: 280, vitesse: 1350, cercle: true, duree: 2.2, disques: 0.35, gravite: 560, epaisseur: 2.6 })
    })
    moteur?.planifier(640, () => {
      moteur?.emettre({ x: cx, y: cy, n: 140, vitesse: 760, cercle: true, duree: 1.9, disques: 0.55, gravite: 420, epaisseur: 2, palette: [0.2, 0.45, 0.35] })
    })
    moteur?.planifier(1300, () => {
      moteur?.emettre({ x: L * 0.1, y: H + 10, n: 80, angle: -1.12, ouverture: 0.22, vitesse: 1500, duree: 2.2, disques: 0.3, gravite: 900 })
      moteur?.emettre({ x: L * 0.9, y: H + 10, n: 80, angle: -Math.PI + 1.12, ouverture: 0.22, vitesse: 1500, duree: 2.2, disques: 0.3, gravite: 900 })
    })
    for (let i = 0; i < 8; i++) {
      moteur?.planifier(2000 + i * 220, () => {
        moteur?.emettre({ x: L / 2, y: -20, etalement: L, n: 6, angle: Math.PI / 2, ouverture: 0.12, vitesse: 90, duree: 5.5, disques: 0.6, rubans: 0.4, persistance: false, gravite: 120, frottement: 0.6, alpha: 0.38, palette: [0.15, 0.5, 0.35], epaisseur: 1.5 })
      })
    }

    // 3) La jauge de la salle réagit.
    apres(1700, () => window.dispatchEvent(new CustomEvent('revolia:jauge', { detail: { intensite: 'palier' } })))
    // 4) Fin de la scène : le texte est déjà dissous, on la retire du document.
    apres(DUREE_MOMENT_MS + 100, () => setSceneVisible(false))

    return () => {
      minuteurs.forEach((m) => window.clearTimeout(m))
      animCible?.cancel()
      moteur?.detruire()
    }
  }, [cibleRef])

  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-10 h-full w-full" />
      {sceneVisible && (
        <div ref={scene} aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="celeb-voile absolute inset-[-3vw]" style={{ animation: `celeb-voile 0.7s ease-out both, celeb-sortie 0.6s ease-in ${DELAI_BANDEAU_MS}ms forwards` }} />
          <div ref={anneaux}>
            <div className="celeb-lueur" style={{ animationDelay: '450ms' }} />
            <div className="celeb-anneau" style={{ animationDelay: '450ms' }} />
            <div className="celeb-anneau" style={{ animationDelay: '700ms', animationDuration: '1.8s' }} />
          </div>
          <div
            className="relative flex w-[88%] flex-col items-center gap-[2.6vh] text-center"
            style={{ animation: `celeb-sortie 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${DELAI_BANDEAU_MS}ms forwards` }}
          >
            <Etincelle className="celeb-etoile h-[7.5vh] w-[7.5vh]" style={{ animationDelay: '700ms' }} />
            <div style={{ fontSize: tailleGrandTexte(texte) }}>
              <TexteCinetique texte={texte} delaiMs={900} />
            </div>
            <div className="celeb-trait h-[0.5vh] min-h-[3px] w-[58%]" style={{ animationDelay: '1500ms' }} />
          </div>
        </div>
      )}
    </>
  )
}
