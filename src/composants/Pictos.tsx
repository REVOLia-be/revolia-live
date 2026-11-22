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

export function Fichier({ taille = 24, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

export function Telecharger({ taille = 24, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2.4} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </svg>
  )
}

export function LienExterne({ taille = 24, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2.2} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

export function Aide({ taille = 24, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2.2} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8M12 17h.01" />
    </svg>
  )
}

export function FlecheGauche({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2.6} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  )
}

export function Ecran({ taille = 24, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" strokeWidth={2.2} className={`block shrink-0 ${className ?? ''}`} {...BASE}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}
