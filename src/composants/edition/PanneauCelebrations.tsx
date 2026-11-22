import { useId, useState } from 'react'
import Carte from '../Carte'
import { CELEBRATIONS, SUGGESTIONS_CELEBRATION, validerCelebrations, type CelebrationEdition, type QuestionEdition } from './modele'

const CHAMP = 'w-full rounded-champ border-2 border-vert bg-blanc px-4 py-3 text-lg text-vertFonce placeholder:text-discret'
const PETIT_BOUTON =
  'min-h-[40px] rounded-pilule border-2 border-vert bg-blanc px-4 text-base font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc disabled:opacity-40 disabled:hover:bg-blanc disabled:hover:text-vert'

interface Props {
  celebrations: CelebrationEdition[]
  questions: QuestionEdition[]
  /** Erreur à afficher (après un essai d'enregistrement). */
  erreur?: string
  onChange: (c: CelebrationEdition[]) => void
}

const debut = (t: string) => {
  const s = t.trim()
  return s.length > 40 ? s.slice(0, 40).trim() + '…' : s || 'question sans énoncé'
}

// Section repliable « Moments de célébration » : un message affiché à toute la salle après une question choisie.
export default function PanneauCelebrations({ celebrations, questions, erreur, onChange }: Props) {
  const [ouvert, setOuvert] = useState(false)
  const idCorps = useId()
  const n = questions.length
  const probleme = validerCelebrations(celebrations)
  const message = erreur ?? (ouvert ? probleme : undefined)
  const prises = new Set(celebrations.map((c) => c.apres))
  const libre = Array.from({ length: n }, (_, i) => i + 1).find((p) => !prises.has(p))
  const horsQuiz = celebrations.filter((c) => c.apres > n)

  function ajouter(texte = '') {
    if (libre === undefined || celebrations.length >= CELEBRATIONS.max) return
    onChange([...celebrations, { apres: libre, message: texte }])
  }
  const maj = (i: number, p: Partial<CelebrationEdition>) => onChange(celebrations.map((c, j) => (j === i ? { ...c, ...p } : c)))

  return (
    <Carte className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls={idCorps}
        onClick={() => setOuvert(!ouvert)}
        className="flex min-h-[44px] w-full items-center justify-between gap-4 text-left"
      >
        <span className="text-2xl font-semibold">Moments de célébration</span>
        <span className="shrink-0 text-base font-semibold text-vert underline">
          {ouvert ? 'Replier' : celebrations.length === 0 ? 'Aucun : régler' : `${celebrations.length} : régler`}
        </span>
      </button>
      {!ouvert && (message || horsQuiz.length > 0) && (
        <p role="alert" className="text-base font-semibold">
          {message ?? 'Un moment de célébration est placé après une question qui n\'existe plus : ouvre cette section pour le corriger.'}
        </p>
      )}

      {ouvert && (
        <div id={idCorps} className="flex flex-col gap-4">
          <p className="text-base">
            Choisis les moments où toute la salle reçoit un message de félicitations, à l'écran et sur les téléphones, juste après les résultats
            d'une question. Tu n'en veux pas ? Laisse la liste vide.
          </p>

          <ul className="flex flex-col gap-4">
            {celebrations.map((c, i) => {
              const opts = Array.from({ length: n }, (_, k) => k + 1)
              return (
                <li key={i} className="flex flex-col gap-2 rounded-champ border-2 border-vert p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor={`${idCorps}-a${i}`} className="text-base font-semibold">
                      Après la question
                    </label>
                    <select
                      id={`${idCorps}-a${i}`}
                      value={c.apres}
                      onChange={(e) => maj(i, { apres: Number(e.target.value) })}
                      className="min-w-0 max-w-full flex-1 rounded-champ border-2 border-vert bg-blanc px-3 py-2 text-base text-vertFonce"
                    >
                      {c.apres > n && <option value={c.apres}>{c.apres} (cette question n'existe plus)</option>}
                      {opts.map((p) => (
                        <option key={p} value={p} disabled={p !== c.apres && prises.has(p)}>
                          {p}. {debut(questions[p - 1].enonce)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={PETIT_BOUTON}
                      onClick={() => onChange(celebrations.filter((_, j) => j !== i))}
                      aria-label={`Retirer le moment de célébration ${i + 1}`}
                    >
                      Retirer
                    </button>
                  </div>
                  {c.apres > n && (
                    <p role="alert" className="text-sm font-semibold">
                      Ton quiz n'a que {n} question{n > 1 ? 's' : ''} : ce message ne s'affichera jamais. Choisis une autre question ou retire-le.
                    </p>
                  )}
                  <label htmlFor={`${idCorps}-m${i}`} className="text-base font-semibold">
                    Message
                  </label>
                  <input
                    id={`${idCorps}-m${i}`}
                    value={c.message}
                    maxLength={CELEBRATIONS.messageMax}
                    onChange={(e) => maj(i, { message: e.target.value })}
                    className={CHAMP}
                    placeholder="Ex. : Bravo à toute la salle !"
                  />
                  <p className="text-right text-sm">
                    {c.message.trim().length}/{CELEBRATIONS.messageMax}
                  </p>
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PETIT_BOUTON} disabled={libre === undefined || celebrations.length >= CELEBRATIONS.max} onClick={() => ajouter()}>
              + Ajouter un moment
            </button>
            {SUGGESTIONS_CELEBRATION.map((t) => (
              <button
                key={t}
                type="button"
                className={PETIT_BOUTON}
                disabled={libre === undefined || celebrations.length >= CELEBRATIONS.max}
                onClick={() => ajouter(t)}
              >
                Suggestion : « {t.split(',')[0]}… »
              </button>
            ))}
          </div>
          {n === 0 && <p className="text-sm">Ajoute d'abord des questions : un moment se place après une question.</p>}
          {libre === undefined && n > 0 && <p className="text-sm">Chaque question a déjà son moment de célébration.</p>}

          {message && (
            <p role="alert" className="text-base font-semibold">
              {message}
            </p>
          )}
        </div>
      )}
    </Carte>
  )
}
