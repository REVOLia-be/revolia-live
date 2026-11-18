import type { ReactNode } from 'react'

// Écran projeté : plein écran, fond bleu violet, très grande typographie lisible à 10 m.
// `haut` : bandeau fixe en haut (jauge de la salle).
export default function MiseEnPagePresentateur({ children, haut }: { children: ReactNode; haut?: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-screen flex-col bg-bleuViolet text-blanc">
      {haut && <div className="px-[5vw] pt-[3vh]">{haut}</div>}
      <main className="flex w-full flex-1 flex-col justify-center px-[5vw] py-[3vh] text-[clamp(2rem,3.5vw,4rem)] leading-tight">
        {children}
      </main>
    </div>
  )
}
