import { Link } from 'react-router-dom'
import Bouton from '../Bouton'
import type { EtatSession, NomMention } from '../../lib/session'

// Version simple du bilan. Le bilan festif viendra à l'étape 4.
const LIBELLES: Record<NomMention, string> = {
  a_repondu_a_tout: 'A répondu à tout',
  plus_belle_progression: 'Plus belle progression',
  coup_de_coeur: 'Réponse coup de cœur',
}

interface Props {
  etat: EtatSession
  enCours: boolean
  onTerminer: () => void
}

export default function EcranBilan({ etat, enCours, onTerminer }: Props) {
  const bilan = etat.bilan
  if (!bilan) return <p>Un instant…</p>

  const parType = (Object.keys(LIBELLES) as NomMention[])
    .map((type) => ({ type, gens: bilan.mentions.filter((m) => m.type === type) }))
    .filter((groupe) => groupe.gens.length > 0)

  return (
    <div className="flex flex-col gap-[3vh]">
      <h1 className="text-[1.3em]">{etat.etat === 'terminee' ? 'Quiz terminé. Merci à tous !' : 'Bilan de la salle'}</h1>
      <p>
        <span className="font-bold text-vertClair">{bilan.nb_participants}</span> participants ·{' '}
        <span className="font-bold text-vertClair">{bilan.nb_reponses}</span> réponses
        {bilan.taux_reussite_qcm != null && (
          <>
            {' '}
            · <span className="font-bold text-vertClair">{bilan.taux_reussite_qcm} %</span> de bonnes réponses
          </>
        )}
      </p>

      {parType.length > 0 && (
        <ul className="flex flex-col gap-[1.5vh] text-[0.8em]">
          {parType.map(({ type, gens }) => (
            <li key={type}>
              <span className="font-semibold text-vertClair">{LIBELLES[type]}</span>
              {' : '}
              {gens.map((m) => m.pseudo).join(', ')}
            </li>
          ))}
        </ul>
      )}

      <div className="max-w-xl text-[0.6em]">
        {etat.etat === 'terminee' ? (
          <Link to="/formateur">
            <Bouton type="button">Retour à mes quiz</Bouton>
          </Link>
        ) : (
          <Bouton type="button" onClick={onTerminer} disabled={enCours}>
            Terminer
          </Bouton>
        )}
      </div>
    </div>
  )
}
