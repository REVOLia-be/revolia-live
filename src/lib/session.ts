import { useCallback, useEffect, useRef, useState } from 'react'
import { appelerRpc } from './api'
import { estErreurReseau, messageErreur } from './erreurs'
import { lireDate } from './horloge'
import { supabase } from './supabase'

// --- Formats renvoyés par la base (voir supabase/migrations/…_fonctions.sql) ----------------

export type NomEtat = 'attente' | 'question' | 'resultats' | 'bilan' | 'terminee'
export type TypeQuestion = 'qcm' | 'nuage' | 'ouverte' | 'echelle'

export interface Jauge {
  points: number
  maximum: number
  paliers: number[] // fractions du maximum, ex. [0.4, 0.65, 0.85]
  paliers_atteints: number
}

export interface QuestionCourante {
  id: string
  ordre: number // commence à 1
  type: TypeQuestion
  enonce: string
  choix: string[] | null
  libelle_min: string | null
  libelle_max: string | null
  duree_secondes: number
  ouverte_le: string | null
  fin_reponses_le: string | null
  nb_reponses: number
}

export interface ResultatsQuestion {
  question_id: string
  nb_reponses: number
  // QCM
  bonne_reponse?: number
  repartition?: number[]
  taux_reussite?: number | null
  // Côté participant uniquement
  ma_reponse?: number | string | null
  est_correcte?: boolean | null
  ma_contribution?: number
}

export type NomMention = 'a_repondu_a_tout' | 'plus_belle_progression' | 'coup_de_coeur'

export interface Mention {
  type: NomMention
  pseudo: string
  texte: string | null
}

export interface Bilan {
  jauge: Jauge
  nb_participants: number
  nb_reponses: number
  taux_reussite_qcm: number | null
  nuage: { mot: string; nombre: number }[]
  mentions: Mention[]
}

export interface EtatSession {
  maintenant: string
  session_id: string
  titre: string
  code: string
  etat: NomEtat
  mode_tables: boolean
  nb_questions: number
  nb_participants: number
  jauge: Jauge
  moi?: { participant_id: string; pseudo: string; table_id: string | null } // participant seulement
  question?: QuestionCourante
  a_repondu?: boolean // participant seulement
  resultats?: ResultatsQuestion
  bilan?: Bilan
}

export interface ParticipantListe {
  id: string
  pseudo: string
}

export function lettre(indice: number): string {
  return String.fromCharCode(65 + indice)
}

// --- Le hook : l'état complet de la session, toujours à jour ---------------------------------
//
// Règle d'or : on ne reconstruit JAMAIS l'état à partir d'un événement temps réel.
// Un événement veut seulement dire « quelque chose a changé » : on rappelle etat_session.
// On rappelle aussi au retour du réseau, au retour au premier plan, à la reprise du canal,
// et toutes les 10 secondes par sécurité. Jamais plus d'un appel toutes les 500 ms.

const DELAI_MINIMUM_MS = 500
const FILET_DE_SECURITE_MS = 10_000

interface Options {
  presentateur?: boolean // le présentateur suit aussi les arrivées et les réponses
}

export function useEtatSession(sessionId: string | undefined, options: Options = {}) {
  const presentateur = options.presentateur ?? false
  const [etat, setEtat] = useState<EtatSession | null>(null)
  const [participants, setParticipants] = useState<ParticipantListe[]>([])
  const [decalage, setDecalage] = useState(0) // heure du serveur − heure du téléphone, en ms
  const [erreur, setErreur] = useState<string | null>(null)
  const [connexionPerdue, setConnexionPerdue] = useState(false)
  const demanderRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!sessionId) return
    setEtat(null)
    setErreur(null)

    let actif = true
    let numeroAppel = 0 // pour ignorer une réponse arrivée en retard
    let dernierNumeroApplique = 0
    let dernierAppel = 0
    let minuteur: number | undefined
    let appelEnEchec = false
    let canalEnEchec = false

    function majIndicateur() {
      if (actif) setConnexionPerdue(appelEnEchec || canalEnEchec || !navigator.onLine)
    }

    async function charger() {
      dernierAppel = Date.now()
      const mien = ++numeroAppel
      const debut = Date.now()
      try {
        const [donnees, liste] = await Promise.all([
          appelerRpc<EtatSession>('etat_session', { p_session: sessionId }),
          presentateur ? lireParticipants(sessionId!) : Promise.resolve(null),
        ])
        if (!actif || mien < dernierNumeroApplique) return
        dernierNumeroApplique = mien
        // On suppose que la réponse a mis autant de temps à venir qu'à partir : heure du serveur = milieu de l'appel.
        const milieu = (debut + Date.now()) / 2
        setDecalage(lireDate(donnees.maintenant) - milieu)
        setEtat(donnees)
        if (liste) setParticipants(liste)
        setErreur(null)
        appelEnEchec = false
      } catch (e) {
        if (!actif) return
        if (estErreurReseau(e)) {
          appelEnEchec = true // on garde l'ancien état affiché et on réessaiera
        } else {
          appelEnEchec = false
          setErreur(messageErreur(e))
        }
      }
      majIndicateur()
    }

    // Regroupe les demandes : au plus un appel toutes les 500 ms.
    function demander() {
      if (minuteur !== undefined) return
      const attente = Math.max(0, DELAI_MINIMUM_MS - (Date.now() - dernierAppel))
      minuteur = window.setTimeout(() => {
        minuteur = undefined
        void charger()
      }, attente)
    }
    demanderRef.current = demander

    // Temps réel
    const nomCanal = `session-${sessionId}-${Math.random().toString(36).slice(2)}`
    let canal = supabase.channel(nomCanal).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      demander,
    )
    if (presentateur) {
      canal = canal
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
          demander,
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'reponses', filter: `session_id=eq.${sessionId}` },
          demander,
        )
    }
    canal.subscribe((statut) => {
      if (!actif) return
      if (statut === 'SUBSCRIBED') {
        canalEnEchec = false
        majIndicateur()
        demander() // reprise du canal : des événements ont pu être manqués
      } else if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT' || statut === 'CLOSED') {
        canalEnEchec = true
        majIndicateur()
      }
    })

    // Autres raisons de recharger
    const auRetourDuReseau = () => {
      majIndicateur()
      demander()
    }
    const auRetourAuPremierPlan = () => {
      if (document.visibilityState === 'visible') demander()
    }
    window.addEventListener('online', auRetourDuReseau)
    window.addEventListener('offline', majIndicateur)
    document.addEventListener('visibilitychange', auRetourAuPremierPlan)
    const filet = window.setInterval(demander, FILET_DE_SECURITE_MS)

    void charger()

    return () => {
      actif = false
      window.clearTimeout(minuteur)
      window.clearInterval(filet)
      window.removeEventListener('online', auRetourDuReseau)
      window.removeEventListener('offline', majIndicateur)
      document.removeEventListener('visibilitychange', auRetourAuPremierPlan)
      void supabase.removeChannel(canal)
    }
  }, [sessionId, presentateur])

  const recharger = useCallback(() => demanderRef.current(), [])

  return { etat, participants, decalage, erreur, connexionPerdue, recharger }
}

async function lireParticipants(sessionId: string): Promise<ParticipantListe[]> {
  const { data, error } = await supabase
    .from('participants')
    .select('id, pseudo')
    .eq('session_id', sessionId)
    .order('rejoint_le')
  if (error) throw error
  return data ?? []
}
