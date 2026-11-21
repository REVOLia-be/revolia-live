import Bouton from '../Bouton'
import ZonesEcran from './ZonesEcran'
import { lettre, type EtatSession } from '../../lib/session'

interface Props {
  etat: EtatSession
  secondes: number | null
  enCours: boolean
  erreur: string | null
  onArreter: () => void
}

export default function EcranQuestion({ etat, secondes, enCours, erreur, onArreter }: Props) {
  const question = etat.question!

  return (
    <ZonesEcran
      code={etat.code}
      erreur={erreur}
      pied={
        <Bouton type="button" variante="secondaire" onClick={onArreter} disabled={enCours}>
          Arrêter maintenant
        </Bouton>
      }
    >
      <div className="flex items-start justify-between gap-[3vw]">
        <h1 className="line-clamp-3 text-[0.95em] leading-tight">{question.enonce}</h1>
        <p
          aria-label="Secondes restantes"
          className="font-titre text-[2.6em] font-normal leading-none tabular-nums text-vertClair"
        >
          {secondes ?? ''}
        </p>
      </div>

      {question.type === 'qcm' && (
        <ul className="grid grid-cols-2 gap-[1.5vh]">
          {(question.choix ?? []).map((texte, i) => (
            <li key={i} className="flex items-center gap-[1.5vw] rounded-carte border-2 border-blanc px-[1.5vw] py-[1.5vh]">
              <span className="flex h-[1.6em] w-[1.6em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet">
                {lettre(i)}
              </span>
              <span className="text-[0.75em] leading-tight">{texte}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="font-semibold">
        {question.nb_reponses} / {etat.nb_participants} réponses
      </p>
    </ZonesEcran>
  )
}
