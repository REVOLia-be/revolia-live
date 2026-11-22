import { useEffect } from 'react'
import { supabase } from './supabase'

// Photos des questions : préparation dans le navigateur (redimensionnement + compression),
// envoi dans le stockage Supabase (bucket public « quiz-images »), adresse d'affichage.
// Aucun service tiers : tout se passe entre le navigateur et Supabase.

export const BUCKET = 'quiz-images'
export const TAILLE_MAX_OCTETS = 2 * 1024 * 1024 // limite du bucket
export const TAILLE_MAX_FICHIER_CHOISI = 30 * 1024 * 1024 // avant redimensionnement (photo de smartphone)

export const MESSAGE_DROITS =
  "N'utilise que des photos dont tu as les droits et sans personnes reconnaissables sans leur accord."

export type GenrePhoto = 'question' | 'choix'

// Photo de question : 1280 px de côté au plus, moins de 250 Ko. Photo de proposition : 640 px, moins de 80 Ko.
export const REGLAGES: Record<GenrePhoto, { cote: number; qualite: number; objectifOctets: number }> = {
  question: { cote: 1280, qualite: 0.75, objectifOctets: 250 * 1024 },
  choix: { cote: 640, qualite: 0.75, objectifOctets: 80 * 1024 },
}

export const TYPES_ACCEPTES = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

export interface PhotoPreparee {
  blob: Blob
  type: 'image/webp' | 'image/jpeg'
  largeur: number
  hauteur: number
}

export class ErreurPhoto extends Error {}

function enBlob(canvas: HTMLCanvasElement, type: string, qualite: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, qualite))
}

async function decoder(fichier: File): Promise<ImageBitmap> {
  const options = { imageOrientation: 'from-image' } as ImageBitmapOptions
  try {
    return await createImageBitmap(fichier, options)
  } catch {
    const heic = /hei[cf]/i.test(fichier.type) || /\.hei[cf]$/i.test(fichier.name)
    throw new ErreurPhoto(
      heic
        ? "Ton navigateur ne sait pas lire ce format de photo (HEIC). Enregistre-la en JPEG depuis ton téléphone, ou choisis une autre photo."
        : "Cette photo n'a pas pu être lue. Choisis une photo au format JPEG, PNG ou WebP.",
    )
  }
}

// Lit la photo choisie, la redimensionne (orientation EXIF respectée) et l'exporte en WebP
// (JPEG si le navigateur ne sait pas écrire du WebP). La qualité baisse, puis la taille, jusqu'à passer sous l'objectif.
export async function preparerPhoto(fichier: File, genre: GenrePhoto): Promise<PhotoPreparee> {
  if (fichier.type && !/^image\//.test(fichier.type)) {
    throw new ErreurPhoto("Ce fichier n'est pas une photo. Choisis une photo au format JPEG, PNG ou WebP.")
  }
  if (fichier.size > TAILLE_MAX_FICHIER_CHOISI) {
    throw new ErreurPhoto('Cette photo est trop lourde (30 Mo maximum). Choisis-en une plus légère.')
  }
  const { cote, qualite, objectifOctets } = REGLAGES[genre]
  const image = await decoder(fichier)
  try {
    let echelle = Math.min(1, cote / Math.max(image.width, image.height))
    let meilleur: PhotoPreparee | null = null
    for (let passe = 0; passe < 4; passe++) {
      const largeur = Math.max(1, Math.round(image.width * echelle))
      const hauteur = Math.max(1, Math.round(image.height * echelle))
      const canvas = document.createElement('canvas')
      canvas.width = largeur
      canvas.height = hauteur
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new ErreurPhoto("Ton navigateur n'arrive pas à préparer la photo. Essaie avec un autre navigateur.")
      let q = qualite
      for (let essai = 0; essai < 6; essai++) {
        // Un blob WebP n'existe que si le navigateur sait l'écrire ; sinon toBlob renvoie du PNG : on bascule en JPEG.
        let type: PhotoPreparee['type'] = 'image/webp'
        ctx.clearRect(0, 0, largeur, hauteur)
        ctx.drawImage(image, 0, 0, largeur, hauteur)
        let blob = await enBlob(canvas, type, q)
        if (!blob || blob.type !== 'image/webp') {
          type = 'image/jpeg'
          ctx.fillStyle = '#ffffff' // le JPEG n'a pas de transparence
          ctx.globalCompositeOperation = 'destination-over'
          ctx.fillRect(0, 0, largeur, hauteur)
          ctx.globalCompositeOperation = 'source-over'
          blob = await enBlob(canvas, type, q)
        }
        if (!blob) throw new ErreurPhoto("La photo n'a pas pu être préparée. Essaie avec une autre photo.")
        meilleur = { blob, type, largeur, hauteur }
        if (blob.size <= objectifOctets) return meilleur
        q = Math.max(0.4, q - 0.1)
        if (q === 0.4 && essai >= 3) break
      }
      echelle *= 0.8 // toujours trop lourde à la qualité minimale : on réduit aussi les dimensions
    }
    if (!meilleur || meilleur.blob.size > TAILLE_MAX_OCTETS) {
      throw new ErreurPhoto('Cette photo reste trop lourde même après réduction. Choisis-en une plus simple.')
    }
    return meilleur
  } finally {
    image.close()
  }
}

// --- Stockage ---------------------------------------------------------------------------------

// Photos envoyées pendant cette séance d'édition et pas encore enregistrées dans un quiz : ce sont les seules qu'on supprime
// (une photo déjà enregistrée peut servir à un autre quiz, copié, ou à une séance déjà lancée).
const envoyeesNonEnregistrees = new Set<string>()

export async function envoyerPhoto(photo: PhotoPreparee, formateurId: string): Promise<string> {
  const chemin = `${formateurId}/${crypto.randomUUID()}.${photo.type === 'image/webp' ? 'webp' : 'jpg'}`
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, photo.blob, { contentType: photo.type, upsert: false })
  if (error) {
    throw new ErreurPhoto("L'envoi de la photo a échoué. Vérifie ta connexion, puis réessaie.")
  }
  envoyeesNonEnregistrees.add(chemin)
  return chemin
}

export function urlPhoto(chemin: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl
}

// À appeler après l'enregistrement du quiz : ces photos font désormais partie d'un quiz, on n'y touche plus.
export function photosEnregistrees(chemins: (string | null | undefined)[]): void {
  chemins.forEach((c) => c && envoyeesNonEnregistrees.delete(c))
}

// Supprime une photo remplacée ou retirée, seulement si elle est dans le dossier du formateur courant
// et n'a jamais été enregistrée. Échec silencieux : un fichier orphelin ne gêne personne.
export async function supprimerPhotoSiOrpheline(chemin: string | null | undefined, formateurId: string): Promise<void> {
  if (!chemin || !chemin.startsWith(`${formateurId}/`) || !envoyeesNonEnregistrees.has(chemin)) return
  envoyeesNonEnregistrees.delete(chemin)
  try {
    await supabase.storage.from(BUCKET).remove([chemin])
  } catch {
    /* silencieux */
  }
}

// --- Chargement à l'avance ---------------------------------------------------------------------

const dejaDemandees = new Set<string>()

export function precharger(chemins: (string | null | undefined)[]): void {
  for (const c of chemins) {
    if (!c || dejaDemandees.has(c)) continue
    dejaDemandees.add(c)
    const img = new Image()
    img.decoding = 'async'
    img.src = urlPhoto(c)
  }
}

// Dès qu'une question arrive dans l'état, ses photos sont demandées au navigateur (elles seront en cache à l'affichage).
export function usePrechargement(image: string | null | undefined, imagesChoix: string[] | null | undefined): void {
  const cle = [image ?? '', ...(imagesChoix ?? [])].join('|')
  useEffect(() => {
    precharger([image, ...(imagesChoix ?? [])])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])
}
