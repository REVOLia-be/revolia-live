import { useEffect, useState } from 'react'
import Bouton from '../Bouton'
import { Ampoule, Coche } from '../Pictos'
import ZonesEcran from './ZonesEcran'
import ContenuAjuste from './ContenuAjuste'
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

// À côté des résultats (niveau 0) ou en dessous, en pleine largeur (niveau 1 et plus).
// Moment de célébration choisi par le formateur : encart sobre, halo bref (coupé si « moins d'animations »).
function EncartCelebration({ texte }: { texte: string }) {
  return (
    <p
      role="status"
      className="halo-bonne-reponse flex shrink-0 items-center gap-[1vw] rounded-carte border-4 border-vertClair bg-blanc px-[1.5vw] py-[1vh] text-bleuViolet"
    >
      <span aria-hidden className="shrink-0 text-vert">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[1.2em] w-[1.2em]">
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z" />
        </svg>
      </span>
      <span data-texte-principal className="min-w-0 text-[0.7em] font-bold leading-tight [overflow-wrap:anywhere]">{texte}</span>
    </p>
  )
}

function BlocPourquoiProjete({ texte, dessous }: { texte: string; dessous: boolean }) {
  return (
    <section className={`flex shrink-0 flex-col rounded-carte bg-blanc p-[1.2vw] text-bleuViolet ${dessous ? 'w-full' : 'w-[42%] self-start'}`}>
      <h2 className="mb-[0.8vh] flex shrink-0 items-center gap-[0.8vw] text-[0.8em] leading-tight text-vertFonce">
        <span className="flex h-[1.3em] w-[1.3em] shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
          <Ampoule taille={28} className="h-[70%] w-[70%]" />
        </span>
        Pourquoi ?
      </h2>
      <p data-texte-principal className="text-[0.62em] leading-snug [overflow-wrap:anywhere]">{texte}</p>
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
  const multiple = question.type === 'qcm_multiple'
  // Personnes ayant trouvé toutes les bonnes réponses (QCM multiple) : déduit du taux de réussite en %.
  const nbExacts = multiple ? Math.round(((resultats?.taux_reussite ?? 0) * total) / 100) : 0
  const nbBonnesChoix = multiple ? (resultats?.bonnes_reponses ?? []).length : 0

  const bouton = dernier ? (
    <Bouton type="button" data-commande="suivant" onClick={onBilan} disabled={enCours}>
      Voir le bilan
    </Bouton>
  ) : (
    <Bouton type="button" data-commande="suivant" onClick={onSuivante} disabled={enCours}>
      Question suivante
    </Bouton>
  )

  return (
    <ZonesEcran code={etat.code} erreur={erreur} pied={bouton}>
      <ContenuAjuste cle={`resultats-${question.id}`} niveaux={3} plancherEm={0.6}>
        {(niveau) => {
          // Niveau 0 : « Pourquoi ? » à droite des résultats. Niveau 1 : sous les résultats, en pleine largeur.
          // Niveau 2 : en plus, propositions sur deux colonnes et sans la ligne « Question N sur M ».
          const dessous = niveau >= 1
          const compact = niveau >= 2
          const rangee = dessous ? 'flex flex-col gap-[2vh]' : 'flex items-start gap-[3vw]'
          return (
            <>
              <div className="shrink-0">
                {!compact && (
                  <p className="[font-size:max(0.5em,14px)] font-semibold text-vertClair">
                    Question {question.ordre} sur {etat.nb_questions}
                    {multiple && ` · ${nbBonnesChoix} bonnes réponses`}
                  </p>
                )}
                <h1 data-texte-principal className="text-[0.95em] leading-tight [overflow-wrap:anywhere]">{question.enonce}</h1>
              </div>

              {etat.celebration && <EncartCelebration texte={etat.celebration} />}

              {(question.type === 'qcm' || question.type === 'qcm_multiple') && resultats ? (
                <>
                  {/* Le libellé est AU-DESSUS de la barre : toujours blanc sur bleu violet, quel que soit le remplissage.
                      La barre ne sert qu'à mesurer. Bonne réponse : ✓, texte en gras, barre verte ; les autres restent neutres (pas de rouge). */}
                  <div className={`min-h-0 flex-1 ${rangee}`}>
                    {/* Centrage par marges automatiques : si ça déborde, rien n'est poussé hors de la zone. */}
                    <ul className={`min-w-0 flex-1 self-stretch ${compact && (question.choix?.length ?? 0) > 2 ? 'grid grid-cols-2 content-center gap-x-[2.5vw] gap-y-[1vh]' : 'flex flex-col gap-[1vh]'}`}>
                      {(question.choix ?? []).map((texte, i) => {
                        const nombre = repartition[i] ?? 0
                        const part = total > 0 ? (nombre / total) * 100 : 0
                        const bonne = multiple ? (resultats.bonnes_reponses ?? []).includes(i) : i === resultats.bonne_reponse
                        return (
                          <li key={i} className={`flex items-center gap-[1.5vw] ${compact ? '' : 'first:mt-auto last:mb-auto'}`}>
                            <span
                              className={`flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet ${bonne ? 'halo-bonne-reponse' : ''}`}
                            >
                              {lettre(i)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={`flex items-center gap-[0.8vw] text-[0.6em] leading-tight ${bonne ? 'font-bold' : 'font-normal'}`}>
                                {bonne && <Coche taille={24} className="h-[1em] w-[1em] shrink-0" />}
                                <span data-texte-principal className="min-w-0 [overflow-wrap:anywhere]">{texte}</span>
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
                    {explication && <BlocPourquoiProjete texte={explication} dessous={dessous} />}
                  </div>
                  <p className="shrink-0 text-[0.75em] font-semibold text-vertClair">
                    {total === 0
                      ? "Personne n'a répondu cette fois."
                      : multiple
                        ? `${nbExacts} personne${nbExacts > 1 ? 's' : ''} sur ${total} ${nbExacts > 1 ? 'ont' : 'a'} trouvé toutes les bonnes réponses`
                        : `${repartition[resultats.bonne_reponse ?? 0] ?? 0} personne${(repartition[resultats.bonne_reponse ?? 0] ?? 0) > 1 ? 's' : ''} sur ${total} ${(repartition[resultats.bonne_reponse ?? 0] ?? 0) > 1 ? 'ont' : 'a'} choisi la bonne réponse`}
                  </p>
                </>
              ) : resultats ? (
                <div className={`min-h-0 flex-1 ${rangee}`}>
                  <div className="flex min-w-0 flex-1 flex-col self-stretch">
                    <div className="my-auto">
                      <ResultatsLibres question={question} resultats={resultats} onAction={onAction} dense={dessous} />
                    </div>
                  </div>
                  {explication && <BlocPourquoiProjete texte={explication} dessous={dessous} />}
                </div>
              ) : null}
            </>
          )
        }}
      </ContenuAjuste>
    </ZonesEcran>
  )
}
