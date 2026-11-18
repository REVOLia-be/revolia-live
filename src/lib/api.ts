import { supabase } from './supabase'

// Appelle une fonction du serveur (RPC). En cas d'erreur, l'erreur est lancée :
// utilise messageErreur() (voir erreurs.ts) pour obtenir la phrase à afficher.
export async function appelerRpc<T>(nom: string, parametres?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nom, parametres)
  if (error) throw error
  return data as T
}
