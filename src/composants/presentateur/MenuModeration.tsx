import { useState } from 'react'
import type { ParticipantListe } from '../../lib/session'

// Menu « Modération » accessible pendant toute la séance : retirer un pseudo déplacé.
export default function MenuModeration({
  participants,
  onExclure,
  sessionId,
}: {
  participants: ParticipantListe[]
  onExclure: (p: ParticipantListe) => void
  /** Si fourni : lien vers la vue formateur de suivi des ateliers (nouvel onglet). */
  sessionId?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className="fixed right-[2vw] top-[1.2vh] z-30 text-bleuViolet">
      {!ouvert ? (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          aria-expanded="false"
          className="rounded-pilule px-3 py-1 text-blanc underline opacity-80 hover:opacity-100"
          style={{ fontSize: 'max(14px, 2vh)' }}
        >
          Modération
        </button>
      ) : (
        <div role="dialog" aria-label="Modération" className="w-[min(26rem,90vw)] rounded-carte bg-blanc p-4 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-lg font-bold">Retirer un pseudo</p>
            <button type="button" onClick={() => setOuvert(false)} className="min-h-[44px] px-3 text-base font-semibold underline">
              Fermer
            </button>
          </div>
          {sessionId && (
            <a
              href={`/presenter/${sessionId}/suivi`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex min-h-[44px] items-center text-base font-semibold underline"
            >
              Suivi des ateliers (nouvel onglet)
            </a>
          )}
          {participants.length === 0 ? (
            <p className="text-base">Personne n'est dans la salle pour l'instant.</p>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-discret py-1 last:border-b-0">
                  <span className="min-w-0 truncate text-base">{p.pseudo}</span>
                  <button
                    type="button"
                    onClick={() => onExclure(p)}
                    className="min-h-[44px] shrink-0 rounded-pilule border-2 border-bleuViolet px-4 text-base font-semibold"
                  >
                    Exclure
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
