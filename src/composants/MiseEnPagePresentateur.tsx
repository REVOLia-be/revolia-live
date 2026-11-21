import type { ReactNode } from 'react'
import LogoMarque from './LogoMarque'

// Écran projeté : plein écran, fond bleu violet, très grande typographie lisible à 10 m.
// `haut` : bandeau fixe en haut (jauge de la salle).
// `plein` : écran en zones fixes (la page ne défile jamais, chaque zone se partage la hauteur).
// Utilisé par tous les écrans de la séance : le bouton de pilotage reste dans un pied de page fixe (voir ZonesEcran).
// La taille du texte suit la plus petite des deux dimensions (largeur ou hauteur) pour que tout tienne à 1366×768 comme à 1920×1080.
export default function MiseEnPagePresentateur({
  children,
  haut,
  plein = false,
}: {
  children: ReactNode
  haut?: ReactNode
  plein?: boolean
}) {
  return (
    <div className={`flex w-screen flex-col bg-bleuViolet text-blanc ${plein ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <div className="shrink-0 px-[5vw] pt-[2vh]">
        <LogoMarque variante="clair" className="h-[max(1.25rem,3vh)] opacity-90" />
      </div>
      {haut && <div className="shrink-0 px-[5vw] pt-[1.5vh]">{haut}</div>}
      <main
        className={`flex w-full flex-1 flex-col px-[5vw] py-[2vh] leading-tight ${plein ? 'min-h-0 overflow-hidden text-[clamp(1.75rem,min(3.5vw,5.2vh),4rem)]' : 'justify-center text-[clamp(2rem,3.5vw,4rem)]'}`}
      >
        {children}
      </main>
    </div>
  )
}
