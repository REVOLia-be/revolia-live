import type { ReactNode } from 'react'

// Écran projeté : plein écran, fond bleu violet, très grande typographie lisible à 10 m.
export default function MiseEnPagePresentateur({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-screen bg-bleuViolet text-blanc">
      <main className="flex min-h-dvh w-full flex-col justify-center px-[5vw] py-[4vh] text-[clamp(2rem,3.5vw,4rem)] leading-tight">
        {children}
      </main>
    </div>
  )
}
