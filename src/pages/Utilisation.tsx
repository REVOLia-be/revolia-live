import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Carte from '../composants/Carte'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { supabase } from '../lib/supabase'

// Journal d'utilisation : une ligne par session lancée, une ligne par génération de questions.
export interface LigneJournal {
  id: string
  formateur_id?: string
  type: 'session' | 'generation'
  quiz_titre: string | null
  nb_participants: number | null
  nb_reponses: number | null
  tokens_entree: number | null
  tokens_sortie: number | null
  cree_le: string
}

// Tarif indicatif de l'API Claude (dollars par million de jetons) et taux de conversion.
const PRIX_ENTREE_USD = 3
const PRIX_SORTIE_USD = 15
const EUROS_PAR_USD = 0.92

const formatEntier = new Intl.NumberFormat('fr-BE')
const formatEuros = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' })
const formatMois = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })

function coutEuros(l: LigneJournal): number {
  const usd = ((l.tokens_entree ?? 0) * PRIX_ENTREE_USD + (l.tokens_sortie ?? 0) * PRIX_SORTIE_USD) / 1_000_000
  return usd * EUROS_PAR_USD
}

function texteEuros(valeur: number): string {
  if (valeur > 0 && valeur < 0.01) return '< 0,01 €'
  return `≈ ${formatEuros.format(valeur)}`
}

function dateHeure(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function cleMois(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface TotauxMois {
  cle: string
  libelle: string
  sessions: number
  participants: number
  reponses: number
  generations: number
  cout: number
}

function regrouperParMois(lignes: LigneJournal[]): TotauxMois[] {
  // Les lignes arrivent déjà de la plus récente à la plus ancienne : l'ordre des mois est conservé.
  const mois = new Map<string, TotauxMois>()
  for (const l of lignes) {
    const cle = cleMois(l.cree_le)
    let m = mois.get(cle)
    if (!m) {
      const libelle = formatMois.format(new Date(l.cree_le))
      m = { cle, libelle, sessions: 0, participants: 0, reponses: 0, generations: 0, cout: 0 }
      mois.set(cle, m)
    }
    if (l.type === 'session') {
      m.sessions += 1
      m.participants += l.nb_participants ?? 0
      m.reponses += l.nb_reponses ?? 0
    } else {
      m.generations += 1
      m.cout += coutEuros(l)
    }
  }
  return [...mois.values()]
}

function regrouperParFormateur(lignes: LigneJournal[], auteurs: Map<string, string>): TotauxMois[] {
  const par = new Map<string, TotauxMois>()
  for (const l of lignes) {
    const cle = l.formateur_id ?? '?'
    let m = par.get(cle)
    if (!m) {
      m = { cle, libelle: auteurs.get(cle) ?? 'Formateur inconnu', sessions: 0, participants: 0, reponses: 0, generations: 0, cout: 0 }
      par.set(cle, m)
    }
    if (l.type === 'session') {
      m.sessions += 1
      m.participants += l.nb_participants ?? 0
      m.reponses += l.nb_reponses ?? 0
    } else {
      m.generations += 1
      m.cout += coutEuros(l)
    }
  }
  return [...par.values()].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
}

export default function Utilisation() {
  const formateur = useFormateur()

  if (formateur.statut === 'chargement') {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'deconnecte') return <Navigate to="/formateur/connexion" replace />
  if (formateur.statut === 'non_autorise') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Accès refusé</h1>
        <p className="text-lg">Ce compte n'est pas encore autorisé comme formateur.</p>
        <p className="text-lg">Demande à JF de t'ajouter, puis reconnecte-toi.</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'erreur') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Impossible de charger ton espace</h1>
        <p className="text-lg">{messageErreur(formateur.erreur)}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[56px] w-full rounded-pilule bg-vert px-8 text-lg font-semibold text-blanc hover:bg-vertFonce"
        >
          Réessayer
        </button>
      </MiseEnPageParticipant>
    )
  }
  return <JournalUtilisation formateurId={formateur.id} />
}

function JournalUtilisation({ formateurId }: { formateurId: string }) {
  const [lignes, setLignes] = useState<LigneJournal[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actif = true
    void (async () => {
      const { data, error } = await supabase
        .from('journal_usage')
        .select('*')
        .eq('formateur_id', formateurId) // un admin lit tout le journal : ici, seulement le sien
        .order('cree_le', { ascending: false })
      if (!actif) return
      if (error) setErreur(messageErreur(error))
      else setLignes((data ?? []) as LigneJournal[])
    })()
    return () => {
      actif = false
    }
  }, [formateurId])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <LogoMarque variante="vif" className="h-6 self-start" />
      <Link to="/formateur" className="self-start text-base font-semibold text-vert underline">
        ← Mes quiz
      </Link>
      <h1 className="text-4xl">Utilisation</h1>

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}

      {lignes === null && !erreur && <p className="text-lg">Un instant…</p>}

      {lignes && <VueUtilisation lignes={lignes} />}
    </main>
  )
}

// Chiffres d'utilisation. Avec `auteurs` (id du formateur → email), la vue devient globale :
// un tableau « Par formateur » est ajouté et chaque ligne du détail indique son formateur.
export function VueUtilisation({ lignes, auteurs }: { lignes: LigneJournal[]; auteurs?: Map<string, string> }) {
  const sessions = lignes.filter((l) => l.type === 'session')
  const generations = lignes.filter((l) => l.type === 'generation')
  const totalParticipants = sessions.reduce((somme, l) => somme + (l.nb_participants ?? 0), 0)
  const mois = regrouperParMois(lignes)
  const parFormateur = auteurs ? regrouperParFormateur(lignes, auteurs) : []
  const nomFormateur = (l: LigneJournal) => (l.formateur_id && auteurs?.get(l.formateur_id)) || 'Formateur inconnu'

  if (lignes.length === 0) {
    return (
      <Carte>
        <p className="text-lg">Rien à afficher pour l'instant. Les sessions lancées et les questions générées apparaîtront ici.</p>
      </Carte>
    )
  }

  return (
    <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Carte className="flex flex-col gap-1">
              <p className="text-base">Sessions animées</p>
              <p className="text-4xl font-bold text-vertFonce">{formatEntier.format(sessions.length)}</p>
            </Carte>
            <Carte className="flex flex-col gap-1">
              <p className="text-base">Participants au total</p>
              <p className="text-4xl font-bold text-vertFonce">{formatEntier.format(totalParticipants)}</p>
            </Carte>
            <Carte className="flex flex-col gap-1">
              <p className="text-base">Questions générées par Claude</p>
              <p className="text-4xl font-bold text-vertFonce">{formatEntier.format(generations.length)}</p>
            </Carte>
          </section>

          {auteurs && (
            <section className="flex flex-col gap-3">
              <h2 className="text-2xl">Par formateur</h2>
              <Carte className="overflow-x-auto p-0">
                <table className="w-full min-w-[640px] border-collapse text-left text-base">
                  <thead>
                    <tr className="border-b border-vertClair/60">
                      <th className="px-4 py-3 font-semibold">Formateur</th>
                      <th className="px-4 py-3 font-semibold">Sessions</th>
                      <th className="px-4 py-3 font-semibold">Participants</th>
                      <th className="px-4 py-3 font-semibold">Réponses</th>
                      <th className="px-4 py-3 font-semibold">Générations</th>
                      <th className="px-4 py-3 font-semibold">Coût estimé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parFormateur.map((f) => (
                      <tr key={f.cle} className="border-b border-vertClair/40 last:border-b-0">
                        <td className="px-4 py-3 font-semibold">{f.libelle}</td>
                        <td className="px-4 py-3">{formatEntier.format(f.sessions)}</td>
                        <td className="px-4 py-3">{formatEntier.format(f.participants)}</td>
                        <td className="px-4 py-3">{formatEntier.format(f.reponses)}</td>
                        <td className="px-4 py-3">{formatEntier.format(f.generations)}</td>
                        <td className="px-4 py-3">{texteEuros(f.cout)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Carte>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-2xl">Par mois</h2>
            <Carte className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] border-collapse text-left text-base">
                <thead>
                  <tr className="border-b border-vertClair/60">
                    <th className="px-4 py-3 font-semibold">Mois</th>
                    <th className="px-4 py-3 font-semibold">Sessions</th>
                    <th className="px-4 py-3 font-semibold">Participants</th>
                    <th className="px-4 py-3 font-semibold">Réponses</th>
                    <th className="px-4 py-3 font-semibold">Générations</th>
                    <th className="px-4 py-3 font-semibold">Coût estimé</th>
                  </tr>
                </thead>
                <tbody>
                  {mois.map((m) => (
                    <tr key={m.cle} className="border-b border-vertClair/40 last:border-b-0">
                      <td className="px-4 py-3 font-semibold capitalize">{m.libelle}</td>
                      <td className="px-4 py-3">{formatEntier.format(m.sessions)}</td>
                      <td className="px-4 py-3">{formatEntier.format(m.participants)}</td>
                      <td className="px-4 py-3">{formatEntier.format(m.reponses)}</td>
                      <td className="px-4 py-3">{formatEntier.format(m.generations)}</td>
                      <td className="px-4 py-3">{texteEuros(m.cout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Carte>
            <p className="text-sm">
              Le coût est une estimation, calculée à partir des jetons consommés par Claude (1 $ ≈ 0,92 €). La facture réelle peut différer légèrement.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-2xl">Détail</h2>
            {lignes.map((l) => (
              <Carte key={l.id} className="flex flex-col gap-1 p-4">
                <p className="text-base font-semibold">
                  {dateHeure(l.cree_le)} · {l.type === 'session' ? 'Session' : 'Génération de questions'}
                </p>
                {auteurs && <p className="text-base">Formateur : {nomFormateur(l)}</p>}
                <p className="text-base">{l.quiz_titre || '—'}</p>
                {l.type === 'session' ? (
                  <p className="text-base">
                    {formatEntier.format(l.nb_participants ?? 0)} participant(s) · {formatEntier.format(l.nb_reponses ?? 0)} réponse(s)
                  </p>
                ) : (
                  <p className="text-base">Questions proposées par Claude · {texteEuros(coutEuros(l))}</p>
                )}
              </Carte>
            ))}
          </section>
    </>
  )
}
