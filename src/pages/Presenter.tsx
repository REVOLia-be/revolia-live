import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import JaugeCollective from '../composants/JaugeCollective'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPagePresentateur from '../composants/MiseEnPagePresentateur'
import EcranAttente from '../composants/presentateur/EcranAttente'
import EcranBilan from '../composants/presentateur/EcranBilan'
import EcranQuestion from '../composants/presentateur/EcranQuestion'
import EcranResultats from '../composants/presentateur/EcranResultats'
import MenuModeration from '../composants/presentateur/MenuModeration'
import { ConnexionPerdueContext } from '../composants/presentateur/ZonesEcran'
import { appelerRpc } from '../lib/api'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { useSecondesRestantes } from '../lib/horloge'
import { useEtatSession, type ParticipantListe } from '../lib/session'

export default function Presenter() {
  const { sessionId } = useParams()
  const formateur = useFormateur()

  if (formateur.statut === 'chargement') {
    return (
      <MiseEnPagePresentateur>
        <p>Un instant…</p>
      </MiseEnPagePresentateur>
    )
  }
  if (formateur.statut === 'deconnecte') return <Navigate to="/formateur/connexion" replace />
  if (formateur.statut === 'non_autorise') {
    return (
      <MiseEnPagePresentateur>
        <p>Ce compte n'est pas encore autorisé comme formateur.</p>
      </MiseEnPagePresentateur>
    )
  }
  if (formateur.statut === 'erreur') {
    return (
      <MiseEnPagePresentateur>
        <p>{messageErreur(formateur.erreur)}</p>
      </MiseEnPagePresentateur>
    )
  }
  return <PresenterConnecte sessionId={sessionId ?? ''} />
}

function PresenterConnecte({ sessionId }: { sessionId: string }) {
  const { etat, participants, decalage, erreur, connexionPerdue, recharger } = useEtatSession(sessionId, {
    presentateur: true,
  })
  const [enCours, setEnCours] = useState(false)
  const [erreurAction, setErreurAction] = useState<string | null>(null)
  const [essai, setEssai] = useState(0) // relance la fermeture automatique si elle a échoué
  const questionFermee = useRef<string | null>(null) // garantit une seule fermeture par question

  const question = etat?.etat === 'question' ? etat.question : undefined
  const secondes = useSecondesRestantes(question?.fin_reponses_le, decalage)

  async function fermerQuestion() {
    if (!question || questionFermee.current === question.id) return
    questionFermee.current = question.id
    try {
      await appelerRpc('fermer_question', { p_session: sessionId })
      recharger()
    } catch (e) {
      questionFermee.current = null
      setErreurAction(messageErreur(e))
      window.setTimeout(() => setEssai((n) => n + 1), 2000)
    }
  }

  // À zéro, le présentateur ferme la question tout seul, 1,5 s plus tard :
  // le serveur accepte encore 2 s de retard pour les réponses parties juste avant la fin
  // sur un wifi lent. Fermer pile à zéro les rejetterait.
  useEffect(() => {
    if (!question || secondes !== 0) return
    const minuteur = window.setTimeout(() => void fermerQuestion(), 1500)
    return () => window.clearTimeout(minuteur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, secondes, essai])

  async function piloter(fonction: 'ouvrir_question' | 'passer_au_bilan' | 'terminer_session') {
    setEnCours(true)
    setErreurAction(null)
    try {
      await appelerRpc(fonction, { p_session: sessionId })
      recharger()
    } catch (e) {
      setErreurAction(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  // Modération : exclure un pseudo déplacé (avec confirmation) ou agir sur une réponse.
  async function exclure(p: ParticipantListe) {
    if (!window.confirm(`Exclure « ${p.pseudo} » de la salle ?`)) return
    await actionFormateur('exclure_participant', { p_participant: p.id })
  }
  async function actionReponse(fonction: 'basculer_coup_de_coeur' | 'masquer_reponse', idReponse: string) {
    await actionFormateur(fonction, { p_reponse: idReponse })
  }
  async function actionFormateur(fonction: string, parametres: Record<string, unknown>) {
    setErreurAction(null)
    try {
      await appelerRpc(fonction, parametres)
      recharger()
    } catch (e) {
      setErreurAction(messageErreur(e))
    }
  }

  // --- Télécommande de présentation : elle envoie des touches du clavier -----------------------
  const [noir, setNoir] = useState(false) // voile « écran noir »
  const [conseil, setConseil] = useState<string | null>(null)
  const armee = useRef<{ action: 'arreter' | 'terminer'; jusqua: number } | null>(null)
  const dernierGeste = useRef(0)
  const courant = useRef({ etat, enCours, secondes, noir, fermerQuestion })
  courant.current = { etat, enCours, secondes, noir, fermerQuestion }

  useEffect(() => {
    const SUIVANT = ['PageDown', 'ArrowRight', 'ArrowDown', ' ', 'Enter']
    const PRECEDENT = ['PageUp', 'ArrowLeft', 'ArrowUp']
    const ECRAN_NOIR = ['b', 'B', '.']
    function demander(action: 'arreter' | 'terminer', message: string): boolean {
      const maintenant = Date.now()
      if (armee.current?.action === action && maintenant < armee.current.jusqua) {
        armee.current = null
        setConseil(null)
        return true // deuxième pression dans le délai : on exécute
      }
      armee.current = { action, jusqua: maintenant + 3000 }
      setConseil(message)
      window.setTimeout(() => {
        if (armee.current && Date.now() >= armee.current.jusqua) {
          armee.current = null
          setConseil(null)
        }
      }, 3050)
      return false
    }
    function touche(e: KeyboardEvent) {
      const suivant = SUIVANT.includes(e.key)
      const precedent = PRECEDENT.includes(e.key)
      const ecranNoir = ECRAN_NOIR.includes(e.key)
      if (!suivant && !precedent && !ecranNoir) return // F5, Échap… : on ne touche à rien
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const cible = e.target instanceof HTMLElement ? e.target : null
      // Champ de saisie, fenêtre de modération : les touches lui appartiennent.
      if (cible?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      // Espace / Entrée sur un bouton qui a le focus : le navigateur clique déjà (pas de double déclenchement).
      if ((e.key === ' ' || e.key === 'Enter') && cible?.closest('button, a') && !courant.current.noir) return
      e.preventDefault()

      const c = courant.current
      if (ecranNoir) {
        setNoir(!c.noir)
        return
      }
      if (c.noir) {
        setNoir(false) // retire le voile, sans action
        dernierGeste.current = Date.now()
        return
      }
      const maintenant = Date.now()
      if (maintenant - dernierGeste.current < 700 || c.enCours) return
      dernierGeste.current = maintenant

      if (precedent) {
        document.querySelector<HTMLButtonElement>('footer [data-commande="precedent"]')?.click()
        return
      }
      if (c.etat?.etat === 'question') {
        if (c.secondes !== null && c.secondes > 0 && !demander('arreter', 'Appuie encore pour arrêter la question')) return
        void c.fermerQuestion()
        return
      }
      const bouton = document.querySelector<HTMLButtonElement>('footer [data-commande]:not([data-commande="precedent"])')
      if (!bouton || bouton.disabled) return
      if (bouton.dataset.commande === 'terminer' && !demander('terminer', 'Appuie encore pour terminer le quiz')) return
      bouton.click()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])

  if (!etat) {
    return (
      <MiseEnPagePresentateur>
        <p>{erreur ?? 'Un instant…'}</p>
        {erreur && (
          <div className="mt-[3vh] max-w-xl text-[0.6em]">
            <Bouton type="button" onClick={() => window.location.assign('/formateur')}>
              Retour à mes quiz
            </Bouton>
          </div>
        )}
      </MiseEnPagePresentateur>
    )
  }

  // Pendant le bilan, la jauge est montrée en grand dans le bilan lui-même : pas de doublon en haut.
  const enBilan = etat.etat === 'bilan' || etat.etat === 'terminee'
  const haut = enBilan ? undefined : <JaugeCollective jauge={etat.jauge} variante="grande" />

  return (
    <ConnexionPerdueContext.Provider value={connexionPerdue}>
    <MiseEnPagePresentateur haut={haut} plein>
      <MenuModeration participants={participants} onExclure={exclure} />
      {etat.etat === 'attente' && (
        <EcranAttente
          etat={etat}
          participants={participants}
          enCours={enCours}
          erreur={erreurAction}
          onPremiereQuestion={() => piloter('ouvrir_question')}
          onExclure={exclure}
        />
      )}
      {etat.etat === 'question' && etat.question && (
        <EcranQuestion etat={etat} secondes={secondes} enCours={enCours} erreur={erreurAction} onArreter={fermerQuestion} />
      )}
      {etat.etat === 'resultats' && etat.question && (
        <EcranResultats
          key={etat.question.id}
          etat={etat}
          enCours={enCours}
          erreur={erreurAction}
          onSuivante={() => piloter('ouvrir_question')}
          onBilan={() => piloter('passer_au_bilan')}
          onAction={actionReponse}
        />
      )}
      {(etat.etat === 'bilan' || etat.etat === 'terminee') && (
        <EcranBilan etat={etat} enCours={enCours} erreur={erreurAction} onTerminer={() => piloter('terminer_session')} />
      )}
    </MiseEnPagePresentateur>
    {conseil && (
      <p role="status" className="fixed left-1/2 top-[1.2vh] z-40 -translate-x-1/2 rounded-pilule bg-blanc px-[2vw] py-[0.8vh] font-semibold text-bleuViolet" style={{ fontSize: 'max(16px, 2.2vh)' }}>
        {conseil}
      </p>
    )}
    {noir && (
      <div aria-label="Écran noir" className="fixed inset-0 z-50 flex items-center justify-center bg-bleuViolet">
        <LogoMarque variante="clair" className="h-[10vh]" />
      </div>
    )}
    </ConnexionPerdueContext.Provider>
  )
}
