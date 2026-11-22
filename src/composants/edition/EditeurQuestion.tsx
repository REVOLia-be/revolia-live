import Carte from '../Carte'
import Photo from '../Photo'
import BlocPhoto from './BlocPhoto'
import { MESSAGE_DROITS, supprimerPhotoSiOrpheline } from '../../lib/photos'
import {
  ajouterProposition,
  basculerPhotosChoix,
  lettrePhoto,
  retirerProposition,
  convertirQcm,
  deplacerProposition,
  melangerPropositions,
  estQcm,
  DUREES,
  LIMITES,
  TYPES,
  type ErreursQuestion,
  type QuestionEdition,
} from './modele'

const CHAMP =
  'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'
const PETIT_BOUTON =
  'min-h-[44px] rounded-pilule border-2 border-vert bg-blanc px-4 text-base font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc disabled:opacity-40 disabled:hover:bg-blanc disabled:hover:text-vert'

const BOUTON_FLECHE = PETIT_BOUTON.replace('px-4', 'w-11 px-0 text-xl')

function Message({ texte }: { texte?: string }) {
  if (!texte) return null
  return (
    <p role="alert" className="mt-1 text-base font-semibold">
      {texte}
    </p>
  )
}

export default function EditeurQuestion({
  numero,
  total,
  question,
  erreurs,
  afficherErreurs,
  onChange,
  onMonter,
  onDescendre,
  onDupliquer,
  onSupprimer,
  onReplier,
  formateurId,
  majFonction,
  signalerEnvoi,
}: {
  numero: number
  total: number
  question: QuestionEdition
  erreurs: ErreursQuestion
  afficherErreurs: boolean
  onChange: (q: QuestionEdition) => void
  onMonter: () => void
  onDescendre: () => void
  onDupliquer: () => void
  onSupprimer: () => void
  onReplier?: () => void
  formateurId: string
  /** Modification « à partir de l'état le plus récent » (indispensable pour les envois de photos, qui finissent plus tard). */
  majFonction: (f: (q: QuestionEdition) => QuestionEdition) => void
  signalerEnvoi: (delta: 1 | -1) => void
}) {
  const err = afficherErreurs ? erreurs : {}
  const libelleType = TYPES.find((t) => t.valeur === question.type)?.libelle ?? ''
  const multiple = question.type === 'qcm_multiple'
  const maj = (partiel: Partial<QuestionEdition>) => onChange({ ...question, ...partiel })

  const enPhotos = question.imagesChoix !== null

  function changerChoix(i: number, valeur: string) {
    maj({ choix: question.choix.map((c, j) => (j === i ? valeur : c)) })
  }
  function ajouterChoix() {
    onChange(ajouterProposition(question))
  }
  function retirerChoix(i: number) {
    void supprimerPhotoSiOrpheline(question.imagesChoix?.[i], formateurId)
    onChange(retirerProposition(question, i))
  }
  function basculerEnPhotos(actif: boolean) {
    if (!actif && question.imagesChoix?.some(Boolean)) {
      if (!window.confirm('Les photos des propositions seront retirées de cette question. Continuer ?')) return
      question.imagesChoix.forEach((c) => void supprimerPhotoSiOrpheline(c, formateurId))
    }
    onChange(basculerPhotosChoix(question, actif))
  }
  function basculerBonne(i: number) {
    maj({ bonnes: question.bonnes.includes(i) ? question.bonnes.filter((b) => b !== i) : [...question.bonnes, i] })
  }

  return (
    <Carte className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl">
          Question {numero} <span className="text-base font-normal">· {libelleType}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PETIT_BOUTON} onClick={onMonter} disabled={numero === 1} aria-label={`Monter la question ${numero}`}>
            ↑ Monter
          </button>
          <button type="button" className={PETIT_BOUTON} onClick={onDescendre} disabled={numero === total} aria-label={`Descendre la question ${numero}`}>
            ↓ Descendre
          </button>
          <button type="button" className={PETIT_BOUTON} onClick={onDupliquer}>
            Dupliquer
          </button>
          <button type="button" className={PETIT_BOUTON} onClick={onSupprimer}>
            Supprimer
          </button>
          {onReplier && (
            <button type="button" className={PETIT_BOUTON} onClick={onReplier} aria-expanded="true">
              Replier
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor={`enonce-${question.id}`}>
          Ta question{question.image ? ' (facultatif avec une photo)' : ''}
        </label>
        <textarea
          id={`enonce-${question.id}`}
          rows={2}
          maxLength={LIMITES.enonce + 50}
          value={question.enonce}
          onChange={(e) => maj({ enonce: e.target.value })}
          className={CHAMP}
          placeholder={question.image ? 'Écris ta question ici, ou laisse vide pour montrer seulement la photo' : 'Écris ta question ici'}
        />
        <div className="flex justify-between gap-4">
          <Message texte={err.enonce} />
          <span className="ml-auto text-sm">
            {question.enonce.trim().length}/{LIMITES.enonce}
          </span>
        </div>
        {question.enonce.trim().length > LIMITES.enonceConfort && (
          <p className="text-sm font-semibold">Longue pour l'écran projeté : essaie de raccourcir.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold">Photo (facultatif)</p>
        <BlocPhoto
          id={`question-${question.id}`}
          chemin={question.image}
          genre="question"
          formateurId={formateurId}
          libelle="photo de la question"
          alt={`Photo de la question ${numero}`}
          onChoisie={(c) => majFonction((q) => ({ ...q, image: c }))}
          onRetiree={() => maj({ image: null })}
          signalerEnvoi={signalerEnvoi}
        />
        <p className="text-sm">{MESSAGE_DROITS}</p>
      </div>

      {estQcm(question.type) && (
        <fieldset>
          <legend className="mb-1 text-base font-semibold">
            {multiple ? 'Propositions (coche toutes les bonnes réponses, au moins 2)' : 'Propositions (coche la bonne réponse)'}
          </legend>
          <div className="flex flex-col gap-2">
            {question.choix.map((c, i) => (
              <div key={i}>
              <div className="flex items-center gap-3">
                {multiple ? (
                  <input
                    type="checkbox"
                    checked={question.bonnes.includes(i)}
                    onChange={() => basculerBonne(i)}
                    className="h-6 w-6 shrink-0 accent-vert"
                    aria-label={`Proposition ${i + 1} : bonne réponse`}
                  />
                ) : (
                  <input
                    type="radio"
                    name={`bonne-${question.id}`}
                    checked={question.bonne === i}
                    onChange={() => maj({ bonne: i })}
                    className="h-6 w-6 shrink-0 accent-vert"
                    aria-label={`Proposition ${i + 1} : bonne réponse`}
                  />
                )}
                {enPhotos && (
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pilule bg-vert text-base font-bold text-blanc">
                    {lettrePhoto(i)}
                  </span>
                )}
                <input
                  value={c}
                  maxLength={LIMITES.choix}
                  onChange={(e) => changerChoix(i, e.target.value)}
                  className={CHAMP}
                  placeholder={enPhotos ? 'Légende (facultative)' : `Proposition ${i + 1}`}
                  aria-label={enPhotos ? `Légende de la proposition ${lettrePhoto(i)}` : `Proposition ${i + 1}`}
                />
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className={BOUTON_FLECHE}
                    onClick={() => onChange(deplacerProposition(question, i, i - 1))}
                    disabled={i === 0}
                    aria-label={`Monter la proposition ${String.fromCharCode(65 + i)}`}
                  >
                    <span aria-hidden>↑</span>
                  </button>
                  <button
                    type="button"
                    className={BOUTON_FLECHE}
                    onClick={() => onChange(deplacerProposition(question, i, i + 1))}
                    disabled={i === question.choix.length - 1}
                    aria-label={`Descendre la proposition ${String.fromCharCode(65 + i)}`}
                  >
                    <span aria-hidden>↓</span>
                  </button>
                </div>
                <button
                  type="button"
                  className={PETIT_BOUTON}
                  onClick={() => retirerChoix(i)}
                  disabled={question.choix.length <= LIMITES.choixMin}
                  aria-label={`Retirer la proposition ${i + 1}`}
                >
                  Retirer
                </button>
              </div>
              {enPhotos && (
                <div className="ml-9 mt-2">
                  <BlocPhoto
                    id={`choix-${question.id}-${i}`}
                    chemin={question.imagesChoix?.[i]}
                    genre="choix"
                    formateurId={formateurId}
                    libelle={`photo de la proposition ${lettrePhoto(i)}`}
                    alt={`Proposition ${lettrePhoto(i)}`}
                    compact
                    onChoisie={(chemin) =>
                      majFonction((q) => (q.imagesChoix ? { ...q, imagesChoix: q.imagesChoix.map((x, j) => (j === i ? chemin : x)) } : q))
                    }
                    onRetiree={() => maj({ imagesChoix: (question.imagesChoix ?? []).map((x, j) => (j === i ? '' : x)) })}
                    signalerEnvoi={signalerEnvoi}
                  />
                </div>
              )}
              {c.trim().length > 0 && (
                <p className="ml-9 mt-1 flex flex-wrap justify-between gap-x-4 text-sm">
                  <span className="font-semibold">
                    {c.trim().length > LIMITES.choixConfort ? "Longue pour l'écran projeté : essaie de raccourcir." : ''}
                  </span>
                  <span>
                    {c.trim().length}/{LIMITES.choix}
                  </span>
                </p>
              )}
              </div>
            ))}
          </div>
          <Message texte={err.choix} />
          <Message texte={err.photosChoix} />
          <Message texte={err.bonne} />
          <div className="mt-3">
            <label className="flex min-h-[44px] items-center gap-3 text-base font-semibold">
              <input
                type="checkbox"
                checked={enPhotos}
                onChange={(e) => basculerEnPhotos(e.target.checked)}
                className="h-6 w-6 shrink-0 accent-vert"
                aria-describedby={`aide-photos-${question.id}`}
              />
              Propositions en photos
            </label>
            <p id={`aide-photos-${question.id}`} className="ml-9 text-sm">
              Chaque proposition devient une photo (obligatoire pour toutes). Le texte devient une légende facultative. {MESSAGE_DROITS}
            </p>
          </div>
          {multiple && (
            <div className="mt-3">
              <label className="flex min-h-[44px] items-center gap-3 text-base font-semibold">
                <input
                  type="checkbox"
                  checked={question.annoncerNombre}
                  onChange={(e) => maj({ annoncerNombre: e.target.checked })}
                  className="h-6 w-6 shrink-0 accent-vert"
                  aria-describedby={`aide-annonce-${question.id}`}
                />
                Annoncer le nombre de bonnes réponses aux participants
              </label>
              <p id={`aide-annonce-${question.id}`} className="ml-9 text-sm">
                Coché : les participants lisent « Choisis {question.bonnes.length >= 2 ? question.bonnes.length : 'N'} réponses » et doivent en cocher exactement ce nombre. Décoché : ils cochent librement, c'est plus difficile.
              </p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={PETIT_BOUTON} onClick={() => onChange(melangerPropositions(question))} disabled={question.choix.length < 2}>
              Mélanger les propositions
            </button>
            <button type="button" className={PETIT_BOUTON} onClick={ajouterChoix} disabled={question.choix.length >= LIMITES.choixMax}>
              + Ajouter une proposition
            </button>
            {question.choix.length >= LIMITES.choixMax && <span className="ml-3 text-sm">6 propositions au maximum.</span>}
          </div>
        </fieldset>
      )}

      {question.type === 'echelle' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-base font-semibold" htmlFor={`min-${question.id}`}>
              Texte pour le 1 (facultatif)
            </label>
            <input
              id={`min-${question.id}`}
              value={question.libelleMin}
              onChange={(e) => maj({ libelleMin: e.target.value })}
              className={CHAMP}
              placeholder="ex. Pas du tout"
            />
          </div>
          <div>
            <label className="mb-1 block text-base font-semibold" htmlFor={`max-${question.id}`}>
              Texte pour le 5 (facultatif)
            </label>
            <input
              id={`max-${question.id}`}
              value={question.libelleMax}
              onChange={(e) => maj({ libelleMax: e.target.value })}
              className={CHAMP}
              placeholder="ex. Tout à fait"
            />
          </div>
          <div className="sm:col-span-2">
            <Message texte={err.libelles} />
          </div>
        </div>
      )}

      {estQcm(question.type) && (
        <div>
          <button type="button" className={PETIT_BOUTON} onClick={() => onChange(convertirQcm(question, multiple ? 'qcm' : 'qcm_multiple'))}>
            {multiple ? 'Passer en une seule bonne réponse' : 'Passer en plusieurs bonnes réponses'}
          </button>
          <p className="mt-1 text-sm">
            {multiple
              ? 'Tes propositions sont gardées ; seule la première bonne réponse cochée sera conservée.'
              : 'Tes propositions sont gardées ; la bonne réponse actuelle reste cochée, tu pourras en cocher d\'autres.'}
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor={`explication-${question.id}`}>
          Pourquoi ? (facultatif)
        </label>
        <p id={`aide-explication-${question.id}`} className="mb-1 text-sm">
          2 ou 3 phrases qui expliquent la bonne réponse ou l'idée à retenir. Elles s'affichent après la question, jamais avant.
        </p>
        <textarea
          id={`explication-${question.id}`}
          rows={3}
          maxLength={LIMITES.explication + 50}
          aria-describedby={`aide-explication-${question.id}`}
          value={question.explication}
          onChange={(e) => maj({ explication: e.target.value })}
          className={CHAMP}
          placeholder="ex. Une IA peut se tromper avec assurance : relire prend deux minutes."
        />
        <div className="flex justify-between gap-4">
          <Message texte={err.explication} />
          <span className="ml-auto text-sm">
            {question.explication.trim().length}/{LIMITES.explication}
          </span>
        </div>
      </div>

      <div>
        <label className="mr-3 text-base font-semibold" htmlFor={`duree-${question.id}`}>
          Temps pour répondre
        </label>
        <select
          id={`duree-${question.id}`}
          value={question.duree}
          onChange={(e) => maj({ duree: Number(e.target.value) })}
          className="min-h-[44px] rounded-champ border-2 border-vert bg-blanc px-3 text-lg text-vertFonce"
        >
          {DUREES.map((d) => (
            <option key={d} value={d}>
              {d} secondes
            </option>
          ))}
        </select>
      </div>

      <Apercu question={question} />
    </Carte>
  )
}

// Aperçu sobre : ce que le participant verra sur son téléphone.
function Apercu({ question }: { question: QuestionEdition }) {
  const cases = 'flex min-h-[44px] items-center rounded-champ border-2 border-vert px-4 text-base'
  return (
    <details className="rounded-champ border border-vertClair/60 px-4 py-2">
      <summary className="cursor-pointer text-base font-semibold">Aperçu côté participant</summary>
      <div className="mx-auto mt-3 flex max-w-xs flex-col gap-2 rounded-carte border border-vertClair/60 p-4">
        {question.image && <Photo chemin={question.image} alt="Photo de la question" className="h-44 w-full rounded-champ" />}
        {(question.enonce.trim() || !question.image) && (
          <p className="text-lg font-semibold">{question.enonce.trim() || 'Ta question apparaîtra ici'}</p>
        )}
        {question.type === 'qcm_multiple' && (
          <p className="text-base font-semibold">
            {question.annoncerNombre && question.bonnes.length >= 2 ? `Choisis ${question.bonnes.length} réponses` : 'Plusieurs réponses possibles'}
          </p>
        )}
        {question.imagesChoix && (
          <div className="grid grid-cols-2 gap-2">
            {question.choix.map((c, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-champ border-2 border-vert p-1.5">
                {question.imagesChoix?.[i] ? (
                  <Photo chemin={question.imagesChoix[i]} alt={`Proposition ${lettrePhoto(i)}`} ajuste="contain" className="aspect-square w-full rounded-lg" />
                ) : (
                  <div className="photo-fond-clair flex aspect-square w-full items-center justify-center rounded-lg text-center text-sm">Photo à ajouter</div>
                )}
                <p className="flex items-start gap-1.5 text-sm font-semibold">
                  <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
                    {lettrePhoto(i)}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{c.trim()}</span>
                </p>
              </div>
            ))}
          </div>
        )}
        {question.type === 'qcm' && !question.imagesChoix &&
          question.choix.map((c, i) => (
            <div key={i} className={cases}>
              {c.trim() || `Proposition ${i + 1}`}
            </div>
          ))}
        {question.type === 'qcm_multiple' && !question.imagesChoix &&
          question.choix.map((c, i) => (
            <div key={i} className={`${cases} gap-3`}>
              <span aria-hidden className="h-5 w-5 shrink-0 rounded-sm border-2 border-vert" />
              {c.trim() || `Proposition ${i + 1}`}
            </div>
          ))}
        {question.type === 'qcm_multiple' && <div className={`${cases} justify-center bg-vert font-semibold text-blanc`}>Valider</div>}
        {question.type === 'nuage' && <div className={`${cases} text-discret`}>Un mot ou une expression courte…</div>}
        {question.type === 'ouverte' && <div className={`${cases} min-h-[88px] items-start py-2 text-discret`}>Ta réponse…</div>}
        {question.type === 'echelle' && (
          <>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className={`${cases} flex-1 justify-center`}>
                  {n}
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-2 text-sm">
              <span>{question.libelleMin.trim()}</span>
              <span className="text-right">{question.libelleMax.trim()}</span>
            </div>
          </>
        )}
        <p className="text-sm">Temps : {question.duree} s</p>
        {question.explication.trim() && (
          <section className="rounded-champ border-2 border-l-8 border-vertFonce p-3">
            <h4 className="font-titre text-lg">Pourquoi ?</h4>
            <p className="text-base">{question.explication.trim()}</p>
          </section>
        )}
      </div>
    </details>
  )
}
