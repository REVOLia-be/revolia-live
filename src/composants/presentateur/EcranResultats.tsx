import { useEffect, useState } from 'react'
import Bouton from '../Bouton'
import { Ampoule, Coche } from '../Pictos'
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

// Le texte du « Pourquoi ? » rapetisse avec sa longueur (500 caractères au plus) pour que le bouton de pilotage reste à l'écran.
function tailleExplication(longueur: number): string {
  if (longueur <= 160) return 'text-[0.72em]'
  if (longueur <= 280) return 'text-[0.62em]'
  if (longueur <= 400) return 'text-[0.55em]'
  return 'text-[0.47em]'
}

function BlocPourquoiProjete({ texte }: { texte: string }) {
  return (
    <section className="flex min-h-0 w-[44%] shrink-0 flex-col self-stretch overflow-hidden rounded-carte bg-blanc p-[1.2vw] text-bleuViolet">
      <h2 className="mb-[1vh] flex shrink-0 items-center gap-[0.8vw] text-[0.9em] leading-tight text-vertFonce">
        <span className="flex h-[1.3em] w-[1.3em] shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
          <Ampoule taille={28} className="h-[70%] w-[70%]" />
        </span>
        Pourquoi ?
      </h2>
      <p className={`min-h-0 overflow-hidden leading-snug [overflow-wrap:anywhere] ${tailleExplication(texte.length)}`}>{texte}</p>
    </section>
  )
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

  const explication = resultats?.explication?.trim() ?? ''
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
          <div className="flex min-h-0 flex-1 gap-[3vw]">
            <ul className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-[1vh] overflow-hidden">
              {(question.choix ?? []).map((texte, i) => {
                const nombre = repartition[i] ?? 0
                const part = total > 0 ? (nombre / total) * 100 : 0
                const bonne = i === resultats.bonne_reponse
                return (
                  <li key={i} className="flex items-center gap-[1.5vw]">
                    <span
                      className={`flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet ${bonne ? 'halo-bonne-reponse' : ''}`}
                    >
                      {lettre(i)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`flex items-center gap-[0.8vw] text-[0.6em] leading-tight ${bonne ? 'font-bold' : 'font-normal'}`}>
                        {bonne && <Coche taille={24} className="h-[1em] w-[1em]" />}
                        <span className="min-w-0">{texte}</span>
                        {bonne && (
                          <span className="shrink-0 rounded-pilule bg-vert px-[0.7em] py-[0.05em] text-[0.7em] font-bold">Bonne réponse</span>
                        )}
                      </p>
                      <div className="mt-[0.3vh] h-[0.5em] overflow-hidden rounded-pilule border-2 border-blanc">
                        <div
                          className={`h-full rounded-pilule transition-[width] duration-1000 ease-out ${bonne ? 'bg-vert' : 'bg-blanc opacity-70'}`}
                          style={{ width: affiche ? `${part}%` : '0%' }}
                        />
                      </div>
                    </div>
                    <span className={`w-[1.3em] text-right tabular-nums ${bonne ? 'font-bold' : ''}`}>{nombre}</span>
                    <span className="w-[3.2em] text-[0.55em] font-semibold tabular-nums text-vertClair">{Math.round(part)} %</span>
                  </li>
                )
              })}
            </ul>
            {explication && <BlocPourquoiProjete texte={explication} />}
          </div>
          <p className="shrink-0 text-[0.75em] font-semibold text-vertClair">
            {total === 0
              ? "Personne n'a répondu cette fois."
              : `${repartition[resultats.bonne_reponse ?? 0] ?? 0} personne${(repartition[resultats.bonne_reponse ?? 0] ?? 0) > 1 ? 's' : ''} sur ${total} ${(repartition[resultats.bonne_reponse ?? 0] ?? 0) > 1 ? 'ont' : 'a'} choisi la bonne réponse`}
          </p>
        </>
      ) : resultats ? (
        <div className="flex min-h-0 flex-1 gap-[3vw]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden">
            <ResultatsLibres question={question} resultats={resultats} onAction={onAction} />
          </div>
          {explication && <BlocPourquoiProjete texte={explication} />}
        </div>
      ) : null}
    </ZonesEcran>
  )
}
