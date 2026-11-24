import { useEffect, useState } from 'react'
import { messageErreur } from '../../lib/erreurs'
import {
  enregistrerReglagesQuiz,
  lireReglagesQuiz,
  liensValides,
  nettoyerLiens,
  type LienSuivi,
  type ModeReglage,
  type ReglagesQuiz,
} from '../../lib/rapport'
import Bouton from '../Bouton'
import ProchainesEtapes from '../rapport/ProchainesEtapes'
import EditeurLiens from './EditeurLiens'

const MODES: { valeur: ModeReglage; libelle: string }[] = [
  { valeur: 'herite', libelle: 'Comme les réglages généraux' },
  { valeur: 'actif', libelle: 'Activé pour ce quiz' },
  { valeur: 'inactif', libelle: 'Désactivé pour ce quiz' },
]

const AIDE_RAPPORT: Record<ModeReglage, string> = {
  herite: 'Ce quiz suit le réglage général.',
  actif: "Activé ici, mais le rapport n'est proposé que si l'interrupteur général et celui du formateur sont aussi allumés.",
  inactif: "Désactivé ici, le rapport n'est pas proposé pour ce quiz.",
}
const AIDE_NEWSLETTER: Record<ModeReglage, string> = {
  herite: 'Ce quiz suit le réglage général.',
  actif: "Activée ici, la newsletter n'est proposée que si le rapport l'est aussi et si elle est allumée dans les réglages généraux.",
  inactif: "Désactivée ici, aucune invitation à la newsletter pour ce quiz.",
}

function ChoixMode({ legende, valeur, onChange, aide, disabled }: { legende: string; valeur: ModeReglage; onChange: (m: ModeReglage) => void; aide: string; disabled: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-base font-semibold">
      {legende}
      <select
        value={valeur}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ModeReglage)}
        className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-lg text-vertFonce"
      >
        {MODES.map((m) => (
          <option key={m.valeur} value={m.valeur}>
            {m.libelle}
          </option>
        ))}
      </select>
      <span className="text-base font-normal text-discret">{aide}</span>
    </label>
  )
}

// Panneau « Rapport & liens » d'un quiz : l'administration garde le dernier mot à chaque niveau.
export default function PanneauRapportQuiz({ quizId, titre, onFermer }: { quizId: string; titre: string; onFermer: () => void }) {
  const [r, setR] = useState<ReglagesQuiz | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    let actif = true
    setR(null)
    lireReglagesQuiz(quizId)
      .then((x) => actif && setR(x))
      .catch((e) => actif && setErreur(messageErreur(e)))
    return () => {
      actif = false
    }
  }, [quizId])

  async function enregistrer() {
    if (!r) return
    setInfo(null)
    const propres: LienSuivi[] | null = r.liens_suivi ? nettoyerLiens(r.liens_suivi) : null
    const probleme = propres ? liensValides(propres) : null
    if (probleme) {
      setErreur(probleme)
      return
    }
    setOccupe(true)
    setErreur(null)
    try {
      await enregistrerReglagesQuiz(quizId, { rapport: r.rapport, newsletter: r.newsletter, liens_suivi: propres })
      setR({ ...r, liens_suivi: propres })
      setInfo('Réglages du quiz enregistrés.')
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const liensAffiches = r ? (r.liens_suivi ?? r.liens_generaux) : []

  return (
    <div className="flex flex-col gap-4 rounded-champ border-2 border-vert p-4" role="region" aria-label={`Rapport et liens : ${titre}`}>
      <h3 className="text-xl">Rapport & liens · {titre}</h3>
      {erreur && <p role="alert" className="text-lg font-semibold">{erreur}</p>}
      {!r && !erreur && <p className="text-lg">Un instant…</p>}
      {r && (
        <>
          <ChoixMode legende="Rapport par email" valeur={r.rapport} onChange={(rapport) => setR({ ...r, rapport })} aide={AIDE_RAPPORT[r.rapport]} disabled={occupe} />
          <ChoixMode legende="Invitation à la newsletter" valeur={r.newsletter} onChange={(newsletter) => setR({ ...r, newsletter })} aide={AIDE_NEWSLETTER[r.newsletter]} disabled={occupe} />

          <label className="flex min-h-[56px] items-center gap-3 text-lg font-semibold">
            <input
              type="checkbox"
              className="h-6 w-6 accent-vert"
              checked={r.liens_suivi !== null}
              disabled={occupe}
              onChange={(e) => setR({ ...r, liens_suivi: e.target.checked ? r.liens_generaux.map((l) => ({ ...l })) : null })}
            />
            Utiliser des liens propres à ce quiz
          </label>
          {r.liens_suivi !== null ? (
            <>
              <p className="text-base">Ces liens remplacent les liens généraux pour ce quiz. Aucun lien = aucun bloc « Prochaines étapes ».</p>
              <EditeurLiens liens={r.liens_suivi} onChange={(liens_suivi) => setR({ ...r, liens_suivi })} disabled={occupe} />
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-base">Ce quiz utilise les liens généraux (à modifier dans l'onglet « Rapport & suivi ») :</p>
              {r.liens_generaux.length === 0 ? (
                <p className="text-base font-semibold">Aucun lien général pour l'instant.</p>
              ) : (
                <ul className="list-disc pl-6 text-base">
                  {r.liens_generaux.map((l, i) => (
                    <li key={i}>
                      <strong>{l.titre}</strong> · {l.bouton}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h4 className="text-lg font-semibold">Aperçu du bloc « Prochaines étapes »</h4>
          <ProchainesEtapes liens={nettoyerLiens(liensAffiches).filter((l) => l.titre || l.bouton)} apercu jetonNewsletter={r.newsletter !== 'inactif' ? 'apercu' : null} />

          {info && <p role="status" className="text-lg font-semibold">{info}</p>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Bouton type="button" className="sm:w-auto" onClick={enregistrer} disabled={occupe}>
              {occupe ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
            <Bouton type="button" variante="secondaire" className="sm:w-auto" onClick={onFermer} disabled={occupe}>
              Fermer
            </Bouton>
          </div>
        </>
      )}
    </div>
  )
}
