// Rapport de quiz par email, page web du rapport, newsletter et réglages d'administration.
// Les formats ci-dessous suivent le « Contrat précis » de docs/SPEC-RAPPORT-EMAIL.md.

import { FunctionsHttpError } from '@supabase/supabase-js'
import { appelerRpc } from './api'
import { supabase } from './supabase'
import type { TypeQuestion } from './session'

// --- Formats ---------------------------------------------------------------------------------

export interface LienSuivi {
  titre: string // ≤ 80
  texte: string // ≤ 200
  url: string // https
  bouton: string // ≤ 40
}

export const MAX_LIENS = 5
export const LIMITES_LIEN = { titre: 80, texte: 200, bouton: 40 } as const

export interface EtapeRapport {
  titre: string
  mon_rendu: string | null
}

export interface QuestionRapport {
  ordre: number
  type: TypeQuestion
  enonce: string
  /** Chemin dans le stockage « quiz-images » (ou adresse complète). */
  image_url: string | null
  choix: string[] | null
  images_choix: string[] | null
  /** Texte(s) ou indice(s) selon le type : QCM = indices, échelle = nombre, nuage / ouverte = textes. */
  mes_reponses: (string | number)[] | null
  /** Seulement pour un QCM dont la question est fermée. */
  bonnes_reponses: number[] | null
  explication: string | null
  etapes: EtapeRapport[] | null
  // Facultatif (pas dans le contrat de base) : légendes des extrémités d'une échelle.
  libelle_min?: string | null
  libelle_max?: string | null
}

export interface RapportComplet {
  quiz_titre: string
  date: string
  formateur_nom: string | null
  pseudo: string | null
  questions: QuestionRapport[]
  liens_suivi: LienSuivi[]
  newsletter_proposee: boolean
  jeton_newsletter: string | null
  newsletter_confirmee: boolean
  url_confidentialite: string | null
}

export type ModeReglage = 'herite' | 'actif' | 'inactif'

export interface ParametresRapport {
  rapport_actif: boolean
  newsletter_active: boolean
  liens_suivi: LienSuivi[]
  url_confidentialite: string | null
}

export interface ReglagesQuiz {
  rapport: ModeReglage
  newsletter: ModeReglage
  /** null = le quiz utilise les liens généraux. */
  liens_suivi: LienSuivi[] | null
  liens_generaux: LienSuivi[]
}

export interface EtatConfigEnvoi {
  resend: boolean | null // null = inconnu (fonction absente ou injoignable)
  circle: boolean | null
}

// --- Appels ----------------------------------------------------------------------------------

export async function demanderRapport(sessionId: string, email: string): Promise<string> {
  const reponse = await appelerRpc<{ demande_id: string }>('demander_rapport', { p_session: sessionId, p_email: email })
  return reponse.demande_id
}

export type ResultatEnvoi =
  | { statut: 'envoye' }
  | { statut: 'indisponible'; urlRapport: string } // envoi d'emails non configuré : on propose le lien direct
  | { statut: 'echec'; message: string }

const MESSAGE_ECHEC_ENVOI =
  "L'email n'a pas pu partir pour l'instant. Réessaie dans un instant : ta demande est bien enregistrée."

export async function envoyerRapport(demandeId: string): Promise<ResultatEnvoi> {
  const { data, error } = await supabase.functions.invoke('rapport-email', { body: { demande_id: demandeId } })
  if (!error) return { statut: 'envoye' }
  if (error instanceof FunctionsHttpError) {
    let corps: Record<string, unknown> = {}
    try {
      corps = await (error.context as Response).json()
    } catch {
      // réponse vide ou illisible
    }
    const url = corps.url_rapport
    if ((error.context as Response).status === 503 && typeof url === 'string' && url) {
      return { statut: 'indisponible', urlRapport: url }
    }
    const msg = corps.message ?? corps.erreur ?? corps.error
    return { statut: 'echec', message: typeof msg === 'string' && msg.trim() ? msg : MESSAGE_ECHEC_ENVOI }
  }
  void data
  return { statut: 'echec', message: MESSAGE_ECHEC_ENVOI }
}

export function lireRapportParJeton(jeton: string): Promise<RapportComplet> {
  return appelerRpc<RapportComplet>('rapport_par_jeton', { p_jeton: jeton })
}

export type ResultatNewsletter = 'confirme' | 'deja' | 'invalide' | 'indisponible'

// Appel direct (la page est publique : aucune connexion). La fonction est déployée sans vérification de jeton de connexion.
export async function confirmerNewsletter(jeton: string): Promise<ResultatNewsletter> {
  try {
    const reponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-confirmer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ jeton }),
    })
    if (reponse.status >= 500) return 'indisponible'
    const corps = (await reponse.json().catch(() => ({}))) as { ok?: boolean; deja?: boolean }
    if (reponse.ok && corps.ok) return corps.deja ? 'deja' : 'confirme'
    return 'invalide'
  } catch {
    return 'indisponible'
  }
}

export async function lireParametres(): Promise<ParametresRapport> {
  const p = await appelerRpc<ParametresRapport>('admin_lire_parametres')
  return { ...p, liens_suivi: p.liens_suivi ?? [] }
}

export function enregistrerParametres(p: ParametresRapport): Promise<unknown> {
  return appelerRpc('admin_modifier_parametres', {
    p_rapport_actif: p.rapport_actif,
    p_newsletter_active: p.newsletter_active,
    p_liens: p.liens_suivi,
    p_url_confidentialite: p.url_confidentialite?.trim() ? p.url_confidentialite.trim() : null,
  })
}

export async function lireReglagesQuiz(quizId: string): Promise<ReglagesQuiz> {
  const r = await appelerRpc<ReglagesQuiz>('admin_lire_reglages_quiz', { p_quiz: quizId })
  return { ...r, liens_generaux: r.liens_generaux ?? [] }
}

export function enregistrerReglagesQuiz(quizId: string, r: Pick<ReglagesQuiz, 'rapport' | 'newsletter' | 'liens_suivi'>) {
  return appelerRpc('admin_modifier_reglages_quiz', {
    p_quiz: quizId,
    p_rapport: r.rapport,
    p_newsletter: r.newsletter,
    p_liens: r.liens_suivi,
  })
}

export function autoriserRapportFormateur(formateurId: string, autorise: boolean) {
  return appelerRpc('admin_autoriser_rapport_formateur', { p_formateur: formateurId, p_autorise: autorise })
}

// État de la configuration de l'envoi, lu par la fonction « rapport-email » (GET ?etat=1). Tolérant : « inconnu » si elle n'existe pas encore.
export async function lireConfigEnvoi(): Promise<EtatConfigEnvoi> {
  const inconnu: EtatConfigEnvoi = { resend: null, circle: null }
  try {
    const { data } = await supabase.auth.getSession()
    const jeton = data.session?.access_token
    if (!jeton) return inconnu
    const reponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rapport-email?etat=1`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${jeton}` },
    })
    if (!reponse.ok) return inconnu
    const corps = (await reponse.json()) as { resend?: unknown; circle?: unknown }
    return {
      resend: typeof corps.resend === 'boolean' ? corps.resend : null,
      circle: typeof corps.circle === 'boolean' ? corps.circle : null,
    }
  } catch {
    return inconnu
  }
}

// --- Aides d'affichage -----------------------------------------------------------------------

export function liensValides(liens: LienSuivi[]): string | null {
  for (const [i, l] of liens.entries()) {
    const n = i + 1
    if (!l.titre.trim() || !l.url.trim() || !l.bouton.trim()) return `Le lien n° ${n} doit avoir un titre, une adresse et un texte de bouton.`
    if (!/^https:\/\/\S+$/i.test(l.url.trim())) return `L'adresse du lien n° ${n} doit commencer par https://.`
  }
  return null
}

export function nettoyerLiens(liens: LienSuivi[]): LienSuivi[] {
  return liens.map((l) => ({ titre: l.titre.trim(), texte: l.texte.trim(), url: l.url.trim(), bouton: l.bouton.trim() }))
}

export function formaterDate(iso: string): { jour: string; date: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { jour: '', date: '' }
  const jour = d.toLocaleDateString('fr-BE', { weekday: 'long' })
  return {
    jour: jour.charAt(0).toUpperCase() + jour.slice(1),
    date: d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}
