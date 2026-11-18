import { useParams } from 'react-router-dom'
import Carte from '../composants/Carte'

export default function EditionQuiz() {
  const { id } = useParams()
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-4xl">Modifier le quiz</h1>
      <Carte>
        <p className="text-lg">L'éditeur de questions arrive bientôt.</p>
        <p className="mt-2 text-sm">Quiz n° {id}</p>
      </Carte>
    </main>
  )
}
