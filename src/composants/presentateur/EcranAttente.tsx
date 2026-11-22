import { useLayoutEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Bouton from '../Bouton'
import ZonesEcran from './ZonesEcran'
import ContenuAjuste from './ContenuAjuste'
import type { EtatSession, ParticipantListe } from '../../lib/session'

interface Props {
  etat: EtatSession
  participants: ParticipantListe[]
  enCours: boolean
  erreur: string | null
  onPremiereQuestion: () => void
  onExclure: (participant: ParticipantListe) => void
}

// Plus la salle se remplit, plus les pastilles rétrécissent ; au-delà du dernier palier,
// on ne montre que les plus récentes. Le nombre affiché est calculé pour TOUJOURS tenir
// dans la zone (1366×768 compris) : la liste ne peut donc pas déborder sur le bouton.
const PALIERS = [
  { jusqua: 24, taille: 2.6, maximum: 24 },
  { jusqua: 48, taille: 2.1, maximum: 48 },
  { jusqua: 70, taille: 1.75, maximum: 70 },
  { jusqua: Infinity, taille: 1.45, maximum: 70 },
]

// Écran d'attente en zones fixes : en-tête / zone principale (2 colonnes) / pied de page.
// Aucune position absolue sur le bouton : chaque zone a sa place dans la grille.
export default function EcranAttente({ etat, participants, enCours, erreur, onPremiereQuestion, onExclure }: Props) {
  const lien = `${window.location.origin}/rejoindre/${etat.code}`
  const n = etat.nb_participants
  const palier = PALIERS.find((p) => Math.max(n, participants.length) <= p.jusqua) ?? PALIERS[PALIERS.length - 1]
  const total = Math.max(n, participants.length)

  // Garde-fou : si des pseudos très longs font déborder la zone, on retire les plus anciens
  // jusqu'à ce que tout tienne. La liste ne dépasse donc jamais sa zone, quel que soit le contenu.
  const [limite, setLimite] = useState(palier.maximum)
  const zone = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => setLimite(palier.maximum), [palier.maximum, participants.length])
  useLayoutEffect(() => {
    const z = zone.current
    if (z && z.scrollHeight > z.clientHeight + 1 && limite > 1) setLimite((l) => Math.max(1, l - Math.max(1, Math.ceil(l * 0.1))))
  }, [limite, participants, palier.taille])
  // Redimensionnement de la fenêtre (ou vidéoprojecteur branché) : on réessaie depuis le maximum.
  useLayoutEffect(() => {
    const relancer = () => setLimite(palier.maximum)
    window.addEventListener('resize', relancer)
    return () => window.removeEventListener('resize', relancer)
  }, [palier.maximum])

  const affiches = participants.slice(-limite) // les plus récents
  const masques = total - affiches.length

  return (
    <ZonesEcran
      erreur={erreur}
      pied={
        <>
        <Bouton type="button" data-commande="suivant" onClick={onPremiereQuestion} disabled={enCours}>
          Première question
        </Bouton>
        </>
      }
    >
     <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-[2vh]">
      {/* En-tête : titre du quiz */}
      <header className="min-w-0">
        {/* Titre long : la police se réduit pour que tout le titre reste visible (jamais coupé). */}
        <ContenuAjuste cle={`titre-${etat.titre}`} plancherEm={0.85} className="max-h-[20vh]">
          {() => <h1 data-texte-principal className="text-[0.85em] leading-tight [overflow-wrap:anywhere]">{etat.titre}</h1>}
        </ContenuAjuste>
      </header>

      {/* Zone principale : deux colonnes de même largeur */}
      <div className="grid min-h-0 grid-cols-2 gap-[4vw]">
        <section className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-[1.5vh]">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="aspect-square h-full max-w-full rounded-carte bg-blanc p-[1.5vh]">
              <QRCodeSVG value={lien} size={320} bgColor="var(--couleur-blanc)" fgColor="var(--couleur-bleu-violet)" className="h-full w-full" />
            </div>
          </div>
          <div className="shrink-0 text-center">
            <p className="text-[0.45em] font-semibold leading-tight">Scanne le QR code, ou va sur</p>
            <p className="text-[0.7em] font-semibold leading-tight text-vertClair">{window.location.host}</p>
            <p className="text-[0.45em] font-semibold leading-tight">et tape le code</p>
            <p className="font-titre text-[1.5em] font-normal leading-none tracking-[0.2em] text-vertClair">{etat.code}</p>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-[1.5vh]">
          <div className="shrink-0">
            {n === 0 ? (
              <p className="text-[0.7em] font-semibold">En attente des premiers participants…</p>
            ) : (
              <p className="flex items-baseline gap-[1.2vw]">
                <span className="font-titre text-[1.7em] font-normal leading-none text-vertClair tabular-nums">{n}</span>
                <span className="text-[0.6em] font-semibold">participant{n > 1 ? 's' : ''} dans la salle</span>
              </p>
            )}
          </div>
          {/* Hauteur bornée par la grille ; overflow-hidden en dernier garde-fou */}
          <div ref={zone} className="min-h-0 flex-1 overflow-hidden">
            <ul className="flex flex-wrap content-start gap-[0.8vh] p-[0.6vh]" style={{ fontSize: `max(11px, ${palier.taille}vh)` }}>
              {affiches.map((p) => (
                <li key={p.id} className="group relative max-w-full truncate rounded-pilule border-2 border-vertClair px-[0.7em] py-[0.1em] leading-snug">
                  {p.pseudo}
                  {/* Petite croix visible au survol : retirer un pseudo déplacé */}
                  <button
                    type="button"
                    onClick={() => onExclure(p)}
                    aria-label={`Exclure ${p.pseudo}`}
                    className="absolute right-0 top-0 hidden h-[1.4em] w-[1.4em] items-center justify-center rounded-pilule bg-blanc font-bold leading-none text-bleuViolet group-hover:flex focus:flex"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {masques > 0 && (
            <p className="shrink-0 text-[0.5em] font-semibold text-vertClair">
              + {masques} autre{masques > 1 ? 's' : ''}
            </p>
          )}
        </section>
      </div>

    </div>
    </ZonesEcran>
  )
}
