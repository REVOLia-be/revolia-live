import { supabase } from './supabase'

// Copie complète d'un quiz (description, célébrations, questions et leurs réglages).
// Les photos ne sont pas recopiées : la copie pointe vers les mêmes fichiers (c'est pourquoi on ne supprime jamais une photo déjà enregistrée).
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
      .select('id, ordre, type, enonce, choix, bonne_reponse, bonnes_reponses, annoncer_nombre, libelle_min, libelle_max, duree_secondes, explication, image_question, images_choix')
      .eq('quiz_id', quizId)
      .order('ordre')
    if (e3) throw e3
    if (lignes && lignes.length > 0) {
      // Nouveaux identifiants choisis ici : ils servent à rattacher les étapes des ateliers à leurs copies.
      const correspondance = new Map<string, string>()
      const copies = lignes.map((l: Record<string, unknown>) => {
        const nouvelId = crypto.randomUUID()
        correspondance.set(l.id as string, nouvelId)
        const { id: _ancien, ...reste } = l
        return { ...reste, id: nouvelId, quiz_id: nouveauId }
      })
      const { error: e4 } = await supabase.from('questions').insert(copies)
      if (e4) throw e4
      // Étapes des ateliers : copiées avec leurs fichiers (mêmes chemins, comme les photos).
      const idsAteliers = lignes.filter((l: Record<string, unknown>) => l.type === 'atelier').map((l: Record<string, unknown>) => l.id as string)
      if (idsAteliers.length > 0) {
        const { data: etapes, error: e5 } = await supabase
          .from('etapes_atelier')
          .select('question_id, ordre, titre, consigne, fichiers, liens, prompts, rendu_attendu')
          .in('question_id', idsAteliers)
          .order('ordre')
        if (e5) throw e5
        if (etapes && etapes.length > 0) {
          const { error: e6 } = await supabase
            .from('etapes_atelier')
            .insert(etapes.map((e) => ({ ...e, question_id: correspondance.get(e.question_id as string) })))
          if (e6) throw e6
        }
      }
    }
    return nouveauId
  } catch (e) {
    if (nouveauId) await supabase.from('quiz').delete().eq('id', nouveauId)
    throw e
  }
}
