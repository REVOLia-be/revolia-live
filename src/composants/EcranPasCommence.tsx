import { useEffect } from 'react'
import Bouton from './Bouton'
import MiseEnPageParticipant from './MiseEnPageParticipant'

// Le quiz existe mais le formateur ne l'a pas encore lancé : message aimable, nouvel essai tout seul toutes les 10 secondes.
export const DELAI_NOUVEL_ESSAI_MS = 10_000

// Erreur « Le quiz n'a pas encore commencé » : code P0001 renvoyé par infos_session (code inconnu = P0002).
export const estPasEncoreCommence = (code: string | undefined) => code === 'P0001'

export default function EcranPasCommence({ onReessayer }: { onReessayer: () => void }) {
  useEffect(() => {
    const t = window.setInterval(onReessayer, DELAI_NOUVEL_ESSAI_MS)
    return () => window.clearInterval(t)
  }, [onReessayer])

  return (
    <MiseEnPageParticipant>
      <h1 className="text-3xl">Le quiz n'a pas encore commencé</h1>
      <p className="text-lg">Attends le signal de ton formateur. On réessaie tout seul toutes les 10 secondes : tu peux laisser cet écran ouvert.</p>
      <Bouton type="button" onClick={onReessayer}>
        Réessayer
      </Bouton>
    </MiseEnPageParticipant>
  )
}
