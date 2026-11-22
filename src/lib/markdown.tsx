import type { ReactNode } from 'react'

// Petit convertisseur Markdown sûr : produit des éléments React, jamais de HTML brut.
// Gère : paragraphes, listes à puces (- ou *), listes numérotées, **gras**, *italique*, liens https://.
// Tout le reste (balises, images, liens http:// ou javascript:) reste du simple texte.

const MOTIF = /(\*\*[^*]+?\*\*|\*[^*\s][^*]*?\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g

function enLigne(texte: string, cle: string): ReactNode[] {
  const morceaux = texte.split(MOTIF)
  return morceaux
    .filter((m) => m !== '')
    .map((m, i) => {
      const k = `${cle}-${i}`
      if (m.startsWith('**') && m.endsWith('**') && m.length > 4) return <strong key={k}>{enLigne(m.slice(2, -2), k)}</strong>
      if (m.startsWith('*') && m.endsWith('*') && m.length > 2 && !m.startsWith('**')) return <em key={k}>{enLigne(m.slice(1, -1), k)}</em>
      const lien = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(m)
      if (lien) {
        return (
          <a key={k} href={lien[2]} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            {lien[1]}
          </a>
        )
      }
      return <span key={k}>{m}</span>
    })
}

type Bloc = { genre: 'p'; lignes: string[] } | { genre: 'ul' | 'ol'; elements: string[] }

function decouper(source: string): Bloc[] {
  const blocs: Bloc[] = []
  let courant: Bloc | null = null
  for (const brute of source.replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = brute.trimEnd()
    if (!ligne.trim()) {
      courant = null
      continue
    }
    const puce = /^\s*[-*]\s+(.*)$/.exec(ligne)
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(ligne)
    if (puce) {
      if (!courant || courant.genre !== 'ul') blocs.push((courant = { genre: 'ul', elements: [] }))
      courant.elements.push(puce[1])
    } else if (num) {
      if (!courant || courant.genre !== 'ol') blocs.push((courant = { genre: 'ol', elements: [] }))
      courant.elements.push(num[1])
    } else {
      if (!courant || courant.genre !== 'p') blocs.push((courant = { genre: 'p', lignes: [] }))
      courant.lignes.push(ligne.trim())
    }
  }
  return blocs
}

export default function Markdown({ texte, className = '' }: { texte: string; className?: string }) {
  const blocs = decouper(texte)
  if (blocs.length === 0) return null
  return (
    <div className={`flex flex-col gap-3 [overflow-wrap:anywhere] ${className}`}>
      {blocs.map((b, i) => {
        if (b.genre === 'p') {
          return (
            <p key={i}>
              {b.lignes.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {enLigne(l, `${i}-${j}`)}
                </span>
              ))}
            </p>
          )
        }
        const Liste = b.genre === 'ul' ? 'ul' : 'ol'
        return (
          <Liste key={i} className={`flex flex-col gap-1.5 pl-6 ${b.genre === 'ul' ? 'list-disc marker:text-vert' : 'list-decimal marker:font-semibold'}`}>
            {b.elements.map((e, j) => (
              <li key={j}>{enLigne(e, `${i}-${j}`)}</li>
            ))}
          </Liste>
        )
      })}
    </div>
  )
}
