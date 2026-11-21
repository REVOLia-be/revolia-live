import { construireCsv, dateDuJour, simplifierTitre, telechargerCsv, type LigneExport } from './csv'
import { supabase } from './supabase'

// Télécharge le CSV des résultats d'une session (utilisé par « Mes sessions passées » et par l'écran final).
export async function exporterSession(sessionId: string, titre: string): Promise<void> {
  const { data, error } = await supabase.rpc('export_session', { p_session: sessionId })
  if (error) throw error
  const contenu = construireCsv((data ?? []) as LigneExport[])
  telechargerCsv(contenu, `revolia-live-${simplifierTitre(titre)}-${dateDuJour()}.csv`)
}
