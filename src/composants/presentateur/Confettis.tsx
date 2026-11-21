import { useMemo } from 'react'

// Confettis en CSS pur : des petits symboles qui tombent, positions tirées une seule fois.
// (Vert clair uniquement en texte, jamais en fond.)
export default function Confettis() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => ({
        gauche: Math.random() * 100,
        duree: 3 + Math.random() * 3,
        delai: Math.random() * 2,
        taille: 1 + Math.random() * 1.5,
        symbole: ['●', '■', '▲', '★'][i % 4],
        couleur: i % 2 === 0 ? 'text-blanc' : 'text-vertClair',
      })),
    [],
  )
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`animation-confetti absolute top-0 ${p.couleur}`}
          style={{
            left: `${p.gauche}%`,
            fontSize: `${p.taille}rem`,
            animationDuration: `${p.duree}s`,
            animationDelay: `${p.delai}s`,
          }}
        >
          {p.symbole}
        </span>
      ))}
    </div>
  )
}
