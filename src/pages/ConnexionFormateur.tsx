import { useState, type FormEvent } from 'react'
import Bouton from '../composants/Bouton'
import MiseEnPageParticipant from '../composants/MiseEnPageParticipant'
import { messageErreur } from '../lib/erreurs'
import { supabase } from '../lib/supabase'

export default function ConnexionFormateur() {
  const [email, setEmail] = useState('')
  const [envoye, setEnvoye] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function valider(e: FormEvent) {
    e.preventDefault()
    if (envoi || !email.trim()) return
    setEnvoi(true)
    setErreur(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/formateur` },
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
          On vient d'envoyer un lien à {email.trim()}. Clique dessus pour arriver dans ton espace formateur.
        </p>
        <p className="text-lg">Tu ne le vois pas ? Regarde dans les courriers indésirables.</p>
      </MiseEnPageParticipant>
    )
  }

  return (
    <MiseEnPageParticipant>
      <h1 className="text-4xl">Espace formateur</h1>
      <p className="text-lg">
        Entre ton email : on t'envoie un lien pour te connecter, sans mot de passe.
      </p>
      <form onSubmit={valider} className="flex flex-col gap-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-label="Ton adresse email"
          placeholder="prenom@exemple.be"
          className="min-h-[56px] w-full rounded-champ border-2 border-vert bg-blanc px-4 text-xl text-vertFonce placeholder:text-vertClair focus:outline-none focus:ring-4 focus:ring-vertClair"
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
