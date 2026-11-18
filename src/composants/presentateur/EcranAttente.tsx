import { QRCodeSVG } from 'qrcode.react'
import Bouton from '../Bouton'
import type { EtatSession, ParticipantListe } from '../../lib/session'

interface Props {
  etat: EtatSession
  participants: ParticipantListe[]
  enCours: boolean
  onPremiereQuestion: () => void
}

export default function EcranAttente({ etat, participants, enCours, onPremiereQuestion }: Props) {
  const lien = `${window.location.origin}/rejoindre/${etat.code}`
  const n = etat.nb_participants

  return (
    <div className="flex flex-col gap-[3vh]">
      <div className="flex items-center justify-center gap-[5vw]">
        <div className="rounded-carte bg-blanc p-[1.5vh]">
          <QRCodeSVG value={lien} size={320} bgColor="var(--couleur-blanc)" fgColor="var(--couleur-bleu-violet)" className="h-[34vh] w-[34vh]" />
        </div>
        <div className="flex flex-col gap-[1vh]">
          <p>Rejoins le quiz sur ton téléphone :</p>
          <p className="text-[1.1em] font-semibold text-vertClair">{window.location.host}</p>
          <p>et entre le code</p>
          <p className="font-titre text-[3.4em] font-bold leading-none tracking-[0.2em] text-vertClair">{etat.code}</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-[2vh]">
        <p className="font-semibold">
          {n === 0 ? 'En attente des premiers participants…' : `${n} participant${n > 1 ? 's' : ''} dans la salle`}
        </p>
        <ul className="flex max-h-[22vh] flex-wrap justify-center gap-[1vh] overflow-hidden text-[0.7em]">
          {participants.map((p) => (
            <li key={p.id} className="rounded-pilule border-2 border-vertClair px-[1.2vw] py-[0.4vh]">
              {p.pseudo}
            </li>
          ))}
        </ul>
        <div className="w-full max-w-xl text-[0.6em]">
          <Bouton type="button" onClick={onPremiereQuestion} disabled={enCours}>
            Première question
          </Bouton>
        </div>
      </div>
    </div>
  )
}
