import { useEffect, useRef, useState } from 'react'
import Markdown from '../../lib/markdown'
import { Coche, Fichier, LienExterne, Telecharger } from '../Pictos'
import {
  formaterTaille,
  lienChatGpt,
  lienClaude,
  typeFichier,
  urlFichier,
  type EtapeAtelier,
  type PromptAtelier,
} from '../../lib/atelier'

// Copie dans le presse-papiers ; repli pour les navigateurs qui refusent l'API moderne.
async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte)
    return true
  } catch {
    try {
      const zone = document.createElement('textarea')
      zone.value = texte
      zone.setAttribute('readonly', '')
      zone.style.position = 'fixed'
      zone.style.opacity = '0'
      document.body.appendChild(zone)
      zone.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(zone)
      return ok
    } catch {
      return false
    }
  }
}

const LIEN_BOUTON =
  'flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-pilule border-2 border-vert bg-blanc px-3 py-2 text-center text-base font-semibold leading-tight text-vert transition-colors hover:bg-vert hover:text-blanc'

function CartePrompt({ prompt, indice, total }: { prompt: PromptAtelier; indice: number; total: number }) {
  const [copie, setCopie] = useState(false)
  const [echec, setEchec] = useState(false)
  const minuteur = useRef<number>()
  useEffect(() => () => window.clearTimeout(minuteur.current), [])

  async function auClic() {
    const ok = await copier(prompt.texte)
    setCopie(ok)
    setEchec(!ok)
    window.clearTimeout(minuteur.current)
    minuteur.current = window.setTimeout(() => {
      setCopie(false)
      setEchec(false)
    }, 2500)
  }

  return (
    <section className="flex flex-col gap-3 rounded-carte border-2 border-vert p-4" aria-label={`Prompt ${indice + 1} : ${prompt.titre}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-texte text-base font-bold leading-snug">
          Prompt {indice + 1} · {prompt.titre}
        </h3>
        {total > 1 && <span className="shrink-0 text-sm text-discret">{indice + 1} sur {total}</span>}
      </div>
      <p className="whitespace-pre-wrap rounded-champ bg-doux p-3 text-base leading-relaxed [overflow-wrap:anywhere]">{prompt.texte}</p>
      <button
        type="button"
        onClick={() => void auClic()}
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-pilule bg-vertFonce px-6 text-lg font-semibold text-blanc transition-colors hover:bg-vert"
      >
        {copie && <Coche taille={22} />}
        {copie ? 'Copié' : 'Copier'}
        {copie && <span aria-hidden>✓</span>}
      </button>
      <p role="status" className={`-mt-1 text-sm font-semibold ${echec ? '' : 'sr-only'}`}>
        {copie ? 'Le prompt est copié.' : echec ? 'La copie n\'a pas marché : sélectionne le texte du prompt et copie-le à la main.' : ''}
      </p>
      <div className="flex gap-2">
        <a href={lienChatGpt(prompt.texte)} target="_blank" rel="noopener noreferrer" className={LIEN_BOUTON}>
          <LienExterne taille={20} />
          Ouvrir dans ChatGPT
        </a>
        <a href={lienClaude(prompt.texte)} target="_blank" rel="noopener noreferrer" className={LIEN_BOUTON}>
          <LienExterne taille={20} />
          Ouvrir dans Claude
        </a>
      </div>
    </section>
  )
}

// Contenu d'une étape (consigne, fichiers, liens, prompts). Partagé entre le téléphone et l'aperçu de l'éditeur.
export default function ContenuEtape({ etape }: { etape: Pick<EtapeAtelier, 'titre' | 'consigne' | 'fichiers' | 'liens' | 'prompts'> }) {
  const materiel = etape.fichiers.length > 0 || etape.liens.length > 0
  return (
    <div className="flex flex-col gap-5">
      {etape.consigne.trim() && <Markdown texte={etape.consigne} className="text-lg leading-relaxed" />}

      {materiel && (
        <section className="flex flex-col gap-3" aria-label="Pour cette étape">
          <h2 className="font-texte text-sm font-bold uppercase tracking-wide text-discret">Pour cette étape</h2>
          {etape.fichiers.map((f) => (
            <a
              key={f.chemin}
              href={urlFichier(f.chemin)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[72px] items-center gap-3 rounded-carte border-2 border-vertClair/70 p-3"
              aria-label={`Télécharger ${f.nom} (${typeFichier(f.nom)}, ${formaterTaille(f.taille)}), s'ouvre dans un nouvel onglet`}
            >
              <Fichier taille={28} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{f.nom}</span>
                <span className="block text-sm text-discret">
                  {typeFichier(f.nom)} · {formaterTaille(f.taille)}
                </span>
              </span>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pilule bg-vert text-blanc">
                <Telecharger taille={24} />
              </span>
            </a>
          ))}
          {etape.liens.map((l, i) => (
            <a
              key={`${l.url}-${i}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[72px] items-center gap-3 rounded-carte border-2 border-vertClair/70 p-3"
              aria-label={`${l.libelle}, lien, s'ouvre dans un nouvel onglet`}
            >
              <LienExterne taille={28} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{l.libelle}</span>
                <span className="block text-sm text-discret">Lien · nouvel onglet</span>
              </span>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pilule border-2 border-vert text-vert">
                <LienExterne taille={22} />
              </span>
            </a>
          ))}
        </section>
      )}

      {etape.prompts.length > 0 && (
        <div className="flex flex-col gap-4">
          {etape.prompts.map((p, i) => (
            <CartePrompt key={i} prompt={p} indice={i} total={etape.prompts.length} />
          ))}
        </div>
      )}
    </div>
  )
}
