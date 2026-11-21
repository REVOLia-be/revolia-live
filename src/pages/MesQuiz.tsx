import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import PanneauLancement from '../composants/edition/PanneauLancement'
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
  const navigate = useNavigate()

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
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <LogoMarque variante="vif" className="h-6 self-start" />
      <div className="flex flex-wrap gap-6">
        <Link to="/formateur/sessions" className="self-start text-base text-vert underline">
          Mes sessions passées →
        </Link>
        <Link to="/formateur/utilisation" className="self-start text-base text-vert underline">
          Utilisation →
        </Link>
      </div>
      <h1 className="text-4xl">Mes quiz</h1>

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
      {quiz?.map((q) => <CarteQuiz key={q.id} quiz={q} onChange={charger} onErreur={setErreur} />)}

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

function CarteQuiz({
  quiz,
  onChange,
  onErreur,
}: {
  quiz: LigneQuiz
  onChange: () => Promise<void>
  onErreur: (m: string | null) => void
}) {
  const navigate = useNavigate()
  const [occupe, setOccupe] = useState(false)
  const [confirmer, setConfirmer] = useState(false)

  async function dupliquer() {
    setOccupe(true)
    onErreur(null)
    let nouveauId: string | null = null
    try {
      const { data: original, error } = await supabase
        .from('quiz')
        .select('formateur_id, titre, description')
        .eq('id', quiz.id)
        .single()
      if (error) throw error
      const suffixe = ' (copie)'
      const titre = original.titre.slice(0, 120 - suffixe.length) + suffixe
      const { data: copie, error: e2 } = await supabase
        .from('quiz')
        .insert({ formateur_id: original.formateur_id, titre, description: original.description })
        .select('id')
        .single()
      if (e2) throw e2
      nouveauId = copie.id
      const { data: lignes, error: e3 } = await supabase
        .from('questions')
        .select('ordre, type, enonce, choix, bonne_reponse, libelle_min, libelle_max, duree_secondes')
        .eq('quiz_id', quiz.id)
        .order('ordre')
      if (e3) throw e3
      if (lignes && lignes.length > 0) {
        const { error: e4 } = await supabase
          .from('questions')
          .insert(lignes.map((l: Record<string, unknown>) => ({ ...l, quiz_id: copie.id })))
        if (e4) throw e4
      }
      await onChange()
    } catch (e) {
      if (nouveauId) await supabase.from('quiz').delete().eq('id', nouveauId) // pas de copie à moitié faite
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
        <Bouton type="button" variante="secondaire" onClick={() => setConfirmer(true)} disabled={occupe}>
          Supprimer
        </Bouton>
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
