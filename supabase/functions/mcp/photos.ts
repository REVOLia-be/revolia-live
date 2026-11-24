// Photos envoyées par l'IA (Claude / ChatGPT) : récupération, contrôle, réduction.
// Ce fichier ne touche NI à la base NI au stockage : il transforme une « source » (URL ou base64) en une petite
// image prête à être déposée dans le bucket `quiz-images` (le dépôt est fait dans index.ts, avec le jeton de l'utilisateur).
//
// Choix de bibliothèque : `@jsquash/*` (jpeg 1.6.0, png 3.1.1, webp 1.5.0 — versions figées). Ce sont les codecs de
// Squoosh (libjpeg/libpng/libwebp compilés en WebAssembly) : ils tournent sans dépendance système dans Deno et
// dans les Edge Functions Supabase, et surtout ils savent ÉCRIRE du WebP (imagescript, pur Deno, ne sait ni lire ni
// écrire le WebP). Sortie en WebP (transparence conservée) ; repli en JPEG (fond blanc) si le codec WebP échoue.
// Le redimensionnement est écrit ici (moyenne par zones, avec pondération par la transparence) pour ne pas ajouter
// un quatrième module WebAssembly.
// Orientation EXIF : lue à la main dans l'en-tête des JPEG et appliquée (les 8 cas), car le décodeur ne le fait pas.

import decodeJpeg from 'npm:@jsquash/jpeg@1.6.0/decode.js'
import encodeJpeg from 'npm:@jsquash/jpeg@1.6.0/encode.js'
import decodePng from 'npm:@jsquash/png@3.1.1/decode.js'
import decodeWebp from 'npm:@jsquash/webp@1.5.0/decode.js'
import encodeWebp from 'npm:@jsquash/webp@1.5.0/encode.js'

export class ErreurPhoto extends Error {}
const refus = (m: string): never => {
  throw new ErreurPhoto(m)
}

// ---------------------------------------------------------------------------
// Limites (alignées sur src/lib/photos.ts côté appli)
// ---------------------------------------------------------------------------
export const LIMITES_PHOTO = {
  urlOctets: 5 * 1024 * 1024, // téléchargement : interrompu au-delà
  base64Octets: Math.floor(1.5 * 1024 * 1024), // taille décodée
  delaiMs: 10_000, // téléchargement complet (en-têtes + corps)
  redirections: 3,
  pixelsMax: 16_000_000, // protège la mémoire de la fonction (16 Mpx = 64 Mo décodés)
  totalOctetsParAppel: 6 * 1024 * 1024, // total des entrées base64 décodées d'un même appel
  legende: 200,
  qualites: [0.75, 0.65, 0.55, 0.5],
} as const

export type GenrePhoto = 'question' | 'choix'
export const REGLAGES: Record<GenrePhoto, { cote: number; maxOctets: number }> = {
  question: { cote: 1280, maxOctets: 250 * 1024 },
  choix: { cote: 640, maxOctets: 80 * 1024 },
}

export const TYPES_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export type TypeMime = (typeof TYPES_MIME)[number]

export interface PhotoPreparee {
  octets: Uint8Array
  extension: 'webp' | 'jpg'
  contentType: 'image/webp' | 'image/jpeg'
  largeur: number
  hauteur: number
  qualite: number
}

// ---------------------------------------------------------------------------
// Anti-SSRF : validation d'adresse
// ---------------------------------------------------------------------------
const ipv4Prive = (a: number, b: number): boolean =>
  a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))

// Adresse IP (v4 ou v6) privée, locale ou réservée ? Sert à vérifier le résultat d'une résolution DNS.
export function ipInterdite(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (v4) return ipv4Prive(Number(v4[1]), Number(v4[2]))
  const v6 = ip.toLowerCase()
  const mappee = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6)
  if (mappee) return ipInterdite(mappee[1])
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('::ffff:')
}

// Règles sur l'adresse elle-même (sans réseau). Renvoie l'URL analysée ou lève ErreurPhoto.
export function validerUrlSource(brut: string): URL {
  let u: URL
  try {
    u = new URL(brut)
  } catch {
    return refus("L'adresse de la photo n'est pas valide. Donne une adresse complète qui commence par https://.")
  }
  if (u.protocol !== 'https:') refus("Seules les adresses en https:// sont acceptées pour une photo (pas http://, pas d'autre type d'adresse).")
  if (u.username || u.password) refus("L'adresse de la photo ne doit pas contenir d'identifiant ni de mot de passe.")
  if (u.port !== '' && u.port !== '443') refus("L'adresse de la photo utilise un port non standard : refusé. Utilise une adresse https:// ordinaire.")
  const h = u.hostname.toLowerCase().replace(/\.$/, '')
  // Adresse IP littérale : IPv6 (entre crochets), IPv4 sous toutes ses écritures (l'analyse d'URL les normalise en a.b.c.d).
  if (h.startsWith('[') || h.includes(':') || /^\d+(\.\d+){0,3}$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) {
    refus("Les adresses numériques (IP) sont refusées : donne l'adresse d'un site avec son nom de domaine.")
  }
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) {
    refus("Cette adresse désigne une machine locale ou interne : refusée. Donne l'adresse publique d'une photo sur Internet.")
  }
  return u
}

// Vérifie (au mieux) que le nom de domaine ne pointe pas vers une adresse privée. Si la résolution DNS n'est pas
// possible dans l'environnement, on continue : les règles de nom ci-dessus restent appliquées. Limite connue : une
// résolution différente au moment du téléchargement (« DNS rebinding ») n'est pas exclue à 100 %.
async function verifierDns(hote: string): Promise<void> {
  for (const type of ['A', 'AAAA'] as const) {
    let ips: string[] = []
    try {
      ips = await Deno.resolveDns(hote, type)
    } catch {
      continue
    }
    if (ips.some(ipInterdite)) refus("Cette adresse pointe vers une machine interne : refusée. Donne l'adresse publique d'une photo sur Internet.")
  }
}

// ---------------------------------------------------------------------------
// Téléchargement borné
// ---------------------------------------------------------------------------
export interface OptionsTelechargement {
  fetchFn?: typeof fetch
  verifierDns?: boolean // faux dans les tests
  delaiMs?: number
  maxOctets?: number
}

export async function telechargerPhoto(brut: string, opt: OptionsTelechargement = {}): Promise<Uint8Array> {
  const fetchFn = opt.fetchFn ?? fetch
  const maxOctets = opt.maxOctets ?? LIMITES_PHOTO.urlOctets
  const ctrl = new AbortController()
  const minuteur = setTimeout(() => ctrl.abort(), opt.delaiMs ?? LIMITES_PHOTO.delaiMs)
  try {
    let url = validerUrlSource(brut)
    for (let saut = 0; saut <= LIMITES_PHOTO.redirections; saut++) {
      if (opt.verifierDns !== false) await verifierDns(url.hostname)
      let rep: Response
      try {
        rep = await fetchFn(url.href, {
          redirect: 'manual',
          signal: ctrl.signal,
          headers: { Accept: 'image/jpeg,image/png,image/webp', 'User-Agent': 'REVOLiaLive-MCP/1.0' },
        })
      } catch (e) {
        if (ctrl.signal.aborted) return refus(`Le téléchargement de la photo a pris plus de ${(opt.delaiMs ?? LIMITES_PHOTO.delaiMs) / 1000} secondes : abandon. Essaie une autre adresse ou envoie la photo en base64.`)
        return refus(`La photo n'a pas pu être téléchargée (${e instanceof Error ? e.name : 'erreur réseau'}). Vérifie l'adresse ou envoie la photo en base64.`)
      }
      if (rep.status >= 300 && rep.status < 400) {
        const lieu = rep.headers.get('location')
        await rep.body?.cancel().catch(() => {})
        if (!lieu) return refus("L'adresse de la photo redirige sans dire où : refusée.")
        if (saut === LIMITES_PHOTO.redirections) return refus(`L'adresse de la photo redirige plus de ${LIMITES_PHOTO.redirections} fois : refusée.`)
        let suivante: string
        try {
          suivante = new URL(lieu, url).href
        } catch {
          return refus("L'adresse de la photo redirige vers une adresse invalide : refusée.")
        }
        url = validerUrlSource(suivante) // chaque redirection est revalidée (https, pas d'IP, pas de machine locale)
        continue
      }
      if (!rep.ok) {
        await rep.body?.cancel().catch(() => {})
        return refus(`Le site de la photo a répondu par une erreur (${rep.status}). Vérifie que l'adresse mène bien directement à l'image.`)
      }
      const annonce = Number(rep.headers.get('content-length') ?? '0')
      if (annonce > maxOctets) {
        await rep.body?.cancel().catch(() => {})
        return refus(`La photo fait plus de ${Math.round(maxOctets / 1048576)} Mo : trop lourde. Choisis une version plus légère.`)
      }
      if (!rep.body) return refus("Le site n'a renvoyé aucune donnée pour cette photo.")
      // Lecture en flux, interrompue dès que la limite est dépassée (le Content-Length peut mentir ou manquer).
      const morceaux: Uint8Array[] = []
      let total = 0
      const lecteur = rep.body.getReader()
      try {
        while (true) {
          const { done, value } = await lecteur.read()
          if (done) break
          total += value.byteLength
          if (total > maxOctets) {
            await lecteur.cancel().catch(() => {})
            return refus(`La photo fait plus de ${Math.round(maxOctets / 1048576)} Mo : trop lourde. Choisis une version plus légère.`)
          }
          morceaux.push(value)
        }
      } catch (e) {
        if (e instanceof ErreurPhoto) throw e
        if (ctrl.signal.aborted) return refus("Le téléchargement de la photo a été trop long : abandon. Essaie une autre adresse ou envoie la photo en base64.")
        return refus("Le téléchargement de la photo a été interrompu. Réessaie ou envoie la photo en base64.")
      }
      const sortie = new Uint8Array(total)
      let pos = 0
      for (const m of morceaux) {
        sortie.set(m, pos)
        pos += m.byteLength
      }
      return sortie
    }
    return refus("L'adresse de la photo n'a pas pu être suivie.")
  } finally {
    clearTimeout(minuteur)
  }
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------
export function decoderBase64(texte: string): Uint8Array {
  let b64 = texte.trim()
  if (/^data:/i.test(b64)) b64 = b64.replace(/^data:[^,]*,/i, '') // tolère un « data URL » collé tel quel
  b64 = b64.replace(/\s+/g, '')
  // Contrôle de taille AVANT de décoder (4 caractères = 3 octets).
  if (Math.floor((b64.length * 3) / 4) > LIMITES_PHOTO.base64Octets + 3) {
    refus(`La photo envoyée en base64 dépasse ${(LIMITES_PHOTO.base64Octets / 1048576).toFixed(1).replace('.', ',')} Mo une fois décodée. Réduis-la, ou donne plutôt une adresse https:// (jusqu'à 5 Mo).`)
  }
  if (b64.length === 0 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) refus("Le contenu base64 de la photo n'est pas valide (caractères inattendus ou vide).")
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
    const sortie = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) sortie[i] = bin.charCodeAt(i)
    if (sortie.byteLength > LIMITES_PHOTO.base64Octets) refus(`La photo envoyée en base64 dépasse ${(LIMITES_PHOTO.base64Octets / 1048576).toFixed(1).replace('.', ',')} Mo une fois décodée.`)
    return sortie
  } catch (e) {
    if (e instanceof ErreurPhoto) throw e
    return refus("Le contenu base64 de la photo n'a pas pu être décodé.")
  }
}

// ---------------------------------------------------------------------------
// Type réel (octets magiques) et dimensions annoncées (avant de décoder)
// ---------------------------------------------------------------------------
export function detecterType(o: Uint8Array): TypeMime | null {
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg'
  if (o.length >= 8 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47 && o[4] === 0x0d && o[5] === 0x0a && o[6] === 0x1a && o[7] === 0x0a) return 'image/png'
  if (o.length >= 12 && String.fromCharCode(...o.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...o.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

function dimensionsAnnoncees(o: Uint8Array, type: TypeMime): { l: number; h: number } | null {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength)
  try {
    if (type === 'image/png') return { l: v.getUint32(16), h: v.getUint32(20) }
    if (type === 'image/webp') {
      const fourcc = String.fromCharCode(...o.subarray(12, 16))
      if (fourcc === 'VP8X') return { l: 1 + (o[24] | (o[25] << 8) | (o[26] << 16)), h: 1 + (o[27] | (o[28] << 8) | (o[29] << 16)) }
      if (fourcc === 'VP8L') {
        const b = o[21] | (o[22] << 8) | (o[23] << 16) | (o[24] << 24)
        return { l: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }
      }
      if (fourcc === 'VP8 ') return { l: v.getUint16(26, true) & 0x3fff, h: v.getUint16(28, true) & 0x3fff }
      return null
    }
    // JPEG : on cherche le premier marqueur SOFn
    let i = 2
    while (i + 9 < o.length) {
      if (o[i] !== 0xff) { i++; continue }
      const m = o[i + 1]
      if (m === 0xff) { i++; continue }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: v.getUint16(i + 5), l: v.getUint16(i + 7) }
      i += 2 + v.getUint16(i + 2)
    }
  } catch { /* en-tête tronqué : on laissera le décodeur trancher */ }
  return null
}

// Orientation EXIF (1 à 8) d'un JPEG ; 1 si absente ou illisible.
export function orientationExif(o: Uint8Array): number {
  try {
    const v = new DataView(o.buffer, o.byteOffset, o.byteLength)
    let i = 2
    while (i + 4 < o.length) {
      if (o[i] !== 0xff) return 1
      const m = o[i + 1]
      if (m === 0xda || m === 0xd9) return 1
      const len = v.getUint16(i + 2)
      if (m === 0xe1 && String.fromCharCode(...o.subarray(i + 4, i + 8)) === 'Exif') {
        const t = i + 10 // début du bloc TIFF
        const petit = o[t] === 0x49
        const lire16 = (p: number) => v.getUint16(p, petit)
        const ifd = t + v.getUint32(t + 4, petit)
        const n = lire16(ifd)
        for (let k = 0; k < n; k++) {
          const e = ifd + 2 + k * 12
          if (lire16(e) === 0x0112) {
            const val = lire16(e + 8)
            return val >= 1 && val <= 8 ? val : 1
          }
        }
        return 1
      }
      i += 2 + len
    }
  } catch { /* EXIF abîmé : on ignore */ }
  return 1
}

// ---------------------------------------------------------------------------
// Pixels : réduction, orientation, aplatissement
// ---------------------------------------------------------------------------
interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

// Réduction par moyenne des zones (rendu net, sans crénelage), pondérée par la transparence.
function reduire(src: Pixels, l: number, h: number): Pixels {
  if (l === src.width && h === src.height) return src
  const sortie = new Uint8ClampedArray(l * h * 4)
  const sx = src.width / l
  const sy = src.height / h
  const d = src.data
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((y + 1) * sy)))
    for (let x = 0; x < l; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((x + 1) * sx)))
      let r = 0, g = 0, b = 0, a = 0
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * src.width + x0) * 4
        for (let xx = x0; xx < x1; xx++, p += 4) {
          const al = d[p + 3]
          r += d[p] * al
          g += d[p + 1] * al
          b += d[p + 2] * al
          a += al
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      const o = (y * l + x) * 4
      if (a > 0) {
        sortie[o] = r / a
        sortie[o + 1] = g / a
        sortie[o + 2] = b / a
      }
      sortie[o + 3] = a / n
    }
  }
  return { data: sortie, width: l, height: h }
}

// Applique l'orientation EXIF (1 = rien). Les cas 5 à 8 échangent largeur et hauteur.
function orienter(src: Pixels, o: number): Pixels {
  if (o === 1) return src
  const { width: w, height: h } = src
  const echange = o >= 5
  const l = echange ? h : w
  const ht = echange ? w : h
  const sortie = new Uint8ClampedArray(l * ht * 4)
  const s = new Uint32Array(src.data.buffer, src.data.byteOffset, w * h)
  const t = new Uint32Array(sortie.buffer)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number, ny: number
      switch (o) {
        case 2: nx = w - 1 - x; ny = y; break
        case 3: nx = w - 1 - x; ny = h - 1 - y; break
        case 4: nx = x; ny = h - 1 - y; break
        case 5: nx = y; ny = x; break
        case 6: nx = h - 1 - y; ny = x; break
        case 7: nx = h - 1 - y; ny = w - 1 - x; break
        default: nx = y; ny = w - 1 - x // 8
      }
      t[ny * l + nx] = s[y * w + x]
    }
  }
  return { data: sortie, width: l, height: ht }
}

// Fond blanc sous la transparence (le JPEG n'en a pas).
function aplatir(src: Pixels): Pixels {
  const d = new Uint8ClampedArray(src.data)
  for (let p = 0; p < d.length; p += 4) {
    const a = d[p + 3] / 255
    d[p] = d[p] * a + 255 * (1 - a)
    d[p + 1] = d[p + 1] * a + 255 * (1 - a)
    d[p + 2] = d[p + 2] * a + 255 * (1 - a)
    d[p + 3] = 255
  }
  return { data: d, width: src.width, height: src.height }
}

// ---------------------------------------------------------------------------
// Pipeline : octets bruts → petite image WebP (ou JPEG)
// ---------------------------------------------------------------------------
export async function preparerPhoto(brut: Uint8Array, genre: GenrePhoto, typeAnnonce?: string): Promise<PhotoPreparee> {
  const type = detecterType(brut)
  if (!type) refuse_format()
  if (typeAnnonce && typeAnnonce !== type) {
    refus(`Le type annoncé (${typeAnnonce}) ne correspond pas au contenu réel du fichier (${type}). Vérifie le fichier envoyé.`)
  }
  const dim = dimensionsAnnoncees(brut, type!)
  if (dim && (dim.l < 1 || dim.h < 1 || dim.l * dim.h > LIMITES_PHOTO.pixelsMax)) {
    refus(`Cette photo est trop grande (${dim.l} × ${dim.h} pixels, maximum ${LIMITES_PHOTO.pixelsMax / 1_000_000} millions de pixels). Envoie une version déjà réduite.`)
  }
  if (type === 'image/jpeg') {
    // Le décodeur pardonne les JPEG coupés (image à moitié grise) : on exige le marqueur de fin FFD9.
    let fin = brut.length - 1
    while (fin > 0 && brut[fin] === 0) fin--
    if (!(fin > 0 && brut[fin - 1] === 0xff && brut[fin] === 0xd9)) refus("Ce fichier JPEG est incomplet (téléchargement ou envoi coupé). Renvoie la photo entière.")
  }
  const copie = brut.buffer.slice(brut.byteOffset, brut.byteOffset + brut.byteLength) as ArrayBuffer
  let decodee: Pixels
  try {
    const dec = type === 'image/jpeg' ? decodeJpeg : type === 'image/png' ? decodePng : decodeWebp
    decodee = (await dec(copie)) as Pixels
  } catch {
    return refus("Cette photo n'a pas pu être lue : le fichier est abîmé ou dans une variante non prise en charge. Essaie une autre photo (JPEG, PNG ou WebP).")
  }
  if (decodee.width * decodee.height > LIMITES_PHOTO.pixelsMax) refus('Cette photo est trop grande. Envoie une version déjà réduite.')

  const { cote, maxOctets } = REGLAGES[genre]
  const orientation = type === 'image/jpeg' ? orientationExif(brut) : 1
  const echelle = Math.min(1, cote / Math.max(decodee.width, decodee.height))
  const reduite = reduire(decodee, Math.max(1, Math.round(decodee.width * echelle)), Math.max(1, Math.round(decodee.height * echelle)))
  const finale = orienter(reduite, orientation)
  const image = { data: finale.data, width: finale.width, height: finale.height, colorSpace: 'srgb' } as ImageData

  let jpegSeulement = false
  let dernierePoids = 0
  for (const q of LIMITES_PHOTO.qualites) {
    let octets: Uint8Array
    let format: 'webp' | 'jpg' = 'webp'
    try {
      if (jpegSeulement) throw new Error('repli')
      octets = new Uint8Array(await encodeWebp(image, { quality: Math.round(q * 100) }))
    } catch {
      jpegSeulement = true // codec WebP indisponible : repli JPEG (la fonction reste utilisable)
      format = 'jpg'
      const plat = aplatir(finale)
      octets = new Uint8Array(await encodeJpeg({ data: plat.data, width: plat.width, height: plat.height, colorSpace: 'srgb' } as ImageData, { quality: Math.round(q * 100) }))
    }
    dernierePoids = octets.byteLength
    if (octets.byteLength <= maxOctets) {
      return {
        octets,
        extension: format,
        contentType: format === 'webp' ? 'image/webp' : 'image/jpeg',
        largeur: finale.width,
        hauteur: finale.height,
        qualite: q,
      }
    }
  }
  return refus(
    `Cette photo reste trop lourde même après compression (${Math.round(dernierePoids / 1024)} Ko, maximum ${Math.round(maxOctets / 1024)} Ko pour une photo de ${genre === 'question' ? 'question' : 'proposition'}). Choisis une image plus simple (moins de détails ou de texture).`,
  )
}

function refuse_format(): never {
  return refus("Ce fichier n'est pas une image JPEG, PNG ou WebP (le contenu réel est contrôlé, pas seulement le nom ou le type annoncé). Les formats comme GIF, SVG, HEIC ou PDF ne sont pas acceptés.")
}
