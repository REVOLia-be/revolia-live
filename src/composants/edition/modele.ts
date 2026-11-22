// Modèle d'édition d'un quiz + validation qui reflète les contraintes CHECK de la base.

export type TypeQuestion = 'qcm' | 'nuage' | 'ouverte' | 'echelle'

export const TYPES: { valeur: TypeQuestion; libelle: string }[] = [
  { valeur: 'qcm', libelle: 'Choix multiple (une bonne réponse)' },
  { valeur: 'nuage', libelle: 'Nuage de mots' },
  { valeur: 'ouverte', libelle: 'Question ouverte' },
  { valeur: 'echelle', libelle: 'Échelle de 1 à 5' },
]

export const DUREES = [15, 20, 30, 45, 60, 90, 120]

export const LIMITES = {
  titre: 120,
  description: 500,
  enonce: 300,
  explication: 500,
  libelleEchelle: 40,
  choixMin: 2,
  choixMax: 6,
}

export interface QuestionEdition {
  id: string // identifiant (généré côté écran, conservé tel quel en base)
  type: TypeQuestion
  enonce: string
  choix: string[]
  bonne: number | null
  libelleMin: string
  libelleMax: string
  duree: number
  explication: string // « Pourquoi ? » facultatif, affiché après la fermeture de la question
}

export interface QuizEdition {
  titre: string
  description: string
  questions: QuestionEdition[]
}

export function nouvelleQuestion(type: TypeQuestion): QuestionEdition {
  return {
    id: crypto.randomUUID(),
    type,
    enonce: '',
    choix: type === 'qcm' ? ['', ''] : [],
    bonne: null,
    libelleMin: '',
    libelleMax: '',
    duree: 30,
    explication: '',
  }
}

export function dupliquerQuestion(q: QuestionEdition): QuestionEdition {
  return { ...q, id: crypto.randomUUID(), choix: [...q.choix] }
}

// Ligne de la table `questions` telle que lue en base.
export interface LigneQuestion {
  id: string
  ordre: number
  type: TypeQuestion
  enonce: string
  choix: string[] | null
  bonne_reponse: number | null
  libelle_min: string | null
  libelle_max: string | null
  duree_secondes: number
  explication: string | null
}

export function depuisLigne(l: LigneQuestion): QuestionEdition {
  return {
    id: l.id,
    type: l.type,
    enonce: l.enonce,
    choix: l.choix ?? [],
    bonne: l.bonne_reponse,
    libelleMin: l.libelle_min ?? '',
    libelleMax: l.libelle_max ?? '',
    duree: l.duree_secondes,
    explication: l.explication ?? '',
  }
}

export function versLigne(q: QuestionEdition, quizId: string, ordre: number) {
  const qcm = q.type === 'qcm'
  const echelle = q.type === 'echelle'
  return {
    id: q.id,
    quiz_id: quizId,
    ordre,
    type: q.type,
    enonce: q.enonce.trim(),
    choix: qcm ? q.choix.map((c) => c.trim()) : null,
    bonne_reponse: qcm ? q.bonne : null,
    libelle_min: echelle && q.libelleMin.trim() ? q.libelleMin.trim() : null,
    libelle_max: echelle && q.libelleMax.trim() ? q.libelleMax.trim() : null,
    duree_secondes: q.duree,
    explication: q.explication.trim() ? q.explication.trim() : null,
  }
}

export interface ErreursQuestion {
  enonce?: string
  choix?: string
  bonne?: string
  libelles?: string
  explication?: string
}

export function validerQuestion(q: QuestionEdition): ErreursQuestion {
  const e: ErreursQuestion = {}
  const enonce = q.enonce.trim()
  if (!enonce) e.enonce = 'Écris la question.'
  else if (enonce.length > LIMITES.enonce) e.enonce = `La question est trop longue (${LIMITES.enonce} caractères maximum).`

  if (q.type === 'qcm') {
    if (q.choix.length < LIMITES.choixMin) e.choix = 'Ajoute au moins 2 propositions.'
    else if (q.choix.length > LIMITES.choixMax) e.choix = 'Pas plus de 6 propositions.'
    else if (q.choix.some((c) => !c.trim())) e.choix = 'Remplis chaque proposition, ou retire celles qui sont vides.'
    if (q.bonne === null || q.bonne < 0 || q.bonne >= q.choix.length) {
      e.bonne = 'Indique la bonne réponse en cochant une proposition.'
    }
  }
  if (q.type === 'echelle') {
    if (q.libelleMin.trim().length > LIMITES.libelleEchelle || q.libelleMax.trim().length > LIMITES.libelleEchelle) {
      e.libelles = `Les libellés sont limités à ${LIMITES.libelleEchelle} caractères.`
    }
  }
  if (q.explication.trim().length > LIMITES.explication) {
    e.explication = `Le « Pourquoi ? » est trop long (${LIMITES.explication} caractères maximum).`
  }
  return e
}

export function aErreur(e: ErreursQuestion): boolean {
  return Object.keys(e).length > 0
}

export function validerQuiz(quiz: QuizEdition): { titre?: string; description?: string; questions: ErreursQuestion[]; ok: boolean } {
  const titre = quiz.titre.trim()
  const r: { titre?: string; description?: string; questions: ErreursQuestion[]; ok: boolean } = {
    questions: quiz.questions.map(validerQuestion),
    ok: true,
  }
  if (!titre) r.titre = 'Donne un titre à ton quiz.'
  else if (titre.length > LIMITES.titre) r.titre = `Le titre est trop long (${LIMITES.titre} caractères maximum).`
  if (quiz.description.trim().length > LIMITES.description) {
    r.description = `La description est trop longue (${LIMITES.description} caractères maximum).`
  }
  r.ok = !r.titre && !r.description && !r.questions.some(aErreur)
  return r
}
