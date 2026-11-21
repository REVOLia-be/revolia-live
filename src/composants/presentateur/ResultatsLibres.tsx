import { useEffect, useState } from 'react'
import type { QuestionCourante, ResultatsQuestion } from '../../lib/session'
import NuageDeMots from './NuageDeMots'

interface Props {
  question: QuestionCourante
  resultats: ResultatsQuestion
  onAction: (fonction: 'basculer_coup_de_coeur' | 'masquer_reponse', idReponse: string) => void
}

// Résultats des questions sans bonne réponse : nuage, ouverte, échelle.
export default function ResultatsLibres({ question, resultats, onAction }: Props) {
  if (question.type === 'nuage') return <NuageDeMots mots={resultats.mots ?? []} />
  if (question.type === 'echelle') return <BarresEchelle question={question} resultats={resultats} />
  return <MurDeCartes resultats={resultats} onAction={onAction} />
}

// Mur de cartes : texte seul, pas de pseudo. Les deux actions sont réservées au formateur (discrètes).
function MurDeCartes({ resultats, onAction }: Pick<Props, 'resultats' | 'onAction'>) {
  const reponses = resultats.reponses ?? []
  if (reponses.length === 0) return <p className="text-vertClair">Aucune réponse cette fois.</p>
  return (
    <ul className="grid max-h-[55vh] grid-cols-2 gap-[1.5vh] overflow-y-auto pr-[0.5vw] text-[0.6em] xl:grid-cols-3">
      {reponses.map((r) => (
        <li
          key={r.id}
          className={`animation-apparition flex flex-col justify-between gap-[1vh] rounded-carte border-2 p-[1.2vw] ${
            r.coup_de_coeur ? 'border-vertClair bg-blanc text-bleuViolet' : 'border-blanc'
          }`}
        >
          <p className="break-words">{r.texte}</p>
          <div className="flex items-center justify-end gap-[1vw] text-[0.6em] opacity-60 transition-opacity hover:opacity-100">
            <button
              type="button"
              onClick={() => onAction('basculer_coup_de_coeur', r.id)}
              aria-label={r.coup_de_coeur ? 'Retirer le coup de cœur' : 'Coup de cœur'}
              aria-pressed={r.coup_de_coeur}
              className="px-2 text-[1.6em] leading-none"
            >
              {r.coup_de_coeur ? '♥' : '♡'}
            </button>
            <button type="button" onClick={() => onAction('masquer_reponse', r.id)} className="px-2 underline">
              Masquer
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

// 5 barres verticales animées + moyenne en grand.
function BarresEchelle({ question, resultats }: Pick<Props, 'question' | 'resultats'>) {
  const [affiche, setAffiche] = useState(false)
  useEffect(() => {
    const minuteur = window.setTimeout(() => setAffiche(true), 100)
    return () => window.clearTimeout(minuteur)
  }, [])

  const repartition = resultats.repartition ?? [0, 0, 0, 0, 0]
  const maximum = Math.max(1, ...repartition)

  return (
    <div className="flex items-end justify-center gap-[5vw]">
      <div className="flex flex-1 flex-col gap-[1vh]">
        <div className="flex h-[32vh] items-end gap-[1.5vw]">
          {repartition.map((nombre, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-[0.5vh]">
              <span className="tabular-nums text-[0.8em] font-semibold">{nombre}</span>
              <div
                className="w-full rounded-t-carte bg-blanc transition-[height] duration-1000 ease-out"
                style={{ height: affiche ? `${(nombre / maximum) * 85}%` : '0%', minHeight: nombre > 0 ? '0.5vh' : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-[1.5vw] border-t-2 border-blanc pt-[0.5vh]">
          {repartition.map((_, i) => (
            <span key={i} className="flex-1 text-center font-bold">
              {i + 1}
            </span>
          ))}
        </div>
        <div className="flex justify-between text-[0.5em] text-vertClair">
          <span>{question.libelle_min}</span>
          <span className="text-right">{question.libelle_max}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[0.6em] text-vertClair">Moyenne</p>
        <p className="font-titre text-[3.2em] font-normal leading-none tabular-nums">
          {resultats.moyenne == null ? '–' : String(resultats.moyenne).replace('.', ',')}
        </p>
        <p className="text-[0.6em]">sur 5</p>
      </div>
    </div>
  )
}
