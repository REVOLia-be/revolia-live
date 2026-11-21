import { useEffect, useState } from 'react'
import Bouton from '../Bouton'
import ResultatsLibres from './ResultatsLibres'
import { lettre, type EtatSession } from '../../lib/session'

interface Props {
  etat: EtatSession
  enCours: boolean
  onSuivante: () => void
  onBilan: () => void
  onAction: (fonction: 'basculer_coup_de_coeur' | 'masquer_reponse', idReponse: string) => void
}

export default function EcranResultats({ etat, enCours, onSuivante, onBilan, onAction }: Props) {
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

  return (
    <div className="flex flex-col gap-[3vh]">
      <h1 className="text-[1.2em] leading-tight">{question.enonce}</h1>

      {question.type === 'qcm' && resultats ? (
        <>
          <ul className="flex flex-col gap-[1.5vh]">
            {(question.choix ?? []).map((texte, i) => {
              const nombre = repartition[i] ?? 0
              const part = total > 0 ? (nombre / total) * 100 : 0
              const bonne = i === resultats.bonne_reponse
              return (
                <li key={i} className={`flex items-center gap-[1.5vw] ${bonne ? '' : 'opacity-70'}`}>
                  <span className="flex h-[1.6em] w-[1.6em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet">
                    {lettre(i)}
                  </span>
                  <div className="relative h-[1.9em] flex-1 overflow-hidden rounded-pilule border-2 border-blanc">
                    <div
                      className={`h-full rounded-pilule transition-[width] duration-1000 ease-out ${bonne ? 'bg-vertClair' : 'bg-blanc'}`}
                      style={{ width: affiche ? `${part}%` : '0%' }}
                    />
                    <span className={`absolute inset-y-0 left-[1vw] flex items-center text-[0.65em] font-semibold ${part > 30 ? 'text-bleuViolet' : 'text-blanc'}`}>
                      {bonne ? '✓ ' : ''}
                      {texte}
                    </span>
                  </div>
                  <span className="w-[2.5em] text-right tabular-nums">{nombre}</span>
                </li>
              )
            })}
          </ul>
          <p className="font-semibold text-vertClair">
            {resultats.taux_reussite == null
              ? "Personne n'a répondu cette fois."
              : `${resultats.taux_reussite} % de bonnes réponses dans la salle`}
          </p>
        </>
      ) : resultats ? (
        <ResultatsLibres question={question} resultats={resultats} onAction={onAction} />
      ) : null}

      <div className="max-w-xl text-[0.6em]">
        {dernier ? (
          <Bouton type="button" onClick={onBilan} disabled={enCours}>
            Voir le bilan
          </Bouton>
        ) : (
          <Bouton type="button" onClick={onSuivante} disabled={enCours}>
            Question suivante
          </Bouton>
        )}
      </div>
    </div>
  )
}
