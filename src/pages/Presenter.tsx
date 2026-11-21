import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import JaugeCollective from '../composants/JaugeCollective'
import MiseEnPagePresentateur from '../composants/MiseEnPagePresentateur'
import EcranAttente from '../composants/presentateur/EcranAttente'
import EcranBilan from '../composants/presentateur/EcranBilan'
import EcranQuestion from '../composants/presentateur/EcranQuestion'
import EcranResultats from '../composants/presentateur/EcranResultats'
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

  const haut = (
    <>
      <JaugeCollective jauge={etat.jauge} variante="grande" />
      {connexionPerdue && (
        <p role="status" className="mt-1 text-[clamp(0.8rem,1.2vw,1.2rem)] opacity-80">
          Connexion perdue. On réessaie…
        </p>
      )}
    </>
  )

  return (
    <MiseEnPagePresentateur haut={haut} plein={etat.etat === 'attente'}>
      {etat.etat === 'attente' && (
        <EcranAttente
          etat={etat}
          participants={participants}
          enCours={enCours}
          onPremiereQuestion={() => piloter('ouvrir_question')}
          onExclure={exclure}
        />
      )}
      {etat.etat === 'question' && etat.question && (
        <EcranQuestion etat={etat} secondes={secondes} enCours={enCours} onArreter={fermerQuestion} />
      )}
      {etat.etat === 'resultats' && etat.question && (
        <EcranResultats
          key={etat.question.id}
          etat={etat}
          enCours={enCours}
          onSuivante={() => piloter('ouvrir_question')}
          onBilan={() => piloter('passer_au_bilan')}
          onAction={actionReponse}
        />
      )}
      {(etat.etat === 'bilan' || etat.etat === 'terminee') && (
        <EcranBilan etat={etat} enCours={enCours} onTerminer={() => piloter('terminer_session')} />
      )}
      {erreurAction && (
        <p role="alert" className="mt-[2vh] text-[0.6em] font-semibold text-vertClair">
          {erreurAction}
        </p>
      )}
    </MiseEnPagePresentateur>
  )
}
