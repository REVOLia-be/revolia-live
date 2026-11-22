import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Bouton from '../composants/Bouton'
import Carte from '../composants/Carte'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { useFormateur } from '../lib/auth'
import { messageErreur } from '../lib/erreurs'
import { supabase } from '../lib/supabase'

// Page de consentement : Supabase y envoie la personne quand Claude ou ChatGPT demandent l'accès
// à son espace formateur (serveur MCP). Adresse : /oauth/consent?authorization_id=…

const CONSIGNE = 'Relance la connexion depuis Claude ou ChatGPT.'

interface Demande {
  id: string
  application: string
  domaine: string
  email: string
}

// Domaine d'arrivée de l'application (ex. « claude.ai »). Pour une adresse sans domaine, on montre l'adresse telle quelle.
function domaineDe(adresse: string): string {
  try {
    const url = new URL(adresse)
    return url.host || adresse
  } catch {
    return adresse
  }
}

export default function ConsentementOAuth() {
  const [params] = useSearchParams()
  const identifiant = params.get('authorization_id')
  const formateur = useFormateur()

  if (!identifiant) {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Demande introuvable</h1>
        <p className="text-lg">Il manque des informations dans cette adresse. {CONSIGNE}</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'chargement') {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'erreur') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Impossible de vérifier ton compte</h1>
        <p className="text-lg">{messageErreur(formateur.erreur)}</p>
        <Bouton onClick={() => window.location.reload()}>Réessayer</Bouton>
      </MiseEnPageParticipant>
    )
  }
  if (formateur.statut === 'deconnecte') return <Connexion />
  if (formateur.statut === 'non_autorise') {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Accès refusé</h1>
        <p className="text-lg">Ce compte n'est pas encore autorisé comme formateur, donc tu ne peux pas connecter d'application.</p>
        <p className="text-lg">Demande à JF de t'ajouter, ou connecte-toi avec une autre adresse.</p>
        <Bouton variante="secondaire" onClick={() => void seDeconnecter()}>
          Me connecter avec une autre adresse
        </Bouton>
      </MiseEnPageParticipant>
    )
  }
  return <Consentement identifiant={identifiant} email={formateur.email} />
}

async function seDeconnecter() {
  await supabase.auth.signOut()
  window.location.reload()
}

// Pas connecté comme formateur : lien magique, qui ramène ici (avec la demande) après le clic.
function Connexion() {
  const [anonyme, setAnonyme] = useState(false)
  const [email, setEmail] = useState('')
  const [envoye, setEnvoye] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actif = true
    void supabase.auth.getSession().then(({ data }) => {
      if (actif) setAnonyme(!!data.session?.user.is_anonymous)
    })
    return () => {
      actif = false
    }
  }, [])

  async function valider(e: FormEvent) {
    e.preventDefault()
    if (envoi || !email.trim()) return
    setEnvoi(true)
    setErreur(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    })
    setEnvoi(false)
    if (error) setErreur(messageErreur(error))
    else setEnvoye(true)
  }

  if (envoye) {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-4xl">Regarde tes emails</h1>
        <p className="text-lg">
          On vient d'envoyer un lien à {email.trim()}. Clique dessus : tu reviendras ici pour autoriser l'application.
        </p>
        <p className="text-lg">Tu ne le vois pas ? Regarde dans les courriers indésirables.</p>
      </MiseEnPageParticipant>
    )
  }

  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">Connecte-toi d'abord</h1>
      <p className="text-lg">
        Une application (Claude ou ChatGPT) demande l'accès à ton espace formateur. Connecte-toi pour décider si tu l'autorises.
      </p>
      {anonyme && (
        <p className="text-lg font-semibold">
          Pour l'instant, tu es connecté comme participant. Connecte-toi comme formateur ci-dessous.
        </p>
      )}
      <form onSubmit={valider} className="flex flex-col gap-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-label="Ton adresse email"
          placeholder="prenom@exemple.be"
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-xl text-vertFonce placeholder:text-discret"
        />
        {erreur && (
          <p role="alert" className="text-lg font-semibold">
            {erreur}
          </p>
        )}
        <Bouton type="submit" disabled={envoi || !email.trim()}>
          {envoi ? 'Envoi…' : 'Recevoir mon lien'}
        </Bouton>
      </form>
    </MiseEnPageParticipant>
  )
}

function Consentement({ identifiant, email }: { identifiant: string; email: string }) {
  const [demande, setDemande] = useState<Demande | null>(null)
  const [erreurChargement, setErreurChargement] = useState(false)
  const [enCours, setEnCours] = useState<'autoriser' | 'refuser' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actif = true
    void (async () => {
      try {
        const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(identifiant)
        if (!actif) return
        if (error || !data) {
          setErreurChargement(true)
        } else if ('authorization_id' in data) {
          setDemande({
            id: data.authorization_id,
            application: data.client.name,
            domaine: domaineDe(data.redirect_uri),
            email: data.user.email || email,
          })
        } else {
          // Déjà autorisée auparavant : on renvoie directement vers l'application.
          window.location.assign(data.redirect_url)
        }
      } catch {
        if (actif) setErreurChargement(true)
      }
    })()
    return () => {
      actif = false
    }
  }, [identifiant, email])

  async function decider(choix: 'autoriser' | 'refuser') {
    if (enCours) return
    setEnCours(choix)
    setErreur(null)
    try {
      const options = { skipBrowserRedirect: true }
      const { data, error } =
        choix === 'autoriser'
          ? await supabase.auth.oauth.approveAuthorization(identifiant, options)
          : await supabase.auth.oauth.denyAuthorization(identifiant, options)
      if (error || !data?.redirect_url) {
        setEnCours(null)
        setErreur(`La demande n'a pas pu aboutir : elle a peut-être expiré. ${CONSIGNE}`)
        return
      }
      window.location.assign(data.redirect_url)
    } catch {
      setEnCours(null)
      setErreur(`La demande n'a pas pu aboutir : elle a peut-être expiré. ${CONSIGNE}`)
    }
  }

  if (erreurChargement) {
    return (
      <MiseEnPageParticipant>
        <h1 className="text-3xl">Cette demande n'est plus valide</h1>
        <p className="text-lg">Elle a expiré (elle ne dure qu'une dizaine de minutes) ou elle a déjà été traitée.</p>
        <p className="text-lg">{CONSIGNE}</p>
      </MiseEnPageParticipant>
    )
  }
  if (!demande) {
    return (
      <MiseEnPageParticipant>
        <p className="text-lg">Un instant…</p>
      </MiseEnPageParticipant>
    )
  }

  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">Autoriser {demande.application} ?</h1>
      <p className="text-lg">
        <strong>{demande.application}</strong> demande l'accès à ton espace REVOLia Live. Après la connexion, elle revient sur{' '}
        <strong>{demande.domaine}</strong>.
      </p>
      <Carte className="flex flex-col gap-3">
        <p className="text-lg font-semibold">Elle pourra :</p>
        <ul className="list-disc pl-6 text-lg">
          <li>créer des quiz dans ton espace ;</li>
          <li>lister et modifier tes quiz ;</li>
          <li>consulter les résultats agrégés de tes sessions (sans pseudos).</li>
        </ul>
        <p className="text-lg">Elle ne pourra pas supprimer de quiz.</p>
      </Carte>
      <p className="text-base">
        Connecté en tant que {demande.email}.{' '}
        <button type="button" onClick={() => void seDeconnecter()} className="text-vert underline">
          Ce n'est pas moi
        </button>
      </p>
      {erreur && (
        <p role="alert" className="text-lg font-semibold">
          {erreur}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Bouton onClick={() => void decider('autoriser')} disabled={enCours !== null}>
          {enCours === 'autoriser' ? 'Autorisation…' : 'Autoriser'}
        </Bouton>
        <Bouton variante="secondaire" onClick={() => void decider('refuser')} disabled={enCours !== null}>
          {enCours === 'refuser' ? 'Refus…' : 'Refuser'}
        </Bouton>
      </div>
      <p className="text-sm">
        Tu pourras retirer cet accès à tout moment depuis{' '}
        <Link to="/formateur/connexions" className="text-vert underline">
          Applications connectées
        </Link>
        .
      </p>
    </MiseEnPageParticipant>
  )
}
