import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BlocPourquoi from '../composants/BlocPourquoi'
import Bouton from '../composants/Bouton'
import JaugeCollective from '../composants/JaugeCollective'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { Ampoule, Coche, Fleche, Personne } from '../composants/Pictos'
import { appelerRpc } from '../lib/api'
import { assurerConnexionAnonyme } from '../lib/auth'
import EcranPasCommence, { estPasEncoreCommence } from '../composants/EcranPasCommence'
import { codeErreur, estErreurReseau, messageErreur } from '../lib/erreurs'
import { useSecondesRestantes } from '../lib/horloge'
import { lireSalle, oublierSalle } from '../lib/memoire'
import { usePrechargement } from '../lib/photos'
import EncartRapport from '../composants/rapport/EncartRapport'
import EcranAtelierParticipant from '../composants/atelier/EcranAtelierParticipant'
import { GrilleChoixPhotos, PhotoQuestion, TuileResultat } from '../composants/PhotosParticipant'
import { lettre, useEtatSession, type EtatSession, type MonScore, type NomMention } from '../lib/session'

// Étape 1 : s'assurer qu'on est connecté et retrouver la session ACTUELLE du code.
// On interroge toujours le serveur : si la session mémorisée dans le navigateur n'est plus la session actuelle
// (ancienne formation, même code), on l'oublie et on repasse par « Rejoindre » (nouveau pseudo).
export default function Jouer() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [pret, setPret] = useState<{ sessionId: string } | { erreur: string } | { attente: true } | null>(null)
  const [essai, setEssai] = useState(0)
  const reessayer = useCallback(() => setEssai((n) => n + 1), [])

  useEffect(() => {
    let actif = true
    ;(async () => {
      const memorisee = lireSalle(code)
      try {
        await assurerConnexionAnonyme()
        let sessionId: string
        try {
          const infos = await appelerRpc<{ session_id: string }>('infos_session', { p_code: code })
          sessionId = infos.session_id
        } catch (e) {
          // Coupure de réseau pendant un rechargement : on garde la session mémorisée, la reprise se fera toute seule.
          if (memorisee && estErreurReseau(e)) sessionId = memorisee.sessionId
          else throw e
        }
        if (!actif) return
        if (memorisee && memorisee.sessionId !== sessionId) {
          oublierSalle(code)
          navigate(`/rejoindre/${encodeURIComponent(code)}`, { replace: true })
          return
        }
        setPret({ sessionId })
      } catch (e) {
        if (!actif) return
        if (estPasEncoreCommence(codeErreur(e))) setPret({ attente: true })
        else setPret({ erreur: messageErreur(e) })
      }
    })()
    return () => {
      actif = false
    }
  }, [code, essai, navigate])

  if (pret && 'attente' in pret) return <EcranPasCommence onReessayer={reessayer} />
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
  // Les photos de la question sont demandées dès que l'état arrive : elles sont déjà là quand l'écran s'affiche.
  usePrechargement(etat?.question?.image, etat?.question?.images_choix)

  if (!etat) {
    if (erreur) return <EcranProbleme message={erreur} onRetour={() => navigate(`/rejoindre/${code}`)} />
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }

  // Atelier en cours : écran à son rythme, plein écran (barre d'étapes, pied de page fixe), sans jauge ni compte à rebours.
  const estAtelier = etat.question?.type === 'atelier' && (etat.etat === 'question' || etat.etat === 'resultats')
  if (estAtelier && etat.etat === 'question') {
    return <EcranAtelierParticipant key={etat.question!.id} etat={etat} recharger={recharger} connexionPerdue={connexionPerdue} />
  }

  // Bandeau fixe : progression « Question N / total », chronomètre et jauge de la salle (toujours visibles).
  const enBilan = etat.etat === 'bilan' || etat.etat === 'terminee'
  const numero = enBilan ? etat.nb_questions : etat.question?.ordre
  const haut = estAtelier ? undefined : (
    <>
      {numero !== undefined && etat.nb_questions > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-bold">
              Question {numero} <span className="font-normal text-discret">/ {etat.nb_questions}</span>
            </span>
            {enQuestion && secondes !== null && secondes > 0 && (
              <span role="timer" aria-label="Secondes restantes" className="min-w-[3.5ch] shrink-0 rounded-pilule border-2 border-vert px-3 text-center text-lg font-bold tabular-nums">
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
          <span role="timer" aria-label="Secondes restantes" className="min-w-[3.5ch] shrink-0 rounded-pilule border-2 border-vert px-3 text-center text-xl font-bold tabular-nums">
            {secondes}
          </span>
        )}
      </div>
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
    if (etat.question.type === 'atelier') {
      return (
        <>
          <h1 className="text-3xl">L'atelier est terminé</h1>
          <p className="text-lg">Regarde l'écran : on reprend ensemble.</p>
        </>
      )
    }
    if (etat.question.type === 'qcm_multiple') return <EcranResultatsMultiple etat={etat} />
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

  async function repondre(valeur: number | number[] | string): Promise<boolean> {
    if (envoi) return false
    setEnvoi(true)
    setErreur(null)
    try {
      await appelerRpc('repondre', { p_question: question.id, p_valeur: valeur })
      setRappel(libelleReponse(question, valeur))
      setEnvoyee(true)
      return true
    } catch (e) {
      if (codeErreur(e) === '23505') {
        setEnvoyee(true) // déjà répondu (par exemple avant une coupure) : tout va bien
        return true
      } else {
        setErreur(messageErreur(e))
        recharger()
        return false
      }
    } finally {
      setEnvoi(false)
    }
  }

  // Question ouverte à réponses multiples : envoi une par une, la liste « Tes réponses » se remplit.
  const maxReponses = question.type === 'ouverte' ? Math.max(1, question.max_reponses ?? 1) : 1
  if (maxReponses > 1) {
    return (
      <ReponsesMultiples
        question={question}
        max={maxReponses}
        serveur={etat.mes_reponses ?? []}
        termineParServeur={etat.a_repondu === true}
        tempsEcoule={tempsEcoule}
        bloque={bloque}
        envoi={envoi}
        erreur={erreur}
        blocErreur={blocErreur}
        setErreur={setErreur}
        recharger={recharger}
        setEnvoi={setEnvoi}
      />
    )
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
      {question.image && <PhotoQuestion chemin={question.image} />}
      {question.enonce.trim() ? (
        <h1 className="text-2xl leading-snug [overflow-wrap:anywhere]">{question.enonce}</h1>
      ) : (
        <h1 className="sr-only">Question {question.ordre}</h1>
      )}
      {erreur && (
        <p ref={blocErreur} role="alert" className="rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg font-semibold leading-snug text-vertFonce">
          {erreur}
        </p>
      )}
      {question.type === 'qcm' && question.images_choix && (
        <GrilleChoixPhotos choix={question.choix ?? []} images={question.images_choix} bloque={bloque} onChoisir={(i) => repondre(i)} />
      )}
      {question.type === 'qcm' && !question.images_choix && (
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
              <span className="min-w-0 [overflow-wrap:anywhere]">{texte}</span>
            </button>
          ))}
        </div>
      )}
      {question.type === 'qcm_multiple' && (
        <ChoixMultiples question={question} bloque={bloque} onValider={repondre} />
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
function libelleReponse(question: NonNullable<EtatSession['question']>, valeur: number | number[] | string): string {
  // Proposition en photo sans légende : « A » seulement (pas de tiret orphelin).
  const nom = (i: number) => (question.choix?.[i]?.trim() ? `${lettre(i)} — ${question.choix[i]}` : question.images_choix ? `Photo ${lettre(i)}` : lettre(i))
  if (question.type === 'qcm_multiple' && Array.isArray(valeur)) {
    return [...valeur].sort((a, b) => a - b).map(nom).join(' ; ')
  }
  if (typeof valeur === 'number' && question.type === 'qcm') return nom(valeur)
  if (question.type === 'echelle') return `${valeur} sur 5`
  return `« ${valeur} »`
}

// Moment de célébration choisi par le formateur : encart qui entre en douceur, coche qui se trace et une onde légère
// (une seule fois ; en mode « moins d'animations », simple fondu).
function EncartCelebration({ texte }: { texte: string }) {
  return (
    <p role="status" className="celeb-tel flex items-center gap-3 rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg font-bold leading-snug text-vert [overflow-wrap:anywhere]">
      <span aria-hidden className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
        <span className="celeb-onde absolute inset-0 rounded-pilule border-2 border-vert" />
        <Coche taille={22} trace />
      </span>
      <span className="min-w-0">{texte}</span>
    </p>
  )
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
function Statut({ pastille, titre, sous, tracee = false }: { pastille: 'coche' | 'ampoule'; titre: string; sous?: ReactNode; tracee?: boolean }) {
  return (
    <div className="flex items-center gap-3.5">
      <span
        className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-pilule text-blanc ${pastille === 'coche' ? 'bg-vert' : 'bg-vertFonce'}`}
      >
        {pastille === 'coche' ? <Coche taille={30} trace={tracee} /> : <Ampoule taille={28} />}
      </span>
      <div>
        <h1 className="text-[32px] leading-tight">{titre}</h1>
        {sous && <div className="mt-0.5 text-lg font-bold text-vert">{sous}</div>}
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
      {question.images_choix ? (
        <div className="grid grid-cols-2 gap-3">
          {aRepondu && !juste && maReponse !== null && question.images_choix[maReponse] && (
            <TuileResultat i={maReponse} chemin={question.images_choix[maReponse]} legende={question.choix?.[maReponse] ?? ''} bonne={false} mienne />
          )}
          {question.images_choix[idxBonne] && (
            <TuileResultat i={idxBonne} chemin={question.images_choix[idxBonne]} legende={question.choix?.[idxBonne] ?? ''} bonne mienne={juste} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {aRepondu && !juste && maReponse !== null && (
            <LigneChoix lettreChoix={lettre(maReponse)} texte={question.choix?.[maReponse] ?? ''} />
          )}
          <LigneChoix lettreChoix={lettre(idxBonne)} texte={question.choix?.[idxBonne] ?? ''} bonne aussiMienne={juste} />
        </div>
      )}
      {etat.celebration && <EncartCelebration texte={etat.celebration} />}
      <BlocPourquoi texte={resultats.explication} />
      <Attente etat={etat} />
    </>
  )
}

// QCM à plusieurs bonnes réponses : cases à cocher (icône + style, jamais la couleur seule) puis « Valider ».
function ChoixMultiples({
  question,
  bloque,
  onValider,
}: {
  question: NonNullable<EtatSession['question']>
  bloque: boolean
  onValider: (indices: number[]) => void
}) {
  const [choisis, setChoisis] = useState<number[]>([])
  const [envoye, setEnvoye] = useState(false) // pas de double envoi
  const attendu = question.nb_bonnes ?? null
  const bonNombre = choisis.length > 0 && (attendu === null || choisis.length === attendu)

  function basculer(i: number) {
    setChoisis((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!bonNombre || bloque || envoye) return
        setEnvoye(true)
        onValider([...choisis].sort((a, b) => a - b))
      }}
    >
      <p className="text-lg font-bold text-vert">{attendu !== null ? `Choisis ${attendu} réponses` : 'Plusieurs réponses possibles'}</p>
      {question.images_choix && (
        <GrilleChoixPhotos choix={question.choix ?? []} images={question.images_choix} multiple choisis={choisis} bloque={bloque || envoye} onChoisir={basculer} />
      )}
      {!question.images_choix && (
      <div role="group" aria-label="Propositions" className="flex flex-col gap-3">
        {(question.choix ?? []).map((texte, i) => {
          const coche = choisis.includes(i)
          return (
            <button
              key={i}
              type="button"
              role="checkbox"
              aria-checked={coche}
              disabled={bloque || envoye}
              onClick={() => basculer(i)}
              className={`flex min-h-[64px] w-full items-center gap-4 rounded-champ border-2 px-4 py-3 text-left text-lg font-semibold transition-colors disabled:opacity-50 ${
                coche ? 'border-vert bg-vert text-blanc' : 'border-vert bg-blanc text-vertFonce'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-[3px] ${
                  coche ? 'border-blanc bg-blanc text-vert' : 'border-vertFonce bg-blanc text-vert'
                }`}
              >
                {coche && <Coche taille={24} />}
              </span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{texte}</span>
              {coche && <span className="shrink-0 text-sm font-bold">Choisie</span>}
            </button>
          )
        })}
      </div>
      )}
      <p role="status" className="text-base font-semibold text-discret">
        {attendu !== null ? `${choisis.length} / ${attendu} choisie${choisis.length > 1 ? 's' : ''}` : `${choisis.length} choisie${choisis.length > 1 ? 's' : ''}`}
      </p>
      <Bouton type="submit" disabled={!bonNombre || bloque || envoye}>
        Valider
      </Bouton>
    </form>
  )
}

// Ligne d'une proposition dans les résultats d'un QCM à plusieurs bonnes réponses.
function LigneMultiple({ lettreChoix, texte, bonne, mienne }: { lettreChoix: string; texte: string; bonne: boolean; mienne: boolean }) {
  return (
    <div
      className={`flex min-h-[60px] items-center gap-3 rounded-champ px-3 py-2 text-base font-semibold leading-tight ${
        bonne ? 'bg-vert text-blanc' : mienne ? 'border-2 border-vertFonce' : 'border-2 border-dashed border-vertFonce/40 text-vertFonce'
      }`}
    >
      <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pilule ${bonne ? 'bg-blanc text-vert' : 'bg-vertFonce text-blanc'}`}>
        {lettreChoix}
      </span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{texte}</span>
      {(bonne || mienne) && (
        <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
          {bonne && (
            <span className="flex items-center gap-1 whitespace-nowrap rounded-pilule bg-blanc px-2 py-0.5 text-xs font-bold text-vert">
              <Coche taille={14} />
              Bonne réponse
            </span>
          )}
          {mienne && (
            <span
              className={`flex items-center gap-1 whitespace-nowrap rounded-pilule px-2 py-0.5 text-xs font-bold ${
                bonne ? 'bg-blanc text-vertFonce' : 'border-[1.5px] border-vertFonce'
              }`}
            >
              <Personne />
              Ta réponse
            </span>
          )}
        </span>
      )}
    </div>
  )
}

function EcranResultatsMultiple({ etat }: { etat: EtatSession }) {
  const question = etat.question!
  const resultats = etat.resultats
  if (!resultats || !resultats.bonnes_reponses) return <h1 className="text-3xl">Regarde l'écran</h1>

  const bonnes = resultats.bonnes_reponses
  const mes = Array.isArray(resultats.ma_reponse) ? resultats.ma_reponse : []
  const aRepondu = Array.isArray(resultats.ma_reponse)
  const exact = aRepondu && resultats.est_correcte === true
  const presque = aRepondu && !exact && resultats.presque === true
  const contribution = resultats.ma_contribution ?? (exact ? 2 : 1)

  return (
    <>
      {exact ? (
        <Statut pastille="coche" tracee titre="Bien vu !" sous={`+${contribution} pour la salle`} />
      ) : presque ? (
        <Statut
          pastille="ampoule"
          titre="Presque !"
          sous={
            <>
              <p>Tu as trouvé une partie des bonnes réponses</p>
              <p className="mt-0.5">+{contribution} pour la salle</p>
            </>
          }
        />
      ) : aRepondu ? (
        <Statut pastille="ampoule" titre="Pas tout à fait" sous={`+${contribution} pour la salle quand même`} />
      ) : (
        <Statut pastille="ampoule" titre="Pas eu le temps" sous="Pas grave, à la prochaine question !" />
      )}
      {question.images_choix ? (
        <div className="grid grid-cols-2 gap-3">
          {question.images_choix.map((chemin, i) => (
            <TuileResultat key={i} i={i} chemin={chemin} legende={question.choix?.[i] ?? ''} bonne={bonnes.includes(i)} mienne={mes.includes(i)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(question.choix ?? []).map((texte, i) => (
            <LigneMultiple key={i} lettreChoix={lettre(i)} texte={texte} bonne={bonnes.includes(i)} mienne={mes.includes(i)} />
          ))}
        </div>
      )}
      {etat.celebration && <EncartCelebration texte={etat.celebration} />}
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
  vider = false,
  libelleBouton = 'Envoyer',
}: {
  maximum: number
  ligneUnique?: boolean
  indication: string
  envoi: boolean
  onEnvoyer: (texte: string) => void | boolean | Promise<boolean | void>
  /** Vide le champ après un envoi réussi (réponses multiples). */
  vider?: boolean
  libelleBouton?: string
}) {
  const [texte, setTexte] = useState('')
  const vide = texte.trim().length === 0
  const classes =
    'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-xl text-vertFonce placeholder:text-discret'

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (vide) return
        const ok = await onEnvoyer(texte.trim())
        if (vider && ok !== false) setTexte('')
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
        {libelleBouton}
      </Bouton>
    </form>
  )
}

// Question ouverte avec plusieurs réponses possibles : consigne, champ vidé après chaque envoi,
// liste « Tes réponses », compteur « n / N », « J'ai terminé », message final au maximum.
// L'état vient du serveur (`mes_reponses`) : après un rechargement, on reprend là où on s'était arrêté.
function ReponsesMultiples({
  question,
  max,
  serveur,
  termineParServeur,
  tempsEcoule,
  bloque,
  envoi,
  erreur,
  blocErreur,
  setErreur,
  recharger,
  setEnvoi,
}: {
  question: NonNullable<EtatSession['question']>
  max: number
  serveur: string[]
  termineParServeur: boolean
  tempsEcoule: boolean
  bloque: boolean
  envoi: boolean
  erreur: string | null
  blocErreur: React.RefObject<HTMLParagraphElement>
  setErreur: (m: string | null) => void
  recharger: () => void
  setEnvoi: (b: boolean) => void
}) {
  const [locales, setLocales] = useState<string[]>([])
  const [termine, setTermine] = useState(false)
  // Le serveur fait foi ; la liste locale ne sert qu'entre un envoi et le prochain rechargement.
  const liste = locales.length > serveur.length ? locales : serveur
  const n = liste.length
  const auMaximum = n >= max || termineParServeur

  async function envoyer(texte: string): Promise<boolean> {
    if (envoi) return false
    setEnvoi(true)
    setErreur(null)
    try {
      await appelerRpc('repondre', { p_question: question.id, p_valeur: texte })
      setLocales([...liste, texte])
      recharger()
      return true
    } catch (e) {
      if (/d[ée]j[àa] envoy/i.test((e as { message?: string }).message ?? '')) {
        recharger() // « Tu as déjà envoyé tes N réponses » : on se recale sur le serveur
        setTermine(true)
        return false
      }
      setErreur(messageErreur(e))
      recharger()
      return false
    } finally {
      setEnvoi(false)
    }
  }

  const titre = question.enonce.trim() ? (
    <h1 className="text-2xl leading-snug [overflow-wrap:anywhere]">{question.enonce}</h1>
  ) : (
    <h1 className="sr-only">Question {question.ordre}</h1>
  )

  const reponsesEnvoyees = n > 0 && (
    <section aria-labelledby="tes-reponses" className="flex flex-col gap-2">
      <h2 id="tes-reponses" className="flex items-baseline justify-between gap-3 text-lg font-bold">
        <span>Tes réponses</span>
        <span data-testid="compteur-reponses" className="tabular-nums text-vert">
          {n} / {max}
        </span>
      </h2>
      <ol className="flex flex-col gap-2">
        {liste.map((t, i) => (
          <li key={i} className="flex gap-3 rounded-champ border-2 border-vertFonce px-3 py-2 text-base font-semibold leading-snug">
            <span className="shrink-0 tabular-nums text-vert">{i + 1}.</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{t}</span>
          </li>
        ))}
      </ol>
    </section>
  )

  if (auMaximum || termine) {
    return (
      <>
        {auMaximum ? (
          <h1 className="text-3xl">Merci ! Tu as envoyé tes {max} réponses.</h1>
        ) : (
          <h1 className="text-3xl">Réponses envoyées ✓</h1>
        )}
        {reponsesEnvoyees}
        <p className="text-lg">Regarde l'écran pour découvrir les résultats.</p>
      </>
    )
  }

  if (tempsEcoule) {
    return (
      <>
        <h1 className="text-3xl">Le temps est écoulé</h1>
        {reponsesEnvoyees}
        <p className="text-lg">Pas de souci, ça arrive à tout le monde. Regarde l'écran et tu seras prêt pour la prochaine !</p>
      </>
    )
  }

  return (
    <>
      {question.image && <PhotoQuestion chemin={question.image} />}
      {titre}
      <p className="text-lg font-bold text-vert">Tu peux envoyer jusqu'à {max} réponses, une par une.</p>
      {erreur && (
        <p ref={blocErreur} role="alert" className="rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg font-semibold leading-snug text-vertFonce">
          {erreur}
        </p>
      )}
      {reponsesEnvoyees}
      <ChampTexte
        maximum={280}
        indication={n === 0 ? 'Écris ta réponse' : 'Écris une autre réponse'}
        envoi={bloque}
        onEnvoyer={envoyer}
        vider
        libelleBouton={n === 0 ? 'Envoyer' : 'Envoyer cette réponse'}
      />
      {n > 0 && (
        <Bouton type="button" variante="secondaire" onClick={() => setTermine(true)} disabled={bloque}>
          J'ai terminé
        </Bouton>
      )}
    </>
  )
}

// Résultats d'une question sans bonne réponse (nuage, ouverte, échelle) : jamais de juste/faux.
function EcranResultatsLibre({ etat }: { etat: EtatSession }) {
  const question = etat.question!
  const resultats = etat.resultats
  const mes = question.type === 'ouverte' ? resultats?.mes_reponses ?? [] : []
  const plusieurs = mes.length > 1 // une seule réponse : affichage habituel
  const aRepondu = (resultats?.ma_reponse !== null && resultats?.ma_reponse !== undefined) || mes.length > 0
  if (!resultats) return <h1 className="text-3xl">Regarde l'écran</h1>

  return (
    <>
      {aRepondu ? (
        <Statut pastille="coche" titre="Merci !" sous={`+${resultats.ma_contribution ?? 1} pour la salle`} />
      ) : (
        <Statut pastille="ampoule" titre="Pas eu le temps" sous="Pas grave, à la prochaine question !" />
      )}
      {aRepondu &&
        (plusieurs ? mes : [libelleReponse(question, (resultats.ma_reponse ?? mes[0]) as number | string)]).map((texte, i) => (
          <div key={i} className="flex min-h-[60px] items-center gap-3 rounded-champ border-2 border-vertFonce px-3 py-2 text-base font-semibold leading-tight">
            <span className="min-w-0 [overflow-wrap:anywhere]">{plusieurs ? `« ${texte} »` : texte}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pilule border-[1.5px] border-vertFonce px-2 py-0.5 text-xs font-bold">
              <Personne />
              {plusieurs ? `Ta réponse ${i + 1}` : 'Ta réponse'}
            </span>
          </div>
        ))}
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

// Message d'encouragement : toujours positif, quel que soit le score.
function encouragement(m: MonScore): string {
  if (m.qcm_poses > 0) {
    if (m.qcm_justes === m.qcm_poses) return 'Bravo, tu as tout trouvé !'
    if (m.qcm_justes * 2 > m.qcm_poses) return 'Belle réussite : tu as bien avancé.'
  }
  return "Chaque question t'a fait avancer."
}

function Parcours({ score }: { score: MonScore }) {
  return (
    <section aria-labelledby="titre-parcours" className="rounded-carte border-2 border-vert px-[18px] py-4">
      <h2 id="titre-parcours" className="text-xl">Ton parcours</h2>
      <p className="mb-2 text-sm text-discret">Visible seulement par toi</p>
      <ul className="flex flex-col gap-1.5 text-lg">
        <li>
          Tu as répondu à <strong>{score.reponses_donnees}</strong> question{score.reponses_donnees > 1 ? 's' : ''} sur {score.questions_posees}
        </li>
        {score.qcm_poses > 0 && (
          <li>
            Bonnes réponses aux QCM : <strong>{score.qcm_justes}</strong> sur {score.qcm_poses}
            {score.qcm_presque > 0 && ` (et ${score.qcm_presque} presque)`}
          </li>
        )}
        <li>
          Ta contribution à la jauge de la salle : <strong className="text-vert">+{score.contribution}</strong>
        </li>
      </ul>
      <p className="mt-3 flex items-center gap-2 text-lg font-bold text-vert">
        <Coche taille={20} />
        {encouragement(score)}
      </p>
    </section>
  )
}

function EcranBilanParticipant({ etat }: { etat: EtatSession }) {
  const pseudo = (etat.moi?.pseudo ?? '').replace(/-/g, '\u2011')
  const mes = (etat.bilan?.mentions ?? []).filter((m) => m.pseudo === etat.moi?.pseudo)
  const jauge = etat.bilan?.jauge ?? etat.jauge
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
      </section>

      {etat.mon_score && <Parcours score={etat.mon_score} />}

      {etat.rapport?.propose && <EncartRapport sessionId={etat.session_id} rapport={etat.rapport} />}

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
