// Transforme n'importe quelle erreur en phrase lisible par une débutante.
// Les fonctions du serveur (RPC) renvoient déjà des messages en français : on les affiche tels quels.

const MOTIFS_RESEAU = /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error/i

export const MESSAGE_RESEAU = 'Connexion perdue. On réessaie…'

function lireChamp(erreur: unknown, champ: string): unknown {
  if (erreur && typeof erreur === 'object' && champ in erreur) {
    return (erreur as Record<string, unknown>)[champ]
  }
  return undefined
}

export function estErreurReseau(erreur: unknown): boolean {
  if (erreur instanceof TypeError) return true
  const message = lireChamp(erreur, 'message')
  if (typeof message === 'string' && MOTIFS_RESEAU.test(message)) return true
  return typeof navigator !== 'undefined' && !navigator.onLine
}

// Code Postgres de l'erreur (ex. « 23505 » = déjà fait), utile pour réagir sans l'afficher.
export function codeErreur(erreur: unknown): string | undefined {
  const code = lireChamp(erreur, 'code')
  return typeof code === 'string' ? code : undefined
}

export function messageErreur(erreur: unknown): string {
  if (estErreurReseau(erreur)) return MESSAGE_RESEAU

  // Erreurs de connexion Supabase (en anglais) : on ne les montre jamais telles quelles.
  if (lireChamp(erreur, '__isAuthError')) {
    if (lireChamp(erreur, 'status') === 429) {
      return 'Trop de tentatives en peu de temps. Attends une minute puis réessaie.'
    }
    return "La connexion n'a pas abouti. Réessaie dans un instant."
  }

  const message = lireChamp(erreur, 'message')
  const code = codeErreur(erreur)
  // Message technique brut de la base ou de l'API (anglais, code PGRST…) : jamais montré.
  const technique =
    (code?.startsWith('PGRST') ?? false) ||
    /^(jwt|permission denied|new row|duplicate key|invalid input|could not|relation|function|column|null value|violates)/i.test(
      typeof message === 'string' ? message : '',
    )
  if (typeof message === 'string' && message.trim() && !technique) return message
  return "Quelque chose s'est mal passé. Réessaie dans un instant."
}
