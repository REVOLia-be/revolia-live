import { supabase } from './supabase'

// Copie complète d'un quiz (description, célébrations, questions et leurs réglages).
// La copie appartient à `proprietaireId` : pour un formateur, lui-même ; pour un admin qui
// duplique le quiz d'un autre, l'admin. Si quelque chose échoue, aucune copie à moitié faite ne reste.
export async function dupliquerQuiz(quizId: string, proprietaireId: string): Promise<string> {
  let nouveauId: string | null = null
  try {
    const { data: original, error } = await supabase
      .from('quiz')
      .select('titre, description, celebrations')
      .eq('id', quizId)
      .single()
    if (error) throw error
    const suffixe = ' (copie)'
    const titre = original.titre.slice(0, 120 - suffixe.length) + suffixe
    const { data: copie, error: e2 } = await supabase
      .from('quiz')
      .insert({ formateur_id: proprietaireId, titre, description: original.description, celebrations: original.celebrations })
      .select('id')
      .single()
    if (e2) throw e2
    nouveauId = copie.id as string
    const { data: lignes, error: e3 } = await supabase
      .from('questions')
      .select('ordre, type, enonce, choix, bonne_reponse, bonnes_reponses, annoncer_nombre, libelle_min, libelle_max, duree_secondes, explication')
      .eq('quiz_id', quizId)
      .order('ordre')
    if (e3) throw e3
    if (lignes && lignes.length > 0) {
      const { error: e4 } = await supabase
        .from('questions')
        .insert(lignes.map((l: Record<string, unknown>) => ({ ...l, quiz_id: nouveauId })))
      if (e4) throw e4
    }
    return nouveauId
  } catch (e) {
    if (nouveauId) await supabase.from('quiz').delete().eq('id', nouveauId)
    throw e
  }
}
