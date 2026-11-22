import { useEffect, useRef, useState } from 'react'
import Photo from './Photo'
import { Coche, Personne } from './Pictos'
import { urlPhoto } from '../lib/photos'
import { lettre } from '../lib/session'

// Photo de la question sur le téléphone : pleine largeur, hauteur raisonnable, coins arrondis.
// Un appui l'agrandit en plein écran (bouton « Fermer » ou touche Échap pour revenir).
export function PhotoQuestion({ chemin }: { chemin: string }) {
  const [agrandie, setAgrandie] = useState(false)
  const fermer = useRef<HTMLButtonElement>(null)
  const ouvrir = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!agrandie) return
    fermer.current?.focus()
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAgrandie(false)
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [agrandie])

  function fermerEtRendreLeFocus() {
    setAgrandie(false)
    ouvrir.current?.focus()
  }

  return (
    <>
      <button
        ref={ouvrir}
        type="button"
        onClick={() => setAgrandie(true)}
        aria-label="Agrandir la photo de la question"
        className="relative block w-full overflow-hidden rounded-carte border-2 border-vertFonce"
      >
        {/* Boîte de taille fixe : la photo s'y inscrit en entier, rien ne bouge quand elle arrive. */}
        <Photo chemin={chemin} alt="Photo de la question" className="h-[34dvh] min-h-[180px] max-h-[320px] w-full" />
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-pilule bg-vertFonce px-3 py-1 text-sm font-semibold text-blanc">
          Agrandir
        </span>
      </button>
      {agrandie && (
        <div role="dialog" aria-modal="true" aria-label="Photo de la question en grand" className="fixed inset-0 z-50 flex flex-col bg-bleuViolet">
          <div className="flex shrink-0 justify-end p-3">
            <button
              ref={fermer}
              type="button"
              onClick={fermerEtRendreLeFocus}
              className="min-h-[56px] min-w-[56px] rounded-pilule border-2 border-blanc bg-bleuViolet px-6 text-lg font-bold text-blanc"
            >
              Fermer
            </button>
          </div>
          <img
            src={urlPhoto(chemin)}
            alt="Photo de la question"
            className="min-h-0 flex-1 object-contain px-3 pb-3"
            onClick={fermerEtRendreLeFocus}
          />
        </div>
      )}
    </>
  )
}

// Vignette d'une proposition : photo carrée, lettre, légende. Contenu commun aux grilles de choix et de résultats.
function CorpsTuile({ i, chemin, legende }: { i: number; chemin: string; legende: string }) {
  return (
    <>
      <span className="relative block w-full">
        <Photo chemin={chemin} alt={`Proposition ${lettre(i)}`} className="aspect-square w-full rounded-[0.8rem]" />
        <span
          aria-hidden
          className="absolute left-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-pilule bg-vert text-lg font-bold text-blanc shadow"
        >
          {lettre(i)}
        </span>
      </span>
      <span className={`block min-h-[1.5rem] w-full px-1 text-center text-base font-semibold leading-tight [overflow-wrap:anywhere]`}>
        {legende.trim() || <span className="sr-only">Proposition {lettre(i)}</span>}
      </span>
    </>
  )
}

// Grille de choix en photos (QCM). `multiple` : cases à cocher ; sinon un appui envoie la réponse.
// État « choisie » : bordure épaisse + icône + mot, jamais la couleur seule.
export function GrilleChoixPhotos({
  choix,
  images,
  multiple = false,
  choisis = [],
  bloque,
  onChoisir,
}: {
  choix: string[]
  images: string[]
  multiple?: boolean
  choisis?: number[]
  bloque: boolean
  onChoisir: (i: number) => void
}) {
  return (
    <div role={multiple ? 'group' : undefined} aria-label={multiple ? 'Propositions' : undefined} className="grid grid-cols-2 gap-3">
      {images.map((chemin, i) => {
        const coche = multiple && choisis.includes(i)
        return (
          <button
            key={i}
            type="button"
            role={multiple ? 'checkbox' : undefined}
            aria-checked={multiple ? coche : undefined}
            aria-label={`Proposition ${lettre(i)}${choix[i]?.trim() ? ` : ${choix[i].trim()}` : ''}`}
            disabled={bloque}
            onClick={() => onChoisir(i)}
            className={`relative flex min-h-[64px] flex-col gap-1.5 rounded-champ border-vert p-1.5 text-vertFonce transition-colors disabled:opacity-50 ${
              coche ? 'border-[6px] bg-blanc p-0.5' : 'border-2 bg-blanc active:bg-vert active:text-blanc'
            }`}
          >
            <CorpsTuile i={i} chemin={chemin} legende={choix[i] ?? ''} />
            {multiple && (
              <span
                className={`flex items-center justify-center gap-1.5 rounded-pilule py-1 text-sm font-bold ${
                  coche ? 'bg-vert text-blanc' : 'border-2 border-vertFonce text-vertFonce'
                }`}
              >
                {coche ? <Coche taille={16} /> : <span aria-hidden className="h-4 w-4 rounded-sm border-[3px] border-vertFonce" />}
                {coche ? 'Choisie' : 'Choisir'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Vignette de résultat : étiquettes « Bonne réponse » et/ou « Ta réponse » (icône + mot).
export function TuileResultat({
  i,
  chemin,
  legende,
  bonne,
  mienne,
}: {
  i: number
  chemin: string
  legende: string
  bonne: boolean
  mienne: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-champ p-1.5 ${
        bonne ? 'border-[6px] border-vert bg-blanc p-0.5' : mienne ? 'border-2 border-vertFonce' : 'border-2 border-dashed border-vertFonce/40'
      }`}
    >
      <CorpsTuile i={i} chemin={chemin} legende={legende} />
      {(bonne || mienne) && (
        <span className="flex flex-col items-stretch gap-1">
          {bonne && (
            <span className="flex items-center justify-center gap-1 whitespace-nowrap rounded-pilule bg-vert px-1.5 py-1 text-[13px] font-bold text-blanc">
              <Coche taille={16} />
              Bonne réponse
            </span>
          )}
          {mienne && (
            <span className="flex items-center justify-center gap-1 whitespace-nowrap rounded-pilule border-2 border-vertFonce px-1.5 py-0.5 text-[13px] font-bold text-vertFonce">
              <Personne taille={14} />
              Ta réponse
            </span>
          )}
        </span>
      )}
    </div>
  )
}
