import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { QuestionCourante, ResultatsQuestion } from '../../lib/session'
import NuageDeMots from './NuageDeMots'

interface Props {
  question: QuestionCourante
  resultats: ResultatsQuestion
  onAction: (fonction: 'basculer_coup_de_coeur' | 'masquer_reponse', idReponse: string) => void
  /** Disposition resserrée (« Pourquoi ? » passé sous les résultats) : le mur de cartes passe sur 3 colonnes. */
  dense?: boolean
}

// Résultats des questions sans bonne réponse : nuage, ouverte, échelle.
export default function ResultatsLibres({ question, resultats, onAction, dense = false }: Props) {
  if (question.type === 'nuage') return <NuageDeMots mots={resultats.mots ?? []} />
  if (question.type === 'echelle') return <BarresEchelle question={question} resultats={resultats} />
  return <MurDeCartes resultats={resultats} onAction={onAction} dense={dense} />
}

// Mur de cartes : texte seul, pas de pseudo. Les deux actions sont réservées au formateur (discrètes).
//
// Le mur tient TOUJOURS dans sa zone (jamais de défilement, jamais de bouton de pilotage poussé hors de l'écran) :
//   1. on essaie d'abord de tout afficher, avec de plus en plus de colonnes et un texte un peu plus petit ;
//   2. si même la disposition la plus serrée ne suffit pas (beaucoup de réponses), on affiche une page de cartes
//      et « + N autres » : le formateur fait défiler les pages (boutons, touches ← / N, télécommande « précédent »).
// La taille du texte du mur est calculée ici, en pixels, à partir de la zone d'ajustement : le mur s'adapte à la place
// qu'on lui laisse, il ne force jamais l'écran à réduire le reste.
const SEUIL_TEXTE_PX = 15
const LARGEUR_EQUIPEE = 1280 // au-delà : 3 colonnes d'office (comme avant)

interface Disposition {
  colonnes: number
  echelle: number
  boutonPx: number
}

function dispositions(dense: boolean): Disposition[] {
  const base = dense || window.innerWidth >= LARGEUR_EQUIPEE ? 3 : 2
  const liste: Disposition[] = [{ colonnes: base, echelle: 1, boutonPx: 44 }]
  if (base < 3) liste.push({ colonnes: 3, echelle: 1, boutonPx: 44 })
  liste.push(
    { colonnes: 4, echelle: 0.9, boutonPx: 36 },
    { colonnes: 5, echelle: 0.82, boutonPx: 34 },
    { colonnes: 6, echelle: 0.75, boutonPx: 32 },
    { colonnes: 7, echelle: 0.7, boutonPx: 30 },
  )
  return liste
}

interface Reglage extends Disposition {
  /** Nombre de cartes par page (Infinity = tout est affiché). */
  parPage: number
  px: number | null
}

function MurDeCartes({ resultats, onAction, dense }: Pick<Props, 'resultats' | 'onAction' | 'dense'>) {
  const reponses = resultats.reponses ?? []
  const total = reponses.length
  const racine = useRef<HTMLDivElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const grille = useRef<HTMLUListElement>(null)
  const [taille, setTaille] = useState({ l: 0, h: 0 })
  const [reglage, setReglage] = useState<Reglage>({ ...dispositions(Boolean(dense))[0], parPage: Infinity, px: null })
  const [page, setPage] = useState(0)
  const signature = reponses.map((r) => r.id).join('|')

  // La zone du mur est mesurée : un changement de taille (autre disposition de l'écran, fenêtre) relance le calcul.
  useEffect(() => {
    const z = zone.current
    if (!z) return
    const o = new ResizeObserver(() => setTaille({ l: Math.round(z.clientWidth), h: Math.round(z.clientHeight) }))
    o.observe(z)
    return () => o.disconnect()
  }, [total > 0])

  useLayoutEffect(() => {
    const r = racine.current
    const z = zone.current
    const g = grille.current
    if (!r || !z || !g || total === 0) return
    const cartes = Array.from(g.children) as HTMLElement[]
    const zoneAjustee = r.closest<HTMLElement>('[data-zone-ajuste]')
    const basePx = parseFloat(getComputedStyle(zoneAjustee ?? document.body).fontSize) || 16

    const appliquer = (d: Disposition) => {
      r.style.fontSize = `${basePx * 0.6 * d.echelle}px`
      r.style.setProperty('--h-bouton', `${d.boutonPx}px`)
      g.style.gridTemplateColumns = `repeat(${d.colonnes}, minmax(0, 1fr))`
      r.classList.toggle('mur-dense', d.colonnes >= 4)
    }
    const montrer = (debut: number, fin: number) => cartes.forEach((c, i) => (c.style.display = i >= debut && i < fin ? 'flex' : 'none'))
    const tient = () => g.getBoundingClientRect().height <= z.clientHeight + 1
    const texteLisible = (d: Disposition) => basePx * 0.6 * d.echelle >= SEUIL_TEXTE_PX
    // Toutes les pages de `n` cartes tiennent-elles ? (les cartes n'ont pas toutes la même hauteur)
    const pagesTiennent = (n: number) => {
      for (let debut = 0; debut < total; debut += n) {
        montrer(debut, debut + n)
        if (!tient()) return false
      }
      return true
    }

    const choix = dispositions(Boolean(dense)).filter(texteLisible)
    const candidates = choix.length > 0 ? choix : [dispositions(Boolean(dense))[0]]
    let retenu: Reglage | null = null
    for (const d of candidates) {
      appliquer(d)
      montrer(0, total)
      if (tient()) {
        retenu = { ...d, parPage: Infinity, px: basePx * 0.6 * d.echelle }
        break
      }
    }
    if (!retenu) {
      // Même la disposition la plus serrée (encore lisible) ne suffit pas : on pagine avec elle.
      const d = candidates[candidates.length - 1]
      appliquer(d)
      let bas = 1
      let haut = total - 1
      while (bas < haut) {
        const milieu = Math.ceil((bas + haut) / 2)
        montrer(0, milieu)
        if (tient()) bas = milieu
        else haut = milieu - 1
      }
      let n = bas
      while (n > 1 && !pagesTiennent(n)) n--
      retenu = { ...d, parPage: n, px: basePx * 0.6 * d.echelle }
    }
    appliquer(retenu)
    cartes.forEach((c) => (c.style.display = '')) // l'affichage final est piloté par React (page courante)
    setReglage((a) => (a.colonnes === retenu!.colonnes && a.echelle === retenu!.echelle && a.parPage === retenu!.parPage && a.px === retenu!.px ? a : retenu!))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, taille.l, taille.h, dense])

  const parPage = reglage.parPage
  const nbPages = Number.isFinite(parPage) ? Math.ceil(total / parPage) : 1
  const pageCourante = Math.min(page, Math.max(0, nbPages - 1))
  const debut = Number.isFinite(parPage) ? pageCourante * parPage : 0
  const fin = Number.isFinite(parPage) ? Math.min(total, debut + parPage) : total

  // Défilement par le formateur : touches ← / N et télécommande « précédent » (voir la page présentateur).
  const aller = useCallback(
    (delta: number) => setPage((p) => (nbPages > 1 ? (Math.min(p, nbPages - 1) + delta + nbPages) % nbPages : 0)),
    [nbPages],
  )
  useEffect(() => {
    const ecouteur = (e: Event) => aller((e as CustomEvent<number>).detail)
    window.addEventListener('mur-page', ecouteur)
    return () => window.removeEventListener('mur-page', ecouteur)
  }, [aller])

  if (total === 0) return <p className="text-vertClair">Aucune réponse cette fois.</p>

  const personnes = resultats.nb_participants_ayant_repondu
  return (
    <div ref={racine} className={`flex min-h-0 flex-1 flex-col gap-[1vh] ${reglage.colonnes >= 4 ? 'mur-dense' : ''}`} style={reglage.px ? { fontSize: reglage.px } : { fontSize: '0.6em' }}>
      <p className="shrink-0 [font-size:max(0.8em,14px)] text-vertClair">
        Clique sur ♡ pour mettre une réponse à l'honneur au bilan
        {personnes !== undefined && (
          <>
            {' · '}
            {personnes} personne{personnes > 1 ? 's' : ''} · {total} réponse{total > 1 ? 's' : ''}
          </>
        )}
      </p>
      <div ref={zone} data-ignorer-debordement className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ul
          ref={grille}
          data-mur-cartes
          className="my-auto grid gap-[1.2vh]"
          style={{ gridTemplateColumns: `repeat(${reglage.colonnes}, minmax(0, 1fr))`, ['--h-bouton' as string]: `${reglage.boutonPx}px` }}
        >
          {reponses.map((r, i) => (
            <li
              key={r.id}
              hidden={i < debut || i >= fin}
              className={`animation-apparition flex flex-col justify-between gap-[0.8vh] rounded-carte border-2 p-[0.9vw] [&[hidden]]:hidden ${
                r.coup_de_coeur ? 'border-vertClair bg-blanc text-bleuViolet' : 'border-blanc'
              }`}
            >
              <p data-texte-principal className="[overflow-wrap:anywhere]">{r.texte}</p>
              <div className="flex items-center justify-end gap-[0.8vw] text-[0.8em]">
                <button
                  type="button"
                  onClick={() => onAction('basculer_coup_de_coeur', r.id)}
                  aria-pressed={r.coup_de_coeur}
                  aria-label={r.coup_de_coeur ? 'Retirer le coup de cœur' : 'Coup de cœur'}
                  className="min-h-[var(--h-bouton)] whitespace-nowrap rounded-pilule border-2 border-current px-3 font-semibold"
                >
                  <span className="[.mur-dense_&]:hidden">{r.coup_de_coeur ? '♥ Coup de cœur' : '♡ Coup de cœur'}</span>
                  <span aria-hidden className="hidden [.mur-dense_&]:inline">{r.coup_de_coeur ? '♥' : '♡'}</span>
                </button>
                <button type="button" onClick={() => onAction('masquer_reponse', r.id)} className="min-h-[var(--h-bouton)] whitespace-nowrap px-2 font-semibold underline">
                  Masquer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {nbPages > 1 && (
        <div data-mur-pages={nbPages} className="flex shrink-0 flex-wrap items-center justify-between gap-x-[2vw] gap-y-[0.5vh] [font-size:max(0.85em,15px)]">
          <p role="status" className="font-semibold">
            Réponses {debut + 1} à {fin} sur {total} · <span data-testid="mur-autres">+ {total - (fin - debut)} autres</span>
          </p>
          <div className="flex items-center gap-[1vw]">
            <span className="text-vertClair">Page {pageCourante + 1} / {nbPages} · touches ← et N</span>
            <button type="button" onClick={() => aller(-1)} className="min-h-[36px] rounded-pilule border-2 border-current px-3 font-semibold" aria-label="Page précédente du mur">
              ← Précédentes
            </button>
            <button type="button" onClick={() => aller(1)} className="min-h-[36px] rounded-pilule border-2 border-current px-3 font-semibold" aria-label="Page suivante du mur">
              Suivantes →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 5 barres verticales animées + moyenne en grand.
function BarresEchelle({ question, resultats }: Pick<Props, 'question' | 'resultats'>) {
  const [affiche, setAffiche] = useState(false)
  useEffect(() => {
    const minuteur = window.setTimeout(() => setAffiche(true), 100)
    return () => window.clearTimeout(minuteur)
  }, [])

  const repartition = resultats.repartition ?? [0, 0, 0, 0, 0]
  const maximum = Math.max(1, ...repartition)

  return (
    <div className="flex items-end justify-center gap-[5vw]">
      <div className="flex flex-1 flex-col gap-[1vh]">
        <div className="flex h-[6em] items-end gap-[1.5vw]">
          {repartition.map((nombre, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-[0.5vh]">
              <span className="tabular-nums text-[0.8em] font-semibold">{nombre}</span>
              <div
                className="w-full rounded-t-carte bg-blanc transition-[height] duration-1000 ease-out"
                style={{ height: affiche ? `${(nombre / maximum) * 85}%` : '0%', minHeight: nombre > 0 ? '0.5vh' : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-[1.5vw] border-t-2 border-blanc pt-[0.5vh]">
          {repartition.map((_, i) => (
            <span key={i} className="flex-1 text-center font-bold">
              {i + 1}
            </span>
          ))}
        </div>
        <div className="flex justify-between gap-[2vw] [font-size:max(0.5em,14px)] text-vertClair">
          <span>{question.libelle_min}</span>
          <span className="text-right">{question.libelle_max}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[0.6em] text-vertClair">Moyenne</p>
        <p className="font-titre text-[3.2em] font-normal leading-none tabular-nums">
          {resultats.moyenne == null ? '–' : String(resultats.moyenne).replace('.', ',')}
        </p>
        <p className="text-[0.6em]">sur 5</p>
      </div>
    </div>
  )
}
