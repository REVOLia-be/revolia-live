// Export CSV d'une session, lisible directement par Excel en français.
// Choix : séparateur « ; », BOM UTF-8 (sinon les accents sont cassés), guillemets doublés,
// retours à la ligne Windows, virgule comme séparateur décimal.

export interface LigneExport {
  question_ordre: number
  question_type: 'qcm' | 'qcm_multiple' | 'nuage' | 'ouverte' | 'echelle'
  question: string
  pseudo: string
  table_nom: string | null
  reponse: string | null
  est_correcte: boolean | null
  temps_secondes: number | string | null
  repondu_le: string
}

// Propositions d'une question QCM par numéro d'ordre : sert à nommer « Photo A », « Photo B »… les propositions
// en photos qui n'ont pas de légende (la base renvoie alors un texte vide).
export interface PropositionsPhotos {
  choix: string[]
  images_choix: string[] | null
}

const EN_TETES = [
  'N° question',
  'Type',
  'Question',
  'Pseudo',
  'Table',
  'Réponse',
  'Correcte',
  'Temps (s)',
  'Répondu le',
]

const TYPES: Record<LigneExport['question_type'], string> = {
  qcm: 'Choix multiple',
  qcm_multiple: 'Choix multiple (plusieurs réponses)',
  nuage: 'Nuage de mots',
  ouverte: 'Question ouverte',
  echelle: 'Échelle',
}

function deux(n: number): string {
  return String(n).padStart(2, '0')
}

// jj/mm/aaaa hh:mm, à l'heure locale du navigateur (celle du formateur).
export function formaterDateCsv(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}:${deux(d.getMinutes())}`
}

function cellule(valeur: string): string {
  return `"${valeur.replace(/"/g, '""')}"`
}

function formaterTemps(valeur: number | string | null): string {
  if (valeur === null || valeur === undefined || valeur === '') return ''
  const n = Number(valeur)
  if (Number.isNaN(n)) return ''
  return n.toFixed(1).replace('.', ',')
}

const photoN = (i: number) => `Photo ${String.fromCharCode(65 + i)}`

// Texte de la réponse d'une personne à une question en photos : la légende si elle existe, sinon « Photo A ».
// `reponse` est la légende renvoyée par la base (QCM multiple : légendes séparées par « ; », dans l'ordre des propositions).
// Si plusieurs propositions sans légende sont possibles pour un même texte vide, on les cite toutes (« Photo A ou Photo C »).
export function reponsePhoto(reponse: string | null, type: LigneExport['question_type'], p: PropositionsPhotos | undefined): string | null {
  if (!p || !p.images_choix) return reponse
  const legende = (i: number) => (p.choix[i] ?? '').trim()
  const nom = (i: number) => legende(i) || photoN(i)
  if (type === 'qcm') {
    const texte = (reponse ?? '').trim()
    const candidats = p.choix.map((_, i) => i).filter((i) => legende(i) === texte)
    return candidats.length === 0 ? reponse : candidats.map(nom).join(' ou ')
  }
  if (type === 'qcm_multiple') {
    const morceaux = (reponse ?? '').split(' ; ').map((m) => m.trim())
    let courant = -1
    const noms = morceaux.map((m) => {
      let i = courant + 1
      while (i < p.choix.length && legende(i) !== m) i++
      if (i >= p.choix.length) return m || '?'
      courant = i
      return nom(i)
    })
    return noms.join(' ; ')
  }
  return reponse
}

export function construireCsv(lignes: LigneExport[], photos: Map<number, PropositionsPhotos> = new Map()): string {
  const corps = lignes.map((l) =>
    [
      String(l.question_ordre),
      TYPES[l.question_type] ?? '',
      l.question ?? '',
      l.pseudo ?? '',
      l.table_nom ?? '',
      reponsePhoto(l.reponse, l.question_type, photos.get(l.question_ordre)) ?? '',
      l.est_correcte === null || l.est_correcte === undefined ? '' : l.est_correcte ? 'Oui' : 'Non',
      formaterTemps(l.temps_secondes),
      formaterDateCsv(l.repondu_le),
    ]
      .map((v) => (v === '' ? '' : cellule(v)))
      .join(';'),
  )
  const entete = EN_TETES.map(cellule).join(';')
  return '﻿' + [entete, ...corps].join('\r\n') + '\r\n'
}

// « Soirée IA – Table 2 » -> « soiree-ia-table-2 »
export function simplifierTitre(titre: string): string {
  const simple = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '')
  return simple || 'session'
}

export function telechargerCsv(contenu: string, nomFichier: string): void {
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nomFichier
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function dateDuJour(): string {
  const d = new Date()
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}
