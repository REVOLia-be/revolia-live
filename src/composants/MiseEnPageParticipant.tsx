import type { ReactNode } from 'react'
import LogoMarque from './LogoMarque'

// `haut` : bandeau collé en haut de l'écran (jauge de la salle, indicateur de connexion).
export default function MiseEnPageParticipant({ children, haut }: { children: ReactNode; haut?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-blanc text-vertFonce">
      <div className="mx-auto w-full max-w-md px-4 pt-4">
        <LogoMarque variante="vif" className="h-6" />
      </div>
      {haut && <div className="sticky top-0 z-10 bg-blanc px-4 pb-2 pt-3">{haut}</div>}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
