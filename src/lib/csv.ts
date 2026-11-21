// Export CSV d'une session, lisible directement par Excel en français.
// Choix : séparateur « ; », BOM UTF-8 (sinon les accents sont cassés), guillemets doublés,
// retours à la ligne Windows, virgule comme séparateur décimal.

export interface LigneExport {
  question_ordre: number
  question_type: 'qcm' | 'nuage' | 'ouverte' | 'echelle'
  question: string
  pseudo: string
  table_nom: string | null
  reponse: string | null
  est_correcte: boolean | null
  temps_secondes: number | string | null
  repondu_le: string
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

export function construireCsv(lignes: LigneExport[]): string {
  const corps = lignes.map((l) =>
    [
      String(l.question_ordre),
      TYPES[l.question_type] ?? '',
      l.question ?? '',
      l.pseudo ?? '',
      l.table_nom ?? '',
      l.reponse ?? '',
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
