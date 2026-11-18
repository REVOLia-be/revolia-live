import { QRCodeSVG } from 'qrcode.react'
import MiseEnPagePresentateur from '../composants/MiseEnPagePresentateur'

// Placeholder : le vrai code viendra de la session.
const CODE = 'ABC123'

export default function Presenter() {
  const lien = `${window.location.origin}/rejoindre/${CODE}`

  return (
    <MiseEnPagePresentateur>
      <div className="flex flex-col items-center gap-[4vh] text-center">
        <h1 className="text-[1.4em] text-blanc">Rejoins le quiz sur ton téléphone</h1>
        <div className="rounded-carte bg-blanc p-[2vh]">
          <QRCodeSVG value={lien} size={320} bgColor="var(--couleur-blanc)" fgColor="var(--couleur-bleu-violet)" className="h-[38vh] w-[38vh]" />
        </div>
        <p>ou entre le code :</p>
        <p className="font-titre text-[3.5em] font-bold tracking-[0.2em] text-vertClair">{CODE}</p>
      </div>
    </MiseEnPagePresentateur>
  )
}
