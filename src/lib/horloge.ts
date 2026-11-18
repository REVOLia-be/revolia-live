import { useEffect, useState } from 'react'

// Le serveur envoie des dates avec 6 chiffres après la seconde ; certains navigateurs n'en acceptent que 3.
export function lireDate(texte: string): number {
  return Date.parse(texte.replace(/(\.\d{3})\d+/, '$1'))
}

// Secondes restantes avant `fin`, selon l'horloge du SERVEUR (heure du téléphone + décalage mesuré).
// Renvoie null s'il n'y a pas de fin. Se met à jour 4 fois par seconde.
export function useSecondesRestantes(fin: string | null | undefined, decalage: number): number | null {
  const [, rafraichir] = useState(0)
  useEffect(() => {
    if (!fin) return
    const minuteur = window.setInterval(() => rafraichir((n) => n + 1), 250)
    return () => window.clearInterval(minuteur)
  }, [fin])

  if (!fin) return null
  return Math.max(0, Math.ceil((lireDate(fin) - (Date.now() + decalage)) / 1000))
}
