import { useCallback, useState } from 'react'

// Choix « Liste / Cartes » pour afficher les quiz. Le choix est mémorisé par page dans le navigateur (localStorage) ;
// si le navigateur refuse (navigation privée, stockage bloqué), l'affichage fonctionne quand même, sans mémoire.

export type VueQuiz = 'liste' | 'cartes'

export function usePreferenceVue(cle: string, defaut: VueQuiz): [VueQuiz, (v: VueQuiz) => void] {
  const [vue, setVue] = useState<VueQuiz>(() => {
    try {
      const v = window.localStorage.getItem(cle)
      return v === 'liste' || v === 'cartes' ? v : defaut
    } catch {
      return defaut
    }
  })
  const choisir = useCallback(
    (v: VueQuiz) => {
      setVue(v)
      try {
        window.localStorage.setItem(cle, v)
      } catch {
        /* pas grave : le choix vaut pour cette visite */
      }
    },
    [cle],
  )
  return [vue, choisir]
}

const ICONE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

function IconeListe() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" className="block shrink-0" {...ICONE}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  )
}

function IconeCartes() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" className="block shrink-0" {...ICONE}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

const OPTIONS: { cle: VueQuiz; libelle: string; Icone: () => JSX.Element }[] = [
  { cle: 'liste', libelle: 'Liste', Icone: IconeListe },
  { cle: 'cartes', libelle: 'Cartes', Icone: IconeCartes },
]

export default function SelecteurVue({ vue, onChange }: { vue: VueQuiz; onChange: (v: VueQuiz) => void }) {
  return (
    <div role="group" aria-label="Affichage des quiz" className="inline-flex self-start overflow-hidden rounded-pilule border-2 border-vert">
      {OPTIONS.map(({ cle, libelle, Icone }) => (
        <button
          key={cle}
          type="button"
          aria-pressed={vue === cle}
          onClick={() => onChange(cle)}
          className={`flex min-h-[44px] items-center gap-2 px-5 text-base font-semibold transition-colors ${
            vue === cle ? 'bg-vert text-blanc' : 'bg-blanc text-vertFonce hover:bg-vertClair/30'
          }`}
        >
          <Icone />
          {libelle}
        </button>
      ))}
    </div>
  )
}
