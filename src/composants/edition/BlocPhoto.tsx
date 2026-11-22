import { useRef, useState } from 'react'
import Photo from '../Photo'
import { envoyerPhoto, preparerPhoto, supprimerPhotoSiOrpheline, TYPES_ACCEPTES, type GenrePhoto } from '../../lib/photos'

const PETIT_BOUTON =
  'min-h-[44px] rounded-pilule border-2 border-vert bg-blanc px-4 text-base font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc disabled:opacity-40 disabled:hover:bg-blanc disabled:hover:text-vert'

// Ajouter / remplacer / retirer une photo, avec aperçu et indicateur d'envoi.
// `onChoisie` reçoit le nouveau chemin, `onRetiree` est appelé quand la photo est retirée.
// `signalerEnvoi(+1 | -1)` prévient l'éditeur : pas d'enregistrement tant qu'un envoi est en cours.
export default function BlocPhoto({
  id,
  chemin,
  genre,
  formateurId,
  libelle,
  alt,
  compact = false,
  onChoisie,
  onRetiree,
  signalerEnvoi,
}: {
  id: string
  chemin: string | null | undefined
  genre: GenrePhoto
  formateurId: string
  libelle: string // ex. « photo de la question », « photo de la proposition A »
  alt: string
  compact?: boolean
  onChoisie: (chemin: string) => void
  onRetiree: () => void
  signalerEnvoi: (delta: 1 | -1) => void
}) {
  const entree = useRef<HTMLInputElement>(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [apercuLocal, setApercuLocal] = useState<string | null>(null)

  async function choisir(fichier: File) {
    setErreur(null)
    setEnvoi(true)
    signalerEnvoi(1)
    const local = URL.createObjectURL(fichier)
    setApercuLocal(local)
    try {
      const prete = await preparerPhoto(fichier, genre)
      const nouveau = await envoyerPhoto(prete, formateurId)
      const ancien = chemin
      onChoisie(nouveau)
      void supprimerPhotoSiOrpheline(ancien, formateurId)
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : "La photo n'a pas pu être ajoutée. Réessaie avec une autre photo.")
    } finally {
      URL.revokeObjectURL(local)
      setApercuLocal(null)
      setEnvoi(false)
      signalerEnvoi(-1)
      if (entree.current) entree.current.value = ''
    }
  }

  function retirer() {
    const ancien = chemin
    onRetiree()
    void supprimerPhotoSiOrpheline(ancien, formateurId)
  }

  const tailleVignette = compact ? 'h-20 w-20' : 'h-40 w-full max-w-xs'
  return (
    <div className={`flex ${compact ? 'items-center gap-3' : 'flex-col gap-2'}`}>
      {(chemin || apercuLocal) && (
        <div className={`relative shrink-0 rounded-champ border-2 border-vert ${tailleVignette}`} data-photo-apercu={id}>
          {apercuLocal ? (
            <img src={apercuLocal} alt="" className="h-full w-full rounded-[0.85rem] object-contain opacity-60" />
          ) : (
            <Photo chemin={chemin as string} alt={alt} className="h-full w-full rounded-[0.85rem]" />
          )}
          {envoi && (
            <span role="status" className="absolute inset-x-0 bottom-0 bg-vertFonce px-2 py-1 text-center text-sm font-semibold text-blanc">
              Envoi…
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap gap-2">
          <input
            ref={entree}
            id={`fichier-${id}`}
            type="file"
            accept={TYPES_ACCEPTES}
            className="sr-only"
            tabIndex={-1}
            aria-label={`Choisir la ${libelle}`}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void choisir(f)
            }}
          />
          <button type="button" className={PETIT_BOUTON} disabled={envoi} onClick={() => entree.current?.click()}>
            {envoi ? 'Envoi en cours…' : chemin ? 'Remplacer la photo' : 'Ajouter une photo'}
          </button>
          {chemin && !envoi && (
            <button type="button" className={PETIT_BOUTON} onClick={retirer} aria-label={`Retirer la ${libelle}`}>
              Retirer la photo
            </button>
          )}
        </div>
        {erreur && (
          <p role="alert" className="text-base font-semibold">
            {erreur}
          </p>
        )}
      </div>
    </div>
  )
}
