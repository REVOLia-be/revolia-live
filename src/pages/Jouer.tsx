import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BlocPourquoi from '../composants/BlocPourquoi'
import Bouton from '../composants/Bouton'
import JaugeCollective from '../composants/JaugeCollective'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { Ampoule, Coche, Fleche, Personne } from '../composants/Pictos'
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
  const enQuestion = etat?.etat === 'question' && etat.a_repondu !== true
  const secondes = useSecondesRestantes(enQuestion ? etat?.question?.fin_reponses_le : undefined, decalage)

  // Palier franchi : on prévient aussi les téléphones (pas au premier chargement).
  const paliers = etat?.jauge.paliers_atteints
  const precedent = useRef<number | null>(null)
  const [palierCelebre, setPalierCelebre] = useState<number | null>(null)
  useEffect(() => {
    if (paliers === undefined) return
    const avant = precedent.current
    precedent.current = paliers
    if (avant !== null && paliers > avant) {
      setPalierCelebre(paliers)
      const minuteur = window.setTimeout(() => setPalierCelebre(null), 4000)
      return () => window.clearTimeout(minuteur)
    }
  }, [paliers])

  if (!etat) {
    if (erreur) return <EcranProbleme message={erreur} onRetour={() => navigate(`/rejoindre/${code}`)} />
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }

  // Bandeau fixe : progression « Question N / total », chronomètre et jauge de la salle (toujours visibles).
  const enBilan = etat.etat === 'bilan' || etat.etat === 'terminee'
  const numero = enBilan ? etat.nb_questions : etat.question?.ordre
  const haut = (
    <>
      {numero !== undefined && etat.nb_questions > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-bold">
              Question {numero} <span className="font-normal text-discret">/ {etat.nb_questions}</span>
            </span>
            {enQuestion && secondes !== null && secondes > 0 && (
              <span role="timer" aria-label="Secondes restantes" className="rounded-pilule border-2 border-vert px-3 text-lg font-bold tabular-nums">
                {secondes}
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={`Question ${numero} sur ${etat.nb_questions}`}
            aria-valuemin={1}
            aria-valuemax={etat.nb_questions}
            aria-valuenow={numero}
            className="mt-2.5 flex gap-1"
          >
            {Array.from({ length: etat.nb_questions }, (_, i) => (
              <i key={i} className={`h-1.5 flex-1 rounded-pilule border-[1.5px] border-vert ${i < numero ? 'bg-vert' : 'bg-blanc'}`} />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm font-semibold">La salle</span>
        <div className="flex-1">
          <JaugeCollective jauge={etat.jauge} variante="fine" />
        </div>
        {numero === undefined && enQuestion && secondes !== null && secondes > 0 && (
          <span role="timer" aria-label="Secondes restantes" className="rounded-pilule border-2 border-vert px-3 text-xl font-bold tabular-nums">
            {secondes}
          </span>
        )}
      </div>
      {palierCelebre !== null && (
        <p role="status" className="mt-2 rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-center text-xl font-bold text-vert">
          🎉 La salle débloque le palier {palierCelebre} !
        </p>
      )}
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
        <h1 className="text-3xl [overflow-wrap:anywhere]">Tu es dans la salle, {pseudo.replace(/-/g, '\u2011')} !</h1>
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
  const [rappel, setRappel] = useState<string | null>(null) // « Tu as répondu : … »
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
      setRappel(libelleReponse(question, valeur))
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
        {rappel && <p className="text-lg font-semibold">Tu as répondu : {rappel}</p>}
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
      <h1 className="text-2xl leading-snug">{question.enonce}</h1>
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

// Rappel lisible de ce que la personne a envoyé.
function libelleReponse(question: NonNullable<EtatSession['question']>, valeur: number | string): string {
  if (question.type === 'qcm' && typeof valeur === 'number') return `${lettre(valeur)} — ${question.choix?.[valeur] ?? ''}`
  if (question.type === 'echelle') return `${valeur} sur 5`
  return `« ${valeur} »`
}

// Une ligne « choix » : la réponse de la personne ou la bonne réponse (icône + libellé, jamais la couleur seule).
function LigneChoix({ lettreChoix, texte, bonne, aussiMienne = false }: { lettreChoix: string; texte: string; bonne?: boolean; aussiMienne?: boolean }) {
  return (
    <div
      className={`flex min-h-[60px] items-center gap-3 rounded-champ px-3 py-2 text-base font-semibold leading-tight ${
        bonne ? 'bg-vert text-blanc' : 'border-2 border-vertFonce'
      }`}
    >
      <span
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pilule ${bonne ? 'bg-blanc text-vert' : 'bg-vertFonce text-blanc'}`}
      >
        {lettreChoix}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{texte}</span>
      <span
        className={`ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pilule px-2 py-0.5 text-xs font-bold ${
          bonne ? 'bg-blanc text-vert' : 'border-[1.5px] border-vertFonce'
        }`}
      >
        {bonne ? <Coche taille={14} /> : <Personne />}
        {bonne ? (
          aussiMienne ? (
            <span className="text-center leading-tight">Bonne réponse<br />ta réponse</span>
          ) : (
            'Bonne réponse'
          )
        ) : (
          'Ta réponse'
        )}
      </span>
    </div>
  )
}

function Attente({ etat }: { etat: EtatSession }) {
  const dernier = (etat.question?.ordre ?? 0) >= etat.nb_questions
  return (
    <p className="flex items-center gap-2 pt-1.5 text-sm font-semibold text-discret">
      <Fleche />
      {dernier ? "Regarde l'écran : le bilan arrive." : "Regarde l'écran : la question suivante arrive."}
    </p>
  )
}

// Titre du résultat : pictogramme + mot (+ contribution). Jamais de rouge.
function Statut({ pastille, titre, sous, tracee = false }: { pastille: 'coche' | 'ampoule'; titre: string; sous?: string; tracee?: boolean }) {
  return (
    <div className="flex items-center gap-3.5">
      <span
        className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-pilule text-blanc ${pastille === 'coche' ? 'bg-vert' : 'bg-vertFonce'}`}
      >
        {pastille === 'coche' ? <Coche taille={30} trace={tracee} /> : <Ampoule taille={28} />}
      </span>
      <div>
        <h1 className="text-[32px] leading-tight">{titre}</h1>
        {sous && <p className="mt-0.5 text-lg font-bold text-vert">{sous}</p>}
      </div>
    </div>
  )
}

function EcranResultats({ etat }: { etat: EtatSession }) {
  const question = etat.question!
  const resultats = etat.resultats
  if (!resultats || resultats.bonne_reponse === undefined) {
    return <h1 className="text-3xl">Regarde l'écran</h1>
  }

  const idxBonne = resultats.bonne_reponse
  const contribution = resultats.ma_contribution ?? 0
  const aRepondu = resultats.ma_reponse !== null && resultats.ma_reponse !== undefined
  const juste = aRepondu && resultats.est_correcte === true
  const maReponse = typeof resultats.ma_reponse === 'number' ? resultats.ma_reponse : null

  // Jamais de rouge : une mauvaise réponse reste un encouragement.
  return (
    <>
      {juste ? (
        <Statut pastille="coche" tracee titre="Bien vu !" sous={`+${contribution} pour la salle`} />
      ) : aRepondu ? (
        <Statut pastille="ampoule" titre="Pas tout à fait" sous={`+${contribution} pour la salle quand même`} />
      ) : (
        <Statut pastille="ampoule" titre="Pas eu le temps" sous="Pas grave, à la prochaine question !" />
      )}
      <div className="flex flex-col gap-2">
        {aRepondu && !juste && maReponse !== null && (
          <LigneChoix lettreChoix={lettre(maReponse)} texte={question.choix?.[maReponse] ?? ''} />
        )}
        <LigneChoix lettreChoix={lettre(idxBonne)} texte={question.choix?.[idxBonne] ?? ''} bonne aussiMienne={juste} />
      </div>
      <BlocPourquoi texte={resultats.explication} />
      <Attente etat={etat} />
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
    'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-xl text-vertFonce placeholder:text-discret'

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
        {texte.length} / {maximum} caractères
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

  return (
    <>
      {aRepondu ? (
        <Statut pastille="coche" titre="Merci !" sous={`+${resultats.ma_contribution ?? 1} pour la salle`} />
      ) : (
        <Statut pastille="ampoule" titre="Pas eu le temps" sous="Pas grave, à la prochaine question !" />
      )}
      {aRepondu && (
        <div className="flex min-h-[60px] items-center gap-3 rounded-champ border-2 border-vertFonce px-3 py-2 text-base font-semibold leading-tight">
          <span className="min-w-0 [overflow-wrap:anywhere]">{libelleReponse(question, resultats.ma_reponse as number | string)}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pilule border-[1.5px] border-vertFonce px-2 py-0.5 text-xs font-bold">
            <Personne />
            Ta réponse
          </span>
        </div>
      )}
      {aRepondu && question.type === 'echelle' && resultats.moyenne != null && (
        <p className="text-lg">
          Moyenne de la salle : <span className="text-2xl font-bold">{String(resultats.moyenne).replace('.', ',')}</span> / 5
        </p>
      )}
      <BlocPourquoi texte={resultats.explication} />
      <p className="flex items-center gap-2 pt-1.5 text-sm font-semibold text-discret">
        <Fleche />
        {question.type === 'echelle' || !aRepondu ? "Regarde l'écran : la suite arrive." : "Regarde l'écran : les réponses s'affichent ensemble."}
      </p>
    </>
  )
}

// Bilan côté téléphone : la mention du participant s'il en a une, sinon un remerciement.
const LIBELLES_MENTION: Record<NomMention, string> = {
  a_repondu_a_tout: 'A répondu à tout',
  plus_belle_progression: 'Plus belle progression',
  coup_de_coeur: 'Réponse coup de cœur',
}

const ECLATS = Array.from({ length: 14 }, (_, i) => ({
  angle: Math.round((360 / 14) * i),
  distance: 56 + (i % 3) * 14,
}))

function EcranBilanParticipant({ etat }: { etat: EtatSession }) {
  const pseudo = (etat.moi?.pseudo ?? '').replace(/-/g, '\u2011')
  const mes = (etat.bilan?.mentions ?? []).filter((m) => m.pseudo === etat.moi?.pseudo)
  const jauge = etat.bilan?.jauge ?? etat.jauge
  const nbPaliers = jauge.paliers.length
  const part = jauge.maximum > 0 ? Math.min(100, Math.max(0, Math.round((jauge.points / jauge.maximum) * 100))) : 0

  return (
    <>
      <div className="flex flex-col items-start gap-4">
        <span className="relative flex h-[84px] w-[84px] items-center justify-center rounded-pilule bg-vert text-blanc">
          {/* Éclats : une seule fois, en vert et vert foncé (jamais de vert clair sur fond blanc) */}
          <span aria-hidden className="absolute inset-0">
            {ECLATS.map((e, i) => (
              <i
                key={i}
                className={`eclat absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-sm ${i % 2 === 0 ? 'bg-vert' : 'bg-vertFonce'}`}
                style={{ '--angle': `${e.angle}deg`, '--distance': `${e.distance}px` } as CSSProperties}
              />
            ))}
          </span>
          <Coche taille={42} trace />
        </span>
        <h1 className="text-[32px] leading-tight [overflow-wrap:anywhere]">Merci d'avoir joué{pseudo && `, ${pseudo}`} !</h1>
      </div>

      <section className="rounded-carte border-2 border-vert px-[18px] py-4">
        <h2 className="mb-2 text-xl">Ce que la salle a fait ensemble</h2>
        <div
          role="progressbar"
          aria-label="Jauge de la salle"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={part}
          className="h-3 w-full overflow-hidden rounded-pilule border-[1.5px] border-vert bg-blanc"
        >
          <div className="h-full rounded-pilule bg-vert" style={{ width: `${part}%` }} />
        </div>
        {nbPaliers > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
            {Array.from({ length: nbPaliers }, (_, i) => (
              <span
                key={i}
                className={`inline-flex h-5 w-5 items-center justify-center rounded-pilule border-2 border-vert text-[11px] font-bold ${i < jauge.paliers_atteints ? 'bg-vert text-blanc' : ''}`}
              >
                {i + 1}
              </span>
            ))}
            <span className="ml-1">
              {jauge.paliers_atteints} palier{jauge.paliers_atteints > 1 ? 's' : ''} sur {nbPaliers} débloqué{jauge.paliers_atteints > 1 ? 's' : ''}
            </span>
          </p>
        )}
      </section>

      {mes.map((m, i) => (
        <p key={i} className="flex items-center gap-3 text-[17px] font-bold text-vert">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
            <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z" />
          </svg>
          <span>Ta mention : {LIBELLES_MENTION[m.type]}</span>
        </p>
      ))}
      <p className="text-sm text-discret">Le bilan de la salle est à l'écran.</p>
    </>
  )
}
