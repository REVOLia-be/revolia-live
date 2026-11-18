import Carte from '../composants/Carte'

export default function MesQuiz() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-4xl">Mes quiz</h1>
      <Carte>
        <p className="text-lg">Tu n'as pas encore de quiz. Ils apparaîtront ici.</p>
      </Carte>
    </main>
  )
}
