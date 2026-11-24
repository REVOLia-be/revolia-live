import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'
import Bouton from '../Bouton'
import Carte from '../Carte'
import { CODE_MAX, CODE_MIN, codeValide, normaliserCode } from './modele'

// Adresse que le QR code ouvre : toujours la session ACTUELLE de ce code.
export const lienRejoindre = (code: string) => `${window.location.origin}/rejoindre/${code}`

const lireCouleur = (nom: string, repli: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim()
  return v || repli
}

function chargerImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// PNG haute définition à imprimer : logo, QR code, code écrit en dessous.
async function fabriquerPng(code: string, canvasQr: HTMLCanvasElement): Promise<Blob | null> {
  const L = 2000
  const H = 2500
  const fond = lireCouleur('--couleur-blanc', '#ffffff')
  const encre = lireCouleur('--couleur-vert-fonce', '#004d3d')
  const accent = lireCouleur('--couleur-vert', '#00824d')
  const c = document.createElement('canvas')
  c.width = L
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = fond
  ctx.fillRect(0, 0, L, H)

  // Logo (facultatif : s'il ne charge pas, on s'en passe)
  const logo = await chargerImage('/marque/logo-vert-vif.svg')
  let y = 140
  if (logo) {
    const lh = 190
    const lw = (logo.naturalWidth / logo.naturalHeight) * lh
    ctx.drawImage(logo, (L - lw) / 2, y, lw, lh)
    y += lh + 100
  }

  const cote = 1500
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvasQr, (L - cote) / 2, y, cote, cote)
  y += cote + 130

  try {
    await document.fonts.load('700 220px Poppins')
  } catch {
    // police indisponible : repli du navigateur
  }
  ctx.fillStyle = encre
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '700 240px Poppins, system-ui, sans-serif'
  // espacement des lettres : un caractère à la fois
  const espace = 40
  const lettres = [...code]
  const largeurs = lettres.map((l) => ctx.measureText(l).width)
  const total = largeurs.reduce((a, b) => a + b, 0) + espace * (lettres.length - 1)
  ctx.textAlign = 'left'
  let x = (L - total) / 2
  lettres.forEach((l, i) => {
    ctx.fillText(l, x, y + 180)
    x += largeurs[i] + espace
  })
  ctx.fillStyle = accent
  ctx.textAlign = 'center'
  ctx.font = '600 76px Poppins, system-ui, sans-serif'
  ctx.fillText(lienRejoindre(code).replace(/^https?:\/\//, ''), L / 2, y + 330)

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'))
}

// Bloc « Code permanent » de l'éditeur : code en grand, QR code, champ de modification, téléchargement, lien.
export default function PanneauCode({
  codeEnBase,
  saisie,
  onChange,
  erreur,
}: {
  /** Code actuellement enregistré (celui que le QR code ouvre). Vide si le quiz n'en a pas encore. */
  codeEnBase: string
  saisie: string
  onChange: (code: string) => void
  erreur?: string
}) {
  const [copie, setCopie] = useState(false)
  const [probleme, setProbleme] = useState<string | null>(null)
  const refQr = useRef<HTMLDivElement>(null)
  const modifie = saisie !== codeEnBase

  useEffect(() => {
    if (!copie) return
    const t = window.setTimeout(() => setCopie(false), 2500)
    return () => window.clearTimeout(t)
  }, [copie])

  async function copier() {
    setProbleme(null)
    try {
      await navigator.clipboard.writeText(lienRejoindre(codeEnBase))
      setCopie(true)
    } catch {
      setProbleme(`Impossible de copier automatiquement. Copie le lien à la main : ${lienRejoindre(codeEnBase)}`)
    }
  }

  async function telecharger() {
    setProbleme(null)
    const canvas = refQr.current?.querySelector('canvas')
    if (!canvas) return
    try {
      const blob = await fabriquerPng(codeEnBase, canvas)
      if (!blob) throw new Error('png')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-code-${codeEnBase}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      setProbleme("Le QR code n'a pas pu être téléchargé. Réessaie dans un instant.")
    }
  }

  return (
    <Carte className="flex flex-col gap-4" aria-labelledby="titre-code">
      <div>
        <h2 id="titre-code" className="text-2xl">
          Code permanent
        </h2>
        <p className="text-base">
          Ce code et ce QR code ne changent jamais : tu peux les imprimer sur tes supports. Ils ouvrent toujours la dernière session lancée de ce quiz.
        </p>
      </div>

      {codeEnBase ? (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="shrink-0 rounded-champ border-2 border-vert bg-blanc p-3" ref={refQr}>
            <QRCodeSVG value={lienRejoindre(codeEnBase)} size={160} level="M" fgColor="var(--couleur-vert-fonce)" bgColor="var(--couleur-blanc)" aria-label={`QR code pour rejoindre avec le code ${codeEnBase}`} />
            {/* Copie haute définition, jamais affichée : sert au téléchargement */}
            <div className="hidden">
              <QRCodeCanvas value={lienRejoindre(codeEnBase)} size={1000} level="M" marginSize={0} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-base">Code à saisir</p>
            <p data-testid="code-quiz" className="break-all font-titre text-5xl tracking-[0.12em] text-vertFonce">
              {codeEnBase}
            </p>
            <p className="mt-1 break-all text-sm">{lienRejoindre(codeEnBase)}</p>
          </div>
        </div>
      ) : (
        <p className="text-base font-semibold">Ce quiz n'a pas encore de code. Enregistre-le pour en obtenir un.</p>
      )}

      <div>
        <label className="mb-1 block text-base font-semibold" htmlFor="code-quiz">
          Changer le code
        </label>
        <p id="aide-code" className="mb-1 text-sm">
          {CODE_MIN} à {CODE_MAX} caractères : lettres sans accent et chiffres (ex. IABASES). Les minuscules deviennent des majuscules.
        </p>
        <input
          id="code-quiz"
          value={saisie}
          onChange={(e) => onChange(normaliserCode(e.target.value))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={CODE_MAX + 10}
          aria-describedby="aide-code"
          aria-invalid={Boolean(erreur) || (saisie !== '' && !codeValide(saisie))}
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-xl uppercase tracking-widest text-vertFonce placeholder:text-discret sm:w-72"
          placeholder="IABASES"
        />
        {erreur && (
          <p role="alert" className="mt-1 text-base font-semibold">
            {erreur}
          </p>
        )}
        {modifie && !erreur && <p className="mt-1 text-base">Le nouveau code sera actif après l'enregistrement. Pense à réimprimer le QR code.</p>}
      </div>

      {codeEnBase && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Bouton type="button" variante="secondaire" className="sm:w-auto" onClick={() => void telecharger()} disabled={modifie}>
            Télécharger le QR code
          </Bouton>
          <Bouton type="button" variante="secondaire" className="sm:w-auto" onClick={() => void copier()} disabled={modifie}>
            {copie ? 'Lien copié ✓' : 'Copier le lien'}
          </Bouton>
        </div>
      )}
      {codeEnBase && modifie && <p className="-mt-2 text-sm">Enregistre le nouveau code avant de télécharger le QR code ou de copier le lien.</p>}
      {probleme && (
        <p role="alert" className="text-base font-semibold">
          {probleme}
        </p>
      )}
    </Carte>
  )
}
