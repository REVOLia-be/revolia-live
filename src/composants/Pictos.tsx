// Pictogrammes simples (SVG en ligne, aucune bibliothèque). Toujours décoratifs : le sens est dans le texte voisin.
interface Props {
  taille?: number
  trace?: boolean // la coche se trace une fois à l'apparition (désactivé si « moins d'animations »)
  className?: string
}

const BASE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function Coche({ taille = 24, trace = false, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={3.4} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <path d="M5 12.5l4.5 4.5L19 7.5" className={trace ? 'coche-tracee' : undefined} />
    </svg>
  )
}

export function Ampoule({ taille = 24, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  )
}

export function Fleche({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2.6} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function Personne({ taille = 14, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2.6} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  )
}
