import { construireCsv, dateDuJour, simplifierTitre, telechargerCsv, type LigneExport, type PropositionsPhotos } from './csv'
import { supabase } from './supabase'

// Télécharge le CSV des résultats d'une session (utilisé par « Mes sessions passées » et par l'écran final).
export async function exporterSession(sessionId: string, titre: string): Promise<void> {
  const { data, error } = await supabase.rpc('export_session', { p_session: sessionId })
  if (error) throw error
  // Questions en photos : on récupère leurs propositions pour écrire « Photo A », « Photo B »… quand il n'y a pas de légende.
  // Si cette lecture échoue, l'export reste possible (les réponses sans légende resteront vides).
  const photos = new Map<number, PropositionsPhotos>()
  try {
    const { data: qs } = await supabase
      .from('questions_session')
      .select('ordre, choix, images_choix')
      .eq('session_id', sessionId)
      .not('images_choix', 'is', null)
    for (const q of (qs ?? []) as { ordre: number; choix: string[]; images_choix: string[] }[]) {
      photos.set(q.ordre, { choix: q.choix, images_choix: q.images_choix })
    }
  } catch {
    /* silencieux */
  }
  const contenu = construireCsv((data ?? []) as LigneExport[], photos)
  telechargerCsv(contenu, `revolia-live-${simplifierTitre(titre)}-${dateDuJour()}.csv`)
}
