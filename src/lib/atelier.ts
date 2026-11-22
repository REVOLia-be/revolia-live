import { supabase } from './supabase'

// Ateliers « à son rythme » : formats partagés entre l'éditeur, le téléphone, l'écran projeté et la vue formateur.
// Les noms (chemin, nom, taille, url, libelle, titre, texte…) sont ceux de la base (voir docs/SPEC-ATELIERS.md).

export interface FichierAtelier {
  chemin: string // « <uuid formateur>/<uuid>.<ext> » dans le bucket « atelier-fichiers »
  nom: string // nom d'origine, affiché
  taille: number // octets
}
export interface LienAtelier {
  url: string // https:// uniquement
  libelle: string
}
export interface PromptAtelier {
  titre: string
  texte: string
}
export interface EtapeAtelier {
  id: string
  ordre: number
  titre: string
  consigne: string
  fichiers: FichierAtelier[]
  liens: LienAtelier[]
  prompts: PromptAtelier[]
  rendu_attendu: boolean
}

export const LIMITES_ATELIER = {
  titreEtape: 120,
  consigne: 4000,
  fichiers: 10,
  liens: 10,
  prompts: 10,
  texteprompt: 4000,
  rendu: 5000,
  libelleLien: 120,
  titrePrompt: 120,
  tailleFichier: 20 * 1024 * 1024,
}

export const BUCKET_FICHIERS = 'atelier-fichiers'

export const EXTENSIONS_FICHIERS: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
}
export const ACCEPT_FICHIERS = Object.keys(EXTENSIONS_FICHIERS)
  .map((e) => `.${e}`)
  .join(',')

export function extensionDe(nom: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nom.trim())
  return m ? m[1].toLowerCase() : ''
}

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`
  return `${(octets / (1024 * 1024)).toLocaleString('fr-BE', { maximumFractionDigits: 1 })} Mo`
}

export function typeFichier(nom: string): string {
  return extensionDe(nom).toUpperCase()
}

export function urlFichier(chemin: string): string {
  return supabase.storage.from(BUCKET_FICHIERS).getPublicUrl(chemin).data.publicUrl
}

// Envoie un fichier dans le dossier du formateur. Renvoie la description à enregistrer dans l'étape.
export async function envoyerFichier(fichier: File, formateurId: string): Promise<FichierAtelier> {
  const ext = extensionDe(fichier.name)
  if (!EXTENSIONS_FICHIERS[ext]) {
    throw new Error("Ce type de fichier n'est pas accepté. Choisis un PDF, Word, Excel, PowerPoint, une image, un fichier texte ou CSV.")
  }
  if (fichier.size > LIMITES_ATELIER.tailleFichier) {
    throw new Error('Ce fichier est trop lourd (20 Mo maximum). Choisis-en un plus léger.')
  }
  const chemin = `${formateurId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET_FICHIERS)
    .upload(chemin, fichier, { contentType: EXTENSIONS_FICHIERS[ext], upsert: false })
  if (error) throw new Error("L'envoi du fichier a échoué. Vérifie ta connexion, puis réessaie.")
  return { chemin, nom: fichier.name.slice(0, 200), taille: fichier.size }
}

// Liens d'ouverture d'un prompt dans un assistant (le texte est encodé, jamais inséré tel quel).
export const lienChatGpt = (texte: string) => `https://chatgpt.com/?q=${encodeURIComponent(texte)}`
export const lienClaude = (texte: string) => `https://claude.ai/new?q=${encodeURIComponent(texte)}`

export const estLienHttps = (url: string) => {
  try {
    return new URL(url.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

// --- Suivi côté formateur (réponse de la RPC atelier_suivi) ---------------------------------

export interface SuiviEtape {
  id: string
  ordre: number
  titre: string
  rendu_attendu: boolean
}
export interface SuiviParticipant {
  participant_id: string
  pseudo: string
  etape: number
  termine: boolean
  bloque_depuis: string | null
  en_route: boolean
  maj_le: string
}
export interface SuiviRendu {
  id: string
  etape_id: string
  participant_id: string
  pseudo: string
  texte: string
  maj_le: string
}
export interface SuiviAtelier {
  question_id: string
  etapes: SuiviEtape[]
  participants: SuiviParticipant[]
  rendus: SuiviRendu[]
}

export function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`
}
export const personnes = (n: number) => pluriel(n, 'personne', 'personnes')

// Durée écoulée en minutes entières, lisible (« 3 min », « moins d'1 min »).
export function dureeDepuis(iso: string | null | undefined, maintenant: number): string {
  if (!iso) return '—'
  const t = Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'))
  if (Number.isNaN(t)) return '—'
  const min = Math.floor((maintenant - t) / 60000)
  if (min < 1) return "moins d'1 min"
  return `${min} min`
}
