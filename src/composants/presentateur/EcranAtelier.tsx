import { useEffect, useState } from 'react'
import Bouton from '../Bouton'
import { Coche } from '../Pictos'
import ContenuAjuste from './ContenuAjuste'
import ZonesEcran from './ZonesEcran'
import { personnes } from '../../lib/atelier'
import type { EtatSession } from '../../lib/session'

interface Props {
  etat: EtatSession
  enCours: boolean
  erreur: string | null
  onTerminer: () => void
}

// Écran projeté pendant un atelier : progression collective uniquement (jamais de nom, jamais de classement).
// Pas de compte à rebours, jamais de fermeture automatique : seul le bouton (ou la télécommande, deux pressions) termine l'atelier.
export default function EcranAtelier({ etat, enCours, erreur, onTerminer }: Props) {
  const question = etat.question!
  const etapes = question.etapes ?? []
  const repartition = etat.atelier?.repartition ?? []
  const termines = etat.atelier?.ont_termine ?? 0
  const total = Math.max(etat.nb_participants, 1)
  const rendu = etat.rendu_projete ?? null

  // Les barres partent de zéro puis grandissent.
  const [affiche, setAffiche] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setAffiche(true), 100)
    return () => window.clearTimeout(t)
  }, [])

  const barres = (compact: boolean) => (
    <ul className="flex min-w-0 flex-col justify-center gap-[1.4vh]" aria-label="Où en est la salle">
      {etapes.map((e, i) => {
        const n = repartition[i] ?? 0
        return (
          <li key={e.id} className="flex items-center gap-[1.5vw]">
            <span className="flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-pilule bg-blanc font-bold text-bleuViolet">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-[1.5vw] text-[0.62em] leading-tight">
                <span data-texte-principal className="min-w-0 [overflow-wrap:anywhere]">{e.titre}</span>
                <strong className="shrink-0 tabular-nums">{personnes(n)}</strong>
              </p>
              <div className={`mt-[0.3vh] overflow-hidden rounded-pilule border-2 border-blanc ${compact ? 'h-[0.35em]' : 'h-[0.45em]'}`}>
                <div
                  className="h-full rounded-pilule bg-blanc transition-[width] duration-1000 ease-out"
                  style={{ width: affiche ? `${Math.min(100, (n / total) * 100)}%` : '0%' }}
                />
              </div>
            </div>
          </li>
        )
      })}
      <li className="flex items-center gap-[1.5vw]">
        <span className="flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
          <Coche taille={24} className="h-[70%] w-[70%]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-[1.5vw] text-[0.62em] leading-tight">
            <strong className="tabular-nums">Ont terminé : {termines}</strong>
            <span className="shrink-0">{personnes(termines)}</span>
          </p>
          <div className={`mt-[0.3vh] overflow-hidden rounded-pilule border-2 border-blanc ${compact ? 'h-[0.35em]' : 'h-[0.45em]'}`}>
            <div
              className="h-full rounded-pilule bg-vert transition-[width] duration-1000 ease-out"
              style={{ width: affiche ? `${Math.min(100, (termines / total) * 100)}%` : '0%' }}
            />
          </div>
        </div>
      </li>
    </ul>
  )

  return (
    <ZonesEcran
      code={etat.code}
      erreur={erreur}
      pied={
        <Bouton type="button" data-commande="terminer-atelier" onClick={onTerminer} disabled={enCours}>
          Terminer l'atelier
        </Bouton>
      }
    >
      <ContenuAjuste cle={`atelier-${question.id}-${rendu ? 'rendu' : 'barres'}`} niveaux={2} plancherEm={0.62}>
        {(niveau) => (
          <>
            <div className="flex shrink-0 items-start justify-between gap-[3vw]">
              <div className="min-w-0">
                <p className="[font-size:max(0.5em,14px)] font-semibold text-vertClair">Atelier · à ton rythme</p>
                <h1 data-texte-principal className="text-[0.95em] leading-tight [overflow-wrap:anywhere]">{question.enonce}</h1>
              </div>
              <a
                href={`/presenter/${etat.session_id}/suivi`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 pt-[0.4vh] font-semibold text-vertClair underline"
                style={{ fontSize: 'max(14px, 1.8vh)' }}
              >
                Suivi des participants
                <span className="sr-only"> (s'ouvre dans un nouvel onglet, réservé au formateur)</span>
              </a>
            </div>

            {rendu ? (
              <div className="flex min-h-0 flex-1 gap-[2.5vw]">
                <div className="flex w-[42%] shrink-0 flex-col justify-center">{barres(true)}</div>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-carte bg-blanc p-[1.4vw] text-bleuViolet" aria-label="Un rendu de la salle">
                  <p className="mb-[0.8vh] shrink-0 text-[0.5em] font-bold text-vertFonce">
                    Un rendu de la salle · sans nom
                    {rendu.etape_titre && <span className="font-normal"> · {rendu.etape_titre}</span>}
                  </p>
                  <p data-texte-principal className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap text-[0.7em] leading-snug [overflow-wrap:anywhere]">
                    {rendu.texte}
                  </p>
                </section>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col justify-center">{barres(niveau >= 1)}</div>
            )}

            <p className="shrink-0 text-[0.7em] font-semibold text-vertClair">
              Chacun avance à son rythme : <span className="text-blanc">{termines} sur {etat.nb_participants}</span> {termines > 1 ? 'ont' : 'a'} déjà terminé.
            </p>
          </>
        )}
      </ContenuAjuste>
    </ZonesEcran>
  )
}
