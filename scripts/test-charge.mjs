#!/usr/bin/env node
// Test de charge REVOLia Live : simule N téléphones participants.
// Le formateur pilote l'écran présentateur à la main pendant le test.
//
// Usage : node scripts/test-charge.mjs <CODE> [nombre=100] [--etalement=30] [--sans-reponse]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Configuration (arguments + variables d'environnement)
// ---------------------------------------------------------------------------

/** Petit lecteur de fichier .env : lignes CLE=valeur, commentaires # ignorés. */
function lireEnvLocal() {
  const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const valeurs = {}
  for (const nom of ['.env.local', '.env']) {
    let texte
    try { texte = readFileSync(resolve(racine, nom), 'utf8') } catch { continue }
    for (const ligne of texte.split(/\r?\n/)) {
      const m = ligne.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!m || ligne.trim().startsWith('#')) continue
      let v = m[2]
      if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1)
      if (!(m[1] in valeurs)) valeurs[m[1]] = v
    }
  }
  return valeurs
}

const args = process.argv.slice(2)
const options = args.filter(a => a.startsWith('--'))
const positionnels = args.filter(a => !a.startsWith('--'))

const CODE = (positionnels[0] || '').trim().toUpperCase()
const NOMBRE = parseInt(positionnels[1] ?? '100', 10)
const ETALEMENT_S = Number(options.find(o => o.startsWith('--etalement='))?.split('=')[1] ?? 30)
const SANS_REPONSE = options.includes('--sans-reponse')

if (!CODE || !Number.isInteger(NOMBRE) || NOMBRE < 1 || !Number.isFinite(ETALEMENT_S) || ETALEMENT_S < 0) {
  console.error('Usage : node scripts/test-charge.mjs <CODE> [nombre=100] [--etalement=30] [--sans-reponse]')
  process.exit(1)
}

const envFichier = lireEnvLocal()
const URL_SUPABASE = process.env.VITE_SUPABASE_URL || envFichier.VITE_SUPABASE_URL
const CLE_ANON = process.env.VITE_SUPABASE_ANON_KEY || envFichier.VITE_SUPABASE_ANON_KEY
if (!URL_SUPABASE || !CLE_ANON) {
  console.error('Il manque VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY (variables d\'environnement ou fichier .env.local).')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Mesures
// ---------------------------------------------------------------------------

const stats = {
  lances: 0,
  connectes: 0,          // inscrits avec succès
  echecs: 0,
  erreurs: new Map(),    // message normalisé -> nombre
  tempsInscription: [],  // ms : signInAnonymously + rejoindre_session
  delaiEvenement: [],    // ms : ouverte_le -> réception de l'événement temps réel
  tempsRepondre: [],     // ms : durée de l'appel repondre
  reponsesOk: 0,
  reponsesRefusees: 0,
  canauxEnErreur: 0,
  canauxAbonnes: 0,
}

function compterErreur(erreur) {
  const brut = erreur?.message || String(erreur)
  const statut = erreur?.status ?? erreur?.code
  let msg = brut
  if (statut == 429 || /429|too many|rate limit|trop de requ/i.test(brut)) msg = `429 trop de requêtes (${brut})`
  msg = msg.slice(0, 140)
  stats.erreurs.set(msg, (stats.erreurs.get(msg) || 0) + 1)
}

function percentile(valeurs, p) {
  if (!valeurs.length) return null
  const t = [...valeurs].sort((a, b) => a - b)
  return t[Math.min(t.length - 1, Math.ceil((p / 100) * t.length) - 1)]
}
const fmt = v => (v == null ? '–' : v >= 10000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)
const resumeDist = t => `médiane ${fmt(percentile(t, 50))} · p95 ${fmt(percentile(t, 95))} · max ${fmt(percentile(t, 100))}`

// ---------------------------------------------------------------------------
// Données de réponse aléatoires
// ---------------------------------------------------------------------------

const MOTS = ['gain de temps', 'créativité', 'confiance', 'automatisation', 'rédaction', 'efficacité',
  'méthode', 'curiosité', 'organisation', 'résumé', 'idées', 'simplicité', 'clarté', 'productivité']
const PHRASES = ['Je vais l\'utiliser pour mes mails.', 'Ça me fait gagner du temps au quotidien.',
  'Je veux d\'abord tester sur un petit cas.', 'Très utile pour préparer mes réunions.',
  'J\'ai encore besoin de pratiquer.']
const alea = tab => tab[Math.floor(Math.random() * tab.length)]
const entre = (min, max) => min + Math.random() * (max - min)
const attendre = ms => new Promise(r => setTimeout(r, ms))

function valeurAleatoire(question) {
  switch (question.type) {
    case 'qcm': return Math.floor(Math.random() * Math.max(1, question.choix?.length ?? 1))
    case 'echelle': return 1 + Math.floor(Math.random() * 5)
    case 'nuage': return alea(MOTS)
    default: return alea(PHRASES)
  }
}

// ---------------------------------------------------------------------------
// Un téléphone simulé
// ---------------------------------------------------------------------------

const clients = []        // pour le désabonnement final
let arretDemande = false
let nbVoientFin = 0       // téléphones ayant vu la session passer en bilan/terminée
let appelFin = null       // déclenché quand la salle a vu la fin

class Telephone {
  constructor(numero, infos) {
    this.numero = numero
    this.pseudo = `Testeur-${String(numero).padStart(3, '0')}`
    this.infos = infos
    this.questionsTraitees = new Set()
    this.refreshEnCours = false
    this.refreshDemande = false
    this.finVue = false
    this.timerFiletSecurite = null
    // Client indépendant, aucune persistance : chaque instance = une identité anonyme.
    const memoire = new Map()
    this.supabase = createClient(URL_SUPABASE, CLE_ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: k => memoire.get(k) ?? null,
          setItem: (k, v) => memoire.set(k, v),
          removeItem: k => memoire.delete(k),
        },
      },
    })
  }

  /** Connexion anonyme + inscription, puis abonnement temps réel. */
  async demarrer() {
    stats.lances++
    const debut = performance.now()
    try {
      const { error: errAuth } = await this.supabase.auth.signInAnonymously()
      if (errAuth) throw errAuth

      const params = { p_code: CODE, p_pseudo: this.pseudo, p_table_id: null }
      if (this.infos.mode_tables && this.infos.tables?.length) params.p_table_id = alea(this.infos.tables).id
      const { data, error } = await this.supabase.rpc('rejoindre_session', params)
      if (error) throw error
      this.sessionId = data.session_id
    } catch (e) {
      stats.echecs++
      compterErreur(e)
      return
    }
    stats.tempsInscription.push(performance.now() - debut)
    stats.connectes++
    clients.push(this)

    this.abonner()
    await this.rafraichir(null) // état initial (hors événement)
    // Filet de sécurité de l'appli : rappel de l'état toutes les 10 s (décalé pour ne pas synchroniser les téléphones).
    this.timerFiletSecurite = setInterval(() => this.rafraichir(null), 10000 + entre(0, 1000))
  }

  abonner() {
    this.canal = this.supabase
      .channel(`charge-${this.numero}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${this.sessionId}` },
        () => this.rafraichir(Date.now()))
      .subscribe(statut => {
        if (statut === 'SUBSCRIBED') stats.canauxAbonnes++
        else if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') {
          stats.canauxEnErreur++
          compterErreur(new Error(`canal temps réel : ${statut}`))
        }
      })
  }

  /**
   * Recharge l'état complet. `recuLe` = instant de réception de l'événement temps réel
   * (null si l'appel vient du filet de sécurité ou du démarrage).
   * Les appels qui se chevauchent sont regroupés (un seul rappel en attente).
   */
  async rafraichir(recuLe) {
    if (arretDemande) return
    if (this.refreshEnCours) { this.refreshDemande = recuLe ?? this.refreshDemande ?? true; return }
    this.refreshEnCours = true
    try {
      const { data: etat, error } = await this.supabase.rpc('etat_session', { p_session: this.sessionId })
      if (error) { compterErreur(error); return }
      this.traiter(etat, recuLe)
    } catch (e) {
      compterErreur(e)
    } finally {
      this.refreshEnCours = false
      if (this.refreshDemande) {
        const r = this.refreshDemande === true ? null : this.refreshDemande
        this.refreshDemande = false
        this.rafraichir(r)
      }
    }
  }

  traiter(etat, recuLe) {
    if ((etat.etat === 'bilan' || etat.etat === 'terminee') && !this.finVue) {
      this.finVue = true
      nbVoientFin++
      appelFin?.()
    }
    const q = etat.question
    if (!q || etat.etat !== 'question') return
    // Nouvelle question ouverte : mesurer le délai de l'événement (une seule fois par question et par téléphone).
    if (!this.questionsTraitees.has(q.id)) {
      this.questionsTraitees.add(q.id)
      if (recuLe && q.ouverte_le) {
        const delai = recuLe - Date.parse(q.ouverte_le)
        if (delai >= -2000) stats.delaiEvenement.push(Math.max(0, delai))
      }
      if (!SANS_REPONSE && !etat.a_repondu) this.repondreApres(q)
    }
  }

  /** Répond après un délai de réflexion de 1 à 8 s. */
  async repondreApres(question) {
    await attendre(entre(1000, 8000))
    if (arretDemande) return
    const debut = performance.now()
    const { error } = await this.supabase.rpc('repondre', {
      p_question: question.id,
      p_valeur: valeurAleatoire(question),
    })
    stats.tempsRepondre.push(performance.now() - debut)
    if (error) { stats.reponsesRefusees++; compterErreur(error) } else stats.reponsesOk++
  }

  async arreter() {
    clearInterval(this.timerFiletSecurite)
    if (this.canal) { try { await this.supabase.removeChannel(this.canal) } catch { /* ignoré */ } }
  }
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function ligneStatut() {
  return `[${stats.connectes}/${NOMBRE} inscrits · ${stats.echecs} échecs · ${stats.canauxAbonnes} canaux · `
    + `rép. ${stats.reponsesOk} ok/${stats.reponsesRefusees} refusées · `
    + `événement p95 ${fmt(percentile(stats.delaiEvenement, 95))} · repondre p95 ${fmt(percentile(stats.tempsRepondre, 95))}]`
}

function afficherResume() {
  const sortie = []
  sortie.push('', '=== Résumé du test de charge ===')
  sortie.push(`Code ${CODE} · ${NOMBRE} téléphones demandés · étalement ${ETALEMENT_S} s${SANS_REPONSE ? ' · sans réponse' : ''}`)
  sortie.push(`Inscriptions : ${stats.connectes} réussies, ${stats.echecs} échouées (${((stats.connectes / Math.max(1, stats.lances)) * 100).toFixed(1)} % de réussite)`)
  sortie.push(`Connexion + inscription : ${resumeDist(stats.tempsInscription)}`)
  sortie.push(`Délai question ouverte -> événement temps réel (${stats.delaiEvenement.length} mesures) : ${resumeDist(stats.delaiEvenement)}`)
  if (!SANS_REPONSE) {
    sortie.push(`Appel repondre (${stats.tempsRepondre.length} appels) : ${resumeDist(stats.tempsRepondre)}`)
    sortie.push(`Réponses : ${stats.reponsesOk} acceptées, ${stats.reponsesRefusees} refusées`)
  }
  sortie.push(`Canaux temps réel : ${stats.canauxAbonnes} abonnés, ${stats.canauxEnErreur} en erreur`)
  if (stats.erreurs.size) {
    sortie.push('Erreurs (regroupées) :')
    for (const [msg, n] of [...stats.erreurs].sort((a, b) => b[1] - a[1])) sortie.push(`  ${String(n).padStart(4)} × ${msg}`)
  } else sortie.push('Aucune erreur.')
  sortie.push('Rappel : les délais sont mesurés avec l\'horloge de cet ordinateur ; un décalage d\'horloge avec le serveur les fausse.')
  console.log(sortie.join('\n'))
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function terminer(raison) {
  if (arretDemande) return
  arretDemande = true
  clearInterval(timerAffichage)
  process.stdout.write('\n')
  console.log(`Arrêt (${raison}). Désabonnement de ${clients.length} canaux…`)
  await Promise.allSettled(clients.map(c => c.arreter()))
  afficherResume()
  process.exit(0)
}

// Vérification préalable du code (infos_session ne demande aucune identité propre à la salle).
const sondeur = createClient(URL_SUPABASE, CLE_ANON, { auth: { persistSession: false, autoRefreshToken: false } })
await sondeur.auth.signInAnonymously()
const { data: infos, error: errInfos } = await sondeur.rpc('infos_session', { p_code: CODE })
if (errInfos || !infos) {
  console.error(errInfos?.message || 'Aucun quiz en cours avec ce code.')
  process.exit(1)
}
console.log(`Quiz « ${infos.titre} » trouvé (${infos.mode_tables ? 'mode tables' : 'sans tables'}).`)
console.log(`Lancement de ${NOMBRE} téléphones sur ${ETALEMENT_S} s. Ctrl+C pour arrêter et voir le résumé.`)

process.on('SIGINT', () => terminer('Ctrl+C'))
process.on('SIGTERM', () => terminer('SIGTERM'))

// Fin automatique : quand la majorité de la salle a vu le bilan ou la fin (laisse 3 s aux retardataires).
let minuterieFin = null
appelFin = () => {
  if (minuterieFin || nbVoientFin < Math.max(1, Math.ceil(stats.connectes / 2))) return
  minuterieFin = setTimeout(() => terminer('la session est en bilan / terminée'), 3000)
}

const timerAffichage = setInterval(() => process.stdout.write(`\r${ligneStatut()}   `), 2000)

// Arrivées étalées aléatoirement, comme dans une vraie salle.
const arrivees = []
for (let i = 1; i <= NOMBRE; i++) {
  const telephone = new Telephone(i, infos)
  arrivees.push(attendre(entre(0, ETALEMENT_S * 1000)).then(() => (arretDemande ? null : telephone.demarrer())))
}
await Promise.allSettled(arrivees)
if (stats.connectes === 0) await terminer('aucun téléphone inscrit')
// Sinon on reste en vie : les canaux temps réel et les minuteurs gardent le processus actif.
