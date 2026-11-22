import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// Ajuste le contenu de l'écran projeté à la place disponible : jamais de défilement, jamais de texte coupé.
//
// Principe (tout le texte de l'écran est en « em », donc une seule valeur de police suffit) :
//   1. on essaie la taille normale ;
//   2. sinon on réduit la police du conteneur (recherche dichotomique) jusqu'à ce que tout tienne,
//      sans descendre sous le plancher de lisibilité (16 px pour le texte le plus petit qui compte) ;
//   3. si même le plancher ne suffit pas, on passe à la disposition suivante (niveau 1, 2…) fournie
//      par l'écran (ex. « Pourquoi ? » sous les résultats au lieu d'à côté) et on recommence ;
//   4. en tout dernier recours (dernière disposition), on descend sous le plancher plutôt que de déborder.
// Le calcul se refait à chaque affichage, au redimensionnement de la fenêtre et quand les polices sont chargées.

interface Props {
  /** Change quand le contenu change de nature (autre question, autre état) : on repart de la disposition 0. */
  cle: string
  /** Nombre de dispositions possibles (niveau 0 = la plus aérée). */
  niveaux?: number
  /** Taille, en em du conteneur, du texte le plus petit qui doit rester lisible (ex. 0,6 pour les propositions). */
  plancherEm: number
  /** Plancher de lisibilité en pixels. */
  plancherPx?: number
  /** Classes de la zone (par défaut : elle prend toute la hauteur restante). */
  className?: string
  children: (niveau: number) => ReactNode
}

const ECHELLE_MINI_ABSOLUE = 0.25
// Tolérance (px) sur les blocs de texte : l'interligne serré fait dépasser le dessin des lettres de 1 à 3 px sans rien couper.
const TOLERANCE_TEXTE = 4

// Vrai si le contenu dépasse sa zone, ou si un de ses blocs dépasse de sa propre boîte.
function deborde(zone: HTMLElement, contenu: HTMLElement): boolean {
  if (contenu.scrollHeight > zone.clientHeight + 2 || contenu.scrollWidth > zone.clientWidth + 2) return true
  const blocs = contenu.querySelectorAll<HTMLElement>('*')
  for (let i = 0; i < blocs.length; i++) {
    const b = blocs[i]
    if (b.clientHeight > 0 && b.scrollHeight > b.clientHeight + TOLERANCE_TEXTE) return true
    if (b.clientWidth > 0 && b.scrollWidth > b.clientWidth + TOLERANCE_TEXTE) return true
  }
  return false
}

export default function ContenuAjuste({ cle, niveaux = 1, plancherEm, plancherPx = 16, className = 'min-h-0 flex-1', children }: Props) {
  const zone = useRef<HTMLDivElement>(null)
  const contenu = useRef<HTMLDivElement>(null)
  const [version, setVersion] = useState(0)
  const cleComplete = `${cle}|${version}`
  const [etat, setEtat] = useState({ cle: '', niveau: 0 })
  // Nouvelle clé (ou redimensionnement) : on repart de la disposition 0.
  const niveau = etat.cle === cleComplete ? etat.niveau : 0

  // Redimensionnement (fenêtre, projecteur branché) et chargement des polices : on recalcule.
  useEffect(() => {
    const z = zone.current
    if (!z) return
    const recalculer = () => setVersion((v) => v + 1)
    const observateur = new ResizeObserver(recalculer)
    observateur.observe(z)
    window.addEventListener('resize', recalculer)
    void document.fonts?.ready.then(recalculer)
    return () => {
      observateur.disconnect()
      window.removeEventListener('resize', recalculer)
    }
  }, [])

  // Sans liste de dépendances : le contenu change sans cesse (compteur, réponses) et la mesure est peu coûteuse.
  useLayoutEffect(() => {
    const z = zone.current
    const c = contenu.current
    if (!z || !c) return
    const police = (e: number) => {
      c.style.fontSize = `${e}em`
    }
    const tient = () => !deborde(z, c)
    const base = parseFloat(getComputedStyle(z).fontSize) || 16
    const plancher = Math.min(1, plancherPx / (base * plancherEm))

    police(1)
    if (tient()) return

    police(plancher)
    if (!tient()) {
      if (niveau < niveaux - 1) {
        setEtat({ cle: cleComplete, niveau: niveau + 1 })
        return
      }
      // Dernier recours : sous le plancher, mais sans déborder.
      let tientBas = ECHELLE_MINI_ABSOLUE
      let nePasTientHaut = plancher
      police(tientBas)
      for (let i = 0; i < 10; i++) {
        const milieu = (tientBas + nePasTientHaut) / 2
        police(milieu)
        if (tient()) tientBas = milieu
        else nePasTientHaut = milieu
      }
      police(tientBas)
      return
    }

    // Le plancher tient, 1 ne tient pas : on cherche la plus grande taille qui tient.
    let tientBas = plancher
    let nePasTientHaut = 1
    for (let i = 0; i < 10; i++) {
      const milieu = (tientBas + nePasTientHaut) / 2
      police(milieu)
      if (tient()) tientBas = milieu
      else nePasTientHaut = milieu
    }
    police(tientBas)
  })

  return (
    <div ref={zone} className={`relative overflow-hidden ${className}`}>
      <div ref={contenu} className="flex h-full flex-col gap-[2vh]">
        {children(niveau)}
      </div>
    </div>
  )
}
