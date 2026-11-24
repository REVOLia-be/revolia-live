import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { appelerRpc } from '../lib/api'
import { useFormateur } from '../lib/auth'
import { exporterSession } from '../lib/exporter'
import { messageErreur } from '../lib/erreurs'
import { supabase } from '../lib/supabase'

interface LigneSession {
  id: string
  titre: string
  code: string
  etat: 'attente' | 'question' | 'resultats' | 'bilan' | 'terminee'
  cree_le: string
  terminee_le: string | null
  nb_participants?: number | null
}

const LIBELLES_ETAT: Record<LigneSession['etat'], string> = {
  attente: 'Pas encore commencée',
  question: 'En cours',
  resultats: 'En cours',
  bilan: 'Terminée',
  terminee: 'Terminée',
}

const formatDate = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

function dateLisible(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : formatDate.format(d)
}

export default function MesSessions() {
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
        <Bouton type="button" onClick={() => window.location.reload()}>
          Réessayer
        </Bouton>
      </MiseEnPageParticipant>
    )
  }
  return <ListeSessions />
}

const classeLien =
  'flex min-h-[56px] w-full items-center justify-center rounded-pilule border-2 border-vert bg-blanc px-8 text-lg font-semibold text-vert transition-colors hover:bg-vert hover:text-blanc'

function ListeSessions() {
  const [sessions, setSessions] = useState<LigneSession[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [exportEnCours, setExportEnCours] = useState<string | null>(null)
  const [aArchiver, setAArchiver] = useState<string | null>(null) // session en attente de confirmation
  const [archivageEnCours, setArchivageEnCours] = useState<string | null>(null)

  useEffect(() => {
    let actif = true
    void (async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, titre, code, etat, cree_le, terminee_le, participants(count)')
        .order('cree_le', { ascending: false })
      if (!actif) return
      if (error) setErreur(messageErreur(error))
      else
        setSessions(
          ((data ?? []) as (LigneSession & { participants?: { count: number }[] })[]).map((l) => ({
            ...l,
            nb_participants: l.participants?.[0]?.count ?? null,
          })),
        )
    })()
    return () => {
      actif = false
    }
  }, [])

  async function exporter(session: LigneSession) {
    setExportEnCours(session.id)
    setErreur(null)
    try {
      await exporterSession(session.id, session.titre)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setExportEnCours(null)
    }
  }

  async function archiver(session: LigneSession) {
    setArchivageEnCours(session.id)
    setErreur(null)
    try {
      await appelerRpc('archiver_session', { p_session: session.id })
      const maintenant = new Date().toISOString()
      setSessions((liste) => (liste ?? []).map((x) => (x.id === session.id ? { ...x, etat: 'terminee', terminee_le: maintenant } : x)))
      setAArchiver(null)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setArchivageEnCours(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <LogoMarque variante="vif" className="h-6 self-start" />
      <Link to="/formateur" className="self-start text-base font-semibold text-vert underline">
        ← Mes quiz
      </Link>
      <h1 className="text-4xl">Mes sessions passées</h1>

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}

      {sessions === null && !erreur && <p className="text-lg">Un instant…</p>}
      {sessions?.length === 0 && (
        <Carte>
          <p className="text-lg">Tu n'as pas encore lancé de session. Lance un quiz depuis « Mes quiz ».</p>
        </Carte>
      )}

      {sessions?.map((s) => (
        <Carte key={s.id} className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl">{s.titre}</h2>
            <p className="text-base">
              Créée le {dateLisible(s.cree_le)} ·{' '}
              {s.terminee_le ? `Terminée le ${dateLisible(s.terminee_le)}` : (LIBELLES_ETAT[s.etat] ?? s.etat)}
            </p>
            <p className="text-base">
              Code <span className="font-bold tracking-widest">{s.code}</span>
              {s.nb_participants != null ? ` · ${s.nb_participants} participant${s.nb_participants > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to={`/presenter/${s.id}`} className={classeLien}>
              Rouvrir l'écran
            </Link>
            <Bouton
              type="button"
              variante="secondaire"
              onClick={() => exporter(s)}
              disabled={exportEnCours !== null}
            >
              {exportEnCours === s.id ? 'Export en cours…' : 'Exporter (CSV)'}
            </Bouton>
            {s.etat !== 'terminee' && (
              <Bouton
                type="button"
                variante="secondaire"
                onClick={() => setAArchiver(s.id)}
                disabled={archivageEnCours !== null}
              >
                Archiver
              </Bouton>
            )}
          </div>
          {aArchiver === s.id && (
            <div role="alertdialog" aria-label="Confirmer l'archivage" className="flex flex-col gap-3 rounded-champ border-2 border-vert p-4">
              <p className="text-lg font-semibold">
                Archiver cette session ? Elle sera terminée : les participants ne pourront plus y répondre. Ses résultats et son export restent disponibles.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Bouton type="button" onClick={() => void archiver(s)} disabled={archivageEnCours !== null}>
                  {archivageEnCours === s.id ? 'Archivage…' : 'Oui, archiver'}
                </Bouton>
                <Bouton type="button" variante="secondaire" onClick={() => setAArchiver(null)} disabled={archivageEnCours !== null}>
                  Non, garder
                </Bouton>
              </div>
            </div>
          )}
        </Carte>
      ))}
    </main>
  )
}
