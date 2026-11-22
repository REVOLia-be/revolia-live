// Modèle d'édition d'un quiz + validation qui reflète les contraintes CHECK de la base.

export type TypeQuestion = 'qcm' | 'qcm_multiple' | 'nuage' | 'ouverte' | 'echelle'

export const TYPES: { valeur: TypeQuestion; libelle: string }[] = [
  { valeur: 'qcm', libelle: 'Choix multiple (une bonne réponse)' },
  { valeur: 'qcm_multiple', libelle: 'Choix multiple (plusieurs bonnes réponses)' },
  { valeur: 'nuage', libelle: 'Nuage de mots' },
  { valeur: 'ouverte', libelle: 'Question ouverte' },
  { valeur: 'echelle', libelle: 'Échelle de 1 à 5' },
]

export const DUREES = [15, 20, 30, 45, 60, 90, 120]

export const LIMITES = {
  titre: 120,
  description: 500,
  enonce: 300,
  explication: 800,
  choix: 200, // une proposition (stricte)
  choixConfort: 120, // au-delà : avertissement doux (écran projeté)
  enonceConfort: 160,
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
  bonnes: number[] // qcm_multiple : indices (0-based) des bonnes réponses, au moins 2
  annoncerNombre: boolean // qcm_multiple : dire aux participants combien il y a de bonnes réponses
  libelleMin: string
  libelleMax: string
  duree: number
  explication: string // « Pourquoi ? » facultatif, affiché après la fermeture de la question
  image: string | null // chemin de la photo de la question dans le stockage (facultatif)
  // « Propositions en photos » (QCM) : null = option désactivée ; sinon une entrée par proposition, '' = photo pas encore ajoutée.
  // Toujours de la même longueur que `choix` et dans le même ordre.
  imagesChoix: string[] | null
}

// Moments de célébration : « après la question N, afficher ce message à toute la salle ».
export interface CelebrationEdition {
  apres: number // numéro de la question (à partir de 1)
  message: string
}
export const CELEBRATIONS = { max: 10, messageMax: 140 }
export const SUGGESTIONS_CELEBRATION = [
  'La moitié du chemin, bravo à toute la salle !',
  'Dernière ligne droite, on continue ensemble !',
]

export const celebrationsDepuisBase = (brut: unknown): CelebrationEdition[] =>
  (Array.isArray(brut) ? brut : []).map((c: { apres_question?: number; message?: string }) => ({
    apres: Number(c.apres_question) || 1,
    message: String(c.message ?? ''),
  }))
export const celebrationsVersBase = (c: CelebrationEdition[]) =>
  [...c].sort((x, y) => x.apres - y.apres).map((x) => ({ apres_question: x.apres, message: x.message.trim() }))

export function validerCelebrations(c: CelebrationEdition[]): string | undefined {
  if (c.length > CELEBRATIONS.max) return `Pas plus de ${CELEBRATIONS.max} moments de célébration.`
  if (c.some((x) => !x.message.trim())) return 'Écris un message pour chaque moment de célébration, ou retire ceux qui sont vides.'
  if (c.some((x) => x.message.trim().length > CELEBRATIONS.messageMax)) return `Un message est trop long (${CELEBRATIONS.messageMax} caractères maximum).`
  if (new Set(c.map((x) => x.apres)).size !== c.length) return 'Deux messages sont placés après la même question : choisis une question différente pour chacun.'
  return undefined
}

export interface QuizEdition {
  titre: string
  description: string
  celebrations: CelebrationEdition[]
  questions: QuestionEdition[]
}

export const estQcm = (type: TypeQuestion) => type === 'qcm' || type === 'qcm_multiple'

export function nouvelleQuestion(type: TypeQuestion): QuestionEdition {
  return {
    id: crypto.randomUUID(),
    type,
    enonce: '',
    choix: type === 'qcm' ? ['', ''] : type === 'qcm_multiple' ? ['', '', ''] : [],
    bonne: null,
    bonnes: [],
    annoncerNombre: true,
    libelleMin: '',
    libelleMax: '',
    duree: 30,
    explication: '',
    image: null,
    imagesChoix: null,
  }
}

export function dupliquerQuestion(q: QuestionEdition): QuestionEdition {
  // Les fichiers photo sont partagés avec l'original (seuls les chemins sont copiés).
  return { ...q, id: crypto.randomUUID(), choix: [...q.choix], bonnes: [...q.bonnes], imagesChoix: q.imagesChoix ? [...q.imagesChoix] : null }
}

export const lettrePhoto = (i: number) => String.fromCharCode(65 + i)

// Active ou retire l'option « Propositions en photos » (le retrait efface les chemins des photos de la question).
export function basculerPhotosChoix(q: QuestionEdition, actif: boolean): QuestionEdition {
  if (!estQcm(q.type)) return q
  return { ...q, imagesChoix: actif ? q.choix.map((_, i) => q.imagesChoix?.[i] ?? '') : null }
}

// Ajoute une proposition vide (et sa photo manquante si les propositions sont en photos).
export function ajouterProposition(q: QuestionEdition): QuestionEdition {
  if (q.choix.length >= LIMITES.choixMax) return q
  return { ...q, choix: [...q.choix, ''], imagesChoix: q.imagesChoix ? [...q.imagesChoix, ''] : null }
}

// Retire la proposition `i` : la bonne réponse et les photos suivent.
export function retirerProposition(q: QuestionEdition, i: number): QuestionEdition {
  if (q.choix.length <= LIMITES.choixMin || i < 0 || i >= q.choix.length) return q
  let bonne = q.bonne
  if (bonne !== null) {
    if (bonne === i) bonne = null
    else if (bonne > i) bonne = bonne - 1
  }
  return {
    ...q,
    choix: q.choix.filter((_, j) => j !== i),
    imagesChoix: q.imagesChoix ? q.imagesChoix.filter((_, j) => j !== i) : null,
    bonne,
    bonnes: q.bonnes.filter((b) => b !== i).map((b) => (b > i ? b - 1 : b)),
  }
}

// Passe une question à choix entre « une bonne réponse » et « plusieurs bonnes réponses » sans toucher aux propositions.
export function convertirQcm(q: QuestionEdition, vers: 'qcm' | 'qcm_multiple'): QuestionEdition {
  if (q.type === vers || !estQcm(q.type)) return q
  if (vers === 'qcm_multiple') {
    return { ...q, type: vers, bonnes: q.bonne !== null ? [q.bonne] : [], bonne: null }
  }
  // Plusieurs -> une seule : on garde la première bonne réponse cochée.
  const premiere = [...q.bonnes].sort((a, b) => a - b)[0]
  return { ...q, type: vers, bonne: premiere ?? null, bonnes: [] }
}

// Applique une permutation aux propositions : `ordre[k]` = ancien indice de la proposition qui passe en position k.
// La/les bonne(s) réponse(s) suivent leur proposition (indices recalculés).
function reordonner(q: QuestionEdition, ordre: number[]): QuestionEdition {
  const nouvelIndice = new Map<number, number>()
  ordre.forEach((ancien, k) => nouvelIndice.set(ancien, k))
  return {
    ...q,
    choix: ordre.map((ancien) => q.choix[ancien]),
    imagesChoix: q.imagesChoix ? ordre.map((ancien) => q.imagesChoix?.[ancien] ?? '') : null,
    bonne: q.bonne !== null && nouvelIndice.has(q.bonne) ? (nouvelIndice.get(q.bonne) as number) : q.bonne,
    bonnes: q.bonnes.map((b) => nouvelIndice.get(b) ?? b).sort((a, b) => a - b),
  }
}

// Déplace la proposition `de` vers la position `vers` (les autres se décalent).
export function deplacerProposition(q: QuestionEdition, de: number, vers: number): QuestionEdition {
  const n = q.choix.length
  if (de === vers || de < 0 || vers < 0 || de >= n || vers >= n) return q
  const ordre = q.choix.map((_, i) => i)
  const [pris] = ordre.splice(de, 1)
  ordre.splice(vers, 0, pris)
  return reordonner(q, ordre)
}

// Mélange Fisher-Yates ; avec au moins 2 propositions, l'ordre change toujours.
export function melangerPropositions(q: QuestionEdition, aleatoire: () => number = Math.random): QuestionEdition {
  const n = q.choix.length
  if (n < 2) return q
  const ordre = q.choix.map((_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(aleatoire() * (i + 1)))
    ;[ordre[i], ordre[j]] = [ordre[j], ordre[i]]
  }
  if (ordre.every((v, i) => v === i)) ordre.push(ordre.shift() as number) // identité : rotation d'un cran
  return reordonner(q, ordre)
}

// Ligne de la table `questions` telle que lue en base.
export interface LigneQuestion {
  id: string
  ordre: number
  type: TypeQuestion
  enonce: string
  choix: string[] | null
  bonne_reponse: number | null
  bonnes_reponses?: number[] | null
  annoncer_nombre?: boolean | null
  libelle_min: string | null
  libelle_max: string | null
  duree_secondes: number
  explication: string | null
  image_question?: string | null
  images_choix?: string[] | null
}

export function depuisLigne(l: LigneQuestion): QuestionEdition {
  return {
    id: l.id,
    type: l.type,
    enonce: l.enonce,
    choix: l.choix ?? [],
    bonne: l.bonne_reponse,
    bonnes: l.bonnes_reponses ?? [],
    annoncerNombre: l.annoncer_nombre ?? true,
    libelleMin: l.libelle_min ?? '',
    libelleMax: l.libelle_max ?? '',
    duree: l.duree_secondes,
    explication: l.explication ?? '',
    image: l.image_question ?? null,
    imagesChoix: l.images_choix ?? null,
  }
}

export function versLigne(q: QuestionEdition, quizId: string, ordre: number) {
  const qcm = estQcm(q.type)
  const multiple = q.type === 'qcm_multiple'
  const echelle = q.type === 'echelle'
  return {
    id: q.id,
    quiz_id: quizId,
    ordre,
    type: q.type,
    enonce: q.enonce.trim(),
    choix: qcm ? q.choix.map((c) => c.trim()) : null,
    bonne_reponse: q.type === 'qcm' ? q.bonne : null,
    bonnes_reponses: multiple ? [...new Set(q.bonnes)].sort((a, b) => a - b) : null,
    annoncer_nombre: multiple ? q.annoncerNombre : true,
    libelle_min: echelle && q.libelleMin.trim() ? q.libelleMin.trim() : null,
    libelle_max: echelle && q.libelleMax.trim() ? q.libelleMax.trim() : null,
    duree_secondes: q.duree,
    explication: q.explication.trim() ? q.explication.trim() : null,
    image_question: q.image || null,
    images_choix: qcm && q.imagesChoix ? q.imagesChoix.map((c) => c.trim()) : null,
  }
}

export interface ErreursQuestion {
  enonce?: string
  choix?: string
  bonne?: string
  libelles?: string
  explication?: string
  photosChoix?: string
}

export function validerQuestion(q: QuestionEdition): ErreursQuestion {
  const e: ErreursQuestion = {}
  const enonce = q.enonce.trim()
  if (!enonce && !q.image) e.enonce = 'Écris la question, ou ajoute une photo.'
  else if (enonce.length > LIMITES.enonce) e.enonce = `La question est trop longue (${LIMITES.enonce} caractères maximum).`

  if (estQcm(q.type)) {
    if (q.choix.length < LIMITES.choixMin) e.choix = 'Ajoute au moins 2 propositions.'
    else if (q.choix.length > LIMITES.choixMax) e.choix = 'Pas plus de 6 propositions.'
    else if (!q.imagesChoix && q.choix.some((c) => !c.trim())) e.choix = 'Remplis chaque proposition, ou retire celles qui sont vides.'
    else if (q.choix.some((c) => c.trim().length > LIMITES.choix)) e.choix = `Une proposition est trop longue (${LIMITES.choix} caractères maximum).`
    if (q.imagesChoix && !e.choix && (q.imagesChoix.length !== q.choix.length || q.imagesChoix.some((c) => !c))) {
      e.photosChoix = 'Ajoute une photo à chaque proposition, ou désactive « Propositions en photos ».'
    }
    if (q.type === 'qcm') {
      if (q.bonne === null || q.bonne < 0 || q.bonne >= q.choix.length) {
        e.bonne = 'Indique la bonne réponse en cochant une proposition.'
      }
    } else {
      const valides = new Set(q.bonnes.filter((b) => Number.isInteger(b) && b >= 0 && b < q.choix.length))
      if (valides.size < 2) {
        e.bonne = 'Coche au moins 2 bonnes réponses. Pour une seule bonne réponse, passe la question en « une bonne réponse ».'
      }
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

export function validerQuiz(quiz: QuizEdition): { titre?: string; description?: string; celebrations?: string; questions: ErreursQuestion[]; ok: boolean } {
  const titre = quiz.titre.trim()
  const r: { titre?: string; description?: string; celebrations?: string; questions: ErreursQuestion[]; ok: boolean } = {
    questions: quiz.questions.map(validerQuestion),
    ok: true,
  }
  if (!titre) r.titre = 'Donne un titre à ton quiz.'
  else if (titre.length > LIMITES.titre) r.titre = `Le titre est trop long (${LIMITES.titre} caractères maximum).`
  if (quiz.description.trim().length > LIMITES.description) {
    r.description = `La description est trop longue (${LIMITES.description} caractères maximum).`
  }
  r.celebrations = validerCelebrations(quiz.celebrations)
  r.ok = !r.titre && !r.description && !r.celebrations && !r.questions.some(aErreur)
  return r
}
