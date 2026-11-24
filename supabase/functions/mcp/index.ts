// Serveur MCP distant de REVOLia Live (Edge Function Supabase, Deno).
// Permet à Claude ou ChatGPT (connecteur personnalisé) de créer et gérer les quiz d'un formateur.
//
// Choix de bibliothèque : SDK officiel `@modelcontextprotocol/sdk` 1.32.2 (version figée), avec son transport
// `WebStandardStreamableHTTPServerTransport` (API Request/Response standard, donc compatible Deno) en mode
// SANS ÉTAT : une instance serveur + transport par requête, aucun identifiant de session à conserver.
// C'est la bibliothèque de référence, maintenue avec la spécification MCP : pas de réécriture du protocole à maintenir.
//
// Sécurité (voir README.md) :
//   * authentification OAuth 2.1 faite ICI (la fonction est déployée avec verify_jwt = false) ;
//   * toutes les données sont lues/écrites avec le jeton de l'utilisateur : la RLS s'applique, jamais de service_role ;
//   * seuls les formateurs actifs passent ; les comptes anonymes (participants) sont refusés ;
//   * aucun pseudo de participant ne sort jamais ; aucun outil ne supprime un quiz ;
//   * photos : récupérées et réduites ICI (photos.ts), déposées dans le stockage avec le jeton de l'utilisateur
//     (politiques de stockage) ; la base ne garde que le chemin.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/webStandardStreamableHttp.js'
import { z } from 'npm:zod@3.25.76'
import {
  LIMITES,
  TYPES,
  validerCelebrations,
  validerDescription,
  validerQuestion,
  validerQuestions,
  validerTitre,
  type LigneQuestion,
} from './validation.ts'
import { ErreurPhoto, LIMITES_PHOTO, REGLAGES, TYPES_MIME, decoderBase64, preparerPhoto, telechargerPhoto, type GenrePhoto, type PhotoPreparee } from './photos.ts'

// ---------------------------------------------------------------------------
// Adresses
// ---------------------------------------------------------------------------
const URL_PROJET = (Deno.env.get('SUPABASE_URL') ?? 'https://igwnzxyraxxyaprdkkvu.supabase.co').replace(/\/$/, '')
const URL_PUBLIQUE = (Deno.env.get('MCP_PUBLIC_URL') ?? `${URL_PROJET}/functions/v1/mcp`).replace(/\/$/, '')
// Adresse personnalisée : le relais Cloudflare de quiz.revolia.be/mcp ajoute l'en-tête
// `X-REVOLia-Proxy: 1`. La valeur annoncée est fixe (liste blanche) : un en-tête forgé
// ne peut pas faire annoncer une autre adresse.
const URL_PERSONNALISEE = 'https://quiz.revolia.be/mcp'
function urlPublique(req: Request): string {
  return req.headers.get('x-revolia-proxy') === '1' ? URL_PERSONNALISEE : URL_PUBLIQUE
}
function urlMetadonnees(base: string): string {
  return `${base}/.well-known/oauth-protected-resource`
}
const SERVEUR_AUTORISATION = `${URL_PROJET}/auth/v1`
const URL_APPLI = 'https://quiz.revolia.be'
const lienQuiz = (id: string) => `${URL_APPLI}/formateur/quiz/${id}`
const BUCKET_PHOTOS = 'quiz-images'
// Adresse publique d'une photo (bucket public) ; la base ne garde que le chemin `<uuid formateur>/<uuid>.<ext>`.
const urlPhoto = (chemin: string) => `${URL_PROJET}/storage/v1/object/public/${BUCKET_PHOTOS}/${chemin}`
const CHEMIN_PHOTO = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|png)$/

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
}

function json(statut: number, corps: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  })
}

// ---------------------------------------------------------------------------
// Métadonnées de ressource protégée (RFC 9728)
// ---------------------------------------------------------------------------
function metadonneesRessource(base: string): Response {
  return json(
    200,
    {
      resource: base,
      authorization_servers: [SERVEUR_AUTORISATION],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'email', 'profile'],
      resource_name: 'REVOLia Live',
    },
    { 'Cache-Control': 'public, max-age=300' },
  )
}

// Dans une Edge Function, le chemin reçu commence par `/mcp` (ou `/functions/v1/mcp` selon la passerelle).
// On renvoie la partie qui suit « mcp » ('' si c'est la racine), ou null si ce n'est pas notre chemin.
function sousChemin(pathname: string): string | null {
  const p = pathname.replace(/^\/functions\/v1(?=\/)/, '')
  if (p === '/mcp') return ''
  if (p.startsWith('/mcp/')) return p.slice('/mcp'.length)
  return null
}

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------
function nonAutorise(description: string, invalide: boolean, base: string): Response {
  const defi =
    `Bearer ${invalide ? `error="invalid_token", error_description="${description}", ` : ''}resource_metadata="${urlMetadonnees(base)}"`
  return json(401, { error: invalide ? 'invalid_token' : 'unauthorized', error_description: description }, { 'WWW-Authenticate': defi })
}

interface Identite {
  jeton: string
  uid: string
}

async function authentifier(req: Request): Promise<Identite | Response> {
  const base = urlPublique(req)
  const entete = req.headers.get('Authorization') ?? ''
  const m = /^Bearer\s+(\S+)$/i.exec(entete)
  if (!m) return nonAutorise("Connexion requise : aucun jeton d'accès fourni.", false, base)
  const jeton = m[1]

  const verif = createClient(URL_PROJET, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await verif.auth.getUser(jeton)
  if (error && (error.status ?? 0) >= 500) {
    return json(503, { error: 'temporarily_unavailable', error_description: "Le service de connexion est momentanément indisponible. Réessaie dans un instant." })
  }
  if (error || !data.user) return nonAutorise("Le jeton d'accès est invalide ou expiré. Reconnecte-toi.", true, base)
  // Les participants des quiz sont des comptes anonymes : ils n'ont rien à faire ici.
  if (data.user.is_anonymous) return nonAutorise("Ce jeton appartient à un compte anonyme. Connecte-toi avec ton compte formateur.", true, base)
  return { jeton, uid: data.user.id }
}

// ---------------------------------------------------------------------------
// Erreurs d'outil et accès aux données
// ---------------------------------------------------------------------------
class ErreurMetier extends Error {}
function refuser(...lignes: string[]): never {
  throw new ErreurMetier(lignes.join('\n'))
}

// Traduit une erreur Supabase en phrase claire (jamais de code brut ; on journalise seulement le code).
// deno-lint-ignore no-explicit-any
function echec(e: any, action: string): never {
  console.error('Erreur base de données', action, e?.code ?? '')
  if (e?.code === '42501') throw new ErreurMetier(`Action refusée : ton compte n'a pas le droit de ${action}.`)
  if (e?.code === '23514' || e?.code === '23502') {
    throw new ErreurMetier(`La base a refusé ces données lors de l'action « ${action} » : une règle de contenu n'est pas respectée. Vérifie les longueurs, les indices et les types.`)
  }
  throw new ErreurMetier(`Impossible de ${action} pour le moment. Réessaie dans un instant.`)
}

const texteResultat = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const erreurOutil = (t: string) => ({ isError: true, content: [{ type: 'text' as const, text: t }] })

interface Contexte {
  sb: SupabaseClient
  uid: string
  verifierFormateur: () => Promise<string | null>
}

// Enveloppe commune : vérifie que c'est un formateur actif, convertit les erreurs en message d'outil.
function outil<A>(ctx: Contexte, fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      const refus = await ctx.verifierFormateur()
      if (refus) return erreurOutil(refus)
      const r = await fn(args)
      return texteResultat(typeof r === 'string' ? r : JSON.stringify(r, null, 2))
    } catch (e) {
      if (e instanceof ErreurMetier) return erreurOutil(e.message)
      console.error('Erreur inattendue', e instanceof Error ? e.name : '')
      return erreurOutil("Une erreur inattendue s'est produite. Réessaie dans un instant ; si cela continue, préviens JF.")
    }
  }
}

// Colonnes de `questions` qui décrivent le contenu (on les relit toujours en entier pour pouvoir réécrire une ligne complète).
// deno-lint-ignore no-explicit-any
type Ligne = Record<string, any>

async function chargerQuiz(ctx: Contexte, quizId: string): Promise<Ligne> {
  const { data, error } = await ctx.sb.from('quiz').select('*').eq('id', quizId).eq('formateur_id', ctx.uid).maybeSingle()
  if (error) echec(error, 'lire ce quiz')
  if (!data) refuser("Quiz introuvable : l'identifiant ne correspond à aucun de tes quiz. Utilise lister_mes_quiz pour retrouver le bon.")
  return data
}

async function chargerQuestions(ctx: Contexte, quizId: string): Promise<Ligne[]> {
  const { data, error } = await ctx.sb.from('questions').select('*').eq('quiz_id', quizId).order('ordre')
  if (error) echec(error, 'lire les questions')
  return data ?? []
}

// Les modifications de questions ne déclenchent pas le trigger du quiz : on met la date à jour nous-mêmes.
async function toucherQuiz(ctx: Contexte, quizId: string) {
  await ctx.sb.from('quiz').update({ modifie_le: new Date().toISOString() }).eq('id', quizId).eq('formateur_id', ctx.uid)
}

// Représentation d'une question pour l'IA (sans les champs techniques).
function presenterQuestion(q: Ligne, numero: number) {
  const bonnes: number[] | null = q.type === 'qcm' ? (q.bonne_reponse === null ? null : [q.bonne_reponse]) : (q.bonnes_reponses ?? null)
  return {
    numero,
    id: q.id,
    type: q.type,
    enonce: q.enonce,
    ...(q.choix ? { choix: q.choix } : {}),
    ...(bonnes ? { bonnes_reponses: bonnes, bonnes_reponses_texte: bonnes.map((i) => q.choix?.[i]) } : {}),
    ...(q.type === 'qcm_multiple' ? { annoncer_nombre: q.annoncer_nombre } : {}),
    ...(q.type === 'echelle' ? { libelle_min: q.libelle_min, libelle_max: q.libelle_max } : {}),
    duree_secondes: q.duree_secondes,
    explication: q.explication ?? null,
    ...(q.image_question ? { photo_question: urlPhoto(q.image_question) } : {}),
    ...(q.images_choix ? { photos_propositions: (q.images_choix as string[]).map(urlPhoto) } : {}),
  }
}

// Question existante → format d'entrée (pour fusionner une modification).
function versEntree(q: Ligne): Record<string, unknown> {
  return {
    type: q.type,
    enonce: q.enonce,
    choix: q.choix ?? undefined,
    bonnes_reponses: q.type === 'qcm' ? (q.bonne_reponse === null ? undefined : [q.bonne_reponse]) : (q.bonnes_reponses ?? undefined),
    annoncer_nombre: q.annoncer_nombre,
    libelle_min: q.libelle_min ?? undefined,
    libelle_max: q.libelle_max ?? undefined,
    duree_secondes: q.duree_secondes,
    explication: q.explication ?? undefined,
  }
}

const rapport = (erreurs: string[]): never =>
  refuser(
    `Rien n'a été enregistré : ${erreurs.length} problème(s) à corriger puis renvoie la demande complète.`,
    ...erreurs.map((e) => `- ${e}`),
  )

// Réécrit les lignes données (complètes) avec un nouvel ordre, en UNE requête (la contrainte d'unicité (quiz_id, ordre)
// est différée : elle n'est vérifiée qu'à la fin de la requête, donc les permutations passent).
async function ecrireOrdre(ctx: Contexte, lignes: Ligne[], action: string) {
  if (lignes.length === 0) return
  const { error } = await ctx.sb.from('questions').upsert(lignes, { onConflict: 'id' })
  if (error) echec(error, action)
}

// ---------------------------------------------------------------------------
// Photos : récupération, dépôt dans le stockage, nettoyage
// ---------------------------------------------------------------------------
interface SourcePhoto {
  url?: string
  base64?: string
  type_mime?: string
}

// Transforme une source (URL ou base64) en petite image prête à déposer. `budget` suit le total des octets
// base64 décodés d'un même appel (le téléchargement par URL est déjà borné à 5 Mo par photo).
async function obtenirPhoto(source: SourcePhoto, genre: GenrePhoto, etiquette: string, budget: { octets: number }): Promise<PhotoPreparee> {
  try {
    const a = source?.url !== undefined && source.url !== null
    const b = source?.base64 !== undefined && source.base64 !== null
    if (a === b) throw new ErreurPhoto('« source » doit contenir EXACTEMENT un de : { url: "https://…" } ou { base64: "…", type_mime: "image/jpeg" | "image/png" | "image/webp" }.')
    let octets: Uint8Array
    let typeAnnonce: string | undefined
    if (a) {
      if (typeof source.url !== 'string') throw new ErreurPhoto('« url » doit être un texte.')
      if (source.type_mime !== undefined) throw new ErreurPhoto('« type_mime » ne s\'utilise qu\'avec « base64 » : pour une url, le type est contrôlé sur le contenu.')
      octets = await telechargerPhoto(source.url)
    } else {
      if (typeof source.base64 !== 'string') throw new ErreurPhoto('« base64 » doit être un texte.')
      if (!source.type_mime || !(TYPES_MIME as readonly string[]).includes(source.type_mime)) {
        throw new ErreurPhoto(`Avec « base64 », « type_mime » est obligatoire et vaut ${TYPES_MIME.join(', ')}.`)
      }
      typeAnnonce = source.type_mime
      octets = decoderBase64(source.base64)
      budget.octets += octets.byteLength
      if (budget.octets > LIMITES_PHOTO.totalOctetsParAppel) {
        throw new ErreurPhoto(`Trop de données en base64 dans un seul appel (maximum ${LIMITES_PHOTO.totalOctetsParAppel / 1048576} Mo décodés au total). Utilise des adresses https:// ou envoie les photos en plusieurs appels.`)
      }
    }
    return await preparerPhoto(octets, genre, typeAnnonce)
  } catch (e) {
    if (e instanceof ErreurPhoto) refuser(`${etiquette} : ${e.message}`)
    throw e
  }
}

// Dépose la photo à `<uid>/<uuid>.<ext>` avec le jeton de l'utilisateur (les politiques de stockage s'appliquent).
async function deposerPhoto(ctx: Contexte, photo: PhotoPreparee): Promise<string> {
  const chemin = `${ctx.uid}/${crypto.randomUUID()}.${photo.extension}`
  const { error } = await ctx.sb.storage.from(BUCKET_PHOTOS).upload(chemin, photo.octets, { contentType: photo.contentType, upsert: false, cacheControl: '31536000' })
  if (error) {
    console.error('Dépôt de photo', (error as { statusCode?: string }).statusCode ?? '')
    refuser("Le dépôt de la photo dans le stockage a échoué. Réessaie dans un instant ; si cela continue, préviens JF.")
  }
  return chemin
}

// Supprime des fichiers qu'on vient d'envoyer (annulation) ou dont plus rien ne dépend. Silencieux : un fichier
// orphelin ne gêne personne.
async function supprimerFichiers(ctx: Contexte, chemins: string[]) {
  const surs = chemins.filter((c) => CHEMIN_PHOTO.test(c) && c.startsWith(`${ctx.uid}/`))
  if (surs.length === 0) return
  try {
    await ctx.sb.storage.from(BUCKET_PHOTOS).remove(surs)
  } catch (e) {
    console.error('Suppression de photo', e instanceof Error ? e.name : '')
  }
}

// Supprime une ancienne photo seulement si elle est dans le dossier de l'utilisateur ET qu'aucune question (autre quiz,
// quiz copié) ni aucune session déjà lancée (copie des photos) ne l'utilise encore. Au moindre doute : on garde.
async function supprimerSiInutilisee(ctx: Contexte, anciens: (string | null | undefined)[]) {
  for (const chemin of new Set(anciens.filter((c): c is string => !!c && c.startsWith(`${ctx.uid}/`) && CHEMIN_PHOTO.test(c)))) {
    let utilisee = false
    for (const table of ['questions', 'questions_session']) {
      for (const filtre of [(r: any) => r.eq('image_question', chemin), (r: any) => r.contains('images_choix', [chemin])]) {
        const { count, error } = await filtre(ctx.sb.from(table).select('id', { count: 'exact', head: true }))
        if (error || (count ?? 1) > 0) utilisee = true
      }
    }
    if (!utilisee) await supprimerFichiers(ctx, [chemin])
  }
}

// Écrit les colonnes photo d'une question (RLS) et vérifie qu'une ligne a bien été modifiée.
async function ecrirePhotos(ctx: Contexte, cible: Ligne, quizId: string, maj: Ligne) {
  const { data, error } = await ctx.sb.from('questions').update(maj).eq('id', cible.id).eq('quiz_id', quizId).select('id')
  if (error) echec(error, 'enregistrer la photo')
  if (!data || data.length !== 1) refuser("La question n'a pas pu être modifiée (elle a peut-être été supprimée entre-temps). Relis le quiz avec lire_quiz.")
}

const RAPPEL_DROITS = "Rappel : n'utilise que des images libres de droits ou fournies par le formateur, et aucune personne reconnaissable sans son accord."

const decrire = (p: PhotoPreparee, chemin: string) => ({
  url_publique: urlPhoto(chemin),
  format: p.extension === 'webp' ? 'WebP' : 'JPEG',
  dimensions: `${p.largeur} × ${p.hauteur} px`,
  poids_ko: Math.round((p.octets.byteLength / 1024) * 10) / 10,
})

// ---------------------------------------------------------------------------
// Schémas d'entrée (zod). Les bornes détaillées sont vérifiées dans validation.ts, qui produit des messages
// plus précis que ceux de zod ; le schéma sert surtout à bien décrire les champs à l'IA.
// ---------------------------------------------------------------------------
const questionSchema = z
  .object({
    type: z.enum(TYPES).describe(
      "qcm = une seule bonne réponse ; qcm_multiple = plusieurs bonnes réponses ; nuage = réponse en un mot (nuage de mots) ; ouverte = réponse libre courte ; echelle = note de 1 à 5.",
    ),
    enonce: z.string().describe(`Texte de la question, ${LIMITES.enonce} caractères maximum. Court, clair, sans piège.`),
    choix: z
      .array(z.string())
      .optional()
      .describe(`Propositions (qcm et qcm_multiple uniquement) : ${LIMITES.choix.min} à ${LIMITES.choix.max}, de ${LIMITES.proposition} caractères maximum chacune, toutes différentes. Interdit pour les autres types.`),
    bonnes_reponses: z
      .array(z.number().int())
      .optional()
      .describe('Indices des bonnes propositions, en partant de 0 (la 1re proposition = 0). qcm : exactement 1 indice, ex. [2]. qcm_multiple : au moins 2 indices et jamais toutes les propositions. Interdit pour les autres types.'),
    annoncer_nombre: z.boolean().optional().describe('qcm_multiple uniquement : annoncer aux participants combien de réponses cocher (défaut true).'),
    libelle_min: z.string().optional().describe(`echelle uniquement : texte de la note 1 (ex. « Pas du tout »), ${LIMITES.libelle} caractères maximum.`),
    libelle_max: z.string().optional().describe(`echelle uniquement : texte de la note 5 (ex. « Tout à fait »), ${LIMITES.libelle} caractères maximum.`),
    duree_secondes: z.number().int().optional().describe(`Temps pour répondre, de ${LIMITES.duree.min} à ${LIMITES.duree.max} secondes (défaut ${LIMITES.duree.defaut}).`),
    explication: z
      .string()
      .optional()
      .describe(`Le « Pourquoi ? » : 2 à 4 phrases bienveillantes affichées à toute la salle après la question, ${LIMITES.explication} caractères maximum. Recommandé pour chaque question.`),
  })
  .passthrough() // on laisse passer les champs inconnus (ex. photos) pour les refuser avec un message explicatif

const celebrationsSchema = z
  .array(z.object({ apres_question: z.number().int(), message: z.string() }))
  .describe(`Messages de célébration affichés à toute la salle : [{ apres_question: numéro de la question (≥ 1), message: ${LIMITES.celebrationMessage} caractères maximum }]. ${LIMITES.celebrationsMax} au maximum, une seule par position.`)

const sourceSchema = z
  .object({
    url: z.string().optional().describe('Adresse https:// publique qui mène DIRECTEMENT à l\'image (pas une page web). 5 Mo maximum, ports et adresses IP refusés.'),
    base64: z.string().optional().describe(`Contenu de l'image en base64 (sans préfixe data:), ${(LIMITES_PHOTO.base64Octets / 1048576).toFixed(1).replace('.', ',')} Mo maximum une fois décodé. À n'utiliser que si tu n'as pas d'adresse https://.`),
    type_mime: z.enum(TYPES_MIME).optional().describe('Obligatoire avec base64 : image/jpeg, image/png ou image/webp (contrôlé sur le contenu réel).'),
  })
  .describe(`La photo : EXACTEMENT un de { url: "https://…" } ou { base64: "…", type_mime: "image/jpeg" | "image/png" | "image/webp" }. JPEG, PNG ou WebP uniquement (vérifié sur le contenu). Elle est réduite automatiquement. ${RAPPEL_DROITS}`)

const idQuiz = z.string().describe("Identifiant du quiz (uuid, fourni par lister_mes_quiz ou creer_quiz).")

// ---------------------------------------------------------------------------
// Construction du serveur MCP (un par requête)
// ---------------------------------------------------------------------------
const INSTRUCTIONS =
  "REVOLia Live est un outil de quiz en direct, pédagogique et 100 % coopératif, pour des formations en présentiel auprès de débutants en IA. " +
  "Il n'y a jamais de classement, de rang ni de comparaison entre personnes : ne propose rien qui en crée. " +
  "Écris des questions courtes, bienveillantes et adaptées à des débutants (vocabulaire simple, jamais piégeux). " +
  `Propositions de QCM : ${LIMITES.proposition} caractères maximum, de même longueur et de même forme. ` +
  "Ajoute si possible un « Pourquoi ? » (explication) à chaque question. " +
  "Photos : tu peux en ajouter avec ajouter_photo_question (une photo pour la question) ou definir_photos_propositions (une photo par proposition d'un QCM : toutes ou aucune), et les retirer avec retirer_photo_question / retirer_photos_propositions. " +
  "Une source = EXACTEMENT une adresse https:// ({ url }) ou un contenu base64 ({ base64, type_mime }) ; JPEG, PNG ou WebP ; 5 Mo maximum par adresse, 1,5 Mo en base64 ; les photos sont réduites automatiquement (1280 px et 250 Ko pour une question, 640 px et 80 Ko pour une proposition) et celles qui restent trop lourdes sont refusées. " +
  "N'utilise que des images libres de droits ou fournies par le formateur, et aucune personne reconnaissable sans son accord ; en cas de doute, demande au formateur de fournir la photo. " +
  "Crée d'abord le quiz et ses questions, puis ajoute les photos question par question (lire_quiz indique les photos présentes et leur adresse publique). " +
  "Tu ne peux pas supprimer un quiz ni lancer une session en direct ; le formateur le fait dans l'application.";

function construireServeur(ctx: Contexte): McpServer {
  const serveur = new McpServer({ name: 'revolia-live', version: '1.1.0' }, { instructions: INSTRUCTIONS })
  const lecture = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  const ecriture = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

  // 1. lister_mes_quiz
  serveur.registerTool(
    'lister_mes_quiz',
    {
      title: 'Lister mes quiz',
      description: "Liste les quiz du formateur connecté (les siens uniquement) : id, titre, description, nombre de questions, types de questions présents, date de dernière modification et lien d'édition. Commence par là pour retrouver l'id d'un quiz.",
      inputSchema: {},
      annotations: lecture,
    },
    outil(ctx, async () => {
      const { data, error } = await ctx.sb
        .from('quiz')
        .select('id, titre, description, cree_le, modifie_le, questions(type)')
        .eq('formateur_id', ctx.uid)
        .order('modifie_le', { ascending: false })
        .limit(200)
      if (error) echec(error, 'lister tes quiz')
      const quiz = (data ?? []).map((q: Ligne) => ({
        id: q.id,
        titre: q.titre,
        description: q.description,
        nb_questions: q.questions.length,
        types: [...new Set(q.questions.map((x: Ligne) => x.type))],
        modifie_le: q.modifie_le,
        lien: lienQuiz(q.id),
      }))
      return { nb_quiz: quiz.length, quiz }
    }),
  )

  // 2. lire_quiz
  serveur.registerTool(
    'lire_quiz',
    {
      title: 'Lire un quiz',
      description: "Renvoie un quiz complet : titre, description, célébrations et toutes les questions dans l'ordre (numéro, type, énoncé, propositions, bonnes réponses en indices base 0, durée, explication, et adresses publiques des photos : photo_question, photos_propositions). Le numéro d'une question (à partir de 1) sert aux outils de modification.",
      inputSchema: { quiz_id: idQuiz },
      annotations: lecture,
    },
    outil(ctx, async ({ quiz_id }: { quiz_id: string }) => {
      const quiz = await chargerQuiz(ctx, quiz_id)
      const questions = await chargerQuestions(ctx, quiz_id)
      return {
        id: quiz.id,
        titre: quiz.titre,
        description: quiz.description,
        celebrations: quiz.celebrations,
        modifie_le: quiz.modifie_le,
        lien: lienQuiz(quiz.id),
        nb_questions: questions.length,
        questions: questions.map((q, i) => presenterQuestion(q, i + 1)),
      }
    }),
  )

  // 3. creer_quiz
  serveur.registerTool(
    'creer_quiz',
    {
      title: 'Créer un quiz',
      description: `Crée un quiz complet avec ses questions en une seule fois. Tout est vérifié avant l'écriture : en cas de problème rien n'est créé et la liste des corrections à faire est renvoyée. Au plus ${LIMITES.questionsParQuiz} questions. Pas de photos à la création : ajoute-les ensuite avec ajouter_photo_question / definir_photos_propositions. Renvoie l'id, le lien d'édition et un résumé.`,
      inputSchema: {
        titre: z.string().describe(`Titre du quiz, ${LIMITES.titre} caractères maximum.`),
        description: z.string().optional().describe(`Description facultative, ${LIMITES.description} caractères maximum.`),
        questions: z.array(questionSchema).describe('Questions dans l\'ordre où elles seront posées (au moins une).'),
        celebrations: celebrationsSchema.optional(),
      },
      annotations: ecriture,
    },
    outil(ctx, async (a: { titre: string; description?: string; questions: unknown[]; celebrations?: unknown[] }) => {
      const erreurs: string[] = []
      const t = validerTitre(a.titre)
      erreurs.push(...t.erreurs)
      const d = validerDescription(a.description)
      erreurs.push(...d.erreurs)
      const qs = validerQuestions(a.questions)
      erreurs.push(...qs.erreurs)
      if (qs.lignes.length > LIMITES.questionsParQuiz) erreurs.push(`Trop de questions (${qs.lignes.length}) : ${LIMITES.questionsParQuiz} au maximum par quiz.`)
      const c = validerCelebrations(a.celebrations, Array.isArray(a.questions) ? a.questions.length : undefined)
      erreurs.push(...c.erreurs)
      if (erreurs.length > 0) rapport(erreurs)

      const { data: quiz, error } = await ctx.sb
        .from('quiz')
        .insert({ formateur_id: ctx.uid, titre: t.valeur, description: d.valeur, celebrations: c.valeur })
        .select('id')
        .single()
      if (error || !quiz) echec(error, 'créer le quiz')

      const lignes = qs.lignes.map((l, i) => ({ ...l, quiz_id: quiz.id, ordre: i + 1 }))
      const { error: errQ } = await ctx.sb.from('questions').insert(lignes)
      if (errQ) {
        // Pas de quiz à moitié fait : on retire le quiz qu'on vient de créer (ses questions partent avec).
        await ctx.sb.from('quiz').delete().eq('id', quiz.id).eq('formateur_id', ctx.uid)
        echec(errQ, 'enregistrer les questions')
      }
      return {
        resultat: 'Quiz créé.',
        id: quiz.id,
        lien_edition: lienQuiz(quiz.id),
        resume: {
          titre: t.valeur,
          nb_questions: lignes.length,
          types: [...new Set(lignes.map((l) => l.type))],
          nb_celebrations: c.valeur.length,
          questions_sans_explication: lignes.filter((l) => !l.explication).length,
        },
        suite: "Tu peux ajouter des photos avec ajouter_photo_question / definir_photos_propositions. Le formateur peut relire le quiz et lancer la session depuis le lien d'édition.",
      }
    }),
  )

  // 4a. ajouter_questions
  serveur.registerTool(
    'ajouter_questions',
    {
      title: 'Ajouter des questions',
      description: "Ajoute des questions à un quiz existant, à la fin ou à une position donnée (les suivantes sont décalées). Même format de question que creer_quiz ; tout est vérifié avant l'écriture.",
      inputSchema: {
        quiz_id: idQuiz,
        questions: z.array(questionSchema).describe('Questions à ajouter (au moins une).'),
        position: z.number().int().optional().describe("Numéro (à partir de 1) que doit avoir la première question ajoutée. Absent = à la fin."),
      },
      annotations: ecriture,
    },
    outil(ctx, async (a: { quiz_id: string; questions: unknown[]; position?: number }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const existantes = await chargerQuestions(ctx, a.quiz_id)
      const nouvelles = validerQuestions(a.questions, (a.position ?? existantes.length + 1))
      const erreurs = [...nouvelles.erreurs]
      const total = existantes.length + nouvelles.lignes.length
      if (total > LIMITES.questionsParQuiz) erreurs.push(`Le quiz aurait ${total} questions : ${LIMITES.questionsParQuiz} au maximum.`)
      const position = a.position ?? existantes.length + 1
      if (!Number.isInteger(position) || position < 1 || position > existantes.length + 1) {
        erreurs.push(`« position » doit être entre 1 et ${existantes.length + 1} (le quiz a ${existantes.length} question(s)).`)
      }
      if (erreurs.length > 0) rapport(erreurs)

      const ajoutees = nouvelles.lignes.map((l) => ({ ...l, id: crypto.randomUUID(), quiz_id: a.quiz_id }))
      const avant = existantes.slice(0, position - 1)
      const apres = existantes.slice(position - 1)
      const tout: Ligne[] = [...avant, ...ajoutees, ...apres].map((q, i) => ({ ...q, ordre: i + 1 }))
      // Une seule requête : les lignes existantes gardent leur id (nouvel ordre), les nouvelles sont insérées.
      await ecrireOrdre(ctx, tout, 'ajouter les questions')
      await toucherQuiz(ctx, a.quiz_id)
      return { resultat: `${ajoutees.length} question(s) ajoutée(s) à partir du numéro ${position}.`, nb_questions: tout.length, lien_edition: lienQuiz(a.quiz_id) }
    }),
  )

  // 4b. modifier_question
  serveur.registerTool(
    'modifier_question',
    {
      title: 'Modifier une question',
      description: "Modifie une question d'un quiz : seuls les champs fournis changent, les autres sont conservés. La question complète est revérifiée. Pour effacer l'explication ou un libellé, envoie null. Une question dont les propositions ont des photos ne peut pas changer de type ni de propositions ici (retire d'abord les photos avec retirer_photos_propositions, ou change les textes avec definir_photos_propositions et ses légendes). Les photos ne sont pas touchées par cet outil.",
      inputSchema: {
        quiz_id: idQuiz,
        numero_ou_id: z.union([z.number().int(), z.string()]).describe("Numéro de la question (à partir de 1, tel que renvoyé par lire_quiz) ou son id."),
        champs: z
          .object({
            type: z.enum(TYPES).optional(),
            enonce: z.string().optional(),
            choix: z.array(z.string()).optional(),
            bonnes_reponses: z.array(z.number().int()).optional(),
            annoncer_nombre: z.boolean().optional(),
            libelle_min: z.string().nullable().optional(),
            libelle_max: z.string().nullable().optional(),
            duree_secondes: z.number().int().optional(),
            explication: z.string().nullable().optional(),
          })
          .passthrough()
          .describe("Champs à changer, mêmes noms et mêmes règles que dans creer_quiz. Si tu changes les propositions, renvoie aussi bonnes_reponses."),
      },
      annotations: { ...ecriture, idempotentHint: true },
    },
    outil(ctx, async (a: { quiz_id: string; numero_ou_id: number | string; champs: Record<string, unknown> }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const questions = await chargerQuestions(ctx, a.quiz_id)
      const cible = trouverQuestion(questions, a.numero_ou_id)
      const numero = questions.indexOf(cible) + 1
      const champs = a.champs ?? {}
      if (Object.keys(champs).length === 0) refuser("« champs » est vide : indique au moins un champ à modifier.")

      if (cible.images_choix && (champs.choix !== undefined || champs.type !== undefined)) {
        refuser(`question ${numero} : ses propositions ont des photos ; son type et ses propositions ne peuvent pas être changés ici. Utilise retirer_photos_propositions d'abord, ou definir_photos_propositions (avec legendes) pour changer les textes. Tu peux modifier les autres champs.`)
      }

      const fusion: Record<string, unknown> = { ...versEntree(cible) }
      for (const [cle, v] of Object.entries(champs)) {
        if (v === undefined) continue
        if (v === null) delete fusion[cle]
        else fusion[cle] = v
      }
      // Passage d'un QCM à un autre type sans propositions fournies : on retire les propositions devenues sans objet.
      const famille = (t: unknown) => t === 'qcm' || t === 'qcm_multiple'
      if (champs.type !== undefined && !famille(champs.type)) {
        if (champs.choix === undefined) delete fusion.choix
        if (champs.bonnes_reponses === undefined) delete fusion.bonnes_reponses
      }
      const r = validerQuestion(fusion, `question ${numero}`, { enonceVideAutorise: !!cible.image_question, propositionMax: cible.images_choix ? LIMITES_PHOTO.legende : undefined })
      if (!r.ligne) rapport(r.erreurs)

      const { error } = await ctx.sb.from('questions').update(r.ligne!).eq('id', cible.id).eq('quiz_id', a.quiz_id)
      if (error) echec(error, 'modifier la question')
      await toucherQuiz(ctx, a.quiz_id)
      return { resultat: `Question ${numero} modifiée.`, question: presenterQuestion({ ...cible, ...r.ligne }, numero), lien_edition: lienQuiz(a.quiz_id) }
    }),
  )

  // 4c. supprimer_question
  serveur.registerTool(
    'supprimer_question',
    {
      title: 'Supprimer une question',
      description: "Supprime UNE question d'un quiz (les suivantes sont renumérotées). Irréversible. Ne supprime jamais le quiz lui-même. Les sessions déjà jouées ne sont pas touchées (elles ont leur propre copie).",
      inputSchema: { quiz_id: idQuiz, numero: z.number().int().describe('Numéro de la question à supprimer (à partir de 1).') },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    outil(ctx, async (a: { quiz_id: string; numero: number }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const questions = await chargerQuestions(ctx, a.quiz_id)
      const cible = trouverQuestion(questions, a.numero)
      const { error } = await ctx.sb.from('questions').delete().eq('id', cible.id).eq('quiz_id', a.quiz_id)
      if (error) echec(error, 'supprimer la question')
      // Renumérotation : seules les lignes qui changent de position sont réécrites.
      const reste = questions.filter((q) => q.id !== cible.id)
      await ecrireOrdre(ctx, reste.map((q, i) => ({ ...q, ordre: i + 1 })).filter((q, i) => reste[i].ordre !== q.ordre), 'renuméroter les questions')
      await toucherQuiz(ctx, a.quiz_id)
      return { resultat: `Question ${a.numero} supprimée (« ${String(cible.enonce).slice(0, 60)} »).`, nb_questions: reste.length }
    }),
  )

  // 4d. reordonner_questions
  serveur.registerTool(
    'reordonner_questions',
    {
      title: 'Réordonner les questions',
      description: "Change l'ordre des questions d'un quiz. `ordre` liste les ANCIENS numéros dans le NOUVEL ordre : pour un quiz de 4 questions, [2,1,3,4] échange les deux premières. Doit contenir chaque numéro de 1 à N exactement une fois.",
      inputSchema: { quiz_id: idQuiz, ordre: z.array(z.number().int()).describe('Anciens numéros (à partir de 1) dans le nouvel ordre souhaité.') },
      annotations: { ...ecriture, idempotentHint: true },
    },
    outil(ctx, async (a: { quiz_id: string; ordre: number[] }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const questions = await chargerQuestions(ctx, a.quiz_id)
      const n = questions.length
      const ok = Array.isArray(a.ordre) && a.ordre.length === n && new Set(a.ordre).size === n && a.ordre.every((x) => Number.isInteger(x) && x >= 1 && x <= n)
      if (!ok) refuser(`« ordre » doit contenir chaque numéro de 1 à ${n} exactement une fois (le quiz a ${n} question(s)), par exemple [${Array.from({ length: n }, (_, i) => i + 1).join(',')}].`)
      const lignes: Ligne[] = a.ordre.map((ancien, i) => ({ ...questions[ancien - 1], ordre: i + 1 }))
      await ecrireOrdre(ctx, lignes, 'réordonner les questions')
      await toucherQuiz(ctx, a.quiz_id)
      return { resultat: 'Questions réordonnées.', nouvel_ordre: lignes.map((q, i) => ({ numero: i + 1, enonce: String(q.enonce).slice(0, 80) })) }
    }),
  )

  // 4e. modifier_quiz
  serveur.registerTool(
    'modifier_quiz',
    {
      title: 'Modifier le quiz',
      description: "Modifie le titre, la description ou les célébrations d'un quiz (seuls les champs fournis changent). Description : null ou vide pour l'effacer. Célébrations : la liste fournie REMPLACE l'ancienne ([] pour tout retirer).",
      inputSchema: {
        quiz_id: idQuiz,
        titre: z.string().optional().describe(`Nouveau titre, ${LIMITES.titre} caractères maximum.`),
        description: z.string().nullable().optional().describe(`Nouvelle description (${LIMITES.description} caractères maximum), ou null pour l'effacer.`),
        celebrations: celebrationsSchema.optional(),
      },
      annotations: { ...ecriture, idempotentHint: true },
    },
    outil(ctx, async (a: { quiz_id: string; titre?: string; description?: string | null; celebrations?: unknown[] }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const maj: Ligne = {}
      const erreurs: string[] = []
      if (a.titre !== undefined) {
        const t = validerTitre(a.titre)
        erreurs.push(...t.erreurs)
        maj.titre = t.valeur
      }
      if (a.description !== undefined) {
        const d = validerDescription(a.description)
        erreurs.push(...d.erreurs)
        maj.description = d.valeur
      }
      let avertissement: string | undefined
      if (a.celebrations !== undefined) {
        const c = validerCelebrations(a.celebrations)
        erreurs.push(...c.erreurs)
        maj.celebrations = c.valeur
        const nb = (await chargerQuestions(ctx, a.quiz_id)).length
        if (c.valeur.some((x) => x.apres_question > nb)) avertissement = `Certaines célébrations sont placées après une question qui n'existe pas encore (le quiz a ${nb} question(s)) : elles ne s'afficheront pas tant que la question n'existe pas.`
      }
      if (erreurs.length > 0) rapport(erreurs)
      if (Object.keys(maj).length === 0) refuser('Aucun champ à modifier : fournis titre, description ou celebrations.')
      const { error } = await ctx.sb.from('quiz').update(maj).eq('id', a.quiz_id).eq('formateur_id', ctx.uid)
      if (error) echec(error, 'modifier le quiz')
      return { resultat: 'Quiz modifié.', champs_modifies: Object.keys(maj), ...(avertissement ? { avertissement } : {}), lien_edition: lienQuiz(a.quiz_id) }
    }),
  )

  // 4f. ajouter_photo_question
  serveur.registerTool(
    'ajouter_photo_question',
    {
      title: 'Ajouter une photo à une question',
      description:
        `Met une photo sur une question (remplace l'ancienne s'il y en avait une). La photo est téléchargée (adresse https://) ou décodée (base64), contrôlée (JPEG, PNG ou WebP, vérifié sur le contenu), puis réduite automatiquement à ${REGLAGES.question.cote} px de plus grand côté et ${REGLAGES.question.maxOctets / 1024} Ko au plus (WebP). Limites : 5 Mo par adresse, ${(LIMITES_PHOTO.base64Octets / 1048576).toFixed(1).replace('.', ',')} Mo en base64 décodé, délai de 10 s. Si la photo reste trop lourde après compression, elle est refusée : choisis une image plus simple. ${RAPPEL_DROITS} Le texte de la question reste affiché avec la photo.`,
      inputSchema: { quiz_id: idQuiz, numero: z.number().int().describe('Numéro de la question (à partir de 1, tel que renvoyé par lire_quiz).'), source: sourceSchema },
      annotations: { ...ecriture, idempotentHint: false, openWorldHint: true },
    },
    outil(ctx, async (a: { quiz_id: string; numero: number; source: SourcePhoto }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const questions = await chargerQuestions(ctx, a.quiz_id)
      const cible = trouverQuestion(questions, a.numero)
      const photo = await obtenirPhoto(a.source, 'question', 'photo de la question', { octets: 0 })
      const chemin = await deposerPhoto(ctx, photo)
      try {
        await ecrirePhotos(ctx, cible, a.quiz_id, { image_question: chemin })
      } catch (e) {
        await supprimerFichiers(ctx, [chemin]) // pas de fichier orphelin si l'enregistrement échoue
        throw e
      }
      await supprimerSiInutilisee(ctx, [cible.image_question])
      await toucherQuiz(ctx, a.quiz_id)
      return { resultat: `Photo ajoutée à la question ${a.numero}.`, photo: decrire(photo, chemin), lien_edition: lienQuiz(a.quiz_id) }
    }),
  )

  // 4g. retirer_photo_question
  serveur.registerTool(
    'retirer_photo_question',
    {
      title: "Retirer la photo d'une question",
      description: "Retire la photo d'une question (le texte de la question est conservé). Refusé si la question n'a pas de texte : ajoute-lui d'abord un énoncé avec modifier_question.",
      inputSchema: { quiz_id: idQuiz, numero: z.number().int().describe('Numéro de la question (à partir de 1).') },
      annotations: { ...ecriture, idempotentHint: true },
    },
    outil(ctx, async (a: { quiz_id: string; numero: number }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const cible = trouverQuestion(await chargerQuestions(ctx, a.quiz_id), a.numero)
      if (!cible.image_question) return { resultat: `La question ${a.numero} n'a pas de photo : rien à retirer.` }
      if (!String(cible.enonce ?? '').trim()) refuser(`La question ${a.numero} n'a pas de texte : sans photo elle serait vide. Ajoute d'abord un énoncé avec modifier_question, puis retire la photo.`)
      await ecrirePhotos(ctx, cible, a.quiz_id, { image_question: null })
      await supprimerSiInutilisee(ctx, [cible.image_question])
      await toucherQuiz(ctx, a.quiz_id)
      return { resultat: `Photo retirée de la question ${a.numero}.` }
    }),
  )

  // 4h. definir_photos_propositions
  serveur.registerTool(
    'definir_photos_propositions',
    {
      title: 'Définir les photos des propositions',
      description:
        `Met une photo sur CHAQUE proposition d'un QCM ou d'un QCM à plusieurs réponses (toutes ou aucune ; remplace les anciennes). \`sources\` : une source par proposition, dans l'ordre des propositions, et leur nombre doit être égal au nombre de propositions de la question. \`legendes\` (facultatif) : un texte par proposition, ${LIMITES_PHOTO.legende} caractères maximum, qui REMPLACE le texte des propositions (le texte affiché sous la photo) ; elles doivent être toutes différentes. Chaque photo est contrôlée (JPEG, PNG ou WebP, vérifié sur le contenu) puis réduite à ${REGLAGES.choix.cote} px et ${REGLAGES.choix.maxOctets / 1024} Ko au plus. Limites : 5 Mo par adresse, ${(LIMITES_PHOTO.base64Octets / 1048576).toFixed(1).replace('.', ',')} Mo par photo en base64, ${LIMITES_PHOTO.totalOctetsParAppel / 1048576} Mo de base64 au total par appel. Si une photo est refusée, rien n'est enregistré. ${RAPPEL_DROITS}`,
      inputSchema: {
        quiz_id: idQuiz,
        numero: z.number().int().describe('Numéro de la question (à partir de 1). Doit être un QCM ou un QCM à plusieurs réponses.'),
        sources: z.array(sourceSchema).describe('Une source par proposition, dans l\'ordre.'),
        legendes: z.array(z.string()).optional().describe(`Facultatif : un texte par proposition (${LIMITES_PHOTO.legende} caractères maximum chacun), qui remplace le texte actuel des propositions.`),
      },
      annotations: { ...ecriture, idempotentHint: false, openWorldHint: true },
    },
    outil(ctx, async (a: { quiz_id: string; numero: number; sources: SourcePhoto[]; legendes?: string[] }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const cible = trouverQuestion(await chargerQuestions(ctx, a.quiz_id), a.numero)
      if (cible.type !== 'qcm' && cible.type !== 'qcm_multiple') {
        refuser(`La question ${a.numero} est de type « ${cible.type} » : des photos sur les propositions ne sont possibles que pour un QCM ou un QCM à plusieurs réponses.`)
      }
      const nb = (cible.choix as string[]).length
      if (!Array.isArray(a.sources) || a.sources.length !== nb) {
        refuser(`La question ${a.numero} a ${nb} propositions : il faut exactement ${nb} sources (une par proposition, dans l'ordre), tu en as donné ${Array.isArray(a.sources) ? a.sources.length : 0}. Toutes les propositions ont une photo, ou aucune.`)
      }
      const maj: Ligne = {}
      if (a.legendes !== undefined) {
        const erreurs: string[] = []
        if (!Array.isArray(a.legendes) || a.legendes.length !== nb) erreurs.push(`« legendes » doit avoir exactement ${nb} textes (un par proposition).`)
        else {
          const l = a.legendes.map((t) => (typeof t === 'string' ? t.trim() : ''))
          l.forEach((t, i) => {
            if (!t) erreurs.push(`la légende ${i + 1} est vide.`)
            else if (t.length > LIMITES_PHOTO.legende) erreurs.push(`la légende ${i + 1} fait ${t.length} caractères, le maximum est ${LIMITES_PHOTO.legende}.`)
          })
          if (new Set(l.map((t) => t.toLowerCase())).size !== l.length) erreurs.push('deux légendes sont identiques : chaque proposition doit être différente.')
          if (erreurs.length === 0) maj.choix = l
        }
        if (erreurs.length > 0) rapport(erreurs)
      }

      // Toutes les photos sont préparées AVANT d'écrire quoi que ce soit : une photo refusée n'enregistre rien.
      const budget = { octets: 0 }
      const pretes: PhotoPreparee[] = []
      for (let i = 0; i < nb; i++) pretes.push(await obtenirPhoto(a.sources[i], 'choix', `photo de la proposition ${i + 1}`, budget))
      const chemins: string[] = []
      try {
        for (const p of pretes) chemins.push(await deposerPhoto(ctx, p))
        await ecrirePhotos(ctx, cible, a.quiz_id, { ...maj, images_choix: chemins })
      } catch (e) {
        await supprimerFichiers(ctx, chemins)
        throw e
      }
      await supprimerSiInutilisee(ctx, cible.images_choix ?? [])
      await toucherQuiz(ctx, a.quiz_id)
      return {
        resultat: `${nb} photos de propositions enregistrées pour la question ${a.numero}.${maj.choix ? ' Les textes des propositions ont été remplacés par les légendes.' : ''}`,
        photos: pretes.map((p, i) => ({ proposition: i + 1, ...decrire(p, chemins[i]) })),
        lien_edition: lienQuiz(a.quiz_id),
      }
    }),
  )

  // 4i. retirer_photos_propositions
  serveur.registerTool(
    'retirer_photos_propositions',
    {
      title: 'Retirer les photos des propositions',
      description: "Retire les photos de toutes les propositions d'une question (les textes des propositions sont conservés).",
      inputSchema: { quiz_id: idQuiz, numero: z.number().int().describe('Numéro de la question (à partir de 1).') },
      annotations: { ...ecriture, idempotentHint: true },
    },
    outil(ctx, async (a: { quiz_id: string; numero: number }) => {
      await chargerQuiz(ctx, a.quiz_id)
      const cible = trouverQuestion(await chargerQuestions(ctx, a.quiz_id), a.numero)
      if (!cible.images_choix) return { resultat: `Les propositions de la question ${a.numero} n'ont pas de photos : rien à retirer.` }
      await ecrirePhotos(ctx, cible, a.quiz_id, { images_choix: null })
      await supprimerSiInutilisee(ctx, cible.images_choix)
      await toucherQuiz(ctx, a.quiz_id)
      return { resultat: `Photos des propositions retirées de la question ${a.numero}.` }
    }),
  )

  // 5a. lister_mes_sessions
  serveur.registerTool(
    'lister_mes_sessions',
    {
      title: 'Lister mes sessions',
      description: "Liste les sessions en direct animées par le formateur (les plus récentes d'abord, 50 au plus) : id, titre, date, état (attente, question, resultats, bilan, terminee) et nombre de participants. Filtre possible sur un quiz. Aucun nom de participant n'est renvoyé.",
      inputSchema: { quiz_id: idQuiz.optional() },
      annotations: lecture,
    },
    outil(ctx, async (a: { quiz_id?: string }) => {
      let req = ctx.sb
        .from('sessions')
        .select('id, titre, etat, quiz_id, cree_le, terminee_le, participants(count)')
        .eq('formateur_id', ctx.uid)
        .order('cree_le', { ascending: false })
        .limit(50)
      if (a.quiz_id) req = req.eq('quiz_id', a.quiz_id)
      const { data, error } = await req
      if (error) echec(error, 'lister tes sessions')
      const sessions = (data ?? []).map((s: Ligne) => ({
        id: s.id,
        titre: s.titre,
        quiz_id: s.quiz_id,
        etat: s.etat,
        date: s.cree_le,
        terminee_le: s.terminee_le,
        nb_participants: s.participants?.[0]?.count ?? 0,
      }))
      return { nb_sessions: sessions.length, sessions }
    }),
  )

  // 5b. resultats_session
  serveur.registerTool(
    'resultats_session',
    {
      title: 'Résultats d\'une session',
      description: "Résultats agrégés d'une session : pour chaque question, énoncé, type et résultats (répartition des réponses, taux de réussite, mots du nuage, réponses ouvertes anonymes, moyenne d'échelle, explication), puis chiffres globaux (participants, réponses, taux de réussite des QCM). Jamais de pseudo ni de classement : seulement des résultats collectifs.",
      inputSchema: { session_id: z.string().describe('Identifiant de la session (fourni par lister_mes_sessions).') },
      annotations: lecture,
    },
    outil(ctx, async ({ session_id }: { session_id: string }) => {
      const { data: s, error } = await ctx.sb.from('sessions').select('id, titre, etat, cree_le, terminee_le').eq('id', session_id).eq('formateur_id', ctx.uid).maybeSingle()
      if (error) echec(error, 'lire cette session')
      if (!s) refuser("Session introuvable : l'identifiant ne correspond à aucune de tes sessions. Utilise lister_mes_sessions.")

      const { data: qs, error: errQ } = await ctx.sb.from('questions_session').select('id, ordre, type, enonce, ouverte_le, fermee_le').eq('session_id', session_id).order('ordre')
      if (errQ) echec(errQ, 'lire les questions de la session')

      const questions = await Promise.all(
        (qs ?? []).map(async (q: Ligne) => {
          const base = { numero: q.ordre, type: q.type, enonce: q.enonce }
          if (!q.fermee_le) return { ...base, statut: q.ouverte_le ? 'en_cours' : 'non_posee' }
          const { data: det, error: errR } = await ctx.sb.rpc('resultats_question', { p_question: q.id, p_vue: 'auto' })
          if (errR || !det) {
            console.error('resultats_question', errR?.code ?? '')
            return { ...base, statut: 'terminee', resultats: null, note: 'Résultats indisponibles pour cette question.' }
          }
          return { ...base, statut: 'terminee', resultats: assainir(det) }
        }),
      )

      // etat_session vérifie que l'appelant anime la session ; le bilan n'y figure qu'une fois
      // la session au bilan/terminée. Liste blanche : `mentions` (pseudos) n'est jamais relayée.
      const { data: etat } = await ctx.sb.rpc('etat_session', { p_session: session_id, p_vue: 'auto' })
      const bilan = etat?.bilan ?? (etat ? { nb_participants: etat.nb_participants, nb_reponses: null, taux_reussite_qcm: null, jauge: etat.jauge } : null)
      const globaux = bilan
        ? {
            nb_participants: bilan.nb_participants,
            nb_reponses: bilan.nb_reponses,
            taux_reussite_qcm: bilan.taux_reussite_qcm,
            jauge_collective: bilan.jauge,
          }
        : null
      return { session: { id: s.id, titre: s.titre, etat: s.etat, date: s.cree_le, terminee_le: s.terminee_le }, chiffres_globaux: globaux, questions }
    }),
  )

  return serveur
}

// Retire des résultats tout identifiant technique ; les textes ouverts restent sans pseudo.
// deno-lint-ignore no-explicit-any
function assainir(det: any) {
  const { question_id: _q, reponses, ...reste } = det
  return {
    ...reste,
    ...(Array.isArray(reponses) ? { reponses: reponses.map((r: Ligne) => ({ texte: r.texte, coup_de_coeur: !!r.coup_de_coeur })) } : {}),
  }
}

// Retrouve une question par numéro (nombre ou texte numérique, à partir de 1) ou par id.
function trouverQuestion(questions: Ligne[], ref: number | string): Ligne {
  let numero: number | null = null
  if (typeof ref === 'number') numero = ref
  else if (/^\d+$/.test(ref.trim())) numero = Number(ref.trim())
  if (numero !== null) {
    const q = questions[numero - 1]
    if (!q || !Number.isInteger(numero) || numero < 1) refuser(`Il n'y a pas de question numéro ${numero} : le quiz a ${questions.length} question(s), numérotées de 1 à ${questions.length}.`)
    return q
  }
  const q = questions.find((x) => x.id === ref)
  if (!q) refuser("Question introuvable : donne son numéro (à partir de 1) ou un id issu de lire_quiz.")
  return q
}

// ---------------------------------------------------------------------------
// Point d'entrée HTTP
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const chemin = sousChemin(new URL(req.url).pathname)
  if (chemin === null) return json(404, { error: 'not_found' })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  // Métadonnées de ressource protégée : publiques (formes `/.well-known/oauth-protected-resource` et suffixée).
  if (chemin.startsWith('/.well-known/oauth-protected-resource')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'method_not_allowed' })
    return metadonneesRessource(urlPublique(req))
  }
  if (chemin !== '' && chemin !== '/') return json(404, { error: 'not_found' })

  // Tout le reste exige un jeton valide.
  const identite = await authentifier(req)
  if (identite instanceof Response) return identite

  const sb = createClient(URL_PROJET, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${identite.jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let verification: Promise<string | null> | undefined
  const ctx: Contexte = {
    sb,
    uid: identite.uid,
    verifierFormateur: () =>
      (verification ??= (async () => {
        const { data, error } = await sb.from('formateurs').select('id, actif').eq('id', identite.uid).maybeSingle()
        if (error) {
          console.error('Vérification formateur', error.code ?? '')
          return 'Impossible de vérifier ton compte pour le moment. Réessaie dans un instant.'
        }
        return data?.actif ? null : "Ce compte n'est pas un formateur actif de REVOLia Live."
      })()),
  }

  const serveur = construireServeur(ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // mode sans état
    enableJsonResponse: true, // réponse JSON simple plutôt qu'un flux SSE : suffisant, sans état à garder
    maxRequestBodySize: 9_000_000, // photos en base64 : 6 Mo décodés ≈ 8 Mo de texte
  })
  await serveur.connect(transport)
  try {
    const rep = await transport.handleRequest(req)
    const entetes = new Headers(rep.headers)
    for (const [k, v] of Object.entries(CORS)) entetes.set(k, v)
    return new Response(rep.body, { status: rep.status, headers: entetes })
  } catch (e) {
    console.error('Erreur MCP', e instanceof Error ? e.name : '')
    return json(500, { jsonrpc: '2.0', error: { code: -32603, message: 'Erreur interne du serveur.' }, id: null })
  }
})
