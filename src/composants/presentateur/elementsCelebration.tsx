import type { CSSProperties } from 'react'

// Briques communes aux célébrations de l'écran projeté.

/** Vrai si l'ordinateur demande de réduire les animations. */
export function mouvementReduit(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// « Une seule fois » : on retient dans l'onglet ce qui a déjà été joué (un rechargement de la page ne rejoue pas).
const dejaJoues = new Set<string>()
export function dejaJoue(cle: string): boolean {
  if (dejaJoues.has(cle)) return true
  try {
    return sessionStorage.getItem(`revolia-live:celebre:${cle}`) === '1'
  } catch {
    return false
  }
}
export function marquerJoue(cle: string) {
  dejaJoues.add(cle)
  try {
    sessionStorage.setItem(`revolia-live:celebre:${cle}`, '1')
  } catch {
    /* sans stockage : on se contente de la mémoire de la page */
  }
}

/** Étoile à quatre branches, dessinée en vectoriel (signature visuelle des célébrations). */
export function Etincelle({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} style={style}>
      <path d="M12 0.5c.7 6.4 4.9 10.8 11.5 11.5-6.6.7-10.8 5.1-11.5 11.5C11.3 17.1 7.1 12.7.5 12 7.1 11.3 11.3 6.9 12 .5z" />
    </svg>
  )
}

/** Typographie cinétique : chaque mot monte derrière un masque, l'un après l'autre. */
export function TexteCinetique({ texte, delaiMs, pasMs = 150 }: { texte: string; delaiMs: number; pasMs?: number }) {
  const mots = texte.trim().split(/\s+/)
  return (
    <span className="celeb-texte block text-balance font-titre font-normal [overflow-wrap:anywhere]" style={{ lineHeight: 1.1 }}>
      {mots.map((m, i) => (
        <span key={i}>
          <span className="celeb-masque">
            <span className="celeb-mot" style={{ animationDelay: `${delaiMs + i * pasMs}ms` }}>
              {m}
            </span>
          </span>
          {i < mots.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}

/** Taille du grand texte selon sa longueur : le message du formateur n'est pas toujours court. */
export function tailleGrandTexte(texte: string): string {
  const n = texte.trim().length
  if (n <= 22) return 'min(13vh, 8.4vw)'
  if (n <= 45) return 'min(10vh, 6.4vw)'
  if (n <= 90) return 'min(7.6vh, 4.8vw)'
  return 'min(5.6vh, 3.6vw)'
}
