// Petite mémoire du navigateur : retient la salle rejointe pour s'y retrouver après un rechargement.
// Tout est entouré de try/catch : le stockage peut être bloqué (navigation privée) sans casser l'appli.

export interface SalleMemorisee {
  sessionId: string
  pseudo: string
}

const cle = (code: string) => `revolia-live:salle:${code.toUpperCase()}`

export function lireSalle(code: string | undefined): SalleMemorisee | null {
  if (!code) return null
  try {
    const brut = window.localStorage.getItem(cle(code))
    if (!brut) return null
    const valeur = JSON.parse(brut)
    if (typeof valeur?.sessionId === 'string' && typeof valeur?.pseudo === 'string') return valeur
  } catch {
    // stockage indisponible : on continue sans mémoire
  }
  return null
}

export function memoriserSalle(code: string, salle: SalleMemorisee) {
  try {
    window.localStorage.setItem(cle(code), JSON.stringify(salle))
  } catch {
    // idem
  }
}

// Oublie la salle mémorisée (ancienne session de ce code : le formateur en a lancé une nouvelle).
export function oublierSalle(code: string) {
  try {
    window.localStorage.removeItem(cle(code))
  } catch {
    // idem
  }
}
