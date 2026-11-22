import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import LogoMarque from '../composants/LogoMarque'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { supabase } from '../lib/supabase'

interface Application {
  id: string
  nom: string
  site: string
  accordee_le: string
}

const formatDate = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

export default function Connexions() {
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
        <Bouton onClick={() => window.location.reload()}>Réessayer</Bouton>
      </MiseEnPageParticipant>
    )
  }
  return <ListeApplications />
}

function ListeApplications() {
  const [applications, setApplications] = useState<Application[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [aRetirer, setARetirer] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const charger = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.oauth.listGrants()
      if (error) {
        setErreur(messageErreur(error))
        return
      }
      setErreur(null)
      setApplications(
        (data ?? []).map((g) => ({ id: g.client.id, nom: g.client.name, site: g.client.uri, accordee_le: g.granted_at })),
      )
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  async function retirer(id: string) {
    setEnCours(true)
    setErreur(null)
    try {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId: id })
      if (error) setErreur(messageErreur(error))
      else await charger()
    } catch (e) {
      setErreur(messageErreur(e))
    }
    setARetirer(null)
    setEnCours(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <LogoMarque variante="vif" className="h-6 self-start" />
      <Link to="/formateur" className="self-start text-base font-semibold text-vert underline">
        ← Mes quiz
      </Link>
      <h1 className="text-4xl">Applications connectées</h1>
      <p className="text-lg">
        Voici les applications (Claude, ChatGPT…) que tu as autorisées à agir dans ton espace formateur. Retirer l'accès les déconnecte tout de suite.
      </p>

      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
      {applications === null && !erreur && <p className="text-lg">Un instant…</p>}
      {applications && applications.length === 0 && (
        <Carte>
          <p className="text-lg">Aucune application n'est connectée pour l'instant.</p>
        </Carte>
      )}
      {applications?.map((a) => (
        <Carte key={a.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xl font-semibold">{a.nom}</p>
            <p className="text-base">Autorisée le {formatDate.format(new Date(a.accordee_le))}</p>
          </div>
          {aRetirer === a.id ? (
            <div className="flex flex-col gap-2 sm:w-64">
              <p className="text-base">Retirer l'accès à {a.nom} ?</p>
              <Bouton onClick={() => void retirer(a.id)} disabled={enCours}>
                {enCours ? 'Retrait…' : 'Oui, retirer'}
              </Bouton>
              <Bouton variante="secondaire" onClick={() => setARetirer(null)} disabled={enCours}>
                Annuler
              </Bouton>
            </div>
          ) : (
            <Bouton variante="secondaire" className="sm:w-auto" onClick={() => setARetirer(a.id)}>
              Retirer l'accès
            </Bouton>
          )}
        </Carte>
      ))}
    </main>
  )
}
