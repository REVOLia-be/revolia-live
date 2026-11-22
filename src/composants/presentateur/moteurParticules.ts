// Petit moteur de particules sur canvas 2D (aucune dépendance).
//  - étincelles (traits qui laissent une traînée), petits disques et rubans fins qui tournent ;
//  - gravité, frottement de l'air, durée de vie : tout est calculé en secondes, donc identique à 60 ou 30 images/s ;
//  - « motion blur » par persistance : à chaque image on efface le canvas à moitié au lieu de le vider ;
//  - la boucle (requestAnimationFrame) s'arrête toute seule quand il n'y a plus rien à montrer ;
//  - le temps d'image est mesuré : si la machine peine, le moteur réduit le nombre de particules.
// Les couleurs viennent de src/theme.css (variables CSS), jamais écrites en dur ici.

export interface Salve {
  x: number
  y: number
  /** Étalement horizontal du point de départ, en px (pluie). */
  etalement?: number
  /** Nombre de particules demandé (avant adaptation à l'écran et à la puissance de la machine). */
  n: number
  /** Direction centrale en radians (0 = vers la droite, -π/2 = vers le haut). Ignoré si `cercle`. */
  angle?: number
  /** Ouverture du cône en radians. */
  ouverture?: number
  /** Vitesse de départ typique, en px/s. */
  vitesse: number
  /** Explosion dans toutes les directions, en plusieurs gerbes. */
  cercle?: boolean
  /** Durée de vie typique en secondes. */
  duree?: number
  /** Part des particules qui sont des disques (le reste : étincelles). */
  disques?: number
  /** Part de rubans qui tournent. */
  rubans?: number
  gravite?: number
  /** Traînée par persistance (explosions). Désactivée pour la pluie fine, qui n'en a pas besoin. */
  persistance?: boolean
  /** Frottement de l'air (par défaut 1,1 à 1,9) : plus il est faible, plus la particule garde sa vitesse. */
  frottement?: number
  /** Poids des couleurs [vert, vert clair, blanc]. */
  palette?: [number, number, number]
  /** Transparence maximale (0 à 1). */
  alpha?: number
  /** Taille de base des traits en px. */
  epaisseur?: number
}

const ETINCELLE = 0
const DISQUE = 1
const RUBAN = 2

interface Particule {
  x: number; y: number; vx: number; vy: number
  vie: number; duree: number
  taille: number; couleur: number; forme: number
  rot: number; vrot: number; phase: number
  grav: number; frott: number; alpha: number
  persiste: boolean
}

function lireCouleurs(): string[] {
  const s = getComputedStyle(document.documentElement)
  const lire = (nom: string, repli: string) => s.getPropertyValue(nom).trim() || repli
  return [lire('--couleur-vert', '#00824d'), lire('--couleur-vert-clair', '#80bf9e'), lire('--couleur-blanc', '#ffffff')]
}

const alea = (a: number, b: number) => a + Math.random() * (b - a)

export class MoteurParticules {
  private ctx: CanvasRenderingContext2D
  private couleurs = lireCouleurs()
  private actives: Particule[] = []
  private libres: Particule[] = []
  private programme: { t: number; faire: () => void }[] = []
  private raf = 0
  private horloge = 0 // secondes depuis le démarrage de la boucle
  private dernier = 0
  private largeur = 0
  private hauteur = 0
  private dpr = 1
  private detruit = false
  /** 1 = plein régime. Baisse si les images prennent trop de temps. */
  private qualite = 1
  private dureesImage: number[] = []
  private facteurEcran = 1
  private observateur: ResizeObserver

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas indisponible')
    this.ctx = ctx
    this.mesurer()
    this.observateur = new ResizeObserver(() => this.mesurer())
    this.observateur.observe(canvas)
  }

  private mesurer() {
    const l = Math.max(1, this.canvas.clientWidth)
    const h = Math.max(1, this.canvas.clientHeight)
    // Résolution : celle de l'écran, mais jamais plus de ~4 millions de pixels (projecteurs 4K, portables modestes).
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    while (l * dpr * h * dpr > 4_200_000 && dpr > 1) dpr -= 0.25
    this.dpr = dpr
    this.largeur = l
    this.hauteur = h
    this.canvas.width = Math.round(l * dpr)
    this.canvas.height = Math.round(h * dpr)
    // Densité : un écran 1920×1080 = 1, un petit écran = moins de particules.
    this.facteurEcran = Math.min(1.15, Math.max(0.55, Math.sqrt((l * h) / (1920 * 1080))))
  }

  get taille() {
    return { largeur: this.largeur, hauteur: this.hauteur }
  }

  /** Programme une salve dans `delaiMs` millisecondes (horloge de la boucle, donc cohérente avec l'affichage). */
  planifier(delaiMs: number, faire: () => void) {
    if (this.detruit) return
    this.programme.push({ t: this.horloge + delaiMs / 1000, faire })
    this.demarrer()
  }

  emettre(s: Salve) {
    if (this.detruit) return
    const n = Math.round(s.n * this.qualite * this.facteurEcran)
    const echelle = this.hauteur / 1080
    const palette = s.palette ?? [0.34, 0.4, 0.26]
    const total = palette[0] + palette[1] + palette[2]
    const duree = s.duree ?? 2
    const gerbes = s.cercle ? Math.round(alea(9, 13)) : 1
    const anglesGerbes = Array.from({ length: gerbes }, () => Math.random() * Math.PI * 2)
    for (let i = 0; i < n; i++) {
      const p = this.libres.pop() ?? ({} as Particule)
      let angle: number
      if (s.cercle) {
        // Gerbes : les particules se regroupent autour de quelques directions, avec un fond uniforme.
        angle = Math.random() < 0.72 ? anglesGerbes[i % gerbes] + (Math.random() + Math.random() - 1) * 0.42 : Math.random() * Math.PI * 2
      } else {
        angle = (s.angle ?? -Math.PI / 2) + (Math.random() + Math.random() - 1) * (s.ouverture ?? 0.5)
      }
      // Répartition des vitesses : beaucoup de lentes, quelques-unes très rapides (profondeur).
      const v = s.vitesse * echelle * (0.25 + Math.pow(Math.random(), 0.7) * 0.95)
      p.x = s.x + Math.cos(angle) * 6 + (Math.random() - 0.5) * (s.etalement ?? 0)
      p.y = s.y + Math.sin(angle) * 6
      p.vx = Math.cos(angle) * v
      p.vy = Math.sin(angle) * v
      p.duree = p.vie = duree * alea(0.6, 1.2)
      const tirage = Math.random()
      p.forme = tirage < (s.rubans ?? 0) ? RUBAN : tirage < (s.rubans ?? 0) + (s.disques ?? 0.3) ? DISQUE : ETINCELLE
      const base = (s.epaisseur ?? 2.2) * Math.max(0.7, echelle)
      p.taille = p.forme === DISQUE ? alea(0.8, 2.6) * Math.max(0.8, echelle) : base * alea(0.5, 1.2)
      let c = Math.random() * total
      p.couleur = c < palette[0] ? 0 : (c -= palette[0]) < palette[1] ? 1 : 2
      p.rot = Math.random() * Math.PI * 2
      p.vrot = alea(-5, 5)
      p.phase = Math.random() * Math.PI * 2
      p.grav = (s.gravite ?? 620) * echelle
      p.frott = s.frottement ?? (p.forme === RUBAN ? 1.9 : alea(1.1, 1.9))
      p.alpha = (s.alpha ?? 1) * alea(0.7, 1)
      p.persiste = s.persistance !== false
      this.actives.push(p)
    }
    this.demarrer()
  }

  private demarrer() {
    if (this.raf || this.detruit) return
    this.dernier = 0
    this.raf = requestAnimationFrame(this.image)
  }

  private image = (maintenant: number) => {
    this.raf = 0
    if (this.detruit) return
    const dt = this.dernier ? Math.min(0.05, (maintenant - this.dernier) / 1000) : 1 / 60
    const brut = this.dernier ? maintenant - this.dernier : 16
    this.dernier = maintenant
    this.horloge += dt
    this.surveillerPerformances(brut)

    // Salves programmées
    if (this.programme.length) {
      const dues = this.programme.filter((e) => e.t <= this.horloge)
      if (dues.length) {
        this.programme = this.programme.filter((e) => e.t > this.horloge)
        dues.forEach((e) => e.faire())
      }
    }

    this.avancer(dt)
    this.dessiner(dt)

    if (this.actives.length > 0 || this.programme.length > 0) {
      this.raf = requestAnimationFrame(this.image)
    } else {
      // Plus rien à montrer : on vide le canvas et on arrête la boucle.
      this.ctx.setTransform(1, 0, 0, 1, 0, 0)
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  // Moyenne glissante du temps d'image : au-dessus de ~24 ms (moins de 42 images/s), on allège.
  private surveillerPerformances(ms: number) {
    this.dureesImage.push(ms)
    if (this.dureesImage.length < 30) return
    const moyenne = this.dureesImage.reduce((a, b) => a + b, 0) / this.dureesImage.length
    this.dureesImage = []
    if (moyenne > 24 && this.qualite > 0.35) {
      this.qualite = Math.max(0.35, this.qualite * 0.7)
      const garder = Math.ceil(this.actives.length * 0.7)
      this.libres.push(...this.actives.splice(garder))
    }
  }

  private avancer(dt: number) {
    const a = this.actives
    for (let i = a.length - 1; i >= 0; i--) {
      const p = a[i]
      p.vie -= dt
      if (p.vie <= 0 || p.y > this.hauteur + 60) {
        this.libres.push(p)
        a[i] = a[a.length - 1]
        a.pop()
        continue
      }
      const f = Math.exp(-p.frott * dt)
      p.vx *= f
      p.vy = p.vy * f + p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vrot * dt
    }
  }

  private dessiner(dt: number) {
    const { ctx, dpr } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Persistance : on estompe l'image précédente (traînées), indépendamment de la cadence.
    // Tant qu'aucune particule n'en a besoin, on vide complètement : une estompe répétée laisse sinon de faibles résidus.
    ctx.globalAlpha = 1
    if (this.actives.some((p) => p.persiste)) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = `rgba(0,0,0,${(1 - Math.exp(-dt * 10)).toFixed(3)})`
      ctx.fillRect(0, 0, this.largeur, this.hauteur)
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, this.largeur, this.hauteur)
    }

    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    for (const p of this.actives) {
      const reste = p.vie / p.duree
      // Apparition immédiate, disparition douce (courbe en cloche inversée).
      const fondu = Math.min(1, reste * 2.6) * Math.min(1, (1 - reste) * 14 + 0.25)
      ctx.globalAlpha = Math.max(0, p.alpha * fondu)
      const couleur = this.couleurs[p.couleur]
      if (p.forme === ETINCELLE) {
        ctx.strokeStyle = couleur
        ctx.lineWidth = p.taille
        ctx.beginPath()
        ctx.moveTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      } else if (p.forme === DISQUE) {
        ctx.fillStyle = couleur
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.taille, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Ruban : petit rectangle qui tourne en « vol plané » (la largeur apparente varie avec l'angle).
        const largeur = p.taille * 1.3
        const longueur = largeur * 4
        const tour = Math.cos(p.rot * 1.3 + p.phase)
        ctx.fillStyle = couleur
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot * 0.35 + p.phase)
        ctx.scale(1, 0.25 + Math.abs(tour) * 0.75)
        ctx.fillRect(-largeur / 2, -longueur / 2, largeur, longueur)
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  /** Arrête tout et libère les ressources (démontage du composant). */
  detruire() {
    this.detruit = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.observateur.disconnect()
    this.programme = []
    this.actives = []
    this.libres = []
  }
}
