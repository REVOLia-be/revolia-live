import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { appelerRpc } from '../lib/api'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { supabase } from '../lib/supabase'

interface LigneQuiz {
  id: string
  titre: string
  description: string | null
  nb_questions: number
}

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
  return <ListeQuiz formateurId={formateur.id} />
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

function ListeQuiz({ formateurId }: { formateurId: string }) {
  const [quiz, setQuiz] = useState<LigneQuiz[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('quiz')
      .select('id, titre, description, questions(count)')
      .order('cree_le', { ascending: false })
    if (error) {
      setErreur(messageErreur(error))
      return
    }
    setErreur(null)
    setQuiz(
      (data ?? []).map((q: { id: string; titre: string; description: string | null; questions: { count: number }[] }) => ({
        id: q.id,
        titre: q.titre,
        description: q.description,
        nb_questions: q.questions?.[0]?.count ?? 0,
      })),
    )
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

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
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="text-4xl">Mes quiz</h1>

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}

      {quiz === null && !erreur && <p className="text-lg">Un instant…</p>}
      {quiz?.length === 0 && (
        <Carte>
          <p className="text-lg">Tu n'as pas encore de quiz. Crée le quiz de démonstration pour essayer.</p>
        </Carte>
      )}
      {quiz?.map((q) => <CarteQuiz key={q.id} quiz={q} />)}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Bouton type="button" variante="secondaire" onClick={creerDemo} disabled={creation}>
          {creation ? 'Création…' : 'Créer un quiz de démonstration'}
        </Bouton>
        <BoutonDeconnexion />
      </div>
    </main>
  )
}

function CarteQuiz({ quiz }: { quiz: LigneQuiz }) {
  const navigate = useNavigate()
  const [parTable, setParTable] = useState(false)
  const [noms, setNoms] = useState('')
  const [lancement, setLancement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function lancer() {
    setLancement(true)
    setErreur(null)
    try {
      const tables = noms
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      const resultat = await appelerRpc<{ session_id: string; code: string }>('lancer_session', {
        p_quiz: quiz.id,
        p_mode_tables: parTable,
        p_noms_tables: parTable ? tables : null,
      })
      navigate(`/presenter/${resultat.session_id}`)
    } catch (e) {
      setErreur(messageErreur(e))
      setLancement(false)
    }
  }

  return (
    <Carte className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl">{quiz.titre}</h2>
        <p className="text-base">
          {quiz.nb_questions} question{quiz.nb_questions > 1 ? 's' : ''}
        </p>
        {quiz.description && <p className="mt-1 text-base">{quiz.description}</p>}
      </div>

      <label className="flex min-h-[44px] items-center gap-3 text-lg">
        <input
          type="checkbox"
          checked={parTable}
          onChange={(e) => setParTable(e.target.checked)}
          className="h-6 w-6 accent-vert"
        />
        Mode par table
      </label>
      {parTable && (
        <input
          value={noms}
          onChange={(e) => setNoms(e.target.value)}
          aria-label="Noms des tables, séparés par des virgules"
          placeholder="Noms des tables, séparés par des virgules (ex. Table 1, Table 2, Table 3)"
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-lg text-vertFonce placeholder:text-vertClair focus:outline-none focus:ring-4 focus:ring-vertClair"
        />
      )}

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
      <Bouton type="button" onClick={lancer} disabled={lancement}>
        {lancement ? 'Lancement…' : 'Lancer'}
      </Bouton>
    </Carte>
  )
}
