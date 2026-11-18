import type { ReactNode } from 'react'

// `haut` : bandeau collé en haut de l'écran (jauge de la salle, indicateur de connexion).
export default function MiseEnPageParticipant({ children, haut }: { children: ReactNode; haut?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-blanc text-vertFonce">
      {haut && <div className="sticky top-0 z-10 bg-blanc px-4 pb-2 pt-3">{haut}</div>}
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
