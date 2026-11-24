import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import CarteQuiz, { GrilleQuiz, resumerQuestions, type DonneesCarteQuiz } from '../composants/CarteQuiz'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import SelecteurVue, { usePreferenceVue } from '../composants/SelecteurVue'
import PanneauLancement from '../composants/edition/PanneauLancement'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { dupliquerQuiz } from '../lib/quiz'
import { supabase } from '../lib/supabase'

type LigneQuiz = DonneesCarteQuiz

// Quiz de démonstration : trois QCM simples sur l'IA, pour tester sans rien préparer.
const QUIZ_DEMO = {
  titre: "Quiz de démonstration : l'IA pour débuter",
  description: 'Trois questions simples pour tester REVOLia Live avec ta salle.',
  questions: [
    {
      enonce: 'Que veut dire « IA » ?',
      choix: ['Intelligence Artificielle', 'Internet Avancé', 'Information Automatique', 'Interface Analogique'],
      bonne_reponse: 0,
    },
    {
      enonce: "Qu'est-ce qu'un « prompt » ?",
      choix: ['Un virus informatique', "La consigne que tu donnes à l'IA", "Le mot de passe d'un compte", "Une marque d'ordinateur"],
      bonne_reponse: 1,
    },
    {
      enonce: "Quelle bonne habitude avoir avec une réponse de l'IA ?",
      choix: [
        'La copier telle quelle, sans la lire',
        "L'envoyer directement au client",
        "La relire et la vérifier avant de l'utiliser",
        'Lui faire confiance les yeux fermés',
      ],
      bonne_reponse: 2,
    },
  ],
}

export default function MesQuiz() {
  const formateur = useFormateur()

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
        <BoutonDeconnexion />
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
  return <ListeQuiz formateurId={formateur.id} estAdmin={formateur.est_admin} />
}

function BoutonDeconnexion() {
  const navigate = useNavigate()
  async function sortir() {
    await supabase.auth.signOut()
    navigate('/formateur/connexion')
  }
  return (
    <Bouton type="button" variante="secondaire" onClick={sortir}>
      Me déconnecter
    </Bouton>
  )
}

function ListeQuiz({ formateurId, estAdmin }: { formateurId: string; estAdmin: boolean }) {
  const [quiz, setQuiz] = useState<LigneQuiz[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)
  const [vue, setVue] = usePreferenceVue('revolia-live:vue-quiz:mes-quiz', 'cartes')
  const [occupe, setOccupe] = useState<string | null>(null)
  const navigate = useNavigate()

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('quiz')
      .select('id, titre, description, code, modifie_le, cree_le, questions(type, image_question, ordre)')
      .eq('formateur_id', formateurId) // un admin voit tous les quiz : ici, seulement les siens
      .order('cree_le', { ascending: false })
    if (error) {
      setErreur(messageErreur(error))
      return
    }
    setErreur(null)
    setQuiz(
      (data ?? []).map(
        (q: {
          id: string
          titre: string
          description: string | null
          code?: string | null
          modifie_le: string | null
          cree_le: string
          questions: { type: string; image_question: string | null; ordre: number }[]
        }) => ({
          id: q.id,
          titre: q.titre,
          description: q.description,
          code: q.code ?? null,
          modifie_le: q.modifie_le ?? q.cree_le,
          ...resumerQuestions(q.questions),
        }),
      ),
    )
  }, [formateurId])

  useEffect(() => {
    void charger()
  }, [charger])

  async function dupliquerCarte(q: LigneQuiz) {
    setOccupe(q.id)
    setErreur(null)
    try {
      await dupliquerQuiz(q.id, formateurId)
      await charger()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(null)
    }
  }

  async function supprimerCarte(q: LigneQuiz) {
    setOccupe(q.id)
    setErreur(null)
    const { error } = await supabase.from('quiz').delete().eq('id', q.id)
    if (error) setErreur(messageErreur(error))
    else await charger()
    setOccupe(null)
  }

  async function creerNouveau() {
    setCreation(true)
    setErreur(null)
    const { data, error } = await supabase
      .from('quiz')
      .insert({ formateur_id: formateurId, titre: 'Sans titre' })
      .select('id')
      .single()
    if (error) {
      setErreur(messageErreur(error))
      setCreation(false)
      return
    }
    navigate(`/formateur/quiz/${data.id}`)
  }

  async function creerDemo() {
    setCreation(true)
    setErreur(null)
    try {
      const { data: nouveau, error } = await supabase
        .from('quiz')
        .insert({ formateur_id: formateurId, titre: QUIZ_DEMO.titre, description: QUIZ_DEMO.description })
        .select('id')
        .single()
      if (error) throw error

      const { error: erreurQuestions } = await supabase.from('questions').insert(
        QUIZ_DEMO.questions.map((q, i) => ({
          quiz_id: nouveau.id,
          ordre: i + 1,
          type: 'qcm',
          enonce: q.enonce,
          choix: q.choix,
          bonne_reponse: q.bonne_reponse,
          duree_secondes: 30,
        })),
      )
      if (erreurQuestions) {
        await supabase.from('quiz').delete().eq('id', nouveau.id) // on ne laisse pas un quiz vide
        throw erreurQuestions
      }
      await charger()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setCreation(false)
    }
  }

  return (
    <main className={`mx-auto flex min-h-dvh w-full flex-col gap-6 px-4 py-10 ${vue === 'cartes' ? 'max-w-7xl' : 'max-w-3xl'}`}>
      <LogoMarque variante="vif" className="h-6 self-start" />
      <div className="flex flex-wrap gap-6">
        <Link to="/formateur/sessions" className="self-start text-base text-vert underline">
          Mes sessions passées →
        </Link>
        <Link to="/formateur/utilisation" className="self-start text-base text-vert underline">
          Utilisation →
        </Link>
        <Link to="/formateur/connexions" className="self-start text-sm text-vertFonce underline">
          Applications connectées
        </Link>
        {estAdmin && (
          <Link to="/admin" className="self-start text-sm text-vertFonce underline sm:ml-auto">
            Administration
          </Link>
        )}
      </div>
      <h1 className="text-4xl">Mes quiz</h1>
      <SelecteurVue vue={vue} onChange={setVue} />

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}

      {quiz === null && !erreur && <p className="text-lg">Un instant…</p>}
      {quiz?.length === 0 && (
        <Carte>
          <p className="text-lg">Tu n'as pas encore de quiz. Crée un nouveau quiz, ou le quiz de démonstration pour essayer.</p>
        </Carte>
      )}
      {quiz && quiz.length > 0 && vue === 'liste' && quiz.map((q) => <LigneListeQuiz key={q.id} quiz={q} formateurId={formateurId} onChange={charger} onErreur={setErreur} />)}
      {quiz && quiz.length > 0 && vue === 'cartes' && (
        <GrilleQuiz>
          {quiz.map((q) => (
            <CarteQuiz
              key={q.id}
              quiz={q}
              lancement
              occupe={occupe === q.id}
              menu={[
                { libelle: 'Modifier', onChoisir: () => navigate(`/formateur/quiz/${q.id}`) },
                { libelle: 'Dupliquer', onChoisir: () => void dupliquerCarte(q) },
              ]}
              onSupprimer={() => supprimerCarte(q)}
            />
          ))}
        </GrilleQuiz>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Bouton type="button" onClick={creerNouveau} disabled={creation}>
          Nouveau quiz
        </Bouton>
        <Bouton type="button" variante="secondaire" onClick={creerDemo} disabled={creation}>
          {creation ? 'Création…' : 'Créer un quiz de démonstration'}
        </Bouton>
        <BoutonDeconnexion />
      </div>
    </main>
  )
}

function LigneListeQuiz({
  quiz,
  formateurId,
  onChange,
  onErreur,
}: {
  quiz: LigneQuiz
  formateurId: string
  onChange: () => Promise<void>
  onErreur: (m: string | null) => void
}) {
  const navigate = useNavigate()
  const [occupe, setOccupe] = useState(false)
  const [confirmer, setConfirmer] = useState(false)

  async function dupliquer() {
    setOccupe(true)
    onErreur(null)
    try {
      await dupliquerQuiz(quiz.id, formateurId)
      await onChange()
    } catch (e) {
      onErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  async function supprimer() {
    setOccupe(true)
    onErreur(null)
    const { error } = await supabase.from('quiz').delete().eq('id', quiz.id)
    if (error) onErreur(messageErreur(error))
    else await onChange()
    setOccupe(false)
    setConfirmer(false)
  }

  return (
    <Carte className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl">{quiz.titre}</h2>
        <p className="text-base">
          {quiz.nb_questions} question{quiz.nb_questions > 1 ? 's' : ''}
          {quiz.code && (
            <>
              {' · '}Code <span data-testid="code-liste" className="font-bold tracking-widest">{quiz.code}</span>
            </>
          )}
        </p>
        {quiz.description && <p className="mt-1 text-base">{quiz.description}</p>}
      </div>

      <PanneauLancement quizId={quiz.id} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Bouton type="button" variante="secondaire" onClick={() => navigate(`/formateur/quiz/${quiz.id}`)} disabled={occupe}>
          Modifier
        </Bouton>
        <Bouton type="button" variante="secondaire" onClick={dupliquer} disabled={occupe}>
          Dupliquer
        </Bouton>
        <button
          type="button"
          onClick={() => setConfirmer(true)}
          disabled={occupe}
          className="min-h-[56px] px-4 text-base font-semibold text-vertFonce underline disabled:opacity-60 sm:ml-auto"
        >
          Supprimer
        </button>
      </div>
      {confirmer && (
        <div className="flex flex-col gap-3 rounded-champ border-2 border-vert p-4">
          <p className="text-lg font-semibold">
            Supprimer « {quiz.titre} » et ses questions ? Cette action est définitive.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Bouton type="button" onClick={supprimer} disabled={occupe}>
              Oui, supprimer
            </Bouton>
            <Bouton type="button" variante="secondaire" onClick={() => setConfirmer(false)} disabled={occupe}>
              Non, garder
            </Bouton>
          </div>
        </div>
      )}
    </Carte>
  )
}
