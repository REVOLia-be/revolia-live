// Fonction Supabase Edge (Deno) : envoie par email le rapport d'un quiz à un participant.
//   POST { demande_id }  -> envoie l'email via Resend, marque la demande comme envoyée.
//   GET ?etat=1          -> (admin) indique si l'envoi d'emails et Circle sont configurés.
// Déployée avec la vérification JWT (verify_jwt = true, réglage par défaut).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { construireEmail } from './gabarit.ts'

const SITE_PAR_DEFAUT = 'https://quiz.revolia.be'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function repondre(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
// `erreur` suit le contrat ; `error` est le même texte, pour le style des autres fonctions.
const erreur = (statut: number, message: string, plus: Record<string, unknown> = {}) =>
  repondre(statut, { erreur: message, error: message, ...plus })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST' && req.method !== 'GET') return erreur(405, "Cette fonction s'utilise uniquement depuis l'application.")

  // --- 1. Qui appelle ? (jeton de l'utilisateur, anonyme ou formateur) ---
  const autorisation = req.headers.get('Authorization')
  if (!autorisation) return erreur(401, 'Tu dois être connecté pour faire cette demande. Recharge la page et réessaie.')
  const urlProjet = Deno.env.get('SUPABASE_URL') ?? ''
  const client = createClient(urlProjet, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false },
  })
  const { data: infos, error: erreurUtilisateur } = await client.auth.getUser()
  const utilisateur = infos?.user
  if (erreurUtilisateur || !utilisateur) {
    return erreur(401, 'Ta connexion a expiré. Recharge la page et réessaie.')
  }

  // --- 2. GET ?etat=1 : état de la configuration, réservé aux administrateurs ---
  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.get('etat') !== '1') return erreur(400, 'Demande non reconnue.')
    const { data: estAdmin, error: erreurAdmin } = await client.rpc('est_admin')
    if (erreurAdmin || estAdmin !== true) return erreur(403, "Cette information est réservée à l'administration.")
    return repondre(200, {
      resend: Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('RAPPORT_EXPEDITEUR')),
      circle: Boolean(Deno.env.get('CIRCLE_API_TOKEN')),
    })
  }

  // --- 3. POST { demande_id } ---
  let demandeId: unknown
  try {
    demandeId = (await req.json())?.demande_id
  } catch {
    return erreur(400, 'La demande est illisible. Recharge la page et réessaie.')
  }
  if (typeof demandeId !== 'string' || !UUID.test(demandeId)) {
    return erreur(400, "La demande n'est pas reconnue. Recharge la page et réessaie.")
  }

  // Clé service_role : uniquement ici, côté serveur (variable automatique de Supabase).
  const serveur = createClient(urlProjet, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })
  const { data: rapport, error: erreurRapport } = await serveur.rpc('rapport_pour_envoi', {
    p_demande: demandeId,
    p_utilisateur: utilisateur.id,
  })
  if (erreurRapport || !rapport || typeof rapport !== 'object') {
    console.error('rapport_pour_envoi a échoué :', erreurRapport?.message ?? 'réponse vide')
    return erreur(404, "Nous n'avons pas retrouvé ta demande de rapport. Redemande-le depuis l'écran de fin du quiz.")
  }
  const r = rapport as Record<string, unknown>

  const site = (Deno.env.get('SITE_URL') || SITE_PAR_DEFAUT).replace(/\/$/, '')
  const urlRapport = `${site}/rapport/${encodeURIComponent(String(r.jeton_rapport))}`

  // Secrets d'envoi absents : le téléphone affichera le lien direct vers le rapport.
  const cleResend = Deno.env.get('RESEND_API_KEY')
  const expediteur = Deno.env.get('RAPPORT_EXPEDITEUR')
  if (!cleResend || !expediteur) {
    return erreur(503, "L'envoi d'emails n'est pas encore configuré.", { url_rapport: urlRapport })
  }

  // --- 4. Construction et envoi ---
  const titre = String(r.quiz_titre ?? '').replace(/[\r\n]+/g, ' ').trim()
  const { html, text } = construireEmail({
    pseudo: r.pseudo as string | null,
    quiz_titre: titre,
    date: r.date as string | null,
    formateur_nom: r.formateur_nom as string | null,
    nb_questions: r.nb_questions as number | null,
    nb_bonnes: r.nb_bonnes as number | null,
    liens_suivi: r.liens_suivi as [] | null,
    jeton_rapport: String(r.jeton_rapport),
    jeton_newsletter: (r.newsletter_proposee ? r.jeton_newsletter : null) as string | null,
    url_confidentialite: r.url_confidentialite as string | null,
    site_url: site,
  })

  // Idempotence : un double clic (même tranche de 5 minutes) n'envoie qu'un seul email,
  // une nouvelle demande plus tard (autre adresse, par exemple) repart normalement.
  const tranche = Math.floor(Date.now() / (5 * 60 * 1000))
  let reponse: Response
  try {
    reponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleResend}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `rapport-${demandeId}-${tranche}`,
      },
      body: JSON.stringify({ from: expediteur, to: [String(r.email)], subject: `Ton rapport — ${titre}`, html, text }),
    })
  } catch (e) {
    console.error('Resend injoignable :', e instanceof Error ? e.message : 'inconnu')
    return erreur(502, "L'email n'a pas pu partir pour le moment. Réessaie dans un instant.", { url_rapport: urlRapport })
  }
  if (!reponse.ok) {
    let detail = ''
    try { detail = JSON.stringify(await reponse.json()).slice(0, 500) } catch { /* illisible */ }
    console.error('Erreur Resend, statut', reponse.status, detail)
    return erreur(502, "L'email n'a pas pu partir. Vérifie ton adresse email, puis réessaie dans un instant.", { url_rapport: urlRapport })
  }

  const { error: erreurMarque } = await serveur.rpc('rapport_marquer_envoye', { p_demande: demandeId })
  if (erreurMarque) console.error('rapport_marquer_envoye a échoué :', erreurMarque.message) // l'email est parti : on répond quand même OK

  return repondre(200, { ok: true, url_rapport: urlRapport })
})
