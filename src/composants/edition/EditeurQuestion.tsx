import Carte from '../Carte'
import {
  DUREES,
  LIMITES,
  TYPES,
  type ErreursQuestion,
  type QuestionEdition,
} from './modele'

const CHAMP =
  'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'
const PETIT_BOUTON =
  'min-h-[40px] rounded-pilule border-2 border-vert bg-blanc px-4 text-base font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc disabled:opacity-40 disabled:hover:bg-blanc disabled:hover:text-vert'

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
}) {
  const err = afficherErreurs ? erreurs : {}
  const libelleType = TYPES.find((t) => t.valeur === question.type)?.libelle ?? ''
  const maj = (partiel: Partial<QuestionEdition>) => onChange({ ...question, ...partiel })

  function changerChoix(i: number, valeur: string) {
    maj({ choix: question.choix.map((c, j) => (j === i ? valeur : c)) })
  }
  function ajouterChoix() {
    if (question.choix.length >= LIMITES.choixMax) return
    maj({ choix: [...question.choix, ''] })
  }
  function retirerChoix(i: number) {
    if (question.choix.length <= LIMITES.choixMin) return
    let bonne = question.bonne
    if (bonne !== null) {
      if (bonne === i) bonne = null
      else if (bonne > i) bonne = bonne - 1
    }
    maj({ choix: question.choix.filter((_, j) => j !== i), bonne })
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
          Ta question
        </label>
        <textarea
          id={`enonce-${question.id}`}
          rows={2}
          maxLength={LIMITES.enonce + 50}
          value={question.enonce}
          onChange={(e) => maj({ enonce: e.target.value })}
          className={CHAMP}
          placeholder="Écris ta question ici"
        />
        <div className="flex justify-between gap-4">
          <Message texte={err.enonce} />
          <span className="ml-auto text-sm">
            {question.enonce.trim().length}/{LIMITES.enonce}
          </span>
        </div>
      </div>

      {question.type === 'qcm' && (
        <fieldset>
          <legend className="mb-1 text-base font-semibold">Propositions (coche la bonne réponse)</legend>
          <div className="flex flex-col gap-2">
            {question.choix.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="radio"
                  name={`bonne-${question.id}`}
                  checked={question.bonne === i}
                  onChange={() => maj({ bonne: i })}
                  className="h-6 w-6 shrink-0 accent-vert"
                  aria-label={`Proposition ${i + 1} : bonne réponse`}
                />
                <input
                  value={c}
                  onChange={(e) => changerChoix(i, e.target.value)}
                  className={CHAMP}
                  placeholder={`Proposition ${i + 1}`}
                  aria-label={`Proposition ${i + 1}`}
                />
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
            ))}
          </div>
          <Message texte={err.choix} />
          <Message texte={err.bonne} />
          <div className="mt-2">
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
        <p className="text-lg font-semibold">{question.enonce.trim() || 'Ta question apparaîtra ici'}</p>
        {question.type === 'qcm' &&
          question.choix.map((c, i) => (
            <div key={i} className={cases}>
              {c.trim() || `Proposition ${i + 1}`}
            </div>
          ))}
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
