import { useEffect, useState } from 'react'
import Bouton from '../Bouton'
import ZonesEcran from './ZonesEcran'
import ResultatsLibres from './ResultatsLibres'
import { lettre, type EtatSession } from '../../lib/session'

interface Props {
  etat: EtatSession
  enCours: boolean
  erreur: string | null
  onSuivante: () => void
  onBilan: () => void
  onAction: (fonction: 'basculer_coup_de_coeur' | 'masquer_reponse', idReponse: string) => void
}

export default function EcranResultats({ etat, enCours, erreur, onSuivante, onBilan, onAction }: Props) {
  const question = etat.question!
  const resultats = etat.resultats
  const dernier = question.ordre >= etat.nb_questions

  // Les barres partent de zéro puis grandissent (transition CSS).
  const [affiche, setAffiche] = useState(false)
  useEffect(() => {
    const minuteur = window.setTimeout(() => setAffiche(true), 100)
    return () => window.clearTimeout(minuteur)
  }, [])

  const repartition = resultats?.repartition ?? []
  const total = resultats?.nb_reponses ?? 0

  const bouton = dernier ? (
    <Bouton type="button" onClick={onBilan} disabled={enCours}>
      Voir le bilan
    </Bouton>
  ) : (
    <Bouton type="button" onClick={onSuivante} disabled={enCours}>
      Question suivante
    </Bouton>
  )

  return (
    <ZonesEcran code={etat.code} erreur={erreur} pied={bouton}>
      <div className="shrink-0">
        <p className="text-[0.5em] font-semibold text-vertClair">
          Question {question.ordre} sur {etat.nb_questions}
        </p>
        <h1 className="line-clamp-3 text-[0.95em] leading-tight">{question.enonce}</h1>
      </div>

      {question.type === 'qcm' && resultats ? (
        <>
          {/* Le libellé est AU-DESSUS de la barre : toujours blanc sur bleu violet, quel que soit le remplissage.
              La barre ne sert qu'à mesurer. Bonne réponse : ✓, texte en gras, barre verte ; les autres restent neutres (pas de rouge). */}
          <ul className="flex min-h-0 flex-1 flex-col justify-center gap-[1vh] overflow-hidden">
            {(question.choix ?? []).map((texte, i) => {
              const nombre = repartition[i] ?? 0
              const part = total > 0 ? (nombre / total) * 100 : 0
              const bonne = i === resultats.bonne_reponse
              return (
                <li key={i} className="flex items-center gap-[1.5vw]">
                  <span className="flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet">
                    {lettre(i)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[0.6em] leading-tight ${bonne ? 'font-bold' : 'font-normal'}`}>
                      {bonne ? '✓ ' : ''}
                      {texte}
                    </p>
                    <div className="mt-[0.3vh] h-[0.5em] overflow-hidden rounded-pilule border-2 border-blanc">
                      <div
                        className={`h-full rounded-pilule transition-[width] duration-1000 ease-out ${bonne ? 'bg-vert' : 'bg-blanc opacity-70'}`}
                        style={{ width: affiche ? `${part}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <span className={`w-[2.5em] text-right tabular-nums ${bonne ? 'font-bold' : ''}`}>{nombre}</span>
                </li>
              )
            })}
          </ul>
          <p className="shrink-0 font-semibold text-vertClair">
            {resultats.taux_reussite == null
              ? "Personne n'a répondu cette fois."
              : `${resultats.taux_reussite} % de bonnes réponses dans la salle`}
          </p>
        </>
      ) : resultats ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
          <ResultatsLibres question={question} resultats={resultats} onAction={onAction} />
        </div>
      ) : null}
    </ZonesEcran>
  )
}
