import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import JaugeCollective from '../composants/JaugeCollective'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { appelerRpc } from '../lib/api'
import { assurerConnexionAnonyme } from '../lib/auth'
import { codeErreur, messageErreur } from '../lib/erreurs'
import { useSecondesRestantes } from '../lib/horloge'
import { lireSalle } from '../lib/memoire'
import { lettre, useEtatSession, type EtatSession } from '../lib/session'

// Étape 1 : s'assurer qu'on est connecté et retrouver l'identifiant de la session.
export default function Jouer() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [pret, setPret] = useState<{ sessionId: string } | { erreur: string } | null>(null)

  useEffect(() => {
    let actif = true
    ;(async () => {
      try {
        await assurerConnexionAnonyme()
        let sessionId = lireSalle(code)?.sessionId
        if (!sessionId) {
          const infos = await appelerRpc<{ session_id: string }>('infos_session', { p_code: code })
          sessionId = infos.session_id
        }
        if (actif) setPret({ sessionId })
      } catch (e) {
        if (actif) setPret({ erreur: messageErreur(e) })
      }
    })()
    return () => {
      actif = false
    }
  }, [code])

  if (pret && 'erreur' in pret) {
    return <EcranProbleme message={pret.erreur} onRetour={() => navigate('/')} />
  }
  if (!pret) {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }
  return <Partie sessionId={pret.sessionId} code={code} />
}

function EcranProbleme({ message, onRetour }: { message: string; onRetour: () => void }) {
  return (
    <MiseEnPageParticipant>
      <h1 className="text-3xl">On n'arrive pas à t'afficher le quiz</h1>
      <p className="text-lg">{message}</p>
      <Bouton type="button" onClick={onRetour}>
        Rejoindre avec le code
      </Bouton>
    </MiseEnPageParticipant>
  )
}

// Étape 2 : suivre l'état de la session et afficher l'écran qui correspond.
function Partie({ sessionId, code }: { sessionId: string; code: string }) {
  const navigate = useNavigate()
  const { etat, decalage, erreur, connexionPerdue, recharger } = useEtatSession(sessionId)

  if (!etat) {
    if (erreur) return <EcranProbleme message={erreur} onRetour={() => navigate(`/rejoindre/${code}`)} />
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }

  const haut = (
    <>
      <JaugeCollective jauge={etat.jauge} variante="fine" />
      {connexionPerdue && (
        <p role="status" className="mt-1 text-sm">
          Connexion perdue. On réessaie…
        </p>
      )}
    </>
  )

  return (
    <MiseEnPageParticipant haut={haut}>
      <Ecran etat={etat} decalage={decalage} recharger={recharger} />
    </MiseEnPageParticipant>
  )
}

function Ecran({ etat, decalage, recharger }: { etat: EtatSession; decalage: number; recharger: () => void }) {
  const pseudo = etat.moi?.pseudo ?? ''

  if (etat.etat === 'attente') {
    return (
      <>
        <h1 className="text-3xl">Tu es dans la salle, {pseudo} !</h1>
        <p className="text-lg">Regarde l'écran.</p>
      </>
    )
  }

  if (etat.etat === 'question' && etat.question) {
    if (etat.question.type !== 'qcm') return <Bientot />
    // key : un nouvel écran (et un nouvel état local) à chaque nouvelle question
    return <EcranQuestion key={etat.question.id} etat={etat} decalage={decalage} recharger={recharger} />
  }

  if (etat.etat === 'resultats' && etat.question) {
    if (etat.question.type !== 'qcm') return <Bientot />
    return <EcranResultats etat={etat} />
  }

  if (etat.etat === 'bilan' || etat.etat === 'terminee') {
    return (
      <>
        <h1 className="text-3xl">Merci !</h1>
        <p className="text-lg">Le bilan est à l'écran.</p>
      </>
    )
  }

  // Résultats sans question (ne devrait pas arriver) : on attend gentiment.
  return (
    <>
      <h1 className="text-3xl">Un instant…</h1>
      <p className="text-lg">Regarde l'écran.</p>
    </>
  )
}

function Bientot() {
  return (
    <>
      <h1 className="text-3xl">Ce type de question arrive bientôt</h1>
      <p className="text-lg">Regarde l'écran, on continue ensemble.</p>
    </>
  )
}

function EcranQuestion({ etat, decalage, recharger }: { etat: EtatSession; decalage: number; recharger: () => void }) {
  const question = etat.question!
  const secondes = useSecondesRestantes(question.fin_reponses_le, decalage)
  const [envoyee, setEnvoyee] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const aRepondu = envoyee || etat.a_repondu === true
  const tempsEcoule = secondes === 0

  async function repondre(indice: number) {
    if (envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      await appelerRpc('repondre', { p_question: question.id, p_valeur: indice })
      setEnvoyee(true)
    } catch (e) {
      if (codeErreur(e) === '23505') {
        setEnvoyee(true) // déjà répondu (par exemple avant une coupure) : tout va bien
      } else {
        setErreur(messageErreur(e))
        recharger()
      }
    } finally {
      setEnvoi(false)
    }
  }

  if (aRepondu) {
    return (
      <>
        <h1 className="text-3xl">Réponse envoyée ✓</h1>
        <p className="text-lg">Regarde l'écran pour découvrir les résultats.</p>
      </>
    )
  }

  if (tempsEcoule) {
    return (
      <>
        <h1 className="text-3xl">Le temps est écoulé</h1>
        <p className="text-lg">Pas de souci, ça arrive à tout le monde. Regarde l'écran et tu seras prêt pour la prochaine !</p>
      </>
    )
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl leading-snug">{question.enonce}</h1>
        {secondes !== null && (
          <span className="rounded-pilule border-2 border-vert px-4 py-1 text-2xl font-bold tabular-nums" aria-label="Secondes restantes">
            {secondes}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {(question.choix ?? []).map((texte, i) => (
          <button
            key={i}
            type="button"
            disabled={envoi}
            onClick={() => repondre(i)}
            className="flex min-h-[64px] w-full items-center gap-4 rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-left text-lg font-semibold text-vertFonce transition-colors active:bg-vert active:text-blanc disabled:opacity-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
              {lettre(i)}
            </span>
            <span>{texte}</span>
          </button>
        ))}
      </div>
      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
    </>
  )
}

function EcranResultats({ etat }: { etat: EtatSession }) {
  const question = etat.question!
  const resultats = etat.resultats
  if (!resultats || resultats.bonne_reponse === undefined) {
    return <h1 className="text-3xl">Regarde l'écran</h1>
  }

  const bonne = `${lettre(resultats.bonne_reponse)} — ${question.choix?.[resultats.bonne_reponse] ?? ''}`
  const contribution = resultats.ma_contribution ?? 0
  const aRepondu = resultats.ma_reponse !== null && resultats.ma_reponse !== undefined

  // Jamais de rouge : une mauvaise réponse reste un encouragement.
  if (aRepondu && resultats.est_correcte) {
    return (
      <>
        <h1 className="text-4xl text-vert">Bravo !</h1>
        <p className="text-xl font-semibold text-vert">+{contribution} pour la salle</p>
      </>
    )
  }
  if (aRepondu) {
    return (
      <>
        <h1 className="text-3xl">Pas tout à fait.</h1>
        <p className="text-lg">La bonne réponse était : {bonne}</p>
        <p className="text-lg">+{contribution} pour la salle quand même, merci d'avoir participé !</p>
      </>
    )
  }
  return (
    <>
      <h1 className="text-3xl">Tu n'as pas eu le temps de répondre.</h1>
      <p className="text-lg">La bonne réponse était : {bonne}</p>
      <p className="text-lg">Pas grave, à la prochaine question !</p>
    </>
  )
}
