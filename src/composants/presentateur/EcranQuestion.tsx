import Bouton from '../Bouton'
import Photo from '../Photo'
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

// Part de la largeur donnée à la photo de la question quand elle est à côté des propositions, selon la disposition (0 = la plus aérée).
const LARGEUR_PHOTO = ['w-[42%]', 'w-[34%]', 'w-[28%]']

export default function EcranQuestion({ etat, secondes, enCours, erreur, onArreter }: Props) {
  const question = etat.question!
  const qcm = question.type === 'qcm' || question.type === 'qcm_multiple'
  const image = question.image ?? null
  const imagesChoix = qcm ? question.images_choix ?? null : null
  const aEnonce = question.enonce.trim().length > 0
  const nbChoix = question.choix?.length ?? 0

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
      <ContenuAjuste cle={`question-${question.id}`} niveaux={image || imagesChoix ? 3 : 2} plancherEm={0.75}>
        {(niveau) => {
          // Niveau 0 : une colonne jusqu'à 3 propositions, deux au-delà. Niveau 1 : toujours deux colonnes.
          // (Avec photos : le niveau réduit la place de la photo de la question au profit des propositions.)
          const deuxColonnes = niveau >= 1 || nbChoix > 3
          const photoQuestion = image ? (
            <Photo
              chemin={image}
              alt="Photo de la question"
              fond="projete"
              className={`min-h-0 self-stretch rounded-carte border-2 border-blanc ${imagesChoix || (qcm && nbChoix > 0) ? `shrink-0 ${LARGEUR_PHOTO[Math.min(niveau, 2)]}` : 'w-full flex-1'}`}
            />
          ) : null
          // Propositions en photos : grille de vignettes (lettre, photo, légende), les rangées se partagent la hauteur.
          const colonnes = image ? (nbChoix <= 4 ? 2 : 3) : nbChoix <= 4 ? Math.max(nbChoix, 1) : 3
          const grillePhotos = imagesChoix ? (
            <ul
              className="grid min-h-0 min-w-0 flex-1 gap-[1.5vh] [grid-auto-rows:minmax(0,1fr)]"
              style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}
            >
              {imagesChoix.map((chemin, i) => (
                <li key={i} className="flex min-h-0 min-w-0 flex-col gap-[0.6vh] rounded-carte border-2 border-blanc p-[0.8vh]">
                  <div className="relative min-h-0 flex-1">
                    <Photo chemin={chemin} alt={`Proposition ${lettre(i)}`} fond="projete" className="absolute inset-0 rounded-champ" />
                    <span className="absolute left-[0.6vh] top-[0.6vh] flex h-[1.5em] w-[1.5em] items-center justify-center rounded-pilule bg-blanc text-[0.8em] font-bold text-bleuViolet">
                      {lettre(i)}
                    </span>
                  </div>
                  {(question.choix?.[i] ?? '').trim() && (
                    <span data-texte-principal className="shrink-0 text-center text-[0.6em] leading-tight [overflow-wrap:anywhere]">
                      {question.choix?.[i]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null
          const listeTexte =
            qcm && !imagesChoix ? (
              <ul className={`grid shrink-0 gap-[1.5vh] ${deuxColonnes && !image ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(question.choix ?? []).map((texte, i) => (
                  <li key={i} className="flex items-center gap-[1.5vw] rounded-carte border-2 border-blanc px-[1.5vw] py-[1.5vh]">
                    <span className="flex h-[1.6em] w-[1.6em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet">
                      {lettre(i)}
                    </span>
                    <span data-texte-principal className="min-w-0 text-[0.75em] leading-tight [overflow-wrap:anywhere]">{texte}</span>
                  </li>
                ))}
              </ul>
            ) : null
          return (
            <>
          <div className="flex shrink-0 items-start justify-between gap-[3vw]">
            <div className="min-w-0">
              <p className="[font-size:max(0.5em,14px)] font-semibold text-vertClair">
                Question {question.ordre} sur {etat.nb_questions}
              </p>
              {aEnonce && <h1 data-texte-principal className="[overflow-wrap:anywhere] text-[0.95em] leading-tight">{question.enonce}</h1>}
              {!aEnonce && <h1 className="sr-only">Question {question.ordre} sur {etat.nb_questions}</h1>}
              <p className="mt-[0.5vh] [font-size:max(0.5em,14px)]">
                {question.type === 'qcm_multiple' ? (
                  <>
                    <strong className="font-bold text-vertClair">
                      {question.nb_bonnes ? `${question.nb_bonnes} bonnes réponses` : 'Plusieurs réponses possibles'}
                    </strong>
                    {' · '}
                  </>
                ) : null}
                Réponds sur ton téléphone
              </p>
            </div>
            <p
              role="timer"
              aria-label="Secondes restantes"
              className="font-titre text-[2.6em] font-normal leading-none tabular-nums text-vertClair"
            >
              {secondes ?? ''}
            </p>
          </div>

          {image || imagesChoix ? (
            <div className="flex min-h-0 flex-1 gap-[2.5vw]">
              {photoQuestion}
              {grillePhotos}
              {image && !imagesChoix && qcm && <div className="flex min-w-0 flex-1 flex-col justify-center">{listeTexte}</div>}
            </div>
          ) : (
            listeTexte
          )}

          <p className="shrink-0 pb-[0.6vh] font-semibold">
            {question.nb_reponses} / {etat.nb_participants} réponses
          </p>
            </>
          )
        }}
      </ContenuAjuste>
    </ZonesEcran>
  )
}
