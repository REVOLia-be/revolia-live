// Validation des questions, du titre et des célébrations d'un quiz, AVANT toute écriture en base.
// Ces règles reprennent exactement les contraintes SQL (tables `quiz` et `questions`) et y ajoutent
// quelques garde-fous de confort (propositions ≤ 100 caractères, pas de doublons).
// Les messages d'erreur sont écrits pour être compris et corrigés par une IA : ils disent
// quelle question, quel champ, quelle règle, et quoi faire.

export const TYPES = ['qcm', 'qcm_multiple', 'nuage', 'ouverte', 'echelle'] as const
export type TypeQuestion = (typeof TYPES)[number]

export const LIMITES = {
  titre: 120,
  description: 500,
  enonce: 300,
  proposition: 100, // limite de confort (écran projeté) ; la base n'en impose pas
  explication: 800,
  libelle: 40,
  duree: { min: 5, max: 600, defaut: 30 },
  choix: { min: 2, max: 6 },
  celebrationMessage: 140,
  celebrationsMax: 10,
  questionsParQuiz: 100,
} as const

const CHAMPS_QUESTION = [
  'type', 'enonce', 'choix', 'bonnes_reponses', 'annoncer_nombre',
  'libelle_min', 'libelle_max', 'duree_secondes', 'explication',
]

// Ligne prête à être écrite dans `questions` (hors quiz_id, ordre et id).
export interface LigneQuestion {
  type: TypeQuestion
  enonce: string
  choix: string[] | null
  bonne_reponse: number | null
  bonnes_reponses: number[] | null
  annoncer_nombre: boolean
  libelle_min: string | null
  libelle_max: string | null
  duree_secondes: number
  explication: string | null
}

export interface Celebration {
  apres_question: number
  message: string
}

const estEntier = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const absent = (v: unknown) => v === undefined || v === null

// Texte optionnel : absent/null/vide → null ; sinon chaîne nettoyée. Ajoute une erreur si le type est faux.
function texteOptionnel(v: unknown, champ: string, max: number, etiquette: string, erreurs: string[]): string | null {
  if (absent(v)) return null
  if (typeof v !== 'string') {
    erreurs.push(`${etiquette} : « ${champ} » doit être un texte.`)
    return null
  }
  const t = v.trim()
  if (t.length > max) {
    erreurs.push(`${etiquette} : « ${champ} » fait ${t.length} caractères, le maximum est ${max}. Raccourcis-le.`)
    return null
  }
  return t || null
}

// Valide une question au format « simple pour une IA ». `etiquette` ressemble à « question 3 ».
export function validerQuestion(
  brut: unknown,
  etiquette: string,
  options: { enonceVideAutorise?: boolean } = {},
): { ligne?: LigneQuestion; erreurs: string[] } {
  const erreurs: string[] = []
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    return { erreurs: [`${etiquette} : doit être un objet { type, enonce, ... }.`] }
  }
  const q = brut as Record<string, unknown>

  // Champs inconnus : on explique plutôt que d'ignorer en silence.
  for (const cle of Object.keys(q)) {
    if (CHAMPS_QUESTION.includes(cle)) continue
    if (/^image|photo/i.test(cle)) {
      erreurs.push(
        `${etiquette} : le champ « ${cle} » n'est pas géré ici. Les photos ne peuvent pas être ajoutées par cet outil : ` +
          `crée la question sans photo, puis demande au formateur de l'ajouter dans l'éditeur de quiz (lien fourni après la création).`,
      )
    } else if (cle === 'bonne_reponse') {
      erreurs.push(`${etiquette} : utilise « bonnes_reponses » (liste d'indices, base 0), même pour un QCM à une seule bonne réponse, ex. [2].`)
    } else {
      erreurs.push(`${etiquette} : champ inconnu « ${cle} ». Champs acceptés : ${CHAMPS_QUESTION.join(', ')}.`)
    }
  }

  const type = q.type as TypeQuestion
  if (!TYPES.includes(type)) {
    erreurs.push(`${etiquette} : « type » doit valoir l'un de : ${TYPES.join(', ')}.`)
    return { erreurs }
  }

  // Énoncé
  let enonce = ''
  if (typeof q.enonce !== 'string') {
    if (!options.enonceVideAutorise) erreurs.push(`${etiquette} : « enonce » est obligatoire (texte de la question, ${LIMITES.enonce} caractères maximum).`)
  } else {
    enonce = q.enonce.trim()
    if (!enonce && !options.enonceVideAutorise) erreurs.push(`${etiquette} : « enonce » ne peut pas être vide.`)
    if (enonce.length > LIMITES.enonce) {
      erreurs.push(`${etiquette} : l'énoncé fait ${enonce.length} caractères, le maximum est ${LIMITES.enonce}. Raccourcis-le.`)
    }
  }

  // Propositions et bonnes réponses
  let choix: string[] | null = null
  let bonneReponse: number | null = null
  let bonnes: number[] | null = null
  const brutChoix = q.choix
  const brutBonnes = q.bonnes_reponses

  if (type === 'qcm' || type === 'qcm_multiple') {
    const nom = type === 'qcm' ? 'un QCM' : 'un QCM à plusieurs bonnes réponses'
    if (!Array.isArray(brutChoix) || brutChoix.length < LIMITES.choix.min || brutChoix.length > LIMITES.choix.max) {
      erreurs.push(`${etiquette} : ${nom} doit avoir ${LIMITES.choix.min} à ${LIMITES.choix.max} propositions (« choix », liste de textes)${Array.isArray(brutChoix) ? `, il en a ${brutChoix.length}` : ''}.`)
    } else {
      const propositions: string[] = []
      brutChoix.forEach((c, i) => {
        if (typeof c !== 'string' || !c.trim()) {
          erreurs.push(`${etiquette} : la proposition ${i + 1} est vide ou n'est pas un texte.`)
          return
        }
        const t = c.trim()
        if (t.length > LIMITES.proposition) {
          erreurs.push(`${etiquette} : la proposition ${i + 1} fait ${t.length} caractères, le maximum est ${LIMITES.proposition} (elles sont projetées sur grand écran). Raccourcis-la.`)
        }
        propositions.push(t)
      })
      const vues = new Set(propositions.map((p) => p.toLowerCase()))
      if (vues.size !== propositions.length) erreurs.push(`${etiquette} : deux propositions sont identiques. Chaque proposition doit être différente.`)
      choix = propositions

      // Bonnes réponses : indices entiers, base 0, dans les bornes, sans doublon.
      const n = brutChoix.length
      if (!Array.isArray(brutBonnes) || brutBonnes.length === 0) {
        erreurs.push(`${etiquette} : « bonnes_reponses » est obligatoire (indices des bonnes propositions, en partant de 0 : la 1re proposition a l'indice 0).`)
      } else if (brutBonnes.some((b) => !estEntier(b) || b < 0 || b >= n)) {
        erreurs.push(`${etiquette} : « bonnes_reponses » doit contenir des entiers entre 0 et ${n - 1} (indices en partant de 0, il y a ${n} propositions).`)
      } else if (new Set(brutBonnes).size !== brutBonnes.length) {
        erreurs.push(`${etiquette} : « bonnes_reponses » contient un indice en double.`)
      } else if (type === 'qcm') {
        if (brutBonnes.length !== 1) {
          erreurs.push(`${etiquette} : un QCM a exactement une bonne réponse (« bonnes_reponses » a ${brutBonnes.length} éléments). Pour plusieurs bonnes réponses, utilise le type « qcm_multiple ».`)
        } else {
          bonneReponse = brutBonnes[0] as number
        }
      } else {
        const tries = [...(brutBonnes as number[])].sort((a, b) => a - b)
        if (tries.length < 2) {
          erreurs.push(`${etiquette} : un QCM à plusieurs bonnes réponses en demande au moins 2 (« bonnes_reponses » en a ${tries.length}). Pour une seule bonne réponse, utilise le type « qcm ».`)
        } else if (tries.length >= n) {
          erreurs.push(`${etiquette} : toutes les propositions ne peuvent pas être bonnes : garde au moins une mauvaise proposition.`)
        } else {
          bonnes = tries
        }
      }
    }
  } else {
    if (Array.isArray(brutChoix) ? brutChoix.length > 0 : !absent(brutChoix)) {
      erreurs.push(`${etiquette} : une question de type « ${type} » n'a pas de propositions : retire « choix ».`)
    }
    if (Array.isArray(brutBonnes) ? brutBonnes.length > 0 : !absent(brutBonnes)) {
      erreurs.push(`${etiquette} : une question de type « ${type} » n'a pas de bonne réponse : retire « bonnes_reponses ».`)
    }
  }

  // annoncer_nombre : n'a de sens que pour qcm_multiple (ignoré ailleurs). Par défaut : oui.
  if (!absent(q.annoncer_nombre) && typeof q.annoncer_nombre !== 'boolean') {
    erreurs.push(`${etiquette} : « annoncer_nombre » doit être true ou false.`)
  }
  const annoncer = typeof q.annoncer_nombre === 'boolean' ? q.annoncer_nombre : true

  // Libellés d'échelle (uniquement pour « echelle », ignorés ailleurs)
  const libMin = texteOptionnel(q.libelle_min, 'libelle_min', LIMITES.libelle, etiquette, erreurs)
  const libMax = texteOptionnel(q.libelle_max, 'libelle_max', LIMITES.libelle, etiquette, erreurs)

  // Durée
  let duree: number = LIMITES.duree.defaut
  if (!absent(q.duree_secondes)) {
    if (!estEntier(q.duree_secondes) || q.duree_secondes < LIMITES.duree.min || q.duree_secondes > LIMITES.duree.max) {
      erreurs.push(`${etiquette} : « duree_secondes » doit être un entier entre ${LIMITES.duree.min} et ${LIMITES.duree.max} (30 par défaut).`)
    } else {
      duree = q.duree_secondes
    }
  }

  const explication = texteOptionnel(q.explication, 'explication', LIMITES.explication, etiquette, erreurs)

  if (erreurs.length > 0) return { erreurs }
  return {
    erreurs,
    ligne: {
      type,
      enonce,
      choix,
      bonne_reponse: bonneReponse,
      bonnes_reponses: bonnes,
      annoncer_nombre: type === 'qcm_multiple' ? annoncer : true,
      libelle_min: type === 'echelle' ? libMin : null,
      libelle_max: type === 'echelle' ? libMax : null,
      duree_secondes: duree,
      explication,
    },
  }
}

// Valide une liste de questions ; renvoie toutes les erreurs d'un coup (numérotées à partir de `depart`).
export function validerQuestions(brutes: unknown, depart = 1): { lignes: LigneQuestion[]; erreurs: string[] } {
  if (!Array.isArray(brutes) || brutes.length === 0) {
    return { lignes: [], erreurs: ['« questions » doit être une liste d\'au moins une question.'] }
  }
  const lignes: LigneQuestion[] = []
  const erreurs: string[] = []
  brutes.forEach((b, i) => {
    const r = validerQuestion(b, `question ${depart + i}`)
    erreurs.push(...r.erreurs)
    if (r.ligne) lignes.push(r.ligne)
  })
  return { lignes, erreurs }
}

export function validerTitre(brut: unknown): { valeur?: string; erreurs: string[] } {
  if (typeof brut !== 'string' || !brut.trim()) return { erreurs: ['« titre » est obligatoire (texte non vide).'] }
  const t = brut.trim()
  if (t.length > LIMITES.titre) return { erreurs: [`« titre » fait ${t.length} caractères, le maximum est ${LIMITES.titre}.`] }
  return { valeur: t, erreurs: [] }
}

// Description facultative : null/absente/vide → null.
export function validerDescription(brut: unknown): { valeur: string | null; erreurs: string[] } {
  const erreurs: string[] = []
  const valeur = texteOptionnel(brut, 'description', LIMITES.description, 'quiz', erreurs)
  return { valeur, erreurs }
}

// Célébrations : [{ apres_question, message }], 0 à 10, positions uniques ≥ 1, message de 1 à 140 caractères.
// `nbQuestions` (si connu) : on refuse une célébration placée après une question qui n'existe pas.
export function validerCelebrations(brut: unknown, nbQuestions?: number): { valeur: Celebration[]; erreurs: string[] } {
  if (absent(brut)) return { valeur: [], erreurs: [] }
  if (!Array.isArray(brut)) return { valeur: [], erreurs: ['« celebrations » doit être une liste [{ apres_question, message }].'] }
  const erreurs: string[] = []
  if (brut.length > LIMITES.celebrationsMax) erreurs.push(`« celebrations » : ${LIMITES.celebrationsMax} célébrations au maximum (il y en a ${brut.length}).`)
  const valeur: Celebration[] = []
  const positions = new Set<number>()
  brut.forEach((c, i) => {
    const e = `célébration ${i + 1}`
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      erreurs.push(`${e} : doit être un objet { apres_question, message }.`)
      return
    }
    const { apres_question, message } = c as Record<string, unknown>
    if (!estEntier(apres_question) || apres_question < 1) {
      erreurs.push(`${e} : « apres_question » doit être un entier ≥ 1 (numéro de la question après laquelle le message s'affiche).`)
      return
    }
    if (nbQuestions !== undefined && apres_question > nbQuestions) {
      erreurs.push(`${e} : « apres_question » vaut ${apres_question} mais le quiz n'a que ${nbQuestions} question(s).`)
    }
    if (positions.has(apres_question)) erreurs.push(`${e} : deux célébrations sont placées après la question ${apres_question} ; une seule par position.`)
    positions.add(apres_question)
    const m = typeof message === 'string' ? message.trim() : ''
    if (!m || m.length > LIMITES.celebrationMessage) {
      erreurs.push(`${e} : « message » doit faire de 1 à ${LIMITES.celebrationMessage} caractères${m ? ` (il en fait ${m.length})` : ''}.`)
      return
    }
    valeur.push({ apres_question, message: m })
  })
  valeur.sort((a, b) => a.apres_question - b.apres_question)
  return { valeur, erreurs }
}
