import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import EditeurQuestion from '../composants/edition/EditeurQuestion'
import PanneauCelebrations from '../composants/edition/PanneauCelebrations'
import PanneauLancement from '../composants/edition/PanneauLancement'
import PanneauPropositions from '../composants/edition/PanneauPropositions'
import {
  LIMITES,
  TYPES,
  depuisLigne,
  dupliquerQuestion,
  nouvelleQuestion,
  celebrationsDepuisBase,
  celebrationsVersBase,
  validerQuiz,
  versLigne,
  type LigneQuestion,
  type QuestionEdition,
  type QuizEdition,
  type TypeQuestion,
} from '../composants/edition/modele'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { supabase } from '../lib/supabase'

const CHAMP =
  'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'

export default function EditionQuiz() {
  const formateur = useFormateur()
  const { id } = useParams()

  if (formateur.statut === 'chargement') {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'deconnecte') return <Navigate to="/formateur/connexion" replace />
  if (formateur.statut === 'non_autorise') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Accès refusé</h1>
        <p className="text-lg">Ce compte n'est pas encore autorisé comme formateur.</p>
        <p className="text-lg">Demande à JF de t'ajouter, puis reconnecte-toi.</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'erreur') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Impossible de charger ton espace</h1>
        <p className="text-lg">{messageErreur(formateur.erreur)}</p>
        <Bouton type="button" onClick={() => window.location.reload()}>
          Réessayer
        </Bouton>
      </MiseEnPageParticipant>
    )
  }
  if (!id) return <Navigate to="/formateur" replace />
  return <Editeur quizId={id} />
}

const instantane = (q: QuizEdition) => JSON.stringify(q)

function Editeur({ quizId }: { quizId: string }) {
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<QuizEdition | null>(null)
  const [reference, setReference] = useState('') // état enregistré, pour détecter les modifications
  const idsEnBase = useRef<Set<string>>(new Set())
  const [chargement, setChargement] = useState<'en_cours' | 'ok' | 'absent' | 'erreur'>('en_cours')
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)
  const [afficherErreurs, setAfficherErreurs] = useState(false)
  const [typeAjout, setTypeAjout] = useState<TypeQuestion>('qcm')
  const [confirmationSuppr, setConfirmationSuppr] = useState<string | null>(null)
  const [panneauIA, setPanneauIA] = useState(false) // panneau « Proposer des questions »
  const [ouvertes, setOuvertes] = useState<string[]>([]) // questions dépliées (les autres sont repliées sur leur titre)

  const charger = useCallback(async () => {
    setChargement('en_cours')
    const { data: q, error } = await supabase
      .from('quiz')
      .select('id, titre, description, celebrations')
      .eq('id', quizId)
      .maybeSingle()
    if (error) {
      setErreurChargement(messageErreur(error))
      setChargement('erreur')
      return
    }
    if (!q) {
      setChargement('absent')
      return
    }
    const { data: lignes, error: erreurQ } = await supabase
      .from('questions')
      .select('id, ordre, type, enonce, choix, bonne_reponse, libelle_min, libelle_max, duree_secondes, explication')
      .eq('quiz_id', quizId)
      .order('ordre')
    if (erreurQ) {
      setErreurChargement(messageErreur(erreurQ))
      setChargement('erreur')
      return
    }
    const charge: QuizEdition = {
      titre: q.titre,
      description: q.description ?? '',
      celebrations: celebrationsDepuisBase(q.celebrations),
      questions: ((lignes ?? []) as LigneQuestion[]).map(depuisLigne),
    }
    idsEnBase.current = new Set(charge.questions.map((x) => x.id))
    setQuiz(charge)
    setReference(instantane(charge))
    setChargement('ok')
  }, [quizId])

  useEffect(() => {
    void charger()
  }, [charger])

  const modifie = quiz !== null && instantane(quiz) !== reference
  const validation = useMemo(() => (quiz ? validerQuiz(quiz) : null), [quiz])

  // Avertissement si on ferme l'onglet ou recharge la page avec des modifications en attente.
  useEffect(() => {
    if (!modifie) return
    const garde = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', garde)
    return () => window.removeEventListener('beforeunload', garde)
  }, [modifie])

  if (chargement === 'en_cours') {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }
  if (chargement === 'absent') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Quiz introuvable</h1>
        <p className="text-lg">Ce quiz n'existe plus ou ne t'appartient pas.</p>
        <Bouton type="button" onClick={() => navigate('/formateur')}>
          Retour à mes quiz
        </Bouton>
      </MiseEnPageParticipant>
    )
  }
  if (chargement === 'erreur' || !quiz || !validation) {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Impossible d'ouvrir ce quiz</h1>
        <p className="text-lg">{erreurChargement}</p>
        <Bouton type="button" onClick={() => void charger()}>
          Réessayer
        </Bouton>
      </MiseEnPageParticipant>
    )
  }

  const courant = quiz
  const valid = validation

  function changer(partiel: Partial<QuizEdition>) {
    setQuiz({ ...courant, ...partiel })
  }
  function changerQuestion(i: number, q: QuestionEdition) {
    changer({ questions: courant.questions.map((x, j) => (j === i ? q : x)) })
  }
  function deplacer(i: number, delta: -1 | 1) {
    const j = i + delta
    if (j < 0 || j >= courant.questions.length) return
    const liste = [...courant.questions]
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
    changer({ questions: liste })
  }
  function dupliquer(i: number) {
    const liste = [...courant.questions]
    const copie = dupliquerQuestion(courant.questions[i])
    liste.splice(i + 1, 0, copie)
    changer({ questions: liste })
    setOuvertes((o) => [...o, copie.id])
  }
  function supprimer(i: number) {
    changer({ questions: courant.questions.filter((_, j) => j !== i) })
    setConfirmationSuppr(null)
  }

  async function enregistrer() {
    setAfficherErreurs(true)
    setErreurSauvegarde(null)
    if (!valid.ok) {
      setErreurSauvegarde('Quelques points sont à corriger avant d\'enregistrer. Ils sont signalés en dessous.')
      return
    }
    setEnregistrement(true)
    const aEnregistrer = courant
    try {
      const { error: e1 } = await supabase
        .from('quiz')
        .update({
          titre: aEnregistrer.titre.trim(),
          description: aEnregistrer.description.trim() || null,
          celebrations: celebrationsVersBase(aEnregistrer.celebrations),
          modifie_le: new Date().toISOString(),
        })
        .eq('id', quizId)
      if (e1) throw e1

      // Questions retirées : supprimées d'abord, pour libérer leur numéro d'ordre
      // (la contrainte d'unicité ne vérifie qu'à la fin de chaque requête).
      const gardees = new Set(aEnregistrer.questions.map((q) => q.id))
      const retirees = [...idsEnBase.current].filter((x) => !gardees.has(x))
      if (retirees.length > 0) {
        const { error: e2 } = await supabase.from('questions').delete().in('id', retirees)
        if (e2) throw e2
        retirees.forEach((x) => idsEnBase.current.delete(x))
      }

      // Toutes les questions en une seule requête : les réordonnancements passent.
      if (aEnregistrer.questions.length > 0) {
        const { error: e3 } = await supabase
          .from('questions')
          .upsert(
            aEnregistrer.questions.map((q, i) => versLigne(q, quizId, i + 1)),
            { onConflict: 'id' },
          )
        if (e3) throw e3
        aEnregistrer.questions.forEach((q) => idsEnBase.current.add(q.id))
      }

      setReference(instantane(aEnregistrer))
      setAfficherErreurs(false)
    } catch (e) {
      setErreurSauvegarde(`${messageErreur(e)} Tes modifications sont toujours à l'écran : réessaie d'enregistrer.`)
    } finally {
      setEnregistrement(false)
    }
  }

  function retour(e: React.MouseEvent) {
    if (modifie && !window.confirm('Tu as des modifications non enregistrées. Quitter quand même ?')) {
      e.preventDefault()
    }
  }

  const nb = courant.questions.length
  const peutLancer = !modifie && nb > 0
  let raison: string | undefined
  if (modifie) raison = 'Enregistre tes modifications pour pouvoir lancer le quiz.'
  else if (nb === 0) raison = 'Ajoute au moins une question pour pouvoir lancer le quiz.'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pb-32 pt-10">
      <LogoMarque variante="vif" className="h-6 self-start" />
      <Link to="/formateur" onClick={retour} className="text-lg font-semibold text-vert underline">
        ← Mes quiz
      </Link>
      <h1 className="text-4xl">Modifier le quiz</h1>

      <Carte className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-base font-semibold" htmlFor="titre">
            Titre du quiz
          </label>
          <input
            id="titre"
            value={courant.titre}
            maxLength={LIMITES.titre + 20}
            onChange={(e) => changer({ titre: e.target.value })}
            className={CHAMP}
          />
          {afficherErreurs && valid.titre && (
            <p role="alert" className="mt-1 text-base font-semibold">
              {valid.titre}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-base font-semibold" htmlFor="description">
            Description (facultatif)
          </label>
          <textarea
            id="description"
            rows={2}
            value={courant.description}
            maxLength={LIMITES.description + 50}
            onChange={(e) => changer({ description: e.target.value })}
            className={CHAMP}
          />
          {afficherErreurs && valid.description && (
            <p role="alert" className="mt-1 text-base font-semibold">
              {valid.description}
            </p>
          )}
        </div>
      </Carte>

      <PanneauCelebrations
        celebrations={courant.celebrations}
        questions={courant.questions}
        erreur={afficherErreurs ? valid.celebrations : undefined}
        onChange={(celebrations) => changer({ celebrations })}
      />

      {panneauIA ? (
        <PanneauPropositions
          onAjouter={(qs) => {
            changer({ questions: [...courant.questions, ...qs] })
            setOuvertes((o) => [...o, ...qs.map((x) => x.id)])
          }}
          onFermer={() => setPanneauIA(false)}
        />
      ) : (
        <Carte className="flex flex-col gap-3">
          <p className="text-lg">Tu as un support de formation ? Claude peut te proposer des questions.</p>
          <Bouton type="button" variante="secondaire" onClick={() => setPanneauIA(true)}>
            ✨ Proposer des questions à partir d'un PDF
          </Bouton>
        </Carte>
      )}

      <h2 className="text-2xl">
        Questions ({nb})
      </h2>
      {nb === 0 && (
        <Carte>
          <p className="text-lg">Ce quiz n'a pas encore de question. Ajoutes-en une ci-dessous.</p>
        </Carte>
      )}
      {courant.questions.map((q, i) => {
        const aDesErreurs = afficherErreurs && Object.values(valid.questions[i] ?? {}).some(Boolean)
        const depliee = ouvertes.includes(q.id) || aDesErreurs
        const libelleType = TYPES.find((t) => t.valeur === q.type)?.libelle ?? ''
        return (
          <div key={q.id} className="flex flex-col gap-2">
            {depliee ? (
              <EditeurQuestion
                numero={i + 1}
                total={nb}
                question={q}
                erreurs={valid.questions[i]}
                afficherErreurs={afficherErreurs}
                onChange={(nq) => changerQuestion(i, nq)}
                onMonter={() => deplacer(i, -1)}
                onDescendre={() => deplacer(i, 1)}
                onDupliquer={() => dupliquer(i)}
                onSupprimer={() => setConfirmationSuppr(q.id)}
                onReplier={aDesErreurs ? undefined : () => setOuvertes((o) => o.filter((x) => x !== q.id))}
              />
            ) : (
              <Carte className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base">
                    Question {i + 1} · {libelleType}
                  </p>
                  <p className="truncate text-lg font-semibold">{q.enonce.trim() || 'Question sans texte'}</p>
                </div>
                <button
                  type="button"
                  aria-expanded="false"
                  onClick={() => setOuvertes((o) => [...o, q.id])}
                  className="min-h-[44px] shrink-0 rounded-pilule border-2 border-vert px-4 text-base font-semibold text-vert hover:bg-vert hover:text-blanc"
                >
                  Ouvrir
                </button>
              </Carte>
            )}
            {confirmationSuppr === q.id && (
              <Carte className="flex flex-col gap-3">
                <p className="text-lg font-semibold">Supprimer la question {i + 1} ?</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Bouton type="button" onClick={() => supprimer(i)}>
                    Oui, supprimer
                  </Bouton>
                  <Bouton type="button" variante="secondaire" onClick={() => setConfirmationSuppr(null)}>
                    Non, garder
                  </Bouton>
                </div>
              </Carte>
            )}
          </div>
        )
      })}

      <Carte className="flex flex-col gap-3">
        <label className="text-base font-semibold" htmlFor="type-ajout">
          Ajouter une question
        </label>
        <select
          id="type-ajout"
          value={typeAjout}
          onChange={(e) => setTypeAjout(e.target.value as TypeQuestion)}
          className="min-h-[56px] rounded-champ border-2 border-vert bg-blanc px-4 text-lg text-vertFonce"
        >
          {TYPES.map((t) => (
            <option key={t.valeur} value={t.valeur}>
              {t.libelle}
            </option>
          ))}
        </select>
        <Bouton type="button" variante="secondaire" onClick={() => {
            const nouvelle = nouvelleQuestion(typeAjout)
            changer({ questions: [...courant.questions, nouvelle] })
            setOuvertes((o) => [...o, nouvelle.id])
          }}>
          + Ajouter cette question
        </Bouton>
      </Carte>

      <Carte>
        <h2 className="mb-3 text-2xl">Lancer ce quiz en direct</h2>
        <PanneauLancement quizId={quizId} libelle="Lancer ce quiz" desactive={!peutLancer} raisonDesactive={raison} />
      </Carte>

      {/* Barre d'enregistrement toujours visible */}
      <div className="fixed inset-x-0 bottom-0 border-t border-vertClair/60 bg-blanc px-4 py-3 shadow-lg">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {erreurSauvegarde ? (
              <p role="alert" className="text-base font-semibold">
                {erreurSauvegarde}
              </p>
            ) : modifie ? (
              <p className="text-base font-semibold">Modifications non enregistrées</p>
            ) : (
              <p className="text-base">Tout est enregistré.</p>
            )}
          </div>
          <Bouton type="button" className="sm:w-auto" onClick={() => void enregistrer()} disabled={enregistrement || !modifie}>
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </Bouton>
        </div>
      </div>
    </main>
  )
}
