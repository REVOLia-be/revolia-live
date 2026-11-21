import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import JaugeCollective from '../composants/JaugeCollective'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { appelerRpc } from '../lib/api'
import { assurerConnexionAnonyme } from '../lib/auth'
import { codeErreur, messageErreur } from '../lib/erreurs'
import { useSecondesRestantes } from '../lib/horloge'
import { lireSalle } from '../lib/memoire'
import { lettre, useEtatSession, type EtatSession, type NomMention } from '../lib/session'

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
        <p role="status" className="mt-2 rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg font-semibold leading-snug text-vertFonce">
          Connexion perdue. Attends quelques secondes avant de répondre : on réessaie tout seul.
        </p>
      )}
    </>
  )

  return (
    <MiseEnPageParticipant haut={haut}>
      <Ecran etat={etat} decalage={decalage} recharger={recharger} connexionPerdue={connexionPerdue} />
    </MiseEnPageParticipant>
  )
}

function Ecran({
  etat,
  decalage,
  recharger,
  connexionPerdue,
}: {
  etat: EtatSession
  decalage: number
  recharger: () => void
  connexionPerdue: boolean
}) {
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
    // key : un nouvel écran (et un nouvel état local) à chaque nouvelle question
    return <EcranQuestion key={etat.question.id} etat={etat} decalage={decalage} recharger={recharger} connexionPerdue={connexionPerdue} />
  }

  if (etat.etat === 'resultats' && etat.question) {
    return etat.question.type === 'qcm' ? <EcranResultats etat={etat} /> : <EcranResultatsLibre etat={etat} />
  }

  if (etat.etat === 'bilan' || etat.etat === 'terminee') {
    return <EcranBilanParticipant etat={etat} />
  }

  // Résultats sans question (ne devrait pas arriver) : on attend gentiment.
  return (
    <>
      <h1 className="text-3xl">Un instant…</h1>
      <p className="text-lg">Regarde l'écran.</p>
    </>
  )
}

function EcranQuestion({
  etat,
  decalage,
  recharger,
  connexionPerdue,
}: {
  etat: EtatSession
  decalage: number
  recharger: () => void
  connexionPerdue: boolean
}) {
  const question = etat.question!
  const secondes = useSecondesRestantes(question.fin_reponses_le, decalage)
  const [envoyee, setEnvoyee] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const blocErreur = useRef<HTMLParagraphElement>(null)
  // Pas de réseau : les boutons sont grisés (la réponse ne partirait pas).
  const bloque = envoi || connexionPerdue

  // Quand un envoi échoue, on amène le message à l'écran (il est affiché juste sous la question).
  useEffect(() => {
    if (erreur) blocErreur.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [erreur])

  const aRepondu = envoyee || etat.a_repondu === true
  const tempsEcoule = secondes === 0

  async function repondre(valeur: number | string) {
    if (envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      await appelerRpc('repondre', { p_question: question.id, p_valeur: valeur })
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
      {erreur && (
        <p ref={blocErreur} role="alert" className="rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg font-semibold leading-snug text-vertFonce">
          {erreur}
        </p>
      )}
      {question.type === 'qcm' && (
        <div className="flex flex-col gap-3">
          {(question.choix ?? []).map((texte, i) => (
            <button
              key={i}
              type="button"
              disabled={bloque}
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
      )}
      {question.type === 'echelle' && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={bloque}
                onClick={() => repondre(n)}
                className="flex min-h-[72px] items-center justify-center rounded-champ border-2 border-vert bg-blanc text-3xl font-bold text-vertFonce transition-colors active:bg-vert active:text-blanc disabled:opacity-50"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between gap-4 text-sm font-semibold">
            <span className="max-w-[45%]">{question.libelle_min}</span>
            <span className="max-w-[45%] text-right">{question.libelle_max}</span>
          </div>
        </div>
      )}
      {question.type === 'nuage' && (
        <ChampTexte
          maximum={30}
          ligneUnique
          indication="Un mot ou une courte expression"
          envoi={bloque}
          onEnvoyer={repondre}
        />
      )}
      {question.type === 'ouverte' && (
        <ChampTexte maximum={280} indication="Écris ta réponse" envoi={bloque} onEnvoyer={repondre} />
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

// Champ de saisie avec compteur de caractères et bouton Envoyer (nuage et question ouverte).
function ChampTexte({
  maximum,
  ligneUnique = false,
  indication,
  envoi,
  onEnvoyer,
}: {
  maximum: number
  ligneUnique?: boolean
  indication: string
  envoi: boolean
  onEnvoyer: (texte: string) => void
}) {
  const [texte, setTexte] = useState('')
  const vide = texte.trim().length === 0
  const classes =
    'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-xl text-vertFonce placeholder:text-vertFonce/60'

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!vide) onEnvoyer(texte.trim())
      }}
    >
      <label className="text-lg" htmlFor="saisie">
        {indication}
      </label>
      {ligneUnique ? (
        <input
          id="saisie"
          type="text"
          autoComplete="off"
          maxLength={maximum}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          className={`${classes} min-h-[64px]`}
        />
      ) : (
        <textarea
          id="saisie"
          rows={5}
          maxLength={maximum}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          className={classes}
        />
      )}
      <p className="text-right text-sm font-semibold tabular-nums">
        {texte.length} / {maximum}
      </p>
      <Bouton type="submit" disabled={envoi || vide}>
        Envoyer
      </Bouton>
    </form>
  )
}

// Résultats d'une question sans bonne réponse (nuage, ouverte, échelle) : jamais de juste/faux.
function EcranResultatsLibre({ etat }: { etat: EtatSession }) {
  const question = etat.question!
  const resultats = etat.resultats
  const aRepondu = resultats?.ma_reponse !== null && resultats?.ma_reponse !== undefined
  if (!resultats) return <h1 className="text-3xl">Regarde l'écran</h1>

  if (!aRepondu) {
    return (
      <>
        <h1 className="text-3xl">Tu n'as pas eu le temps de répondre.</h1>
        <p className="text-lg">Pas grave, regarde l'écran et à la prochaine question !</p>
      </>
    )
  }
  return (
    <>
      <h1 className="text-4xl text-vert">Merci !</h1>
      <p className="text-xl font-semibold text-vert">+{resultats.ma_contribution ?? 1} pour la salle</p>
      {question.type === 'echelle' && resultats.moyenne != null && (
        <p className="text-lg">
          Moyenne de la salle : <span className="text-2xl font-bold">{String(resultats.moyenne).replace('.', ',')}</span> / 5
        </p>
      )}
      {question.type !== 'echelle' && <p className="text-lg">Regarde l'écran : les réponses s'affichent ensemble.</p>}
    </>
  )
}

// Bilan côté téléphone : la mention du participant s'il en a une, sinon un remerciement.
const LIBELLES_MENTION: Record<NomMention, string> = {
  a_repondu_a_tout: 'A répondu à tout',
  plus_belle_progression: 'Plus belle progression',
  coup_de_coeur: 'Réponse coup de cœur',
}

function EcranBilanParticipant({ etat }: { etat: EtatSession }) {
  const pseudo = etat.moi?.pseudo
  const mes = (etat.bilan?.mentions ?? []).filter((m) => m.pseudo === pseudo)

  if (mes.length === 0) {
    return (
      <>
        <h1 className="text-3xl">Merci d'avoir joué avec nous !</h1>
        <p className="text-lg">Chaque réponse a fait grandir la jauge de la salle. Le bilan est à l'écran.</p>
      </>
    )
  }
  return (
    <>
      <h1 className="text-3xl">Bravo {pseudo} !</h1>
      {mes.map((m, i) => (
        <div key={i} className="rounded-carte border-2 border-vert p-5">
          <p className="text-lg">Tu as reçu la mention :</p>
          <p className="text-2xl font-bold text-vert">{LIBELLES_MENTION[m.type]} 🎉</p>
        </div>
      ))}
      <p className="text-lg">Merci d'avoir fait grandir la jauge de la salle. Le bilan est à l'écran.</p>
    </>
  )
}
