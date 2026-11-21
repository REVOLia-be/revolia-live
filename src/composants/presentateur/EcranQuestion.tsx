import Bouton from '../Bouton'
import { lettre, type EtatSession } from '../../lib/session'

interface Props {
  etat: EtatSession
  secondes: number | null
  enCours: boolean
  onArreter: () => void
}

export default function EcranQuestion({ etat, secondes, enCours, onArreter }: Props) {
  const question = etat.question!

  return (
    <div className="flex flex-col gap-[3vh]">
      <div className="flex items-start justify-between gap-[3vw]">
        <h1 className="text-[1.2em] leading-tight">{question.enonce}</h1>
        <p
          aria-label="Secondes restantes"
          className="font-titre text-[2.6em] font-normal leading-none tabular-nums text-vertClair"
        >
          {secondes ?? ''}
        </p>
      </div>

      {question.type === 'qcm' && (
        <ul className="grid grid-cols-2 gap-[2vh]">
          {(question.choix ?? []).map((texte, i) => (
            <li key={i} className="flex items-center gap-[1.5vw] rounded-carte border-2 border-blanc px-[1.5vw] py-[1.5vh]">
              <span className="flex h-[1.6em] w-[1.6em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet">
                {lettre(i)}
              </span>
              <span className="text-[0.85em]">{texte}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-[3vw]">
        <p className="font-semibold">
          {question.nb_reponses} / {etat.nb_participants} réponses
        </p>
        <div className="w-full max-w-sm text-[0.6em]">
          <Bouton type="button" variante="secondaire" onClick={onArreter} disabled={enCours}>
            Arrêter maintenant
          </Bouton>
        </div>
      </div>
    </div>
  )
}
