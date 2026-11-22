import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// --- Participants : connexion anonyme, invisible -----------------------------------------
// supabase-js garde la session dans le navigateur : un rechargement retrouve le même participant.

let connexionEnCours: Promise<void> | null = null

export function assurerConnexionAnonyme(): Promise<void> {
  // On mémorise l'appel pour ne jamais créer deux identités si deux écrans démarrent en même temps.
  if (!connexionEnCours) {
    connexionEnCours = (async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) return
      const { error } = await supabase.auth.signInAnonymously()
      if (error) throw error
    })().catch((e) => {
      connexionEnCours = null
      throw e
    })
  }
  return connexionEnCours
}

// --- Formateur : lien magique + présence dans la table `formateurs` ----------------------

export type StatutFormateur =
  | { statut: 'chargement' }
  | { statut: 'deconnecte' }
  | { statut: 'non_autorise' }
  | { statut: 'erreur'; erreur: unknown }
  | { statut: 'ok'; id: string; email: string; est_admin: boolean }

export function useFormateur(): StatutFormateur {
  const [etat, setEtat] = useState<StatutFormateur>({ statut: 'chargement' })

  useEffect(() => {
    let actif = true
    async function verifier() {
      try {
        const { data } = await supabase.auth.getSession()
        const utilisateur = data.session?.user
        if (!utilisateur || utilisateur.is_anonymous) {
          if (actif) setEtat({ statut: 'deconnecte' })
          return
        }
        // Un admin peut lire plusieurs fiches : on cible explicitement la sienne.
        const { data: fiche, error } = await supabase
          .from('formateurs')
          .select('id, email, est_admin, actif')
          .eq('id', utilisateur.id)
          .maybeSingle()
        if (!actif) return
        if (error) setEtat({ statut: 'erreur', erreur: error })
        else if (!fiche || !fiche.actif) setEtat({ statut: 'non_autorise' })
        else setEtat({ statut: 'ok', id: fiche.id, email: fiche.email, est_admin: !!fiche.est_admin })
      } catch (e) {
        if (actif) setEtat({ statut: 'erreur', erreur: e })
      }
    }
    void verifier()
    return () => {
      actif = false
    }
  }, [])

  return etat
}
