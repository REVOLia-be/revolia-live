import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { Aide, Coche, Ecran } from '../composants/Pictos'
import { appelerRpc } from '../lib/api'
import {
  dureeDepuis,
  pluriel,
  type SuiviAtelier,
  type SuiviParticipant,
  type SuiviRendu,
} from '../lib/atelier'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { lireDate } from '../lib/horloge'
import { useEtatSession } from '../lib/session'
import { supabase } from '../lib/supabase'

// Vue formateur d'un atelier (non projetée) : les pseudos sont visibles ici, jamais sur l'écran projeté.

const DELAI_MINIMUM_MS = 500
const FILET_DE_SECURITE_MS = 10_000

export default function SuiviAtelierPage() {
  const { sessionId = '' } = useParams()
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
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'erreur') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Impossible de charger ton espace</h1>
        <p className="text-lg">{messageErreur(formateur.erreur)}</p>
      </MiseEnPageParticipant>
    )
  }
  return <Suivi sessionId={sessionId} />
}

// Données de suivi : rechargées à chaque changement signalé par le temps réel (au plus un appel toutes les 500 ms),
// et par sécurité toutes les 10 secondes.
function useSuivi(sessionId: string, actif: boolean) {
  const [suivi, setSuivi] = useState<SuiviAtelier | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const demanderRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!actif) {
      setSuivi(null)
      return
    }
    let vivant = true
    let numero = 0
    let dernierApplique = 0
    let dernierAppel = 0
    let minuteur: number | undefined

    async function charger() {
      dernierAppel = Date.now()
      const mien = ++numero
      try {
        const donnees = await appelerRpc<SuiviAtelier>('atelier_suivi', { p_session: sessionId })
        if (!vivant || mien < dernierApplique) return
        dernierApplique = mien
        setSuivi(donnees)
        setErreur(null)
      } catch (e) {
        if (vivant) setErreur(messageErreur(e))
      }
    }
    function demander() {
      if (minuteur !== undefined) return
      const attente = Math.max(0, DELAI_MINIMUM_MS - (Date.now() - dernierAppel))
      minuteur = window.setTimeout(() => {
        minuteur = undefined
        void charger()
      }, attente)
    }
    demanderRef.current = demander

    const canal = supabase
      .channel(`suivi-${sessionId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progression_atelier', filter: `session_id=eq.${sessionId}` }, demander)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rendus_atelier', filter: `session_id=eq.${sessionId}` }, demander)
      .subscribe((statut) => {
        if (statut === 'SUBSCRIBED') demander() // des événements ont pu être manqués
      })
    const auRetour = () => {
      if (document.visibilityState === 'visible') demander()
    }
    window.addEventListener('online', demander)
    document.addEventListener('visibilitychange', auRetour)
    const filet = window.setInterval(demander, FILET_DE_SECURITE_MS)
    void charger()
    return () => {
      vivant = false
      window.clearTimeout(minuteur)
      window.clearInterval(filet)
      window.removeEventListener('online', demander)
      document.removeEventListener('visibilitychange', auRetour)
      void supabase.removeChannel(canal)
    }
  }, [sessionId, actif])

  const recharger = useCallback(() => demanderRef.current(), [])
  return { suivi, erreur, recharger }
}

// Horloge qui avance toutes les 30 s : « depuis 2 min » reste juste sans recharger.
function useMaintenant(): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const i = window.setInterval(() => setT(Date.now()), 30_000)
    return () => window.clearInterval(i)
  }, [])
  return t
}

const PETIT_BOUTON =
  'min-h-[44px] rounded-pilule border-2 border-vert bg-blanc px-4 text-base font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc disabled:opacity-40'

function MiniEtapes({ n, etape, termine }: { n: number; etape: number; termine: boolean }) {
  return (
    <span role="img" aria-label={termine ? 'Terminé' : `Étape ${etape} sur ${n}`} className="flex w-[150px] gap-1">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={`h-1.5 flex-1 rounded-pilule border-[1.5px] ${termine || i < etape ? 'border-vert bg-vert' : 'border-vert bg-blanc'}`} />
      ))}
    </span>
  )
}

function Suivi({ sessionId }: { sessionId: string }) {
  const { etat, recharger: rechargerEtat } = useEtatSession(sessionId, { presentateur: true })
  const atelierEnCours = etat?.etat === 'question' && etat.question?.type === 'atelier'
  const { suivi, erreur, recharger } = useSuivi(sessionId, Boolean(atelierEnCours))
  const maintenant = useMaintenant()
  const [erreurAction, setErreurAction] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<string | null>(null)
  const [deployes, setDeployes] = useState<string[]>([])
  const [projeteLocal, setProjeteLocal] = useState<string | null | undefined>(undefined)

  const texteProjete = etat?.rendu_projete?.texte
  useEffect(() => setProjeteLocal(undefined), [texteProjete])

  async function agir(fonction: string, parametres: Record<string, unknown>) {
    setErreurAction(null)
    try {
      await appelerRpc(fonction, parametres)
      recharger()
      rechargerEtat()
    } catch (e) {
      setErreurAction(messageErreur(e))
    }
  }
  async function projeter(rendu: SuiviRendu | null) {
    setProjeteLocal(rendu ? rendu.id : null)
    await agir('projeter_rendu', { p_session: sessionId, p_rendu: rendu ? rendu.id : null })
  }
  async function terminer() {
    if (!window.confirm("Terminer l'atelier pour toute la salle ?")) return
    await agir('fermer_question', { p_session: sessionId })
  }

  const etapes = suivi?.etapes ?? []
  const nbEtapes = etapes.length
  const etapesAvecRendu = etapes.filter((e) => e.rendu_attendu)
  const ongletActif = onglet && etapesAvecRendu.some((e) => e.id === onglet) ? onglet : etapesAvecRendu[0]?.id ?? null

  const participants = useMemo(() => {
    const liste = [...(suivi?.participants ?? [])]
    const rang = (p: SuiviParticipant) => (p.bloque_depuis ? (p.en_route ? 1 : 0) : p.termine ? 3 : 2)
    return liste.sort((a, b) => rang(a) - rang(b) || a.pseudo.localeCompare(b.pseudo, 'fr'))
  }, [suivi])
  const bloques = participants.filter((p) => p.bloque_depuis)
  const nbTermines = participants.filter((p) => p.termine).length

  const rendusOnglet = useMemo(
    () => (suivi?.rendus ?? []).filter((r) => r.etape_id === ongletActif).sort((a, b) => lireDate(b.maj_le) - lireDate(a.maj_le)),
    [suivi, ongletActif],
  )
  const nbRendusParEtape = (id: string) => (suivi?.rendus ?? []).filter((r) => r.etape_id === id).length
  const estProjete = (r: SuiviRendu) => (projeteLocal !== undefined ? projeteLocal === r.id : texteProjete !== undefined && texteProjete === r.texte)

  const entete = (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-vertClair/60 px-6 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <LogoMarque variante="vif" className="h-6" />
        {atelierEnCours && <span className="rounded-pilule bg-bleuViolet px-3 py-1 text-sm font-bold text-blanc">Atelier en cours</span>}
        <h1 className="min-w-0 text-2xl [overflow-wrap:anywhere]">{atelierEnCours ? etat?.question?.enonce : 'Suivi des ateliers'}</h1>
        {atelierEnCours && (
          <span className="text-base">
            {pluriel(participants.length, 'participant', 'participants')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/presenter/${sessionId}`} className={`${PETIT_BOUTON} flex items-center gap-2`}>
          <Ecran taille={20} />
          Voir l'écran projeté
        </Link>
        {atelierEnCours && (
          <button type="button" onClick={() => void terminer()} className="min-h-[44px] rounded-pilule bg-vert px-5 text-base font-semibold text-blanc hover:bg-vertFonce">
            Terminer l'atelier
          </button>
        )}
      </div>
    </header>
  )

  if (!etat) {
    return (
      <div className="min-h-dvh bg-blanc text-vertFonce">
        {entete}
        <p className="px-6 py-8 text-lg">Un instant…</p>
      </div>
    )
  }

  if (!atelierEnCours) {
    return (
      <div className="min-h-dvh bg-blanc text-vertFonce">
        {entete}
        <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-12">
          <h2 className="text-3xl">Aucun atelier en cours</h2>
          <p className="text-lg">Quand tu ouvres un atelier depuis l'écran présentateur, le suivi des participants apparaît ici.</p>
          <Link to={`/presenter/${sessionId}`} className="text-lg font-semibold underline">
            Retour à l'écran présentateur
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-blanc text-vertFonce">
      {entete}
      {(erreur || erreurAction) && (
        <p role="alert" className="mx-6 mt-3 rounded-champ border-2 border-vert px-4 py-3 text-base font-semibold">
          {erreurAction ?? erreur}
        </p>
      )}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <main className="flex min-w-0 flex-col gap-4 px-6 py-5">
          {bloques.length > 0 ? (
            <section role="status" className="flex items-center gap-4 rounded-carte bg-vertFonce p-4 text-blanc">
              <Aide taille={34} className="shrink-0" />
              <div>
                <p className="font-texte text-xl font-bold">
                  {bloques.length > 1 ? `${bloques.length} personnes ont besoin de toi` : '1 personne a besoin de toi'}
                </p>
                <p className="text-base">
                  {bloques
                    .map((p) => (p.en_route ? `${p.pseudo} en cours de résolution` : `${p.pseudo} depuis ${dureeDepuis(p.bloque_depuis, maintenant).replace('moins d\'1 min', '1 min')}`))
                    .join(' · ')}
                </p>
              </div>
            </section>
          ) : (
            <p role="status" className="flex items-center gap-2 rounded-carte border-2 border-vertClair/70 p-4 text-base font-semibold">
              <Coche taille={20} />
              Personne n'a besoin de toi pour l'instant.
            </p>
          )}

          {participants.length === 0 ? (
            <p className="text-lg">Personne n'a encore commencé l'atelier.</p>
          ) : (
            <table className="w-full border-separate border-spacing-y-1.5 text-left">
              <caption className="sr-only">Progression de chaque participant</caption>
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wide text-discret">
                  <th className="px-3 py-1">Participant</th>
                  <th className="px-3 py-1">Étape</th>
                  <th className="px-3 py-1">Sur l'étape</th>
                  <th className="px-3 py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const bloque = Boolean(p.bloque_depuis)
                  const cellule = bloque ? 'bg-vertFonce text-blanc' : 'border-b border-vertClair/50'
                  return (
                    <tr key={p.participant_id} className="min-h-[56px]">
                      <th scope="row" className={`${cellule} rounded-l-champ px-3 py-3 text-base font-semibold`}>
                        <span className="flex flex-wrap items-center gap-2">
                          {bloque && <Aide taille={18} />}
                          {p.pseudo}
                          {bloque && (
                            <span className="rounded-pilule border border-blanc px-2 py-0.5 text-xs font-bold">{p.en_route ? 'En route' : 'Bloqué'}</span>
                          )}
                        </span>
                      </th>
                      <td className={`${cellule} px-3 py-3`}>
                        <span className="flex items-center gap-2">
                          <MiniEtapes n={nbEtapes} etape={p.etape} termine={p.termine} />
                          <span className="whitespace-nowrap text-sm">{p.termine ? 'Terminé' : `Étape ${Math.min(p.etape, nbEtapes)}`}</span>
                        </span>
                      </td>
                      <td className={`${cellule} px-3 py-3 text-base`}>{p.termine ? '—' : dureeDepuis(p.maj_le, maintenant)}</td>
                      <td className={`${cellule} rounded-r-champ px-3 py-2 text-right`}>
                        {bloque && !p.en_route && (
                          <button
                            type="button"
                            onClick={() => void agir('atelier_en_route', { p_participant: p.participant_id })}
                            className="min-h-[44px] rounded-pilule bg-blanc px-5 text-base font-semibold text-vertFonce"
                          >
                            J'arrive<span className="sr-only"> chez {p.pseudo}</span>
                          </button>
                        )}
                        {bloque && p.en_route && (
                          <button
                            type="button"
                            onClick={() => void agir('atelier_resolu', { p_participant: p.participant_id })}
                            className="min-h-[44px] rounded-pilule border-2 border-blanc px-5 text-base font-semibold text-blanc"
                          >
                            Résolu<span className="sr-only"> pour {p.pseudo}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <p className="text-sm text-discret">
            {nbTermines} sur {participants.length} {nbTermines > 1 ? 'ont' : 'a'} terminé.
          </p>
        </main>

        <aside className="flex min-w-0 flex-col gap-4 border-t border-vertClair/60 bg-doux px-6 py-5 lg:border-l lg:border-t-0">
          {etapesAvecRendu.length === 0 ? (
            <p className="text-lg">Cet atelier ne demande aucun rendu.</p>
          ) : (
            <>
              <div role="tablist" aria-label="Rendus par étape" className="flex flex-wrap gap-2">
                {etapesAvecRendu.map((e) => {
                  const actif = e.id === ongletActif
                  return (
                    <button
                      key={e.id}
                      role="tab"
                      type="button"
                      aria-selected={actif}
                      onClick={() => setOnglet(e.id)}
                      className={`min-h-[44px] rounded-pilule border-2 border-vert px-4 text-base font-semibold ${actif ? 'bg-vert text-blanc' : 'bg-blanc text-vert'}`}
                    >
                      Étape {e.ordre} <span className="ml-1 text-sm">{nbRendusParEtape(e.id)}</span>
                    </button>
                  )
                })}
              </div>
              <h2 className="text-xl">
                Rendus de l'étape {etapes.find((e) => e.id === ongletActif)?.ordre} · {etapes.find((e) => e.id === ongletActif)?.titre}
              </h2>
              {rendusOnglet.length === 0 ? (
                <p className="text-base">Aucun rendu pour cette étape pour l'instant.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {rendusOnglet.map((r) => {
                    const projete = estProjete(r)
                    const deploye = deployes.includes(r.id)
                    return (
                      <li key={r.id} className={`rounded-carte bg-blanc p-4 ${projete ? 'border-[3px] border-vertFonce' : 'border-2 border-vertClair/70'}`}>
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                          <p>
                            <strong className="text-base">{r.pseudo}</strong>{' '}
                            <span className="text-sm text-discret">il y a {dureeDepuis(r.maj_le, maintenant).replace('moins d\'1 min', '1 min')}</span>
                          </p>
                          {projete && (
                            <span className="flex items-center gap-1 text-sm font-bold">
                              <Ecran taille={16} />
                              Projeté en ce moment
                            </span>
                          )}
                        </div>
                        <p className={`whitespace-pre-wrap text-base [overflow-wrap:anywhere] ${deploye ? '' : 'line-clamp-3'}`}>{r.texte}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {projete ? (
                            <button type="button" className={PETIT_BOUTON} onClick={() => void projeter(null)}>
                              Arrêter la projection
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void projeter(r)}
                              className="flex min-h-[44px] items-center gap-2 rounded-pilule bg-vert px-4 text-base font-semibold text-blanc hover:bg-vertFonce"
                            >
                              <Ecran taille={18} />
                              Projeter ce rendu (anonyme)
                            </button>
                          )}
                          {r.texte.length > 160 && (
                            <button
                              type="button"
                              className={PETIT_BOUTON}
                              aria-expanded={deploye}
                              onClick={() => setDeployes((d) => (deploye ? d.filter((x) => x !== r.id) : [...d, r.id]))}
                            >
                              {deploye ? 'Réduire' : 'Tout lire'}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          <section aria-label="Ce que la salle voit" className="mt-auto flex flex-col gap-2">
            <h2 className="font-texte text-xs font-bold uppercase tracking-wide text-discret">Ce que la salle voit</h2>
            <div className="rounded-carte bg-bleuViolet p-4 text-blanc">
              {etat.rendu_projete ? (
                <>
                  <p className="mb-1 text-xs font-bold text-vertClair">Un rendu de la salle · sans nom</p>
                  <p className="line-clamp-4 whitespace-pre-wrap font-titre text-lg leading-snug [overflow-wrap:anywhere]">{etat.rendu_projete.texte}</p>
                </>
              ) : (
                <p className="text-base">Aucun rendu projeté : la salle voit la progression collective.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
