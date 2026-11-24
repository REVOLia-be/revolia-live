// Fonction Supabase Edge (Deno) : confirme l'inscription à la newsletter (double consentement).
//   POST { jeton }  ->  { ok: true, deja: bool }
// Déployée SANS vérification JWT (appelée par une page publique) : supabase functions deploy newsletter-confirmer --no-verify-jwt
// Le jeton (uuid secret reçu par email) est la seule preuve ; la base le consomme en un usage.
// Si Circle est absent ou en échec, la confirmation reste enregistrée et on répond quand même ok.

import { createClient } from 'npm:@supabase/supabase-js@2'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CIRCLE = 'https://app.circle.so/api/admin/v2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function repondre(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const erreur = (statut: number, message: string) => repondre(statut, { erreur: message, error: message })

async function appelCircle(jeton: string, chemin: string, corps: unknown): Promise<{ statut: number; detail: string }> {
  const r = await fetch(`${CIRCLE}${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(corps),
  })
  let detail = ''
  try { detail = (await r.text()).slice(0, 300) } catch { /* illisible */ }
  return { statut: r.status, detail }
}

// Ajoute le contact dans Circle (contact non membre + étiquette). Ne lève jamais : tout échec est journalisé.
async function ajouterDansCircle(email: string): Promise<void> {
  const jeton = Deno.env.get('CIRCLE_API_TOKEN')
  if (!jeton) return
  const brut = Deno.env.get('CIRCLE_TAG_NEWSLETTER_ID')
  const etiquette = brut && /^\d+$/.test(brut.trim()) ? Number(brut.trim()) : null
  try {
    const lead = await appelCircle(jeton, '/community_leads', {
      email,
      ...(etiquette ? { member_tag_ids: [etiquette] } : {}),
    })
    if (lead.statut >= 200 && lead.statut < 300) return
    if (lead.statut === 422) {
      // Déjà membre ou déjà contact : c'est acceptable. On tente quand même d'appliquer l'étiquette.
      if (etiquette) {
        const t = await appelCircle(jeton, '/tagged_members', { member_tag_id: etiquette, user_email: email })
        if (t.statut < 200 || t.statut >= 300) console.error('Circle : étiquette non appliquée, statut', t.statut)
      }
      return
    }
    console.error('Circle : création du contact refusée, statut', lead.statut, lead.detail)
  } catch (e) {
    console.error('Circle injoignable :', e instanceof Error ? e.message : 'inconnu')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return erreur(405, "Cette fonction s'utilise uniquement depuis la page de confirmation.")

  let jeton: unknown
  try {
    jeton = (await req.json())?.jeton
  } catch {
    return erreur(400, 'La demande est illisible. Recharge la page et réessaie.')
  }
  if (typeof jeton !== 'string' || !UUID.test(jeton)) return erreur(400, "Ce lien n'est plus valide.")

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })
  const { data, error } = await admin.rpc('newsletter_confirmer', { p_jeton: jeton })
  if (error || !data || typeof data !== 'object') {
    console.error('newsletter_confirmer a échoué :', error?.message ?? 'réponse vide')
    return erreur(404, "Ce lien n'est plus valide.")
  }
  const { email, deja_confirmee } = data as { email?: string; deja_confirmee?: boolean }
  if (deja_confirmee) return repondre(200, { ok: true, deja: true })

  if (email) await ajouterDansCircle(email)
  return repondre(200, { ok: true, deja: false })
})
