import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Bouton from './Bouton'
import Photo from './Photo'
import PanneauLancement from './edition/PanneauLancement'

// Carte d'un quiz (vue galerie), partagée entre « Mes quiz » et l'administration.
// Seuls les boutons de la carte se prennent au clavier : la carte elle-même n'est pas un lien.

export interface DonneesCarteQuiz {
  id: string
  titre: string
  description: string | null
  nb_questions: number
  types: string[] // types présents, dans l'ordre de première apparition
  image: string | null // chemin de la première photo dans le bucket « quiz-images »
  modifie_le: string | null
  code?: string | null // code permanent du quiz
}

interface QuestionResumee {
  type: string
  image_question: string | null
  ordre: number
}

const LIBELLES_TYPES: Record<string, string> = {
  qcm: 'QCM',
  qcm_multiple: 'QCM multiple',
  nuage: 'Nuage',
  ouverte: 'Ouverte',
  echelle: 'Échelle',
}

// Transforme les questions d'un select imbriqué en infos de carte.
export function resumerQuestions(questions: QuestionResumee[] | null | undefined) {
  const triees = [...(questions ?? [])].sort((a, b) => a.ordre - b.ordre)
  const types: string[] = []
  for (const q of triees) if (!types.includes(q.type)) types.push(q.type)
  return {
    nb_questions: triees.length,
    types,
    image: triees.find((q) => q.image_question)?.image_question ?? null,
  }
}

function dateCourte(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

function initiales(titre: string): string {
  const mots = titre
    .split(/[\s'’:,.\-–—«»"]+/)
    .filter((m) => /[\p{L}\p{N}]/u.test(m))
    .filter((m) => m.length > 2 || /\d/.test(m))
  const choisis = (mots.length ? mots : titre.split(/\s+/).filter(Boolean)).slice(0, 2)
  const texte = choisis.map((m) => Array.from(m)[0]).join('')
  return (texte || '?').toLocaleUpperCase('fr-BE')
}

export function GrilleQuiz({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</ul>
}

export interface ActionMenu {
  libelle: string
  onChoisir: () => void
}

export default function CarteQuiz({
  quiz,
  auteur,
  action,
  menu,
  lancement = false,
  occupe = false,
  onSupprimer,
}: {
  quiz: DonneesCarteQuiz
  auteur?: string // côté administration : nom de l'auteur
  action?: { libelle: string; onChoisir: () => void } // action principale (hors lancement)
  menu: ActionMenu[] // actions du menu « … » ; « Supprimer » est ajoutée par la carte avec sa confirmation
  lancement?: boolean // côté formateur : l'action principale est « Lancer » (panneau de lancement)
  occupe?: boolean
  onSupprimer: () => Promise<void>
}) {
  const [confirmer, setConfirmer] = useState(false)
  const [panneau, setPanneau] = useState(false)
  const date = dateCourte(quiz.modifie_le)
  const idPanneau = `lancement-${quiz.id}`

  async function supprimer() {
    try {
      await onSupprimer()
    } finally {
      setConfirmer(false)
    }
  }

  return (
    <li className="flex min-w-0 flex-col rounded-carte border border-vertClair/60 bg-blanc shadow-sm">
      <div className="h-36 overflow-hidden rounded-t-carte sm:h-40">
        {quiz.image ? (
          <Photo chemin={quiz.image} alt="" ajuste="cover" className="h-full w-full" />
        ) : (
          <div aria-hidden className="flex h-full w-full items-center justify-center bg-vertFonce text-blanc">
            <span className="font-titre text-5xl tracking-wide">{initiales(quiz.titre)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="line-clamp-2 break-words font-titre text-xl leading-snug" title={quiz.titre}>
            {quiz.titre}
          </h2>
          {quiz.description && <p className="line-clamp-2 break-words text-base">{quiz.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          <span className="font-semibold">
            {quiz.nb_questions} question{quiz.nb_questions > 1 ? 's' : ''}
          </span>
          {quiz.types.map((t) => (
            <span key={t} className="rounded-pilule border border-vertFonce px-2.5 py-0.5 text-xs font-semibold text-vertFonce">
              {LIBELLES_TYPES[t] ?? t}
            </span>
          ))}
        </div>

        {quiz.code && (
          <p className="text-sm">
            Code <span data-testid="code-carte" className="font-bold tracking-widest text-vertFonce">{quiz.code}</span>
          </p>
        )}

        <p className="text-sm">
          {auteur && <>Auteur : {auteur}<br /></>}
          {date ? `Modifié le ${date}` : 'Jamais modifié'}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-1">
          {lancement ? (
            <Bouton
              type="button"
              className="min-h-[44px] flex-1 px-4 text-base"
              aria-expanded={panneau}
              aria-controls={idPanneau}
              onClick={() => setPanneau((p) => !p)}
              disabled={occupe}
            >
              Lancer
            </Bouton>
          ) : (
            action && (
              <Bouton type="button" variante="secondaire" className="min-h-[44px] flex-1 px-4 text-base" onClick={action.onChoisir} disabled={occupe}>
                {action.libelle}
              </Bouton>
            )
          )}
          <MenuActions
            libelleBouton={`Autres actions pour « ${quiz.titre} »`}
            disabled={occupe}
            actions={[...menu, { libelle: 'Supprimer', onChoisir: () => setConfirmer(true) }]}
          />
        </div>

        {lancement && panneau && (
          <div id={idPanneau} className="rounded-champ border-2 border-vert p-4">
            <PanneauLancement quizId={quiz.id} libelle="Lancer maintenant" />
          </div>
        )}

        {confirmer && (
          <div className="flex flex-col gap-3 rounded-champ border-2 border-vert p-4">
            <p className="text-base font-semibold">
              Supprimer « {quiz.titre} »{auteur ? `, le quiz de ${auteur},` : ''} et {auteur ? 'toutes ses questions' : 'ses questions'} ? Cette action est définitive.
            </p>
            <div className="flex flex-col gap-2">
              <Bouton type="button" className="min-h-[44px] text-base" onClick={supprimer} disabled={occupe}>
                Oui, supprimer
              </Bouton>
              <Bouton type="button" variante="secondaire" className="min-h-[44px] text-base" onClick={() => setConfirmer(false)} disabled={occupe} autoFocus>
                Non, garder
              </Bouton>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

// Menu « … » : s'ouvre au clic ou à Entrée/Espace, flèches haut/bas pour naviguer, Échap pour fermer (le focus revient au bouton).
function MenuActions({ libelleBouton, actions, disabled }: { libelleBouton: string; actions: ActionMenu[]; disabled: boolean }) {
  const [ouvert, setOuvert] = useState(false)
  const racine = useRef<HTMLDivElement>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!ouvert) return
    items.current[0]?.focus()
    function dehors(e: MouseEvent) {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [ouvert])

  function fermer(rendreLeFocus: boolean) {
    setOuvert(false)
    if (rendreLeFocus) bouton.current?.focus()
  }

  function touche(e: KeyboardEvent<HTMLDivElement>) {
    const liste = items.current.filter(Boolean) as HTMLButtonElement[]
    const i = liste.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      fermer(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      liste[(i + 1) % liste.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      liste[(i - 1 + liste.length) % liste.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      liste[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      liste[liste.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOuvert(false)
    }
  }

  return (
    <div ref={racine} className="relative" onKeyDown={ouvert ? touche : undefined}>
      <button
        ref={bouton}
        type="button"
        aria-label={libelleBouton}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        disabled={disabled}
        onClick={() => setOuvert((o) => !o)}
        className="flex h-[44px] w-[44px] items-center justify-center rounded-pilule border-2 border-vert bg-blanc text-vert transition-colors hover:bg-vert hover:text-blanc disabled:border-discret disabled:text-inactif disabled:hover:bg-blanc"
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="block">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {ouvert && (
        <div role="menu" aria-label={libelleBouton} className="absolute right-0 top-full z-10 mt-1 flex min-w-[14rem] flex-col rounded-champ border-2 border-vert bg-blanc py-1 shadow-lg">
          {actions.map((a, i) => (
            <button
              key={a.libelle}
              ref={(el) => {
                items.current[i] = el
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                fermer(false)
                a.onChoisir()
              }}
              className="min-h-[44px] px-4 text-left text-base font-semibold text-vertFonce hover:bg-vertClair/30 focus-visible:bg-vertClair/30"
            >
              {a.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
