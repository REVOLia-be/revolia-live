import Bouton from '../Bouton'
import ZonesEcran from './ZonesEcran'
import ContenuAjuste from './ContenuAjuste'
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
          Voir les résultats maintenant
        </Bouton>
      }
    >
      <ContenuAjuste cle={`question-${question.id}`} niveaux={2} plancherEm={0.75}>
        {(niveau) => {
          // Niveau 0 : une colonne jusqu'à 3 propositions, deux au-delà. Niveau 1 : toujours deux colonnes.
          const deuxColonnes = niveau >= 1 || (question.choix?.length ?? 0) > 3
          return (
            <>
          <div className="flex items-start justify-between gap-[3vw]">
            <div className="min-w-0">
              <p className="[font-size:max(0.5em,14px)] font-semibold text-vertClair">
                Question {question.ordre} sur {etat.nb_questions}
              </p>
              <h1 data-texte-principal className="[overflow-wrap:anywhere] text-[0.95em] leading-tight">{question.enonce}</h1>
              <p className="mt-[0.5vh] [font-size:max(0.5em,14px)]">Réponds sur ton téléphone</p>
            </div>
            <p
              role="timer"
              aria-label="Secondes restantes"
              className="font-titre text-[2.6em] font-normal leading-none tabular-nums text-vertClair"
            >
              {secondes ?? ''}
            </p>
          </div>

          {question.type === 'qcm' && (
            <ul className={`grid shrink-0 gap-[1.5vh] ${deuxColonnes ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {(question.choix ?? []).map((texte, i) => (
                <li key={i} className="flex items-center gap-[1.5vw] rounded-carte border-2 border-blanc px-[1.5vw] py-[1.5vh]">
                  <span className="flex h-[1.6em] w-[1.6em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet">
                    {lettre(i)}
                  </span>
                  <span data-texte-principal className="min-w-0 text-[0.75em] leading-tight [overflow-wrap:anywhere]">{texte}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="shrink-0 font-semibold">
            {question.nb_reponses} / {etat.nb_participants} réponses
          </p>
            </>
          )
        }}
      </ContenuAjuste>
    </ZonesEcran>
  )
}
