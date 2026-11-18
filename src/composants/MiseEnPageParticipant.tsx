import type { ReactNode } from 'react'

export default function MiseEnPageParticipant({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-blanc text-vertFonce">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
