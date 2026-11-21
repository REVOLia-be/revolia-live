import { createContext, useContext, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'

// Écran présentateur en zones fixes : contenu (qui se partage la hauteur) / pied de page fixe.
// Le pied contient toujours le bouton de pilotage, et juste au-dessus : le message d'erreur
// du dernier clic, dans un cadre bien visible. Le bouton ne sort donc jamais de l'écran.
// Fourni par la page présentateur : vrai si le réseau est coupé.
export const ConnexionPerdueContext = createContext(false)

interface Props {
  children: ReactNode
  /** Bouton(s) de pilotage. */
  pied: ReactNode
  /** Message d'erreur d'un clic raté, affiché juste au-dessus du bouton. */
  erreur?: string | null
  /** Rappel permanent « Rejoindre » en coin (absent sur l'écran d'attente, qui a déjà le grand QR code). */
  code?: string
}

export default function ZonesEcran({ children, pied, erreur, code }: Props) {
  const connexionPerdue = useContext(ConnexionPerdueContext)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[2vh]">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-[2vh] overflow-hidden">{children}</div>
      <footer className={`relative z-10 flex shrink-0 items-end gap-[3vw] text-[0.6em] ${code ? 'justify-between' : 'justify-center'}`}>
        {code && <RappelRejoindre code={code} />}
        <div className="flex w-full max-w-xl flex-col gap-[1vh]">
          {connexionPerdue && (
            <p role="status" className="rounded-carte border-4 border-blanc bg-bleuViolet px-[1.2vw] py-[1vh] text-[0.8em] font-semibold leading-snug">
              Connexion perdue : tes participants peuvent ne plus recevoir les questions. On réessaie.
            </p>
          )}
          {erreur && (
            <p role="alert" className="rounded-carte border-4 border-vertClair bg-blanc px-[1.2vw] py-[1vh] text-[0.8em] font-semibold leading-snug text-bleuViolet">
              {erreur} Clique encore une fois.
            </p>
          )}
          {pied}
        </div>
      </footer>
    </div>
  )
}

// Petit rappel permanent pour les retardataires : mini QR code + adresse + code.
function RappelRejoindre({ code }: { code: string }) {
  const lien = `${window.location.origin}/rejoindre/${code}`
  return (
    <div className="flex min-w-0 shrink items-center gap-[1.2vw]" style={{ fontSize: 'max(16px, 2.6vh)' }}>
      <div className="aspect-square h-[9vh] shrink-0 rounded-champ bg-blanc p-[0.6vh]">
        <QRCodeSVG value={lien} size={96} bgColor="var(--couleur-blanc)" fgColor="var(--couleur-bleu-violet)" className="h-full w-full" />
      </div>
      <p className="min-w-0 leading-tight">
        <span className="block">Rejoindre : {window.location.host}</span>
        <span className="block font-bold tracking-[0.15em] text-vertClair">{code}</span>
      </p>
    </div>
  )
}
